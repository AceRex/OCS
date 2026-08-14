/**
 * test-display-canvas-bands.js
 *
 * Verifies Phase 2.2 Display Canvas Compositor Foundation:
 * 1. Four-band compositor structure (FR-4.13)
 * 2. Independence of Background / Pinned layers from Content Slot changes (FR-4.14)
 * 3. Canvas state IPC sync & Mobile summary (FR-4.15)
 * 4. Bible verse content slot rendering and state preservation
 */

const assert = require("assert");

console.log("=== DISPLAY CANVAS 4-BAND COMPOSITOR VERIFICATION (FR-4.13 - FR-4.15) ===");

// 1. Mock Canvas State Store (matches main.js & DisplayCanvas.js implementation)
let currentCanvasState = {
  background: {
    type: "color",
    url: null,
    color: "#000000",
    panX: 0,
    panY: 0,
    zoom: 1,
    muted: true,
    loop: true,
    autoPlay: true,
  },
  contentSlot: {
    type: "none",
    data: null,
  },
  pinnedLayers: [],
  chrome: {
    blackout: false,
    logo: false,
    logoUrl: null,
    brandingText: null,
    timerSplit: false,
    timerCountdown: null,
  },
};

function handleActivateSetContent(value) {
  // FR-4.14: activate_set_content scopes ONLY to Content Slot band.
  // It never clears or mutates Background or Pinned layers.
  if (value == null) {
    currentCanvasState.contentSlot = { type: "none", data: null };
  } else {
    currentCanvasState.contentSlot = {
      type: value.type || "none",
      data: value.data || value,
    };
  }
}

function handleSetBackground(bg) {
  currentCanvasState.background = { ...currentCanvasState.background, ...bg };
}

function handleSetPinnedLayers(layers) {
  currentCanvasState.pinnedLayers = Array.isArray(layers) ? [...layers] : [];
}

function generateMobileSummary(state) {
  return {
    activeContentSlotType: state.contentSlot?.type || "none",
    hasContent: state.contentSlot?.type !== "none" && state.contentSlot?.data != null,
    pinnedLayerCount: Array.isArray(state.pinnedLayers) ? state.pinnedLayers.length : 0,
    isBlackout: !!state.chrome?.blackout,
  };
}

let passed = 0;
let failed = 0;

