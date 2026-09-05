/**
 * tests/test-mobile-camera-and-display-switch.js
 *
 * Verification Suite for:
 * 1. Native mobile camera frame streaming (switcher:camera-frame)
 * 2. Auto-assignment of Display 2 source when camera connects
 * 3. SwitchDisplay('display2') reliable targeting without blank screen
 * 4. DisplayCanvas standby HUD overlay when awaiting stream
 * 5. Strict Universal 12px border radius adherence
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('\n=== Mobile Camera Streaming & Display Switcher Verification ===\n');

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

// 1. Check socketStore.ts exposes sendSwitcherCameraFrame
console.log('[1. Mobile socketStore: sendSwitcherCameraFrame]');
const socketStoreCode = fs.readFileSync(path.join(__dirname, '../ocs-mobile/store/socketStore.ts'), 'utf8');

test('socketStore.ts defines sendSwitcherCameraFrame in SocketState interface', () => {
  assert(socketStoreCode.includes('sendSwitcherCameraFrame: (base64Data: string) => void;'), 'Missing sendSwitcherCameraFrame in SocketState interface');
});

test('socketStore.ts implements sendSwitcherCameraFrame emitting switcher:camera-frame', () => {
  assert(socketStoreCode.includes("socket.emit('switcher:camera-frame', { data: base64Data, timestamp: Date.now() });"), 'sendSwitcherCameraFrame should emit switcher:camera-frame');
});

// 2. Check live-switcher.tsx native CameraView integration
console.log('\n[2. Mobile live-switcher.tsx: Native CameraView]');
const mobileSwitcherCode = fs.readFileSync(path.join(__dirname, '../ocs-mobile/app/live-switcher.tsx'), 'utf8');

test('live-switcher.tsx imports CameraView and useCameraPermissions from expo-camera', () => {
  assert(mobileSwitcherCode.includes("import { CameraView, useCameraPermissions } from \"expo-camera\";"), 'Missing CameraView import');
});

test('live-switcher.tsx does NOT use WebBrowser for camera streaming', () => {
  assert(!mobileSwitcherCode.includes("WebBrowser.openBrowserAsync"), 'Should not open external WebBrowser sheet for camera');
});

test('live-switcher.tsx implements continuous frame pumping via takePictureAsync and sendSwitcherCameraFrame', () => {
  assert(mobileSwitcherCode.includes("takePictureAsync"), 'Missing takePictureAsync frame capture');
  assert(mobileSwitcherCode.includes("sendSwitcherCameraFrame(photo.base64);"), 'Missing sendSwitcherCameraFrame call in pump loop');
});

test('live-switcher.tsx provides lens flip, torch toggle, and studio controls', () => {
  assert(mobileSwitcherCode.includes("setFacing"), 'Missing lens flip');
  assert(mobileSwitcherCode.includes("setTorch"), 'Missing torch toggle');
  assert(mobileSwitcherCode.includes("setStreamQuality"), 'Missing quality selector');
});

test('live-switcher.tsx strictly adheres to Universal 12px border radius mandate', () => {
  const invalidRadii = [/rounded-(?:sm|md|lg|2xl|3xl)/, /borderRadius:\s*(?:[1-9]|1[013-9]|[2-9][0-9])\b/];
  for (const regex of invalidRadii) {
    const match = mobileSwitcherCode.match(regex);
    assert(!match, `Found non-12px border radius in live-switcher.tsx: ${match ? match[0] : ''}`);
  }
});

// 3. Check main.js backend handling of switcher:camera-frame and display2 auto-routing
console.log('\n[3. Desktop Backend main.js: Frame Routing & Display 2]');
const mainJsCode = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');

test('main.js listens to switcher:camera-frame and dispatches teleprompter-mobile-frame and switcher-program-frame', () => {
  assert(mainJsCode.includes('socket.on("switcher:camera-frame"'), 'Missing socket.on("switcher:camera-frame")');
  assert(mainJsCode.includes('win.webContents.send("switcher-program-frame", framePayload);'), 'Should send switcher-program-frame on program frame');
});

test('main.js auto-assigns switcherDisplay2Source when camera opts in', () => {
  assert(mainJsCode.includes("switcherDisplay2Source = socket.id;"), 'Missing auto-assign switcherDisplay2Source = socket.id on opt-in');
});

test('main.js cleans up switcherDisplay2Source on opt-out and disconnect', () => {
  assert(mainJsCode.includes("if (switcherDisplay2Source === socket.id)"), 'Missing switcherDisplay2Source cleanup on camera removal');
});

test('main.js switchDisplay targets connected camera on Display 2 when source was unset or speaker', () => {
  assert(mainJsCode.includes("const firstCam = switcherCameraSlots.size > 0 ? Array.from(switcherCameraSlots.keys())[0] : null;"), 'Missing firstCam fallback in switchDisplay');
});

test('main.js broadcasts display-mirror-frame to all windows', () => {
  assert(mainJsCode.includes('win.webContents.send("display-mirror-frame", payload);'), 'display-mirror-frame should be broadcast to all windows');
});

// 4. Check DisplayCanvas.js standby HUD & frame cache
console.log('\n[4. DisplayCanvas.js: Standby HUD & Frame Handling]');
const displayCanvasCode = fs.readFileSync(path.join(__dirname, '../src/App/View/DisplayCanvas.js'), 'utf8');

test('DisplayCanvas.js tracks hasLiveFrame and sets dirty on mount/source change', () => {
  assert(displayCanvasCode.includes('const [hasLiveFrame, setHasLiveFrame] = useState(false);'), 'Missing hasLiveFrame state');
  assert(displayCanvasCode.includes('liveCameraIsDirtyRef.current = true;'), 'liveCameraIsDirtyRef should be set on mount/change');
});

test('DisplayCanvas.js listens to onDisplayMirrorFrame for speaker display channel', () => {
  assert(displayCanvasCode.includes('window.electron?.Switcher?.onDisplayMirrorFrame'), 'Missing onDisplayMirrorFrame listener in DisplayCanvas.js');
});

test('DisplayCanvas.js renders Standby HUD overlay when hasLiveFrame is false to avoid blank screen', () => {
  assert(displayCanvasCode.includes('!hasLiveFrame && ('), 'Missing !hasLiveFrame standby HUD check in case live-camera');
  assert(displayCanvasCode.includes('Awaiting Stream'), 'Standby HUD should indicate awaiting stream');
});

test('DisplayCanvas.js adheres to Universal 12px border radius mandate in HUD elements', () => {
  assert(displayCanvasCode.includes('rounded-[12px]'), 'DisplayCanvas should use 12px border radius');
});

console.log('\n----------------------------------------------');
console.log(`Passed: ${passed} / ${passed + failed}`);

if (failed > 0) {
  console.error(`❌ FAILED: ${failed} tests failed.`);
  process.exit(1);
} else {
  console.log('✅ ALL MOBILE CAMERA & DISPLAY SWITCHER TESTS PASSED.\n');
}
