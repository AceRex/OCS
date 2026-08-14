import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  PiMicrophoneFill,
  PiStopFill,
  PiClockFill,
  PiMonitorFill,
  PiSpeakerHighFill,
  PiMagicWandFill,
  PiTrash,
  PiCheckCircle,
  PiImage,
  PiCaretUpBold,
  PiPulse,
  PiWaveform,
  PiQuotesFill,
  PiCalendarBlankFill,
} from "react-icons/pi";
import {
  smartBibleMatch,
  isLikelyBibleReference,
  hasReferenceShape,
  matchReferenceShape,
  wordNumbersToDigits,
  extractScriptureCore,
} from "./smartBibleMatch";
import { emitPipelineTrace } from "./voicePipelineTrace";
import { utilAction } from "../../Redux/state.jsx";
import MiniPreview from "./MiniPreview";
import { Button, DisabledContainer } from "../../../components";

// CJS corrector (JSON vocab) — display-only Tier 1
const { correctLiveTranscript } = require("./liveTranscriptCorrector");
const {
  tokenizePassage,
  advanceReadAlong,
  buildReadAlongPayload,
  formatRangeStep,
  isAtVerseEnd,
  stripHtml,
} = require("./scriptureReadAlong");

// Module-level constants — defined once, not per-render
// Prefer specific phrases over bare "next"/"back" to avoid sermon false-fires
// Never match "next to …" (preposition) — e.g. "next to us" must not fire next_verse
const OCS_COMMANDS = [
  {
    patterns: [
      /\bnext\s+verse\b/i,
      /\bgo\s+(?:to\s+)?(?:the\s+)?next\s+verse\b/i,
      /\bnext\s+please\b/i,
    ],
    label: "Next Verse",
    action: "next_verse",
  },
  {
    patterns: [
      /\bprevious\s+verse\b/i,
      /\bprev\s+verse\b/i,
      /\bgo\s+back\b/i,
      /\bprevious\s+please\b/i,
    ],
    label: "Previous Verse",
    action: "prev_verse",
  },
  {
    patterns: [
      /\bblack\s+screen\b/i,
      /\bblank\s+screen\b/i,
      /\bblanche\s+screen\b/i,
      /\bblunk\s+screen\b/i,
      /\bclick\s+screen\b/i,
      /\bclear\s+screen\b/i,
      /\bscreen\s+off\b/i,
    ],
    label: "Black Screen",
    action: "black_screen",
  },
  {
    patterns: [/\bscreen\s+on\b/i, /\bshow\s+screen\b/i],
    label: "Screen On",
    action: "screen_on",
  },
  {
    patterns: [
      /\bfirst\s+verse\b/i,
      /\bchapter\s+start\b/i,
      /\bstart\s+of\s+(?:the\s+)?chapter\b/i,
    ],
    label: "First Verse",
    action: "first_verse",
  },
  {
    patterns: [/\blast\s+verse\b/i, /\bend\s+of\s+(?:the\s+)?chapter\b/i],
    label: "Last Verse",
    action: "last_verse",
  },
  {
    patterns: [/\bset\s+timer\b/i, /\bstart\s+timer\b/i, /\btimer\s+for\b/i],
    label: "Set Timer",
    action: "set_timer",
  },
  {
    patterns: [/\bstop\s+timer\b/i, /\bcancel\s+timer\b/i, /\bend\s+timer\b/i],
    label: "Stop Timer",
    action: "stop_timer",
  },
];

const TRANSLATION_DEFINITIONS = [
  { keys: ['niv', 'n i v', 'new international version', 'new international', 'an eye vee'], dbVersion: 'net', label: 'NIV' },
  { keys: ['amp', 'a m p', 'amplified bible', 'amplified version', 'amplified', 'amped'], dbVersion: 'amp', label: 'AMP' },
  { keys: ['kjv', 'k j v', 'king james version', 'king james'], dbVersion: 'kjv', label: 'KJV' },
  { keys: ['nkjv', 'n k j v', 'new king james version', 'new king james'], dbVersion: 'kjvpce', label: 'NKJV' },
  { keys: ['esv', 'e s v', 'english standard version', 'english standard'], dbVersion: 'asv', label: 'ESV' },
  { keys: ['nlt', 'n l t', 'new living translation', 'new living'], dbVersion: 'bbe', label: 'NLT' },
  { keys: ['asv', 'a s v', 'american standard version', 'american standard'], dbVersion: 'asv', label: 'ASV' },
  { keys: ['net', 'n e t', 'new english translation', 'net bible'], dbVersion: 'net', label: 'NET' },
  { keys: ['bbe', 'b b e', 'basic english', 'bible in basic english'], dbVersion: 'bbe', label: 'BBE' },
  { keys: ['web', 'world english bible', 'world english'], dbVersion: 'web', label: 'WEB' },
  { keys: ['msg', 'the message', 'message version', 'message bible', 'message'], dbVersion: 'web', label: 'MSG' },
  { keys: ['csb', 'christian standard bible', 'christian standard'], dbVersion: 'net', label: 'CSB' },
  { keys: ['nasb', 'new american standard bible', 'new american standard'], dbVersion: 'asv', label: 'NASB' },
  { keys: ['rsv', 'revised standard version', 'revised standard'], dbVersion: 'asv', label: 'RSV' },
  { keys: ['geneva', 'geneva bible'], dbVersion: 'geneva', label: 'Geneva' },
  { keys: ['tyndale', 'tyndale bible'], dbVersion: 'tyndale', label: 'Tyndale' },
  { keys: ['coverdale', 'coverdale bible'], dbVersion: 'coverdale', label: 'Coverdale' },
  { keys: ['bishops', 'bishops bible'], dbVersion: 'bishops', label: 'Bishops' },
];

function findTranslationByToken(tokenStr) {
  if (!tokenStr) return null;
  const clean = tokenStr
    .toLowerCase()
    .replace(/\b(?:the|version|translation|bible|please|now|it|this|that|in|to)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const def of TRANSLATION_DEFINITIONS) {
    for (const k of def.keys) {
      if (clean === k || clean.startsWith(k + ' ') || clean.endsWith(' ' + k)) {
        return def;
      }
    }
  }
  return null;
}

function checkTranslationCommand(rawText) {
  if (!rawText) return null;
  const lower = rawText.toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();

  // Guard: if it looks like a full chapter/verse reference (e.g. "John 3:16 in NIV"), let the scripture resolver handle it
  if (hasReferenceShape(lower) && /\b(?:verse|chapter|\d+:\d+|\d+\s+\d+)\b/i.test(lower)) {
    return null;
  }

  // 1. "change translation to [x]", "change bible translation to [x]", "switch translation to [x]", "set translation to [x]"
  const changeMatch = lower.match(/\b(?:change|switch|set|put)\s+(?:the\s+)?(?:bible\s+)?(?:translation|version)\s+(?:to|in)\s+(.+)/i);
  if (changeMatch) {
    const res = findTranslationByToken(changeMatch[1]);
    if (res) return res;
  }

  // 2. "can I have [x]", "can I have it in [x]", "can we have [x]", "can you show [x]"
  const canHaveMatch = lower.match(/\b(?:can\s+(?:i|we|you)\s+(?:have|get|see|show|put|display)\s+(?:it\s+in\s+|this\s+in\s+|in\s+)?)\s*(.+)/i);
  if (canHaveMatch) {
    const res = findTranslationByToken(canHaveMatch[1]);
    if (res) return res;
  }

  // 3. "show in [x]", "show it in [x]", "display in [x]", "read in [x]", "view in [x]"
  const showInMatch = lower.match(/\b(?:show|display|view|read|open|put)\s+(?:this\s+|it\s+)?in\s+(.+)/i);
  if (showInMatch) {
    const res = findTranslationByToken(showInMatch[1]);
    if (res) return res;
  }

  // 4. "switch to [x]", "change to [x]"
  const switchToMatch = lower.match(/\b(?:switch|change)\s+to\s+([a-z0-9\s]+?)(?:\s+translation|\s+version|\s+bible)?$/i);
  if (switchToMatch) {
    const res = findTranslationByToken(switchToMatch[1]);
    if (res) return res;
  }

  // 5. "give me [x]", "give me it in [x]"
  const giveMeMatch = lower.match(/\b(?:give\s+me\s+(?:it\s+in\s+|in\s+)?)\s*(.+)/i);
  if (giveMeMatch) {
    const res = findTranslationByToken(giveMeMatch[1]);
    if (res) return res;
  }

  // 6. Bare translation switch: "translation [x]" or "version [x]"
  const bareTransMatch = lower.match(/\b(?:translation|version)\s+([a-z0-9\s]+)$/i);
  if (bareTransMatch) {
    const res = findTranslationByToken(bareTransMatch[1]);
    if (res) return res;
  }

  return null;
}

const VERSE_DEDUP_MS = 10000;
const TRIGGER_ARM_MS = 8000;
const SETTLE_TIMEOUT_MS = 2500; // promote PROBE_FIRED → SETTLED_DIRECT if no final
/** FR-3.66 — Fallback trigger regex when adapter.aliases unavailable (covers both engine variants). */
const TRIGGER_DETECT_RE =
  /\b(ocs|oasis|ocean|osiris|obvious|orca|oscar|media|meter|medium|median|oh see ess|oh see es|oh-see-ess|o c s|o\.c\.s|ox|oaks)\b/gi;

/** Voice sensitivity: ambient shaped refs fire without trigger; Pass 3 still needs trigger/Pass B. */
const DEFAULT_VOICE_SENSITIVITY = "strict"; // strict | normal | loose
/** Tier A — structural ambient match (FR-3.13 two-tier); slightly lower for whisper logprob map */
const CONF_TIER_A_SHAPE = 0.42;
/** Tier B — unstructured / Pass 3 / context jump */
const CONF_TIER_B_STRICT = 0.58;
/** Debounce chapter-only ambient fire so "Proverbs 24 verse 6" can complete */
const CHAPTER_SHAPE_DEBOUNCE_MS = 420;

/** Parse "forty five minutes" / "90 seconds" into total seconds. */
function parseTimerSeconds(rawText) {
  const t = wordNumbersToDigits((rawText || "").toLowerCase()).replace(
    /[,.!?;]/g,
    " ",
  );
  const m = t.match(/(\d+)\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)?/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = (m[2] || "minutes").toLowerCase();
  if (/^h/.test(unit)) return n * 3600;
  if (/^s/.test(unit)) return n;
  return n * 60; // default minutes
}

