#!/usr/bin/env node
/**
 * OCS Voice Setup — Phase 0 (native Node Vosk)
 * Run once: npm run setup:voice
 *
 * Downloads the Vosk model + optional Piper TTS assets.
 * ASR no longer requires a Python venv (vosk-koffi / Koffi FFI).
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs   = require('fs');
const https = require('https');

const ROOT         = path.resolve(__dirname, '..');
const VOICE_DIR    = path.join(ROOT, 'voice_server');
const MODELS_DIR   = path.join(VOICE_DIR, 'models');
const PIPER_DIR    = path.join(VOICE_DIR, 'piper');
const VOICES_DIR   = path.join(VOICE_DIR, 'piper_voices');

const IS_WIN   = process.platform === 'win32';
const ARCH     = process.arch; // 'x64' | 'arm64'

const PIPER_VERSION = '2023.11.14-2';
const PIPER_BASE    = `https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}`;

const PIPER_ASSETS = {
  darwin: {
    x64:   { asset: 'piper_macos_x64.tar.gz',      binary: 'piper' },
    arm64: { asset: 'piper_macos_aarch64.tar.gz',  binary: 'piper' },
  },
  linux: {
    x64:   { asset: 'piper_linux_x86_64.tar.gz',   binary: 'piper' },
    arm64: { asset: 'piper_linux_aarch64.tar.gz',  binary: 'piper' },
  },
  win32: {
    x64:   { asset: 'piper_windows_amd64.zip',     binary: 'piper.exe' },
  },
};

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  const result = spawnSync(cmd, { shell: true, stdio: 'inherit', ...opts });
  if (result.status !== 0) {
    console.error(`  ✗ Failed (exit ${result.status})`);
    return false;
  }
  return true;
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const follow = (u) => {
      https.get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          return follow(res.headers.location);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      }).on('error', (e) => { file.close(); reject(e); });
    };
    follow(url);
  });
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   OCS Voice Setup (Whisper.cpp + Vosk)      ║');
  console.log(`║  Platform: ${process.platform} / ${ARCH.padEnd(6)}               ║`);
  console.log('╚══════════════════════════════════════════════╝\n');

  // Step 1 — Confirm native bindings
  console.log('▸ Step 1: Checking ASR native bindings...');
  try {
    const vosk = require('vosk-koffi');
    if (!vosk.Model || !vosk.Recognizer) throw new Error('Incomplete vosk-koffi export');
    console.log('✓ vosk-koffi loaded (fallback)');
  } catch (e) {
    console.error('✗ vosk-koffi not available. Run: npm install');
    console.error(' ', e.message);
    process.exit(1);
  }
  try {
    require('@kutalia/whisper-node-addon');
    console.log('✓ @kutalia/whisper-node-addon loaded (default)');
  } catch (e) {
    console.warn('⚠ whisper-node-addon not available:', e.message);
  }

  // Step 2 — Vosk model
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  const smallModel = path.join(MODELS_DIR, 'vosk-model-small-en-us-0.15');
  if (!fs.existsSync(smallModel)) {
    console.log('\n▸ Step 2: Downloading Vosk small model (~40MB)...');
    const modelZip = path.join(MODELS_DIR, 'vosk-model-small.zip');
    await downloadFile(
      'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip',
      modelZip
    );
    if (IS_WIN) {
      run(`powershell -Command "Expand-Archive '${modelZip}' '${MODELS_DIR}' -Force"`);
    } else {
      run(`unzip -q "${modelZip}" -d "${MODELS_DIR}"`);
    }
    fs.unlinkSync(modelZip);
    console.log('✓ Vosk model downloaded');
  } else {
    console.log('✓ Step 2: Vosk model already present');
  }

  // Step 3 — Piper TTS (optional)
  fs.mkdirSync(PIPER_DIR,  { recursive: true });
  fs.mkdirSync(VOICES_DIR, { recursive: true });

  const piperInfo = PIPER_ASSETS[process.platform]?.[ARCH];
  const piperBin  = path.join(PIPER_DIR, piperInfo?.binary || 'piper');

  if (piperInfo && !fs.existsSync(piperBin)) {
    console.log(`\n▸ Step 3: Downloading Piper TTS (${piperInfo.asset})...`);
    const piperArchive = path.join(PIPER_DIR, piperInfo.asset);
    try {
      await downloadFile(`${PIPER_BASE}/${piperInfo.asset}`, piperArchive);
      if (piperInfo.asset.endsWith('.zip')) {
        run(`powershell -Command "Expand-Archive '${piperArchive}' '${PIPER_DIR}' -Force"`);
      } else {
        run(`tar -xzf "${piperArchive}" -C "${PIPER_DIR}" --strip-components=1`);
      }
      fs.unlinkSync(piperArchive);
      if (!IS_WIN && fs.existsSync(piperBin)) fs.chmodSync(piperBin, 0o755);
      console.log('✓ Piper TTS installed');
    } catch (e) {
      console.warn(`⚠ Piper download failed: ${e.message}`);
      console.warn('  TTS is optional — ASR will still work.');
    }
  } else if (!piperInfo) {
    console.warn(`⚠ Step 3: Piper not available for ${process.platform}/${ARCH} — TTS disabled`);
  } else {
    console.log('✓ Step 3: Piper already installed');
  }

  // Step 4 — Piper voice model
  const voiceOnnx = path.join(VOICES_DIR, 'en_US-amy-medium.onnx');
  if (!fs.existsSync(voiceOnnx)) {
    console.log('\n▸ Step 4: Downloading Piper voice (en_US-amy-medium, ~60MB)...');
    const HF = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium';
    try {
      await downloadFile(`${HF}/en_US-amy-medium.onnx`,      voiceOnnx);
      await downloadFile(`${HF}/en_US-amy-medium.onnx.json`, voiceOnnx + '.json');
      console.log('✓ Piper voice downloaded');
    } catch (e) {
      console.warn(`⚠ Voice download failed: ${e.message}`);
    }
  } else {
    console.log('✓ Step 4: Piper voice already present');
  }

  // Step 5 — Whisper.cpp models (default ASR)
  console.log('\n▸ Step 5: Whisper.cpp ggml models...');
  try {
    const { spawnSync } = require('child_process');
    const dl = spawnSync(process.execPath, [path.join(__dirname, 'download-whisper-models.js')], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    });
    if (dl.status === 0) console.log('✓ Whisper models ready');
    else if (dl.status === 2) console.warn('⚠ Whisper models missing — ASR will use Vosk fallback');
    else console.warn('⚠ Whisper model download exited', dl.status);
  } catch (e) {
    console.warn('⚠ Whisper setup skipped:', e.message);
  }

  // Smoke-test model load
  console.log('\n▸ Smoke-testing ASR backends...');
  try {
    const { Model, Recognizer, setLogLevel } = require('vosk-koffi');
    setLogLevel(-1);
    const t0 = Date.now();
    const model = new Model(smallModel);
    const rec = new Recognizer({ model, sampleRate: 16000 });
    rec.setWords(true);
    rec.acceptWaveform(Buffer.alloc(3200));
    rec.free();
    model.free();
    console.log(`✓ Vosk model load OK (${Date.now() - t0}ms)`);
  } catch (e) {
    console.error('✗ Vosk smoke test failed:', e.message);
    process.exit(1);
  }

  try {
    const { AsrFacade } = require(path.join(ROOT, 'src/main/asrFacade'));
    const facade = new AsrFacade(ROOT);
    const st = await facade.initialize();
    console.log(`✓ AsrFacade engine=${st.asrEngine} status=${st.status} model=${st.model?.name || 'n/a'}`);
    facade.shutdown();
  } catch (e) {
    console.warn('⚠ AsrFacade smoke:', e.message);
  }

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  ✓ Setup complete! Start OCS with npm start ║');
  console.log('║  ASR: whisper.cpp (default) / vosk fallback ║');
  console.log('║  Optional chat: ollama serve                ║');
  console.log('╚══════════════════════════════════════════════╝\n');
}

main().catch(e => { console.error('Setup failed:', e); process.exit(1); });
