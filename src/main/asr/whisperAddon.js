/**
 * Load @kutalia/whisper-node-addon with correct prebuild folder names.
 * Upstream maps process.platform "darwin" → "darwin-arm64", but ships "mac-arm64".
 * Also ensure macOS rpath is patched (see scripts/patch-whisper-addon.js).
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

let _patched = false;
let _transcribe = null;

function resolveAddonPath() {
  if (!_patched) {
    _patched = true;
    try {
      // Idempotent; fixes CI-baked LC_RPATH and darwin→mac folder alias.
      require('../../scripts/patch-whisper-addon').main();
    } catch (_) {}
  }
  const root = path.dirname(require.resolve('@kutalia/whisper-node-addon/package.json'));
  const arch = process.arch; // arm64 | x64
  const candidates = [];
  if (process.platform === 'darwin') {
    candidates.push(`mac-${arch}`, `darwin-${arch}`);
  } else if (process.platform === 'win32') {
    candidates.push(`win32-${arch}`);
  } else {
    candidates.push(`linux-${arch}`);
  }
  for (const dir of candidates) {
    const p = path.join(root, 'dist', dir, 'whisper.node');
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    `whisper.node not found for ${process.platform}-${arch}. Tried: ${candidates.join(', ')} under ${path.join(root, 'dist')}`
  );
}

function getTranscribe() {
  if (_transcribe) return _transcribe;
  const addonPath = resolveAddonPath();
  // eslint-disable-next-line import/no-dynamic-require
  const { whisper } = require(addonPath);
  _transcribe = promisify(whisper);
  return _transcribe;
}

const os = require('os');

let _transcribeQueue = Promise.resolve();

async function transcribe(options) {
  return new Promise((resolve, reject) => {
    _transcribeQueue = _transcribeQueue
      .then(async () => {
        try {
          const fn = getTranscribe();
          const cpuCount = os.cpus()?.length || 4;
          const numThreads = Math.min(8, Math.max(4, cpuCount));
          const params = {
            language: 'en',
            use_gpu: true,
            flash_attn: false,
            no_prints: true,
            comma_in_time: false,
            translate: false,
            no_timestamps: true,
            detect_language: false,
            threads: numThreads,
            audio_ctx: 512,
            max_len: 0,
            ...options,
          };
          // whisper.cpp: language "auto" + detect_language for multilingual models
          if (params.language === 'auto') {
            params.detect_language = true;
          }
          if (!params.model) throw new Error('Model path is required');
          if (!params.fname_inp && !params.pcmf32) throw new Error('Input file or pcmf32 required');

          // Ensure pcmf32 has minimum safe length for GGML mel filter bank (at least 8000 samples = 0.5s)
          if (params.pcmf32 && params.pcmf32.length < 8000) {
            const padded = new Float32Array(8000);
            padded.set(params.pcmf32);
            params.pcmf32 = padded;
          }

          const result = await fn(params);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      })
      .catch((err) => {
        reject(err);
      });
  });
}

module.exports = { transcribe, resolveAddonPath };
