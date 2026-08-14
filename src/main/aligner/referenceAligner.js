/**
 * referenceAligner.js
 *
 * Standalone, engine-agnostic alignment engine per FR-5.31 / FR-5.34 / FR-5.36.
 * Optimized for Singing Voices with Background Music & Instruments:
 * - Worship & singing homophone normalization (e.g. "lord" <-> "laud", "praise" <-> "prays").
 * - Elongated vowel compression ("graaaace" -> "grace", "loooove" -> "love").
 * - Stem & inflection equivalence ("worshipping" <-> "worship", "moving" <-> "move").
 * - Dynamic lookahead across obscured syllables caused by background instrumentals.
 * - Stopword isolated skip protection.
 * - True word-by-word tracking with clean completion trigger on final word.
 */

'use strict';

const { EventEmitter } = require('events');

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'is', 'are', 'was', 'were', 'to', 'of', 'in',
  'on', 'at', 'by', 'for', 'with', 'about', 'as', 'into', 'like', 'through',
  'after', 'over', 'between', 'out', 'against', 'during', 'without', 'before',
  'under', 'around', 'among', 'it', 'its', 'my', 'me', 'we', 'our', 'us',
  'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their',
  'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'but',
  'if', 'so', 'up', 'down', 'no', 'not', 'that', 'this', 'these', 'those'
]);

const HOMOPHONES = {
  'u': 'you',
  'yu': 'you',
  'ur': 'your',
  'yor': 'your',
  'laud': 'lord',
  'loud': 'lord',
  'prays': 'praise',
  'wholly': 'holy',
  'holly': 'holy',
  'alleluia': 'hallelujah',
  'halelujah': 'hallelujah',
  'hosannah': 'hosanna',
  'yahwe': 'yahweh',
  'jah': 'yah',
  'rain': 'reign',
  'peace': 'piece',
  'piece': 'peace',
  'here': 'hear',
  'hear': 'here',
  'hour': 'our',
  'savior': 'saviour',
  'saviour': 'savior',
  'worshipping': 'worship',
  'worshiping': 'worship',
  'praising': 'praise',
  'moving': 'move',
  'touching': 'touch',
  'healing': 'heal',
  'turning': 'turn',
  'working': 'work',
  'walking': 'walk',
  'running': 'run',
  'singing': 'sing',
  'shining': 'shine',
  'living': 'live',
  'giving': 'give',
  'loving': 'love',
};

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
 * Normalize and canonicalize singing token.
 */
function canonicalizeToken(raw) {
  if (!raw) return '';
  const collapsed = raw.replace(/(.)\1{2,}/g, '$1');
  return HOMOPHONES[collapsed] || HOMOPHONES[raw] || collapsed || raw;
}

/**
 * Clean and normalize text into an array of lowercase tokens with punctuation stripped
 * and elongated singing vowels collapsed.
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .toLowerCase()
    .replace(/[^\w\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(w => canonicalizeToken(w));
}

/**
 * Check if two words match fuzzily or via singing stem/inflection.
 */
function matchWord(sTok, rTok, maxDist = 2) {
  if (sTok === rTok) return { match: true, dist: 0 };

  const canS = canonicalizeToken(sTok);
  const canR = canonicalizeToken(rTok);
  if (canS === canR) return { match: true, dist: 0 };

  const isStopS = STOP_WORDS.has(canS);
  const isStopR = STOP_WORDS.has(canR);

  // Stopwords require exact match
  if (isStopS || isStopR) {
    return { match: canS === canR, dist: canS === canR ? 0 : 99 };
  }

  // Stem matching for content words with length >= 5 and small length difference
  if (canS.length >= 5 && canR.length >= 5) {
    const lenDiff = Math.abs(canS.length - canR.length);
    if (lenDiff <= 3 && (canS.startsWith(canR.slice(0, 4)) || canR.startsWith(canS.slice(0, 4)))) {
      return { match: true, dist: 1 };
    }
  }

  const dist = levenshtein(canS, canR);
  const allowed = canS.length <= 3 ? 0 : (canS.length <= 5 ? 1 : maxDist);
  if (dist <= allowed) {
    return { match: true, dist };
  }

  return { match: false, dist };
}

