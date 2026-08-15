import React from "react";

/**
 * LyricAnimationEngine — Unified Engine for Sing-Along & Read-Along Presentations
 * 
 * Contains:
 * - 20 Sing-Along Animation & Translation Modes
 * - 20 Read-Along Animation & Cognitive Reading Modes
 */

// ─── 1. Sing-Along Animations (Songs / Worship) ────────────────────────────

export const LYRIC_ANIMATIONS = [
  {
    id: "karaoke",
    name: "Karaoke Highlight",
    category: "highlight",
    description: "Highlights each word as the singer reaches it with a vibrant singing cursor.",
    badge: "🎤 Classic",
  },
  {
    id: "line-reveal",
    name: "Line-by-Line Reveal",
    category: "reveal",
    description: "Displays one lyric line at a time and reveals upcoming lines as the song progresses.",
    badge: "📜 Lines",
  },
  {
    id: "word-reveal",
    name: "Word-by-Word Reveal",
    category: "reveal",
    description: "Words appear individually in sequence only as they are spoken or sung.",
    badge: "✨ Reveal",
  },
  {
    id: "progressive-fill",
    name: "Progressive Fill",
    category: "highlight",
    description: "Text starts translucent and progressively fills with a glowing highlight gradient.",
    badge: "🌊 Gradient",
  },
  {
    id: "bounce",
    name: "Bouncing Word",
    category: "motion",
    description: "The active word gently bounces and scales up in real time while being sung.",
    badge: "⚡ Dynamic",
  },
  {
    id: "underline",
    name: "Underline Tracker",
    category: "highlight",
    description: "An animated glowing underline bar glides smoothly underneath each word.",
    badge: "📍 Cursor",
  },
  {
    id: "glow",
    name: "Glowing Word",
    category: "highlight",
    description: "The currently sung word radiates an intense ambient light bloom.",
    badge: "🌟 Radiant",
  },
  {
    id: "color-shift",
    name: "Color Transition",
    category: "highlight",
    description: "Lyrics transition smoothly from warm gold to electric cyan as the song advances.",
    badge: "🎨 Palette",
  },
  {
    id: "scroll",
    name: "Scrolling Lyrics",
    category: "motion",
    description: "Continuous vertical scrolling marquee centering the currently sung line.",
    badge: "🔄 Marquee",
  },
  {
    id: "typewriter",
    name: "Typewriter Effect",
    category: "motion",
    description: "Lyrics appear character-by-character with rhythmic typing cadence.",
    badge: "⌨️ Type",
  },
  {
    id: "fade",
    name: "Fade In / Fade Out",
    category: "motion",
    description: "Past lyrics smoothly dissolve away while upcoming lyrics fade gracefully into view.",
    badge: "🌫️ Soft",
  },
  {
    id: "slide",
    name: "Slide Transition",
    category: "motion",
    description: "Upcoming lyrics slide into place with a smooth upward deceleration.",
    badge: "🚀 Motion",
  },
  {
    id: "split-translation",
    name: "Translation Split Screen",
    category: "translation",
    description: "Original lyrics on top with synchronized translated lyrics underneath.",
    badge: "🌐 Dual View",
    isTranslation: true,
  },
  {
    id: "dual-language",
    name: "Dual-Language Highlight",
    category: "translation",
    description: "Original and translated lines stacked together, highlighting simultaneously.",
    badge: "🌍 Stacked",
    isTranslation: true,
  },
  {
    id: "translation-switch",
    name: "Dynamic Translation Switch",
    category: "translation",
    description: "Switch seamlessly between original and translated lyrics in real time.",
    badge: "🔀 Toggle",
    isTranslation: true,
  },
  {
    id: "phrase-translation",
    name: "Phrase-by-Phrase Translation",
    category: "translation",
    description: "Each sung phrase appears paired with its translated equivalent subtitle pill.",
    badge: "💬 Subtitles",
    isTranslation: true,
  },
  {
    id: "interlinear",
    name: "Interlinear Translation",
    category: "translation",
    description: "Original lyrics with word-by-word / phrase translation gloss directly below.",
    badge: "📖 Study",
    isTranslation: true,
  },
  {
    id: "call-response",
    name: "Call-and-Response",
    category: "creative",
    description: "Worship leader lyrics appear in gold while congregation responses appear in emerald.",
    badge: "👥 Responsive",
  },
  {
    id: "section-animation",
    name: "Verse / Chorus Section Styling",
    category: "creative",
    description: "Verse, Chorus, and Bridge sections feature distinct visual accents and badges.",
    badge: "🏷️ Sections",
  },
  {
    id: "beat-sync",
    name: "Beat-Synchronized Lyrics",
    category: "creative",
    description: "Dynamic pulsing rhythm animation synchronized with worship tempo.",
    badge: "🎵 Beat Pulse",
  },
];

// ─── 2. Read-Along Animations (Scripture / Speeches / Text) ────────────────

