/**
 * Test case verification for ASR mishearings of Colossians references:
 * e.g. "Colosha's today 22", "Colosha's 322", "colossians 3 vs 22" -> Colossians 3:22
 */
const path = require('path');
const { smartBibleMatch, matchReferenceShape } = require('../src/App/controller/smartBibleMatch.js');

const books = [
  { name: 'Genesis', chapters: 50 },
  { name: 'Colossians', chapters: 4 },
];

const testCases = [
  { input: "Colosha's today 22", expectedBook: 1, chapter: 3, verse: 22 },
  { input: "Colosha's 322", expectedBook: 1, chapter: 3, verse: 22 },
  { input: "colossians 3 vs 22", expectedBook: 1, chapter: 3, verse: 22 },
  { input: "Coloshas today 22", expectedBook: 1, chapter: 3, verse: 22 },
  { input: "Coloshas 322", expectedBook: 1, chapter: 3, verse: 22 },
  { input: "Colosha 322", expectedBook: 1, chapter: 3, verse: 22 },
  { input: "Colossians today 22", expectedBook: 1, chapter: 3, verse: 22 },
  { input: "Colossians 322", expectedBook: 1, chapter: 3, verse: 22 },
  { input: "Colossians 3 vs 22", expectedBook: 1, chapter: 3, verse: 22 },
  { input: "Colossians 3:22", expectedBook: 1, chapter: 3, verse: 22 },
  { input: "Calosha's 322", expectedBook: 1, chapter: 3, verse: 22 },
  { input: "Caloshas today 22", expectedBook: 1, chapter: 3, verse: 22 },
];

async function run() {
  console.log('Running Colossians ASR Speech Matcher Tests...');
  let failures = 0;
  for (const tc of testCases) {
    const res = await smartBibleMatch(tc.input, books, null);
    const pass = res &&
      res.bookIndex === tc.expectedBook &&
      res.chapter === tc.chapter &&
      res.startVerse === tc.verse;
    if (pass) {
      console.log(`✅ PASS: "${tc.input}" -> Colossians ${res.chapter}:${res.startVerse}`);
    } else {
      console.error(`❌ FAIL: "${tc.input}" -> Got ${JSON.stringify(res)}`);
      failures++;
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} tests failed.`);
    process.exit(1);
  } else {
    console.log(`\n🎉 All ${testCases.length} Colossians speech test cases passed successfully!`);
  }
}

run();
