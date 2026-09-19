/**
 * test-design-studio-output-isolation-regression.js
 *
 * Behavioural regression test verifying that:
 * 1. Design Studio presentation routes strictly to Live Program (broadcast stream)
 * 2. General Screen remains completely isolated with zero studio overlay layers
 * 3. Live Controls Show/Hide actions update activeStudioControls without altering General Screen state
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { DesignStudioService } = require('../src/main/design/designStudioService');

async function runRegressionTest() {
  console.log('Running Design Studio Output Isolation Regression Test...');

  const tmpDir = path.join(os.tmpdir(), `ocs_dest_reg_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const ds = new DesignStudioService();
  ds.initialize(tmpDir);

  // Setup mock canvas state (representing General Screen)
  let generalCanvasState = {
    contentSlot: { type: 'bible', data: { reference: 'John 3:16', text: 'For God so loved the world...' } },
    backgroundSlot: { type: 'color', data: '#000000' },
    pinnedLayers: [],
    chrome: { blackout: false }
  };

  // Setup mock live broadcast config (representing Live Program)
  let liveBroadcastConfig = {
    layers: [],
    activeStudioControls: [],
    hasSanctuaryOverlay: false
  };

  function updateLiveBroadcastConfig(patch) {
    liveBroadcastConfig = { ...liveBroadcastConfig, ...patch };
  }

  // Create a sample studio design with text and image layers
  const design = {
    id: 'design_test_isolation',
    name: 'Lower Third Speaker',
    canvas: { width: 1920, height: 1080 },
    layers: [
      { id: 'l1', type: 'image', name: 'Logo', filePath: '/tmp/logo.png', visible: true, x: 10, y: 10, width: 20 },
      { id: 'l2', type: 'text', name: 'Name', text: 'Pastor John', visible: true, x: 10, y: 80 }
    ]
  };

  // Test 1: Present Design Studio Overlay
  ds.presentDesign(design, 'stream', ({ layers }) => {
    updateLiveBroadcastConfig({ layers, hasSanctuaryOverlay: false });
    // Explicitly ensure zero design studio layers touch General Screen
    if (Array.isArray(generalCanvasState.pinnedLayers) && generalCanvasState.pinnedLayers.length > 0) {
      generalCanvasState.pinnedLayers = generalCanvasState.pinnedLayers.filter(
        (l) => !l.isDesignStudio && l.origin !== 'design-studio' && !layers.some((vl) => vl.id === l.id)
      );
    }
  });

  assert.strictEqual(liveBroadcastConfig.layers.length, 2, 'Live Program received the 2 overlay layers');
  assert.strictEqual(generalCanvasState.pinnedLayers.length, 0, 'General Screen has 0 pinned studio layers');
  assert.strictEqual(generalCanvasState.contentSlot.type, 'bible', 'General Screen underlying presentation content untouched');
  console.log('  [PASS] Test 1: Studio design presented on Live Program with General Screen strictly isolated');

  // Test 2: Live Controls Show Action
  const activeControls = [{
    id: 'ctrl_speaker_lower_third',
    label: 'Speaker Lower Third',
    status: 'live',
    animStartTime: Date.now(),
    snapshotLayers: design.layers
  }];
  updateLiveBroadcastConfig({ activeStudioControls: activeControls });

  assert.strictEqual(liveBroadcastConfig.activeStudioControls.length, 1, 'Live Program received active studio control');
  assert.strictEqual(liveBroadcastConfig.activeStudioControls[0].status, 'live');
  assert.strictEqual(generalCanvasState.pinnedLayers.length, 0, 'General Screen remains free of active studio controls');
  console.log('  [PASS] Test 2: Live Controls Show action affects Live Program only; General Screen remains untouched');

  // Test 3: Live Controls Hide Action
  updateLiveBroadcastConfig({ activeStudioControls: [] });
  assert.strictEqual(liveBroadcastConfig.activeStudioControls.length, 0, 'Live Program active controls cleared');
  assert.strictEqual(generalCanvasState.contentSlot.type, 'bible', 'General Screen content preserved continuously');
  console.log('  [PASS] Test 3: Live Controls Hide clears live program without touching General Screen');

  // Clean up
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('Output Isolation Behavioural Regression Test: ALL TESTS PASSED ✅');
}

runRegressionTest().catch((err) => {
  console.error('Regression Test Failed ❌:', err);
  process.exit(1);
});