export const READ_ALONG_ANIMATIONS = [
  {
    id: "word-highlight",
    name: "Word Highlight",
    category: "word-based",
    description: "Highlights each word precisely as it is spoken with crisp contrast.",
    badge: "🔤 Word",
  },
  {
    id: "phrase-highlight",
    name: "Phrase Highlight",
    category: "phrase-line",
    description: "Highlights an entire semantic phrase (3–4 words) at a time for natural reading pacing.",
    badge: "💬 Phrase",
  },
  {
    id: "line-highlight",
    name: "Line Highlight",
    category: "phrase-line",
    description: "Highlights the active spoken line with high brightness while dimming surrounding lines.",
    badge: "📏 Line",
  },
  {
    id: "sentence-highlight",
    name: "Sentence Highlight",
    category: "phrase-line",
    description: "Illuminates the full sentence currently being read across punctuation boundaries.",
    badge: "📝 Sentence",
  },
  {
    id: "karaoke-text",
    name: "Karaoke Text",
    category: "word-based",
    description: "Text progressively highlights from left to right with a smooth color wipe.",
    badge: "🎤 Karaoke",
  },
  {
    id: "progressive-fill",
    name: "Progressive Color Fill",
    category: "word-based",
    description: "Text changes color progressively as reading advances with vibrant gradient.",
    badge: "🌊 Gradient",
  },
  {
    id: "underline-tracker",
    name: "Underline Tracker",
    category: "word-based",
    description: "An animated glowing underline bar glides underneath the active word or phrase.",
    badge: "📍 Underline",
  },
  {
    id: "reading-cursor",
    name: "Reading Cursor",
    category: "word-based",
    description: "A vertical pulsing cursor moves character-by-character through the text.",
    badge: "🖱️ Cursor",
  },
  {
    id: "spotlight",
    name: "Spotlight Reading",
    category: "phrase-line",
    description: "Surrounding text is darkened with a soft spotlight focus over the active reading zone.",
    badge: "🔦 Spotlight",
  },
  {
    id: "focus-window",
    name: "Focus Window",
    category: "phrase-line",
    description: "A glowing focus frame window surrounds and tracks the currently read line.",
    badge: "🔲 Window",
  },
  {
    id: "auto-scroll",
    name: "Smooth Auto Scroll",
    category: "document-based",
    description: "Automatically scrolls smoothly to keep the active spoken sentence centered.",
    badge: "📜 Scroll",
  },
  {
    id: "center-line",
    name: "Center-Line Reading",
    category: "phrase-line",
    description: "The currently read line stays locked right around the vertical center of the screen.",
    badge: "🎯 Center",
  },
  {
    id: "fade-previous",
    name: "Fade Previous Text",
    category: "document-based",
    description: "Previously read sentences gradually become translucent to reduce visual clutter.",
    badge: "🌫️ Fade",
  },
  {
    id: "dim-and-focus",
    name: "Dim-and-Focus",
    category: "document-based",
    description: "Past and upcoming paragraphs are dimmed to 20% while current text stands out vividly.",
    badge: "💡 Focus",
  },
  {
    id: "typewriter-read",
    name: "Typewriter Read-Along",
    category: "document-based",
    description: "Text appears progressively as spoken, creating a dynamic spoken-word effect.",
    badge: "⌨️ Type",
  },
  {
    id: "word-pop",
    name: "Word Pop",
    category: "word-based",
    description: "Each spoken word pops and scales up with a snappy spring when reached.",
    badge: "🎈 Pop",
  },
  {
    id: "glow-tracker",
    name: "Glow Tracker",
    category: "word-based",
    description: "The active spoken word emits an ambient glowing light bloom.",
    badge: "🌟 Glow",
  },
  {
    id: "reading-ruler",
    name: "Reading Ruler",
    category: "phrase-line",
    description: "An illuminated horizontal ruler bar glides along with the active line.",
    badge: "📐 Ruler",
  },
  {
    id: "bionic-reading",
    name: "Bionic Reading",
    category: "document-based",
    description: "First half of each word is bolded for fast cognitive fixation with active tracker.",
    badge: "🧠 Bionic",
  },
  {
    id: "multilang-read",
    name: "Multi-Language Read-Along",
    category: "translation-based",
    description: "Original scripture and translation move together with synchronized highlighting.",
    badge: "🌐 Multi-Lang",
    isTranslation: true,
  },
];

/**
 * Render lyrics or speech text with requested animation
 */
