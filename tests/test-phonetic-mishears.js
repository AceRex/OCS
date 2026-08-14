const assert = require('assert');

// Mock Books array (standard 66 books)
const books = [
  { id: 1, name: "Genesis", chapters: 50 },
  { id: 2, name: "Exodus", chapters: 40 },
  { id: 3, name: "Leviticus", chapters: 27 },
  { id: 4, name: "Numbers", chapters: 36 },
  { id: 5, name: "Deuteronomy", chapters: 34 },
  { id: 6, name: "Joshua", chapters: 24 },
  { id: 7, name: "Judges", chapters: 21 },
  { id: 8, name: "Ruth", chapters: 4 },
  { id: 9, name: "1 Samuel", chapters: 31 },
  { id: 10, name: "2 Samuel", chapters: 24 },
  { id: 11, name: "1 Kings", chapters: 22 },
  { id: 12, name: "2 Kings", chapters: 25 },
  { id: 13, name: "1 Chronicles", chapters: 29 },
  { id: 14, name: "2 Chronicles", chapters: 36 },
  { id: 15, name: "Ezra", chapters: 10 },
  { id: 16, name: "Nehemiah", chapters: 13 },
  { id: 17, name: "Esther", chapters: 10 },
  { id: 18, name: "Job", chapters: 42 },
  { id: 19, name: "Psalms", chapters: 150 },
  { id: 20, name: "Proverbs", chapters: 31 },
  { id: 21, name: "Ecclesiastes", chapters: 12 },
  { id: 22, name: "Song of Solomon", chapters: 8 },
  { id: 23, name: "Isaiah", chapters: 66 },
  { id: 24, name: "Jeremiah", chapters: 52 },
  { id: 25, name: "Lamentations", chapters: 5 },
  { id: 26, name: "Ezekiel", chapters: 48 },
  { id: 27, name: "Daniel", chapters: 12 },
  { id: 28, name: "Hosea", chapters: 14 },
  { id: 29, name: "Joel", chapters: 3 },
  { id: 30, name: "Amos", chapters: 9 },
  { id: 31, name: "Obadiah", chapters: 1 },
  { id: 32, name: "Jonah", chapters: 4 },
  { id: 33, name: "Micah", chapters: 7 },
  { id: 34, name: "Nahum", chapters: 3 },
  { id: 35, name: "Habakkuk", chapters: 3 },
  { id: 36, name: "Zephaniah", chapters: 3 },
  { id: 37, name: "Haggai", chapters: 2 },
  { id: 38, name: "Zechariah", chapters: 14 },
  { id: 39, name: "Malachi", chapters: 4 },
  { id: 40, name: "Matthew", chapters: 28 },
  { id: 41, name: "Mark", chapters: 16 },
  { id: 42, name: "Luke", chapters: 24 },
  { id: 43, name: "John", chapters: 21 },
  { id: 44, name: "Acts", chapters: 28 },
  { id: 45, name: "Romans", chapters: 16 },
  { id: 46, name: "1 Corinthians", chapters: 16 },
  { id: 47, name: "2 Corinthians", chapters: 13 },
  { id: 48, name: "Galatians", chapters: 6 },
  { id: 49, name: "Ephesians", chapters: 6 },
  { id: 50, name: "Philippians", chapters: 4 },
  { id: 51, name: "Colossians", chapters: 4 },
  { id: 52, name: "1 Thessalonians", chapters: 5 },
  { id: 53, name: "2 Thessalonians", chapters: 3 },
  { id: 54, name: "1 Timothy", chapters: 6 },
  { id: 55, name: "2 Timothy", chapters: 4 },
  { id: 56, name: "Titus", chapters: 3 },
  { id: 57, name: "Philemon", chapters: 1 },
  { id: 58, name: "Hebrews", chapters: 13 },
  { id: 59, name: "James", chapters: 5 },
  { id: 60, name: "1 Peter", chapters: 5 },
  { id: 61, name: "2 Peter", chapters: 3 },
  { id: 62, name: "1 John", chapters: 5 },
  { id: 63, name: "2 John", chapters: 1 },
  { id: 64, name: "3 John", chapters: 1 },
  { id: 65, name: "Jude", chapters: 1 },
  { id: 66, name: "Revelation", chapters: 22 }
];

const { smartBibleMatch, hasReferenceShape, matchReferenceShape } = require('../src/App/controller/smartBibleMatch');

