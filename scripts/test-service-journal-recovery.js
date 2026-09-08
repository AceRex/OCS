/**
 * OCS Integration Test — P0-03 Live Execution State Recovery & Journaling
 *
 * Verifies:
 * 1. SQLite WAL journal initialization and schema creation.
 * 2. Event journaling and state snapshotting.
 * 3. Dirty shutdown / crash detection.
 * 4. Fast state rehydration (<3s SLA).
 * 5. Production safety invariants (broadcast disarmed, audio gain safe).
 * 6. Clean shutdown resolution.
 */

const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { ServiceJournal } = require('../src/main/session/serviceJournal');
const { RecoveryManager } = require('../src/main/session/recoveryManager');

async function runRecoveryTestSuite() {
  console.log('=== Starting P0-03 Service Journal & Recovery Test Suite ===\n');

  const testDir = path.join(__dirname, '..', 'scratch', `test_journal_${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });

  let testsPassed = 0;
  let totalTests = 0;

  function recordPass(desc) {
    testsPassed++;
    totalTests++;
    console.log(`  ✓ [PASS] ${desc}`);
  }

  function recordFail(desc, err) {
    totalTests++;
    console.error(`  ✗ [FAIL] ${desc}:`, err.message || err);
  }

  try {
    // -------------------------------------------------------------
    // Test 1: Clean initialization and WAL journal creation
    // -------------------------------------------------------------
    console.log('[Test 1] Initializing clean journal in WAL mode');
    const journal1 = new ServiceJournal();
    await journal1.init(testDir);
    const dbPath = path.join(testDir, 'service_journal.db');
    assert.strictEqual(fs.existsSync(dbPath), true, 'service_journal.db should exist');
    recordPass('SQLite database file created on disk');

    const cleanCheck = await journal1.checkDirtyShutdown();
    assert.strictEqual(cleanCheck.crashed, false, 'Initial state should not be dirty');
    recordPass('Fresh journal correctly reports clean initial state');

    // -------------------------------------------------------------
    // Test 2: Starting a live service session and snapshotting
    // -------------------------------------------------------------
    console.log('\n[Test 2] Session recording and state evolution');
    const sessionId = await journal1.startSession('Sunday Service 10:00 AM');
    assert.ok(sessionId, 'Session ID generated');
    recordPass(`Session started with ID: ${sessionId}`);

    const baseState = {
      presentation: { activePresentationId: 'pres_123', activeSlideIndex: 0, slideTitle: 'Opening Hymn' },
      camera: { activeSlot: 1 },
      timer: { type: 'countdown', durationSec: 1800, remainingSec: 1800, isRunning: true },
      agenda: { currentItemIndex: 0, completedItems: [] },
      audio: { masterGain: 0.8, channelsMuted: { ch1: false, ch2: false, ch3: false, ch4: false } },
      streaming: { isStreaming: true, isRecording: true, targetUrl: 'rtmp://live.youtube.com/app/test-key' }
    };

    await journal1.saveSnapshot(baseState);
    recordPass('Base state snapshot saved');

    // -------------------------------------------------------------
    // Test 3: Record discrete service mutations (events)
    // -------------------------------------------------------------
    console.log('\n[Test 3] Recording discrete live events');
    await journal1.recordEvent('SLIDE_CHANGE', { activeSlideIndex: 5, slideTitle: 'Hymn Verse 5' });
    await journal1.recordEvent('CAMERA_CUT', { activeSlot: 3 });
    await journal1.recordEvent('AGENDA_ADVANCE', { currentItemIndex: 1, completedItems: [0] });
    await journal1.recordEvent('TIMER_UPDATE', { remainingSec: 1240 });
    recordPass('Events recorded without error');

    // -------------------------------------------------------------
    // Test 4: Simulate Crash / Power Failure
    // -------------------------------------------------------------
    console.log('\n[Test 4] Simulating ungraceful process termination (dirty crash)');
    // We close SQLite handle without calling markCleanExit()
    await journal1.close();
    recordPass('Process ungracefully terminated without clean exit flag');

    // -------------------------------------------------------------
    // Test 5: Re-open with RecoveryManager & Evaluate Recovery SLA
    // -------------------------------------------------------------
    console.log('\n[Test 5] Startup Recovery Evaluation');
    const journalRecovery = new ServiceJournal();
    const recoveryMgr = new RecoveryManager(journalRecovery);

    const startRecover = Date.now();
    const recoveryReport = await recoveryMgr.initialize(testDir);
    const elapsedMs = Date.now() - startRecover;

    assert.strictEqual(recoveryReport.recovered, true, 'RecoveryManager must detect previous crash');
    recordPass(`Crash detected and recovered in ${elapsedMs}ms (SLA: <3000ms)`);
    assert.ok(elapsedMs < 3000, `Recovery time (${elapsedMs}ms) must be under 3000ms SLA`);
    recordPass('Recovery latency SLA met (< 3000ms)');

    const state = recoveryReport.state;
    assert.strictEqual(state.presentation.activeSlideIndex, 5, 'Restored slide index must be 5');
    assert.strictEqual(state.presentation.slideTitle, 'Hymn Verse 5', 'Restored slide title preserved');
    assert.strictEqual(state.camera.activeSlot, 3, 'Restored active camera cut must be slot 3');
    assert.strictEqual(state.agenda.currentItemIndex, 1, 'Restored agenda index must be 1');
    assert.strictEqual(state.timer.remainingSec, 1240, 'Restored timer remainingSec must be 1240');
    recordPass('All live service states accurately reconstructed from snapshot + WAL events');

    // -------------------------------------------------------------
    // Test 6: Safety Invariants on Recovery
    // -------------------------------------------------------------
    console.log('\n[Test 6] Verifying Production Safety Invariants on Restored State');
    assert.strictEqual(state.streaming.isStreaming, false, 'Broadcast must be UNARMED / FALSE on recovery');
    assert.strictEqual(state.streaming.isRecording, false, 'Recording must be UNARMED / FALSE on recovery');
    assert.ok(state.audio.masterGain <= 0.7, 'Master audio gain must be capped at safe ceiling (<= 0.7)');
    assert.strictEqual(state.timer.isRunning, false, 'Timer running state must default to paused until operator action');
    recordPass('Production safety invariants strictly enforced (unarmed stream/rec, safe gain, paused timer)');

    // -------------------------------------------------------------
    // Test 7: Clean Exit Flagging
    // -------------------------------------------------------------
    console.log('\n[Test 7] Verifying Clean Exit Behavior');
    await recoveryMgr.markCleanExit();
    await recoveryMgr.close();

    const journalPostClean = new ServiceJournal();
    const recoveryPostClean = new RecoveryManager(journalPostClean);
    const postCleanReport = await recoveryPostClean.initialize(testDir);

    assert.strictEqual(postCleanReport.recovered, false, 'Clean exit should not trigger recovery mode');
    recordPass('Subsequent startup after clean exit reports normal state');

    await recoveryPostClean.close();

    // Clean up test directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup error on windows / locks
    }

    console.log(`\n=== P0-03 Test Suite Completed: ${testsPassed}/${totalTests} Passed ===\n`);
    process.exit(0);
  } catch (err) {
    recordFail('Unhandled exception in recovery test suite', err);
    console.error(err);
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (e) {}
    process.exit(1);
  }
}

runRecoveryTestSuite();
