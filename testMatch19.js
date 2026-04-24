const BOOK_ALIASES = {
    '1john': '1 John', 'first john': '1 John', '1 john': '1 John', '1st john': '1 John',
};
const WORD_NUMBERS = { 'four': 4, 'eight': 8, 'five': 5 };
function wordNumbersToDigits(text) {
    let result = text;
    for (const [word, num] of Object.entries(WORD_NUMBERS)) {
        result = result.replace(new RegExp(`\\b${word}\\b`, 'g'), String(num));
    }
    return result;
}
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
    return null;
}

function smartBibleMatch(rawCommand, books, currentContext = null) {
    let numberTranslated = wordNumbersToDigits(rawCommand.toLowerCase()).replace(/[,;.]/g, ' ');

    let command = numberTranslated.replace(/\b(the book of|book of|read|please|open|to|go to|jump to|show)\b/g, ' ');
    command = command.replace(/\b(chapter|verse|verses|vs|v)\b/g, ' ');
    command = command.replace(/\s+/g, ' ').trim();

    // Pass 1
    let matchedBookName = null;
    let remainingText = command;
    let bestAliasLen = 0;
    for (const [alias, canonical] of Object.entries(BOOK_ALIASES)) {
        const regex = new RegExp(`(?:^|\\s)(${alias})(?:\\s|$)`, 'i');
        const match = command.match(regex);
        if (match) {
            if (alias.length > bestAliasLen) {
                bestAliasLen = alias.length;
                matchedBookName = canonical;
                const idx = match.index + (match[0].startsWith(' ') ? 1 : 0);
                remainingText = command.slice(idx + alias.length).trim();
            }
        }
    }

    if (matchedBookName) {
        let bookIndex = books.findIndex(b => b.name === matchedBookName);
        if (bookIndex !== -1) {
            const parsed = parseChapterVerse(remainingText);
            if (parsed) return { bookIndex, ...parsed, matchType: 'alias' };
            return { bookIndex, chapter: 1, startVerse: 1, endVerse: 1, matchType: 'alias_chapter_only' };
        }
    }

    // Pass 4 (Moved here!)
    const contextJumpMatch = numberTranslated.match(/\b(?:go to |jump to |show )?(?:chapter\s+(\d+))?(?:\s*(?:and\s+)?(?:verse|verses|vs|v)\s+(\d+))\b/i);
    if (contextJumpMatch && currentContext) {
        const { bookIndex, chapter } = currentContext;
        const jumpChapter = contextJumpMatch[1] ? parseInt(contextJumpMatch[1], 10) : chapter;
        const jumpVerse = contextJumpMatch[2] ? parseInt(contextJumpMatch[2], 10) : 1;
        return {
            bookIndex,
            chapter: jumpChapter,
            startVerse: jumpVerse,
            endVerse: jumpVerse,
            matchType: 'context_verse',
        };
    }
    
    return null;
}

const mockBooks = [{name: '1 John'}];
const ctx = { bookIndex: 0, chapter: 2 };

console.log("First John 4 verse 8 ->", smartBibleMatch("First John 4 verse 8", mockBooks, ctx));
console.log("okay let's look at verse 5 ->", smartBibleMatch("okay let's look at verse 5", mockBooks, ctx));