async function runTests() {
  const testCases = [
    // Psalms
    { phrase: "sam 23 v 6", expectedBook: "Psalms", ch: 23, v: 6 },
    { phrase: "some 23 verse 6", expectedBook: "Psalms", ch: 23, v: 6 },
    { phrase: "the book of some 23 v6", expectedBook: "Psalms", ch: 23, v: 6 },

    // Deuteronomy
    { phrase: "the terronomy 6 4", expectedBook: "Deuteronomy", ch: 6, v: 4 },
    { phrase: "the teronomy 6 4", expectedBook: "Deuteronomy", ch: 6, v: 4 },
    { phrase: "detreronomy 6 4", expectedBook: "Deuteronomy", ch: 6, v: 4 },

    // Revelation
    { phrase: "revolutions 1 1", expectedBook: "Revelation", ch: 1, v: 1 },
    { phrase: "revelation 1 1", expectedBook: "Revelation", ch: 1, v: 1 },

    // Judges
    { phrase: "the book of judges", expectedBook: "Judges", ch: 1, v: 1 },
    { phrase: "judges 1 verse 2", expectedBook: "Judges", ch: 1, v: 2 },

    // Leviticus
    { phrase: "levanticus 1 verse 2", expectedBook: "Leviticus", ch: 1, v: 2 },

    // 1 & 2 Samuel
    { phrase: "the book of first summer two verse five", expectedBook: "1 Samuel", ch: 2, v: 5 },
    { phrase: "the book of second samuel 1 1", expectedBook: "2 Samuel", ch: 1, v: 1 },

    // Exodus
    { phrase: "exodus 14 verse 14", expectedBook: "Exodus", ch: 14, v: 14 },

    // Lamentations
    { phrase: "lamentation 2 verse 5", expectedBook: "Lamentations", ch: 2, v: 5 },

    // 1 Timothy
    { phrase: "festimucci 2 v 5", expectedBook: "1 Timothy", ch: 2, v: 5 },
    { phrase: "first simultitu 2 v 5", expectedBook: "1 Timothy", ch: 2, v: 5 },

    // Mark
    { phrase: "the book of mark ii was three", expectedBook: "Mark", ch: 2, v: 3 },
    { phrase: "the book of mark suves three", expectedBook: "Mark", ch: 2, v: 3 },

    // Jeremiah
    { phrase: "the book of jeremiah 5", expectedBook: "Jeremiah", ch: 5, v: 1 },
    { phrase: "jeremiah 5 v.33", expectedBook: "Jeremiah", ch: 5, v: 33 },

    // Nehemiah
    { phrase: "the book of nehemao one", expectedBook: "Nehemiah", ch: 1, v: 1 },
    { phrase: "neimei 1 1", expectedBook: "Nehemiah", ch: 1, v: 1 },
    { phrase: "nei maya 1 1", expectedBook: "Nehemiah", ch: 1, v: 1 },
    { phrase: "niy maya 1 1", expectedBook: "Nehemiah", ch: 1, v: 1 },

    // Hosea
    { phrase: "osia 1 1", expectedBook: "Hosea", ch: 1, v: 1 },
    { phrase: "ousia 1 1", expectedBook: "Hosea", ch: 1, v: 1 },
    { phrase: "ocea 1 1", expectedBook: "Hosea", ch: 1, v: 1 },

    // Song of Solomon
    { phrase: "songs of solomon one verse one", expectedBook: "Song of Solomon", ch: 1, v: 1 },
    { phrase: "songs of suluman 1 1", expectedBook: "Song of Solomon", ch: 1, v: 1 },
  ];

  let passed = 0;
  for (const tc of testCases) {
    const res = await smartBibleMatch(tc.phrase, books, null, null, { allowPass2: true, requireShape: false, allowBookOnly: true });
    assert(res, `Failed match for: "${tc.phrase}"`);
    const bookName = books[res.bookIndex]?.name;
    assert.strictEqual(bookName, tc.expectedBook, `For "${tc.phrase}": expected book ${tc.expectedBook}, got ${bookName}`);
    assert.strictEqual(res.chapter, tc.ch, `For "${tc.phrase}": expected chapter ${tc.ch}, got ${res.chapter}`);
    assert.strictEqual(res.startVerse, tc.v, `For "${tc.phrase}": expected verse ${tc.v}, got ${res.startVerse}`);
    passed++;
    console.log(`✓ "${tc.phrase}" → ${bookName} ${res.chapter}:${res.startVerse} (${res.matchType})`);
  }

  console.log(`\n🎉 All ${passed}/${testCases.length} phonetic mishearing test cases passed!`);
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
