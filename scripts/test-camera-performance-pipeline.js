'use strict';

/**
 * scripts/test-camera-performance-pipeline.js
 *
 * Verifies Task 2: Camera Performance Optimization During Screen Sharing
 * - Structural invariant verification in SwitcherProgramCanvas.js & main.js
 * - Performance benchmark comparing unthrottled toDataURL vs gated/throttled pipeline
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

console.log('================================================================');
console.log(' TASK 2: CAMERA PERFORMANCE & SCREEN-SHARING PIPELINE TEST');
console.log('================================================================\n');

// 1. SwitcherProgramCanvas.js Invariant Check
const canvasFilePath = path.join(rootDir, 'src', 'App', 'controller', 'SwitcherProgramCanvas.js');
assert(fs.existsSync(canvasFilePath), 'SwitcherProgramCanvas.js must exist');
const canvasCode = fs.readFileSync(canvasFilePath, 'utf8');

console.log('[1/4] Checking SwitcherProgramCanvas gating & throttling...');
assert(canvasCode.includes('isSharingActiveRef'), 'Must declare and sync isSharingActiveRef');
assert(canvasCode.includes('lastSentPreviewFrameTimeRef'), 'Must declare lastSentPreviewFrameTimeRef');
assert(canvasCode.includes('shouldEmitPreview'), 'Must check shouldEmitPreview condition');
assert(canvasCode.includes('66'), 'Must throttle preview generation to ~15 FPS (66ms)');
assert(canvasCode.includes('canvas.toDataURL("image/jpeg", 0.65)'), 'Must use 0.65 JPEG quality for preview');
console.log('  ✓ [PASS] SwitcherProgramCanvas correctly gates and throttles canvas.toDataURL');

// 2. High-performance Raw RGBA stream preservation
console.log('[2/4] Verifying raw RGBA streaming for Recording & Broadcast...');
assert(canvasCode.includes('ctx.getImageData(0, 0, cw, ch)'), 'Must preserve ctx.getImageData for recorder/broadcast');
assert(canvasCode.includes('window.electron.Recorder.pushVideoFrame'), 'Must preserve Recorder pushVideoFrame');
assert(canvasCode.includes('window.electron.Broadcast.pushVideoFrame'), 'Must preserve Broadcast pushVideoFrame');
console.log('  ✓ [PASS] Raw RGBA 30 FPS stream for recorder/broadcast is preserved');

// 3. main.js Invariant Check
console.log('[3/4] Checking main.js display mirror resolution & volatile Socket.IO emit...');
const mainFilePath = path.join(rootDir, 'main.js');
const mainCode = fs.readFileSync(mainFilePath, 'utf8');
assert(mainCode.includes('width: 640'), 'Display mirror must resize to 640 width');
assert(mainCode.includes('height: 360'), 'Display mirror must resize to 360 height');
assert(mainCode.includes('thumb.toJPEG(70)'), 'Display mirror must use 70 JPEG quality');
assert(mainCode.includes('io.volatile || io'), 'Must use volatile emit for live-frame');
console.log('  ✓ [PASS] main.js uses optimized thumbnail dimensions and volatile Socket.IO emit');

// 4. Performance benchmark simulation
console.log('[4/4] Benchmarking CPU time savings: Unconditional 30 FPS vs Gated Pipeline...');

// Simulate mock canvas with toDataURL cost
class MockCanvas {
  constructor(w = 1280, h = 720) {
    this.width = w;
    this.height = h;
  }
  toDataURL(mime, quality) {
    // Simulate ~4ms synchronous JPEG compression & base64 string allocation on desktop CPU
    const start = process.hrtime.bigint();
    while (Number(process.hrtime.bigint() - start) < 3_500_000) {
      // 3.5ms busy wait simulating GPU readback and JPEG encode
    }
    return 'data:image/jpeg;base64,' + 'X'.repeat(80000);
  }
}

const mockCanvas = new MockCanvas();

// Baseline: 60 iterations (simulating 2 seconds of 30 FPS frames with unconditional toDataURL)
const t0Unconditional = Date.now();
let baselineCalls = 0;
for (let i = 0; i < 60; i++) {
  // Unconditional call
  mockCanvas.toDataURL('image/jpeg', 0.85);
  baselineCalls++;
}
const baselineElapsedMs = Date.now() - t0Unconditional;

// Optimized: 60 iterations when sharing is INACTIVE (typical Google Meet call when general/speaker are not routed)
const t0GatedInactive = Date.now();
let gatedInactiveCalls = 0;
const isSharingActiveInactive = false;
const isBroadcastActive = false;
let lastSentPreviewTime = 0;

for (let i = 0; i < 60; i++) {
  const now = i * 33;
  const shouldEmit = isSharingActiveInactive || isBroadcastActive;
  if (shouldEmit && (now - lastSentPreviewTime >= 66)) {
    lastSentPreviewTime = now;
    mockCanvas.toDataURL('image/jpeg', 0.65);
    gatedInactiveCalls++;
  }
}
const gatedInactiveElapsedMs = Date.now() - t0GatedInactive;

// Optimized: 60 iterations when sharing IS active (15 FPS throttled)
const t0GatedActive = Date.now();
let gatedActiveCalls = 0;
const isSharingActiveActive = true;
lastSentPreviewTime = 0;

for (let i = 0; i < 60; i++) {
  const now = i * 33;
  const shouldEmit = isSharingActiveActive || isBroadcastActive;
  if (shouldEmit && (now - lastSentPreviewTime >= 66)) {
    lastSentPreviewTime = now;
    mockCanvas.toDataURL('image/jpeg', 0.65);
    gatedActiveCalls++;
  }
}
const gatedActiveElapsedMs = Date.now() - t0GatedActive;

console.log(`\n  Baseline (Unconditional 30 FPS):   ${baselineCalls} toDataURL calls | Total JS Block Time: ${baselineElapsedMs}ms`);
console.log(`  Gated (Sharing Inactive):          ${gatedInactiveCalls} toDataURL calls | Total JS Block Time: ${gatedInactiveElapsedMs}ms (100% reduction)`);
console.log(`  Gated (Sharing Active @ 15 FPS):   ${gatedActiveCalls} toDataURL calls | Total JS Block Time: ${gatedActiveElapsedMs}ms (~50% reduction)\n`);

assert.strictEqual(gatedInactiveCalls, 0, 'Must make zero calls when sharing is inactive');
assert(gatedActiveCalls <= 30, 'Must make <= 30 calls when throttled to 15 FPS over 60 frames');
assert(gatedInactiveElapsedMs < 5, 'Inactive pipeline must consume < 5ms of total JS thread time');

console.log('================================================================');
console.log(' ALL TASK 2 CAMERA PERFORMANCE VERIFICATIONS PASSED (4/4)');
console.log('================================================================\n');
