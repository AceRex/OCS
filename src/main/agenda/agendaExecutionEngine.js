/**
 * wave.io Authoritative Desktop Agenda Execution Engine
 * 
 * Monotonic high-resolution timeline runner, snapshot-isolated live scheduler,
 * late-action resolution, operator manual override protection, and multi-device state sync.
 */
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { fileURLToPath, pathToFileURL } = require('url');
const { formatDuration, migrateToSingleUnifiedTrack, migrateToUnifiedVisualTrack } = require('./agendaModel');

/**
 * Checks if a local media file exists on disk
 */
function verifyMediaFile(urlOrPath) {
  if (!urlOrPath) return { ok: false, error: 'No media URL or asset resolved' };
  if (typeof urlOrPath !== 'string') return { ok: true, path: urlOrPath };
  if (urlOrPath.startsWith('data:') || urlOrPath.startsWith('http:') || urlOrPath.startsWith('https:')) {
    return { ok: true, path: urlOrPath };
  }
  try {
    let filePath = urlOrPath;
    if (urlOrPath.startsWith('file://')) {
      filePath = fileURLToPath(urlOrPath);
    }
    if (fs.existsSync(filePath)) {
      return { ok: true, path: filePath };
    }
    return { ok: false, error: `File not found on local disk: ${filePath}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Resolves cue or asset to a verified desktop file URL, filtering out mobile-local URLs
 */
function resolveDesktopAssetUrl(cue, agendaSnapshot, defaultDirs = {}) {
  const assets = agendaSnapshot?.assets || [];
  const matchedAsset = assets.find(
    (a) => a.id === cue.assetId || (cue.hash && a.hash === cue.hash) || (a.name && (a.name === cue.name || a.originalName === cue.name))
  );

  const candidates = [
    matchedAsset?.localFileUrl,
    matchedAsset?.path,
    matchedAsset?.fileUrl,
    cue.localFileUrl,
    cue.fileUrl,
    cue.url,
    cue.path,
    matchedAsset?.url,
  ];

  for (const c of candidates) {
    if (!c || typeof c !== 'string') continue;
    // Discard mobile sandbox paths transferred over the network
    if (c.startsWith('file:///var/mobile/') || c.startsWith('file:///data/user/')) continue;
    const v = verifyMediaFile(c);
    if (v.ok) {
      return { ok: true, url: c.startsWith('file://') ? c : pathToFileURL(v.path).href };
    }
  }

  // Fallback: check assetsDir by hash or original filename
  const searchName = matchedAsset?.originalName || matchedAsset?.name || cue.name;
  if (defaultDirs.assetsDir && searchName) {
    const directPath = path.join(defaultDirs.assetsDir, searchName);
    if (fs.existsSync(directPath)) {
      return { ok: true, url: pathToFileURL(directPath).href };
    }
  }
  if (defaultDirs.mediaDir && searchName) {
    const directPath = path.join(defaultDirs.mediaDir, searchName);
    if (fs.existsSync(directPath)) {
      return { ok: true, url: pathToFileURL(directPath).href };
    }
  }

  return { ok: false, error: `Media asset not found: "${searchName || cue.id}"` };
}

class AgendaExecutionEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;

    // External dispatch hooks (bridged to Presentation, Canvas, Audio, Timer, Socket, Recording)
    this.dispatchBackground = options.dispatchBackground || (() => {});
    this.dispatchPresentation = options.dispatchPresentation || (() => {});
    this.dispatchAudio = options.dispatchAudio || (() => {});
    this.syncTimer = options.syncTimer || (() => {});
    this.broadcastState = options.broadcastState || (() => {});
    this.recordJournal = options.recordJournal || (() => {});
    this.startRecording = options.startRecording || (() => Promise.resolve({ ok: false }));
    this.stopRecording = options.stopRecording || (() => Promise.resolve({ ok: false }));
    this.pauseRecording = options.pauseRecording || (() => {});
    this.resumeRecording = options.resumeRecording || (() => {});

    // State machine
    this.status = 'idle'; // 'idle' | 'running' | 'paused' | 'interval' | 'completed' | 'stopped'
    this.agendaSnapshot = null;
    this.sessionIndex = 0;
    this.currentSession = null;
    this.upcomingSession = null;

    // Monotonic clock tracking
    this.sessionElapsedSec = 0;
    this.sessionDurationSec = 0;
    this.intervalRemainingSec = 0;
    this.lastTickTime = 0;
    this.tickerInterval = null;

    // Automation & Operator control
    this.automationArmed = true;       // When false, timers run but visual cues do not fire
    this.operatorOverridden = false;    // When true, agenda will not restore prior state on clip end
    this.executedActionIds = new Set(); // Prevents duplicate action firings per run
    this.activeCues = new Map();        // cueId -> cue instance
    this.activeVisualCueId = null;      // Prevents late video completion callbacks from clearing successor images
    this.runId = null;                  // Unique execution run identifier
    this.activeLayerCues = new Map();   // key: `${dest}:${layer}` -> { cueId, runId, timestamp }
    this.recordingStartupPromise = null; // Serializes recording startup
    this.sessionStopRecordingPromise = null; // Serializes adjacent session recording finalization
    this.recordingState = { status: 'idle' }; // Session recording telemetry

    // Prior states for "restore" endBehavior and active destination ownership
    this.currentBackgroundState = null;
    this.preActionBackground = null;
    this.currentPresentationState = null;
    this.currentAudioState = null;

    this.assetsDir = options.assetsDir || null;
    this.mediaDir = options.mediaDir || null;
  }

  /**
   * Resolves cue to a verified desktop file URL
   */
  resolveDesktopAssetUrl(cue, defaultDirs) {
    const dirs = defaultDirs || {
      assetsDir: this.assetsDir || this.options.assetsDir,
      mediaDir: this.mediaDir || this.options.mediaDir,
    };
    const res = resolveDesktopAssetUrl(cue, this.agendaSnapshot, dirs);
    return res.ok ? res.url : null;
  }

  /**
   * Loads an agenda into the engine and creates an immutable execution snapshot
   */
  loadAgenda(agenda) {
    if (!agenda || !Array.isArray(agenda.sessions)) {
      throw new Error('Cannot load agenda: invalid agenda document');
    }

    if (this.status === 'running' || this.status === 'interval') {
      this.stop();
    }

    // Auto-migrate legacy background/video/audio tracks to single unified media track
    const migrated = migrateToSingleUnifiedTrack(agenda);

    // Deep clone to isolate running snapshot from any subsequent document edits
    this.agendaSnapshot = JSON.parse(JSON.stringify(migrated));
    if (!Array.isArray(this.agendaSnapshot.sessions)) {
      this.agendaSnapshot.sessions = [];
    }
    this.sessionIndex = 0;
    this.currentSession = this.agendaSnapshot.sessions[0] || null;
    this.upcomingSession = this.agendaSnapshot.sessions[1] || null;
    this.sessionDurationSec = this.currentSession ? (this.currentSession.durationSec || 0) : 0;
    this.sessionElapsedSec = 0;
    this.intervalRemainingSec = 0;
    this.status = 'idle';
    this.executedActionIds.clear();
    this.activeCues.clear();
    this.activeVisualCueId = null;
    this.activeLayerCues.clear();
    this.recordingState = { status: 'idle' };
    this.operatorOverridden = false;
    this.currentBackgroundState = null;
    this.preActionBackground = null;

    // Synchronize to Timer controller without starting execution
    if (this.currentSession) {
      this.syncTimer({
        agendaTitle: this.agendaSnapshot.name,
        sessionTitle: this.currentSession.name || '',
        sessionPerson: this.currentSession.person || this.currentSession.speakerName || '',
        durationSec: this.sessionDurationSec,
        remainingSec: this.sessionDurationSec,
        sessionIndex: 0,
        totalSessions: this.agendaSnapshot.sessions.length,
        isRunning: false,
        isPaused: false,
      });
    } else {
      this.syncTimer({
        agendaTitle: this.agendaSnapshot.name,
        sessionTitle: '',
        sessionPerson: '',
        durationSec: 0,
        remainingSec: 0,
        sessionIndex: 0,
        totalSessions: 0,
        isRunning: false,
        isPaused: false,
      });
    }

    this.emitState();
    return this.getState();
  }

  /**
   * Starts or resumes playback of the current session
   */
  start(targetSessionIndex = null) {
    if (!this.agendaSnapshot) {
      throw new Error('No agenda loaded');
    }

    if (!this.agendaSnapshot.sessions || this.agendaSnapshot.sessions.length === 0) {
      return this.getState();
    }

    if (targetSessionIndex !== null && typeof targetSessionIndex === 'number') {
      if (targetSessionIndex >= 0 && targetSessionIndex < this.agendaSnapshot.sessions.length) {
        this.sessionIndex = targetSessionIndex;
        this.currentSession = this.agendaSnapshot.sessions[this.sessionIndex] || null;
        this.upcomingSession = this.agendaSnapshot.sessions[this.sessionIndex + 1] || null;
        this.sessionDurationSec = this.currentSession ? (this.currentSession.durationSec || 0) : 0;
        this.sessionElapsedSec = 0;
        this.executedActionIds.clear();
        this.activeCues.clear();
        this.activeLayerCues.clear();
      }
    }

    if (!this.currentSession) {
      return this.getState();
    }

    this.status = 'running';
    this.runId = 'run_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    this.activeLayerCues.clear();
    this.lastTickTime = Date.now();
    this.ensureTicker();

    this.recordJournal('AGENDA_START', {
      agendaId: this.agendaSnapshot.id,
      runId: this.runId,
      sessionIndex: this.sessionIndex,
      sessionName: this.currentSession.name,
      sessionPerson: this.currentSession.person || this.currentSession.speakerName || '',
      durationSec: this.sessionDurationSec,
    });

    this.syncTimer({
      agendaTitle: this.agendaSnapshot.name,
      sessionTitle: this.currentSession.name,
      sessionPerson: this.currentSession.person || this.currentSession.speakerName || '',
      durationSec: this.sessionDurationSec,
      remainingSec: Math.max(0, this.sessionDurationSec - this.sessionElapsedSec),
      sessionIndex: this.sessionIndex,
      totalSessions: this.agendaSnapshot.sessions.length,
      isRunning: true,
      isPaused: false,
    });

    // Start session recording if enabled for this session
    if (this.currentSession?.recordSession) {
      this.sessionRecordingPromise = this.handleStartSessionRecording(this.currentSession);
    }

    // Check for point actions at 0s
    this.evaluateCues(true);
    this.emitState();
  }

  /**
   * Pauses the monotonic clock, active agenda media, and pauses session recording
   */
  pause() {
    if (this.status !== 'running' && this.status !== 'interval') return;

    this.status = 'paused';
    this.stopTicker();

    this.dispatchAudio({ command: 'pause' });
    this.dispatchPresentation({ command: 'pause' });

    if (this.recordingState?.status === 'recording' || this.recordingState?.status === 'starting') {
      this.recordingState.status = 'paused';
      try { this.pauseRecording({ owner: 'agenda' }); } catch (_) {}
    }

    this.syncTimer({
      agendaTitle: this.agendaSnapshot?.name,
      sessionTitle: this.currentSession?.name,
      sessionPerson: this.currentSession?.person || this.currentSession?.speakerName || '',
      durationSec: this.sessionDurationSec,
      remainingSec: Math.max(0, this.sessionDurationSec - this.sessionElapsedSec),
      sessionIndex: this.sessionIndex,
      isRunning: false,
      isPaused: true,
    });

    this.emitState();
  }

  /**
   * Resumes playback from exact current elapsed position and resumes session recording
   */
  resume() {
    if (this.status !== 'paused') return;

    this.status = this.intervalRemainingSec > 0 ? 'interval' : 'running';
    this.lastTickTime = Date.now();
    this.ensureTicker();

    this.dispatchAudio({ command: 'resume' });
    this.dispatchPresentation({ command: 'resume' });

    if (this.recordingState?.status === 'recording' || this.recordingState?.status === 'paused') {
      this.recordingState.status = 'recording';
      try { this.resumeRecording({ owner: 'agenda' }); } catch (_) {}
    }

    this.syncTimer({
      agendaTitle: this.agendaSnapshot?.name,
      sessionTitle: this.currentSession?.name,
      sessionPerson: this.currentSession?.person || this.currentSession?.speakerName || '',
      durationSec: this.sessionDurationSec,
      remainingSec: Math.max(0, this.sessionDurationSec - this.sessionElapsedSec),
      sessionIndex: this.sessionIndex,
      isRunning: true,
      isPaused: false,
    });

    this.emitState();
  }

  /**
   * Stops agenda execution, cancels any pending actions, and finalizes session recording
   */
  stop() {
    this.status = 'stopped';
    this.stopTicker();

    console.log(`[AgendaDiagnostics] SESSION_STOP: Stopping session "${this.currentSession?.name}"`);

    this.dispatchAudio({ command: 'stop' });
    this.dispatchPresentation({ type: 'clear', fromAgenda: true, runId: this.runId });

    if (this.currentBackgroundState && !this.operatorOverridden) {
      const restored = this.preActionBackground || { type: 'color', color: '#000000', url: null };
      this.dispatchBackground({ ...restored, fromAgenda: true, runId: this.runId });
    }

    this.activeCues.clear();
    this.activeVisualCueId = null;
    this.activeLayerCues.clear();
    this.currentBackgroundState = null;
    this.currentPresentationState = null;
    this.currentAudioState = null;
    this.sessionElapsedSec = 0;
    this.intervalRemainingSec = 0;

    this.sessionStopRecordingPromise = this.handleStopSessionRecording();

    this.syncTimer({
      agendaTitle: this.agendaSnapshot?.name,
      sessionTitle: this.currentSession?.name,
      durationSec: 0,
      remainingSec: 0,
      sessionIndex: this.sessionIndex,
      isRunning: false,
      isPaused: false,
    });

    this.emitState();
  }

  /**
   * Advances to next session immediately, finalizing previous session recording
   */
  nextSession() {
    if (!this.agendaSnapshot) return;

    this.sessionStopRecordingPromise = this.handleStopSessionRecording();

    if (this.sessionIndex + 1 < this.agendaSnapshot.sessions.length) {
      this.sessionIndex++;
      this.currentSession = this.agendaSnapshot.sessions[this.sessionIndex];
      this.upcomingSession = this.agendaSnapshot.sessions[this.sessionIndex + 1] || null;
      this.sessionDurationSec = this.currentSession.durationSec || 300;
      this.sessionElapsedSec = 0;
      this.intervalRemainingSec = 0;
      this.executedActionIds.clear();
      this.activeCues.clear();
      this.activeVisualCueId = null;
      this.operatorOverridden = false;

      this.start();
    } else {
      this.completeAgenda();
    }
  }

  /**
   * Helper: starts optional session recording via programRecorder
   */
  async handleStartSessionRecording(session) {
    if (!session || !session.recordSession) return;
    try {
      // Serialize: ensure previous session's file finalization finishes before starting next session file
      if (this.sessionStopRecordingPromise) {
        try { await this.sessionStopRecordingPromise; } catch (_) {}
        this.sessionStopRecordingPromise = null;
      }

      this.recordingState = {
        status: 'starting',
        sessionId: session.id,
        sessionName: session.name,
        outputPath: null,
        error: null,
      };
      this.emitState();

      const startup = this.startRecording({
        agendaName: this.agendaSnapshot?.name || 'Agenda',
        sessionName: session.name || 'Session',
        sessionId: session.id,
        owner: 'agenda',
      });
      this.recordingStartupPromise = startup;
      const res = await startup;
      this.recordingStartupPromise = null;

      if (res && res.ok) {
        const wasPaused = this.status === 'paused';
        this.recordingState = {
          status: wasPaused ? 'paused' : 'recording',
          sessionId: session.id,
          sessionName: session.name,
          outputPath: res.outputPath,
          error: null,
        };
        if (wasPaused) {
          try { this.pauseRecording({ owner: 'agenda' }); } catch (_) {}
        }
      } else if (res && res.reason === 'already_recording') {
        this.recordingState = {
          status: 'merged_manual',
          sessionId: session.id,
          sessionName: session.name,
          outputPath: res.outputPath || null,
          note: 'Existing recording active — no separate session file',
          error: null,
        };
      } else {
        this.recordingState = {
          status: 'failed',
          sessionId: session.id,
          sessionName: session.name,
          outputPath: null,
          error: res?.error || res?.reason || 'Failed to start recording',
        };
      }
      this.emitState();
    } catch (err) {
      this.recordingStartupPromise = null;
      console.error('[AgendaEngine] Error starting session recording:', err.message);
      this.recordingState = {
        status: 'failed',
        sessionId: session.id,
        sessionName: session.name,
        outputPath: null,
        error: err.message,
      };
      this.emitState();
    }
  }

  /**
   * Helper: stops optional session recording cleanly and finalizes file
   */
  async handleStopSessionRecording() {
    if (!this.recordingState || this.recordingState.status === 'idle') return;

    try {
      // If startup is still pending, await it first so we don't orphan the spawned process
      if (this.recordingStartupPromise) {
        try { await this.recordingStartupPromise; } catch (_) {}
        this.recordingStartupPromise = null;
      }

      if (this.recordingState.status === 'recording' || this.recordingState.status === 'paused' || this.recordingState.status === 'starting') {
        const res = await this.stopRecording({ owner: 'agenda' });
        if (res && res.ok && res.reason !== 'manual_preserved') {
          this.recordingState = {
            status: 'completed',
            sessionId: this.recordingState.sessionId,
            sessionName: this.recordingState.sessionName,
            outputPath: res.outputPath,
            bytesWritten: res.bytesWritten,
            durationSec: res.durationSec,
            error: null,
          };
        } else if (res && res.reason === 'manual_preserved') {
          this.recordingState = { status: 'idle', error: null };
        } else {
          this.recordingState = {
            status: 'idle',
            outputPath: res?.outputPath || null,
            error: res?.error || null,
          };
        }
      } else {
        this.recordingState = { status: 'idle', error: null };
      }
      this.emitState();
    } catch (err) {
      console.error('[AgendaEngine] Error stopping session recording:', err.message);
      this.recordingState = { status: 'idle', error: err.message };
      this.emitState();
    }
  }

  /**
   * Skips timeline forward or backward within current session
   */
  skipTo(seconds) {
    if (!this.currentSession) return;
    const target = Math.max(0, Math.min(this.sessionDurationSec, Number(seconds) || 0));
    this.sessionElapsedSec = target;
    this.evaluateLateActions();
    this.emitState();
  }

  /**
   * Operator overrides background or slide manually
   */
  tagOperatorOverride(type) {
    this.operatorOverridden = true;
    console.log(`[AgendaEngine] Operator manually changed ${type}. Automatic restoration inhibited.`);
    this.emitState();
  }

  /**
   * Toggles automation armed state
   */
  setAutomationArmed(armed) {
    this.automationArmed = !!armed;
    this.emitState();
  }

  /**
   * High-resolution ticker loop (100ms)
   */
  ensureTicker() {
    if (this.tickerInterval) return;
    this.tickerInterval = setInterval(() => {
      this.tick();
    }, 100);
  }

  stopTicker() {
    if (this.tickerInterval) {
      clearInterval(this.tickerInterval);
      this.tickerInterval = null;
    }
  }

  tick() {
    const now = Date.now();
    const deltaSec = (now - this.lastTickTime) / 1000;
    this.lastTickTime = now;

    if (this.status === 'running') {
      this.sessionElapsedSec += deltaSec;

      // Evaluate cues
      this.evaluateCues(false);

      // Check session completion
      if (this.sessionElapsedSec >= this.sessionDurationSec) {
        this.handleSessionEnd();
      } else {
        // Sync to timer display every ~500ms
        if (Math.floor(this.sessionElapsedSec * 2) !== Math.floor((this.sessionElapsedSec - deltaSec) * 2)) {
          this.syncTimer({
            agendaTitle: this.agendaSnapshot?.name,
            sessionTitle: this.currentSession?.name,
            durationSec: this.sessionDurationSec,
            remainingSec: Math.max(0, Math.round(this.sessionDurationSec - this.sessionElapsedSec)),
            sessionIndex: this.sessionIndex,
            totalSessions: this.agendaSnapshot?.sessions.length,
            isRunning: true,
            isPaused: false,
          });
        }
      }
    } else if (this.status === 'interval') {
      this.intervalRemainingSec -= deltaSec;
      if (this.intervalRemainingSec <= 0) {
        this.intervalRemainingSec = 0;
        this.nextSession();
      }
    }

    this.emitState();
  }

  /**
   * Evaluates scheduled cues and executes them if elapsed time has reached startSec
   */
  evaluateCues(isInitial = false) {
    if (!this.currentSession || !this.automationArmed) return;

    const cues = this.currentSession.timelineItems || [];
    const current = this.sessionElapsedSec;

    // 1. Point actions & Range start (trigger when elapsed time crosses startSec)
    // Starting cues evaluate first so contiguous cues take ownership smoothly without a black flash
    for (const cue of cues) {
      if (!this.executedActionIds.has(cue.id)) {
        if (current >= cue.startSec) {
          this.executeCue(cue);
        }
      }
    }

    // 2. Range action termination / endBehavior
    for (const cue of cues) {
      const isRange = cue.actionType === 'range' || (cue.durationSec && Number(cue.durationSec) > 0);
      if (isRange && this.activeCues.has(cue.id)) {
        const clipEnd = cue.startSec + Number(cue.durationSec || 0);
        if (current >= clipEnd) {
          this.endCue(cue);
        }
      }
    }
  }

  /**
   * Fires a specific scheduled cue
   */
  executeCue(cue) {
    this.executedActionIds.add(cue.id);
    this.activeCues.set(cue.id, cue);

    const dest = cue.destination || this.currentSession?.targetDestination || this.agendaSnapshot?.defaultDestination || 'all';
    let resolvedUrl = null;
    let failureReason = null;

    const isAudio = cue.mediaType === 'audio' || cue.track === 'audio';

    if (isAudio) {
      // Audio cues in unified track: execute ONLY through dispatchAudio, never touch visual layers
      const res = resolveDesktopAssetUrl(cue, this.agendaSnapshot, {
        assetsDir: this.options.assetsDir,
        mediaDir: this.options.mediaDir,
      });
      if (res.ok) {
        resolvedUrl = res.url;
      } else {
        failureReason = res.error;
      }

      if (failureReason) {
        cue.executionStatus = 'failed';
        cue.failureReason = failureReason;
        console.warn(`[AgendaDiagnostics] CUE_FAILED:`, {
          cueId: cue.id,
          cueName: cue.name,
          track: cue.track,
          mediaType: 'audio',
          reason: failureReason,
          sessionId: this.currentSession?.id,
          scheduledTimeSec: cue.startSec,
          actualDispatchTimeSec: this.sessionElapsedSec,
        });
        this.emit('cue_failed', { cue, reason: failureReason });
        this.emitState();
        return;
      }

      cue.executionStatus = 'active';
      this.activeLayerCues.set(`${dest}:audio`, { cueId: cue.id, runId: this.runId });
      console.log(`[AgendaDiagnostics] CUE_DISPATCH (AUDIO):`, {
        cueId: cue.id,
        cueName: cue.name,
        track: cue.track,
        sessionId: this.currentSession?.id,
        sessionName: this.currentSession?.name,
        scheduledTimeSec: cue.startSec,
        actualDispatchTimeSec: this.sessionElapsedSec,
        resolvedDestination: dest,
        resolvedUrl,
        status: 'dispatched',
      });

      const audioPayload = {
        command: 'play',
        action: 'play',
        url: resolvedUrl,
        sourceInSec: cue.sourceInSec || 0,
        sourceOutSec: cue.sourceOutSec || null,
        volume: typeof cue.volume === 'number' ? cue.volume : 1.0,
        loop: cue.loop === true,
        cueId: cue.id,
        runId: this.runId,
        destination: dest,
      };
      this.currentAudioState = audioPayload;
      this.dispatchAudio(audioPayload);
      this.emit('cue_fired', { cue, timestamp: this.sessionElapsedSec });
      this.emitState();
      return;
    }

    // Visual cue (Video, Image, Color)
    this.activeVisualCueId = cue.id;

    // Determine mediaType
    let mediaType = cue.mediaType;
    if (!mediaType) {
      if (cue.assetType === 'video' || cue.track === 'video' || (cue.name && /\.(mp4|mov|webm|mkv|avi)$/i.test(cue.name))) {
        mediaType = 'video';
      } else if (!cue.assetId && !cue.url && !cue.localFileUrl && !cue.fileUrl && cue.color) {
        mediaType = 'color';
      } else {
        mediaType = 'image';
      }
    }

    // Determine presentationMode ('background' vs 'foreground')
    let presentationMode = cue.presentationMode;
    if (!presentationMode) {
      if (cue.track === 'background') {
        presentationMode = 'background';
      } else if (cue.track === 'video' || cue.track === 'image') {
        presentationMode = 'foreground';
      } else {
        presentationMode = mediaType === 'video' ? 'foreground' : 'background';
      }
    }

    const isSolidColor = mediaType === 'color';
    if (!isSolidColor) {
      const res = resolveDesktopAssetUrl(cue, this.agendaSnapshot, {
        assetsDir: this.options.assetsDir,
        mediaDir: this.options.mediaDir,
      });
      if (res.ok) {
        resolvedUrl = res.url;
      } else {
        failureReason = res.error;
      }
    }

    if (failureReason) {
      cue.executionStatus = 'failed';
      cue.failureReason = failureReason;
      console.warn(`[AgendaDiagnostics] CUE_FAILED:`, {
        cueId: cue.id,
        cueName: cue.name,
        track: cue.track,
        reason: failureReason,
        sessionId: this.currentSession?.id,
        scheduledTimeSec: cue.startSec,
        actualDispatchTimeSec: this.sessionElapsedSec,
      });
      this.emit('cue_failed', { cue, reason: failureReason });
      this.emitState();
      return;
    }

    cue.executionStatus = 'active';
    const layerKey = `${dest}:${presentationMode}`;
    this.activeLayerCues.set(layerKey, { cueId: cue.id, runId: this.runId });
    if (dest !== 'all') {
      this.activeLayerCues.set(`all:${presentationMode}`, { cueId: cue.id, runId: this.runId });
    }

    console.log(`[AgendaDiagnostics] CUE_DISPATCH:`, {
      cueId: cue.id,
      cueName: cue.name,
      track: cue.track,
      mediaType,
      presentationMode,
      sessionId: this.currentSession?.id,
      sessionName: this.currentSession?.name,
      scheduledTimeSec: cue.startSec,
      actualDispatchTimeSec: this.sessionElapsedSec,
      resolvedDestination: dest,
      resolvedUrl,
      status: 'dispatched',
    });

    if (presentationMode === 'background') {
      // Crucial handover: If there was an active foreground presentation from this agenda run, clear it
      // so the new background image/color is not occluded by the unmounted or lingering video canvas slot!
      if (this.currentPresentationState && this.currentPresentationState.runId === this.runId) {
        console.log(`[AgendaEngine] Visual background cue "${cue.name}" clearing previous foreground presentation layer.`);
        this.currentPresentationState = null;
        this.dispatchPresentation({ type: 'clear', destination: dest, fromAgenda: true, runId: this.runId, cueId: cue.id });
      }

      this.preActionBackground = this.currentBackgroundState
        ? { ...this.currentBackgroundState }
        : { type: 'color', color: '#000000', url: null };

      const bgPayload = {
        type: mediaType === 'video' ? 'video' : (resolvedUrl ? 'image' : 'color'),
        url: resolvedUrl,
        color: cue.color || '#000000',
        destination: dest,
        cueId: cue.id,
        runId: this.runId,
        placement: cue.placement || 'center',
        fit: cue.fit || 'cover',
        zoom: cue.zoom || 1,
        panX: cue.panX || 0,
        panY: cue.panY || 0,
        fromAgenda: true,
      };
      this.currentBackgroundState = bgPayload;
      this.dispatchBackground(bgPayload);
    } else {
      // Foreground overlay
      const presPayload = {
        type: mediaType === 'video' ? 'video' : 'image',
        url: resolvedUrl,
        sourceInSec: cue.sourceInSec || 0,
        sourceOutSec: cue.sourceOutSec || null,
        loop: cue.loop !== undefined ? cue.loop : (cue.footageExceededBehavior !== 'hold'),
        footageExceededBehavior: cue.footageExceededBehavior || 'loop',
        destination: dest,
        cueId: cue.id,
        runId: this.runId,
        muted: cue.muted === true,
        volume: typeof cue.volume === 'number' ? cue.volume : 1.0,
        fit: cue.fit || 'contain',
        fromAgenda: true,
      };
      this.currentPresentationState = presPayload;
      this.dispatchPresentation(presPayload);
    }

    this.emit('cue_fired', { cue, timestamp: this.sessionElapsedSec });
    this.emitState();
  }

  /**
   * Handles end behavior when a duration-based clip completes
   */
  endCue(cue) {
    this.activeCues.delete(cue.id);
    cue.executionStatus = 'completed';
    const behavior = cue.endBehavior || this.currentSession?.mediaEndBehavior || this.agendaSnapshot?.defaultMediaEndBehavior || 'hold';
    const dest = cue.destination || this.currentSession?.targetDestination || this.agendaSnapshot?.defaultDestination || 'all';

    console.log(`[AgendaDiagnostics] CUE_ENDED:`, {
      cueId: cue.id,
      cueName: cue.name,
      track: cue.track,
      endBehavior: behavior,
      atSec: this.sessionElapsedSec,
    });

    const isAudio = cue.mediaType === 'audio' || cue.track === 'audio';

    if (isAudio) {
      const activeAudio = this.activeLayerCues.get(`${dest}:audio`);
      if (activeAudio && (activeAudio.cueId !== cue.id || activeAudio.runId !== this.runId)) {
        console.log(`[AgendaEngine] Audio cue "${cue.name}" ended, but audio is currently owned by cue "${activeAudio.cueId}". Preserving successor.`);
      } else {
        this.activeLayerCues.delete(`${dest}:audio`);
        this.currentAudioState = null;
        this.dispatchAudio({ command: 'stop', action: 'stop', cueId: cue.id, runId: this.runId });
      }
      this.emit('cue_ended', { cue, behavior });
      this.emitState();
      return;
    }

    // Visual cue
    let presentationMode = cue.presentationMode;
    if (!presentationMode) {
      if (cue.track === 'background') {
        presentationMode = 'background';
      } else if (cue.track === 'video' || cue.track === 'image') {
        presentationMode = 'foreground';
      } else {
        presentationMode = (cue.assetType === 'video' || cue.track === 'video' || (cue.name && /\.(mp4|mov|webm|mkv|avi)$/i.test(cue.name))) ? 'foreground' : 'background';
      }
    }

    const layerKey = `${dest}:${presentationMode}`;
    const activeLayer = this.activeLayerCues.get(layerKey);

    if (activeLayer && (activeLayer.cueId !== cue.id || activeLayer.runId !== this.runId)) {
      console.log(`[AgendaEngine] Visual cue "${cue.name}" ended, but layer ${layerKey} is now owned by cue "${activeLayer.cueId}". Preserving successor cue without clearing.`);
      this.emit('cue_ended', { cue, behavior });
      this.emitState();
      return;
    }

    this.activeLayerCues.delete(layerKey);
    if (this.activeVisualCueId === cue.id) {
      this.activeVisualCueId = null;
    }

    if (presentationMode === 'foreground') {
      if (behavior === 'restore' || behavior === 'continue' || behavior === 'clear') {
        this.currentPresentationState = null;
        this.dispatchPresentation({ type: 'clear', destination: cue.destination, fromAgenda: true, runId: this.runId, cueId: cue.id });
      }
      // if 'hold', keep presentation as-is
    } else {
      if (behavior === 'restore' && !this.operatorOverridden) {
        const toRestore = this.preActionBackground || { type: 'color', color: '#000000', url: null };
        this.currentBackgroundState = toRestore;
        this.dispatchBackground({ ...toRestore, runId: this.runId, cueId: cue.id, fromAgenda: true });
        this.preActionBackground = null;
      } else if (behavior === 'continue' || behavior === 'clear') {
        const cleared = { type: 'color', color: '#000000', url: null, cueId: null, fromAgenda: true, runId: this.runId };
        this.currentBackgroundState = cleared;
        this.dispatchBackground(cleared);
      }
      // if 'hold', keep this.currentBackgroundState as-is
    }

    this.emit('cue_ended', { cue, behavior });
    this.emitState();
  }

  /**
   * Late-action evaluation when starting late or scrubbing ahead
   */
  evaluateLateActions() {
    if (!this.currentSession) return;
    const current = this.sessionElapsedSec;
    const cues = this.currentSession.timelineItems || [];
    const dest = this.currentSession.targetDestination || this.agendaSnapshot?.defaultDestination || 'all';

    // Find the latest visual background cue up to current time
    const pastBgCues = cues
      .filter((c) => {
        const isAudio = c.mediaType === 'audio' || c.track === 'audio';
        if (isAudio) return false;
        const mode = c.presentationMode || (c.track === 'background' ? 'background' : (c.track === 'video' || c.track === 'image' ? 'foreground' : (c.assetType === 'video' ? 'foreground' : 'background')));
        return mode === 'background' && c.startSec <= current;
      })
      .sort((a, b) => b.startSec - a.startSec);

    if (pastBgCues.length > 0) {
      const latestBg = pastBgCues[0];
      const clipEnd = latestBg.startSec + (latestBg.durationSec || 60);
      if (current < clipEnd || latestBg.endBehavior === 'hold') {
        this.executeCue(latestBg);
      }
    }

    // Active media range that spans current time
    for (const cue of cues) {
      const isMedia = cue.track === 'media' || cue.track === 'visual' || cue.track === 'video' || cue.track === 'image' || cue.track === 'audio';
      if (isMedia) {
        const clipEnd = cue.startSec + (cue.durationSec || 60);
        if (cue.startSec <= current && current < clipEnd) {
          const offset = current - cue.startSec + (cue.sourceInSec || 0);
          console.log(`[AgendaEngine] Late start media "${cue.name}" (${cue.track}/${cue.mediaType || 'visual'}) at offset ${offset}s`);
          const cueDest = cue.destination || dest;

          const isAudio = cue.mediaType === 'audio' || cue.track === 'audio';
          if (isAudio) {
            const res = resolveDesktopAssetUrl(cue, this.agendaSnapshot, {
              assetsDir: this.options.assetsDir,
              mediaDir: this.options.mediaDir,
            });
            if (res.ok) {
              const audioPayload = {
                command: 'play',
                action: 'play',
                url: res.url,
                sourceInSec: offset,
                cueId: cue.id,
                runId: this.runId,
                destination: cueDest,
              };
              this.currentAudioState = audioPayload;
              this.dispatchAudio(audioPayload);
              this.activeCues.set(cue.id, cue);
              this.executedActionIds.add(cue.id);
            }
          } else {
            this.executeCue(cue);
          }
        } else if (clipEnd <= current) {
          this.executedActionIds.add(cue.id);
        }
      }
    }
  }

  /**
   * Handles session expiration and automatic or manual transitions
   */
  handleSessionEnd() {
    const interval = Number(this.currentSession.intervalSec) || 0;
    const autoAdvance = this.currentSession.transitionMode === 'auto';

    console.log(`[AgendaEngine] Session "${this.currentSession.name}" completed. Auto: ${autoAdvance}, Interval: ${interval}s`);

    this.handleStopSessionRecording();

    if (this.sessionIndex + 1 >= this.agendaSnapshot.sessions.length) {
      this.completeAgenda();
      return;
    }

    if (autoAdvance) {
      if (interval > 0) {
        this.status = 'interval';
        this.intervalRemainingSec = interval;
        this.syncTimer({
          agendaTitle: this.agendaSnapshot.name,
          sessionTitle: `Next: ${this.agendaSnapshot.sessions[this.sessionIndex + 1]?.name}`,
          durationSec: interval,
          remainingSec: interval,
          isInterval: true,
          isRunning: true,
        });
      } else {
        this.nextSession();
      }
    } else {
      // Wait for operator manual advancement
      this.status = 'paused';
      this.sessionElapsedSec = this.sessionDurationSec;
      this.syncTimer({
        agendaTitle: this.agendaSnapshot.name,
        sessionTitle: `${this.currentSession.name} (Done - Awaiting Operator)`,
        durationSec: this.sessionDurationSec,
        remainingSec: 0,
        isRunning: false,
        isPaused: true,
      });
    }
  }

  completeAgenda() {
    this.status = 'completed';
    this.stopTicker();
    this.handleStopSessionRecording();
    console.log(`[AgendaEngine] Agenda "${this.agendaSnapshot.name}" completed.`);
    this.syncTimer({
      agendaTitle: this.agendaSnapshot.name,
      sessionTitle: 'Event Completed',
      durationSec: 0,
      remainingSec: 0,
      isRunning: false,
      isPaused: false,
    });
    this.emitState();
  }

  /**
   * Applies an explicit update to the running schedule snapshot without restarting clock
   */
  updateLiveSchedule(updatedAgenda) {
    if (!updatedAgenda) {
      return this.getState();
    }

    if (!this.agendaSnapshot || this.status === 'idle') {
      this.loadAgenda(updatedAgenda);
      return this.getState();
    }

    // Preserve current clock & active execution pointers
    const curIndex = this.sessionIndex;
    const curElapsed = this.sessionElapsedSec;

    this.agendaSnapshot = JSON.parse(JSON.stringify(updatedAgenda));
    if (!Array.isArray(this.agendaSnapshot.sessions)) {
      this.agendaSnapshot.sessions = [];
    }
    this.currentSession = this.agendaSnapshot.sessions[curIndex] || this.agendaSnapshot.sessions[0] || null;
    this.upcomingSession = this.agendaSnapshot.sessions[curIndex + 1] || null;
    this.sessionDurationSec = this.currentSession ? (this.currentSession.durationSec || 0) : 0;
    this.sessionElapsedSec = curElapsed;

    console.log(`[AgendaEngine] Live schedule updated cleanly for session "${this.currentSession?.name}"`);
    this.emitState();
  }

  /**
   * Formulates the current state payload for UI and mobile companions
   */
  getState() {
    let nextCue = null;
    let nextCueInSec = null;

    if (this.currentSession && Array.isArray(this.currentSession.timelineItems)) {
      const futureCues = this.currentSession.timelineItems
        .filter((c) => !this.executedActionIds.has(c.id) && c.startSec > this.sessionElapsedSec)
        .sort((a, b) => a.startSec - b.startSec);

      if (futureCues.length > 0) {
        nextCue = futureCues[0];
        nextCueInSec = Math.max(0, Math.round(nextCue.startSec - this.sessionElapsedSec));
      }
    }

    return {
      status: this.status,
      agendaId: this.agendaSnapshot ? this.agendaSnapshot.id : null,
      agendaName: this.agendaSnapshot ? this.agendaSnapshot.name : '',
      sessionIndex: this.sessionIndex,
      sessionName: this.currentSession ? this.currentSession.name : '',
      sessionDurationSec: this.sessionDurationSec,
      sessionElapsedSec: Math.round(this.sessionElapsedSec),
      sessionRemainingSec: Math.max(0, Math.round(this.sessionDurationSec - this.sessionElapsedSec)),
      intervalRemainingSec: Math.max(0, Math.round(this.intervalRemainingSec)),
      automationArmed: this.automationArmed,
      operatorOverridden: this.operatorOverridden,
      activeCueCount: this.activeCues.size,
      nextAction: nextCue ? nextCue.name : null,
      nextActionInSec: nextCueInSec,
      nextSessionName: this.upcomingSession ? this.upcomingSession.name : null,
      totalSessions: this.agendaSnapshot ? (this.agendaSnapshot.sessions || []).length : 0,
      recordingState: this.recordingState || { status: 'idle' },
      recordSession: !!this.currentSession?.recordSession,
      cues: (this.currentSession?.timelineItems || []).map((c) => ({
        id: c.id,
        name: c.name,
        track: c.track,
        startSec: c.startSec,
        durationSec: c.durationSec,
        executionStatus: c.executionStatus || (this.executedActionIds.has(c.id) ? (this.activeCues.has(c.id) ? 'active' : 'completed') : 'pending'),
        failureReason: c.failureReason || null,
      })),
    };
  }

  emitState() {
    const state = this.getState();
    this.emit('state', state);
    if (typeof this.broadcastState === 'function') {
      this.broadcastState(state);
    }
  }
}

module.exports = AgendaExecutionEngine;
