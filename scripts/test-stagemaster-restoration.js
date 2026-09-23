const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== StageMaster Mobile Restoration & Regression Verification ===\n');

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

// ─── 1. Navigation & Route Registration ──────────────────────────────────────
console.log('[1. Mobile Navigation & Routing Invariants]');

const layoutCode = fs.readFileSync(path.join(__dirname, '../ocs-mobile/app/_layout.tsx'), 'utf8');
const indexCode = fs.readFileSync(path.join(__dirname, '../ocs-mobile/app/index.tsx'), 'utf8');
const stageControlCode = fs.readFileSync(path.join(__dirname, '../ocs-mobile/app/stage-control.tsx'), 'utf8');
const stagemasterAliasPath = path.join(__dirname, '../ocs-mobile/app/stagemaster.tsx');

test('Navigation Stack registers both stage-control and stagemaster', () => {
  assert(layoutCode.includes('<Stack.Screen name="stage-control" />'), 'stage-control screen missing from _layout.tsx');
  assert(layoutCode.includes('<Stack.Screen name="stagemaster" />'), 'stagemaster alias screen missing from _layout.tsx');
});

test('app/stagemaster.tsx alias file exists and delegates to stage-control', () => {
  assert(fs.existsSync(stagemasterAliasPath), 'app/stagemaster.tsx must exist');
  const aliasCode = fs.readFileSync(stagemasterAliasPath, 'utf8');
  assert(aliasCode.includes('from "./stage-control"'), 'stagemaster.tsx must export stage-control');
});

test('Dashboard cards array contains Stage Master with correct configuration', () => {
  assert(indexCode.includes('id: "stage-control"'), 'stage-control card id missing from index.tsx');
  assert(indexCode.includes('label: "Stage Master"'), 'Stage Master card label missing from index.tsx');
  assert(indexCode.includes('icon: Broadcast'), 'Stage Master card must use Broadcast icon');
  assert(indexCode.includes('gradient: ["#8A2387", "#E94057", "#F27121"]'), 'Stage Master card has matching gradient');
});

test('Dashboard card grid has exactly 10 cards (5 balanced 2-column rows)', () => {
  // Extract cards array content
  const cardsMatch = indexCode.match(/const cards\s*=\s*\[([\s\S]*?)\];/);
  assert(cardsMatch, 'Could not find cards array in index.tsx');
  const ids = [...cardsMatch[1].matchAll(/id:\s*"([^"]+)"/g)].map(m => m[1]);
  assert.strictEqual(ids.length, 10, `Expected 10 cards in dashboard, found ${ids.length}: ${ids.join(', ')}`);
  assert(ids.includes('stage-control'), 'cards must include stage-control');
  assert(ids.includes('presentation'), 'cards must include presentation');
  assert(ids.includes('timer'), 'cards must include timer');
  assert(ids.includes('live-switcher'), 'cards must include live-switcher');
});

// ─── 2. Stage Master Screen Capabilities ─────────────────────────────────────
console.log('\n[2. Stage Master Screen Capabilities]');

test('Stage Master screen provides Master Confidence Monitor', () => {
  assert(stageControlCode.includes('useSocketStore'), 'Must use socketStore');
  assert(stageControlCode.includes('overlayContent'), 'Must render overlayContent');
  assert(stageControlCode.includes('overlayTimer'), 'Must render overlayTimer');
  assert(stageControlCode.includes('Live Output & Presentation Deck') || stageControlCode.includes('ON AIR'), 'Must display live status header');
});

test('Stage Master screen provides Quick Timers (5m, 10m, 15m, 30m, Clear)', () => {
  assert(stageControlCode.includes('timer_5m') || stageControlCode.includes('5m'), 'Missing 5m timer');
  assert(stageControlCode.includes('timer_10m') || stageControlCode.includes('10m'), 'Missing 10m timer');
  assert(stageControlCode.includes('timer_15m') || stageControlCode.includes('15m'), 'Missing 15m timer');
  assert(stageControlCode.includes('timer_30m') || stageControlCode.includes('30m'), 'Missing 30m timer');
  assert(stageControlCode.includes('timer_clear') || stageControlCode.includes('Clear'), 'Missing timer clear action');
});

test('Stage Master screen provides Shutter Controls (Blackout, Take Live)', () => {
  assert(stageControlCode.includes('black_screen'), 'Missing black_screen shutter action');
  assert(stageControlCode.includes('screen_on'), 'Missing screen_on shutter action');
});

test('Stage Master screen provides Transport Deck & Navigation to Teleprompter', () => {
  assert(stageControlCode.includes('prev_verse'), 'Missing prev_verse transport action');
  assert(stageControlCode.includes('next_verse'), 'Missing next_verse transport action');
  assert(stageControlCode.includes('first_slide'), 'Missing first_slide transport action');
  assert(stageControlCode.includes('last_slide'), 'Missing last_slide transport action');
  assert(stageControlCode.includes('return_to_presentation'), 'Missing return_to_presentation action');
  assert(stageControlCode.includes('/presentation'), 'Missing Teleprompter/presentation jump navigation');
});

