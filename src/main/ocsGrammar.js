/**
 * Build a Vosk grammar (JSON string array) for Pass B constrained recognition.
 * Vocabulary: book names/aliases, spoken numbers, command phrases, triggers.
 * Keep size bounded so lookahead FST stays practical on the small model.
 */

const BOOK_NAMES = [
  'genesis', 'exodus', 'leviticus', 'numbers', 'deuteronomy',
  'joshua', 'judges', 'ruth', 'samuel', 'kings', 'chronicles',
  'ezra', 'nehemiah', 'esther', 'job', 'psalms', 'psalm', 'proverbs',
  'ecclesiastes', 'isaiah', 'jeremiah', 'lamentations', 'ezekiel', 'daniel',
  'hosea', 'joel', 'amos', 'obadiah', 'jonah', 'micah', 'nahum', 'habakkuk',
  'zephaniah', 'haggai', 'zechariah', 'malachi',
  'matthew', 'mark', 'luke', 'john', 'acts', 'romans', 'corinthians',
  'galatians', 'ephesians', 'philippians', 'colossians', 'thessalonians',
  'timothy', 'titus', 'philemon', 'hebrews', 'james', 'peter', 'jude',
  'revelation', 'revelations',
];

const BOOK_ALIASES = [
  'gen', 'exo', 'lev', 'num', 'deut', 'josh', 'judg',
  'matt', 'mathew', 'mattew', 'mach', 'march', 'mac', 'marc', 'look', 'luk',
  'jn', 'rom', 'cor', 'gal', 'eph', 'phil', 'col', 'heb', 'rev', 'ps', 'prov',
  'sam', 'chron', 'thess', 'tim', 'pet', 'sams',
  'molokai', 'malakai', 'malakhi', 'molochi', 'molakai',
  'have a cook', 'haveacook', 'habba cook', 'habit cook', 'stephanie', 'zephania',
  // Colossians OOV stopgaps — in-vocab competitors + near-spellings
  'collisions', 'collision', 'collosions', 'collosion',
  'collusion', 'collusions', 'collotions', 'collotion',
  'collations', 'collation', 'coalition', 'coalitions',
  'colosians', 'colosian',
  'college as', 'college is', 'justins as', 'justin as', 'justins',
  // Jeremiah ASR / spelling slips
  'jaymiah', 'jayemiah', 'jerimiah', 'jermiah', 'jeremyah', 'jeremy',
  // Philippians OOV stopgaps — country name is in-vocab; book name is not
  'philippines', 'philippine', 'philipians', 'phillipians', 'phillipines',
];

const ORDINAL_BOOKS = [
  'first samuel', 'second samuel', 'first kings', 'second kings',
  'first chronicles', 'second chronicles', 'first corinthians', 'second corinthians',
  'first thessalonians', 'second thessalonians', 'first timothy', 'second timothy',
  'first peter', 'second peter', 'first john', 'second john', 'third john',
  'song of solomon', 'song of songs',
];

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function spoken(n) {
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o ? `${TENS[t]} ${ONES[o]}` : TENS[t];
  }
  if (n === 100) return 'one hundred';
  if (n < 177) {
    const rest = n - 100;
    return rest ? `one hundred and ${spoken(rest)}` : 'one hundred';
  }
  return String(n);
}

const COMMANDS = [
  'next verse', 'previous verse', 'go back', 'first verse', 'last verse',
  'black screen', 'blank screen', 'blanche screen', 'blunk screen', 'click screen', 'clear screen', 'screen off', 'screen on', 'show screen',
  'clear highlights', 'remove marks', 'set timer', 'start timer', 'stop timer',
  'cancel timer', 'pause timer', 'reset timer',
  'previous scripture', 'last scripture', 'go back to the last scripture',
  'return to last scripture', 'back to last scripture',
];

const TRIGGERS = [
  'ocs', 'media', 'oasis', 'ocean', 'osiris', 'obvious',
  'oh see ess', 'meter', 'medium', 'median',
];

const CONNECTORS = [
  'verse', 'verses', 'chapter', 'book', 'of', 'the', 'to', 'and', 'through',
  'book of', 'the book of', 'chapter start', 'end of chapter',
];

/**
 * @returns {string[]} grammar phrases for vosk-koffi Recognizer({ grammar })
 */
function buildOcsGrammar() {
  const set = new Set();
  const add = (s) => {
    const t = String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (t) set.add(t);
  };

  COMMANDS.forEach(add);
  TRIGGERS.forEach(add);
  CONNECTORS.forEach(add);
  BOOK_NAMES.forEach(add);
  BOOK_ALIASES.forEach(add);
  ORDINAL_BOOKS.forEach(add);

  for (let n = 1; n <= 176; n++) add(spoken(n));

  // High-frequency reference templates (bounded for FST size)
  const booksForRefs = [
    ...ORDINAL_BOOKS,
    'genesis', 'exodus', 'psalms', 'psalm', 'proverbs', 'isaiah', 'jeremiah',
    'matthew', 'mark', 'luke', 'john', 'acts', 'romans',
    'galatians', 'ephesians', 'philippians', 'colossians', 'hebrews', 'james',
    'revelation', 'daniel', 'job', 'ruth',
  ];

  for (const book of booksForRefs) {
    add(`book of ${book}`);
    add(`the book of ${book}`);
    for (let ch = 1; ch <= 21; ch++) {
      const cs = spoken(ch);
      add(`${book} ${cs}`);
      for (let vs = 1; vs <= 16; vs++) {
        const vsS = spoken(vs);
        add(`${book} ${cs} ${vsS}`);
        add(`${book} ${cs} verse ${vsS}`);
      }
    }
  }

  // Context jumps
  for (let n = 1; n <= 176; n++) {
    const s = spoken(n);
    add(`verse ${s}`);
    add(`chapter ${s}`);
  }

  add('[unk]');
  return Array.from(set);
}

module.exports = { buildOcsGrammar, spoken };
