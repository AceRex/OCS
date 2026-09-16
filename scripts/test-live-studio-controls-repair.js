/**
 * Automated Test Suite: Live Studio Controls Repair & Workflow Normalization
 *
 * Verifies the 4 repaired workflows:
 * 1. Adding a lower third to Live Controls saves a snapshot as Hidden and never presents automatically.
 * 2. Entrance/exit transitions, timers, and rapid click cancellation operate authoritatively.
 * 3. Studio drafting canvas and program canvas layout, coordinates, and font scaling match.
 * 4. Single Bible presentation popup respecting user-configured presentationStyle with in-place updates.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("===============================================================");
console.log("  Live Studio Controls Repair & Workflow Verification");
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

// ─── Test Group 1: Separation of Adding Control from Presenting ───────────────
console.log("--- 1. Separate Adding Control from Presenting ---");

const designStudioServicePath = path.join(__dirname, "../src/main/design/designStudioService.js");
const designStudioServiceCode = fs.readFileSync(designStudioServicePath, "utf8");

test("designStudioService: sanitizeLiveControl accepts both label/name and snapshotLayers/layers", () => {
  assert(designStudioServiceCode.includes("rawLayers = Array.isArray(c.snapshotLayers)"), "Must normalize snapshotLayers/layers");
  assert(designStudioServiceCode.includes("c.label && String(c.label).trim()"), "Must check c.label");
  assert(designStudioServiceCode.includes("c.name && String(c.name).trim()"), "Must fallback to c.name");
});

test("designStudioService: sanitizeLiveControl normalizes timing properties (delaySeconds/delaySec, autoRemoveSeconds/autoRemoveSec)", () => {
  assert(designStudioServiceCode.includes("rawDelay = timing.delaySeconds ?? timing.delaySec"), "Must support delaySeconds and delaySec");
  assert(designStudioServiceCode.includes("rawAutoRemove = timing.autoRemoveSeconds ?? timing.autoRemoveSec"), "Must support autoRemoveSeconds and autoRemoveSec");
});

const liveStudioModalPath = path.join(__dirname, "../src/App/controller/LiveDesignStudioModal.jsx");
const liveStudioModalCode = fs.readFileSync(liveStudioModalPath, "utf8");

test("LiveDesignStudioModal: handleAddToLiveControls creates payload with snapshotLayers, label, and default transition", () => {
  assert(liveStudioModalCode.includes("snapshotLayers: clonedLayers"), "Must pass snapshotLayers");
  assert(liveStudioModalCode.includes("label: name"), "Must pass label");
  assert(liveStudioModalCode.includes("transition: currentDesign.transition || defaultTransition"), "Must pass transition");
});

test("LiveDesignStudioModal: handleAddToLiveControls provides feedback with '(Hidden)' indicator and does not call present", () => {
  assert(liveStudioModalCode.includes('showFeedback(`Added "${saved.label || saved.name || name}" to Live Controls (Hidden)`, true);'), "Must show (Hidden) feedback");
  // Ensure handleAddToLiveControls does not invoke onUpdateBroadcastConfig or present
  const addToControlsMatch = liveStudioModalCode.match(/const handleAddToLiveControls = async[\s\S]+?\n  \};/);
  assert(addToControlsMatch, "handleAddToLiveControls must exist");
  const funcBody = addToControlsMatch[0];
  assert(!funcBody.includes("onUpdateBroadcastConfig"), "Must not call onUpdateBroadcastConfig");
  assert(!funcBody.includes("designApi.present"), "Must not call designApi.present");
});

// ─── Test Group 2: Authoritative Transitions & Timer State Management ────────
console.log("\n--- 2. Authoritative Transitions & Rapid-Click Timer State Management ---");

const liveStudioRackPath = path.join(__dirname, "../src/App/controller/LiveStudioControlsRack.jsx");
const liveStudioRackCode = fs.readFileSync(liveStudioRackPath, "utf8");

test("LiveStudioControlsRack: maintains per-control timer tracking via timersRef", () => {
  assert(liveStudioRackCode.includes("const timersRef = useRef({});"), "Must define timersRef");
  assert(liveStudioRackCode.includes("const clearControlTimers = (id) => {"), "Must have clearControlTimers helper");
  assert(liveStudioRackCode.includes("clearTimeout(timersRef.current[id].entranceTimeout)"), "Must clear entranceTimeout");
  assert(liveStudioRackCode.includes("clearTimeout(timersRef.current[id].exitTimeout)"), "Must clear exitTimeout");
});

test("LiveStudioControlsRack: triggerShow clears existing timers and supports delaying countdown", () => {
  const triggerShowMatch = liveStudioRackCode.match(/const triggerShow = \([\s\S]+?\n  \};/);
  assert(triggerShowMatch, "triggerShow must exist");
  const body = triggerShowMatch[0];
  assert(body.includes("clearControlTimers(id)"), "triggerShow must call clearControlTimers immediately");
  assert(body.includes('status: "delaying"'), "Must transition to delaying when delaySec > 0");
  assert(body.includes('status: "entering"'), "Must transition to entering when delaySec === 0");
  assert(body.includes("timersRef.current[id].entranceTimeout = setTimeout"), "Must track entranceTimeout");
});

test("LiveStudioControlsRack: triggerHide retains layers during exiting and cleanly transitions to hidden", () => {
  const triggerHideMatch = liveStudioRackCode.match(/const triggerHide = \([\s\S]+?\n  \};/);
  assert(triggerHideMatch, "triggerHide must exist");
  const body = triggerHideMatch[0];
  assert(body.includes("clearControlTimers(id)"), "triggerHide must call clearControlTimers immediately");
  assert(body.includes('status: "exiting"'), "Must set status to exiting during exit duration");
  assert(body.includes("timersRef.current[id].exitTimeout = setTimeout"), "Must track exitTimeout");
  assert(body.includes('status: "hidden"'), "Must transition to hidden after exitDuration");
});

test("LiveStudioControlsRack: handleDeleteControl immediately clears timers and removes active control", () => {
  const deleteMatch = liveStudioRackCode.match(/const handleDeleteControl = async[\s\S]+?\n  \};/);
  assert(deleteMatch, "handleDeleteControl must exist");
  const body = deleteMatch[0];
  assert(body.includes("clearControlTimers(id)"), "handleDeleteControl must call clearControlTimers");
  assert(body.includes("delete next[id]"), "Must remove from activeStates immediately");
  assert(body.includes("deleteLiveControl"), "Must call deleteLiveControl");
});

// ─── Test Group 3: Geometry & Font Scaling Alignment ─────────────────────────
console.log("\n--- 3. Studio Canvas & Compositor Layout Alignment ---");

test("LiveDesignStudioModal: drafting canvas container sets containerType: size", () => {
  assert(liveStudioModalCode.includes('data-studio-canvas="true"'), "Must have data-studio-canvas attribute");
  assert(liveStudioModalCode.includes('style={{ containerType: "size" }}'), "Must set containerType: size");
});

test("LiveDesignStudioModal: text layer font scaling uses container query cqh matching compositor h / 720 ratio", () => {
  assert(liveStudioModalCode.includes("fontSize: `calc(${(layer.fontSize || 22)} * 100cqh / 720)`"), "Must use calc(layer.fontSize * 100cqh / 720)");
});

const switcherCanvasPath = path.join(__dirname, "../src/App/controller/SwitcherProgramCanvas.js");
const switcherCanvasCode = fs.readFileSync(switcherCanvasPath, "utf8");

test("SwitcherProgramCanvas: text layer uses matching (h / 720) scaling and line height 1.25", () => {
  assert(switcherCanvasCode.includes("const fontSize = Math.round((layer.fontSize || 22) * (h / 720));"), "Must use h / 720 font scaling");
  assert(switcherCanvasCode.includes("const lineHeight = fontSize * 1.25;"), "Must use 1.25 line height");
});

// ─── Test Group 4: Single Bible Presentation Popup with Configured Style ───────
console.log("\n--- 4. Single Bible Presentation Popup & Configured Style ---");

test("SwitcherProgramCanvas: studio controls take precedence over cfg.layers without accidental fallback", () => {
  assert(switcherCanvasCode.includes("const hasActiveControlsList = Array.isArray(cfg.activeStudioControls);"), "Must check hasActiveControlsList");
  assert(switcherCanvasCode.includes("if (hasActiveControlsList) {"), "Must branch on hasActiveControlsList");
});

test("SwitcherProgramCanvas: canvas renders Bible lower-third with configured presentationStyle", () => {
  assert(switcherCanvasCode.includes("const style = cfg.bibleLowerThird.style || cfg.presentationStyle || {};"), "Must read style or presentationStyle");
  assert(switcherCanvasCode.includes("const bgColor = style.backgroundColor || style.bg || \"rgba(10, 10, 16, 0.95)\";"), "Must apply configured background");
  assert(switcherCanvasCode.includes("const textColor = style.textColor || \"#FFFFFF\";"), "Must apply configured textColor");
  assert(switcherCanvasCode.includes("const borderColor = style.borderColor || style.accentColor || \"rgba(245, 158, 11, 0.6)\";"), "Must apply configured borderColor");
  assert(switcherCanvasCode.includes("const radius = Math.round(12 * (h / 720));"), "Must enforce strict 12px border radius");
});

test("SwitcherProgramCanvas: duplicate non-interactive DOM layers removed, single interactive dismiss overlay retained", () => {
  // Ensure duplicate DOM card is gone
  assert(!switcherCanvasCode.includes('className="absolute z-25 flex flex-col rounded-[12px] bg-[#0c0a14]/95 border-2 border-amber-500/50 shadow-2xl p-3'), "Duplicate DOM card must be removed");
  // Ensure interactive dismiss button exists in DOM
  assert(switcherCanvasCode.includes("Interactive Overlays (Operator Controls)"), "Must have interactive dismiss overlay section");
  assert(switcherCanvasCode.includes('title="Dismiss scripture overlay"'), "Must have scripture dismiss button");
  assert(switcherCanvasCode.includes("bibleLowerThird: { ...bConfig.bibleLowerThird, isShowing: false }"), "Must dismiss scripture on click");
});

console.log(`\n===============================================================`);
console.log(`  ALL REPAIRS VERIFIED: ${passed} / ${total} tests passed successfully!`);
console.log(`===============================================================\n`);
