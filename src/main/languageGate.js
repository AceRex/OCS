/**
 * ASR language gating — filter non-target speech (e.g. live interpreter)
 * so only configured transcription language(s) reach Live Transcript / commands.
 *
 * Chunking: WhisperEngine already segments on energy-VAD (~0.45s silence /
 * max 6s). Language detection runs per those chunks, not once per session.
 *
 * Code-switching (edge case): detection is per VAD chunk. A short foreign
 * phrase inside an otherwise-target chunk may still pass — documented
 * limitation (FR-3.64). Sub-chunk filtering is not attempted.
 */
'use strict';

const DEFAULT_LANGS = ['en'];

/** ISO-ish codes we expose in Settings (whisper-compatible). */
const LANGUAGE_OPTIONS = [
  { id: 'en', label: 'English' },
  { id: 'yo', label: 'Yoruba' },
  { id: 'fr', label: 'French' },
  { id: 'es', label: 'Spanish' },
  { id: 'pt', label: 'Portuguese' },
  { id: 'sw', label: 'Swahili' },
  { id: 'ha', label: 'Hausa' },
  { id: 'ig', label: 'Igbo' },
  { id: 'de', label: 'German' },
  { id: 'zh', label: 'Chinese' },
  { id: 'ar', label: 'Arabic' },
];

function normalizeLangCode(code) {
  if (!code) return null;
  let c = String(code).trim().toLowerCase().replace(/[^a-z]/g, '');
  if (!c) return null;
  // whisper sometimes returns full names
  const aliases = {
    english: 'en',
    yoruba: 'yo',
    french: 'fr',
    spanish: 'es',
    portuguese: 'pt',
    swahili: 'sw',
    hausa: 'ha',
    igbo: 'ig',
    german: 'de',
    chinese: 'zh',
    arabic: 'ar',
  };
  if (aliases[c]) return aliases[c];
  if (c.length > 2) c = c.slice(0, 2);
  return c;
}

function normalizeAllowList(langs) {
  const list = Array.isArray(langs) ? langs : [langs];
  const out = [];
  for (const l of list) {
    const n = normalizeLangCode(l);
    if (n && !out.includes(n)) out.push(n);
  }
  return out.length ? out : [...DEFAULT_LANGS];
}

/**
 * Pull detected language from whisper-node-addon / whisper.cpp result shapes.
 */
function extractDetectedLanguage(result) {
  if (!result || typeof result !== 'object') return null;
  const candidates = [
    result.language,
    result.lang,
    result.detected_language,
    result.detection?.language,
    result.result?.language,
    result.meta?.language,
  ];
  for (const c of candidates) {
    const n = normalizeLangCode(c);
    if (n) return n;
  }
  // Some builds attach language on first segment
  const segs = result.transcription;
  if (Array.isArray(segs) && segs[0] && typeof segs[0] === 'object') {
    const n = normalizeLangCode(segs[0].language || segs[0].lang);
    if (n) return n;
  }
  return null;
}

function isTargetLanguage(detected, allowList) {
  const allow = normalizeAllowList(allowList);
  const d = normalizeLangCode(detected);
  if (!d) return null; // unknown — caller decides
  return allow.includes(d);
}

/**
 * Heuristic when .en-only model cannot detect language: non-Latin scripts
 * and extreme garble. Latin-script languages (Yoruba, French) need real
 * whisper detect — this is a last-resort filter only.
 */
function heuristicNonTargetText(text, { targetLangs = DEFAULT_LANGS, confidence = null } = {}) {
  const t = String(text || '').trim();
  if (!t) return { filtered: true, reason: 'empty' };

  const allow = normalizeAllowList(targetLangs);
  const wantsLatin = allow.every((l) => !['zh', 'ar', 'he', 'ja', 'ko', 'ru'].includes(l));

  // Non-Latin script while targets are Latin-family
  if (wantsLatin) {
    const nonLatin = (t.match(/[^\u0000-\u024F\u1E00-\u1EFF\s\d'".,;:!?()-]/g) || []).length;
    if (nonLatin / Math.max(1, t.length) > 0.25) {
      return { filtered: true, reason: 'non_latin_script' };
    }
  }

  // Very low confidence + short nonsense → likely forced-.en garble of other speech
  if (confidence != null && confidence < 0.28 && t.split(/\s+/).length <= 4) {
    return { filtered: true, reason: 'low_conf_garble' };
  }

  return { filtered: false };
}

/**
 * Decide whether a chunk should be skipped.
 * @returns {{ skip: boolean, language: string|null, reason?: string }}
 */
function evaluateLanguageGate({
  enabled = true,
  allowList = DEFAULT_LANGS,
  detectedLanguage = null,
  text = '',
  confidence = null,
  englishOnlyModel = false,
} = {}) {
  if (!enabled) {
    return { skip: false, language: normalizeLangCode(detectedLanguage) };
  }

  const allow = normalizeAllowList(allowList);
  const detected = normalizeLangCode(detectedLanguage);

  if (detected) {
    if (!allow.includes(detected)) {
      return { skip: true, language: detected, reason: 'non_target_language' };
    }
    return { skip: false, language: detected };
  }

  // No detection available (common on .en-only models)
  if (englishOnlyModel) {
    const h = heuristicNonTargetText(text, { targetLangs: allow, confidence });
    if (h.filtered) {
      return { skip: true, language: 'unknown', reason: h.reason || 'heuristic_non_target' };
    }
  }

  // Unknown language, gate on: admit (avoid false drops of target speech)
  return { skip: false, language: detected };
}

module.exports = {
  DEFAULT_LANGS,
  LANGUAGE_OPTIONS,
  normalizeLangCode,
  normalizeAllowList,
  extractDetectedLanguage,
  isTargetLanguage,
  heuristicNonTargetText,
  evaluateLanguageGate,
};
