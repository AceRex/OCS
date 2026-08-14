/**
 * Generate exhaustive Vosk ASR phonetic-mishearing alias table.
 * Variants are plausible small-model transcriptions under:
 * Nigerian (Yoruba/Igbo/Hausa L1), Nigerian Pidgin, Ghanaian, Kenyan,
 * South African, Indian, Filipino, Caribbean, General American, British English.
 *
 * Characteristic shifts applied:
 * - th-stopping: θ→t/f, ð→d/v (WA, Caribbean, Indian, Filipino)
 * - /v/↔/w/ (Indian, some Nigerian)
 * - /f/↔/p/ (Filipino, Hausa influence)
 * - cluster simplification / final consonant drop (syllable-timed L2)
 * - non-rhotic British: -er → -a/-uh; linking r artifacts
 * - vowel length / ɪ↔iː, æ↔ɑ, ʌ↔ɔ (WA English)
 * - schwa insertion (Indian) / syllable timing
 * - Pidgin-adjacent casual reductions
 */

'use strict';

function uniq(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    if (x == null) continue;
    const s = String(x).toLowerCase().trim().replace(/\s+/g, ' ');
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/** Mechanical phonetic transforms for L2 / accent ASR noise */
function phoneticTransforms(word) {
  const w = word.toLowerCase();
  const out = [w];
  const add = (x) => { if (x && x !== w) out.push(x); };

  // th-stopping / fronting
  add(w.replace(/th/g, 't'));
  add(w.replace(/th/g, 'd'));
  add(w.replace(/th/g, 'f'));
  add(w.replace(/^th/, 't'));
  add(w.replace(/^th/, 'd'));
  add(w.replace(/the/g, 'de'));
  add(w.replace(/the/g, 'di'));

  // v/w
  add(w.replace(/v/g, 'w'));
  add(w.replace(/w/g, 'v'));

  // f/p (Filipino / Hausa)
  add(w.replace(/f/g, 'p'));
  add(w.replace(/ph/g, 'f'));
  add(w.replace(/ph/g, 'p'));

  // s/sh / ch
  add(w.replace(/sh/g, 's'));
  add(w.replace(/ch/g, 'sh'));
  add(w.replace(/ch/g, 't'));

  // final consonant weakening
  if (/[bcdgktp]$/.test(w)) add(w.slice(0, -1));
  if (/ck$/.test(w)) add(w.replace(/ck$/, 'k'));
  if (/cks$/.test(w)) add(w.replace(/cks$/, 'ks'));

  // -er / -or (British non-rhotic + ASR)
  add(w.replace(/er$/, 'a'));
  add(w.replace(/er$/, 'uh'));
  add(w.replace(/or$/, 'a'));
  add(w.replace(/our$/, 'or'));
  add(w.replace(/our$/, 'a'));

  // double letters collapsed / expanded
  add(w.replace(/(.)\1+/g, '$1'));

  // syllable insertion (Indian / careful L2)
  if (/^[bcdfghjklmnpqrstvwxyz]{2}/.test(w)) {
    add(w[0] + 'a' + w.slice(1));
    add(w[0] + 'e' + w.slice(1));
  }

  // -tion / -sion
  add(w.replace(/tion$/, 'shun'));
  add(w.replace(/tion$/, 'sion'));
  add(w.replace(/sion$/, 'shun'));

  // ia / ea / eo
  add(w.replace(/ia/, 'ya'));
  add(w.replace(/ia/, 'ea'));
  add(w.replace(/ea/, 'ia'));
  add(w.replace(/eo/, 'io'));
  add(w.replace(/eu/, 'u'));

  // common ASR letter swaps near targets
  add(w.replace(/c/g, 'k'));
  add(w.replace(/ck/g, 'k'));
  add(w.replace(/x/g, 'ks'));
  add(w.replace(/qu/g, 'kw'));
  add(w.replace(/j/g, 'g'));
  add(w.replace(/g(?=[ei])/g, 'j'));

  return uniq(out);
}

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function cardinalSpoken(n) {
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o ? `${TENS[t]} ${ONES[o]}` : TENS[t];
  }
  if (n < 200) {
    const rest = n - 100;
    if (rest === 0) return 'one hundred';
    if (rest < 20) return `one hundred and ${ONES[rest]}`;
    const t = Math.floor(rest / 10);
    const o = rest % 10;
    const tensPart = o ? `${TENS[t]} ${ONES[o]}` : TENS[t];
    return `one hundred and ${tensPart}`;
  }
  return String(n);
}

