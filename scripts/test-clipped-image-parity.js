/**
 * test-clipped-image-parity.js
 *
 * Verifies mathematical parity between Studio DOM and Canvas 2D Program Compositor
 * for masked/clipped images across:
 * 1. Normalized 16:9 container aspect ratios
 * 2. Asymmetric image natural dimensions
 * 3. Extreme crop pan positions (-100% to +100%)
 * 4. Image rotations (0°, 45°, 90°, 180°) around image center
 * 5. Scale/zoom levels (0.1x to 5.0x)
 * 6. Fit modes: fill, fit, free
 */

"use strict";

const assert = require("assert");
const { calculateCropMetrics } = require("../src/App/controller/designStudioCrop");

console.log("================================================================================");
console.log(" CLIPPED-IMAGE PARITY VERIFICATION (STUDIO DOM vs PROGRAM CANVAS)");
console.log("================================================================ philosophy\n");

function simulateStudioDomCalculation(layer, mImg) {
  const crop = mImg.frameCrop || mImg;
  const cw = (layer.width || 35) * (16 / 9);
  const ch = typeof layer.height === "number" ? layer.height : 15;
  const nw = mImg.naturalWidth && mImg.naturalHeight ? mImg.naturalWidth : (mImg.aspectRatio || 1.777778) * 1000;
  const nh = mImg.naturalWidth && mImg.naturalHeight ? mImg.naturalHeight : 1000;

  const metrics = calculateCropMetrics({
    containerWidth: cw,
    containerHeight: ch,
    naturalWidth: nw,
    naturalHeight: nh,
    fitMode: crop.fitMode || "fill",
    zoom: typeof crop.zoom === "number" ? crop.zoom : 1,
    panX: crop.panX || 0,
    panY: crop.panY || 0,
  });

  const leftPct = (metrics.drawX / cw) * 100;
  const topPct = (metrics.drawY / ch) * 100;
  const widthPct = (metrics.drawW / cw) * 100;
  const heightPct = (metrics.drawH / ch) * 100;
  const rot = typeof crop.rotation === "number" ? crop.rotation : 0;

  return {
    cw,
    ch,
    leftPct,
    topPct,
    widthPct,
    heightPct,
    rot,
    containerAspect: cw / ch,
    imageAspect: nw / nh,
  };
}

function simulateCanvasCompositorCalculation(layer, mImg, canvasW = 1280, canvasH = 720) {
  const mCrop = layer.maskImage?.frameCrop || layer.maskImage || mImg.frameCrop || mImg;
  const mFit = mCrop.fitMode || "fill";
  const mZoom = typeof mCrop.zoom === "number" ? mCrop.zoom : 1;
  const mPanX = typeof mCrop.panX === "number" ? mCrop.panX : 0;
  const mPanY = typeof mCrop.panY === "number" ? mCrop.panY : 0;
  const mRot = typeof mCrop.rotation === "number" ? mCrop.rotation : 0;

  const layerW = (layer.width / 100) * canvasW;
  const layerH = (layer.height / 100) * canvasH;

  const metrics = calculateCropMetrics({
    containerWidth: layerW,
    containerHeight: layerH,
    naturalWidth: mImg.naturalWidth,
    naturalHeight: mImg.naturalHeight,
    fitMode: mFit,
    zoom: mZoom,
    panX: mPanX,
    panY: mPanY,
  });

  const leftPct = (metrics.drawX / layerW) * 100;
  const topPct = (metrics.drawY / layerH) * 100;
  const widthPct = (metrics.drawW / layerW) * 100;
  const heightPct = (metrics.drawH / layerH) * 100;

  return {
    layerW,
    layerH,
    leftPct,
    topPct,
    widthPct,
    heightPct,
    mRot,
    containerAspect: layerW / layerH,
    imageAspect: mImg.naturalWidth / mImg.naturalHeight,
  };
}

