/**
 * teleprompterPostProcess.js
 *
 * Post-Processing Pipeline for Teleprompter Recordings (FR-5.42, FR-5.43 [NEW]).
 *
 * Runs a non-blocking background ffmpeg pass on captured raw recordings:
 * - Unsharp mask sharpening: unsharp=5:5:1.5:5:5:0.0
 * - Color grading & contrast polish: eq=contrast=1.05:brightness=0.02:saturation=1.1
 * - Encoding: H.264 CRF 18 (visually lossless broadcast standard) with copy audio
 *
 * Retains both session_raw.webm and session_polished.mp4.
 */

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { getFfmpegPath, parseFfmpegTimeSec } = require('./sessionAudio');

/**
 * Spawns an ffmpeg post-processing pass on a raw teleprompter recording.
 *
 * @param {object} options
 * @param {string} options.inputPath - Absolute path to raw recording (e.g. session_raw.webm)
 * @param {string} options.outputPath - Absolute path to target polished file (e.g. session_polished.mp4)
 * @param {number} [options.totalDurationSec] - Recording duration in seconds for progress calculation
 * @param {function} [options.onProgress] - Callback (progressPercent: number 0-100)
 * @returns {Promise<{ ok: boolean, outputPath?: string, error?: string }>}
 */
async function postProcessTeleprompterVideo({
  inputPath,
  outputPath,
  totalDurationSec = 0,
  onProgress = null,
}) {
  const ffmpeg = getFfmpegPath();
  if (!ffmpeg) {
    console.warn('[TeleprompterPostProcess] ffmpeg binary not found on system. Skipping post-processing.');
    return { ok: false, error: 'ffmpeg_not_found' };
  }

  if (!fs.existsSync(inputPath)) {
    return { ok: false, error: `Input file does not exist: ${inputPath}` };
  }

  return new Promise((resolve) => {
    // Unsharp mask: luma matrix 5x5, amount 1.5, chroma neutral
    // eq: 1.05 contrast, +0.02 brightness, 1.1 saturation for broadcast vibrancy
    const videoFilter = 'unsharp=5:5:1.5:5:5:0.0,eq=contrast=1.05:brightness=0.02:saturation=1.1';

    const args = [
      '-y',
      '-i', inputPath,
      '-vf', videoFilter,
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '18',
      '-c:a', 'aac',
      '-b:a', '192k',
      outputPath,
    ];

    console.log('[TeleprompterPostProcess] Starting ffmpeg pass:', ffmpeg, args.join(' '));

    const proc = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderrAcc = '';

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderrAcc += text;

      if (typeof onProgress === 'function' && totalDurationSec > 0) {
        const currentSec = parseFfmpegTimeSec(text);
        if (typeof currentSec === 'number' && currentSec >= 0) {
          const percent = Math.min(99, Math.round((currentSec / totalDurationSec) * 100));
          onProgress(percent);
        }
      }
    });

    proc.on('error', (err) => {
      console.error('[TeleprompterPostProcess] Spawn error:', err);
      resolve({ ok: false, error: err.message });
    });

    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        console.log('[TeleprompterPostProcess] Polish complete:', outputPath);
        if (typeof onProgress === 'function') onProgress(100);
        resolve({ ok: true, outputPath });
      } else {
        const tail = stderrAcc.slice(-400);
        console.warn(`[TeleprompterPostProcess] ffmpeg exited code ${code}: ${tail}`);
        resolve({ ok: false, error: `ffmpeg_exit_${code}: ${tail}` });
      }
    });
  });
}

module.exports = {
  postProcessTeleprompterVideo,
};
