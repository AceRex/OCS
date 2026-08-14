/**
 * FR-3.65 — VoskAdapter
 *
 * Wraps VoskEngine behind the AsrAdapter contract.
 *
 * Vosk specifics handled here (and ONLY here):
 *  - Default confidence threshold: 0.48 (base inherited from AsrAdapter)
 *  - Vosk provides continuous partials natively → forwarded directly as 'partial'
 *  - Vosk 'isFinal: true' results → forwarded as 'final'
 *  - Pass A / Pass B grammar distinction preserved in payload
 *
 * FR-3.66 — Vosk-specific trigger and book alias patterns are loaded from
 *   engineAliases.js and attached as adapter.aliases so BroadcastEngine
 *   can call adapter.aliases.getTriggerRe() without engine-specific coupling.
 */
'use strict';

const { AsrAdapter } = require('./AsrAdapter');
const { VoskEngine } = require('./voskEngine');
const { getTriggerRe, getBookAliasRe } = require('./engineAliases');

const VOSK_DEFAULT_CONFIDENCE = 0.48; // per PRD FR-3.13

class VoskAdapter extends AsrAdapter {
  /**
   * @param {string} rootDir - Electron __dirname
   * @param {object} [opts]
   */
  constructor(rootDir, opts = {}) {
    const engine = new VoskEngine(rootDir, opts);
    super('vosk', engine);

    // FR-3.66 — Vosk-specific alias sets
    this.aliases = {
      getTriggerRe: () => getTriggerRe('vosk'),
      getBookAliasRe: () => getBookAliasRe('vosk'),
    };
  }

  _defaultConfidenceThreshold() {
    return VOSK_DEFAULT_CONFIDENCE;
  }
  // VoskAdapter uses the base AsrAdapter._routeTranscript — no override needed.
  // Vosk's raw transcript shape matches the base expected shape.
}

module.exports = { VoskAdapter, VOSK_DEFAULT_CONFIDENCE };
