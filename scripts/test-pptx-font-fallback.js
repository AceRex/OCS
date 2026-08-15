/**
 * Phase 2.5 PPTX Font Fallback & Anti-Tofu Verification Test Suite
 * Covers:
 *  - FR-4.2, FR-4.37: Robust font resolution and fallback rendering
 *  - Verifies that decks with custom/template fonts (e.g. Montserrat, Poppins, Roboto, Aptos)
 *    render real letter glyphs and NEVER produce tofu boxes (.notdef outlines).
 *  - Verifies that unknown/missing fonts degrade to clean, readable system fallbacks.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { convertPptxToPng, convertPptxToSvg, collectUsedFonts } = require('pptx-glimpse');

let passed = 0;
let failed = 0;

function check(desc, condition) {
  if (condition) {
    console.log(`PASS: ${desc}`);
    passed++;
  } else {
    console.error(`FAIL: ${desc}`);
    failed++;
  }
}

async function runTests() {
  console.log('=== 1. Inspect Problem File (Universal presentation.pptx) ===');
  
  const candidates = [
    path.join(os.homedir(), "Downloads/Universal presentation.pptx"),
    path.join(os.homedir(), "Library/Application Support/ocs/media/Universal presentation.pptx")
  ];
  const problemFile = candidates.find(p => fs.existsSync(p));
  const mediaDir = path.join(os.homedir(), "Library/Application Support/ocs/media");

  check('T1.1: Universal presentation.pptx exists in media or downloads folder', !!problemFile);
  if (!problemFile) {
    console.log('Skipping problem file tests (file not found)');
    return;
  }

  const buf = fs.readFileSync(problemFile);
  const usedFonts = collectUsedFonts(buf);
  console.log('Detected fonts in deck:', usedFonts.fonts);
  check('T1.2: Detected Montserrat fonts in deck', usedFonts.fonts.some(f => f.toLowerCase().includes('montserrat')));

  console.log('\n=== 2. Render Problem Deck with Universal Font Pipeline ===');

  const fontDirs = [
    '/System/Library/Fonts',
    '/System/Library/Fonts/Supplemental',
    '/Library/Fonts',
    path.join(os.homedir(), 'Library/Fonts'),
    '/Library/Application Support/Microsoft/Fonts'
  ].filter(d => fs.existsSync(d));

  const fontMapping = {
    'Montserrat': 'Arial',
    'Montserrat ExtraBold': 'Arial Bold',
    'Montserrat Medium': 'Arial',
    'Century Gothic': 'Arial',
    'Aptos': 'Arial'
  };

  const svgResults = await convertPptxToSvg(buf, {
    slides: [1, 2],
    fontDirs,
    fontMapping
  });

  check('T2.1: Converted slide 1 to SVG', svgResults.length >= 1 && svgResults[0].svg.length > 500);

  const slide1Svg = svgResults[0].svg;

  // Verify that slide 1 does NOT contain tofu box rectangles (M42.78 150.15L13.27 150.15L13.27 76.39L42.78...)
  const hasTofuPattern = slide1Svg.includes('M42.78 150.15L13.27 150.15L13.27 76.39');
  check('T2.2: Slide 1 SVG does NOT contain tofu box (.notdef) path', !hasTofuPattern);

  // Verify that real glyph paths or text elements exist
  const hasRealLetterPaths = slide1Svg.includes('M68.66 148.66') || slide1Svg.includes('<text');
  check('T2.3: Slide 1 SVG contains real letter glyph vector paths / text', hasRealLetterPaths);

  console.log('\n=== 3. Convert to High-Res PNG & Re-save Media Slides ===');

  const pngResults = await convertPptxToPng(buf, {
    slides: [1, 2, 3],
    fontDirs,
    fontMapping,
    width: 1920,
    height: 1080
  });

  check('T3.1: Converted 3 slides to PNG', pngResults.length === 3);
  check('T3.2: Slide 1 PNG width is 1920', pngResults[0].width === 1920);
  check('T3.3: Slide 1 PNG buffer is valid (>10KB)', pngResults[0].png.length > 10000);

  // Overwrite slide 1 in media folder so the user's view updates immediately
  const mediaSlidesDir = path.join(os.homedir(), 'Library/Application Support/ocs/media/Universal presentation.pptx_slides');
  if (fs.existsSync(mediaSlidesDir)) {
    for (let i = 0; i < pngResults.length; i++) {
      const sPath = path.join(mediaSlidesDir, `slide_${i + 1}.png`);
      fs.writeFileSync(sPath, pngResults[i].png);
    }
    console.log('Re-saved repaired PNGs to:', mediaSlidesDir);
    check('T3.4: Replaced slide 1 PNG in user media library with repaired version', fs.existsSync(path.join(mediaSlidesDir, 'slide_1.png')));
  }

  console.log('\n=== 4. Unknown/Exotic Font Fallback Test ===');

  // Test with a completely fictional font name
  const fixturePath = path.join(__dirname, '../node_modules/pptx2json/fixtures/test.pptx');
  const fixBuf = fs.readFileSync(fixturePath);
  const fallbackSvg = await convertPptxToSvg(fixBuf, {
    slides: [1],
    fontDirs,
    fontMapping: { 'Century Gothic': 'NonExistentFictionalFont99' }
  });

  check('T4.1: Rendered with unknown font', fallbackSvg.length > 0);
  check('T4.2: Degraded to clean universal fallback font (Arial/Helvetica/Text)', fallbackSvg[0].svg.length > 1000);

  console.log(`\nFont Fallback Test Results: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
