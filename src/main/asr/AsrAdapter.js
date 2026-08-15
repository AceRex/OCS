/**
 * FR-3.65 — ASR Adapter contract.
 *
 * All ASR-consuming code (probe logic, shape gate, command router, debug bar)
 * must talk ONLY through this interface regardless of which engine is active.
 * Engine-specific code lives exclusively in WhisperAdapter and VoskAdapter.
 *
 * This is the foundational refactor Phase 0 requires — it prevents the exact
 * spec/implementation drift the v1.7 gap-analysis found (v1.6 described
 * Vosk-specific behaviour as if it were engine-agnostic).
 *
 * Partial event shape:
 *   { text, utteranceId, confidence, pass, role: 'partial'|'probe', asrEngine }
 *
 * Final event shape:
 *   { text, utteranceId, confidence, pass, role: 'final', isFinal: true,
 *     asrEngine, language?, ignored?, reason?, meta? }
 */
'use strict';

const { EventEmitter } = require('events');

/**
 * AsrAdapter — base class every engine adapter extends.
 *
 * Emits:
 *   'partial'  — synthesized or native interim result
 *   'final'    — settled utterance result (isFinal: true)
 *   'status'   — engine status object changed
 *
 * Engine implementations override the abstract methods below.
 * This class provides the shared forwarding logic from raw 'transcript'
 * events → typed 'partial' / 'final' events so consumers never inspect the
 * raw shape.
 */
class AsrAdapter extends EventEmitter {
  /**
   * @param {string} engineName - 'whisper' | 'vosk'
   * @param {object} impl - the underlying engine instance (WhisperEngine | VoskEngine)
   */
  constructor(engineName, impl) {
    super();

    if (!engineName) throw new Error('AsrAdapter: engineName is required');
    if (!impl) throw new Error('AsrAdapter: impl (engine instance) is required');

    /** @type {string} */
    this.engineName = engineName;

    /** @type {object} The underlying engine (WhisperEngine | VoskEngine) */
    this._impl = impl;
    this.engine = impl;

    /** @type {number} Active confidence threshold (engine-specific default applied on construction) */
    this.confidenceThreshold = this._defaultConfidenceThreshold();

    // Forward raw transcript events → typed partial / final
    this._impl.on('transcript', (payload) => this._routeTranscript(payload));
    this._impl.on('status', (state) => {
      this.emit('status', {
        ...state,
        engineName: this.engineName,
        asrEngine: this.engineName,
      });
    });
  }

  // ── Abstract helpers (overridden by subclasses) ───────────────────────────

  /** Return the engine-appropriate default confidence threshold (FR-3.13 / FR-3.68). */
  _defaultConfidenceThreshold() {
    return 0.48; // Vosk default; WhisperAdapter overrides to 0.42
  }

  // ── Transcript routing ────────────────────────────────────────────────────

  /**
   * Route a raw transcript payload from the engine to typed 'partial' / 'final' events.
   * Subclasses may override if the raw shape differs significantly.
   * @param {object} payload
   */
  _routeTranscript(payload) {
    if (!payload) return;

    const enriched = {
      ...payload,
      asrEngine: this.engineName,
      engineName: this.engineName,
    };

    const role = payload.role || (payload.isFinal ? 'final' : 'partial');
    const isFinal = payload.isFinal || role === 'final';

    if (isFinal) {
      this.emit('final', { ...enriched, isFinal: true, role: 'final' });
    } else {
      this.emit('partial', { ...enriched, isFinal: false, role });
    }

    // Also emit the generic 'transcript' event for backward compat
    // (asrFacade re-emits this to main.js listeners)
    this.emit('transcript', enriched);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async initialize() {
    return this._impl.initialize();
  }

  startSession() {
    return this._impl.startSession();
  }

  stopSession() {
    return this._impl.stopSession();
  }

  pushAudio(pcm) {
    if (this._impl) this._impl.pushAudio(pcm);
  }

  shutdown() {
    if (this._impl) {
      try { this._impl.shutdown(); } catch (_) {}
      this._impl.removeAllListeners();
    }
    this._impl = null;
  }

  // ── Configuration ─────────────────────────────────────────────────────────

  /**
   * FR-3.68 — Set confidence threshold.
   * Called automatically when engine switches (asrFacade resets to engine default).
   */
  setConfidenceThreshold(value) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0 && n <= 1) {
      this.confidenceThreshold = n;
      if (this._impl && typeof this._impl.setConfidenceThreshold === 'function') {
        this._impl.setConfidenceThreshold(n);
      }
    }
  }

  setLanguagePolicy(policy) {
    if (this._impl && typeof this._impl.setLanguagePolicy === 'function') {
      this._impl.setLanguagePolicy(policy);
    }
  }

  getLanguagePolicy() {
    if (this._impl && typeof this._impl.getLanguagePolicy === 'function') {
      return this._impl.getLanguagePolicy();
    }
    return null;
  }

  /** Secondary / PTT buffer transcription (whisper only; vosk best-effort). */
  async transcribeSecondary(pcm) {
    if (!this._impl) throw new Error('AsrAdapter: engine not initialized');
    if (typeof this._impl.transcribeBuffer === 'function') {
      return this._impl.transcribeBuffer(pcm, { role: 'final', source: 'secondary' });
    }
    // Vosk: push audio, no single-shot support
    this._impl.pushAudio(pcm);
    return {
      text: '',
      source: 'secondary',
      asrEngine: this.engineName,
      note: `${this.engineName}_secondary_streaming`,
    };
  }

  getState() {
    const base = this._impl ? this._impl.getState() : { status: 'uninitialized' };
    return {
      ...base,
      engineName: this.engineName,
      asrEngine: this.engineName,
      confidenceThreshold: this.confidenceThreshold,
    };
  }
}

module.exports = { AsrAdapter };
