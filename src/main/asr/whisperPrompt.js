/**
 * Build whisper.cpp initial_prompt to bias decoding toward Bible/command vocabulary.
 * Keep under ~224 tokens — whisper prompt context is limited.
 */
'use strict';

const { buildOcsGrammar } = require('./ocsGrammar');

const FOCUSED_BOOKS = [
  'Colossians', 'Corinthians', 'Thessalonians', 'Philippians',
  'Galatians', 'Ephesians', 'Habakkuk', 'Zephaniah', 'Haggai',
  'Zechariah', 'Malachi', 'Deuteronomy', 'Ecclesiastes', 'Isaiah',
  'Jeremiah', 'Lamentations', 'Ezekiel', 'Philemon', 'Revelation',
];
const CORE_BOOKS = FOCUSED_BOOKS;

const EXAMPLE_REFS = [
  'Colossians 3 22',
  'John 3 16',
  'Romans 8 28',
  'Psalm 23 1',
  '2 Corinthians 5 17',
  '1 Thessalonians 5 17',
  'chapter', 'verse', 'verses',
];

const COMMANDS = [
  'next verse', 'previous verse', 'black screen', 'blank screen', 'clear screen', 'screen on',
  'first verse', 'last verse', 'stop timer',
];

/**
 * @param {{ maxChars?: number }} [opts]
 * @returns {string}
 */
function buildWhisperInitialPrompt(opts = {}) {
  const maxChars = opts.maxChars || 400;
  const parts = [
    `Scripture: ${EXAMPLE_REFS.join(', ')}.`,
    `Books: ${FOCUSED_BOOKS.join(', ')}.`,
    'AV: next verse, previous verse, clear screen.',
  ];
  let prompt = parts.join(' ');
  if (prompt.length > maxChars) {
    prompt = prompt.slice(0, maxChars - 1).replace(/\s+\S*$/, '');
  }
  return prompt;
}

/**
 * Lightweight bookish arming (shared with Vosk Pass B heuristics).
 */
const TRIGGER_RE = /\b(ocs|oasis|ocean|osiris|obvious|media|meter|medium|median|oh see ess|oh see es)\b/i;
const BOOK_TOKEN_RE = /\b(?:(?:the\s+)?book\s+of|genesis|exodus|leviticus|numbers|deuteronomy|joshua|judges|ruth|samuel|kings|chronicles|ezra|nehemiah|esther|job|psalms?|proverbs|ecclesiastes|isaiah|aisayan|aisaya|asayan|isayan|jeremiah|jaymiah|jayemiah|jerimiah|jeremy|lamentations|ezekiel|daniel|hosea|joel|amos|obadiah|jonah|micah|nahum|habakkuk|zephaniah|haggai|zechariah|malachi|matthew|mark|luke|john|acts|romans|corinthians|galatians|ephesians|philippians|philippines|colossians|colosians|coloshas?|colosha's?|caloshas?|calosha's?|collisions|collosions|collusion|collotions|coalition|thessalonians|timothy|titus|philemon|hebrews|james|peter|jude|revelation|revelations)\b/i;
const NUMBERISH_RE = /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|verse|verses|chapter|vs)\b/i;

function shouldArmRollingDecode(text) {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return false;
  if (TRIGGER_RE.test(t)) return true;
  if (/\b(?:the\s+)?book\s+of\b/i.test(t)) return true;
  return BOOK_TOKEN_RE.test(t) && NUMBERISH_RE.test(t);
}

module.exports = {
  buildWhisperInitialPrompt,
  shouldArmRollingDecode,
  CORE_BOOKS,
  buildOcsGrammar,
};
