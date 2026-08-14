/**
 * sceneAutoAdvance.js
 *
 * Implements Scene Read-Along Auto-Advance State Machine per FR-5.36–FR-5.39:
 * - FR-5.36: Page-complete detection when referenceAligner reaches end of Page tokens.
 * - FR-5.37: Debounced auto-advance (default 500ms, configurable). Resets debounce once if
 *   speech continues past final token without clean break.
 * - FR-5.38: No-match fallback prompt if no progress/match for 4 seconds after entering debounce
 *   window (surfaces a suggestion prompt for 1-click advance instead of silent stall).
 * - FR-5.39: Manual override always available (forces advance/prev without corrupting aligner state).
 */

'use strict';

const { EventEmitter } = require('events');
const { ReferenceAligner } = require('./referenceAligner');

class SceneAutoAdvanceManager extends EventEmitter {
  /**
   * @param {object} [options]
   * @param {number} [options.debounceMs=500] - Auto-advance debounce window (FR-5.37)
   * @param {number} [options.fallbackTimeoutMs=4000] - No-match fallback prompt delay (FR-5.38)
   * @param {ReferenceAligner} [options.aligner] - Optional custom ReferenceAligner instance
   */
  constructor(options = {}) {
    super();
    this.debounceMs = options.debounceMs ?? 500;
    this.fallbackTimeoutMs = options.fallbackTimeoutMs ?? 4000;
    this.aligner = options.aligner || new ReferenceAligner();

    this.scene = null;
    this.currentPageIndex = 0;
    this.isEnabled = false;

    // State machine flags
    this.isPendingAdvance = false;
    this.debounceTimer = null;
    this.fallbackTimer = null;
    this.hasResetDebounceOnce = false;
    this.suggestPromptActive = false;

    // Forward aligner events
    this.aligner.on('update', (update) => this.emit('aligner:update', update));
    this.aligner.on('complete', (info) => this._onPageComplete(info));
    this.aligner.on('no-match', (info) => this._onNoMatch(info));
  }

  /**
   * Activate Read-Along for a Scene starting at specified pageIndex.
   * @param {object} scene
   * @param {number} [pageIndex=0]
   */
  startScene(scene, pageIndex = 0) {
    this.stop();
    this.scene = scene;
    this.currentPageIndex = pageIndex;
    this.isEnabled = scene?.navMode === 'read_along';

    if (this.isEnabled) {
      this._loadCurrentPage();
    }
  }

  /**
   * Set or change active page.
   * @param {number} pageIndex
   */
  setPage(pageIndex) {
    this._clearTimers();
    this.currentPageIndex = pageIndex;
    if (this.isEnabled && this.scene?.pages?.[pageIndex]) {
      this._loadCurrentPage();
    }
  }

  /**
   * Stop Read-Along mode.
   */
  stop() {
    this._clearTimers();
    this.aligner.stop();
    this.isEnabled = false;
    this.suggestPromptActive = false;
    this.emit('prompt:clear');
  }

  /**
   * Feed ASR transcript payload into aligner.
   * @param {object|string} asrPayload
   */
  feed(asrPayload) {
    if (!this.isEnabled) return null;

    // If we are pending advance and speech continues past final token
    if (this.isPendingAdvance && !this.hasResetDebounceOnce) {
      this.hasResetDebounceOnce = true;
      this._restartDebounceTimer();
    }

    return this.aligner.feed(asrPayload);
  }

  /**
   * Force manual page advance (FR-5.39 Manual Override).
   * Safe to call at any time.
   */
  manualAdvance() {
    this._clearTimers();
    this.suggestPromptActive = false;
    this.emit('prompt:clear');

    if (!this.scene) return;
    const nextIdx = this.currentPageIndex + 1;
    if (nextIdx < this.scene.pages.length) {
      this.currentPageIndex = nextIdx;
      this._loadCurrentPage();
      this.emit('advance', { pageIndex: nextIdx, reason: 'manual_override' });
    }
  }

  /**
   * Force manual previous page (FR-5.39 Manual Override).
   */
  manualPrev() {
    this._clearTimers();
    this.suggestPromptActive = false;
    this.emit('prompt:clear');

    if (!this.scene) return;
    const prevIdx = Math.max(0, this.currentPageIndex - 1);
    this.currentPageIndex = prevIdx;
    this._loadCurrentPage();
    this.emit('prev', { pageIndex: prevIdx, reason: 'manual_override' });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  _loadCurrentPage() {
    this._clearTimers();
    this.isPendingAdvance = false;
    this.hasResetDebounceOnce = false;
    this.suggestPromptActive = false;
    this.emit('prompt:clear');

    const page = this.scene?.pages?.[this.currentPageIndex];
    if (page) {
      const refId = `${this.scene.id}-p${this.currentPageIndex}`;
      this.aligner.setReference(refId, page.content || '');
    }
  }

  _clearTimers() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  _onPageComplete(info) {
    if (!this.isEnabled || this.isPendingAdvance) return;

    this.isPendingAdvance = true;
    this._restartDebounceTimer();

    // Start 4-second no-match fallback timer (FR-5.38)
    if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
    this.fallbackTimer = setTimeout(() => {
      if (this.isPendingAdvance && !this.suggestPromptActive) {
        this.suggestPromptActive = true;
        this.emit('prompt:suggest', {
          label: `Next Page? (Page ${this.currentPageIndex + 2})`,
          targetPageIndex: this.currentPageIndex + 1,
          reason: 'no_match_timeout',
        });
      }
    }, this.fallbackTimeoutMs);
  }

  _restartDebounceTimer() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      this._triggerAutoAdvance();
    }, this.debounceMs);
  }

  _triggerAutoAdvance() {
    this._clearTimers();
    this.isPendingAdvance = false;
    this.suggestPromptActive = false;
    this.emit('prompt:clear');

    if (!this.scene) return;
    const nextIdx = this.currentPageIndex + 1;
    if (nextIdx < this.scene.pages.length) {
      this.currentPageIndex = nextIdx;
      this._loadCurrentPage();
      this.emit('advance', {
        pageIndex: nextIdx,
        reason: 'auto_advance',
      });
    } else {
      // Reached last page of scene
      this.emit('scene:ended', { sceneId: this.scene.id });
    }
  }

  _onNoMatch(info) {
    // If no match occurs and we've been stalled for > fallbackTimeoutMs
    if (this.isEnabled && info.lastMatchAgeMs >= this.fallbackTimeoutMs && !this.suggestPromptActive && this.currentPageIndex < (this.scene?.pages?.length || 0) - 1) {
      this.suggestPromptActive = true;
      this.emit('prompt:suggest', {
        label: `Next Page? (Page ${this.currentPageIndex + 2})`,
        targetPageIndex: this.currentPageIndex + 1,
        reason: 'stalled_no_match',
      });
    }
  }
}

module.exports = {
  SceneAutoAdvanceManager,
};
