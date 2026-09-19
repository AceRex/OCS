/**
 * Shared Bible Highlighting & Token Utilities
 * Used across BibleController, MiniPreview, PreviewModal, DisplayCanvas, SwitcherProgramCanvas, and test suites.
 */

/**
 * Calculates readable contrast text color (black or white) based on ITU-R BT.601 luminance.
 */
function getContrastTextColor(hexColor) {
  if (!hexColor || typeof hexColor !== "string") return "#000000";
  let hex = hexColor.replace("#", "").trim();
  if (hex.length === 3) {
    hex = hex.split("").map((c) => c + c).join("");
  }
  if (hex.length !== 6) return "#000000";
  const r = parseInt(hex.substr(0, 2), 16) || 0;
  const g = parseInt(hex.substr(2, 2), 16) || 0;
  const b = parseInt(hex.substr(4, 2), 16) || 0;
  const luminance = (r * 299 + g * 587 + b * 114) / 1000 / 255;
  return luminance > 0.55 ? "#000000" : "#FFFFFF";
}

/**
 * Preserves 100% of punctuation and whitespace tokens without collapse.
 */
function tokenizeVerseWithWhitespace(text) {
  return (text || "").split(/(\s+)/).filter((p) => p.length > 0);
}

/**
 * Extracts non-whitespace word tokens for counting and alignment.
 */
function tokenizeVerseWords(text) {
  return (text || "").split(/(\s+)/).filter((p) => p.length && !/^\s+$/.test(p));
}

/**
 * Canonical compound token key schema:
 * ${version}:${bookIndex}:${chapterIndex}:${verseNumber}:${wordIdx}
 */
function makeTokenKey(version, bookIndex, chapterIndex, verseNumber, wordIdx) {
  const v = (version || "KJV").toUpperCase();
  const b = bookIndex != null && bookIndex >= 0 ? bookIndex : 0;
  const c = chapterIndex != null && chapterIndex >= 0 ? chapterIndex : 0;
  const vn = verseNumber != null ? verseNumber : 1;
  const w = wordIdx != null ? wordIdx : 0;
  return `${v}:${b}:${c}:${vn}:${w}`;
}

/**
 * Builds verseOffsets mapping for a set of verse indices.
 */
function buildVerseOffsets(indices, verses, version, bookIndex, chapterIndex) {
  const offsets = {};
  let currentOffset = 0;
  const ver = (version || "KJV").toUpperCase();
  const sorted = Array.from(indices).sort((a, b) => a - b);
  sorted.forEach((verseIndex) => {
    const vText = verses[verseIndex] || "";
    const words = tokenizeVerseWords(vText);
    offsets[verseIndex] = {
      start: currentOffset,
      count: words.length,
      version: ver,
      bookIndex: bookIndex != null ? bookIndex : 0,
      chapterIndex: chapterIndex != null ? chapterIndex : 0,
      verseNumber: verseIndex + 1,
    };
    currentOffset += words.length;
  });
  return offsets;
}

/**
 * Resolves whether an absolute token index is in manualHighlightSet.
 */
function isTokenHighlighted(absIdx, manualHighlightSet, verseOffsets = {}, defaultMeta = {}) {
  if (!manualHighlightSet || manualHighlightSet.size === 0) return false;

  const entries = Object.entries(verseOffsets || {});
  if (entries.length > 0) {
    for (const [vi, offsetInfo] of entries) {
      const { start, count, version, bookIndex, chapterIndex, verseNumber } = offsetInfo || {};
      if (absIdx >= start && absIdx < start + count) {
        const wordIdx = absIdx - start;
        const vNum = verseNumber || (parseInt(vi, 10) + 1);
        const ver = (version || defaultMeta.version || "KJV").toUpperCase();
        const bIdx = bookIndex ?? defaultMeta.bookIndex ?? 0;
        const cIdx = chapterIndex ?? defaultMeta.chapterIndex ?? 0;
        const stableKey = makeTokenKey(ver, bIdx, cIdx, vNum, wordIdx);
        return manualHighlightSet.has(stableKey) || manualHighlightSet.has(`${vi}:${wordIdx}`);
      }
    }
  }

  // Fallback direct checks if verseOffsets were not provided
  const ver = (defaultMeta.version || "KJV").toUpperCase();
  const bIdx = defaultMeta.bookIndex ?? 0;
  const cIdx = defaultMeta.chapterIndex ?? 0;
  const vNum = defaultMeta.verseNumber || 1;
  const directKey = makeTokenKey(ver, bIdx, cIdx, vNum, absIdx);
  return manualHighlightSet.has(directKey) || manualHighlightSet.has(`0:${absIdx}`) || manualHighlightSet.has(String(absIdx));
}

