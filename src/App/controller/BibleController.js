import React, { useState, useEffect } from 'react';

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

export default function BibleController() {
    const [selectedVersion, setSelectedVersion] = useState('kjv');
    const [books, setBooks] = useState([]);
    const [verses, setVerses] = useState([]);

    // Indices
    const [selectedBookIndex, setSelectedBookIndex] = useState(0);
    const [selectedChapterIndex, setSelectedChapterIndex] = useState(0);

    // Selection State
    const [selectedVerseIndices, setSelectedVerseIndices] = useState(new Set());

    // Fetch Books on Mount
    useEffect(() => {
        electron.Bible.getBooks().then(setBooks).catch(console.error);
    }, []);

    // Pending selection for remote sync
    const pendingSelection = React.useRef(null);

    // Fetch Verses when selection changes
    useEffect(() => {
        if (books.length === 0) return;

        // Critical: Clear verses immediately to prevent "Auto-Present" from showing stale data
        // from the previous chapter while the new one is loading.
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
                        // We need to call presentVerses but it relies on 'verses' state which is closed over?
                        // No, 'presentVerses' uses 'verses' from closure. 'setVerses' updates state for NEXT render.
                        // We cannot call 'presentVerses' immediately with old 'verses'.
                        // We must wait for render?
                        // Actually, we can reuse logic or pass newVerses explicitly.
                        // Let's refactor presentVerses to accept verses optionally.
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
            const removeListener = window.electron.Network.onMobileAction((action) => {
                if (action.type === 'bible-present') {
                    const { version, bookIndex, chapterIndex, indices } = action.payload;

                    // Update Navigation
                    setSelectedVersion(version);
                    setSelectedBookIndex(bookIndex);
                    setSelectedChapterIndex(chapterIndex);

                    // Queue selection
                    pendingSelection.current = { bookIndex, chapterIndex, indices };
                }
            });
            return () => removeListener();
        }
    }, []);

    const currentBook = books[selectedBookIndex];

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
        const verseText = sortedIndices.map(i => currentVerses[i]).join(' ');

        // Use keys to find book if we used internal state? currentBook is stable in render.
        // If we just navigated, currentBook might be stale in THIS closure if we changed index?
        // Yes, if we set selectedBookIndex, re-render hasn't happened yet.
        // BUT, if we set state in 'onMobileAction', we trigger re-render.
        // The fetch effect runs after re-render.
        // So 'currentBook' inside the fetch .then() closure? No, fetch effect uses 'books' and 'indices' from scope.
        // Actually, inside the Effect, 'currentBook' (derived const) is from the render scope that triggered the effect.
        // So it is correct!
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

    return (
        <div className="flex flex-col w-full h-full gap-4 text-light/90">
            {/* Header / Config */}
            <div className="flex flex-row gap-4 bg-ash/20 p-4 rounded-xl items-center relative">

                <div className="flex flex-col gap-1 w-1/5">
                    <label className="text-xs font-bold text-ash uppercase">Version</label>
                    <select
                        value={selectedVersion}
                        onChange={(e) => setSelectedVersion(e.target.value)}
                        className="bg-primary border border-light/20 rounded p-2 text-light outline-none"
                    >
                        {Object.entries(versions).map(([key, name]) => (
                            <option key={key} value={key}>
                                {name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col gap-1 w-1/5">
                    <label className="text-xs font-bold text-ash uppercase">Book</label>
                    <select
                        value={selectedBookIndex}
                        onChange={(e) => {
                            setSelectedBookIndex(Number(e.target.value));
                            setSelectedChapterIndex(0);
                        }}
                        className="bg-primary border border-light/20 rounded p-2 text-light outline-none"
                    >
                        {books.map((book, index) => (
                            <option key={book.abbrev} value={index}>
                                {book.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col gap-1 w-1/5">
                    <label className="text-xs font-bold text-ash uppercase">Chapter</label>
                    <select
                        value={selectedChapterIndex}
                        onChange={(e) => setSelectedChapterIndex(Number(e.target.value))}
                        className="bg-primary border border-light/20 rounded p-2 text-light outline-none"
                    >
                        {Array.from({ length: 150 }, (_, i) => i).map((i) => (
                            <option key={i} value={i}>
                                {i + 1}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex-1 flex flex-col items-end gap-2">
                    <div className="text-right opacity-50 text-sm">
                        {currentBook.name} {selectedChapterIndex + 1} ({selectedVersion.toUpperCase()})
                    </div>
                    {selectedVerseIndices.size > 0 && (
                        <button
                            onClick={() => {
                                setSelectedVerseIndices(new Set());
                                electron.Presentation.setContent(null);
                            }}
                            className="bg-red/80 hover:bg-red text-white text-xs font-bold py-2 px-4 rounded transition-colors uppercase tracking-wider"
                        >
                            Stop Presenting
                        </button>
                    )}
                </div>
            </div>

            {/* Content */}
            <div id="verse-container" className="flex-1 bg-ash/10 rounded-xl p-6 overflow-y-auto space-y-4">
                {verses.length > 0 ? verses.map((verse, index) => {
                    const isSelected = selectedVerseIndices.has(index);
                    return (
                        <div
                            key={index}
                            onClick={(e) => handleVerseClick(index, e)}
                            className={`flex gap-4 p-2 rounded transition-all group cursor-pointer ${isSelected ? 'bg-blue-600/20' : 'hover:bg-white/5  '}`}
                        >
                            <span className={`font-bold min-w-[24px] text-right pt-1 text-sm ${isSelected ? 'text-blue-400' : 'text-blue-400/60 group-hover:text-blue-400'}`}>{index + 1}</span>
                            <p className={`text-lg leading-relaxed ${isSelected ? 'text-white' : 'text-light/80'}`}>{verse}</p>
                        </div>
                    );
                }) : (
                    <div className="text-center opacity-50 mt-10">No verses found for this chapter.</div>
                )}
            </div>
        </div>
    );
}
