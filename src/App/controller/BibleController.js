import React, { useState, useEffect, useRef } from 'react';
import { PiCaretDown, PiMagnifyingGlass, PiCheck } from "react-icons/pi";

const versions = {
    kjv: "King James Version",
    bbe: "Bible in Basic English",
    asv: "American Standard Version",
    web: "World English Bible",
    net: "New English Translation",
    geneva: "Geneva Bible",
    tyndale: "Tyndale Bible",
    coverdale: "Coverdale Bible",
    bishops: "Bishops' Bible",
    kjv_strongs: "KJV w/ Strong's",
};

// Custom Searchable Dropdown Component
const SearchableDropdown = ({ options, value, onChange, label, placeholder = "Search...", className = "" }) => {
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
    const filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes(search.toLowerCase())
    );

    const selectedLabel = options.find(opt => opt.value === value)?.label || value;

    return (
        <div className={`flex flex-col gap-1 relative ${className}`} ref={dropdownRef}>
            <label className="text-xs font-bold text-ash uppercase">{label}</label>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="bg-primary border border-light/20 rounded p-2 text-light outline-none flex items-center justify-between hover:border-light/40 transition-colors text-left truncate"
            >
                <span className="truncate pr-2">{selectedLabel}</span>
                <PiCaretDown className={`text-ash transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full mt-1 left-0 w-full bg-[#1a1a1a] border border-light/10 rounded-lg shadow-2xl z-50 flex flex-col max-h-60 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    <div className="p-2 border-b border-light/5 sticky top-0 bg-[#1a1a1a]">
                        <div className="flex items-center gap-2 bg-white/5 rounded px-2 py-1.5 border border-light/10">
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
                        {filteredOptions.length > 0 ? filteredOptions.map((opt) => (
                            <button
                                key={opt.value}
                                onClick={() => {
                                    onChange(opt.value);
                                    setIsOpen(false);
                                    setSearch("");
                                }}
                                className={`w-full text-left px-3 py-2 rounded text-sm flex items-center justify-between ${value === opt.value ? 'bg-blue-500/20 text-blue-400' : 'text-light/80 hover:bg-white/5'}`}
                            >
                                <span className="truncate">{opt.label}</span>
                                {value === opt.value && <PiCheck />}
                            </button>
                        )) : (
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
    const [selectedVersion, setSelectedVersion] = useState('kjv');
    const [books, setBooks] = useState([]);
    const [verses, setVerses] = useState([]);

    // Indices
    const [selectedBookIndex, setSelectedBookIndex] = useState(0);
    const [selectedChapterIndex, setSelectedChapterIndex] = useState(0);

    // Selection State
    const [selectedVerseIndices, setSelectedVerseIndices] = useState(new Set());

    // Sync State to Mobile
    useEffect(() => {
        if (window.electron && window.electron.Bible && window.electron.Bible.sync) {
            window.electron.Bible.sync({
                version: selectedVersion,
                bookIndex: selectedBookIndex,
                chapterIndex: selectedChapterIndex
            });
        }
    }, [selectedVersion, selectedBookIndex, selectedChapterIndex]);

    // Fetch Books on Mount
    useEffect(() => {
        electron.Bible.getBooks().then(setBooks).catch(console.error);
    }, []);

    // Pending selection for remote sync
    const pendingSelection = useRef(null);

    // Fetch Verses when selection changes
    useEffect(() => {
        if (books.length === 0) return;

        // Critical: Clear verses immediately to prevent "Auto-Present" from showing stale data
        setVerses([]);

        electron.Bible.getChapter(selectedVersion, selectedBookIndex, selectedChapterIndex + 1)
            .then((newVerses) => {
                setVerses(newVerses);
                // Handle pending remote selection
                if (pendingSelection.current) {
                    const { bookIndex, chapterIndex, indices } = pendingSelection.current;
                    // Verify we are on the right chapter (async race check)
                    if (bookIndex === selectedBookIndex && chapterIndex === selectedChapterIndex) {
                        const newSet = new Set(indices);
                        setSelectedVerseIndices(newSet);
                        presentVerses(newSet, newVerses);
                    }
                    pendingSelection.current = null;
                }
            })
            .catch(console.error);

    }, [selectedVersion, selectedBookIndex, selectedChapterIndex, books]);

    // Listen for Mobile Actions
    useEffect(() => {
        if (window.electron && window.electron.Network) {
            console.log("Setting up mobile listener with state:", selectedVersion, selectedBookIndex, selectedChapterIndex);
            const removeListener = window.electron.Network.onMobileAction((action) => {
                if (action.type === 'bible-present') {
                    console.log("Bible Present Action:", action.payload);

                    const version = action.payload.version;
                    const bookIndex = Number(action.payload.bookIndex);
                    const chapterIndex = Number(action.payload.chapterIndex);
                    const indices = action.payload.indices.map(Number);

                    // Check if we need to navigate
                    const needsNav =
                        (version && version !== selectedVersion) ||
                        (bookIndex !== selectedBookIndex) ||
                        (chapterIndex !== selectedChapterIndex);

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
                    }
                }
            });
            return () => removeListener();
        }
    }, [selectedVersion, selectedBookIndex, selectedChapterIndex, verses]); // Added verses to closure to be safe


    const currentBook = books[selectedBookIndex];

    // Calculate correct chapter count
    // Fallback to 150 if chapters property is missing or 0
    const totalChapters = (currentBook && currentBook.chapters) ? currentBook.chapters : 150;
    const chaptersList = Array.from({ length: totalChapters }, (_, i) => i);

    // Scroll top
    useEffect(() => {
        const verseContainer = document.getElementById('verse-container');
        if (verseContainer) verseContainer.scrollTop = 0;
    }, [selectedBookIndex, selectedChapterIndex, selectedVersion]);

    // Presentation Logic
    const presentVerses = (indices, currentVerses = verses) => {
        if (indices.size === 0) {
            electron.Presentation.setContent(null);
            return;
        }

        const sortedIndices = Array.from(indices).sort((a, b) => a - b);
        // Safety check
        const verseText = sortedIndices.map(i => currentVerses[i] || "").join(' ');

        const scopeBook = books[selectedBookIndex];
        const bookName = scopeBook ? scopeBook.name : "";
        const chapterNum = selectedChapterIndex + 1;

        let verseRef = `${bookName} ${chapterNum}:`;
        if (sortedIndices.length === 1) {
            verseRef += (sortedIndices[0] + 1);
        } else {
            const start = sortedIndices[0] + 1;
            const end = sortedIndices[sortedIndices.length - 1] + 1;
            const isContiguous = sortedIndices.every((val, i, arr) => i === 0 || val === arr[i - 1] + 1);
            if (isContiguous) {
                verseRef += `${start}-${end}`;
            } else {
                verseRef += sortedIndices.map(i => i + 1).join(',');
            }
        }

        electron.Presentation.setContent({
            type: 'bible',
            data: {
                title: verseRef,
                body: verseText
            }
        });
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

    // Clear selection when changing chapter/book
    useEffect(() => {
        setSelectedVerseIndices(new Set());
        electron.Presentation.setContent(null);
    }, [selectedBookIndex, selectedChapterIndex, selectedVersion]);

    if (!currentBook) return <div className="text-light p-4">Loading Bible Data...</div>;

    // Prepare Options for Dropdowns
    const versionOptions = Object.entries(versions).map(([key, name]) => ({
        value: key,
        label: name
    }));

    const bookOptions = books.map((book, index) => ({
        value: index,
        label: book.name
    }));

    const chapterOptions = chaptersList.map((i) => ({
        value: i,
        label: (i + 1).toString() // Display as 1-indexed
    }));

    return (
        <div className="flex flex-col w-full h-full gap-2 text-light/90">
            {/* Header / Config */}
            <div className="flex flex-row gap-2 bg-ash/20 p-2 rounded-xl items-center relative z-20 h-16">

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
                        options={verses.map((_, i) => ({ value: i, label: (i + 1).toString() }))}
                        value={-1}
                        onChange={(val) => {
                            const el = document.getElementById(`verse-${val}`);
                            if (el) {
                                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                handleVerseClick(val, { shiftKey: false, ctrlKey: false, metaKey: false });
                            }
                        }}
                        placeholder="#"
                    />
                </div>

                <div className="flex-none flex flex-col items-end justify-center pl-2 border-l border-white/5 ml-1">
                    {selectedVerseIndices.size > 0 && (
                        <button
                            onClick={() => {
                                setSelectedVerseIndices(new Set());
                                electron.Presentation.setContent(null);
                            }}
                            className="bg-red/80 hover:bg-red text-white text-[10px] font-bold py-1.5 px-3 rounded-md transition-colors uppercase tracking-wider shadow-lg shadow-red/20 whitespace-nowrap"
                        >
                            Stop
                        </button>
                    )}
                </div>
            </div>

            {/* Content */}
            <div id="verse-container" className="flex-1 bg-ash/10 rounded-xl p-6 overflow-y-auto space-y-4 relative z-0">
                {verses.length > 0 ? verses.map((verse, index) => {
                    const isSelected = selectedVerseIndices.has(index);
                    return (
                        <div
                            key={index}
                            id={`verse-${index}`}
                            onClick={(e) => handleVerseClick(index, e)}
                            className={`flex gap-4 p-3 rounded-lg transition-all group cursor-pointer border ${isSelected ? 'bg-blue-600/20 border-blue-500/30' : 'border-transparent hover:bg-white/5'}`}
                        >
                            <span className={`font-bold min-w-[24px] text-right pt-1 text-sm ${isSelected ? 'text-blue-400' : 'text-ash/50 group-hover:text-ash/80'}`}>{index + 1}</span>
                            <p className={`text-lg leading-relaxed ${isSelected ? 'text-white' : 'text-light/80'}`}>{verse}</p>
                        </div>
                    );
                }) : (
                    <div className="md:h-[400px] flex items-center justify-center flex-col gap-4 opacity-50">
                        <PiMagnifyingGlass size={48} className="text-ash" />
                        <p>No verses found for this chapter.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
