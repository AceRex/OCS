/**
 * OCS Broadcast Supervisor — P0-01 Native RTMP/SRT Streaming Engine
 *
 * Implements a production-grade streaming supervisor that spawns FFmpeg
 * to pipe composite video and broadcast audio to RTMP, RTMPS, or SRT destinations.
 *
 * Features:
 * - Auto-detection of hardware acceleration (h264_videotoolbox, h264_nvenc, h264_qsv, libx264).
 * - Real-time metrics parsing (fps, bitrate, dropped frames, speed factor).
 * - Automatic exponential-backoff reconnect on transient network drops (up to 5 retries).
 * - Support for standard YouTube / Facebook 2.0s keyframe interval requirement.
 * - Integration with ProgramRecorder and BroadcastAudioBus.
 */

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { DestinationWorker, DESTINATION_STATES } = require('./destinationWorker');

/**
 * Broadcast lifecycle states.
 * Progression: IDLE → STARTING → CONNECTING → ENCODING → TRANSMITTING → LIVE
 * Failure:     any → FAILED
 * Reconnect:   FAILED/TRANSMITTING → RECONNECTING → CONNECTING
 * Stop:        any → STOPPING → STOPPED → IDLE
 */
const BROADCAST_STATES = {
  IDLE:         'IDLE',
  STARTING:     'STARTING',
  CONNECTING:   'CONNECTING',
  ENCODING:     'ENCODING',
  TRANSMITTING: 'TRANSMITTING',
  LIVE:         'LIVE',
  RECONNECTING: 'RECONNECTING',
  FAILED:       'FAILED',
  STOPPING:     'STOPPING',
  STOPPED:      'STOPPED',
};

// LIVE requires sustained transmission: ≥ this many seconds with fps > 0
const LIVE_SUSTAIN_SEC = 30;

// Connection timeout: if no frame= appears within this window, mark FAILED
const CONNECT_TIMEOUT_MS = 20000;

class BroadcastSupervisor {
  constructor() {
    this.ffmpegProcess = null;
    this.isStreaming   = false;  // kept for backward compat
    this.state         = BROADCAST_STATES.IDLE;
    this.streamConfig  = null;
    this.startTime     = 0;
    this._encodingStartTime = 0;  // when first frame= appeared
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this._reconnectTimer   = null;
    this._connectTimeoutTimer = null;
    this._liveTimer        = null;
    this._isIntentionalStop = false;
    this._isBackpressured  = false;

    // Real-time telemetry
    this.stats = {
      fps: 0,
      bitrateKbps: 0,
      framesSent: 0,
      droppedFrames: 0,
      speedFactor: 1.0,
      health: 'offline',
      reconnects: 0,
    };

    this._ffmpegPath    = null;
    this._cachedEncoder = null;

    // Multi-destination streaming maps & workers
    this._workers        = new Map();
    this._multiProcesses = new Map();
    this._multiStats     = new Map();
    this._multiConfig    = new Map();
    this._multiReconnect = new Map();
  }

  /**
   * Sanitizes a streaming endpoint URL to redact stream keys and passphrases.
   *
   * @param {string} url - Full streaming URL
   * @returns {string} Sanitized URL
   */
  sanitizeEndpoint(url) {
    if (!url || typeof url !== 'string') return '';
    try {
      // Redact SRT passphrase parameter: srt://host:port?passphrase=SECRET&...
      let sanitized = url.replace(/([?&]passphrase=)([^&]+)/gi, '$1[REDACTED]');

      // Redact RTMP / RTMPS stream key (the final path component after application name)
      // e.g. rtmp://a.rtmp.youtube.com/live2/abcd-1234 -> rtmp://a.rtmp.youtube.com/live2/[REDACTED]
      if (sanitized.startsWith('rtmp://') || sanitized.startsWith('rtmps://')) {
        const parts = sanitized.split('/');
        if (parts.length > 4) {
          const appPart = parts.slice(0, 4).join('/');
          return `${appPart}/[REDACTED]`;
        }
      }
      return sanitized;
    } catch (_) {
      return '[REDACTED_URL]';
    }
  }

  /**
   * Resolves active FFmpeg binary.
   */
  getFfmpegPath() {
    if (this._ffmpegPath) return this._ffmpegPath;

    // Priority 1: system FFmpeg if it has openssl/TLS (required for RTMPS)
    // Only used in development; packaged apps rely on bundled binary.
    if (process.env.NODE_ENV !== 'production') {
      const systemCandidates = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'];
      for (const candidate of systemCandidates) {
        if (fs.existsSync(candidate)) {
          try {
            const res = spawnSync(candidate, ['-buildconf'], { encoding: 'utf8', timeout: 5000 });
            const conf = (res.stdout || '') + (res.stderr || '');
            if (conf.includes('--enable-openssl') || conf.includes('--enable-gnutls')) {
              console.log(`[BroadcastSupervisor] Using system FFmpeg with TLS: ${candidate}`);
              this._ffmpegPath = candidate;
              return this._ffmpegPath;
            }
          } catch (_) {}
        }
      }
    }

    // Priority 2: bundled ffmpeg-static (arm64 macOS, has SecureTransport TLS)
    try {
      const ffmpegStatic = require('ffmpeg-static');
      if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
        this._ffmpegPath = ffmpegStatic;
        return this._ffmpegPath;
      }
    } catch (_) {}

