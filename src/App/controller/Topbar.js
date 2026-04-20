import React, { useState, useEffect } from "react";
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

export default function Topbar({ onGoLive, previewMode, onSetPreviewMode }) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
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
  const [rmsVolume, setRmsVolume] = useState(0);
  const [isSpeakingUI, setIsSpeakingUI] = useState(false);

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
          setDebugText(`Loading AI: ${Math.round(msg.progress)}%`);
      } else if (msg.status === 'ready') {
          console.log("Whisper worker ready");
          setVoiceStatus("ready");
      } else if (msg.status === 'result') {
          // Clear watchdog if it's still running
          if (activeWatchdogRef.current) clearTimeout(activeWatchdogRef.current);

          const text = msg.text.trim();
          const lowerText = text.toLowerCase();
          setLastTranscript(text);
          isProcessingRef.current = false;
          setVoiceStatus("listening");
          
          const debugInfo = msg.debug || {};
          const duration = (debugInfo.duration || 0).toFixed(1);
          setDebugText(`AI heard ${duration}s | vol=${(debugInfo.vol || 0).toFixed(3)} | Heard: "${text}"`);
          
          if (!text) {
              return;
          }
          
          // Broad alias list — Whisper-tiny often mishears "media" as these words
          const triggerKeywords = [
            'media', 'meeting', 'meter', 'medium', 'video', 'median',
            'media,', 'meeting,', // with punctuation
            'me the', 'need a', 'meet a', // space-split mishears
          ];
          
          let triggerIdx = -1;
          let triggerLen = 0;
          for (const kw of triggerKeywords) {
            const idx = lowerText.indexOf(kw);
            if (idx !== -1) {
              triggerIdx = idx;
              triggerLen = kw.length;
              break;
            }
          }

          const nextMatch = lowerText.match(/\b(next verse|next one|next|forward|previous verse|go back|last verse|go to next|go next)\b/i);

          if (triggerIdx !== -1) {
            // Strip punctuation and trigger keyword to get the raw command
            const actualCommand = lowerText.substring(triggerIdx + triggerLen)
                                          .replace(/[.,:;!?]/g, ' ')
                                          .trim();
            handleVoiceCommand(actualCommand, true); 
          } else if (nextMatch) {
            // Trigger navigation even without the trigger keyword
            handleVoiceCommand(nextMatch[0], true);
          }
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
                const { audio, isSpeaking, rms } = event.data;
                const buffer = rollingBufferRef.current;
                
                // Shift and append
                buffer.set(buffer.subarray(audio.length));
                buffer.set(audio, buffer.length - audio.length);

                // Update VAD state
                setRmsVolume(rms);
                 const now = Date.now();
                 // 1. Maintain Pre-Roll History (500ms ≈ 4 chunks)
                 preRollBufferRef.current.push(new Float32Array(audio));
                 if (preRollBufferRef.current.length > 5) {
                    preRollBufferRef.current.shift();
                 }

                 // 2. Logic for Speech Capture
                 if (isSpeaking) {
                    // Start of speech detection
                    if (!isSpeakingRef.current) {
                        isSpeakingRef.current = true;
                        setIsSpeakingUI(true);
                        firstSpeechTimeRef.current = now;
                        // PREPEND Pre-roll for clean "Attack"
                        speechBufferRef.current = [...preRollBufferRef.current];
                    }
                    lastSpeechTimeRef.current = now;
                    speechBufferRef.current.push(new Float32Array(audio));

                    // EMERGENCY FORCE-TRIGGER (15s Max)
                    if (now - firstSpeechTimeRef.current > 15000) {
                        console.warn("AI Force Trigger: Max speech duration reached");
                        setDebugText("AI: Forced Release (Noise/Length Limit)");
                        // Reuse the trigger logic below by spoofing a silence transition
                        lastSpeechTimeRef.current = now - 2000; 
                    }
                 } else if (isSpeakingRef.current) {
                    // Capture the "Tail" during silence wait
                    speechBufferRef.current.push(new Float32Array(audio));

                    // Reactive Silence Detection (1.5s pause triggers AI)
                    if (now - lastSpeechTimeRef.current > 1500) {
                        isSpeakingRef.current = false;
                        setIsSpeakingUI(false);
                        
                        // TRIGGER TRANSCRIPTION IMMEDIATELY ON SILENCE
                        if (!isProcessingRef.current && workerRef.current && speechBufferRef.current.length > 0) {
                            isProcessingRef.current = true;
                            setVoiceStatus("transcribing");
                            
                            const watchdog = setTimeout(() => {
                                if (isProcessingRef.current) {
                                    isProcessingRef.current = false;
                                    setVoiceStatus("listening");
                                    speechBufferRef.current = []; 
                                }
                            }, 8000);
                            activeWatchdogRef.current = watchdog;

                            const totalLength = speechBufferRef.current.reduce((acc, chunk) => acc + chunk.length, 0);
                            const finalAudio = new Float32Array(totalLength);
                            let offset = 0;
                            speechBufferRef.current.forEach(chunk => {
                                finalAudio.set(chunk, offset);
                                offset += chunk.length;
                            });
                            
                            speechBufferRef.current = [];

                            workerRef.current.postMessage({ 
                                type: 'transcribe', 
                                audio: finalAudio,
                                prompt: currentVerseFullTextRef.current || ""
                            });
                        }
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

  const handleVoiceCommand = async (text, isAuto = false) => {
    // text here should be the part AFTER "media"
    let command = text.trim().toLowerCase();
    
    // 1. Convert word-numbers to digits (e.g., "one" -> "1")
    const wordNumbers = {
        'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
        'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10',
        'eleven': '11', 'twelve': '12', 'thirteen': '13', 'fourteen': '14', 'fifteen': '15',
        'twenty': '20', 'thirty': '30', 'forty': '40', 'fifty': '50'
    };
    
    Object.keys(wordNumbers).forEach(word => {
        const regex = new RegExp('\\b' + word + '\\b', 'g');
        command = command.replace(regex, wordNumbers[word]);
    });

    const rangeMatch = command.match(/\b(?:mark|highlight) from (.+) to (.+)\b/i);
    if (rangeMatch && currentVerseFullTextRef.current) {
        return performRangeHighlight(rangeMatch[1].trim(), rangeMatch[2].trim());
    }

    // 1b. Check for Highlight command
    const hlMatch = command.match(/\b(highlight|yellow|mark the word|mark|i\s+like|i\s+life|highly)\b\s+(.+)\b/i);
    if (hlMatch) {
        const wordsToMark = hlMatch[2].trim();
        if (currentVerseFullTextRef.current && wordsToMark) {
            return performHighlight(wordsToMark);
        }
    }

    // 1c. Check for Unmark command
    const unmarkMatch = command.match(/\b(remove the word|unmark the word|clear the word|unmark|remove highlight|unhighlight|delete mark|on mark|off mark|unmar|clear)\b\s+(.+)\b/i);
    if (unmarkMatch) {
        const wordsToUnmark = unmarkMatch[2].trim();
        if (currentVerseFullTextRef.current && wordsToUnmark) {
            return performUnmark(wordsToUnmark);
        }
    }

    // 1d. Check for Clear highlights command
    if (command.includes('clear highlights') || command.includes('unmark all')) {
        if (currentVerseTitleRef.current) {
            highlightCacheRef.current[currentVerseTitleRef.current] = { words: {}, ranges: [] };
            updateDisplay();
            return;
        }
    }

    // 1b. Check for relative navigation commands
    if (command.includes('next') || command.includes('forward')) {
        if (currentRefStateRef.current) {
            return navigateRelative(1);
        }
    }
    if (command.includes('previous') || command.includes('back') || command.includes('last')) {
        if (currentRefStateRef.current) {
            return navigateRelative(-1);
        }
    }

    let matchedBook = null;
    let remainingText = "";
    const currentBooks = booksRef.current || [];

    // 1c. NEW: Priority Check for context-based jumps (e.g. "Media verse 26")
    // We do this BEFORE stripping "verse" and "chapter" words
    const isVerseOnly = command.match(/\b(?:go to |jump to |show |)verse\s+(\d+)\b/i);
    const isChapterOnly = command.match(/\b(?:go to |jump to |show |)chapter\s+(\d+)\b/i);
    
    if ((isVerseOnly || isChapterOnly) && currentRefStateRef.current) {
        const { bookIndex, bookName, chapter } = currentRefStateRef.current;
        matchedBook = { id: currentBooks[bookIndex].id, name: bookName, internalBook: currentBooks[bookIndex] };
        
        if (isVerseOnly) {
            remainingText = `${chapter} ${isVerseOnly[1]}`; 
        } else {
            remainingText = `${isChapterOnly[1]} 1`; 
        }
        setDebugText(`[JUMP] Context: ${bookName}. Target: ${isVerseOnly ? 'Verse' : 'Chapter'} ${isVerseOnly ? isVerseOnly[1] : isChapterOnly[1]}`);
    }

    // 1d. Strip filler phrases and keywords for the generic book search
    command = command.replace(/\b(the book of|book of|read|please|open|to|go to|jump to|show)\b/g, ' ').trim();
    command = command.replace(/\b(chapter|verse|verses|v)\b/g, ' ').trim();
    command = command.replace(/\s+/g, ' ');
    
    console.log("Normalizing Voice Target:", command);
    setDebugText(`[1/4] Target: "${command}" (Auto: ${isAuto})`);

    const bookAliases = {
        'gen': 'Genesis', 'ex': 'Exodus', 'lev': 'Leviticus', 'num': 'Numbers', 'deut': 'Deuteronomy',
        'josh': 'Joshua', 'judg': 'Judges', 'sam': 'Samuel', 'kings': 'Kings', 'chron': 'Chronicles',
        'ps': 'Psalms', 'psalm': 'Psalms', 'prov': 'Proverbs', 'eccl': 'Ecclesiastes', 'isa': 'Isaiah',
        'jer': 'Jeremiah', 'lam': 'Lamentations', 'ezek': 'Ezekiel', 'dan': 'Daniel', 'hos': 'Hosea',
        'obad': 'Obadiah', 'mic': 'Micah', 'nah': 'Nahum', 'hab': 'Habakkuk', 'zeph': 'Zephaniah',
        'hag': 'Haggai', 'zech': 'Zechariah', 'mal': 'Malachi', 'matt': 'Matthew', 'rom': 'Romans',
        'cor': 'Corinthians', 'gal': 'Galatians', 'eph': 'Ephesians', 'phil': 'Philippians',
        'col': 'Colossians', 'thess': 'Thessalonians', 'tim': 'Timothy', 'tit': 'Titus',
        'philem': 'Philemon', 'heb': 'Hebrews', 'jam': 'James', 'pet': 'Peter', 'rev': 'Revelation'
    };
    
    // Check for aliases before formal match
    let searchCommand = command;
    Object.keys(bookAliases).forEach(alias => {
        if (searchCommand.startsWith(alias + ' ')) {
            searchCommand = bookAliases[alias].toLowerCase() + searchCommand.substring(alias.length);
        }
    });

    // 2. Fuzzy Matching Logic for Book Names (Only if not already matched by a jump)
    if (!matchedBook) {
        for (const b of currentBooks) {
          const bName = b.name.toLowerCase();
          const aliases = [
            bName, 
            bName.replace('1 ', '1st ').replace('2 ', '2nd ').replace('3 ', '3rd '), 
            bName.replace('1 ', 'first ').replace('2 ', 'second ').replace('3 ', 'third '),
            bName.replace(' ', '')
          ];
          
          for (const alias of aliases) {
            if (searchCommand.startsWith(alias)) {
              if (!matchedBook || alias.length > matchedBook.name.length) {
                matchedBook = { id: b.id, name: b.name, internalBook: b };
                remainingText = searchCommand.substring(alias.length).trim();
              }
            }
          }
        }

        // 2b. Secondary "Sounds Like" pass if no exact match (helps Tiny model)
        if (!matchedBook) {
            const words = searchCommand.split(' ');
            const firstWord = words[0];
            for (const b of currentBooks) {
                const bName = b.name.toLowerCase();
                // Simple check
                if (firstWord.length >= 4 && (bName.startsWith(firstWord.substring(0, 4)) || firstWord.startsWith(bName.substring(0, 4)))) {
                    matchedBook = { id: b.id, name: b.name, internalBook: b };
                    remainingText = words.slice(1).join(' ');
                    break;
                }
            }
        }
    }
  
    if (matchedBook && remainingText) {
      setDebugText(`Matched Book: ${matchedBook.name}. Parsing: ${remainingText}`);
      // Support Chapter only or Chapter:Verse
      const numbersMatch = remainingText.match(/(\d+)(?:[\s:]+(\d+))?(?:[\s]+(?:to|through|and|-|_)[\s]+(\d+))?/i);
      if (numbersMatch) {
        const chapter = parseInt(numbersMatch[1], 10);
        const startVerse = numbersMatch[2] ? parseInt(numbersMatch[2], 10) : 1; 
        let endVerse = startVerse;
        if (numbersMatch[3]) {
          endVerse = parseInt(numbersMatch[3], 10);
        }
  
        const verseRef = `${matchedBook.name} ${chapter}:${startVerse}${endVerse !== startVerse ? '-' + endVerse : ''}`;
        
        // Final deduplication check with 10s timeout
        const now = Date.now();
        const isSameAsLast = currentVerseTitleRef.current === verseRef;
        const wasRecent = (now - lastTriggeredTimeRef.current) < 10000;
        
        if (isAuto && isSameAsLast && wasRecent) {
            setDebugText(`[SKIP] Already showing ${verseRef}`);
            return;
        }
        
        lastTriggeredTimeRef.current = now;

        setDebugText(`[3/4] Fetching ${verseRef} from DB...`);
  
        try {
          const bookIndex = currentBooks.findIndex(b => b.id === matchedBook.id);
          if (bookIndex === -1) {
             setDebugText("Error: Book index not found");
             return;
          }
  
          const verses = await window.electron.Bible.getChapter('kjv', bookIndex, chapter);
          
          if (verses && verses.length > 0) {
            const indices = new Set();
            for (let v = startVerse; v <= endVerse; v++) {
              if (v - 1 >= 0 && v - 1 < verses.length) {
                indices.add(v - 1);
              }
            }
  
            if (indices.size > 0) {
              const sortedIndices = Array.from(indices).sort((a,b) => a-b);
              const resultText = sortedIndices.map(i => verses[i] || "").join(' ');
              setDebugText(`[4/4] Sending to screens: ${verseRef}`);
              
              // Track current state for relative navigation and highlighting
              currentVerseTitleRef.current = verseRef;
              currentVerseFullTextRef.current = resultText;

              // Apply cached highlights before sending
              const finalHTML = applyHighlights(verseRef, resultText);

              window.electron.Presentation.setContent({
                  type: 'bible',
                  data: { title: verseRef, body: finalHTML }
              });
              
              // Track current state for relative navigation
              currentRefStateRef.current = {
                bookIndex: bookIndex,
                bookName: matchedBook.name,
                chapter: chapter,
                verse: startVerse
              };
              
              if (window.electron.Bible.sync) {
                window.electron.Bible.sync({ version: 'kjv', bookIndex: bookIndex, chapterIndex: chapter - 1 });
              }
            } else {
                setDebugText(`Error: Verse range empty for ${verseRef}`);
            }
          } else {
              setDebugText(`Error: DB returned 0 verses for ${verseRef}`);
          }
        } catch (err) {
          console.error("Error setting Bible from voice", err);
          setDebugText(`Error catch: ${err.message}`);
        }
      } else {
          setDebugText(`Error: No numbers matched in [${remainingText}]`);
      }
    } else if (matchedBook) {
       setDebugText(`Error: Could not find numbers in [${remainingText}]`);
    } else {
       setDebugText(`Error: No book matched in [${command}]`);
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
    const isToEnd = endVocal.match(/\b(the end|last|last word|the last)\b/i);
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

      {/* Global Voice Console - Fixed at bottom for debugging */}
      <div className="fixed bottom-0 left-0 right-0 h-8 bg-black/90 border-t border-white/10 flex items-center px-4 gap-4 z-[9999] font-mono text-[10px] pointer-events-none">
          <div className="flex items-center gap-2 border-r border-white/10 pr-4">
              <div className={`w-2 h-2 rounded-full ${
                voiceStatus === 'ready' ? 'bg-green-500' : 
                voiceStatus === 'listening' ? 'bg-red-500 animate-pulse' : 
                voiceStatus === 'transcribing' ? 'bg-blue-500 animate-spin' : 
                voiceStatus === 'error' ? 'bg-red-700' : 'bg-yellow-500'
              }`} />
              <span className="text-white/70 uppercase">Status: {voiceStatus}</span>
          </div>
          
          <div className="flex-1 flex gap-4 overflow-hidden">
               <div className="flex items-center gap-1 min-w-[80px] border-r border-white/5 pr-4">
                  <span className={`text-[8px] px-1 rounded ${isSpeakingUI ? 'bg-green-500 text-black' : 'bg-white/10 text-white/30'}`}>
                    {isSpeakingUI ? 'VOICE' : 'WAITING'}
                  </span>
                  <span className="text-white/30 uppercase text-[8px] ml-1">vol: {(rmsVolume * 100).toFixed(1)}%</span>
               </div>
              <div className="text-blue-400 whitespace-nowrap">
                  <span className="text-white/30 mr-1 italic underline">HEARD:</span>
                  {lastTranscript || "None"}
              </div>
               <div className="text-yellow-400 whitespace-nowrap border-x border-white/5 px-4 mx-2">
                  <span className="text-white/30 mr-1 italic">CONTEXT:</span>
                  {activeVerseContext || "NONE"}
              </div>
              <div className="text-red-400 whitespace-nowrap overflow-hidden text-ellipsis">
                  <span className="text-white/30 mr-1">LOG:</span>
                  {debugText || "Idle"}
              </div>
          </div>

          <div className="text-white/30 whitespace-nowrap">
              BOOKS: {books.length} | ID: {books.length > 0 ? books[0].id : "N/A"}
          </div>
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
