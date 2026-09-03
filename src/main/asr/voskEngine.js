/**
 * Native in-process Vosk ASR engine (Phase 0 + Pass B grammar + utterance IDs).
 * Pass A: free-vocabulary continuous recognizer
 * Pass B: grammar-constrained recognizer armed after:
 *   - wake word (OCS/Media), OR
 *   - bookish hint (book name + number/verse/chapter) so ambient mid-sermon
 *     refs are re-decoded when free-vocab ASR garbles domain phrases
 * Utterance IDs: one ID per speech window so probe/final can reconcile (FR-3.8a)
 */
require('../koffiPatch');
const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');
const { buildOcsGrammar } = require('./ocsGrammar');

const SAMPLE_RATE = 16000;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.48; // Tier A floor — BroadcastEngine applies Tier B for unshaped
const PRE_ROLL_MS = 1500;
const CAPTURE_MAX_MS = 4000;
const UTTERANCE_GAP_MS = 900;
const TRIGGER_RE = /\b(ocs|oasis|ocean|osiris|obvious|media|meter|medium|median|oh see ess|oh see es)\b/i;

/** Book / alias tokens that suggest a scripture reference may be in progress. */
const BOOK_TOKEN_RE = /\b(?:(?:the\s+)?book\s+of|genesis|exodus|leviticus|numbers|deuteronomy|joshua|judges|ruth|samuel|kings|chronicles|ezra|nehemiah|esther|job|psalms?|proverbs|ecclesiastes|isaiah|aisayan|aisaya|asayan|isayan|jeremiah|lamentations|ezekiel|daniel|hosea|joel|amos|obadiah|jonah|micah|nahum|habakkuk|zephaniah|haggai|zechariah|malachi|matthew|mark|luke|john|acts|romans|corinthians|galatians|ephesians|philippians|colossians|thessalonians|timothy|titus|philemon|hebrews|james|peter|jude|revelation|revelations|mach|march|mac|marc|match|marsh|look|junk|sams|prov|matt|mathew|mattew|first\s+corinthians|second\s+corinthians|first\s+john|second\s+john|third\s+john)\b/i;
const NUMBERISH_RE = /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|verse|verses|chapter|vs)\b/i;

/** Arm Pass B when Pass A hears a book-like token plus a number/verse cue (ambient path). */
function shouldArmPassBForBookish(text) {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return false;
  if (TRIGGER_RE.test(t)) return true;
  if (/\b(?:the\s+)?book\s+of\b/i.test(t)) return true;
  return BOOK_TOKEN_RE.test(t) && NUMBERISH_RE.test(t);
}

function getCandidateSearchDirs(rootDir) {
  const dirs = [
    path.join(rootDir, 'voice_server', 'models'),
    path.join(rootDir, 'models'),
  ];

  if (process.resourcesPath) {
    dirs.push(
      path.join(process.resourcesPath, 'voice_server', 'models'),
      path.join(process.resourcesPath, 'models'),
      path.join(process.resourcesPath, 'app.asar.unpacked', 'voice_server', 'models'),
      path.join(process.resourcesPath, 'app.asar.unpacked', 'models')
    );
  }

  try {
    const electron = require('electron');
    const app = electron.app || (electron.remote && electron.remote.app);
    if (app && typeof app.getPath === 'function') {
      const userData = app.getPath('userData');
      dirs.push(
        path.join(userData, 'voice_server', 'models'),
        path.join(userData, 'voice_models'),
        path.join(userData, 'models')
      );
    }
  } catch (_) {}

  return dirs;
}

function resolveModelPath(rootDir) {
  const searchDirs = getCandidateSearchDirs(rootDir);
  for (const modelsDir of searchDirs) {
    if (!modelsDir) continue;
    const large = path.join(modelsDir, 'vosk-model-en-us-0.22');
    const small = path.join(modelsDir, 'vosk-model-small-en-us-0.15');
    if (fs.existsSync(large)) return { path: large, name: 'vosk-model-en-us-0.22', size: 'large' };
    if (fs.existsSync(small)) return { path: small, name: 'vosk-model-small-en-us-0.15', size: 'small' };
  }
  return null;
}

