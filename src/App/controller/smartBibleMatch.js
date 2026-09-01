/**
 * smartBibleMatch.js — OCS Smart Bible Reference Resolver
 *
 * Resolves partial, misspelled, or phonetically similar Bible references
 * into { bookIndex, chapter, startVerse, endVerse, matchType }.
 *
 * Four-pass resolution strategy:
 *  Pass 1 — Exact alias + number parse (fast path)
 *  Pass 2 — Phonetic (Metaphone) + Levenshtein (handles Vosk mishearings)
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
    'ex': 'Exodus', 'exo': 'Exodus', 'exod': 'Exodus', 'exodus': 'Exodus', 'exoda': 'Exodus', 'exodo': 'Exodus',
    'lev': 'Leviticus', 'leviticus': 'Leviticus', 'levanticus': 'Leviticus', 'levanticos': 'Leviticus', 'leveticus': 'Leviticus', 'lebiticus': 'Leviticus', 'levitico': 'Leviticus', 'leviticos': 'Leviticus',
    'num': 'Numbers', 'numbers': 'Numbers',
    'deut': 'Deuteronomy', 'deuteronomy': 'Deuteronomy', 'deutronomy': 'Deuteronomy', 'deu': 'Deuteronomy',
    'the terronomy': 'Deuteronomy', 'the teronomy': 'Deuteronomy', 'theteronomy': 'Deuteronomy', 'theteronomi': 'Deuteronomy',
    'detreronomy': 'Deuteronomy', 'deterronomy': 'Deuteronomy', 'deteronomy': 'Deuteronomy', 'terronomy': 'Deuteronomy', 'teronomy': 'Deuteronomy', 'deuteronome': 'Deuteronomy',

    // Historical
    'josh': 'Joshua', 'joshua': 'Joshua',
    'judg': 'Judges', 'judges': 'Judges', 'judge': 'Judges', 'jdg': 'Judges',
    'ruth': 'Ruth',
    '1sam': '1 Samuel', '1samuel': '1 Samuel', 'first samuel': '1 Samuel', '1 sam': '1 Samuel', '1st samuel': '1 Samuel', '1st sam': '1 Samuel',
    'first summer': '1 Samuel', '1st summer': '1 Samuel', '1 summer': '1 Samuel', 'summer': '1 Samuel', 'samuel': '1 Samuel',
    '2sam': '2 Samuel', '2samuel': '2 Samuel', 'second samuel': '2 Samuel', '2 sam': '2 Samuel', '2nd samuel': '2 Samuel', '2nd sam': '2 Samuel',
    'second summer': '2 Samuel', '2nd summer': '2 Samuel', '2 summer': '2 Samuel',
    '1ki': '1 Kings', '1kings': '1 Kings', 'first kings': '1 Kings', '1 kings': '1 Kings', 'first king': '1 Kings', '1 king': '1 Kings', '1st kings': '1 Kings', '1st king': '1 Kings',
    'foske': '1 Kings', 'foski': '1 Kings', 'foskey': '1 Kings', 'fuski': '1 Kings', 'force king': '1 Kings', 'force kings': '1 Kings', 'first key': '1 Kings', 'first keys': '1 Kings',
    'foskins': '1 Kings', "foskin's": '1 Kings', 'foskin': '1 Kings', 'foskis': '1 Kings', "foski's": '1 Kings', 'foskes': '1 Kings', "foske's": '1 Kings',
    'fuskins': '1 Kings', "fuskin's": '1 Kings', 'fuskin': '1 Kings', "fuski's": '1 Kings',
    'faskins': '1 Kings', "faskin's": '1 Kings', 'faskin': '1 Kings', 'faskings': '1 Kings', 'fasking': '1 Kings', 'faskens': '1 Kings', 'fasken': '1 Kings', 'fask': '1 Kings', 'fast kings': '1 Kings', 'fast king': '1 Kings',
    '2ki': '2 Kings', '2kings': '2 Kings', 'second kings': '2 Kings', '2 kings': '2 Kings', 'second king': '2 Kings', '2 king': '2 Kings', '2nd kings': '2 Kings', '2nd king': '2 Kings',
    'kings': '1 Kings', 'king': '1 Kings',
    '1chr': '1 Chronicles', '1chronicles': '1 Chronicles', 'first chronicles': '1 Chronicles', 'first chronicle': '1 Chronicles', '1 chronicle': '1 Chronicles', '1st chronicles': '1 Chronicles', '1st chronicle': '1 Chronicles',
    '2chr': '2 Chronicles', '2chronicles': '2 Chronicles', 'second chronicles': '2 Chronicles', 'second chronicle': '2 Chronicles', '2 chronicle': '2 Chronicles', '2nd chronicles': '2 Chronicles', '2nd chronicle': '2 Chronicles',
    'chronicles': '1 Chronicles', 'chron': '1 Chronicles', 'chronicle': '1 Chronicles',
    'ezra': 'Ezra',
    'neh': 'Nehemiah', 'nehemiah': 'Nehemiah', 'nehemao': 'Nehemiah', 'neimei': 'Nehemiah', 'nei maya': 'Nehemiah', 'niy maya': 'Nehemiah', 'neimaya': 'Nehemiah', 'niymaya': 'Nehemiah', 'nehemaya': 'Nehemiah', 'nehamaya': 'Nehemiah', 'nehemiya': 'Nehemiah', 'nehemi': 'Nehemiah',
    'esth': 'Esther', 'esther': 'Esther',

    // Wisdom
    'job': 'Job',
    'ps': 'Psalms', 'psa': 'Psalms', 'psalm': 'Psalms', 'psalms': 'Psalms', 'sams': 'Psalms',
    'sam': 'Psalms', 'some': 'Psalms', 'soms': 'Psalms', 'som': 'Psalms', 'salm': 'Psalms', 'salms': 'Psalms', 'psam': 'Psalms', 'psams': 'Psalms',
    'prov': 'Proverbs', 'proverbs': 'Proverbs', 'proverb': 'Proverbs',
    'eccl': 'Ecclesiastes', 'ecclesiastes': 'Ecclesiastes', 'ecclesiastics': 'Ecclesiastes',
    'ecclesiasticks': 'Ecclesiastes', 'ecclesia sticks': 'Ecclesiastes', 'ecclesia stick': 'Ecclesiastes',
    'ecclesiastic': 'Ecclesiastes', 'eclesiastes': 'Ecclesiastes', 'eklesiastes': 'Ecclesiastes',
    'ecclesiast': 'Ecclesiastes', 'ecclesiaste': 'Ecclesiastes', 'ecclesiasti': 'Ecclesiastes',
    'song': 'Song of Solomon', 'songs': 'Song of Solomon',
    'song of songs': 'Song of Solomon', 'songs of songs': 'Song of Solomon',
    'song of solomon': 'Song of Solomon', 'songs of solomon': 'Song of Solomon',
    'songs of suluman': 'Song of Solomon', 'song of suluman': 'Song of Solomon',
    'songs of salomon': 'Song of Solomon', 'song of salomon': 'Song of Solomon',
    'suluman': 'Song of Solomon', 'solomon': 'Song of Solomon',
    'sos': 'Song of Solomon',

    // Major Prophets
    'isa': 'Isaiah', 'isaiah': 'Isaiah', 'aisayan': 'Isaiah', 'aisaya': 'Isaiah', 'asayan': 'Isaiah', 'isayan': 'Isaiah',
    'jer': 'Jeremiah', 'jeremiah': 'Jeremiah',
    'jaymiah': 'Jeremiah', 'jayemiah': 'Jeremiah',
    'jerimiah': 'Jeremiah', 'jermiah': 'Jeremiah', 'jeremyah': 'Jeremiah',
    'jeremia': 'Jeremiah', 'jeremiya': 'Jeremiah', 'jeremaya': 'Jeremiah',
    'jeremy': 'Jeremiah',
    'lam': 'Lamentations', 'lamentations': 'Lamentations', 'lamentation': 'Lamentations', 'lament': 'Lamentations',
    'ezek': 'Ezekiel', 'ezekiel': 'Ezekiel',
    'dan': 'Daniel', 'daniel': 'Daniel',

    // Minor Prophets
    'hos': 'Hosea', 'hosea': 'Hosea', 'osia': 'Hosea', 'ousia': 'Hosea', 'ocea': 'Hosea', 'oshea': 'Hosea', 'hoshea': 'Hosea', 'osea': 'Hosea',
    'joel': 'Joel', 'joyall': 'Joel', 'joyl': 'Joel', 'joyel': 'Joel', 'joe': 'Joel',
    'amos': 'Amos', 'almost': 'Amos', 'amoss': 'Amos', 'amoz': 'Amos',
    'obad': 'Obadiah', 'obadiah': 'Obadiah', 'obadia': 'Obadiah', 'obadi': 'Obadiah', 'obede': 'Obadiah', 'obediah': 'Obadiah',
    'jonah': 'Jonah',
    'mic': 'Micah', 'micah': 'Micah', 'my car': 'Micah', 'my ca': 'Micah', 'mica': 'Micah',
    'nah': 'Nahum', 'nahum': 'Nahum', 'nahul': 'Nahum', 'nahoon': 'Nahum', 'nahun': 'Nahum', 'nahoom': 'Nahum',
    'hab': 'Habakkuk', 'habakkuk': 'Habakkuk', 'amakuk': 'Habakkuk', 'abakuk': 'Habakkuk', 'abakukk': 'Habakkuk',
    'have a cook': 'Habakkuk', 'haveacook': 'Habakkuk', 'habba cook': 'Habakkuk',
    'habit cook': 'Habakkuk', 'have a cup': 'Habakkuk',
    'zeph': 'Zephaniah', 'zephaniah': 'Zephaniah',
    'stephanie': 'Zephaniah', 'zephania': 'Zephaniah', 'sefania': 'Zephaniah',
    'hag': 'Haggai', 'haggai': 'Haggai',
    'zech': 'Zechariah', 'zechariah': 'Zechariah', 'zakaraya': 'Zechariah', 'zachariah': 'Zechariah', 'zakariah': 'Zechariah', 'zackariah': 'Zechariah', 'zekariah': 'Zechariah', 'zacharia': 'Zechariah', 'zakariya': 'Zechariah',
    'mal': 'Malachi', 'malachi': 'Malachi',
    'molokai': 'Malachi', 'malakai': 'Malachi', 'malakhi': 'Malachi', 'molochi': 'Malachi', 'molakai': 'Malachi',

    // NT Gospels & Acts
    'matt': 'Matthew', 'matthew': 'Matthew', 'mathew': 'Matthew', 'mat': 'Matthew',
    'mattew': 'Matthew', 'matthu': 'Matthew', 'mathu': 'Matthew', 'matyu': 'Matthew',
    'mark': 'Mark', 'mrk': 'Mark', 'marc': 'Mark', 'mac': 'Mark', 'march': 'Mark',
    'mach': 'Mark', 'match': 'Mark', 'marsh': 'Mark', 'mak': 'Mark', 'marg': 'Mark', 'merk': 'Mark',
    'mock': 'Mark', 'mocked': 'Mark', 'marks': 'Mark',
    'luke': 'Luke', 'luk': 'Luke', 'luc': 'Luke', 'look': 'Luke',
    'john': 'John', 'jn': 'John', 'joh': 'John',
    'junk': 'John',
    'acts': 'Acts', 'act': 'Acts', 'axe': 'Acts',

    // Epistles
    'rom': 'Romans', 'romans': 'Romans', 'roman': 'Romans', 'rumus': 'Romans', 'rumas': 'Romans', 'romus': 'Romans', 'rumos': 'Romans', 'roomers': 'Romans', 'roomas': 'Romans', 'rhombus': 'Romans',
    '1cor': '1 Corinthians', '1corinthians': '1 Corinthians', 'first corinthians': '1 Corinthians', '1 corinthians': '1 Corinthians', 'first corinthian': '1 Corinthians', '1 corinthian': '1 Corinthians', '1st corinthians': '1 Corinthians', '1st corinthian': '1 Corinthians',
    '2cor': '2 Corinthians', '2corinthians': '2 Corinthians', 'second corinthians': '2 Corinthians', '2 corinthians': '2 Corinthians', 'second corinthian': '2 Corinthians', '2 corinthian': '2 Corinthians', '2nd corinthians': '2 Corinthians', '2nd corinthian': '2 Corinthians',
    'cor': '1 Corinthians', 'corinthian': '1 Corinthians', 'corinthians': '1 Corinthians',
    'gal': 'Galatians', 'galatians': 'Galatians', 'galleets': 'Galatians', 'galitians': 'Galatians', 'calitians': 'Galatians', 'caledians': 'Galatians', 'galatia': 'Galatians',
    'eph': 'Ephesians', 'ephesians': 'Ephesians', 'ephesian': 'Ephesians', 'eficiency': 'Ephesians', 'efficiency': 'Ephesians', 'efitians': 'Ephesians', 'efesiens': 'Ephesians',
    'phil': 'Philippians', 'philippians': 'Philippians', 'philippian': 'Philippians',
    'philippines': 'Philippians', 'philippine': 'Philippians',
    'philipians': 'Philippians', 'philipian': 'Philippians',
    'filippines': 'Philippians', 'filipines': 'Philippians',
    'philip pines': 'Philippians', 'phillipines': 'Philippians', 'phillipians': 'Philippians',
    'col': 'Colossians', 'colossians': 'Colossians', 'colossian': 'Colossians',
    'colosians': 'Colossians', 'colosian': 'Colossians',
    'kolossians': 'Colossians', 'kolosians': 'Colossians',
    'colossyans': 'Colossians', 'colosseans': 'Colossians',
    'collisions': 'Colossians', 'collision': 'Colossians',
    'collosions': 'Colossians', 'collosion': 'Colossians',
    'collusion': 'Colossians', 'collusions': 'Colossians',
    'collotions': 'Colossians', 'collotion': 'Colossians',
    'collations': 'Colossians', 'collation': 'Colossians',
    'coalition': 'Colossians', 'coalitions': 'Colossians',
    'college as': 'Colossians', 'college is': 'Colossians', 'college ass': 'Colossians',
    "justin's as": 'Colossians', 'justins as': 'Colossians', 'justin as': 'Colossians',
    'justins': 'Colossians', "justin's": 'Colossians',
    '1thess': '1 Thessalonians', '1thessalonians': '1 Thessalonians', 'first thessalonians': '1 Thessalonians', '1 thessalonians': '1 Thessalonians', '1st thessalonians': '1 Thessalonians',
    '2thess': '2 Thessalonians', '2thessalonians': '2 Thessalonians', 'second thessalonians': '2 Thessalonians', '2 thessalonians': '2 Thessalonians', '2nd thessalonians': '2 Thessalonians',
    'thess': '1 Thessalonians', 'thessalonian': '1 Thessalonians', 'thessalonians': '1 Thessalonians',
    '1tim': '1 Timothy', '1timothy': '1 Timothy', 'first timothy': '1 Timothy', '1 timothy': '1 Timothy', '1st timothy': '1 Timothy',
    'festimucci': '1 Timothy', 'festimuti': '1 Timothy', 'fest timothy': '1 Timothy', 'festimoti': '1 Timothy', 'festimoty': '1 Timothy', 'festimucy': '1 Timothy', 'festimuchi': '1 Timothy', 'festimoche': '1 Timothy',
    'first simultitu': '1 Timothy', '1st simultitu': '1 Timothy', '1 simultitu': '1 Timothy', 'simultitu': '1 Timothy',
    'first simultity': '1 Timothy', '1st simultity': '1 Timothy', '1 simultity': '1 Timothy', 'simultity': '1 Timothy',
    '2tim': '2 Timothy', '2timothy': '2 Timothy', 'second timothy': '2 Timothy', '2 timothy': '2 Timothy', '2nd timothy': '2 Timothy',
    'second simultitu': '2 Timothy', '2nd simultitu': '2 Timothy', '2 simultitu': '2 Timothy',
    'second simultity': '2 Timothy', '2nd simultity': '2 Timothy', '2 simultity': '2 Timothy',
    'tim': '1 Timothy', 'timothy': '1 Timothy',
    'tit': 'Titus', 'titus': 'Titus',
    'philem': 'Philemon', 'philemon': 'Philemon', 'filemon': 'Philemon', 'philimone': 'Philemon', 'philom': 'Philemon', 'philimano': 'Philemon', 'philine won': 'Philemon', 'philinewon': 'Philemon',
    'heb': 'Hebrews', 'hebrews': 'Hebrews', 'ebers': 'Hebrews', 'he brushed': 'Hebrews', 'hebrushed': 'Hebrews', 'hebrew': 'Hebrews',
    'jam': 'James', 'james': 'James', 'jas': 'James',
    '1pet': '1 Peter', '1peter': '1 Peter', 'first peter': '1 Peter', '1 peter': '1 Peter', '1st peter': '1 Peter',
    '2pet': '2 Peter', '2peter': '2 Peter', 'second peter': '2 Peter', '2 peter': '2 Peter', '2nd peter': '2 Peter',
    'pet': '1 Peter', 'peter': '1 Peter',
    '1john': '1 John', 'first john': '1 John', '1 john': '1 John', '1st john': '1 John',
    '2john': '2 John', 'second john': '2 John', '2 john': '2 John', '2nd john': '2 John',
    '3john': '3 John', 'third john': '3 John', '3 john': '3 John', '3rd john': '3 John',
    'jude': 'Jude',
    'rev': 'Revelation', 'revelation': 'Revelation', 'revelations': 'Revelation', 'revolutions': 'Revelation', 'revolution': 'Revelation', 'revalation': 'Revelation', 'revalations': 'Revelation',
    'apoc': 'Revelation',
};

const BOOK_ALIAS_ENTRIES = Object.entries(BOOK_ALIASES).sort((a, b) => b[0].length - a[0].length);

/** Protestant canon chapter counts — used to disambiguate compact CCVV vs slurred CV-to-E. */
export const BOOK_MAX_CHAPTERS = {
    Genesis: 50, Exodus: 40, Leviticus: 27, Numbers: 36, Deuteronomy: 34,
    Joshua: 24, Judges: 28, Ruth: 16, '1 Samuel': 31, '2 Samuel': 24,
    '1 Kings': 28, '2 Kings': 25, '1 Chronicles': 29, '2 Chronicles': 36,
    Ezra: 10, Nehemiah: 13, Esther: 10, Job: 42, Psalms: 150, Proverbs: 31,
    Ecclesiastes: 12, 'Song of Solomon': 8, Isaiah: 66, Jeremiah: 52,
    Lamentations: 13, Ezekiel: 48, Daniel: 12, Hosea: 14, Joel: 5, Amos: 9,
    Obadiah: 1, Jonah: 4, Micah: 22, Nahum: 3, Habakkuk: 3, Zephaniah: 3,
    Haggai: 2, Zechariah: 14, Malachi: 4, Matthew: 28, Mark: 16, Luke: 24,
    John: 21, Acts: 28, Romans: 16, '1 Corinthians': 16, '2 Corinthians': 13,
    Galatians: 6, Ephesians: 6, Philippians: 4, Colossians: 4,
    '1 Thessalonians': 5, '2 Thessalonians': 3, '1 Timothy': 6, '2 Timothy': 4,
    Titus: 3, Philemon: 1, Hebrews: 13, James: 5, '1 Peter': 5, '2 Peter': 3,
    '1 John': 5, '2 John': 1, '3 John': 1, Jude: 1, Revelation: 22,
};

