/**
 * tests/test-live-broadcast-studio.js
 *
 * Automated Verification Suite for:
 * 1. Feature rename: "Live Switcher" -> "Live" across Desktop and Mobile
 * 2. Stage screen removal: Mobile navigation & route safety
 * 3. Universal 12px border radius adherence across all studio overlays & modal dialogs
 * 4. Broadcast studio configuration engine in main.js & socketStore.ts
 * 5. Bible scripture auto-triggering & 1-click manual trigger logic
 * 6. Live Program Canvas compositing & scaling support
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('\n=== Live Broadcast Studio & Overlay Engine Verification ===\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ─── 1. Universal 12px Border Radius Invariant ────────────────────────────────
console.log('[1. Universal 12px Border Radius Invariant in Studio Components]');

const mobileSwitcherCode = fs.readFileSync(path.join(__dirname, '../ocs-mobile/app/live-switcher.tsx'), 'utf8');
const desktopControllerCode = fs.readFileSync(path.join(__dirname, '../src/App/controller/LiveSwitcherController.js'), 'utf8');
const programCanvasCode = fs.readFileSync(path.join(__dirname, '../src/App/controller/SwitcherProgramCanvas.js'), 'utf8');

test('LiveSwitcherController.js studio modal and controls use 12px border radius', () => {
  assert(desktopControllerCode.includes('rounded-[12px]'), 'Must use 12px border radius in desktop controller');
  assert(desktopControllerCode.includes('STUDIO OVERLAYS'), 'Studio trigger button card must be present');
});

test('SwitcherProgramCanvas.js scaled frame and canvas overlays strictly use 12px border radius', () => {
  assert(programCanvasCode.includes('rounded-[12px]'), 'Must use 12px border radius in program canvas');
  const roundRectCalls = programCanvasCode.match(/ctx\.roundRect\([^)]+\)/g) || [];
  assert(roundRectCalls.length > 0, 'Must have roundRect calls');
  roundRectCalls.forEach((call) => {
    assert(call.includes('12'), `roundRect call must use 12px radius: ${call}`);
  });
});

test('Mobile live-switcher.tsx studio modal styles and overlays use 12px border radius', () => {
  assert(mobileSwitcherCode.includes('studioModalCard: {'), 'Must have studioModalCard');
  assert(mobileSwitcherCode.includes('studioActionBtn: {'), 'Must have studioActionBtn');
  assert(mobileSwitcherCode.includes('studioTextInput: {'), 'Must have studioTextInput');

  // Verify that all studio modal styling properties specify borderRadius: 12
  const studioStylesMatch = mobileSwitcherCode.match(/studio[A-Za-z]+:\s*\{[\s\S]*?\}/g) || [];
  studioStylesMatch.forEach((styleBlock) => {
    if (styleBlock.includes('borderRadius')) {
      assert(styleBlock.includes('borderRadius: 12'), `Studio style must specify borderRadius: 12: ${styleBlock}`);
    }
  });
});

// ─── 2. Feature Renamed to "Live" ─────────────────────────────────────────────
console.log('\n[2. Feature Renamed to "Live"]');

const sidebarCode = fs.readFileSync(path.join(__dirname, '../src/App/controller/Sidebar.js'), 'utf8');
const mobileHomeCode = fs.readFileSync(path.join(__dirname, '../ocs-mobile/app/index.tsx'), 'utf8');

test('Desktop Sidebar displays "Live" navigation label', () => {
  assert(sidebarCode.includes('label: "Live"'), 'Sidebar item label must be Live');
  assert(!sidebarCode.includes('label: "Live Switcher"'), 'Sidebar must not contain "Live Switcher" label');
});

test('Desktop LiveSwitcherController header displays "Live"', () => {
  assert(desktopControllerCode.includes('Live\n              <span className="text-[9px] font-bold px-2 py-0.5 rounded-[12px] bg-sky-500/20 text-sky-300 border border-sky-500/30">'), 'Desktop controller header must be Live');
});

test('Mobile Index displays "Live" card with "Broadcast Studio & Camera" description', () => {
  assert(mobileHomeCode.includes('label: "Live"'), 'Mobile home card label must be Live');
  assert(mobileHomeCode.includes('description: isSwitcherController ? "Broadcast Studio & Mixer" : "Broadcast Studio & Camera"'), 'Mobile card description updated');
});

test('Mobile live-switcher header displays "Live"', () => {
  assert(mobileSwitcherCode.includes('<Text className="text-base font-black text-white">Live</Text>'), 'Mobile live-switcher header must be Live');
});

// ─── 3. Stage Screen Removal ──────────────────────────────────────────────────
console.log('\n[3. Stage Screen Removed from Mobile Companion]');

const mobileLayoutCode = fs.readFileSync(path.join(__dirname, '../ocs-mobile/app/_layout.tsx'), 'utf8');
const mobileStageControlCode = fs.readFileSync(path.join(__dirname, '../ocs-mobile/app/stage-control.tsx'), 'utf8');

test('Mobile _layout.tsx no longer registers stage-control screen', () => {
  assert(!mobileLayoutCode.includes('name="stage-control"'), 'Stage control screen must be removed from stack layout');
});

test('Mobile index.tsx cards array no longer has stage-control', () => {
  assert(!mobileHomeCode.includes('stage-control'), 'Stage control must be removed from mobile home cards');
});

test('Mobile stage-control.tsx safely redirects to prevent route caching issues', () => {
  assert(mobileStageControlCode.includes('<Redirect href="/" />'), 'stage-control.tsx should redirect to home safely');
});

// ─── 4. Broadcast Studio Configuration & State Engine ────────────────────────
console.log('\n[4. Studio Configuration & State Engine in Backend & Mobile]');

const mainJsCode = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
const socketStoreCode = fs.readFileSync(path.join(__dirname, '../ocs-mobile/store/socketStore.ts'), 'utf8');
const preloadCode = fs.readFileSync(path.join(__dirname, '../preload.js'), 'utf8');

test('main.js defines default liveBroadcastConfig state with scaling, logo, lowerThird, bible, ticker', () => {
  assert(mainJsCode.includes('let liveBroadcastConfig = {'), 'main.js must define liveBroadcastConfig');
  assert(mainJsCode.includes('scale: 1.0'), 'Must include scale factor');
  assert(mainJsCode.includes('fitMode: "cover"'), 'Must include fitMode');
  assert(mainJsCode.includes('logo: {'), 'Must include logo configuration');
  assert(mainJsCode.includes('lowerThird: {'), 'Must include speaker lower third configuration');
  assert(mainJsCode.includes('bibleLowerThird: {'), 'Must include bible lower third configuration');
  assert(mainJsCode.includes('ticker: {'), 'Must include ticker configuration');
});

test('main.js handles socket "switcher:update-broadcast-config" and desktop IPC', () => {
  assert(mainJsCode.includes('socket.on("switcher:update-broadcast-config"'), 'Socket listener for broadcast config updates missing');
  assert(mainJsCode.includes('ipcMain.handle("switcher:update-broadcast-config-desktop"'), 'IPC handler for broadcast config updates missing');
  assert(mainJsCode.includes('ipcMain.handle("switcher:get-broadcast-config-desktop"'), 'IPC handler for get broadcast config missing');
});

test('main.js auto-triggers Bible scripture lower third on scripture presentation activation', () => {
  assert(mainJsCode.includes('value?.type === "bible" && liveBroadcastConfig.bibleLowerThird?.enabled && liveBroadcastConfig.bibleLowerThird?.autoTrigger'), 'main.js activate_set_content must check for bible type and autoTrigger');
  assert(mainJsCode.includes('liveBroadcastConfig.bibleLowerThird.isShowing = true;'), 'Must set isShowing to true on auto-trigger');
  assert(mainJsCode.includes('broadcastLiveConfig()'), 'Must broadcast live config to all listeners on scripture activation');
});

test('preload.js exposes updateBroadcastConfig, getBroadcastConfig, onBroadcastConfig', () => {
  assert(preloadCode.includes('updateBroadcastConfig: (config)'), 'preload missing updateBroadcastConfig');
  assert(preloadCode.includes('getBroadcastConfig: ()'), 'preload missing getBroadcastConfig');
  assert(preloadCode.includes('onBroadcastConfig: (callback)'), 'preload missing onBroadcastConfig');
});

test('Mobile socketStore.ts defines LiveBroadcastConfig and updateBroadcastConfig action', () => {
  assert(socketStoreCode.includes('export interface LiveBroadcastConfig'), 'Missing LiveBroadcastConfig interface');
  assert(socketStoreCode.includes('updateBroadcastConfig: (patch: Partial<LiveBroadcastConfig>)'), 'Missing updateBroadcastConfig store action');
  assert(socketStoreCode.includes("socket.emit('switcher:update-broadcast-config', patch,"), 'Store must emit switcher:update-broadcast-config');
});

// ─── 5. UI Controls & Canvas Compositing ─────────────────────────────────────
console.log('\n[5. UI Controls & Canvas Compositing]');

test('Desktop LiveSwitcherController provides Studio Modal button and Presentation-style Studio Engine', () => {
  assert(desktopControllerCode.includes('Studio Overlays & Layers') || desktopControllerCode.includes('Studio Overlays & Scaling'), 'Desktop controller must have Studio Overlays button');
  assert(desktopControllerCode.includes('studioModalTab === "layers"'), 'Studio modal must support layers tab');
  assert(desktopControllerCode.includes('studioModalTab === "media"'), 'Studio modal must support media library tab');
  assert(desktopControllerCode.includes('studioCanvasRef'), 'Studio modal must have interactive canvas ref');
  assert(desktopControllerCode.includes('handleStudioMouseDown'), 'Studio modal must support mouse interaction for layers');
});

test('Desktop SwitcherProgramCanvas composits scaling and overlays onto video frames', () => {
  assert(programCanvasCode.includes('broadcastConfig'), 'SwitcherProgramCanvas must accept broadcastConfig prop');
  assert(programCanvasCode.includes('drawCanvasOverlays(ctx, canvas.width, canvas.height, broadcastConfigRef.current);'), 'Must call drawCanvasOverlays');
  assert(programCanvasCode.includes('// 1. Watermark Logo'), 'Overlay pipeline draws logo bug');
  assert(programCanvasCode.includes('// 2. Bible Scripture Lower Third'), 'Overlay pipeline draws bible scripture');
  assert(programCanvasCode.includes('// 3. Speaker Lower Third'), 'Overlay pipeline draws speaker lower third');
  assert(programCanvasCode.includes('// 4. Live Announcement Ticker Banner'), 'Overlay pipeline draws announcement ticker');
});

test('Mobile live-switcher.tsx provides Studio button and interactive configuration modal', () => {
  assert(mobileSwitcherCode.includes('renderStudioModal()'), 'Mobile live-switcher must implement renderStudioModal');
  assert(mobileSwitcherCode.includes('setShowStudioModal(true)'), 'Mobile live-switcher must have studio modal trigger');
  assert(mobileSwitcherCode.includes('SHOW SCRIPTURE ON AIR NOW'), 'Mobile live-switcher studio modal has 1-Click trigger for scripture');
});

// ─── 6. Lower Third Designer & Compact Footprint ────────────────────────────
console.log('\n[6. Lower Third Designer & Compact Footprint]');

const lowerThirdGraphicCode = fs.readFileSync(path.join(__dirname, '../src/App/controller/LowerThirdGraphic.js'), 'utf8');

test('LowerThirdGraphic.js defines DEFAULT_LOWER_THIRD_STYLE, LOWER_THIRD_TEMPLATES, renderCustomLowerThirdUI', () => {
  assert(lowerThirdGraphicCode.includes('DEFAULT_LOWER_THIRD_STYLE = {'), 'Must export DEFAULT_LOWER_THIRD_STYLE');
  assert(lowerThirdGraphicCode.includes('LOWER_THIRD_TEMPLATES = ['), 'Must export LOWER_THIRD_TEMPLATES');
  assert(lowerThirdGraphicCode.includes('renderCustomLowerThirdUI = (lt) => {'), 'Must export renderCustomLowerThirdUI');
  assert(lowerThirdGraphicCode.includes('const isAngled = shape === "angled-cut";'), 'Must define isAngled for angled-cut shape');
  assert(lowerThirdGraphicCode.includes('rounded-[12px]'), 'Must enforce universal 12px border radius');
});

test('Default lower-third footprint is compact (36% width, not oversized 55%)', () => {
  assert(mainJsCode.includes('width: 36'), 'main.js default lowerThird width must be 36%');
  assert(desktopControllerCode.includes('width: 36'), 'desktop controller default lowerThird width must be 36%');
  assert(desktopControllerCode.includes('width: `${bConfig.lowerThird.width ?? 36}%`') || desktopControllerCode.includes('width: `${cfg.lowerThird.width ?? 36}%`'), 'preview canvas uses 36% default width');
  assert(programCanvasCode.includes('width: `${bConfig.lowerThird.width ?? 36}%`'), 'program canvas uses 36% default width');
});

test('LiveSwitcherController provides dedicated Designer tab with shape tools (rectangles, circles, triangles)', () => {
  assert(desktopControllerCode.includes('studioModalTab === "designer"'), 'Studio modal must support designer tab');
  assert(desktopControllerCode.includes('Shape & Geometry Tools'), 'Must have container shape & geometry tools');
  assert(desktopControllerCode.includes('Container Shape (Rectangles)'), 'Must have rectangle container selector');
  assert(desktopControllerCode.includes('Badge Holder Shape (Circles & Geometries)'), 'Must have badge shape selector (circle, rect, triangle)');
  assert(desktopControllerCode.includes('Triangular Accent Slash'), 'Must have triangular accent slash toggle');
  assert(desktopControllerCode.includes('Colors & Styling'), 'Must have color engine and opacity controls');
  assert(desktopControllerCode.includes('Presenter & Content'), 'Must have typography and content controls');
  assert(desktopControllerCode.includes('Size & Placement'), 'Must have sizing and placement tools');
});

console.log('\n----------------------------------------------');
console.log(`Passed: ${passed} / ${passed + failed}`);

if (failed > 0) {
  console.error(`❌ FAILED: ${failed} tests failed.`);
  process.exit(1);
} else {
  console.log('✅ ALL LIVE BROADCAST STUDIO & OVERLAY TESTS PASSED!\n');
}
