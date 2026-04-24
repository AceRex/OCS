/**
 * smartBibleMatch.js — OCS Smart Bible Reference Resolver
 *
 * Resolves partial, misspelled, or phonetically similar Bible references
 * into { bookIndex, chapter, startVerse, endVerse, matchType }.
 *
 * Four-pass resolution strategy:
 *  Pass 1 — Exact alias + number parse (fast path)
 *  Pass 2 — Phonetic (Metaphone) + Levenshtein (handles Whisper mishearings)
 *  Pass 3 — Keyword content search via SQLite LIKE (handles "for God so loved")
 *  Pass 4 — Context fallback (chapter/verse only, uses currentContext)
 *
 * Returns null if no match found.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Book alias table — includes full names, abbreviations, and mispronunciations
// ─────────────────────────────────────────────────────────────────────────────
export const BOOK_ALIASES = {
    // Pentateuch
    'gen': 'Genesis', 'genesis': 'Genesis', 'genisis': 'Genesis',
    'ex': 'Exodus', 'exo': 'Exodus', 'exodus': 'Exodus',
    'lev': 'Leviticus', 'leviticus': 'Leviticus',
    'num': 'Numbers', 'numbers': 'Numbers',
    'deut': 'Deuteronomy', 'deuteronomy': 'Deuteronomy', 'deutronomy': 'Deuteronomy',
    'deu': 'Deuteronomy',

    // Historical
    'josh': 'Joshua', 'joshua': 'Joshua',
    'judg': 'Judges', 'judges': 'Judges',
    'ruth': 'Ruth',
    '1sam': '1 Samuel', '1samuel': '1 Samuel', 'first samuel': '1 Samuel', '1 sam': '1 Samuel', '1st samuel': '1 Samuel', '1st sam': '1 Samuel',
    '2sam': '2 Samuel', '2samuel': '2 Samuel', 'second samuel': '2 Samuel', '2 sam': '2 Samuel', '2nd samuel': '2 Samuel', '2nd sam': '2 Samuel',
    'sam': 'Samuel',
    '1ki': '1 Kings', '1kings': '1 Kings', 'first kings': '1 Kings', '1 kings': '1 Kings', 'first king': '1 Kings', '1 king': '1 Kings', '1st kings': '1 Kings', '1st king': '1 Kings',
    '2ki': '2 Kings', '2kings': '2 Kings', 'second kings': '2 Kings', '2 kings': '2 Kings', 'second king': '2 Kings', '2 king': '2 Kings', '2nd kings': '2 Kings', '2nd king': '2 Kings',
    'kings': 'Kings', 'king': 'Kings',
    '1chr': '1 Chronicles', '1chronicles': '1 Chronicles', 'first chronicles': '1 Chronicles', 'first chronicle': '1 Chronicles', '1 chronicle': '1 Chronicles', '1st chronicles': '1 Chronicles', '1st chronicle': '1 Chronicles',
    '2chr': '2 Chronicles', '2chronicles': '2 Chronicles', 'second chronicles': '2 Chronicles', 'second chronicle': '2 Chronicles', '2 chronicle': '2 Chronicles', '2nd chronicles': '2 Chronicles', '2nd chronicle': '2 Chronicles',
    'chronicles': 'Chronicles', 'chron': 'Chronicles', 'chronicle': 'Chronicles',
    'ezra': 'Ezra',
    'neh': 'Nehemiah', 'nehemiah': 'Nehemiah',
    'esth': 'Esther', 'esther': 'Esther',

    // Wisdom
    'job': 'Job',
    'ps': 'Psalms', 'psa': 'Psalms', 'psalm': 'Psalms', 'psalms': 'Psalms', 'sams': 'Psalms',
    'prov': 'Proverbs', 'proverbs': 'Proverbs', 'proverb': 'Proverbs',
    'eccl': 'Ecclesiastes', 'ecclesiastes': 'Ecclesiastes',
    'song': 'Song of Solomon', 'songs': 'Song of Solomon',
    'song of songs': 'Song of Solomon', 'song of solomon': 'Song of Solomon',
    'sos': 'Song of Solomon',

    // Major Prophets
    'isa': 'Isaiah', 'isaiah': 'Isaiah',
    'jer': 'Jeremiah', 'jeremiah': 'Jeremiah',
    'lam': 'Lamentations', 'lamentations': 'Lamentations',
    'ezek': 'Ezekiel', 'ezekiel': 'Ezekiel',
    'dan': 'Daniel', 'daniel': 'Daniel',

    // Minor Prophets
    'hos': 'Hosea', 'hosea': 'Hosea',
    'joel': 'Joel',
    'amos': 'Amos',
    'obad': 'Obadiah', 'obadiah': 'Obadiah',
    'jonah': 'Jonah', 'jon': 'Jonah',
    'mic': 'Micah', 'micah': 'Micah',
    'nah': 'Nahum', 'nahum': 'Nahum',
    'hab': 'Habakkuk', 'habakkuk': 'Habakkuk',
    'zeph': 'Zephaniah', 'zephaniah': 'Zephaniah',
    'hag': 'Haggai', 'haggai': 'Haggai',
    'zech': 'Zechariah', 'zechariah': 'Zechariah',
    'mal': 'Malachi', 'malachi': 'Malachi',

    // NT Gospels & Acts
    'matt': 'Matthew', 'matthew': 'Matthew', 'mathew': 'Matthew', 'mat': 'Matthew',
    'mark': 'Mark', 'mrk': 'Mark', 'marc': 'Mark', 'mac': 'Mark', 'march': 'Mark',
    'luke': 'Luke', 'luk': 'Luke', 'luc': 'Luke', 'look': 'Luke',
    'john': 'John', 'jn': 'John', 'joh': 'John', 'jon': 'John',
    'acts': 'Acts', 'act': 'Acts', 'axe': 'Acts',

    // Epistles
    'rom': 'Romans', 'romans': 'Romans',
    '1cor': '1 Corinthians', '1corinthians': '1 Corinthians', 'first corinthians': '1 Corinthians', '1 corinthians': '1 Corinthians', 'first corinthian': '1 Corinthians', '1 corinthian': '1 Corinthians', '1st corinthians': '1 Corinthians', '1st corinthian': '1 Corinthians',
    '2cor': '2 Corinthians', '2corinthians': '2 Corinthians', 'second corinthians': '2 Corinthians', '2 corinthians': '2 Corinthians', 'second corinthian': '2 Corinthians', '2 corinthian': '2 Corinthians', '2nd corinthians': '2 Corinthians', '2nd corinthian': '2 Corinthians',
    'cor': 'Corinthians', 'corinthian': 'Corinthians',
    'gal': 'Galatians', 'galatians': 'Galatians',
    'eph': 'Ephesians', 'ephesians': 'Ephesians', 'ephesian': 'Ephesians',
    'phil': 'Philippians', 'philippians': 'Philippians', 'philippian': 'Philippians',
    'col': 'Colossians', 'colossians': 'Colossians', 'colossian': 'Colossians',
    '1thess': '1 Thessalonians', '1thessalonians': '1 Thessalonians', 'first thessalonians': '1 Thessalonians', '1 thessalonians': '1 Thessalonians', '1st thessalonians': '1 Thessalonians',
    '2thess': '2 Thessalonians', '2thessalonians': '2 Thessalonians', 'second thessalonians': '2 Thessalonians', '2 thessalonians': '2 Thessalonians', '2nd thessalonians': '2 Thessalonians',
    'thess': 'Thessalonians', 'thessalonian': 'Thessalonians',
    '1tim': '1 Timothy', '1timothy': '1 Timothy', 'first timothy': '1 Timothy', '1 timothy': '1 Timothy', '1st timothy': '1 Timothy',
    '2tim': '2 Timothy', '2timothy': '2 Timothy', 'second timothy': '2 Timothy', '2 timothy': '2 Timothy', '2nd timothy': '2 Timothy',
    'tim': 'Timothy',
    'tit': 'Titus', 'titus': 'Titus',
    'philem': 'Philemon', 'philemon': 'Philemon', 'filemon': 'Philemon',
    'heb': 'Hebrews', 'hebrews': 'Hebrews',
    'jam': 'James', 'james': 'James', 'jas': 'James',
    '1pet': '1 Peter', '1peter': '1 Peter', 'first peter': '1 Peter', '1 peter': '1 Peter', '1st peter': '1 Peter',
    '2pet': '2 Peter', '2peter': '2 Peter', 'second peter': '2 Peter', '2 peter': '2 Peter', '2nd peter': '2 Peter',
    'pet': 'Peter',
    '1john': '1 John', 'first john': '1 John', '1 john': '1 John', '1st john': '1 John',
    '2john': '2 John', 'second john': '2 John', '2 john': '2 John', '2nd john': '2 John',
    '3john': '3 John', 'third john': '3 John', '3 john': '3 John', '3rd john': '3 John',
    'jude': 'Jude',
    'rev': 'Revelation', 'revelation': 'Revelation', 'revelations': 'Revelation',
    'apoc': 'Revelation',
};

// ─────────────────────────────────────────────────────────────────────────────
// Phonetic helpers (Simplified Metaphone)
// ─────────────────────────────────────────────────────────────────────────────
export function phoneticCode(word) {
    if (!word) return '';
    let code = word.toUpperCase().replace(/[^A-Z]/g, '');
    if (!code) return '';
    code = code
        .replace(/PH/g, 'F')
        .replace(/KN|GN|PN|AE|WR/g, m => m[1])
        .replace(/SH|SI|TI/g, 'X')
        .replace(/CH/g, 'X')
        .replace(/TH/g, 'T')
        .replace(/WH/g, 'W')
        .replace(/[CSZ]/g, 'S')
        .replace(/[GKQ]/g, 'K')
        .replace(/[DT]/g, 'T');
    const first = code[0];
    const rest = code.slice(1).replace(/[AEIOUY]/g, '');
    const full = first + rest;
    return full.split('').filter((c, i, a) => i === 0 || c !== a[i - 1]).join('');
}

export function levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const dp = [];
    for (let i = 0; i <= b.length; i++) dp[i] = [i];
    for (let j = 0; j <= a.length; j++) dp[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b[i - 1] === a[j - 1]) dp[i][j] = dp[i - 1][j - 1];
            else dp[i][j] = 1 + Math.min(dp[i - 1][j - 1], dp[i][j - 1], dp[i - 1][j]);
        }
    }
    return dp[b.length][a.length];
}

// ─────────────────────────────────────────────────────────────────────────────
// Number helpers
// ─────────────────────────────────────────────────────────────────────────────
const WORD_NUMBERS = {
    'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
    'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19,
    'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60,
    'seventy': 70, 'eighty': 80, 'ninety': 90, 'hundred': 100,
    'twenty-one': 21, 'twenty-two': 22, 'twenty-three': 23, 'twenty-four': 24,
    'twenty-five': 25, 'twenty-six': 26, 'twenty-seven': 27, 'twenty-eight': 28,
    'twenty-nine': 29, 'thirty-one': 31, 'thirty-two': 32, 'thirty-three': 33,
    'forty-five': 45, 'fifty-five': 55,
};

export function wordNumbersToDigits(text) {
    // Handle compound "twenty one" (space form) first
    let result = text;
    result = result.replace(/\btwenty\s+(\w+)\b/g, (_, rest) => WORD_NUMBERS['twenty-' + rest] ?? ('twenty ' + rest));
    result = result.replace(/\bthirty\s+(\w+)\b/g, (_, rest) => WORD_NUMBERS['thirty-' + rest] ?? ('thirty ' + rest));
    result = result.replace(/\bforty\s+(\w+)\b/g, (_, rest) => WORD_NUMBERS['forty-' + rest] ?? ('forty ' + rest));
    // Single word numbers
    for (const [word, num] of Object.entries(WORD_NUMBERS)) {
        result = result.replace(new RegExp(`\\b${word}\\b`, 'g'), String(num));
    }
    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse chapter/verse from remaining text after book is identified
// ─────────────────────────────────────────────────────────────────────────────
function parseChapterVerse(text) {
    if (!text || !text.trim()) return null;

    const t = text.trim();

    // Pattern: "3:16", "3 16", "3 verse 16", "chapter 3 verse 16", "3 to 18"
    const m = t.match(/(\d+)[\s:]+(\d+)(?:\s*(?:to|through|and|-)\s*(\d+))?/i);
    if (m) {
        return {
            chapter: parseInt(m[1], 10),
            startVerse: parseInt(m[2], 10),
            endVerse: m[3] ? parseInt(m[3], 10) : parseInt(m[2], 10),
        };
    }
    // Chapter only: "3" or "chapter 3"
    const chOnly = t.match(/^\s*(\d+)/);
    if (chOnly) {
        return { chapter: parseInt(chOnly[1], 10), startVerse: 1, endVerse: 1 };
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export — smartBibleMatch
// ─────────────────────────────────────────────────────────────────────────────
/**
 * 4-Pass Smart Bible Matcher
 * Returns { bookIndex, chapter, startVerse, endVerse, matchType, searchResults? } or null
 * 
 * @param {string} rawCommand - The spoken text (e.g. "John 3 16")
 * @param {Array} books - Array of book objects { id, name }
 * @param {Object} bibleElectron - The window.electron.Bible IPC bridge (for keyword search)
 * @param {Object} currentContext - { bookIndex, chapter, verse } to allow "verse 5" jumps
 * @param {boolean} isMidSpeech - Flag indicating if this is an aggressive mid-speech probe
 * @returns {Promise<{bookIndex, chapter, startVerse, endVerse, matchType}|null>}
 */
