/**
 * Tier 2 — Session transcript archival cleanup via local Ollama.
 * Constrained prompt + post-hoc chunk validation. Never overwrites raw.
 */
'use strict';

const path = require('path');
const fs = require('fs');

const OVERALL_BUDGET_MS = 90_000;
const CHUNK_TIMEOUT_MS = 45_000;
const MAX_LINES = 12;
const MAX_WORDS = 500;
const JACCARD_MIN = 0.45;
const LEV_SIM_MIN = 0.85;
const MAX_TOKEN_CHANGE_RATIO = 0.40;

const SYSTEM_PROMPT = `You are a transcript proofreader for a church service recording.
Output ONLY the corrected transcript text for the provided chunk.
Keep the same language, the same meaning, and the same number of lines as the input.
Fix only clear ASR errors (misheard words, obvious garbling), punctuation, and capitalization.
Prefer Bible and church vocabulary when a mishearing is near a domain term.
Session scripture references may be provided — prefer those book names when nearby text is garbled.
Do NOT add, remove, summarize, paraphrase, invent content, or insert commentary.
Do NOT wrap the output in markdown or code fences.
Do NOT include a preface or explanation — only the corrected lines.`;

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s'-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function sentenceCount(text) {
  const s = String(text || '').trim();
  if (!s) return 0;
  const parts = s.split(/[.!?]+/).map((x) => x.trim()).filter(Boolean);
  return Math.max(1, parts.length);
}

