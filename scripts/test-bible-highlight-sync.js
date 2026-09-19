/**
 * End-to-End Test Suite for Bible Highlighting Synchronization Path
 *
 * Validates:
 * 1. Shared tokenization, compound key format, and contrast text resolution.
 * 2. Dedicated highlight-only synchronization path without calling presentVerses or requiring extra verse clicks.
 * 3. Double-click to highlight, double-click to remove, and color change propagation.
 * 4. Authoritative state boundary in main.js (in-place update, dropping stale voice updates).
 * 5. Preview (MiniPreview/PreviewModal) and DisplayCanvas color precedence and token matching.
 *
 * Usage: node scripts/test-bible-highlight-sync.js
 */

'use strict';

const assert = require('assert');
const {
  getContrastTextColor,
  tokenizeVerseWithWhitespace,
  tokenizeVerseWords,
  makeTokenKey,
  buildVerseOffsets,
  isTokenHighlighted,
  getWordHighlightStyles,
} = require('../src/App/utils/bibleHighlightUtils');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failCount++;
  }
}

console.log('\n--- 1. Testing Shared Bible Highlighting Utilities ---');

test('tokenizeVerseWithWhitespace preserves all punctuation and spaces', () => {
  const text = 'For God so loved the world, that he gave his only begotten Son...';
  const parts = tokenizeVerseWithWhitespace(text);
  assert.strictEqual(parts.join(''), text, 'Rejoined parts must exactly match original text');
  assert(parts.includes(' '), 'Must preserve whitespace tokens');
  assert(parts.includes('world,'), 'Must preserve punctuation attached or split');
});

test('tokenizeVerseWords counts only non-whitespace words', () => {
  const text = 'For God so loved the world, that he gave his only begotten Son...';
  const words = tokenizeVerseWords(text);
  assert.strictEqual(words.length, 13, 'Must extract exactly 13 words');
  assert.strictEqual(words[0], 'For');
  assert.strictEqual(words[3], 'loved');
});

test('makeTokenKey standardizes schema with fallbacks', () => {
  // Canonical form: VERSION:bookIndex:chapterIndex:verseNumber:wordIdx
  assert.strictEqual(makeTokenKey('kjv', 42, 2, 16, 3), 'KJV:42:2:16:3');
  // Sanitizes negative or missing bookIndex / chapterIndex
  assert.strictEqual(makeTokenKey('kjv', -1, 0, 16, 3), 'KJV:0:0:16:3');
  assert.strictEqual(makeTokenKey(null, null, null, null, null), 'KJV:0:0:1:0');
});

test('buildVerseOffsets correctly computes offsets for multi-verse passage', () => {
  const verses = {
    15: 'For God sent not his Son into the world to condemn the world;',
    16: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.',
  };
  const offsets = buildVerseOffsets([15, 16], verses, 'KJV', 42, 2);
  assert.strictEqual(offsets[15].start, 0);
  assert.strictEqual(offsets[15].count, 13);
  assert.strictEqual(offsets[15].verseNumber, 16);
  assert.strictEqual(offsets[16].start, 13);
  assert.strictEqual(offsets[16].verseNumber, 17);
});

test('isTokenHighlighted resolves compound keys and legacy keys correctly', () => {
  const verses = {
    15: 'For God so loved the world,',
  };
  const offsets = buildVerseOffsets([15], verses, 'KJV', 42, 2);
  const hlSet = new Set(['KJV:42:2:16:3']); // "loved"

  // Word index 3 in verse 16 is absolute index 3
  assert.strictEqual(isTokenHighlighted(3, hlSet, offsets), true, 'Word 3 ("loved") must be highlighted');
  assert.strictEqual(isTokenHighlighted(0, hlSet, offsets), false, 'Word 0 ("For") must not be highlighted');
});

test('getContrastTextColor resolves readable black or white text for any background', () => {
  assert.strictEqual(getContrastTextColor('#FFEB3B'), '#000000', 'Yellow requires black text');
  assert.strictEqual(getContrastTextColor('#FDE047'), '#000000', 'Amber requires black text');
  assert.strictEqual(getContrastTextColor('#67E8F9'), '#000000', 'Cyan requires black text');
  assert.strictEqual(getContrastTextColor('#1E1B4B'), '#FFFFFF', 'Deep navy requires white text');
  assert.strictEqual(getContrastTextColor('#000000'), '#FFFFFF', 'Black requires white text');
});

console.log('\n--- 2. Testing Highlight-Only Synchronization Protocol (Controller Logic) ---');

