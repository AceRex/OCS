/**
 * OCS Destination Worker — Architecture Closure (Stage 9.3)
 *
 * Implements an isolated, destination-agnostic streaming adapter.
 * Each destination (YouTube, Facebook, Twitch, TikTok, Instagram, Mixlr, Custom RTMP/SRT)
 * is managed by its own independent DestinationWorker instance.
 *
 * Key Invariants:
 * 1. Bounded Backpressure: HighWaterMark monitored. If a destination is slow, stale frames
 *    are dropped locally rather than buffering in Node heap (prevents 110 MB/s heap bloat).
 * 2. True Destination Isolation: Failure, backpressure, or reconnect of one worker NEVER
 *    blocks, starves, or affects other destination workers.
 * 3. Truthful Telemetry: Differentiates inputFrames, encodedFrames, outputBytes, fps, bitrate.
 * 4. Structural Prohibition: LIVE with FPS = 0 or Bitrate = 0 is impossible.
 * 5. Active Output Watchdog: Revokes LIVE to DEGRADED if media stalls for > 4.0s.
 */

const { spawn } = require('child_process');

const DESTINATION_STATES = {
  IDLE:         'IDLE',
  STARTING:     'STARTING',
  CONNECTING:   'CONNECTING',
  ENCODING:     'ENCODING',
  TRANSMITTING: 'TRANSMITTING',
  LIVE:         'LIVE',
  DEGRADED:     'DEGRADED',
  RECONNECTING: 'RECONNECTING',
  FAILED:       'FAILED',
  STOPPING:     'STOPPING',
  STOPPED:      'STOPPED',
};

// Sustained media transmission required before declaring LIVE (in ms)
const LIVE_SUSTAIN_MS = 3000;

// If confirmed output stalls for this long while LIVE/TRANSMITTING, downgrade to DEGRADED
const STALE_MEDIA_TIMEOUT_MS = 4000;

// If output is completely stalled for this long, trigger automatic reconnection
const STALL_RECONNECT_TIMEOUT_MS = 10000;

class DestinationWorker {
  /**
   * @param {Object} config
   * @param {string} config.id - Unique destination identifier (e.g. 'dest-yt', 'dest-fb')
   * @param {string} config.label - Human-readable label (e.g. 'YouTube Live')
   * @param {string} config.streamUrl - Target RTMP, RTMPS, or SRT URL
   * @param {number} [config.videoBitrateKbps=4500] - Video target bitrate
   * @param {number} [config.audioBitrateKbps=192] - Audio target bitrate
   * @param {number} [config.width=1280] - Video frame width
   * @param {number} [config.height=720] - Video frame height
   * @param {number} [config.fps=30] - Video framerate
   * @param {boolean} [config.withAudio=true] - Whether audio pipe is enabled
   * @param {string} [config.ffmpegBin] - Path to FFmpeg executable
   * @param {string} [config.encoder] - Video encoder name
   */
  constructor(config) {
    this.id = config.id;
    this.label = config.label || config.id;
    this.config = { ...config };
    this.state = DESTINATION_STATES.IDLE;

    this.proc = null;
    this.isBackpressured = false;
    this.isIntentionalStop = false;

    // Retry and lifecycle timers
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this._reconnectTimer = null;
    this._connectTimeoutTimer = null;
    this._watchdogInterval = null;
    this._transmittingStartTime = null;

    // Independent telemetry
    this.telemetry = {
      state: DESTINATION_STATES.IDLE,
      health: 'offline',
      uptimeSec: 0,
      inputFrames: 0,
      inputBytes: 0,
      encodedFrames: 0,
      outputBytes: 0,
      fps: null,
      bitrateKbps: null,
      droppedFrames: 0,
      duplicatedFrames: 0,
      reconnectCount: 0,
      lastFrameAt: null,
      lastOutputAt: null,
      backpressureEvents: 0,
      ffmpegPid: null,
      ffmpegExitCode: null,
      transportConnected: false,
      transportError: null,
    };

    this._startTime = null;
  }