function numberVariants(n) {
  const spoken = cardinalSpoken(n);
  const parts = [];
  const add = (...xs) => parts.push(...xs);

  add(spoken);
  add(spoken.replace(/ /g, '-'));
  add(spoken.replace(/ and /g, ' '));
  add(spoken.replace(/ and /g, ' n '));
  add(spoken.replace(/ and /g, ' an '));
  add(String(n));

  // th-stopping on three/thirty/thirteen etc.
  add(spoken.replace(/three/g, 'tree'));
  add(spoken.replace(/three/g, 'free'));
  add(spoken.replace(/three/g, 'tee'));
  add(spoken.replace(/thirteen/g, 'thirty in'));
  add(spoken.replace(/thirteen/g, 'thurteen'));
  add(spoken.replace(/thirteen/g, 'tirteen'));
  add(spoken.replace(/thirty/g, 'dirty'));
  add(spoken.replace(/thirty/g, 'tirty'));
  add(spoken.replace(/thirty/g, 'thirdy'));
  add(spoken.replace(/thousand/g, 'tausand'));

  // four / five / for
  add(spoken.replace(/\bfour\b/g, 'for'));
  add(spoken.replace(/\bfour\b/g, 'fore'));
  add(spoken.replace(/\bfive\b/g, 'fife'));
  add(spoken.replace(/\bfive\b/g, 'vive'));

  // two / to / too
  add(spoken.replace(/\btwo\b/g, 'to'));
  add(spoken.replace(/\btwo\b/g, 'too'));
  add(spoken.replace(/\btwo\b/g, 'tu'));

  // six / sex / sicks (common ASR)
  add(spoken.replace(/\bsix\b/g, 'sex'));
  add(spoken.replace(/\bsix\b/g, 'sicks'));
  add(spoken.replace(/\bsix\b/g, 'sik'));

  // seven / several
  add(spoken.replace(/\bseven\b/g, 'sevn'));
  add(spoken.replace(/\bseven\b/g, 'seben'));
  add(spoken.replace(/\bseven\b/g, 'sebben'));

  // eight / ate / hate
  add(spoken.replace(/\beight\b/g, 'ate'));
  add(spoken.replace(/\beight\b/g, 'ait'));
  add(spoken.replace(/\beight\b/g, 'hate'));

  // nine / nigh / mine
  add(spoken.replace(/\bnine\b/g, 'nigh'));
  add(spoken.replace(/\bnine\b/g, 'mine'));
  add(spoken.replace(/\bnine\b/g, 'nein'));

  // one / won / wan
  add(spoken.replace(/\bone\b/g, 'won'));
  add(spoken.replace(/\bone\b/g, 'wan'));
  add(spoken.replace(/\bone\b/g, 'wun'));

  // twenty / twenny / plenty
  add(spoken.replace(/\btwenty\b/g, 'twenny'));
  add(spoken.replace(/\btwenty\b/g, 'twenty'));
  add(spoken.replace(/\btwenty\b/g, 'plenty'));
  add(spoken.replace(/\btwenty\b/g, 'twenti'));

  // forty / fourty (spelling ASR), ford y
  add(spoken.replace(/\bforty\b/g, 'fourty'));
  add(spoken.replace(/\bforty\b/g, 'fordy'));
  add(spoken.replace(/\bforty\b/g, 'foti'));

  // fifty / fiddy
  add(spoken.replace(/\bfifty\b/g, 'fiddy'));
  add(spoken.replace(/\bfifty\b/g, 'fifti'));

  // sixty / sicksty
  add(spoken.replace(/\bsixty\b/g, 'siksti'));
  add(spoken.replace(/\bsixty\b/g, 'sexy'));

  // seventy / sebenty
  add(spoken.replace(/\bseventy\b/g, 'sebenty'));
  add(spoken.replace(/\bseventy\b/g, 'sevnty'));

  // eighty / ady / haiti
  add(spoken.replace(/\beighty\b/g, 'ady'));
  add(spoken.replace(/\beighty\b/g, 'haiti'));
  add(spoken.replace(/\beighty\b/g, 'eiti'));

  // ninety / nineti / nardy
  add(spoken.replace(/\bninety\b/g, 'nineti'));
  add(spoken.replace(/\bninety\b/g, 'ninedy'));

  // hundred
  add(spoken.replace(/hundred/g, 'hunded'));
  add(spoken.replace(/hundred/g, 'hunderd'));
  add(spoken.replace(/hundred/g, 'undred'));
  add(spoken.replace(/hundred/g, 'hundrid'));
  add(spoken.replace(/one hundred/g, 'a hundred'));
  add(spoken.replace(/one hundred/g, 'hundred'));

  // ordinal-ish people say for chapters occasionally
  if (n >= 1 && n <= 20) {
    const ords = {
      1: ['first', '1st', 'fist', 'furst', 'fust'],
      2: ['second', '2nd', 'secon', 'sekond', 'sekon'],
      3: ['third', '3rd', 'turd', 'tird', 'ferd'],
      4: ['fourth', '4th', 'forth', 'fort', 'fout'],
      5: ['fifth', '5th', 'fift', 'fif'],
      6: ['sixth', '6th', 'sikth', 'sixt'],
      7: ['seventh', '7th', 'sevent', 'sebenth'],
      8: ['eighth', '8th', 'eitth', 'aitth', 'eighth'],
      9: ['ninth', '9th', 'nint', 'nineth'],
      10: ['tenth', '10th', 'tent', 'tenth'],
      11: ['eleventh', '11th', 'elevnth'],
      12: ['twelfth', '12th', 'twelft', 'twelf'],
      13: ['thirteenth', '13th', 'tirteenth'],
      14: ['fourteenth', '14th', 'forteenth'],
      15: ['fifteenth', '15th', 'fifteent'],
      16: ['sixteenth', '16th'],
      17: ['seventeenth', '17th'],
      18: ['eighteenth', '18th'],
      19: ['nineteenth', '19th'],
      20: ['twentieth', '20th', 'twentiet'],
    };
    if (ords[n]) add(...ords[n]);
  }

  // denser coverage 1-150: include hyphen/space flips only once already
  // sparse 151-176: keep transforms lighter by filtering length
  let v = uniq(parts);
  if (n > 150) {
    v = v.filter((x) => x === String(n) || x === spoken || x === spoken.replace(/ /g, '-') || /hundred/.test(x) || x.length <= spoken.length + 4).slice(0, 12);
  }
  return v;
}

