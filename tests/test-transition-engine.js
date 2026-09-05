/**
 * tests/test-transition-engine.js
 *
 * Isolated unit tests for TransitionEngine.js
 * Verifies:
 * 1. Cut, Fade, Wipe (4 directions) rendering
 * 2. Canvas clip and globalAlpha operations
 * 3. Extensible registry (custom transition plugins)
 * 4. Interruption handling (immediate cancel and takeover)
 */

'use strict';

const assert = require('assert');
const { TransitionEngine, transitionEngine } = require('../src/App/controller/TransitionEngine');

console.log('\n=== TransitionEngine Verification Suite ===\n');
let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// Mock Canvas Context
function createMockContext() {
  const calls = [];
  return {
    calls,
    globalAlpha: 1.0,
    save() { calls.push({ type: 'save' }); },
    restore() { calls.push({ type: 'restore' }); },
    beginPath() { calls.push({ type: 'beginPath' }); },
    rect(x, y, w, h) { calls.push({ type: 'rect', x, y, w, h }); },
    clip() { calls.push({ type: 'clip' }); },
    drawImage(src, x, y, w, h) { calls.push({ type: 'drawImage', src, x, y, w, h, alpha: this.globalAlpha }); },
  };
}

const mockOutgoing = { width: 1280, height: 720, id: 'cam1' };
const mockIncoming = { width: 1280, height: 720, id: 'cam2' };

// Test 1: Registry defaults
test('Default transitions registered (cut, fade, wipe)', () => {
  const engine = new TransitionEngine();
  assert(engine.has('cut'), 'Must have cut');
  assert(engine.has('fade'), 'Must have fade');
  assert(engine.has('wipe'), 'Must have wipe');
  assert.strictEqual(engine.getTypes().length, 3);
});

// Test 2: Cut transition
test('Cut transition renders incoming source directly', () => {
  const engine = new TransitionEngine();
  const ctx = createMockContext();
  engine.render(ctx, mockOutgoing, mockIncoming, 0.5, 1280, 720, { type: 'cut' });

  const drawCalls = ctx.calls.filter(c => c.type === 'drawImage');
  assert.strictEqual(drawCalls.length, 1);
  assert.strictEqual(drawCalls[0].src.id, 'cam2');
});

// Test 3: Fade transition dual-source alpha compositing
test('Fade transition adjusts globalAlpha for outgoing and incoming', () => {
  const engine = new TransitionEngine();
  const ctx = createMockContext();
  
  // At progress = 0.5
  engine.render(ctx, mockOutgoing, mockIncoming, 0.5, 1280, 720, { type: 'fade' });
  const drawCalls = ctx.calls.filter(c => c.type === 'drawImage');
  assert.strictEqual(drawCalls.length, 2, 'Should draw both outgoing and incoming');
  assert.strictEqual(drawCalls[0].src.id, 'cam1');
  assert.strictEqual(drawCalls[0].alpha, 0.5, 'Outgoing alpha should be 0.5');
  assert.strictEqual(drawCalls[1].src.id, 'cam2');
  assert.strictEqual(drawCalls[1].alpha, 0.5, 'Incoming alpha should be 0.5');
});

// Test 4: Fade boundary conditions (p = 0.0 and p = 1.0)
test('Fade transition boundary alpha (p=0 outgoing only, p=1 incoming only)', () => {
  const engine = new TransitionEngine();
  
  // p = 0.0
  const ctx0 = createMockContext();
  engine.render(ctx0, mockOutgoing, mockIncoming, 0.0, 1280, 720, { type: 'fade' });
  const draw0 = ctx0.calls.filter(c => c.type === 'drawImage');
  assert.strictEqual(draw0.length, 1);
  assert.strictEqual(draw0[0].src.id, 'cam1');
  assert.strictEqual(draw0[0].alpha, 1.0);

  // p = 1.0
  const ctx1 = createMockContext();
  engine.render(ctx1, mockOutgoing, mockIncoming, 1.0, 1280, 720, { type: 'fade' });
  const draw1 = ctx1.calls.filter(c => c.type === 'drawImage');
  assert.strictEqual(draw1.length, 1);
  assert.strictEqual(draw1[0].src.id, 'cam2');
  assert.strictEqual(draw1[0].alpha, 1.0);
});

