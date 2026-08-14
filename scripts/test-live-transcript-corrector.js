/**
 * Tier 1 live transcript corrector smoke + microbench.
 * Usage: node scripts/test-live-transcript-corrector.js
 */
'use strict';

const { correctLiveTranscript } = require('../src/App/controller/liveTranscriptCorrector');

const cases = [
  ['collisions three two', 'Colossians three two'],
  ['jaymiah chapter 50', 'Jeremiah chapter 50'],
  ['the car is fast', 'the car is fast'],
  ['halleluya amen', 'hallelujah amen'],
  ['philippines two fifteen', 'Philippians two fifteen'],
];

let fail = 0;
for (const [input, expect] of cases) {
  const out = correctLiveTranscript(input);
  const ok = out === expect;
  console.log(ok ? 'PASS' : 'FAIL', JSON.stringify(input), '→', JSON.stringify(out), ok ? '' : `(want ${JSON.stringify(expect)})`);
  if (!ok) fail += 1;
}

const line = 'turning to collisions one fifteen and jaymiah chapter fifty with halleluya praise';
const t0 = Date.now();
for (let i = 0; i < 200; i++) correctLiveTranscript(line);
const ms = (Date.now() - t0) / 200;
console.log(`microbench avg ${ms.toFixed(3)} ms/line (budget < 5)`);
if (ms >= 5) {
  console.error('FAIL microbench');
  fail += 1;
} else {
  console.log('PASS microbench');
}

process.exitCode = fail ? 1 : 0;