  /**
   * Sanitizes streaming endpoint to redact stream keys.
   */
  getSanitizedUrl() {
    const url = this.config.streamUrl;
    if (!url || typeof url !== 'string') return '';
    try {
      let s = url.replace(/([?&]passphrase=)([^&]+)/gi, '$1[REDACTED]');
      if (s.startsWith('rtmp://') || s.startsWith('rtmps://')) {
        const parts = s.split('/');
        if (parts.length > 4) {
          const appPart = parts.slice(0, 4).join('/');
          return `${appPart}/[REDACTED]`;
        }
      }
      return s;
    } catch (_) {
      return '[REDACTED_URL]';
    }
  }

  /**
   * Spawns the FFmpeg worker process.
   */
  start() {
    if (this.state === DESTINATION_STATES.TRANSMITTING || this.state === DESTINATION_STATES.LIVE) {
      return Promise.resolve({ ok: true, state: this.state });
    }

    this.isIntentionalStop = false;
    this.state = DESTINATION_STATES.STARTING;
    this.telemetry.state = this.state;
    this.telemetry.health = 'connecting';

    return new Promise((resolve, reject) => {
      const c = this.config;
      const ffmpegBin = c.ffmpegBin || 'ffmpeg';
      const encoder = c.encoder || 'h264_videotoolbox';
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

      if (c.withAudio !== false) {
        args.push(
          '-f', 's16le',
          '-ar', String(c.sampleRate || 48000),
          '-ac', String(c.channels || 2),
          '-i', 'pipe:3'
        );
      }

      args.push('-c:v', encoder);
      if (encoder === 'libx264') {
        args.push(
          '-preset', 'veryfast',
          '-tune', 'zerolatency',
          '-b:v', `${c.videoBitrateKbps || 4500}k`,
          '-maxrate', `${c.videoBitrateKbps || 4500}k`,
          '-bufsize', `${(c.videoBitrateKbps || 4500) * 2}k`,
          '-profile:v', 'main'
        );
      } else if (encoder === 'h264_videotoolbox') {
        args.push(
          '-b:v', `${c.videoBitrateKbps || 4500}k`,
          '-maxrate', `${c.videoBitrateKbps || 4500}k`,
          '-realtime', '1'
        );
      } else if (encoder === 'h264_nvenc') {
        args.push(
          '-preset', 'p3',
          '-b:v', `${c.videoBitrateKbps || 4500}k`,
          '-maxrate', `${c.videoBitrateKbps || 4500}k`,
          '-bufsize', `${(c.videoBitrateKbps || 4500) * 2}k`
        );
      }

      args.push(
        '-g', String(gopSize),
        '-keyint_min', String(gopSize),
        '-pix_fmt', 'yuv420p'
      );

      if (c.withAudio !== false) {
        args.push(
          '-c:a', 'aac',
          '-b:a', `${c.audioBitrateKbps || 192}k`,
          '-ar', String(c.sampleRate || 48000)
        );
      }

      if (!isMpegTs) {
        args.push('-flvflags', 'no_duration_filesize');
      }

      args.push('-flush_packets', '1', '-f', format, c.streamUrl);

      try {
        const stdio = c.withAudio !== false
          ? ['pipe', 'ignore', 'pipe', 'pipe']
          : ['pipe', 'ignore', 'pipe'];

        this.state = DESTINATION_STATES.CONNECTING;
        this.telemetry.state = this.state;
        this.proc = spawn(ffmpegBin, args, { stdio });
        this.telemetry.ffmpegPid = this.proc.pid;
        this._startTime = Date.now();

        console.log(`[DestinationWorker/${this.id}] Spawned (PID ${this.proc.pid}) → ${this.getSanitizedUrl()}`);

        // Set dynamic highWaterMark on stdin to accommodate full frame boundaries
        if (this.proc.stdin && this.proc.stdin._writableState) {
          const expectedFrameBytes = (c.width || 1280) * (c.height || 720) * 4;
          this.proc.stdin._writableState.highWaterMark = Math.max(16 * 1024 * 1024, expectedFrameBytes * 2);
        }

        // Prime input pipes with initial frame so FFmpeg connects output socket immediately
        try {
          const blankFrame = Buffer.alloc(c.width * c.height * 4);
          this.proc.stdin.write(blankFrame);
          if (c.withAudio !== false && this.proc.stdio && this.proc.stdio[3]) {
            const blankAudio = Buffer.alloc(Math.floor(((c.sampleRate || 48000) / (c.fps || 30)) * (c.channels || 2) * 2));
            this.proc.stdio[3].write(blankAudio);
          }
        } catch (_) {}

        // Setup backpressure drain listener
        this.proc.stdin.on('drain', () => {
          this.isBackpressured = false;
        });

        this.proc.stdin.on('error', (err) => {
          if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return;
          console.error(`[DestinationWorker/${this.id}] Stdin error:`, err.message);
        });

        if (c.withAudio !== false && this.proc.stdio && this.proc.stdio[3]) {
          this.proc.stdio[3].on('error', (err) => {
            if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return;
          });
        }

        let resolved = false;

        // Connection timeout: 20s
        this._connectTimeoutTimer = setTimeout(() => {
          if (!resolved) {
            console.error(`[DestinationWorker/${this.id}] Connection timeout (20s) — marking FAILED`);
            this.state = DESTINATION_STATES.FAILED;
            this.telemetry.state = this.state;
            this.telemetry.health = 'offline';
            resolved = true;
            reject(new Error(`[${this.id}] Connection timeout`));
          }
        }, 20000);

        // Fast spawn resolution once process is alive
        const spawnTimer = setTimeout(() => {
          if (!resolved && this.proc) {
            resolved = true;
            resolve({ ok: true, state: this.state });
          }
        }, 300);

        this.proc.stderr.on('data', (data) => {
          const text = data.toString();
          if (process.env.DEBUG_BROADCAST) console.log(`[FFmpeg/${this.id}]`, text.trim());
          this._parseStderr(text);

          if (this.telemetry.encodedFrames > 0 && !resolved) {
            clearTimeout(spawnTimer);
            clearTimeout(this._connectTimeoutTimer);
            resolved = true;
            resolve({ ok: true, state: this.state });
          }
        });

        this.proc.on('exit', (code, signal) => {
          clearTimeout(spawnTimer);
          clearTimeout(this._connectTimeoutTimer);
          this._clearIntervals();

          this.telemetry.ffmpegExitCode = code;
          this.proc = null;
          this.isBackpressured = false;

          console.warn(`[DestinationWorker/${this.id}] FFmpeg exited (code=${code}, signal=${signal})`);

          if (this.isIntentionalStop) {
            this.state = DESTINATION_STATES.STOPPED;
            this.telemetry.state = this.state;
            this.telemetry.health = 'offline';
            if (!resolved) resolve({ ok: true, stopped: true });
          } else {
            this._handleUnexpectedExit(code);
            if (!resolved) {
              resolved = true;
              reject(new Error(`[${this.id}] FFmpeg exited prematurely (code=${code})`));
            }
          }
        });

        this.proc.on('error', (err) => {
          clearTimeout(this._connectTimeoutTimer);
          console.error(`[DestinationWorker/${this.id}] Process error:`, err.message);
          this.state = DESTINATION_STATES.FAILED;
          this.telemetry.state = this.state;
          this.telemetry.transportError = err.message;
          if (!resolved) { resolved = true; reject(err); }
        });

        // Start active health & watchdog auditor (every 1000ms)
        this._startWatchdog();

      } catch (err) {
        this.state = DESTINATION_STATES.FAILED;
        this.telemetry.state = this.state;
        reject(err);
      }
    });
  }

