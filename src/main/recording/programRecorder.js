/**
 * OCS Program Video Canvas MP4 Recorder — P0-05
 *
 * Implements crash-resilient hardware-accelerated recording of the Program video output
 * muxed with live broadcast audio into fragmented MP4 (-movflags frag_keyframe+empty_moov).
 *
 * Survives sudden process termination or power failure without corrupting recorded footage.
 */

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

class ProgramRecorder {
  constructor() {
    this.ffmpegProcess = null;
    this.isRecording = false;
    this.outputPath = null;
    this.config = null;
    this.startTime = 0;
    this.framesRecorded = 0;
    this.audioBytesRecorded = 0;
    this._ffmpegPath = null;
    this._cachedEncoder = null;
    this._drainWaiters = [];
    this._isBackpressured = false;
  }

  /**
   * Resolves the active FFmpeg binary (bundled ffmpeg-static or system path).
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
   * Detects the optimal H.264 video encoder available on the current platform.
   */
  detectHardwareEncoder() {
    if (this._cachedEncoder) return this._cachedEncoder;

    const ffmpegBin = this.getFfmpegPath();
    const probeEncoders = () => {
      try {
        const res = spawnSync(ffmpegBin, ['-encoders'], { encoding: 'utf8', timeout: 3000 });
        const output = res.stdout || '';

        if (process.platform === 'darwin' && output.includes('h264_videotoolbox')) {
          return 'h264_videotoolbox';
        }
        if (process.platform === 'win32') {
          if (output.includes('h264_nvenc')) return 'h264_nvenc';
          if (output.includes('h264_qsv')) return 'h264_qsv';
          if (output.includes('h264_amf')) return 'h264_amf';
        }
        if (process.platform === 'linux') {
          if (output.includes('h264_nvenc')) return 'h264_nvenc';
          if (output.includes('h264_vaapi')) return 'h264_vaapi';
        }
      } catch (_) {}
      return 'libx264';
    };

    this._cachedEncoder = probeEncoders();
    return this._cachedEncoder;
  }