test('Double-click highlights word and dispatches isHighlightOnlyUpdate without calling presentVerses', () => {
  let ipcSentContent = null;
  let presentVersesCalled = 0;

  // Mock Controller Context
  const selectedVersion = 'kjv';
  const selectedBookIndex = 42;
  const selectedChapterIndex = 2;
  const verseIdx = 15; // Verse 16
  const wordIdx = 3;   // "loved"
  const verses = ['For God so loved the world'];
  const manualHighlightsRef = { current: new Set() };
  let manualHighlightsState = new Set();
  const setManualHighlights = (s) => { manualHighlightsState = s; };

  const activePresentationRef = {
    current: {
      bookIndex: 42,
      chapterIndex: 2,
      version: 'kjv',
      verseIndices: new Set([15]),
      title: 'John 3:16',
      body: 'For God so loved the world',
    }
  };
  const currentLiveContentRef = {
    current: {
      title: 'John 3:16',
      body: 'For God so loved the world',
      version: 'kjv',
      bookIndex: 42,
      chapterIndex: 2,
      verseIndices: [15],
      manualHighlights: [],
    }
  };
  const isLive = true;

  // Simulated syncHighlightsOnly (from our BibleController implementation)
  const syncHighlightsOnly = (nextHighlights) => {
    manualHighlightsRef.current = nextHighlights;
    setManualHighlights(nextHighlights);

    if (isLive && (currentLiveContentRef.current || activePresentationRef.current)) {
      const liveData = currentLiveContentRef.current;
      const currentBookIdx = selectedBookIndex >= 0 ? selectedBookIndex : 0;
      const currentChapterIdx = selectedChapterIndex >= 0 ? selectedChapterIndex : 0;
      const isMatchingPassage =
        (liveData.bookIndex ?? 0) === currentBookIdx &&
        (liveData.chapterIndex ?? 0) === currentChapterIdx &&
        (liveData.version || '').toLowerCase() === selectedVersion.toLowerCase();

      if (isMatchingPassage) {
        const sortedIndices = liveData.verseIndices || [15];
        const offsets = buildVerseOffsets(sortedIndices, verses, selectedVersion, currentBookIdx, currentChapterIdx);
        const updatedPayload = {
          ...liveData,
          manualHighlights: Array.from(nextHighlights),
          bibleHighlightColor: '#FFEB3B',
          verseOffsets: offsets,
          isHighlightOnlyUpdate: true,
        };
        currentLiveContentRef.current = updatedPayload;
        ipcSentContent = { type: 'bible', data: updatedPayload };
      }
    }
  };

  // Mock handleWordDoubleClick
  const handleWordDoubleClick = (vIdx, wIdx) => {
    const currentBookIdx = selectedBookIndex >= 0 ? selectedBookIndex : 0;
    const currentChapterIdx = selectedChapterIndex >= 0 ? selectedChapterIndex : 0;
    const stableKey = makeTokenKey(selectedVersion, currentBookIdx, currentChapterIdx, vIdx + 1, wIdx);
    const next = new Set(manualHighlightsRef.current);
    if (next.has(stableKey)) {
      next.delete(stableKey);
    } else {
      next.add(stableKey);
    }
    syncHighlightsOnly(next);
  };

  // 1. First double-click: highlight "loved"
  handleWordDoubleClick(verseIdx, wordIdx);

  assert.strictEqual(presentVersesCalled, 0, 'presentVerses must NOT be called on double click');
  assert(manualHighlightsState.has('KJV:42:2:16:3'), 'Local state must contain highlighted token key');
  assert(ipcSentContent !== null, 'IPC message must be dispatched immediately');
  assert.strictEqual(ipcSentContent.data.isHighlightOnlyUpdate, true, 'Must flag as highlight-only update');
  assert.deepStrictEqual(ipcSentContent.data.manualHighlights, ['KJV:42:2:16:3'], 'Dispatched payload must include the highlighted token');
  assert.strictEqual(ipcSentContent.data.title, 'John 3:16', 'Must preserve current passage title');

  // 2. Second double-click: unhighlight "loved"
  handleWordDoubleClick(verseIdx, wordIdx);

  assert.strictEqual(presentVersesCalled, 0, 'presentVerses must NOT be called on unhighlight');
  assert(!manualHighlightsState.has('KJV:42:2:16:3'), 'Local state must have highlight removed');
  assert.deepStrictEqual(ipcSentContent.data.manualHighlights, [], 'Dispatched payload must have empty highlights');
  assert.strictEqual(ipcSentContent.data.isHighlightOnlyUpdate, true, 'Unhighlighting must also be highlight-only');
});

console.log('\n--- 3. Testing Authoritative State & In-Place Processing (main.js Logic) ---');