export function renderAnimatedLyrics({
  text = "",
  translation = "",
  currentWordIndex = -1,
  animationType = "karaoke",
  style = {},
  isSingAlong = true,
  enableWordTracking = true,
  sectionType = "verse",
  sectionLabel = "",
}) {
  if (!text) return null;

  if (!enableWordTracking || currentWordIndex < -1) {
    if (animationType === "call-response") {
      return renderCallAndResponse(text, currentWordIndex, false);
    }
    if ((animationType === "split-translation" || animationType === "dual-language" || animationType === "interlinear" || animationType === "multilang-read") && translation) {
      return renderDualLanguageView(text, translation, -1, animationType);
    }
    if (animationType === "bionic-reading") {
      return renderBionicReading(text, -1);
    }
    return text;
  }

  const effectiveAnim = animationType || (isSingAlong ? "karaoke" : "word-highlight");

  switch (effectiveAnim) {
    // ─── Sing-Along Specific & Shared ──────────────────────────────────────
    case "line-reveal":
      return renderLineByLineReveal(text, currentWordIndex);

    case "word-reveal":
      return renderWordByWordReveal(text, currentWordIndex);

    case "progressive-fill":
      return renderProgressiveFill(text, currentWordIndex);

    case "bounce":
      return renderBouncingWord(text, currentWordIndex);

    case "underline":
    case "underline-tracker":
      return renderUnderlineTracker(text, currentWordIndex);

    case "glow":
    case "glow-tracker":
      return renderGlowingWord(text, currentWordIndex);

    case "color-shift":
      return renderColorShift(text, currentWordIndex);

    case "scroll":
    case "auto-scroll":
      return renderScrollingLyrics(text, currentWordIndex);

    case "typewriter":
    case "typewriter-read":
      return renderTypewriter(text, currentWordIndex);

    case "fade":
      return renderFadeAnimation(text, currentWordIndex);

    case "slide":
      return renderSlideAnimation(text, currentWordIndex);

    case "split-translation":
    case "dual-language":
    case "phrase-translation":
    case "interlinear":
      return renderDualLanguageView(text, translation, currentWordIndex, effectiveAnim);

    case "translation-switch":
      return renderTranslationSwitch(text, translation, currentWordIndex);

    case "call-response":
      return renderCallAndResponse(text, currentWordIndex, true);

    case "section-animation":
      return renderSectionStyledLyrics(text, currentWordIndex, sectionType, sectionLabel);

    case "beat-sync":
      return renderBeatSyncLyrics(text, currentWordIndex);

    // ─── Read-Along Specific Modes ─────────────────────────────────────────
    case "word-highlight":
      return renderWordHighlight(text, currentWordIndex);

    case "phrase-highlight":
      return renderPhraseHighlight(text, currentWordIndex);

    case "line-highlight":
      return renderLineHighlight(text, currentWordIndex);

    case "sentence-highlight":
      return renderSentenceHighlight(text, currentWordIndex);

    case "karaoke-text":
      return renderKaraokeHighlight(text, currentWordIndex);

    case "reading-cursor":
      return renderReadingCursor(text, currentWordIndex);

    case "spotlight":
      return renderSpotlightReading(text, currentWordIndex);

    case "focus-window":
      return renderFocusWindow(text, currentWordIndex);

    case "center-line":
      return renderCenterLineReading(text, currentWordIndex);

    case "fade-previous":
      return renderFadePreviousText(text, currentWordIndex);

    case "dim-and-focus":
      return renderDimAndFocus(text, currentWordIndex);

    case "word-pop":
      return renderWordPop(text, currentWordIndex);

    case "reading-ruler":
      return renderReadingRuler(text, currentWordIndex);

    case "bionic-reading":
      return renderBionicReading(text, currentWordIndex);

    case "multilang-read":
      return renderDualLanguageView(text, translation, currentWordIndex, "dual-language");

    case "karaoke":
    default:
      return isSingAlong
        ? renderKaraokeHighlight(text, currentWordIndex)
        : renderWordHighlight(text, currentWordIndex);
  }
}

// ─── 1. Word Highlight (Read-Along Default) ────────────────────────────────

function renderWordHighlight(text, currentWordIndex) {
  const segments = text.split(/(\s+)/);
  let wordCounter = 0;

  return segments.map((seg, idx) => {
    if (/^\s+$/.test(seg)) return <span key={idx}>{seg}</span>;

    const tokenIdx = wordCounter++;
    const isRead = tokenIdx <= currentWordIndex;
    const isActive = tokenIdx === currentWordIndex + 1;

    return (
      <span
        key={idx}
        className={`transition-all duration-150 inline-block ${
          isActive
            ? "text-amber-300 font-bold bg-amber-500/20 px-1 py-0.5 rounded shadow-[0_0_10px_rgba(252,211,77,0.5)] ring-1 ring-amber-400/40"
            : isRead
            ? "text-white font-semibold"
            : "text-white/45"
        }`}
      >
        {seg}
      </span>
    );
  });
}

// ─── 2. Phrase Highlight (3-4 Word Chunking) ───────────────────────────────

function renderPhraseHighlight(text, currentWordIndex) {
  const words = text.split(/\s+/).filter(Boolean);
  const activePhraseIdx = Math.floor((currentWordIndex + 1) / 3);
  let wordCounter = 0;

  const segments = text.split(/(\s+)/);
  return segments.map((seg, idx) => {
    if (/^\s+$/.test(seg)) return <span key={idx}>{seg}</span>;

    const tokenIdx = wordCounter++;
    const phraseIdx = Math.floor(tokenIdx / 3);
    const isCurrentPhrase = phraseIdx === activePhraseIdx;
    const isPastPhrase = phraseIdx < activePhraseIdx;

    return (
      <span
        key={idx}
        className={`transition-all duration-200 inline-block ${
          isCurrentPhrase
            ? "text-cyan-200 font-bold bg-cyan-500/20 px-1 py-0.5 rounded-md shadow-[0_0_12px_rgba(34,211,238,0.4)]"
            : isPastPhrase
            ? "text-white/90 font-medium"
            : "text-white/35"
        }`}
      >
        {seg}
      </span>
    );
  });
}

// ─── 3. Line Highlight ─────────────────────────────────────────────────────

function renderLineHighlight(text, currentWordIndex) {
  const lines = text.split("\n");
  const targetWordIndex = currentWordIndex + 1;
  let wordCounter = 0;

  return (
    <div className="flex flex-col gap-2.5 w-full">
      {lines.map((line, lIdx) => {
        const lineWords = line.trim().split(/\s+/).filter(Boolean);
        const lineStartWord = wordCounter;
        const lineEndWord = wordCounter + lineWords.length - 1;
        wordCounter += lineWords.length;

        // Immediate advance: As soon as previous line finishes, targetWordIndex lands on next line
        const isCurrentLine = targetWordIndex >= lineStartWord && targetWordIndex <= lineEndWord;

        return (
          <div
            key={lIdx}
            className={`transition-all duration-300 rounded-xl px-3 py-1 ${
              isCurrentLine
                ? "bg-white/10 text-white font-bold shadow-lg border border-white/15 scale-[1.02]"
                : "text-white/30 opacity-40 scale-95"
            }`}
          >
            {renderWordHighlight(line, currentWordIndex - lineStartWord)}
          </div>
        );
      })}
    </div>
  );
}