    const localBundled = path.join(__dirname, '..', '..', '..', 'node_modules', 'ffmpeg-static', 'ffmpeg');
    if (fs.existsSync(localBundled)) {
      this._ffmpegPath = localBundled;
      return this._ffmpegPath;
    }

    this._ffmpegPath = 'ffmpeg';
    return this._ffmpegPath;
  }

  /**
   * Detects platform-optimal hardware encoder.
   */
  detectHardwareEncoder() {
    if (this._cachedEncoder) return this._cachedEncoder;

    const ffmpegBin = this.getFfmpegPath();
    try {
      const res = spawnSync(ffmpegBin, ['-encoders'], { encoding: 'utf8', timeout: 5000 });
      const out = res.stdout || '';

      if (process.platform === 'darwin' && out.includes('h264_videotoolbox')) {
        this._cachedEncoder = 'h264_videotoolbox';
        return this._cachedEncoder;
      }
      if (process.platform === 'win32') {
        if (out.includes('h264_nvenc')) this._cachedEncoder = 'h264_nvenc';
        else if (out.includes('h264_qsv')) this._cachedEncoder = 'h264_qsv';
        else this._cachedEncoder = 'libx264';
        return this._cachedEncoder;
      }
      if (process.platform === 'linux' && out.includes('h264_nvenc')) {
        this._cachedEncoder = 'h264_nvenc';
        return this._cachedEncoder;
      }
    } catch (_) {}

    this._cachedEncoder = 'libx264';
    return this._cachedEncoder;
  }

  /**
   * Starts a broadcast stream to RTMP, RTMPS, or SRT endpoint.
   *
   * @param {object} config
   * @param {string} config.streamUrl - Full target URL (e.g., rtmp://a.rtmp.youtube.com/live2/XXXX)
   * @param {number} [config.width=1280]
   * @param {number} [config.height=720]
   * @param {number} [config.fps=30]
   * @param {number} [config.videoBitrateKbps=4500]
   * @param {number} [config.audioBitrateKbps=192]
   * @param {number} [config.sampleRate=48000]
   * @param {boolean} [config.withAudio=true]
   * @returns {Promise<{ok: boolean, streamUrl: string}>}
   */
  start(config) {
    if (this.isStreaming) {
      return Promise.reject(new Error('Broadcast is already actively streaming'));
    }

    let targetUrl = config && config.streamUrl;
    if (!targetUrl && config && config.url) {
      targetUrl = config.streamKey ? `${config.url.replace(/\/$/, '')}/${config.streamKey}` : config.url;
    }

    if (!targetUrl) {
      return Promise.reject(new Error('streamUrl is required to start broadcast'));
    }

    this.streamConfig = {
      width: config.width || 1280,
      height: config.height || 720,
      fps: config.fps || 30,
      videoBitrateKbps: config.videoBitrateKbps || 4500,
      audioBitrateKbps: config.audioBitrateKbps || 192,
      sampleRate: config.sampleRate || 48000,
      channels: config.channels || 2,
      withAudio: config.withAudio !== false,
      streamUrl: targetUrl
    };

    this._isIntentionalStop = false;
    this.reconnectAttempts   = 0;
    this.startTime           = Date.now();
    this._encodingStartTime  = 0;
    this.state               = BROADCAST_STATES.STARTING;
    this.stats               = { fps: 0, bitrateKbps: 0, framesSent: 0, droppedFrames: 0, speedFactor: 1.0, health: 'connecting', reconnects: 0 };

    return this._spawnStreamProcess();
  }

  /**
   * Internal method to build FFmpeg arguments and launch the streaming process.
   */
  _spawnStreamProcess() {
    return new Promise((resolve, reject) => {
      const c = this.streamConfig;
      const ffmpegBin = this.getFfmpegPath();
      const encoder = this.detectHardwareEncoder();

      // YouTube / Facebook mandate 2.0s GOP interval
      const gopSize = c.fps * 2;

      const isMpegTs = c.streamUrl.startsWith('srt://') || c.streamUrl.startsWith('tcp://') || c.streamUrl.startsWith('udp://');
      const format = isMpegTs ? 'mpegts' : 'flv';

      const args = [
        '-y',
        // Video Input (pipe:0)
        '-f', 'rawvideo',
        '-pix_fmt', 'rgba',
        '-s', `${c.width}x${c.height}`,
        '-r', `${c.fps}`,
        '-i', 'pipe:0'
      ];

      if (c.withAudio) {
        // Audio Input (pipe:3)
        args.push(
          '-f', 's16le',
          '-ar', `${c.sampleRate}`,
          '-ac', `${c.channels}`,
          '-i', 'pipe:3'
        );
      }

      // Video encoding
      args.push('-c:v', encoder);
      if (encoder === 'libx264') {
        args.push(
          '-preset', 'veryfast',
          '-tune', 'zerolatency',
          '-b:v', `${c.videoBitrateKbps}k`,
          '-maxrate', `${c.videoBitrateKbps}k`,
          '-bufsize', `${c.videoBitrateKbps * 2}k`,
          '-profile:v', 'main'
        );
      } else if (encoder === 'h264_videotoolbox') {
        args.push(
          '-b:v', `${c.videoBitrateKbps}k`,
          '-maxrate', `${c.videoBitrateKbps}k`,
          '-realtime', '1'
        );
      } else if (encoder === 'h264_nvenc') {
        args.push(
          '-preset', 'p3',
          '-b:v', `${c.videoBitrateKbps}k`,
          '-maxrate', `${c.videoBitrateKbps}k`,
          '-bufsize', `${c.videoBitrateKbps * 2}k`
        );
      }

      // Mandatory 2.0s keyframe cadence
      args.push('-g', String(gopSize), '-keyint_min', String(gopSize));
      args.push('-pix_fmt', 'yuv420p');

      // Audio encoding
      if (c.withAudio) {
        args.push(
          '-c:a', 'aac',
          '-b:a', `${c.audioBitrateKbps}k`,
          '-ar', `${c.sampleRate}`
        );
      }

      // Container output options
      if (!isMpegTs) {
        args.push('-flvflags', 'no_duration_filesize');
      }

      // Real-time network delivery
      args.push('-flush_packets', '1');
      args.push('-f', format, c.streamUrl);

      try {
        const stdio = c.withAudio
          ? ['pipe', 'ignore', 'pipe', 'pipe']
          : ['pipe', 'ignore', 'pipe'];

        this.state = BROADCAST_STATES.CONNECTING;
        this.ffmpegProcess = spawn(ffmpegBin, args, { stdio });
        console.log(`[BroadcastSupervisor] FFmpeg spawned (PID ${this.ffmpegProcess.pid}) → ${this.sanitizeEndpoint(c.streamUrl)}`);

        // Prime input pipes
        try {
          const blankFrame = Buffer.alloc(c.width * c.height * 4);
          this.ffmpegProcess.stdin.write(blankFrame);
          if (c.withAudio && this.ffmpegProcess.stdio && this.ffmpegProcess.stdio[3]) {
            const blankAudio = Buffer.alloc(Math.floor((c.sampleRate / c.fps) * c.channels * 2));
            this.ffmpegProcess.stdio[3].write(blankAudio);
          }
        } catch (_) {}

        let resolved = false;

        // Connection timeout — if no frame= appears in CONNECT_TIMEOUT_MS, mark FAILED
        this._connectTimeoutTimer = setTimeout(() => {
          if (!resolved) {
            console.error(`[BroadcastSupervisor] Connection timeout (${CONNECT_TIMEOUT_MS}ms) — no frames encoded. Marking FAILED.`);
            this.state = BROADCAST_STATES.FAILED;
            this.stats.health = 'offline';
            resolved = true;
            reject(new Error(`Connection timeout: no frames encoded within ${CONNECT_TIMEOUT_MS}ms`));
          }
        }, CONNECT_TIMEOUT_MS);

        // Spawn verification timer: resolve startup once process is healthy & ready for frames
        // NOTE: State remains CONNECTING. It transitions to ENCODING/TRANSMITTING only when frames flow.
        const spawnVerificationTimer = setTimeout(() => {
          if (!resolved && this.ffmpegProcess) {
            resolved = true;
            this.isStreaming = true;
            resolve({ ok: true, streamUrl: c.streamUrl, state: this.state });
          }
        }, 300);

        this.ffmpegProcess.stderr.on('data', (data) => {
          const text = data.toString();
          if (process.env.DEBUG_BROADCAST) console.log('[FFmpeg Stderr]', text.trim());
          this._parseStats(text);

          // First frame= in stderr = FFmpeg is actively encoding
          if (text.includes('frame=') || text.includes('bitrate=')) {
            clearTimeout(this._connectTimeoutTimer);
            this._connectTimeoutTimer = null;

            if (this.state === BROADCAST_STATES.CONNECTING || this.state === BROADCAST_STATES.STARTING) {
              this.state = BROADCAST_STATES.ENCODING;
              this._encodingStartTime = Date.now();
              this.stats.health = 'good';
              console.log(`[BroadcastSupervisor] Encoding started → ${this.sanitizeEndpoint(c.streamUrl)} (${encoder})`);
              this._scheduleLivePromotion();
            }

            if (!resolved) {
              clearTimeout(spawnVerificationTimer);
              resolved = true;
              this.isStreaming = true;
              resolve({ ok: true, streamUrl: c.streamUrl, state: this.state });
            }
          }
        });

        if (this.ffmpegProcess.stdin && this.ffmpegProcess.stdin._writableState) {
          const expectedFrameBytes = (c.width || 1280) * (c.height || 720) * 4;
          this.ffmpegProcess.stdin._writableState.highWaterMark = Math.max(16 * 1024 * 1024, expectedFrameBytes * 2);
        }
        this.ffmpegProcess.stdin.on('drain', () => {
          this._isBackpressured = false;
        });

        this.ffmpegProcess.stdin.on('error', (err) => {
          if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return;
          console.error('[BroadcastSupervisor] Stdin pipe error:', err.message);
        });

        if (c.withAudio && this.ffmpegProcess.stdio && this.ffmpegProcess.stdio[3]) {
          this.ffmpegProcess.stdio[3].on('error', (err) => {
            if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return;
            console.error('[BroadcastSupervisor] Audio pipe error:', err.message);
          });
        }

        this.ffmpegProcess.on('exit', (code, signal) => {
          clearTimeout(spawnVerificationTimer);
          clearTimeout(this._connectTimeoutTimer);
          clearTimeout(this._liveTimer);
          this._connectTimeoutTimer = null;
          this._liveTimer = null;
          console.warn(`[BroadcastSupervisor] FFmpeg exited (code=${code}, signal=${signal})`);
          this.ffmpegProcess = null;

          if (this._isIntentionalStop) {
            this.isStreaming = false;
            this.state = BROADCAST_STATES.STOPPED;
            this.stats.health = 'offline';
            if (!resolved) resolve({ ok: true, stopped: true });
          } else {
            this._handleUnexpectedExit(code);
            if (!resolved) {
              resolved = true;
              reject(new Error(`FFmpeg exited prematurely (code=${code})`));
            }
          }
        });

        this.ffmpegProcess.on('error', (err) => {
          clearTimeout(spawnVerificationTimer);
          clearTimeout(this._connectTimeoutTimer);
          console.error('[BroadcastSupervisor] Process error:', err.message);
          this.state = BROADCAST_STATES.FAILED;
          if (!resolved) { resolved = true; reject(err); }
        });

        // NOTE: NO unconditional timer-based LIVE transition.
        // State advances only when FFmpeg stderr confirms encoding activity.

      } catch (err) {
        this.isStreaming = false;
        this.state = BROADCAST_STATES.FAILED;
        reject(err);
      }
    });
  }

  /** Schedules ENCODING→TRANSMITTING→LIVE promotion based on sustained real activity. */
  _scheduleLivePromotion() {
    if (this._liveTimer) clearTimeout(this._liveTimer);
    this.state = BROADCAST_STATES.TRANSMITTING;
    // After LIVE_SUSTAIN_SEC of continuous transmission, promote to LIVE
    this._liveTimer = setTimeout(() => {
      if (this.isStreaming && this.stats.fps > 0) {
        this.state = BROADCAST_STATES.LIVE;
        console.log('[BroadcastSupervisor] State → LIVE (sustained transmission confirmed)');
      }
      this._liveTimer = null;
    }, LIVE_SUSTAIN_SEC * 1000);
  }

  /**
   * Parses stderr lines from FFmpeg for telemetry (fps, bitrate, drops).
   * Also drives ENCODING → TRANSMITTING state if we were still CONNECTING.
   */
  _parseStats(text) {
    // frame=  120 fps= 30 q=28.0 size=1240kB time=00:00:04.00 bitrate=2539.5kbits/s speed=1.00x drop=0
    const fpsMatch = text.match(/fps=\s*([\d.]+)/);
    if (fpsMatch) this.stats.fps = parseFloat(fpsMatch[1]);

    const bitrateMatch = text.match(/bitrate=\s*([\d.]+)kbits\/s/);
    if (bitrateMatch) this.stats.bitrateKbps = parseFloat(bitrateMatch[1]);

    const framesMatch = text.match(/frame=\s*(\d+)/);
    if (framesMatch) this.stats.framesSent = parseInt(framesMatch[1], 10);

    const dropMatch = text.match(/drop=\s*(\d+)/);
    if (dropMatch) this.stats.droppedFrames = parseInt(dropMatch[1], 10);

    const speedMatch = text.match(/speed=\s*([\d.]+)x/);
    if (speedMatch) {
      this.stats.speedFactor = parseFloat(speedMatch[1]);
      if (this.stats.speedFactor < 0.85)       this.stats.health = 'poor';
      else if (this.stats.speedFactor < 0.96)  this.stats.health = 'fair';
      else                                      this.stats.health = 'good';
    }

    // Ensure we never show fps/bitrate as 0 when we have actual data
    // (stats default to 0; only show real values or null-equivalent)
  }

  /**
   * Handles unexpected drops with exponential backoff auto-reconnect.
   */
  _handleUnexpectedExit(code) {
    this.isStreaming = false;
    this.stats.health = 'poor';

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`[BroadcastSupervisor] Reached max reconnect attempts (${this.maxReconnectAttempts}). Stream failed.`);
      this.stats.health = 'offline';
      return;
    }

    this.reconnectAttempts++;
    this.stats.reconnects++;

    // Backoff delay: 1s, 2s, 4s, 8s, 16s
    const backoffMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 16000);
    console.warn(`[BroadcastSupervisor] Connection dropped. Reconnecting in ${backoffMs}ms (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    this._reconnectTimer = setTimeout(() => {
      if (!this._isIntentionalStop && this.streamConfig) {
        console.log(`[BroadcastSupervisor] Attempting reconnect ${this.reconnectAttempts}...`);
        this._spawnStreamProcess().catch(err => {
          console.error('[BroadcastSupervisor] Reconnect attempt failed:', err.message);
        });
      }
    }, backoffMs);
  }

  /**
   * Writes a composite video frame into the stream pipeline.
   */
  writeVideoFrame(buffer) {
    if (!this.isStreaming || !this.ffmpegProcess || !this.ffmpegProcess.stdin || this.ffmpegProcess.killed) {
      return false;
    }
    const cfg = this.streamConfig || this.config;
    const expectedFrameBytes = (cfg?.width || 1280) * (cfg?.height || 720) * 4;
    if (buffer.length !== expectedFrameBytes) {
      this.stats.droppedFrames = (this.stats.droppedFrames || 0) + 1;
      return false;
    }
    if (this._isBackpressured) {
      this.stats.droppedFrames = (this.stats.droppedFrames || 0) + 1;
      return false;
    }
    try {
      const ok = this.ffmpegProcess.stdin.write(buffer);
      if (!ok) {
        this._isBackpressured = true;
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Writes mixed broadcast audio PCM into the stream pipeline.
   */
  writeAudioChunk(buffer) {
    if (!this.isStreaming || !this.ffmpegProcess || !this.ffmpegProcess.stdio || !this.ffmpegProcess.stdio[3] || this.ffmpegProcess.killed) {
      return false;
    }
    try {
      return this.ffmpegProcess.stdio[3].write(buffer);
    } catch (_) {
      return false;
    }
  }

  /**
   * Stops broadcast streaming cleanly.
   */
  stop() {
    this._isIntentionalStop = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    if (!this.ffmpegProcess) {
      this.isStreaming = false;
      this.state = BROADCAST_STATES.IDLE;
      this.stats.health = 'offline';
      return Promise.resolve({ ok: true, stopped: true });
    }

    this.state = BROADCAST_STATES.STOPPING;

    return new Promise((resolve) => {
      const proc = this.ffmpegProcess;
      const forceKillTimer = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch (_) {}
      }, 3000);

      proc.once('exit', () => {
        clearTimeout(forceKillTimer);
        this.ffmpegProcess = null;
        this.isStreaming = false;
        this.state = BROADCAST_STATES.STOPPED;
        this.stats.health = 'offline';
        console.log('[BroadcastSupervisor] Broadcast stopped cleanly');
        resolve({ ok: true, stopped: true });
      });

      try {
        if (proc.stdin) proc.stdin.end();
        if (proc.stdio && proc.stdio[3]) proc.stdio[3].end();
      } catch (_) {
        try { proc.kill('SIGTERM'); } catch (_) {}
      }
    });
  }

  /**
   * Returns live broadcast telemetry.
   */
  getStatus() {
    const uptimeSec = this.isStreaming ? Math.round((Date.now() - this.startTime) / 1000) : 0;
    const rawUrl = this.streamConfig ? this.streamConfig.streamUrl : null;
    const sanitizedUrl = rawUrl ? this.sanitizeEndpoint(rawUrl) : null;
    const isTransmitting = (this.state === BROADCAST_STATES.LIVE || this.state === BROADCAST_STATES.TRANSMITTING) &&
                           this.stats.framesSent > 0 &&
                           this.stats.fps > 0 &&
                           this.stats.bitrateKbps > 0;
    return {
      isStreaming: this.isStreaming,
      state: this.state,
      streamUrl: sanitizedUrl,
      targetUrl: sanitizedUrl,
      uptimeSec,
      reconnectAttempts: this.reconnectAttempts,
      stats: {
        ...this.stats,
        // Expose null for unconfirmed metrics instead of misleading 0
        fps: isTransmitting ? this.stats.fps : null,
        bitrateKbps: isTransmitting ? this.stats.bitrateKbps : null,
      },
      encoder: this._cachedEncoder || 'unknown',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Simulstreaming — Multi-Destination RTMP Engine (Stage 8)
  // Supports up to N simultaneous FFmpeg processes, one per destination.
  // Each destination runs its own reconnect loop independently.
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Spawns one FFmpeg process per enabled destination and begins streaming.
   *
   * @param {Array<{id: string, label: string, streamUrl: string, videoBitrateKbps?: number, audioBitrateKbps?: number}>} destinations
   * @param {object} [baseConfig] - Shared video dimensions/fps settings
   * @returns {Promise<{ ok: boolean, results: Array<{id, ok, error?}> }>}
   */
  async startMulti(destinations, baseConfig = {}) {
    if (!Array.isArray(destinations) || destinations.length === 0) {
      return { ok: false, error: 'destinations array is required' };
    }

    // Initialize per-destination tracking maps and workers
    if (!this._workers) this._workers = new Map();
    if (!this._multiProcesses) this._multiProcesses = new Map();
    if (!this._multiStats) this._multiStats = new Map();
    if (!this._multiConfig) this._multiConfig = new Map();
    if (!this._multiReconnect) this._multiReconnect = new Map();

    const results = [];
    const encoder = this.detectHardwareEncoder();
    const ffmpegBin = this.getFfmpegPath();

    for (const dest of destinations) {
      if (!dest || !dest.id || !dest.streamUrl) {
        results.push({ id: dest?.id || 'unknown', ok: false, error: 'Missing id or streamUrl' });
        continue;
      }

      // Stop any existing process/worker for this id before restarting
      await this._stopDestination(dest.id);

      const workerConfig = {
        id: dest.id,
        label: dest.label || dest.id,
        streamUrl: dest.streamUrl,
        videoBitrateKbps: dest.videoBitrateKbps || baseConfig.videoBitrateKbps || 4500,
        audioBitrateKbps: dest.audioBitrateKbps || baseConfig.audioBitrateKbps || 192,
        width: baseConfig.width || 1280,
        height: baseConfig.height || 720,
        fps: baseConfig.fps || 30,
        sampleRate: baseConfig.sampleRate || 48000,
        channels: baseConfig.channels || 2,
        withAudio: baseConfig.withAudio !== false,
        ffmpegBin,
        encoder,
      };

      const worker = new DestinationWorker(workerConfig);
      this._workers.set(dest.id, worker);
      this._multiConfig.set(dest.id, workerConfig);

      try {
        const result = await worker.start();
        if (worker.proc) {
          this._multiProcesses.set(dest.id, worker.proc);
        }
        this._multiStats.set(dest.id, worker.getStatus());
        results.push({ id: dest.id, ok: result.ok, error: result.error });
      } catch (err) {
        console.error(`[BroadcastSupervisor] Failed to start destination "${dest.id}":`, err.message);
        results.push({ id: dest.id, ok: false, error: err.message });
      }
    }

    const anyOk = results.some(r => r.ok);
    return { ok: anyOk, results };
  }

  /**
   * Internal: Spawns a single FFmpeg process for one destination.
   */
  _spawnDestinationProcess(id, c, encoder, ffmpegBin) {
    return new Promise((resolve, reject) => {
      const gopSize = c.fps * 2;
      const isMpegTs = c.streamUrl.startsWith('srt://') || c.streamUrl.startsWith('tcp://') || c.streamUrl.startsWith('udp://');
      const format = isMpegTs ? 'mpegts' : 'flv';

      const args = [
        '-y',
        '-f', 'rawvideo', '-pix_fmt', 'rgba',
        '-s', `${c.width}x${c.height}`,
        '-r', `${c.fps}`,
        '-i', 'pipe:0',
      ];

      if (c.withAudio) {
        args.push('-f', 's16le', '-ar', `${c.sampleRate}`, '-ac', `${c.channels}`, '-i', 'pipe:3');
      }

      args.push('-c:v', encoder);
      if (encoder === 'libx264') {
        args.push('-preset', 'veryfast', '-b:v', `${c.videoBitrateKbps}k`,
          '-maxrate', `${c.videoBitrateKbps}k`, '-bufsize', `${c.videoBitrateKbps * 2}k`, '-profile:v', 'main');
      } else if (encoder === 'h264_videotoolbox') {
        args.push('-b:v', `${c.videoBitrateKbps}k`, '-maxrate', `${c.videoBitrateKbps}k`, '-realtime', '1');
      } else if (encoder === 'h264_nvenc') {
        args.push('-preset', 'p3', '-b:v', `${c.videoBitrateKbps}k`,
          '-maxrate', `${c.videoBitrateKbps}k`, '-bufsize', `${c.videoBitrateKbps * 2}k`);
      }

      args.push('-g', String(gopSize), '-keyint_min', String(gopSize), '-pix_fmt', 'yuv420p');

      if (c.withAudio) {
        args.push('-c:a', 'aac', '-b:a', `${c.audioBitrateKbps}k`, '-ar', `${c.sampleRate}`);
      }
      if (!isMpegTs) args.push('-flvflags', 'no_duration_filesize');
      args.push('-flush_packets', '1', '-f', format, c.streamUrl);

      try {
        const stdio = c.withAudio ? ['pipe', 'ignore', 'pipe', 'pipe'] : ['pipe', 'ignore', 'pipe'];
        const proc = spawn(ffmpegBin, args, { stdio });
        console.log(`[BroadcastSupervisor/${id}] FFmpeg spawned (PID ${proc.pid}) → ${this.sanitizeEndpoint(c.streamUrl)}`);

        // Prime pipes
        try {
          const blankFrame = Buffer.alloc(c.width * c.height * 4);
          proc.stdin.write(blankFrame);
          if (c.withAudio && proc.stdio && proc.stdio[3]) {
            const blankAudio = Buffer.alloc(Math.floor((c.sampleRate / c.fps) * c.channels * 2));
            proc.stdio[3].write(blankAudio);
          }
        } catch (_) {}

        this._multiProcesses.set(id, proc);
        let resolved = false;
        const stat = this._multiStats.get(id);

        // Per-destination connection timeout
        const connectTimer = setTimeout(() => {
          if (!resolved) {
            console.error(`[BroadcastSupervisor/${id}] Connection timeout — no frames encoded. Marking FAILED.`);
            if (stat) { stat.state = BROADCAST_STATES.FAILED; stat.health = 'offline'; }
            resolved = true;
            reject(new Error(`[${id}] Connection timeout: no frames within ${CONNECT_TIMEOUT_MS}ms`));
          }
        }, CONNECT_TIMEOUT_MS);
        if (stat) stat._connectTimer = connectTimer;

        // Spawn verification timer: resolve startup once process is healthy & ready for frames
        // NOTE: State remains CONNECTING. It transitions to ENCODING/TRANSMITTING only when frames flow.
        const spawnVerificationTimer = setTimeout(() => {
          if (!resolved && this._multiProcesses.has(id)) {
            resolved = true;
            if (stat) {
              stat.isStreaming = true;
              stat.state = BROADCAST_STATES.CONNECTING;
              stat.health = 'connecting';
            }
            resolve({ ok: true, state: BROADCAST_STATES.CONNECTING });
          }
        }, 300);

        proc.stderr.on('data', (data) => {
          const text = data.toString();
          if (process.env.DEBUG_BROADCAST) console.log(`[FFmpeg/${id}]`, text.trim());
          this._parseDestStats(id, text);

          if (text.includes('frame=') || text.includes('bitrate=')) {
            clearTimeout(connectTimer);

            if (stat && (stat.state === BROADCAST_STATES.CONNECTING || stat.state === BROADCAST_STATES.STARTING)) {
              stat.isStreaming = true;
              stat.state = BROADCAST_STATES.ENCODING;
              stat.health = 'good';
              console.log(`[BroadcastSupervisor/${id}] Encoding → ${this.sanitizeEndpoint(c.streamUrl)}`);

              // Schedule TRANSMITTING→LIVE promotion
              stat.state = BROADCAST_STATES.TRANSMITTING;
              stat._liveTimer = setTimeout(() => {
                if (stat.isStreaming && stat.fps > 0) {
                  stat.state = BROADCAST_STATES.LIVE;
                  console.log(`[BroadcastSupervisor/${id}] State → LIVE`);
                }
                stat._liveTimer = null;
              }, LIVE_SUSTAIN_SEC * 1000);
            }

            if (!resolved) {
              clearTimeout(spawnVerificationTimer);
              resolved = true;
              resolve({ ok: true, state: stat ? stat.state : BROADCAST_STATES.TRANSMITTING });
            }
          }
        });

        proc.stdin.on('error', (err) => {
          if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return;
          console.error(`[BroadcastSupervisor/${id}] Stdin error:`, err.message);
        });

        if (c.withAudio && proc.stdio && proc.stdio[3]) {
          proc.stdio[3].on('error', (err) => {
            if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return;
          });
        }

        proc.on('exit', (code, signal) => {
          clearTimeout(spawnVerificationTimer);
          clearTimeout(connectTimer);
          if (stat && stat._liveTimer) { clearTimeout(stat._liveTimer); stat._liveTimer = null; }
          console.warn(`[BroadcastSupervisor/${id}] FFmpeg exited (code=${code}, signal=${signal})`);
          this._multiProcesses.delete(id);
          if (stat) { stat.isStreaming = false; stat.health = 'offline'; stat.state = BROADCAST_STATES.STOPPED; }

          const reconnectCount = (this._multiReconnect.get(id) || 0);
          if (!this._isIntentionalStop && reconnectCount < 5 && this._multiConfig.has(id)) {
            const backoffMs = Math.min(1000 * Math.pow(2, reconnectCount), 16000);
            this._multiReconnect.set(id, reconnectCount + 1);
            if (stat) { stat.state = BROADCAST_STATES.RECONNECTING; stat.reconnects = (stat.reconnects || 0) + 1; }
            console.warn(`[BroadcastSupervisor/${id}] Reconnecting in ${backoffMs}ms (attempt ${reconnectCount + 1}/5)...`);
            setTimeout(() => {
              if (!this._isIntentionalStop && this._multiConfig.has(id)) {
                this._multiStats.set(id, {
                  ...this._multiStats.get(id),
                  state: BROADCAST_STATES.CONNECTING,
                  health: 'connecting',
                  fps: null, bitrateKbps: null,
                });
                this._spawnDestinationProcess(id, this._multiConfig.get(id), encoder, ffmpegBin).catch(e => {
                  console.error(`[BroadcastSupervisor/${id}] Reconnect failed:`, e.message);
                  const s = this._multiStats.get(id);
                  if (s) s.state = BROADCAST_STATES.FAILED;
                });
              }
            }, backoffMs);
          }

          if (!resolved) {
            resolved = true;
            reject(new Error(`FFmpeg/${id} exited prematurely (code=${code})`));
          }
        });

        proc.on('error', (err) => {
          clearTimeout(connectTimer);
          console.error(`[BroadcastSupervisor/${id}] Process error:`, err.message);
          if (stat) stat.state = BROADCAST_STATES.FAILED;
          if (!resolved) { resolved = true; reject(err); }
        });

        // NOTE: NO unconditional timer-based LIVE/STREAMING transition.

      } catch (err) {
        if (stat) stat.state = BROADCAST_STATES.FAILED;
        reject(err);
      }
    });
  }

  /**
   * Parses FFmpeg stderr telemetry for a specific destination.
   */
  _parseDestStats(id, text) {
    const stat = this._multiStats.get(id);
    if (!stat) return;

    const fpsMatch = text.match(/fps=\s*([\d.]+)/);
    if (fpsMatch) stat.fps = parseFloat(fpsMatch[1]);

    const bitrateMatch = text.match(/bitrate=\s*([\d.]+)kbits\/s/);
    if (bitrateMatch) stat.bitrateKbps = parseFloat(bitrateMatch[1]);

    const framesMatch = text.match(/frame=\s*(\d+)/);
    if (framesMatch) stat.framesSent = parseInt(framesMatch[1], 10);

    const dropMatch = text.match(/drop=\s*(\d+)/);
    if (dropMatch) stat.droppedFrames = parseInt(dropMatch[1], 10);

    const speedMatch = text.match(/speed=\s*([\d.]+)x/);
    if (speedMatch) {
      stat.speedFactor = parseFloat(speedMatch[1]);
      if (stat.speedFactor < 0.85) stat.health = 'poor';
      else if (stat.speedFactor < 0.96) stat.health = 'fair';
      else stat.health = 'good';
    }

    if (stat.isStreaming) {
      stat.uptimeSec = Math.round((Date.now() - stat.startTime) / 1000);
    }
  }

  /**
   * Stops a single destination process.
   */
  async _stopDestination(id) {
    if (this._workers && this._workers.has(id)) {
      const worker = this._workers.get(id);
      this._workers.delete(id);
      if (this._multiProcesses) this._multiProcesses.delete(id);
      if (this._multiConfig) this._multiConfig.delete(id);
      if (this._multiReconnect) this._multiReconnect.set(id, 99); // prevent reconnect
      try {
        await worker.stop();
      } catch (_) {}
      return;
    }
    const proc = this._multiProcesses ? this._multiProcesses.get(id) : null;
    if (this._multiProcesses) this._multiProcesses.delete(id);
    if (this._multiConfig) this._multiConfig.delete(id);
    if (this._multiReconnect) this._multiReconnect.set(id, 99); // prevent reconnect
    if (!proc || proc.exitCode !== null) return;

    return new Promise((resolve) => {
      const timer = setTimeout(() => { try { proc.kill('SIGTERM'); } catch (_) {} resolve(); }, 2000);
      proc.once('exit', () => {
        clearTimeout(timer);
        const s = this._multiStats ? this._multiStats.get(id) : null;
        if (s) { s.isStreaming = false; s.health = 'offline'; }
        resolve();
      });
      try {
        if (proc.stdin) proc.stdin.end();
        if (proc.stdio && proc.stdio[3]) proc.stdio[3].end();
      } catch (_) {
        try { proc.kill('SIGTERM'); } catch (_) {}
        resolve();
      }
    });
  }

  /**
   * Stops all active multi-destination streams cleanly.
   *
   * @returns {Promise<{ ok: boolean, stopped: number }>}
   */
  async stopAll() {
    this._isIntentionalStop = true;
    const workerPromises = [];
    if (this._workers && this._workers.size > 0) {
      for (const worker of this._workers.values()) {
        workerPromises.push(worker.stop());
      }
      this._workers.clear();
    }
    const ids = this._multiProcesses ? [...this._multiProcesses.keys()] : [];
    const procPromises = ids.map(id => this._stopDestination(id));
    await Promise.all([...workerPromises, ...procPromises]);
    this._isIntentionalStop = false;
    const count = Math.max(workerPromises.length, ids.length);
    console.log(`[BroadcastSupervisor] All ${count} destinations stopped.`);
    return { ok: true, stopped: count };
  }

  /**
   * Writes a composite video frame to ALL active destination workers/processes.
   * Leverages bounded backpressure: drops stale frames per destination to prevent heap bloat.
   *
   * @param {Buffer} buffer - Raw RGBA frame
   * @returns {number} Number of destinations that received the frame
   */
  writeVideoFrameAll(buffer) {
    if (this._workers && this._workers.size > 0) {
      let count = 0;
      for (const worker of this._workers.values()) {
        try {
          if (worker.writeVideoFrame && worker.writeVideoFrame(buffer)) count++;
        } catch (_) {}
      }
      return count;
    }
    if (!this._multiProcesses || this._multiProcesses.size === 0) {
      // Fall back to single-destination write for backward compat
      return this.writeVideoFrame(buffer) ? 1 : 0;
    }
    let count = 0;
    for (const [id, proc] of this._multiProcesses) {
      if (proc && proc.stdin && !proc.killed) {
        try {
          proc.stdin.write(buffer);
          count++;
        } catch (_) {}
      }
    }
    return count;
  }

  /**
   * Writes mixed broadcast audio PCM to ALL active destination workers/processes.
   *
   * @param {Buffer} buffer - Raw PCM s16le audio
   * @returns {number} Number of destinations that received the chunk
   */
  writeAudioChunkAll(buffer) {
    if (this._workers && this._workers.size > 0) {
      let count = 0;
      for (const worker of this._workers.values()) {
        try {
          const fn = worker.writeAudioChunk || worker.writeAudioFrame;
          if (fn && fn.call(worker, buffer)) count++;
        } catch (_) {}
      }
      return count;
    }
    if (!this._multiProcesses || this._multiProcesses.size === 0) {
      // Fall back to single-destination write for backward compat
      return this.writeAudioChunk(buffer) ? 1 : 0;
    }
    let count = 0;
    for (const [id, proc] of this._multiProcesses) {
      if (proc && proc.stdio && proc.stdio[3] && !proc.killed) {
        try {
          proc.stdio[3].write(buffer);
          count++;
        } catch (_) {}
      }
    }
    return count;
  }

  /**
   * Returns per-destination telemetry for all active multi-stream destinations.
   * Strict invariant: Never returns LIVE with fps=0 or bitrate=0.
   *
   * @returns {Object<id, {isStreaming, state, health, fps, bitrateKbps, uptimeSec, droppedFrames, framesSent}>}
   */
  getMultiStatus() {
    if (this._workers && this._workers.size > 0) {
      const result = {};
      for (const [id, worker] of this._workers) {
        result[id] = worker.getStatus();
      }
      return result;
    }
    if (!this._multiStats || this._multiStats.size === 0) return {};
    const result = {};
    for (const [id, stat] of this._multiStats) {
      const isTransmitting = (stat.state === BROADCAST_STATES.TRANSMITTING || stat.state === BROADCAST_STATES.LIVE) &&
                             (stat.framesSent > 0 || stat.encodedFrames > 0) &&
                             (stat.fps > 0) && (stat.bitrateKbps > 0);
      result[id] = {
        isStreaming:   stat.isStreaming || false,
        state:         stat.state || BROADCAST_STATES.IDLE,
        health:        stat.health || 'offline',
        fps:           isTransmitting ? stat.fps : null,
        bitrateKbps:   isTransmitting ? stat.bitrateKbps : null,
        uptimeSec:     stat.uptimeSec || 0,
        droppedFrames: stat.droppedFrames || 0,
        framesSent:    stat.framesSent || 0,
        reconnects:    stat.reconnects || 0,
      };
    }
    return result;
  }

  /**
   * Returns true if any multi-destination stream is currently active.
   */
  isAnyStreaming() {
    if (this._workers && this._workers.size > 0) {
      for (const worker of this._workers.values()) {
        if (worker.getStatus().isStreaming) return true;
      }
    }
    if (this._multiStats) {
      for (const stat of this._multiStats.values()) {
        if (stat.isStreaming) return true;
      }
    }
    return this.isStreaming;
  }
}

const broadcastSupervisor = new BroadcastSupervisor();

module.exports = {
  BroadcastSupervisor,
  broadcastSupervisor,
  BROADCAST_STATES,
  DestinationWorker,
  DESTINATION_STATES,
};