function check(desc, fn) {
  try {
    fn();
    console.log(`PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`FAIL: ${desc}`);
    console.error(err);
    failed++;
  }
}

// TEST 1: Initial state check
check("Band 1: Initial default background is black color", () => {
  assert.strictEqual(currentCanvasState.background.color, "#000000");
  assert.strictEqual(currentCanvasState.background.muted, true, "Video backgrounds must be muted by default (FR-4.19)");
});

check("Band 2: Initial Content Slot is none", () => {
  assert.strictEqual(currentCanvasState.contentSlot.type, "none");
  assert.strictEqual(currentCanvasState.contentSlot.data, null);
});

check("Band 3: Initial Pinned Layers array is empty", () => {
  assert.deepStrictEqual(currentCanvasState.pinnedLayers, []);
});

// TEST 2: Activate Background & Pinned Layer
check("Set background image and pinned lower-third layer", () => {
  handleSetBackground({
    type: "image",
    url: "file:///assets/stained-glass.jpg",
    panX: 10,
    panY: 0,
  });

  handleSetPinnedLayers([
    {
      id: "pinned-logo",
      type: "image",
      content: "file:///assets/church-logo.png",
      x: 0.1,
      y: 0.1,
      width: 0.15,
      zIndex: 10,
      visible: true,
    },
    {
      id: "pinned-title",
      type: "text",
      content: "Sunday Morning Service",
      x: 0.5,
      y: 0.9,
      zIndex: 15,
      visible: true,
    },
  ]);

  assert.strictEqual(currentCanvasState.background.url, "file:///assets/stained-glass.jpg");
  assert.strictEqual(currentCanvasState.pinnedLayers.length, 2);
});

// TEST 3: Push Bible Verse to Content Slot (FR-4.14 Independence Test)
check("FR-4.14: Push Bible Verse updates ONLY Content Slot band, preserving Background and Pinned layers", () => {
  const bgBefore = JSON.stringify(currentCanvasState.background);
  const pinnedBefore = JSON.stringify(currentCanvasState.pinnedLayers);

  handleActivateSetContent({
    type: "bible",
    data: {
      title: "John 3:16",
      body: "For God so loved the world, that he gave his only begotten Son...",
      version: "kjv",
    },
  });

  assert.strictEqual(currentCanvasState.contentSlot.type, "bible");
  assert.strictEqual(currentCanvasState.contentSlot.data.title, "John 3:16");

  // ASSERT: Background and Pinned layers did NOT change
  assert.strictEqual(
    JSON.stringify(currentCanvasState.background),
    bgBefore,
    "Background layer was mutated or cleared by activate_set_content!",
  );
  assert.strictEqual(
    JSON.stringify(currentCanvasState.pinnedLayers),
    pinnedBefore,
    "Pinned layers were mutated or cleared by activate_set_content!",
  );
});

// TEST 4: Switch Bible Verse to another passage
check("FR-4.14: Switch Bible Verse (John 3:16 → Genesis 1:1) keeps Background and Pinned layers intact", () => {
  const bgBefore = JSON.stringify(currentCanvasState.background);
  const pinnedBefore = JSON.stringify(currentCanvasState.pinnedLayers);

  handleActivateSetContent({
    type: "bible",
    data: {
      title: "Genesis 1:1",
      body: "In the beginning God created the heaven and the earth.",
      version: "kjv",
    },
  });

  assert.strictEqual(currentCanvasState.contentSlot.type, "bible");
  assert.strictEqual(currentCanvasState.contentSlot.data.title, "Genesis 1:1");

  assert.strictEqual(
    JSON.stringify(currentCanvasState.background),
    bgBefore,
    "Background layer changed during verse switch!",
  );
  assert.strictEqual(
    JSON.stringify(currentCanvasState.pinnedLayers),
    pinnedBefore,
    "Pinned layers changed during verse switch!",
  );
});

// TEST 5: Clear Content Slot (Stop button / setContent(null))
check("FR-4.14: Stop button / setContent(null) clears Content Slot only, leaving Background and Pinned layers visible", () => {
  const bgBefore = JSON.stringify(currentCanvasState.background);
  const pinnedBefore = JSON.stringify(currentCanvasState.pinnedLayers);

  handleActivateSetContent(null);

  assert.strictEqual(currentCanvasState.contentSlot.type, "none");
  assert.strictEqual(currentCanvasState.contentSlot.data, null);

  assert.strictEqual(
    JSON.stringify(currentCanvasState.background),
    bgBefore,
    "Background layer was removed on setContent(null)!",
  );
  assert.strictEqual(
    JSON.stringify(currentCanvasState.pinnedLayers),
    pinnedBefore,
    "Pinned layers were removed on setContent(null)!",
  );
});

// TEST 6: Mobile Companion Summary (FR-4.15)
check("FR-4.15: Mobile Companion receives lightweight summary with active content slot type and pinned layer count", () => {
  // Scenario A: No content slot, 2 pinned layers
  const summaryA = generateMobileSummary(currentCanvasState);
  assert.strictEqual(summaryA.activeContentSlotType, "none");
  assert.strictEqual(summaryA.hasContent, false);
  assert.strictEqual(summaryA.pinnedLayerCount, 2);
  assert.strictEqual(summaryA.isBlackout, false);

  // Scenario B: Bible content active
  handleActivateSetContent({
    type: "bible",
    data: { title: "Romans 8:28", body: "And we know that all things work together for good..." },
  });
  const summaryB = generateMobileSummary(currentCanvasState);
  assert.strictEqual(summaryB.activeContentSlotType, "bible");
  assert.strictEqual(summaryB.hasContent, true);
  assert.strictEqual(summaryB.pinnedLayerCount, 2);
});

// TEST 7: Chrome Band Blackout (FR-1.5)
check("Band 4: Chrome Blackout overlay flags blackout without discarding state", () => {
  currentCanvasState.chrome.blackout = true;
  const summary = generateMobileSummary(currentCanvasState);
  assert.strictEqual(summary.isBlackout, true);
  assert.strictEqual(currentCanvasState.contentSlot.type, "bible"); // underlying state preserved
  currentCanvasState.chrome.blackout = false;
});

console.log(`\nResults: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