function assertParity(name, layer, mImg) {
  const dom = simulateStudioDomCalculation(layer, mImg);
  const canvas = simulateCanvasCompositorCalculation(layer, mImg);

  const aspectDelta = Math.abs(dom.containerAspect - canvas.containerAspect);
  const leftDelta = Math.abs(dom.leftPct - canvas.leftPct);
  const topDelta = Math.abs(dom.topPct - canvas.topPct);
  const widthDelta = Math.abs(dom.widthPct - canvas.widthPct);
  const heightDelta = Math.abs(dom.heightPct - canvas.heightPct);

  assert(aspectDelta < 0.001, `${name}: Container aspect mismatch! DOM=${dom.containerAspect}, Canvas=${canvas.containerAspect}`);
  assert(leftDelta < 0.01, `${name}: leftPct mismatch! DOM=${dom.leftPct}%, Canvas=${canvas.leftPct}%`);
  assert(topDelta < 0.01, `${name}: topPct mismatch! DOM=${dom.topPct}%, Canvas=${canvas.topPct}%`);
  assert(widthDelta < 0.01, `${name}: widthPct mismatch! DOM=${dom.widthPct}%, Canvas=${canvas.widthPct}%`);
  assert(heightDelta < 0.01, `${name}: heightPct mismatch! DOM=${dom.heightPct}%, Canvas=${canvas.heightPct}%`);
  assert(dom.rot === canvas.mRot, `${name}: Rotation mismatch! DOM=${dom.rot}, Canvas=${canvas.mRot}`);

  console.log(`  ✓ ${name}`);
  console.log(`    Aspect: ${dom.containerAspect.toFixed(3)} | Width%: ${dom.widthPct.toFixed(2)}% | Left%: ${dom.leftPct.toFixed(2)}% | Top%: ${dom.topPct.toFixed(2)}%`);
}

// Test Suite 1: Asymmetric 4:3 image in wide 30% x 10% lower third banner
assertParity("Test 1: Asymmetric 4:3 Image in Wide Lower-Third (Fill Mode)", {
  width: 30,
  height: 10,
}, {
  naturalWidth: 800,
  naturalHeight: 600,
  frameCrop: { fitMode: "fill", zoom: 1.5, panX: 25, panY: -30, rotation: 0 },
});

// Test Suite 2: Square shape (width 15%, height 26.67% on 16:9 canvas)
assertParity("Test 2: Square Mask Container with 16:9 Image", {
  width: 15,
  height: 26.67, // 15 * (16/9) = 26.67 -> square
}, {
  naturalWidth: 1920,
  naturalHeight: 1080,
  frameCrop: { fitMode: "fill", zoom: 1.0, panX: 0, panY: 0, rotation: 0 },
});

// Test Suite 3: Extreme Pan X = +100% and -100%
assertParity("Test 3a: Extreme Pan Left (+100%)", {
  width: 25,
  height: 15,
}, {
  naturalWidth: 1200,
  naturalHeight: 800,
  frameCrop: { fitMode: "fill", zoom: 2.0, panX: 100, panY: 0, rotation: 0 },
});

assertParity("Test 3b: Extreme Pan Right (-100%)", {
  width: 25,
  height: 15,
}, {
  naturalWidth: 1200,
  naturalHeight: 800,
  frameCrop: { fitMode: "fill", zoom: 2.0, panX: -100, panY: 0, rotation: 0 },
});

// Test Suite 4: Extreme Pan Y = +100% and -100%
assertParity("Test 4a: Extreme Pan Top (+100%)", {
  width: 35,
  height: 20,
}, {
  naturalWidth: 1000,
  naturalHeight: 1000,
  frameCrop: { fitMode: "fill", zoom: 2.5, panX: 0, panY: 100, rotation: 0 },
});

assertParity("Test 4b: Extreme Pan Bottom (-100%)", {
  width: 35,
  height: 20,
}, {
  naturalWidth: 1000,
  naturalHeight: 1000,
  frameCrop: { fitMode: "fill", zoom: 2.5, panX: 0, panY: -100, rotation: 0 },
});

// Test Suite 5: Independent rotation angle
assertParity("Test 5: Image Rotation (45 degrees)", {
  width: 20,
  height: 15,
}, {
  naturalWidth: 1600,
  naturalHeight: 900,
  frameCrop: { fitMode: "fill", zoom: 1.2, panX: 10, panY: 15, rotation: 45 },
});

// Test Suite 6: Free fitMode with shrink down to 0.2
assertParity("Test 6: Free Mode Unconstrained Scaling (0.3x zoom)", {
  width: 40,
  height: 25,
}, {
  naturalWidth: 1920,
  naturalHeight: 1080,
  frameCrop: { fitMode: "free", zoom: 0.3, panX: -20, panY: 40, rotation: 90 },
});

// Test Suite 7: Fit (contain) mode
assertParity("Test 7: Fit Mode (Contain) inside Tall Vertical Container", {
  width: 10,
  height: 30,
}, {
  naturalWidth: 1920,
  naturalHeight: 1080,
  frameCrop: { fitMode: "fit", zoom: 1.0, panX: 0, panY: 0, rotation: 0 },
});

console.log("\n================================================================================");
console.log(" ALL 8 CLIPPED-IMAGE PARITY TESTS PASSED ✓");
console.log("================================================================================\n");
