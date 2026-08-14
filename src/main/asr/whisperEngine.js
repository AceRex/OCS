/**
 * Whisper.cpp ASR engine — VAD-segmented utterances + rolling probe decode.
 * Emits the same transcript payload contract as VoskEngine for BroadcastEngine.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');
const { buildWhisperInitialPrompt, shouldArmRollingDecode } = require('./whisperPrompt');
const {
  extractDetectedLanguage,
  evaluateLanguageGate,
  normalizeAllowList,
  DEFAULT_LANGS,
} = require('./languageGate');

const SAMPLE_RATE = 16000;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.42; // recalibrated vs Vosk 0.48 for logprob mapping
const PRE_ROLL_MS = 500;
const OVERLAP_MS = 300;
const SILENCE_END_MS = 450;
const MAX_UTTERANCE_MS = 6000;
const ROLLING_WINDOW_MS = 1600;
const ROLLING_HOP_MS = 500;
const ENERGY_SPEECH = 0.012;
const ENERGY_SILENCE = 0.006;

function resolveWhisperModel(rootDir) {
  const dir = path.join(rootDir, 'voice_server', 'models', 'whisper');
  const candidates = [
    'ggml-distil-small.en-q5_1.bin',
    'ggml-distil-small.en.bin',
    'ggml-medium-32-2.en.bin', // official distil-medium.en ggml name on HF
    'ggml-distil-medium.en-q5_1.bin',
    'ggml-distil-medium.en.bin',
    'ggml-base.en.bin',
    'ggml-small.en.bin',
    'ggml-tiny.en.bin',
    // Multilingual fallbacks (needed for reliable language detection)
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

/** Prefer a small multilingual ggml for per-chunk language ID. */
function resolveMultilingualDetectModel(rootDir) {
  const dir = path.join(rootDir, 'voice_server', 'models', 'whisper');
  for (const name of ['ggml-tiny.bin', 'ggml-base.bin', 'ggml-small.bin']) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return { path: p, name, dir };
  }
  return null;
}