  /**
   * Starts recording the Program composite output to fragmented MP4.
   *
   * @param {object} options
   * @param {string} options.outputPath - Destination .mp4 file path
   * @param {number} [options.width=1280] - Video frame width
   * @param {number} [options.height=720] - Video frame height
   * @param {number} [options.fps=30] - Frame rate
   * @param {number} [options.sampleRate=48000] - Audio sample rate (Hz)
   * @param {number} [options.channels=2] - Audio channels (1 = mono, 2 = stereo)
   * @param {boolean} [options.withAudio=true] - Whether audio input stream is enabled
   * @returns {Promise<{ok: boolean, outputPath: string}>}
   */
  start(options = {}) {
    if (this.isRecording) {
      return Promise.reject(new Error('Program recorder is already active'));
    }

    const {
      outputPath,
      width = 1280,
      height = 720,
      fps = 30,
      sampleRate = 48000,
      channels = 2,
      withAudio = true
    } = options;

    if (!outputPath) {
      return Promise.reject(new Error('outputPath is required'));
    }

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Storage preflight check (mandated by Stage 7 Section 13)
    const minRequiredBytes = options.minFreeBytes || (100 * 1024 * 1024); // 100MB minimum emergency threshold
    const freeSpace = ProgramRecorder.getAvailableDiskSpace(dir);
    if (freeSpace !== null && freeSpace < minRequiredBytes) {
      const freeMb = Math.round(freeSpace / (1024 * 1024));
      const reqMb = Math.round(minRequiredBytes / (1024 * 1024));
      return Promise.reject(new Error(`Insufficient disk space: only ${freeMb}MB free on target drive. Minimum required is ${reqMb}MB.`));
    }

    this.outputPath = outputPath;
    this.config = { width, height, fps, sampleRate, channels, withAudio };
    this.startTime = Date.now();
    this.framesRecorded = 0;
    this.audioBytesRecorded = 0;
    this._isBackpressured = false;

    const ffmpegBin = this.getFfmpegPath();
    const encoder = this.detectHardwareEncoder();

    // Build FFmpeg command arguments
    const args = [
      '-y',
      // Video input (pipe:0 = stdin)
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-s', `${width}x${height}`,
      '-r', `${fps}`,
      '-i', 'pipe:0'
    ];

    if (withAudio) {
      // Audio input (pipe:3 = extra fd)
      args.push(
        '-f', 's16le',
        '-ar', `${sampleRate}`,
        '-ac', `${channels}`,
        '-i', 'pipe:3'
      );
    }

    // Video codec configuration
    args.push('-c:v', encoder);
    if (encoder === 'libx264') {
      args.push('-preset', 'veryfast', '-crf', '23');
    } else if (encoder === 'h264_videotoolbox') {
      args.push('-b:v', '4500k', '-realtime', '1');
    } else if (encoder === 'h264_nvenc') {
      args.push('-preset', 'p3', '-b:v', '4500k');
    }

    // Set 1-second keyframe interval for deterministic fragmented MP4 flushing
    args.push('-g', String(fps), '-keyint_min', String(fps));
    args.push('-pix_fmt', 'yuv420p');

    if (withAudio) {
      args.push('-c:a', 'aac', '-b:a', '192k', '-ar', `${sampleRate}`);
    }

    // Mandatory crash-resilient fragmented MP4 flags
    args.push(
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-flush_packets', '1',
      outputPath
    );

    return new Promise((resolve, reject) => {
      try {
        const stdio = withAudio
          ? ['pipe', 'ignore', 'pipe', 'pipe'] // stdin (video), stdout (ignore), stderr (debug), pipe:3 (audio)
          : ['pipe', 'ignore', 'pipe'];

        this.ffmpegProcess = spawn(ffmpegBin, args, { stdio });

        let started = false;
        let stderrData = '';

        this.ffmpegProcess.stderr.on('data', (data) => {
          stderrData += data.toString();
          // Keep only the last 1KB for error reporting
          if (stderrData.length > 2048) {
            stderrData = stderrData.slice(-2048);
          }
        });

        this.ffmpegProcess.on('error', (err) => {
          console.error('[ProgramRecorder] FFmpeg spawn error:', err.message);
          this.isRecording = false;
          if (!started) {
            reject(err);
          }
        });

        this.ffmpegProcess.on('exit', (code, signal) => {
          console.log(`[ProgramRecorder] FFmpeg exited with code ${code}, signal ${signal}`);
          this.isRecording = false;
          this.ffmpegProcess = null;
          if (!started && code !== 0) {
            reject(new Error(`FFmpeg exited immediately with code ${code}: ${stderrData}`));
          }
        });

        this.ffmpegProcess.stdin.on('error', (err) => {
          if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return;
          console.error('[ProgramRecorder] Stdin error:', err.message);
        });

        if (withAudio && this.ffmpegProcess.stdio && this.ffmpegProcess.stdio[3]) {
          this.ffmpegProcess.stdio[3].on('error', (err) => {
            if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return;
            console.error('[ProgramRecorder] Audio pipe error:', err.message);
          });
        }

        if (this.ffmpegProcess.stdin && this.ffmpegProcess.stdin._writableState) {
          const expectedFrameBytes = width * height * 4;
          this.ffmpegProcess.stdin._writableState.highWaterMark = Math.max(16 * 1024 * 1024, expectedFrameBytes * 2);
        }

        this.ffmpegProcess.stdin.on('drain', () => {
          this._isBackpressured = false;
          while (this._drainWaiters.length > 0) {
            const cb = this._drainWaiters.shift();
            try { cb(); } catch (_) {}
          }
        });

        this.isRecording = true;
        started = true;
        console.log(`[ProgramRecorder] Started recording to ${outputPath} (${width}x${height} @ ${fps}fps using ${encoder})`);
        resolve({ ok: true, outputPath });
      } catch (err) {
        this.isRecording = false;
        reject(err);
      }
    });
  }

