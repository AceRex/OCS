/**
 * FR-3.66 — Per-engine phonetic alias sets.
 *
 * Whisper.cpp and Vosk produce different ASR error patterns for the same
 * utterances (different vocab, different acoustic models, different beam search).
 * This module maintains TWO SEPARATE alias sets — one tuned for each engine —
 * so trigger detection and book-name matching use the right phonetic neighbours.
 *
 * Usage:
 *   const { getTriggerRe, getBookAliasRe } = require('./engineAliases');
 *   const re = getTriggerRe('whisper');
 *
 * Called at startup by AsrFacade to attach aliases to the active adapter.
 * Called by BroadcastEngine via adapter.aliases.getTriggerRe() so no
 * engine-specific code leaks into the renderer pipeline.
 */
'use strict';

// ── Trigger / Wake-word Alias Sets ──────────────────────────────────────────
// "OCS" — the voice-command trigger word.
//
// Whisper.cpp tends to:
//   - Transcribe unknown acronyms as common words ("ocs" → "ox", "ox's", "oaks", "ox ease")
//   - Capitalise if seen as initialism: "OCS" → keep as "ocs" after lower()
// Vosk tends to:
//   - Hallucinate audio as common words: "ocs" → "ocean", "osiris", "over", "august"
//   - Lowercase always (Vosk is lowercase-only output)

const WHISPER_TRIGGER_TOKENS = [
  'ocs',
  'ox',
  'oaks',
  'ocs.', "ox's",
  'ox ease',
  'okes',
  'o.c.s',
  'o c s',
  'over', // sometimes heard at beginning
  'orca',
  'oka',
  'oaks',
];

const VOSK_TRIGGER_TOKENS = [
  'ocs',
  'ocean',
  'osiris',
  'over',
  'oases',
  'oscar',
  'orca',
  'oasis',
  'augers',
  'awesome',
  'oh cease',
  'o.c.s',
  'o c s',
];

// Book-name alias pairs: [pattern, canonical] — engine-specific mishear fixes.
//
// These SUPPLEMENT (not replace) the corrections already in normalizeTranscript()
// in BroadcastEngine.js. This layer is the "pre-matcher" — applied to raw ASR
// text before smartBibleMatch() runs. normalizeTranscript() is for display text.

/**
 * @typedef {{ pattern: RegExp, replacement: string }} BookAlias
 */