function maxChaptersForBook(bookName) {
    if (!bookName) return null;
    return BOOK_MAX_CHAPTERS[bookName] ?? null;
}

function buildBookMetas(books) {
    return books.map((book, index) => {
        const bookLower = book.name.toLowerCase();
        const parts = bookLower.split(' ');
        const firstWord = parts[0];
        // Numbered variants ("1 samuel", "2 kings", "3 john"): the NAME token is
        // the non-ordinal part. Never use a bare digit as the fuzzy target —
        // otherwise candidate "1" (a chapter number) matches 1 Samuel.
        const ordinalFirst = /^\d+$/.test(firstWord) || /^(1st|2nd|3rd|first|second|third)$/.test(firstWord);
        const nameWord = ordinalFirst ? (parts.slice(1).join(' ') || firstWord) : bookLower;
        return {
            index,
            book,
            bookLower,
            bookPhonetic: phoneticCode(bookLower.replace(/\s/g, '')),
            namePhonetic: phoneticCode(nameWord.replace(/\s/g, '')),
            firstWord,
            nameWord,
            isNumberedVariant: ordinalFirst && parts.length > 1,
        };
    });
}

/**
 * Resolve canonical alias / book name to an index in `books`.
 * Do NOT map bare "Samuel" → "1 Samuel" via substring includes — that caused
 * chapter-number "1" / bare alias fallthrough to land on the wrong book.
 */
function findBookIndex(books, matchedBookName) {
    if (!matchedBookName) return -1;
    const want = String(matchedBookName).trim().toLowerCase();
    let bookIndex = books.findIndex(b => b.name.toLowerCase() === want);
    if (bookIndex !== -1) return bookIndex;
    // Allow "psalm" → "Psalms" style singular/plural near-exact only
    bookIndex = books.findIndex(b => {
        const n = b.name.toLowerCase();
        return n === want + 's' || n + 's' === want;
    });
    return bookIndex;
}

