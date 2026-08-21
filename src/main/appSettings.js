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
  /** Intro bumper file path for recording auto-merge (MP4/WebM/audio). */
  sessionIntroPath: null,
  /** Outro bumper file path for recording auto-merge (MP4/WebM/audio). */
  sessionOutroPath: null,
  /** Auto-merge intro/outro bumpers when a session recording completes. ON by default. */
  sessionAutoMergeBumpers: true,
  /** NDI & Broadcast Streaming (FR-4.42). OFF by default. */
  ndiStreamEnabled: false,
  /** Authentication Offline Grace Period in hours (FR-13.5). Default 72 hours. */
  authGracePeriodHours: 72,
  /** Auth server login base URL (FR-13.3). Overridable via OCS_AUTH_BASE_URL in dev. */
  authLoginUrl: process.env.OCS_AUTH_BASE_URL || 'https://auth.churchocs.com',
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