// ─── 4. Sentence Highlight ─────────────────────────────────────────────────

function renderSentenceHighlight(text, currentWordIndex) {
  const sentences = text.match(/[^.!?]+[.!?]+|\s*[^.!?]+$/g) || [text];
  const targetWordIndex = currentWordIndex + 1;
  let wordCounter = 0;

  return (
    <span className="leading-relaxed">
      {sentences.map((sentence, sIdx) => {
        const sWords = sentence.trim().split(/\s+/).filter(Boolean);
        const sStart = wordCounter;
        const sEnd = wordCounter + sWords.length - 1;
        wordCounter += sWords.length;

        const isCurrent = targetWordIndex >= sStart && targetWordIndex <= sEnd;
        const isPast = currentWordIndex > sEnd;

        return (
          <span
            key={sIdx}
            className={`transition-all duration-300 inline ${
              isCurrent
                ? "text-white font-bold bg-amber-400/15 rounded px-1.5 py-0.5 border border-amber-400/30 shadow-[0_0_15px_rgba(251,191,36,0.25)]"
                : isPast
                ? "text-white/80"
                : "text-white/35"
            }`}
          >
            {sentence}
          </span>
        );
      })}
    </span>
  );
}

// ─── 5. Reading Cursor (Text Editor Cursor) ────────────────────────────────

function renderReadingCursor(text, currentWordIndex) {
  const segments = text.split(/(\s+)/);
  let wordCounter = 0;

  return segments.map((seg, idx) => {
    if (/^\s+$/.test(seg)) return <span key={idx}>{seg}</span>;

    const tokenIdx = wordCounter++;
    const isRead = tokenIdx <= currentWordIndex;
    const isActive = tokenIdx === currentWordIndex + 1;

    return (
      <span key={idx} className="relative inline-block">
        <span className={isRead ? "text-white font-semibold" : isActive ? "text-amber-300 font-bold" : "text-white/40"}>
          {seg}
        </span>
        {isActive && (
          <span className="inline-block w-0.5 h-[1.1em] bg-amber-400 align-middle ml-0.5 animate-pulse shadow-[0_0_8px_rgba(251,191,36,1)]" />
        )}
      </span>
    );
  });
}

// ─── 6. Spotlight Reading ──────────────────────────────────────────────────

function renderSpotlightReading(text, currentWordIndex) {
  const segments = text.split(/(\s+)/);
  let wordCounter = 0;

  return (
    <div className="relative w-full">
      {segments.map((seg, idx) => {
        if (/^\s+$/.test(seg)) return <span key={idx}>{seg}</span>;

        const tokenIdx = wordCounter++;
        const dist = Math.abs(tokenIdx - (currentWordIndex + 1));
        const isSpot = dist === 0;
        const isNear = dist <= 2;

        return (
          <span
            key={idx}
            className={`transition-all duration-300 inline-block ${
              isSpot
                ? "text-white font-extrabold scale-110 drop-shadow-[0_0_18px_rgba(255,255,255,0.9)] bg-white/20 px-1.5 py-0.5 rounded-lg"
                : isNear
                ? "text-white/70 font-medium"
                : "text-white/15 opacity-30"
            }`}
          >
            {seg}
          </span>
        );
      })}
    </div>
  );
}

// ─── 7. Focus Window ───────────────────────────────────────────────────────

function renderFocusWindow(text, currentWordIndex) {
  const lines = text.split("\n");
  const targetWordIndex = currentWordIndex + 1;
  let wordCounter = 0;

  return (
    <div className="flex flex-col gap-3 w-full">
      {lines.map((line, lIdx) => {
        const lineWords = line.trim().split(/\s+/).filter(Boolean);
        const lineStartWord = wordCounter;
        const lineEndWord = wordCounter + lineWords.length - 1;
        wordCounter += lineWords.length;

        // Immediate advance to next line upon completing previous line
        const isCurrentLine = targetWordIndex >= lineStartWord && targetWordIndex <= lineEndWord;

        return (
          <div
            key={lIdx}
            className={`transition-all duration-400 rounded-2xl p-3 relative ${
              isCurrentLine
                ? "bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-blue-600/20 border-2 border-cyan-400/50 shadow-[0_0_25px_rgba(34,211,238,0.25)] text-white font-bold scale-100"
                : "text-white/25 opacity-30 scale-95 border border-transparent"
            }`}
          >
            {renderWordHighlight(line, currentWordIndex - lineStartWord)}
          </div>
        );
      })}
    </div>
  );
}

// ─── 8. Center-Line Reading ────────────────────────────────────────────────

