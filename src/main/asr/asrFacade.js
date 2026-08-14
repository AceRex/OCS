/**
 * ASR Facade — Phase 0 enhanced orchestrator.
 *
 * Selects whisper.cpp (default) or Vosk (fallback) and wraps the chosen
 * engine in the FR-3.65 AsrAdapter contract so ALL consumers see a single,
 * stable interface regardless of which engine is active.
 *
 * New in Phase 0:
 *  - Engine selection via WhisperAdapter / VoskAdapter (FR-3.65)
 *  - FR-3.68: on engine switch, emits 'engine-changed' event and resets
 *    confidence threshold to the new engine's calibrated default
 *  - FR-3.66: active adapter exposes `.aliases.getTriggerRe()` / `.getBookAliasRe()`
 *    so BroadcastEngine uses the right phonetic model per engine
 *  - Adapter state surface: `.engineName` / `.aliases` / `.confidenceThreshold`
 *
 * main.js uses this as before (same EventEmitter interface), just imports from new path.
 * The old `src/main/asrFacade.js` becomes a re-export shim pointing here.
 */
'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { WhisperAdapter, WHISPER_DEFAULT_CONFIDENCE } = require('./WhisperAdapter');
const { VoskAdapter, VOSK_DEFAULT_CONFIDENCE } = require('./VoskAdapter');
const { resolveWhisperModel } = require('./whisperEngine');

// ── Engine selection heuristic (FR-12.1 Step 1 lite) ────────────────────────

function resolveVoskModelPath(rootDir) {
  return path.join(rootDir, 'voice_server', 'models', 'vosk-model-small-en-us-0.15');
}

function chooseEngineName(rootDir, explicit) {
  if (explicit === 'vosk' || explicit === 'whisper') return explicit;
  const env = String(process.env.OCS_ASR_ENGINE || '').toLowerCase();
  if (env === 'vosk' || env === 'whisper') return env;

  const totalMemGb = os.totalmem() / (1024 ** 3);
  const whisperModel = resolveWhisperModel(rootDir);
  if (!whisperModel) {
    console.log('[Asr] no whisper model found → vosk fallback');
    return 'vosk';
  }

  if (totalMemGb > 0 && totalMemGb < 8) {
    console.warn(`[Asr] low RAM (${totalMemGb.toFixed(1)} GB) → vosk fallback`);
    return 'vosk';
  }

  return 'whisper';
}

// ── Engine-default confidence thresholds (FR-3.68) ──────────────────────────
const ENGINE_DEFAULT_THRESHOLDS = {
  whisper: WHISPER_DEFAULT_CONFIDENCE,
  vosk: VOSK_DEFAULT_CONFIDENCE,
};

class AsrFacade extends EventEmitter {
  constructor(rootDir, opts = {}) {
    super();
    this.rootDir = rootDir;
    this._forced = opts.engine || null;

    /** @type {string|null} */
    this._engineName = null;

    /** @type {WhisperAdapter|VoskAdapter|null} */
    this._adapter = null;

    /** @type {object|null} FR-3.68 calibration state */
    this._calibration = null;
  }

  // ── Public surface ─────────────────────────────────────────────────────────

  get engineName() {
    return this._engineName;
  }

  /**
   * FR-3.65 — Expose the active adapter's alias sets so consumers can call
   * adapter.aliases.getTriggerRe() without coupling to a specific engine.
   */
  get aliases() {
    return this._adapter ? this._adapter.aliases : null;
  }

  getState() {
    const base = this._adapter ? this._adapter.getState() : { status: 'uninitialized' };
    return {
      ...base,
      asrEngine: this._engineName,
      engineName: this._engineName,
      calibration: this._calibration,
      enginesAvailable: {
        whisper: !!resolveWhisperModel(this.rootDir),
        vosk: fs.existsSync(resolveVoskModelPath(this.rootDir)),
      },
    };
  }

  // ── Initialization ─────────────────────────────────────────────────────────

