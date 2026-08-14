#!/usr/bin/env node
/**
 * test-scene-read-along.js
 *
 * Runtime verification test suite for Scene Read-Along Auto-Advance (Phase 2.6):
 * - Task 1: Standalone ReferenceAligner (FR-5.31 / FR-5.34 / FR-5.36)
 *   - Fuzzy match with edit distance <= 2
 *   - Skip tolerance <= 2 tokens
 *   - Bounded backward resync (FR-5.34) with 3s rate limiting
 *   - Engine-agnostic payload handling (Vosk / Whisper normalized shapes)
 * - Task 2: Page-complete detection & auto-advance (FR-5.36–FR-5.39)
 *   - Page advances automatically on reaching final token
 *   - Advance does NOT fire early on partial/incomplete match
 *   - 500ms debounce window (FR-5.37) with single reset on trailing speech
 *   - 4-second no-match fallback suggestion prompt (FR-5.38)
 *   - Manual override (Space/Click/Companion) always functional (FR-5.39)
 * - Task 3: Manual mode isolation (0 aligner overhead when navMode is manual)
 *
 * Run: node scripts/test-scene-read-along.js
 */

'use strict';

const { ReferenceAligner } = require('../src/main/aligner/referenceAligner');
const { SceneAutoAdvanceManager } = require('../src/main/aligner/sceneAutoAdvance');

let passed = 0;
let failed = 0;