function resolveVadModel(rootDir) {
  const dir = path.join(rootDir, 'voice_server', 'models', 'whisper');
  for (const name of ['ggml-silero-v6.2.0.bin', 'ggml-silero-v5.1.2.bin']) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** Int16 mono PCM ring */
class PcmRing {
  constructor(ms = PRE_ROLL_MS, sampleRate = SAMPLE_RATE) {
    this.maxBytes = Math.floor((ms / 1000) * sampleRate) * 2;
    this.buf = Buffer.alloc(this.maxBytes);
    this.write = 0;
    this.size = 0;
  }

  push(chunk) {
    if (!chunk || chunk.length < 2) return;
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
    .replace(/[^\w\s':.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractTranscriptionText(result) {
  if (!result) return '';
  if (typeof result === 'string') return result;
  if (Array.isArray(result.transcription)) {
    // [[start, end, text], ...] or [text, ...]
    return result.transcription
      .map((row) => (Array.isArray(row) ? row[row.length - 1] : row))
      .filter(Boolean)
      .join(' ');
  }
  if (typeof result.text === 'string') return result.text;
  return String(result);
}

/** Map whisper avg logprob-ish signal → 0..1 confidence */
function confidenceFromResult(result, text) {
  if (result && typeof result.confidence === 'number') return clamp01(result.confidence);
  if (result && typeof result.avg_logprob === 'number') {
    return clamp01(1 / (1 + Math.exp(-(result.avg_logprob + 1.0) / 0.5)));
  }
  // Heuristic: longer clean transcripts without [unk]/blank → higher
  const t = String(text || '').trim();
  if (!t) return 0.15;
  if (/\[unk\]|♪|♪/.test(t)) return 0.25;
  const words = t.split(/\s+/).length;
  return clamp01(0.45 + Math.min(0.4, words * 0.04));
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function longestCommonPrefixWords(a, b) {
  const wa = String(a).split(/\s+/).filter(Boolean);
  const wb = String(b).split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < wa.length && i < wb.length && wa[i] === wb[i]) i += 1;
  return wb.slice(i).join(' ');
}

class WhisperEngine extends EventEmitter {
  constructor(rootDir) {
    super();
    this.rootDir = rootDir;
    this.status = 'uninitialized';
    this.error = null;
    this.modelInfo = null;
    this.confidenceThreshold = DEFAULT_CONFIDENCE_THRESHOLD;
    this._sessionActive = false;
    this._whisper = null;
    this._initialPrompt = '';
    this._vadPath = null;
    this._uttSeq = 0;
    this._activeUttId = null;
    this._preRoll = new PcmRing(PRE_ROLL_MS);
    this._utteranceChunks = [];
    this._inSpeech = false;
    this._speechStartedAt = 0;
    this._lastSpeechAt = 0;
    this._silenceMs = 0;
    this._rollingBuf = Buffer.alloc(0);
    this._lastRollingAt = 0;
    this._lastProbeText = '';
    this._busy = false;
    this._overlapTail = Buffer.alloc(0);
    this._inferQueue = Promise.resolve();
    this._langPolicy = {
      enabled: true,
      languages: [...DEFAULT_LANGS],
    };
    this._detectModel = null;
    this._lastDetectedLang = null;
  }

  setLanguagePolicy({ enabled, languages } = {}) {
    if (typeof enabled === 'boolean') this._langPolicy.enabled = enabled;
    if (languages != null) this._langPolicy.languages = normalizeAllowList(languages);
  }

  getLanguagePolicy() {
    return { ...this._langPolicy, lastDetected: this._lastDetectedLang };
  }

  getState() {
    return {
      status: this.status,
      error: this.error,
      model: this.modelInfo,
      sessionActive: this._sessionActive,
      confidenceThreshold: this.confidenceThreshold,
      backend: 'whisper-cpp',
      engine: 'whisper',
      passB: false,
      vad: !!this._vadPath,
      utteranceId: this._activeUttId,
      languageGate: this._langPolicy.enabled,
      transcriptionLanguages: this._langPolicy.languages,
      lastDetectedLanguage: this._lastDetectedLang,
      detectModel: this._detectModel?.name || null,
    };
  }

  setConfidenceThreshold(value) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0 && n <= 1) this.confidenceThreshold = n;
  }

  async initialize() {
    if (this.status === 'ready' || this.status === 'listening') return this.getState();
    if (this.status === 'initializing') return this.getState();

    this.status = 'initializing';
    this.error = null;
    this.emit('status', this.getState());

    try {
      const modelMeta = resolveWhisperModel(this.rootDir);
      if (!modelMeta) {
        throw new Error(
          'No whisper ggml model found. Run: npm run setup:voice\n' +
          'Expected voice_server/models/whisper/ggml-distil-small.en.bin'
        );
      }

      this._whisper = require('./whisperAddon');
      this._vadPath = resolveVadModel(this.rootDir);
      this._detectModel = resolveMultilingualDetectModel(this.rootDir);
      this._initialPrompt = buildWhisperInitialPrompt();

      // Cold-load probe: tiny silent buffer to force model open + measure load
      const t0 = Date.now();
      const silence = new Float32Array(SAMPLE_RATE); // 1s silence
      try {
        await this._whisper.transcribe({
          model: modelMeta.path,
          pcmf32: silence,
          language: 'en',
          use_gpu: true,
          no_prints: true,
          no_timestamps: true,
          translate: false,
          initial_prompt: this._initialPrompt,
          ...(this._vadPath ? { vad: false } : {}),
        });
      } catch (e) {
        // Some builds reject pure silence — still count as load if model path accepted
        if (!/model|ggml|failed to load|invalid/i.test(String(e.message || e))) {
          // ignore decode errors on silence
        } else if (/failed to load|invalid model|cannot open/i.test(String(e.message || e))) {
          throw e;
        }
      }

      this.modelInfo = {
        ...modelMeta,
        loadMs: Date.now() - t0,
        promptChars: this._initialPrompt.length,
        vad: !!this._vadPath,
      };
      this.status = 'ready';
      console.log(`[Whisper] model loaded: ${modelMeta.name} (${this.modelInfo.loadMs}ms)`);
      this.emit('status', this.getState());
      return this.getState();
    } catch (err) {
      this.status = 'error';
      this.error = err.message || String(err);
      console.error('[Whisper] init failed:', this.error);
      this.emit('status', this.getState());
      return this.getState();
    }
  }

  startSession() {
    if (this.status !== 'ready' && this.status !== 'listening') {
      throw new Error(this.error || 'Whisper engine not ready');
    }
    this._sessionActive = true;
    this.status = 'listening';
    this._resetUtterance();
    this.emit('status', this.getState());
    return this.getState();
  }

  stopSession() {
    if (this._inSpeech && this._utteranceChunks.length) {
      this._finalizeUtterance('session_stop');
    }
    this._sessionActive = false;
    if (this.status === 'listening') this.status = 'ready';
    this.emit('status', this.getState());
    return this.getState();
  }

  shutdown() {
    this.stopSession();
    this.status = 'uninitialized';
    this._whisper = null;
  }

  pushAudio(pcm) {
    if (!this._sessionActive || !pcm || !pcm.length) return;
    const chunk = Buffer.isBuffer(pcm) ? pcm : Buffer.from(pcm);
    this._preRoll.push(chunk);

    const energy = rmsInt16(chunk);
    const now = Date.now();
    const frameMs = (chunk.length / 2 / SAMPLE_RATE) * 1000;

    if (!this._inSpeech) {
      if (energy >= ENERGY_SPEECH) {
        this._beginUtterance(now);
      }
    }

    if (this._inSpeech) {
      this._utteranceChunks.push(chunk);
      // Rolling window buffer
      this._rollingBuf = Buffer.concat([this._rollingBuf, chunk]);
      const maxRoll = Math.floor((ROLLING_WINDOW_MS / 1000) * SAMPLE_RATE) * 2;
      if (this._rollingBuf.length > maxRoll) {
        this._rollingBuf = this._rollingBuf.slice(this._rollingBuf.length - maxRoll);
      }

      if (energy >= ENERGY_SILENCE) {
        this._lastSpeechAt = now;
        this._silenceMs = 0;
      } else {
        this._silenceMs += frameMs;
      }

      const utteredMs = now - this._speechStartedAt;
      if (this._silenceMs >= SILENCE_END_MS || utteredMs >= MAX_UTTERANCE_MS) {
        this._finalizeUtterance(utteredMs >= MAX_UTTERANCE_MS ? 'max_len' : 'silence');
        return;
      }

      if (now - this._lastRollingAt >= ROLLING_HOP_MS) {
        this._lastRollingAt = now;
        this._maybeRollingProbe();
      }
    }
  }

  /** Transcribe a complete Int16 buffer (secondary PTT / suite). Same language gate as primary. */
  async transcribeBuffer(pcm, { role = 'final', source = 'primary' } = {}) {
    const buf = Buffer.isBuffer(pcm) ? pcm : Buffer.from(pcm);
    const { text: textRaw, language, filtered, filterReason } = await this._runTranscribe(buf);
    const utteranceId = String(++this._uttSeq);
    if (filtered) {
      const payload = {
        text: '',
        isFinal: role === 'final',
        confidence: 0,
        source,
        pass: 'W',
        utteranceId,
        role,
        ignored: true,
        reason: 'non_target_language',
        language: language || 'unknown',
        filterReason: filterReason || 'non_target_language',
      };
      this.emit('transcript', payload);
      return payload;
    }
    const text = normalizeTranscript(textRaw);
    const confidence = confidenceFromResult(null, text);
    const payload = {
      text,
      isFinal: role === 'final',
      confidence,
      source,
      pass: 'W',
      utteranceId,
      role,
      language: language || this._lastDetectedLang,
      ignored: confidence != null && confidence < this.confidenceThreshold,
      reason: confidence != null && confidence < this.confidenceThreshold ? 'low_confidence' : undefined,
    };
    this.emit('transcript', payload);
    return payload;
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
    // Prepend overlap + pre-roll
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
    if (this._busy || this._rollingBuf.length < SAMPLE_RATE) return; // need ~0.5s+
    const snap = Buffer.from(this._rollingBuf);
    this._enqueue(async () => {
      const { text: raw, language, filtered, filterReason } = await this._runTranscribe(snap);
      const text = normalizeTranscript(raw);
      if (filtered) {
        this.emit('transcript', {
          text: '',
          isFinal: false,
          confidence: 0,
          source: 'primary',
          pass: 'W',
          utteranceId: this._activeUttId,
          role: 'partial',
          ignored: true,
          reason: 'non_target_language',
          language: language || 'unknown',
          filterReason: filterReason || 'non_target_language',
        });
        return;
      }
      if (!text || text === this._lastProbeText) return;
      // Only probe when bookish / shape-likely
      if (!shouldArmRollingDecode(text) && !shouldArmRollingDecode(this._lastProbeText + ' ' + text)) {
        this._lastProbeText = text;
        this.emit('transcript', {
          text,
          isFinal: false,
          confidence: confidenceFromResult(null, text),
          source: 'primary',
          pass: 'W',
          utteranceId: this._activeUttId,
          role: 'partial',
          language: language || this._lastDetectedLang,
        });
        return;
      }
      this._lastProbeText = text;
      const confidence = confidenceFromResult(null, text);
      this.emit('transcript', {
        text,
        isFinal: false,
        confidence,
        source: 'primary',
        pass: 'W',
        utteranceId: this._activeUttId,
        role: 'probe',
        language: language || this._lastDetectedLang,
        ignored: confidence < this.confidenceThreshold,
        reason: confidence < this.confidenceThreshold ? 'low_confidence' : undefined,
      });
    });
  }

  _finalizeUtterance(reason) {
    if (!this._inSpeech) return;
    const chunks = this._utteranceChunks.slice();
    const uttId = this._activeUttId;
    // Save overlap tail for next utterance
    const all = Buffer.concat(chunks.length ? chunks : [Buffer.alloc(0)]);
    const overlapBytes = Math.floor((OVERLAP_MS / 1000) * SAMPLE_RATE) * 2;
    this._overlapTail = all.length > overlapBytes ? all.slice(all.length - overlapBytes) : Buffer.from(all);
    this._resetUtterance();

    if (all.length < SAMPLE_RATE * 0.25 * 2) return; // too short

    this._enqueue(async () => {
      const { text: raw, language, filtered, filterReason } = await this._runTranscribe(all);
      if (filtered) {
        this.emit('transcript', {
          text: '',
          isFinal: true,
          confidence: 0,
          source: 'primary',
          pass: 'W',
          utteranceId: uttId,
          role: 'final',
          ignored: true,
          reason: 'non_target_language',
          language: language || 'unknown',
          filterReason: filterReason || 'non_target_language',
          meta: { finalizeReason: reason },
        });
        return;
      }
      let text = normalizeTranscript(raw);
      const confidence = confidenceFromResult(null, text);
      if (!text) return;
      this.emit('transcript', {
        text,
        isFinal: true,
        confidence,
        source: 'primary',
        pass: 'W',
        utteranceId: uttId,
        role: 'final',
        language: language || this._lastDetectedLang,
        ignored: confidence < this.confidenceThreshold,
        reason: confidence < this.confidenceThreshold ? 'low_confidence' : undefined,
        meta: { finalizeReason: reason },
      });
    });
  }

  _enqueue(fn) {
    this._busy = true;
    this._inferQueue = this._inferQueue
      .then(async () => {
        try {
          await fn();
        } catch (err) {
          console.warn('[Whisper] infer error:', err.message || err);
        } finally {
          this._busy = false;
        }
      })
      .catch((err) => {
        this._busy = false;
        console.warn('[Whisper] queue error:', err.message || err);
      });
  }

  /**
   * Per VAD-chunk transcribe + language gate.
   * @returns {{ text: string, language: string|null, filtered: boolean, filterReason?: string }}
   */
  async _runTranscribe(int16buf) {
    if (!this._whisper || !this.modelInfo) {
      return { text: '', language: null, filtered: false };
    }
    const pcmf32 = int16ToFloat32(int16buf);
    const targetLang = (this._langPolicy.languages && this._langPolicy.languages[0]) || 'en';
    const englishOnly = !!this.modelInfo.englishOnly;
    let detected = null;

    // Detect pass on multilingual tiny/base when gate is on (per-chunk, not per-session)
    if (this._langPolicy.enabled && this._detectModel) {
      try {
        const det = await this._whisper.transcribe({
          model: this._detectModel.path,
          pcmf32,
          language: 'auto',
          detect_language: true,
          use_gpu: true,
          no_prints: true,
          no_timestamps: true,
          translate: false,
        });
        detected = extractDetectedLanguage(det);
      } catch (err) {
        console.warn('[Whisper] language detect failed:', err.message || err);
      }
    }

    const gatePre = evaluateLanguageGate({
      enabled: this._langPolicy.enabled,
      allowList: this._langPolicy.languages,
      detectedLanguage: detected,
      englishOnlyModel: englishOnly && !this._detectModel,
    });
    if (gatePre.skip && detected) {
      this._lastDetectedLang = detected;
      return {
        text: '',
        language: detected,
        filtered: true,
        filterReason: gatePre.reason || 'non_target_language',
      };
    }

    const opts = {
      model: this.modelInfo.path,
      pcmf32,
      language: englishOnly ? 'en' : targetLang,
      use_gpu: true,
      no_prints: true,
      no_timestamps: true,
      translate: false,
      initial_prompt: this._initialPrompt,
      detect_language: !englishOnly && this._langPolicy.enabled && !this._detectModel,
    };
    if (this._vadPath) {
      opts.vad = false;
    }
    const result = await this._whisper.transcribe(opts);
    const text = extractTranscriptionText(result);
    if (!detected) detected = extractDetectedLanguage(result);
    if (detected) this._lastDetectedLang = detected;

    const confidence = confidenceFromResult(result, text);
    const gate = evaluateLanguageGate({
      enabled: this._langPolicy.enabled,
      allowList: this._langPolicy.languages,
      detectedLanguage: detected,
      text,
      confidence,
      englishOnlyModel: englishOnly && !this._detectModel,
    });
    if (gate.skip) {
      this._lastDetectedLang = gate.language || detected || 'unknown';
      return {
        text: '',
        language: this._lastDetectedLang,
        filtered: true,
        filterReason: gate.reason || 'non_target_language',
      };
    }

    return {
      text,
      language: detected || targetLang,
      filtered: false,
    };
  }
}

module.exports = {
  WhisperEngine,
  resolveWhisperModel,
  resolveMultilingualDetectModel,
  resolveVadModel,
  normalizeTranscript,
  int16ToFloat32,
  confidenceFromResult,
  SAMPLE_RATE,
  DEFAULT_CONFIDENCE_THRESHOLD,
};
