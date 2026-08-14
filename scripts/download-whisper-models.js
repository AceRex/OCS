/**
 * Download / verify whisper.cpp ggml models for OCS.
 * Prefer distil-small.en; also fetch Silero VAD and (optional) distil-medium for benches.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'voice_server', 'models', 'whisper');

const MODELS = [
  {
    name: 'ggml-distil-small.en.bin',
    urls: [
      'https://huggingface.co/distil-whisper/distil-small.en/resolve/main/ggml-distil-small.en.bin',
      'https://hf-mirror.com/distil-whisper/distil-small.en/resolve/main/ggml-distil-small.en.bin',
    ],
    required: true,
    expectedBytes: 336_191_657,
    license: 'MIT (Distil-Whisper / OpenAI Whisper)',
  },
  {
    name: 'ggml-medium-32-2.en.bin',
    urls: [
      'https://huggingface.co/distil-whisper/distil-medium.en/resolve/main/ggml-medium-32-2.en.bin',
      'https://hf-mirror.com/distil-whisper/distil-medium.en/resolve/main/ggml-medium-32-2.en.bin',
    ],
    required: false,
    // ~790MB class; accept ≥500MB so truncated downloads aren't treated as present
    minBytes: 500_000_000,
    license: 'MIT (Distil-Whisper / OpenAI Whisper)',
  },
  {
    name: 'ggml-silero-v6.2.0.bin',
    urls: [
      'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin',
      'https://hf-mirror.com/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin',
    ],
    required: false,
    expectedBytes: 884_700,
    minBytes: 100_000,
    license: 'Confirm Silero / ggml-org terms at download (typically MIT)',
  },
  {
    // Fallback if distil unavailable
    name: 'ggml-base.en.bin',
    urls: [
      'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
      'https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
    ],
    required: false,
    expectedBytes: 147_951_465,
    license: 'MIT (whisper.cpp converted OpenAI weights)',
  },
];

function sizeOk(entry, size) {
  if (entry.expectedBytes) {
    // Allow small HF CDN variance (±1%)
    const lo = Math.floor(entry.expectedBytes * 0.99);
    const hi = Math.ceil(entry.expectedBytes * 1.01);
    return size >= lo && size <= hi;
  }
  const min = entry.minBytes
    || (/silero/i.test(entry.name) ? 100_000 : 1_000_000);
  return size >= min;
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'ocs-setup-voice/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(dest, () => {});
        return download(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(dest, () => {});
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    });
    req.on('error', (e) => {
      file.close();
      fs.unlink(dest, () => {});
      reject(e);
    });
  });
}

async function ensureModel(entry) {
  const dest = path.join(OUT, entry.name);
  if (fs.existsSync(dest) && sizeOk(entry, fs.statSync(dest).size)) {
    console.log(`  ✓ ${entry.name} already present (${(fs.statSync(dest).size / 1e6).toFixed(1)} MB)`);
    return true;
  }
  if (fs.existsSync(dest)) {
    console.warn(`  ⚠ ${entry.name} present but size mismatch (${fs.statSync(dest).size} B) — re-downloading`);
    try { fs.unlinkSync(dest); } catch (_) {}
  }
  for (const url of entry.urls) {
    try {
      console.log(`  ↓ ${entry.name} from ${url.split('/')[2]}…`);
      await download(url, dest);
      const size = fs.statSync(dest).size;
      if (!sizeOk(entry, size)) {
        throw new Error(`size mismatch (${size} B${entry.expectedBytes ? `, expected ~${entry.expectedBytes}` : ''})`);
      }
      console.log(`  ✓ ${entry.name} (${(size / 1e6).toFixed(1)} MB) — ${entry.license}`);
      return true;
    } catch (e) {
      console.warn(`  ✗ ${url}: ${e.message}`);
      try { fs.unlinkSync(dest); } catch (_) {}
    }
  }
  return false;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  console.log('\n▸ Whisper.cpp models →', OUT);
  let okRequired = true;
  for (const m of MODELS) {
    const ok = await ensureModel(m);
    if (m.required && !ok) okRequired = false;
  }
  // If distil-small missing but base.en present, still usable
  const hasAny = MODELS.some((m) => fs.existsSync(path.join(OUT, m.name)));
  if (!okRequired && !hasAny) {
    console.warn('\n⚠ No whisper ggml model downloaded (network may block HuggingFace).');
    console.warn('  Place ggml-distil-small.en.bin manually in:');
    console.warn(' ', OUT);
    console.warn('  App will fall back to Vosk until a model is present.\n');
    process.exitCode = 2;
    return;
  }
  console.log('\n✓ Whisper model setup done.\n');
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { MODELS, ensureModel, OUT };