function renderCenterLineReading(text, currentWordIndex) {
  const lines = text.split("\n");
  const targetWordIndex = currentWordIndex + 1;
  let wordCounter = 0;
  let activeLineIdx = 0;

  lines.forEach((line, idx) => {
    const count = line.trim().split(/\s+/).filter(Boolean).length;
    const start = wordCounter;
    if (targetWordIndex >= start) {
      activeLineIdx = idx;
    }
    wordCounter += count;
  });

  return (
    <div
      className="flex flex-col gap-4 w-full transition-transform duration-500 ease-out text-center"
      style={{ transform: `translateY(-${Math.max(0, activeLineIdx - 1) * 28}px)` }}
    >
      {lines.map((line, idx) => {
        const isCurrent = idx === activeLineIdx;
        return (
          <div
            key={idx}
            className={`transition-all duration-300 ${
              isCurrent
                ? "text-amber-300 font-bold scale-110 drop-shadow-lg"
                : "text-white/30 font-normal scale-90 opacity-40"
            }`}
          >
            {line}
          </div>
        );
      })}
    </div>
  );
}

// ─── 9. Fade Previous Text ─────────────────────────────────────────────────

function renderFadePreviousText(text, currentWordIndex) {
  const segments = text.split(/(\s+)/);
  let wordCounter = 0;

  return segments.map((seg, idx) => {
    if (/^\s+$/.test(seg)) return <span key={idx}>{seg}</span>;

    const tokenIdx = wordCounter++;
    const isPast = tokenIdx < currentWordIndex - 3;
    const isCurrent = tokenIdx >= currentWordIndex - 3 && tokenIdx <= currentWordIndex + 1;

    return (
      <span
        key={idx}
        className={`transition-opacity duration-300 inline-block ${
          isCurrent
            ? "opacity-100 text-white font-bold"
            : isPast
            ? "opacity-25 text-white/40"
            : "opacity-40 text-white/30"
        }`}
      >
        {seg}
      </span>
    );
  });
}

// ─── 10. Dim-and-Focus ─────────────────────────────────────────────────────

function renderDimAndFocus(text, currentWordIndex) {
  const segments = text.split(/(\s+)/);
  let wordCounter = 0;

  return segments.map((seg, idx) => {
    if (/^\s+$/.test(seg)) return <span key={idx}>{seg}</span>;

    const tokenIdx = wordCounter++;
    const isFocus = tokenIdx === currentWordIndex + 1;

    return (
      <span
        key={idx}
        className={`transition-all duration-200 inline-block ${
          isFocus
            ? "opacity-100 text-cyan-300 font-extrabold scale-115 drop-shadow-[0_0_15px_rgba(34,211,238,0.8)]"
            : "opacity-20 text-white/40 scale-95"
        }`}
      >
        {seg}
      </span>
    );
  });
}

// ─── 11. Word Pop ──────────────────────────────────────────────────────────

function renderWordPop(text, currentWordIndex) {
  const segments = text.split(/(\s+)/);
  let wordCounter = 0;

  return segments.map((seg, idx) => {
    if (/^\s+$/.test(seg)) return <span key={idx}>{seg}</span>;

    const tokenIdx = wordCounter++;
    const isPop = tokenIdx === currentWordIndex + 1;
    const isRead = tokenIdx <= currentWordIndex;

    return (
      <span
        key={idx}
        className={`transition-all duration-150 inline-block ${
          isPop
            ? "text-emerald-300 font-extrabold scale-125 -translate-y-1 drop-shadow-[0_0_14px_rgba(110,231,183,0.9)]"
            : isRead
            ? "text-white font-semibold"
            : "text-white/40"
        }`}
      >
        {seg}
      </span>
    );
  });
}

// ─── 12. Reading Ruler (Illuminated Guide Bar) ─────────────────────────────

function renderReadingRuler(text, currentWordIndex) {
  const lines = text.split("\n");
  const targetWordIndex = currentWordIndex + 1;
  let wordCounter = 0;

  return (
    <div className="flex flex-col gap-2.5 w-full">
      {lines.map((line, lIdx) => {
        const lineWords = line.trim().split(/\s+/).filter(Boolean);
        const lineStartWord = wordCounter;
        const lineEndWord = wordCounter + lineWords.length - 1;
        wordCounter += lineWords.length;

        // Immediate advance to next line upon finishing previous line
        const isCurrentLine = targetWordIndex >= lineStartWord && targetWordIndex <= lineEndWord;

        return (
          <div
            key={lIdx}
            className={`relative transition-all duration-300 px-3 py-1 rounded-xl ${
              isCurrentLine
                ? "bg-amber-500/15 border-l-4 border-amber-400 text-white font-bold shadow-md scale-[1.01]"
                : "text-white/40 opacity-40 scale-95"
            }`}
          >
            {renderWordHighlight(line, currentWordIndex - lineStartWord)}
          </div>
        );
      })}
    </div>
  );
}

// ─── 13. Bionic Reading ────────────────────────────────────────────────────

function renderBionicReading(text, currentWordIndex) {
  const segments = text.split(/(\s+)/);
  let wordCounter = 0;

  return segments.map((seg, idx) => {
    if (/^\s+$/.test(seg)) return <span key={idx}>{seg}</span>;

    const tokenIdx = wordCounter++;
    const isActive = tokenIdx === currentWordIndex + 1;
    const isRead = tokenIdx <= currentWordIndex;

    const mid = Math.ceil(seg.length / 2);
    const head = seg.slice(0, mid);
    const tail = seg.slice(mid);

    return (
      <span
        key={idx}
        className={`inline-block transition-all duration-150 ${
          isActive
            ? "text-amber-300 font-extrabold scale-110 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]"
            : isRead
            ? "text-white"
            : "text-white/50"
        }`}
      >
        <span className="font-extrabold text-white">{head}</span>
        <span className="font-normal opacity-80">{tail}</span>
      </span>
    );
  });
}

