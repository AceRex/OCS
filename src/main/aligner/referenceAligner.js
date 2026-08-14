/**
 * referenceAligner.js
 *
 * Standalone, engine-agnostic alignment engine per FR-5.31 / FR-5.34 / FR-5.36.
 *
 * Capabilities:
 * - Accepts arbitrary reference text (Scene Page lyrics/text, scripture, teleprompter script).
 * - Ingests ASR transcript events ({ text, isFinal, confidence, ... } or raw strings).
 * - Performs fuzzy matching with Levenshtein distance <= 2 and skip tolerance <= 2 tokens.
 * - Multi-token sequential tracking across each spoken utterance.
 * - Short word skip protection to prevent false forward jumps on isolated stopwords.
 * - Bounded backward resync (FR-5.34): Allows backward repositioning if strong match found
 *   within previous 30 tokens, rate-limited to at most once per 3000ms.
 * - Emits position updates { referenceId, wordIndex, confidence, isComplete, ... } via EventEmitter.
 * - Detects page complete (FR-5.36) when cursor reaches final token.
 */

'use strict';

const { EventEmitter } = require('events');

/**
 * Compute Levenshtein distance between two strings.
 */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row = [];
  for (let i = 0; i <= b.length; i++) {
    row[i] = i;
  }

  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      let val;
      if (a[i - 1] === b[j - 1]) {
        val = row[j - 1];
      } else {
        val = Math.min(row[j - 1] + 1, prev + 1, row[j] + 1);
      }
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }

  return row[b.length];
}

