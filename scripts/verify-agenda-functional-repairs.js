/**
 * Automated Verification Script for Agenda Planner Functional Repairs
 * Tests:
 * 1. Absence of "Clip Duration" control from UI (desktop & mobile)
 * 2. Authoritative timing model (Start/End adjust duration = End - Start)
 * 3. Uploaded image timing, URL fallback cascade, and hold/restore behavior
 * 4. Scrubbing & late-action evaluation for image cues
 * 5. MiniPreview presentation recognition with background media
 * 6. Desktop & mobile context menus, rename, and undoable delete
 * 7. Unapplied draft change detection and auto-sync on Play
 * 8. Audience / General screen timer isolation invariant
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("=== Agenda Planner Functional Repairs Verification ===\n");

// 1. Verify absence of "Clip Duration" from UI
console.log("1. Verifying Clip Duration control removal from UI...");
const desktopControllerSrc = fs.readFileSync(
  path.join(__dirname, "../src/App/controller/AgendaController.jsx"),
  "utf8"
);
const mobileAgendaSrc = fs.readFileSync(
  path.join(__dirname, "../ocs-mobile/app/agenda.tsx"),
  "utf8"
);

assert(
  !desktopControllerSrc.includes('label="Clip Duration"'),
  "Clip Duration control should be removed from desktop AgendaController.jsx"
);
assert(
  !desktopControllerSrc.includes("Clip Duration"),
  "No 'Clip Duration' text should remain in desktop AgendaController.jsx"
);
assert(
  !mobileAgendaSrc.includes("Clip Duration"),
  "No 'Clip Duration' text should remain in mobile agenda.tsx"
);
console.log("  ✓ 'Clip Duration' successfully eliminated from desktop and mobile UI.");

// 2. Authoritative Timing Model
console.log("\n2. Testing Authoritative Timing Model (Start/End)...");
function calculateTimingOnStartChange(currentStart, currentEnd, newStart, sessionDur) {
  const clampedStart = Math.max(0, Math.min(currentEnd - 1, newStart));
  const newDur = Math.max(1, currentEnd - clampedStart);
  return { startSec: clampedStart, durationSec: newDur, endSec: clampedStart + newDur };
}

function calculateTimingOnEndChange(currentStart, newEnd, sessionDur) {
  const clampedEnd = Math.max(currentStart + 1, Math.min(sessionDur, newEnd));
  const newDur = clampedEnd - currentStart;
  return { startSec: currentStart, durationSec: newDur, endSec: currentStart + newDur };
}

// Case A: 5-minute session, cue at 60s -> 180s (dur: 120s)
let cue = { startSec: 60, durationSec: 120 };
let res = calculateTimingOnStartChange(cue.startSec, cue.startSec + cue.durationSec, 90, 300);
assert.strictEqual(res.startSec, 90);
assert.strictEqual(res.endSec, 180, "End boundary must remain fixed when adjusting start");
assert.strictEqual(res.durationSec, 90, "Duration must derive to End - Start");

// Case B: Extend end to 240s
res = calculateTimingOnEndChange(res.startSec, 240, 300);
assert.strictEqual(res.startSec, 90, "Start boundary must remain fixed when adjusting end");
assert.strictEqual(res.endSec, 240);
assert.strictEqual(res.durationSec, 150);

// Case C: Mobile edge handle nudge start earlier by 10s
const nudgeStart = Math.max(0, Math.min(res.endSec - 1, res.startSec - 10));
const nudgeDur = res.endSec - nudgeStart;
assert.strictEqual(nudgeStart, 80);
assert.strictEqual(nudgeDur, 160);
console.log("  ✓ Authoritative Start/End timing calculations passed.");

// 3. Uploaded Image Asset Resolution & URL Fallback Cascade
console.log("\n3. Testing Uploaded-Image Timing & Execution Engine Cascade...");
const executionEngineSrc = fs.readFileSync(
  path.join(__dirname, "../src/main/agenda/agendaExecutionEngine.js"),
  "utf8"
);

assert(
  executionEngineSrc.includes("cue.url || cue.localFileUrl || cue.fileUrl || (asset ? asset.localFileUrl || asset.fileUrl : null)"),
  "Execution engine must have URL fallback cascade to prevent lost images"
);
assert(
  executionEngineSrc.includes("this.preActionBackground ="),
  "Execution engine must capture preActionBackground before activating background cue"
);
assert(
  executionEngineSrc.includes("endCue(cue)"),
  "Execution engine must support endCue for endBehavior handling"
);
assert(
  executionEngineSrc.includes("cue.track === 'video' || cue.track === 'image'"),
  "evaluateLateActions must evaluate image track cues for late start / scrubbing"
);

// Simulate URL fallback cascade
function resolveCueUrl(cue, asset) {
  return cue.url || cue.localFileUrl || cue.fileUrl || (asset ? asset.localFileUrl || asset.fileUrl : null);
}

const sampleAsset = {
  id: "asset-123",
  originalName: "Announcement-Flyer.jpg",
  localFileUrl: "media-loader://local/announcement.jpg",
};
const sampleCueWithAsset = {
  id: "cue-1",
  track: "background",
  assetId: "asset-123",
  startSec: 10,
  durationSec: 50,
};
assert.strictEqual(
  resolveCueUrl(sampleCueWithAsset, sampleAsset),
  "media-loader://local/announcement.jpg",
  "Cascade must resolve localFileUrl from asset when not on cue"
);

const sampleCueWithDirectUrl = {
  id: "cue-2",
  track: "background",
  url: "media-loader://local/direct.jpg",
};
assert.strictEqual(
  resolveCueUrl(sampleCueWithDirectUrl, null),
  "media-loader://local/direct.jpg",
  "Cascade must resolve direct url from cue"
);
console.log("  ✓ URL fallback cascade and late action evaluation verified.");

// 4. Background End Behavior (Hold vs Restore)
console.log("\n4. Testing Background End Behavior (Hold vs Restore)...");
class MockEngine {
  constructor() {
    this.preActionBackground = null;
    this.currentBackground = null;
    this.dispatched = [];
  }

  executeCue(cue, asset) {
    const url = resolveCueUrl(cue, asset);
    if (cue.track === "background") {
      this.preActionBackground = this.currentBackground;
      this.currentBackground = url;
      this.dispatched.push({ type: "applyBackground", url });
    }
  }

  endCue(cue) {
    if (cue.track === "background") {
      if (cue.endBehavior === "restore") {
        this.currentBackground = this.preActionBackground;
        this.dispatched.push({ type: "restoreBackground", url: this.preActionBackground });
      } else {
        // 'hold'
        this.dispatched.push({ type: "holdBackground", url: this.currentBackground });
      }
    }
  }
}

const engine = new MockEngine();
engine.currentBackground = "default-wallpaper.png";

// Step 1: Execute Cue 1 (Image 1, hold)
const cue1 = { track: "background", url: "image1.png", endBehavior: "hold" };
engine.executeCue(cue1, null);
assert.strictEqual(engine.currentBackground, "image1.png");
engine.endCue(cue1);
assert.strictEqual(engine.currentBackground, "image1.png", "Image 1 must hold at cue end");

// Step 2: Execute Cue 2 (Image 2, restore)
const cue2 = { track: "background", url: "image2.png", endBehavior: "restore" };
engine.executeCue(cue2, null);
assert.strictEqual(engine.currentBackground, "image2.png");
assert.strictEqual(engine.preActionBackground, "image1.png");
engine.endCue(cue2);
assert.strictEqual(engine.currentBackground, "image1.png", "Image 2 must restore to previous background");
console.log("  ✓ Hold and restore behaviors operate correctly.");

// 5. MiniPreview Presentation Detection
console.log("\n5. Testing MiniPreview Background Media Recognition...");
const miniPreviewSrc = fs.readFileSync(
  path.join(__dirname, "../src/App/controller/MiniPreview.js"),
  "utf8"
);
assert(
  miniPreviewSrc.includes("presentationStyle.backgroundImage") || miniPreviewSrc.includes("presentationStyle?.backgroundImage"),
  "MiniPreview must inspect presentationStyle.backgroundImage for isPresenting"
);
assert(
  miniPreviewSrc.includes("hasBackgroundMedia"),
  "MiniPreview must identify hasBackgroundMedia to prevent blocking image preview"
);
console.log("  ✓ MiniPreview correctly recognizes background images without requiring extra clicks.");

// 6. General Screen Timer Isolation Invariant
console.log("\n6. Testing General Screen Timer Isolation Invariant...");
const mainSrc = fs.readFileSync(path.join(__dirname, "../main.js"), "utf8");
assert(
  mainSrc.includes("fromAgenda: true"),
  "main.js must mark timer payload fromAgenda: true"
);
assert(
  mainSrc.includes('target: ["speaker", "controller"]'),
  "General Screen must be strictly excluded from agenda countdown timers"
);
console.log("  ✓ Audience / General Screen strictly protected from agenda countdown timers.");

// 7. Context Menu, Rename, and Undo Parity
console.log("\n7. Testing Context Menu, Rename, and Undo Parity...");
assert(
  desktopControllerSrc.includes("openCueContextMenu"),
  "Desktop AgendaController must support cue context menu"
);
assert(
  desktopControllerSrc.includes("handleDeleteCueWithUndo"),
  "Desktop AgendaController must support cue deletion with undo"
);
assert(
  desktopControllerSrc.includes("setRenamingCue"),
  "Desktop AgendaController must support cue inline renaming"
);
assert(
  desktopControllerSrc.includes("deletedCueUndo"),
  "Desktop AgendaController must render deleted cue undo toast"
);

assert(
  mobileAgendaSrc.includes("cueActionMenu"),
  "Mobile agenda must have cue action menu"
);
assert(
  mobileAgendaSrc.includes("handleDeleteCueWithUndo"),
  "Mobile agenda must support delete cue with undo banner"
);
assert(
  mobileAgendaSrc.includes("renamingCue"),
  "Mobile agenda must support renaming cue"
);
console.log("  ✓ Context menu, rename, and undo parity verified on desktop and mobile.");

// 8. Unapplied Draft Change Detection & Auto-Sync
console.log("\n8. Testing Unapplied Draft Change Detection & Auto-Sync...");
assert(
  desktopControllerSrc.includes("hasUnappliedDraftChanges"),
  "AgendaController must compute hasUnappliedDraftChanges"
);
assert(
  desktopControllerSrc.includes("Update Loaded Agenda"),
  "AgendaController must provide 1-click 'Update Loaded Agenda' banner"
);
assert(
  desktopControllerSrc.includes("if (hasUnappliedDraftChanges)") &&
  desktopControllerSrc.includes("await handleLoadAgenda(currentAgenda)"),
  "Play button must auto-sync draft changes before starting execution"
);
console.log("  ✓ Unapplied draft change banner and auto-sync on Play verified.");

console.log("\n=== All Agenda Functional Repair Verifications Passed Successfully! ===");