// ── Books: hand-curated ASR mishearings + transforms ─────────────────────────
const BOOK_CORE = {
  Genesis: [
    'genesis', 'genisis', 'jenesis', 'genesys', 'genesus', 'genesis', 'jenisis',
    'genesi', 'geneses', 'genesez', 'dzenesis', 'genesis book', 'the genesis',
    'genesis', 'gen', 'jennesis', 'ghenesis', 'kenesis', 'genesis',
  ],
  Exodus: [
    'exodus', 'eksodus', 'exodos', 'exodous', 'exodis', 'exodis', 'eggs odus',
    'ex odus', 'eksodas', 'exodas', 'axodus', 'exodus', 'exo', 'eksodo',
  ],
  Leviticus: [
    'leviticus', 'leviticas', 'levitikus', 'leviticos', 'leviticus', 'leviticous',
    'live iticus', 'levi ticus', 'levitikus', 'leviticas', 'levitikus',
    'levitic', 'levitikus', 'la viticus', 'levitikus',
  ],
  Numbers: [
    'numbers', 'numbas', 'num bers', 'numbres', 'nambers', 'numbers', 'numba',
    'numers', 'numb as', 'numbus',
  ],
  Deuteronomy: [
    'deuteronomy', 'deuteronomi', 'dutronomy', 'deutronomy', 'deuteronomi',
    'dooteronomy', 'deuteronomy', 'duty ronomy', 'deutero nomy', 'deuteronomi',
    'jewteronomy', 'deuteronomi', 'deuteronomy', 'deu teronomy', 'deuteronomi',
  ],
  Joshua: [
    'joshua', 'joshwa', 'joshuah', 'joshua', 'joshua', 'josh ua', 'yoshua',
    'joshwa', 'joshua', 'joshia', 'joshuah',
  ],
  Judges: [
    'judges', 'judgez', 'judges', 'jujes', 'judjis', 'judges', 'judge is',
    'judgis', 'jajis', 'judges',
  ],
  Ruth: [
    'ruth', 'root', 'rut', 'rooth', 'ruth', 'rute', 'wuth', 'ruth',
  ],
  '1 Samuel': [
    'first samuel', '1st samuel', 'one samuel', 'first sam uel', 'first samuel',
    'first samwell', 'first samwel', 'first samuel', 'first samule',
    'furst samuel', 'first samuel', '1 samuel', 'first sam', 'first samuel',
    'first samuel', 'wan samuel', 'first samuel',
  ],
  '2 Samuel': [
    'second samuel', '2nd samuel', 'two samuel', 'second sam uel', 'second samwell',
    'second samwel', 'second samule', 'secon samuel', '2 samuel', 'second sam',
    'to samuel', 'too samuel', 'second samuel',
  ],
  '1 Kings': [
    'first kings', '1st kings', 'one kings', 'first king', 'furst kings',
    'first kinks', 'first kings', '1 kings', 'first king\'s', 'wan kings',
    'first kins', 'first kings',
  ],
  '2 Kings': [
    'second kings', '2nd kings', 'two kings', 'second king', 'secon kings',
    'second kinks', '2 kings', 'to kings', 'too kings', 'second kins',
  ],
  '1 Chronicles': [
    'first chronicles', '1st chronicles', 'one chronicles', 'first chronicle',
    'first cronacles', 'first chronicals', 'first chronikles', 'first chronicles',
    'first chronicals', '1 chronicles', 'first chronicals', 'first cronikles',
    'furst chronicles', 'first chronicles',
  ],
  '2 Chronicles': [
    'second chronicles', '2nd chronicles', 'two chronicles', 'second chronicle',
    'second cronacles', 'second chronicals', 'second chronikles', '2 chronicles',
    'to chronicles', 'second chronicals',
  ],
  Ezra: [
    'ezra', 'esra', 'ezrah', 'isra', 'ezra', 'esrah', 'ezdra', 'ezra',
    'asra', 'ezra',
  ],
  Nehemiah: [
    'nehemiah', 'nehemia', 'nehemya', 'nihemiah', 'nehemiah', 'knee hemiah',
    'nehemaya', 'nehe mia', 'nehemiah', 'nihemya', 'nehemia',
  ],
  Esther: [
    'esther', 'ester', 'esta', 'esther', 'aster', 'eshtar', 'ester', 'esta',
    'hester', 'esther',
  ],
  Job: [
    'job', 'jobe', 'jobs', 'jop', 'job', 'jawb', 'jorb', 'job',
  ],
  Psalms: [
    'psalms', 'psalm', 'sams', 'salms', 'psalms', 'saams', 'psalm\'s',
    'psoms', 'salms', 'psalms', 'sam\'s', 'psalm', 'psarms', 'salms',
  ],
  Proverbs: [
    'proverbs', 'proverb', 'proverbs', 'pro verbs', 'proverbes', 'provabs',
    'proverbs', 'proverbs', 'proverbs', 'proberbs', 'proverbs',
  ],
  Ecclesiastes: [
    'ecclesiastes', 'ecclesiastes', 'ecclesiastes', 'eklesiastes', 'ecclesiastes',
    'ecclesiastes', 'eclesiastes', 'eccles iastes', 'ecclesiastes', 'ecclesiasti',
    'ecclesiastes', 'eklesiastis', 'ecclesiastes',
  ],
  'Song of Solomon': [
    'song of solomon', 'song of songs', 'songs of solomon', 'song of solo mon',
    'song of soloman', 'song of salomon', 'song of solomon', 'songs',
    'song solomon', 'song of solomun', 'canticles', 'song of songs',
    'song of solomon', 'songa solomon',
  ],
  Isaiah: [
    'isaiah', 'isaih', 'izaiah', 'isaia', 'eye saiah', 'isaiah', 'isaya',
    'isaiah', 'isaiyah', 'aizaya', 'isaiah', 'isaja', 'isaiah',
  ],
  Jeremiah: [
    'jeremiah', 'jeremia', 'jeremy ah', 'jeremiya', 'jeremy',
    'jerimiah', 'jermiah', 'jeremaya', 'jeremyah', 'djeremiah',
    'jaymiah', 'jayemiah',
  ],
  Lamentations: [
    'lamentations', 'lamentation', 'lamentations', 'lamen tations', 'lamentashuns',
    'lamentations', 'lamentacions', 'lamentations',
  ],
  Ezekiel: [
    'ezekiel', 'ezekial', 'ezekyel', 'eze kiel', 'ezekiel', 'ezikiel',
    'ezekiel', 'ezekial', 'izekiel', 'ezekiel', 'ezekel',
  ],
  Daniel: [
    'daniel', 'danial', 'daniyel', 'daniel', 'dan yel', 'danyel', 'daniel',
    'daniil', 'daniel',
  ],
  Hosea: [
    'hosea', 'hosia', 'hoseah', 'ho sea', 'hosea', 'osea', 'hosea', 'hoseya',
  ],
  Joel: [
    'joel', 'jo el', 'jole', 'joel', 'joal', 'jewel', 'joel', 'joil',
  ],
  Amos: [
    'amos', 'amos', 'eimos', 'amos', 'amos', 'aimos', 'amos',
  ],
  Obadiah: [
    'obadiah', 'obadia', 'obadya', 'o badiah', 'obadiah', 'obadaya',
    'obadiah', 'ubadiah',
  ],
  Jonah: [
    'jonah', 'jonna', 'jona', 'jonah', 'joner', 'jonah', 'yona', 'jonah',
  ],
  Micah: [
    'micah', 'mica', 'my car', 'my ca', 'mica', 'mikah', 'micah', 'mykah',
    'mike ah', 'mica', 'mika', 'my car',
  ],
  Nahum: [
    'nahum', 'nahom', 'na hum', 'nahum', 'nayhum', 'nahum', 'naum',
  ],
  Habakkuk: [
    'habakkuk', 'habakuk', 'habakkuk', 'habak kuk', 'habakkuk', 'habacuc',
    'habakkuk', 'habakook', 'abakkuk', 'habakkuk',
  ],
  Zephaniah: [
    'zephaniah', 'zephania', 'zefaniah', 'zephaniah', 'sefaniah', 'zephanya',
    'zephaniah', 'zephania', 'sefanya',
  ],
  Haggai: [
    'haggai', 'hagai', 'hag gay', 'haggai', 'hagayi', 'haggai', 'agayi',
    'haggai', 'hagye',
  ],
  Zechariah: [
    'zechariah', 'zecharia', 'zekariah', 'zechariah', 'sechariah', 'zecharya',
    'zechariah', 'zachariah', 'zecharia', 'zekarya',
  ],
  Malachi: [
    'malachi', 'malaki', 'malachy', 'malachi', 'malakai', 'malachi',
    'malaki', 'malachi',
  ],
  Matthew: [
    'matthew', 'mathew', 'mathiew', 'matthew', 'matthu', 'mathew', 'matthew',
    'matyu', 'matthew', 'mathew', 'matthu', 'mathu',
  ],
  Mark: [
    'mark', 'marc', 'march', 'mac', 'mark', 'marg', 'marq', 'mark',
    'mak', 'marc', 'march',
  ],
  Luke: [
    'luke', 'look', 'luc', 'luk', 'luke', 'look', 'luk', 'luuk',
    'luke', 'look',
  ],
  John: [
    'john', 'jon', 'jahn', 'john', 'jaan', 'jon', 'john', 'jawn',
    // note: "jon" collides with Jonah — matcher disambiguates via numbers
  ],
  Acts: [
    'acts', 'act', 'axe', 'aks', 'acts', 'ax', 'acts', 'akt', 'acks',
  ],
  Romans: [
    'romans', 'roman', 'romans', 'romens', 'romans', 'ro mans', 'romans',
    'romanz', 'romans',
  ],
  '1 Corinthians': [
    'first corinthians', '1st corinthians', 'one corinthians', 'first corinthian',
    'first corintians', 'first corinthians', 'first corinthians', '1 corinthians',
    'furst corinthians', 'first corintians', 'first corinthians',
    'first corinthians', 'first korinthians',
  ],
  '2 Corinthians': [
    'second corinthians', '2nd corinthians', 'two corinthians', 'second corinthian',
    'second corintians', '2 corinthians', 'to corinthians', 'second korinthians',
    'secon corinthians',
  ],
  Galatians: [
    'galatians', 'galatian', 'galatians', 'galashuns', 'galatians', 'galations',
    'galatians', 'galashians',
  ],
  Ephesians: [
    'ephesians', 'ephesian', 'ephesians', 'efesians', 'ephesians', 'epheshuns',
    'ephesians', 'efezhans', 'ephesians',
  ],
  Philippians: [
    'philippians', 'philippian', 'philippians', 'filippians', 'philippians',
    'philipians', 'philippians', 'filipians', 'philip peans',
  ],
  Colossians: [
    'colossians', 'colossian', 'kolossians', 'colosians', 'kolosians',
    'colossyans', 'colosseans',
    'collisions', 'collision', 'collosions', 'collosion',
    'collusion', 'collusions', 'collotions', 'collotion',
    'collations', 'collation', 'coalition', 'coalitions',
  ],
  '1 Thessalonians': [
    'first thessalonians', '1st thessalonians', 'one thessalonians',
    'first thessalonian', 'first thesalonians', 'first thessalonians',
    '1 thessalonians', 'furst thessalonians', 'first tesalonians',
    'first thessalonians',
  ],
  '2 Thessalonians': [
    'second thessalonians', '2nd thessalonians', 'two thessalonians',
    'second thessalonian', 'second thesalonians', '2 thessalonians',
    'to thessalonians', 'second tesalonians',
  ],
  '1 Timothy': [
    'first timothy', '1st timothy', 'one timothy', 'first timothy',
    'first timothy', '1 timothy', 'furst timothy', 'first timoti',
    'first timothy', 'first tim',
  ],
  '2 Timothy': [
    'second timothy', '2nd timothy', 'two timothy', 'second timothy',
    '2 timothy', 'to timothy', 'second timoti', 'second tim',
  ],
  Titus: [
    'titus', 'titas', 'titus', 'taitus', 'titus', 'tytus', 'titus',
  ],
  Philemon: [
    'philemon', 'filemon', 'philemon', 'filimon', 'philemon', 'philemon',
    'filemon', 'philemon',
  ],
  Hebrews: [
    'hebrews', 'hebrew', 'hebrews', 'he brues', 'hebrews', 'hebrus',
    'hebrews', 'eebrews', 'hebrews',
  ],
  James: [
    'james', 'jame', 'james', 'jaims', 'james', 'jems', 'james', 'jayms',
  ],
  '1 Peter': [
    'first peter', '1st peter', 'one peter', 'first pita', 'first peter',
    '1 peter', 'furst peter', 'first peeter', 'first peter',
  ],
  '2 Peter': [
    'second peter', '2nd peter', 'two peter', 'second pita', '2 peter',
    'to peter', 'second peeter', 'second peter',
  ],
  '1 John': [
    'first john', '1st john', 'one john', 'first jon', '1 john',
    'furst john', 'first john', 'wan john',
  ],
  '2 John': [
    'second john', '2nd john', 'two john', 'second jon', '2 john',
    'to john', 'too john', 'second john',
  ],
  '3 John': [
    'third john', '3rd john', 'three john', 'third jon', '3 john',
    'turd john', 'tree john', 'third john',
  ],
  Jude: [
    'jude', 'jud', 'jude', 'jood', 'jude', 'jewd', 'jude',
  ],
  Revelation: [
    'revelation', 'revelations', 'revelation', 'revelashun', 'revelation',
    'revelacion', 'revelation', 'revelation s', 'revelations',
  ],
};

