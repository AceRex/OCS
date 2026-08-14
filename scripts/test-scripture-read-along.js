/**
 * Unit tests for scripture read-along tokenizer + ASR advance + range steps.
 * Usage: node scripts/test-scripture-read-along.js
 */
'use strict';

const {
  tokenizePassage,
  advanceReadAlong,
  formatPassage,
  formatRangeStep,
  isAtVerseEnd,
  tokensMatch,
} = require('../src/App/controller/scriptureReadAlong');

let fail = 0;
function assert(cond, msg) {
  if (cond) console.log('PASS', msg);
  else {
    console.error('FAIL', msg);
    fail += 1;
  }
}

// Acts 2:1 KJV opening (truncated for advance)
const acts21 =
  'And when the day of Pentecost was fully come, they were all with one accord in one place.';
const tokens = tokenizePassage(acts21);
assert(tokens.length >= 8, `tokenize Acts 2:1 → ${tokens.length} tokens`);
assert(tokens[0].norm === 'and', `first token and (got ${tokens[0]?.norm})`);
assert(tokens[1].norm === 'when', `second token when`);

let idx = -1;
idx = advanceReadAlong('and when the day', tokens, idx);
assert(idx >= 3, `advance "and when the day" → idx=${idx} (want ≥3)`);

const prev = idx;
idx = advanceReadAlong('and when the day of pentecost', tokens, idx);
assert(idx > prev, `further advance moves forward (${prev} → ${idx})`);

const stuck = advanceReadAlong('zzzz nonsense', tokens, idx);
assert(stuck === idx, `noise does not move cursor (${stuck})`);

const skipIdx = advanceReadAlong('when the day', tokens, -1);
assert(skipIdx >= 1, `cold start can land on when (idx=${skipIdx})`);

assert(tokensMatch('pentecost', 'pentecost'), 'exact match');
assert(tokensMatch('pentecost', 'pentcost'), 'fuzzy edit≤1');
assert(!tokensMatch('hello', 'world'), 'non-match');

const verses = [
  'And when the day of Pentecost was fully come,',
  'And suddenly there came a sound from heaven',
  'And there appeared unto them cloven tongues',
  'And they were all filled with the Holy Ghost,',
  'v5',
  'v6',
  'v7',
  'And how hear we every man in our own tongue,',
];
const fmt = formatPassage('Acts', 2, 1, 8, verses);
assert(fmt.title === 'Acts 2:1-8', `range title (${fmt.title})`);
assert(fmt.body.includes('Pentecost') && fmt.body.includes('own tongue'), 'joined body has v1 and v8');
assert(formatPassage('John', 3, 16, 16, ['For God so loved']).title === 'John 3:16', 'single verse title');

const johnVerses = [
  'There was a man of the Pharisees, named Nicodemus, a ruler of the Jews:',
  'The same came to Jesus by night,',
  'Jesus answered and said unto him,',
  'Nicodemus saith unto him,',
];
const step1 = formatRangeStep('John', 3, 1, 4, 1, johnVerses);
assert(step1.title === 'John 3:1-4', `step title ${step1.title}`);
assert(step1.currentVerse === 1, 'step starts at verse 1');
assert(step1.body.includes('Nicodemus') && !step1.body.includes('by night'), 'step body is verse 1 only');

const step2 = formatRangeStep('John', 3, 1, 4, 2, johnVerses);
assert(step2.currentVerse === 2 && step2.body.includes('by night'), 'step 2 body is verse 2');

assert(isAtVerseEnd(tokens.length - 1, tokens), 'at verse end');
assert(!isAtVerseEnd(0, tokens), 'not at verse end on first token');

process.exitCode = fail ? 1 : 0;
if (!fail) console.log('\nAll scripture read-along tests passed.');