function stripTriggerWords(text) {
  return String(text || "")
    .replace(TRIGGER_DETECT_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isShortContextJump(text) {
  const t = wordNumbersToDigits(String(text || "").toLowerCase())
    .replace(/[,.;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^(?:(?:go to|jump to|skip to|turn to|show)\s+)?(?:chapter|verse|verses|vs|v|was|worse|voice|vers)\s+\d+$/i.test(
    t,
  );
}

export default function BroadcastEngine() {
  const dispatch = useDispatch();
  const agenda = useSelector((state) => state.util.agenda) || [];
  const activeId = useSelector((state) => state.util.activeId);

  // Transcription State
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSpeakingNow, setIsSpeakingNow] = useState(false);
  const [interimText, setInterimText] = useState(""); // live in-progress words
  const [transcriptLines, setTranscriptLines] = useState([]);
  const [detectedBiblePassages, setDetectedBiblePassages] = useState([]);
  const [detectedCommands, setDetectedCommands] = useState([]);
  const transcriptionEndRef = useRef(null);
  const sessionStartRef = useRef(null);
  const isTranscribingRef = useRef(false); // mirror of state for use in callbacks
  const lastCommandRef = useRef({ action: null, time: 0 }); // command debounce
  const lastVoiceVerseRef = useRef({ key: null, time: 0, utteranceId: null }); // FR-3.17
  const triggerArmedUntilRef = useRef(0); // FR-3.57 trigger window (optional for ambient scripture)
  const voiceSensitivityRef = useRef(DEFAULT_VOICE_SENSITIVITY);
  /** FR-3.8b — per-utterance settlement: { id, state, refKey, title, probeAt, timer } */
  const utteranceRef = useRef(null);
  /** Ambient shape early-fire debounce: { utteranceId, spanKey, timer, kind } */
  const ambientShapeRef = useRef({
    utteranceId: null,
    spanKey: null,
    timer: null,
    firedKey: null,
  });
  const [utteranceDebug, setUtteranceDebug] = useState(null); // Controller-only
  const [langFilterDebug, setLangFilterDebug] = useState(null); // { language, at, admitted? }
  const streamRef = useRef(null); // For getUserMedia stream
  const audioCtxRef = useRef(null); // Audio Context for processing
  const processorRef = useRef(null); // ScriptProcessor Node
  const wsRef = useRef(null); // unused after Phase 0 migration — kept as ref sentinel
  const voskUnsubRef = useRef(null); // cleanup for asr transcript listener
  const sourceNodeRef = useRef(null);
  const handleVoskTranscriptRef = useRef(null);
  const startListeningRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const sessionRecordingRef = useRef(false);
  const liveTranscriptCorrectionRef = useRef(false);
  const [sessionRec, setSessionRec] = useState({
    recording: false,
    title: null,
  });

  // Verse navigation state — tracks what's currently on screen
  const currentRefStateRef = useRef(null); // { bookIndex, chapter, verse }
  const currentVerseTitleRef = useRef(null); // e.g. "John 3:16"
  const currentVerseFullTextRef = useRef(null); // full verse / passage body (plain)
  const currentPassageRef = useRef(null); // { bookIndex, chapter, startVerse, endVerse, tokens, activeIndex }
  const readAlongEnabledRef = useRef(true);
  const readAlongThrottleRef = useRef({ lastPush: 0, timer: null });
  const currentBibleVersionRef = useRef("kjv");
  const [commandFeedback, setCommandFeedback] = useState(null); // { label, ok }
  const highlightCacheRef = useRef({}); // { [verseTitle]: string[] } highlighted words

  // FR-3.26 / FR-3.68 — Active ASR engine name + calibration state for debug bar
  const [asrEngine, setAsrEngine] = useState(null); // 'whisper' | 'vosk' | null
  const [asrCalibrating, setAsrCalibrating] = useState(false); // FR-3.68 post-switch flag

  // Ollama / AI State
  const [aiStatus, setAiStatus] = useState({
    ollama: false,
    piper: false,
    model: null,
  }); // live health
  const [aiChatInput, setAiChatInput] = useState("");
  const [aiChatHistory, setAiChatHistory] = useState([]);
  const [aiChatLoading, setAiChatLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false); // Piper playback
  const [speechError, setSpeechError] = useState(null);
  const [micLevel, setMicLevel] = useState(0); // 0–1 smoothed RMS for UI meter
  const [sleepStatus, setSleepStatus] = useState({
    state: "idle",
    mode: "always",
  });

  // Bible Reference State
  const [books, setBooks] = useState([]);

  useEffect(() => {
    if (window.electron?.Bible?.getBooks) {
      window.electron.Bible.getBooks().then(setBooks).catch(console.error);
    }
  }, []);

  useEffect(() => {
    if (transcriptionEndRef.current) {
      transcriptionEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcriptLines]);

  // Refs for callbacks to access latest state without re-triggering useEffect
  const booksRef = useRef(books);
  const transcriptLinesRef = useRef(transcriptLines);
  const lastPartialTextRef = useRef("");
  const lastFinalTextRef = useRef({ key: "", time: 0 }); // short-window final dedupe

  useEffect(() => {
    booksRef.current = books;
  }, [books]);

  useEffect(() => {
    transcriptLinesRef.current = transcriptLines;
  }, [transcriptLines]);

  // Stable refs so the worker onmessage closure (set up once on mount)
  // always calls the LATEST version of these handlers
  const handleOCSCommandsRef = useRef(null);
  const handleTranscriptionRef = useRef(null);
  const setTranscriptLinesRef = useRef(setTranscriptLines);
  const setInterimTextRef = useRef(setInterimText);

  useEffect(() => {
    setTranscriptLinesRef.current = setTranscriptLines;
    setInterimTextRef.current = setInterimText;
  });

  // Keep isTranscribingRef updated
  useEffect(() => {
    isTranscribingRef.current = isTranscribing;
  }, [isTranscribing]);

  // Sync voice context when operator selects a verse in BibleController (UI → voice)
  useEffect(() => {
    const onBibleContext = (e) => {
      const d = e.detail;
      if (!d || !Number.isInteger(d.bookIndex)) return;
      currentRefStateRef.current = {
        bookIndex: d.bookIndex,
        chapter: d.chapter,
        verse: d.verse,
      };
      if (d.title) currentVerseTitleRef.current = d.title;
      if (d.body != null) {
        currentVerseFullTextRef.current = d.body;
        const tokens = tokenizePassage(d.body);
        currentPassageRef.current = {
          bookIndex: d.bookIndex,
          chapter: d.chapter,
          startVerse: d.verse,
          endVerse: d.endVerse != null ? d.endVerse : d.verse,
          tokens,
          activeIndex: -1,
        };
      }
      if (d.version) currentBibleVersionRef.current = d.version;
    };
    window.addEventListener("bible-context-sync", onBibleContext);
    return () =>
      window.removeEventListener("bible-context-sync", onBibleContext);
  }, []);

  // Native ASR status + continuous auto-listen (FR-3.1 / FR-3.26 engine name)
  useEffect(() => {
    let cancelled = false;

    const pollAI = async () => {
      if (!window.electron?.AI?.status) return;
      try {
        const s = await window.electron.AI.status();
        setAiStatus({
          ollama: s.ollama?.running || false,
          piper: s.piper || false,
          model: s.ollama?.model || null,
          vosk: s.vosk || null,
          voskStatus: s.voskStatus || null,
          asrEngine: s.asrEngine || null, // FR-3.26: expose active engine name
        });
        // FR-3.26 — reflect engine name from AI status (initial load)
        if (s.asrEngine) setAsrEngine(s.asrEngine);
      } catch (_) {}
    };
    pollAI();
    const pollInterval = setInterval(pollAI, 10000);

    // FR-3.68 — subscribe to engine-switch events for debug bar calibration warning
    let unsubEngineChanged = null;
    let unsubEngineCalibrated = null;
    if (window.electron?.Asr?.onEngineChanged) {
      unsubEngineChanged = window.electron.Asr.onEngineChanged((payload) => {
        console.log("[ASR] engine-changed →", payload);
        setAsrEngine(payload.toEngine || null);
        setAsrCalibrating(true);
        setCommandFeedback({
          label: `ASR switched to ${payload.toEngine === "whisper" ? "whisper.cpp" : "vosk-fallback"} — calibrating…`,
          ok: null, // neutral
        });
        setTimeout(() => setCommandFeedback(null), 5000);
      });
    }
    if (window.electron?.Asr?.onEngineCalibrated) {
      unsubEngineCalibrated = window.electron.Asr.onEngineCalibrated(() => {
        setAsrCalibrating(false);
      });
    }

    // FR-3.26 — read initial engine status on mount
    const readInitialEngine = async () => {
      try {
        const s = await window.electron?.Asr?.getStatus?.();
        if (s?.asrEngine) setAsrEngine(s.asrEngine);
        else if (s?.engineName) setAsrEngine(s.engineName);
      } catch (_) {}
    };
    readInitialEngine();

    const boot = async () => {
      // Pre-initialize ASR engine in background so clicking mic is instant
      const AsrApi = window.electron?.Asr || window.electron?.Vosk;
      if (!AsrApi) return;
      try {
        await AsrApi.init();
      } catch (err) {
        console.error("[ASR] init failed:", err);
      }
    };
    boot();

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
      if (typeof unsubEngineChanged === "function") unsubEngineChanged();
      if (typeof unsubEngineCalibrated === "function") unsubEngineCalibrated();
      if (voskUnsubRef.current) voskUnsubRef.current();
      // Use Asr.stop() — Vosk shim kept for backward compat during migration
      const stopApi = window.electron?.Asr || window.electron?.Vosk;
      if (stopApi?.stop) stopApi.stop().catch(() => {});
      if (processorRef.current) {
        try {
          processorRef.current.disconnect();
        } catch (_) {}
      }
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.disconnect();
        } catch (_) {}
      }
      if (audioCtxRef.current) {
        try {
          audioCtxRef.current.close();
        } catch (_) {}
      }
      if (streamRef.current)
        streamRef.current.getTracks().forEach((t) => t.stop());
      isTranscribingRef.current = false;
      if (utteranceRef.current?.timer) {
        clearTimeout(utteranceRef.current.timer);
        utteranceRef.current.timer = null;
      }
    };
  }, []);

  // ── Verse Navigation ────────────────────────────────────────────────────
  const navigateRelative = async (direction) => {
    if (!currentRefStateRef.current) {
      setCommandFeedback({ label: "No verse loaded yet", ok: false });
      setTimeout(() => setCommandFeedback(null), 3000);
      return;
    }
    const { bookIndex, chapter, verse } = currentRefStateRef.current;
    let tBook = bookIndex,
      tChapter = chapter,
      tVerse = verse + direction;
    try {
      let verses = await window.electron.Bible.getChapter(
        currentBibleVersionRef.current,
        tBook,
        tChapter,
      );
      if (direction > 0 && tVerse > verses.length) {
        tChapter++;
        tVerse = 1;
        verses = await window.electron.Bible.getChapter(
          currentBibleVersionRef.current,
          tBook,
          tChapter,
        );
        if (!verses || verses.length === 0) {
          tBook++;
          tChapter = 1;
          tVerse = 1;
        }
      } else if (direction < 0 && tVerse < 1) {
        tChapter--;
        if (tChapter < 1) {
          if (tBook <= 0) {
            setCommandFeedback({
              label: "Already at the first verse",
              ok: false,
            });
            setTimeout(() => setCommandFeedback(null), 3000);
            return;
          }
          tBook -= 1;
          // Jump to last chapter of previous book, then last verse
          let lastCh = 1;
          for (let ch = 150; ch >= 1; ch--) {
            const probe = await window.electron.Bible.getChapter(
              currentBibleVersionRef.current,
              tBook,
              ch,
            );
            if (probe && probe.length > 0) {
              lastCh = ch;
              verses = probe;
              break;
            }
          }
          tChapter = lastCh;
          tVerse = verses && verses.length ? verses.length : 1;
        } else {
          verses = await window.electron.Bible.getChapter(
            currentBibleVersionRef.current,
            tBook,
            tChapter,
          );
          tVerse = verses.length;
        }
      }
      const finalVerses = await window.electron.Bible.getChapter(
        currentBibleVersionRef.current,
        tBook,
        tChapter,
      );
      if (!finalVerses?.[tVerse - 1]) return;
      const ref = await presentVoicePassage(tBook, tChapter, tVerse, tVerse);
      if (ref) {
        setCommandFeedback({ label: `→ ${ref}`, ok: true });
        setTimeout(() => setCommandFeedback(null), 3000);
      }
    } catch (err) {
      console.error("Nav error", err);
    }
  };

  // ── Highlight Helpers ────────────────────────────────────────────────────
  // Returns a highlighted HTML string for the current verse
  const applyHighlights = (rawText, wordsToMark) => {
    if (!rawText || !wordsToMark || wordsToMark.length === 0) return rawText;
    // Sort longest first to avoid partial matches inside longer words
    const sorted = [...wordsToMark].sort((a, b) => b.length - a.length);
    let result = rawText;
    sorted.forEach((word) => {
      if (!word) return;
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(?<![<>"'=])\\b(${escaped})\\b(?![^<]*>)`, "gi");
      result = result.replace(
        re,
        `<mark style="background:rgba(250,204,21,0.45);color:inherit;border-radius:3px;padding:0 3px">$1</mark>`,
      );
    });
    return result;
  };

  // Find the closest word in verseText to `spoken` (simple lowercase substring / fuzzy)
  const fuzzyFindWord = (spoken, verseText) => {
    if (!spoken || !verseText) return null;
    const s = spoken.toLowerCase().trim();
    const tokens = verseText.replace(/[.,;:!?"'()]/g, "").split(/\s+/);
    // Exact match first
    const exact = tokens.find((t) => t.toLowerCase() === s);
    if (exact) return exact;
    // Substring match
    const sub = tokens.find(
      (t) => t.toLowerCase().includes(s) || s.includes(t.toLowerCase()),
    );
    if (sub) return sub;
    // Levenshtein-ish: find token with fewest diff chars
    let best = null,
      bestScore = Infinity;
    tokens.forEach((t) => {
      const tl = t.toLowerCase();
      let score = Math.abs(tl.length - s.length);
      for (let i = 0; i < Math.min(tl.length, s.length); i++)
        if (tl[i] !== s[i]) score++;
      if (score < bestScore && score <= 3) {
        bestScore = score;
        best = t;
      }
    });
    return best;
  };

  const pushHighlight = (words) => {
    const title = currentVerseTitleRef.current;
    const raw = currentVerseFullTextRef.current;
    if (!title || !raw) {
      setCommandFeedback({
        label: "No verse on screen to highlight",
        ok: false,
      });
      setTimeout(() => setCommandFeedback(null), 3000);
      return;
    }
    if (!highlightCacheRef.current[title])
      highlightCacheRef.current[title] = [];
    const cache = highlightCacheRef.current[title];
    const found = [];
    words.forEach((w) => {
      const match = fuzzyFindWord(w, raw);
      if (match && !cache.includes(match)) {
        cache.push(match);
        found.push(match);
      }
    });
    const p = currentPassageRef.current;
    pushBibleContent(
      title,
      raw,
      p?.tokens || tokenizePassage(raw),
      p?.activeIndex ?? -1,
    );
    setCommandFeedback({
      label: found.length
        ? `Highlighted: ${found.join(", ")}`
        : "Word not found",
      ok: !!found.length,
    });
    setTimeout(() => setCommandFeedback(null), 3500);
  };

  const pushRangeHighlight = (fromWord, toWord) => {
    const title = currentVerseTitleRef.current;
    const raw = currentVerseFullTextRef.current;
    if (!title || !raw) return;
    const tokens = raw.split(/\s+/);
    const fromRaw = (fromWord || "").toLowerCase().trim();
    const toRaw = toWord != null ? String(toWord).toLowerCase().trim() : null;
    const fromIsStart = /^(beginning|start|first)$/i.test(fromRaw);
    const toIsEnd = !toRaw || /^(end|ending|last)$/i.test(toRaw);
    const from = fromIsStart
      ? tokens[0]?.replace(/[.,;:!?]/g, "")
      : fuzzyFindWord(fromWord, raw);
    const to = toIsEnd ? null : fuzzyFindWord(toWord, raw);
    const fromIdx = fromIsStart
      ? 0
      : from
        ? tokens.findIndex(
            (t) =>
              t.replace(/[.,;:!?]/g, "").toLowerCase() === from.toLowerCase(),
          )
        : -1;
    const toIdx = to
      ? tokens.findIndex(
          (t) => t.replace(/[.,;:!?]/g, "").toLowerCase() === to.toLowerCase(),
        )
      : tokens.length - 1;
    if (fromIdx === -1) {
      setCommandFeedback({ label: `Word "${fromWord}" not found`, ok: false });
      setTimeout(() => setCommandFeedback(null), 3000);
      return;
    }
    const rangeWords = tokens
      .slice(fromIdx, toIdx + 1)
      .map((t) => t.replace(/[.,;:!?]/g, ""));
    if (!highlightCacheRef.current[title])
      highlightCacheRef.current[title] = [];
    rangeWords.forEach((w) => {
      if (w && !highlightCacheRef.current[title].includes(w))
        highlightCacheRef.current[title].push(w);
    });
    const p = currentPassageRef.current;
    pushBibleContent(
      title,
      raw,
      p?.tokens || tokenizePassage(raw),
      p?.activeIndex ?? -1,
    );
    setCommandFeedback({
      label: `Highlighted: "${from}" → "${to || tokens[tokens.length - 1]}"`,
      ok: true,
    });
    setTimeout(() => setCommandFeedback(null), 3500);
  };

  const clearHighlights = () => {
    const title = currentVerseTitleRef.current;
    const raw = currentVerseFullTextRef.current;
    if (!title || !raw) return;
    highlightCacheRef.current[title] = [];
    const p = currentPassageRef.current;
    pushBibleContent(
      title,
      raw,
      p?.tokens || tokenizePassage(raw),
      p?.activeIndex ?? -1,
    );
    setCommandFeedback({ label: "Highlights cleared", ok: true });
    setTimeout(() => setCommandFeedback(null), 3000);
  };

  const presentVoiceVerse = async (
    bookIndex,
    chapter,
    verse,
    endVerse = null,
  ) => {
    return presentVoicePassage(
      bookIndex,
      chapter,
      verse,
      endVerse != null ? endVerse : verse,
    );
  };

  /** Present a single verse or inclusive range (John 3:1-4).
   * Ranges show VERSES start–end in the title and display one verse at a time;
   * read-along auto-advances to the next verse when the last word is reached.
   */
  const presentVoicePassage = async (
    bookIndex,
    chapter,
    startVerse,
    endVerse,
  ) => {
    const bookId = Number.isInteger(booksRef.current[bookIndex]?.id)
      ? booksRef.current[bookIndex].id
      : bookIndex;
    const vers = await window.electron.Bible.getChapter(
      currentBibleVersionRef.current,
      bookId,
      chapter,
    );
    const bookName = booksRef.current[bookIndex]?.name || "";
    const start = Math.max(1, startVerse | 0);
    const end = Math.max(start, endVerse | 0 || start);
    if (!vers || !vers[start - 1]) {
      setCommandFeedback({
        label: `No verse ${chapter}:${start} in this chapter`,
        ok: false,
      });
      setTimeout(() => setCommandFeedback(null), 3000);
      return null;
    }
    const step = formatRangeStep(bookName, chapter, start, end, start, vers);
    const tokens = tokenizePassage(step.body);
    currentRefStateRef.current = {
      bookIndex,
      chapter,
      verse: step.currentVerse,
      endVerse: step.endVerse,
    };
    currentVerseTitleRef.current = step.title;
    currentVerseFullTextRef.current = step.body;
    currentPassageRef.current = {
      bookIndex,
      chapter,
      startVerse: step.startVerse,
      endVerse: step.endVerse,
      currentVerse: step.currentVerse,
      verseTexts: vers,
      bookName,
      tokens,
      activeIndex: -1,
      gateTranscript: null,
      advanceLockUntil: 0,
    };
    pushBibleContent(step.title, step.body, tokens, -1, step);
    window.dispatchEvent(
      new CustomEvent("voice-bible-sync", {
        detail: {
          version: currentBibleVersionRef.current,
          bookIndex,
          chapterIndex: chapter - 1,
          indices: [step.currentVerse - 1],
        },
      }),
    );
    return step.title;
  };

  const pushBibleContent = (
    title,
    body,
    tokens,
    activeIndex,
    rangeMeta = null,
  ) => {
    if (!window.electron?.Presentation?.setContent) return;
    const enabled = readAlongEnabledRef.current && tokens && tokens.length > 0;
    const passage = currentPassageRef.current;
    const meta =
      rangeMeta ||
      (passage && passage.endVerse > passage.startVerse
        ? {
            startVerse: passage.startVerse,
            endVerse: passage.endVerse,
            currentVerse: passage.currentVerse,
          }
        : null);
    const payload = buildReadAlongPayload({
      title,
      body,
      tokens: tokens || [],
      activeIndex,
      enabled,
      rangeStart: meta?.startVerse,
      rangeEnd: meta?.endVerse,
      currentVerse: meta?.currentVerse,
    });
    // Preserve operator amber highlights on body when cache exists
    const cache = highlightCacheRef.current[title];
    if (cache?.length) {
      payload.data.body = applyHighlights(stripHtml(body), cache);
    }
    window.electron.Presentation.setContent(payload);
  };

  /** Move to the next verse inside an active range (e.g. John 3:1 → 3:2 within 1–4). */
  /** Move to the next verse inside an active range (e.g. Matthew 1:1 → 1:2 within 1–2). */
  const advanceRangeToNextVerse = async (triggerTranscript = "") => {
    const passage = currentPassageRef.current;
    if (!passage) return false;
    if (passage.currentVerse >= passage.endVerse) return false;
    if (Date.now() < (passage.advanceLockUntil || 0)) return false;

    // Lazily load verseTexts if missing (e.g. context-sync from BibleController)
    if (!passage.verseTexts && window.electron?.Bible?.getChapter) {
      try {
        const bookId = Number.isInteger(booksRef.current[passage.bookIndex]?.id)
          ? booksRef.current[passage.bookIndex].id
          : passage.bookIndex;
        passage.verseTexts = await window.electron.Bible.getChapter(
          currentBibleVersionRef.current,
          bookId,
          passage.chapter,
        );
      } catch (err) {
        console.error("[Voice] fetch chapter failed for range advance:", err);
      }
    }
    if (!passage.verseTexts || !passage.verseTexts.length) return false;

    const nextV = passage.currentVerse + 1;
    const step = formatRangeStep(
      passage.bookName,
      passage.chapter,
      passage.startVerse,
      passage.endVerse,
      nextV,
      passage.verseTexts,
    );
    const tokens = tokenizePassage(step.body);
    passage.currentVerse = step.currentVerse;
    passage.tokens = tokens;
    passage.activeIndex = -1;
    passage.gateTranscript = String(triggerTranscript || "").trim();
    passage.advanceLockUntil = Date.now() + 700;

    currentRefStateRef.current = {
      bookIndex: passage.bookIndex,
      chapter: passage.chapter,
      verse: step.currentVerse,
      endVerse: passage.endVerse,
    };
    currentVerseTitleRef.current = step.title;
    currentVerseFullTextRef.current = step.body;

    pushBibleContent(step.title, step.body, tokens, -1, step);
    window.dispatchEvent(
      new CustomEvent("voice-bible-sync", {
        detail: {
          version: currentBibleVersionRef.current,
          bookIndex: passage.bookIndex,
          chapterIndex: passage.chapter - 1,
          indices: [step.currentVerse - 1],
        },
      }),
    );
    setCommandFeedback({
      label: `→ ${passage.bookName} ${passage.chapter}:${step.currentVerse}`,
      ok: true,
    });
    setTimeout(() => setCommandFeedback(null), 2000);
    return true;
  };

  const pushReadAlongUpdate = (activeIndex) => {
    const passage = currentPassageRef.current;
    const title = currentVerseTitleRef.current;
    const body = currentVerseFullTextRef.current;
    if (!passage || !title || !body) return;
    passage.activeIndex = activeIndex;
    const now = Date.now();
    const throttle = readAlongThrottleRef.current;
    const minGap = 100; // ~10 Hz
    const doPush = () => {
      throttle.lastPush = Date.now();
      throttle.timer = null;
      pushBibleContent(title, body, passage.tokens, passage.activeIndex);
    };
    if (now - throttle.lastPush >= minGap) {
      doPush();
    } else if (!throttle.timer) {
      throttle.timer = setTimeout(doPush, minGap - (now - throttle.lastPush));
    }
  };

  const updateReadAlongFromTranscript = (transcript) => {
    if (!readAlongEnabledRef.current) return;
    const passage = currentPassageRef.current;
    if (!passage?.tokens?.length) return;

    const text = String(transcript || "").trim();
    if (passage.gateTranscript) {
      if (text === passage.gateTranscript) return;
      // New speech after verse auto-advance — unlock matching
      passage.gateTranscript = null;
    }
    if (Date.now() < (passage.advanceLockUntil || 0)) return;

    const next = advanceReadAlong(text, passage.tokens, passage.activeIndex);
    if (next !== passage.activeIndex) {
      pushReadAlongUpdate(next);
    }

    // Finished current verse → auto-step to next in range (Matthew 1:1 → 2 within 1–2)
    if (
      isAtVerseEnd(next, passage.tokens) &&
      passage.endVerse > passage.startVerse &&
      passage.currentVerse < passage.endVerse
    ) {
      advanceRangeToNextVerse(text);
    }
  };

  // ── Command Executor ─────────────────────────────────────────────────────
  const executeCommand = async (action, rawText = "") => {
    if (action === "next_verse") return navigateRelative(1);
    if (action === "prev_verse") return navigateRelative(-1);
    if (action === "first_verse") {
      if (!currentRefStateRef.current) {
        setCommandFeedback({ label: "No verse loaded yet", ok: false });
        setTimeout(() => setCommandFeedback(null), 3000);
        return;
      }
      const { bookIndex, chapter } = currentRefStateRef.current;
      const ref = await presentVoicePassage(bookIndex, chapter, 1, 1);
      setCommandFeedback({ label: `→ ${ref}`, ok: true });
      setTimeout(() => setCommandFeedback(null), 3000);
      return;
    }
    if (action === "last_verse") {
      if (!currentRefStateRef.current) {
        setCommandFeedback({ label: "No verse loaded yet", ok: false });
        setTimeout(() => setCommandFeedback(null), 3000);
        return;
      }
      const { bookIndex, chapter } = currentRefStateRef.current;
      const bookId = Number.isInteger(booksRef.current[bookIndex]?.id)
        ? booksRef.current[bookIndex].id
        : bookIndex;
      const vers = await window.electron.Bible.getChapter(
        currentBibleVersionRef.current,
        bookId,
        chapter,
      );
      const last = Math.max(1, vers?.length || 1);
      const ref = await presentVoicePassage(bookIndex, chapter, last, last);
      setCommandFeedback({ label: `→ ${ref}`, ok: true });
      setTimeout(() => setCommandFeedback(null), 3000);
      return;
    }
    if (action === "black_screen") {
      // null clears General/Speaker View (idle/black). Must be null-safe on the View side.
      window.electron?.Presentation?.setContent(null);
      currentPassageRef.current = null;
      setCommandFeedback({ label: "Black Screen", ok: true });
      setTimeout(() => setCommandFeedback(null), 3000);
      return;
    }
    if (action === "screen_on") {
      if (currentVerseTitleRef.current && currentVerseFullTextRef.current) {
        const p = currentPassageRef.current;
        pushBibleContent(
          currentVerseTitleRef.current,
          currentVerseFullTextRef.current,
          p?.tokens || tokenizePassage(currentVerseFullTextRef.current),
          p?.activeIndex ?? -1,
        );
      }
      setCommandFeedback({ label: "Screen On", ok: true });
      setTimeout(() => setCommandFeedback(null), 3000);
      return;
    }
    if (action === "set_timer") {
      const seconds = parseTimerSeconds(rawText);
      if (!seconds) {
        setCommandFeedback({
          label: 'Say e.g. "set timer forty-five minutes"',
          ok: false,
        });
        setTimeout(() => setCommandFeedback(null), 3500);
        return;
      }
      dispatch(utilAction.setEventMode(false));
      dispatch(utilAction.setTime(seconds));
      dispatch(utilAction.setPaused(false));
      dispatch(utilAction.setActiveId(null));
      const activeItem = agenda?.find?.((a) => a._id === activeId);
      window.electron?.Session?.emitTimerLifecycle?.({
        type: "timer:started",
        timerId: activeId || null,
        title: activeItem?.agenda || `Voice timer ${Math.round(seconds / 60)}m`,
        durationSec: seconds,
        category: activeItem?.agenda || "custom",
        speakerName:
          (activeItem?.anchor && String(activeItem.anchor).trim()) || "Speaker",
      });
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      const label = secs
        ? `${mins}m ${secs}s`
        : `${mins} minute${mins === 1 ? "" : "s"}`;
      setCommandFeedback({ label: `Timer set: ${label}`, ok: true });
      setTimeout(() => setCommandFeedback(null), 3500);
      return;
    }
    if (action === "stop_timer") {
      window.electron?.Session?.emitTimerLifecycle?.({
        type: "timer:stopped",
        timerId: null,
        elapsedSec: 0,
      });
      dispatch(utilAction.setTime(0));
      dispatch(utilAction.setPaused(false));
      dispatch(utilAction.setActiveId(null));
      setCommandFeedback({ label: "Timer stopped", ok: true });
      setTimeout(() => setCommandFeedback(null), 3000);
    }
  };

  const changeTranslation = async (dbVersion, label) => {
    currentBibleVersionRef.current = dbVersion;

    // 1. Update the presentation styles in Electron View windows (General and Speaker)
    if (window.electron?.Presentation?.setStyle) {
      window.electron.Presentation.setStyle({ bibleTranslation: label });
    }

    // 2. If a passage is currently on screen, re-fetch and re-render in the new translation!
    const passage = currentPassageRef.current;
    if (passage && passage.bookIndex != null && passage.chapter != null) {
      const bookId = Number.isInteger(booksRef.current[passage.bookIndex]?.id)
        ? booksRef.current[passage.bookIndex].id
        : passage.bookIndex;

      let vers = await window.electron.Bible.getChapter(
        dbVersion,
        bookId,
        passage.chapter,
      );

      // Fallback to KJV if specific chapter not in partial translation
      if (!vers || vers.length === 0) {
        vers = await window.electron.Bible.getChapter(
          "kjv",
          bookId,
          passage.chapter,
        );
      }

      if (vers && vers.length > 0) {
        const bookName =
          passage.bookName || booksRef.current[passage.bookIndex]?.name || "";
        const curV = passage.currentVerse || passage.startVerse || 1;
        const startV = passage.startVerse || curV;
        const endV = passage.endVerse || curV;

        const step = formatRangeStep(
          bookName,
          passage.chapter,
          startV,
          endV,
          curV,
          vers,
        );
        const tokens = tokenizePassage(step.body);

        currentVerseTitleRef.current = step.title;
        currentVerseFullTextRef.current = step.body;
        currentPassageRef.current = {
          ...passage,
          verseTexts: vers,
          tokens,
          activeIndex: -1,
        };

        pushBibleContent(step.title, step.body, tokens, -1, step);
      }
    }

    // 3. Notify BibleController to update its selected dropdown
    window.dispatchEvent(
      new CustomEvent("voice-translation-sync", {
        detail: { version: dbVersion, label },
      }),
    );

    // 4. Visual feedback toast
    setCommandFeedback({ label: `Translation → ${label}`, ok: true });
    setTimeout(() => setCommandFeedback(null), 3000);
  };

  // Wire to ref so the onmessage closure always calls the latest version
  const handleOCSCommands = (text) => {
    const lower = text.toLowerCase().replace(/[.,!?]/g, "");

    // ── Translation Switch: "change translation to NIV", "can I have NIV", "show in AMP", etc.
    const transMatch = checkTranslationCommand(lower);
    if (transMatch) {
      changeTranslation(transMatch.dbVersion, transMatch.label);
      return true;
    }

    // ── Highlight: "highlight [words]" / "mark the word [words]"
    // NEVER bare "mark …" — that steals scripture refs ("book of Mark one verse one")
    const hlMatch = lower.match(
      /\b(?:highlight|mark\s+the\s+words?)\b\s+(.+)/i,
    );
    if (hlMatch && !hasReferenceShape(lower) && !/\bbook\s+of\b/i.test(lower)) {
      const phrase = hlMatch[1].replace(/\b(and|the|a|an)\b/gi, " ").trim();
      if (phrase) {
        pushHighlight(phrase.split(/\s+/).filter(Boolean));
        return true;
      }
    }

    // ── Range to end FIRST: "from [x] to the end" / "from beginning to the end"
    const rangeEndMatch = lower.match(
      /\bfrom\s+(.+?)\s+(?:to\s+the\s+end|to\s+end)\b/i,
    );
    if (rangeEndMatch) {
      pushRangeHighlight(rangeEndMatch[1].trim(), null);
      return true;
    }

    // ── Range: "from [x] to [y]" / "from [x] through [y]"
    const rangeMatch = lower.match(
      /\bfrom\s+(.+?)\s+(?:to|and|through)\s+(.+)/i,
    );
    if (rangeMatch) {
      pushRangeHighlight(rangeMatch[1].trim(), rangeMatch[2].trim());
      return true;
    }

    // ── Clear: "clear highlights" / "remove highlights" / "unmark all"
    if (
      /\b(clear|remove|unmark|reset)\s+(highlights?|marks?|all)\b/i.test(lower)
    ) {
      clearHighlights();
      return true;
    }

    for (const cmd of OCS_COMMANDS) {
      // "next to us/them/the altar…" is preposition prose — never next_verse
      if (cmd.action === "next_verse" && /\bnext\s+to\b/i.test(lower)) continue;
      if (cmd.patterns.some((p) => p.test(lower))) {
        const now = Date.now();
        const last = lastCommandRef.current;
        if (last.action === cmd.action && now - last.time < 2000) return true;
        lastCommandRef.current = { action: cmd.action, time: now };
        const stamp = new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        setDetectedCommands((prev) =>
          [
            { label: cmd.label, action: cmd.action, stamp, id: now },
            ...prev,
          ].slice(0, 5),
        );
        executeCommand(cmd.action, text);
        console.log(`[OCS CMD] ${cmd.label}`);
        return true;
      }
    }
    return false;
  };
  // Always keep ref pointing at latest function (updated every render)
  handleOCSCommandsRef.current = handleOCSCommands;

  const clearUtteranceTimer = () => {
    const u = utteranceRef.current;
    if (u?.timer) {
      clearTimeout(u.timer);
      u.timer = null;
    }
  };

  const setUttDebug = (state, title) => {
    const u = utteranceRef.current;
    const id = u?.id ?? "?";
    const msg = title
      ? `UTTERANCE: ${id} ${state} → ${title}`
      : `UTTERANCE: ${id} ${state}`;
    setUtteranceDebug(msg);
  };

  const scheduleProbePromote = () => {
    clearUtteranceTimer();
    const u = utteranceRef.current;
    if (!u || u.state !== "PROBE_FIRED") return;
    u.timer = setTimeout(() => {
      const cur = utteranceRef.current;
      if (!cur || cur.id !== u.id || cur.state !== "PROBE_FIRED") return;
      cur.state = "SETTLED_DIRECT";
      lastVoiceVerseRef.current = {
        key: cur.refKey,
        time: Date.now(),
        utteranceId: cur.id,
      };
      setUttDebug("SETTLED_DIRECT (probe promoted)", cur.title);
      console.log(
        "[Voice] utterance settled (probe promoted)",
        cur.id,
        cur.title,
      );
    }, SETTLE_TIMEOUT_MS);
  };

  /**
   * FR-3.8b — Present scripture with probe/final reconciliation.
   * @returns {'blocked'|'probe'|'confirmed'|'corrected'|'direct'|null}
   */
  const presentScriptureReconciled = async (
    match,
    text,
    { utteranceId, role },
  ) => {
    const endV = match.endVerse != null ? match.endVerse : match.startVerse;
    const verseKey = `${match.bookIndex}:${match.chapter}:${match.startVerse}:${endV}`;
    const now = Date.now();
    const uttRole = role === "probe" ? "probe" : "final";
    // Normalize id so IPC number/string never splits one utterance into two
    const uid =
      utteranceId != null && utteranceId !== ""
        ? String(utteranceId)
        : `local-${now}`;

    let utt = utteranceRef.current;
    if (!utt || String(utt.id) !== uid) {
      clearUtteranceTimer();
      utt = {
        id: uid,
        state: "PENDING",
        refKey: null,
        title: null,
        probeAt: 0,
        timer: null,
      };
      utteranceRef.current = utt;
    }

    // Already fully settled for this utterance — ignore late junk
    if (String(utt.state).startsWith("SETTLED")) {
      return "blocked";
    }

    // Cross-utterance FR-3.17 dedup (same verse, different utterance)
    const lastVerse = lastVoiceVerseRef.current;
    const isSameUtt =
      lastVerse.utteranceId != null && String(lastVerse.utteranceId) === uid;
    if (
      uttRole === "final" &&
      utt.state === "PENDING" &&
      lastVerse.key === verseKey &&
      now - lastVerse.time < VERSE_DEDUP_MS &&
      !isSameUtt
    ) {
      setCommandFeedback({ label: "Already showing", ok: true });
      setTimeout(() => setCommandFeedback(null), 2000);
      utt.state = "SETTLED_CONFIRMED";
      setUttDebug("SETTLED_CONFIRMED (dedup)", lastVerse.key);
      return "blocked";
    }

    if (
      !window.electron?.Bible?.getChapter ||
      !window.electron?.Presentation?.setContent
    ) {
      return null;
    }

    let refTitle = null;
    const commitDisplay = async () => {
      refTitle = await presentVoicePassage(
        match.bookIndex,
        match.chapter,
        match.startVerse,
        endV,
      );
      if (!refTitle) return false;
      emitPipelineTrace({
        utt: uid,
        heard: text,
        stages: {
          asr: "ok",
          gate: "ok",
          resolve: `ok:${refTitle}`,
          conf: "ok",
          settle: uttRole === "probe" ? "probe" : "final",
          ipc: "ok:activate_set_content",
          render: "pending:windows",
        },
        onLine: setUtteranceDebug,
      });
      return true;
    };

    // ── PROBE (early fire) ────────────────────────────────────────────
    if (
      uttRole === "probe" &&
      (utt.state === "PENDING" || utt.state === "PROBE_FIRED")
    ) {
      // Re-probe with same key: ignore; different key while still probing: update tentative
      if (utt.state === "PROBE_FIRED" && utt.refKey === verseKey) {
        scheduleProbePromote();
        return "confirmed";
      }
      const ok = await commitDisplay();
      if (!ok) return null;
      const ref = refTitle;
      utt.state = "PROBE_FIRED";
      utt.refKey = verseKey;
      utt.title = ref;
      utt.probeAt = now;
      setDetectedBiblePassages((prev) =>
        [
          {
            id: now,
            text,
            ref: match,
            timestamp: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
          ...prev,
        ].slice(0, 3),
      );
      // Controller-only soft feedback — no loud "new command" chime path
      setCommandFeedback({ label: `→ ${ref}`, ok: true });
      setTimeout(() => setCommandFeedback(null), 2500);
      setUttDebug("PROBE_FIRED (confirming…)", ref);
      scheduleProbePromote();
      console.log("[Voice] PROBE_FIRED", uid, ref);
      return "probe";
    }

    // ── FINAL after probe ─────────────────────────────────────────────
    if (utt.state === "PROBE_FIRED" && uttRole === "final") {
      clearUtteranceTimer();
      if (verseKey === utt.refKey) {
        utt.state = "SETTLED_CONFIRMED";
        lastVoiceVerseRef.current = {
          key: verseKey,
          time: now,
          utteranceId: uid,
        };
        setUttDebug("SETTLED_CONFIRMED", utt.title || refTitle);
        console.log("[Voice] SETTLED_CONFIRMED", uid, utt.title);
        return "confirmed";
      }
      // Correction — bypass FR-3.17 for same utterance
      const ok = await commitDisplay();
      if (!ok) return null;
      const ref = refTitle;
      utt.state = "SETTLED_CORRECTED";
      utt.refKey = verseKey;
      utt.title = ref;
      lastVoiceVerseRef.current = {
        key: verseKey,
        time: now,
        utteranceId: uid,
      };
      setDetectedBiblePassages((prev) =>
        [
          {
            id: now,
            text,
            ref: match,
            timestamp: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
          ...prev,
        ].slice(0, 3),
      );
      setCommandFeedback({ label: `→ ${ref} (corrected)`, ok: true });
      setTimeout(() => setCommandFeedback(null), 3000);
      setUttDebug("SETTLED_CORRECTED", ref);
      console.log("[Voice] SETTLED_CORRECTED", uid, ref);
      return "corrected";
    }

    // ── FINAL with no prior probe (SETTLED_DIRECT) ────────────────────
    if (uttRole === "final" && utt.state === "PENDING") {
      if (
        lastVerse.key === verseKey &&
        now - lastVerse.time < VERSE_DEDUP_MS &&
        String(lastVerse.utteranceId) !== uid
      ) {
        setCommandFeedback({ label: "Already showing", ok: true });
        setTimeout(() => setCommandFeedback(null), 2000);
        utt.state = "SETTLED_CONFIRMED";
        return "blocked";
      }
      const ok = await commitDisplay();
      if (!ok) return null;
      const ref = refTitle;
      utt.state = "SETTLED_DIRECT";
      utt.refKey = verseKey;
      utt.title = ref;
      lastVoiceVerseRef.current = {
        key: verseKey,
        time: now,
        utteranceId: uid,
      };
      setDetectedBiblePassages((prev) =>
        [
          {
            id: now,
            text,
            ref: match,
            timestamp: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
          ...prev,
        ].slice(0, 3),
      );
      setCommandFeedback({
        label:
          match.matchType === "context_verse" ||
          match.matchType === "context_chapter"
            ? `→ ${ref} (in-context)`
            : match.matchType === "keyword_search"
              ? `→ ${ref} (quote match)`
              : `→ ${ref}`,
        ok: true,
      });
      setTimeout(() => setCommandFeedback(null), 3000);
      setUttDebug("SETTLED_DIRECT", ref);
      console.log("[Voice] SETTLED_DIRECT", uid, ref);
      return "direct";
    }

    return null;
  };

  const handleTranscriptionContent = async (
    text,
    latestBooks,
    gateOpts = {},
  ) => {
    if (!text || text.trim().length < 3) return;

    const {
      pass = "A",
      triggerArmed = false,
      utteranceId = null,
      role = "final",
      confidence = null,
      shapeHint = null,
    } = gateOpts;
    const sensitivity =
      voiceSensitivityRef.current || DEFAULT_VOICE_SENSITIVITY;

    // Pull scripture core out of noisy ASR ("let's check the book of mach…")
    const core = extractScriptureCore(text) || text;
    let matchText = core.length >= 3 ? core : text;

    // Check for trailing translation (e.g. "John 3:16 in NIV" or "Genesis 1:1 in AMP")
    const embeddedTransMatch = matchText.match(/\bin\s+([a-z0-9\s]+)$/i);
    if (embeddedTransMatch) {
      const trans = findTranslationByToken(embeddedTransMatch[1]);
      if (trans) {
        currentBibleVersionRef.current = trans.dbVersion;
        if (window.electron?.Presentation?.setStyle) {
          window.electron.Presentation.setStyle({ bibleTranslation: trans.label });
        }
        window.dispatchEvent(
          new CustomEvent("voice-translation-sync", {
            detail: { version: trans.dbVersion, label: trans.label },
          }),
        );
        matchText = matchText.replace(/\bin\s+[a-z0-9\s]+$/i, "").trim();
      }
    }

    const fromPassB = pass === "B";
    const shape = shapeHint || matchReferenceShape(matchText);
    const shapeFallback = shape.complete ? shape : matchReferenceShape(text);
    const ambientShaped = shapeFallback.complete;
    const shortJump =
      shapeFallback.shortContext ||
      isShortContextJump(matchText) ||
      isShortContextJump(text);

    // FR-3.57 ambient: COMPLETE shape is enough (no trigger). Pass 3 / context still gated.
    const allowScripture =
      fromPassB ||
      triggerArmed ||
      ambientShaped ||
      (shortJump &&
        (triggerArmed || fromPassB || currentRefStateRef.current)) ||
      sensitivity === "loose";

    if (!allowScripture) {
      emitPipelineTrace({
        utt: utteranceId,
        heard: text,
        stages: {
          asr: "ok",
          gate: "fail:no_shape_or_trigger",
          resolve: "skip",
          conf: "skip",
          settle: "skip",
          ipc: "skip",
          render: "skip",
        },
        onLine: setUtteranceDebug,
      });
      return;
    }

    // Unshaped free speech: never resolve (except Pass B / trigger-armed short jump / loose)
    if (
      !ambientShaped &&
      !shortJump &&
      !fromPassB &&
      !triggerArmed &&
      sensitivity !== "loose"
    ) {
      emitPipelineTrace({
        utt: utteranceId,
        heard: text,
        stages: {
          asr: "ok",
          gate: "fail:unshaped",
          resolve: "skip",
          conf: "skip",
          settle: "skip",
          ipc: "skip",
          render: "skip",
        },
        onLine: setUtteranceDebug,
      });
      return;
    }

    // Two-tier confidence (FR-3.13)
    if (confidence != null && Number.isFinite(confidence)) {
      if (ambientShaped && confidence < CONF_TIER_A_SHAPE) {
        emitPipelineTrace({
          utt: utteranceId,
          heard: text,
          stages: {
            asr: "ok",
            gate: `ok:shape:${shapeFallback.kind}`,
            resolve: "skip",
            conf: `fail:${confidence.toFixed(2)}<${CONF_TIER_A_SHAPE}`,
            settle: "skip",
            ipc: "skip",
            render: "skip",
          },
          onLine: setUtteranceDebug,
        });
        return;
      }
      if (!ambientShaped && confidence < CONF_TIER_B_STRICT && !fromPassB) {
        emitPipelineTrace({
          utt: utteranceId,
          heard: text,
          stages: {
            asr: "ok",
            gate: "ok:armed_or_short",
            resolve: "skip",
            conf: `fail:${confidence.toFixed(2)}<${CONF_TIER_B_STRICT}`,
            settle: "skip",
            ipc: "skip",
            render: "skip",
          },
          onLine: setUtteranceDebug,
        });
        return;
      }
    }

    const wantRef =
      ambientShaped ||
      shortJump ||
      isLikelyBibleReference(matchText) ||
      isLikelyBibleReference(text) ||
      fromPassB;
    if (!wantRef) {
      emitPipelineTrace({
        utt: utteranceId,
        heard: text,
        stages: {
          asr: "ok",
          gate: "fail:not_ref_like",
          resolve: "skip",
          conf: "skip",
          settle: "skip",
          ipc: "skip",
          render: "skip",
        },
        onLine: setUtteranceDebug,
      });
      return;
    }

    // Pass 3 never on ungated ambient — trigger / Pass B only
    const allowPass3 = fromPassB || triggerArmed;
    const allowPass2 =
      fromPassB || triggerArmed || sensitivity === "loose" || ambientShaped;
    const allowBookOnly =
      fromPassB ||
      triggerArmed ||
      ambientShaped ||
      /\bbook\s+of\b/i.test(matchText);

    let books =
      latestBooks && latestBooks.length ? latestBooks : booksRef.current;
    if (!books || books.length === 0) {
      try {
        if (window.electron?.Bible?.getBooks) {
          books = await window.electron.Bible.getBooks();
          if (books?.length) {
            setBooks(books);
            booksRef.current = books;
          }
        }
      } catch (err) {
        console.error("[Voice] books reload failed", err);
      }
    }
    if (!books || books.length === 0) {
      setCommandFeedback({
        label: "Bible books not loaded — reopen Controller",
        ok: false,
      });
      setTimeout(() => setCommandFeedback(null), 3500);
      return;
    }

    const context = currentRefStateRef.current
      ? {
          bookIndex: currentRefStateRef.current.bookIndex,
          chapter: currentRefStateRef.current.chapter,
          verse: currentRefStateRef.current.verse,
        }
      : null;

    const match = await smartBibleMatch(
      matchText,
      books,
      window.electron?.Bible,
      context,
      {
        allowPass2,
        allowPass3,
        requireShape: !fromPassB && !triggerArmed,
        allowBookOnly,
      },
    );

    // FR-3.19 — content/fuzzy hit with no book-name token support: suggest, don't silent-display
    if (match?.needsConfirmation) {
      const bookName = books[match.bookIndex]?.name || "";
      const ref = `${bookName} ${match.chapter}:${match.startVerse}`;
      console.log("[Voice] needsConfirmation (Did you mean?)", {
        text: matchText,
        ref,
        matchType: match.matchType,
      });
      emitPipelineTrace({
        utt: utteranceId,
        heard: text,
        stages: {
          asr: "ok",
          gate: ambientShaped ? `ok:shape:${shapeFallback.kind}` : "ok",
          resolve: `suggest:${ref}`,
          conf: "fail:unsupported_book_token",
          settle: "skip",
          ipc: "skip",
          render: "skip",
        },
        onLine: setUtteranceDebug,
      });
      setCommandFeedback({ label: `Did you mean: ${ref}?`, ok: false });
      setTimeout(() => setCommandFeedback(null), 4000);
      return null;
    }

    console.log("[Voice] scripture try", {
      text,
      matchText,
      match,
      role,
      utteranceId,
      ambientShaped,
      kind: shapeFallback.kind,
      confidence,
    });

    // Final with no match after a probe: keep probe display (don't replace with garbage)
    if (!match) {
      emitPipelineTrace({
        utt: utteranceId,
        heard: text,
        stages: {
          asr: "ok",
          gate: ambientShaped ? `ok:shape:${shapeFallback.kind}` : "ok",
          resolve: "fail:null",
          conf:
            confidence != null
              ? `ok:${Number(confidence).toFixed(2)}`
              : "ok:null",
          settle: "skip",
          ipc: "skip",
          render: "skip",
        },
        onLine: setUtteranceDebug,
      });
      const utt = utteranceRef.current;
      if (
        role === "final" &&
        utt &&
        utteranceId != null &&
        String(utt.id) === String(utteranceId) &&
        utt.state === "PROBE_FIRED"
      ) {
        clearUtteranceTimer();
        utt.state = "SETTLED_DIRECT";
        lastVoiceVerseRef.current = {
          key: utt.refKey,
          time: Date.now(),
          utteranceId: utt.id,
        };
        setUttDebug("SETTLED_DIRECT (final unmatched, kept probe)", utt.title);
        return;
      }
      if (
        !context &&
        /\b(?:verse|verses|vs|v|chapter)\s*\d+/i.test(matchText)
      ) {
        setCommandFeedback({
          label:
            'No verse on screen — say a full reference first (e.g. "John 3:16")',
          ok: false,
        });
        setTimeout(() => setCommandFeedback(null), 3500);
        return;
      }
      if (ambientShaped && role === "final") {
        setCommandFeedback({
          label: 'Heard a reference — try "Mark one verse one"',
          ok: false,
        });
        setTimeout(() => setCommandFeedback(null), 3500);
      }
      return;
    }

    await presentScriptureReconciled(match, matchText, {
      utteranceId,
      role: role === "probe" ? "probe" : "final",
    });
  };
  handleTranscriptionRef.current = handleTranscriptionContent; // keep ref fresh

  // ── Vosk Local WebSocket Pipeline ──────────────────────────────────────────────
  // ── Transcript Normalizer ──────────────────────────────────────────────────
  // Vosk outputs everything lowercase. This corrects:
  //  1. Sentence-case (capitalize after period/start)
  //  2. Sacred proper nouns always Title Case
  //  3. Common church-word Vosk mishearings
  const normalizeTranscript = (text) => {
    if (!text) return text;

    // Whisper emits casing + punctuation; normalize toward matcher-friendly tokens
    text = String(text)
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      .replace(/[?!;]+/g, " ")
      .replace(/,(?=\s|$)/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // ─ 1. Common Vosk mishearing corrections for church vocabulary ─
    const CORRECTIONS = [
      // Sacred names mis-heard by small model
      [/\b(jeez|gees|jees|geez us|jeez us|jesus's)\b/gi, "Jesus"],
      [
        /\b(holyspirit|holy sprit|holy's spirit|wholly spirit|holy's prit)\b/gi,
        "Holy Spirit",
      ],
      [/\b(holly spirit|hollyspirit)\b/gi, "Holy Spirit"],
      [/\b(christ's|chris t|kryst|krist)\b/gi, "Christ"],
      [
        /\b(hallelujah|halleluiah|halleluja|allelujah|alleluia|halleluyah)\b/gi,
        "Hallelujah",
      ],
      [/\b(amen|a men|a man's)\b/gi, "Amen"],
      [/\b(saviour|savior|savoir)\b/gi, "Saviour"],
      // Common Bible book mishearings (supplement smartBibleMatch)
      [/\b(revelation s|revelations)\b/gi, "Revelation"],
      [/\b(psalm s|sams)\b/gi, "Psalms"],
      // "Mark" → mach/match/mock (only when a chapter number follows)
      [
        /\b(mach|match|marsh|merk|mock)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/gi,
        "Mark $2",
      ],
      // "book of junk" → John
      [/\bbook\s+of\s+junk\b/gi, "book of John"],
      // "Matthew" spelling slips
      [/\b(mattew|matthu|mathu|matyu)\b/gi, "Matthew"],
      // "Malachi" → molokai (common Vosk garble)
      [/\b(molokai|malakai|malakhi|molochi|molakai)\b/gi, "Malachi"],
      // "Jeremiah" spelling / ASR slips
      [
        /\b(jaymiah|jayemiah|jerimiah|jermiah|jeremyah|jeremia|jeremiya)\b/gi,
        "Jeremiah",
      ],
      // Philippians / Colossians OOV neighbors + spelling slips
      [/\bphilippines\b/gi, "Philippians"],
      [
        /\b(colosians|colosian|collosions|collosion|collusions?|collotions?|collations?|collisions|collision|coalitions?)\b/gi,
        "Colossians",
      ],
      // Ecclesiastes ASR mishearings
      [
        /\b(ecclesia\s+sticks?|ecclesiasticks?|ecclesiastics?|eclesiastes|eklesiastes?|ecclesiasti)\b/gi,
        "Ecclesiastes",
      ],
      // "verse" / "four" mishearings: "six first war" / "one of us one" / "one vast one"
      [
        /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+(of\s+us|us|vast|was|worse|voice|virs|vers|vas|first)\s+(war|fore|floor|ford|tree|free|tee|won|wan|fife|vive|sex|sicks|ate|hate|nigh|mine|\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/gi,
        (_, a, _conn, c) => {
          const digitMap = {
            war: "four",
            fore: "four",
            floor: "four",
            ford: "four",
            tree: "three",
            free: "three",
            tee: "three",
            won: "one",
            wan: "one",
            fife: "five",
            vive: "five",
            sex: "six",
            sicks: "six",
            ate: "eight",
            hate: "eight",
            nigh: "nine",
            mine: "nine",
          };
          const verseNum = digitMap[String(c).toLowerCase()] || c;
          return `${a} verse ${verseNum}`;
        },
      ],
      // Voice-command phrasing Vosk often mangles
      [/\b(next vers|nex verse|neck verse)\b/gi, "next verse"],
      [/\b(previous vers|prev vers)\b/gi, "previous verse"],
      [/\b(go bag)\b/gi, "go back"],
      [
        /\b(black scream|blank scream|blanche screen|blunk screen|click screen|clear screen|screen of)\b/gi,
        "black screen",
      ],
      [/\b(scream on|shown screen)\b/gi, "screen on"],
      [/\b(said timer|set time are)\b/gi, "set timer"],
      [/\b(stopped timer|stop time are)\b/gi, "stop timer"],
      [/\b(high light|hi light)\b/gi, "highlight"],
      // Common service words
      [/\b(tith e|ti the)\b/gi, "tithe"],
      [/\b(the lord's prayer)\b/gi, "the Lord's Prayer"],
    ];
    let t = text;
    CORRECTIONS.forEach(([pattern, replacement]) => {
      t = t.replace(pattern, replacement);
    });

    // ─ 2. Sentence-case: capitalize first char of each sentence ─
    t = t.replace(
      /(^|[.!?]\s+)([a-z])/g,
      (_, sep, letter) => sep + letter.toUpperCase(),
    );
    // Capitalize absolute first character
    if (t.length > 0) t = t.charAt(0).toUpperCase() + t.slice(1);

    // ─ 3. Sacred proper nouns — always capitalized regardless of position ─
    const SACRED = [
      "Jesus",
      "God",
      "Lord",
      "Christ",
      "Holy Spirit",
      "Holy Ghost",
      "Father",
      "Son",
      "Saviour",
      "Savior",
      "Messiah",
      "Emmanuel",
      "Immanuel",
      "Yahweh",
      "Jehovah",
      "Elohim",
      "Adonai",
      "Alpha",
      "Omega",
      "Heaven",
      "Hell",
      "Bible",
      "Scripture",
      "Gospel",
      "Amen",
      "Hallelujah",
      "Hosanna",
    ];
    SACRED.forEach((name) => {
      // Multi-word names (e.g. "Holy Spirit") need a space-aware regex
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      t = t.replace(new RegExp(`\\b${escaped}\\b`, "gi"), name);
    });

    return t;
  };

  const stopArchiveRecorder = () => {
    const mr = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (!mr || mr.state === "inactive") return;
    try {
      if (typeof mr.requestData === "function") mr.requestData();
    } catch (_) {}
    try {
      mr.stop();
    } catch (_) {}
  };

  const tryStartArchiveRecorder = (stream) => {
    if (!stream || mediaRecorderRef.current) return;
    if (typeof MediaRecorder === "undefined") {
      console.error("[SessionArchive] MediaRecorder unsupported");
      return;
    }
    // Prefer WebM/Opus — reliable in Chromium/Electron and does not require ffmpeg.
    // MP4 is optional if the platform supports true audio/mp4 (not video/mp4).
    const mimeCandidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
    ];
    let mime = "";
    for (const m of mimeCandidates) {
      try {
        if (MediaRecorder.isTypeSupported(m)) {
          mime = m;
          break;
        }
      } catch (_) {}
    }
    try {
      // Record from a clone so stopping the archive recorder never tears down Vosk's tracks
      const archiveStream = new MediaStream(
        stream.getAudioTracks().map((t) => t.clone()),
      );
      const mr = mime
        ? new MediaRecorder(archiveStream, {
            mimeType: mime,
            audioBitsPerSecond: 96000,
          })
        : new MediaRecorder(archiveStream);
      const resolvedMime = mime || mr.mimeType || "audio/webm";
      window.electron?.Session?.setAudioMime?.(resolvedMime);
      let chunkCount = 0;
      mr.ondataavailable = async (ev) => {
        if (!ev.data || ev.data.size < 1) return;
        chunkCount += 1;
        try {
          const ab = await ev.data.arrayBuffer();
          window.electron?.Session?.pushAudioChunk?.(ab);
        } catch (err) {
          console.error("[SessionArchive] chunk push failed", err);
        }
      };
      mr.onerror = (ev) => {
        console.error("[SessionArchive] MediaRecorder error", ev?.error || ev);
      };
      mr.onstop = () => {
        archiveStream.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch (_) {}
        });
        console.log("[SessionArchive] MediaRecorder stopped", {
          chunks: chunkCount,
          mime: resolvedMime,
        });
      };
      mr.start(1000); // 1s chunks — safer flush on short sessions
      mediaRecorderRef.current = mr;
      console.log("[SessionArchive] MediaRecorder started", resolvedMime);
    } catch (err) {
      console.error("[SessionArchive] MediaRecorder failed", err);
    }
  };

  // Session archive status → REC indicator + start/stop recorder
  useEffect(() => {
    if (!window.electron?.Session) return undefined;
    let unsub = null;
    window.electron.Session.status?.()
      .then((s) => {
        sessionRecordingRef.current = !!s?.recording;
        setSessionRec({ recording: !!s?.recording, title: s?.title || null });
        if (s?.recording && streamRef.current)
          tryStartArchiveRecorder(streamRef.current);
      })
      .catch(() => {});
    unsub = window.electron.Session.onStatus((s) => {
      const on = !!s?.recording;
      sessionRecordingRef.current = on;
      setSessionRec({ recording: on, title: s?.title || null });
      if (on && streamRef.current) tryStartArchiveRecorder(streamRef.current);
      if (!on) stopArchiveRecorder();
    });
    return () => {
      if (typeof unsub === "function") unsub();
      stopArchiveRecorder();
    };
  }, []);

  // Tier 1 Live Transcript dictionary correction (display only; OFF by default)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!window.electron?.Settings?.get) return;
      try {
        const s = await window.electron.Settings.get();
        if (!cancelled) {
          liveTranscriptCorrectionRef.current = !!s?.liveTranscriptCorrection;
          readAlongEnabledRef.current = s?.scriptureReadAlong !== false;
        }
      } catch (_) {}
    };
    load();
    const id = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Sleep prevention status (FR-13.4)
  useEffect(() => {
    if (!window.electron?.Sleep) return undefined;
    window.electron.Sleep.getStatus?.()
      .then(setSleepStatus)
      .catch(() => {});
    const unsub = window.electron.Sleep.onStatus?.((s) =>
      setSleepStatus(s || { state: "idle" }),
    );
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  const stopAudioCapture = async () => {
    stopArchiveRecorder();
    if (voskUnsubRef.current) {
      voskUnsubRef.current();
      voskUnsubRef.current = null;
    }
    const AsrApi = window.electron?.Asr || window.electron?.Vosk;
    if (AsrApi?.stop) {
      try {
        await AsrApi.stop();
      } catch (_) {}
    }
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch (_) {}
      processorRef.current = null;
    }
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch (_) {}
      sourceNodeRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        await audioCtxRef.current.close();
      } catch (_) {}
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const handleVoskTranscript = (res) => {
    if (!res) return;

    // Language gate (FR-3.64) — non-target interpreter speech skipped before any UI/commands
    if (res.ignored && res.reason === "non_target_language") {
      const lang = res.language || res.filterReason || "?";
      setLangFilterDebug({ language: lang, at: Date.now() });
      setUtteranceDebug(`FILTERED: non-target language (${lang})`);
      emitPipelineTrace({
        utt: res.utteranceId,
        heard: res.text || "",
        stages: {
          asr: `skip:lang:${lang}`,
          gate: "fail:non_target_language",
          resolve: "skip",
          conf: "skip",
          settle: "skip",
          ipc: "skip",
          render: "skip",
        },
        onLine: setUtteranceDebug,
      });
      return;
    }

    if (!res.text) return;

    const pass = res.pass || "A";

    if (res.language) {
      setLangFilterDebug({
        language: res.language,
        at: Date.now(),
        admitted: true,
      });
    }

    if (res.ignored && res.reason === "low_confidence") {
      // Tier A exception: shaped ambient refs may proceed below the raw Vosk floor.
      // (Previously required confidence >= CONF_TIER_A_SHAPE, which made this path
      // unreachable — Vosk only marks ignored when confidence < that same floor.)
      const maybeShape = matchReferenceShape(
        normalizeTranscript(res.text || ""),
      );
      const allowShaped =
        pass === "A" &&
        maybeShape.complete &&
        (res.confidence == null || res.confidence >= CONF_TIER_A_SHAPE * 0.7);
      if (!allowShaped) {
        emitPipelineTrace({
          utt: res.utteranceId,
          heard: res.text,
          stages: {
            asr: `fail:low_conf:${(res.confidence ?? 0).toFixed(2)}`,
            gate: maybeShape.complete ? "ok:shape_but_conf" : "skip",
            resolve: "skip",
            conf: `fail:${(res.confidence ?? 0).toFixed(2)}`,
            settle: "skip",
            ipc: "skip",
            render: "skip",
          },
          onLine: setUtteranceDebug,
        });
        if (pass === "B") {
          setTranscriptLines((prev) => [
            ...prev,
            {
              text: `PASS B low confidence — ignored (${(res.confidence ?? 0).toFixed(2)})`,
              stamp: "00:00",
              isFinal: true,
            },
          ]);
        }
        return;
      }
      console.log(
        "[Voice] Tier A: admitting low-conf shaped ref",
        res.text,
        res.confidence,
      );
    }

    const rawText = normalizeTranscript(res.text.trim());
    if (!rawText) return;

    const elapsed = sessionStartRef.current
      ? (Date.now() - sessionStartRef.current) / 1000
      : 0;
    const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const ss = String(Math.floor(elapsed % 60)).padStart(2, "0");
    const relStamp = `${mm}:${ss}`;

    // Arm trigger window when OCS/Media heard (Pass A or B)
    if (TRIGGER_DETECT_RE.test(rawText)) {
      triggerArmedUntilRef.current = Date.now() + TRIGGER_ARM_MS;
      TRIGGER_DETECT_RE.lastIndex = 0;
    }
    const triggerArmed = Date.now() < triggerArmedUntilRef.current;
    const commandText = stripTriggerWords(rawText) || rawText;

    const utteranceId = res.utteranceId ?? null;
    const role = res.role || (res.isFinal ? "final" : "partial");

    // Scripture read-along: advance word-pop from ASR while a passage is live
    if (currentPassageRef.current?.tokens?.length) {
      updateReadAlongFromTranscript(commandText);
    }

    if (res.isFinal) {
      // Dedup only within ~800ms so rapid double-emits are ignored, but retries work
      const dedupeKey = `${pass}:${role}:${commandText}`;
      const nowFinal = Date.now();
      if (
        dedupeKey === lastFinalTextRef.current.key &&
        nowFinal - lastFinalTextRef.current.time < 800
      ) {
        lastPartialTextRef.current = "";
        setInterimText("");
        setIsSpeakingNow(false);
        return;
      }
      lastFinalTextRef.current = { key: dedupeKey, time: nowFinal };
      lastPartialTextRef.current = "";

      // Pass A finals while not in trigger window: commands only (Strict)
      // Pass B finals: commands + gated scripture
      // Commands only settle on final (or Pass B) — avoid double next-verse from probe+final
      const runCommands = role !== "probe";
      const handled =
        runCommands && handleOCSCommandsRef.current
          ? handleOCSCommandsRef.current(commandText)
          : false;

      if (!handled && handleTranscriptionRef.current) {
        const sensitivity =
          voiceSensitivityRef.current || DEFAULT_VOICE_SENSITIVITY;
        const core = extractScriptureCore(commandText) || commandText;
        let shape = matchReferenceShape(core);
        if (!shape.complete && !shape.shortContext)
          shape = matchReferenceShape(commandText);
        // Ambient: COMPLETE shape is enough. Short jumps need context or trigger.
        const shouldTryScripture =
          pass === "B" ||
          triggerArmed ||
          sensitivity === "loose" ||
          shape.complete ||
          (shape.shortContext && !!currentRefStateRef.current) ||
          isShortContextJump(commandText);

        if (shouldTryScripture) {
          // Clear chapter-only debounce — final settles now
          if (ambientShapeRef.current.timer) {
            clearTimeout(ambientShapeRef.current.timer);
            ambientShapeRef.current.timer = null;
          }
          handleTranscriptionRef.current(commandText, booksRef.current, {
            pass,
            triggerArmed: triggerArmed || pass === "B",
            utteranceId,
            role: role === "probe" ? "probe" : "final",
            confidence: res.confidence ?? null,
            shapeHint: shape.complete || shape.shortContext ? shape : null,
          });
        }
      }

      setTranscriptLines((prev) => {
        const newLines = [...prev];
        const displayBody = liveTranscriptCorrectionRef.current
          ? correctLiveTranscript(commandText)
          : commandText;
        const tag = pass === "B" ? `[B] ${displayBody}` : displayBody;
        if (
          newLines.length > 0 &&
          !newLines[newLines.length - 1].isFinal &&
          !newLines[newLines.length - 1].text.startsWith("Init") &&
          !newLines[newLines.length - 1].text.startsWith("Connect") &&
          !newLines[newLines.length - 1].text.startsWith("Native") &&
          !newLines[newLines.length - 1].text.startsWith("Auto-start") &&
          !newLines[newLines.length - 1].text.startsWith(
            "Listening continuously",
          )
        ) {
          newLines[newLines.length - 1] = {
            text: tag,
            stamp: relStamp,
            isFinal: true,
          };
        } else {
          newLines.push({ text: tag, stamp: relStamp, isFinal: true });
        }
        if (newLines.length > 60) return newLines.slice(-60);
        return newLines;
      });
      // Session archive transcript (finals only) — RAW (no Tier 1 display correction)
      if (
        sessionRecordingRef.current &&
        window.electron?.Session?.pushTranscriptLine
      ) {
        window.electron.Session.pushTranscriptLine({
          stamp: relStamp,
          text: commandText,
          isFinal: true,
        });
      }
      setInterimText("");
      setIsSpeakingNow(false);
    } else {
      // Interim — UI only. Never run commands on partials (false-fires mid-speech).
      if (rawText === lastPartialTextRef.current) return;
      lastPartialTextRef.current = rawText;
      if (pass === "A") lastFinalTextRef.current = { key: "", time: 0 };
      const displayInterim = liveTranscriptCorrectionRef.current
        ? correctLiveTranscript(rawText)
        : rawText;
      setInterimText(pass === "B" ? `[B] ${displayInterim}` : displayInterim);
      setIsSpeakingNow(true);

      setTranscriptLines((prev) => {
        const newLines = [...prev];
        const tag = pass === "B" ? `[B] ${displayInterim}` : displayInterim;
        if (
          newLines.length > 0 &&
          !newLines[newLines.length - 1].isFinal &&
          !newLines[newLines.length - 1].text.startsWith("Init") &&
          !newLines[newLines.length - 1].text.startsWith("Connect") &&
          !newLines[newLines.length - 1].text.startsWith("Native") &&
          !newLines[newLines.length - 1].text.startsWith("Auto-start") &&
          !newLines[newLines.length - 1].text.startsWith(
            "Listening continuously",
          )
        ) {
          newLines[newLines.length - 1] = {
            text: tag,
            stamp: relStamp,
            isFinal: false,
          };
        } else {
          newLines.push({ text: tag, stamp: relStamp, isFinal: false });
        }
        if (newLines.length > 60) return newLines.slice(-60);
        return newLines;
      });

      // Ambient scripture: fire as soon as ordered shape is COMPLETE on partials
      // (faster than FR-3.8 1.5s probe). Commands still wait for final.
      if (pass === "A" && handleTranscriptionRef.current) {
        const core = extractScriptureCore(commandText) || commandText;
        let shape = matchReferenceShape(core);
        if (!shape.complete) shape = matchReferenceShape(commandText);
        if (shape.complete && shape.span) {
          const spanKey = `${utteranceId ?? "x"}|${shape.span}|${shape.kind}`;
          const amb = ambientShapeRef.current;
          if (amb.firedKey === spanKey) {
            // already fired this exact span
          } else if (shape.kind === "full") {
            // Cancel any pending chapter-only probe for this utterance
            amb.gen = (amb.gen || 0) + 1;
            if (amb.timer) {
              clearTimeout(amb.timer);
              amb.timer = null;
            }
            amb.firedKey = spanKey;
            amb.utteranceId = utteranceId;
            amb.spanKey = shape.span;
            handleTranscriptionRef.current(shape.span, booksRef.current, {
              pass: "A",
              triggerArmed: false,
              utteranceId,
              role: "probe",
              confidence: res.confidence ?? null,
              shapeHint: shape,
            });
            console.log("[Voice] ambient shape-complete (full)", shape.span);
          } else {
            // chapter / book_of — debounce so "24 verse 6" can complete
            if (amb.timer) clearTimeout(amb.timer);
            amb.gen = (amb.gen || 0) + 1;
            const gen = amb.gen;
            amb.utteranceId = utteranceId;
            amb.spanKey = shape.span;
            amb.timer = setTimeout(() => {
              const latest = ambientShapeRef.current;
              if (latest.gen !== gen) return;
              if (latest.firedKey === spanKey) return;
              latest.firedKey = spanKey;
              latest.timer = null;
              handleTranscriptionRef.current?.(shape.span, booksRef.current, {
                pass: "A",
                triggerArmed: false,
                utteranceId,
                role: "probe",
                confidence: res.confidence ?? null,
                shapeHint: shape,
              });
              console.log(
                "[Voice] ambient shape-complete (chapter debounce)",
                shape.span,
              );
            }, CHAPTER_SHAPE_DEBOUNCE_MS);
          }
        }
      }
    }
  };
  handleVoskTranscriptRef.current = handleVoskTranscript;

  const startListening = async ({ auto = false } = {}) => {
    if (isTranscribingRef.current) return true;

    setDetectedCommands([]);
    setInterimText("");
    setSpeechError(null);
    sessionStartRef.current = Date.now();
    lastPartialTextRef.current = "";
    lastFinalTextRef.current = { key: "", time: 0 };
    isTranscribingRef.current = true;

    // Use Asr.* (preferred); fall back to Vosk shim if bridge not yet updated
    const AsrApi = window.electron?.Asr || window.electron?.Vosk;

    try {
      if (!AsrApi) {
        throw new Error("ASR bridge unavailable — reload the app");
      }

      const started = await AsrApi.start();
      if (!started || started.status === "error") {
        throw new Error(
          (started && started.error) || "ASR engine failed to start",
        );
      }

      // FR-3.26 — update active engine name from start() response
      if (started.asrEngine || started.engineName) {
        setAsrEngine(started.asrEngine || started.engineName);
      }

      if (voskUnsubRef.current) voskUnsubRef.current();
      // Subscribe via Asr.onTranscript (Vosk shim also provides this)
      const onTranscriptFn = AsrApi.onTranscript;
      if (onTranscriptFn) {
        voskUnsubRef.current = onTranscriptFn((payload) => {
          handleVoskTranscriptRef.current?.(payload);
        });
      }

      // NFR-37 — Request mic with permission error detection
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
        });
      } catch (micErr) {
        // NFR-37: distinguish permission denied from other mic errors
        const isDenied =
          micErr.name === "NotAllowedError" ||
          micErr.name === "PermissionDeniedError";
        const errMsg = isDenied
          ? "Microphone access denied. Open System Settings → Privacy & Security → Microphone to allow OCS."
          : micErr.message || "Microphone error — check your audio device.";
        throw Object.assign(new Error(errMsg), { micDenied: isDenied });
      }
      streamRef.current = stream;

      // Do NOT force 16000 here — macOS/Chromium often ignores it and runs at 48k.
      // We downsample to 16kHz ourselves before sending to the ASR engine.
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = audioCtx;
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
      const inputRate = audioCtx.sampleRate || 48000;

      const source = audioCtx.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      // FR-3.2 — 100 Hz high-pass + 2× software pre-amp
      const highpass = audioCtx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 100;
      highpass.Q.value = 0.707;

      const preamp = audioCtx.createGain();
      preamp.gain.value = 2.0;

      // ScriptProcessor must stay in an active graph. Zero-gain → destination
      // can be optimized away by Chromium; MediaStreamDestination always pulls.
      const sink = audioCtx.createMediaStreamDestination();
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      let rmsSmooth = 0;
      let lastSpeakState = false;
      let speakCheckAt = 0;
      processor.onaudioprocess = (e) => {
        if (!isTranscribingRef.current) return;
        const input = e.inputBuffer.getChannelData(0);

        // RMS for speaking indicator (throttled — do not setState every audio quantum)
        let sum = 0;
        for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
        const rms = Math.sqrt(sum / input.length);
        rmsSmooth = rmsSmooth * 0.8 + rms * 0.2;
        const now = e.playbackTime;
        if (now - speakCheckAt > 0.1) {
          speakCheckAt = now;
          const speaking = rmsSmooth > 0.008;
          if (speaking !== lastSpeakState) {
            lastSpeakState = speaking;
            setIsSpeakingNow(speaking);
          }
          // Mic meter for operator (0–100%)
          setMicLevel(Math.min(1, rmsSmooth * 12));
        }

        // Downsample to 16 kHz mono Float32 → Int16 (box average anti-alias)
        const ratio = inputRate / 16000;
        const outLen = Math.max(1, Math.floor(input.length / ratio));
        const int16 = new Int16Array(outLen);
        for (let i = 0; i < outLen; i++) {
          const start = Math.floor(i * ratio);
          const end = Math.min(
            input.length,
            Math.floor((i + 1) * ratio) || start + 1,
          );
          let acc = 0;
          const count = Math.max(1, end - start);
          for (let j = start; j < end; j++) acc += input[j];
          const s = Math.max(-1, Math.min(1, acc / count));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        // FR-3.65 — send audio via Asr.sendAudio (Vosk shim also provides this)
        AsrApi.sendAudio(
          new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength),
        );
      };

      source.connect(highpass);
      highpass.connect(preamp);
      preamp.connect(processor);
      processor.connect(sink);

      // If a session archive is already active, start MediaRecorder on this stream
      if (sessionRecordingRef.current) {
        tryStartArchiveRecorder(stream);
      }

      const activeEngine = started?.asrEngine || started?.engineName || asrEngine;
      setIsTranscribing(true);
      setIsSpeakingNow(false);
      console.log("[ASR] mic capture started", {
        inputRate,
        engine: activeEngine,
        model: started?.model?.name,
        ctxState: audioCtx.state,
      });
      return true;
    } catch (e) {
      console.error("Microphone or Recognition error", e);
      // NFR-37 — surface mic-denied specially in the transcript log
      const isMicDenied = e.micDenied === true;
      setTranscriptLines((prev) => [
        ...prev,
        {
          text: `[ERROR] ${e.message || "Microphone permission denied"}`,
          stamp: "00:00",
          isFinal: true,
          micDenied: isMicDenied,
        },
      ]);
      setSpeechError(e.message || "Microphone permission denied");
      setIsTranscribing(false);
      isTranscribingRef.current = false;
      await stopAudioCapture();
      return false;
    }
  };

  startListeningRef.current = startListening;

  const stopListening = async () => {
    setIsTranscribing(false);
    isTranscribingRef.current = false;
    setIsSpeakingNow(false);
    setInterimText("");
    if (utteranceRef.current?.timer) {
      clearTimeout(utteranceRef.current.timer);
      utteranceRef.current.timer = null;
    }
    await stopAudioCapture();
  };

  const toggleTranscription = async () => {
    if (isTranscribingRef.current) {
      await stopListening();
    } else {
      await startListening({ auto: false });
    }
  };

  // ── Piper TTS ─────────────────────────────────────────────────────────────
  const speakText = async (text) => {
    if (!text || !window.electron?.AI?.speak) return;
    setIsSpeaking(true);
    try {
      const result = await window.electron.AI.speak(text);
      if (result?.ok && result.audio) {
        const binary = atob(result.audio);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
        };
        audio.onerror = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
        };
        audio.play();
      } else {
        setIsSpeaking(false);
        console.warn("[Piper] TTS failed:", result?.error);
      }
    } catch (e) {
      setIsSpeaking(false);
      console.error("[Piper]", e);
    }
  };

  // ── Ollama Chat ────────────────────────────────────────────────────────────
  const sendAiChat = async (e, overridePrompt) => {
    if (e?.preventDefault) e.preventDefault();
    const text = (overridePrompt || aiChatInput).trim();
    if (!text || aiChatLoading) return;

    setAiChatHistory((prev) => [
      ...prev,
      { role: "user", text, id: Date.now() },
    ]);
    setAiChatInput("");
    setAiChatLoading(true);

    // Build context-aware system prompt
    const verseContext = currentVerseTitleRef.current
      ? `Currently displayed verse: ${currentVerseTitleRef.current} — "${currentVerseFullTextRef.current || ""}".`
      : "";
    const system = `You are OCS AI — an intelligent assistant for Organised Church Service. ${verseContext} Help with Bible questions, sermon notes, scripture explanations, service planning, and spiritual guidance. Be concise, warm, and scripturally accurate. Respond in 2-3 sentences max unless asked for more.`;

    try {
      if (!window.electron?.AI?.chat)
        throw new Error("AI bridge not available");
      const result = await window.electron.AI.chat(
        text,
        system,
        aiStatus.model,
      );
      const reply = result?.ok
        ? result.response
        : result?.error || "Ollama is offline. Start it with: ollama serve";
      const id = Date.now();
      setAiChatHistory((prev) => [
        ...prev,
        { role: "ai", text: reply, latency: result?.latency, id },
      ]);
      // Auto-speak short responses (≤ 200 chars)
      if (result?.ok && reply.length <= 200 && aiStatus.piper) {
        speakText(reply);
      }
    } catch (err) {
      setAiChatHistory((prev) => [
        ...prev,
        { role: "ai", text: `Error: ${err.message}`, id: Date.now() },
      ]);
    } finally {
      setAiChatLoading(false);
    }
  };

  const formatTime = (timeToFormat) => {
    const totalSeconds = Number(timeToFormat);
    if (isNaN(totalSeconds) || !isFinite(totalSeconds)) return "00:00:00";
    let hr = Math.floor(totalSeconds / 3600);
    let min = Math.floor((totalSeconds % 3600) / 60);
    let sec = Math.floor(totalSeconds % 60);
    return `${hr.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const highlightText = (text) => {
    if (!text || typeof text !== "string") return text;

    // Regex to match typical bible references (e.g., "John 3 16", "1st Corinthians 13 verse 4", "Psalms 23")
    const regex =
      /\b(?:1st\s|2nd\s|3rd\s|1\s|2\s|3\s|first\s|second\s|third\s)?[a-zA-Z]+\s+\d+(?:[\s:v]+|verse\s+)?\d*\b/gi;

    const matches = text.match(regex);
    if (!matches || matches.length === 0) return text;

    const parts = text.split(regex);

    return parts.map((part, i) => {
      const match = matches[i];
      let isBible = false;
      if (match) {
        const matchLower = match.toLowerCase();
        isBible =
          (books || []).some(
            (b) => b && b.name && matchLower.includes(b.name.toLowerCase()),
          ) ||
          [
            "gen",
            "exo",
            "lev",
            "num",
            "deut",
            "josh",
            "judg",
            "ruth",
            "sam",
            "king",
            "chron",
            "ezra",
            "neh",
            "esth",
            "job",
            "psal",
            "prov",
            "eccl",
            "song",
            "isa",
            "jer",
            "lam",
            "ezek",
            "dan",
            "hos",
            "joel",
            "amos",
            "obad",
            "jonah",
            "mic",
            "nah",
            "hab",
            "zeph",
            "hag",
            "zech",
            "mal",
            "matt",
            "mark",
            "luke",
            "john",
            "act",
            "rom",
            "cor",
            "gal",
            "eph",
            "phil",
            "col",
            "thess",
            "tim",
            "tit",
            "philem",
            "heb",
            "jam",
            "pet",
            "jude",
            "rev",
          ].some((alias) => matchLower.includes(alias));
      }

      return (
        <span key={i}>
          {part}
          {match && (
            <span className={isBible ? "text-yellow-500 font-semibold" : ""}>
              {match}
            </span>
          )}
        </span>
      );
    });
  };

  return (
    <div className="grid grid-cols-[350px_1fr] w-full h-full gap-5 p-5 bg-[#0a0a0a] text-white overflow-hidden">
      {/* Left Column: Sidebar Controls */}
      <div className="flex flex-col gap-5 overflow-hidden h-full">
        {/* Transcriptions Panel */}
        <div className="flex-1 bg-[#121212] border border-white/5 rounded-[12px] flex flex-col overflow-hidden shadow-2xl relative">
          {/* Header — mic glow button */}
          <div className="py-[8px] px-[12px] flex items-center justify-between border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div
                className={`w-[30px] h-[30px] rounded-[10px] flex items-center justify-center ${isTranscribing ? "bg-red-500/20 text-red-500" : "bg-white/5 text-white/30"}`}
              >
                <PiQuotesFill size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-[10px] font-semibold uppercase tracking-widest">
                    Live Transcript
                  </h3>
                  {isTranscribing && (
                    <span
                      className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full transition-all ${
                        langFilterDebug &&
                        !langFilterDebug.admitted &&
                        Date.now() - (langFilterDebug.at || 0) < 2500
                          ? "bg-amber-500/20 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.35)]"
                          : isSpeakingNow
                            ? "bg-cyan-500/20 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.4)]"
                            : "bg-white/5 text-white/20"
                      }`}
                    >
                      {langFilterDebug &&
                      !langFilterDebug.admitted &&
                      Date.now() - (langFilterDebug.at || 0) < 2500
                        ? `● FILTERED · ${String(langFilterDebug.language || "?").toUpperCase()}`
                        : isSpeakingNow
                          ? "● Speaking"
                          : "○ Listening"}
                    </span>
                  )}
                  {sessionRec.recording && (
                    <span
                      className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-red-400"
                      title={
                        sessionRec.title
                          ? `Archive: ${sessionRec.title} (continues while paused)`
                          : "Session archive (continues while paused)"
                      }
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      REC
                    </span>
                  )}
                </div>

                {/* {isTranscribing && langFilterDebug?.language && (
                                    <span
                                        className="text-[9px] font-mono text-white/35 uppercase tracking-wider"
                                        title="Last detected language for ASR chunk"
                                    >
                                        LANG {String(langFilterDebug.language).toUpperCase()}
                                    </span>
                                )} */}
              </div>
              {/* {isTranscribing && (
                                <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden" title="Mic level">
                                    <div
                                        className={`h-full transition-all duration-100 ${isSpeakingNow ? 'bg-cyan-400' : 'bg-white/30'}`}
                                        style={{ width: `${Math.round(micLevel * 100)}%` }}
                                    />
                                </div>
                            )} */}
            </div>

            {/* Mic button with glowing ring */}
            <div className="relative flex items-center justify-center">
              {/* Glow ring layers — only visible when speaking */}
              {isTranscribing && isSpeakingNow && (
                <>
                  <span
                    className="absolute inset-0 rounded-full animate-ping opacity-40"
                    style={{
                      background:
                        "conic-gradient(from 0deg, #06b6d4, #a855f7, #06b6d4)",
                      filter: "blur(4px)",
                    }}
                  />
                  <span
                    className="absolute -inset-2 rounded-full opacity-30 animate-pulse"
                    style={{
                      background:
                        "conic-gradient(from 90deg, #06b6d4, #a855f7, #ec4899, #06b6d4)",
                      filter: "blur(8px)",
                    }}
                  />
                </>
              )}
              {isTranscribing && !isSpeakingNow && (
                <span
                  className="absolute -inset-1 rounded-full opacity-20 animate-pulse"
                  style={{ boxShadow: "0 0 12px 4px rgba(239,68,68,0.5)" }}
                />
              )}
              <button
                onClick={toggleTranscription}
                className={`relative z-10 w-[32px] h-[32px] rounded-full flex items-center justify-center transition-all ${
                  isTranscribing
                    ? isSpeakingNow
                      ? "bg-gradient-to-br from-cyan-500 to-purple-600 text-white shadow-[0_0_20px_rgba(168,85,247,0.6)]"
                      : "bg-red-500 text-white"
                    : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                }`}
              >
                {isTranscribing ? (
                  <PiStopFill size={16} />
                ) : (
                  <PiMicrophoneFill size={16} />
                )}
              </button>
            </div>
          </div>

          {/* Transcript rows — timestamp + text */}
          <div className="flex-1 overflow-y-auto no-scrollbar">
            {transcriptLines && transcriptLines.length > 0 ? (
              <table className="w-full">
                <tbody>
                  {transcriptLines.map((line, i) => (
                    <tr
                      key={i}
                      className={`group border-b border-white/[0.03] transition-colors ${
                        !line.isFinal ? "opacity-50" : "hover:bg-white/[0.02]"
                      } animate-in fade-in duration-200`}
                    >
                      <td className="pl-4 pr-3 py-2.5 align-top w-[44px] shrink-0">
                        <span
                          className="text-[10px] font-black tabular-nums"
                          style={{ color: "#6366f1" }}
                        >
                          {line.stamp}
                        </span>
                      </td>
                      <td className="pr-4 py-2.5 align-top">
                        <p
                          className={`text-[12px] leading-relaxed ${
                            line.isFinal
                              ? "text-white/85 font-medium"
                              : "text-white/40 italic animate-pulse"
                          }`}
                        >
                          {highlightText(line.text)}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="h-full flex flex-col items-center justify-center opacity-10 gap-4 p-6">
                <PiWaveform size={60} />
                <p className="text-[10px] font-black uppercase tracking-[0.3em]">
                  {isTranscribing ? "Listening for speech…" : "Microphone off"}
                </p>
                {speechError && (
                  <p className="text-[10px] font-black uppercase tracking-[0.1em] text-red-500 mt-2">
                    Error: {speechError}
                  </p>
                )}
              </div>
            )}
            <div ref={transcriptionEndRef} />
          </div>

          {/* Live interim bar — shows word-by-word as you speak */}
          {interimText && (
            <div className="px-4 py-2 border-t border-cyan-500/20 bg-cyan-500/5 flex items-start gap-2">
              <span className="mt-[2px] w-[6px] h-[6px] rounded-full bg-cyan-400 animate-pulse shrink-0" />
              <p className="text-[11px] text-cyan-300/80 italic leading-relaxed">
                {interimText}
              </p>
            </div>
          )}

          {/* Detected commands + bible refs footer */}
          {(commandFeedback ||
            utteranceDebug ||
            detectedBiblePassages.length > 0 ||
            detectedCommands.length > 0) && (
            <div className="border-t border-white/5 p-3 space-y-2 bg-black/20">
              {utteranceDebug && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-[8px] border border-amber-500/25 bg-amber-500/5">
                  <span className="w-2 h-2 rounded-full bg-amber-400/80 shrink-0" />
                  <span className="text-[9px] font-mono text-amber-200/90 tracking-wide">
                    {utteranceDebug}
                  </span>
                </div>
              )}
              {commandFeedback && (
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-[8px] border animate-in slide-in-from-bottom-2 duration-300 ${commandFeedback.ok ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30"}`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${commandFeedback.ok ? "bg-emerald-400" : "bg-red-400"}`}
                  />
                  <span
                    className={`text-[9px] font-black uppercase tracking-widest ${commandFeedback.ok ? "text-emerald-300" : "text-red-300"}`}
                  >
                    ⌘ {commandFeedback.label}
                  </span>
                </div>
              )}
              {/* {detectedCommands.slice(0, 2).map(cmd => (
                                <div key={cmd.id} className="flex items-center gap-2 px-3 py-1.5 rounded-[8px] bg-purple-500/10 border border-purple-500/30 animate-in slide-in-from-bottom-2 duration-300"
                                    style={{boxShadow: '0 0 12px rgba(168,85,247,0.15)'}}>
                                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" style={{animationDuration:'1.5s'}} />
                                    <span className="text-[9px] font-black text-purple-300 uppercase tracking-widest">⌘ {cmd.label}</span>
                                    <span className="ml-auto text-[9px] text-white/20">{cmd.stamp}</span>
                                </div>
                            ))} */}
              {/* {detectedBiblePassages.slice(0, 2).map(passage => (
                                <div key={passage.id} className="flex items-center gap-2 px-3 py-1.5 rounded-[8px] bg-blue-600/10 border border-blue-500/20 animate-in slide-in-from-bottom-2 duration-300">
                                    <span className="text-[9px] font-black text-blue-400 uppercase">📖 {booksRef.current[passage.ref.bookIndex]?.name} {passage.ref.chapter}:{passage.ref.startVerse}</span>
                                    <span className="ml-auto text-[9px] text-white/20">{passage.timestamp}</span>
                                </div>
                            ))} */}
            </div>
          )}
        </div>

        {/* OCS AI Chat Panel */}
        {/* <div className="flex-1 bg-[#121212] border border-white/5 rounded-[20px] flex flex-col overflow-hidden shadow-2xl min-h-[200px]">
                    <div className="py-[8px] px-[12px] border-b border-white/5 bg-white/[0.02] flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-[28px] h-[28px] flex items-center justify-center bg-purple-600/20 rounded-[8px] text-purple-400">
                                <PiMagicWandFill size={16} />
                            </div>
                            <h3 className="text-[10px] font-semibold uppercase tracking-widest">OCS AI</h3>
                        </div>
                        <div className="flex items-center gap-2">
                            {aiStatus.ollama
                                ? <span className="text-[9px] font-black text-purple-400 uppercase tracking-widest bg-purple-500/10 px-2 py-0.5 rounded-full">● {aiStatus.model || 'Ollama'}</span>
                                : <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Offline — run ollama serve</span>
                            }
                            {aiStatus.piper && <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded-full">🎙 Piper</span>}
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar">
                        {aiChatHistory.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center opacity-20 gap-2 py-6">
                                <PiMagicWandFill size={28} />
                                <p className="text-[10px] font-black uppercase tracking-widest text-center">Ask about the scripture or service</p>
                            </div>
                        )}
                        {aiChatHistory.map(msg => (
                            <div key={msg.id} className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div className={`max-w-[90%] px-3 py-2 rounded-[10px] text-[11px] leading-relaxed ${msg.role === 'user' ? 'bg-white/10 text-white/80 rounded-tr-none' : 'bg-purple-600/15 border border-purple-500/20 text-purple-100 rounded-tl-none'}`}>
                                    {msg.text}
                                </div>
                                {msg.role === 'ai' && (
                                    <div className="flex items-center gap-2 px-1">
                                        {msg.latency && <span className="text-[8px] text-white/20">{msg.latency}s</span>}
                                        {aiStatus.piper && (
                                            <button onClick={() => speakText(msg.text)} disabled={isSpeaking} className="text-[9px] text-white/20 hover:text-emerald-400 transition-colors disabled:opacity-30" title="Read aloud">🔊</button>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                        {aiChatLoading && (
                            <div className="flex items-center gap-2 px-3 py-2">
                                <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{animationDelay:'0ms'}} />
                                <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{animationDelay:'150ms'}} />
                                <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{animationDelay:'300ms'}} />
                            </div>
                        )}
                    </div>
                    <form onSubmit={sendAiChat} className="border-t border-white/5 p-2 flex gap-2 shrink-0">
                        <input value={aiChatInput} onChange={e => setAiChatInput(e.target.value)}
                            placeholder={aiStatus.ollama ? 'Ask about the scripture or service…' : 'Start Ollama: ollama serve'}
                            disabled={!aiStatus.ollama || aiChatLoading}
                            className="flex-1 bg-white/5 border border-white/10 rounded-[8px] px-3 py-2 text-[11px] text-white placeholder:text-white/20 outline-none focus:border-purple-500/50 transition-colors disabled:opacity-30"
                        />
                        <button type="submit" disabled={!aiStatus.ollama || aiChatLoading || !aiChatInput.trim()}
                            className="px-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-30 rounded-[8px] text-[11px] font-black text-white transition-all shadow-[0_0_15px_rgba(168,85,247,0.3)]">
                            Send
                        </button>
                    </form>
                </div> */}

        {/* Active Schedule Panel */}
        <div className="h-[25%] bg-[#121212] border border-white/5 rounded-[20px] flex flex-col overflow-hidden shadow-2xl">
          <div className="py-[8px] px-[12px] border-b border-white/5 bg-white/[0.02] flex items-center gap-3">
            <div className="w-[30px] h-[30px] flex items-center justify-center bg-white/5 rounded-[10px] text-white/30">
              <PiCalendarBlankFill size={20} />
            </div>
            <h3 className="text-[10px] font-semibold uppercase tracking-widest">
              Active Schedule
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
            {agenda.length > 0 ? (
              agenda.map((item) => {
                const isActive = activeId === item._id;
                return (
                  <div
                    key={item._id}
                    className={`group flex items-center gap-4 px-5 py-4 rounded-[12px] transition-all border ${
                      isActive
                        ? "bg-white/10 border-white/10 shadow-xl"
                        : "bg-transparent border-transparent hover:bg-white/[0.02]"
                    }`}
                  >
                    <PiCheckCircle
                      size={22}
                      className={
                        isActive
                          ? "text-white"
                          : "text-white/10 group-hover:text-white/20"
                      }
                    />
                    <div className="flex-1 flex flex-col overflow-hidden">
                      <span
                        className={`text-sm font-black truncate ${isActive ? "text-white" : "text-white/40"}`}
                      >
                        {item.agenda}
                      </span>
                      {isActive && (
                        <span className="text-[10px] font-black text-white/20 tracking-widest uppercase mt-0.5">
                          {formatTime(item.time)} remaining
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="h-full flex flex-col items-center justify-center opacity-5">
                <PiClockFill size={40} />
                <p className="text-[10px] font-black uppercase tracking-widest mt-2">
                  Empty Agenda
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Main Previews and Controls */}
      <div className="flex flex-col gap-5 overflow-hidden h-full">
        {/* Previews Grid: 1x2 */}
        <div className="grid grid-cols-2 gap-5 h-[45%] max-h-[350px] shrink-0">
          {/* General Display */}
          <div className="flex flex-col gap-3 h-full rounded-[20px] overflow-hidden">
            <div className="flex items-center gap-3 px-6 h-8">
              <div className="w-2 h-2 rounded-[20px] bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">
                General Display
              </span>
            </div>
            <div className="flex-1  bg-black border border-white/10 rounded-[20px] overflow-hidden relative shadow-2xl group ring-1 ring-white/5">
              <div className="absolute inset-0">
                <MiniPreview mode="general" />
              </div>
            </div>
          </div>

          {/* Speaker Confidence */}
          <div className="flex flex-col gap-3 h-full">
            <div className="flex items-center gap-3 px-6 h-8">
              <div className="w-2 h-2 rounded-[20px] bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">
                Speaker Confidence
              </span>
            </div>
            <div className="flex-1 bg-black border border-white/10 rounded-[20px] overflow-hidden relative shadow-2xl group ring-1 ring-white/5">
              <div className="absolute inset-0">
                <MiniPreview mode="speaker" />
              </div>
            </div>
          </div>
        </div>

        {/* Control Center / Scene Editor */}
        <div className="flex-1 bg-[#121212] border border-white/5 rounded-[20px] flex flex-col overflow-hidden relative">
          <DisabledContainer disabled>
            <div className="py-[12px] px-[24px] flex items-center justify-between border-b border-white/5 bg-white/[0.02]">
              <div className="flex items-center gap-5">
                <div className="w-[30px] h-[30px] rounded-[8px] bg-blue-600/20 flex items-center justify-center text-blue-500 shadow-inner">
                  <PiMonitorFill size={20} />
                </div>
                <div className="flex flex-col">
                  <h2 className="text-[12px] font-black uppercase tracking-widest text-white">
                    Agenda presenter
                  </h2>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Button variant="secondary">Load Scene</Button>
                <Button variant="primary">Take Live</Button>
              </div>
            </div>
          </DisabledContainer>
        </div>
      </div>
    </div>
  );
}