/**
 * Computes merged inline styles for word tokens when manual highlighting,
 * voice read-along cue, or both are active.
 */
function getWordHighlightStyles({
  isManualHL = false,
  isActiveVoice = false,
  isPastVoice = false,
  highlightColor = "#FFEB3B",
  voiceTransition = "text-glow",
  baseTextColor = "#FFFFFF",
}) {
  const contrastText = getContrastTextColor(highlightColor);
  const isUnderline = voiceTransition === "underline";
  const isPop = voiceTransition === "text-pop" || voiceTransition === "pop";

  let style = {
    display: "inline-block",
    color: baseTextColor,
    opacity: isPastVoice ? 0.85 : 1,
    fontWeight: isPastVoice ? 600 : 500,
    textShadow: "0 2px 10px rgba(0,0,0,0.5)",
    transition: "all 160ms cubic-bezier(0.2, 0.8, 0.2, 1)",
    borderRadius: isManualHL ? "4px" : "0px",
    padding: isManualHL ? "0 3px" : "0",
  };

  if (isManualHL) {
    style.backgroundColor = highlightColor;
    style.color = contrastText;
    style.fontWeight = 700;
  }

  if (isActiveVoice) {
    style.opacity = 1;
    style.fontWeight = 800;

    if (isManualHL) {
      // Co-located: preserve manual highlight pill and contrast text, add glowing cyan ring
      style.boxShadow = "0 0 0 2px #00E5FF, 0 0 12px rgba(0,229,255,0.75)";
      if (isUnderline) {
        style.textDecoration = "underline";
        style.textDecorationColor = "#00E5FF";
        style.textUnderlineOffset = "4px";
        style.textDecorationThickness = "2px";
      } else if (isPop) {
        style.transform = "scale(1.12) translateY(-1px)";
      } else {
        style.transform = "scale(1.05)";
      }
    } else {
      // Voice only: normal voice tracking affordance
      if (isUnderline) {
        style.textDecoration = "underline";
        style.textDecorationColor = "#38bdf8";
        style.textUnderlineOffset = "4px";
        style.textDecorationThickness = "2px";
        style.textShadow = "0 2px 10px rgba(0,0,0,0.6)";
      } else if (isPop) {
        style.transform = "scale(1.18) translateY(-2px)";
        style.textShadow = "0 4px 14px rgba(0,0,0,0.8), 0 0 12px rgba(255,255,255,0.4)";
      } else {
        // text-glow
        style.transform = "scale(1.05)";
        style.textShadow = "0 0 16px rgba(56,189,248,0.95), 0 0 28px rgba(56,189,248,0.6), 0 2px 10px rgba(0,0,0,0.7)";
      }
    }
  }

  return style;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getContrastTextColor,
    tokenizeVerseWithWhitespace,
    tokenizeVerseWords,
    makeTokenKey,
    buildVerseOffsets,
    isTokenHighlighted,
    getWordHighlightStyles,
  };
}

export {
  getContrastTextColor,
  tokenizeVerseWithWhitespace,
  tokenizeVerseWords,
  makeTokenKey,
  buildVerseOffsets,
  isTokenHighlighted,
  getWordHighlightStyles,
};
