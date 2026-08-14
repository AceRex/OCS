/**
 * Session audio progress mapping tests (encode bar reaches proper bands).
 * Usage: node scripts/test-session-progress-map.js
 */
'use strict';

const { mapAudioProgressToOverall, ENCODE_LO, ENCODE_HI, WRITE_LO, WRITE_HI } = require('../src/main/sessionProgressMap');

let fail = 0;
function assert(cond, msg) {
  if (cond) console.log('PASS', msg);
  else {
    console.error('FAIL', msg);
    fail += 1;
  }
}

// Short session: writing completes → ~12/32 (~37%), not stuck at 84%
{
  const endWrite = mapAudioProgressToOverall({ phase: 'writing', phaseRatio: 1 });
  assert(endWrite.current === WRITE_HI, `short write end current=${endWrite.current} want ${WRITE_HI}`);
  assert(endWrite.percent === Math.round((WRITE_HI / 32) * 100), `short write %=${endWrite.percent}`);
}

// Multi-hour encode: mid encode must sit in 12–28 band and move with ratio
{
  const mid = mapAudioProgressToOverall({ phase: 'encoding', phaseRatio: 0.5 });
  assert(mid.current >= ENCODE_LO && mid.current <= ENCODE_HI, `mid encode in band (${mid.current})`);
  assert(mid.current === ENCODE_LO + Math.round(0.5 * (ENCODE_HI - ENCODE_LO)), 'mid encode math');
  const endEnc = mapAudioProgressToOverall({ phase: 'encoding', phaseRatio: 1 });
  assert(endEnc.current === ENCODE_HI, `encode end=${endEnc.current}`);
  assert(endEnc.percent === Math.round((ENCODE_HI / 32) * 100), `encode end %=${endEnc.percent}`);
}

// Done audio phase maps to encode hi (28) — PDF/archive walks 29→32→100%
{
  const done = mapAudioProgressToOverall({ phase: 'done', phaseRatio: 1 });
  assert(done.current === ENCODE_HI && done.percent === 88, `audio done → ${done.current}/${done.percent}`);
}

// Large write step count must NOT compress encode into 1% (old bug)
{
  // Legacy percent from huge writeSteps≈400/426 ≈ 0.94 of whole audio
  const wrongOldStyle = mapAudioProgressToOverall({ phase: 'encoding', phaseRatio: 0.1 });
  assert(wrongOldStyle.percent < 90, `encode early still <90% (${wrongOldStyle.percent})`);
  assert(wrongOldStyle.current < ENCODE_HI, 'encode early not at ceiling');
}

process.exitCode = fail ? 1 : 0;
if (!fail) console.log('\nAll session-progress-map tests passed.');
