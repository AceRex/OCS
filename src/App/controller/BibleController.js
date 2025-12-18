import React, { useState, useEffect } from 'react';

const versions = {
    kjv: "King James Version",
    bbe: "Bible in Basic English"
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

    // Fetch Verses when selection changes
    useEffect(() => {
        if (books.length === 0) return;

        electron.Bible.getChapter(selectedVersion, selectedBookIndex, selectedChapterIndex + 1)
            .then(setVerses)
            .catch(console.error);

    }, [selectedVersion, selectedBookIndex, selectedChapterIndex, books]);

    const currentBook = books[selectedBookIndex];

    // Scroll top
    useEffect(() => {
        const verseContainer = document.getElementById('verse-container');
        if (verseContainer) verseContainer.scrollTop = 0;
    }, [selectedBookIndex, selectedChapterIndex, selectedVersion]);

    // Presentation Logic
    const presentVerses = (indices) => {
        if (indices.size === 0) {
            electron.Presentation.setContent(null);
            return;
        }

        const sortedIndices = Array.from(indices).sort((a, b) => a - b);
        const verseText = sortedIndices.map(i => verses[i]).join(' ');

        const bookName = currentBook.name;
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
            <div className="flex flex-row gap-4 bg-ash/20 p-4 rounded-xl items-center">
                <div className="flex flex-col gap-1 w-1/4">
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

                <div className="flex flex-col gap-1 w-1/4">
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

                <div className="flex flex-col gap-1 w-1/4">
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

                <div className="flex-1 text-right opacity-50 text-sm">
                    {currentBook.name} {selectedChapterIndex + 1} ({selectedVersion.toUpperCase()})
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
                            className={`flex gap-4 p-2 rounded transition-all group cursor-pointer border ${isSelected ? 'bg-blue-600/20 border-blue-500' : 'hover:bg-white/5 border-transparent'}`}
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
