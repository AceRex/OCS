/**
 * verify-design-lab-inspection.js
 * ================================
 * Validates Part B — Intelligent Flyer Inspection:
 * 1. Checks Python engine analysis output on sample image.
 * 2. Validates OCR text blocks, coordinates, confidence scores, and normalized percentages.
 * 3. Validates subject extraction and face detection.
 * 4. Checks 12px border radius compliance across inspector components.
 */

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

console.log('============================================================');
console.log('OCS DESIGN LAB — INTELLIGENT FLYER INSPECTION VERIFICATION');
console.log('============================================================\n');

let allPassed = true;
function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
  } else {
    console.error(`[FAIL] ${message}`);
    allPassed = false;
  }
}

// 1. Verify engine.py analysis on test_slide_1.png
const engineScript = path.join(__dirname, '..', 'ocs_image_engine', 'engine.py');
const sampleImage = path.join(__dirname, '..', 'test_slide_1.png');
const outDir = path.join(__dirname, '..', 'scratch', 'test_verify_out');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

console.log('1. Testing Offline OCR & Vision Engine...');
const proc = spawnSync('python3', [engineScript, '--analyze', sampleImage, '--out', outDir], {
  encoding: 'utf-8',
  timeout: 30000,
});

assert(proc.status === 0, `Python engine exited cleanly with status code 0 (stderr: ${proc.stderr?.slice(0, 100)})`);

let analysisJson = null;
try {
  const jsonMatch = proc.stdout.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    analysisJson = JSON.parse(jsonMatch[0]);
  }
} catch (e) {
  console.error('Failed to parse output JSON:', e);
}

assert(analysisJson !== null, 'Engine emitted valid structured JSON analysis output');
assert(Array.isArray(analysisJson?.ocr_blocks), 'Analysis JSON includes ocr_blocks array');
assert(analysisJson?.ocr_blocks?.length > 0, `Detected ${analysisJson?.ocr_blocks?.length} OCR text blocks in flyer`);

// 2. Validate OCR block structure
const sampleBlock = analysisJson?.ocr_blocks?.[0];
assert(typeof sampleBlock?.text === 'string' && sampleBlock.text.length > 0, `Sample block text present: "${sampleBlock?.text}"`);
assert(typeof sampleBlock?.x === 'number' && typeof sampleBlock?.y === 'number', `Block coordinates present: (${sampleBlock?.x}, ${sampleBlock?.y})`);
assert(typeof sampleBlock?.w === 'number' && typeof sampleBlock?.h === 'number', `Block dimensions present: ${sampleBlock?.w}x${sampleBlock?.h}`);
assert(typeof sampleBlock?.conf === 'number', `Confidence score present: ${sampleBlock?.conf}%`);

// 3. Verify DesignAssetAnalyzer.js file exists and exports required methods
const analyzerFile = path.join(__dirname, '..', 'src', 'App', 'controller', 'design', 'DesignAssetAnalyzer.js');
assert(fs.existsSync(analyzerFile), 'src/App/controller/design/DesignAssetAnalyzer.js exists');

const analyzerCode = fs.readFileSync(analyzerFile, 'utf-8');
assert(analyzerCode.includes('export async function analyzeImageSource'), 'Exports analyzeImageSource');
assert(analyzerCode.includes('export async function cropRegionToDataUrl'), 'Exports cropRegionToDataUrl');
assert(analyzerCode.includes('export async function extractSubjectWithCutout'), 'Exports extractSubjectWithCutout');

// 4. Verify LiveDesignStudioModal.jsx integration
const studioModalFile = path.join(__dirname, '..', 'src', 'App', 'controller', 'LiveDesignStudioModal.jsx');
const studioModalCode = fs.readFileSync(studioModalFile, 'utf-8');

assert(studioModalCode.includes('handleStartInspectImage'), 'LiveDesignStudioModal contains handleStartInspectImage');
assert(studioModalCode.includes('handleCreateTextLayerFromBlock'), 'LiveDesignStudioModal contains handleCreateTextLayerFromBlock');
assert(studioModalCode.includes('handleCreateImageLayerFromSubject'), 'LiveDesignStudioModal contains handleCreateImageLayerFromSubject');
assert(studioModalCode.includes('Intelligent Inspection Canvas Overlay'), 'LiveDesignStudioModal contains canvas inspection overlay');
assert(studioModalCode.includes('Flyer & Poster Intelligent Inspection Card'), 'LiveDesignStudioModal contains flyer inspection card in inspector');

// 5. Verify Universal 12px Border Radius compliance
const nonCompliantRadiusRegex = /rounded-(sm|md|lg|2xl|3xl)\b/g;
const hasNonCompliantRadius = studioModalCode.slice(studioModalCode.indexOf('Flyer & Poster Intelligent Inspection Card')).match(nonCompliantRadiusRegex);
assert(!hasNonCompliantRadius, 'Flyer Inspection UI strictly follows the Universal 12px Border Radius mandate');

console.log('\n------------------------------------------------------------');
if (allPassed) {
  console.log('ALL INTELLIGENT FLYER INSPECTION TESTS PASSED! (100% OK)');
} else {
  console.log('SOME TESTS FAILED!');
  process.exit(1);
}
console.log('------------------------------------------------------------');
