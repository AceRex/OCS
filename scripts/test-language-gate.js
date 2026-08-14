/**
 * Language gate unit tests (FR-3.64).
 * Usage: node scripts/test-language-gate.js
 */
'use strict';

const {
  extractDetectedLanguage,
  evaluateLanguageGate,
  heuristicNonTargetText,
  normalizeAllowList,
} = require('../src/main/languageGate');

let fail = 0;
function assert(cond, msg) {
  if (cond) console.log('PASS', msg);
  else {
    console.error('FAIL', msg);
    fail += 1;
  }
}

// A1 — clean English admitted
{
  const g = evaluateLanguageGate({
    enabled: true,
    allowList: ['en'],
    detectedLanguage: 'en',
    text: 'John three sixteen',
    confidence: 0.8,
  });
  assert(!g.skip && g.language === 'en', 'A1 English chunk admitted');
}

// A2 — Yoruba interpreter filtered when target is English
{
  const g = evaluateLanguageGate({
    enabled: true,
    allowList: ['en'],
    detectedLanguage: 'yo',
    text: '',
    confidence: 0.9,
  });
  assert(g.skip && g.reason === 'non_target_language', 'A2 Yoruba filtered for en target');
}

// A3 — code-switch: no detection → admit (avoid dropping target mid-chunk)
{
  const g = evaluateLanguageGate({
    enabled: true,
    allowList: ['en'],
    detectedLanguage: null,
    text: 'and Jesus said olorun is good',
    confidence: 0.7,
    englishOnlyModel: false,
  });
  assert(!g.skip, 'A3 unknown lang admits (code-switch limitation)');
}

// A4 — gate off
{
  const g = evaluateLanguageGate({
    enabled: false,
    allowList: ['en'],
    detectedLanguage: 'yo',
  });
  assert(!g.skip, 'A4 gate disabled admits all');
}

// A5 — extract language from result shapes
assert(extractDetectedLanguage({ language: 'English' }) === 'en', 'extract English→en');
assert(extractDetectedLanguage({ lang: 'yo' }) === 'yo', 'extract yo');
assert(normalizeAllowList(['EN', 'yo']).join(',') === 'en,yo', 'allowlist normalize');

// A6 — heuristic non-latin
{
  const h = heuristicNonTargetText('这是中文', { targetLangs: ['en'], confidence: 0.5 });
  assert(h.filtered, 'A6 non-latin filtered for en target');
}

process.exitCode = fail ? 1 : 0;
if (!fail) console.log('\nAll language-gate tests passed.');
