/**
 * test-context-range-jumps.js
 *
 * Verification suite for in-context single-verse, verse-range, and compound chapter+verse jumps (FR-3.14 / Defect 3).
 * Run: node tests/test-context-range-jumps.js
 */
const path = require('path');
const fs = require('fs');

const srcPath = path.join(__dirname, '../src/App/controller/smartBibleMatch.js');
const src = fs.readFileSync(srcPath, 'utf8');

const cjs = src
  .replace(/^export /gm, '')
  .replace(/export \{[^}]+\};?/g, '')
  + `\nmodule.exports = { matchReferenceShape, smartBibleMatch, isLikelyBibleReference, wordNumbersToDigits, repairReferenceConnectors };\n`;

const tmp = path.join(__dirname, '.tmp-smartBibleMatch-ctx.cjs');
fs.writeFileSync(tmp, cjs);

let matchReferenceShape, smartBibleMatch;
try {
  ({ matchReferenceShape, smartBibleMatch } = require(tmp));
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

const context = { bookIndex: 42, chapter: 3, verse: 16 }; // Active Context: John 3:16

const testCases = [
  { text: "verse five", expected: "John 3:5" },
  { text: "verses ten to twelve", expected: "John 3:10-12" },
  { text: "verses 10 to 12", expected: "John 3:10-12" },
  { text: "verses ten through twelve", expected: "John 3:10-12" },
  { text: "from verse five to eight", expected: "John 3:5-8" },
  { text: "chapter ten verse two", expected: "John 10:2" },
  { text: "chapter four verse one", expected: "John 4:1" },
  { text: "chapter five verse twenty", expected: "John 5:20" }
];

async function runTests() {
  let failed = 0;
  console.log("=== IN-CONTEXT RANGE & COMPOUND JUMPS TEST (Active: John 3:16) ===");

  for (const { text, expected } of testCases) {
    const shape = matchReferenceShape(text);
    const match = await smartBibleMatch(text, books, null, context, { shapeHint: shape.complete || shape.shortContext ? shape : null });
    const matchedRef = match
      ? `${books[match.bookIndex]?.name} ${match.chapter}:${match.startVerse}${match.endVerse && match.endVerse !== match.startVerse ? "-" + match.endVerse : ""}`
      : "NO_MATCH";

    if (matchedRef !== expected) {
      failed++;
      console.error(`FAIL: "${text}" -> got "${matchedRef}", expected "${expected}"`);
    } else {
      console.log(`PASS: "${text}" -> ${matchedRef}`);
    }
  }

  if (failed > 0) {
    console.error(`\nTest suite finished with ${failed} failure(s).`);
    process.exit(1);
  } else {
    console.log(`\nAll in-context jump test cases passed.`);
  }
}

runTests();