/**
 * True when the transcript contains a book-name-like token that supports `meta`.
 * Used to reject Pass-2/3 hits that landed on a book with zero lexical support
 * in what ASR actually said (e.g. leftover "1 1" → 1 Samuel).
 */
function transcriptSupportsResolvedBook(rawCommand, meta, books) {
    if (!rawCommand || !meta) return false;
    let t = wordNumbersToDigits(String(rawCommand).toLowerCase()).replace(/[,;.]/g, ' ');
    t = repairReferenceConnectors(t);
    t = t.replace(TRIGGER_STRIP_RE, ' ').replace(/\s+/g, ' ').trim();
    const tokens = t.split(/\s+/).filter(Boolean);
    if (!tokens.length) return false;

    const nameWord = (meta.nameWord || meta.bookLower || '').toLowerCase();
    const bookLower = (meta.bookLower || '').toLowerCase();
    const nameParts = nameWord.split(/\s+/).filter(Boolean);

    // Full canonical / alias phrase present?
    if (bookLower && t.includes(bookLower)) return true;
    if (nameWord && nameWord.length >= 3 && t.includes(nameWord)) return true;

    // Alias table: any alias that resolves to this book
    for (const [alias, canonical] of BOOK_ALIAS_ENTRIES) {
        if (findBookIndex(books, canonical) !== meta.index) continue;
        const parts = alias.split(/\s+/);
        for (let i = 0; i <= tokens.length - parts.length; i++) {
            let ok = true;
            for (let k = 0; k < parts.length; k++) {
                if (tokens[i + k] !== parts[k]) { ok = false; break; }
            }
            if (ok) return true;
        }
    }

    // Fuzzy-ish token support: first name token within edit distance
    if (nameParts[0] && nameParts[0].length >= 3) {
        const target = nameParts[0];
        for (const tok of tokens) {
            if (/^\d+$/.test(tok)) continue;
            if (tok === target) return true;
            const maxLen = Math.max(tok.length, target.length);
            if (maxLen >= 4 && levenshtein(tok, target) / maxLen < 0.35) return true;
        }
    }
    return false;
}

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
const ONES = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9,
};
const TENS = {
    twenty: 20, thirty: 30, forty: 40, fifty: 50,
    sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/** Build 0–99 including hyphenated compounds (twenty-one … ninety-nine). */
function buildWordNumbers() {
    const map = {
        zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
        six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
        eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
        sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
        hundred: 100,
        ...TENS,
    };
    for (const [tenWord, tenVal] of Object.entries(TENS)) {
        for (const [oneWord, oneVal] of Object.entries(ONES)) {
            map[`${tenWord}-${oneWord}`] = tenVal + oneVal;
        }
    }
    return map;
}

const WORD_NUMBERS = buildWordNumbers();
const TENS_WORDS = Object.keys(TENS).join('|');

export function wordNumbersToDigits(text) {
    let result = text;
    // Compound "twenty one" / "fifty five" (space form) → single digit
    result = result.replace(
        new RegExp(`\\b(${TENS_WORDS})\\s+(${Object.keys(ONES).join('|')})\\b`, 'gi'),
        (_, ten, one) => {
            const key = `${ten.toLowerCase()}-${one.toLowerCase()}`;
            return WORD_NUMBERS[key] != null ? String(WORD_NUMBERS[key]) : `${ten} ${one}`;
        }
    );
    // Longer compounds first so "twenty-one" wins over "twenty"
    const entries = Object.entries(WORD_NUMBERS).sort((a, b) => b[0].length - a[0].length);
    for (const [word, num] of entries) {
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), String(num));
    }
    return result;
}

/**
 * "the book of X" / "book of X" — treat the next word(s) as a book name cue.
 * Returns { bookCanonical, remaining } or null.
 * Handles multi-word books: "book of first samuel", "book of song of solomon".
 */
export function resolveBookOfCue(rawText) {
    if (!rawText) return null;
    let t = wordNumbersToDigits(rawText.toLowerCase()).replace(/[,;.]/g, ' ');
    t = repairReferenceConnectors(t);
    // Keep "book of" — do not strip it here
    t = t.replace(/\b(ocs|oh see ess|oh-see-ess|o s c|osc|oasis|ocean|osiris|obvious|media|meter|medium|median|me the|need a|meet a|meeting|video|please|read|open|show|go to|jump to)\b/gi, ' ');
    t = t.replace(/\s+/g, ' ').trim();

    const m = t.match(/\b(?:the\s+)?book\s+of\s+(.+)$/i);
    if (!m) return null;

    let after = m[1].trim();
    if (!after) return null;
    // "the book of the philippines" — drop leading article(s) before the book name
    after = after.replace(/^(?:the\s+)+/i, '').trim();
    if (!after) return null;

    // Longest alias match at the start of the words after "book of"
    let bestAlias = null;
    let bestLen = 0;
    let bestCanonical = null;
    for (const [alias, canonical] of BOOK_ALIAS_ENTRIES) {
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`^${escaped}(?=[^a-z]|$)`, 'i');
        if (regex.test(after) && alias.length > bestLen) {
            bestLen = alias.length;
            bestAlias = alias;
            bestCanonical = canonical;
        }
    }

    if (bestCanonical) {
        const remaining = after.slice(bestAlias.length).trim();
        return { bookCanonical: bestCanonical, remaining, matchType: 'book_of_alias' };
    }

    // Fuzzy: try first 1–3 words as book name (before any digits)
    const beforeDigits = after.split(/\s+(?=\d)/)[0] || after;
    const words = beforeDigits.replace(/\b(chapter|verse|verses|vs|v)\b/gi, ' ').replace(/\s+/g, ' ').trim().split(' ');
    return {
        bookCanonical: null,
        remaining: after,
        fuzzyCandidate: words.slice(0, 3).join(' '),
        matchType: 'book_of_fuzzy',
    };
}

/** Strip trigger words / fillers before Bible matching (FR-3.6). */
const TRIGGER_STRIP_RE = /\b(the book of|book of|read|please|open|to|go to|jump to|skip to|turn to|show|ocs|oh see ess|oh-see-ess|o s c|osc|oasis|ocean|osiris|obvious|media|meter|medium|median|me the|need a|meet a|meeting|video)\b/gi;

/**
 * Common Vosk digit mishearings in a chapter/verse slot (not free prose).
 * Avoid "to"/"for" — those collide with ranges ("3 to 16") and filler "for".
 */
const DIGIT_MISHEARINGS = {
    war: '4', fore: '4', floor: '4', ford: '4', fourty: '40',
    tree: '3', free: '3', tee: '3',
    won: '1', wan: '1', wun: '1',
    fife: '5', vive: '5',
    sex: '6', sicks: '6', sik: '6',
    ate: '8', ait: '8', hate: '8',
    nigh: '9', mine: '9', nein: '9',
    tin: '10', tan: '10',
};
const DIGIT_MISHEAR_RE = Object.keys(DIGIT_MISHEARINGS).join('|');
// "verse"-like connectors Vosk substitutes between chapter and verse numbers
// Include common WA/Vosk mangles: vast≈verse, of us≈verse, us≈verse
const VERSE_CONNECTOR_RE = 'verse|verses|vs|v|first|was|worse|voice|virs|vers|vas|vass|vasses|versus|versa|vast|fast';

/**
 * Repair common Vosk mishearings of "verse" / digits inside a reference.
 * e.g. "matthew six first war" → "matthew 6 verse 4"
 *      "mach one was one" → "mach 1 verse 1"
 *      "genesis one of us one" / "genesis one us one" → "genesis 1 verse 1"
 * Only rewrite in digit-flanked / connector contexts to avoid prose false positives.
 */
