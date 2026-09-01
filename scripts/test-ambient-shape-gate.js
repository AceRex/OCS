/**
 * Ambient structural shape gate — false-positive audit + smoke tests.
 * Run: node scripts/test-ambient-shape-gate.js
 */
const path = require('path');
const fs = require('fs');

// Load Babel-free source via CJS shim for node test harness
const srcPath = path.join(__dirname, '../src/App/controller/smartBibleMatch.js');
const src = fs.readFileSync(srcPath, 'utf8');

const cjs = src
  .replace(/^export /gm, '')
  .replace(/export \{[^}]+\};?/g, '')
  + `\nmodule.exports = { matchReferenceShape, smartBibleMatch, hasReferenceShape, hasAmbientReferenceShape, wordNumbersToDigits, repairReferenceConnectors };\n`;

const tmp = path.join(__dirname, '.tmp-smartBibleMatch.cjs');
fs.writeFileSync(tmp, cjs);

let matchReferenceShape, smartBibleMatch, wordNumbersToDigits, repairReferenceConnectors;
try {
  ({ matchReferenceShape, smartBibleMatch, wordNumbersToDigits, repairReferenceConnectors } = require(tmp));
} finally {
  try { fs.unlinkSync(tmp); } catch (_) {}
}

const books = [
  { id: 1, name: "Genesis" }, { id: 2, name: "Exodus" }, { id: 3, name: "Leviticus" },
  { id: 4, name: "Numbers" }, { id: 5, name: "Deuteronomy" }, { id: 6, name: "Joshua" },
  { id: 7, name: "Judges" }, { id: 8, name: "Ruth" }, { id: 9, name: "1 Samuel" },
  { id: 10, name: "2 Samuel" }, { id: 11, name: "1 Kings" }, { id: 12, name: "2 Kings" },
  { id: 13, name: "1 Chronicles" }, { id: 14, name: "2 Chronicles" }, { id: 15, name: "Ezra" },
  { id: 16, name: "Nehemiah" }, { id: 17, name: "Esther" }, { id: 18, name: "Job" },
  { id: 19, name: "Psalms" }, { id: 20, name: "Proverbs" }, { id: 21, name: "Ecclesiastes" },
  { id: 22, name: "Song of Solomon" }, { id: 23, name: "Isaiah" }, { id: 24, name: "Jeremiah" },
  { id: 25, name: "Lamentations" }, { id: 26, name: "Ezekiel" }, { id: 27, name: "Daniel" },
  { id: 28, name: "Hosea" }, { id: 29, name: "Joel" }, { id: 30, name: "Amos" },
  { id: 31, name: "Obadiah" }, { id: 32, name: "Jonah" }, { id: 33, name: "Micah" },
  { id: 34, name: "Nahum" }, { id: 35, name: "Habakkuk" }, { id: 36, name: "Zephaniah" },
  { id: 37, name: "Haggai" }, { id: 38, name: "Zechariah" }, { id: 39, name: "Malachi" },
  { id: 40, name: "Matthew" }, { id: 41, name: "Mark" }, { id: 42, name: "Luke" },
  { id: 43, name: "John" }, { id: 44, name: "Acts" }, { id: 45, name: "Romans" },
  { id: 46, name: "1 Corinthians" }, { id: 47, name: "2 Corinthians" }, { id: 48, name: "Galatians" },
  { id: 49, name: "Ephesians" }, { id: 50, name: "Philippians" }, { id: 51, name: "Colossians" },
  { id: 52, name: "1 Thessalonians" }, { id: 53, name: "2 Thessalonians" }, { id: 54, name: "1 Timothy" },
  { id: 55, name: "2 Timothy" }, { id: 56, name: "Titus" }, { id: 57, name: "Philemon" },
  { id: 58, name: "Hebrews" }, { id: 59, name: "James" }, { id: 60, name: "1 Peter" },
  { id: 61, name: "2 Peter" }, { id: 62, name: "1 John" }, { id: 63, name: "2 John" },
  { id: 64, name: "3 John" }, { id: 65, name: "Jude" }, { id: 66, name: "Revelation" }
];

