/**
 * Validator tests for Tier 2 transcript cleanup (no Ollama required).
 * Usage: node scripts/test-transcript-cleanup-validate.js
 */
'use strict';

const path = require('path');
const fs = require('fs');
const {
  validateChunkCorrection,
} = require('../src/main/transcriptCleanup');

const fixturesPath = path.join(__dirname, 'fixtures', 'transcript-cleanup-cases.json');
const cases = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

let pass = 0;
let fail = 0;

function assert(cond, msg) {
  if (cond) {
    pass += 1;
    console.log('  PASS', msg);
  } else {
    fail += 1;
    console.error('  FAIL', msg);
  }
}

console.log('\nTier 2 cleanup validator fixtures\n');
for (const c of cases) {
  console.log(`${c.id}: ${c.notes || ''}`);
  const good = validateChunkCorrection(c.original, c.goodCorrection);
  const bad = validateChunkCorrection(c.original, c.badCorrection);
  assert(
    c.expectGoodAccepted ? good.ok : !good.ok,
    `${c.id} good → ok=${good.ok} reason=${good.reason || 'ok'} j=${(good.metrics?.jaccard ?? '').toString().slice(0, 5)}`
  );
  assert(
    c.expectBadRejected ? !bad.ok : bad.ok,
    `${c.id} bad → ok=${bad.ok} reason=${bad.reason || 'ok'}`
  );
}

console.log(`\nTOTAL PASS ${pass} FAIL ${fail}\n`);
process.exitCode = fail ? 1 : 0;
