/**
 * Scripture read-along (word-pop teleprompt) — ASR cursor advance helpers.
 * Display rendering lives in View / MiniPreview; this module is pure logic.
 */
'use strict';

const SKIP_LIMIT = 2;

/** Strip HTML tags for matching / tokenization. */
function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalize a token for matching (lowercase, no punctuation). */
function normToken(w) {
  return String(w || '')
    .toLowerCase()
    .replace(/[^\w'-]/g, '')
    .replace(/^'+|'+$/g, '');
}

/**
 * Split display text into tokens preserving punctuation on display form.
 * @returns {{ display: string, norm: string }[]}
 */
function tokenizePassage(text) {
  const plain = stripHtml(text);
  if (!plain) return [];
  const parts = plain.split(/(\s+)/).filter((p) => p.length && !/^\s+$/.test(p));
  return parts.map((display) => ({ display, norm: normToken(display) })).filter((t) => t.norm);
}

function editDistance(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 1) return 2;
  if (!m) return n;
  if (!n) return m;
  const row = new Array(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[n];
}

function tokensMatch(heard, expected) {
  if (!heard || !expected) return false;
  if (heard === expected) return true;
  if (heard.length >= 3 && (expected.startsWith(heard) || heard.startsWith(expected))) return true;
  return editDistance(heard, expected) <= 1;
}

const { ReferenceAligner } = require('../../main/aligner/referenceAligner');

/**
 * Advance activeIndex using the latest ASR transcript against passage tokens.
 * @deprecated Use ReferenceAligner directly per FR-5.31. Kept as compatibility bridge.
 *
 * @param {string} transcript
 * @param {{ display: string, norm: string }[]|string[]} tokens
 * @param {number} activeIndex current index (-1 = not started)
 * @returns {number} new activeIndex
 */
function advanceReadAlong(transcript, tokens, activeIndex) {
  if (!tokens || !tokens.length) return activeIndex;
  const rawText = Array.isArray(tokens)
    ? tokens.map((t) => (typeof t === 'string' ? t : (t.display || t.norm || ''))).join(' ')
    : String(tokens);

  const aligner = new ReferenceAligner();
  aligner.setReference('scripture', rawText);
  if (typeof activeIndex === 'number' && activeIndex >= 0) {
    aligner.cursor = activeIndex;
  }
  const res = aligner.feed(transcript);
  return res ? res.wordIndex : (typeof activeIndex === 'number' ? activeIndex : -1);
}

/**
 * Build a bible setContent payload with optional readAlong metadata.
 */
function buildReadAlongPayload({
  title,
  body,
  tokens,
  activeIndex,
  enabled,
  rangeStart,
  rangeEnd,
  currentVerse,
  version = 'kjv',
}) {
  const data = { title, body, version: (version || 'kjv').toUpperCase() };
  if (rangeEnd != null && rangeStart != null && rangeEnd > rangeStart) {
    data.rangeStart = rangeStart;
    data.rangeEnd = rangeEnd;
    data.currentVerse = currentVerse != null ? currentVerse : rangeStart;
  }
  if (enabled && tokens && tokens.length) {
    data.readAlong = {
      enabled: true,
      tokens: tokens.map((t) => (typeof t === 'string' ? t : t.display || t.norm || '')),
      activeIndex: typeof activeIndex === 'number' ? activeIndex : -1,
      rangeStart: data.rangeStart,
      rangeEnd: data.rangeEnd,
      currentVerse: data.currentVerse,
    };
  }
  return { type: 'bible', data };
}

/**
 * Range title (John 3:1-4) plus a single verse body for sequential read-along.
 */
function formatRangeStep(bookName, chapter, rangeStart, rangeEnd, currentVerse, verseTexts) {
  const start = Math.max(1, rangeStart | 0);
  let end = Math.max(start, (rangeEnd | 0) || start);
  const max = verseTexts?.length || end;
  end = Math.min(end, max);
  let cur = Math.max(start, Math.min(end, (currentVerse | 0) || start));
  const body = String(verseTexts[cur - 1] || '').trim();
  const title = end > start
    ? `${bookName} ${chapter}:${start}-${end}`
    : `${bookName} ${chapter}:${cur}`;
  return { title, body, startVerse: start, endVerse: end, currentVerse: cur };
}

/**
 * Format a passage title and joined body from verse strings (1-based inclusive).
 * Prefer formatRangeStep for sequential range presentation.
 */
function formatPassage(bookName, chapter, startVerse, endVerse, verseTexts) {
  const start = Math.max(1, startVerse | 0);
  let end = Math.max(start, (endVerse | 0) || start);
  const max = verseTexts?.length || end;
  end = Math.min(end, max);
  const parts = [];
  for (let v = start; v <= end; v++) {
    const t = verseTexts[v - 1];
    if (t) parts.push(String(t).trim());
  }
  const body = parts.join(' ');
  const title = end > start
    ? `${bookName} ${chapter}:${start}-${end}`
    : `${bookName} ${chapter}:${start}`;
  return { title, body, startVerse: start, endVerse: end };
}

/** True when read-along cursor is on or near the last token of the current verse. */
function isAtVerseEnd(activeIndex, tokens) {
  if (!tokens || !tokens.length) return false;
  // Reached end if on the final token or second-to-last (tolerant to trailing punctuation / dropped minor words)
  const threshold = Math.max(0, tokens.length - 2);
  return typeof activeIndex === 'number' && activeIndex >= threshold && activeIndex >= 0;
}

module.exports = {
  stripHtml,
  normToken,
  tokenizePassage,
  advanceReadAlong,
  buildReadAlongPayload,
  formatPassage,
  formatRangeStep,
  isAtVerseEnd,
  tokensMatch,
  editDistance,
  SKIP_LIMIT,
};
