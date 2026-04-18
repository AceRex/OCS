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
  
  const workerRef = React.useRef(null);
  const audioCtxRef = React.useRef(null);
  const rollingBufferRef = React.useRef(new Float32Array(16000 * 5)); // 5 seconds is enough context for Bible verses
  const bufferPtrRef = React.useRef(0);
  const isProcessingRef = React.useRef(false);
  const lastTriggeredTimeRef = React.useRef(0);
  const currentRefStateRef = React.useRef(null); // { bookIndex, chapter, verse }
  const currentVerseTitleRef = React.useRef("");
  const currentVerseFullTextRef = React.useRef("");
  const streamRef = React.useRef(null);
  const workletNodeRef = React.useRef(null);
  const sourceNodeRef = React.useRef(null);
  const activeWatchdogRef = React.useRef(null);
  const isSpeakingRef = React.useRef(false);
  const lastSpeechTimeRef = React.useRef(0);
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
          
          if (!text) {
              setDebugText("Monitoring - Silence");
              return;
          }
          
          setDebugText(`AI Heard: "${text}"`);
          
          const mediaMatch = lowerText.match(/\bmedia\b/i);
          const nextMatch = lowerText.match(/\b(next verse|next one|forward|previous verse|go back|last verse)\b/i);

          if (mediaMatch) {
            const startIdx = mediaMatch.index;
            // Strip punctuation and "media" keyword to get the raw command
            const actualCommand = lowerText.substring(startIdx + 5)
                                          .replace(/[.,:;!?]/g, ' ')
                                          .trim();
            handleVoiceCommand(actualCommand, true); 
          } else if (nextMatch) {
            // Trigger navigation even without the "Media" keyword
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
        setVoiceStatus("ready");
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

             // 3. Load Worklet
             await audioCtx.audioWorklet.addModule(new URL('../workers/audio.processor.js', import.meta.url));
             
             const source = audioCtx.createMediaStreamSource(stream);
             sourceNodeRef.current = source;
             const workletNode = new AudioWorkletNode(audioCtx, 'audio-processor');
             workletNodeRef.current = workletNode;

             // Connect chain: Source -> HP Filter -> AI Processor
             source.connect(hpFilter);
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
                if (isSpeaking) {
                   isSpeakingRef.current = true;
                   lastSpeechTimeRef.current = now;
                   setIsSpeakingUI(true);
                } else {
                   // Stay "Speaking" for 1.5s after noise stops
                   if (now - lastSpeechTimeRef.current > 800) {
                       isSpeakingRef.current = false;
                       setIsSpeakingUI(false);
                   }
                }
             };

             source.connect(workletNode);
             
             // 4. Ensure engine is active
             await audioCtx.resume();
             
             setVoiceStatus("listening");
             setDebugText("Monitoring - Listening...");

             // 5. Intelligent Recursive Feedback Loop
             const runInference = () => {
                if (!isListening || !workerRef.current) return;
                if (isProcessingRef.current) return;

                // VAD Check: Skip if silent
                if (!isSpeakingRef.current) {
                    setDebugText("VAD: Silence - Sleeping...");
                    return;
                }
                
                isProcessingRef.current = true;
                setVoiceStatus("transcribing");
                
                // Watchdog: If worker takes > 8s, reset the flag
                const watchdog = setTimeout(() => {
                    if (isProcessingRef.current) {
                        console.warn("AI Watchdog triggered - Resetting lane");
                        isProcessingRef.current = false;
                        setVoiceStatus("listening");
                    }
                }, 8000);

                const audioData = new Float32Array(rollingBufferRef.current);
                setDebugText(`AI: Analyzing ${audioData.length} samples...`);
                workerRef.current.postMessage({ type: 'transcribe', audio: audioData });
                
                // Store watchdog to clear if needed
                activeWatchdogRef.current = watchdog;
             };

             // Initial kick-off
             interval = setInterval(runInference, 500); // Check every 0.5s for activity for hyper-responsiveness


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

    // 1a. Check for Highlight command
    // Added "i like", "i life", and "mark the word" for better AI matching
    const hlMatch = command.match(/\b(highlight|yellow|mark the word|mark|i\s+like|i\s+life|highly)\b\s+(.+)\b/i);
    if (hlMatch) {
        const wordsToHighlight = hlMatch[2].trim();
        if (currentVerseFullTextRef.current && wordsToHighlight) {
            return performHighlight(wordsToHighlight);
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
              window.electron.Presentation.setContent({
                  type: 'bible',
                  data: { title: verseRef, body: resultText }
              });
              
              // Track current state for relative navigation and highlighting
              currentVerseTitleRef.current = verseRef;
              currentVerseFullTextRef.current = resultText;
              
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
        window.electron.Presentation.setContent({
            type: 'bible',
            data: { title: newVerseRef, body: verseText }
        });

        currentRefStateRef.current = {
            bookIndex: targetBookIndex,
            bookName: newBookName,
            chapter: targetChapter,
            verse: targetVerse
        };
        
        currentVerseTitleRef.current = newVerseRef;
        currentVerseFullTextRef.current = verseText;
    } catch (err) {
        console.error("Navigation error", err);
    }
  };

  const performHighlight = (phrase) => {
    if (!currentVerseFullTextRef.current) return;
    
    // Split phrase by "and" or spaces to catch multiple words
    const words = phrase.split(/\s+(?:and)\s+|\s+/i).filter(w => w.length > 0);
    setDebugText(`[HL] Highlighting: ${words.join(', ')}`);
    
    let updatedText = currentVerseFullTextRef.current;

    words.forEach(word => {
        // Clean word of punctuation for matching
        const cleanWord = word.replace(/[.,!?]/g, '').trim();
        if (!cleanWord || cleanWord.length < 2) return;

        // Use regex to wrap word in mark tags
        const escapedWord = cleanWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedWord})`, 'gi');
        
        updatedText = updatedText.replace(
            regex, 
            '<mark style="background-color: #ffd700; color: #000; padding: 0 4px; border-radius: 4px; font-weight: bold;">$1</mark>'
        );
    });
    
    // Update memory so we can highlight something else on top
    currentVerseFullTextRef.current = updatedText;

    window.electron.Presentation.setContent({
        type: 'bible',
        data: { 
            title: currentVerseTitleRef.current, 
            body: updatedText 
        }
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
                setIsListening(false);
                setTimeout(() => setIsListening(true), 200);
                setDebugText("System Resyncing...");
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
               <div className="flex items-center gap-1 min-w-[80px]">
                  <div className={`w-1 h-3 rounded-full transition-colors ${isSpeakingUI ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-white/10'}`} />
                  <span className="text-white/30 uppercase text-[8px]">RMS: {(rmsVolume * 100).toFixed(1)}%</span>
               </div>
              <div className="text-blue-400 whitespace-nowrap">
                  <span className="text-white/30 mr-1">HEARD:</span>
                  {lastTranscript || "None"}
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
