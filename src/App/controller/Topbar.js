import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  PiBroadcast,
  PiEye,
  PiEyeSlash,
  PiCaretDown,
  PiX,
  PiMicrophone,
} from "react-icons/pi";
import { MdOutlineConnectedTv, MdOutlineResetTv } from "react-icons/md";
import MobileConnectController from "./MobileConnectController";
import { utilAction } from "../../Redux/state.jsx";
import { smartBibleMatch, getBookSuggestions, wordNumbersToDigits, isLikelyBibleReference, phoneticCode, levenshtein } from "./smartBibleMatch.js";

const TRANSLATION_MAP = {
    'kjv': 'kjv', 'king james': 'kjv', 'king james version': 'kjv',
    'bbe': 'bbe', 'basic english': 'bbe', 'bible basic english': 'bbe',
    'asv': 'asv', 'american standard': 'asv',
    'web': 'web', 'world english': 'web',
    'net': 'net', 'new english': 'net',
    'geneva': 'geneva',
    'tyndale': 'tyndale',
    'coverdale': 'coverdale',
    'bishops': 'bishops', "bishop's": 'bishops',
    'strongs': 'kjv_strongs', "strong's": 'kjv_strongs', 'kjv strongs': 'kjv_strongs',
    'amp': 'amp', 'amplified': 'amp',
};

function resolveTranslation(requested) {
    if (!requested) return null;
    let reqLower = requested.toLowerCase().replace(/[.,:;!?]/g, '').trim();
    // Common mishearings from whisper
    reqLower = reqLower.replace(/\b(k j v|cage a v|kjv)\b/i, 'kjv');
    
    // 1. Exact or partial string match
    let versionKey = TRANSLATION_MAP[reqLower] || Object.keys(TRANSLATION_MAP).find(k => reqLower.includes(k) || k.includes(reqLower));
    
    // 2. Phonetic & Fuzzy fallback
    if (!versionKey) {
        const reqPhonetic = phoneticCode(reqLower.replace(/\s/g, ''));
        let bestDistance = Infinity;
        
        for (const key of Object.keys(TRANSLATION_MAP)) {
            // Phonetic Match
            const keyPhonetic = phoneticCode(key.replace(/\s/g, ''));
            if (reqPhonetic && keyPhonetic && reqPhonetic === keyPhonetic) {
                versionKey = key;
                break; // Exact phonetic match is great
            }
            
            // Levenshtein Match
            const distance = levenshtein(reqLower, key);
            // Dynamic threshold: longer words allow more errors (e.g., 'amplified' allows 3)
            const threshold = Math.min(3, Math.max(1, Math.floor(key.length / 3)));
            if (distance <= threshold && distance < bestDistance) {
                bestDistance = distance;
                versionKey = key;
            }
        }
    }
    
    return versionKey ? TRANSLATION_MAP[versionKey] : null;
}

