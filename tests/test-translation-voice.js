const assert = require('assert');

const TRANSLATION_DEFINITIONS = [
  { keys: ['niv', 'n i v', 'new international version', 'new international', 'an eye vee'], dbVersion: 'net', label: 'NIV' },
  { keys: ['amp', 'a m p', 'amplified bible', 'amplified version', 'amplified', 'amped'], dbVersion: 'amp', label: 'AMP' },
  { keys: ['kjv', 'k j v', 'king james version', 'king james'], dbVersion: 'kjv', label: 'KJV' },
  { keys: ['nkjv', 'n k j v', 'new king james version', 'new king james'], dbVersion: 'kjvpce', label: 'NKJV' },
  { keys: ['esv', 'e s v', 'english standard version', 'english standard'], dbVersion: 'asv', label: 'ESV' },
  { keys: ['nlt', 'n l t', 'new living translation', 'new living'], dbVersion: 'bbe', label: 'NLT' },
  { keys: ['asv', 'a s v', 'american standard version', 'american standard'], dbVersion: 'asv', label: 'ASV' },
  { keys: ['net', 'n e t', 'new english translation', 'net bible'], dbVersion: 'net', label: 'NET' },
  { keys: ['bbe', 'b b e', 'basic english', 'bible in basic english'], dbVersion: 'bbe', label: 'BBE' },
  { keys: ['web', 'world english bible', 'world english'], dbVersion: 'web', label: 'WEB' },
  { keys: ['msg', 'the message', 'message version', 'message bible', 'message'], dbVersion: 'web', label: 'MSG' },
  { keys: ['csb', 'christian standard bible', 'christian standard'], dbVersion: 'net', label: 'CSB' },
  { keys: ['nasb', 'new american standard bible', 'new american standard'], dbVersion: 'asv', label: 'NASB' },
  { keys: ['rsv', 'revised standard version', 'revised standard'], dbVersion: 'asv', label: 'RSV' },
  { keys: ['geneva', 'geneva bible'], dbVersion: 'geneva', label: 'Geneva' },
  { keys: ['tyndale', 'tyndale bible'], dbVersion: 'tyndale', label: 'Tyndale' },
  { keys: ['coverdale', 'coverdale bible'], dbVersion: 'coverdale', label: 'Coverdale' },
  { keys: ['bishops', 'bishops bible'], dbVersion: 'bishops', label: 'Bishops' },
];

function findTranslationByToken(tokenStr) {
  if (!tokenStr) return null;
  const clean = tokenStr
    .toLowerCase()
    .replace(/\b(?:the|version|translation|bible|please|now|it|this|that|in|to)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const def of TRANSLATION_DEFINITIONS) {
    for (const k of def.keys) {
      if (clean === k || clean.startsWith(k + ' ') || clean.endsWith(' ' + k)) {
        return def;
      }
    }
  }
  return null;
}

function checkTranslationCommand(rawText) {
  if (!rawText) return null;
  const lower = rawText.toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();

  // 1. "change translation to [x]", "change bible translation to [x]", "switch translation to [x]", "set translation to [x]"
  const changeMatch = lower.match(/\b(?:change|switch|set|put)\s+(?:the\s+)?(?:bible\s+)?(?:translation|version)\s+(?:to|in)\s+(.+)/i);
  if (changeMatch) {
    const res = findTranslationByToken(changeMatch[1]);
    if (res) return res;
  }

  // 2. "can I have [x]", "can I have it in [x]", "can we have [x]", "can you show [x]"
  const canHaveMatch = lower.match(/\b(?:can\s+(?:i|we|you)\s+(?:have|get|see|show|put|display)\s+(?:it\s+in\s+|this\s+in\s+|in\s+)?)\s*(.+)/i);
  if (canHaveMatch) {
    const res = findTranslationByToken(canHaveMatch[1]);
    if (res) return res;
  }

  // 3. "show in [x]", "show it in [x]", "display in [x]", "read in [x]", "view in [x]"
  const showInMatch = lower.match(/\b(?:show|display|view|read|open|put)\s+(?:this\s+|it\s+)?in\s+(.+)/i);
  if (showInMatch) {
    const res = findTranslationByToken(showInMatch[1]);
    if (res) return res;
  }

  // 4. "switch to [x]", "change to [x]"
  const switchToMatch = lower.match(/\b(?:switch|change)\s+to\s+([a-z0-9\s]+?)(?:\s+translation|\s+version|\s+bible)?$/i);
  if (switchToMatch) {
    const res = findTranslationByToken(switchToMatch[1]);
    if (res) return res;
  }

  // 5. "give me [x]", "give me it in [x]"
  const giveMeMatch = lower.match(/\b(?:give\s+me\s+(?:it\s+in\s+|in\s+)?)\s*(.+)/i);
  if (giveMeMatch) {
    const res = findTranslationByToken(giveMeMatch[1]);
    if (res) return res;
  }

  // 6. Bare translation switch: "translation [x]" or "version [x]"
  const bareTransMatch = lower.match(/\b(?:translation|version)\s+([a-z0-9\s]+)$/i);
  if (bareTransMatch) {
    const res = findTranslationByToken(bareTransMatch[1]);
    if (res) return res;
  }

  return null;
}

const testCases = [
  { phrase: "change translation to NIV", expected: "NIV" },
  { phrase: "change the translation to NIV", expected: "NIV" },
  { phrase: "can I have NIV", expected: "NIV" },
  { phrase: "can I have it in NIV", expected: "NIV" },
  { phrase: "show in NIV", expected: "NIV" },
  { phrase: "show it in NIV", expected: "NIV" },
  { phrase: "change translation to AMP", expected: "AMP" },
  { phrase: "can I have AMP", expected: "AMP" },
  { phrase: "show in AMP", expected: "AMP" },
  { phrase: "switch to KJV", expected: "KJV" },
  { phrase: "switch to ESV", expected: "ESV" },
  { phrase: "switch translation to NLT", expected: "NLT" },
  { phrase: "give me the message", expected: "MSG" },
  { phrase: "read in Amplified Bible", expected: "AMP" },
  { phrase: "display in King James Version", expected: "KJV" },
];

let passed = 0;
for (const tc of testCases) {
  const result = checkTranslationCommand(tc.phrase);
  assert(result, `Failed to match: "${tc.phrase}"`);
  assert.strictEqual(result.label, tc.expected, `Expected ${tc.expected} for "${tc.phrase}", got ${result.label}`);
  passed++;
  console.log(`✓ "${tc.phrase}" → ${result.label} (${result.dbVersion})`);
}

console.log(`\n🎉 All ${passed}/${testCases.length} translation voice test cases passed!`);