function expandBook(canonical, seeds) {
  const out = [...seeds];
  for (const s of seeds) {
    out.push(...phoneticTransforms(s));
  }
  // first/second/third digit forms
  if (/^[123] /.test(canonical) || /^(1|2|3) /.test(canonical)) {
    // already covered
  }
  return uniq(out).filter((v) => v !== canonical.toLowerCase() || seeds.includes(v));
}

// Keep correct lowercase name as first alias for matching convenience — user asked
// for MISHEARINGS not correct spellings, so strip exact canonical when identical
function bookVariants(canonical, seeds) {
  const canon = canonical.toLowerCase();
  const all = expandBook(canonical, seeds);
  // Prefer mishearings; still keep common spoken forms that differ from print name
  // e.g. "song of songs", "first kings", "revelations"
  return uniq(all.filter((v) => {
    if (v === canon) return false; // exact correct spelling excluded per rules
    return true;
  }));
}

const books = {};
for (const [name, seeds] of Object.entries(BOOK_CORE)) {
  books[name] = bookVariants(name, seeds);
}

// Abbreviation-style spoken forms often said aloud
const EXTRA_BOOK = {
  Genesis: ['gen', 'jen'],
  Exodus: ['exo', 'ex'],
  Leviticus: ['lev', 'levit'],
  Numbers: ['num', 'numb'],
  Deuteronomy: ['deut', 'deu', 'duty'],
  Joshua: ['josh'],
  Judges: ['judg'],
  '1 Samuel': ['first sam', '1 sam', '1st sam'],
  '2 Samuel': ['second sam', '2 sam', '2nd sam'],
  '1 Kings': ['first ki', '1 ki', '1st kings'],
  '2 Kings': ['second ki', '2 ki'],
  '1 Chronicles': ['first chron', '1 chron', 'first chr'],
  '2 Chronicles': ['second chron', '2 chron'],
  Nehemiah: ['neh', 'nehem'],
  Esther: ['esth'],
  Psalms: ['ps', 'psa'],
  Proverbs: ['prov', 'pro'],
  Ecclesiastes: ['eccl', 'ecc'],
  'Song of Solomon': ['sos', 'song of songs', 'canticles'],
  Isaiah: ['isa', 'iza'],
  Jeremiah: ['jer', 'jeremy'],
  Lamentations: ['lam', 'lament'],
  Ezekiel: ['ezek', 'eze'],
  Daniel: ['dan'],
  Hosea: ['hos'],
  Obadiah: ['obad'],
  Micah: ['mic', 'my car', 'my ca'],
  Nahum: ['nah'],
  Habakkuk: ['hab', 'habak'],
  Zephaniah: ['zeph', 'sef'],
  Haggai: ['hag'],
  Zechariah: ['zech', 'zach'],
  Malachi: ['mal', 'malak'],
  Matthew: ['matt', 'mat'],
  Mark: ['mrk', 'marc', 'march', 'mac'],
  Luke: ['luk', 'luc', 'look'],
  John: ['jn', 'joh'],
  Acts: ['act', 'axe', 'aks'],
  Romans: ['rom'],
  '1 Corinthians': ['first cor', '1 cor', '1st corinthians'],
  '2 Corinthians': ['second cor', '2 cor'],
  Galatians: ['gal'],
  Ephesians: ['eph', 'ef'],
  Philippians: ['phil', 'fil'],
  Colossians: ['col', 'kol'],
  '1 Thessalonians': ['first thess', '1 thess'],
  '2 Thessalonians': ['second thess', '2 thess'],
  '1 Timothy': ['first tim', '1 tim'],
  '2 Timothy': ['second tim', '2 tim'],
  Titus: ['tit'],
  Philemon: ['philem', 'filemon'],
  Hebrews: ['heb'],
  James: ['jas', 'jam'],
  '1 Peter': ['first pet', '1 pet', '1st peter'],
  '2 Peter': ['second pet', '2 pet'],
  '1 John': ['first john', '1 john', '1st john'],
  '2 John': ['second john', '2 john'],
  '3 John': ['third john', '3 john'],
  Jude: ['jud'],
  Revelation: ['rev', 'revelations', 'apoc'],
};