async function downloadAndExtractModel(targetDir) {
  const https = require('https');
  const { exec } = require('child_process');
  const util = require('util');
  const execAsync = util.promisify(exec);

  fs.mkdirSync(targetDir, { recursive: true });
  const zipPath = path.join(targetDir, 'vosk-model-small-en-us-0.15.zip');
  const url = 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip';

  await new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(zipPath);
    const getUrl = (u) => {
      https.get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return getUrl(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Download failed with status ${res.statusCode}`));
        }
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close(() => resolve());
        });
      }).on('error', (err) => {
        try { fs.unlinkSync(zipPath); } catch (_) {}
        reject(err);
      });
    };
    getUrl(url);
  });

  try {
    if (process.platform === 'win32') {
      try {
        await execAsync(`tar -xf "${zipPath}" -C "${targetDir}"`);
      } catch (_) {
        await execAsync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${targetDir}' -Force"`);
      }
    } else {
      try {
        await execAsync(`unzip -o "${zipPath}" -d "${targetDir}"`);
      } catch (_) {
        await execAsync(`tar -xf "${zipPath}" -C "${targetDir}"`);
      }
    }
  } finally {
    try { fs.unlinkSync(zipPath); } catch (_) {}
  }
}

function averageWordConfidence(result) {
  const words = result && Array.isArray(result.result) ? result.result : null;
  if (!words || words.length === 0) return null;
  let sum = 0;
  let n = 0;
  for (const w of words) {
    if (typeof w.conf === 'number') {
      sum += w.conf;
      n += 1;
    }
  }
  return n > 0 ? sum / n : null;
}

/** Fixed-size PCM ring for Pass B pre-roll (Int16 mono). */
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
    if (this.size < this.maxBytes) {
      return Buffer.from(this.buf.slice(0, this.size));
    }
    const out = Buffer.alloc(this.maxBytes);
    const first = this.maxBytes - this.write;
    this.buf.copy(out, 0, this.write, this.maxBytes);
    this.buf.copy(out, first, 0, this.write);
    return out;
  }
}

class VoskEngine extends EventEmitter {
  constructor(rootDir) {
    super();
    this.rootDir = rootDir;
    this.status = 'uninitialized';
    this.error = null;
    this.modelInfo = null;
    this._vosk = null;
    this._model = null;
    this._rec = null;
    this._recGrammar = null;
    this._grammarReady = false;
    this._grammarPhraseCount = 0;
    this._sessionActive = false;
    this.confidenceThreshold = DEFAULT_CONFIDENCE_THRESHOLD;
    this._lastPartial = '';
    this._pcmRing = new PcmRing();
    this._mode = 'idle';
    this._captureStartedAt = 0;
    this._lastGrammarPartial = '';
    this._uttSeq = 0;
    this._activeUtt = null;
    this._uttEndTimer = null;
  }

  getState() {
    return {
      status: this.status,
      error: this.error,
      model: this.modelInfo,
      sessionActive: this._sessionActive,
      confidenceThreshold: this.confidenceThreshold,
      backend: 'native-koffi',
      passB: this._grammarReady,
      grammarPhrases: this._grammarPhraseCount,
      mode: this._mode,
      utteranceId: this._activeUtt ? this._activeUtt.id : null,
    };
  }

  setSongContext({ tokens } = {}) {
    if (Array.isArray(tokens) && tokens.length > 0) {
      this._songTokens = new Set(tokens.map(t => String(t).toLowerCase()));
      console.log(`[Vosk] Song words context active (${this._songTokens.size} words)`);
    } else {
      this._songTokens = null;
    }
  }

  clearSongContext() {
    this._songTokens = null;
    console.log(`[Vosk] Song words context cleared`);
  }