class ReferenceAligner extends EventEmitter {
  /**
   * @param {object} [options]
   * @param {number} [options.maxEditDistance=2] - Levenshtein tolerance
   * @param {number} [options.maxTokenSkip=4] - Maximum token lookahead skip across instrument gaps
   * @param {number} [options.lookaheadWindow=25] - Forward token search window
   * @param {number} [options.backwardWindow=25] - Backward token search window for resync
   * @param {number} [options.resyncCooldownMs=3000] - Rate limit for backward resync (FR-5.34)
   */
  constructor(options = {}) {
    super();
    this.maxEditDistance = options.maxEditDistance ?? 2;
    this.maxTokenSkip = options.maxTokenSkip ?? 4;
    this.lookaheadWindow = options.lookaheadWindow ?? 25;
    this.backwardWindow = options.backwardWindow ?? 25;
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
   * Sequential multi-token matching algorithm with vocal resilience through music.
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
    let contentMatchCount = 0;
    let totalDist = 0;
    let isBackwardResync = false;

    // 1. Forward sequential matching across spoken tokens
    for (let sIdx = 0; sIdx < spokenTokens.length; sIdx++) {
      const sTok = spokenTokens[sIdx];
      const isStopWord = STOP_WORDS.has(sTok);
      const searchStart = Math.max(0, currCursor + 1);
      const searchEnd = Math.min(this.tokens.length - 1, searchStart + this.lookaheadWindow);

      let tokenBestIdx = -1;
      let tokenBestDist = Infinity;

      for (let rIdx = searchStart; rIdx <= searchEnd; rIdx++) {
        const rTok = this.tokens[rIdx];
        const res = matchWord(sTok, rTok, this.maxEditDistance);
        const skip = rIdx - (currCursor >= 0 ? currCursor : 0);

        if (res.match && res.dist < tokenBestDist) {
          // Stopword skip protection: Stopwords can only match if adjacent (skip === 1) or first token
          if (isStopWord && skip > 1) {
            continue;
          }

          if (skip <= this.maxTokenSkip || res.dist <= 1) {
            tokenBestDist = res.dist;
            tokenBestIdx = rIdx;
          }
        }
      }

      if (tokenBestIdx !== -1) {
        currCursor = tokenBestIdx;
        matchCount++;
        if (!isStopWord) contentMatchCount++;
        totalDist += tokenBestDist;
      }
    }

    // 2. FR-5.34 Bounded backward resync (only on content words)
    if (matchCount === 0 && this.cursor > 0 && (now - this.lastResyncTime > this.resyncCooldownMs)) {
      const backStart = Math.max(0, this.cursor - this.backwardWindow);
      const backEnd = Math.max(0, this.cursor - 1);

      for (let sIdx = 0; sIdx < spokenTokens.length; sIdx++) {
        const sTok = spokenTokens[sIdx];
        if (STOP_WORDS.has(sTok)) continue;

        for (let rIdx = backStart; rIdx <= backEnd; rIdx++) {
          const rTok = this.tokens[rIdx];
          const res = matchWord(sTok, rTok, 1);
          if (res.match) {
            currCursor = rIdx;
            matchCount = 1;
            contentMatchCount = 1;
            totalDist = res.dist;
            isBackwardResync = true;

            for (let remSIdx = sIdx + 1; remSIdx < spokenTokens.length; remSIdx++) {
              const remTok = spokenTokens[remSIdx];
              const nextRefIdx = currCursor + 1;
              if (nextRefIdx < this.tokens.length) {
                const remRes = matchWord(remTok, this.tokens[nextRefIdx], this.maxEditDistance);
                if (remRes.match) {
                  currCursor = nextRefIdx;
                  matchCount++;
                  if (!STOP_WORDS.has(remTok)) contentMatchCount++;
                  totalDist += remRes.dist;
                }
              }
            }

            break;
          }
        }
        if (isBackwardResync) break;
      }
    }

    // If forward progress or valid resync made
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

      // FR-5.36 Page complete check: only complete when singer reaches the end of the slide
      const totalToks = this.tokens.length;
      const complete = totalToks <= 2
        ? this.cursor >= totalToks - 1
        : (this.cursor >= totalToks - 1 || (totalToks >= 6 && this.cursor >= totalToks - 2));
      this.isComplete = complete;

      // One-word-ahead: activeWordIndex is the NEXT word to be spoken (cursor + 1),
      // clamped to the last token. When cursor is -1, activeWordIndex is 0 (first word).
      // When cursor reaches the final token, activeWordIndex stays at final token.
      const activeIdx = Math.min(this.cursor + 1, totalToks - 1);

      const updatePayload = {
        referenceId: this.referenceId,
        wordIndex: this.cursor,
        activeWordIndex: activeIdx,
        token: this.tokens[this.cursor],
        activeToken: this.tokens[activeIdx],
        totalTokens: this.tokens.length,
        confidence: matchConfidence,
        isComplete: complete,
        resync: isBackwardResync,
        prevWordIndex: prevCursor,
        progressPct: Math.round(((this.cursor + 1) / totalToks) * 100),
      };

      this.emit('update', updatePayload);
      this.emit('alignment:update', updatePayload);

      if (complete) {
        this.emit('complete', {
          referenceId: this.referenceId,
          wordIndex: this.cursor,
          activeWordIndex: activeIdx,
          totalTokens: this.tokens.length,
        });
      }

      return updatePayload;
    }

    // No match on this chunk
    this.emit('no-match', {
      referenceId: this.referenceId,
      cursor: this.cursor,
      lastMatchAgeMs: this.lastMatchTime > 0 ? now - this.lastMatchTime : 0,
      totalTokens: this.tokens.length,
    });

    return null;
  }
}

module.exports = {
  ReferenceAligner,
  tokenize,
  canonicalizeToken,
  levenshtein,
  matchWord,
  STOP_WORDS,
  HOMOPHONES,
};
