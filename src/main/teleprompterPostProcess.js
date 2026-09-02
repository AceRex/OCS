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

function parseFfmpegTimeSecFallback(stderrChunk) {
  const m = String(stderrChunk).match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return (parseInt(m[1], 10) * 3600) + (parseInt(m[2], 10) * 60) + parseFloat(m[3]);
}

const parseTimeSec = typeof parseFfmpegTimeSec === 'function' ? parseFfmpegTimeSec : parseFfmpegTimeSecFallback;

const PRESET_FILTER_DEFAULTS = {
  normal: { brightness: 100, contrast: 102, saturation: 100, warmth: 0, tint: 0, sharpness: 25, grayscale: 0 },
  'warm-studio': { brightness: 104, contrast: 110, saturation: 115, warmth: 22, tint: 4, sharpness: 40, grayscale: 0 },
  'cool-film': { brightness: 102, contrast: 115, saturation: 95, warmth: -20, tint: -6, sharpness: 50, grayscale: 0 },
  'vivid-broadcast': { brightness: 106, contrast: 120, saturation: 135, warmth: 0, tint: 0, sharpness: 60, grayscale: 0 },
  'golden-hour': { brightness: 105, contrast: 108, saturation: 120, warmth: 35, tint: 10, sharpness: 30, grayscale: 0 },
  'cinematic-bw': { brightness: 105, contrast: 130, saturation: 0, warmth: 0, tint: 0, sharpness: 45, grayscale: 100 },
  'vintage-noir': { brightness: 96, contrast: 160, saturation: 0, warmth: 0, tint: 0, sharpness: 55, grayscale: 100 },
};

/**
 * Builds an ffmpeg -vf filter string combining mirror (hflip), video sharpener (unsharp),
 * color grading (eq: contrast/brightness/saturation), and color balance (warmth/tint).
 */
function buildFfmpegVideoFilters({ isMirrored = false, filterState = null }) {
  const filterParts = [];

  // 1. Mirror
  if (isMirrored) {
    filterParts.push('hflip');
  }

  // Resolve active filter settings
  let settings = null;
  if (filterState) {
    if (filterState.custom) {
      settings = { ...filterState.custom };
    } else if (filterState.presetId && PRESET_FILTER_DEFAULTS[filterState.presetId]) {
      settings = { ...PRESET_FILTER_DEFAULTS[filterState.presetId] };
    }
  }

  // Default to clean broadcast enhancement if no custom profile provided
  if (!settings) {
    settings = PRESET_FILTER_DEFAULTS.normal;
  }

  const {
    sharpness = 25,
    brightness = 100,
    contrast = 100,
    saturation = 100,
    warmth = 0,
    tint = 0,
    grayscale = 0,
  } = settings;

  // 2. Video Sharpener (unsharp filter: luma matrix 5x5, amount 0.2 - 2.8)
  if (sharpness > 0) {
    const lumaAmount = Math.max(0.2, (sharpness / 100) * 2.8).toFixed(2);
    filterParts.push(`unsharp=5:5:${lumaAmount}:5:5:0.0`);
  }

  // 3. Color Grading (eq filter)
  const bVal = ((brightness - 100) / 200).toFixed(3);
  const cVal = (contrast / 100).toFixed(2);
  const sVal = grayscale > 0 ? '0' : (saturation / 100).toFixed(2);
  filterParts.push(`eq=contrast=${cVal}:brightness=${bVal}:saturation=${sVal}`);

  // 4. Color Balancing (warmth/temperature & tint via colorbalance filter)
  if (warmth !== 0 || tint !== 0) {
    const wNorm = (warmth / 100) * 0.4;
    const tNorm = (tint / 100) * 0.3;
    const rShift = Math.max(-1, Math.min(1, (wNorm + tNorm))).toFixed(3);
    const gShift = Math.max(-1, Math.min(1, (-tNorm))).toFixed(3);
    const bShift = Math.max(-1, Math.min(1, (-wNorm + tNorm))).toFixed(3);
    filterParts.push(`colorbalance=rs=${rShift}:gs=${gShift}:bs=${bShift}:rm=${rShift}:gm=${gShift}:bm=${bShift}`);
  }

  return filterParts.join(',');
}

/**
 * Spawns an ffmpeg post-processing pass on a raw teleprompter recording.
 *
 * @param {object} options
 * @param {string} options.inputPath - Absolute path to raw recording (e.g. session_raw.webm)
 * @param {string} options.outputPath - Absolute path to target polished file (e.g. session_polished.mp4)
 * @param {number} [options.totalDurationSec] - Recording duration in seconds for progress calculation
 * @param {boolean} [options.isMirrored] - Whether recording should be flipped horizontally to match mirror preview
 * @param {object} [options.filterState] - Active color grading, sharpener & balancing state
 * @param {function} [options.onProgress] - Callback (progressPercent: number 0-100)
 * @returns {Promise<{ ok: boolean, outputPath?: string, error?: string }>}
 */
async function postProcessTeleprompterVideo({
  inputPath,
  outputPath,
  totalDurationSec = 0,
  isMirrored = false,
  filterState = null,
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
    const videoFilter = buildFfmpegVideoFilters({ isMirrored, filterState });

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
        const currentSec = parseTimeSec(text);
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
  buildFfmpegVideoFilters,
  PRESET_FILTER_DEFAULTS,
};