  async initialize() {
    if (this.status === 'ready' || this.status === 'listening') return this.getState();
    if (this.status === 'initializing') return this.getState();

    this.status = 'initializing';
    this.error = null;
    this.emit('status', this.getState());

    try {
      let modelMeta = resolveModelPath(this.rootDir);
      if (!modelMeta) {
        console.log('[Vosk] No local voice model found. Attempting automatic download...');
        this.status = 'downloading';
        this.emit('status', this.getState());

        let targetDir = path.join(this.rootDir, 'voice_server', 'models');
        try {
          const electron = require('electron');
          const app = electron.app || (electron.remote && electron.remote.app);
          if (app && typeof app.getPath === 'function') {
            targetDir = path.join(app.getPath('userData'), 'voice_models');
          }
        } catch (_) {}

        try {
          await downloadAndExtractModel(targetDir);
          modelMeta = resolveModelPath(this.rootDir);
        } catch (downloadErr) {
          console.warn('[Vosk] Auto-download failed:', downloadErr.message);
        }
      }

      if (!modelMeta) {
        throw new Error(
          'Offline voice model (vosk-model-small-en-us-0.15) is not available. Please ensure voice models are downloaded or connected to the internet.'
        );
      }

      this._vosk = require('vosk-koffi');
      this._vosk.setLogLevel(-1);

      const t0 = Date.now();
      this._model = new this._vosk.Model(modelMeta.path);
      this.modelInfo = {
        ...modelMeta,
        loadMs: Date.now() - t0,
      };

      this.status = 'ready';
      console.log(`[Vosk] Native model loaded: ${modelMeta.name} (${this.modelInfo.loadMs}ms)`);
      this.emit('status', this.getState());
      return this.getState();
    } catch (err) {
      this.status = 'error';
      this.error = err.message || String(err);
      console.error('[Vosk] Native init failed:', this.error);
      this.emit('status', this.getState());
      return this.getState();
    }
  }

  startSession() {
    if (this.status !== 'ready' && this.status !== 'listening') {
      throw new Error(this.error || 'Vosk engine not ready');
    }
    this._disposeRecognizer();

    this._rec = new this._vosk.Recognizer({ model: this._model, sampleRate: SAMPLE_RATE });
    this._rec.setWords(true);
    try { this._rec.setPartialWords(true); } catch (_) {}

    this._grammarReady = false;
    this._grammarPhraseCount = 0;
    try {
      const grammar = buildOcsGrammar();
      this._grammarPhraseCount = grammar.length;
      const t0 = Date.now();
      this._recGrammar = new this._vosk.Recognizer({
        model: this._model,
        sampleRate: SAMPLE_RATE,
        grammar,
      });
      this._recGrammar.setWords(true);
      try { this._recGrammar.setPartialWords(true); } catch (_) {}
      this._grammarReady = true;
      console.log(`[Vosk] Pass B grammar ready (${grammar.length} phrases, ${Date.now() - t0}ms)`);
    } catch (err) {
      console.warn('[Vosk] Pass B grammar unavailable — free-vocab only:', err.message);
      this._recGrammar = null;
      this._grammarReady = false;
    }

    this._sessionActive = true;
    this._lastPartial = '';
    this._lastGrammarPartial = '';
    this._mode = 'idle';
    this._pcmRing = new PcmRing();
    this._activeUtt = null;
    this._clearUttEndTimer();
    this.status = 'listening';
    this.emit('status', this.getState());
    return this.getState();
  }

  _ensureUtterance() {
    if (!this._activeUtt) {
      this._uttSeq += 1;
      this._activeUtt = {
        id: this._uttSeq,
        startedAt: Date.now(),
        probeEmitted: false,
        finalEmitted: false,
      };
      console.log(`[Vosk] utterance #${this._activeUtt.id} started`);
    }
    this._clearUttEndTimer();
    return this._activeUtt;
  }

  _scheduleUtteranceEnd() {
    this._clearUttEndTimer();
    this._uttEndTimer = setTimeout(() => {
      if (this._mode === 'capture') return;
      if (this._activeUtt) {
        console.log(`[Vosk] utterance #${this._activeUtt.id} closed (gap)`);
      }
      this._activeUtt = null;
      this._uttEndTimer = null;
      this.emit('status', this.getState());
    }, UTTERANCE_GAP_MS);
  }

