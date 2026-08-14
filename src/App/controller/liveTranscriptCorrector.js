/**
 * Tier 1 — Live Transcript display-only dictionary corrector (SymSpell-style).
 * MUST NOT be used for reference resolution or session archive append.
 */
'use strict';

const vocab = require('./data/domainVocab.json');

const MAX_EDIT = 2;
const MIN_LEN_DIST2 = 6;

/** @type {Map<string, string>} */
const preferredByLower = new Map();
/** @type {Map<string, string>} */
const asrMap = new Map();
/** @type {Set<string>} */
const dictionary = new Set();

function addPreferred(display) {
  const s = String(display || '').trim();
  if (!s) return;
  const lower = s.toLowerCase();
  dictionary.add(lower);
  if (!preferredByLower.has(lower)) preferredByLower.set(lower, s);
  const parts = lower.split(/\s+/);
  if (parts.length > 1) {
    const last = parts[parts.length - 1];
    dictionary.add(last);
    if (!preferredByLower.has(last)) preferredByLower.set(last, preferredByLower.get(lower) || s);
  }
}

for (const book of vocab.books || []) addPreferred(book);
for (const term of vocab.churchTerms || []) addPreferred(term);
for (const [from, to] of Object.entries(vocab.asrMap || {})) {
  const key = String(from).toLowerCase().trim();
  if (!key || /\s/.test(key)) continue;
  asrMap.set(key, to);
  addPreferred(to);
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > MAX_EDIT) return MAX_EDIT + 1;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    const tmp = prev;
    prev = cur;
    cur = tmp;
  }
  return prev[n];
}

function matchCase(source, replacement) {
  if (!source || !replacement) return replacement;
  if (source === source.toUpperCase()) return replacement.toUpperCase();
  if (source[0] === source[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function fuzzyCorrectToken(lower) {
  if (lower.length < 3) return null;
  let best = null;
  let bestDist = MAX_EDIT + 1;
  let tie = false;
  for (const cand of dictionary) {
    if (Math.abs(cand.length - lower.length) > MAX_EDIT) continue;
    const d = levenshtein(lower, cand);
    if (d > MAX_EDIT) continue;
    if (d === 2 && lower.length < MIN_LEN_DIST2) continue;
    if (d < bestDist) {
      bestDist = d;
      best = cand;
      tie = false;
    } else if (d === bestDist && cand !== best) {
      tie = true;
    }
  }
  if (!best || tie || bestDist === 0) return null;
  return preferredByLower.get(best) || best;
}

function correctToken(token) {
  const m = String(token).match(/^(\W*)([\w'-]+)(\W*)$/);
  if (!m) return token;
  const [, lead, word, trail] = m;
  const lower = word.toLowerCase();

  if (asrMap.has(lower)) {
    return lead + matchCase(word, asrMap.get(lower)) + trail;
  }

  const fuzzy = fuzzyCorrectToken(lower);
  if (fuzzy) return lead + matchCase(word, fuzzy) + trail;
  return token;
}

/**
 * Correct domain vocabulary in a transcript line for Live Transcript display.
 */
function correctLiveTranscript(text) {
  if (!text || typeof text !== 'string') return text;
  let prefix = '';
  let body = text;
  const tag = text.match(/^(\[B\]\s*)/i);
  if (tag) {
    prefix = tag[1];
    body = text.slice(tag[1].length);
  }
  const parts = body.split(/(\s+)/);
  const out = parts.map((p) => (/^\s+$/.test(p) ? p : correctToken(p)));
  return prefix + out.join('');
}

module.exports = {
  correctLiveTranscript,
  correctToken,
  levenshtein,
  _test: { dictionary, asrMap, preferredByLower, fuzzyCorrectToken },
};
