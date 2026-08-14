/**
 * Real ASR suite: Piper TTS (spoken) → whisper/vosk → smartBibleMatch.
 * Side-by-side vs resolver baseline.
 *
 * Usage:
 *   node scripts/run-asr-suite.js
 *   node scripts/run-asr-suite.js --engine whisper
 *   node scripts/run-asr-suite.js --limit 10
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const sqlite3 = require('sqlite3');

const ROOT = path.join(__dirname, '..');
const SUITE = path.join(ROOT, 'voice-test-cases.json');
const OUT_DIR = path.join(ROOT, 'temp_output/asr-suite');
const WAV_DIR = path.join(OUT_DIR, 'wav');

const args = process.argv.slice(2);
const engineArg = args.includes('--engine') ? args[args.indexOf('--engine') + 1] : 'both';
const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1], 10) : Infinity;

function findPiper() {
  const bin = process.platform === 'win32' ? 'piper.exe' : 'piper';
  const p = path.join(ROOT, 'voice_server', 'piper', bin);
  return fs.existsSync(p) ? p : null;
}

function findVoice() {
  const v = path.join(ROOT, 'voice_server', 'piper_voices', 'en_US-amy-medium.onnx');
  return fs.existsSync(v) ? v : null;
}

function ttsToWav(piper, voice, text, wavPath) {
  fs.mkdirSync(path.dirname(wavPath), { recursive: true });
  // piper reads text from stdin, writes wav
  const r = spawnSync(piper, ['--model', voice, '--output_file', wavPath], {
    input: text + '\n',
    encoding: 'utf8',
    timeout: 60000,
  });
  if (r.status !== 0 || !fs.existsSync(wavPath)) {
    throw new Error(`piper failed: ${r.stderr || r.stdout || r.status}`);
  }
  return wavPath;
}

function wavToFloat32(wavPath) {
  const buf = fs.readFileSync(wavPath);
  // Minimal WAV parse: find 'data' chunk
  let offset = 12;
  let dataOffset = -1;
  let dataSize = 0;
  let sampleRate = 16000;
  let bits = 16;
  let channels = 1;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(offset + 10);
      sampleRate = buf.readUInt32LE(offset + 12);
      bits = buf.readUInt16LE(offset + 22);
    } else if (id === 'data') {
      dataOffset = offset + 8;
      dataSize = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (dataOffset < 0) throw new Error('no data chunk');
  const samples = Math.floor(dataSize / (bits / 8) / channels);
  const float32 = new Float32Array(samples);
  if (bits === 16) {
    for (let i = 0; i < samples; i++) {
      // take first channel
      const s = buf.readInt16LE(dataOffset + i * channels * 2);
      float32[i] = s / 32768;
    }
  } else {
    throw new Error(`unsupported bits ${bits}`);
  }
  // Resample naive if not 16k
  if (sampleRate !== 16000) {
    const ratio = sampleRate / 16000;
    const outLen = Math.floor(samples / ratio);
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) out[i] = float32[Math.floor(i * ratio)] || 0;
    return out;
  }
  return float32;
}

async function whisperTranscribe(float32, modelPath, prompt) {
  const whisper = require('@kutalia/whisper-node-addon');
  const result = await whisper.transcribe({
    model: modelPath,
    pcmf32: float32,
    language: 'en',
    use_gpu: true,
    no_prints: true,
    no_timestamps: true,
    translate: false,
    initial_prompt: prompt,
  });
  if (typeof result === 'string') return result;
  if (Array.isArray(result?.transcription)) {
    return result.transcription.map((row) => (Array.isArray(row) ? row[row.length - 1] : row)).join(' ');
  }
  return String(result?.text || '');
}

function loadBooks() {
  const dbPath = path.join(ROOT, 'src', 'Bible', 'bibles.db');
  const db = new sqlite3.Database(dbPath);
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM books ORDER BY id', [], (err, rows) => {
      db.close();
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function main() {
  fs.mkdirSync(WAV_DIR, { recursive: true });
  const suite = JSON.parse(fs.readFileSync(SUITE, 'utf8'));
  const cases = suite.cases.filter((c) => ['A', 'B', 'C', 'H'].includes(c.category)).slice(0, limit);

  const piper = findPiper();
  const voice = findVoice();
  if (!piper || !voice) {
    console.error('Piper TTS not installed. Run npm run setup:voice');
    process.exit(1);
  }

  const { resolveWhisperModel } = require(path.join(ROOT, 'src/main/whisperEngine'));
  const { buildWhisperInitialPrompt } = require(path.join(ROOT, 'src/main/whisperPrompt'));
  const modelMeta = resolveWhisperModel(ROOT);
  const prompt = buildWhisperInitialPrompt();

  const books = await loadBooks();
  const { smartBibleMatch } = await import(path.join(ROOT, 'src/App/controller/smartBibleMatch.js'));

  const rows = [];
  for (const c of cases) {
    const spoken = c.spoken || c.heard;
    const wav = path.join(WAV_DIR, `${c.id}.wav`);
    let heardWhisper = null;
    let refWhisper = null;
    let err = null;
    try {
      if (!fs.existsSync(wav)) ttsToWav(piper, voice, spoken, wav);
      if ((engineArg === 'whisper' || engineArg === 'both') && modelMeta) {
        const f32 = wavToFloat32(wav);
        heardWhisper = (await whisperTranscribe(f32, modelMeta.path, prompt)).toLowerCase();
        const m = await smartBibleMatch(heardWhisper, books, null, null, {
          allowPass2: true,
          allowPass3: !!c.allowPass3,
          requireShape: !c.triggerArmed,
        });
        if (m && !m.needsConfirmation) {
          refWhisper = `${books[m.bookIndex].name} ${m.chapter}:${m.startVerse}`;
        }
      } else if (!modelMeta) {
        err = 'no_whisper_model';
      }
    } catch (e) {
      err = e.message;
    }

    // Resolver path on suite "heard" (Vosk baseline simulation)
    let refResolver = null;
    try {
      const m2 = await smartBibleMatch(c.heard, books, null, null, {
        allowPass2: true,
        allowPass3: !!c.allowPass3,
        requireShape: !c.triggerArmed,
      });
      if (m2 && !m2.needsConfirmation) {
        refResolver = `${books[m2.bookIndex].name} ${m2.chapter}:${m2.startVerse}`;
      }
    } catch (_) {}

    const expect = c.expect?.ref ?? null;
    const whisperOk = expect == null ? refWhisper == null : refWhisper === expect;
    const resolverOk = expect == null ? refResolver == null : refResolver === expect;

    rows.push({
      id: c.id,
      category: c.category,
      spoken,
      expect,
      heardSuite: c.heard,
      heardWhisper,
      refResolver,
      refWhisper,
      whisperOk,
      resolverOk,
      err,
    });
    const mark = whisperOk ? 'PASS' : (err ? 'SKIP' : 'FAIL');
    console.log(`${mark} ${c.id} expect=${expect} whisper=${refWhisper} heard=${JSON.stringify(heardWhisper)?.slice(0, 80)}`);
  }

  const byCat = {};
  for (const r of rows) {
    if (!byCat[r.category]) byCat[r.category] = { pass: 0, fail: 0, skip: 0 };
    if (r.err) byCat[r.category].skip += 1;
    else if (r.whisperOk) byCat[r.category].pass += 1;
    else byCat[r.category].fail += 1;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    engine: engineArg,
    model: modelMeta?.name || null,
    byCat,
    rows,
  };
  const out = path.join(OUT_DIR, 'report.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log('\nCategory summary:', byCat);
  console.log('Wrote', out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