for (const [name, extra] of Object.entries(EXTRA_BOOK)) {
  books[name] = uniq([...(books[name] || []), ...extra, ...extra.flatMap(phoneticTransforms)]);
}

// ── Trigger words ────────────────────────────────────────────────────────────
const triggerWords = {
  OCS: uniq([
    // letter-name spoken: "oh see ess"
    'ocs', 'o c s', 'oh see ess', 'oh c s', 'o see ess', 'oh si es',
    'oh see es', 'o.c.s', 'o c ess', 'oh seas', 'oh sees', 'oh cease',
    'oh sis', 'oasis', 'ocean', 'osiris', 'obvious', 'oh see us',
    'o s c', 'osc', 'ohsc', 'oaks', 'okes', 'oh case', 'okay ess',
    'oh yes', 'oh sis', 'oc s', 'o see s', 'oh c ess', 'aucs',
    'ohks', 'ohks', 'oakes', 'oaksy', 'okays', 'oh seize',
    // Pidgin / WA reductions
    'o c', 'oh si', 'oh see',
  ]),
  Media: uniq([
    'media', 'meedia', 'me dia', 'meedya', 'midia', 'meedia',
    'meter', 'medium', 'median', 'me the', 'need a', 'meet a',
    'meeting', 'meeter', 'meeda', 'miidia', 'meedia', 'mee dia',
    'video', 'meedio', 'meedio', 'medir', 'meeja', 'mee jah',
    'mee dia', 'me de a', 'me dea', 'meed ier',
  ]),
};