/**
 * Clean and normalize text into an array of lowercase tokens with punctuation stripped.
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

class ReferenceAligner extends EventEmitter {
  /**
   * @param {object} [options]
   * @param {number} [options.maxEditDistance=2] - Levenshtein tolerance
   * @param {number} [options.maxTokenSkip=2] - Maximum token lookahead skip
   * @param {number} [options.lookaheadWindow=15] - Forward token search window
   * @param {number} [options.backwardWindow=30] - Backward token search window for resync
   * @param {number} [options.resyncCooldownMs=3000] - Rate limit for backward resync (FR-5.34)
   */
  constructor(options = {}) {
    super();
    this.maxEditDistance = options.maxEditDistance ?? 2;
    this.maxTokenSkip = options.maxTokenSkip ?? 2;
    this.lookaheadWindow = options.lookaheadWindow ?? 15;
    this.backwardWindow = options.backwardWindow ?? 30;
    this.resyncCooldownMs = options.resyncCooldownMs ?? 3000;

    this.referenceId = null;
    this.referenceText = '';
    this.tokens = [];
    this.cursor = -1;
    this.lastMatchTime = 0;
    this.lastResyncTime = 0;
    this.isComplete = false;
    this.isActive = false;
  }

  /**
   * Set the reference text to align against.
   * Resets cursor to -1.
   * @param {string|number} referenceId
   * @param {string} text
   */
  setReference(referenceId, text) {
    this.referenceId = referenceId;
    this.referenceText = text || '';
    this.tokens = tokenize(this.referenceText);
    this.cursor = -1;
    this.lastMatchTime = Date.now();
    this.lastResyncTime = 0;
    this.isComplete = this.tokens.length === 0;
    this.isActive = true;

    this.emit('reference-set', {
      referenceId: this.referenceId,
      totalTokens: this.tokens.length,
      tokens: this.tokens,
    });

    return {
      referenceId: this.referenceId,
      totalTokens: this.tokens.length,
    };
  }

  /**
   * Reset aligner state.
   */
  reset() {
    this.cursor = -1;
    this.isComplete = this.tokens.length === 0;
    this.lastMatchTime = Date.now();
  }

  /**
   * Stop alignment.
   */
  stop() {
    this.isActive = false;
    this.emit('stopped', { referenceId: this.referenceId });
  }

  /**
   * Ingest an ASR transcript (final or partial payload, or raw string).
   * Sequential multi-token matching algorithm with stopword false-jump protection.
   * @param {object|string} asrPayload
   * @returns {object|null} Match result or null
   */
  feed(asrPayload) {
    if (!this.isActive || !this.tokens.length) {
      return null;
    }

    const text = typeof asrPayload === 'string' ? asrPayload : asrPayload?.text;
    if (!text || typeof text !== 'string') return null;

    const spokenTokens = tokenize(text);
    if (!spokenTokens.length) return null;

    const now = Date.now();
    let currCursor = this.cursor;
    let matchCount = 0;
    let totalDist = 0;
    let isBackwardResync = false;

    // 1. Forward sequential matching across spoken tokens
    for (let sIdx = 0; sIdx < spokenTokens.length; sIdx++) {
      const sTok = spokenTokens[sIdx];
      const searchStart = Math.max(0, currCursor + 1);
      const searchEnd = Math.min(this.tokens.length - 1, searchStart + this.lookaheadWindow);

      let tokenBestIdx = -1;
      let tokenBestDist = Infinity;

      for (let rIdx = searchStart; rIdx <= searchEnd; rIdx++) {
        const rTok = this.tokens[rIdx];
        const dist = levenshtein(sTok, rTok);
        const skip = rIdx - (currCursor >= 0 ? currCursor : 0);

        if (dist <= this.maxEditDistance && dist < tokenBestDist) {
          // Short word skip protection: if skip > 1 and word length <= 3, require dist === 0 and adjacent
          const isShortWord = sTok.length <= 3;
          if (isShortWord && skip > 1) {
            continue; // Skip isolated short stopwords jumping forward
          }

          if (skip <= this.maxTokenSkip || dist <= 1) {
            tokenBestDist = dist;
            tokenBestIdx = rIdx;
          }
        }
      }

      if (tokenBestIdx !== -1) {
        currCursor = tokenBestIdx;
        matchCount++;
        totalDist += tokenBestDist;
      }
    }

    // 2. FR-5.34 Bounded backward resync
    // If no forward match occurred and cooldown elapsed, search backward range
    if (matchCount === 0 && this.cursor > 0 && (now - this.lastResyncTime > this.resyncCooldownMs)) {
      const backStart = Math.max(0, this.cursor - this.backwardWindow);
      const backEnd = Math.max(0, this.cursor - 1);

      for (let sIdx = 0; sIdx < spokenTokens.length; sIdx++) {
        const sTok = spokenTokens[sIdx];
        for (let rIdx = backStart; rIdx <= backEnd; rIdx++) {
          const rTok = this.tokens[rIdx];
          const dist = levenshtein(sTok, rTok);
          if (dist <= 1) {
            currCursor = rIdx;
            matchCount = 1;
            totalDist = dist;
            isBackwardResync = true;

            // Continue matching remaining spoken tokens forward from rIdx + 1
            for (let remSIdx = sIdx + 1; remSIdx < spokenTokens.length; remSIdx++) {
              const remTok = spokenTokens[remSIdx];
              const nextRefIdx = currCursor + 1;
              if (nextRefIdx < this.tokens.length) {
                const remDist = levenshtein(remTok, this.tokens[nextRefIdx]);
                if (remDist <= this.maxEditDistance) {
                  currCursor = nextRefIdx;
                  matchCount++;
                  totalDist += remDist;
                }
              }
            }

            break;
          }
        }
        if (isBackwardResync) break;
      }
    }

    // If forward progress or valid resync made:
    if (matchCount > 0 && (currCursor !== this.cursor || isBackwardResync)) {
      const prevCursor = this.cursor;
      this.cursor = currCursor;
      this.lastMatchTime = now;
      if (isBackwardResync) {
        this.lastResyncTime = now;
      }

      // Average token confidence
      const avgDist = totalDist / matchCount;
      const matchConfidence = Math.max(0.4, Number((1.0 - avgDist * 0.2).toFixed(2)));

      // FR-5.36 Page complete check
      const complete = this.cursor >= this.tokens.length - 1;
      this.isComplete = complete;

      const updatePayload = {
        referenceId: this.referenceId,
        wordIndex: this.cursor,
        token: this.tokens[this.cursor],
        totalTokens: this.tokens.length,
        confidence: matchConfidence,
        isComplete: complete,
        resync: isBackwardResync,
        prevWordIndex: prevCursor,
      };

      this.emit('update', updatePayload);
      this.emit('alignment:update', updatePayload);

      if (complete) {
        this.emit('complete', {
          referenceId: this.referenceId,
          wordIndex: this.cursor,
          totalTokens: this.tokens.length,
        });
      }

      return updatePayload;
    }

    // No match
    this.emit('no-match', {
      referenceId: this.referenceId,
      cursor: this.cursor,
      spokenText: text,
      lastMatchAgeMs: now - this.lastMatchTime,
    });

    return null;
  }
}

module.exports = {
  ReferenceAligner,
  tokenize,
  levenshtein,
};
