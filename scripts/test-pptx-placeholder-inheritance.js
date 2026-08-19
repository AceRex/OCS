/**
 * test-pptx-placeholder-inheritance.js — End-to-End Test for 3-Level OOXML Placeholder & Background Inheritance (FR-4.2)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const JSZip = require('jszip');
const { resolvePptxInheritance, extractPlaceholdersFromXml, findMatchingXfrm } = require('../src/App/utils/pptxInheritance');
const { convertPptxToPng, convertPptxToSvg } = require('pptx-glimpse');

let passed = 0;
let failed = 0;

function check(desc, cond) {
  if (cond) {
    console.log(`PASS: ${desc}`);
    passed++;
  } else {
    console.error(`FAIL: ${desc}`);
    failed++;
  }
}

async function runTests() {
  console.log('=== 1. Inspect & Resolve Real Deck (VICTORY OVER FEAR AND ANXIETY.pptx) ===');
  const victoryPath = path.join(os.homedir(), 'Downloads/VICTORY OVER FEAR AND ANXIETY.pptx');
  check('T1.1: File exists', fs.existsSync(victoryPath));

  const rawBuf = fs.readFileSync(victoryPath);
  const rawZip = await JSZip.loadAsync(rawBuf);

  // Check Slide 2 raw state
  const rawSlide2 = await rawZip.file('ppt/slides/slide2.xml').async('string');
  const rawSpMatches = rawSlide2.match(/<p:sp>[\s\S]*?<\/p:sp>/g) || [];
  const rawSpWithXfrm = rawSpMatches.filter(sp => sp.includes('<a:xfrm>'));
  check('T1.2: Raw Slide 2 has 2 placeholder shapes and 0 shape-level transforms', rawSpMatches.length === 2 && rawSpWithXfrm.length === 0);

  // Measure resolution timing
  const t0 = Date.now();
  const resolvedBuf = await resolvePptxInheritance(rawBuf);
  const resolveTime = Date.now() - t0;
  console.log(`Resolution completed in ${resolveTime}ms`);
  check('T1.3: Resolution overhead is under 200ms', resolveTime < 200);

  const patchedZip = await JSZip.loadAsync(resolvedBuf);
  const patchedSlide2 = await patchedZip.file('ppt/slides/slide2.xml').async('string');
  
  check('T1.4: Patched Slide 2 has injected title transform', patchedSlide2.includes('420791') && patchedSlide2.includes('1113510'));
  check('T1.5: Patched Slide 2 has injected body transform', patchedSlide2.includes('429417') && patchedSlide2.includes('2133600'));

  // Confirm slides 1 and 9-18 explicit transforms are preserved
  const rawSlide1 = await rawZip.file('ppt/slides/slide1.xml').async('string');
  const patchedSlide1 = await patchedZip.file('ppt/slides/slide1.xml').async('string');
  const rawSlide9 = await rawZip.file('ppt/slides/slide9.xml').async('string');
  const patchedSlide9 = await patchedZip.file('ppt/slides/slide9.xml').async('string');

  const s1XfrmRaw = rawSlide1.match(/<a:xfrm>[\s\S]*?<\/a:xfrm>/)?.[0];
  const s1XfrmPatched = patchedSlide1.match(/<a:xfrm>[\s\S]*?<\/a:xfrm>/)?.[0];
  check('T1.6: Slide 1 explicit transform is unchanged', s1XfrmRaw === s1XfrmPatched);

  const s9XfrmRaw = rawSlide9.match(/<a:xfrm>[\s\S]*?<\/a:xfrm>/)?.[0];
  const s9XfrmPatched = patchedSlide9.match(/<a:xfrm>[\s\S]*?<\/a:xfrm>/)?.[0];
  check('T1.7: Slide 9 explicit transform is unchanged', s9XfrmRaw === s9XfrmPatched);

  console.log('\n=== 2. Render Verification (Slide 2 Vector & Raster Output) ===');
  const svgs = await convertPptxToSvg(resolvedBuf, { slides: [2] });
  check('T2.1: Slide 2 SVG rendered', svgs && svgs.length === 1);
  check('T2.2: Slide 2 SVG contains full vector text paths (>5000 chars)', svgs[0].svg.length > 5000);

  const pngs = await convertPptxToPng(resolvedBuf, { slides: [2], width: 1920, height: 1080 });
  check('T2.3: Slide 2 PNG rendered', pngs && pngs.length === 1);
  check('T2.4: Slide 2 PNG buffer is non-trivial (>20KB)', pngs[0].png.length > 20000);

  console.log('\n=== 3. Regression Check Across Benchmark Decks ===');
  const univPath = path.join(os.homedir(), 'Downloads/Universal presentation.pptx');
  if (fs.existsSync(univPath)) {
    const univBuf = await resolvePptxInheritance(fs.readFileSync(univPath));
    const univPngs = await convertPptxToPng(univBuf, { slides: [1, 2], width: 1920, height: 1080 });
    check('T3.1: Universal presentation deck resolves and converts cleanly', univPngs.length === 2 && univPngs[0].png.length > 10000);
  }

  const testPath = path.join(__dirname, '../node_modules/pptx2json/fixtures/test.pptx');
  if (fs.existsSync(testPath)) {
    const testBuf = await resolvePptxInheritance(fs.readFileSync(testPath));
    const testPngs = await convertPptxToPng(testBuf, { slides: [1], width: 1920, height: 1080 });
    check('T3.2: Baseline test.pptx resolves and converts cleanly', testPngs.length === 1 && testPngs[0].png.length > 1000);
  }

  console.log(`\nPlaceholder Inheritance Test Results: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
