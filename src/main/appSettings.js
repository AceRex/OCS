/**
 * Lightweight persisted app settings (userData/settings.json).
 */
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

const DEFAULTS = {
  /** 'always' | 'live' — FR-13.3 */
  sleepPrevention: 'always',
  /** Tier 1 — Live Transcript dictionary correction (display only). OFF by default. */
  liveTranscriptCorrection: false,
  /** Tier 2 — Session PDF Ollama cleanup. OFF by default. */
  sessionTranscriptCleanup: false,
  /** Scripture read-along word-pop on Speaker View (FR-3.62). ON by default. */
  scriptureReadAlong: true,
  /**
   * Primary transcription language (ISO-ish whisper code). Default English.
   * Interpreter speech in other languages is filtered when languageGateEnabled.
   */
  transcriptionLanguage: 'en',
  /** When true, skip VAD chunks not detected as transcriptionLanguage (FR-3.64). */
  languageGateEnabled: true,
};

let cache = null;
let settingsPath = null;

function init(userDataPath) {
  settingsPath = path.join(userDataPath, 'settings.json');
}

async function load() {
  if (!settingsPath) throw new Error('appSettings not initialized');
  if (cache) return cache;
  try {
    const raw = await fsp.readFile(settingsPath, 'utf8');
    cache = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (_) {
    cache = { ...DEFAULTS };
  }
  return cache;
}

function loadSync() {
  if (!settingsPath) return { ...DEFAULTS };
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsPath, 'utf8')) };
  } catch (_) {
    cache = { ...DEFAULTS };
  }
  return cache;
}

async function save(patch) {
  const cur = await load();
  cache = { ...cur, ...patch };
  await fsp.mkdir(path.dirname(settingsPath), { recursive: true });
  await fsp.writeFile(settingsPath, JSON.stringify(cache, null, 2));
  return cache;
}

function get(key) {
  return loadSync()[key];
}

module.exports = { init, load, loadSync, save, get, DEFAULTS };