  _clearUttEndTimer() {
    if (this._uttEndTimer) {
      clearTimeout(this._uttEndTimer);
      this._uttEndTimer = null;
    }
  }

  /**
   * Feed Int16 PCM mono @ 16kHz.
   */
  pushAudio(pcm) {
    if (!this._sessionActive || !this._rec) return;

    let buf;
    if (Buffer.isBuffer(pcm)) {
      buf = pcm;
    } else if (pcm instanceof ArrayBuffer) {
      buf = Buffer.from(pcm);
    } else if (ArrayBuffer.isView(pcm)) {
      buf = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    } else {
      buf = Buffer.from(pcm);
    }
    if (buf.length < 2) return;

    this._pcmRing.push(buf);

    // ── Pass A (free vocabulary) ──────────────────────────────────────────
    let isFinalA = false;
    try {
      isFinalA = this._rec.acceptWaveform(buf);
    } catch (err) {
      console.error('[Vosk] Pass A acceptWaveform error:', err.message);
      return;
    }

    if (isFinalA) {
      const raw = this._normalizeResult(this._rec.result());
      this._emitResult(raw, true, 'A');
      this._lastPartial = '';
      const textA = (raw.text || '').trim();
      if (this._mode === 'idle' && this._grammarReady && shouldArmPassBForBookish(textA)) {
        this._beginCapture(TRIGGER_RE.test(textA) ? 'trigger' : 'bookish');
      } else {
        this._scheduleUtteranceEnd();
      }
    } else {
      const raw = this._normalizeResult(this._rec.partialResult());
      const text = (raw.partial || raw.text || '').trim();
      if (text && text !== this._lastPartial) {
        this._ensureUtterance();
        this._lastPartial = text;
        const utt = this._activeUtt;
        this.emit('transcript', {
          text,
          isFinal: false,
          confidence: null,
          source: 'primary',
          pass: 'A',
          utteranceId: utt ? utt.id : null,
          role: 'partial',
        });
        if (this._mode === 'idle' && this._grammarReady && shouldArmPassBForBookish(text)) {
          this._beginCapture(TRIGGER_RE.test(text) ? 'trigger' : 'bookish');
        }
      }
    }

    // ── Pass B (grammar capture) ──────────────────────────────────────────
    if (this._mode === 'capture' && this._recGrammar) {
      let isFinalB = false;
      try {
        isFinalB = this._recGrammar.acceptWaveform(buf);
      } catch (err) {
        console.error('[Vosk] Pass B acceptWaveform error:', err.message);
        this._mode = 'idle';
        return;
      }

      if (!isFinalB) {
        try {
          const raw = this._normalizeResult(this._recGrammar.partialResult());
          const text = (raw.partial || raw.text || '').trim();
          if (text && text !== this._lastGrammarPartial) {
            this._ensureUtterance();
            this._lastGrammarPartial = text;
            const utt = this._activeUtt;
            this.emit('transcript', {
              text,
              isFinal: false,
              confidence: null,
              source: 'primary',
              pass: 'B',
              utteranceId: utt ? utt.id : null,
              role: 'partial',
            });
          }
        } catch (_) {}
      }

      const timedOut = Date.now() - this._captureStartedAt >= CAPTURE_MAX_MS;
      if (isFinalB || timedOut) {
        this._finishCapture(isFinalB);
      }
    }
  }

  _beginCapture(reason = 'trigger') {
    if (!this._recGrammar || this._mode === 'capture') return;
    this._ensureUtterance();
    this._mode = 'capture';
    this._captureStartedAt = Date.now();
    this._lastGrammarPartial = '';
    try { this._recGrammar.reset(); } catch (_) {}

    const pre = this._pcmRing.snapshot();
    if (pre.length >= 2) {
      try { this._recGrammar.acceptWaveform(pre); } catch (_) {}
    }
    this.emit('status', this.getState());
    console.log(`[Vosk] Pass B capture started (utt #${this._activeUtt.id}, reason=${reason})`);
  }

