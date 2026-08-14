/**
 * Full Bible-book vocabulary audit against the loaded Vosk model.
 *
 * Uses vosk_recognizer_new_grm OOV warnings ("Ignoring word missing in vocabulary")
 * — the same signal Pass B grammar construction uses (FR-3.53).
 *
 * Usage:
 *   node scripts/audit-vosk-vocab.js
 *   node scripts/audit-vosk-vocab.js --report temp_output/vosk-vocab-audit.json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const MODEL = path.join(ROOT, 'voice_server/models/vosk-model-small-en-us-0.15');
const args = process.argv.slice(2);
const reportIdx = args.indexOf('--report');
const reportPath = reportIdx >= 0
  ? args[reportIdx + 1]
  : path.join(ROOT, 'temp_output/vosk-vocab-audit.json');

/** Canonical 66 books → tokens that must be in-vocab for ASR to emit the name. */
const BOOKS = [
  ['Genesis', ['genesis']],
  ['Exodus', ['exodus']],
  ['Leviticus', ['leviticus']],
  ['Numbers', ['numbers']],
  ['Deuteronomy', ['deuteronomy']],
  ['Joshua', ['joshua']],
  ['Judges', ['judges']],
  ['Ruth', ['ruth']],
  ['1 Samuel', ['samuel']],
  ['2 Samuel', ['samuel']],
  ['1 Kings', ['kings']],
  ['2 Kings', ['kings']],
  ['1 Chronicles', ['chronicles']],
  ['2 Chronicles', ['chronicles']],
  ['Ezra', ['ezra']],
  ['Nehemiah', ['nehemiah']],
  ['Esther', ['esther']],
  ['Job', ['job']],
  ['Psalms', ['psalms', 'psalm']],
  ['Proverbs', ['proverbs']],
  ['Ecclesiastes', ['ecclesiastes']],
  ['Song of Solomon', ['solomon']],
  ['Isaiah', ['isaiah']],
  ['Jeremiah', ['jeremiah']],
  ['Lamentations', ['lamentations']],
  ['Ezekiel', ['ezekiel']],
  ['Daniel', ['daniel']],
  ['Hosea', ['hosea']],
  ['Joel', ['joel']],
  ['Amos', ['amos']],
  ['Obadiah', ['obadiah']],
  ['Jonah', ['jonah']],
  ['Micah', ['micah']],
  ['Nahum', ['nahum']],
  ['Habakkuk', ['habakkuk']],
  ['Zephaniah', ['zephaniah']],
  ['Haggai', ['haggai']],
  ['Zechariah', ['zechariah']],
  ['Malachi', ['malachi']],
  ['Matthew', ['matthew']],
  ['Mark', ['mark']],
  ['Luke', ['luke']],
  ['John', ['john']],
  ['Acts', ['acts']],
  ['Romans', ['romans']],
  ['1 Corinthians', ['corinthians']],
  ['2 Corinthians', ['corinthians']],
  ['Galatians', ['galatians']],
  ['Ephesians', ['ephesians']],
  ['Philippians', ['philippians']],
  ['Colossians', ['colossians']],
  ['1 Thessalonians', ['thessalonians']],
  ['2 Thessalonians', ['thessalonians']],
  ['1 Timothy', ['timothy']],
  ['2 Timothy', ['timothy']],
  ['Titus', ['titus']],
  ['Philemon', ['philemon']],
  ['Hebrews', ['hebrews']],
  ['James', ['james']],
  ['1 Peter', ['peter']],
  ['2 Peter', ['peter']],
  ['1 John', ['john']],
  ['2 John', ['john']],
  ['3 John', ['john']],
  ['Jude', ['jude']],
  ['Revelation', ['revelation']],
];

const EXTRA = [
  'collisions', 'coalition', 'college', 'justin', 'justins',
  'thess', 'col', 'phil', 'gal',
];

function collectTokens() {
  const set = new Set(EXTRA);
  for (const [, toks] of BOOKS) toks.forEach((t) => set.add(t));
  return [...set].sort();
}

function runProbe(tokens) {
  const probe = `
const { Model, Recognizer, setLogLevel } = require('vosk-koffi');
setLogLevel(0);
const model = new Model(${JSON.stringify(MODEL)});
const grammar = ${JSON.stringify(tokens)}.concat(['[unk]']);
const r = new Recognizer({ model, sampleRate: 16000, grammar });
r.free();
model.free();
`;
  const res = spawnSync(process.execPath, ['-e', probe], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
    timeout: 120000,
  });
  return (res.stderr || '') + (res.stdout || '');
}

function main() {
  if (!fs.existsSync(MODEL)) {
    console.error('Model not found:', MODEL);
    process.exit(1);
  }
  const tokens = collectTokens();
  const stderr = runProbe(tokens);
  const missing = new Set();
  for (const m of stderr.matchAll(/Ignoring word missing in vocabulary:\s*'([^']+)'/gi)) {
    missing.add(m[1].toLowerCase());
  }

  const books = BOOKS.map(([book, toks]) => {
    const core = toks[0];
    const status = missing.has(core) ? 'MISSING' : 'PRESENT';
    let risk = 'LOW';
    if (status === 'MISSING') risk = 'HIGH_OOV';
    else if (core.length >= 10) risk = 'MEDIUM_LM'; // present but long — free decode may still lose
    return { book, core, status, risk, tokensChecked: toks };
  });

  const uniqueMissingCores = [...new Set(books.filter((b) => b.status === 'MISSING').map((b) => b.core))];
  const report = {
    generatedAt: new Date().toISOString(),
    model: path.basename(MODEL),
    method: 'vosk_recognizer_new_grm OOV warnings',
    missingTokens: [...missing].sort(),
    competitorCheck: EXTRA.map((w) => ({
      word: w,
      status: missing.has(w) ? 'MISSING' : 'PRESENT',
    })),
    books,
    summary: {
      uniqueMissingCores,
      missingBooks: books.filter((b) => b.status === 'MISSING').map((b) => b.book),
      presentLongLmRisk: books.filter((b) => b.risk === 'MEDIUM_LM').map((b) => b.book),
      presentOk: books.filter((b) => b.risk === 'LOW').map((b) => b.book),
    },
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`Model: ${report.model}`);
  console.log(`MISSING cores (${uniqueMissingCores.length}): ${uniqueMissingCores.join(', ')}`);
  console.log(`Books affected: ${report.summary.missingBooks.join(', ')}`);
  console.log(`PRESENT but long (LM risk): ${report.summary.presentLongLmRisk.join(', ')}`);
  console.log(`Wrote ${reportPath}`);
}

main();
