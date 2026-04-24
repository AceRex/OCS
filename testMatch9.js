function parseChapterVerse(text) {
    if (!text || !text.trim()) return null;
    const t = text.trim();
    const m = t.match(/(\d+)[\s:]+(\d+)(?:\s*(?:to|through|and|-)\s*(\d+))?/i);
    if (m) {
        return {
            chapter: parseInt(m[1], 10),
            startVerse: parseInt(m[2], 10),
            endVerse: m[3] ? parseInt(m[3], 10) : parseInt(m[2], 10),
        };
    }
    const chOnly = t.match(/^\s*(\d+)/);
    if (chOnly) {
        return { chapter: parseInt(chOnly[1], 10), startVerse: 1, endVerse: 1 };
    }
    return null;
}

console.log(parseChapterVerse("1 3 and it was cool"));
console.log(parseChapterVerse("3 and it was cool"));
console.log(parseChapterVerse("3 to 5 and it was cool"));