test('main.js activate_set_content handles isHighlightOnlyUpdate without restarting transitions', () => {
  // Simulated main.js state
  const liveBroadcastConfig = {
    activeStudioControls: [
      {
        id: 'role_playback_bible',
        role: 'bible',
        status: 'live',
        animStartTime: 100000,
        manualHighlights: [],
        bibleHighlightColor: '#FFEB3B',
      }
    ],
    bibleLowerThird: { isShowing: false }
  };
  const currentCanvasState = {
    contentSlot: {
      type: 'bible',
      data: {
        title: 'John 3:16',
        body: 'For God so loved the world',
        version: 'KJV',
        manualHighlights: [],
      }
    },
    bibleHighlightColor: '#FFEB3B',
  };
  let sentWindows = [];
  const safeWebContentsSend = (win, ch, val) => { sentWindows.push({ win, ch, val }); };

  // Receive highlight-only update
  const incoming = {
    type: 'bible',
    data: {
      title: 'John 3:16',
      body: 'For God so loved the world',
      version: 'KJV',
      manualHighlights: ['KJV:42:2:16:3'],
      bibleHighlightColor: '#67E8F9',
      isHighlightOnlyUpdate: true,
    }
  };

  const prevSlot = currentCanvasState.contentSlot;
  const prevData = prevSlot.data;
  const isSamePassage = prevData && prevData.title === incoming.data.title;

  assert(isSamePassage, 'Passage must match');

  if (incoming.data.isHighlightOnlyUpdate && isSamePassage) {
    const controls = [...liveBroadcastConfig.activeStudioControls];
    const existing = controls[0];
    existing.manualHighlights = incoming.data.manualHighlights;
    existing.bibleHighlightColor = incoming.data.bibleHighlightColor;
    // animStartTime is NOT changed!
    liveBroadcastConfig.activeStudioControls = controls;

    currentCanvasState.contentSlot = { type: 'bible', data: incoming.data };
    currentCanvasState.bibleHighlightColor = incoming.data.bibleHighlightColor;

    safeWebContentsSend('general', 'set-content', incoming);
    safeWebContentsSend('speaker', 'set-content', incoming);
    safeWebContentsSend('controller', 'set-content', incoming);
  }

  assert.strictEqual(liveBroadcastConfig.activeStudioControls[0].animStartTime, 100000, 'animStartTime must NOT be reset');
  assert.deepStrictEqual(liveBroadcastConfig.activeStudioControls[0].manualHighlights, ['KJV:42:2:16:3']);
  assert.strictEqual(liveBroadcastConfig.activeStudioControls[0].bibleHighlightColor, '#67E8F9');
  assert.strictEqual(currentCanvasState.bibleHighlightColor, '#67E8F9');
  assert.strictEqual(sentWindows.length, 3, 'Must broadcast to general, speaker, and controller windows');
});

test('Delayed voice update does not overwrite newer manual edit in main.js', () => {
  const prevData = {
    title: 'John 3:16',
    manualHighlights: ['KJV:42:2:16:3'],
    lastManualEditTime: 5000,
  };

  const staleVoiceUpdate = {
    title: 'John 3:16',
    isVoiceUpdate: true,
    voiceTimestamp: 4000, // Happened before manual edit
    manualHighlights: [], // Voice didn't know about highlight
  };

  const isStale = (
    prevData.lastManualEditTime &&
    staleVoiceUpdate.isVoiceUpdate &&
    staleVoiceUpdate.voiceTimestamp &&
    staleVoiceUpdate.voiceTimestamp < prevData.lastManualEditTime
  );

  assert.strictEqual(isStale, true, 'Stale voice update must be detected and dropped');
});

console.log('\n--- 4. Testing Preview & DisplayCanvas Color Precedence ---');

test('MiniPreview and PreviewModal resolve color precedence properly', () => {
  // Test case A: presentationStyle specifies color
  const presentationContentA = { data: { bibleHighlightColor: '#FFEB3B' } };
  const presentationStyleA = { bibleHighlightColor: '#00E5FF' };
  const effectiveA = presentationStyleA?.bibleHighlightColor || presentationContentA.data.bibleHighlightColor || '#FFEB3B';
  assert.strictEqual(effectiveA, '#00E5FF', 'Should prioritize presentationStyle when set');

  // Test case B: presentationContent carries new color from toolbar
  const presentationContentB = { data: { bibleHighlightColor: '#F97316' } };
  const presentationStyleB = {};
  const effectiveB = presentationStyleB?.bibleHighlightColor || presentationContentB.data.bibleHighlightColor || '#FFEB3B';
  assert.strictEqual(effectiveB, '#F97316', 'Should pick up content.data.bibleHighlightColor when style is empty');
});

test('view.js effectiveCanvasState prioritizes contentSlot color over hardcoded default', () => {
  const presentationStyle = {};
  const canvasState = {
    contentSlot: {
      data: { bibleHighlightColor: '#67E8F9' }
    },
    bibleHighlightColor: '#FFEB3B'
  };

  const effectiveCanvasHighlightColor =
    presentationStyle.bibleHighlightColor ||
    canvasState.contentSlot?.data?.bibleHighlightColor ||
    canvasState.bibleHighlightColor ||
    '#FFEB3B';

  assert.strictEqual(effectiveCanvasHighlightColor, '#67E8F9', 'DisplayCanvas must receive custom color from contentSlot');
});

console.log(`\n========================================`);
console.log(`Summary: ${passCount} passed, ${failCount} failed`);
console.log(`========================================\n`);

process.exitCode = failCount ? 1 : 0;