  /**
   * Writes a raw RGBA video frame buffer into the recording stream.
   *
   * @param {Buffer} buffer - Raw RGBA frame data
   * @returns {boolean} Whether stream accepted frame without backpressure
   */
  writeVideoFrame(buffer) {
    if (!this.isRecording || !this.ffmpegProcess || !this.ffmpegProcess.stdin) {
      return false;
    }

    const expectedFrameBytes = (this.config?.width || 1280) * (this.config?.height || 720) * 4;
    if (buffer.length !== expectedFrameBytes) {
      return false;
    }

    try {
      const canAcceptMore = this.ffmpegProcess.stdin.write(buffer);
      this.framesRecorded++;
      if (!canAcceptMore) {
        this._isBackpressured = true;
      }
      return canAcceptMore;
    } catch (err) {
      console.error('[ProgramRecorder] Frame write error:', err.message);
      return false;
    }
  }

  /**
   * Writes a raw 16-bit signed PCM audio chunk into the recording stream.
   *
   * @param {Buffer} buffer - PCM audio data
   * @returns {boolean} Whether audio pipe accepted data
   */
  writeAudioChunk(buffer) {
    if (!this.isRecording || !this.ffmpegProcess || !this.ffmpegProcess.stdio || !this.ffmpegProcess.stdio[3]) {
      return false;
    }

    try {
      const canAcceptMore = this.ffmpegProcess.stdio[3].write(buffer);
      this.audioBytesRecorded += buffer.length;
      return canAcceptMore;
    } catch (err) {
      console.error('[ProgramRecorder] Audio write error:', err.message);
      return false;
    }
  }

  /**
   * Stops recording and finalizes the MP4 file.
   *
   * @returns {Promise<{ok: boolean, outputPath: string, durationSec: number, bytesWritten: number, framesRecorded: number}>}
   */
  stop() {
    if (!this.isRecording || !this.ffmpegProcess) {
      return Promise.resolve({
        ok: false,
        reason: 'Not currently recording',
        outputPath: this.outputPath
      });
    }

    const proc = this.ffmpegProcess;
    const outputPath = this.outputPath;
    const framesRecorded = this.framesRecorded;
    const durationSec = ((Date.now() - this.startTime) / 1000).toFixed(2);

    return new Promise((resolve) => {
      const finalizeTimeout = setTimeout(() => {
        try {
          console.warn('[ProgramRecorder] Finalize timeout, sending SIGTERM to FFmpeg');
          proc.kill('SIGTERM');
        } catch (_) {}
      }, 5000);

      proc.once('exit', () => {
        clearTimeout(finalizeTimeout);
        this.isRecording = false;
        this.ffmpegProcess = null;

        let bytesWritten = 0;
        try {
          if (fs.existsSync(outputPath)) {
            bytesWritten = fs.statSync(outputPath).size;
          }
        } catch (_) {}

        console.log(`[ProgramRecorder] Finalized recording: ${outputPath} (${bytesWritten} bytes, ${framesRecorded} frames, ${durationSec}s)`);
        resolve({
          ok: true,
          outputPath,
          durationSec: Number(durationSec),
          bytesWritten,
          framesRecorded
        });
      });

      try {
        if (proc.stdin) proc.stdin.end();
        if (proc.stdio && proc.stdio[3]) proc.stdio[3].end();
      } catch (err) {
        console.error('[ProgramRecorder] Error closing pipes:', err.message);
        try { proc.kill('SIGTERM'); } catch (_) {}
      }
    });
  }

  /**
   * Probes available storage on the target directory path.
   */
  static getAvailableDiskSpace(dirPath) {
    try {
      if (typeof fs.statfsSync === 'function') {
        const stats = fs.statfsSync(dirPath);
        return stats.bavail * stats.bsize;
      }
    } catch (_) {}
    return null;
  }

  /**
   * Retrieves live recording metrics.
   */
  getStatus() {
    const elapsedSec = this.isRecording ? ((Date.now() - this.startTime) / 1000) : 0;
    const freeDiskBytes = this.outputPath ? ProgramRecorder.getAvailableDiskSpace(path.dirname(this.outputPath)) : null;
    return {
      isRecording: this.isRecording,
      outputPath: this.outputPath,
      framesRecorded: this.framesRecorded,
      audioBytesRecorded: this.audioBytesRecorded,
      elapsedSec: Math.round(elapsedSec),
      encoder: this._cachedEncoder || 'unknown',
      freeDiskBytes
    };
  }
}

const programRecorder = new ProgramRecorder();

module.exports = {
  ProgramRecorder,
  programRecorder
};