// ── Numbers ──────────────────────────────────────────────────────────────────
const numbers = {};
for (let n = 1; n <= 176; n++) {
  numbers[String(n)] = numberVariants(n);
}

// ── Commands ─────────────────────────────────────────────────────────────────
function cmdVariants(phrases) {
  const out = [];
  for (const p of phrases) {
    out.push(p);
    out.push(...phoneticTransforms(p));
    // word-level th / verse / screen swaps
    out.push(p.replace(/verse/g, 'vers'));
    out.push(p.replace(/verse/g, 'first'));
    out.push(p.replace(/verse/g, 'voice'));
    out.push(p.replace(/verse/g, 'worse'));
    out.push(p.replace(/verse/g, 'virs'));
    out.push(p.replace(/verse/g, 'vas'));
    out.push(p.replace(/screen/g, 'scream'));
    out.push(p.replace(/screen/g, 'skreen'));
    out.push(p.replace(/screen/g, 'screen'));
    out.push(p.replace(/timer/g, 'time are'));
    out.push(p.replace(/timer/g, 'timah'));
    out.push(p.replace(/timer/g, 'timer'));
    out.push(p.replace(/timer/g, 'tima'));
    out.push(p.replace(/highlight/g, 'high light'));
    out.push(p.replace(/highlight/g, 'hi light'));
    out.push(p.replace(/highlight/g, 'highlight'));
    out.push(p.replace(/next/g, 'nex'));
    out.push(p.replace(/next/g, 'necked'));
    out.push(p.replace(/next/g, 'nest'));
    out.push(p.replace(/previous/g, 'previus'));
    out.push(p.replace(/previous/g, 'priveous'));
    out.push(p.replace(/previous/g, 'previous'));
    out.push(p.replace(/black/g, 'blok'));
    out.push(p.replace(/black/g, 'blak'));
    out.push(p.replace(/pause/g, 'paws'));
    out.push(p.replace(/pause/g, 'pores'));
    out.push(p.replace(/reset/g, 're set'));
    out.push(p.replace(/reset/g, 'recet'));
  }
  return uniq(out);
}

