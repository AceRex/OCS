/**
 * whisperEngine.js
 *
 * Primary ASR implementation using whisper.cpp (node-whisper / whisper-addon bindings).
 * Handles streaming PCM audio, real-time vocal extraction over music,
 * song-constrained bias prompts, and fast rolling interim partials.
 */

'use strict';

const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');
const { buildWhisperInitialPrompt, shouldArmRollingDecode } = require('./whisperPrompt');
const { evaluateLanguageGate, extractDetectedLanguage } = require('./languageGate');

const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2; // 16-bit PCM

function resolveWhisperModel(rootDir) {
  const dir = path.join(rootDir, 'voice_server', 'models', 'whisper');
  const candidates = [
    'ggml-distil-small.en-q5_1.bin',
    'ggml-distil-small.en.bin',
    'ggml-medium-32-2.en.bin',
    'ggml-distil-medium.en-q5_1.bin',
    'ggml-distil-medium.en.bin',
    'ggml-base.en.bin',
    'ggml-small.en.bin',
    'ggml-tiny.en.bin',
    'ggml-small.bin',
    'ggml-base.bin',
    'ggml-tiny.bin',
  ];
  for (const name of candidates) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) {
      const isDistilSmall = /distil-small/.test(name);
      const isDistilMedium = /distil-medium|medium-32-2/.test(name);
      const englishOnly = /\.en\./.test(name) || /\.en-/.test(name);
      return {
        path: p,
        name,
        size: isDistilMedium ? 'distil-medium' : isDistilSmall ? 'distil-small' : 'fallback',
        dir,
        englishOnly,
      };
    }
  }
  return null;
}

class RingBuffer {
  constructor(maxBytes) {
    this.maxBytes = maxBytes;
    this.buf = Buffer.alloc(maxBytes);
    this.write = 0;
    this.size = 0;
  }

  writeChunk(chunk) {
    if (!chunk || !chunk.length) return;
    let offset = 0;
    while (offset < chunk.length) {
      const space = this.maxBytes - this.write;
      const n = Math.min(space, chunk.length - offset);
      chunk.copy(this.buf, this.write, offset, offset + n);
      this.write = (this.write + n) % this.maxBytes;
      this.size = Math.min(this.maxBytes, this.size + n);
      offset += n;
    }
  }

  snapshot() {
    if (this.size <= 0) return Buffer.alloc(0);
    if (this.size < this.maxBytes) return Buffer.from(this.buf.slice(0, this.size));
    const out = Buffer.alloc(this.maxBytes);
    const first = this.maxBytes - this.write;
    this.buf.copy(out, 0, this.write, this.maxBytes);
    this.buf.copy(out, first, 0, this.write);
    return out;
  }
}

function int16ToFloat32(buf) {
  const n = Math.floor(buf.length / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = buf.readInt16LE(i * 2) / 32768;
  }
  return out;
}

function rmsInt16(buf) {
  if (!buf || buf.length < 2) return 0;
  const n = Math.floor(buf.length / 2);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const s = buf.readInt16LE(i * 2) / 32768;
    sum += s * s;
  }
  return Math.sqrt(sum / Math.max(1, n));
}

