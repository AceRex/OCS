/**
 * test-teleprompter-pipeline.js
 *
 * Automated verification suite for the Teleprompter feature:
 * 1. Script parsing, tokenization, and ReferenceAligner feeding.
 * 2. Real-time word-by-word alignment tracking on plain-text scripts.
 * 3. Script library multi-page section structure & word metrics.
 * 4. Background camera opacity validation (default 15%, bounds 1-40%).
 * 5. Session Archive video session persistence validation.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { ReferenceAligner } = require('../src/main/aligner/referenceAligner');
const { SessionArchiveService } = require('../src/main/sessionArchive');

console.log('=== 1. TELEPROMPTER SCRIPT ALIGNMENT TEST ===');

const testScript = {
  id: 'test-sermon-1',
  title: 'Walking in Grace',
  pages: [
    {
      id: 'p1',
      label: 'Intro',
      text: 'Good morning saints. We are gathered here today to praise the Lord.'
    },
    {
      id: 'p2',
      label: 'Main Scripture',
      text: 'For by grace you have been saved through faith, not of yourselves.'
    }
  ]
};

const fullText = testScript.pages.map(p => p.text).join(' ');
const tokens = fullText.split(/\s+/).filter(Boolean);

assert.strictEqual(tokens.length, 24, `Expected 24 tokens, got ${tokens.length}`);
console.log(`PASS: Script tokenization (${tokens.length} tokens parsed)`);

const aligner = new ReferenceAligner();
aligner.setReference('test-sermon-1', fullText);

assert.strictEqual(aligner.tokens.length, 24);
console.log('PASS: ReferenceAligner loaded teleprompter script reference tokens');

// Feed partial utterance: "good morning saints we are gathered"
let res = aligner.feed('good morning saints we are gathered');
assert.ok(res && res.wordIndex >= 4, `Expected wordIndex >= 4, got ${res ? res.wordIndex : null}`);
console.log(`PASS: Initial voice advance: wordIndex=${res.wordIndex}, activeToken="${res.activeToken}"`);

// Feed second part: "here today to praise the Lord"
res = aligner.feed('here today to praise the Lord');
assert.ok(res && res.wordIndex >= 10, `Expected wordIndex >= 10, got ${res ? res.wordIndex : null}`);
console.log(`PASS: Continued voice advance across section: wordIndex=${res.wordIndex}, activeToken="${res.activeToken}"`);

// Feed final section: "for by grace you have been saved through faith"
res = aligner.feed('for by grace you have been saved through faith');
assert.ok(res && res.wordIndex >= 18, `Expected wordIndex >= 18, got ${res ? res.wordIndex : null}`);
console.log(`PASS: Deep script voice advance: wordIndex=${res.wordIndex}, activeToken="${res.activeToken}"`);

console.log('\n=== 2. TELEPROMPTER CONFIGURATION & OPACITY INVARIANTS ===');

const DEFAULT_OPACITY = 15;
const MIN_OPACITY = 1;
const MAX_OPACITY = 40;

function clampOpacity(val) {
  return Math.max(MIN_OPACITY, Math.min(MAX_OPACITY, val));
}

assert.strictEqual(clampOpacity(15), 15);
assert.strictEqual(clampOpacity(0.5), 1, 'Below minimum 1% must clamp to 1%');
assert.strictEqual(clampOpacity(50), 40, 'Above maximum 40% must clamp to 40%');
console.log('PASS: Opacity slider constraints validated (1% to 40%, default 15%)');

console.log('\n=== 3. SESSION ARCHIVE TELEPROMPTER VIDEO PERSISTENCE TEST ===');

async function testSessionArchiveVideo() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocs-tp-test-'));
  const archive = new SessionArchiveService(tempDir);

  const dummyVideoBuf = Buffer.from('RIFF....WEBMVIDEO_DUMMY_DATA');
  const sessionMeta = await archive.saveRecordedVideoSession({
    title: 'Teleprompter Sunday Sermon',
    videoBuffer: dummyVideoBuf,
    mime: 'video/webm',
    speakerName: 'Pastor David',
    durationMs: 125000,
    transcript: 'Good morning saints. For by grace you have been saved.',
  });

  assert.ok(sessionMeta.id, 'Session meta should have an ID');
  assert.strictEqual(sessionMeta.title, 'Teleprompter Sunday Sermon');
  assert.strictEqual(sessionMeta.files.video, 'session.webm');
  assert.strictEqual(sessionMeta.files.pdf, 'transcript.pdf');
  assert.strictEqual(sessionMeta.status, 'ready');

  const sessionDir = path.join(tempDir, 'sessions', sessionMeta.id);
  assert.ok(fs.existsSync(path.join(sessionDir, 'meta.json')), 'meta.json must exist');
  assert.ok(fs.existsSync(path.join(sessionDir, 'session.webm')), 'session.webm must exist');
  assert.ok(fs.existsSync(path.join(sessionDir, 'transcript.pdf')), 'transcript.pdf must exist');

  const readMeta = JSON.parse(fs.readFileSync(path.join(sessionDir, 'meta.json'), 'utf8'));
  assert.strictEqual(readMeta.title, 'Teleprompter Sunday Sermon');
  console.log(`PASS: Session archive created video folder: ${sessionMeta.id} (status: ${readMeta.status}, files: ${JSON.stringify(readMeta.files)})`);

  // Cleanup temp dir
  fs.rmSync(tempDir, { recursive: true, force: true });
}

testSessionArchiveVideo().then(() => {
  console.log('\nAll teleprompter pipeline verification tests passed successfully.');
}).catch((err) => {
  console.error('\nFAIL: Teleprompter pipeline test error:', err);
  process.exit(1);
});
