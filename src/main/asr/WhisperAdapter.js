/**
 * FR-3.65 — WhisperAdapter
 *
 * Wraps WhisperEngine behind the AsrAdapter contract.
 *
 * Whisper.cpp specifics handled here (and ONLY here):
 *  - Default confidence threshold: 0.42 (recalibrated vs Vosk's 0.48 for logprob mapping)
 *  - probe / rolling events are emitted as 'partial' to consumers
 *  - final VAD-bounded events emitted as 'final'
 *  - FR-3.67 synthesized partials already implemented inside WhisperEngine's
 *    rolling-window probe — no additional synthesis needed at the adapter layer
 *
 * FR-3.66 — Whisper-specific trigger and book alias patterns are loaded from
 *   engineAliases.js and attached to this adapter so BroadcastEngine can
 *   call adapter.aliases.getTriggerRe() without knowing the engine type.
 */
'use strict';

const { AsrAdapter } = require('./AsrAdapter');
const { WhisperEngine } = require('./whisperEngine');
const { getTriggerRe, getBookAliasRe } = require('./engineAliases');

const WHISPER_DEFAULT_CONFIDENCE = 0.42; // per PRD FR-3.13 note

class WhisperAdapter extends AsrAdapter {
  /**
   * @param {string} rootDir - Electron __dirname
   * @param {object} [opts]
   * @param {string} [opts.modelPath] - override ggml model path
   */
  constructor(rootDir, opts = {}) {
    const engine = new WhisperEngine(rootDir, opts);
    super('whisper', engine);

    // FR-3.66 — Whisper-specific alias sets
    this.aliases = {
      getTriggerRe: () => getTriggerRe('whisper'),
      getBookAliasRe: () => getBookAliasRe('whisper'),
    };

    // Apply whisper's recalibrated default immediately
    this.setConfidenceThreshold(WHISPER_DEFAULT_CONFIDENCE);
  }

  _defaultConfidenceThreshold() {
    return WHISPER_DEFAULT_CONFIDENCE;
  }

  /**
   * Override routing: whisper's probe/rolling events map to 'partial';
   * final VAD-bounded events (isFinal: true) map to 'final'.
   * The role field from WhisperEngine ('probe' | 'partial' | 'final') is
   * preserved in the payload for FR-3.8b reconciliation.
   */
  _routeTranscript(payload) {
    if (!payload) return;

    const enriched = {
      ...payload,
      asrEngine: 'whisper',
      engineName: 'whisper',
    };

    const role = payload.role || (payload.isFinal ? 'final' : 'partial');
    const isFinal = payload.isFinal || role === 'final';

    if (isFinal) {
      this.emit('final', { ...enriched, isFinal: true, role: 'final' });
    } else {
      // 'probe' and 'partial' both go to the 'partial' consumer channel
      // so BroadcastEngine gets interim updates for the live transcript pulse
      this.emit('partial', { ...enriched, isFinal: false, role });
    }

    this.emit('transcript', enriched);
  }
}

module.exports = { WhisperAdapter, WHISPER_DEFAULT_CONFIDENCE };
