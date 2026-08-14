/**
 * Session archive audio — persist captured MediaRecorder blobs.
 * Prefer keeping WebM always; convert to MP4 when ffmpeg is available.
 * Emits granular progress for long recordings (write + encode).
 */
const { spawn, execSync } = require('child_process');
const path = require('path');
const fsp = require('fs').promises;

function ffmpegAvailable() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore', timeout: 3000 });
    return true;
  } catch (_) {
    return false;
  }
}

function parseFfmpegTimeSec(stderrChunk) {
  const m = String(stderrChunk).match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return (parseInt(m[1], 10) * 3600) + (parseInt(m[2], 10) * 60) + parseFloat(m[3]);
}

/**
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {{ durationSec?: number, onProgress?: (p: { ratio: number, timeSec: number }) => void, timeoutMs?: number }} [opts]
 */
function convertWebmToMp4(inputPath, outputPath, opts = {}) {
  const { durationSec = 0, onProgress, timeoutMs = 0 } = opts;
  return new Promise((resolve, reject) => {
    const args = [
      '-y', '-i', inputPath,
      '-vn',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      outputPath,
    ];
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    let settled = false;
    let timer = null;
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      fn();
    };
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch (_) {}
        finish(() => reject(new Error(`ffmpeg timed out after ${timeoutMs}ms`)));
      }, timeoutMs);
    }
    proc.stderr.on('data', (d) => {
      const chunk = d.toString();
      err += chunk;
      if (!onProgress) return;
      const t = parseFfmpegTimeSec(chunk);
      if (t == null) return;
      const ratio = durationSec > 0
        ? Math.min(0.99, t / durationSec)
        : Math.min(0.95, t / Math.max(t + 5, 30));
      onProgress({ ratio, timeSec: t });
    });
    proc.on('error', (e) => finish(() => reject(e)));
    proc.on('close', (code) => {
      if (code === 0) {
        if (onProgress) onProgress({ ratio: 1, timeSec: durationSec || 0 });
        finish(() => resolve());
      } else {
        finish(() => reject(new Error(err.slice(-500) || `ffmpeg exit ${code}`)));
      }
    });
  });
}

async function writeBufferInChunks(filePath, buf, onChunk) {
  const CHUNK = 256 * 1024;
  const total = Math.max(1, Math.ceil(buf.length / CHUNK));
  const fh = await fsp.open(filePath, 'w');
  try {
    let offset = 0;
    let step = 0;
    while (offset < buf.length) {
      const end = Math.min(offset + CHUNK, buf.length);
      await fh.write(buf.subarray(offset, end));
      offset = end;
      step += 1;
      if (onChunk) onChunk({ current: step, total });
    }
  } finally {
    await fh.close();
  }
  return total;
}

/**
 * @param {{
 *   chunks: Buffer[],
 *   mime?: string,
 *   dir: string,
 *   durationSec?: number,
 *   onProgress?: (p: { phase: string, current: number, total: number, percent: number }) => void
 * }} opts
 */
async function finalizeAudio({ chunks, mime = '', dir, durationSec = 0, onProgress }) {
  const webmPath = path.join(dir, 'session.webm');
  const mp4Path = path.join(dir, 'session.mp4');

  if (!chunks || chunks.length === 0) {
    throw new Error('No audio chunks received — MediaRecorder may not have started');
  }

  const buf = Buffer.concat(chunks);
  const looksMp4 = /mp4/i.test(mime);
  const willConvert = !looksMp4 && ffmpegAvailable();

  // Progress budget: write steps + encode steps (+ small finalize)
  const writeSteps = Math.max(1, Math.ceil(buf.length / (256 * 1024)));
  const encodeSteps = willConvert ? 24 : 0;
  const finishSteps = 2;
  const total = writeSteps + encodeSteps + finishSteps;
  let base = 0;

  const emit = (phase, currentInPhase, phaseTotal) => {
    if (!onProgress) return;
    const current = Math.min(total, base + currentInPhase);
    const percent = Math.round((current / total) * 100);
    const phaseRatio = phaseTotal > 0
      ? Math.max(0, Math.min(1, currentInPhase / phaseTotal))
      : 0;
    onProgress({ phase, current, total, percent, phaseRatio });
  };

  if (looksMp4) {
    await writeBufferInChunks(mp4Path, buf, ({ current, total: t }) => {
      emit('writing', current, t);
    });
    base = writeSteps;
    emit('done', finishSteps, finishSteps);
    return {
      audioFile: 'session.mp4',
      audioPath: mp4Path,
      format: 'mp4',
      usedFfmpeg: false,
      bytes: buf.length,
    };
  }

  await writeBufferInChunks(webmPath, buf, ({ current, total: t }) => {
    emit('writing', current, t);
  });
  base = writeSteps;

  if (!willConvert) {
    console.warn('[SessionArchive] ffmpeg not found — keeping session.webm (install ffmpeg for MP4)');
    emit('done', finishSteps, finishSteps);
    return {
      audioFile: 'session.webm',
      audioPath: webmPath,
      format: 'webm',
      usedFfmpeg: false,
      bytes: buf.length,
    };
  }

  try {
    // Timeout scales with duration (min 3m, max 45m) so multi-hour sessions don't hang forever
    const timeoutMs = Math.min(
      45 * 60 * 1000,
      Math.max(3 * 60 * 1000, (durationSec || 600) * 4 * 1000),
    );
    await convertWebmToMp4(webmPath, mp4Path, {
      durationSec,
      timeoutMs,
      onProgress: ({ ratio }) => {
        const step = Math.max(1, Math.min(encodeSteps, Math.round(ratio * encodeSteps)));
        emit('encoding', step, encodeSteps);
      },
    });
    base = writeSteps + encodeSteps;
    await fsp.unlink(webmPath).catch(() => {});
    const st = await fsp.stat(mp4Path);
    emit('done', finishSteps, finishSteps);
    return {
      audioFile: 'session.mp4',
      audioPath: mp4Path,
      format: 'mp4',
      usedFfmpeg: true,
      bytes: st.size,
    };
  } catch (err) {
    console.error('[SessionArchive] MP4 convert failed — keeping session.webm', err.message);
    await fsp.unlink(mp4Path).catch(() => {});
    emit('done', finishSteps, finishSteps);
    return {
      audioFile: 'session.webm',
      audioPath: webmPath,
      format: 'webm',
      usedFfmpeg: false,
      bytes: buf.length,
      encodeError: err.message,
    };
  }
}

module.exports = { finalizeAudio, ffmpegAvailable, convertWebmToMp4 };