  _finishCapture(fromSilence) {
    if (this._mode !== 'capture' || !this._recGrammar) {
      this._mode = 'idle';
      return;
    }
    let raw;
    try {
      raw = this._normalizeResult(
        fromSilence ? this._recGrammar.result() : this._recGrammar.finalResult()
      );
    } catch (_) {
      raw = { text: '' };
    }
    this._mode = 'idle';
    this._lastGrammarPartial = '';
    // Pass B is always the settling final for this utterance
    this._emitResult(raw, true, 'B', { forceRole: 'final' });
    try { this._recGrammar.reset(); } catch (_) {}
    this._scheduleUtteranceEnd();
    this.emit('status', this.getState());
    console.log('[Vosk] Pass B capture finished:', (raw && raw.text) || '(empty)');
  }

  _normalizeResult(raw) {
    if (!raw || typeof raw !== 'object') return { text: '' };
    if (Array.isArray(raw.alternatives) && raw.alternatives[0]) {
      return raw.alternatives[0];
    }
    return raw;
  }

  stopSession() {
    this._clearUttEndTimer();
    if (this._mode === 'capture') {
      try { this._finishCapture(false); } catch (_) {}
    }
    if (this._rec) {
      try {
        const raw = this._rec.finalResult();
        this._emitResult(raw, true, 'A', { forceRole: 'final' });
      } catch (_) {}
    }
    this._disposeRecognizer();
    this._sessionActive = false;
    this._lastPartial = '';
    this._mode = 'idle';
    this._activeUtt = null;
    if (this.status === 'listening') this.status = 'ready';
    this.emit('status', this.getState());
    return this.getState();
  }

  setConfidenceThreshold(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    this.confidenceThreshold = Math.min(0.85, Math.max(0.45, n));
  }

  armCapture() {
    if (this._sessionActive && this._grammarReady) this._beginCapture();
  }

  shutdown() {
    this.stopSession();
    if (this._model) {
      try { this._model.free(); } catch (_) {}
      this._model = null;
    }
    this.status = 'uninitialized';
    this._vosk = null;
  }

  _emitResult(raw, isFinal, pass = 'A', opts = {}) {
    const normalized = this._normalizeResult(raw);
    if (!normalized) return;
    let text = (normalized.text || '').trim();
    if (!text) return;
    text = text.replace(/\[unk\]/gi, ' ').replace(/\s+/g, ' ').trim();
    if (!text) return;

    const utt = this._ensureUtterance();
    let role = opts.forceRole || null;
    if (!role) {
      if (pass === 'B') {
        role = 'final';
        utt.finalEmitted = true;
      } else if (this._mode === 'capture' && !utt.probeEmitted) {
        // Pass A early final while Pass B is still capturing → tentative probe
        role = 'probe';
        utt.probeEmitted = true;
      } else {
        // Sole Pass A result (or late Pass A after probe) → settling final
        role = 'final';
        utt.finalEmitted = true;
      }
    } else if (role === 'final') {
      utt.finalEmitted = true;
    }

    const confidence = averageWordConfidence(normalized);
    const threshold = pass === 'B'
      ? Math.min(this.confidenceThreshold, 0.50)
      : this.confidenceThreshold;

    const payload = {
      text,
      isFinal: !!isFinal,
      confidence,
      source: 'primary',
      pass,
      utteranceId: utt.id,
      role,
    };

    if (confidence !== null && confidence < threshold) {
      this.emit('transcript', {
        ...payload,
        ignored: true,
        reason: 'low_confidence',
      });
      return;
    }

    this.emit('transcript', payload);
  }

  _disposeRecognizer() {
    this._clearUttEndTimer();
    if (this._rec) {
      try { this._rec.free(); } catch (_) {}
      this._rec = null;
    }
    if (this._recGrammar) {
      try { this._recGrammar.free(); } catch (_) {}
      this._recGrammar = null;
    }
    this._grammarReady = false;
    this._activeUtt = null;
  }
}

module.exports = { VoskEngine, resolveModelPath, SAMPLE_RATE, shouldArmPassBForBookish };
