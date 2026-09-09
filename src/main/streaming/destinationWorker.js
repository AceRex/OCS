/**
 * OCS Destination Worker — Architecture Closure & Live Stability (Stage 9.7)
 *
 * Implements an isolated, destination-agnostic streaming adapter with:
 * 1. Line-buffered FFmpeg stderr chunk reconstruction (handles split tokens across chunk boundaries and \r).
 * 2. Objective Monotonic Forward-Progress Tracking: Measures real frame/byte advancement rather than
 *    demanding simultaneous positive fps and bitrateKbps in every chunk.
 * 3. Conservative Watchdog: Distinguishes telemetry latency from actual transport stalls. Stalls trigger
 *    orderly auto-reconnects without killing healthy streaming on static frames.
 * 4. Single-Process Invariant & Zero-Orphan Guarantee: Ensures only ONE FFmpeg instance exists per destination.
 * 5. Bounded Backpressure & Frame-Age Telemetry: Zero stale queue backlog replayed after reconnect;
 *    atomic complete frame drops under backpressure.
 * 6. True Destination Isolation: Failure of one destination never starves or blocks others.
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

// If output is completely stalled for this long (zero frames and zero bytes advanced), trigger automatic reconnection
const STALL_RECONNECT_TIMEOUT_MS = 25000;

// Stage 9.9 Section 14 — Queue Policy Limits:
// Justification:
// 1 frame = 8,294,400 bytes at 1080p RGBA (30 FPS = ~248.8 MB/s uncompressed).
// Allowing stdin buffering of > 2 frames creates ~16.6 MB heap queue and >66ms input lag.
// A maximum staleness window of 250ms (≈7 frames) prevents old video replay under network backpressure.
const MAX_QUEUE_FRAMES = 1;
const MAX_QUEUE_BYTES = 8294400 * 2; // Up to 2 uncompressed frames
const MAX_FRAME_AGE_MS = 250; // Frames older than 250ms are considered stale and dropped to maintain current-frame priority

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

    // Stderr line-buffer & tail ring buffer for diagnostic forensics
    this._stderrBuffer = '';
    this._stderrTail = [];

    // Monotonic forward-progress counters
    this._lastEncodedFrames = 0;
    this._lastOutputBytes = 0;
    this._lastMonotonicProgressAt = null;

    // Concurrency guard
    this._isSpawning = false;

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
      speedFactor: 1.0,
      droppedFrames: 0,
      duplicatedFrames: 0,
      reconnectCount: 0,
      lastFrameAt: null,
      lastOutputAt: null,
      backpressureEvents: 0,
      ffmpegPid: null,
      ffmpegExitCode: null,
      lastExitCode: null,
      lastExitSignal: null,
      lastReconnectReason: null,
      lastFFmpegError: null,
      processStartTime: null,
      processExitTime: null,
      transportConnected: false,
      transportError: null,
      currentFrameAgeMs: 0,
      maxFrameAgeMs: 0,
      avgFrameAgeMs: 0,
      queueFrames: 0,
      queueBytes: 0,
      oldestFrameAgeMs: 0,
      newestFrameAgeMs: 0,
      // Stage 9.9 Section 19 Latency Telemetry Contract
      frameCaptureAt: null,
      frameQueuedAt: null,
      frameWrittenAt: null,
      frameAgeMs: 0,
      queueDelayMs: 0,
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
   * Spawns the FFmpeg worker process with single-process guarantee.
   */
  async start() {
    if (this.state === DESTINATION_STATES.TRANSMITTING || this.state === DESTINATION_STATES.LIVE) {
      return { ok: true, state: this.state };
    }

    // SINGLE PROCESS INVARIANT: Ensure any prior process is completely terminated before spawning new one
    if (this.proc) {
      console.warn(`[DestinationWorker/${this.id}] Lingering FFmpeg (PID ${this.proc.pid}) detected before start. Terminating cleanly.`);
      await this._killProcessCleanly(this.proc);
      this.proc = null;
    }

    this.isIntentionalStop = false;
    this.state = DESTINATION_STATES.STARTING;
    this.telemetry.state = this.state;
    this.telemetry.health = 'connecting';

    return new Promise((resolve, reject) => {
      const c = this.config;
      const ffmpegBin = c.ffmpegBin || 'ffmpeg';
      const encoder = c.encoder || 'h264_videotoolbox';
      const width = c.width || 1280;
      const height = c.height || 720;
      const fps = c.fps || 30;
      const gopSize = fps * 2;
      const isMpegTs = c.streamUrl.startsWith('srt://') || c.streamUrl.startsWith('tcp://') || c.streamUrl.startsWith('udp://');
      const format = isMpegTs ? 'mpegts' : 'flv';

      const args = [
        '-y',
        '-f', 'rawvideo', '-pix_fmt', 'rgba',
        '-s', `${width}x${height}`,
        '-r', `${fps}`,
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

      // Network transport resilience
      if (c.streamUrl.startsWith('rtmp://') || c.streamUrl.startsWith('rtmps://')) {
        args.push('-tcp_nodelay', '1');
      }
      args.push('-max_interleave_delta', '1000000');
      args.push('-rw_timeout', '15000000'); // 15s socket timeout
      args.push('-flush_packets', '1', '-f', format, c.streamUrl);

      try {
        const stdio = c.withAudio !== false
          ? ['pipe', 'ignore', 'pipe', 'pipe']
          : ['pipe', 'ignore', 'pipe'];

        this.state = DESTINATION_STATES.CONNECTING;
        this.telemetry.state = this.state;
        this.proc = spawn(ffmpegBin, args, { stdio });
        this.telemetry.ffmpegPid = this.proc.pid;
        this.telemetry.processStartTime = Date.now();
        this.telemetry.processExitTime = null;
        this._startTime = Date.now();
        this._lastMonotonicProgressAt = Date.now();
        this._stderrBuffer = '';

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
          this.telemetry.queueFrames = 0;
          this.telemetry.queueBytes = 0;
          this.telemetry.oldestFrameAgeMs = 0;
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
          this._handleStderrData(text);

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
          this.telemetry.lastExitCode = code;
          this.telemetry.lastExitSignal = signal;
          this.telemetry.processExitTime = Date.now();
          if (this._stderrTail.length > 0) {
            this.telemetry.lastFFmpegError = this._stderrTail.slice(-1)[0];
          }
          this.proc = null;
          this.isBackpressured = false;

          const stderrTailMsg = this._stderrTail.length > 0
            ? `\n  Last FFmpeg output:\n  ` + this._stderrTail.slice(-5).join('\n  ')
            : '';
          console.warn(`[DestinationWorker/${this.id}] FFmpeg exited (code=${code}, signal=${signal})${stderrTailMsg}`);

          if (this.isIntentionalStop) {
            this.state = DESTINATION_STATES.STOPPED;
            this.telemetry.state = this.state;
            this.telemetry.health = 'offline';
            if (!resolved) resolve({ ok: true, stopped: true });
          } else {
            if (!this.telemetry.lastReconnectReason) {
              this.telemetry.lastReconnectReason = `process_exit (code=${code}, signal=${signal})`;
            }
            this._handleUnexpectedExit(code, signal);
            if (!resolved) {
              resolved = true;
              reject(new Error(`[${this.id}] FFmpeg exited prematurely (code=${code}, signal=${signal})`));
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
   * Reconstructs stderr chunks into complete lines across buffer boundaries and carriage returns.
   */
  _handleStderrData(text) {
    this._stderrBuffer += text;

    // Split on \r or \n to handle FFmpeg carriage-return progress lines & chunk boundaries
    const lines = this._stderrBuffer.split(/[\r\n]+/);
    // Retain the unclosed trailing slice
    this._stderrBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Keep ring buffer of last 40 lines for forensic analysis
      this._stderrTail.push(trimmed);
      if (this._stderrTail.length > 40) this._stderrTail.shift();

      if (process.env.DEBUG_BROADCAST) console.log(`[FFmpeg/${this.id}]`, trimmed);
      this._parseStderrLine(trimmed);
    }
  }

  /**
   * Parses a complete reconstructed stderr line from FFmpeg.
   */
  _parseStderrLine(line) {
    // 1. Encoded frames (strictly positive integer)
    const frameMatch = line.match(/frame=\s*(\d+)/);
    if (frameMatch) {
      const frames = parseInt(frameMatch[1], 10);
      if (frames > 0) {
        this.telemetry.encodedFrames = frames;
        clearTimeout(this._connectTimeoutTimer);
      }
    }

    // 2. Encoding FPS
    const fpsMatch = line.match(/fps=\s*([\d.]+)/);
    if (fpsMatch) {
      const fps = parseFloat(fpsMatch[1]);
      if (fps > 0) this.telemetry.fps = fps;
    }

    // 3. Output size / bytes
    const sizeMatch = line.match(/size=\s*(\d+)\s*(kB|KiB|mB|MiB|B)?/i);
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

    // 4. Transmission bitrate
    const bitrateMatch = line.match(/bitrate=\s*([\d.]+)kbits\/s/);
    if (bitrateMatch) {
      const br = parseFloat(bitrateMatch[1]);
      if (br > 0) this.telemetry.bitrateKbps = br;
    }

    // 5. Dropped / duplicated frames
    const dropMatch = line.match(/drop=\s*(\d+)/);
    if (dropMatch) {
      this.telemetry.duplicatedFrames = parseInt(dropMatch[1], 10);
    }

    // 6. Encoding speed factor (e.g. speed=1.05x)
    const speedMatch = line.match(/speed=\s*([\d.]+)x/);
    if (speedMatch) {
      this.telemetry.speedFactor = parseFloat(speedMatch[1]);
    }

    // 7. OBJECTIVE MONOTONIC FORWARD-PROGRESS CHECK
    // Measured by actual frame advancement OR output byte advancement.
    // Does NOT require fps and bitrateKbps to appear together in every chunk!
    const frameAdvanced = this.telemetry.encodedFrames > this._lastEncodedFrames;
    const byteAdvanced = this.telemetry.outputBytes > this._lastOutputBytes;

    if (frameAdvanced || byteAdvanced) {
      if (frameAdvanced) this._lastEncodedFrames = this.telemetry.encodedFrames;
      if (byteAdvanced) this._lastOutputBytes = this.telemetry.outputBytes;

      this._lastMonotonicProgressAt = Date.now();
      this.telemetry.lastOutputAt = Date.now();
      this.telemetry.transportConnected = true;
      this.telemetry.health = 'good';

      // State progression: CONNECTING -> ENCODING
      if (this.state === DESTINATION_STATES.CONNECTING || this.state === DESTINATION_STATES.STARTING) {
        this.state = DESTINATION_STATES.ENCODING;
        this.telemetry.state = this.state;
      }

      // ENCODING / DEGRADED -> TRANSMITTING
      if (this.state === DESTINATION_STATES.ENCODING || this.state === DESTINATION_STATES.DEGRADED) {
        this.state = DESTINATION_STATES.TRANSMITTING;
        this.telemetry.state = this.state;
        if (!this._transmittingStartTime) this._transmittingStartTime = Date.now();
      }

      // Promote to LIVE after sustaining TRANSMITTING
      if (this.state === DESTINATION_STATES.TRANSMITTING && this._transmittingStartTime) {
        if (Date.now() - this._transmittingStartTime >= LIVE_SUSTAIN_MS) {
          this.state = DESTINATION_STATES.LIVE;
          this.telemetry.state = this.state;
        }
      }
    }
  }

  /**
   * Backwards-compatible parser entry point for tests.
   */
  _parseStderr(text) {
    this._handleStderrData(text);
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

    const lastProgress = this.telemetry.lastOutputAt || this._lastMonotonicProgressAt || this._startTime;
    const timeSinceLastProgress = Date.now() - lastProgress;

    // Check 1: Output Stale (>= 4000ms) -> REVOKE LIVE to DEGRADED
    if (timeSinceLastProgress >= STALE_MEDIA_TIMEOUT_MS) {
      if (this.state === DESTINATION_STATES.LIVE) {
        console.warn(`[DestinationWorker/${this.id}] Media output stalled (${timeSinceLastProgress}ms) — REVOKING LIVE to DEGRADED`);
        this.state = DESTINATION_STATES.DEGRADED;
        this.telemetry.state = this.state;
      }
      this.telemetry.health = 'poor';
      this.telemetry.fps = null;
      this.telemetry.bitrateKbps = null;
    }

    // Check 2: Total Stalled Transport (> 25000ms) -> Controlled Auto-Reconnect
    // Only triggers if ZERO frames and ZERO bytes advanced for 25 seconds!
    if (timeSinceLastProgress >= STALL_RECONNECT_TIMEOUT_MS && !this.isIntentionalStop) {
      console.error(`[DestinationWorker/${this.id}] Transport completely stalled (${timeSinceLastProgress}ms with zero frame/byte advance) — triggering auto-reconnect`);
      this._triggerWatchdogReconnect();
    }
  }

  _triggerWatchdogReconnect() {
    if (!this.proc || this.isIntentionalStop) return;
    const proc = this.proc;
    const timeSinceLastProgress = Date.now() - (this.telemetry.lastOutputAt || this._lastMonotonicProgressAt || this._startTime || Date.now());
    this.telemetry.lastReconnectReason = `watchdog_stall (zero frame/byte advance for ${timeSinceLastProgress}ms)`;
    try {
      proc.kill('SIGTERM');
      setTimeout(() => {
        try {
          if (proc && !proc.killed) proc.kill('SIGKILL');
        } catch (_) {}
      }, 3000);
    } catch (_) {
      try { proc.kill('SIGKILL'); } catch (_) {}
    }
  }

  /**
   * Writes a raw composite video frame into FFmpeg stdin with bounded backpressure.
   *
   * @param {Buffer} buffer - Raw RGBA frame buffer
   * @param {Object} [metadata] - Optional frame metadata { captureTimestamp, sequence }
   * @returns {boolean} True if written, false if dropped due to backpressure
   */
  writeVideoFrame(buffer, metadata = {}) {
    if (!this.proc || !this.proc.stdin || this.proc.killed) {
      this.telemetry.droppedFrames++;
      this.telemetry.queueFrames = 0;
      this.telemetry.queueBytes = 0;
      this.telemetry.oldestFrameAgeMs = 0;
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

    // Frame Age Telemetry Calculation (Stage 9.9 Section 19)
    const now = Date.now();
    const captureTimestamp = metadata.captureTimestamp || now;
    const queuedTimestamp = metadata.queuedTimestamp || now;
    const frameAgeMs = Math.max(0, now - captureTimestamp);
    const queueDelayMs = Math.max(0, now - queuedTimestamp);

    this.telemetry.inputFrames++;
    this.telemetry.inputBytes += buffer.length;
    this.telemetry.lastFrameAt = now;
    this.telemetry.currentFrameAgeMs = frameAgeMs;
    this.telemetry.maxFrameAgeMs = Math.max(this.telemetry.maxFrameAgeMs || 0, frameAgeMs);
    this.telemetry.newestFrameAgeMs = frameAgeMs;

    // Stage 9.9 Section 19 Latency Telemetry
    this.telemetry.frameCaptureAt = captureTimestamp;
    this.telemetry.frameQueuedAt = queuedTimestamp;
    this.telemetry.frameWrittenAt = now;
    this.telemetry.frameAgeMs = frameAgeMs;
    this.telemetry.queueDelayMs = queueDelayMs;

    // Rolling average frame age
    const count = this.telemetry.inputFrames;
    this.telemetry.avgFrameAgeMs = Math.round(
      ((this.telemetry.avgFrameAgeMs * (count - 1)) + frameAgeMs) / count
    );

    // CURRENT-FRAME PRIORITY INVARIANT (Stage 9.9 Section 13 & 14):
    // If incoming frame is already stale (age > MAX_FRAME_AGE_MS), DROP IT immediately
    // rather than queueing old frames, preserving freshness and avoiding replay of past minutes.
    if (frameAgeMs > MAX_FRAME_AGE_MS) {
      this.telemetry.droppedFrames++;
      this.telemetry.queueFrames = 0;
      this.telemetry.queueBytes = 0;
      this.telemetry.oldestFrameAgeMs = frameAgeMs;
      return false;
    }

    // BOUNDED BACKPRESSURE INVARIANT (Stage 9.9 Section 11 & 12):
    // If pipe is full, DROP stale complete frame immediately to prevent heap buffering and latency buildup.
    // Atomically drops exactly ONE full frame (8,294,400 bytes); NEVER slices arbitrary rawvideo bytes.
    if (this.isBackpressured) {
      this.telemetry.droppedFrames++;
      this.telemetry.backpressureEvents++;
      this.telemetry.queueFrames = 1;
      this.telemetry.queueBytes = buffer.length;
      this.telemetry.oldestFrameAgeMs = frameAgeMs;
      return false;
    }

    this.telemetry.queueFrames = 0;
    this.telemetry.queueBytes = 0;
    this.telemetry.oldestFrameAgeMs = 0;

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
  _handleUnexpectedExit(code, signal) {
    this.state = DESTINATION_STATES.STOPPED;
    this.telemetry.state = this.state;
    this.telemetry.health = 'offline';
    this.telemetry.fps = null;
    this.telemetry.bitrateKbps = null;
    this.isBackpressured = false;
    this.telemetry.queueFrames = 0;
    this.telemetry.queueBytes = 0;
    this.telemetry.currentFrameAgeMs = 0;
    this.telemetry.oldestFrameAgeMs = 0;
    this.telemetry.newestFrameAgeMs = 0;
    this.telemetry.frameAgeMs = 0;
    this.telemetry.queueDelayMs = 0;

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
   * Cleanly kills a process with SIGTERM followed by SIGKILL if needed.
   */
  _killProcessCleanly(proc) {
    if (!proc || proc.killed) return Promise.resolve();
    return new Promise((resolve) => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };
      const forceKillTimer = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch (_) {}
        done();
      }, 3000);

      proc.once('exit', () => {
        clearTimeout(forceKillTimer);
        done();
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
      }, 8000);

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
    const isStreaming = this.state === DESTINATION_STATES.LIVE ||
                        this.state === DESTINATION_STATES.TRANSMITTING ||
                        this.state === DESTINATION_STATES.DEGRADED;

    const isTransmitting = (this.state === DESTINATION_STATES.TRANSMITTING || this.state === DESTINATION_STATES.LIVE) &&
                           this.telemetry.encodedFrames > 0;

    return {
      destinationId: this.id,
      id: this.id,
      label: this.label,
      state: this.state,
      isStreaming,
      health: this.telemetry.health,
      uptimeSec: this.telemetry.uptimeSec,
      inputFrames: this.telemetry.inputFrames,
      inputBytes: this.telemetry.inputBytes,
      encodedFrames: this.telemetry.encodedFrames,
      lastEncodedFrame: this.telemetry.encodedFrames,
      outputBytes: this.telemetry.outputBytes,
      lastOutputAt: this.telemetry.lastOutputAt,
      // Strict invariant: Metrics are reported when actively streaming, otherwise null
      fps: isTransmitting ? this.telemetry.fps : null,
      bitrateKbps: isTransmitting ? this.telemetry.bitrateKbps : null,
      speedFactor: isTransmitting ? this.telemetry.speedFactor : null,
      droppedFrames: this.telemetry.droppedFrames,
      duplicatedFrames: this.telemetry.duplicatedFrames,
      backpressureEvents: this.telemetry.backpressureEvents,
      reconnects: this.telemetry.reconnectCount,
      reconnectCount: this.telemetry.reconnectCount,
      sanitizedUrl: this.getSanitizedUrl(),
      // Frame Age & Queue Telemetry
      currentFrameAgeMs: this.telemetry.currentFrameAgeMs,
      maxFrameAgeMs: this.telemetry.maxFrameAgeMs,
      avgFrameAgeMs: this.telemetry.avgFrameAgeMs,
      queueFrames: this.telemetry.queueFrames,
      queueBytes: this.telemetry.queueBytes,
      oldestFrameAgeMs: this.telemetry.oldestFrameAgeMs,
      newestFrameAgeMs: this.telemetry.newestFrameAgeMs,
      // Stage 9.9 Section 19 Latency Telemetry
      frameCaptureAt: this.telemetry.frameCaptureAt,
      frameQueuedAt: this.telemetry.frameQueuedAt,
      frameWrittenAt: this.telemetry.frameWrittenAt,
      frameAgeMs: this.telemetry.frameAgeMs,
      queueDelayMs: this.telemetry.queueDelayMs,
      ffmpegPid: this.telemetry.ffmpegPid,
      processPid: this.telemetry.ffmpegPid,
      processStartTime: this.telemetry.processStartTime,
      processExitTime: this.telemetry.processExitTime,
      // Forensic lifecycle telemetry (Stage 9.8 Section 9)
      lastReconnectReason: this.telemetry.lastReconnectReason || null,
      lastExitCode: this.telemetry.lastExitCode ?? this.telemetry.ffmpegExitCode ?? null,
      lastExitSignal: this.telemetry.lastExitSignal || null,
      lastTransportError: this.telemetry.transportError || null,
      lastFFmpegError: this.telemetry.lastFFmpegError || (this._stderrTail.length > 0 ? this._stderrTail.slice(-1)[0] : null),
    };
  }
}

module.exports = {
  DestinationWorker,
  DESTINATION_STATES,
};
