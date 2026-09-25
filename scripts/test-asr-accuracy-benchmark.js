/**
 * scripts/test-asr-accuracy-benchmark.js
 * Comprehensive ASR accuracy & Bible reference benchmark across voices/accents
 * using OCS native in-process Whisper.cpp (Metal accelerated) engine.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { smartBibleMatch } = require('../src/App/controller/smartBibleMatch.js');
const { buildWhisperInitialPrompt } = require('../src/main/asr/whisperPrompt.js');
const { transcribe } = require('../src/main/asr/whisperAddon.js');

const CANONICAL_BOOKS = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy',
  'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel',
  '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles',
  'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs',
  'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel',
  'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum',
  'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi',
  'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans',
  '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians',
  '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews',
  'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation',
].map((name, index) => ({ id: index + 1, name }));

const MODEL_PATH = path.resolve(__dirname, '../voice_server/models/whisper/ggml-distil-small.en.bin');
const SCRATCH_DIR = path.resolve(__dirname, '../scratch/asr_bench');

if (!fs.existsSync(SCRATCH_DIR)) {
  fs.mkdirSync(SCRATCH_DIR, { recursive: true });
}

const prompt = buildWhisperInitialPrompt({ maxChars: 600 });

async function transcribeAudio(wavPath) {
  const start = Date.now();
  try {
    const res = await transcribe({
      model: MODEL_PATH,
      fname_inp: wavPath,
      initial_prompt: prompt,
    });
    const latency = Date.now() - start;
    let fullText = '';
    if (res && res.transcription) {
      fullText = res.transcription.map(seg => seg[2] || '').join(' ').trim();
    }
    return { text: fullText, latency };
  } catch (err) {
    return { text: '', latency: Date.now() - start, error: err.message };
  }
}

async function runBenchmark() {
  console.log('========================================================================');
  console.log('OCS BIBLE VOICE RECOGNITION V2 — ASR AUDIO & RESOLUTION BENCHMARK');
  console.log('Engine: Native in-process Whisper.cpp (Metal Accelerated)');
  console.log(`Model:  ggml-distil-small.en.bin`);
  console.log('========================================================================\n');

  const VOICES = [
    { name: 'Samantha (US English)', id: 'Samantha' },
    { name: 'Daniel (UK English)', id: 'Daniel' },
    { name: 'Karen (Australian English)', id: 'Karen' },
  ];

  const TEST_PHRASES = [
    { spoken: 'Colossians 3 22', expected: 'Colossians 3:22' },
    { spoken: 'Colossians three twenty two', expected: 'Colossians 3:22' },
    { spoken: 'Colossians 322', expected: 'Colossians 3:22' },
    { spoken: 'John 3 16', expected: 'John 3:16' },
    { spoken: 'John three sixteen', expected: 'John 3:16' },
    { spoken: 'Romans 8 28', expected: 'Romans 8:28' },
    { spoken: 'Psalm 23 1', expected: 'Psalms 23:1' },
    { spoken: 'Second Corinthians 5 17', expected: '2 Corinthians 5:17' },
    { spoken: 'First Thessalonians 5 17', expected: '1 Thessalonians 5:17' },
    { spoken: 'Habakkuk 2 4', expected: 'Habakkuk 2:4' },
    { spoken: 'Revelation 21 4', expected: 'Revelation 21:4' },
  ];

  const results = [];

  for (const voice of VOICES) {
    console.log(`\n>>> Testing Voice: ${voice.name} (${voice.id})`);
    console.log('------------------------------------------------------------------------');

    for (const item of TEST_PHRASES) {
      const safeName = `${voice.id}_${item.spoken.replace(/[^a-z0-9]/gi, '_')}.wav`;
      const wavPath = path.join(SCRATCH_DIR, safeName);

      // Synthesize 16kHz mono WAV
      execSync(`say -v "${voice.id}" "${item.spoken}" -o "${wavPath}" --data-format=LEI16@16000`);

      // Run ASR
      const asr = await transcribeAudio(wavPath);

      // Run Resolver
      const match = await smartBibleMatch(asr.text, CANONICAL_BOOKS, null, null, {
        allowPass2: true,
        allowPass3: false,
        requireShape: true,
        allowBookOnly: false,
      });

      let resolved = 'NONE';
      if (match && match.bookIndex != null) {
        const b = CANONICAL_BOOKS[match.bookIndex]?.name;
        const range = match.endVerse && match.endVerse > match.startVerse ? `-${match.endVerse}` : '';
        resolved = `${b} ${match.chapter}:${match.startVerse}${range}`;
      }

      const pass = resolved === item.expected;
      results.push({
        voice: voice.id,
        spoken: item.spoken,
        rawAsr: asr.text,
        resolved,
        expected: item.expected,
        pass,
        latency: asr.latency,
      });

      console.log(`Spoken:   "${item.spoken}"`);
      console.log(`Raw ASR:  "${asr.text}"`);
      console.log(`Resolved: ${resolved} [${pass ? 'PASS' : 'FAIL'}] (${asr.latency}ms)\n`);
    }
  }

  // Summary Table
  console.log('\n========================================================================');
  console.log('BENCHMARK SUMMARY RESULTS TABLE');
  console.log('========================================================================');
  console.log('| Voice | Spoken | Raw ASR | Resolved | Status | Latency |');
  console.log('|-------|--------|---------|----------|--------|---------|');
  let totalPass = 0;
  let totalLat = 0;
  for (const r of results) {
    if (r.pass) totalPass++;
    totalLat += r.latency;
    console.log(`| ${r.voice.padEnd(8)} | ${r.spoken.padEnd(28)} | ${r.rawAsr.padEnd(24)} | ${r.resolved.padEnd(18)} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.latency}ms |`);
  }
  const avgLat = Math.round(totalLat / results.length);
  console.log('========================================================================');
  console.log(`TOTAL UTTERANCES: ${results.length} | PASSED: ${totalPass} | FAILED: ${results.length - totalPass}`);
  console.log(`ACCURACY: ${((totalPass / results.length) * 100).toFixed(1)}% | AVERAGE LATENCY: ${avgLat}ms`);
  console.log('========================================================================');

  // Clean up WAVs
  try {
    const files = fs.readdirSync(SCRATCH_DIR);
    for (const f of files) {
      if (f.endsWith('.wav')) fs.unlinkSync(path.join(SCRATCH_DIR, f));
    }
  } catch (_) {}
}

runBenchmark().catch(err => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
