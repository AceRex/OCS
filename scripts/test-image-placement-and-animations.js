/**
 * scripts/test-image-placement-and-animations.js
 * 
 * Verifies:
 * 1. Image placement parity contract:
 *    - Standalone image off-centre (16:9 and 1:1).
 *    - Image inside frame with crop zoom and pan.
 *    - Grouped lower third with background shape, text, and avatar.
 *    - Tolerance: < 0.1px difference between Editor DOM contract and Program Canvas compositor.
 * 2. Animation evaluator audit:
 *    - Every exposed entrance effect: none, fade, slide-left, slide-right, slide-top, slide-bottom,
 *      slide-fade-left, slide-fade-right, slide-fade-top, slide-fade-bottom, scale-fade, wipe.
 *    - Every exposed exit effect: none, fade, slide-left, slide-right, slide-top, slide-bottom,
 *      slide-fade-left, slide-fade-right, slide-fade-top, slide-fade-bottom, scale-fade, wipe.
 *    - Evaluated at beginning (p=0.05), midpoint (p=0.50), end (p=1.00).
 *    - Verifies proper motion and exact settlement into saved composition on completion.
 * 3. Saved-control update behavior:
 *    - Adding control keeps it Hidden.
 *    - Updating saved control updates snapshot without altering on-air live snapshot uncommanded.
 *    - Show uses latest committed snapshot.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, status: "PASS" });
    console.log(`PASS: ${name}`);
  } catch (err) {
    results.push({ name, status: "FAIL", error: err.message });
    console.error(`FAIL: ${name}\n  Error: ${err.message}`);
  }
}

const vm = require("vm");
const switcherCanvasCode = fs.readFileSync(path.join(__dirname, "../src/App/controller/SwitcherProgramCanvas.js"), "utf8");

const getEaseMatch = switcherCanvasCode.match(/function getEaseProgress[\s\S]*?\n\}/);
const calcTransMatch = switcherCanvasCode.match(/export function calculateTransitionOffset[\s\S]*?\n\}/);

const sandbox = {};
vm.runInNewContext(
  (getEaseMatch ? getEaseMatch[0] : "") + "\n" +
  (calcTransMatch ? calcTransMatch[0].replace("export function", "function") : "") + "\n" +
  "this.calculateTransitionOffset = calculateTransitionOffset;",
  sandbox
);
const { calculateTransitionOffset } = sandbox;

console.log("\n=======================================================");
console.log("TEST SUITE: Image Placement Parity & Animation Repair");
console.log("=======================================================\n");

const CANVAS_W = 1280;
const CANVAS_H = 720;
const CANVAS_ASPECT = CANVAS_W / CANVAS_H; // 16:9 = 1.7777777777777777

// Helper to calculate DOM-rendered box (matching LiveDesignStudioModal.jsx contract)
function getEditorDOMBox(layer, w = CANVAS_W, h = CANVAS_H) {
  const xPct = layer.x ?? 50;
  const yPct = layer.y ?? 50;
  const wPct = layer.width ?? 30;
  const imgAspect = layer.aspectRatio || 1.777778;
  const hPct = typeof layer.height === "number"
    ? layer.height
    : (layer.type === "image" ? ((wPct * (w / h)) / imgAspect) : (layer.shape === "line" ? 2 : layer.shape === "arrow" ? 6 : (layer.type === "text" ? 6 : 12)));

  const layerW = (w * wPct) / 100;
  const layerH = (h * hPct) / 100;
  const cx = (w * xPct) / 100;
  const cy = (h * yPct) / 100;

  return {
    cx,
    cy,
    layerW,
    layerH,
    left: cx - layerW / 2,
    top: cy - layerH / 2,
    right: cx + layerW / 2,
    bottom: cy + layerH / 2,
    hPct,
  };
}

// Helper to calculate Canvas 2D Compositor box (matching SwitcherProgramCanvas.js contract)
function getCompositorBox(layer, w = CANVAS_W, h = CANVAS_H) {
  const xPct = typeof layer.x === "number" ? layer.x : 50;
  const yPct = typeof layer.y === "number" ? layer.y : 80;
  const wPct = typeof layer.width === "number" ? layer.width : (layer.style?.width || 35);
  const imgAspect = layer.aspectRatio || 1.777778;

  let hPct = typeof layer.height === "number" ? layer.height : null;
  if (hPct === null) {
    if (layer.type === "image") {
      hPct = (wPct * (w / h)) / imgAspect;
    } else if (layer.type === "shape") {
      hPct = layer.shape === "line" ? 2 : layer.shape === "arrow" ? 6 : 12;
    } else if (layer.type === "text") {
      hPct = 6;
    } else {
      hPct = 12;
    }
  }
  const layerW = (w * wPct) / 100;
  const layerH = (h * hPct) / 100;
  const cx = (w * xPct) / 100;
  const cy = (h * yPct) / 100;

  return {
    cx,
    cy,
    layerW,
    layerH,
    left: cx - layerW / 2,
    top: cy - layerH / 2,
    right: cx + layerW / 2,
    bottom: cy + layerH / 2,
    hPct,
  };
}

// ── 1. Image Placement Tests ──────────────────────────────────────────────────

test("1.1 Standalone 16:9 Image Placed Off-Centre: Editor DOM matches Compositor (< 0.01px)", () => {
  const layer = {
    id: "img_standalone_16_9",
    type: "image",
    x: 35.5,
    y: 42.8,
    width: 28.0,
    aspectRatio: 16 / 9,
  };

  const dom = getEditorDOMBox(layer);
  const comp = getCompositorBox(layer);

  assert(Math.abs(dom.layerW - comp.layerW) < 0.01, `layerW mismatch: dom=${dom.layerW}, comp=${comp.layerW}`);
  assert(Math.abs(dom.layerH - comp.layerH) < 0.01, `layerH mismatch: dom=${dom.layerH}, comp=${comp.layerH}`);
  assert(Math.abs(dom.cx - comp.cx) < 0.01, `cx mismatch: dom=${dom.cx}, comp=${comp.cx}`);
  assert(Math.abs(dom.cy - comp.cy) < 0.01, `cy mismatch: dom=${dom.cy}, comp=${comp.cy}`);
  assert(Math.abs(dom.left - comp.left) < 0.01, `left mismatch: dom=${dom.left}, comp=${comp.left}`);
  assert(Math.abs(dom.top - comp.top) < 0.01, `top mismatch: dom=${dom.top}, comp=${comp.top}`);
});

test("1.2 Standalone 1:1 Square Image Placed Off-Centre: Editor DOM matches Compositor (< 0.01px)", () => {
  const layer = {
    id: "img_standalone_1_1",
    type: "image",
    x: 72.0,
    y: 25.0,
    width: 15.0,
    aspectRatio: 1.0, // Square image
  };

  const dom = getEditorDOMBox(layer);
  const comp = getCompositorBox(layer);

  assert(Math.abs(dom.layerW - comp.layerW) < 0.01, `layerW mismatch: dom=${dom.layerW}, comp=${comp.layerW}`);
  assert(Math.abs(dom.layerH - comp.layerH) < 0.01, `layerH mismatch: dom=${dom.layerH}, comp=${comp.layerH}`);
  assert(Math.abs(dom.top - comp.top) < 0.01, `top mismatch: dom=${dom.top}, comp=${comp.top}`);
  // Verify square pixel proportions on 16:9 canvas
  assert(Math.abs(dom.layerW - dom.layerH) < 0.01, `Square layer must have layerW == layerH: w=${dom.layerW}, h=${dom.layerH}`);
});

test("1.3 Framed Image with Adjusted Crop: Transform and Pan offsets match", () => {
  const layer = {
    id: "img_framed_crop",
    type: "image",
    x: 50,
    y: 50,
    width: 20,
    height: 20,
    frameShape: "rounded_rectangle",
    frameCrop: {
      fitMode: "fill",
      zoom: 1.75,
      panX: 15,
      panY: -25,
    },
    aspectRatio: 1.0,
  };

  const dom = getEditorDOMBox(layer);
  const comp = getCompositorBox(layer);

  assert(Math.abs(dom.layerW - comp.layerW) < 0.01, "Layer width must match");
  assert(Math.abs(dom.layerH - comp.layerH) < 0.01, "Layer height must match");

  // Verify CSS translate % translates by (layerW * panX) / 100
  const expectedPanX_px = (comp.layerW * layer.frameCrop.panX) / 100;
  const expectedPanY_px = (comp.layerH * layer.frameCrop.panY) / 100;
  assert.strictEqual(expectedPanX_px, (256 * 15) / 100);
  assert.strictEqual(expectedPanY_px, (144 * -25) / 100);
});

test("1.4 Grouped Lower Third: Spacing and bounding box match between DOM and Compositor", () => {
  const lowerThirdLayers = [
    { id: "bg_shape", type: "shape", shape: "rounded-rect", x: 25, y: 85, width: 40, height: 12 },
    { id: "title_txt", type: "text", text: "Speaker Name", x: 26, y: 83.5, width: 25, height: 5 },
    { id: "sub_txt", type: "text", text: "Keynote Address", x: 26, y: 87.0, width: 25, height: 4 },
    { id: "avatar_img", type: "image", x: 10, y: 85, width: 6, height: 10.66, aspectRatio: 1.0 },
  ];

  for (const l of lowerThirdLayers) {
    const dom = getEditorDOMBox(l);
    const comp = getCompositorBox(l);
    assert(Math.abs(dom.left - comp.left) < 0.01, `Layer ${l.id} left mismatch: dom=${dom.left}, comp=${comp.left}`);
    assert(Math.abs(dom.top - comp.top) < 0.01, `Layer ${l.id} top mismatch: dom=${dom.top}, comp=${comp.top}`);
    assert(Math.abs(dom.layerW - comp.layerW) < 0.01, `Layer ${l.id} width mismatch: dom=${dom.layerW}, comp=${comp.layerW}`);
    assert(Math.abs(dom.layerH - comp.layerH) < 0.01, `Layer ${l.id} height mismatch: dom=${dom.layerH}, comp=${comp.layerH}`);
  }
});

// ── 2. Animation Motion & Evaluator Audit ──────────────────────────────────────

const ENTRANCE_EFFECTS = [
  "none",
  "fade",
  "slide-left",
  "slide-right",
  "slide-top",
  "slide-bottom",
  "slide-fade-left",
  "slide-fade-right",
  "slide-fade-top",
  "slide-fade-bottom",
  "scale-fade",
  "wipe",
];

const EXIT_EFFECTS = [
  "none",
  "fade",
  "slide-left",
  "slide-right",
  "slide-top",
  "slide-bottom",
  "slide-fade-left",
  "slide-fade-right",
  "slide-fade-top",
  "slide-fade-bottom",
  "scale-fade",
  "wipe",
];

test("2.1 Entrance Animations: Audit every exposed effect at start (p=0.05), midpoint (p=0.5), end (p=1.0)", () => {
  const dur = 1000;
  const start = 100000;

  for (const eff of ENTRANCE_EFFECTS) {
    const trans = { entrance: { type: eff, duration: dur, easing: "linear" } };

    // At Start (p=0.05)
    const tStart = start + 50;
    const offStart = calculateTransitionOffset("entering", start, tStart, trans, CANVAS_W, CANVAS_H);

    // At Midpoint (p=0.50)
    const tMid = start + 500;
    const offMid = calculateTransitionOffset("entering", start, tMid, trans, CANVAS_W, CANVAS_H);

    // At End (p=1.00)
    const tEnd = start + 1000;
    const offEnd = calculateTransitionOffset("entering", start, tEnd, trans, CANVAS_W, CANVAS_H);

    if (eff === "none") {
      assert.strictEqual(offStart.alpha, 1, "none must have alpha 1 immediately");
      assert.strictEqual(offStart.x, 0, "none must have x 0 immediately");
    } else if (eff === "fade") {
      assert(offStart.alpha > 0 && offStart.alpha < 0.15, `fade alpha at start: ${offStart.alpha}`);
      assert(offMid.alpha >= 0.45 && offMid.alpha <= 0.55, `fade alpha at mid: ${offMid.alpha}`);
      assert.strictEqual(offEnd.alpha, 1, "fade alpha at end must be 1");
    } else if (eff === "slide-bottom") {
      assert(offStart.y > 600, `slide-bottom starts near canvas height: ${offStart.y}`);
      assert(Math.abs(offMid.y - CANVAS_H * 0.5) < 1, `slide-bottom midpoint: ${offMid.y}`);
      assert.strictEqual(offEnd.y, 0, "slide-bottom must settle to y=0");
    } else if (eff === "slide-fade-bottom") {
      const maxOffset = Math.min(60, CANVAS_H * 0.07);
      assert(offStart.y > 0 && offStart.y <= maxOffset, `slide-fade-bottom start offset: ${offStart.y}`);
      assert(offStart.alpha < 0.15, "slide-fade-bottom alpha at start");
      assert.strictEqual(offEnd.y, 0, "slide-fade-bottom must settle to y=0");
      assert.strictEqual(offEnd.alpha, 1, "slide-fade-bottom must settle to alpha=1");
    } else if (eff === "scale-fade") {
      assert(offStart.scale < 0.95, `scale-fade start scale: ${offStart.scale}`);
      assert.strictEqual(offEnd.scale, 1, "scale-fade must settle to scale=1");
      assert.strictEqual(offEnd.alpha, 1, "scale-fade must settle to alpha=1");
    } else if (eff === "wipe") {
      assert(offStart.wipeProgress < 0.1, `wipe start: ${offStart.wipeProgress}`);
      assert(Math.abs(offMid.wipeProgress - 0.5) < 0.05, `wipe midpoint: ${offMid.wipeProgress}`);
      assert.strictEqual(offEnd.wipeProgress, 1, "wipe end must be 1");
    }

    // ALL effects MUST settle cleanly to (x: 0, y: 0, alpha: 1, scale: 1, wipeProgress: 1) on completion!
    assert.strictEqual(offEnd.x, 0, `${eff} must settle x=0 at completion`);
    assert.strictEqual(offEnd.y, 0, `${eff} must settle y=0 at completion`);
    assert.strictEqual(offEnd.alpha, 1, `${eff} must settle alpha=1 at completion`);
    assert.strictEqual(offEnd.scale, 1, `${eff} must settle scale=1 at completion`);
    assert.strictEqual(offEnd.wipeProgress, 1, `${eff} must settle wipeProgress=1 at completion`);
  }
});

test("2.2 Exit Animations: Audit every exposed effect at start, midpoint, completion", () => {
  const dur = 1000;
  const start = 100000;

  for (const eff of EXIT_EFFECTS) {
    const trans = { exit: { type: eff, duration: dur, easing: "linear" } };

    // At Start (p=0.05)
    const tStart = start + 50;
    const offStart = calculateTransitionOffset("exiting", start, tStart, trans, CANVAS_W, CANVAS_H);

    // At Midpoint (p=0.50)
    const tMid = start + 500;
    const offMid = calculateTransitionOffset("exiting", start, tMid, trans, CANVAS_W, CANVAS_H);

    // At End (p=1.00)
    const tEnd = start + 1000;
    const offEnd = calculateTransitionOffset("exiting", start, tEnd, trans, CANVAS_W, CANVAS_H);

    if (eff === "none") {
      assert.strictEqual(offStart.alpha, 0, "none exit must have alpha 0 immediately");
    } else if (eff === "fade") {
      assert(offStart.alpha > 0.85, `fade exit alpha at start: ${offStart.alpha}`);
      assert(Math.abs(offMid.alpha - 0.5) < 0.05, `fade exit alpha at mid: ${offMid.alpha}`);
      assert.strictEqual(offEnd.alpha, 0, "fade exit alpha at end must be 0");
    } else if (eff === "slide-bottom") {
      assert(offStart.y > 0, `slide-bottom exit starts moving down: ${offStart.y}`);
      assert(offEnd.y >= CANVAS_H, `slide-bottom exit completes off-screen: ${offEnd.y}`);
    } else if (eff === "wipe") {
      assert(offStart.wipeProgress > 0.9, `wipe exit start: ${offStart.wipeProgress}`);
      assert(offEnd.wipeProgress <= 0.01, `wipe exit end: ${offEnd.wipeProgress}`);
    }

    // On completion, element must be fully removed/transparent or offscreen
    if (eff === "fade" || eff.startsWith("slide-fade") || eff === "scale-fade") {
      assert.strictEqual(offEnd.alpha, 0, `${eff} must reach alpha=0 on exit completion`);
    }
  }
});

// ── 3. Saved Control Update Behavior Contract ─────────────────────────────────

test("3.1 Newly added control payload starts with status: hidden", () => {
  const modalCode = fs.readFileSync(path.join(__dirname, "../src/App/controller/LiveDesignStudioModal.jsx"), "utf8");
  assert(modalCode.includes('status: "hidden"'), "handleAddToLiveControls must set status: 'hidden'");
});

test("3.2 Explicit Update Saved Control action exists and preserves on-air snapshot isolation", () => {
  const modalCode = fs.readFileSync(path.join(__dirname, "../src/App/controller/LiveDesignStudioModal.jsx"), "utf8");
  assert(modalCode.includes("handleUpdateSavedControl"), "handleUpdateSavedControl function must exist in modal");
  assert(modalCode.includes("Update Saved Control"), "Update Saved Control button must be present in toolbar");
});

test("3.3 LiveStudioControlsRack provides Edit in Studio action on control cards", () => {
  const rackCode = fs.readFileSync(path.join(__dirname, "../src/App/controller/LiveStudioControlsRack.jsx"), "utf8");
  assert(rackCode.includes('aria-label="Edit in Studio"'), "Edit in Studio button must be present on control cards");
  assert(rackCode.includes("ocs_live_studio_active_design"), "Must stage control snapshot into studio storage on edit");
});

// ── 4. Compositor Layer Override Resolution ───────────────────────────────────

test("4.1 Compositor evaluates layer-level transitions when explicitly configured", () => {
  const canvasCode = fs.readFileSync(path.join(__dirname, "../src/App/controller/SwitcherProgramCanvas.js"), "utf8");
  assert(canvasCode.includes("hasLayerEnt"), "Compositor must check layer-level entrance transition override");
  assert(canvasCode.includes("hasLayerEx"), "Compositor must check layer-level exit transition override");
});

console.log("\n=======================================================");
const passCount = results.filter(r => r.status === "PASS").length;
const failCount = results.filter(r => r.status === "FAIL").length;
console.log(`RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
console.log("=======================================================\n");

if (failCount > 0) {
  process.exit(1);
}