/** @type {BookAlias[]} */
const WHISPER_BOOK_ALIASES = [
  // Whisper.cpp often capitalises mid-sentence proper nouns correctly
  // but misses: Obadiah, Nahum, Habakkuk
  { pattern: /\b(obadiyah|obadiha|obadie)\b/gi, replacement: 'Obadiah' },
  { pattern: /\b(naham|naum|na'um)\b/gi, replacement: 'Nahum' },
  { pattern: /\b(hab[ae]kok|habak[uo]k|ha'bak)\b/gi, replacement: 'Habakkuk' },
  { pattern: /\b(zef[ae]niah|zef\s*ania|sophonias)\b/gi, replacement: 'Zephaniah' },
  { pattern: /\b(ag[ae]us|agg?eus)\b/gi, replacement: 'Haggai' },
  // Whisper: "Zechariah" sometimes → "zachariah"
  { pattern: /\b(zacha?ria[h]?)\b/gi, replacement: 'Zechariah' },
  // Whisper: "Philippians" sometimes → "filippians" (Italian speaker patterns)
  { pattern: /\b(filippians?|filipp?i|filipe\s*ans?)\b/gi, replacement: 'Philippians' },
  // Whisper: "Ecclesiastes" mishears
  { pattern: /\b(ecclesia\s+sticks?|ecclesiasticks?|ecclesiastics?|eclesiastes|eklesiastes?|ecclesiasti)\b/gi, replacement: 'Ecclesiastes' },
  // Whisper hallucinations around "first / second" prefix books
  { pattern: /\b(one\s+king|1\s+king)\b/gi, replacement: '1 Kings' },
  { pattern: /\b(two\s+king|2\s+king)\b/gi, replacement: '2 Kings' },
  { pattern: /\b(one\s+chronicle|1\s+chronicle)\b/gi, replacement: '1 Chronicles' },
  { pattern: /\b(two\s+chronicle|2\s+chronicle)\b/gi, replacement: '2 Chronicles' },
  { pattern: /\b(one\s+samuel|1\s+samuel)\b/gi, replacement: '1 Samuel' },
  { pattern: /\b(two\s+samuel|2\s+samuel)\b/gi, replacement: '2 Samuel' },
];

/** @type {BookAlias[]} */
const VOSK_BOOK_ALIASES = [
  // Vosk is all-lowercase; smartBibleMatch normalises casing, but these patterns
  // need to fire before matching:
  { pattern: /\b(obadiyah|obadya|oba die)\b/gi, replacement: 'Obadiah' },
  { pattern: /\b(naham|na hum)\b/gi, replacement: 'Nahum' },
  { pattern: /\b(hab[ae]kok|habakkuk)\b/gi, replacement: 'Habakkuk' },
  { pattern: /\b(zephania|sofonias)\b/gi, replacement: 'Zephaniah' },
  // Vosk-specific: "mach" / "mock" already handled in normalizeTranscript for display;
  // this layer handles it pre-matcher (Vosk outputs raw lowercase, normalizeTranscript
  // runs on already-displayed text)
  {
    pattern: /\b(mach|match|marsh|merk|mock)\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/gi,
    replacement: (_, _book, ch) => `Mark ${ch}`,
  },
  { pattern: /\bbook\s+of\s+junk\b/gi, replacement: 'book of John' },
  { pattern: /\b(molokai|malakai|malakhi)\b/gi, replacement: 'Malachi' },
  { pattern: /\b(aisayan|aisaya|asayan|isayan)\b/gi, replacement: 'Isaiah' },
  { pattern: /\b(jaymiah|jeremia|jeremiya)\b/gi, replacement: 'Jeremiah' },
  { pattern: /\b(colosians|collusions?|collations?)\b/gi, replacement: 'Colossians' },
  { pattern: /\b(philippine?s?)\b/gi, replacement: 'Philippians' },
  { pattern: /\b(ecclesia\s+sticks?|ecclesiasticks?|ecclesiastics?|eclesiastes|eklesiastes?|ecclesiasti)\b/gi, replacement: 'Ecclesiastes' },
  { pattern: /\b(rumus|rumas|romus|rumos|roomas)\b/gi, replacement: 'Romans' },
  { pattern: /\b(foske|foski|foskey|fuski|foskins?|foskis|foskes|fuskins?|force\s+kings?|faskins?|faskings?|faskens?|fast\s+kings?)\b/gi, replacement: '1 Kings' },
];

// ── Compiled RegExps ─────────────────────────────────────────────────────────

function buildTriggerRe(tokens) {
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
}

const _compiled = {
  whisper: {
    trigger: buildTriggerRe(WHISPER_TRIGGER_TOKENS),
    bookAliases: WHISPER_BOOK_ALIASES,
  },
  vosk: {
    trigger: buildTriggerRe(VOSK_TRIGGER_TOKENS),
    bookAliases: VOSK_BOOK_ALIASES,
  },
};

/**
 * Get the trigger-word RegExp for the given engine.
 * Returns a new RegExp instance each call so consumers can reset lastIndex safely.
 * @param {'whisper'|'vosk'} engineName
 * @returns {RegExp}
 */
function getTriggerRe(engineName) {
  const tokens = engineName === 'whisper' ? WHISPER_TRIGGER_TOKENS : VOSK_TRIGGER_TOKENS;
  return buildTriggerRe(tokens);
}

/**
 * Get the book alias list for the given engine.
 * @param {'whisper'|'vosk'} engineName
 * @returns {BookAlias[]}
 */
function getBookAliasRe(engineName) {
  return engineName === 'whisper' ? WHISPER_BOOK_ALIASES : VOSK_BOOK_ALIASES;
}

/**
 * Apply engine-specific book aliases to raw ASR text before matching.
 * @param {string} text
 * @param {'whisper'|'vosk'} engineName
 * @returns {string}
 */
function applyBookAliases(text, engineName) {
  const aliases = getBookAliasRe(engineName);
  let t = String(text || '');
  for (const { pattern, replacement } of aliases) {
    t = t.replace(pattern, replacement);
  }
  return t;
}

module.exports = {
  WHISPER_TRIGGER_TOKENS,
  VOSK_TRIGGER_TOKENS,
  WHISPER_BOOK_ALIASES,
  VOSK_BOOK_ALIASES,
  getTriggerRe,
  getBookAliasRe,
  applyBookAliases,
};