  async initialize(forceEngine) {
    const name = chooseEngineName(this.rootDir, forceEngine || this._forced);

    // Already initialized on same engine — reuse
    const s = this._adapter ? this._adapter.getState() : {};
    if (this._adapter && this._engineName === name && ['ready', 'listening'].includes(s.status)) {
      return this.getState();
    }

    // FR-3.68: detect engine switch BEFORE teardown so we can emit 'engine-changed'
    const prevEngine = this._engineName;

    await this._teardownAdapter();

    this._engineName = name;
    this._adapter = this._createAdapter(name);
    this._attachAdapterListeners();

    let state;
    try {
      state = await this._adapter.initialize();
    } catch (err) {
      state = { status: 'error', error: err.message };
    }

    // Whisper failed → auto-fallback to Vosk
    if (name === 'whisper' && state.status === 'error') {
      console.warn('[Asr] whisper init failed — falling back to vosk:', state.error);
      await this._teardownAdapter();
      this._engineName = 'vosk';
      this._adapter = this._createAdapter('vosk');
      this._attachAdapterListeners();
      state = await this._adapter.initialize();
    }

    // FR-3.68 — Engine switched: reset confidence + signal UI
    if (prevEngine && prevEngine !== this._engineName) {
      this._onEngineChanged(prevEngine, this._engineName);
    } else if (!prevEngine) {
      // First init: apply engine default
      const defaultThreshold = ENGINE_DEFAULT_THRESHOLDS[this._engineName] || VOSK_DEFAULT_CONFIDENCE;
      this._adapter.setConfidenceThreshold(defaultThreshold);
    }

    return this.getState();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  _createAdapter(name) {
    return name === 'whisper'
      ? new WhisperAdapter(this.rootDir)
      : new VoskAdapter(this.rootDir);
  }

  _attachAdapterListeners() {
    if (!this._adapter) return;

    // Forward typed events upstream (to main.js listeners)
    this._adapter.on('transcript', (payload) => this.emit('transcript', payload));
    this._adapter.on('final', (payload) => this.emit('final', payload));
    this._adapter.on('partial', (payload) => this.emit('partial', payload));
    this._adapter.on('status', (s) => this.emit('status', s));
  }

  async _teardownAdapter() {
    if (!this._adapter) return;
    try { this._adapter.shutdown(); } catch (_) {}
    this._adapter.removeAllListeners();
    this._adapter = null;
  }

  /**
   * FR-3.68 — Engine switched. Reset confidence to the new engine's calibrated
   * default and emit 'engine-changed' so the debug bar and UI can show a
   * "calibration in progress" warning.
   */
  _onEngineChanged(fromEngine, toEngine) {
    const newThreshold = ENGINE_DEFAULT_THRESHOLDS[toEngine] || VOSK_DEFAULT_CONFIDENCE;
    if (this._adapter) {
      this._adapter.setConfidenceThreshold(newThreshold);
    }

    this._calibration = {
      calibrating: true,
      fromEngine,
      toEngine,
      resetThreshold: newThreshold,
      at: Date.now(),
    };

    console.log(
      `[Asr] engine changed: ${fromEngine} → ${toEngine}.`,
      `Confidence threshold reset to ${newThreshold} (FR-3.68).`
    );

    this.emit('engine-changed', {
      fromEngine,
      toEngine,
      newThreshold,
      calibrationNeeded: true,
    });

    // Auto-clear calibration flag after 30 s (one calibration window per PRD §6.3)
    if (this._calibrationTimer) clearTimeout(this._calibrationTimer);
    this._calibrationTimer = setTimeout(() => {
      if (this._calibration) this._calibration.calibrating = false;
      this.emit('engine-calibrated', { engine: toEngine });
      this._calibrationTimer = null;
    }, 30_000);
  }

  // ── Lifecycle (delegated to adapter) ──────────────────────────────────────

  startSession() {
    if (!this._adapter) throw new Error('ASR not initialized');
    return this._adapter.startSession();
  }

  stopSession() {
    if (!this._adapter) return { status: 'uninitialized' };
    return this._adapter.stopSession();
  }

  pushAudio(pcm) {
    if (this._adapter) this._adapter.pushAudio(pcm);
  }

  // ── Configuration (delegated + FR-3.68) ───────────────────────────────────

  setConfidenceThreshold(value) {
    if (this._adapter) this._adapter.setConfidenceThreshold(value);
  }

  setLanguagePolicy(policy) {
    if (this._adapter) this._adapter.setLanguagePolicy(policy);
  }

  getLanguagePolicy() {
    return this._adapter ? this._adapter.getLanguagePolicy() : null;
  }

  shutdown() {
    if (this._calibrationTimer) {
      clearTimeout(this._calibrationTimer);
      this._calibrationTimer = null;
    }
    this._teardownAdapter();
  }

  /** Secondary / PTT buffer transcription — delegated to adapter. */
  async transcribeSecondary(pcm) {
    if (!this._adapter) throw new Error('ASR not initialized');
    return this._adapter.transcribeSecondary(pcm);
  }
}

module.exports = {
  AsrFacade,
  chooseEngineName,
};