// ─── Shared Base Highlight / Karaoke Renderers ─────────────────────────────

function renderKaraokeHighlight(text, currentWordIndex) {
  const segments = text.split(/(\s+)/);
  let wordCounter = 0;

  return segments.map((seg, idx) => {
    if (/^\s+$/.test(seg)) return <span key={idx}>{seg}</span>;

    const tokenIdx = wordCounter++;
    const isRead = tokenIdx <= currentWordIndex;
    const isActive = tokenIdx === currentWordIndex + 1;

    return (
      <span
        key={idx}
        className={`transition-all duration-200 inline-block ${
          isActive
            ? "text-cyan-300 font-bold underline decoration-cyan-400 decoration-2 underline-offset-4 scale-[1.04] drop-shadow-[0_0_12px_rgba(34,211,238,0.8)]"
            : isRead
            ? "text-white font-semibold"
            : "text-white/35"
        }`}
      >
        {seg}
      </span>
    );
  });
}

function renderLineByLineReveal(text, currentWordIndex) {
  const lines = text.split("\n");
  let wordCounter = 0;

  return (
    <div className="flex flex-col gap-2 w-full">
      {lines.map((line, lIdx) => {
        const lineWords = line.trim().split(/\s+/).filter(Boolean);
        const lineStartWord = wordCounter;
        const lineEndWord = wordCounter + lineWords.length - 1;
        wordCounter += lineWords.length;

        const isLineReached = currentWordIndex >= lineStartWord - 1;
        const isCurrentLine = currentWordIndex >= lineStartWord - 1 && currentWordIndex <= lineEndWord;

        return (
          <div
            key={lIdx}
            className={`transition-all duration-500 ease-out ${
              isCurrentLine
                ? "opacity-100 scale-100 text-white font-bold translate-y-0"
                : isLineReached
                ? "opacity-80 scale-[0.98] text-white/80"
                : "opacity-15 scale-95 text-white/20 translate-y-2"
            }`}
          >
            {renderKaraokeHighlight(line, currentWordIndex - lineStartWord)}
          </div>
        );
      })}
    </div>
  );
}

function renderWordByWordReveal(text, currentWordIndex) {
  const segments = text.split(/(\s+)/);
  let wordCounter = 0;

  return segments.map((seg, idx) => {
    if (/^\s+$/.test(seg)) return <span key={idx}>{seg}</span>;

    const tokenIdx = wordCounter++;
    const isVisible = tokenIdx <= currentWordIndex + 1;
    const isActive = tokenIdx === currentWordIndex + 1;

    return (
      <span
        key={idx}
        className={`transition-all duration-300 inline-block ${
          isActive
            ? "opacity-100 text-amber-300 font-bold scale-110 drop-shadow-[0_0_14px_rgba(252,211,77,0.9)] animate-in zoom-in-90"
            : isVisible
            ? "opacity-100 text-white font-semibold"
            : "opacity-0 scale-75 pointer-events-none"
        }`}
      >
        {seg}
      </span>
    );
  });
}

function renderProgressiveFill(text, currentWordIndex) {
  const words = text.split(/\s+/).filter(Boolean);
  const total = Math.max(1, words.length);
  const ratio = Math.min(1, Math.max(0, (currentWordIndex + 1) / total));
  const pct = Math.round(ratio * 100);

  return (
    <div className="relative inline-block w-full text-center">
      <div className="text-white/25 select-none font-semibold">
        {text}
      </div>
      <div
        className="absolute inset-0 text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-cyan-300 to-emerald-300 font-bold select-none transition-all duration-200"
        style={{
          clipPath: `polygon(0 0, ${pct}% 0, ${pct}% 100%, 0 100%)`,
        }}
      >
        {text}
      </div>
    </div>
  );
}

function renderBouncingWord(text, currentWordIndex) {
  const segments = text.split(/(\s+)/);
  let wordCounter = 0;

  return segments.map((seg, idx) => {
    if (/^\s+$/.test(seg)) return <span key={idx}>{seg}</span>;

    const tokenIdx = wordCounter++;
    const isRead = tokenIdx <= currentWordIndex;
    const isActive = tokenIdx === currentWordIndex + 1;

    return (
      <span
        key={idx}
        className={`transition-all duration-200 inline-block ${
          isActive
            ? "text-yellow-300 font-bold -translate-y-2 scale-125 drop-shadow-[0_0_16px_rgba(253,224,71,0.9)] animate-bounce"
            : isRead
            ? "text-white font-semibold"
            : "text-white/35"
        }`}
      >
        {seg}
      </span>
    );
  });
}

function renderUnderlineTracker(text, currentWordIndex) {
  const segments = text.split(/(\s+)/);
  let wordCounter = 0;

  return segments.map((seg, idx) => {
    if (/^\s+$/.test(seg)) return <span key={idx}>{seg}</span>;

    const tokenIdx = wordCounter++;
    const isRead = tokenIdx <= currentWordIndex;
    const isActive = tokenIdx === currentWordIndex + 1;

    return (
      <span
        key={idx}
        className={`relative inline-block transition-all duration-200 pb-1.5 ${
          isActive
            ? "text-cyan-200 font-bold"
            : isRead
            ? "text-white font-semibold"
            : "text-white/40"
        }`}
      >
        {seg}
        {isActive && (
          <span className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-400 via-emerald-400 to-cyan-400 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,211,238,1)]" />
        )}
      </span>
    );
  });
}

