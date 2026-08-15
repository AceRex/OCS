/**
 * sceneAutoAdvance.js
 *
 * Implements Scene Read-Along / Sing-Along Auto-Advance State Machine:
 * - True Voice-Driven progression (NO automatic timers or arbitrary idle advances).
 * - Advances ONLY when the singer sings the end of the slide, or starts singing the next section.
 * - Always active for Songs (`sceneType === 'song'`) and Read-Along scenes.
 * - Cross-Section Lookahead: Only advances when singer explicitly sings >= 2 distinct words of the next section.
 * - Full Chorus Flow sequence progression support with X2/X3 repeats.
 * - Manual override always functional and uncorrupting.
 */

'use strict';

const { EventEmitter } = require('events');
const { ReferenceAligner, tokenize, matchWord, STOP_WORDS } = require('./referenceAligner');

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
    this.sequence = [];
    this.currentSequenceIndex = 0;
    this.currentPageIndex = 0;
    this.isEnabled = false;

    // State machine flags
    this.isPendingAdvance = false;
    this.debounceTimer = null;
    this.fallbackTimer = null;
    this.suggestPromptActive = false;

    // Forward aligner events
    this.aligner.on('update', (update) => this.emit('aligner:update', update));
    this.aligner.on('complete', (info) => this._onPageComplete(info));
    this.aligner.on('no-match', (info) => this._onNoMatch(info));
  }

  /**
   * Activate Read-Along / Sing-Along for a Scene starting at specified pageIndex / sequenceIndex.
   * @param {object} scene
   * @param {number} [pageIndex=0]
   * @param {number} [sequenceIndex=0]
   */
  startScene(scene, pageIndex = 0, sequenceIndex = 0) {
    this.stop();
    this.scene = scene;
    this.sequence = Array.isArray(scene?.sequence) && scene.sequence.length > 0
      ? scene.sequence
      : (scene?.pages || []).map((p, idx) => ({ pageIndex: idx, label: p.label || `Page ${idx + 1}` }));

    if (sequenceIndex >= 0 && sequenceIndex < this.sequence.length) {
      this.currentSequenceIndex = sequenceIndex;
      this.currentPageIndex = this.sequence[sequenceIndex].pageIndex;
    } else {
      const matchSeq = this.sequence.findIndex(s => s.pageIndex === pageIndex);
      this.currentSequenceIndex = matchSeq !== -1 ? matchSeq : 0;
      this.currentPageIndex = this.sequence[this.currentSequenceIndex]?.pageIndex ?? pageIndex;
    }

    // Enabled for read-along scenes and songs, unless explicitly set to manual mode
    this.isEnabled = scene?.navMode !== 'manual' && (scene?.navMode === 'read_along' || scene?.sceneType === 'song' || scene?.isSong === true);

    if (this.isEnabled) {
      this._loadCurrentPage();
    }
  }

  /**
   * Set or change active page.
   * @param {number} pageIndex
   * @param {number} [sequenceIndex]
   */
  setPage(pageIndex, sequenceIndex) {
    this._clearTimers();
    if (typeof sequenceIndex === 'number' && sequenceIndex >= 0 && sequenceIndex < this.sequence.length) {
      this.currentSequenceIndex = sequenceIndex;
      this.currentPageIndex = this.sequence[sequenceIndex].pageIndex;
    } else {
      this.currentPageIndex = pageIndex;
      const matchSeq = this.sequence.findIndex(s => s.pageIndex === pageIndex);
      if (matchSeq !== -1) this.currentSequenceIndex = matchSeq;
    }

    if (this.isEnabled && this.scene?.pages?.[this.currentPageIndex]) {
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

    const text = typeof asrPayload === 'string' ? asrPayload : asrPayload?.text;
    if (!text || typeof text !== 'string') return null;

    const spokenTokens = tokenize(text);
    if (!spokenTokens.length) return null;

    // 1. Feed current page aligner (voice tracks words in sequence)
    const alignResult = this.aligner.feed(asrPayload);

    // 2. Cross-Section Lookahead: Check if singer started singing the NEXT section
    // Guard 1: Only check if next sequence item exists
    const nextSeqIdx = this.currentSequenceIndex + 1;
    if (nextSeqIdx < this.sequence.length) {
      const nextItem = this.sequence[nextSeqIdx];
      const currentPage = this.scene?.pages?.[this.currentPageIndex];
      const nextPage = this.scene?.pages?.[nextItem.pageIndex];

      // Guard 2: If next page is identical (Chorus Flow repeat X2/X3), do NOT cross-lookahead.
      // Rely solely on page-complete detection for repeated sections.
      const isRepeatedSection =
        nextItem.pageIndex === this.currentPageIndex ||
        (currentPage?.content &&
          nextPage?.content &&
          currentPage.content.trim().toLowerCase() === nextPage.content.trim().toLowerCase());

      if (!isRepeatedSection && nextPage && nextPage.content && currentPage && currentPage.content) {
        const currTokens = this.aligner.tokens || [];
        const nextTokens = tokenize(nextPage.content);

        // Guard 3: Only allow cross-section lookahead if current slide is near completion
        // (singer is near the end of the slide, e.g. within 3 tokens or >= 70% through),
        // preventing premature jump when current slide and next slide share opening words.
        const currentCursor = this.aligner.cursor;
        const totalCurr = currTokens.length;
        const isNearEnd =
          totalCurr <= 4
            ? currentCursor >= 1
            : currentCursor >= totalCurr - 4 || (totalCurr > 0 && currentCursor / totalCurr >= 0.7);

        if (nextTokens.length > 0) {
          let nextMatches = 0;
          let contentMatches = 0;
          const lookaheadMax = Math.min(nextTokens.length, 6);

          for (let s = 0; s < spokenTokens.length; s++) {
            const sTok = spokenTokens[s];
            for (let n = 0; n < lookaheadMax; n++) {
              if (matchWord(sTok, nextTokens[n], 1).match) {
                nextMatches++;
                if (!STOP_WORDS.has(sTok)) contentMatches++;
                break;
              }
            }
          }

          // If current slide matched the speech, only advance if near the end of the slide.
          // If current slide had NO match (singer jumped ahead), advance on strong next-section match (>=2 content words).
          const canAdvance =
            (alignResult !== null && isNearEnd && nextMatches >= 2 && contentMatches >= 1) ||
            (alignResult === null && nextMatches >= 2 && contentMatches >= 2);

          if (canAdvance) {
            this._triggerAutoAdvance();
            return { autoAdvanced: true, nextSection: nextItem.label };
          }
        }
      }
    }

    return alignResult;
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
    const nextSeqIdx = this.currentSequenceIndex + 1;
    if (nextSeqIdx < this.sequence.length) {
      this.currentSequenceIndex = nextSeqIdx;
      const item = this.sequence[nextSeqIdx];
      this.currentPageIndex = item.pageIndex;
      this._loadCurrentPage();
      this.emit('advance', { pageIndex: item.pageIndex, sequenceIndex: nextSeqIdx, label: item.label, reason: 'manual_override' });
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
    const prevSeqIdx = Math.max(0, this.currentSequenceIndex - 1);
    this.currentSequenceIndex = prevSeqIdx;
    const item = this.sequence[prevSeqIdx] || { pageIndex: 0 };
    this.currentPageIndex = item.pageIndex;
    this._loadCurrentPage();
    this.emit('prev', { pageIndex: item.pageIndex, sequenceIndex: prevSeqIdx, label: item.label, reason: 'manual_override' });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  _loadCurrentPage() {
    this._clearTimers();
    this.isPendingAdvance = false;
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

    // Fast transition on voice reaching completion
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this._triggerAutoAdvance();
    }, this.debounceMs);

    // Fallback prompt timer
    if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
    this.fallbackTimer = setTimeout(() => {
      if (this.isPendingAdvance && !this.suggestPromptActive) {
        this.suggestPromptActive = true;
        const nextItem = this.sequence[this.currentSequenceIndex + 1];
        this.emit('prompt:suggest', {
          label: nextItem ? `Advance to ${nextItem.label}?` : "Advance to Next Page?",
          targetPageIndex: nextItem ? nextItem.pageIndex : this.currentPageIndex + 1,
          reason: 'no_match_timeout',
        });
      }
    }, this.fallbackTimeoutMs);
  }

  _triggerAutoAdvance() {
    this._clearTimers();
    this.isPendingAdvance = false;
    this.suggestPromptActive = false;
    this.emit('prompt:clear');

    if (!this.scene) return;
    const nextSeqIdx = this.currentSequenceIndex + 1;
    if (nextSeqIdx < this.sequence.length) {
      this.currentSequenceIndex = nextSeqIdx;
      const nextItem = this.sequence[nextSeqIdx];
      this.currentPageIndex = nextItem.pageIndex;
      this._loadCurrentPage();
      this.emit('advance', {
        pageIndex: nextItem.pageIndex,
        sequenceIndex: nextSeqIdx,
        label: nextItem.label,
        reason: 'auto_advance',
      });
    } else {
      this.emit('scene:ended', { sceneId: this.scene.id });
    }
  }

  _onNoMatch(info) {
    if (this.isEnabled && info.lastMatchAgeMs >= this.fallbackTimeoutMs && !this.suggestPromptActive && this.currentSequenceIndex < this.sequence.length - 1) {
      this.suggestPromptActive = true;
      const nextItem = this.sequence[this.currentSequenceIndex + 1];
      this.emit('prompt:suggest', {
        label: nextItem ? `Advance to ${nextItem.label}?` : "Advance to Next Page?",
        targetPageIndex: nextItem ? nextItem.pageIndex : this.currentPageIndex + 1,
        reason: 'stalled_no_match',
      });
    }
  }
}

module.exports = {
  SceneAutoAdvanceManager,
};
