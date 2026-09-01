/**
 * teleprompterSegmentedMode.js
 *
 * Thin adapter that maps a teleprompter script (pages array) to the
 * SceneAutoAdvanceManager state machine (FR-5.48 [NEW]).
 *
 * REUSE: Calls SceneAutoAdvanceManager.startScene(), .feed(), .manualAdvance(),
 * .manualPrev(), and .stop() directly — no new state machine is implemented here.
 * All advance debounce, fallback timeout, and cross-section lookahead logic
 * lives exclusively in SceneAutoAdvanceManager (FR-5.36–FR-5.39).
 */

'use strict';

const { EventEmitter } = require('events');
const { SceneAutoAdvanceManager } = require('./sceneAutoAdvance');

class TeleprompterSegmentedMode extends EventEmitter {
  /**
   * @param {object} [options]
   * @param {number} [options.debounceMs=600] - Pause-to-advance debounce (ms). Default longer than scene default (500ms) since teleprompter scripts have longer natural pause gaps than song lyrics.
   * @param {number} [options.fallbackTimeoutMs=6000] - No-match fallback prompt delay (ms). Longer than scene (4s) since sermon text is less verbatim than song lyrics.
   */
  constructor(options = {}) {
    super();
    this._manager = new SceneAutoAdvanceManager({
      debounceMs: options.debounceMs ?? 600,
      fallbackTimeoutMs: options.fallbackTimeoutMs ?? 6000,
    });

    // Forward all SceneAutoAdvanceManager events with teleprompter-specific naming
    this._manager.on('advance', (info) => {
      this.emit('segment:advance', {
        sectionIndex: info.pageIndex,
        sequenceIndex: info.sequenceIndex,
        label: info.label,
        reason: info.reason,
      });
    });

    this._manager.on('prev', (info) => {
      this.emit('segment:prev', {
        sectionIndex: info.pageIndex,
        sequenceIndex: info.sequenceIndex,
        label: info.label,
        reason: info.reason,
      });
    });

    this._manager.on('scene:ended', (info) => {
      this.emit('script:ended', { scriptId: info.sceneId });
    });

    this._manager.on('prompt:suggest', (info) => {
      this.emit('segment:suggest', info);
    });

    this._manager.on('prompt:clear', () => {
      this.emit('segment:suggest:clear');
    });

    this._manager.on('aligner:update', (update) => {
      this.emit('word:update', update);
    });
  }

  /**
   * Start a segmented-mode session for a given script.
   * Maps script pages → scene-compatible page format.
   *
   * @param {object} script - Teleprompter script with .id, .title, .pages[]
   * @param {number} [startSectionIndex=0]
   */
  startScript(script, startSectionIndex = 0) {
    if (!script || !Array.isArray(script.pages) || script.pages.length === 0) {
      console.warn('[TeleprompterSegmentedMode] Cannot start: script has no pages.');
      return;
    }

    // Map teleprompter script shape → SceneAutoAdvanceManager scene shape
    const sceneShape = {
      id: script.id || `tp-${Date.now()}`,
      navMode: 'read_along', // forces SceneAutoAdvanceManager.isEnabled = true
      isSong: false,
      sceneType: 'teleprompter',
      pages: script.pages.map((p) => ({
        label: p.label || p.id || 'Section',
        content: p.text || '',
      })),
    };

    // Direct call to SceneAutoAdvanceManager.startScene() (FR-5.48)
    this._manager.startScene(sceneShape, startSectionIndex);
  }

  /**
   * Feed an ASR transcript string into the aligner.
   * Direct call to SceneAutoAdvanceManager.feed() (FR-5.48).
   *
   * @param {string|object} asrPayload
   */
  feed(asrPayload) {
    return this._manager.feed(asrPayload);
  }

  /**
   * Force advance to next section regardless of aligner state.
   * Direct call to SceneAutoAdvanceManager.manualAdvance() (FR-5.39 / FR-5.48).
   */
  manualAdvance() {
    this._manager.manualAdvance();
  }

  /**
   * Force go back to previous section.
   * Direct call to SceneAutoAdvanceManager.manualPrev() (FR-5.48).
   */
  manualPrev() {
    this._manager.manualPrev();
  }

  /**
   * Stop the segmented session.
   * Direct call to SceneAutoAdvanceManager.stop() (FR-5.48).
   */
  stop() {
    this._manager.stop();
  }

  get currentSectionIndex() {
    return this._manager.currentPageIndex;
  }

  get currentSequenceIndex() {
    return this._manager.currentSequenceIndex;
  }

  get isActive() {
    return this._manager.isEnabled;
  }
}

module.exports = { TeleprompterSegmentedMode };
