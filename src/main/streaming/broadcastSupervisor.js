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

class BroadcastSupervisor {
  constructor() {
    this.ffmpegProcess = null;
    this.isStreaming = false;
    this.streamConfig = null;
    this.startTime = 0;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this._reconnectTimer = null;
    this._isIntentionalStop = false;

    // Real-time telemetry
    this.stats = {
      fps: 0,
      bitrateKbps: 0,
      framesSent: 0,
      droppedFrames: 0,
      speedFactor: 1.0,
      health: 'offline', // offline | good | fair | poor
      reconnects: 0
    };

    this._ffmpegPath = null;
    this._cachedEncoder = null;
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
      const res = spawnSync(ffmpegBin, ['-encoders'], { encoding: 'utf8', timeout: 3000 });
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
    this.reconnectAttempts = 0;
    this.startTime = Date.now();

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
          ? ['pipe', 'ignore', 'pipe', 'pipe'] // stdin, stdout, stderr, pipe:3
          : ['pipe', 'ignore', 'pipe'];

        this.ffmpegProcess = spawn(ffmpegBin, args, { stdio });

        // Prime input pipes with 1 frame & audio chunk to satisfy input probers instantly
        try {
          const blankFrame = Buffer.alloc(c.width * c.height * 4);
          this.ffmpegProcess.stdin.write(blankFrame);
          if (c.withAudio && this.ffmpegProcess.stdio && this.ffmpegProcess.stdio[3]) {
            const blankAudio = Buffer.alloc(Math.floor((c.sampleRate / c.fps) * c.channels * 2));
            this.ffmpegProcess.stdio[3].write(blankAudio);
          }
        } catch (_) {}

        let resolved = false;

        this.ffmpegProcess.stderr.on('data', (data) => {
          const text = data.toString();
          if (process.env.DEBUG_BROADCAST) {
            console.log('[FFmpeg Stderr]', text.trim());
          }
          this._parseStats(text);

          // Treat first positive statistics emit as successful connection
          if (!resolved && (text.includes('frame=') || text.includes('bitrate='))) {
            resolved = true;
            this.isStreaming = true;
            this.stats.health = 'good';
            console.log(`[BroadcastSupervisor] Connected to ${this.sanitizeEndpoint(c.streamUrl)} using ${encoder}`);
            resolve({ ok: true, streamUrl: c.streamUrl });
          }
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
          console.warn(`[BroadcastSupervisor] FFmpeg process exited with code ${code}, signal ${signal}`);
          this.ffmpegProcess = null;

          if (this._isIntentionalStop) {
            this.isStreaming = false;
            this.stats.health = 'offline';
            if (!resolved) resolve({ ok: true, stopped: true });
          } else {
            this._handleUnexpectedExit(code);
            if (!resolved) {
              reject(new Error(`FFmpeg exited prematurely with code ${code}`));
            }
          }
        });

        this.ffmpegProcess.on('error', (err) => {
          console.error('[BroadcastSupervisor] Process error:', err.message);
          if (!resolved) reject(err);
        });

        // Resolve after 1000ms if process is healthy and still running
        setTimeout(() => {
          if (!resolved && this.ffmpegProcess && !this.ffmpegProcess.killed) {
            resolved = true;
            this.isStreaming = true;
            this.stats.health = 'good';
            resolve({ ok: true, streamUrl: c.streamUrl });
          }
        }, 1200);

      } catch (err) {
        this.isStreaming = false;
        reject(err);
      }
    });
  }

  /**
   * Parses stderr lines from FFmpeg for telemetry (fps, bitrate, drops).
   */
  _parseStats(text) {
    // Example: frame=  120 fps= 30 q=28.0 size=    1240kB time=00:00:04.00 bitrate=2539.5kbits/s speed=1.00x drop=0
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
      if (this.stats.speedFactor < 0.85) {
        this.stats.health = 'poor'; // Falling behind real time
      } else if (this.stats.speedFactor < 0.96) {
        this.stats.health = 'fair';
      } else {
        this.stats.health = 'good';
      }
    }
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
    if (!this.isStreaming || !this.ffmpegProcess || !this.ffmpegProcess.stdin) {
      return false;
    }
    try {
      return this.ffmpegProcess.stdin.write(buffer);
    } catch (_) {
      return false;
    }
  }

  /**
   * Writes mixed broadcast audio PCM into the stream pipeline.
   */
  writeAudioChunk(buffer) {
    if (!this.isStreaming || !this.ffmpegProcess || !this.ffmpegProcess.stdio || !this.ffmpegProcess.stdio[3]) {
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
      this.stats.health = 'offline';
      return Promise.resolve({ ok: true, stopped: true });
    }

    const proc = this.ffmpegProcess;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        try { proc.kill('SIGTERM'); } catch (_) {}
      }, 4000);

      proc.once('exit', () => {
        clearTimeout(timer);
        this.isStreaming = false;
        this.ffmpegProcess = null;
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
    return {
      isStreaming: this.isStreaming,
      streamUrl: rawUrl ? this.sanitizeEndpoint(rawUrl) : null,
      targetUrl: rawUrl ? this.sanitizeEndpoint(rawUrl) : null,
      uptimeSec,
      reconnectAttempts: this.reconnectAttempts,
      stats: { ...this.stats },
      encoder: this._cachedEncoder || 'unknown'
    };
  }
}

const broadcastSupervisor = new BroadcastSupervisor();

module.exports = {
  BroadcastSupervisor,
  broadcastSupervisor
};
