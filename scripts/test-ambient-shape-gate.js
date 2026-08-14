/**
 * Ambient structural shape gate — false-positive audit + smoke tests.
 * Run: node scripts/test-ambient-shape-gate.js
 */
const path = require('path');
const fs = require('fs');

// Load Babel-free source via a tiny transpile: smartBibleMatch is ESM-ish with export.
// Use dynamic import through a webpack-free eval of the exported functions by requiring
// a CJS shim — the project file uses `export`, so we parse with a quick transform.
const srcPath = path.join(__dirname, '../src/App/controller/smartBibleMatch.js');
const src = fs.readFileSync(srcPath, 'utf8');

// Convert ESM exports to CJS for node test harness
const cjs = src
  .replace(/^export /gm, '')
  .replace(/export \{[^}]+\};?/g, '')
  + `\nmodule.exports = { matchReferenceShape, hasReferenceShape, hasAmbientReferenceShape, wordNumbersToDigits };\n`;

const tmp = path.join(__dirname, '.tmp-smartBibleMatch.cjs');
fs.writeFileSync(tmp, cjs);

let matchReferenceShape;
try {
  ({ matchReferenceShape } = require(tmp));
} finally {
  try { fs.unlinkSync(tmp); } catch (_) {}
}

const CASES = [
  ['Proverbs 24 verse 6', true, 'full'],
  ['John three sixteen', true, 'full'],
  ['Genesis chapter one', true, 'chapter'],
  ['First Corinthians thirteen four', true, 'full'],
  ['the book of Romans eight', true, 'book_of'], // or chapter — both ambient-complete

  ['we have twenty four members in this room', false, null],
  ["let's turn to the topic of forgiveness", false, null],
  ['Job had many trials in those days', false, null],
  ['Mark my words this will happen', false, null],
  ['Acts of kindness change a community', false, null],
  ['there were twelve disciples around him', false, null],
  ['James said something similar last week', false, null],
  ['verse 5', false, null], // short context — not ambient complete
];

let failed = 0;
for (const [phrase, expectComplete, expectKind] of CASES) {
  const r = matchReferenceShape(phrase);
  const kindOk = expectKind == null || r.kind === expectKind
    || (phrase.toLowerCase().includes('book of') && r.complete && (r.kind === 'book_of' || r.kind === 'chapter'));
  const ok = r.complete === expectComplete && kindOk;
  const shortOk = phrase === 'verse 5' ? r.shortContext === true && r.complete === false : true;
  if (!ok || !shortOk) {
    failed += 1;
    console.error('FAIL', phrase, { expectComplete, expectKind, got: r });
  } else {
    console.log('OK  ', expectComplete ? 'PASS  ' : 'REJECT', phrase, r.kind || (r.shortContext ? 'shortContext' : ''));
  }
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log(`\nAll ${CASES.length} ambient shape cases passed.`);