function renderGlowingWord(text, currentWordIndex) {
  const segments = text.split(/(\s+)/);
  let wordCounter = 0;

  return segments.map((seg, idx) => {
    if (/^\s+$/.test(seg)) return <span key={idx}>{seg}</span>;

    const tokenIdx = wordCounter++;
    const isRead = tokenIdx <= currentWordIndex;
    const isActive = tokenIdx === currentWordIndex + 1;

    return (
      <span
        key={idx}
        className={`transition-all duration-200 inline-block ${
          isActive
            ? "text-white font-extrabold scale-110 drop-shadow-[0_0_20px_rgba(255,255,255,1)] drop-shadow-[0_0_35px_rgba(56,189,248,0.9)]"
            : isRead
            ? "text-white/90 font-semibold"
            : "text-white/30"
        }`}
      >
        {seg}
      </span>
    );
  });
}

function renderColorShift(text, currentWordIndex) {
  const segments = text.split(/(\s+)/);
  let wordCounter = 0;

  return segments.map((seg, idx) => {
    if (/^\s+$/.test(seg)) return <span key={idx}>{seg}</span>;

    const tokenIdx = wordCounter++;
    const isRead = tokenIdx <= currentWordIndex;
    const isActive = tokenIdx === currentWordIndex + 1;

    return (
      <span
        key={idx}
        className={`transition-all duration-300 inline-block ${
          isActive
            ? "text-emerald-300 font-extrabold scale-105 drop-shadow-[0_0_12px_rgba(110,231,183,0.8)]"
            : isRead
            ? "text-amber-200 font-semibold"
            : "text-white/35"
        }`}
      >
        {seg}
      </span>
    );
  });
}

function renderScrollingLyrics(text, currentWordIndex) {
  const lines = text.split("\n");
  const targetWordIndex = currentWordIndex + 1;
  let wordCounter = 0;

  let activeLineIdx = 0;
  lines.forEach((line, idx) => {
    const count = line.trim().split(/\s+/).filter(Boolean).length;
    const start = wordCounter;
    if (targetWordIndex >= start) {
      activeLineIdx = idx;
    }
    wordCounter += count;
  });

  wordCounter = 0;

  return (
    <div className="flex flex-col gap-4 w-full transition-transform duration-500 ease-out text-center" style={{ transform: `translateY(-${Math.max(0, activeLineIdx - 1) * 28}px)` }}>
      {lines.map((line, idx) => {
        const lineWords = line.trim().split(/\s+/).filter(Boolean);
        const lineStartWord = wordCounter;
        wordCounter += lineWords.length;
        const isCurrent = idx === activeLineIdx;

        return (
          <div
            key={idx}
            className={`transition-all duration-300 ${
              isCurrent
                ? "text-cyan-300 font-bold scale-105 drop-shadow-md"
                : "text-white/40 font-normal scale-95 opacity-40"
            }`}
          >
            {isCurrent
              ? renderKaraokeHighlight(line, currentWordIndex - lineStartWord)
              : line}
          </div>
        );
      })}
    </div>
  );
}

function renderTypewriter(text, currentWordIndex) {
  const words = text.split(/\s+/).filter(Boolean);
  const total = Math.max(1, words.length);
  const charRatio = Math.min(1, Math.max(0, (currentWordIndex + 1) / total));
  const visibleChars = Math.round(charRatio * text.length);

  return (
    <span className="font-mono">
      <span className="text-white font-bold">{text.slice(0, visibleChars)}</span>
      <span className="animate-pulse text-cyan-400 font-extrabold">|</span>
      <span className="opacity-0">{text.slice(visibleChars)}</span>
    </span>
  );
}

function renderFadeAnimation(text, currentWordIndex) {
  const segments = text.split(/(\s+)/);
  let wordCounter = 0;

  return segments.map((seg, idx) => {
    if (/^\s+$/.test(seg)) return <span key={idx}>{seg}</span>;

    const tokenIdx = wordCounter++;
    const isPast = tokenIdx < currentWordIndex - 2;
    const isCurrent = tokenIdx >= currentWordIndex - 2 && tokenIdx <= currentWordIndex + 1;

    return (
      <span
        key={idx}
        className={`transition-opacity duration-500 inline-block ${
          isCurrent
            ? "opacity-100 text-white font-bold"
            : isPast
            ? "opacity-30 text-white/40"
            : "opacity-15 text-white/20"
        }`}
      >
        {seg}
      </span>
    );
  });
}

function renderSlideAnimation(text, currentWordIndex) {
  return (
    <div className="animate-in slide-in-from-bottom-8 duration-500 ease-out">
      {renderKaraokeHighlight(text, currentWordIndex)}
    </div>
  );
}