async function runTests() {
  let failed = 0;

  console.log("=== 1. Explicit Marker Positive Cases (MUST Qualify for Tier A Auto-Fire) ===");
  const explicitCases = [
    ["turn to Mark chapter three", "Mark", 3, null],
    ["let's look at John chapter one", "John", 1, null],
    ["Luke chapter twenty", "Luke", 20, null],
    ["1 Peter chapter 2", "1 Peter", 2, null],
    ["Ruth chapter 2 verse 1", "Ruth", 2, 1],
    ["Proverbs 24 verse 6", "Proverbs", 24, 6],
    ["Genesis chapter one", "Genesis", 1, null],
    ["First Corinthians thirteen four", "1 Corinthians", 13, 4],
    ["the book of Romans eight", "Romans", 8, null],
  ];

  for (const [phrase, expectedBook, expectedChapter, expectedVerse] of explicitCases) {
    const shape = matchReferenceShape(phrase);
    const tierA = Boolean(shape.complete && shape.hasExplicitMarker);
    if (!tierA) {
      failed++;
      console.error(`FAIL [Tier A Expected]: "${phrase}" -> shape.complete: ${shape.complete}, hasExplicitMarker: ${shape.hasExplicitMarker}`);
    } else {
      console.log(`PASS [Tier A Confirmed]: "${phrase}" (hasExplicitMarker: ${shape.hasExplicitMarker}, kind: ${shape.kind})`);
    }
  }

  console.log("\n=== 2. Conversational Negative Cases (MUST NOT Qualify for Tier A Auto-Fire) ===");
  const negativeCases = [
    "Mark is three months away from graduating",
    "John is one of our elders",
    "Luke is twenty years old today",
    "Peter is two steps ahead of us",
    "Ruth is two years younger than Sarah",
    "Job is three days late on the project",
    "James is five years into his ministry",
    "Esther is four years in college",
    "Daniel is two miles down the road",
    "Amos is thirty minutes away",
    "Joel is fourteen years old",
    "Timothy is two years into his internship",
    "Titus is three weeks into his mission trip",
    "Matthew is twelve years old",
    "Micah is five years old",
    "Nahum is three days away",
    "Hosea is two chapters in our syllabus",
    "Malachi is four miles away",
    "Paul and Mark is two people who served",
    "we have twenty four members in this room",
    "let's turn to the topic of forgiveness",
    "Job had many trials in those days",
    "Mark my words this will happen",
    "Acts of kindness change a community",
    "there were twelve disciples around him",
    "James said something similar last week",
    "verse 5"
  ];

  for (const phrase of negativeCases) {
    const shape = matchReferenceShape(phrase);
    const tierA = Boolean(shape.complete && shape.hasExplicitMarker);
    if (tierA) {
      failed++;
      console.error(`FAIL [False Tier A Trigger]: "${phrase}" -> shape.complete: ${shape.complete}, hasExplicitMarker: ${shape.hasExplicitMarker}, span: "${shape.span}"`);
    } else {
      console.log(`PASS [Tier A Blocked]: "${phrase}" -> tierA: false (complete: ${shape.complete}, explicit: ${shape.hasExplicitMarker})`);
    }
  }

  console.log("\n=== 3. ASR-Imperfect Reference Resolution (Regression Guard) ===");
  const asrCases = [
    { text: "collisions one fifteen", expected: "Colossians 1:15" },
    { text: "aisayan fifty three five", expected: "Isaiah 53:5" },
    { text: "molokai three ten", expected: "Malachi 3:10" },
    { text: "stephanie three seventeen", expected: "Zephaniah 3:17" },
    { text: "fest timothy six twelve", expected: "1 Timothy 6:12" },
    { text: "second summer seven fourteen", expected: "2 Samuel 7:14" },
    { text: "have a cook two four", expected: "Habakkuk 2:4" },
    { text: "philippines four six", expected: "Philippians 4:6" },
    { text: "sams twenty three one", expected: "Psalms 23:1" },
    { text: "revalations twenty one four", expected: "Revelation 21:4" },
    { text: "look ten twenty five", expected: "Luke 10:25" },
    { text: "mach sixteen fifteen", expected: "Mark 16:15" },
    { text: "first kings eighteen twenty one", expected: "1 Kings 18:21" },
    { text: "first john one nine", expected: "1 John 1:9" },
    { text: "ebers eleven one", expected: "Hebrews 11:1" }
  ];

  for (const { text, expected } of asrCases) {
    const shape = matchReferenceShape(text);
    const match = await smartBibleMatch(text, books, null, null, { shapeHint: shape.complete ? shape : null, triggerArmed: true });
    const matchedRef = match ? `${books[match.bookIndex]?.name} ${match.chapter}:${match.startVerse}${match.endVerse && match.endVerse !== match.startVerse ? "-" + match.endVerse : ""}` : "NO_MATCH";
    if (matchedRef !== expected) {
      failed++;
      console.error(`FAIL [ASR Resolution]: "${text}" -> got "${matchedRef}", expected "${expected}"`);
    } else {
      console.log(`PASS [ASR Resolution]: "${text}" -> ${matchedRef}`);
    }
  }

  console.log("\n=== 4. Dual-Number Collision Adversarial Cases (MUST NOT Qualify for Tier A) ===");
  const dualNumberNegativeCases = [
    "Mark is three fifteen",
    "John is two forty",
    "Ruth is two ten",
    "Peter is three thirty"
  ];

  for (const phrase of dualNumberNegativeCases) {
    const shape = matchReferenceShape(phrase);
    const tierA = Boolean(shape.complete && shape.hasExplicitMarker);
    if (tierA) {
      failed++;
      console.error(`FAIL [Dual-Number False Tier A Trigger]: "${phrase}" -> shape.complete: ${shape.complete}, hasExplicitMarker: ${shape.hasExplicitMarker}, span: "${shape.span}"`);
    } else {
      console.log(`PASS [Dual-Number Tier A Blocked]: "${phrase}" -> tierA: false (complete: ${shape.complete}, explicit: ${shape.hasExplicitMarker})`);
    }
  }

  if (failed > 0) {
    console.error(`\nTest suite finished with ${failed} failure(s).`);
    process.exit(1);
  } else {
    console.log(`\nAll ambient shape gate test cases passed successfully.`);
  }
}

runTests();