  /**
   * Parses stderr lines from FFmpeg.
   */
  _parseStderr(text) {
    // 1. Parse encoded frames (must be strictly positive integer)
    const frameMatch = text.match(/frame=\s*(\d+)/);
    if (frameMatch) {
      const frames = parseInt(frameMatch[1], 10);
      if (frames > 0) {
        this.telemetry.encodedFrames = frames;
        clearTimeout(this._connectTimeoutTimer);
      }
    }

    // 2. Parse encoding FPS
    const fpsMatch = text.match(/fps=\s*([\d.]+)/);
    if (fpsMatch) {
      this.telemetry.fps = parseFloat(fpsMatch[1]);
    }

    // 3. Parse output size / bytes
    const sizeMatch = text.match(/size=\s*(\d+)\s*(kB|KiB|mB|MiB|B)?/i);
    if (sizeMatch) {
      const val = parseInt(sizeMatch[1], 10);
      const unit = (sizeMatch[2] || 'kB').toLowerCase();
      let bytes = val;
      if (unit.startsWith('m')) bytes = val * 1024 * 1024;
      else if (unit.startsWith('k')) bytes = val * 1024;
      if (bytes > this.telemetry.outputBytes) {
        this.telemetry.outputBytes = bytes;
      }
    }

    // 4. Parse transmission bitrate
    const bitrateMatch = text.match(/bitrate=\s*([\d.]+)kbits\/s/);
    if (bitrateMatch) {
      const br = parseFloat(bitrateMatch[1]);
      if (br > 0) this.telemetry.bitrateKbps = br;
    }

    // 5. Parse dropped frames reported by encoder
    const dropMatch = text.match(/drop=\s*(\d+)/);
    if (dropMatch) {
      this.telemetry.duplicatedFrames = parseInt(dropMatch[1], 10);
    }

    // 6. Forward progress check: If frames and bytes advanced with positive metrics
    const hasMediaProgress = this.telemetry.encodedFrames > 0 &&
                             this.telemetry.fps > 0 &&
                             this.telemetry.bitrateKbps > 0;

    if (hasMediaProgress) {
      this.telemetry.lastOutputAt = Date.now();
      this.telemetry.transportConnected = true;
      this.telemetry.health = 'good';

      // State progression: CONNECTING -> ENCODING -> TRANSMITTING
      if (this.state === DESTINATION_STATES.CONNECTING || this.state === DESTINATION_STATES.STARTING) {
        this.state = DESTINATION_STATES.ENCODING;
        this.telemetry.state = this.state;
      }

      if (this.state === DESTINATION_STATES.ENCODING || this.state === DESTINATION_STATES.DEGRADED) {
        this.state = DESTINATION_STATES.TRANSMITTING;
        this.telemetry.state = this.state;
        this._transmittingStartTime = Date.now();
      }

      // Promote to LIVE after sustaining TRANSMITTING with continuous positive media
      if (this.state === DESTINATION_STATES.TRANSMITTING && this._transmittingStartTime) {
        if (Date.now() - this._transmittingStartTime >= LIVE_SUSTAIN_MS) {
          this.state = DESTINATION_STATES.LIVE;
          this.telemetry.state = this.state;
        }
      }
    }
  }

