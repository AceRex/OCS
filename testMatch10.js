function parseChapterVerse(text) {
    if (!text || !text.trim()) return null;
    const t = text.trim();
    const m = t.match(/(\d+)[\s:]+(\d+)(?:\s*(?:to|through|and|-)\s*(\d+))?/i);
    return m ? { chapter: parseInt(m[1]), verse: parseInt(m[2]) } : null;
}
console.log(parseChapterVerse("3 to 5"));