test('Stage Master integrates active session / person from Timer Store', () => {
  assert(stageControlCode.includes('useTimerStore'), 'Must bind to useTimerStore');
  assert(stageControlCode.includes('activeAgendaItem'), 'Must read activeAgendaItem from store');
  assert(stageControlCode.includes('anchor'), 'Must display active person / anchor');
});

test('Stage Master prevents duplicate Socket.IO listeners (leak-free Zustand reactive subscriptions)', () => {
  // Direct socket.on in a screen component leaks upon repeated navigation
  assert(!stageControlCode.includes('socket.on('), 'stage-control.tsx must not add raw socket.on listeners');
  assert(!stageControlCode.includes('socket.addListener('), 'stage-control.tsx must not add raw socket listeners');
  // It reads reactive state from useSocketStore
  assert(stageControlCode.includes('useSocketStore()'), 'Must bind to useSocketStore');
  assert(stageControlCode.includes('overlayContent'), 'Must bind overlayContent reactively');
  assert(stageControlCode.includes('sendStageControl'), 'Must bind sendStageControl reactively');
});

// ─── 3. Universal 12px Border Radius Mandate ─────────────────────────────────
console.log('\n[3. Universal 12px Border Radius Invariant]');

test('stage-control.tsx strictly adheres to 12px border radius mandate', () => {
  // Search for any non-12px rounded- Tailwind classes (except rounded-full for circular pills/dots)
  const non12Tailwind = stageControlCode.match(/rounded-(sm|md|lg|2xl|3xl|none)/g);
  assert(!non12Tailwind, `Found non-12px tailwind radius: ${non12Tailwind?.join(', ')}`);
  
  // Search for any inline borderRadius that is not 12
  const inlineRadiuses = [...stageControlCode.matchAll(/borderRadius:\s*(\d+)/g)].map(m => parseInt(m[1], 10));
  const badRadiuses = inlineRadiuses.filter(r => r !== 12);
  assert(badRadiuses.length === 0, `Found non-12px inline radius: ${badRadiuses.join(', ')}`);
});

// ─── 4. Desktop & Socket Protocol Verification ────────────────────────────────
console.log('\n[4. Desktop ↔ Mobile Protocol Compatibility]');

const mainJs = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
const broadcastEngine = fs.readFileSync(path.join(__dirname, '../src/App/controller/BroadcastEngine.js'), 'utf8');
const socketStore = fs.readFileSync(path.join(__dirname, '../ocs-mobile/store/socketStore.ts'), 'utf8');

test('Mobile socketStore defines sendStageControl dispatching type: "stage-control"', () => {
  assert(socketStore.includes('sendStageControl: (command: string, payload?: any)'), 'Missing sendStageControl in socketStore');
  assert(socketStore.includes("type: 'stage-control'"), 'sendStageControl must emit type: "stage-control"');
});

test('main.js handles "stage-control" controller actions and routes to windows', () => {
  assert(mainJs.includes('action.type === "stage-control"'), 'main.js must process action.type === "stage-control"');
  assert(mainJs.includes('w.webContents.send("mobile-action", action)'), 'main.js must route mobile-action to all window webContents');
});

test('BroadcastEngine handles stage-control command dispatching', () => {
  assert(broadcastEngine.includes('stage-control') || broadcastEngine.includes('handleStageControl'), 'BroadcastEngine must handle stage-control');
});

test('Mobile socketStore receives overlay-content and overlay-timer events', () => {
  assert(socketStore.includes("socket.on('overlay-content'"), 'socketStore must listen for overlay-content');
  assert(socketStore.includes("socket.on('overlay-timer'"), 'socketStore must listen for overlay-timer');
});

// ─── 5. Preservation of Stabilization Fixes ──────────────────────────────────
console.log('\n[5. Regression Check on Prior Stabilization Fixes]');

const authStore = fs.readFileSync(path.join(__dirname, '../ocs-mobile/store/authStore.ts'), 'utf8');

test('authStore.ts retains mobile auth, fallback headers, and robust error classification', () => {
  assert(authStore.includes("Accept: 'application/json'"), 'authStore must retain JSON Accept header');
  assert(authStore.includes("message.includes('Failed to fetch')"), 'authStore must retain network error classification');
  assert(authStore.includes("Cannot reach 'localhost'"), 'authStore must retain localhost error diagnosis');
});

console.log(`\n----------------------------------------------`);
console.log(`Passed: ${passed} / ${total}`);
if (passed === total) {
  console.log(`✅ ALL STAGEMASTER RESTORATION & REGRESSION TESTS PASSED!`);
} else {
  console.log(`❌ Some tests failed!`);
  process.exitCode = 1;
}