function levenshtein(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  const m = s.length;
  const n = t.length;
  if (!m) return n;
  if (!n) return m;
  const row = new Array(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      const cost = s.charCodeAt(i - 1) === t.charCodeAt(j - 1) ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[n];
}

function normalizedLevenshteinSimilarity(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  const maxLen = Math.max(s.length, t.length, 1);
  return 1 - levenshtein(s, t) / maxLen;
}

function tokenJaccard(a, b) {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

function tokenChangeRatio(original, corrected) {
  const o = tokenize(original);
  const c = tokenize(corrected);
  if (!o.length) return c.length ? 1 : 0;
  // Approximate: fraction of original tokens not present in corrected multiset sense via set diff
  const cs = new Set(c);
  let missing = 0;
  for (const t of o) if (!cs.has(t)) missing += 1;
  const lengthDelta = Math.abs(o.length - c.length) / Math.max(o.length, c.length, 1);
  return Math.max(missing / o.length, lengthDelta);
}

/**
 * Validate a model correction against the original chunk text.
 * @returns {{ ok: boolean, reason?: string, metrics?: object }}
 */
function validateChunkCorrection(original, corrected) {
  const orig = String(original || '').replace(/\r\n/g, '\n').trim();
  const corr = String(corrected || '')
    .replace(/\r\n/g, '\n')
    .replace(/^```[\w]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();

  if (!orig) return { ok: true, metrics: { empty: true } };
  if (!corr) return { ok: false, reason: 'empty_output' };

  const origLines = orig.split('\n');
  const corrLines = corr.split('\n');
  if (origLines.length > 1 && corrLines.length !== origLines.length) {
    return { ok: false, reason: 'line_count_mismatch', metrics: { origLines: origLines.length, corrLines: corrLines.length } };
  }

  const scOrig = sentenceCount(orig);
  const scCorr = sentenceCount(corr);
  if (Math.abs(scOrig - scCorr) > 1) {
    return { ok: false, reason: 'sentence_count_delta', metrics: { scOrig, scCorr } };
  }

  const jaccard = tokenJaccard(orig, corr);
  const levSim = normalizedLevenshteinSimilarity(orig, corr);
  const changeRatio = tokenChangeRatio(orig, corr);

  if (jaccard < JACCARD_MIN) {
    return { ok: false, reason: 'jaccard_low', metrics: { jaccard, levSim, changeRatio } };
  }
  if (levSim < LEV_SIM_MIN) {
    return { ok: false, reason: 'levenshtein_low', metrics: { jaccard, levSim, changeRatio } };
  }
  if (changeRatio > MAX_TOKEN_CHANGE_RATIO) {
    return { ok: false, reason: 'too_many_token_changes', metrics: { jaccard, levSim, changeRatio } };
  }

  return { ok: true, metrics: { jaccard, levSim, changeRatio } };
}

function wordCount(text) {
  return tokenize(text).length;
}

function chunkLines(lines) {
  const chunks = [];
  let buf = [];
  let words = 0;
  for (const line of lines) {
    const w = wordCount(line.text || '');
    if (buf.length && (buf.length >= MAX_LINES || words + w > MAX_WORDS)) {
      chunks.push(buf);
      buf = [];
      words = 0;
    }
    buf.push(line);
    words += w;
  }
  if (buf.length) chunks.push(buf);
  return chunks;
}

function formatChunkForPrompt(chunkLinesArr) {
  return chunkLinesArr
    .map((l) => `${l.stamp || '00:00'} | ${(l.text || '').trim()}`)
    .join('\n');
}

function parseChunkResponse(response, expectedLineCount) {
  let text = String(response || '')
    .replace(/^```[\w]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();
  // Strip accidental "MM:SS |" prefixes the model may echo
  const lines = text.split('\n').map((row) => {
    const m = row.match(/^\s*\d{1,2}:\d{2}\s*\|\s*(.*)$/);
    return m ? m[1] : row;
  });
  if (expectedLineCount === 1) return lines.join(' ').trim();
  // Pad/truncate to expected count only for validation attempt — caller validates
  while (lines.length < expectedLineCount) lines.push('');
  return lines.slice(0, expectedLineCount).join('\n');
}

function loadDomainSnippet() {
  try {
    const p = path.join(__dirname, '..', 'App', 'controller', 'data', 'domainVocab.json');
    const v = JSON.parse(fs.readFileSync(p, 'utf8'));
    const books = (v.books || []).slice(0, 40).join(', ');
    const terms = (v.churchTerms || []).slice(0, 40).join(', ');
    return `Domain vocabulary (prefer these when fixing mishearings):\nBooks: ${books}\nChurch terms: ${terms}`;
  } catch (_) {
    return 'Prefer Bible book names and church vocabulary when fixing clear mishearings.';
  }
}

/**
 * Run cleanup over transcript lines.
 * @param {Array<{stamp:string,text:string}>} lines
 * @param {{ scriptureRefs?: string[], ollamaChat?: Function, enabled?: boolean }} opts
 */
async function cleanupTranscript(lines, opts = {}) {
  const enabled = opts.enabled !== false;
  const result = {
    status: 'skipped',
    lines: lines.map((l) => ({ ...l })),
    chunksAccepted: 0,
    chunksRejected: 0,
    note: null,
    error: null,
  };

  if (!enabled) {
    result.note = null;
    return result;
  }
  if (!lines.length) {
    result.status = 'empty';
    return result;
  }

  const ollamaChat = opts.ollamaChat;
  if (typeof ollamaChat !== 'function') {
    result.status = 'unavailable';
    result.note = 'Automatic cleanup unavailable — raw transcript shown';
    result.error = 'no_ollama_fn';
    return result;
  }

  const started = Date.now();
  const chunks = chunkLines(lines);
  const out = lines.map((l) => ({ ...l }));
  let cursor = 0;
  const domain = loadDomainSnippet();
  const refs = (opts.scriptureRefs || []).filter(Boolean);
  const refLine = refs.length
    ? `References displayed this session: ${refs.join(', ')}`
    : 'References displayed this session: (none recorded)';

  let anyAccepted = false;
  let timedOut = false;

  for (const chunk of chunks) {
    if (Date.now() - started > OVERALL_BUDGET_MS) {
      timedOut = true;
      break;
    }
    const origText = chunk.map((l) => l.text || '').join('\n');
    const prompt = [
      domain,
      refLine,
      '',
      'Correct ONLY clear transcription errors in the following lines.',
      'Return the same number of lines of body text (without stamp prefixes preferred).',
      '',
      formatChunkForPrompt(chunk),
    ].join('\n');

    let response;
    try {
      const r = await ollamaChat({
        prompt,
        system: SYSTEM_PROMPT,
        timeoutMs: CHUNK_TIMEOUT_MS,
      });
      if (!r?.ok) {
        result.chunksRejected += 1;
        cursor += chunk.length;
        continue;
      }
      response = r.response;
    } catch (err) {
      result.chunksRejected += 1;
      result.error = err.message || String(err);
      cursor += chunk.length;
      continue;
    }

    const parsed = parseChunkResponse(response, chunk.length);
    const validation = validateChunkCorrection(origText, parsed);
    if (!validation.ok) {
      result.chunksRejected += 1;
      cursor += chunk.length;
      continue;
    }

    const corrLines = parsed.split('\n');
    for (let i = 0; i < chunk.length; i++) {
      out[cursor + i] = {
        ...chunk[i],
        text: (corrLines[i] != null ? corrLines[i] : chunk[i].text || '').trim() || chunk[i].text,
      };
    }
    result.chunksAccepted += 1;
    anyAccepted = true;
    cursor += chunk.length;
  }

  result.lines = out;
  if (timedOut && !anyAccepted) {
    result.status = 'timeout';
    result.note = 'Automatic cleanup unavailable — raw transcript shown';
    result.lines = lines.map((l) => ({ ...l }));
  } else if (timedOut && anyAccepted) {
    result.status = 'partial';
    result.note = 'Cleanup partially applied; rejected sections left as raw';
  } else if (!anyAccepted && result.chunksRejected > 0) {
    result.status = 'rejected';
    result.note = 'Automatic cleanup unavailable — raw transcript shown';
    result.lines = lines.map((l) => ({ ...l }));
  } else if (anyAccepted && result.chunksRejected > 0) {
    result.status = 'partial';
    result.note = 'Cleanup partially applied; rejected sections left as raw';
  } else if (anyAccepted) {
    result.status = 'applied';
    result.note = null;
  } else {
    result.status = 'unavailable';
    result.note = 'Automatic cleanup unavailable — raw transcript shown';
  }

  return result;
}

function formatRawTranscript(lines) {
  return (lines || [])
    .map((l) => `${l.stamp || '00:00'}  ${(l.text || '').replace(/\s+/g, ' ').trim()}`)
    .filter((row) => row.trim())
    .join('\n') + '\n';
}

module.exports = {
  cleanupTranscript,
  validateChunkCorrection,
  chunkLines,
  formatRawTranscript,
  tokenize,
  tokenJaccard,
  normalizedLevenshteinSimilarity,
  SYSTEM_PROMPT,
  OVERALL_BUDGET_MS,
  CHUNK_TIMEOUT_MS,
  JACCARD_MIN,
  LEV_SIM_MIN,
};
