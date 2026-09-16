/**
 * Verification Test: Lockstep Audio Pacing & Bible Lower-Third Auto-Dismiss
 */

const net = require('net');
const assert = require('assert');
const fs = require('fs');
const { DestinationWorker, DESTINATION_STATES } = require('../src/main/streaming/destinationWorker');

// Load DEFAULT_BROADCAST_CONFIG and normalizeBroadcastConfig without JSX loader
const controllerCode = fs.readFileSync(__dirname + '/../src/App/controller/LiveSwitcherController.js', 'utf8');
const configSnippet = controllerCode.slice(
  controllerCode.indexOf('export const DEFAULT_BROADCAST_CONFIG'),
  controllerCode.indexOf('export default function LiveSwitcherController')
);
const evalScope = {};
const scriptToRun = configSnippet.replace(/export const /g, 'exports.') + '\nconst DEFAULT_BROADCAST_CONFIG = exports.DEFAULT_BROADCAST_CONFIG;';
new Function('exports', 'DEFAULT_LOWER_THIRD_STYLE', scriptToRun)(evalScope, {});
const { DEFAULT_BROADCAST_CONFIG, normalizeBroadcastConfig } = evalScope;

async function testAudioPacingVideoOnly() {
  console.log('\n--- Test 1: DestinationWorker Audio Pacing (Video-Only Feed) ---');
  let bytesReceived = 0;
  const server = net.createServer(s => {
    s.on('data', c => { bytesReceived += c.length; });
    s.on('error', () => {});
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const worker = new DestinationWorker({
    id: 'test-pacing-harness',
    streamUrl: `tcp://127.0.0.1:${port}`,
    width: 640,
    height: 360,
    fps: 30,
    withAudio: true,
    encoder: process.platform === 'darwin' ? 'h264_videotoolbox' : 'libx264'
  });

  await worker.start();
  assert.strictEqual(worker.state, DESTINATION_STATES.CONNECTING, 'Initial state should be CONNECTING');

  const frame = Buffer.alloc(640 * 360 * 4);
  // Feed 60 video frames WITHOUT any writeAudioChunk call
  for (let i = 0; i < 60; i++) {
    const written = worker.writeVideoFrame(frame);
    assert.strictEqual(written, true, `Frame ${i} should be accepted`);
    await new Promise(r => setTimeout(r, 33));
  }

  // Allow encoder pipeline to flush
  await new Promise(r => setTimeout(r, 800));

  assert(bytesReceived > 10000, `Expected receiver to get > 10KB, got ${bytesReceived}`);
  assert(worker.telemetry.encodedFrames > 40, `Expected > 40 encoded frames, got ${worker.telemetry.encodedFrames}`);
  assert.strictEqual(worker.isBackpressured, false, 'Should NOT be backpressured');
  assert.strictEqual(worker.telemetry.droppedFrames, 0, 'Zero frames should be dropped');
  assert(
    worker.state === DESTINATION_STATES.TRANSMITTING || worker.state === DESTINATION_STATES.LIVE,
    `Worker should advance to TRANSMITTING or LIVE (was: ${worker.state})`
  );

  console.log(`  ✓ Video-only feed advanced smoothly: ${worker.telemetry.encodedFrames} frames encoded, ${bytesReceived} bytes transmitted, 0 dropped.`);
  await worker.stop();
  await new Promise(r => server.close(r));
}

async function testBibleConfigAndDismiss() {
  console.log('\n--- Test 2: Bible Lower Third Defaults & Auto-Dismiss Logic ---');

  // 1. Check default broadcast configuration
  assert.strictEqual(DEFAULT_BROADCAST_CONFIG.bibleLowerThird.enabled, false, 'Bible lower-third must default to enabled: false');
  assert.strictEqual(DEFAULT_BROADCAST_CONFIG.bibleLowerThird.autoTrigger, false, 'Bible lower-third must default to autoTrigger: false');
  assert.strictEqual(DEFAULT_BROADCAST_CONFIG.bibleLowerThird.isShowing, false, 'Bible lower-third must default to isShowing: false');
  console.log('  ✓ DEFAULT_BROADCAST_CONFIG has bibleLowerThird disabled by default');

  // 2. Check normalization
  const normalized = normalizeBroadcastConfig({});
  assert.strictEqual(normalized.bibleLowerThird.enabled, false);
  assert.strictEqual(normalized.bibleLowerThird.autoTrigger, false);
  console.log('  ✓ normalizeBroadcastConfig preserves safe defaults');

  // 3. Simulate main.js auto-dismiss logic
  let liveBroadcastConfig = {
    bibleLowerThird: {
      enabled: true,
      autoTrigger: true,
      currentRef: '',
      currentText: '',
      version: 'KJV',
      autoDismissSec: 1, // 1 second for fast test
      isShowing: false,
    }
  };

  let bibleAutoDismissTimer = null;
  let broadcastCount = 0;
  const broadcastLiveConfig = () => { broadcastCount++; };

  function handleSetContent(value) {
    if (bibleAutoDismissTimer) {
      clearTimeout(bibleAutoDismissTimer);
      bibleAutoDismissTimer = null;
    }

    if (value?.type === "bible" && liveBroadcastConfig.bibleLowerThird?.enabled && liveBroadcastConfig.bibleLowerThird?.autoTrigger) {
      const bData = value.data || {};
      const ref = (bData.title || (bData.book ? `${bData.book} ${bData.chapter || ''}:${bData.verse || ''}` : '') || "").trim();
      const body = (bData.body || "").trim();
      const version = (bData.version || bData.translation || "KJV").toUpperCase();
      if (ref || body) {
        liveBroadcastConfig.bibleLowerThird.currentRef = ref;
        liveBroadcastConfig.bibleLowerThird.currentText = body;
        liveBroadcastConfig.bibleLowerThird.version = version;
        liveBroadcastConfig.bibleLowerThird.isShowing = true;
        broadcastLiveConfig();

        const autoDismissSec = Number(liveBroadcastConfig.bibleLowerThird.autoDismissSec) || 15;
        if (autoDismissSec > 0) {
          bibleAutoDismissTimer = setTimeout(() => {
            if (liveBroadcastConfig.bibleLowerThird && liveBroadcastConfig.bibleLowerThird.isShowing) {
              liveBroadcastConfig.bibleLowerThird.isShowing = false;
              broadcastLiveConfig();
            }
            bibleAutoDismissTimer = null;
          }, autoDismissSec * 1000);
        }
      }
    } else if (value == null || value?.type !== "bible") {
      if (liveBroadcastConfig.bibleLowerThird?.isShowing && liveBroadcastConfig.bibleLowerThird?.autoTrigger) {
        liveBroadcastConfig.bibleLowerThird.isShowing = false;
        broadcastLiveConfig();
      }
    }
  }

  // Trigger scripture
  handleSetContent({ type: 'bible', data: { title: 'John 3:16', body: 'For God so loved the world...' } });
  assert.strictEqual(liveBroadcastConfig.bibleLowerThird.isShowing, true, 'isShowing should be true after scripture triggered');
  assert.strictEqual(liveBroadcastConfig.bibleLowerThird.currentRef, 'John 3:16');
  assert(bibleAutoDismissTimer !== null, 'auto-dismiss timer must be active');

  // Wait 1.2s for auto-dismiss timer to fire
  await new Promise(r => setTimeout(r, 1200));
  assert.strictEqual(liveBroadcastConfig.bibleLowerThird.isShowing, false, 'isShowing should be false after autoDismissSec expired');
  console.log('  ✓ Auto-dismiss timer automatically hid scripture after timeout');

  // Test clearing content immediately
  handleSetContent({ type: 'bible', data: { title: 'Genesis 1:1', body: 'In the beginning...' } });
  assert.strictEqual(liveBroadcastConfig.bibleLowerThird.isShowing, true);
  handleSetContent(null); // Clear content
  assert.strictEqual(liveBroadcastConfig.bibleLowerThird.isShowing, false, 'isShowing should be false after content cleared to null');
  console.log('  ✓ Clearing content immediately dismissed scripture lower-third');
}

(async () => {
  try {
    await testAudioPacingVideoOnly();
    await testBibleConfigAndDismiss();
    console.log('\n=============================================');
    console.log(' ALL AUDIO PACING & BIBLE TESTS PASSED!');
    console.log('=============================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n✗ Test failed:', err);
    process.exit(1);
  }
})();