  /**
   * Active Watchdog: Audits stream health, revokes false LIVE, detects stalls.
   */
  _startWatchdog() {
    if (this._watchdogInterval) clearInterval(this._watchdogInterval);
    this._watchdogInterval = setInterval(() => {
      this._auditHealth();
    }, 1000);
  }

  _auditHealth() {
    if (!this.proc || this.isIntentionalStop) return;

    if (this._startTime) {
      this.telemetry.uptimeSec = Math.round((Date.now() - this._startTime) / 1000);
    }

    const isStreamingState = this.state === DESTINATION_STATES.LIVE ||
                             this.state === DESTINATION_STATES.TRANSMITTING ||
                             this.state === DESTINATION_STATES.DEGRADED;

    if (!isStreamingState) return;

    const timeSinceLastOutput = this.telemetry.lastOutputAt
      ? Date.now() - this.telemetry.lastOutputAt
      : Date.now() - this._startTime;

    // Check 1: Output Stale (> 4000ms) -> REVOKE LIVE to DEGRADED
    if (timeSinceLastOutput >= STALE_MEDIA_TIMEOUT_MS) {
      if (this.state === DESTINATION_STATES.LIVE) {
        console.warn(`[DestinationWorker/${this.id}] Media output stalled (${timeSinceLastOutput}ms) — REVOKING LIVE to DEGRADED`);
        this.state = DESTINATION_STATES.DEGRADED;
        this.telemetry.state = this.state;
      }
      this.telemetry.health = 'poor';
      this.telemetry.fps = null;
      this.telemetry.bitrateKbps = null;
    }

    // Check 2: Total Stalled Transport (> 10000ms) -> Trigger Reconnect
    if (timeSinceLastOutput >= STALL_RECONNECT_TIMEOUT_MS && !this.isIntentionalStop) {
      console.error(`[DestinationWorker/${this.id}] Transport completely stalled (${timeSinceLastOutput}ms) — triggering auto-reconnect`);
      try {
        if (this.proc) this.proc.kill('SIGKILL');
      } catch (_) {}
    }
  }

