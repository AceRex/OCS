import { Button } from "../../../components/button";
import React, { useState, useEffect, useRef } from "react";
import { PiCaretDown, PiMagnifyingGlass, PiCheck } from "react-icons/pi";
import { filterBooksFuzzy, resolveBookName } from "./smartBibleMatch";

const versions = {
  kjv: "King James Version (KJV)",
  amp: "Amplified Bible (AMP)",
  net: "New English Translation (NET / NIV)",
  asv: "American Standard Version (ASV / ESV)",
  bbe: "Bible in Basic English (BBE / NLT)",
  web: "World English Bible (WEB)",
  geneva: "Geneva Bible",
  tyndale: "Tyndale Bible",
  coverdale: "Coverdale Bible",
  bishops: "Bishops' Bible",
  kjv_strongs: "KJV w/ Strong's",
};

// Custom Searchable Dropdown Component
const SearchableDropdown = ({
  options,
  value,
  onChange,
  label,
  placeholder = "Search...",
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter options
  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(search.toLowerCase()),
  );

  const selectedLabel =
    options.find((opt) => opt.value === value)?.label || value;

  return (
    <div
      className={`flex flex-col gap-1 relative ${className}`}
      ref={dropdownRef}
    >
      <label className="text-[10px] font-semibold text-ash uppercase">
        {label}
      </label>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg- border border-light/10 rounded-[12px] rounded p-2 text-light outline-none flex items-center justify-between hover:border-light/40 transition-colors text-left truncate"
      >
        <span className="truncate pr-2 text-[14px]">{selectedLabel}</span>
        <PiCaretDown
          className={`text-ash transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-1 left-0 w-full bg-[#1a1a1a] border border-light/10 rounded-lg shadow-2xl z-50 flex flex-col max-h-60 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          <div className="p-2 border-b border-light/5 sticky top-0 bg-[#1a1a1a]">
            <div className="flex items-center gap-2 bg-white/5 rounded px-2 py-1.5">
              <PiMagnifyingGlass className="text-ash" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={placeholder}
                className="bg-transparent text-sm text-light outline-none w-full placeholder:text-ash/50"
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1 p-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                    setSearch("");
                  }}
                  className={`w-full text-left px-3 py-2 rounded text-sm flex items-center justify-between ${value === opt.value ? "bg-blue-500/20 text-blue-400" : "text-light/80 hover:bg-white/5"}`}
                >
                  <span className="truncate">{opt.label}</span>
                  {value === opt.value && <PiCheck />}
                </button>
              ))
            ) : (
              <div className="p-4 text-center text-ash text-xs">
                No results found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default function BibleController() {
  const [selectedVersion, setSelectedVersion] = useState("kjv");
  const [books, setBooks] = useState([]);
  const [verses, setVerses] = useState([]);

  // Indices (-1 on first load to ensure inputs start empty)
  const [selectedBookIndex, setSelectedBookIndex] = useState(-1);
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(0);

  // Selection State
  const [selectedVerseIndices, setSelectedVerseIndices] = useState(new Set());
  const [isLive, setIsLive] = useState(false);

  // Quick Reference 2XL Inputs State (Empty on first load)
  const [bookQuery, setBookQuery] = useState("");
  const [isBookDropdownOpen, setIsBookDropdownOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [chapterInput, setChapterInput] = useState("");
  const [verseInput, setVerseInput] = useState("");
  const [translationQuery, setTranslationQuery] = useState("");
  const [isTranslationDropdownOpen, setIsTranslationDropdownOpen] = useState(false);
  const [activeTranslationIndex, setActiveTranslationIndex] = useState(0);

  const bookInputRef = useRef(null);
  const chapterInputRef = useRef(null);
  const verseInputRef = useRef(null);
  const translationInputRef = useRef(null);
  const bookContainerRef = useRef(null);
  const translationContainerRef = useRef(null);

  const isUserEditingBookRef = useRef(false);
  const isUserEditingChapterRef = useRef(false);
  const isUserEditingVerseRef = useRef(false);
  const isUserEditingTranslationRef = useRef(false);
  const hasUserSelectedRef = useRef(false);

  // Sync State to Mobile
  useEffect(() => {
    if (
      window.electron &&
      window.electron.Bible &&
      window.electron.Bible.sync
    ) {
      window.electron.Bible.sync({
        version: selectedVersion,
        bookIndex: selectedBookIndex,
        chapterIndex: selectedChapterIndex,
      });
    }
  }, [selectedVersion, selectedBookIndex, selectedChapterIndex]);

  // Fetch Books on Mount
  useEffect(() => {
    electron.Bible.getBooks().then(setBooks).catch(console.error);
  }, []);

  // Pending selection for remote sync
  const pendingSelection = useRef(null);
  /** When voice navigates the picker, skip clear-on-nav wipes for a short window.
   *  A boolean flag is unsafe under React Strict Mode (effect double-invoke consumes
   *  the flag on the first run and nulls content on the second). */
  const skipPresentationClearUntilRef = useRef(0);

  const scrollToVerse = (indices) => {
    if (indices && indices.length > 0) {
      setTimeout(() => {
        const minIndex = Math.min(...indices);
        const el = document.getElementById(`verse-${minIndex}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 50);
    }
  };

  // Fetch Verses when selection changes
  useEffect(() => {
    if (books.length === 0) return;

    // Critical: Clear verses immediately to prevent "Auto-Present" from showing stale data
    setVerses([]);

    const bookIdx = selectedBookIndex >= 0 ? selectedBookIndex : 0;
    electron.Bible.getChapter(
      selectedVersion,
      bookIdx,
      selectedChapterIndex + 1,
    )
      .then((newVerses) => {
        setVerses(newVerses);
        // Handle pending remote selection
        if (pendingSelection.current) {
          const { bookIndex, chapterIndex, indices, fromVoice } =
            pendingSelection.current;
          // Verify we are on the right chapter (async race check)
          if (
            bookIndex === selectedBookIndex &&
            chapterIndex === selectedChapterIndex
          ) {
            const newSet = new Set(indices);
            setSelectedVerseIndices(newSet);

            // If from voice, BroadcastEngine already pushed presentation with read-along tokens/range
            if (!fromVoice) {
              presentVerses(newSet, newVerses);
            }
            scrollToVerse(indices);
          }
          pendingSelection.current = null;
        }
      })
      .catch(console.error);
  }, [selectedVersion, selectedBookIndex, selectedChapterIndex, books]);

  // Listen for Mobile Actions
  useEffect(() => {
    if (window.electron && window.electron.Network) {
      console.log(
        "Setting up mobile listener with state:",
        selectedVersion,
        selectedBookIndex,
        selectedChapterIndex,
      );
      const removeListener = window.electron.Network.onMobileAction(
        (action) => {
          if (action.type === "bible-present") {
            console.log("Bible Present Action:", action.payload);

            const version = action.payload.version;
            const bookIndex = Number(action.payload.bookIndex);
            const chapterIndex = Number(action.payload.chapterIndex);
            const indices = action.payload.indices.map(Number);

            // Check if we need to navigate
            const needsNav =
              (version && version !== selectedVersion) ||
              bookIndex !== selectedBookIndex ||
              chapterIndex !== selectedChapterIndex;

            if (needsNav) {
              console.log("Navigating to:", version, bookIndex, chapterIndex);
              if (version) setSelectedVersion(version);
              setSelectedBookIndex(bookIndex);
              setSelectedChapterIndex(chapterIndex);

              // Queue selection for after fetch
              pendingSelection.current = { bookIndex, chapterIndex, indices };
            } else {
              console.log("Already on correct page, presenting immediately.");
              // We are on the correct page, present immediately
              const newSet = new Set(indices);
              setSelectedVerseIndices(newSet);
              // Pass 'verses' explicitly to ensure we use current state closure
              presentVerses(newSet, verses);
              scrollToVerse(indices);
            }
          }
        },
      );
      return () => removeListener();
    }
  }, [selectedVersion, selectedBookIndex, selectedChapterIndex, verses]);

  // Listen for Voice Commands (BroadcastEngine → voice-bible-sync)
  useEffect(() => {
    const handleVoiceSync = (e) => {
      const { version, bookIndex, chapterIndex, indices } = e.detail;

      const needsNav =
        (version && version !== selectedVersion) ||
        bookIndex !== selectedBookIndex ||
        chapterIndex !== selectedChapterIndex;

      if (needsNav) {
        // CRITICAL: book/chapter state change triggers clear-on-nav effect.
        // Voice already called Presentation.setContent — must not wipe it.
        // Hold skip for ~600ms so Strict Mode double-invoke cannot clear.
        skipPresentationClearUntilRef.current = Date.now() + 600;
        if (version) setSelectedVersion(version);
        setSelectedBookIndex(bookIndex);
        setSelectedChapterIndex(chapterIndex);
        // Queue selection to happen after the verses fetch
        pendingSelection.current = {
          bookIndex,
          chapterIndex,
          indices,
          fromVoice: true,
        };
      } else {
        // We are already on the correct page, just update selection in UI
        const newSet = new Set(indices);
        setSelectedVerseIndices(newSet);
        // Do NOT call presentVerses here, because Topbar already pushed the HTML directly.
        scrollToVerse(indices);
      }
    };

    window.addEventListener("voice-bible-sync", handleVoiceSync);
    return () =>
      window.removeEventListener("voice-bible-sync", handleVoiceSync);
  }, [selectedVersion, selectedBookIndex, selectedChapterIndex]);

  // Listen for Voice Translation Sync (BroadcastEngine → voice-translation-sync)
  useEffect(() => {
    const handleVoiceTranslation = (e) => {
      if (e?.detail?.version) {
        skipPresentationClearUntilRef.current = Date.now() + 1500;
        setSelectedVersion(e.detail.version);
      }
    };
    window.addEventListener("voice-translation-sync", handleVoiceTranslation);
    return () =>
      window.removeEventListener(
        "voice-translation-sync",
        handleVoiceTranslation,
      );
  }, []);

  const currentBook = books[selectedBookIndex >= 0 ? selectedBookIndex : 0] || books[0];

  // Calculate correct chapter count
  // Fallback to 150 if chapters property is missing or 0
  const totalChapters =
    currentBook && currentBook.chapters ? currentBook.chapters : 150;
  const chaptersList = Array.from({ length: totalChapters }, (_, i) => i);

  // Scroll top
  useEffect(() => {
    const verseContainer = document.getElementById("verse-container");
    if (verseContainer) verseContainer.scrollTop = 0;
  }, [selectedBookIndex, selectedChapterIndex, selectedVersion]);

  // Listen for Live Presentation Content state
  useEffect(() => {
    if (
      window.electron &&
      window.electron.Presentation &&
      window.electron.Presentation.onSetContent
    ) {
      const unsub = window.electron.Presentation.onSetContent((content) => {
        const hasLive =
          content != null &&
          (content.type === "bible" || content.type === "scripture");
        setIsLive(hasLive);
        if (!content) {
          setSelectedVerseIndices(new Set());
          if (!isUserEditingVerseRef.current) setVerseInput("");
        }
      });
      return () => {
        if (typeof unsub === "function") unsub();
      };
    }
  }, []);

  // Presentation Logic
  const presentVerses = (indices, currentVerses = verses) => {
    if (indices.size === 0) {
      setIsLive(false);
      electron.Presentation.setContent(null);
      return;
    }
    setIsLive(true);

    const sortedIndices = Array.from(indices).sort((a, b) => a - b);
    // Safety check
    const verseText = sortedIndices
      .map((i) => currentVerses[i] || "")
      .join(" ");

    const scopeBook = books[selectedBookIndex];
    const bookName = scopeBook ? scopeBook.name : "";
    const chapterNum = selectedChapterIndex + 1;

    let verseRef = `${bookName} ${chapterNum}:`;
    if (sortedIndices.length === 1) {
      verseRef += sortedIndices[0] + 1;
    } else {
      const start = sortedIndices[0] + 1;
      const end = sortedIndices[sortedIndices.length - 1] + 1;
      const isContiguous = sortedIndices.every(
        (val, i, arr) => i === 0 || val === arr[i - 1] + 1,
      );
      if (isContiguous) {
        verseRef += `${start}-${end}`;
      } else {
        verseRef += sortedIndices.map((i) => i + 1).join(",");
      }
    }

    electron.Presentation.setContent({
      type: "bible",
      data: {
        title: verseRef,
        body: verseText,
      },
    });

    // Keep voice engine context in sync so "verse 20" works after manual selection
    window.dispatchEvent(
      new CustomEvent("bible-context-sync", {
        detail: {
          version: selectedVersion,
          bookIndex: selectedBookIndex,
          chapter: chapterNum,
          verse: sortedIndices[0] + 1,
          endVerse:
            sortedIndices.length > 1
              ? sortedIndices[sortedIndices.length - 1] + 1
              : sortedIndices[0] + 1,
          title: verseRef,
          body: verseText,
        },
      }),
    );
  };

  const handleVerseClick = (index, e) => {
    let newSelection = new Set(selectedVerseIndices);

    if (e.shiftKey && newSelection.size > 0) {
      const allIndices = Array.from(newSelection);
      const min = Math.min(...allIndices);
      const max = Math.max(...allIndices);
      const start = Math.min(min, index);
      const end = Math.max(max, index);

      newSelection = new Set();
      for (let i = start; i <= end; i++) {
        newSelection.add(i);
      }
    } else if (e.metaKey || e.ctrlKey) {
      if (newSelection.has(index)) newSelection.delete(index);
      else newSelection.add(index);
    } else {
      newSelection = new Set([index]);
    }

    setSelectedVerseIndices(newSelection);
    presentVerses(newSelection);
  };

  // Clear verse selection when changing chapter/book (manual picker browse).
  // Must NOT wipe live AV output when the change was driven by voice-bible-sync or translation change.
  useEffect(() => {
    if (Date.now() < skipPresentationClearUntilRef.current) {
      console.log(
        "[Bible] skip presentation clear (voice nav/translation window)",
      );
      return;
    }
    setSelectedVerseIndices(new Set());
    console.log("[Bible] clear presentation on book/chapter change");
    electron.Presentation.setContent(null);
  }, [selectedBookIndex, selectedChapterIndex]);

  // Sync 2XL Header Inputs with selection state when user has interacted and is not actively editing
  useEffect(() => {
    if (!isUserEditingBookRef.current && hasUserSelectedRef.current && selectedBookIndex >= 0 && books[selectedBookIndex]) {
      setBookQuery(books[selectedBookIndex].name);
    }
  }, [books, selectedBookIndex]);

  useEffect(() => {
    if (!isUserEditingChapterRef.current && hasUserSelectedRef.current && selectedBookIndex >= 0) {
      setChapterInput((selectedChapterIndex + 1).toString());
    }
  }, [selectedChapterIndex, selectedBookIndex]);

  useEffect(() => {
    if (!isUserEditingVerseRef.current && hasUserSelectedRef.current) {
      if (selectedVerseIndices.size === 0) {
        setVerseInput("");
      } else {
        const sorted = Array.from(selectedVerseIndices).sort((a, b) => a - b);
        const isContiguous = sorted.every(
          (val, i, arr) => i === 0 || val === arr[i - 1] + 1,
        );
        if (sorted.length === 1) {
          setVerseInput((sorted[0] + 1).toString());
        } else if (isContiguous) {
          setVerseInput(`${sorted[0] + 1}-${sorted[sorted.length - 1] + 1}`);
        } else {
          setVerseInput(sorted.map((i) => i + 1).join(","));
        }
      }
    }
  }, [selectedVerseIndices]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        bookContainerRef.current &&
        !bookContainerRef.current.contains(event.target)
      ) {
        setIsBookDropdownOpen(false);
        isUserEditingBookRef.current = false;
        if (hasUserSelectedRef.current && selectedBookIndex >= 0 && books[selectedBookIndex]) {
          setBookQuery(books[selectedBookIndex].name);
        }
      }
      if (
        translationContainerRef.current &&
        !translationContainerRef.current.contains(event.target)
      ) {
        setIsTranslationDropdownOpen(false);
        isUserEditingTranslationRef.current = false;
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [books, selectedBookIndex]);

  // Filtered books for suggestion dropdown using FR-3.15 multi-pass fuzzy matcher
  const filteredBooks = filterBooksFuzzy(bookQuery, books);

  const versionList = Object.entries(versions).map(([key, name]) => ({
    key,
    name,
    abbrev: key.toUpperCase(),
  }));

  const filteredVersions = versionList.filter((v) => {
    const q = (translationQuery || "").toLowerCase().trim();
    if (!q) return true;
    return (
      v.key.toLowerCase().includes(q) ||
      v.name.toLowerCase().includes(q) ||
      v.abbrev.toLowerCase().includes(q)
    );
  });

  const handleSelectBook = (book) => {
    hasUserSelectedRef.current = true;
    const idx = books.findIndex(
      (b) => b.id === book.id || b.name === book.name,
    );
    if (idx !== -1) {
      setSelectedBookIndex(idx);
      setSelectedChapterIndex(0);
      setBookQuery(book.name);
      setIsBookDropdownOpen(false);
      isUserEditingBookRef.current = false;
      setTimeout(() => {
        if (chapterInputRef.current) {
          chapterInputRef.current.focus();
          chapterInputRef.current.select();
        }
      }, 50);
    }
  };

  const handleSelectVersion = (versionKey) => {
    hasUserSelectedRef.current = true;
    setSelectedVersion(versionKey);
    setTranslationQuery(versionKey.toUpperCase());
    setIsTranslationDropdownOpen(false);
    isUserEditingTranslationRef.current = false;

    // If verses are already selected, re-fetch chapter in new version and present immediately
    if (selectedVerseIndices.size > 0 && selectedBookIndex >= 0) {
      electron.Bible.getChapter(
        versionKey,
        selectedBookIndex,
        selectedChapterIndex + 1,
      )
        .then((newVerses) => {
          setVerses(newVerses);
          presentVerses(selectedVerseIndices, newVerses, selectedBookIndex, selectedChapterIndex, versionKey);
        })
        .catch(console.error);
    }
  };

  const handleBookKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isBookDropdownOpen) setIsBookDropdownOpen(true);
      setActiveSuggestionIndex((prev) =>
        Math.min(filteredBooks.length - 1, prev + 1),
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggestionIndex((prev) => Math.max(0, prev - 1));
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (filteredBooks.length > 0 && isBookDropdownOpen) {
        e.preventDefault();
        const target = filteredBooks[activeSuggestionIndex] || filteredBooks[0];
        handleSelectBook(target);
      } else if (bookQuery.trim()) {
        const target = resolveBookName(bookQuery.trim(), books);
        if (target) {
          e.preventDefault();
          handleSelectBook(target);
        } else {
          setIsBookDropdownOpen(false);
          isUserEditingBookRef.current = false;
        }
      } else {
        setIsBookDropdownOpen(false);
        isUserEditingBookRef.current = false;
      }

      if (e.key === "Tab" || e.key === "Enter") {
        setTimeout(() => {
          if (chapterInputRef.current) {
            chapterInputRef.current.focus();
            chapterInputRef.current.select();
          }
        }, 50);
      }
    } else if (e.key === "Escape") {
      setIsBookDropdownOpen(false);
      isUserEditingBookRef.current = false;
      if (selectedBookIndex >= 0 && books[selectedBookIndex]) {
        setBookQuery(books[selectedBookIndex].name);
      }
    }
  };

  const commitChapter = (val) => {
    hasUserSelectedRef.current = true;
    const chNum = parseInt(val, 10);
    if (!isNaN(chNum)) {
      const clamped = Math.max(1, Math.min(totalChapters, chNum));
      setSelectedChapterIndex(clamped - 1);
      setChapterInput(clamped.toString());
    } else if (selectedBookIndex >= 0 && books[selectedBookIndex]) {
      setChapterInput((selectedChapterIndex + 1).toString());
    }
    isUserEditingChapterRef.current = false;
  };

  const handleChapterInputChange = (e) => {
    hasUserSelectedRef.current = true;
    isUserEditingChapterRef.current = true;
    const val = e.target.value;
    if (val.includes(":")) {
      const [chPart, vsPart] = val.split(":");
      commitChapter(chPart);
      if (vsPart) setVerseInput(vsPart);
      setTimeout(() => {
        if (verseInputRef.current) {
          verseInputRef.current.focus();
          verseInputRef.current.select();
        }
      }, 50);
      return;
    }
    setChapterInput(val.replace(/[^0-9]/g, ""));
  };

  const handleChapterKeyDown = (e) => {
    if (e.key === "Enter" || e.key === "Tab" || e.key === ":") {
      e.preventDefault();
      commitChapter(chapterInput);
      setTimeout(() => {
        if (verseInputRef.current) {
          verseInputRef.current.focus();
          verseInputRef.current.select();
        }
      }, 50);
    }
  };

  const commitVerse = async (val) => {
    isUserEditingVerseRef.current = false;
    if (!val || !val.trim()) {
      setSelectedVerseIndices(new Set());
      electron.Presentation.setContent(null);
      return;
    }

    hasUserSelectedRef.current = true;

    // Resolve book index using smartBibleMatch (FR-3.15)
    let bookIdx = selectedBookIndex >= 0 ? selectedBookIndex : 0;
    if (selectedBookIndex < 0 && bookQuery.trim()) {
      const target = resolveBookName(bookQuery.trim(), books);
      if (target) {
        const foundIdx = books.findIndex((b) => b.id === target.id || b.name === target.name);
        if (foundIdx !== -1) {
          bookIdx = foundIdx;
          setSelectedBookIndex(foundIdx);
          setBookQuery(target.name);
        }
      }
    } else if (selectedBookIndex < 0 && books.length > 0) {
      bookIdx = 0;
      setSelectedBookIndex(0);
      setBookQuery(books[0].name);
    }

    // Resolve chapter index
    let chNum = parseInt(chapterInput, 10);
    if (isNaN(chNum) || chNum < 1) {
      chNum = selectedChapterIndex >= 0 ? selectedChapterIndex + 1 : 1;
      setChapterInput(chNum.toString());
    }
    const chIdx = chNum - 1;
    setSelectedChapterIndex(chIdx);

    const ver = selectedVersion || "kjv";

    // Ensure chapter verses are fetched to accurately clamp verse bounds
    let currentChapterVerses = verses;
    if (
      !currentChapterVerses ||
      currentChapterVerses.length === 0 ||
      selectedBookIndex !== bookIdx ||
      selectedChapterIndex !== chIdx
    ) {
      try {
        currentChapterVerses = await electron.Bible.getChapter(
          ver,
          bookIdx,
          chIdx + 1,
        );
        setVerses(currentChapterVerses);
      } catch (err) {
        console.error("Failed to load chapter verses for bounds clamping:", err);
      }
    }

    const maxVerses = Math.max(1, currentChapterVerses?.length || 150);

    const parts = val
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const indices = [];
    for (const p of parts) {
      if (p.includes("-")) {
        const [s, e] = p.split("-").map((x) => parseInt(x, 10));
        if (!isNaN(s) && !isNaN(e)) {
          const sClamped = Math.max(1, Math.min(maxVerses, s));
          const eClamped = Math.max(1, Math.min(maxVerses, e));
          for (let i = Math.min(sClamped, eClamped); i <= Math.max(sClamped, eClamped); i++) {
            indices.push(i - 1);
          }
        }
      } else {
        const v = parseInt(p, 10);
        if (!isNaN(v)) {
          const vClamped = Math.max(1, Math.min(maxVerses, v));
          indices.push(vClamped - 1);
        }
      }
    }
    const unique = Array.from(new Set(indices)).sort((a, b) => a - b);
    if (unique.length > 0) {
      const newSet = new Set(unique);
      setSelectedVerseIndices(newSet);

      // Update input text with clamped numbers (e.g. 999 -> 31, 1-999 -> 1-31)
      const isContiguous = unique.every(
        (val, i, arr) => i === 0 || val === arr[i - 1] + 1,
      );
      if (unique.length === 1) {
        setVerseInput((unique[0] + 1).toString());
      } else if (isContiguous) {
        setVerseInput(`${unique[0] + 1}-${unique[unique.length - 1] + 1}`);
      } else {
        setVerseInput(unique.map((i) => i + 1).join(","));
      }

      presentVerses(newSet, currentChapterVerses, bookIdx, chIdx, ver);
      scrollToVerse(unique);
    }
  };

  const handleVerseKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitVerse(verseInput);
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (verseInput && verseInput.trim()) {
        commitVerse(verseInput);
      }
      setTimeout(() => {
        if (translationInputRef.current) {
          translationInputRef.current.focus();
          translationInputRef.current.select();
        }
      }, 50);
    }
  };

  const handleTranslationKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isTranslationDropdownOpen) setIsTranslationDropdownOpen(true);
      setActiveTranslationIndex((prev) =>
        Math.min(filteredVersions.length - 1, prev + 1),
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveTranslationIndex((prev) => Math.max(0, prev - 1));
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (filteredVersions.length > 0 && isTranslationDropdownOpen) {
        e.preventDefault();
        const target = filteredVersions[activeTranslationIndex] || filteredVersions[0];
        handleSelectVersion(target.key);
      } else if (translationQuery.trim()) {
        const q = translationQuery.trim().toLowerCase();
        const target = versionList.find(
          (v) =>
            v.key.toLowerCase() === q ||
            v.abbrev.toLowerCase() === q ||
            v.name.toLowerCase().includes(q),
        );
        if (target) {
          e.preventDefault();
          handleSelectVersion(target.key);
        } else {
          setIsTranslationDropdownOpen(false);
          isUserEditingTranslationRef.current = false;
        }
      } else {
        setIsTranslationDropdownOpen(false);
        isUserEditingTranslationRef.current = false;
      }
    } else if (e.key === "Escape") {
      setIsTranslationDropdownOpen(false);
      isUserEditingTranslationRef.current = false;
    }
  };

  const handleStop = () => {
    setSelectedVerseIndices(new Set());
    setVerseInput("");
    setIsLive(false);
    if (
      window.electron &&
      window.electron.Presentation &&
      window.electron.Presentation.setContent
    ) {
      window.electron.Presentation.setContent(null);
    }
    // Clear voice context read-along
    window.dispatchEvent(
      new CustomEvent("bible-context-sync", {
        detail: {
          version: selectedVersion,
          bookIndex: null,
          chapter: null,
          verse: null,
          title: null,
          body: null,
        },
      }),
    );
  };

  if (!currentBook)
    return <div className="text-light p-4">Loading Bible Data...</div>;

  // Prepare Options for Dropdowns
  const versionOptions = Object.entries(versions).map(([key, name]) => ({
    value: key,
    label: name,
  }));

  const bookOptions = books.map((book, index) => ({
    value: index,
    label: book.name,
  }));

  const chapterOptions = chaptersList.map((i) => ({
    value: i,
    label: (i + 1).toString(), // Display as 1-indexed
  }));

  return (
    <div className="flex flex-col w-full h-full gap-2 text-light/90">
      {/* Header / Config */}
      <div className="bg-white/10 p-4 rounded-xl flex flex-col gap-3 relative z-30">
        <div className="flex items-center justify-between">
          <h5 className="text-[15px] font-semibold text-light/90">Bible</h5>

          <div className="flex-none flex flex-col items-end justify-center pl-2 border-white/5 ml-1">
            <Button
              disabled={!isLive && selectedVerseIndices.size === 0}
              variant={isLive || selectedVerseIndices.size > 0 ? "delete" : undefined}
              onClick={handleStop}
              className={
                isLive || selectedVerseIndices.size > 0
                  ? "bg-red-500/80 hover:bg-red-500 text-white shadow-lg shadow-red-500/20"
                  : ""
              }
            >
              Stop
            </Button>
          </div>
        </div>

        {/* 2XL Borderless Quick Reference Inputs: Book, Chapter : verse in Translation */}
        <div className="flex items-center font-bold text-2xl text-white relative flex-wrap gap-y-2">
          {/* Book Input & Autocomplete Dropdown */}
          <div className="relative inline-block" ref={bookContainerRef}>
            <input
              ref={bookInputRef}
              type="text"
              value={bookQuery}
              onChange={(e) => {
                hasUserSelectedRef.current = true;
                isUserEditingBookRef.current = true;
                setBookQuery(e.target.value);
                setIsBookDropdownOpen(true);
                setActiveSuggestionIndex(0);
              }}
              onFocus={(e) => {
                isUserEditingBookRef.current = true;
                if (bookQuery.trim()) {
                  setIsBookDropdownOpen(true);
                }
                setActiveSuggestionIndex(0);
                e.target.select();
              }}
              onKeyDown={handleBookKeyDown}
              placeholder="Book"
              className="p-0 m-0 font-bold text-2xl text-white bg-transparent border-none outline-none placeholder:text-gray-500 cursor-text hover:text-white/80 focus:text-white transition-colors"
              style={{
                width: `${Math.max(1, (bookQuery || "Book").length)}ch`,
              }}
            />

            {isBookDropdownOpen && filteredBooks.length > 0 && (
              <div className="absolute top-full left-0 mt-2 min-w-[220px] max-h-60 overflow-y-auto bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl z-50 p-1 animate-in fade-in zoom-in-95 duration-100 no-scrollbar">
                {filteredBooks.map((b, idx) => (
                  <button
                    key={b.id || idx}
                    type="button"
                    onClick={() => handleSelectBook(b)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${
                      idx === activeSuggestionIndex
                        ? "bg-blue-600/30 text-blue-400 font-semibold"
                        : "text-white/80 hover:bg-white/5"
                    }`}
                  >
                    <span>{b.name}</span>
                    {selectedBookIndex >= 0 && books[selectedBookIndex]?.name === b.name && (
                      <PiCheck className="text-blue-400" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span
            className={`p-1 font-bold text-2xl select-none transition-colors ${
              bookQuery && bookQuery.trim() ? "text-white" : "text-gray-500"
            }`}
          >
            ,
          </span>

          {/* Chapter Input */}
          <input
            ref={chapterInputRef}
            type="text"
            inputMode="numeric"
            value={chapterInput}
            onChange={handleChapterInputChange}
            onFocus={(e) => {
              isUserEditingChapterRef.current = true;
              e.target.select();
            }}
            onKeyDown={handleChapterKeyDown}
            onBlur={(e) => commitChapter(e.target.value)}
            placeholder="Chapter"
            className="p-0 m-0 font-bold text-2xl text-white bg-transparent border-none outline-none placeholder:text-gray-500 cursor-text hover:text-white/80 focus:text-white transition-colors"
            style={{
              width: `${Math.max(1, (chapterInput || "Chapter").length)}ch`,
            }}
          />

          <span
            className={`p-1 font-bold text-2xl select-none transition-colors ${
              chapterInput && chapterInput.trim()
                ? "text-white"
                : "text-gray-500"
            }`}
          >
            :
          </span>

          {/* Verse Input */}
          <input
            ref={verseInputRef}
            type="text"
            value={verseInput}
            onChange={(e) => {
              hasUserSelectedRef.current = true;
              isUserEditingVerseRef.current = true;
              setVerseInput(e.target.value);
            }}
            onFocus={(e) => {
              isUserEditingVerseRef.current = true;
              e.target.select();
            }}
            onBlur={(e) => {
              commitVerse(e.target.value);
            }}
            onKeyDown={handleVerseKeyDown}
            placeholder="verse"
            className="p-0 m-0 font-bold text-2xl text-white bg-transparent border-none outline-none placeholder:text-gray-500 cursor-text hover:text-white/80 focus:text-white transition-colors"
            style={{
              width: `${Math.max(1, (verseInput || "verse").length)}ch`,
            }}
          />

          {/* in Separator */}
          <span
            className={`p-1 font-bold text-2xl select-none transition-colors ${
              verseInput && verseInput.trim() ? "text-white" : "text-gray-500"
            }`}
          >
            {" "}in{" "}
          </span>

          {/* Translation Input & Autocomplete Dropdown */}
          <div className="relative inline-block" ref={translationContainerRef}>
            <input
              ref={translationInputRef}
              type="text"
              value={translationQuery}
              onChange={(e) => {
                hasUserSelectedRef.current = true;
                isUserEditingTranslationRef.current = true;
                setTranslationQuery(e.target.value);
                setIsTranslationDropdownOpen(true);
                setActiveTranslationIndex(0);
              }}
              onFocus={(e) => {
                isUserEditingTranslationRef.current = true;
                if (translationQuery.trim()) {
                  setIsTranslationDropdownOpen(true);
                }
                setActiveTranslationIndex(0);
                e.target.select();
              }}
              onKeyDown={handleTranslationKeyDown}
              placeholder="Translation"
              className="p-0 m-0 font-bold text-2xl text-white bg-transparent border-none outline-none placeholder:text-gray-500 cursor-text hover:text-white/80 focus:text-white transition-colors"
              style={{
                width: `${Math.max(1, (translationQuery || "Translation").length)}ch`,
              }}
            />

            {isTranslationDropdownOpen && filteredVersions.length > 0 && (
              <div className="absolute top-full left-0 mt-2 min-w-[260px] max-h-60 overflow-y-auto bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl z-50 p-1 animate-in fade-in zoom-in-95 duration-100 no-scrollbar">
                {filteredVersions.map((v, idx) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => handleSelectVersion(v.key)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${
                      idx === activeTranslationIndex
                        ? "bg-blue-600/30 text-blue-400 font-semibold"
                        : "text-white/80 hover:bg-white/5"
                    }`}
                  >
                    <span className="truncate pr-2">{v.name}</span>
                    {selectedVersion === v.key && (
                      <PiCheck className="text-blue-400 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* <div className="flex flex-row gap-2 bg-ash/20 p-4 rounded-xl items-center relative z-20">
        <div className="flex-1 min-w-[120px]">
          <SearchableDropdown
            label="Version"
            options={versionOptions}
            value={selectedVersion}
            onChange={setSelectedVersion}
            placeholder="Version"
          />
        </div>

        <div className="flex-[2] min-w-[150px]">
          <SearchableDropdown
            label="Book"
            options={bookOptions}
            value={selectedBookIndex}
            onChange={(val) => {
              setSelectedBookIndex(val);
              setSelectedChapterIndex(0);
            }}
            placeholder="Book"
          />
        </div>

        <div className="flex-1 min-w-[80px]">
          <SearchableDropdown
            label="Ch"
            options={chapterOptions}
            value={selectedChapterIndex}
            onChange={setSelectedChapterIndex}
            placeholder="#"
          />
        </div>

        <div className="flex-1 min-w-[80px]">
          <SearchableDropdown
            label="Vs"
            options={verses.map((_, i) => ({
              value: i,
              label: (i + 1).toString(),
            }))}
            value={-1}
            onChange={(val) => {
              const el = document.getElementById(`verse-${val}`);
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                handleVerseClick(val, {
                  shiftKey: false,
                  ctrlKey: false,
                  metaKey: false,
                });
              }
            }}
            placeholder="#"
          />
        </div>
      </div> */}

      {/* Content */}
      <div
        id="verse-container"
        className="flex-1 bg-ash/10 rounded-xl p-4 overflow-y-auto space-y-4 relative z-0"
      >
        {verses.length > 0 ? (
          verses.map((verse, index) => {
            const isSelected = selectedVerseIndices.has(index);
            return (
              <div
                key={index}
                id={`verse-${index}`}
                onClick={(e) => handleVerseClick(index, e)}
                className={`flex gap-4 p-2 rounded-lg transition-all group cursor-pointer border ${isSelected ? "bg-blue-600/20 border-blue-500/30" : "border-transparent hover:bg-white/5"}`}
              >
                <span
                  className={`font-bold min-w-[24px] text-right pt-1 text-sm ${isSelected ? "text-blue-400" : "text-ash/50 group-hover:text-ash/80"}`}
                >
                  {index + 1}
                </span>
                <p
                  className={`text-lg leading-relaxed ${isSelected ? "text-white" : "text-light/80"}`}
                >
                  {verse}
                </p>
              </div>
            );
          })
        ) : (
          <div className="md:h-[400px] flex items-center justify-center flex-col gap-4 opacity-50">
            <PiMagnifyingGlass size={48} className="text-ash" />
            <p>No verses found for this chapter.</p>
          </div>
        )}
      </div>
    </div>
  );
}