export function repairReferenceConnectors(text) {
    let t = text;

    // "it's a team" / "its a team" / "is a team" / "eight team" ≈ "18" (Vosk mishear of "eighteen")
    t = t.replace(/\b(?:it's\s+a\s+team|its\s+a\s+team|is\s+a\s+team|it\s+is\s+a\s+team|eight\s+team)\b/gi, '18');

    // Book + "empty" / "ite" / "aite" / "aight" → Book + 18 (Vosk mishearing of "eighteen")
    t = t.replace(
        /\b(genesis|exodus|leviticus|numbers|deuteronomy|joshua|judges|ruth|samuel|kings|chronicles|ezra|nehemiah|esther|job|psalms?|proverbs|ecclesiastes|ecclesiastics|ecclesia\s+sticks?|isaiah|jeremiah|jaymiah|jayemiah|jerimiah|jeremy|lamentations|ezekiel|daniel|hosea|joel|amos|obadiah|jonah|micah|nahum|habakkuk|zephaniah|haggai|zechariah|malachi|matthew|mark|luke|john|acts|romans|corinthians|galatians|ephesians|philippians|philippines|colossians|thessalonians|timothy|titus|philemon|hebrews|james|peter|jude|revelation|foske|foski|foskey|fuski|foskins?|foskis|foskes|fuskins?|faskins?|faskings?|faskens?|fast\s+kings?)(?:'s)?\s+(?:empty|ite|aite|aight)\b/gi,
        '$1 18'
    );

    // "from the start to" / "from the statue" / "from the stat to" → "from 1 to" or "1 to"
    t = t.replace(/\b(?:from\s+the\s+statue|from\s+the\s+start\s+to|from\s+the\s+stat\s+to)\s+(\d+)\b/gi, '1 to $1');
    t = t.replace(/\b(?:from\s+the\s+start|from\s+the\s+beginning)\b/gi, 'verse 1');

    // "good to us 20" / "go to us 20" / "good to verse 20" (phonetic mishears of "go to verse 20")
    t = t.replace(/\b(?:good\s+to\s+us|go\s+to\s+us)\s+(\d+)\b/gi, 'go to verse $1');
    t = t.replace(/\b(?:good|go)\s+to\s+(?:verse|vass|vs|was|vast)\s+(\d+)\b/gi, 'go to verse $1');

    // "su vez" / "suves" ≈ "two verse" (live: Mark suves three → Mark 2 verse 3)
    t = t.replace(/\b(?:suves|suvez|su\s+ves|su\s+vez|sue\s+ves|sue\s+vez|zoo\s+ves)\b/gi, '2 verse');
    // "su verse" / "sue verse" near-misses for "two verse"
    t = t.replace(/\b(?:su|sue|zoo)\s+(?:verse|verses|vs|v|vez)\b/gi, '2 verse');

    // Roman numerals in chapter/verse position ("mark ii was three" → "mark 2 was 3")
    t = t.replace(/\bii\b/gi, '2');
    t = t.replace(/\biii\b/gi, '3');
    t = t.replace(/\biv\b/gi, '4');

    // "v.33" / "v6" / "v 6" (shorthand verse markers)
    t = t.replace(/\bv\.?\s*(\d+)\b/gi, 'verse $1');

    // "was 3" / "was three" between or after numbers/books ("mark 2 was 3" → "mark 2 verse 3")
    t = t.replace(/\b(\d+)\s+was\s+(\d+)\b/gi, '$1 verse $2');

    // Book + "to" + number → book + "2" + number ("two" misheard as "to")
    // e.g. "philippines to 10" / "the book of philippines to 10" → chapter 2 verse 10
    // Do NOT match "3 to 16" ranges (digit immediately before "to").
    t = t.replace(
        /\b(genesis|exodus|leviticus|numbers|deuteronomy|joshua|judges|ruth|samuel|kings|chronicles|ezra|nehemiah|esther|job|psalms?|proverbs|ecclesiastes|ecclesiastics|ecclesia\s+sticks?|isaiah|jeremiah|jaymiah|jayemiah|jerimiah|jeremy|lamentations|ezekiel|daniel|hosea|joel|amos|obadiah|jonah|micah|nahum|habakkuk|zephaniah|haggai|zechariah|malachi|matthew|mark|luke|john|acts|romans|corinthians|galatians|ephesians|philippians|philippines|philippine|philipians|phillipians|phillipines|colossians|colosians|collisions|collosions|collusion|collotions|coalition|thessalonians|timothy|titus|philemon|hebrews|james|peter|jude|revelation|mach|match|marsh|mock|marc|look|junk|sams|molokai)\s+to\s+(\d+)\b/gi,
        '$1 2 $2'
    );
    // Remaining after book resolved: "to 10" alone → "2 10" (UNLESS preceded by navigation action like "go to", "jump to", etc.)
    t = t.replace(/(^|[\s:])to\s+(\d+)\b/gi, (full, lead, n, offset, str) => {
        // Avoid "3 to 16" — digit immediately before "to"
        const before = str.slice(Math.max(0, offset - 12), offset);
        if (/\d\s*$/.test(before)) return full;
        // Avoid navigation commands: "go to 20", "jump to 20", "skip to 20", "move to 20", "turn to 20", "good to 20", "back to 20"
        if (/\b(?:go|jump|skip|turn|move|good|back|switch|change|read|show|open)\s*$/i.test(before)) return full;
        return `${lead}2 ${n}`;
    });

    // "he brushed" → "hebrews", "philine won" → "philemon"
    t = t.replace(/\bhe\s+brushed\b/gi, 'hebrews');
    t = t.replace(/\bphiline\s+won\b/gi, 'philemon');

    // Book + "is" + number → book + number ("philippian is 2 verse 9" → "philippian 2 verse 9")
    t = t.replace(
        /\b(genesis|exodus|leviticus|numbers|deuteronomy|joshua|judges|ruth|samuel|kings|chronicles|ezra|nehemiah|esther|job|psalms?|proverbs|ecclesiastes|ecclesiastics|ecclesia\s+sticks?|isaiah|jeremiah|jaymiah|jayemiah|jerimiah|jeremy|lamentations|ezekiel|daniel|hosea|joel|amos|obadiah|jonah|micah|nahum|habakkuk|zephaniah|haggai|zechariah|malachi|matthew|mark|luke|john|acts|romans|corinthians|galatians|ephesians|philippians|philippines|philippine|philipians|phillipians|phillipines|colossians|thessalonians|timothy|titus|philemon|hebrews|james|peter|jude|revelation)\s+is\s+(\d+)\b/gi,
        '$1 $2'
    );

    // Book + "for" + number/verse → book + "4" + number/verse ("galatians for verse 6" → "galatians 4 verse 6")
    t = t.replace(
        /\b(genesis|exodus|leviticus|numbers|deuteronomy|joshua|judges|ruth|samuel|kings|chronicles|ezra|nehemiah|esther|job|psalms?|proverbs|ecclesiastes|ecclesiastics|ecclesia\s+sticks?|isaiah|jeremiah|jaymiah|jayemiah|jerimiah|jeremy|lamentations|ezekiel|daniel|hosea|joel|amos|obadiah|jonah|micah|nahum|habakkuk|zephaniah|haggai|zechariah|malachi|matthew|mark|luke|john|acts|romans|corinthians|galatians|galleets|galitians|calitians|caledians|ephesians|eficiency|efficiency|efitians|philippians|philippines|philippine|philipians|colossians|colosians|collisions|thessalonians|timothy|titus|philemon|hebrews|james|peter|jude|revelation)\s+for\s+(verse|verses|vs|v|\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi,
        '$1 4 $2'
    );

    // Book + "on" → book + "1" when a verse/chapter cue follows
    // (Vosk drops the /w/ in "one": "mark on verse one" / "mark on of …")
    // Emit digit directly — this runs after wordNumbersToDigits.
    // Require a following cue so prose like "mark on the screen" is untouched.
    t = t.replace(
        /\b(genesis|exodus|leviticus|numbers|deuteronomy|joshua|judges|ruth|samuel|kings|chronicles|ezra|nehemiah|esther|job|psalms?|proverbs|ecclesiastes|ecclesiastics|ecclesia\s+sticks?|isaiah|jeremiah|jaymiah|jayemiah|jerimiah|jeremy|lamentations|ezekiel|daniel|hosea|joel|amos|obadiah|jonah|micah|nahum|habakkuk|zephaniah|haggai|zechariah|malachi|matthew|mark|luke|john|acts|romans|corinthians|galatians|ephesians|philippians|philippines|philippine|philipians|colossians|colosians|collisions|collosions|collusion|collotions|coalition|thessalonians|timothy|titus|philemon|hebrews|james|peter|jude|revelation|mach|match|marsh|mock|marc|look|junk|sams|molokai)\s+on\s+(verse|verses|vs|v|of|\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi,
        '$1 1 $2'
    );

    // "one of us one" / "1 of us 1" — very common Vosk mangling of "verse"
    t = t.replace(
        /\b(\d+)\s+of\s+us\s+(\d+)\b/gi,
        '$1 verse $2'
    );
    // "one us one" / "1 us 1"
    t = t.replace(
        /\b(\d+)\s+us\s+(\d+)\b/gi,
        '$1 verse $2'
    );

    // "verse war" / "first war" / "was tree" → "verse 4" / "verse 3"
    t = t.replace(
        new RegExp(`\\b(${VERSE_CONNECTOR_RE})\\s+(${DIGIT_MISHEAR_RE})\\b`, 'gi'),
        (_, conn, w) => `verse ${DIGIT_MISHEARINGS[w.toLowerCase()]}`
    );

    // "6 war" / "6 tree" as bare second number (no connector spoken clearly)
    t = t.replace(
        new RegExp(`\\b(\\d+)\\s+(${DIGIT_MISHEAR_RE})\\b`, 'gi'),
        (_, d, w) => `${d} ${DIGIT_MISHEARINGS[w.toLowerCase()]}`
    );

    // "6 first 4" / "6 was 1" / "6 voice 2" / "6 vast 1" → "6 verse 4"
    t = t.replace(
        new RegExp(`\\b(\\d+)\\s+(?:${VERSE_CONNECTOR_RE})\\s+(\\d+)\\b`, 'gi'),
        '$1 verse $2'
    );

    // "chatper" / "chaptor" etc.
    t = t.replace(/\b(?:chatper|chaptor|chaper|chapt)\b/gi, 'chapter');
    return t;
}

/**
 * Pull the scripture-shaped span out of a noisy utterance.
 * e.g. "let's check the book of mach one vast one" → "book of mach one vast one"
 *      "just open … mock one of us one" → "mock one of us one"
 */
export function extractScriptureCore(rawText) {
    if (!rawText || !String(rawText).trim()) return rawText;
    const original = String(rawText);
    const lower = original.toLowerCase();

    const bookOfIdx = lower.search(/\b(?:the\s+)?book\s+of\b/i);
    if (bookOfIdx >= 0) {
        return original.slice(bookOfIdx).replace(/\s+/g, ' ').trim();
    }

    let bestIdx = -1;
    for (const [alias] of BOOK_ALIAS_ENTRIES) {
        if (alias.length < 3 && alias !== 'jn') continue;
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`\\b${escaped}\\b`, 'i');
        const m = lower.match(re);
        if (!m || m.index == null) continue;
        const after = lower.slice(m.index + m[0].length);
        const hasNum =
            /\d/.test(after) ||
            /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)\b/i.test(after);
        if (!hasNum) continue;
        if (bestIdx < 0 || m.index < bestIdx) bestIdx = m.index;
    }
    if (bestIdx >= 0) {
        return original.slice(bestIdx).replace(/\s+/g, ' ').trim();
    }
    return original.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse chapter/verse from remaining text after book is identified
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Expand slurred/concatenated refs: "228" → 2:28, "316" → 3:16, "11905" → 119:5.
 * 2-digit numbers stay chapter-only (e.g. Acts 28).
 * @param {number|string} num
 * @param {{ maxChapter?: number|null }} [options] — when set, "4728" → 4:7-8 if CCVV chapter exceeds book
 */
export function expandCompactChapterVerse(num, options = {}) {
    const n = typeof num === 'number' ? num : parseInt(String(num).replace(/\D/g, ''), 10);
    if (!Number.isFinite(n) || n < 100) return null;
    const digits = String(Math.trunc(Math.abs(n)));
    const maxChapter = options.maxChapter != null ? options.maxChapter : null;

    if (digits.length === 3) {
        // CVV: acts 228 → 2:28, john 316 → 3:16
        const chapter = Math.floor(n / 100);
        const verse = n % 100;
        if (chapter >= 1 && verse >= 1) {
            return { chapter, startVerse: verse, endVerse: verse };
        }
        return null;
    }

    if (digits.length === 4) {
        // Slurred range glued to chapter: "4728" → 4:7-8 ("4 7 to 8") when
        // CCVV chapter is impossible for the book (1 John has 5 chapters, not 47).
        // Genesis 47:28 stays CCVV because chapter 47 is valid there.
        const ccvvChapter = Math.floor(n / 100);
        const ccvvVerse = n % 100;
        if (digits[2] === '2' && maxChapter != null && ccvvChapter > maxChapter) {
            const ch = parseInt(digits[0], 10);
            const start = parseInt(digits[1], 10);
            const end = parseInt(digits[3], 10);
            if (ch >= 1 && start >= 1 && end > start && digits[1] !== '2') {
                return { chapter: ch, startVerse: start, endVerse: end };
            }
        }
        // CCVV: psalms 2310 → 23:10 (not 2:310); genesis 4728 → 47:28
        if (ccvvChapter >= 1 && ccvvChapter <= 150 && ccvvVerse >= 1) {
            return { chapter: ccvvChapter, startVerse: ccvvVerse, endVerse: ccvvVerse };
        }
        return null;
    }

    if (digits.length === 5) {
        // CCCVV: psalms 11905 → 119:5
        const chapter = Math.floor(n / 100);
        const verse = n % 100;
        if (chapter >= 1 && chapter <= 150 && verse >= 1) {
            return { chapter, startVerse: verse, endVerse: verse };
        }
    }

    return null;
}

/**
 * After chapter is already known, ASR often glues "1 to 4" into "124"
 * (middle digit 2 ≈ "to"/"two"). "genesis 2 124" → verses 1–4.
 * Similarly "1216" → 1–16; spaced "1 2 4" is normalized before parse.
 */
export function expandSlurredVerseRange(num) {
    const n = typeof num === 'number' ? num : parseInt(String(num).replace(/\D/g, ''), 10);
    if (!Number.isFinite(n) || n < 100) return null;
    const digits = String(Math.trunc(Math.abs(n)));

    if (digits.length === 3) {
        const start = parseInt(digits[0], 10);
        const mid = parseInt(digits[1], 10);
        const end = parseInt(digits[2], 10);
        if (mid === 2 && start >= 1 && end >= start && end <= 176) {
            return { startVerse: start, endVerse: end };
        }
        return null;
    }

    if (digits.length === 4 && digits[1] === '2') {
        // "1216" ≈ "1 to 16"
        const start = parseInt(digits[0], 10);
        const end = parseInt(digits.slice(2), 10);
        if (start >= 1 && end >= start && end <= 176) {
            return { startVerse: start, endVerse: end };
        }
    }

    if (digits.length === 5 && digits[2] === '2') {
        // "10214" ≈ "10 to 14"
        const start = parseInt(digits.slice(0, 2), 10);
        const end = parseInt(digits.slice(3), 10);
        if (start >= 1 && end >= start && end <= 176) {
            return { startVerse: start, endVerse: end };
        }
    }

    return null;
}

function parseChapterVerse(text, options = {}) {
    if (!text || !text.trim()) return null;

    let t = text.trim();
    // Spaced slur: "2 1 2 4" → "2 1-4" (middle 2 ≈ "to")
    t = t.replace(/\b(\d+)\s+(\d+)\s+2\s+(\d+)\b/g, '$1 $2-$3');

    // Compact + end range: "622 to 23" / "622-23" → 6:22-23 (not chapter 622)
    const compactRange = t.match(/^\s*(\d{3,5})\s*(?:to|through|thru|and|-)\s*(\d+)\s*$/i);
    if (compactRange) {
        const expanded = expandCompactChapterVerse(compactRange[1], {
            maxChapter: options.maxChapter,
        });
        if (expanded) {
            const endVerse = parseInt(compactRange[2], 10);
            if (endVerse >= expanded.startVerse) {
                return { ...expanded, endVerse };
            }
            return expanded;
        }
    }

    // Pattern: "3:16", "3 16", "3-16", "3 to 18", "2 1-8", "2 1 8"
    const m = t.match(/(\d+)(?:[\s:]+|-)(\d+)(?:\s*(?:to|through|and|-)?\s*(\d+))?/i);
    if (m) {
        const chapter = parseInt(m[1], 10);
        let startVerse = parseInt(m[2], 10);
        let endVerse = m[3] ? parseInt(m[3], 10) : startVerse;
        // "genesis 2 124" → chapter 2, slurred range 1–4 (not verse 124)
        if (!m[3] && startVerse >= 100) {
            const slurred = expandSlurredVerseRange(startVerse);
            if (slurred) {
                startVerse = slurred.startVerse;
                endVerse = slurred.endVerse;
            }
        }
        if (endVerse < startVerse) endVerse = startVerse;
        return { chapter, startVerse, endVerse };
    }
    // Compact single token: "228", "316", "4728"
    const compactOnly = t.match(/^\s*(\d{3,5})\s*$/);
    if (compactOnly) {
        const expanded = expandCompactChapterVerse(compactOnly[1], {
            maxChapter: options.maxChapter,
        });
        if (expanded) return expanded;
    }
    // Chapter only: "3" or "chapter 3"
    const chOnly = t.match(/^\s*(\d+)\s*$/);
    if (chOnly) {
        return { chapter: parseInt(chOnly[1], 10), startVerse: 1, endVerse: 1 };
    }
    return null;
}

/**
 * Tokenized parser for in-context scripture jumps (FR-3.14 / Defect 3).
 * Matches single verse jumps, multi-verse ranges, chapter jumps, and compound chapter+verse jumps.
 * Operates over normalized token streams instead of brittle regexes.
 *
 * @param {string} rawText
 * @returns {{
 *   type: 'verse'|'verse-range'|'chapter'|'chapter-verse'|'chapter-verse-range',
 *   chapter?: number,
 *   startVerse: number,
 *   endVerse: number,
 * }|null}
 */
export function parseContextJump(rawText) {
    if (!rawText || !String(rawText).trim()) return null;

    let t = String(rawText).toLowerCase().trim();
    // Strip wake words
    t = t.replace(/\b(ocs|oh see ess|oh-see-ess|o s c|osc|oasis|ocean|osiris|obvious|media|meter|medium|median|please)\b/gi, ' ');

    // Normalize spoken numbers to digits
    t = wordNumbersToDigits(t);

    // Normalize colons and hyphens into standard tokens
    t = t.replace(/(\d+)\s*:\s*(\d+)/g, ' chapter $1 verse $2 ');
    t = t.replace(/(\d+)\s*-\s*(\d+)/g, ' $1 to $2 ');
    t = t.replace(/[,;.]/g, ' ');

    // Strip leading action prefixes
    t = t.replace(/^(?:go\s+to|jump\s+to|skip\s+to|turn\s+to|move\s+to|look\s+at|let'?s\s+look\s+at|what\s+about|show|open|read|back\s+to|from|good\s+to\s+us|go\s+to\s+us)\s+/i, '');
    t = t.replace(/\s+/g, ' ').trim();

    const tokens = t.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return null;

    const isChKw = (w) => /^(?:chapter|chapters|chatper|chaptor|chaper)$/i.test(w);
    // Note: "was", "worse", "voice", "vass", "vas" are intentional ASR homophone mishearings for "verse" in in-context jumps
    const isVsKw = (w) => /^(?:verse|verses|vs\.?|v\.?|vass|vasses|vas|was|worse|voice|vers|virs)$/i.test(w);
    const isRangeKw = (w) => /^(?:to|through|thru|-)$/i.test(w);
    const isNum = (w) => /^\d+$/.test(w);

    // 1. Compound: [chapter-kw] <chNum> ([and]? [verse-kw] <vNum> ([range-kw] <endVNum>)?)?
    if (isChKw(tokens[0]) && isNum(tokens[1])) {
        const chapter = parseInt(tokens[1], 10);
        if (tokens.length === 2) {
            return { type: 'chapter', chapter, startVerse: 1, endVerse: 1 };
        }
        let idx = 2;
        if (tokens[idx] === 'and') idx++;
        if (idx < tokens.length && isVsKw(tokens[idx])) idx++;
        if (idx < tokens.length && isNum(tokens[idx])) {
            const startVerse = parseInt(tokens[idx], 10);
            idx++;
            if (idx < tokens.length && isRangeKw(tokens[idx])) {
                idx++;
                if (idx < tokens.length && isVsKw(tokens[idx])) idx++;
                if (idx < tokens.length && isNum(tokens[idx])) {
                    const endVerse = parseInt(tokens[idx], 10);
                    return { type: 'chapter-verse-range', chapter, startVerse, endVerse };
                }
            }
            return { type: 'chapter-verse', chapter, startVerse, endVerse: startVerse };
        }
        return { type: 'chapter', chapter, startVerse: 1, endVerse: 1 };
    }

    // 2. Verse / Verses: [verse-kw] <vNum> ([range-kw] [verse-kw]? <endVNum>)?
    if (isVsKw(tokens[0]) && isNum(tokens[1])) {
        const startVerse = parseInt(tokens[1], 10);
        if (tokens.length === 2) {
            return { type: 'verse', startVerse, endVerse: startVerse };
        }
        let idx = 2;
        if (idx < tokens.length && isRangeKw(tokens[idx])) {
            idx++;
            if (idx < tokens.length && isVsKw(tokens[idx])) idx++;
            if (idx < tokens.length && isNum(tokens[idx])) {
                const endVerse = parseInt(tokens[idx], 10);
                return { type: 'verse-range', startVerse, endVerse };
            }
        }
        return { type: 'verse', startVerse, endVerse: startVerse };
    }

    // 3. Bare verse range: <vNum> [range-kw] <endVNum>
    if (isNum(tokens[0]) && isRangeKw(tokens[1]) && isNum(tokens[2]) && tokens.length === 3) {
        const startVerse = parseInt(tokens[0], 10);
        const endVerse = parseInt(tokens[2], 10);
        return { type: 'verse-range', startVerse, endVerse };
    }

    // 4. Bare direct numeric jump: <vNum>
    if (isNum(tokens[0]) && tokens.length === 1) {
        const startVerse = parseInt(tokens[0], 10);
        return { type: 'verse', startVerse, endVerse: startVerse };
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
 * @param {string} rawCommand
 * @param {Array} books
 * @param {Object} bibleElectron
 * @param {Object} currentContext
 * @param {boolean|object} optionsOrMidSpeech - legacy boolean isMidSpeech, or options:
 *   { isMidSpeech, allowPass2=true, allowPass3=false, requireShape=true, allowBookOnly=false }
 */
export async function smartBibleMatch(rawCommand, books, bibleElectron, currentContext = null, optionsOrMidSpeech = false) {
    const opts = typeof optionsOrMidSpeech === 'boolean'
        ? { isMidSpeech: optionsOrMidSpeech }
        : (optionsOrMidSpeech || {});
    const {
        isMidSpeech = false,
        allowPass2 = true,
        allowPass3 = false,
        requireShape = true,
        allowBookOnly = false,
    } = opts;

    if (requireShape && !hasReferenceShape(rawCommand) && !hasReferenceShape(extractScriptureCore(rawCommand))) {
        // Allow short context jumps through shape helper; if still false, bail
        return null;
    }

    // Convert word numbers to digits FIRST so Pass 4 regex works with "verse five"
    // Prefer the scripture-shaped core of noisy speech ("let's check the book of …")
    const core = extractScriptureCore(rawCommand);
    const inputText = (core && core.length > 0)
        ? core
        : rawCommand;

    let numberTranslated = wordNumbersToDigits(inputText.toLowerCase()).replace(/[,;.]/g, ' ');
    // Repair ASR connectors before stripping ("one was one" → "1 verse 1")
    numberTranslated = repairReferenceConnectors(numberTranslated);

    // ─────────────────────────────────────────────────────────────────────────
    // PASS 0 — "book of X" / "the book of X" cue (next word(s) = book name)
    // ─────────────────────────────────────────────────────────────────────────
    const bookOf = resolveBookOfCue(inputText);
    if (bookOf) {
        let bookIndex = -1;
        let matchType = bookOf.matchType;

        if (bookOf.bookCanonical) {
            bookIndex = findBookIndex(books, bookOf.bookCanonical);
        } else if (bookOf.fuzzyCandidate) {
            // Aggressive fuzzy: anything after "book of" is intended as a book
            const candidate = bookOf.fuzzyCandidate.toLowerCase();
            const candidatePhonetic = phoneticCode(candidate.replace(/\s/g, ''));
            let best = null;
            let bestScore = Infinity;
            for (let i = 0; i < books.length; i++) {
                const name = books[i].name.toLowerCase();
                const parts = name.split(' ');
                const first = parts[0];
                const ordinalFirst = /^\d+$/.test(first);
                const nameWord = ordinalFirst ? parts.slice(1).join(' ') : name;
                // Never fuzzy-match a digit candidate against numbered-book ordinals
                if (/^[\d\s]+$/.test(candidate)) continue;
                const ph = phoneticCode(nameWord.replace(/\s/g, ''));
                if (candidatePhonetic && ph && candidatePhonetic === ph) {
                    best = i;
                    bestScore = 0;
                    break;
                }
                const dist = Math.min(
                    levenshtein(candidate, name),
                    levenshtein(candidate, nameWord),
                    levenshtein(candidate.split(' ')[0], nameWord.split(' ')[0] || nameWord)
                );
                const maxLen = Math.max(candidate.length, nameWord.length, 1);
                if (dist / maxLen < 0.45 && dist < bestScore) {
                    bestScore = dist;
                    best = i;
                }
            }
            if (best != null) {
                bookIndex = best;
                matchType = 'book_of_fuzzy';
            }
        }

        if (bookIndex !== -1) {
            let remaining = (bookOf.remaining || '')
                .replace(/\b(\d+)\s+to\s+(\d+)\b/gi, '$1-$2')
                .replace(/\b(chapter|verse|verses|vs|v)\b/gi, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            // If fuzzy path, strip the fuzzy candidate words from remaining
            if (bookOf.fuzzyCandidate && !bookOf.bookCanonical) {
                const cand = bookOf.fuzzyCandidate;
                if (remaining.toLowerCase().startsWith(cand.toLowerCase())) {
                    remaining = remaining.slice(cand.length).trim();
                }
            }
            // Vosk: "three" → river/free/tree in chapter slot ("john river sixteen")
            remaining = remaining
                .replace(/\b(river|free|tree|tee|cleese)\b/gi, '3')
                .replace(/\s+/g, ' ')
                .trim();
            const parsed = parseChapterVerse(remaining, {
                maxChapter: maxChaptersForBook(books[bookIndex]?.name),
            });
            if (parsed) {
                return { bookIndex, ...parsed, matchType };
            }
            return { bookIndex, chapter: 1, startVerse: 1, endVerse: 1, matchType };
        }
    }

    // Now finish pre-processing for the book match passes
    // Protect verse ranges ("1 to 8") before TRIGGER_STRIP removes bare "to"
    let command = numberTranslated.replace(/\b(\d+)\s+to\s+(\d+)\b/gi, '$1-$2');
    command = command.replace(TRIGGER_STRIP_RE, ' ');
    command = command.replace(/\b(chapter|verse|verses|vs|v)\b/g, ' ');
    command = command.replace(/\s+/g, ' ').trim();

    // ─────────────────────────────────────────────────────────────────────────
    // PASS 1 — Exact alias match
    // ─────────────────────────────────────────────────────────────────────────
    let matchedBookName = null;
    let remainingText = command;

    // Check alias table — longest match wins
    let bestAliasLen = 0;
    for (const [alias, canonical] of BOOK_ALIAS_ENTRIES) {
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?:^|\\s)(${escaped})(?=[^a-z]|$)`, 'i');
        const match = command.match(regex);
        if (match && alias.length > bestAliasLen) {
            bestAliasLen = alias.length;
            matchedBookName = canonical;
            const idx = match.index + (match[0].startsWith(' ') ? 1 : 0);
            remainingText = command.slice(idx + alias.length).trim();
        }
    }

    // If alias found, find its index in the books array
    if (matchedBookName) {
        const bookIndex = findBookIndex(books, matchedBookName);
        if (bookIndex !== -1) {
            const parsed = parseChapterVerse(remainingText, {
                maxChapter: maxChaptersForBook(matchedBookName),
            });
            if (parsed) {
                return { bookIndex, ...parsed, matchType: 'alias' };
            }
            // Book found but no chapter — only when explicitly allowed (book-of / loose)
            if (allowBookOnly) {
                return { bookIndex, chapter: 1, startVerse: 1, endVerse: 1, matchType: 'alias_chapter_only' };
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PASS 4 — Context-only jump (chapter X / verse X, no book name mentioned)
    // Use cases: "verse 5", "verses 10 to 12", "chapter 10 verse 2", "go to 20"
    // Placed after Pass 1 so "1 John 4 verse 8" isn't hijacked by the "verse 8" part.
    // ─────────────────────────────────────────────────────────────────────────
    const ctxJump = parseContextJump(rawCommand) || parseContextJump(numberTranslated);
    if (ctxJump && currentContext && Number.isInteger(currentContext.bookIndex)) {
        const { bookIndex, chapter } = currentContext;
        const targetChapter = ctxJump.chapter != null ? ctxJump.chapter : chapter;
        return {
            bookIndex,
            chapter: targetChapter,
            startVerse: ctxJump.startVerse,
            endVerse: ctxJump.endVerse,
            matchType: ctxJump.type === 'chapter' ? 'context_chapter' : 'context_verse',
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PASS 2 — Fuzzy phonetic + Levenshtein match on all 66 book names
    // Guard: never treat a pure-numeric candidate as a book name. Numbered
    // variants ("1 Samuel") expose digit firstWords; matching candidate "1"
    // (chapter leftover after verse-word strip) spuriously yields 1 Samuel 1:1.
    // Fuzzy targets use nameWord ("samuel"), not the ordinal digit.
    // ─────────────────────────────────────────────────────────────────────────
    if (allowPass2) {
    const bookMetas = buildBookMetas(books);
    const words = command.split(' ').filter(Boolean);

    // Try first 1, 2, or 3 words as the book name
    let bestFuzzyMatch = null;
    let bestFuzzyScore = Infinity;
    let bestFuzzyRemainder = '';
    let bestFuzzyNormScore = 1;

    for (let wordCount = 3; wordCount >= 1; wordCount--) {
        if (words.length < wordCount) continue;
        const candidate = words.slice(0, wordCount).join(' ');
        // Pure digits / ordinals alone are chapter/verse tokens, never book names
        if (/^[\d\s]+$/.test(candidate)) continue;
        if (/^(1st|2nd|3rd|first|second|third)$/i.test(candidate)) continue;

        const candidatePhonetic = phoneticCode(candidate.replace(/\s/g, ''));
        const remainder = words.slice(wordCount).join(' ');
        const candFirst = candidate.split(' ')[0];
        // "one samuel" / "1 samuel" style — only when full phrase is a numbered book
        const candHasOrdinal = /^(1|2|3|1st|2nd|3rd|first|second|third)\s+\S+/i.test(candidate);

        for (const meta of bookMetas) {
            const fuzzyTarget = meta.isNumberedVariant ? meta.nameWord : meta.bookLower;
            const fuzzyPhonetic = meta.isNumberedVariant ? meta.namePhonetic : meta.bookPhonetic;

            // Phonetic match (exact sound-alike) against full name or nameWord
            if (candidatePhonetic && fuzzyPhonetic && candidatePhonetic === fuzzyPhonetic) {
                // Numbered books: bare "samuel" is OK (aliases map to 1 Samuel);
                // digit-only candidates already skipped above.
                const parsed = parseChapterVerse(remainder, {
                    maxChapter: maxChaptersForBook(meta.book?.name),
                });
                if (parsed) {
                    if (!transcriptSupportsResolvedBook(rawCommand, meta, books) && !candHasOrdinal) {
                        // Content-less fuzzy phonetic — demote (do not silent-commit)
                        continue;
                    }
                    return { bookIndex: meta.index, ...parsed, matchType: 'phonetic' };
                }
            }

            // Levenshtein against name token (never against digit firstWord of "1 Samuel")
            const dist = Math.min(
                levenshtein(candidate, fuzzyTarget),
                levenshtein(candFirst, fuzzyTarget.split(' ')[0]),
                meta.isNumberedVariant && candHasOrdinal
                    ? levenshtein(candidate, meta.bookLower)
                    : Infinity,
            );
            if (dist >= bestFuzzyScore && dist !== 0) continue;

            const maxLen = Math.max(candidate.length, fuzzyTarget.length, 1);
            const score = dist / maxLen; // Normalised: 0=exact, 1=completely different
            if (score < 0.35) {
                bestFuzzyScore = dist;
                bestFuzzyNormScore = score;
                bestFuzzyMatch = meta;
                bestFuzzyRemainder = remainder;
            }
        }
    }

    if (bestFuzzyMatch) {
        const supported = transcriptSupportsResolvedBook(rawCommand, bestFuzzyMatch, books);
        const parsed = parseChapterVerse(bestFuzzyRemainder, {
            maxChapter: maxChaptersForBook(bestFuzzyMatch.book?.name),
        });
        if (parsed) {
            if (!supported) {
                // Fuzzy hit with no book-name token in the transcript → FR-3.19 suggestion,
                // not a silent confident display.
                return {
                    bookIndex: bestFuzzyMatch.index,
                    ...parsed,
                    matchType: 'fuzzy_unsupported',
                    needsConfirmation: true,
                    confidence: Math.max(0, 1 - bestFuzzyNormScore) * 0.35,
                    suggestions: [{
                        bookIndex: bestFuzzyMatch.index,
                        chapter: parsed.chapter,
                        startVerse: parsed.startVerse,
                        endVerse: parsed.endVerse,
                        name: bestFuzzyMatch.book.name,
                    }],
                };
            }
            return { bookIndex: bestFuzzyMatch.index, ...parsed, matchType: 'fuzzy' };
        }
        if (allowBookOnly && supported) {
            return { bookIndex: bestFuzzyMatch.index, chapter: 1, startVerse: 1, endVerse: 1, matchType: 'fuzzy_no_numbers' };
        }
    }
    } // end allowPass2

    // ─────────────────────────────────────────────────────────────────────────
    // PASS 3 — Keyword content search (e.g. "for God so loved the world")
    // ONLY when allowPass3 (trigger / Pass B) — never on raw continuous sermon audio
    // ─────────────────────────────────────────────────────────────────────────
    if (allowPass3 && bibleElectron && bibleElectron.searchVerses) {
        // Extract meaningful keywords (strip stop words + triggers, min 3 chars)
        const STOP_WORDS = new Set([
            'the', 'and', 'for', 'that', 'this', 'with', 'from', 'shall', 'unto',
            'thee', 'thou', 'thy', 'hath', 'have', 'will', 'which', 'but', 'not',
            'are', 'was', 'were', 'been', 'unto', 'upon', 'into', 'also', 'even',
            // Wake words must not poison the LIKE query (no verse contains "ocs")
            'ocs', 'media', 'oasis', 'ocean', 'osiris', 'obvious', 'meter', 'medium',
            'please', 'read', 'open', 'show',
        ]);
        const keywords = rawCommand.split(/\s+/)
            .map(w => w.toLowerCase().replace(/[^a-z]/g, ''))
            .filter(w => w.length >= 3 && !STOP_WORDS.has(w));

        const minKeywords = isMidSpeech ? 5 : 3;

        if (keywords.length >= minKeywords) {
            try {
                const results = await bibleElectron.searchVerses(keywords.slice(0, 4).join(' '), 'kjv', 5);
                if (results && results.length > 0) {
                    const top = results[0];
                    // top = { book_id, chapter, verse, text }
                    const bookIndex = books.findIndex(b => b.id === top.book_id);
                    if (bookIndex !== -1) {
                        // Pass 3 is intentionally content-only (no book token required).
                        // Book-token support gating applies to Pass 2 fuzzy, not keyword quotes.
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
 * Fuzzy book filter and resolver for structured Bible input and UI autocompletion (FR-3.15 / FR-2.1).
 * Uses exact alias -> prefix/word-order -> phonetic/Levenshtein matching.
 * @param {string} query
 * @param {Array<{id: number, name: string}>} books
 * @returns {Array<{id: number, name: string}>}
 */
export function filterBooksFuzzy(query, books) {
    if (!books || !Array.isArray(books) || books.length === 0) return [];
    if (!query || !query.trim()) return books;

    const q = query.toLowerCase().trim();
    const qClean = q.replace(/[^\w\s]/g, "").trim();

    const results = [];
    const seenNames = new Set();

    function add(b, priority) {
        if (!b || !b.name) return;
        const key = b.name.toLowerCase();
        if (!seenNames.has(key)) {
            seenNames.add(key);
            results.push({ book: b, priority });
        }
    }

    // 1. Exact alias resolution from BOOK_ALIASES table
    const aliasMatch = BOOK_ALIASES[q] || BOOK_ALIASES[qClean];
    if (aliasMatch) {
        const b = books.find(x => x.name.toLowerCase() === aliasMatch.toLowerCase());
        if (b) add(b, 0);
    }

    // 2. Prefix match across all aliases in BOOK_ALIASES
    for (const [alias, canonical] of Object.entries(BOOK_ALIASES)) {
        if (alias === q || alias === qClean) {
            const b = books.find(x => x.name.toLowerCase() === canonical.toLowerCase());
            if (b) add(b, 1);
        } else if (alias.startsWith(q) || (qClean && alias.startsWith(qClean))) {
            const b = books.find(x => x.name.toLowerCase() === canonical.toLowerCase());
            if (b) add(b, 2);
        }
    }

    // 3. Direct canonical book name startsWith
    for (const b of books) {
        const n = b.name.toLowerCase();
        if (n.startsWith(q) || (qClean && n.startsWith(qClean))) {
            add(b, 3);
        }
    }

    // 4. Direct canonical book name includes
    for (const b of books) {
        const n = b.name.toLowerCase();
        if (n.includes(q) || (qClean && n.includes(qClean))) {
            add(b, 4);
        }
    }

    // 5. Phonetic (Metaphone) code match
    const qPhonetic = phoneticCode(qClean.replace(/\s/g, ""));
    if (qPhonetic) {
        for (const b of books) {
            const n = b.name.toLowerCase();
            const bPhonetic = phoneticCode(n.replace(/\s/g, ""));
            if (bPhonetic && qPhonetic === bPhonetic) {
                add(b, 5);
            }
        }
    }

    // 6. Levenshtein distance fallback
    for (const b of books) {
        const n = b.name.toLowerCase();
        const dist = levenshtein(qClean || q, n);
        const maxLen = Math.max(q.length, n.length, 1);
        if (dist <= 2 || (dist / maxLen <= 0.35)) {
            add(b, 6 + dist);
        }
    }

    results.sort((a, b) => a.priority - b.priority);
    return results.map(r => r.book);
}

/**
 * Resolve a single book query to its best matching book object (or null).
 * @param {string} query
 * @param {Array<{id: number, name: string}>} books
 * @returns {{id: number, name: string}|null}
 */
export function resolveBookName(query, books) {
    const list = filterBooksFuzzy(query, books);
    return list.length > 0 ? list[0] : null;
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

    const lower = rawText.toLowerCase();
    // Explicit "book of …" cue — always treat as a bible reference attempt
    if (/\b(?:the\s+)?book\s+of\s+\S+/i.test(lower)) {
        return true;
    }
    
    // Clean text: digits, handle common separators including colons
    let t = wordNumbersToDigits(lower).replace(/[,;.:]/g, ' ');
    t = repairReferenceConnectors(t);
    t = t.replace(TRIGGER_STRIP_RE, ' ').trim();
    
    // Check if it's a direct context jump (e.g. "verse 5" or "chapter 3" or "verses 10 to 12" or "go to 20")
    if (parseContextJump(rawText) || parseContextJump(t)) {
        return true;
    }

    // Sort aliases by length descending so "1 john" is checked before "john"
    // Search for any alias followed by a number (allowing optional space for slurred speech)
    for (const [alias] of BOOK_ALIAS_ENTRIES) {
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\s*\\d+`, 'i');
        if (regex.test(t)) {
            return true;
        }
    }
    return false;
}

/**
 * Detect whether raw, pre-repair speech contains an explicit structural marker
 * (chapter/verse keywords, colon, range punctuation, or pre-repair dual numbers).
 * @param {string} rawText
 * @param {Object|null} shape
 * @returns {boolean}
 */
export function detectExplicitMarker(rawText, shape = null) {
    if (!rawText || !String(rawText).trim()) return false;
    const lower = String(rawText).toLowerCase();

    // 1. Literal structural keywords (e.g. "chapter 3", "verse 5", "vs 1")
    if (/\b(?:chapter|chapters|chatper|chaptor|chaper)\s+\d+\b/i.test(wordNumbersToDigits(lower)) ||
        (/\b(?:chapter|chapters|chatper|chaptor|chaper)\b/i.test(lower) && !/\b\d+\s+chapters\b/i.test(wordNumbersToDigits(lower)))) {
        return true;
    }
    if (/\b(?:verse|verses|vs\.?|v\.?|vass|vasses)\b/i.test(lower)) return true;

    // 2. Structural "book of" cue
    if (/\b(?:the\s+)?book\s+of\b/i.test(lower)) return true;

    // 3. Colon-separated reference or range punctuation
    if (/\b\d+\s*:\s*\d+\b/.test(lower)) return true;
    if (/\b\d+\s*-\s*\d+\b/.test(lower)) return true;

    // 4. Pre-repair dual numbers (book + chapter + verse, e.g. "1 Corinthians 13 4" / "John 3 16")
    if (shape && shape.kind === 'full' && shape.chapter != null && shape.verse != null) {
        const tDigits = wordNumbersToDigits(lower);
        if (!/\b(?:is|was|has|had)\s+\d+\b/i.test(tDigits)) {
            return true;
        }
    }

    return false;
}

/**
 * Structural pre-check before any fuzzy/keyword Bible matching (FR-3.58 / ambient SM).
 * Ordered adjacency: BOOK → NUMBER → optional VERSE — not “book anywhere + number anywhere”.
 *
 * @returns {{
 *   complete: boolean,
 *   hasExplicitMarker: boolean,
 *   shortContext: boolean,
 *   kind: 'full'|'chapter'|'book_of'|null,
 *   span: string|null,
 *   chapter: number|null,
 *   verse: number|null,
 * }}
 */
export function matchReferenceShape(rawText) {
    const empty = {
        complete: false,
        hasExplicitMarker: false,
        shortContext: false,
        kind: null,
        span: null,
        chapter: null,
        verse: null,
    };
    if (!rawText || !String(rawText).trim()) return empty;

    const lower = String(rawText).toLowerCase();
    const hasExplicitPreRepair = detectExplicitMarker(rawText);
    let t = wordNumbersToDigits(lower).replace(/[,;.:]/g, ' ');
    // Normalize "2:1-8" / "1-8" ranges into tokens the scanner can consume
    t = t.replace(/(\d+)\s*-\s*(\d+)/g, '$1 to $2');

    // FR-3.69 — Protect leading ordinal book-prefixes from verse-connector repair.
    // "first corinthians 13 1" is fine, but Vosk sometimes outputs
    // "first corinthians 13 first" (mishearing "one" as "first"), which after
    // repairReferenceConnectors line 491 (\d+ first \d+) would mangle "13 first …".
    // Pre-normalise ordinal+book combinations into their digit-canonical alias form
    // so the following repair step only sees digit tokens at the start.
    // e.g. "first corinthians" → "1 corinthians" before repair runs.
    const ORDINAL_BOOK_PREFIXES = [
        // 3-word ordinal aliases (e.g. "first book of …") — handled by tryBookAt's book-of path
        [/\b(first)\s+(samuel|summer|kings|chronicles|corinthians|corinthian|thessalonians|timothy|simultitu|simultity|peter|john)\b/gi,
            (_, _ord, book) => `1 ${book}`],
        [/\b(second)\s+(samuel|summer|kings|chronicles|corinthians|corinthian|thessalonians|timothy|simultitu|simultity|peter|john)\b/gi,
            (_, _ord, book) => `2 ${book}`],
        [/\b(third)\s+(john)\b/gi, () => '3 john'],
        [/\b(1st)\s+(samuel|summer|kings|chronicles|corinthians|corinthian|thessalonians|timothy|simultitu|simultity|peter|john)\b/gi,
            (_, _ord, book) => `1 ${book}`],
        [/\b(2nd)\s+(samuel|summer|kings|chronicles|corinthians|corinthian|thessalonians|timothy|simultitu|simultity|peter|john)\b/gi,
            (_, _ord, book) => `2 ${book}`],
        [/\b(3rd)\s+(john)\b/gi, () => '3 john'],
    ];
    for (const [pattern, replacement] of ORDINAL_BOOK_PREFIXES) {
        t = t.replace(pattern, replacement);
    }

    t = repairReferenceConnectors(t);

    // Short context jump — NOT ambient-complete (Pass 4 / trigger path only)
    const ctxJump = parseContextJump(rawText) || parseContextJump(t);
    if (ctxJump) {
        return { ...empty, shortContext: true, hasExplicitMarker: hasExplicitPreRepair, span: t };
    }

    // Strip wake words only — keep "book of" (structural cue)
    t = t.replace(/\b(ocs|oh see ess|oh-see-ess|o s c|osc|oasis|ocean|osiris|obvious|media|meter|medium|median|me the|need a|meet a|meeting|video|please|read|open|show|go to|jump to|skip to|turn to|move to|back to)\b/gi, ' ');
    t = t.replace(/\s+/g, ' ').trim();

    const tokens = t.split(/\s+/).filter(Boolean);
    if (!tokens.length) return empty;

    const CONNECT = new Set([
        'chapter', 'chapters', 'chatper', 'chaptor', 'chaper',
        'of', 'the',
    ]);
    const VERSE_CONN = new Set([
        'verse', 'verses', 'vs', 'v', 'was', 'worse', 'voice', 'vers', 'virs', 'vas',
        'versus', 'versa', 'vast', 'fast', 'and', 'to', 'through', 'thru',
    ]);
    const ORDINAL_PREFIX = new Set([
        '1st', '2nd', '3rd', 'first', 'second', 'third', '1', '2', '3',
    ]);

    const tryBookAt = (idx) => {
        // "book of …"
        if (
            (tokens[idx] === 'book' && tokens[idx + 1] === 'of') ||
            (tokens[idx] === 'the' && tokens[idx + 1] === 'book' && tokens[idx + 2] === 'of')
        ) {
            const ofIdx = tokens[idx] === 'the' ? idx + 2 : idx + 1;
            let bookStart = ofIdx + 1;
            if (bookStart >= tokens.length) return null;
            // Skip leading "the" after "book of" ("book of the philippines")
            while (bookStart < tokens.length && tokens[bookStart] === 'the') bookStart += 1;
            if (bookStart >= tokens.length) return null;
            let best = null;
            for (const [alias, canonical] of BOOK_ALIAS_ENTRIES) {
                const parts = alias.split(/\s+/);
                if (parts.length > tokens.length - bookStart) continue;
                let ok = true;
                for (let k = 0; k < parts.length; k++) {
                    if (tokens[bookStart + k] !== parts[k]) { ok = false; break; }
                }
                if (!ok) continue;
                if (!best || parts.length > best.aliasParts) {
                    best = {
                        end: bookStart + parts.length,
                        start: idx,
                        aliasParts: parts.length,
                        bookOf: true,
                        canonical,
                    };
                }
            }
            // Unknown book name after "book of" — still treat next 1–3 tokens as bookish cue
            if (!best && bookStart < tokens.length) {
                const take = Math.min(3, tokens.length - bookStart);
                // Stop before a number
                let n = 0;
                while (n < take && !/^\d+$/.test(tokens[bookStart + n])) n += 1;
                if (n > 0) {
                    best = { end: bookStart + n, start: idx, aliasParts: n, bookOf: true };
                }
            }
            return best;
        }

        // Ordinal + book: "first corinthians", "1 john"
        if (ORDINAL_PREFIX.has(tokens[idx]) && idx + 1 < tokens.length) {
            const joined = `${tokens[idx]} ${tokens[idx + 1]}`;
            for (const [alias, canonical] of BOOK_ALIAS_ENTRIES) {
                if (alias === joined || alias.replace(/\s+/g, '') === joined.replace(/\s+/g, '')) {
                    return { end: idx + 2, start: idx, aliasParts: 2, bookOf: false, canonical };
                }
            }
            // "1st corinthians" style already in aliases as "1st corinthians"
            for (const [alias, canonical] of BOOK_ALIAS_ENTRIES) {
                const parts = alias.split(/\s+/);
                if (parts.length < 2) continue;
                if (parts[0] === tokens[idx] && parts[1] === tokens[idx + 1]) {
                    return { end: idx + parts.length, start: idx, aliasParts: parts.length, bookOf: false, canonical };
                }
            }
        }

        // Plain alias (longest first — BOOK_ALIAS_ENTRIES already sorted)
        for (const [alias, canonical] of BOOK_ALIAS_ENTRIES) {
            if (alias.length < 2) continue;
            // Avoid ultra-short ambiguous aliases unless followed by a number soon
            const parts = alias.split(/\s+/);
            if (parts.length > tokens.length - idx) continue;
            let ok = true;
            for (let k = 0; k < parts.length; k++) {
                if (tokens[idx + k] !== parts[k]) { ok = false; break; }
            }
            if (!ok) continue;
            return { end: idx + parts.length, start: idx, aliasParts: parts.length, bookOf: false, canonical };
        }
        return null;
    };

    const isNum = (tok) => /^\d+$/.test(tok);

    for (let i = 0; i < tokens.length; i++) {
        const book = tryBookAt(i);
        if (!book) continue;

        let j = book.end;
        // Skip up to 2 light connectives (chapter / of / the)
        let skipped = 0;
        while (j < tokens.length && skipped < 2 && CONNECT.has(tokens[j]) && !isNum(tokens[j])) {
            j += 1;
            skipped += 1;
        }
        if (j >= tokens.length || !isNum(tokens[j])) {
            // Book without adjacent number — keep scanning (don't treat as ambient)
            continue;
        }

        const chapterTok = tokens[j];
        let chapter = parseInt(chapterTok, 10);
        const spanStart = book.start;
        j += 1;

        // Compact "acts 228" / "john 316" / "matthew 622 to 23" → 6:22-23
        // Also accept a single hyphenated token "622-23"
        let compactTok = null;
        let compactEndFromTok = null;
        const hyphenCompact = chapterTok.match(/^(\d{3,5})-(\d+)$/);
        if (hyphenCompact) {
            compactTok = hyphenCompact[1];
            compactEndFromTok = parseInt(hyphenCompact[2], 10);
        } else if (/^\d{3,5}$/.test(chapterTok)) {
            compactTok = chapterTok;
        }
        if (compactTok) {
            const compact = expandCompactChapterVerse(compactTok, {
                maxChapter: maxChaptersForBook(book.canonical),
            });
            if (compact) {
                let endVerse = compactEndFromTok != null ? compactEndFromTok : compact.endVerse;
                let k = j;
                if (compactEndFromTok == null && k < tokens.length) {
                    const RANGE_CONN = new Set(['to', 'through', 'and', '-', 'thru']);
                    let r = k;
                    let rSkip = 0;
                    while (r < tokens.length && rSkip < 2 && RANGE_CONN.has(tokens[r]) && !isNum(tokens[r])) {
                        r += 1;
                        rSkip += 1;
                    }
                    if (r < tokens.length && isNum(tokens[r]) && rSkip > 0) {
                        endVerse = parseInt(tokens[r], 10);
                        k = r + 1;
                    }
                }
                if (endVerse < compact.startVerse) endVerse = compact.startVerse;
                const span = tokens.slice(spanStart, k).join(' ');
                return {
                    complete: true,
                    shortContext: false,
                    kind: 'full',
                    span,
                    chapter: compact.chapter,
                    verse: compact.startVerse,
                    endVerse,
                };
            }
        }

        // Optional verse
        let verse = null;
        let endVerse = null;
        let k = j;
        let vSkip = 0;
        while (k < tokens.length && vSkip < 2 && VERSE_CONN.has(tokens[k]) && !isNum(tokens[k])) {
            k += 1;
            vSkip += 1;
        }
        if (k < tokens.length && isNum(tokens[k]) && (vSkip > 0 || true)) {
            // Accept second number as verse when:
            // - there was a verse connective, OR
            // - bare "john 3 16" (adjacent second number within 0 connectives from chapter)
            if (vSkip > 0 || k === j) {
                verse = parseInt(tokens[k], 10);
                k += 1;
                // "genesis 2 124" → verse token 124 is slurred "1 to 4"
                if (verse >= 100) {
                    const slurred = expandSlurredVerseRange(verse);
                    if (slurred) {
                        endVerse = slurred.endVerse;
                        verse = slurred.startVerse;
                    }
                }
            }
        }

        // Optional end of range: "to 8" / "through 8" / "- 8" / bare third number
        if (verse != null && endVerse == null && k < tokens.length) {
            const RANGE_CONN = new Set(['to', 'through', 'and', '-', 'thru']);
            let r = k;
            let rSkip = 0;
            while (r < tokens.length && rSkip < 2 && RANGE_CONN.has(tokens[r]) && !isNum(tokens[r])) {
                r += 1;
                rSkip += 1;
            }
            if (r < tokens.length && isNum(tokens[r]) && (rSkip > 0 || r === k)) {
                // Bare third number only when immediately after verse (acts 2 1 8)
                if (rSkip > 0 || r === k) {
                    endVerse = parseInt(tokens[r], 10);
                    k = r + 1;
                }
            }
        }
        if (endVerse == null) endVerse = verse;

        const spanEnd = verse != null ? k : j;
        const span = tokens.slice(spanStart, spanEnd).join(' ');
        const kind = verse != null ? 'full' : (book.bookOf ? 'book_of' : 'chapter');
        const candidateShape = {
            complete: true,
            kind,
            span,
            chapter,
            verse,
            endVerse,
        };
        const isExplicit = hasExplicitPreRepair || detectExplicitMarker(rawText, candidateShape);
        return {
            complete: true,
            hasExplicitMarker: isExplicit,
            shortContext: false,
            kind,
            span,
            chapter,
            verse,
            endVerse,
        };
    }

    return empty;
}

/**
 * True when utterance has an ambient-complete reference shape (book + number[+verse]).
 * Short context jumps alone are false here — use matchReferenceShape().shortContext.
 */
export function hasAmbientReferenceShape(rawText) {
    return matchReferenceShape(rawText).complete;
}

/**
 * Structural pre-check (legacy + short context). Prefer matchReferenceShape for new code.
 */
export function hasReferenceShape(rawText) {
    const m = matchReferenceShape(rawText);
    return m.complete || m.shortContext;
}

/**
 * True when the utterance looks like a scripture quote (Pass 3 keyword search).
 * Requires enough content words so sermon chatter does not spam SQLite.
 * Callers must ALSO gate with trigger / Pass B (FR-3.57) — this alone is not enough.
 */
export function isLikelyKeywordQuote(rawText) {
    if (!rawText || rawText.trim().length < 18) return false;
    if (isLikelyBibleReference(rawText)) return false;
    const STOP = new Set([
        'the', 'and', 'for', 'that', 'this', 'with', 'from', 'shall', 'unto',
        'thee', 'thou', 'thy', 'hath', 'have', 'will', 'which', 'but', 'not',
        'are', 'was', 'were', 'been', 'upon', 'into', 'also', 'even', 'next',
        'previous', 'verse', 'chapter', 'timer', 'screen', 'highlight', 'mark',
        'please', 'would', 'could', 'should', 'about', 'there',
    ]);
    const keywords = rawText.split(/\s+/)
        .map(w => w.toLowerCase().replace(/[^a-z]/g, ''))
        .filter(w => w.length >= 3 && !STOP.has(w));
    return keywords.length >= 3;
}
