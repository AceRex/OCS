/**
 * Session archive audio — persist captured MediaRecorder blobs.
 * Prefer keeping WebM always; convert to MP4 when ffmpeg is available.
 * Emits granular progress for long recordings (write + encode).
 */
const { spawn, spawnSync, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

let cachedFfmpegPath = undefined;

function getFfmpegPath() {
  if (cachedFfmpegPath !== undefined) return cachedFfmpegPath;

  // 1. Try require('ffmpeg-static')
  try {
    const staticPath = require('ffmpeg-static');
    if (staticPath && fs.existsSync(staticPath)) {
      try {
        const res = spawnSync(staticPath, ['-version'], { timeout: 2000 });
        if (res.status === 0 || (res.stdout && res.stdout.length > 0)) {
          cachedFfmpegPath = staticPath;
          return cachedFfmpegPath;
        }
      } catch (_) {}
    }
  } catch (_) {}

  // 2. Candidate binaries in common system locations
  const candidates = [
    'ffmpeg',
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg',
    '/opt/local/bin/ffmpeg',
  ];

  for (const c of candidates) {
    try {
      const res = spawnSync(c, ['-version'], { timeout: 2000 });
      if (res.status === 0 || (res.stdout && res.stdout.length > 0)) {
        cachedFfmpegPath = c;
        return cachedFfmpegPath;
      }
    } catch (_) {}
  }

  cachedFfmpegPath = null;
  return null;
}

function ffmpegAvailable() {
  return getFfmpegPath() !== null;
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
  const ffmpeg = getFfmpegPath();
  if (!ffmpeg) return Promise.reject(new Error('ffmpeg not available'));

  return new Promise((resolve, reject) => {
    const args = [
      '-y', '-i', inputPath,
      '-vn',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      outputPath,
    ];
    const proc = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });
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
 * Probe duration and stream types using ffmpeg -i
 */
function probeMediaInfo(filePath) {
  if (!filePath) return { hasVideo: false, hasAudio: false, duration: 0 };
  const ffmpeg = getFfmpegPath();
  if (!ffmpeg) return { hasVideo: false, hasAudio: false, duration: 0 };

  try {
    const res = spawnSync(ffmpeg, ['-i', filePath], { encoding: 'utf8', timeout: 6000 });
    const out = (res.stdout || '') + (res.stderr || '') + (res.error ? res.error.message : '');
    const hasVideo = /Stream #\d+:\d+.*Video:/i.test(out);
    const hasAudio = /Stream #\d+:\d+.*Audio:/i.test(out);
    const m = out.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
    const duration = m ? (parseInt(m[1], 10) * 3600) + (parseInt(m[2], 10) * 60) + parseFloat(m[3]) : 0;
    return { hasVideo, hasAudio, duration };
  } catch (_) {
    return { hasVideo: false, hasAudio: false, duration: 0 };
  }
}

/**
 * Merge intro and/or outro bumper media to the session recording using FFmpeg.
 * @param {string} recordingPath - path to session.mp4 or session.webm
 * @param {{
 *   introPath?: string|null,
 *   outroPath?: string|null,
 *   timeoutMs?: number,
 *   onProgress?: (p: { ratio: number }) => void
 * }} opts
 */
async function mergeBumpersToRecording(recordingPath, opts = {}) {
  const { introPath = null, outroPath = null, timeoutMs = 600000, onProgress } = opts;
  const ffmpeg = getFfmpegPath();
  if (!ffmpeg) {
    console.warn('[SessionAudio] ffmpeg unavailable — skipping bumper merge');
    return { merged: false, audioPath: recordingPath, addedDurationSec: 0 };
  }

  const validFiles = [];
  let addedDurationSec = 0;

  if (introPath) {
    try {
      await fsp.access(introPath);
      const info = probeMediaInfo(introPath);
      validFiles.push({ path: introPath, type: 'intro', ...info });
      addedDurationSec += info.duration;
    } catch (_) {
      console.warn('[SessionAudio] intro bumper not accessible:', introPath);
    }
  }

  const recInfo = probeMediaInfo(recordingPath);
  validFiles.push({ path: recordingPath, type: 'recording', ...recInfo });

  if (outroPath) {
    try {
      await fsp.access(outroPath);
      const info = probeMediaInfo(outroPath);
      validFiles.push({ path: outroPath, type: 'outro', ...info });
      addedDurationSec += info.duration;
    } catch (_) {
      console.warn('[SessionAudio] outro bumper not accessible:', outroPath);
    }
  }

  if (validFiles.length <= 1) {
    return { merged: false, audioPath: recordingPath, addedDurationSec: 0, totalDurationSec: recInfo.duration };
  }

  const dir = path.dirname(recordingPath);
  const ext = path.extname(recordingPath) || '.mp4';
  const tempMergedPath = path.join(dir, `_session_merged_${Date.now()}${ext}`);
  const totalEstDuration = recInfo.duration + addedDurationSec;

  return new Promise((resolve) => {
    const args = ['-y'];
    for (const f of validFiles) {
      args.push('-i', f.path);
    }

    // OCS session archives are audio recordings.
    // Normalize audio streams to 44.1kHz stereo fltp (or generate silence if a video has no audio)
    const filterParts = [];
    const concatAudioInputs = [];

    validFiles.forEach((f, idx) => {
      if (f.hasAudio) {
        filterParts.push(`[${idx}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=1.0[a${idx}]`);
      } else {
        const dur = Math.max(1, f.duration || 2);
        filterParts.push(`aevalsrc=0:d=${dur}:s=44100:c=stereo[a${idx}]`);
      }
      concatAudioInputs.push(`[a${idx}]`);
    });

    filterParts.push(`${concatAudioInputs.join('')}concat=n=${validFiles.length}:v=0:a=1[outa]`);

    args.push(
      '-filter_complex', filterParts.join(';'),
      '-map', '[outa]',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      tempMergedPath
    );

    console.log('[SessionAudio] merging bumpers with FFmpeg:', ffmpeg, args.join(' '));

    const proc = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderrText = '';
    let settled = false;
    let timer = null;

    const finish = async (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch (_) {}
        finish({ merged: false, audioPath: recordingPath, addedDurationSec: 0, error: 'Bumper merge timed out' });
      }, timeoutMs);
    }

    proc.stderr.on('data', (d) => {
      const chunk = d.toString();
      stderrText += chunk;
      if (onProgress) {
        const t = parseFfmpegTimeSec(chunk);
        if (t != null && totalEstDuration > 0) {
          onProgress({ ratio: Math.min(0.99, t / totalEstDuration) });
        }
      }
    });

    proc.on('error', (e) => {
      console.error('[SessionAudio] bumper merge spawn error:', e.message);
      finish({ merged: false, audioPath: recordingPath, addedDurationSec: 0, error: e.message });
    });

    proc.on('close', async (code) => {
      if (code === 0) {
        try {
          await fsp.unlink(recordingPath).catch(() => {});
          await fsp.rename(tempMergedPath, recordingPath);
          const finalInfo = probeMediaInfo(recordingPath);
          console.log('[SessionAudio] bumper merge complete ->', recordingPath, `${finalInfo.duration}s`);
          finish({
            merged: true,
            audioPath: recordingPath,
            addedDurationSec,
            totalDurationSec: Math.round(finalInfo.duration || totalEstDuration),
          });
        } catch (e) {
          console.error('[SessionAudio] failed to replace with merged bumper file:', e);
          finish({ merged: false, audioPath: recordingPath, addedDurationSec: 0, error: e.message });
        }
      } else {
        console.warn('[SessionAudio] bumper merge failed (exit ' + code + '):', stderrText.slice(-300));
        await fsp.unlink(tempMergedPath).catch(() => {});
        finish({ merged: false, audioPath: recordingPath, addedDurationSec: 0, error: `ffmpeg exit ${code}` });
      }
    });
  });
}

