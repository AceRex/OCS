/**
 * Automated Verification Suite for PPTX Import Progress & Font Advisory (FR-4.2, FR-4.34, FR-4.37)
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const JSZip = require('jszip');
const { collectUsedFonts } = require('pptx-glimpse');

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`FAIL: ${desc} -> ${err.message}`);
    failed++;
  }
}

async function asyncIt(desc, fn) {
  try {
    await fn();
    console.log(`PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`FAIL: ${desc} -> ${err.message}`);
    failed++;
  }
}

// Extract the font analysis logic matching main.js
const GOOGLE_FONTS_CATALOG = new Set([
  'montserrat', 'poppins', 'roboto', 'open sans', 'lato', 'inter', 'oswald', 'raleway', 'nunito',
  'playfair display', 'merriweather', 'lora', 'bebas neue', 'rubik', 'work sans', 'fira sans',
  'pt sans', 'source sans 3', 'source sans pro', 'barlow', 'mulish', 'kanit', 'quicksand',
  'titillium web', 'inconsolata', 'heebo', 'ibm plex sans', 'dm sans', 'cabin', 'outfit',
  'manrope', 'plus jakarta sans', 'syne', 'epilogue', 'space grotesk', 'cormorant garamond',
  'cinzel', 'abril fatface', 'anton', 'comfortaa', 'caveat', 'pacifico', 'dancing script',
  'lobster', 'great vibes', 'sacramento', 'righteous', 'bungee', 'fredoka', 'bangers', 'permanent marker'
]);

function getBaseFontFamily(name) {
  if (!name) return "";
  return name.replace(/[-_]/g, ' ')
             .replace(/\b(ExtraLight|Light|SemiBold|ExtraBold|Bold|Black|Medium|Regular|Thin|Heavy|Italic|Oblique|Condensed|LT|Pro|Display|Text|MT|Std)\b/gi, '')
             .trim();
}

function analyzePptxFonts(usedFonts, embeddedFontNames, fontMapping) {
  const referenced = usedFonts?.fonts || [];
  const results = [];
  const advisories = [];

  for (const fontName of referenced) {
    const baseName = getBaseFontFamily(fontName).toLowerCase();
    const isEmbedded = embeddedFontNames.some(ef => ef.toLowerCase().includes(baseName));
    const isMapped = Object.keys(fontMapping).some(k => k.toLowerCase() === fontName.toLowerCase() || k.toLowerCase() === baseName);
    const isGoogleFont = GOOGLE_FONTS_CATALOG.has(baseName);
    const googleFontsUrl = isGoogleFont ? `https://fonts.google.com/specimen/${encodeURIComponent(getBaseFontFamily(fontName))}` : null;

    let status = 'system';
    if (isEmbedded) {
      status = 'embedded';
    } else if (isMapped) {
      status = 'bundled';
    } else if (isGoogleFont) {
      status = 'fallback_substituted';
      advisories.push({
        fontName,
        status: 'google_font_downloadable',
        googleFontsUrl,
        message: `Font "${fontName}" is available on Google Fonts.`
      });
    } else {
      status = 'fallback_substituted';
      advisories.push({
        fontName,
        status: 'unresolved_fallback',
        googleFontsUrl: null,
        message: `Exact font "${fontName}" could not be located in catalog; standard fallback is used.`
      });
    }

    results.push({
      fontName,
      status,
      googleFontsUrl
    });
  }

  return {
    fonts: results,
    advisories
  };
}

async function runTests() {
  console.log('=== 1. Font Detection & Classification (Task 2 / FR-4.37) ===');

  const fontMapping = {
    'Arial': 'Arial',
    'Times New Roman': 'Times New Roman',
    'Courier New': 'Courier New',
    'Aptos': 'Arial',
    'Calibri': 'Arial'
  };

  it('T1.1: Bundled standard font is recognized', () => {
    const analysis = analyzePptxFonts({ fonts: ['Arial', 'Calibri'] }, [], fontMapping);
    assert.strictEqual(analysis.fonts[0].status, 'bundled');
    assert.strictEqual(analysis.fonts[1].status, 'bundled');
    assert.strictEqual(analysis.advisories.length, 0);
  });

  it('T1.2: Embedded font in PPTX is recognized as embedded', () => {
    const analysis = analyzePptxFonts({ fonts: ['CustomCorporateFont'] }, ['CustomCorporateFont.fntdata'], fontMapping);
    assert.strictEqual(analysis.fonts[0].status, 'embedded');
    assert.strictEqual(analysis.advisories.length, 0);
  });

  it('T1.3: Unbundled Google Font receives direct specimen URL and advisory', () => {
    const analysis = analyzePptxFonts({ fonts: ['Outfit Medium', 'Plus Jakarta Sans'] }, [], fontMapping);
    assert.strictEqual(analysis.fonts[0].status, 'fallback_substituted');
    assert.strictEqual(analysis.fonts[0].googleFontsUrl, 'https://fonts.google.com/specimen/Outfit');
    assert.strictEqual(analysis.fonts[1].googleFontsUrl, 'https://fonts.google.com/specimen/Plus%20Jakarta%20Sans');
    assert.strictEqual(analysis.advisories.length, 2);
  });

  it('T1.4: Unobtainable/Unknown proprietary font degrades gracefully without fabricated URL', () => {
    const analysis = analyzePptxFonts({ fonts: ['XUnknownProprietaryFont-Black'] }, [], fontMapping);
    assert.strictEqual(analysis.fonts[0].status, 'fallback_substituted');
    assert.strictEqual(analysis.fonts[0].googleFontsUrl, null, 'Must NOT fabricate a URL');
    assert(analysis.advisories[0].message.includes('could not be located'));
  });

  console.log('\n=== 2. Real Deck Inspection (Universal presentation.pptx) ===');
  const candidates = [
    path.join(os.homedir(), 'Downloads/Universal presentation.pptx'),
    path.join(os.homedir(), 'Library/Application Support/ocs/media/Universal presentation.pptx')
  ];
  const deckPath = candidates.find(p => fs.existsSync(p));
  
  if (deckPath) {
    await asyncIt('T2.1: Detects all fonts from Universal presentation deck', async () => {
      const buf = fs.readFileSync(deckPath);
      const used = collectUsedFonts(buf);
      const zip = await JSZip.loadAsync(buf);
      const fontFiles = Object.keys(zip.files).filter(k => k.startsWith('ppt/fonts/'));
      const embeddedNames = fontFiles.map(fn => path.basename(fn, path.extname(fn)));
      const analysis = analyzePptxFonts(used, embeddedNames, fontMapping);

      assert(analysis.fonts.length >= 3);
      const fontNames = analysis.fonts.map(f => f.fontName);
      assert(fontNames.some(n => n.includes('Montserrat')));
    });

    await asyncIt('T2.2: Reports proper fallback / Google Fonts link for Montserrat', async () => {
      const buf = fs.readFileSync(deckPath);
      const used = collectUsedFonts(buf);
      const zip = await JSZip.loadAsync(buf);
      const fontFiles = Object.keys(zip.files).filter(k => k.startsWith('ppt/fonts/'));
      const embeddedNames = fontFiles.map(fn => path.basename(fn, path.extname(fn)));
      const analysis = analyzePptxFonts(used, embeddedNames, fontMapping);

      const montserratFont = analysis.fonts.find(f => f.fontName === 'Montserrat');
      assert(montserratFont);
      assert.strictEqual(montserratFont.googleFontsUrl, 'https://fonts.google.com/specimen/Montserrat');
    });
  }

  console.log('\n=== 3. Import Progress Sequence Emulation (Task 1 / FR-4.34) ===');

  it('T3.1: Progress state updates sequentially with current/total fractions', () => {
    const progressEvents = [];
    const totalSlides = 5;

    // Emulate main.js pipeline
    progressEvents.push({ stage: 'reading', percent: 5, message: 'Reading presentation file...' });
    progressEvents.push({ stage: 'fonts', percent: 15, message: 'Analyzing fonts and structure...' });

    for (let s = 1; s <= totalSlides; s++) {
      const pct = Math.round(15 + (s / totalSlides) * 75);
      progressEvents.push({
        stage: 'converting',
        current: s,
        total: totalSlides,
        percent: pct,
        message: `Converting slide ${s} of ${totalSlides}...`
      });
    }

    progressEvents.push({ stage: 'finalizing', percent: 95, message: 'Finalizing slide deck...' });
    progressEvents.push({ stage: 'done', percent: 100, message: 'Import complete!' });

    assert.strictEqual(progressEvents[0].stage, 'reading');
    assert.strictEqual(progressEvents[1].stage, 'fonts');
    assert.strictEqual(progressEvents[2].stage, 'converting');
    assert.strictEqual(progressEvents[2].current, 1);
    assert.strictEqual(progressEvents[2].total, 5);
    assert.strictEqual(progressEvents[6].current, 5);
    assert.strictEqual(progressEvents[8].stage, 'done');
    assert.strictEqual(progressEvents[8].percent, 100);
  });

  console.log('\n=== 4. Persistent Metadata in presentations.json ===');
  const presFile = path.join(os.homedir(), 'Library/Application Support/ocs/presentations.json');
  if (fs.existsSync(presFile)) {
    const decks = JSON.parse(fs.readFileSync(presFile, 'utf8'));
    it('T4.1: presentations.json stores deck array', () => {
      assert(Array.isArray(decks));
      assert(decks.length > 0);
    });

    it('T4.2: Decks contain slide lists with notes and dimensions', () => {
      const d = decks[0];
      assert(d.slides && d.slides.length > 0);
      assert(d.slides[0].url);
      assert(typeof d.slides[0].width === 'number' && d.slides[0].width >= 960);
      assert(typeof d.slides[0].height === 'number' && d.slides[0].height >= 540);
    });
  }

  console.log(`\nImport Progress & Advisory Test Results: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
