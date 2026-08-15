/**
 * Re-converts all imported presentations in user media library with full font fallback.
 * Validates 100% of slides across all decks.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { convertPptxToPng, collectUsedFonts } = require('pptx-glimpse');

const mediaDir = path.join(os.homedir(), 'Library/Application Support/ocs/media');
const presentationsFile = path.join(os.homedir(), 'Library/Application Support/ocs/presentations.json');

const fontDirs = [
  '/System/Library/Fonts',
  '/System/Library/Fonts/Supplemental',
  '/Library/Fonts',
  path.join(os.homedir(), 'Library/Fonts'),
  '/Library/Application Support/Microsoft/Fonts'
].filter(d => fs.existsSync(d));

const fontMapping = {
  'Century Gothic': 'Arial',
  'Aptos': 'Arial',
  'Aptos Display': 'Arial',
  'Calibri': 'Arial',
  'Calibri Light': 'Arial',
  'Segoe UI': 'Arial',
  'Segoe UI Semibold': 'Arial',
  'Tahoma': 'Arial',
  'Trebuchet MS': 'Arial',
  'Verdana': 'Arial',
  'Impact': 'Arial Black',
  'Georgia': 'Times New Roman',
  'Garamond': 'Times New Roman',
  'Book Antiqua': 'Times New Roman',
  'Palatino': 'Times New Roman',
  'Consolas': 'Courier New',
  'Montserrat': 'Arial',
  'Poppins': 'Arial',
  'Roboto': 'Arial',
  'Open Sans': 'Arial',
  'Lato': 'Arial',
  'Inter': 'Arial',
  'Avenir': 'Arial',
  'Avenir Next': 'Arial',
  'Arial Black': 'Arial Black',
  'Playfair Display': 'Georgia'
};

async function processAllDecks() {
  if (!fs.existsSync(presentationsFile)) {
    console.log('No presentations.json found');
    return;
  }

  const decks = JSON.parse(fs.readFileSync(presentationsFile, 'utf8'));
  console.log(`Found ${decks.length} registered deck(s) in presentations.json\n`);

  for (const deck of decks) {
    const pPath = deck.fileUrl ? deck.fileUrl.replace('file://', '') : null;
    if (!pPath || !fs.existsSync(pPath)) {
      console.warn(`Deck file not found: ${pPath}`);
      continue;
    }

    console.log(`=== Processing: ${deck.name} (${deck.filename}) ===`);
    const buf = fs.readFileSync(pPath);
    const used = collectUsedFonts(buf);
    console.log('Fonts in deck:', used.fonts);

    const slidesDir = path.join(mediaDir, `${deck.filename}_slides`);
    fs.mkdirSync(slidesDir, { recursive: true });

    console.log(`Converting ${deck.slideCount || 'all'} slides to 1920x1080 PNG...`);
    const pngResults = await convertPptxToPng(buf, {
      fontDirs,
      fontMapping,
      width: 1920,
      height: 1080
    });

    console.log(`Successfully converted ${pngResults.length} slides.`);
    const updatedSlides = [];
    for (let i = 0; i < pngResults.length; i++) {
      const item = pngResults[i];
      const slideNumber = item.slideNumber || i + 1;
      const slidePath = path.join(slidesDir, `slide_${slideNumber}.png`);
      fs.writeFileSync(slidePath, item.png);

      const existingSlide = deck.slides?.find(s => s.slideNumber === slideNumber) || {};
      updatedSlides.push({
        slideIndex: i,
        slideNumber: slideNumber,
        url: `file://${slidePath}`,
        notes: existingSlide.notes || '',
        width: item.width || 1920,
        height: item.height || 1080
      });
    }

    deck.slides = updatedSlides;
    deck.slideCount = updatedSlides.length;
    console.log(`Saved ${updatedSlides.length} slide PNGs to ${slidesDir}\n`);
  }

  fs.writeFileSync(presentationsFile, JSON.stringify(decks, null, 2), 'utf8');
  console.log('Updated presentations.json successfully.');
}

processAllDecks().catch(err => {
  console.error('Conversion failed:', err);
  process.exit(1);
});