/**
 * @param {{
 *   chunks: Buffer[],
 *   mime?: string,
 *   dir: string,
 *   durationSec?: number,
 *   introPath?: string|null,
 *   outroPath?: string|null,
 *   autoMergeBumpers?: boolean,
 *   onProgress?: (p: { phase: string, current: number, total: number, percent: number }) => void
 * }} opts
 */
async function finalizeAudio({
  chunks,
  mime = '',
  dir,
  durationSec = 0,
  introPath = null,
  outroPath = null,
  autoMergeBumpers = true,
  onProgress,
}) {
  const webmPath = path.join(dir, 'session.webm');
  const mp4Path = path.join(dir, 'session.mp4');

  if (!chunks || chunks.length === 0) {
    throw new Error('No audio chunks received — MediaRecorder may not have started');
  }

  const buf = Buffer.concat(chunks);
  const looksMp4 = /mp4/i.test(mime);
  const willConvert = !looksMp4 && ffmpegAvailable();

  const writeSteps = Math.max(1, Math.ceil(buf.length / (256 * 1024)));
  const encodeSteps = willConvert ? 24 : 0;
  const bumperSteps = (autoMergeBumpers && (introPath || outroPath) && ffmpegAvailable()) ? 10 : 0;
  const finishSteps = 2;
  const total = writeSteps + encodeSteps + bumperSteps + finishSteps;
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

  let primaryAudioPath = mp4Path;
  let primaryAudioFile = 'session.mp4';
  let primaryFormat = 'mp4';
  let usedFfmpeg = false;

  if (looksMp4) {
    await writeBufferInChunks(mp4Path, buf, ({ current, total: t }) => {
      emit('writing', current, t);
    });
    base = writeSteps;
  } else {
    await writeBufferInChunks(webmPath, buf, ({ current, total: t }) => {
      emit('writing', current, t);
    });
    base = writeSteps;

    if (!willConvert) {
      console.warn('[SessionArchive] ffmpeg not found — keeping session.webm (install ffmpeg for MP4)');
      primaryAudioPath = webmPath;
      primaryAudioFile = 'session.webm';
      primaryFormat = 'webm';
    } else {
      try {
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
        usedFfmpeg = true;
      } catch (err) {
        console.error('[SessionArchive] MP4 convert failed — keeping session.webm', err.message);
        primaryAudioPath = webmPath;
        primaryAudioFile = 'session.webm';
        primaryFormat = 'webm';
      }
    }
  }

  // Bumper merge step
  let finalDurationSec = durationSec;
  if (autoMergeBumpers && (introPath || outroPath) && ffmpegAvailable()) {
    try {
      const mergeRes = await mergeBumpersToRecording(primaryAudioPath, {
        introPath,
        outroPath,
        onProgress: ({ ratio }) => {
          const step = Math.max(1, Math.min(bumperSteps, Math.round(ratio * bumperSteps)));
          emit('bumpers', step, bumperSteps);
        },
      });
      if (mergeRes.merged && mergeRes.totalDurationSec) {
        finalDurationSec = mergeRes.totalDurationSec;
      }
      base = writeSteps + encodeSteps + bumperSteps;
    } catch (err) {
      console.error('[SessionArchive] bumper merge error:', err);
    }
  }

  const st = await fsp.stat(primaryAudioPath).catch(() => ({ size: buf.length }));
  emit('done', finishSteps, finishSteps);

  return {
    audioFile: primaryAudioFile,
    audioPath: primaryAudioPath,
    format: primaryFormat,
    usedFfmpeg,
    bytes: st.size || buf.length,
    finalDurationSec,
  };
}

module.exports = {
  finalizeAudio,
  ffmpegAvailable,
  getFfmpegPath,
  convertWebmToMp4,
  probeMediaInfo,
  mergeBumpersToRecording,
};

