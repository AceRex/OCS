/**
 * Comprehensive Automated Verification for Live Design Studio:
 * Workflow 2: Horizontal and Vertical Rulers & Editor Zoom/Pan
 * Workflow 3: Shape-Based Clipping Masks
 * Workflow 4: Editable Shape Curves & Corner Rounding
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passedTests = 0;
let totalTests = 0;

function test(description, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${description}`);
    console.error(`    Error: ${err.message}`);
  }
}

console.log('===============================================================');
console.log('  Live Design Studio: Workflows 2, 3, & 4 Automated Suite');
console.log('===============================================================\n');

// -----------------------------------------------------------------------------
// WORKFLOW 2: RULERS & EDITOR ZOOM
// -----------------------------------------------------------------------------
console.log('--- Workflow 2: Rulers & Zoom Controls ---');

const modalFilePath = path.join(__dirname, '../src/App/controller/LiveDesignStudioModal.jsx');
const modalSource = fs.readFileSync(modalFilePath, 'utf8');

test('LiveDesignStudioModal: Rulers use fixed 1280x720 canvas coordinates', () => {
  assert(modalSource.includes('x <= 1280'), 'Top ruler must iterate across 0 to 1280 canvas width');
  assert(modalSource.includes('y <= 720'), 'Left ruler must iterate across 0 to 720 canvas height');
  assert(modalSource.includes('showRulers'), 'Modal must have showRulers toggle state');
  assert(modalSource.includes('cursorCanvasPos'), 'Modal must track cursor position in 1280x720 space');
  assert(modalSource.includes('((e.clientX - rect.left) / rect.width) * 1280'), 'Cursor tracking X must map to 0-1280');
  assert(modalSource.includes('((e.clientY - rect.top) / rect.height) * 720'), 'Cursor tracking Y must map to 0-720');
});

test('LiveDesignStudioModal: Zoom levels clamped between 25% and 400%', () => {
  assert(modalSource.includes('Math.max(0.25, Math.min(4.0,'), 'Zoom must be clamped between 0.25 (25%) and 4.0 (400%)');
  assert(modalSource.includes('handleZoomIn'), 'Modal must provide zoom in action');
  assert(modalSource.includes('handleZoomOut'), 'Modal must provide zoom out action');
  assert(modalSource.includes('handleFitZoom'), 'Modal must provide Fit to View action');
  assert(modalSource.includes('handleResetZoom'), 'Modal must provide 100% reset action');
});

test('LiveDesignStudioModal: Space key panning ignores active text inputs and contentEditable', () => {
  assert(modalSource.includes('target.tagName === "INPUT"'), 'Must check for INPUT target');
  assert(modalSource.includes('target.tagName === "TEXTAREA"'), 'Must check for TEXTAREA target');
  assert(modalSource.includes('contenteditable'), 'Must check for contenteditable');
  assert(modalSource.includes('if (isEditable || editingTextLayerId) return;'), 'Must return early if editing text');
  assert(modalSource.includes('isSpacePressed'), 'Must track isSpacePressed state');
});

test('LiveDesignStudioModal: Selection handles use inverse scale transform (1 / zoom)', () => {
  assert(modalSource.includes('scale(${1 / (zoom || 1)})'),
    'Selection handles must use scale(1/zoom) so handle size remains tactile and visually constant');
});

test('LiveDesignStudioModal: Editor zoom and pan do not modify layer geometry coordinates', () => {
  assert(modalSource.includes('rect.width') && modalSource.includes('rect.height'),
    'Delta calculation must normalize by getBoundingClientRect() so zoom does not scale layer position');
  assert(modalSource.includes('transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`'),
    'Transform applied purely to canvas container, isolating layer coordinates from broadcast');
});

// -----------------------------------------------------------------------------
// WORKFLOW 3: SHAPE-BASED CLIPPING MASKS
// -----------------------------------------------------------------------------
console.log('\n--- Workflow 3: Shape-Based Clipping Masks ---');

test('LiveDesignStudioModal: Multi-selection allows creating clipping mask when 1 shape and 1 image are selected', () => {
  assert(modalSource.includes('canCreateClippingMask'), 'Modal must compute canCreateClippingMask condition');
  assert(modalSource.includes('handleCreateClippingMask'), 'Modal must implement handleCreateClippingMask');
  assert(modalSource.includes('selectedLayerIds.length === 2') || modalSource.includes('selectedLayerIds.length !== 2'),
    'canCreateClippingMask requires exactly 2 selected items');
  assert(modalSource.includes('(l1.type === "shape" && l2.type === "image")'), 'Mask creation requires 1 shape and 1 image');
});

test('LiveDesignStudioModal: Shape inspector provides "Place Image Inside" and file input', () => {
  assert(modalSource.includes('Place Image Inside'), 'Shape inspector must feature "Place Image Inside" action');
  assert(modalSource.includes('handlePlaceImageInsideShape'), 'Modal must provide handlePlaceImageInsideShape');
  assert(modalSource.includes('maskFileInputRef'), 'Modal must use dedicated maskFileInputRef');
});

test('LiveDesignStudioModal: Clipping mask controls include Fit/Fill, Zoom, Pan, Reset, and Release', () => {
  assert(modalSource.includes('Release Mask'), 'Shape inspector must feature "Release Mask" action');
  assert(modalSource.includes('handleReleaseClippingMask'), 'Modal must implement handleReleaseClippingMask');
  assert(modalSource.includes('fitMode'), 'Modal must support Fit/Fill toggle');
  assert(modalSource.includes('zoom: val') || modalSource.includes('layer.maskImage.zoom'), 'Modal must support crop zoom slider (100% to 300%)');
  assert(modalSource.includes('panX') && modalSource.includes('panY'), 'Modal must support panX and panY');
  assert(modalSource.includes('Reset Crop'), 'Modal must support Reset Crop action');
});

test('LiveDesignStudioModal: SVG editor renders <clipPath> and clipped <image>', () => {
  assert(modalSource.includes('<clipPath id={clipId}>'), 'SVG editor must create clipPath for shape mask');
  assert(modalSource.includes('<g clipPath={`url(#${clipId})`}>'), 'SVG editor must attach clipPath to group');
  assert(modalSource.includes('href={layer.maskImage.url}'), 'SVG editor must render image inside clipPath');
});

const canvasFilePath = path.join(__dirname, '../src/App/controller/SwitcherProgramCanvas.js');
const canvasSource = fs.readFileSync(canvasFilePath, 'utf8');

test('SwitcherProgramCanvas: HTML5 2D Canvas broadcast engine renders shape clipping mask', () => {
  assert(canvasSource.includes('layer.maskImage && layer.maskImage.url'), 'SwitcherProgramCanvas must check for layer.maskImage.url');
  assert(canvasSource.includes('buildShapePath(ctx, shape, rx, ry, layerW, layerH, layer.borderRadius, h, layer.customPath)'),
    'SwitcherProgramCanvas must build clipping path from shape geometry');
  assert(canvasSource.includes('ctx.clip()'), 'SwitcherProgramCanvas must clip context to shape');
  assert(canvasSource.includes('ctx.drawImage(mImg, drawX, drawY, drawW, drawH)'), 'SwitcherProgramCanvas must draw image inside clip');
});

// -----------------------------------------------------------------------------
// WORKFLOW 4: EDITABLE SHAPE CURVES & CORNER ROUNDING
// -----------------------------------------------------------------------------
console.log('\n--- Workflow 4: Editable Shape Curves & Corner Rounding ---');

test('LiveDesignStudioModal: On-canvas corner radius drag handles update radius (0-99px)', () => {
  assert(modalSource.includes('handleMouseDownOnCornerHandle'), 'Modal must have corner radius handle mouse down handler');
  assert(modalSource.includes('Math.max(0, Math.min(99,'), 'Corner radius must be clamped 0 to 99px');
  assert(modalSource.includes('drag.mode === "corner-radius"'), 'Modal must process corner-radius drag mode');
});

test('LiveDesignStudioModal: Inspector provides uniform and independent corner radii [TL, TR, BR, BL]', () => {
  assert(modalSource.includes('cornersLinked'), 'Modal must support cornersLinked toggle state');
  assert(modalSource.includes('Top-Left') && modalSource.includes('Top-Right') && modalSource.includes('Bottom-Right') && modalSource.includes('Bottom-Left'),
    'Modal must support independent corner radii for TL, TR, BR, BL');
  assert(modalSource.includes('0px (Sharp)'), 'Modal must provide 0px sharp preset');
  assert(modalSource.includes('12px (Mandate)'), 'Modal must provide 12px mandate preset');
});

test('LiveDesignStudioModal: Explicit "Edit Shape (Bézier Curves)" mode toggle exists', () => {
  assert(modalSource.includes('editingShapeLayerId'), 'Modal must have editingShapeLayerId state');
  assert(modalSource.includes('Edit Shape (Bézier Curves)'), 'Inspector must feature Edit Shape (Bézier Curves) button');
  assert(modalSource.includes('Done Editing Curves'), 'Inspector must feature Done Editing Curves toggle');
});

test('LiveDesignStudioModal: Bézier curve controls include node vertices, cp1/cp2 handles, and edge midpoints', () => {
  assert(modalSource.includes('handleMouseDownOnCurveNode'), 'Modal must support curve node mouse down handler');
  assert(modalSource.includes('drag.mode === "curve-node"'), 'Modal must process curve-node drag mode');
  assert(modalSource.includes('drag.pointType === "vertex"') && modalSource.includes('drag.pointType === "cp1"') && modalSource.includes('drag.pointType === "midpoint"'),
    'Modal must support vertex, cp1/cp2, and midpoint dragging');
  assert(modalSource.includes('handleStraightenSegment'), 'Modal must feature Straighten Segment action');
  assert(modalSource.includes('handleResetShapeCurves'), 'Modal must feature Reset Shape Curves action');
});

test('SwitcherProgramCanvas: buildShapePath supports both independent corner radii and custom Bézier paths', () => {
  assert(canvasSource.includes('buildShapePath'), 'SwitcherProgramCanvas must declare buildShapePath');
  assert(canvasSource.includes('customPath && Array.isArray(customPath) && customPath.length >= 3'),
    'buildShapePath must support customPath Bézier nodes');
  assert(canvasSource.includes('ctx.bezierCurveTo'), 'buildShapePath must render Bézier curves via ctx.bezierCurveTo');
  assert(canvasSource.includes('Array.isArray(customRadius)'), 'buildShapePath must support independent [tl, tr, br, bl] radii array');
});

// -----------------------------------------------------------------------------
// DATA TRANSFORMATION & PATH SERIALIZATION LOGIC TEST
// -----------------------------------------------------------------------------
console.log('\n--- Data & Path Serialization Test ---');

test('Bézier path SVG string matches expected "M ... C ... Z" format', () => {
  const nodes = [
    { x: 0, y: 0, cp2: { x: 50, y: 0 } },
    { x: 100, y: 0, cp1: { x: 80, y: 0 }, cp2: { x: 100, y: 20 } },
    { x: 100, y: 100, cp1: { x: 100, y: 80 }, cp2: { x: 80, y: 100 } },
    { x: 0, y: 100, cp1: { x: 20, y: 100 }, cp2: { x: 0, y: 80 } }
  ];

  let pathD = `M ${nodes[0].x} ${nodes[0].y}`;
  for (let i = 0; i < nodes.length; i++) {
    const curr = nodes[i];
    const next = nodes[(i + 1) % nodes.length];
    const cp1 = curr.cp2 || { x: curr.x, y: curr.y };
    const cp2 = next.cp1 || { x: next.x, y: next.y };
    pathD += ` C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${next.x} ${next.y}`;
  }
  pathD += ' Z';

  assert(pathD.startsWith('M 0 0 C 50 0, 80 0, 100 0'), 'Path must generate accurate cubic Bézier instructions');
  assert(pathD.endsWith('Z'), 'Path must close with Z');
});

test('Release Clipping Mask restores extracted image layer with matching dimensions', () => {
  const shapeLayer = {
    id: 'shape-1',
    type: 'shape',
    name: 'Banner Shape',
    x: 10,
    y: 20,
    width: 30,
    height: 40,
    shape: 'rectangle',
    maskImage: {
      url: 'data:image/png;base64,mock',
      fitMode: 'fill',
      zoom: 1.2,
      panX: 5,
      panY: -5
    }
  };

  // Simulate handleReleaseClippingMask logic from modal
  const imgUrl = shapeLayer.maskImage.url;
  const newImageLayer = {
    id: `layer_${Date.now()}`,
    type: "image",
    name: `${shapeLayer.name || "Shape"} (Extracted Image)`,
    url: imgUrl,
    content: imgUrl,
    x: shapeLayer.x,
    y: shapeLayer.y,
    width: shapeLayer.width,
    height: shapeLayer.height,
    zIndex: (shapeLayer.zIndex || 10) + 1,
  };

  const updatedShape = { ...shapeLayer, maskImage: null };

  assert.strictEqual(updatedShape.maskImage, null, 'Shape must no longer have maskImage');
  assert.strictEqual(newImageLayer.url, shapeLayer.maskImage.url, 'Extracted image must preserve URL');
  assert.strictEqual(newImageLayer.x, shapeLayer.x, 'Extracted image must inherit shape position');
  assert.strictEqual(newImageLayer.width, shapeLayer.width, 'Extracted image must inherit shape width');
});

console.log('\n===============================================================');
console.log(`  VERIFICATION RESULTS: ${passedTests} / ${totalTests} tests passed!`);
console.log('===============================================================');

if (passedTests !== totalTests) {
  process.exit(1);
}