// Test 5: Wipe in all 4 directions
test('Wipe directional reveals: left-to-right, right-to-left, top-to-bottom, bottom-to-top', () => {
  const engine = new TransitionEngine();

  // Left-to-Right at p = 0.5
  const ctxLR = createMockContext();
  engine.render(ctxLR, mockOutgoing, mockIncoming, 0.5, 1000, 500, { type: 'wipe', direction: 'left-to-right' });
  const rectLR = ctxLR.calls.find(c => c.type === 'rect');
  assert.deepStrictEqual(rectLR, { type: 'rect', x: 0, y: 0, w: 500, h: 500 });

  // Right-to-Left at p = 0.5
  const ctxRL = createMockContext();
  engine.render(ctxRL, mockOutgoing, mockIncoming, 0.5, 1000, 500, { type: 'wipe', direction: 'right-to-left' });
  const rectRL = ctxRL.calls.find(c => c.type === 'rect');
  assert.deepStrictEqual(rectRL, { type: 'rect', x: 500, y: 0, w: 500, h: 500 });

  // Top-to-Bottom at p = 0.5
  const ctxTB = createMockContext();
  engine.render(ctxTB, mockOutgoing, mockIncoming, 0.5, 1000, 500, { type: 'wipe', direction: 'top-to-bottom' });
  const rectTB = ctxTB.calls.find(c => c.type === 'rect');
  assert.deepStrictEqual(rectTB, { type: 'rect', x: 0, y: 0, w: 1000, h: 250 });

  // Bottom-to-Top at p = 0.5
  const ctxBT = createMockContext();
  engine.render(ctxBT, mockOutgoing, mockIncoming, 0.5, 1000, 500, { type: 'wipe', direction: 'bottom-to-top' });
  const rectBT = ctxBT.calls.find(c => c.type === 'rect');
  assert.deepStrictEqual(rectBT, { type: 'rect', x: 0, y: 250, w: 1000, h: 250 });
});

// Test 6: Extensible registry (custom plugin)
test('Extensible registry accepts new transition plugin', () => {
  const engine = new TransitionEngine();
  let customCalled = false;
  engine.register('slide', {
    render(ctx, outgoing, incoming, progress, w, h) {
      customCalled = true;
    }
  });

  assert(engine.has('slide'), 'Custom transition must be registered');
  engine.render(createMockContext(), mockOutgoing, mockIncoming, 0.5, 1280, 720, { type: 'slide' });
  assert(customCalled, 'Custom transition render function must be executed');
});

// Test 7: Interruption behavior
test('Interruption immediately cancels prior transition and runs new one', () => {
  const engine = new TransitionEngine();
  let t1Updates = 0;
  let t2Updates = 0;

  engine.start({
    fromId: 'cam1',
    toId: 'cam2',
    type: 'fade',
    duration: 500,
    onUpdate: () => { t1Updates++; }
  });

  assert(engine.isActive(), 'Engine must report active transition');
  assert.strictEqual(engine.getActiveState().toId, 'cam2');

  // Interrupt mid-stream
  engine.start({
    fromId: 'cam2',
    toId: 'cam3',
    type: 'wipe',
    duration: 300,
    onUpdate: () => { t2Updates++; }
  });

  assert(engine.isActive(), 'Engine must remain active for new transition');
  assert.strictEqual(engine.getActiveState().toId, 'cam3');
  assert.strictEqual(engine.getActiveState().type, 'wipe');

  engine.cancel();
  assert(!engine.isActive(), 'Engine must be inactive after cancel()');
});

console.log('----------------------------------------------');
console.log(`Passed: ${passed} / ${total}`);
if (passed === total) {
  console.log('✅ ALL TRANSITION ENGINE UNIT TESTS PASSED.\n');
} else {
  console.error('❌ SOME TESTS FAILED.\n');
  process.exitCode = 1;
}