const commands = {
  next_verse: cmdVariants([
    'next verse', 'next', 'nex verse', 'neck verse', 'next vers', 'nex vers',
    'go next', 'go to next', 'next please', 'next first', 'next voice',
    'next worse', 'nest verse', 'next vas',
  ]),
  previous_verse: cmdVariants([
    'previous verse', 'go back', 'prev verse', 'previous vers', 'go bag',
    'go bak', 'previous', 'previous please', 'go back verse', 'priveous verse',
    'previous voice', 'go back please',
  ]),
  first_verse: cmdVariants([
    'first verse', 'chapter start', 'start of chapter', 'start of the chapter',
    'furst verse', 'fist verse', 'first vers', 'fust verse',
  ]),
  last_verse: cmdVariants([
    'last verse', 'end of chapter', 'end of the chapter', 'last vers',
    'lost verse', 'last voice', 'las verse',
  ]),
  highlight_word: uniq([
    'highlight {word}', 'high light {word}', 'hi light {word}',
    'mark the word {word}', 'mark {word}', 'mark word {word}',
    'highlight the word {word}', 'high light the word {word}',
    'mark de word {word}', 'mark di word {word}',
    'highlight de {word}', 'highlite {word}', 'hilight {word}',
  ]),
  clear_highlights: cmdVariants([
    'clear highlights', 'remove marks', 'clear marks', 'remove highlights',
    'unmark all', 'reset highlights', 'clear highlight', 'remove mark',
    'clear all highlights', 'clear de highlights',
  ]),
  black_screen: cmdVariants([
    'black screen', 'blank screen', 'blanche screen', 'blunk screen', 'click screen', 'clear screen', 'screen off', 'black scream',
    'blank scream', 'blanche scream', 'blunk scream', 'click scream', 'clear scream', 'screen of', 'blok screen', 'black skreen',
    'blacked screen', 'go black', 'go blank',
  ]),
  screen_on: cmdVariants([
    'screen on', 'show screen', 'scream on', 'shown screen',
    'screen on please', 'skreen on', 'show de screen',
  ]),
  set_timer: cmdVariants([
    'set timer', 'said timer', 'set time are', 'set tima',
    'set the timer', 'set de timer', 'sat timer',
  ]),
  start_timer: cmdVariants([
    'start timer', 'start the timer', 'start de timer', 'stat timer',
    'start tima', 'start time are',
  ]),
  pause_timer: cmdVariants([
    'pause timer', 'paws timer', 'pause the timer', 'pores timer',
    'pause tima', 'hold timer',
  ]),
  stop_timer: cmdVariants([
    'stop timer', 'stopped timer', 'stop time are', 'stop the timer',
    'stop de timer', 'stop tima', 'end timer', 'cancel timer',
  ]),
  reset_timer: cmdVariants([
    'reset timer', 're set timer', 'reset the timer', 'recet timer',
    'reset tima', 'restart timer',
  ]),
};

const result = { books, triggerWords, numbers, commands };

const fs = require('fs');
const path = require('path');
const outPath = path.join(__dirname, '..', 'src', 'App', 'controller', 'data', 'phoneticAliases.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log('Wrote', outPath);
console.log('books', Object.keys(books).length);
console.log('numbers', Object.keys(numbers).length);
console.log('sample Mark', books.Mark.slice(0, 15));
console.log('sample OCS', triggerWords.OCS.slice(0, 20));
console.log('bytes', fs.statSync(outPath).size);