function normalizeTranscript(text) {
  return String(text || '')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[♪♫♩♬]/g, '') // Strip music notes
    .replace(/\[(?:music|singing|applause|laughter|noise|instrumental)\]/gi, '')
    .replace(/\((?:music|singing|applause|laughter|noise|instrumental)\)/gi, '')
    .replace(/[^\w\s':.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractTranscriptionText(result) {
  if (!result) return '';
  if (typeof result === 'string') return result;
  if (Array.isArray(result.transcription)) {
    return result.transcription
      .map((row) => (Array.isArray(row) ? row[row.length - 1] : row))
      .filter(Boolean)
      .join(' ');
  }
  if (typeof result.text === 'string') return result.text;
  return String(result);
}

/** Map whisper avg logprob-ish signal -> 0..1 confidence */
function confidenceFromResult(result, text) {
  if (result && typeof result.confidence === 'number') return clamp01(result.confidence);
  if (result && typeof result.avg_logprob === 'number') {
    return clamp01(1 / (1 + Math.exp(-(result.avg_logprob + 1.0) / 0.5)));
  }
  const t = String(text || '').trim();
  if (!t) return 0.15;
  const words = t.split(/\s+/).length;
  return clamp01(0.50 + Math.min(0.4, words * 0.05));
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

class WhisperEngine extends EventEmitter {
  constructor(appDir, options = {}) {
    super();
    this.appDir = appDir || process.cwd();
    this.options = options;
    this.status = 'uninitialized';
    this.error = null;
    this.modelInfo = null;

    this.confidenceThreshold = options.confidenceThreshold ?? 0.35;
    this._whisper = null;
    this._busy = false;
    this._queue = [];

    this._sessionActive = false;
    this._inSpeech = false;
    this._speechStartedAt = 0;
    this._lastSpeechAt = 0;
    this._silenceMs = 0;
    this._uttSeq = 0;
    this._activeUttId = '0';
    this._utteranceChunks = [];
    this._rollingBuf = Buffer.alloc(0);
    this._lastProbeText = '';
    this._overlapTail = Buffer.alloc(0);
    this._isSongMode = false;

    this._initialPrompt = '';
    this._langPolicy = { enabled: false, languages: ['en'] };
    this._lastDetectedLang = 'en';

    this._preRoll = new RingBuffer(SAMPLE_RATE * BYTES_PER_SAMPLE * 1.5); // 1.5s
  }

  setSongContext({ lyrics } = {}) {
    if (lyrics && typeof lyrics === 'string' && lyrics.trim()) {
      const cleanLyrics = lyrics.replace(/\s+/g, ' ').trim().slice(0, 800);
      this._initialPrompt = `Worship song lyrics: ${cleanLyrics}`;
      this._isSongMode = true;
      console.log(`[Whisper] Song lyrics context active (${this._initialPrompt.length} chars)`);
    } else {
      this._initialPrompt = buildWhisperInitialPrompt();
      this._isSongMode = false;
    }
  }

  clearSongContext() {
    this._isSongMode = false;
    this._initialPrompt = buildWhisperInitialPrompt();
    console.log(`[Whisper] Song context cleared -> Bible/Command prompt restored`);
  }

  async init() {
    this.status = 'initializing';
    this.emit('status', { status: 'initializing' });

    try {
      const nodeWhisper = require('node-whisper') || require('./nodeWhisperBridge');
      this._whisper = nodeWhisper;

      const modelPath = this.options.modelPath || path.join(this.appDir, 'models', 'whisper', 'ggml-base.en.bin');
      this.modelInfo = {
        name: path.basename(modelPath),
        path: modelPath,
        exists: fs.existsSync(modelPath),
      };

      this._initialPrompt = buildWhisperInitialPrompt();
      this.status = 'ready';
      this.emit('status', { status: 'ready', model: this.modelInfo });
      return true;
    } catch (err) {
      this.status = 'error';
      this.error = err.message || String(err);
      this.emit('status', { status: 'error', error: this.error });
      return false;
    }
  }

  /** FR-3.65 — AsrAdapter calls initialize(), delegate to init() */
  async initialize() {
    return this.init();
  }

  /** AsrAdapter contract: return engine state for IPC status queries */
  getState() {
    return {
      status: this.status || 'uninitialized',
      model: this.modelInfo || null,
      error: this.error || null,
      engine: 'whisper',
    };
  }

  start() {
    this._sessionActive = true;
    this._resetUtterance();
    this.emit('status', { status: 'listening' });
    return true;
  }

  stop() {
    this._sessionActive = false;
    this._resetUtterance();
    this.emit('status', { status: 'stopped' });
    return true;
  }

  processAudio(pcmChunk) {
    if (!this._sessionActive || !pcmChunk || !pcmChunk.length) return;

    this._preRoll.writeChunk(pcmChunk);
    const rms = rmsInt16(pcmChunk);
    const now = Date.now();

    // Voice Activity Detection threshold (lowered in song mode to capture soft singing)
    const vadThreshold = this._isSongMode ? 0.004 : 0.008;
    const isSpeech = rms > vadThreshold;

    if (isSpeech) {
      if (!this._inSpeech) {
        this._beginUtterance(now);
      }
      this._lastSpeechAt = now;
      this._silenceMs = 0;
      this._utteranceChunks.push(pcmChunk);
      this._rollingBuf = Buffer.concat([this._rollingBuf, pcmChunk]);
      this._maybeRollingProbe();
    } else {
      if (this._inSpeech) {
        this._silenceMs = now - this._lastSpeechAt;
        this._utteranceChunks.push(pcmChunk);
        this._rollingBuf = Buffer.concat([this._rollingBuf, pcmChunk]);

        const maxSilence = this._isSongMode ? 1400 : 700;
        if (this._silenceMs > maxSilence) {
          this._finalizeUtterance();
        }
      }
    }
  }

  _beginUtterance(now) {
    this._inSpeech = true;
    this._speechStartedAt = now;
    this._lastSpeechAt = now;
    this._silenceMs = 0;
    this._activeUttId = String(++this._uttSeq);
    this._lastProbeText = '';
    this._utteranceChunks = [];
    this._rollingBuf = Buffer.alloc(0);

    const pre = this._preRoll.snapshot();
    if (this._overlapTail.length) this._utteranceChunks.push(Buffer.from(this._overlapTail));
    if (pre.length) this._utteranceChunks.push(pre);
  }

  _resetUtterance() {
    this._inSpeech = false;
    this._utteranceChunks = [];
    this._rollingBuf = Buffer.alloc(0);
    this._silenceMs = 0;
    this._lastProbeText = '';
  }

  _maybeRollingProbe() {
    const minBytes = this._isSongMode ? Math.floor(SAMPLE_RATE * 0.35) : SAMPLE_RATE;
    if (this._busy || this._rollingBuf.length < minBytes) return;

    const snap = Buffer.from(this._rollingBuf);
    this._enqueue(async () => {
      const { text: raw, language, filtered } = await this._runTranscribe(snap);
      const text = normalizeTranscript(raw);
      if (filtered || !text || text === this._lastProbeText) return;
      this._lastProbeText = text;

      const confidence = confidenceFromResult(null, text);
      const threshold = this._isSongMode ? 0.20 : this.confidenceThreshold;

      this.emit('transcript', {
        text,
        isFinal: false,
        confidence,
        source: 'primary',
        pass: 'W',
        utteranceId: this._activeUttId,
        role: this._isSongMode ? 'partial' : 'probe',
        language: language || this._lastDetectedLang,
        ignored: confidence < threshold,
        reason: confidence < threshold ? 'low_confidence' : undefined,
      });
    });
  }

  _finalizeUtterance() {
    if (!this._inSpeech || !this._utteranceChunks.length) {
      this._resetUtterance();
      return;
    }

    const fullBuf = Buffer.concat(this._utteranceChunks);
    const uttId = this._activeUttId;
    this._resetUtterance();

    this._enqueue(async () => {
      const { text: raw, language, filtered } = await this._runTranscribe(fullBuf);
      const text = normalizeTranscript(raw);
      if (filtered || !text) return;

      const confidence = confidenceFromResult(null, text);
      const threshold = this._isSongMode ? 0.20 : this.confidenceThreshold;

      this.emit('transcript', {
        text,
        isFinal: true,
        confidence,
        source: 'primary',
        pass: 'W',
        utteranceId: uttId,
        role: 'final',
        language: language || this._lastDetectedLang,
        ignored: confidence < threshold,
        reason: confidence < threshold ? 'low_confidence' : undefined,
      });
    });
  }

  async _runTranscribe(buf) {
    if (!this._whisper || !buf || buf.length < 320) {
      return { text: '', language: 'en', filtered: false };
    }

    try {
      const pcmf32 = int16ToFloat32(buf);
      const opts = {
        pcmf32,
        language: 'en',
        initial_prompt: this._initialPrompt,
        use_gpu: true,
        no_prints: true,
        no_timestamps: true,
      };

      const result = await this._whisper.transcribe(opts);
      const text = extractTranscriptionText(result);
      return { text, language: 'en', filtered: false };
    } catch (err) {
      return { text: '', language: 'en', filtered: false, error: err.message };
    }
  }

  _enqueue(fn) {
    this._queue.push(fn);
    this._drain();
  }

  async _drain() {
    if (this._busy || !this._queue.length) return;
    this._busy = true;
    const fn = this._queue.shift();
    try {
      await fn();
    } catch (err) {
      console.warn('[Whisper] queue task error:', err.message || err);
    } finally {
      this._busy = false;
      this._drain();
    }
  }
}

module.exports = {
  WhisperEngine,
  resolveWhisperModel,
  normalizeTranscript,
  confidenceFromResult,
};