export default function Topbar({ onGoLive, previewMode, onSetPreviewMode }) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isFollowMode, setIsFollowMode] = useState(true);
  const [books, setBooks] = useState([]);
  const booksRef = React.useRef([]);
  const [debugText, setDebugText] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("initializing"); // initializing, ready, listening, transcribing, error
  const [lastTranscript, setLastTranscript] = useState("");
  const [activeVerseContext, setActiveVerseContext] = useState("");
  const [downloadProgress, setDownloadProgress] = useState(0);
  
  const workerRef = React.useRef(null);
  const audioCtxRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const rollingBufferRef = React.useRef(new Float32Array(16000 * 5)); // 5s preview buffer
  const speechBufferRef = React.useRef([]); // Dynamic collection of speech chunks
  const preRollBufferRef = React.useRef([]); // Short history to catch word starts
  const workletNodeRef = React.useRef(null);
  const bufferPtrRef = React.useRef(0);
  const isProcessingRef = React.useRef(false);
  const lastTriggeredTimeRef = React.useRef(0);
  const currentRefStateRef = React.useRef(null); // { bookIndex, chapter, verse }
  const currentVerseTitleRef = React.useRef("");
  const currentVerseFullTextRef = React.useRef("");
  const highlightCacheRef = React.useRef({}); // { [verseRef]: { [word]: timestamp } }
  const sourceNodeRef = React.useRef(null);
  const activeWatchdogRef = React.useRef(null);
  const isSpeakingRef = React.useRef(false);
  const lastSpeechTimeRef = React.useRef(0);
  const firstSpeechTimeRef = React.useRef(0); // For emergency 15s trigger
  const midSpeechProbeTimerRef = React.useRef(null); // Timer to fire keyword probe mid-speech
  const probeTriggeredRef = React.useRef(false); // Prevent duplicate triggers from probe
  const speechChunkCountRef = React.useRef(0); // Rough word-count estimate (chunks spoken)
  const mediaCommandWindowRef = React.useRef(null); // 2.5s capture window timer after "Media" keyword detected
  const [rmsVolume, setRmsVolume] = useState(0);
  const [isSpeakingUI, setIsSpeakingUI] = useState(false);
  const [didYouMean, setDidYouMean] = useState(null); // { text, candidate } or { searchResults: [] }
  const [voiceEvents, setVoiceEvents] = useState([]); // last 10 voice events
  const [lastConfidence, setLastConfidence] = useState(null); // 0–1 or null
  const [voiceEngine, setVoiceEngine] = useState(null); // 'python' | 'wasm' | null
  const [spectralInfo, setSpectralInfo] = useState({ zcr: 0, voicingScore: 0, noiseFloor: 0 });
  const voiceEventsRef = React.useRef([]);
  const CONFIDENCE_THRESHOLD = 0.50; // FR-3.13 — lowered from 0.65; real logprobs from Python are accurate

  // Redux — for timer and queue voice commands
  const dispatch = useDispatch();
  const agenda = useSelector((state) => state.util.agenda);
  const isPaused = useSelector((state) => state.util.isPaused);
  const activeId = useSelector((state) => state.util.activeId);
  const agendaRef = React.useRef(agenda);
  const isPausedRef = React.useRef(isPaused);
  const activeIdRef = React.useRef(activeId);
  React.useEffect(() => { agendaRef.current = agenda; }, [agenda]);
  React.useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  React.useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  // Track active Bible version for translation switch command
  const currentBibleVersionRef = React.useRef('kjv');


  useEffect(() => {
    if (window.electron && window.electron.Bible) {
      window.electron.Bible.getBooks().then(data => {
          setBooks(data);
          booksRef.current = data;
      }).catch(console.error);
    }

    // Initialize Web Worker for Whisper
    workerRef.current = new Worker(new URL('../workers/whisper.worker.js', import.meta.url));
    workerRef.current.onmessage = (event) => {
      const msg = event.data;
      if (msg.status === 'progress') {
          const engineLabel = msg.engine === 'wasm' ? '(WASM fallback)' : '';
          setDebugText(`Loading AI ${engineLabel}: ${Math.round(msg.progress)}%`);
      } else if (msg.status === 'ready') {
          console.log("Whisper worker ready, engine:", msg.engine);
          setVoiceEngine(msg.engine || 'wasm');
          setVoiceStatus("ready");
      } else if (msg.status === 'engine_switched') {
          // Python sidecar went down mid-session — WASM fallback activated
          setVoiceEngine('wasm');
          pushVoiceEvent(`⚠️ Engine switched → WASM fallback`);
          setDebugText('⚠️ Python sidecar lost — switched to WASM fallback');
      } else if (msg.status === 'result') {
          // Clear watchdog if it's still running
          if (activeWatchdogRef.current) clearTimeout(activeWatchdogRef.current);

          const text = (msg.text || '').trim();
          const lowerText = text.toLowerCase();
          const confidence = typeof msg.confidence === 'number' ? msg.confidence : 0.85;
          const debugInfo = msg.debug || {};
          const duration = (debugInfo.duration || 0).toFixed(1);

          setLastConfidence(confidence);
          isProcessingRef.current = false;
          setVoiceStatus("listening");
          // Track engine from this result
          if (msg.engine) setVoiceEngine(msg.engine);

          // --- FR-3.13: Confidence Gate ---
          if (!text || confidence < CONFIDENCE_THRESHOLD) {
              const reason = !text ? 'EMPTY / SILENT' : `LOW CONF (${confidence.toFixed(2)})`;
              setDebugText(`🚫 ${reason} — ignored`);
              setLastTranscript(`⚠️ [${reason}]`);
              pushVoiceEvent(`⚠️ ${reason}`);
              return;
          }

          // Only update transcript display with real, accepted speech
          setLastTranscript(text);
          setDebugText(`AI heard ${duration}s | conf=${confidence.toFixed(2)} | Heard: "${text}"`);
          pushVoiceEvent(`🎙 HEARD: "${text}"`);

          if (!text) return;

          // --- FR-3.6: Dual trigger keywords — "OCS" and "Media" both work ---
          // Find whichever trigger appears EARLIEST in the transcript (position, not array order)
          const triggerKeywords = [
            // OCS variants
            'ocs', 'o.c.s', 'o-c-s', 'o c s',
            'oasis', 'obvious', 'osiris', 'ocean',
            'oh see', 'oh-see', 'ok see', 'oc-s', 'oc s',
            // Media variants
            'media', 'meeting', 'meter', 'medium', 'video', 'median',
            'me the', 'need a', 'meet a',
          ];

          let triggerIdx = -1;
          let triggerLen = 0;
          for (const kw of triggerKeywords) {
            const idx = lowerText.indexOf(kw);
            if (idx !== -1 && (triggerIdx === -1 || idx < triggerIdx)) {
              // Take the EARLIEST occurrence in the text (not first in the keyword array)
              triggerIdx = idx;
              triggerLen = kw.length;
            }
          }

          const nextMatch = lowerText.match(/\b(next verse|next one|next|forward|previous verse|previous|go back|last verse|go to next|go next|back one)\b/i);

          if (triggerIdx !== -1) {
            const actualCommand = lowerText.substring(triggerIdx + triggerLen)
                                          .replace(/[.,:;!?]/g, ' ')
                                          .trim();
            handleVoiceCommand(actualCommand, true, msg.bible_match);
          } else if (nextMatch) {
            handleVoiceCommand(nextMatch[0], true);
          } else if (msg.bible_match || isLikelyBibleReference(lowerText) || isFollowModeRef.current) {
            // User just said something like "Genesis 1 verse 1" without a trigger word
            // OR we are in Follow Mode and want to try matching everything they say
            handleVoiceCommand(lowerText, true, msg.bible_match);
          }
      } else if (msg.status === 'probe_result') {
          // ── Continuous Mid-Speech Evaluation ──
          if (!isSpeakingRef.current || isProcessingRef.current) return;

          const checkMidSpeech = async () => {
              const text = msg.text || '';
              let instantJumpTriggered = false;
              let jumpCommand = text;

              const midNextMatch = text.match(/\b(next verse|next one|next|forward|previous verse|previous|go back|last verse|go to next|go next|back one)\b/i);

              const rawTranslationMatch = text.match(/\b(?:switch to|change to|use|switch translation|change translation|can i have|give me|put it in|change it to|switch it to|make it|read from)\s+([a-zA-Z\s]{2,20})\b/i);
              let validTranslationMatch = null;
              if (rawTranslationMatch) {
                  const resolved = resolveTranslation(rawTranslationMatch[1]);
                  if (resolved) {
                      validTranslationMatch = `Change translation to ${resolved}`;
                  }
              }

              // 1. Navigation Commands ("Previous verse")
              if (midNextMatch) {
                  setDebugText(`[PROBE MATCH] Navigation detected! Executing...`);
                  instantJumpTriggered = true;
                  jumpCommand = midNextMatch[0];
              }
              // 2. Translation Commands ("Change to KJV")
              else if (validTranslationMatch) {
                  setDebugText(`[PROBE MATCH] Translation change detected! Executing...`);
                  instantJumpTriggered = true;
                  jumpCommand = validTranslationMatch;
              }
              // 3. Direct Bible Reference ("John 3 verse 16")
              else if (msg.bible_match || isLikelyBibleReference(text)) {
                  setDebugText(`[PROBE MATCH] Direct reference detected! Executing...`);
                  instantJumpTriggered = true;
                  // Pass the pre-matched reference to handleVoiceCommand if available
                  if (msg.bible_match) {
                      handleVoiceCommand(text, true, msg.bible_match);
                      return; // Exit early since we handled it
                  }
              } 
              // 4. Keyword Search Passage ("In the beginning God created")
              else {
                  // Pass 3 requires isMidSpeech = true to strictly require >= 4 words
                  const matchResult = await smartBibleMatch(
                      text,
                      booksRef.current,
                      window.electron?.Bible || null,
                      currentRefStateRef.current,
                      true 
                  );
                  
                  if (matchResult && matchResult.matchType === 'keyword_search') {
                      setDebugText(`[PROBE MATCH] Keyword passage detected! Executing...`);
                      instantJumpTriggered = true;
                  }
              }

              if (instantJumpTriggered) {
                  if (midSpeechProbeTimerRef.current) clearTimeout(midSpeechProbeTimerRef.current);
                  if (mediaCommandWindowRef.current) clearTimeout(mediaCommandWindowRef.current);
                  isSpeakingRef.current = false;
                  setIsSpeakingUI(false);
                  isProcessingRef.current = true;
                  setVoiceStatus("transcribing");
                  
                  // Empty buffer to prevent duplicate 'fireTranscription'
                  speechBufferRef.current = [];
                  
                  // Execute immediately
                  handleVoiceCommand(jumpCommand, true);
                  
                  // Reset processing flag so it can listen again
                  setTimeout(() => {
                      if (isProcessingRef.current) {
                          isProcessingRef.current = false;
                          setVoiceStatus("listening");
                      }
                  }, 1000);
                  return;
              }

              // 3. Fallback: "Media" trigger keyword detected (original 2.5s window logic)
              if (msg.hasKeyword && !probeTriggeredRef.current) {
                  probeTriggeredRef.current = true;
                  setDebugText(`[PROBE] "Media" detected — opening 1.8s capture window for Bible passage...`);
                  
                  if (mediaCommandWindowRef.current) clearTimeout(mediaCommandWindowRef.current);
                  
                  mediaCommandWindowRef.current = setTimeout(() => {
                      mediaCommandWindowRef.current = null;
                      if (isProcessingRef.current) return;

                      setDebugText(`[PROBE] 1.8s window elapsed — transcribing Media command...`);
                      isSpeakingRef.current = false;
                      setIsSpeakingUI(false);
                      isProcessingRef.current = true;
                      setVoiceStatus("transcribing");

                      const watchdog = setTimeout(() => {
                          if (isProcessingRef.current) {
                              isProcessingRef.current = false;
                              setVoiceStatus("listening");
                              speechBufferRef.current = [];
                          }
                      }, 3000);
                      activeWatchdogRef.current = watchdog;

                      const totalLength = speechBufferRef.current.reduce((acc, chunk) => acc + chunk.length, 0);
                      const finalAudio = new Float32Array(totalLength);
                      let off = 0;
                      speechBufferRef.current.forEach(chunk => {
                          finalAudio.set(chunk, off);
                          off += chunk.length;
                      });
                      speechBufferRef.current = [];
                      speechChunkCountRef.current = 0;

                      workerRef.current.postMessage({
                          type: 'transcribe',
                          audio: finalAudio,
                          prompt: currentVerseFullTextRef.current || ""
                      });
                  }, 1800);
              }

              // 4. Schedule the next continuous probe!
              if (isSpeakingRef.current && !isProcessingRef.current) {
                   midSpeechProbeTimerRef.current = setTimeout(() => {
                       midSpeechProbeTimerRef.current = null;
                       // Only stop if we are actually processing/transcribing the FINAL result
                       if (!isSpeakingRef.current || isProcessingRef.current) return;
                       if (!workerRef.current || speechBufferRef.current.length === 0) return;
                       
                       // Optimization: Limit probe to the last ~4 seconds of audio for speed
                       const MAX_PROBE_SAMPLES = 16000 * 4; 
                       let snapLen = speechBufferRef.current.reduce((a, c) => a + c.length, 0);
                       let startIndex = 0;
                       
                       if (snapLen > MAX_PROBE_SAMPLES) {
                           startIndex = snapLen - MAX_PROBE_SAMPLES;
                           snapLen = MAX_PROBE_SAMPLES;
                       }

                       const snapAudio = new Float32Array(snapLen);
                       let currentOffset = 0;
                       let totalProcessed = 0;
                       
                       speechBufferRef.current.forEach(chunk => {
                           const chunkStart = totalProcessed;
                           const chunkEnd = totalProcessed + chunk.length;
                           
                           if (chunkEnd > startIndex) {
                               const startInChunk = Math.max(0, startIndex - chunkStart);
                               const endInChunk = chunk.length;
                               const lengthToCopy = endInChunk - startInChunk;
                               
                               snapAudio.set(chunk.subarray(startInChunk, endInChunk), currentOffset);
                               currentOffset += lengthToCopy;
                           }
                           totalProcessed += chunk.length;
                       });

                       workerRef.current.postMessage({ type: 'probe', audio: snapAudio });
                  }, 700);
              }
          };

          checkMidSpeech();
      } else if (msg.status === 'error') {
          isProcessingRef.current = false;
          setDebugText("Worker Error: " + msg.error);
          setVoiceStatus("error");
          setIsListening(false);
      }
    };
    
    workerRef.current.onerror = (e) => {
      console.error("Worker Error:", e);
      setDebugText("AI Process Error (check console)");
      setVoiceStatus("error");
    };

    // Start loading the model in the background
    workerRef.current.postMessage({ type: 'init' });

    return () => {
      if (workerRef.current) workerRef.current.terminate();
    };
  }, []);

  // --- FR-3.18: Audio feedback helper (Web Audio API) ---
  const playFeedback = React.useCallback((type) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const master = ctx.createGain();
      master.gain.value = 0.12;
      master.connect(ctx.destination);

      const tone = (freq, start, dur) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(master);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.8, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.start(start); osc.stop(start + dur + 0.05);
      };

      if (type === 'success') {
        // Pleasant two-tone ascending chime — C5 → E5
        tone(523, ctx.currentTime, 0.15);
        tone(659, ctx.currentTime + 0.13, 0.22);
      } else if (type === 'error') {
        // Low warning tone — A3
        tone(220, ctx.currentTime, 0.28);
      } else if (type === 'warn') {
        // Neutral amber tone — E4
        tone(330, ctx.currentTime, 0.22);
      }
      setTimeout(() => ctx.close().catch(() => {}), 900);
    } catch (_) { /* audio feedback is non-critical */ }
  }, []);

  // Rolling voice-event log (max 10 entries) — FR-3.25
  const pushVoiceEvent = React.useCallback((msg) => {
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const entry = `${ts} ${msg}`;
    voiceEventsRef.current = [entry, ...voiceEventsRef.current].slice(0, 10);
    setVoiceEvents([...voiceEventsRef.current]);
  }, []);

  const levenshtein = (a, b) => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
            else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
        }
    }
    return matrix[b.length][a.length];
  };

  const getPhoneticCode = (word) => {
    if (!word) return "";
    let code = word.toUpperCase().replace(/[^A-Z]/g, '');
    if (code.length === 0) return "";

    // 1. Basic Sound Conversions (Simplified Metaphone/Soundex)
    code = code.replace(/PH/g, 'F')
               .replace(/KN|GN|PN|AE|WR/g, (m) => m[1])
               .replace(/SH|SI|TI/g, 'X')
               .replace(/CH/g, 'X')
               .replace(/TH/g, 'T')
               .replace(/WH/g, 'W')
               .replace(/C|S|Z/g, 'S')
               .replace(/G|K|Q/g, 'K')
               .replace(/D|T/g, 'T');

    // 2. Remove Vowels (except the first character)
    const first = code[0];
    const rest = code.substring(1).replace(/[AEIOUY]/g, '');
    
    // 3. Remove duplicates and return a compressed sound-hash
    let final = first + rest;
    return final.split('').filter((char, i, arr) => i === 0 || char !== arr[i-1]).join('');
  };

  const getFuzzyMatch = (vocalWord, currentText) => {
    if (!vocalWord || !currentText) return null;
    const wordsInVerse = currentText.toLowerCase().replace(/[.,:;!?(){}\[\]]/g, '').split(/\s+/).filter(w => w.length > 0);
    
    const vocalClean = vocalWord.toLowerCase();
    const vocalPhonetic = getPhoneticCode(vocalClean);

    let bestMatch = null;
    let minDistance = 2; // Threshold for Levenshtein

    // Step 1: Exact Match (Fast path)
    if (wordsInVerse.includes(vocalClean)) return vocalClean;

    // Step 2: Combined Scoring (Looks like + Sounds like)
    for (const vWord of wordsInVerse) {
        if (vWord.length < 3) continue; 

        // Sound-alike check (Metaphone)
        if (vocalPhonetic && getPhoneticCode(vWord) === vocalPhonetic) {
            return vWord; // High-priority sound match
        }

        // Look-alike check (Levenshtein)
        const distance = levenshtein(vocalClean, vWord);
        if (distance < minDistance) {
            minDistance = distance;
            bestMatch = vWord;
        }
    }
    return bestMatch;
  };

  const getTokens = (text) => {
    // Splits by spaces or punctuation while PRESERVING them in the array
    return text.split(/(\s+|[.,:;!?(){}\[\]])/).filter(t => t !== undefined && t.length > 0);
  };

  const pruneHighlights = () => {
    const now = Date.now();
    const TTL = 5 * 60 * 1000; // 5 minutes
    const cache = highlightCacheRef.current;
    
    Object.keys(cache).forEach(verseRef => {
        const data = cache[verseRef];
        // Prune single words
        if (data.words) {
            Object.keys(data.words).forEach(word => {
                if (now - data.words[word] > TTL) delete data.words[word];
            });
        }
        // Prune ranges
        if (data.ranges) {
            data.ranges = data.ranges.filter(r => now - r.timestamp < TTL);
        }
        
        const hasWords = data.words && Object.keys(data.words).length > 0;
        const hasRanges = data.ranges && data.ranges.length > 0;
        if (!hasWords && !hasRanges) {
            delete cache[verseRef];
        }
    });
  };

  const applyHighlights = (verseTitle, rawText) => {
    if (!verseTitle || !rawText) return rawText;
    
    const key = verseTitle.toUpperCase();
    const cache = highlightCacheRef.current[key];
    if (!cache) return rawText;

    const tokens = getTokens(rawText);
    const highlightedIndices = new Set();

    // 1. Mark Range Tokens
    if (cache.ranges && cache.ranges.length > 0) {
        cache.ranges.forEach(range => {
            const start = Math.max(0, range.start);
            const end = Math.min(tokens.length - 1, range.end);
            for (let i = start; i <= end; i++) {
                highlightedIndices.add(i);
            }
        });
    }

    // 2. Mark Individual Word Tokens
    if (cache.words && Object.keys(cache.words).length > 0) {
        tokens.forEach((token, idx) => {
            const clean = token.toLowerCase().replace(/[.,:;!?(){}\[\]]/g, '').trim();
            if (clean && cache.words[clean]) {
                highlightedIndices.add(idx);
            }
        });
    }

    // 3. Build HTML with persistent <mark> tags
    let html = "";
    let inMark = false;
    // Premium bright yellow highlight
    const markStyle = 'background-color: #ffd700; color: #000; padding: 2px 4px; border-radius: 4px; font-weight: bold; margin: 0;';

    tokens.forEach((token, idx) => {
        const shouldBeHighlighted = highlightedIndices.has(idx);

        if (shouldBeHighlighted && !inMark) {
            html += `<mark style="${markStyle}">`;
            inMark = true;
        } else if (!shouldBeHighlighted && inMark) {
            html += '</mark>';
            inMark = false;
        }
        html += token;
    });

    if (inMark) html += '</mark>';
    return html;
  };

  useEffect(() => {
    // Prune expired highlights every 30 seconds
    const pruneInterval = setInterval(() => {
        pruneHighlights();
    }, 30000);

    // Sync voice engine with manual UI selections
    let removePresentationListener = null;
    if (window.electron && window.electron.Presentation) {
        removePresentationListener = window.electron.Presentation.onSetContent((value) => {
            if (value && value.type === 'bible' && value.data) {
                const { title, body } = value.data;
                // Only update internal refs if this is a CLEAN text selection (manual click)
                if (body && !body.includes('<mark')) {
                    currentVerseTitleRef.current = title;
                    currentVerseFullTextRef.current = body;
                    setActiveVerseContext(title); // Sync UI visibility
                    console.log("[SYNC] Topbar Context Updated:", title);
                }
            }
        });
    }

    return () => {
        clearInterval(pruneInterval);
        if (removePresentationListener) removePresentationListener();
    };
  }, []);

  useEffect(() => {
      let interval = null;

      const stopVoice = () => {
        if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        if (interval) clearInterval(interval);
        audioCtxRef.current = null;
        streamRef.current = null;
        workletNodeRef.current = null;
        sourceNodeRef.current = null;
        isProcessingRef.current = false;
        speechBufferRef.current = []; // Clear speech accumulation
        setVoiceStatus("ready");
        setDebugText("System Stopped");
      };

      const startVoice = async () => {
          try {
             setVoiceStatus("loading");
             const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true,
                  sampleRate: 16000
                } 
              });
             streamRef.current = stream;

             // 1. Create 16kHz context
             const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
             audioCtxRef.current = audioCtx;

             // 2. Add High-Pass Filter (removes rumble below 100Hz)
             const hpFilter = audioCtx.createBiquadFilter();
             hpFilter.type = "highpass";
             hpFilter.frequency.value = 100;
             
             // Software Pre-Amp (2.0x Boost)
             const gainNode = audioCtx.createGain();
             gainNode.gain.value = 2.0; 

             // 3. Load Worklet
             await audioCtx.audioWorklet.addModule(new URL('../workers/audio.processor.js', import.meta.url));
             
             const source = audioCtx.createMediaStreamSource(stream);
             sourceNodeRef.current = source;
             const workletNode = new AudioWorkletNode(audioCtx, 'audio-processor');
             workletNodeRef.current = workletNode;

             // Connect chain: Source -> 2x Boost -> HP Filter -> AI Processor
             source.connect(gainNode);
             gainNode.connect(hpFilter);
             hpFilter.connect(workletNode);

             workletNode.port.onmessage = (event) => {
                const { audio, isSpeaking, rms, zcr, voicingScore, noiseFloor } = event.data;
                const buffer = rollingBufferRef.current;
                
                // Shift and append
                buffer.set(buffer.subarray(audio.length));
                buffer.set(audio, buffer.length - audio.length);

                // Update VAD state
                setRmsVolume(rms);
                // Update spectral info for debug bar
                if (zcr !== undefined) {
                  setSpectralInfo({ zcr, voicingScore: voicingScore || 0, noiseFloor: noiseFloor || 0 });
                }
                 const now = Date.now();
                 // 1. Maintain Pre-Roll History (500ms ≈ 4 chunks)
                 preRollBufferRef.current.push(new Float32Array(audio));

                 if (preRollBufferRef.current.length > 5) {
                    preRollBufferRef.current.shift();
                 }

                 // Helper: immediately fire transcription from accumulated buffer
                 const fireTranscription = () => {
                    if (isProcessingRef.current || !workerRef.current || speechBufferRef.current.length === 0) return;
                    // Cancel any pending mid-speech probe or media window timer
                    if (midSpeechProbeTimerRef.current) {
                        clearTimeout(midSpeechProbeTimerRef.current);
                        midSpeechProbeTimerRef.current = null;
                    }
                    if (mediaCommandWindowRef.current) {
                        clearTimeout(mediaCommandWindowRef.current);
                        mediaCommandWindowRef.current = null;
                    }
                    isSpeakingRef.current = false;
                    setIsSpeakingUI(false);
                    probeTriggeredRef.current = false;
                    isProcessingRef.current = true;
                    setVoiceStatus("transcribing");

                    const watchdog = setTimeout(() => {
                        if (isProcessingRef.current) {
                            isProcessingRef.current = false;
                            setVoiceStatus("listening");
                            speechBufferRef.current = [];
                        }
                    }, 3000); // FR-3.12: 3s watchdog (was 5s)
                    activeWatchdogRef.current = watchdog;

                    const totalLength = speechBufferRef.current.reduce((acc, chunk) => acc + chunk.length, 0);
                    const finalAudio = new Float32Array(totalLength);
                    let offset = 0;
                    speechBufferRef.current.forEach(chunk => {
                        finalAudio.set(chunk, offset);
                        offset += chunk.length;
                    });
                    speechBufferRef.current = [];
                    speechChunkCountRef.current = 0;

                    workerRef.current.postMessage({
                        type: 'transcribe',
                        audio: finalAudio,
                        prompt: currentVerseFullTextRef.current || ""
                    });
                 };

                 // 2. Logic for Speech Capture
                 if (isSpeaking) {
                    // Start of speech detection
                    if (!isSpeakingRef.current) {
                        isSpeakingRef.current = true;
                        probeTriggeredRef.current = false;
                        setIsSpeakingUI(true);
                        firstSpeechTimeRef.current = now;
                        speechChunkCountRef.current = 0;
                        // PREPEND Pre-roll for clean "Attack"
                        speechBufferRef.current = [...preRollBufferRef.current];

                        // Schedule mid-speech keyword probe
                        midSpeechProbeTimerRef.current = setTimeout(() => {
                            midSpeechProbeTimerRef.current = null;
                            if (!isSpeakingRef.current || isProcessingRef.current) return;
                            if (!workerRef.current || speechBufferRef.current.length === 0) return;

                            // Build a snapshot of the audio so far for the probe
                            const snapLen = speechBufferRef.current.reduce((a, c) => a + c.length, 0);
                            const snapAudio = new Float32Array(snapLen);
                            let snapOffset = 0;
                            speechBufferRef.current.forEach(chunk => {
                                snapAudio.set(chunk, snapOffset);
                                snapOffset += chunk.length;
                            });

                            // Post a lightweight probe
                            workerRef.current.postMessage({ type: 'probe', audio: snapAudio });
                        }, 700);
                    }
                    lastSpeechTimeRef.current = now;
                    speechBufferRef.current.push(new Float32Array(audio));
                    speechChunkCountRef.current++;

                    // EMERGENCY FORCE-TRIGGER (15s Max)
                    if (now - firstSpeechTimeRef.current > 15000) {
                        console.warn("AI Force Trigger: Max speech duration reached");
                        setDebugText("AI: Forced Release (Noise/Length Limit)");
                        fireTranscription();
                    }
                 } else if (isSpeakingRef.current) {
                    // Capture the "Tail" during silence wait
                    speechBufferRef.current.push(new Float32Array(audio));

                    // If a Media command 2.5s window is open, keep collecting — don't fire on silence.
                    if (mediaCommandWindowRef.current) return;
                    // If probe is still in-flight, don't compete with it
                    if (probeTriggeredRef.current) return;

                    // Estimate word count: each audio chunk is ~128ms at 16kHz/2048 buffer.
                    // Average spoken word is ~300ms → ~2.3 chunks per word.
                    // ≤5 words ≈ ≤12 chunks. We trigger immediately for short commands.
                    const estimatedWords = Math.round(speechChunkCountRef.current / 2.3);
                    const silenceElapsed = now - lastSpeechTimeRef.current;

                    const shouldFireImmediate = estimatedWords <= 5 && silenceElapsed >= 200;
                    const shouldFireNormal = silenceElapsed > 700;

                    if (shouldFireImmediate || shouldFireNormal) {
                        fireTranscription();
                    }
                 }
             };


             
             // 4. Ensure engine is active
             await audioCtx.resume();
             console.log("[VOICE] Signal Cleaned. SampleRate:", audioCtx.sampleRate);
             setVoiceStatus("listening");
             setDebugText("Monitoring - Listening...");

             // Removed Interval for Stability (Now uses Reactive Transition Trigger)


          } catch (err) {
             console.error(err);
             setDebugText("Mic Error: " + err.message);
             setVoiceStatus("error");
             setIsListening(false);
          }
      };

      if (isListening) {
          startVoice();
      } else {
          stopVoice();
      }

      return () => stopVoice();
  }, [isListening]);

  const handleVoiceCommand = async (text, isAuto = false, preMatch = null) => {
    let command = text.trim().toLowerCase();

    // ── 1. Word-number conversion (FR-3.16) ─────────────────────────────────
    const wordNumbers = {
        'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
        'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
        'ten': '10', 'eleven': '11', 'twelve': '12', 'thirteen': '13',
        'fourteen': '14', 'fifteen': '15', 'sixteen': '16', 'seventeen': '17',
        'eighteen': '18', 'nineteen': '19', 'twenty': '20', 'thirty': '30',
        'forty': '40', 'fifty': '50', 'sixty': '60',
        'twenty-one': '21', 'twenty-two': '22', 'twenty-three': '23',
        'twenty-four': '24', 'twenty-five': '25', 'twenty-six': '26',
        'twenty-seven': '27', 'twenty-eight': '28', 'twenty-nine': '29',
        'thirty-one': '31', 'thirty-two': '32', 'forty-five': '45',
    };
    // Compound "twenty one" (space form)
    command = command.replace(/\btwenty\s+(\w+)\b/g, (_, rest) => wordNumbers['twenty-' + rest] || ('twenty ' + rest));
    command = command.replace(/\bthirty\s+(\w+)\b/g, (_, rest) => wordNumbers['thirty-' + rest] || ('thirty ' + rest));
    command = command.replace(/\bforty\s+(\w+)\b/g, (_, rest) => wordNumbers['forty-' + rest] || ('forty ' + rest));
    Object.keys(wordNumbers).forEach(word => {
        command = command.replace(new RegExp('\\b' + word + '\\b', 'g'), wordNumbers[word]);
    });

    // ── Helper: log and give feedback ───────────────────────────────────────
    const ok = (msg) => { setDebugText(`✅ ${msg}`); pushVoiceEvent(`✅ ${msg}`); playFeedback('success'); };
    const warn = (msg) => { setDebugText(`⚠️ ${msg}`); pushVoiceEvent(`⚠️ ${msg}`); playFeedback('warn'); };

    // ════════════════════════════════════════════════════════════════════════
    // COMMAND DISPATCHING — ordered most-specific → least-specific
    // ════════════════════════════════════════════════════════════════════════

    // ── A. BLACK SCREEN (FR-3.14) ────────────────────────────────────────────
    if (/\b(black screen|blank screen|black out|blackout|hide screen|clear screen)\b/i.test(command)) {
        window.electron.Presentation.setContent(null);
        ok('Black screen');
        return;
    }

    // ── B. SHOW LOGO (FR-3.14) ──────────────────────────────────────────────
    if (/\b(show logo|display logo|logo screen|ocs logo)\b/i.test(command)) {
        window.electron.Presentation.setContent({ type: 'logo' });
        ok('Show logo');
        return;
    }

    // ── C. SWITCH TRANSLATION (FR-3.14) ────────────────────────────────────
    const switchMatch = command.match(/\b(?:switch to|change to|use|switch translation|change translation|can i have|give me|put it in|change it to|switch it to|make it|read from)\s+(.+)/i);
    if (switchMatch) {
        const requested = switchMatch[1];
        const version = resolveTranslation(requested);
        if (version) {
            currentBibleVersionRef.current = version;
            // Re-fetch current verse in new translation
            if (currentRefStateRef.current) {
                const { bookIndex, chapter, verse } = currentRefStateRef.current;
                try {
                    const verses = await window.electron.Bible.getChapter(version, bookIndex, chapter);
                    if (verses && verses.length > 0) {
                        const verseText = verses[verse - 1] || '';
                        const verseRef = currentVerseTitleRef.current;
                        window.electron.Presentation.setContent({ type: 'bible', data: { title: verseRef, body: verseText } });
                        
                        window.dispatchEvent(new CustomEvent('voice-bible-sync', {
                            detail: {
                                version,
                                bookIndex,
                                chapterIndex: chapter - 1,
                                indices: [verse - 1]
                            }
                        }));
                    }
                } catch (_) {}
            }
            if (window.electron.Bible.sync) {
                const { bookIndex, chapter } = currentRefStateRef.current || { bookIndex: 0, chapter: 1 };
                window.electron.Bible.sync({ version, bookIndex, chapterIndex: chapter - 1 });
            }
            ok(`Translation: ${version.toUpperCase()}`);
        } else {
            warn(`Unknown translation: "${requested}"`);
        }
        return;
    }

    // ── D. TIMER COMMANDS (FR-3.14) ─────────────────────────────────────────
    // D1. Set timer — "set timer forty-five minutes" / "set timer 10 minutes 30 seconds"
    const setTimerMatch = command.match(/\b(?:set timer|set the timer|timer)\s+(.+)/i);
    if (setTimerMatch) {
        const durationText = setTimerMatch[1];
        let totalSeconds = 0;
        const hrMatch = durationText.match(/(\d+)\s*(?:hour|hr)/i);
        const minMatch = durationText.match(/(\d+)\s*(?:minute|min)/i);
        const secMatch = durationText.match(/(\d+)\s*(?:second|sec)/i);
        if (hrMatch) totalSeconds += parseInt(hrMatch[1]) * 3600;
        if (minMatch) totalSeconds += parseInt(minMatch[1]) * 60;
        if (secMatch) totalSeconds += parseInt(secMatch[1]);
        // Fallback: bare number = minutes
        if (!hrMatch && !minMatch && !secMatch) {
            const bare = durationText.match(/(\d+)/);
            if (bare) totalSeconds = parseInt(bare[1]) * 60;
        }
        if (totalSeconds > 0) {
            dispatch(utilAction.setEventMode(false));
            dispatch(utilAction.setTime(totalSeconds));
            dispatch(utilAction.setPaused(false));
            dispatch(utilAction.setActiveId(null));
            ok(`Timer set: ${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`);
        } else {
            warn('Could not parse timer duration');
        }
        return;
    }

    // D2. Start / Resume timer
    if (/\b(start timer|resume timer|play timer|unpause timer|start the timer)\b/i.test(command)) {
        dispatch(utilAction.setPaused(false));
        ok('Timer started');
        return;
    }

    // D3. Pause timer
    if (/\b(pause timer|pause the timer|stop timer|halt timer)\b/i.test(command)) {
        dispatch(utilAction.setPaused(true));
        ok('Timer paused');
        return;
    }

    // D4. Stop / Reset timer
    if (/\b(stop timer|reset timer|clear timer|cancel timer)\b/i.test(command)) {
        dispatch(utilAction.setTime(0));
        dispatch(utilAction.setPaused(false));
        dispatch(utilAction.setActiveId(null));
        ok('Timer stopped');
        return;
    }

    // ── E. NEXT QUEUE ITEM (FR-3.14) ────────────────────────────────────────
    if (/\b(next item|next queue|next agenda|next segment|next service item)\b/i.test(command)) {
        const list = agendaRef.current || [];
        if (list.length === 0) { warn('No agenda items'); return; }
        const currentIdx = list.findIndex(i => i._id === activeIdRef.current);
        const nextItem = list[currentIdx + 1] || list[0]; // wrap to first
        dispatch(utilAction.setEventMode(false));
        dispatch(utilAction.setTime(Number(nextItem.time) || 0));
        dispatch(utilAction.setActiveId(nextItem._id));
        dispatch(utilAction.setPaused(false));
        ok(`Queue: ${nextItem.agenda || 'Next item'}`);
        return;
    }

    // ── F. HIGHLIGHT RANGE (FR-3.21-22) ─────────────────────────────────────
    const rangeMatch = command.match(/\b(?:mark|highlight) from (.+?) to (?:the end|end)\b/i);
    const rangeMatch2 = command.match(/\b(?:mark|highlight) from (.+) to (.+)\b/i);
    if (rangeMatch && currentVerseFullTextRef.current) {
        return performRangeHighlight(rangeMatch[1].trim(), null); // to end
    }
    if (rangeMatch2 && currentVerseFullTextRef.current) {
        return performRangeHighlight(rangeMatch2[1].trim(), rangeMatch2[2].trim());
    }

    // ── G. HIGHLIGHT WORD (FR-3.21) ─────────────────────────────────────────
    const hlMatch = command.match(/\b(highlight|yellow|mark the word|mark|i\s+like|i\s+life|highly)\b\s+(.+)\b/i);
    if (hlMatch) {
        const wordsToMark = hlMatch[2].trim();
        if (currentVerseFullTextRef.current && wordsToMark) return performHighlight(wordsToMark);
    }

    // ── H. UNMARK WORD (FR-3.21) ─────────────────────────────────────────────
    const unmarkMatch = command.match(/\b(remove the word|unmark the word|clear the word|unmark|remove highlight|unhighlight|delete mark|on mark|off mark|unmar)\b\s+(.+)\b/i);
    if (unmarkMatch) {
        const wordsToUnmark = unmarkMatch[2].trim();
        if (currentVerseFullTextRef.current && wordsToUnmark) return performUnmark(wordsToUnmark);
    }

    // ── I. CLEAR ALL HIGHLIGHTS (FR-3.21) ───────────────────────────────────
    if (/\b(clear highlights|unmark all|remove all highlights|clear all marks)\b/i.test(command)) {
        if (currentVerseTitleRef.current) {
            highlightCacheRef.current[currentVerseTitleRef.current] = { words: {}, ranges: [] };
            updateDisplay();
            ok('Highlights cleared');
        }
        return;
    }

    // ── J. NEXT / PREVIOUS VERSE (FR-3.14) ──────────────────────────────────
    // Must check AFTER timer/queue so "next item" doesn't match here
    if (/\b(next verse|next one|forward|go forward)\b/i.test(command) ||
        (command === 'next' && currentRefStateRef.current)) {
        if (currentRefStateRef.current) return navigateRelative(1);
        else { warn('No verse context for "next" — open a verse first'); return; }
    }
    if (/\b(previous verse|previous|go back|last verse|back one)\b/i.test(command)) {
        if (currentRefStateRef.current) return navigateRelative(-1);
        else { warn('No verse context for "previous" — open a verse first'); return; }
    }


    // ── K. FOLLOW MODE COMMANDS ─────────────────────────────────────────────
    if (/\b(start following|follow me|follow voice|enable follow|start follow)\b/i.test(command)) {
        setIsFollowMode(true);
        ok('Follow mode active');
        return;
    }
    if (/\b(stop following|stop follow|disable follow|end follow)\b/i.test(command)) {
        setIsFollowMode(false);
        ok('Follow mode stopped');
        return;
    }

    // ── L. BIBLE REFERENCE — Smart 4-pass matcher (FR-3.14, FR-3.15) ────────
    // Delegates to smartBibleMatch.js which handles:
    //  Pass 1: Exact alias match        ("john 3 16", "gen 1")
    //  Pass 2: Phonetic + Levenshtein   ("Jonah" heard as "Yona", "Filemon" → Philemon)
    //  Pass 3: Keyword content search   ("for God so loved" → John 3:16)
    //  Pass 4: Context-only jump        ("verse 5", "chapter 4" with active context)
    const currentBooks = booksRef.current || [];
    setDebugText(`[MATCH] Resolving: "${command}"`);

    const matchResult = preMatch || await smartBibleMatch(
        command,
        currentBooks,
        window.electron?.Bible || null,
        currentRefStateRef.current
    );

    if (matchResult) {
        const { bookIndex, chapter, startVerse, endVerse, matchType, searchResults } = matchResult;

        const bookName = currentBooks[bookIndex]?.name || '?';
        const verseRef = `${bookName} ${chapter}:${startVerse}${endVerse !== startVerse ? '-' + endVerse : ''}`;

        // Deduplication guard — FR-3.17
        const now = Date.now();
        if (isAuto && currentVerseTitleRef.current === verseRef && (now - lastTriggeredTimeRef.current) < 10000) {
            setDebugText(`[SKIP] Already showing ${verseRef}`);
            return;
        }
        lastTriggeredTimeRef.current = now;

        // If matched by keyword search, show the top results as "Did you mean?" options
        if (matchType === 'keyword_search' && searchResults && searchResults.length > 1) {
            const candidates = searchResults.slice(1, 3).map(r => {
                const b = currentBooks.find(bk => bk.id === r.book_id);
                return b ? `${b.name} ${r.chapter}:${r.verse}` : null;
            }).filter(Boolean);
            if (candidates.length) {
                setDidYouMean({ text: command, candidate: candidates[0], extraCandidates: candidates });
            }
        }

        setDebugText(`[${matchType.toUpperCase()}] Fetching ${verseRef}...`);

        try {
            const verses = await window.electron.Bible.getChapter(
                currentBibleVersionRef.current || 'kjv', bookIndex, chapter
            );

            if (verses && verses.length > 0) {
                const indices = new Set();
                for (let v = startVerse; v <= endVerse; v++) {
                    if (v - 1 >= 0 && v - 1 < verses.length) indices.add(v - 1);
                }

                if (indices.size > 0) {
                    const sortedIndices = Array.from(indices).sort((a, b) => a - b);
                    const resultText = sortedIndices.map(i => verses[i] || '').join(' ');

                    setDebugText(`✅ Sent: ${verseRef} [${matchType}]`);
                    pushVoiceEvent(`✅ ${verseRef}`);
                    playFeedback('success');
                    if (matchType !== 'keyword_search') setDidYouMean(null);

                    currentVerseTitleRef.current = verseRef;
                    currentVerseFullTextRef.current = resultText;

                    const finalHTML = applyHighlights(verseRef, resultText);
                    window.electron.Presentation.setContent({
                        type: 'bible',
                        data: { title: verseRef, body: finalHTML }
                    });

                    currentRefStateRef.current = {
                        bookIndex,
                        bookName,
                        chapter,
                        verse: startVerse
                    };

                    window.dispatchEvent(new CustomEvent('voice-bible-sync', {
                        detail: {
                            version: currentBibleVersionRef.current || 'kjv',
                            bookIndex,
                            chapterIndex: chapter - 1,
                            indices: sortedIndices
                        }
                    }));

                    if (window.electron.Bible.sync) {
                        window.electron.Bible.sync({
                            version: currentBibleVersionRef.current || 'kjv',
                            bookIndex,
                            chapterIndex: chapter - 1
                        });
                    }
                } else {
                    setDebugText(`Error: Verse range empty for ${verseRef}`);
                }
            } else {
                setDebugText(`Error: DB returned 0 verses for ${verseRef}`);
            }
        } catch (err) {
            console.error('Error setting Bible from voice', err);
            setDebugText(`Error: ${err.message}`);
        }
    } else {
        // No match found — FR-3.19: show top-3 "Did you mean?" suggestions
        const suggestions = getBookSuggestions(command, currentBooks);
        const suggestion = suggestions[0]?.name || null;
        setDebugText(`No match: "${command}"${suggestion ? ` — did you mean ${suggestion}?` : ''}`);
        pushVoiceEvent(`❌ No match: "${command}"`);
        playFeedback('error');
        if (suggestion) setDidYouMean({ text: command, candidate: suggestion });
    }
  };


  const navigateRelative = async (direction) => {
    if (!currentRefStateRef.current) return;
    const { bookIndex, bookName, chapter, verse } = currentRefStateRef.current;
    
    setDebugText(`[NAV] Calculating ${direction > 0 ? 'next' : 'previous'} relative to ${bookName} ${chapter}:${verse}`);

    let targetVerse = verse + direction;
    let targetChapter = chapter;
    let targetBookIndex = bookIndex;

    try {
        const currentBooks = booksRef.current;
        let verses = await window.electron.Bible.getChapter('kjv', targetBookIndex, targetChapter);
        
        if (direction > 0 && targetVerse > verses.length) {
            // Move to Next Chapter
            targetChapter++;
            targetVerse = 1;
            verses = await window.electron.Bible.getChapter('kjv', targetBookIndex, targetChapter);
            
            if (!verses || verses.length === 0) {
                // Move to Next Book
                targetBookIndex++;
                if (targetBookIndex >= currentBooks.length) targetBookIndex = 0; // Wrap to Genesis
                targetChapter = 1;
                targetVerse = 1;
            }
        } else if (direction < 0 && targetVerse < 1) {
            // Move to Previous Chapter
            targetChapter--;
            if (targetChapter < 1) {
                // Move to Previous Book
                targetBookIndex--;
                if (targetBookIndex < 0) targetBookIndex = currentBooks.length - 1; // Wrap to Revelation
                
                // Jump to Chapter 1, Verse 1 of previous book
                targetChapter = 1;
                targetVerse = 1;
            } else {
                // Jump to end of previous chapter
                verses = await window.electron.Bible.getChapter('kjv', targetBookIndex, targetChapter);
                targetVerse = verses.length;
            }
        }

        const newBookName = currentBooks[targetBookIndex].name;
        const newVerseRef = `${newBookName} ${targetChapter}:${targetVerse}`;
        
        const finalVerses = await window.electron.Bible.getChapter('kjv', targetBookIndex, targetChapter);
        const verseText = finalVerses[targetVerse - 1] || "";

        setDebugText(`[NAV] Showing: ${newVerseRef}`);

        currentRefStateRef.current = {
            bookIndex: targetBookIndex,
            bookName: newBookName,
            chapter: targetChapter,
            verse: targetVerse
        };
        
        currentVerseTitleRef.current = newVerseRef;
        currentVerseFullTextRef.current = verseText;

        // Apply highlights before presenting
        const finalHTML = applyHighlights(newVerseRef, verseText);

        window.electron.Presentation.setContent({
            type: 'bible',
            data: { title: newVerseRef, body: finalHTML }
        });
    } catch (err) {
        console.error("Navigation error", err);
    }
  };

  const performHighlight = (phrase) => {
    if (!currentVerseFullTextRef.current) return;
    pruneHighlights();
    
    const vocalWords = phrase.split(/\s+(?:and)\s+|\s+/i).filter(w => w.length > 0);
    const title = currentVerseTitleRef.current;
    
    if (!highlightCacheRef.current[title]) {
        highlightCacheRef.current[title] = { words: {}, ranges: [] };
    }
    const verseCache = highlightCacheRef.current[title];
    if (!verseCache.words) verseCache.words = {};

    const marked = [];
    vocalWords.forEach(vocal => {
        const fuzzy = getFuzzyMatch(vocal, currentVerseFullTextRef.current);
        if (fuzzy) {
            verseCache.words[fuzzy] = Date.now();
            marked.push(fuzzy);
        }
    });

    setDebugText(`[MARK] ${marked.join(', ')}`);
    updateDisplay();
  };

  const performRangeHighlight = (startVocal, endVocal) => {
    if (!currentVerseFullTextRef.current) return;
    pruneHighlights();

    const text = currentVerseFullTextRef.current;
    const title = currentVerseTitleRef.current;
    const key = title.toUpperCase();
    
    // 1. Get tokens
    const tokens = getTokens(text);
    const tokensClean = tokens.map(t => t.toLowerCase().replace(/[.,:;!?(){}\[\]]/g, '').trim());

    // 2. Find fuzzy matches
    const startMatch = getFuzzyMatch(startVocal, text);
    const isToEnd = !endVocal || (endVocal && endVocal.match(/\b(the end|last|last word|the last)\b/i));
    const endMatch = isToEnd ? null : getFuzzyMatch(endVocal, text);

    if (!startMatch || (!endMatch && !isToEnd)) {
        setDebugText(`[RANGE] Error: Could not find ${!startMatch ? startVocal : endVocal}`);
        return;
    }

    // 3. Find token indices
    const startIdx = tokensClean.indexOf(startMatch);
    let endIdx;
    if (isToEnd) {
        endIdx = tokens.length - 1;
    } else {
        // Find the end match AFTER the start index
        endIdx = tokensClean.indexOf(endMatch, startIdx);
        if (endIdx === -1) endIdx = tokensClean.lastIndexOf(endMatch);
    }

    if (startIdx === -1 || (endIdx === -1 && !isToEnd)) {
        setDebugText(`[RANGE] Index Error: ${startIdx} -> ${endIdx}`);
        return;
    }

    const finalStart = Math.min(startIdx, endIdx);
    let finalEnd = Math.max(startIdx, endIdx);

    // 4. Trail-Swallow: Include punctuation immediately following the end word
    while (finalEnd + 1 < tokens.length) {
        const nextToken = tokens[finalEnd + 1];
        if (nextToken.match(/^[.,:;!?(){}\[\]]+$/)) {
            finalEnd++;
        } else {
            break;
        }
    }

    // 5. Update Cache
    if (!highlightCacheRef.current[key]) {
        highlightCacheRef.current[key] = { words: {}, ranges: [] };
    }
    const verseCache = highlightCacheRef.current[key];
    if (!verseCache.ranges) verseCache.ranges = [];

    verseCache.ranges.push({
        start: finalStart,
        end: finalEnd,
        timestamp: Date.now()
    });

    setDebugText(`[RANGE] Success: Marked indices ${finalStart} to ${finalEnd}`);
    updateDisplay();
  };

  const performUnmark = (phrase) => {
    if (!currentVerseFullTextRef.current) return;
    const vocalWords = phrase.split(/\s+(?:and)\s+|\s+/i).filter(w => w.length > 0);
    const title = currentVerseTitleRef.current;
    const key = (title || "").toUpperCase();
    const verseCache = highlightCacheRef.current[key];
    if (!verseCache) return;

    const unmarked = [];
    vocalWords.forEach(vWord => {
        const cleanVocal = vWord.replace(/[.,!?]/g, '').trim().toLowerCase();
        const fuzzy = getFuzzyMatch(cleanVocal, currentVerseFullTextRef.current);
        const target = fuzzy || cleanVocal;
        
        // Check single words
        if (verseCache.words && verseCache.words[target]) {
            delete verseCache.words[target];
            unmarked.push(target);
        }
        // Check if this word is in any ranges and prune them? 
        // For now, let's just support clearing ranges via 'clear highlights'.
    });

    setDebugText(`[UNMARK] ${unmarked.join(', ')}`);
    updateDisplay();
  };

  const updateDisplay = () => {
    const title = currentVerseTitleRef.current;
    const rawText = currentVerseFullTextRef.current;
    if (!title || !rawText) return;

    const finalHTML = applyHighlights(title, rawText);
    window.electron.Presentation.setContent({
        type: 'bible',
        data: { title, body: finalHTML }
    });
  };

  // ── FOLLOW MODE LOGIC ────────────────────────────────────────────────────
  const isFollowModeRef = React.useRef(false);
  
  useEffect(() => {
    isFollowModeRef.current = isFollowMode;
    if (isFollowMode) {
        setDebugText("Follow Mode: Listening for scripture...");
    }
  }, [isFollowMode]);

  return (
    <>
      <div className="w-full h-16 bg-primary flex items-center justify-between px-6 shrink-0 relative z-40">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-light tracking-wide">
            OCS{" "}
            <span className="text-xs font-normal opacity-50 ml-2">
              Controller
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          
          <div className="relative flex items-center gap-2">
            <input 
              type="text" 
              placeholder="Test voice command... (press Enter)"
              className="bg-black/50 text-xs px-2 py-1 rounded outline-none border border-white/10 text-white w-48"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const text = e.currentTarget.value.trim().toLowerCase();
                  setDebugText("Simulated: " + text);
                  let normalizedText = text.replace(/[.,!?]/g, '');
                  if (normalizedText.includes("media")) {
                    const startIdx = normalizedText.indexOf("media");
                    const actualCommand = normalizedText.substring(startIdx + 5).trim();
                    handleVoiceCommand(actualCommand);
                  } else {
                    handleVoiceCommand(normalizedText); 
                  }
                  e.currentTarget.value = "";
                }
              }}
            />
          </div>
          
          <div className="flex flex-col items-center justify-center px-4 border-l border-r border-white/10 h-10">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                voiceStatus === 'ready' ? 'bg-green-500' : 
                voiceStatus === 'listening' ? 'bg-red-500 animate-pulse' : 
                voiceStatus === 'transcribing' ? 'bg-blue-500 animate-spin' : 
                voiceStatus === 'error' ? 'bg-red-700' : 'bg-yellow-500'
              }`} />
              <span className="text-[10px] uppercase font-bold text-white/50">{voiceStatus}</span>
            </div>
            {lastTranscript && (
              <div className="text-[10px] text-blue-400 font-medium truncate max-w-[200px]">
                "{lastTranscript}"
              </div>
            )}
          </div>
            

          <button
            onClick={() => {
              setDebugText("");
              setIsListening(!isListening);
            }}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all text-xs ${
              isListening
                ? "bg-red-500 text-white shadow-lg shadow-red-500/20 animate-pulse"
                : "bg-white/5 text-light border border-white/10 hover:bg-white/10"
            }`}
            title={isListening ? "Stop Voice Commands" : "Start Voice Commands (say 'Media <scripture>')"}
          >
            <PiMicrophone size={16} className={isListening ? "text-white" : "text-gray-400"} />
            {isListening ? "Listening..." : "Voice"}
          </button>

          <div className="relative">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all border text-xs ${
                previewMode
                  ? "bg-white text-primary border-white shadow-lg"
                  : "bg-transparent text-light border-white/20 hover:bg-white/10"
              }`}
            >
              {previewMode ? <PiEye size={18} /> : <PiEyeSlash size={18} />}
              {previewMode
                ? `${previewMode === "speaker" ? "Speaker" : "General"} Preview`
                : "Show Preview"}
              <PiCaretDown
                size={14}
                className={`transition-transform ${
                  isDropdownOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {isDropdownOpen && (
              <div className="absolute top-full right-0 mt-2 w-48 bg-primary border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col">
                <button
                  onClick={() => {
                    onSetPreviewMode("speaker");
                    setIsDropdownOpen(false);
                  }}
                  className={`px-4 py-3 text-left text-xs hover:bg-white/10 transition-colors flex items-center gap-2 ${
                    previewMode === "speaker"
                      ? "text-green-400 font-medium"
                      : "text-light"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-green-500 opacity-80" />
                  Speaker View
                </button>
                <button
                  onClick={() => {
                    onSetPreviewMode("general");
                    setIsDropdownOpen(false);
                  }}
                  className={`px-4 py-3 text-left text-xs hover:bg-white/10 transition-colors flex items-center gap-2 ${
                    previewMode === "general"
                      ? "text-green-400 font-medium"
                      : "text-light"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-blue-500 opacity-80" />
                  General View
                </button>
                {previewMode && (
                  <button
                    onClick={() => {
                      onSetPreviewMode(null);
                      setIsDropdownOpen(false);
                    }}
                    className="px-4 py-3 text-left hover:bg-red-500/20 text-red-400 transition-colors border-t border-white/10 flex items-center gap-2"
                  >
                    <PiEyeSlash size={14} />
                    Hide Preview
                  </button>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => setIsConnectModalOpen(true)}
            className="flex items-center justify-center text-assent-200 gap-1 bg-assent2-100 hover:bg-light text-primary px-3 py-2 rounded-lg font-medium transition-all text-xs capitalize hover:shadow-lg hover:shadow-blue-500/10"
            title="Connect Remote"
          >
            <div className="flex items-center justify-center rounded-[5px]">
              <MdOutlineConnectedTv size={18}/>
            </div>
            Remote
          </button>
          <button
            onClick={() => {
              electron.Timer.setTimer(null);
              electron.Presentation.setContent(null);
            }}
            className="flex items-center justify-center text-assent2-500 gap-2 bg-assent2-300 hover:bg-red-500/20 text-red-500 px-4 py-2 rounded-lg font-medium transition-all text-xs capitalize hover:shadow-lg hover:shadow-red-500/10"
            title="Reset to Default (OCS Logo)"
          >
            <div className="flex items-center justify-center rounded-[5px]">
              <MdOutlineResetTv size={18}/>
            </div>
            Reset Display
          </button>

          <button
            onClick={() => {
              // Cycle off then on to re-initialize the audio engine
              setIsListening(false);
              setDebugText("Engine Rebooting...");
              setTimeout(() => setIsListening(true), 400);
            }}
            className="flex items-center justify-center text-blue-500 gap-2 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-2 rounded-lg font-medium transition-all text-xs"
            title="Re-initialize Microphone and AI"
          >
            <PiBroadcast size={16} />
            Sync
          </button>

          <button
            onClick={onGoLive}
            className="flex items-center justify-center gap-2 bg-red hover:bg-red/90 text-xs capitalize text-white px-6 py-2 rounded-lg font-medium transition-all shadow-lg hover:shadow-red/20 active:scale-95"
          >
            <PiBroadcast size={15} />
            Go Live
          </button>
        </div>
      </div>

      {/* FR-3.19: Did You Mean? Banner */}
      {didYouMean && (
        <div className="fixed bottom-8 left-0 right-0 flex items-center justify-center z-[9998] pointer-events-auto">
          <div className="flex items-center gap-3 bg-amber-500/20 border border-amber-500/50 rounded-xl px-5 py-2 shadow-lg backdrop-blur-sm font-mono text-xs text-amber-300">
            <span className="text-amber-400">❓</span>
            <span>Did you mean <strong className="text-white">{didYouMean.candidate}</strong>?</span>
            <button
              onClick={() => { handleVoiceCommand(`${didYouMean.candidate} ${didYouMean.text.replace(didYouMean.text.split(' ')[0], '').trim()}`, true); setDidYouMean(null); }}
              className="bg-amber-500 text-black px-3 py-0.5 rounded-lg text-[10px] font-bold hover:bg-amber-400 transition-colors"
            >Yes</button>
            <button
              onClick={() => setDidYouMean(null)}
              className="text-white/40 hover:text-white/70 transition-colors"
            >Dismiss</button>
          </div>
        </div>
      )}

      {/* FR-3.25: Global Voice Console - Fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-black/95 border-t border-white/10 z-[9999] font-mono">
        {/* Main status row */}
        <div className="flex items-center h-8 px-4 gap-3 pointer-events-none overflow-hidden">

          {/* Engine badge — Python 🐍 or WASM 🌐 */}
          <div className={`flex items-center gap-1.5 border-r border-white/10 pr-3 flex-shrink-0`}>
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              voiceStatus === 'ready'        ? 'bg-green-500' :
              voiceStatus === 'listening'    ? 'bg-red-500 animate-pulse' :
              voiceStatus === 'transcribing' ? 'bg-blue-500 animate-ping' :
              voiceStatus === 'error'        ? 'bg-red-700' : 'bg-yellow-500 animate-pulse'
            }`} />
            <span className="text-white/60 uppercase text-[10px]">{voiceStatus}</span>
            {voiceEngine && (
              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ml-1 ${
                voiceEngine === 'python'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}>
                {voiceEngine === 'python' ? '🐍 Python' : '🌐 WASM'}
              </span>
            )}
          </div>

          {/* VAD + volume + spectral */}
          <div className="flex items-center gap-2 border-r border-white/5 pr-3 flex-shrink-0">
            <span className={`text-[8px] px-1.5 rounded font-bold ${
              isSpeakingUI ? 'bg-green-500 text-black' : 'bg-white/10 text-white/30'
            }`}>{isSpeakingUI ? 'VOICE' : 'WAIT'}</span>
            <span className="text-white/30 text-[9px]">VOL {(rmsVolume * 100).toFixed(0)}%</span>
            {spectralInfo.voicingScore > 0 && (
              <span className={`text-[8px] ${spectralInfo.voicingScore > 0.3 ? 'text-green-400/60' : 'text-white/20'}`}>
                V:{(spectralInfo.voicingScore * 100).toFixed(0)}%
              </span>
            )}
          </div>

          {/* Confidence badge */}
          {lastConfidence !== null && (
            <div className="flex items-center gap-1 border-r border-white/5 pr-3 flex-shrink-0">
              <span className="text-white/30 text-[9px]">CONF</span>
              <span className={`text-[9px] font-bold ${
                lastConfidence >= CONFIDENCE_THRESHOLD ? 'text-green-400' : 'text-red-400'
              }`}>{(lastConfidence * 100).toFixed(0)}%</span>
            </div>
          )}

          {/* HEARD */}
          <div className="flex items-center gap-1 border-r border-white/5 pr-3 min-w-0 flex-shrink">
            <span className="text-white/30 text-[9px] italic flex-shrink-0">HEARD:</span>
            <span className="text-blue-400 text-[9px] truncate">{lastTranscript || '—'}</span>
          </div>

          {/* CONTEXT */}
          <div className="flex items-center gap-1 border-r border-white/5 pr-3 flex-shrink-0">
            <span className="text-white/30 text-[9px] italic">CTX:</span>
            <span className="text-yellow-400 text-[9px]">{activeVerseContext || 'NONE'}</span>
          </div>

          {/* LOG */}
          <div className="flex-1 overflow-hidden min-w-0">
            <span className="text-white/20 text-[9px] mr-1">LOG:</span>
            <span className="text-red-400 text-[9px] truncate">{debugText || 'Idle'}</span>
          </div>

          {/* Books count */}
          <div className="text-white/20 text-[9px] flex-shrink-0">BOOKS: {books.length}</div>
        </div>

        {/* Event log strip — FR-3.25 last 5 events */}
        {voiceEvents.length > 0 && (
          <div className="border-t border-white/5 px-4 py-0.5 flex items-center gap-3 overflow-x-auto pointer-events-none">
            {voiceEvents.slice(0, 5).map((ev, i) => (
              <span key={i} className={`text-[8px] whitespace-nowrap ${
                i === 0 ? 'text-white/60' : 'text-white/20'
              }`}>{ev}</span>
            ))}
          </div>
        )}
      </div>


      {/* Connect Modal */}
      {isConnectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#1e1e1e] w-[90%] max-w-[70%] h-[80%] rounded-2xl border border-white/10 shadow-2xl overflow-hidden relative flex flex-col animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsConnectModalOpen(false)}
              className="absolute top-4 right-4 p-2 bg-white/5 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-all z-10"
            >
              <PiX size={20} />
            </button>

            <div className="flex-1 overflow-auto">
              <MobileConnectController />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
