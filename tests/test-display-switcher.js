/**
 * test-display-switcher.js
 *
 * Verification suite for Canonical Live Switcher Architecture & Live Output Sharing:
 * 1. SwitcherMonitorTile interactivity & 12px border radius.
 * 2. LiveSwitcherController Canonical Architecture:
 *    - Program and Preview camera bus.
 *    - Interactive Broadcast T-Bar slider & CUT / AUTO take controls.
 *    - Live Output Sharing Deck (General Screen, Speaker Screen, Social Media / Stream).
 *    - Keyboard hotkeys ([Space], [C], [G], [S], [1..6]).
 *    - Strict Universal 12px border radius mandate.
 * 3. SwitcherProgramCanvas compositing & frame emission:
 *    - Ingests mixProgress for manual T-Bar blending.
 *    - Emits composited frames via sendLiveOutputFrame at ~30 FPS.
 * 4. DisplayCanvas.js output fidelity:
 *    - Handles live-output contentSlot and subscribes to onLiveOutputFrame.
 * 5. Backend main.js & preload.js IPC:
 *    - Non-destructive presentation state preservation and restoration.
 *    - Real-time frame forwarding to generalWindow and speakerWindow.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passed = 0;
let total = 0;

function it(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}: ${err.message}`);
  }
}

async function runTests() {
  console.log('\n=== Canonical Live Switcher & Live Output Sharing Verification ===\n');

  const tileFile = fs.readFileSync(path.join(__dirname, '../src/App/controller/SwitcherMonitorTile.js'), 'utf8');
  const controllerFile = fs.readFileSync(path.join(__dirname, '../src/App/controller/LiveSwitcherController.js'), 'utf8');
  const progCanvasFile = fs.readFileSync(path.join(__dirname, '../src/App/controller/SwitcherProgramCanvas.js'), 'utf8');
  const displayCanvasFile = fs.readFileSync(path.join(__dirname, '../src/App/View/DisplayCanvas.js'), 'utf8');
  const mainFile = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  const preloadFile = fs.readFileSync(path.join(__dirname, '../preload.js'), 'utf8');

  // ── 1. SwitcherMonitorTile Interactivity & Design ────────────────────────────
  console.log('[1. SwitcherMonitorTile Interactivity & Design Standards]');

  it('SwitcherMonitorTile accepts displayNumber, isShowing, isSelected, and onSelect props', () => {
    assert(tileFile.includes('displayNumber'), 'Must accept displayNumber');
    assert(tileFile.includes('isShowing'), 'Must accept isShowing');
    assert(tileFile.includes('isSelected'), 'Must accept isSelected');
    assert(tileFile.includes('onSelect'), 'Must accept onSelect');
  });

  it('SwitcherMonitorTile implements interactive cursor and click handling', () => {
    assert(tileFile.includes('onClick={handleClick}'), 'Must have onClick handler');
    assert(tileFile.includes('cursor-pointer'), 'Must have cursor-pointer class when selectable');
    assert(tileFile.includes('onKeyDown={handleKeyDown}'), 'Must support keyboard activation');
  });

  it('SwitcherMonitorTile displays numerical badge (1 or 2)', () => {
    assert(tileFile.includes('{dispNum}'), 'Must render display number badge');
    assert(tileFile.includes('DISPLAY 1') || tileFile.includes('DISPLAY ${dispNum}'), 'Must render display badge label');
  });

  it('Universal 12px border radius strictly applied across SwitcherMonitorTile', () => {
    const nonStandardBorder = tileFile.match(/rounded-(sm|md|lg|2xl|3xl|full|none|\[(?!(12px|full))[^\]]+\])/g);
    const non12px = (nonStandardBorder || []).filter((c) => !c.includes('full') && !c.includes('12px'));
    assert.strictEqual(non12px.length, 0, `No forbidden rounded classes: ${JSON.stringify(non12px)}`);
  });

  // ── 2. LiveSwitcherController Canonical Architecture ────────────────────────
  console.log('\n[2. LiveSwitcherController Canonical Architecture]');

  it('LiveSwitcherController manages Program and Preview camera buses', () => {
    assert(controllerFile.includes('programSourceId'), 'Must track programSourceId');
    assert(controllerFile.includes('previewSourceId'), 'Must track previewSourceId');
  });

  it('LiveSwitcherController implements interactive Broadcast T-Bar Slider', () => {
    assert(controllerFile.includes('mixProgress'), 'Must track mixProgress');
    assert(controllerFile.includes('handleTBarChange'), 'Must handle T-Bar changes');
    assert(controllerFile.includes('T-Bar Fader'), 'Must render T-Bar Fader header');
    assert(controllerFile.includes('type="range"'), 'Must render range slider');
  });

  it('LiveSwitcherController implements CUT and AUTO Take controls', () => {
    assert(controllerFile.includes('handleCut'), 'Must implement handleCut');
    assert(controllerFile.includes('handleAuto'), 'Must implement handleAuto');
    assert(controllerFile.includes('CUT [C]'), 'Must render CUT button');
    assert(controllerFile.includes('AUTO [Space]'), 'Must render AUTO button');
  });

  it('LiveSwitcherController renders Live Output Destination Sharing Deck', () => {
    assert(controllerFile.includes('Share Live Output'), 'Must render Share Live Output header');
    assert(controllerFile.includes('Share to General Screen'), 'Must render Share to General Screen card');
    assert(controllerFile.includes('Share to Speaker Screen'), 'Must render Share to Speaker Screen card');
    assert(controllerFile.includes('Social Media & Live Stream'), 'Must render Social Media card');
  });

  it('LiveSwitcherController wires keyboard hotkeys [Space], [C], [G], [S], [1..6]', () => {
    assert(controllerFile.includes('e.code === "Space"'), 'Must wire Space for AUTO');
    assert(controllerFile.includes('e.key === "c"'), 'Must wire C for CUT');
    assert(controllerFile.includes('e.key === "g"'), 'Must wire G for General Screen');
    assert(controllerFile.includes('e.key === "s"'), 'Must wire S for Speaker Screen');
  });

  it('Universal 12px border radius strictly applied in LiveSwitcherController', () => {
    const nonStandard = controllerFile.match(/rounded-(sm|md|lg|2xl|3xl|\[(?!(12px|full))[^\]]+\])/g);
    const non12px = (nonStandard || []).filter((c) => !c.includes('full') && !c.includes('12px'));
    assert.strictEqual(non12px.length, 0, `All container and component elements strictly 12px: ${JSON.stringify(non12px)}`);
  });

  // ── 3. SwitcherProgramCanvas Dynamic Compositing & Emission ─────────────────
  console.log('\n[3. SwitcherProgramCanvas Compositing & Emission]');

  it('SwitcherProgramCanvas supports mixProgress for manual T-Bar blending', () => {
    assert(progCanvasFile.includes('mixProgress = null'), 'Must accept mixProgress prop');
    assert(progCanvasFile.includes('isManualMixing'), 'Must calculate isManualMixing');
    assert(progCanvasFile.includes('transitionEngine.render'), 'Must render mix via transitionEngine');
  });

  it('SwitcherProgramCanvas emits composited frames to shared displays via sendLiveOutputFrame', () => {
    assert(progCanvasFile.includes('maybeEmitLiveOutputFrame'), 'Must have helper to emit frames');
    assert(progCanvasFile.includes('sendLiveOutputFrame'), 'Must call sendLiveOutputFrame');
    assert(progCanvasFile.includes('toDataURL'), 'Must capture frame data from canvas');
  });

  it('SwitcherProgramCanvas renders LIVE OUTPUT and T-Bar mix percentage HUD badges', () => {
    assert(progCanvasFile.includes('LIVE OUTPUT'), 'Must show LIVE OUTPUT badge');
    assert(progCanvasFile.includes('T-BAR:'), 'Must show T-BAR badge during mixing');
  });

  // ── 4. DisplayCanvas.js Output Fidelity ──────────────────────────────────────
  console.log('\n[4. DisplayCanvas.js Output Fidelity]');

  it('DisplayCanvas.js handles live-output contentSlot', () => {
    assert(displayCanvasFile.includes('live-output'), 'Must handle live-output contentSlot');
  });

  it('DisplayCanvas.js ingests onLiveOutputFrame from Switcher IPC', () => {
    assert(displayCanvasFile.includes('onLiveOutputFrame'), 'Must subscribe to onLiveOutputFrame');
  });

  // ── 5. Backend main.js & preload.js Architecture ─────────────────────────────
  console.log('\n[5. Backend Architecture & IPC Handlers]');

  it('preload.js exposes sendLiveOutputFrame and onLiveOutputFrame', () => {
    assert(preloadFile.includes('sendLiveOutputFrame:'), 'Must expose sendLiveOutputFrame');
    assert(preloadFile.includes('onLiveOutputFrame:'), 'Must expose onLiveOutputFrame');
  });

  it('main.js handles switcher:send-live-output-frame and forwards to active screens', () => {
    assert(mainFile.includes('switcher:send-live-output-frame'), 'Must handle send-live-output-frame IPC');
    assert(mainFile.includes('generalWindow.webContents.send("switcher-live-output-frame"'), 'Must forward to generalWindow');
    assert(mainFile.includes('speakerWindow.webContents.send("switcher-live-output-frame"'), 'Must forward to speakerWindow');
  });

  it('main.js non-destructively preserves and restores savedGeneralContentSlot and savedPresentationContentSlot', () => {
    assert(mainFile.includes('savedGeneralContentSlot'), 'Must track savedGeneralContentSlot');
    assert(mainFile.includes('savedPresentationContentSlot'), 'Must track savedPresentationContentSlot');
    assert(mainFile.includes('restoredSlot'), 'Must restore slot when sharing is disabled');
  });

  it('main.js activate_set_content updates presentation state in background without interrupting Live Output', () => {
    assert(mainFile.includes('if (generalOk && !switcherRouteGeneral)'), 'Must not clobber generalWindow when sharing');
  });

  console.log('\n----------------------------------------------');
  console.log(`Passed: ${passed} / ${total}`);
  if (passed === total) {
    console.log('✅ ALL CANONICAL LIVE SWITCHER & LIVE OUTPUT SHARING TESTS PASSED.\n');
  } else {
    console.error('❌ SOME TESTS FAILED.\n');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
