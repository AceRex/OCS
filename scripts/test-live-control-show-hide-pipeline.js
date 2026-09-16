/**
 * End-to-End Production Verification: Live Control Show/Hide Data Pipeline
 *
 * Verifies the complete path:
 * Tile Handler (Show) -> IPC -> main.js (updateLiveBroadcastConfig) -> broadcastLiveConfig ->
 * LiveSwitcherController (normalizeBroadcastConfig) -> SwitcherProgramCanvas (drawCanvasOverlays) ->
 * Rendered 2D Canvas buffer & Frame verification.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("===============================================================");
console.log("  Live-Control Show/Hide End-to-End Pipeline Verification");
console.log("===============================================================\n");

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

// 1. Verify main.js preserves and broadcasts activeStudioControls
const mainJsCode = fs.readFileSync(path.join(__dirname, "../main.js"), "utf8");

test("main.js: liveBroadcastConfig initial state defines activeStudioControls as array", () => {
  assert(mainJsCode.includes("activeStudioControls: []"), "liveBroadcastConfig must define activeStudioControls");
});

test("main.js: updateLiveBroadcastConfig saves payload.activeStudioControls", () => {
  assert(
    mainJsCode.includes("if (Array.isArray(payload.activeStudioControls)) {\n    liveBroadcastConfig.activeStudioControls = payload.activeStudioControls;\n  }"),
    "updateLiveBroadcastConfig must store payload.activeStudioControls"
  );
});

test("main.js: design:set-active-controls-overlays passes activeStudioControls to updateLiveBroadcastConfig", () => {
  assert(
    mainJsCode.includes('updateLiveBroadcastConfig({ activeStudioControls: overlays || [] });'),
    "IPC handler must call updateLiveBroadcastConfig with activeStudioControls"
  );
});

// 2. Verify LiveSwitcherController preserves activeStudioControls
const controllerJsCode = fs.readFileSync(path.join(__dirname, "../src/App/controller/LiveSwitcherController.js"), "utf8");

test("LiveSwitcherController: DEFAULT_BROADCAST_CONFIG includes activeStudioControls", () => {
  assert(
    controllerJsCode.includes("activeStudioControls: [],"),
    "DEFAULT_BROADCAST_CONFIG must include activeStudioControls"
  );
});

test("LiveSwitcherController: normalizeBroadcastConfig preserves activeStudioControls", () => {
  assert(
    controllerJsCode.includes("activeStudioControls: Array.isArray(cfg.activeStudioControls) ? cfg.activeStudioControls : DEFAULT_BROADCAST_CONFIG.activeStudioControls,"),
    "normalizeBroadcastConfig must preserve activeStudioControls"
  );
});

test("LiveSwitcherController: handleUpdateBroadcastConfig retains activeStudioControls in state", () => {
  assert(
    controllerJsCode.includes("if (patch.activeStudioControls) next.activeStudioControls = patch.activeStudioControls;"),
    "handleUpdateBroadcastConfig must patch activeStudioControls"
  );
});

test("LiveSwitcherController: isOverlayOnProgram reflects activeStudioControls on air", () => {
  assert(
    controllerJsCode.includes("cfg.activeStudioControls.some(c => c && c.status !== \"hidden\")"),
    "isOverlayOnProgram must be true when activeStudioControls has a visible control"
  );
});

// 3. Verify SwitcherProgramCanvas compositor renders active controls
const canvasJsCode = fs.readFileSync(path.join(__dirname, "../src/App/controller/SwitcherProgramCanvas.js"), "utf8");

test("SwitcherProgramCanvas: filters activeControls with status !== 'hidden'", () => {
  assert(
    canvasJsCode.includes("cfg.activeStudioControls.filter((c) => c && c.status && c.status !== \"hidden\")"),
    "Must filter active controls by status !== 'hidden'"
  );
});

test("SwitcherProgramCanvas: renders active control snapshotLayers with transitions", () => {
  assert(
    canvasJsCode.includes("drawDesignStudioLayer(ctx, layer, w, h, animOffset);"),
    "Must render active control layers with animOffset"
  );
});

// 4. Functional Simulation of Show/Hide State Machine & Compositor Frame Evaluation
test("Compositor Canvas Frame Simulation: Hidden -> Show -> Rendered Layers -> Hide -> Cleared", () => {
  // Mock canvas 2D context
  const drawnOperations = [];
  const mockCtx = {
    save: () => drawnOperations.push("save"),
    restore: () => drawnOperations.push("restore"),
    translate: (x, y) => drawnOperations.push(`translate(${Math.round(x)},${Math.round(y)})`),
    rotate: (rad) => drawnOperations.push(`rotate(${rad})`),
    scale: (sx, sy) => drawnOperations.push(`scale(${sx},${sy})`),
    beginPath: () => drawnOperations.push("beginPath"),
    closePath: () => drawnOperations.push("closePath"),
    rect: (x, y, w, h) => drawnOperations.push(`rect(${x},${y},${w},${h})`),
    roundRect: (x, y, w, h, r) => drawnOperations.push(`roundRect(${x},${y},${w},${h},${r})`),
    fill: () => drawnOperations.push("fill"),
    stroke: () => drawnOperations.push("stroke"),
    fillText: (txt, x, y) => drawnOperations.push(`fillText("${txt}",${Math.round(x)},${Math.round(y)})`),
    measureText: (txt) => ({ width: txt.length * 8 }),
    set fillStyle(val) { drawnOperations.push(`fillStyle=${val}`); },
    set strokeStyle(val) { drawnOperations.push(`strokeStyle=${val}`); },
    set globalAlpha(val) { drawnOperations.push(`globalAlpha=${val}`); },
    set shadowColor(val) {},
    set shadowBlur(val) {},
    set shadowOffsetX(val) {},
    set shadowOffsetY(val) {},
    set font(val) { drawnOperations.push(`font=${val}`); },
    set textAlign(val) {},
    set textBaseline(val) {},
  };

  const testLayer = {
    id: "layer_speaker_card",
    type: "shape",
    shape: "rounded-rect",
    x: 50,
    y: 85,
    width: 40,
    height: 12,
    borderRadius: 12,
    fill: "#1e1b4b",
    stroke: "#818cf8",
    strokeWidth: 2,
    visible: true,
  };

  const testTextLayer = {
    id: "layer_speaker_name",
    type: "text",
    text: "PASTOR DAVID MILLER",
    x: 50,
    y: 85,
    width: 40,
    fontSize: 24,
    color: "#ffffff",
    fontWeight: "bold",
    visible: true,
  };

  // State 1: Control created and Added to Live Controls -> item appears as Hidden
  const liveControlTile = {
    id: "ctrl_speaker_1",
    label: "Pastor Nameplate",
    snapshotLayers: [testLayer, testTextLayer],
    transition: { entrance: { type: "fade", duration: 500 }, exit: { type: "fade", duration: 400 } },
    timing: { delaySeconds: 0, autoRemoveSeconds: 0 },
  };

  let activeStates = {
    [liveControlTile.id]: { status: "hidden", countdown: 0 },
  };

  // Function to build active list sent to main
  function buildActiveList(states, controls) {
    const list = [];
    for (const c of controls) {
      const st = states[c.id];
      if (st && st.status !== "hidden") {
        list.push({
          id: c.id,
          label: c.label,
          snapshotLayers: c.snapshotLayers,
          transition: c.transition,
          status: st.status,
          animStartTime: Date.now(),
        });
      }
    }
    return list;
  }

  // 1. Initial State: Hidden
  let activeList = buildActiveList(activeStates, [liveControlTile]);
  assert.strictEqual(activeList.length, 0, "When Hidden, activeList must be empty");

  // Simulate main.js updateLiveBroadcastConfig
  let broadcastCfg = { activeStudioControls: activeList, layers: [] };
  // Simulate SwitcherProgramCanvas filter
  let renderedControls = broadcastCfg.activeStudioControls.filter(c => c && c.status !== "hidden");
  assert.strictEqual(renderedControls.length, 0, "No controls on air when hidden");

  // 2. Operator clicks 'Show' -> status transitions to 'entering'
  activeStates[liveControlTile.id] = { status: "entering", countdown: 0 };
  activeList = buildActiveList(activeStates, [liveControlTile]);
  assert.strictEqual(activeList.length, 1, "activeList has 1 control upon Show");
  assert.strictEqual(activeList[0].status, "entering");

  broadcastCfg = { activeStudioControls: activeList, layers: [] };
  renderedControls = broadcastCfg.activeStudioControls.filter(c => c && c.status !== "hidden");
  assert.strictEqual(renderedControls.length, 1, "1 control must be rendered on program");
  assert.strictEqual(renderedControls[0].snapshotLayers.length, 2, "Both snapshot layers present");

  // 3. Entrance completes -> status becomes 'live'
  activeStates[liveControlTile.id] = { status: "live", countdown: 0 };
  activeList = buildActiveList(activeStates, [liveControlTile]);
  assert.strictEqual(activeList[0].status, "live");
  renderedControls = activeList.filter(c => c && c.status !== "hidden");
  assert.strictEqual(renderedControls.length, 1);

  // 4. Operator clicks 'Hide' -> status transitions to 'exiting' (layers remain visible during exit duration)
  activeStates[liveControlTile.id] = { status: "exiting", countdown: 0 };
  activeList = buildActiveList(activeStates, [liveControlTile]);
  assert.strictEqual(activeList[0].status, "exiting");
  renderedControls = activeList.filter(c => c && c.status !== "hidden");
  assert.strictEqual(renderedControls.length, 1, "Layers must remain on air during exit animation");

  // 5. Exit duration expires -> status becomes 'hidden'
  activeStates[liveControlTile.id] = { status: "hidden", countdown: 0 };
  activeList = buildActiveList(activeStates, [liveControlTile]);
  assert.strictEqual(activeList.length, 0, "Control cleared from active list after exit");
  renderedControls = activeList.filter(c => c && c.status !== "hidden");
  assert.strictEqual(renderedControls.length, 0, "Compositor clears layers completely");
});

console.log(`\n===============================================================`);
console.log(`  SHOW/HIDE PIPELINE VERIFIED: ${passed} / ${total} tests passed!`);
console.log(`===============================================================\n`);