  /**
   * Writes a raw composite video frame into FFmpeg stdin with bounded backpressure.
   *
   * @param {Buffer} buffer - Raw RGBA frame buffer
   * @returns {boolean} True if written, false if dropped due to backpressure
   */
  writeVideoFrame(buffer) {
    if (!this.proc || !this.proc.stdin || this.proc.killed) {
      return false;
    }

    const expectedFrameBytes = (this.config.width || 1280) * (this.config.height || 720) * 4;
    if (buffer.length !== expectedFrameBytes) {
      if (!this._hasLoggedFrameSizeMismatch) {
        console.warn(`[DestinationWorker/${this.id}] Frame size mismatch! Expected ${expectedFrameBytes} bytes (${this.config.width || 1280}x${this.config.height || 720} RGBA), but got ${buffer.length} bytes. Dropping frame to prevent rawvideo stream misalignment.`);
        this._hasLoggedFrameSizeMismatch = true;
      }
      this.telemetry.droppedFrames++;
      return false;
    }

    this.telemetry.inputFrames++;
    this.telemetry.inputBytes += buffer.length;
    this.telemetry.lastFrameAt = Date.now();

    // BOUNDED BACKPRESSURE INVARIANT:
    // If pipe is full, DROP stale frame immediately to prevent heap buffering and latency buildup.
    if (this.isBackpressured) {
      this.telemetry.droppedFrames++;
      this.telemetry.backpressureEvents++;
      return false;
    }

    try {
      const canAcceptMore = this.proc.stdin.write(buffer);
      if (!canAcceptMore) {
        this.isBackpressured = true;
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Writes mixed broadcast audio PCM chunk to FFmpeg audio pipe.
   *
   * @param {Buffer} buffer - Raw s16le PCM audio buffer
   * @returns {boolean}
   */
  writeAudioChunk(buffer) {
    if (!this.proc || !this.proc.stdio || !this.proc.stdio[3] || this.proc.killed) {
      return false;
    }
    try {
      return this.proc.stdio[3].write(buffer);
    } catch (_) {
      return false;
    }
  }

  /**
   * Alias for writeAudioChunk for compatibility.
   */
  writeAudioFrame(buffer) {
    return this.writeAudioChunk(buffer);
  }

  /**
   * Handles unexpected exits with isolated exponential backoff auto-reconnect.
   */
  _handleUnexpectedExit(code) {
    this.state = DESTINATION_STATES.STOPPED;
    this.telemetry.state = this.state;
    this.telemetry.health = 'offline';
    this.telemetry.fps = null;
    this.telemetry.bitrateKbps = null;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`[DestinationWorker/${this.id}] Max reconnects (${this.maxReconnectAttempts}) reached. Marking FAILED.`);
      this.state = DESTINATION_STATES.FAILED;
      this.telemetry.state = this.state;
      return;
    }

    this.reconnectAttempts++;
    this.telemetry.reconnectCount = this.reconnectAttempts;
    this.state = DESTINATION_STATES.RECONNECTING;
    this.telemetry.state = this.state;

    const backoffMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 16000);
    console.warn(`[DestinationWorker/${this.id}] Reconnecting in ${backoffMs}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    this._reconnectTimer = setTimeout(() => {
      if (!this.isIntentionalStop) {
        this.start().catch(err => {
          console.error(`[DestinationWorker/${this.id}] Reconnect failed:`, err.message);
        });
      }
    }, backoffMs);
  }

  /**
   * Stops the worker process cleanly.
   */
  async stop() {
    this.isIntentionalStop = true;
    this._clearIntervals();

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    this.state = DESTINATION_STATES.STOPPING;
    this.telemetry.state = this.state;

    if (!this.proc) {
      this.state = DESTINATION_STATES.STOPPED;
      this.telemetry.state = this.state;
      this.telemetry.health = 'offline';
      return { ok: true };
    }

    const proc = this.proc;
    return new Promise((resolve) => {
      const forceKillTimer = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch (_) {}
      }, 3000);

      proc.once('exit', () => {
        clearTimeout(forceKillTimer);
        this.proc = null;
        this.state = DESTINATION_STATES.STOPPED;
        this.telemetry.state = this.state;
        this.telemetry.health = 'offline';
        console.log(`[DestinationWorker/${this.id}] Stopped cleanly`);
        resolve({ ok: true });
      });

      try {
        if (proc.stdin) proc.stdin.end();
        if (proc.stdio && proc.stdio[3]) proc.stdio[3].end();
      } catch (_) {
        try { proc.kill('SIGTERM'); } catch (_) {}
      }
    });
  }

  _clearIntervals() {
    if (this._watchdogInterval) {
      clearInterval(this._watchdogInterval);
      this._watchdogInterval = null;
    }
  }

  /**
   * Returns current status with strict metric gating and null guarantees.
   */
  getStatus() {
    const isTransmitting = (this.state === DESTINATION_STATES.TRANSMITTING || this.state === DESTINATION_STATES.LIVE) &&
                           this.telemetry.encodedFrames > 0 &&
                           this.telemetry.fps > 0 &&
                           this.telemetry.bitrateKbps > 0;

    return {
      id: this.id,
      label: this.label,
      state: this.state,
      isStreaming: this.state === DESTINATION_STATES.LIVE || this.state === DESTINATION_STATES.TRANSMITTING || this.state === DESTINATION_STATES.DEGRADED,
      health: this.telemetry.health,
      uptimeSec: this.telemetry.uptimeSec,
      inputFrames: this.telemetry.inputFrames,
      inputBytes: this.telemetry.inputBytes,
      encodedFrames: this.telemetry.encodedFrames,
      outputBytes: this.telemetry.outputBytes,
      // Strict invariant: Metrics are strictly positive during LIVE/TRANSMITTING, otherwise null
      fps: isTransmitting ? this.telemetry.fps : null,
      bitrateKbps: isTransmitting ? this.telemetry.bitrateKbps : null,
      droppedFrames: this.telemetry.droppedFrames,
      backpressureEvents: this.telemetry.backpressureEvents,
      reconnects: this.telemetry.reconnectCount,
      sanitizedUrl: this.getSanitizedUrl(),
    };
  }
}

module.exports = {
  DestinationWorker,
  DESTINATION_STATES,
};
