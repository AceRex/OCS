/**
 * scripts/test-natural-bible-parser.js
 * Independent unit tests for OCS Bible Voice Natural Reference Grammar & Resolver (V2).
 */
'use strict';

const { smartBibleMatch, matchReferenceShape, autoCorrectTranscript } = require('../src/App/controller/smartBibleMatch.js');

// Standard Protestant canonical 66 books list used by OCS runtime
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

async function resolve(phrase) {
  const match = await smartBibleMatch(phrase, CANONICAL_BOOKS, null, null, {
    allowPass2: true,
    allowPass3: false,
    requireShape: true,
    allowBookOnly: false,
  });
  if (!match || match.bookIndex == null) return 'NONE';
  const bookName = CANONICAL_BOOKS[match.bookIndex]?.name;
  const range = match.endVerse && match.endVerse > match.startVerse ? `-${match.endVerse}` : '';
  return `${bookName} ${match.chapter}:${match.startVerse}${range}`;
}

async function runTests() {
  console.log('============================================================');
  console.log('OCS BIBLE VOICE RECOGNITION V2 — NATURAL SPEECH PARSER TESTS');
  console.log('============================================================\n');

  const testCases = [
    // Core User Failure & Natural Announcement Forms
    { input: 'Colossians 3 22', expected: 'Colossians 3:22', form: 'FORM A: BOOK CHAPTER VERSE' },
    { input: 'Colossians three twenty two', expected: 'Colossians 3:22', form: 'FORM E: FULL SPOKEN WORDS' },
    { input: 'Colossians three twenty-two', expected: 'Colossians 3:22', form: 'FORM E: SPOKEN WORDS HYPHEN' },
    { input: 'Colossians 3:22', expected: 'Colossians 3:22', form: 'FORM B: BOOK CHAPTER:VERSE' },
    { input: 'Colossians 3 verse 22', expected: 'Colossians 3:22', form: 'FORM C: BOOK CHAPTER VERSE WORD' },
    { input: 'Colossians three verse twenty two', expected: 'Colossians 3:22', form: 'FORM C: SPOKEN CHAPTER VERSE' },
    { input: 'Colossians chapter 3 verse 22', expected: 'Colossians 3:22', form: 'FORM D: BOOK CHAPTER WORD + VERSE WORD' },
    { input: 'Colossians chapter three verse twenty two', expected: 'Colossians 3:22', form: 'FORM D: FULL SPOKEN CHAPTER/VERSE' },
    { input: 'Turn to Colossians 3 22', expected: 'Colossians 3:22', form: 'FORM F: NATURAL SENTENCE (Turn to)' },
    { input: "Let's read Colossians 3:22", expected: 'Colossians 3:22', form: "FORM F: NATURAL SENTENCE (Let's read)" },
    { input: 'Open your Bible to Colossians chapter three verse twenty-two', expected: 'Colossians 3:22', form: 'FORM F: NATURAL SENTENCE (Open Bible)' },
    { input: 'Colossians 3 from verse 22', expected: 'Colossians 3:22', form: 'FORM G: FROM' },
    { input: 'Colossians 3 22 to 24', expected: 'Colossians 3:22-24', form: 'FORM H: RANGE (bare)' },
    { input: 'Colossians chapter 3 verses 22 through 24', expected: 'Colossians 3:22-24', form: 'FORM H: RANGE (formal)' },

    // Compact Numeric Disambiguation (Bible-Aware Canonical)
    { input: 'Colossians 322', expected: 'Colossians 3:22', form: 'COMPACT: Colossians 322 (3:22 vs 32:2)' },
    { input: 'John 3 16', expected: 'John 3:16', form: 'NATURAL: John 3 16' },
    { input: 'John three sixteen', expected: 'John 3:16', form: 'SPOKEN: John three sixteen' },
    { input: 'John 316', expected: 'John 3:16', form: 'COMPACT: John 316 (3:16 vs 31:6)' },
    { input: 'Romans 8 28', expected: 'Romans 8:28', form: 'NATURAL: Romans 8 28' },
    { input: 'Romans eight twenty eight', expected: 'Romans 8:28', form: 'SPOKEN: Romans eight twenty eight' },
    { input: 'Romans 828', expected: 'Romans 8:28', form: 'COMPACT: Romans 828 (8:28 vs 82:8)' },
    { input: 'Psalm 23 1', expected: 'Psalms 23:1', form: 'NATURAL: Psalm 23 1' },
    { input: 'Psalm twenty three one', expected: 'Psalms 23:1', form: 'SPOKEN: Psalm twenty three one' },
    { input: 'Psalm 231', expected: 'Psalms 23:1', form: 'COMPACT: Psalm 231 (23:1 vs 2:31 invalid)' },
    { input: 'Second Corinthians 5 17', expected: '2 Corinthians 5:17', form: 'ORDINAL: Second Corinthians 5 17' },
    { input: 'two corinthians 5 17', expected: '2 Corinthians 5:17', form: 'ORDINAL: two corinthians 5 17' },
    { input: 'First Thessalonians five seventeen', expected: '1 Thessalonians 5:17', form: 'ORDINAL: First Thessalonians five seventeen' },
    { input: 'one thessalonians 5 17', expected: '1 Thessalonians 5:17', form: 'ORDINAL: one thessalonians 5 17' },
    { input: 'Revelation 21 4', expected: 'Revelation 21:4', form: 'NATURAL: Revelation 21 4' },
    { input: 'Habakkuk 2 4', expected: 'Habakkuk 2:4', form: 'NATURAL: Habakkuk 2 4' },

    // Negative & Live Safety Tests (Must NOT trigger during live service)
    { input: 'There were collisions on the road.', expected: 'NONE', form: 'LIVE SAFETY: collisions on the road' },
    { input: 'We had 322 people.', expected: 'NONE', form: 'LIVE SAFETY: 322 people' },
    { input: 'This is chapter three of the discussion.', expected: 'NONE', form: 'LIVE SAFETY: chapter 3 discussion' },
    { input: 'John came to church yesterday.', expected: 'NONE', form: 'LIVE SAFETY: John came to church' },
    { input: 'Romans were an ancient people.', expected: 'NONE', form: 'LIVE SAFETY: Romans ancient people' },
    { input: 'Colossus options 322', expected: 'NONE', form: 'LIVE SAFETY: Colossus options 322 (uncertain ASR approximation)' },
    { input: 'colossus 322', expected: 'NONE', form: 'LIVE SAFETY: colossus 322 (no live auto-correct)' },
    { input: 'I will be there in twenty two minutes', expected: 'NONE', form: 'NEGATIVE: Time prose' },
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const actual = await resolve(tc.input);
    const shape = matchReferenceShape(tc.input);
    const ok = actual === tc.expected;
    if (ok) {
      passed++;
      console.log(`[PASS] "${tc.input}"`);
      console.log(`       → resolved: ${actual} (${tc.form})\n`);
    } else {
      failed++;
      console.error(`[FAIL] "${tc.input}"`);
      console.error(`       Expected: ${tc.expected}`);
      console.error(`       Actual:   ${actual}`);
      console.error(`       Shape:    complete=${shape.complete}, explicit=${shape.hasExplicitMarker}, kind=${shape.kind}\n`);
    }
  }

  console.log('------------------------------------------------------------');
  console.log(`LIVE TESTS TOTAL: ${testCases.length} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('------------------------------------------------------------\n');

  // Test Post-Session Auto-Correction
  console.log('Testing Post-Session Auto-Correction Workflow:');
  const rawSampleTranscript = [
    'Welcome to church this morning.',
    'Please turn your bibles to colossus 322.',
    'Also he brushed 11 1 is a powerful scripture.',
    'There were collisions on the highway this morning.',
  ].join('\n');

  const postSessionResult = autoCorrectTranscript(rawSampleTranscript, CANONICAL_BOOKS);
  console.log('Original transcript preserved:', postSessionResult.originalTranscript === rawSampleTranscript);
  console.log('Found suggestions count:', postSessionResult.suggestions.length);
  postSessionResult.suggestions.forEach(s => {
    console.log(` - Line ${s.lineIndex}: "${s.original}" → "${s.suggested}"`);
  });

  const hasColossiansCorrection = postSessionResult.suggestions.some(
    s => s.original.toLowerCase().includes('colossus 322') && s.suggested === 'Colossians 3:22'
  );
  const hasHebrewsCorrection = postSessionResult.suggestions.some(
    s => s.original.toLowerCase().includes('he brushed 11 1') && s.suggested === 'Hebrews 11:1'
  );
  const highwayCollisionsNotMutated = !postSessionResult.suggestions.some(
    s => s.original.includes('collisions on the highway')
  );

  if (hasColossiansCorrection && hasHebrewsCorrection && highwayCollisionsNotMutated) {
    console.log('[PASS] Post-session auto-correction correctly suggested Bible references without mutating normal prose!');
  } else {
    failed++;
    console.error('[FAIL] Post-session auto-correction failed expectations');
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