function assert(cond, label) {
  if (cond) {
    console.log(`PASS: ${label}`);
    passed++;
  } else {
    console.log(`FAIL: ${label}`);
    failed++;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE 1: ReferenceAligner Unit Tests (FR-5.31 / FR-5.34)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== 1. Reference Aligner Standalone Verification (FR-5.31) ===');

const aligner = new ReferenceAligner();
aligner.setReference('page-1', 'Amazing grace how sweet the sound that saved a wretch like me');

assert(aligner.tokens.length === 12, 'T1.1: Tokenized 12 reference words');
assert(aligner.cursor === -1, 'T1.2: Initial cursor is -1 (unmatched)');

// Exact match first words
let res = aligner.feed({ text: 'amazing grace', isFinal: true, role: 'final' });
assert(res !== null, 'T1.3: Matched "amazing grace"');
assert(res.wordIndex === 1, 'T1.4: Cursor advanced to index 1 ("grace")');
assert(res.activeWordIndex === 2, 'T1.4b: activeWordIndex is 2 (one-word-ahead = "how")');
assert(res.isComplete === false, 'T1.5: Not complete mid-page');

// Fuzzy match (edit distance 1 on "sweat" vs "sweet")
res = aligner.feed({ text: 'how sweat the sound', isFinal: true });
assert(res !== null, 'T1.6: Fuzzy match admitted "how sweat the sound" (dist <= 2)');
assert(res.wordIndex === 5, 'T1.7: Cursor advanced to index 5 ("sound")');

// Skip tolerance <= 2 (skipped "that", matched "saved a wretch")
res = aligner.feed({ text: 'saved a wretch', isFinal: true });
assert(res !== null, 'T1.8: Skip <= 2 admitted "saved a wretch"');
assert(res.wordIndex === 9, 'T1.9: Cursor advanced to index 9 ("wretch")');

// Final token match -> Page Complete (FR-5.36)
let completeFired = false;
aligner.once('complete', (info) => {
  completeFired = true;
});
res = aligner.feed({ text: 'like me', isFinal: true });
assert(res !== null, 'T1.10: Matched final tokens "like me"');
assert(res.wordIndex === 11, 'T1.11: Cursor at final index 11 ("me")');
assert(res.activeWordIndex === 11, 'T1.11b: activeWordIndex clamped to 11 (last token)');
assert(res.isComplete === true, 'T1.12: isComplete flag is true');
assert(completeFired === true, 'T1.13: complete event emitted (FR-5.36)');

// Bounded backward resync (FR-5.34)
console.log('\n=== 2. Bounded Backward Resync (FR-5.34) ===');
const resyncAligner = new ReferenceAligner();
resyncAligner.setReference('script-1', 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen');
resyncAligner.feed({ text: 'one two three four five six seven eight nine ten' });
assert(resyncAligner.cursor === 9, 'T2.1: Cursor advanced to index 9 ("ten")');

// Speaker backtracks and repeats "two three four"
// Since lastResyncTime is 0, cooldown is satisfied
let resyncEvent = null;
resyncAligner.once('update', (u) => {
  resyncEvent = u;
});
const backRes = resyncAligner.feed({ text: 'two three four' });
assert(backRes !== null, 'T2.2: Backward match admitted within 30 tokens');
assert(backRes.wordIndex === 3, 'T2.3: Cursor successfully resynced backward to index 3 ("four")');
assert(backRes.resync === true, 'T2.4: resync flag is true on update');

// Verify rate limiting on backward resync (3000ms cooldown)
resyncAligner.cursor = 10;
const rapidBackRes = resyncAligner.feed({ text: 'two three' });
assert(rapidBackRes === null, 'T2.5: Rapid second backward resync blocked by 3s cooldown (prevents oscillation)');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE 3: Scene Read-Along Auto-Advance State Machine (FR-5.36–FR-5.39)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== 3. Scene Read-Along Auto-Advance State Machine (FR-5.36–FR-5.39) ===');

async function runAutoAdvanceTests() {
  const testScene = {
    id: 'scene-grace-01',
    name: 'Amazing Grace',
    navMode: 'read_along',
    pages: [
      { id: 'p1', content: 'Amazing grace how sweet the sound' },
      { id: 'p2', content: 'Twas grace that taught my heart to fear' },
      { id: 'p3', content: 'Through many dangers toils and snares' },
    ],
  };

  const manager = new SceneAutoAdvanceManager({
    debounceMs: 50, // Short debounce for fast testing
    fallbackTimeoutMs: 150,
  });

  let advancedPages = [];
  manager.on('advance', (data) => {
    advancedPages.push(data);
  });

  manager.startScene(testScene, 0);
  assert(manager.isEnabled === true, 'T3.1: Read-Along mode enabled for scene');
  assert(manager.currentPageIndex === 0, 'T3.2: Started at page index 0');

  // Feed partial text (does not match end of page)
  manager.feed({ text: 'Amazing grace how' });
  assert(manager.currentPageIndex === 0, 'T3.3: Incomplete text did NOT trigger auto-advance');
  assert(manager.isPendingAdvance === false, 'T3.4: Not pending advance');

  // Feed final token to complete Page 1
  manager.feed({ text: 'sweet the sound' });
  assert(manager.isPendingAdvance === true, 'T3.5: Reached final token -> isPendingAdvance is true (FR-5.36)');

  // Wait for 50ms debounce window to expire
  await new Promise((resolve) => setTimeout(resolve, 80));

  assert(advancedPages.length === 1, 'T3.6: Auto-advance triggered after debounce window (FR-5.37)');
  assert(advancedPages[0].pageIndex === 1, 'T3.7: Transitioned to Page Index 1');
  assert(manager.currentPageIndex === 1, 'T3.8: Manager current page updated to 1');
  assert(manager.aligner.referenceId === 'scene-grace-01-p1', 'T3.9: Aligner automatically rebound to Page 2 tokens');

  // Complete Page 2
  manager.feed({ text: 'Twas grace that taught my heart to fear' });
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert(advancedPages.length === 2, 'T3.10: Auto-advanced Page 2 -> Page 3');
  assert(manager.currentPageIndex === 2, 'T3.11: Currently on Page Index 2');

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST SUITE 4: Fallback Suggestion Prompt on Stalled Match (FR-5.38)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n=== 4. No-Match Fallback Suggestion Prompt (FR-5.38) ===');

  let suggestPromptFired = null;
  manager.on('prompt:suggest', (p) => {
    suggestPromptFired = p;
  });

  // Reset to Page 0
  manager.setPage(0);
  assert(manager.currentPageIndex === 0, 'T4.1: Reset to page 0');

  // Feed initial speech
  manager.feed({ text: 'Amazing grace' });
  assert(manager.currentPageIndex === 0, 'T4.2: Mid-page text matched');

  // Wait for 150ms fallback timeout with no further progress
  await new Promise((resolve) => setTimeout(resolve, 200));
  manager.feed({ text: 'The weather is warm and pleasant today' });

  assert(suggestPromptFired !== null, 'T4.3: Fallback suggestion prompt surfaced after no-match timeout (FR-5.38)');
  assert(suggestPromptFired.targetPageIndex === 1, 'T4.4: Suggestion points to Next Page');

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST SUITE 5: Manual Override Always Functional (FR-5.39)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n=== 5. Manual Override Always Available (FR-5.39) ===');

  let promptCleared = false;
  manager.once('prompt:clear', () => {
    promptCleared = true;
  });

  manager.manualAdvance();
  assert(manager.currentPageIndex === 1, 'T5.1: manualAdvance() forced transition to Page 1');
  assert(promptCleared === true, 'T5.2: Suggestion prompt cleared on manual advance');

  manager.manualPrev();
  assert(manager.currentPageIndex === 0, 'T5.3: manualPrev() forced transition back to Page 0');

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST SUITE 6: Manual Mode Isolation (0 Aligner CPU overhead)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n=== 6. Manual Mode Isolation ===');

  const manualScene = {
    id: 'scene-manual-01',
    name: 'Manual Scene',
    navMode: 'manual',
    pages: [{ id: 'p1', content: 'Manual page content' }],
  };

  manager.startScene(manualScene, 0);
  assert(manager.isEnabled === false, 'T6.1: Aligner is disabled when navMode is manual');
  const feedResult = manager.feed({ text: 'Manual page content' });
  assert(feedResult === null, 'T6.2: feed() returns null immediately when Read-Along is disabled (0 CPU)');

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST SUITE 7: Song Chorus Flow Auto-Advance Sequence
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n=== 7. Song Chorus Flow Auto-Advance Sequence ===');

  const songScene = {
    id: 'scene-worship-01',
    name: 'Way Maker',
    sceneType: 'song',
    autoChorus: true,
    navMode: 'read_along',
    pages: [
      { id: 'v1', content: 'You are here moving in our midst I worship You', sectionType: 'verse', label: 'Verse 1' },
      { id: 'ch', content: 'Way maker miracle worker promise keeper light in the darkness', sectionType: 'chorus', label: 'Chorus' },
      { id: 'v2', content: 'You are here touching every heart I worship You', sectionType: 'verse', label: 'Verse 2' },
    ],
    sequence: [
      { pageIndex: 0, label: 'Verse 1', sectionType: 'verse' },
      { pageIndex: 1, label: 'Chorus', sectionType: 'chorus' },
      { pageIndex: 2, label: 'Verse 2', sectionType: 'verse' },
      { pageIndex: 1, label: 'Chorus', sectionType: 'chorus', isAutoInserted: true },
    ],
  };

  const songManager = new SceneAutoAdvanceManager({
    debounceMs: 50,
    fallbackTimeoutMs: 150,
  });

  let songSteps = [];
  songManager.on('advance', (data) => {
    songSteps.push(data);
  });

  songManager.startScene(songScene, 0, 0);
  assert(songManager.currentPageIndex === 0, 'T7.1: Started on Verse 1 (Page Index 0)');
  assert(songManager.currentSequenceIndex === 0, 'T7.2: Sequence index is 0');

  // Complete Verse 1 -> Advances to Chorus
  songManager.feed({ text: 'moving in our midst I worship You' });
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert(songSteps.length === 1, 'T7.3: Auto-advanced from Verse 1');
  assert(songSteps[0].pageIndex === 1, 'T7.4: Advanced to Chorus (Page Index 1)');
  assert(songSteps[0].label === 'Chorus', 'T7.5: Step label is Chorus');

  // Complete Chorus -> Advances to Verse 2
  songManager.feed({ text: 'promise keeper light in the darkness' });
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert(songSteps.length === 2, 'T7.6: Auto-advanced from Chorus');
  assert(songSteps[1].pageIndex === 2, 'T7.7: Advanced to Verse 2 (Page Index 2)');
  assert(songSteps[1].label === 'Verse 2', 'T7.8: Step label is Verse 2');

  // Complete Verse 2 -> Automatically returns to Chorus!
  songManager.feed({ text: 'touching every heart I worship You' });
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert(songSteps.length === 3, 'T7.9: Auto-advanced from Verse 2');
  assert(songSteps[2].pageIndex === 1, 'T7.10: Chorus Flow returned to Chorus (Page Index 1)');
  assert(songSteps[2].label === 'Chorus', 'T7.11: Step label is Chorus');

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST SUITE 8: Cross-Section Lookahead & Near-End Fast Auto-Advance (< 2s)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n=== 8. Cross-Section Lookahead & Fast Advance ===');

  const fastScene = {
    id: 'scene-fast-01',
    name: 'Fast Transition Song',
    sceneType: 'song',
    autoChorus: true,
    navMode: 'read_along',
    pages: [
      { id: 'v1', content: 'The Lord is my shepherd I shall not want He makes me lie down', sectionType: 'verse', label: 'Verse 1' },
      { id: 'ch', content: 'Surely goodness and mercy shall follow me all the days of my life', sectionType: 'chorus', label: 'Chorus' },
    ],
    sequence: [
      { pageIndex: 0, label: 'Verse 1', sectionType: 'verse' },
      { pageIndex: 1, label: 'Chorus', sectionType: 'chorus' },
    ],
  };

  const fastManager = new SceneAutoAdvanceManager({
    debounceMs: 30,
    fallbackTimeoutMs: 100,
  });

  let fastSteps = [];
  fastManager.on('advance', (data) => {
    fastSteps.push(data);
  });

  fastManager.startScene(fastScene, 0, 0);

  // Singer starts mid-verse and then immediately begins singing Chorus ("Surely goodness")
  fastManager.feed({ text: 'The Lord is my shepherd' });
  assert(fastManager.currentPageIndex === 0, 'T8.1: Mid-verse matched on Verse 1');

  // Singer jumps to Chorus early -> Cross-Section Lookahead detects and instantly auto-advances
  fastManager.feed({ text: 'Surely goodness and mercy' });
  assert(fastSteps.length === 1, 'T8.2: Cross-Section Lookahead instantly triggered advance');
  assert(fastSteps[0].pageIndex === 1, 'T8.3: Transitioned directly to Chorus');
  assert(fastManager.currentPageIndex === 1, 'T8.4: Current page updated to Chorus');

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST SUITE 9: Verse & Chorus Repeats (X2, X3) Sequence Flow
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n=== 9. Verse & Chorus Repeats (X2, X3) Flow ===');

  const repeatScene = {
    id: 'scene-repeat-01',
    name: 'Goodness of God',
    sceneType: 'song',
    autoChorus: true,
    navMode: 'read_along',
    pages: [
      { id: 'v1', content: 'I love Your voice You have led me through the fire', sectionType: 'verse', label: 'Verse 1', repeatCount: 1 },
      { id: 'ch', content: 'All my life You have been faithful All my life You have been so so good', sectionType: 'chorus', label: 'Chorus', repeatCount: 2 },
    ],
  };

  // Build sequence
  function buildTestSequence(scene) {
    const isSong = scene.sceneType === 'song';
    const chorusIdx = scene.pages.findIndex(p => p.sectionType === 'chorus');
    const chorusPage = scene.pages[chorusIdx];
    const chorusRepeats = Math.max(1, chorusPage?.repeatCount || 1);
    const chorusLabel = chorusPage?.label || 'Chorus';

    const sequence = [];
    scene.pages.forEach((p, idx) => {
      const sType = p.sectionType || (idx === chorusIdx ? 'chorus' : 'verse');
      const count = Math.max(1, p.repeatCount || 1);
      const baseLabel = p.label || `Verse ${idx + 1}`;

      for (let r = 1; r <= count; r++) {
        sequence.push({
          pageIndex: idx,
          label: count > 1 ? `${baseLabel} (${r}/${count})` : baseLabel,
          sectionType: sType,
          repeatIndex: r,
          repeatTotal: count,
        });
      }
      if (sType === 'verse' && scene.autoChorus) {
        const nextSec = scene.pages[idx + 1];
        if (!nextSec || nextSec.sectionType !== 'chorus') {
          for (let r = 1; r <= chorusRepeats; r++) {
            sequence.push({
              pageIndex: chorusIdx,
              label: chorusRepeats > 1 ? `${chorusLabel} (${r}/${chorusRepeats})` : chorusLabel,
              sectionType: 'chorus',
              repeatIndex: r,
              repeatTotal: chorusRepeats,
              isAutoInserted: true,
            });
          }
        }
      }
    });
    return sequence;
  }

  const repeatSeq = buildTestSequence(repeatScene);
  assert(repeatSeq.length === 3, 'T9.1: Sequence generated 3 steps: Verse 1, Chorus (1/2), Chorus (2/2)');
  assert(repeatSeq[0].label === 'Verse 1', 'T9.2: Step 0 is Verse 1');
  assert(repeatSeq[1].label === 'Chorus (1/2)', 'T9.3: Step 1 is Chorus (1/2)');
  assert(repeatSeq[2].label === 'Chorus (2/2)', 'T9.4: Step 2 is Chorus (2/2)');

  const repeatManager = new SceneAutoAdvanceManager({
    debounceMs: 30,
    fallbackTimeoutMs: 100,
  });

  let repeatSteps = [];
  repeatManager.on('advance', (data) => {
    repeatSteps.push(data);
  });

  repeatManager.startScene({ ...repeatScene, sequence: repeatSeq }, 0, 0);
  assert(repeatManager.isEnabled === true, 'T9.5: Song auto-enabled Sing-Along mode');

  // Complete Verse 1 -> Advances to Chorus (1/2)
  repeatManager.feed({ text: 'led me through the fire' });
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert(repeatSteps.length === 1, 'T9.6: Advanced from Verse 1');
  assert(repeatSteps[0].label === 'Chorus (1/2)', 'T9.7: Advanced to Chorus 1st repeat');

  // Complete Chorus 1st time -> Advances to Chorus (2/2)
  repeatManager.feed({ text: 'so so good' });
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert(repeatSteps.length === 2, 'T9.8: Advanced from Chorus 1st repeat');
  assert(repeatSteps[1].label === 'Chorus (2/2)', 'T9.9: Advanced to Chorus 2nd repeat');

  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`\nScene Read-Along Test Results: ${passed} passed, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

runAutoAdvanceTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