export async function smartBibleMatch(rawCommand, books, bibleElectron, currentContext = null, isMidSpeech = false) {
    // Convert word numbers to digits FIRST so Pass 4 regex works with "verse five"
    let numberTranslated = wordNumbersToDigits(rawCommand.toLowerCase()).replace(/[,;.]/g, ' ');

    // (Pass 4 was moved down below Pass 1 to prevent hijacking full references)

    // Now finish pre-processing for the book match passes
    let command = numberTranslated.replace(/\b(the book of|book of|read|please|open|to|go to|jump to|show|ocs|media|oasis|ocean|meeting|video)\b/g, ' ');
    command = command.replace(/\b(chapter|verse|verses|vs|v)\b/g, ' ');
    command = command.replace(/\s+/g, ' ').trim();

    // ─────────────────────────────────────────────────────────────────────────
    // PASS 1 — Exact alias match
    // ─────────────────────────────────────────────────────────────────────────
    let matchedBookName = null;
    let remainingText = command;

    // Check alias table — longest match wins
    let bestAliasLen = 0;
    for (const [alias, canonical] of Object.entries(BOOK_ALIASES)) {
        // Find alias followed by non-alpha (digit/space/etc) or end of string
        const regex = new RegExp(`(?:^|\\s)(${alias})(?=[^a-z]|$)`, 'i');
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

    // If alias found, find its index in the books array
    if (matchedBookName) {
        let bookIndex = books.findIndex(b => b.name === matchedBookName);
        
        // Fallback for partial DB name matches
        if (bookIndex === -1) {
            bookIndex = books.findIndex(b =>
                b.name.includes(matchedBookName) ||
                matchedBookName.includes(b.name)
            );
        }
        if (bookIndex !== -1) {
            const parsed = parseChapterVerse(remainingText);
            if (parsed) {
                return { bookIndex, ...parsed, matchType: 'alias' };
            }
            // Book found but no chapter — default to chapter 1, verse 1
            return { bookIndex, chapter: 1, startVerse: 1, endVerse: 1, matchType: 'alias_chapter_only' };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PASS 4 — Context-only jump (chapter X / verse X, no book name mentioned)
    // Placed after Pass 1 so "1 John 4 verse 8" isn't hijacked by the "verse 8" part.
    // Relaxed regex allows conversational text like "okay let's look at verse 5".
    // ─────────────────────────────────────────────────────────────────────────
    const contextJumpMatch = numberTranslated.match(/\b(?:go to |jump to |show |let's look at |what about |read )?(?:chapter\s+(\d+)(?:\s*(?:and\s+)?(?:verse|verses|vs|v)\s+(\d+))?|(?:verse|verses|vs|v)\s+(\d+))\b/i);

    if (contextJumpMatch && currentContext) {
        const { bookIndex, chapter } = currentContext;
        const jumpChapter = contextJumpMatch[1] ? parseInt(contextJumpMatch[1], 10) : chapter;
        
        const verseString = contextJumpMatch[2] || contextJumpMatch[3];
        const jumpVerse = verseString ? parseInt(verseString, 10) : 1;
        
        return {
            bookIndex,
            chapter: jumpChapter,
            startVerse: jumpVerse,
            endVerse: jumpVerse,
            matchType: verseString ? 'context_verse' : 'context_chapter',
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PASS 2 — Fuzzy phonetic + Levenshtein match on all 66 book names
    // ─────────────────────────────────────────────────────────────────────────
    const words = command.split(' ');

    // Try first 1, 2, or 3 words as the book name
    let bestFuzzyMatch = null;
    let bestFuzzyScore = Infinity;
    let bestFuzzyRemainder = '';

    for (let wordCount = 3; wordCount >= 1; wordCount--) {
        const candidate = words.slice(0, wordCount).join(' ');
        const candidatePhonetic = phoneticCode(candidate.replace(/\s/g, ''));

        for (const book of books) {
            const bookLower = book.name.toLowerCase();
            const bookPhonetic = phoneticCode(book.name.replace(/\s/g, ''));

            // Phonetic match (exact sound-alike)
            if (candidatePhonetic && bookPhonetic && candidatePhonetic === bookPhonetic) {
                const remainder = words.slice(wordCount).join(' ');
                const parsed = parseChapterVerse(remainder);
                if (parsed) {
                    const bookIndex = books.indexOf(book);
                    return { bookIndex, ...parsed, matchType: 'phonetic' };
                }
            }

            // Levenshtein distance
            const dist = levenshtein(candidate, bookLower.split(' ')[0]);
            const maxLen = Math.max(candidate.length, bookLower.length);
            const score = dist / maxLen; // Normalised: 0=exact, 1=completely different

            if (score < 0.35 && dist < bestFuzzyScore) {
                bestFuzzyScore = dist;
                bestFuzzyMatch = book;
                bestFuzzyRemainder = words.slice(wordCount).join(' ');
            }
        }
    }

    if (bestFuzzyMatch) {
        const parsed = parseChapterVerse(bestFuzzyRemainder);
        const bookIndex = books.indexOf(bestFuzzyMatch);
        if (parsed) {
            return { bookIndex, ...parsed, matchType: 'fuzzy' };
        }
        // Matched book but no numbers — default to chapter 1
        return { bookIndex, chapter: 1, startVerse: 1, endVerse: 1, matchType: 'fuzzy_no_numbers' };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PASS 3 — Keyword content search (e.g. "for God so loved the world")
    // Uses window.electron.Bible.searchVerses if available
    // ─────────────────────────────────────────────────────────────────────────
    if (bibleElectron && bibleElectron.searchVerses) {
        // Extract meaningful keywords (strip stop words, min 4 chars)
        const STOP_WORDS = new Set([
            'the', 'and', 'for', 'that', 'this', 'with', 'from', 'shall', 'unto',
            'thee', 'thou', 'thy', 'hath', 'have', 'will', 'which', 'but', 'not',
            'are', 'was', 'were', 'been', 'unto', 'upon', 'into', 'also', 'even',
        ]);
        const keywords = rawCommand.split(/\s+/)
            .map(w => w.toLowerCase().replace(/[^a-z]/g, ''))
            .filter(w => w.length >= 4 && !STOP_WORDS.has(w));

        const minKeywords = isMidSpeech ? 4 : 2;

        if (keywords.length >= minKeywords) {
            try {
                const results = await bibleElectron.searchVerses(keywords.slice(0, 4).join(' '), 'kjv', 5);
                if (results && results.length > 0) {
                    const top = results[0];
                    // top = { book_id, chapter, verse, text }
                    const bookIndex = books.findIndex(b => b.id === top.book_id);
                    if (bookIndex !== -1) {
                        return {
                            bookIndex,
                            chapter: top.chapter,
                            startVerse: top.verse,
                            endVerse: top.verse,
                            matchType: 'keyword_search',
                            searchResults: results.slice(0, 3),
                        };
                    }
                }
            } catch (_) {
                // searchVerses not implemented yet — fail silently
            }
        }
    }

    // No match found
    return null;
}

/**
 * Get top-3 candidate suggestions for "Did you mean?" when no match found.
 * Returns array of { name, distance } sorted by distance ascending.
 */
export function getBookSuggestions(command, books) {
    const firstWord = command.split(' ')[0];
    const scored = books.map(b => ({
        name: b.name,
        distance: levenshtein(firstWord, b.name.toLowerCase()),
    }));
    scored.sort((a, b) => a.distance - b.distance);
    return scored.slice(0, 3).filter(s => s.distance <= 6);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper to detect if a phrase starts with a Bible book and a chapter number
// ─────────────────────────────────────────────────────────────────────────────
export function isLikelyBibleReference(rawText) {
    if (!rawText) return false;
    
    // Clean text: digits, handle common separators including colons
    let t = wordNumbersToDigits(rawText.toLowerCase()).replace(/[,;.:]/g, ' ');
    t = t.replace(/\b(the book of|book of|read|please|open|to|go to|jump to|show|ocs|media|oasis|ocean|meeting|video)\b/g, ' ').trim();
    
    // Check if it's a direct context jump (e.g. "verse 5" or "chapter 3")
    if (/\b(?:chapter|verse|verses|vs|v)\s*\d+\b/i.test(t)) {
        return true;
    }

    // Sort aliases by length descending so "1 john" is checked before "john"
    const aliases = Object.keys(BOOK_ALIASES).sort((a, b) => b.length - a.length);
    
    // Search for any alias followed by a number (allowing optional space for slurred speech)
    for (const alias of aliases) {
        // Use \b for boundary if it doesn't end in a number (like "john")
        // but allow slurred John3
        const regex = new RegExp(`\\b${alias}\\s*\\d+`, 'i');
        if (regex.test(t)) {
            return true;
        }
    }
    return false;
}