function renderDualLanguageView(text, translation, currentWordIndex, mode) {
  const origLines = text.split("\n");
  const transLines = (translation || "").split("\n");

  if (mode === "split-translation") {
    return (
      <div className="flex flex-col gap-6 w-full items-center justify-center">
        <div className="w-full text-center">
          <div className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold mb-1 opacity-60">Original</div>
          <div className="leading-relaxed">
            {renderKaraokeHighlight(text, currentWordIndex)}
          </div>
        </div>

        <div className="w-24 h-px bg-white/20 my-1" />

        <div className="w-full text-center">
          <div className="text-[10px] uppercase tracking-widest text-amber-400 font-bold mb-1 opacity-60">Translation</div>
          <div className="text-amber-200/90 italic font-medium leading-relaxed">
            {translation || "— Translated lyrics —"}
          </div>
        </div>
      </div>
    );
  }

  if (mode === "interlinear" || mode === "phrase-translation") {
    return (
      <div className="flex flex-col gap-4 w-full">
        {origLines.map((line, idx) => {
          const transLine = transLines[idx] || "";
          return (
            <div key={idx} className="flex flex-col items-center gap-1">
              <div className="text-white font-bold leading-tight">
                {renderKaraokeHighlight(line, currentWordIndex)}
              </div>
              {transLine && (
                <div className="text-amber-300/80 text-[0.85em] italic font-medium bg-amber-500/10 px-3 py-0.5 rounded-full border border-amber-500/20">
                  {transLine}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 w-full">
      {origLines.map((line, idx) => {
        const transLine = transLines[idx] || "";
        return (
          <div key={idx} className="flex flex-col items-center gap-0.5">
            <div className="text-white font-bold">
              {renderKaraokeHighlight(line, currentWordIndex)}
            </div>
            {transLine && (
              <div className="text-cyan-300/80 text-[0.8em] font-medium tracking-wide">
                {transLine}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function renderTranslationSwitch(text, translation, currentWordIndex) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="leading-relaxed">
        {renderKaraokeHighlight(text, currentWordIndex)}
      </div>
      {translation && (
        <div className="text-sm font-medium text-amber-300/90 italic mt-2 animate-in fade-in duration-300">
          🗣️ {translation}
        </div>
      )}
    </div>
  );
}

function renderCallAndResponse(text, currentWordIndex, isTracking) {
  const lines = text.split("\n");
  let wordCounter = 0;

  return (
    <div className="flex flex-col gap-3 w-full">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        const isResponse = /^(response|r:|congregation|\()/i.test(trimmed);
        const isLeader = /^(leader|l:|solo|cantor)/i.test(trimmed);

        const cleanText = trimmed.replace(/^(leader|response|l:|r:|congregation):\s*/i, "");
        const lineWords = cleanText.split(/\s+/).filter(Boolean);
        const lineStartWord = wordCounter;
        wordCounter += lineWords.length;

        return (
          <div
            key={idx}
            className={`flex items-center justify-center gap-2.5 rounded-xl px-3 py-1 transition-all ${
              isResponse
                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 italic"
                : isLeader
                ? "bg-amber-500/10 border border-amber-500/20 text-amber-200 font-bold"
                : "text-white"
            }`}
          >
            {(isLeader || isResponse) && (
              <span className={`text-[9px] uppercase font-mono font-bold px-1.5 py-0.5 rounded ${
                isResponse ? "bg-emerald-500/30 text-emerald-300" : "bg-amber-500/30 text-amber-300"
              }`}>
                {isResponse ? "All" : "Leader"}
              </span>
            )}
            <span className="leading-tight">
              {isTracking ? renderKaraokeHighlight(cleanText, currentWordIndex - lineStartWord) : cleanText}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function renderSectionStyledLyrics(text, currentWordIndex, sectionType = "verse", sectionLabel = "") {
  const isChorus = sectionType === "chorus" || /chorus/i.test(sectionLabel);
  const isBridge = sectionType === "bridge" || /bridge/i.test(sectionLabel);

  return (
    <div className={`p-4 rounded-2xl border transition-all duration-300 w-full flex flex-col items-center gap-2 ${
      isChorus
        ? "bg-purple-500/10 border-purple-500/40 shadow-[0_0_30px_rgba(168,85,247,0.2)] ring-1 ring-purple-500/30"
        : isBridge
        ? "bg-amber-500/10 border-amber-500/40 shadow-[0_0_30px_rgba(245,158,11,0.2)] ring-1 ring-amber-500/30"
        : "bg-white/5 border-white/10"
    }`}>
      {sectionLabel && (
        <span className={`text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full ${
          isChorus
            ? "bg-purple-500/30 text-purple-200 border border-purple-500/50"
            : isBridge
            ? "bg-amber-500/30 text-amber-200 border border-amber-500/50"
            : "bg-white/10 text-white/60"
        }`}>
          ● {sectionLabel}
        </span>
      )}
      <div className="w-full text-center">
        {renderKaraokeHighlight(text, currentWordIndex)}
      </div>
    </div>
  );
}

function renderBeatSyncLyrics(text, currentWordIndex) {
  const segments = text.split(/(\s+)/);
  let wordCounter = 0;

  return segments.map((seg, idx) => {
    if (/^\s+$/.test(seg)) return <span key={idx}>{seg}</span>;

    const tokenIdx = wordCounter++;
    const isRead = tokenIdx <= currentWordIndex;
    const isActive = tokenIdx === currentWordIndex + 1;

    return (
      <span
        key={idx}
        className={`transition-all duration-150 inline-block ${
          isActive
            ? "text-cyan-300 font-extrabold scale-125 animate-pulse drop-shadow-[0_0_16px_rgba(34,211,238,1)]"
            : isRead
            ? "text-white font-semibold"
            : "text-white/35"
        }`}
      >
        {seg}
      </span>
    );
  });
}
