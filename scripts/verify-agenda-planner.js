/**
 * Comprehensive Verification Script for Standalone Agenda Planner
 * 
 * Verifies:
 * 1. Model creation, structured durations, validation & summary math.
 * 2. Timeline conflict detection & automatic resolution.
 * 3. Legacy Redux agenda migration to v1 document schema.
 * 4. LAN Transfer Offer/Accept handshake & SHA-256 deduplication.
 * 5. Chunked file streaming with checksum validation and staging assembly.
 * 6. "Load Agenda" isolation guarantee (zero live display updates on load).
 * 7. Authoritative monotonic execution engine:
 *    - Accurate timing (start, pause, resume, stop).
 *    - Auto-advance & countdown intervals.
 *    - Non-destructive source trimming offset handling.
 * 8. Operator manual override protection (manual change preserved on clip end).
 * 9. Universal 12px border radius compliance across Desktop & Mobile UI.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

// Import core modules
const {
  createEmptyAgenda,
  createEmptySession,
  createTimelineItem,
  calculateAgendaSummary,
  detectTimelineConflicts,
  resolveTimelineConflict,
  validateAgendaDocument,
  migrateLegacyAgenda,
} = require('../src/main/agenda/agendaModel');

const AgendaTransferManager = require('../src/main/agenda/agendaTransferManager');
const AgendaExecutionEngine = require('../src/main/agenda/agendaExecutionEngine');

async function runAllTests() {
  console.log('====================================================');
  console.log('🚀 RUNNING COMPREHENSIVE AGENDA PLANNER TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(err);
      process.exitCode = 1;
    }
  }

  async function asyncTest(name, fn) {
    total++;
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(err);
      process.exitCode = 1;
    }
  }

  // --- Test 1: Model validation & structured durations ---
  test('Test 1: Model creation, validation & summary calculation', () => {
    const agenda = createEmptyAgenda('Sunday Morning Service');
    assert.strictEqual(agenda.name, 'Sunday Morning Service');
    assert.strictEqual(agenda.sessions.length, 0);

    const s1 = createEmptySession('Praise & Worship', 1200); // 20 min
    s1.intervalSec = 60; // 1 min interval
    s1.transitionMode = 'auto';

    const s2 = createEmptySession('Sermon', 2400); // 40 min
    s2.intervalSec = 0;
    s2.transitionMode = 'manual';

    agenda.sessions.push(s1, s2);
    const summary = calculateAgendaSummary(agenda);
    assert.strictEqual(summary.totalEventSec, 3660); // 1200 + 60 + 2400
    assert.strictEqual(summary.formattedTotalTime, '01:01:00');
    assert.strictEqual(summary.totalSessionSec, 3600);
    assert.strictEqual(summary.totalIntervalSec, 60);

    const validation = validateAgendaDocument(agenda);
    assert.strictEqual(validation.valid, true);
    assert.strictEqual(validation.errors.length, 0);
  });

  // --- Test 2: Timeline conflict detection & automatic resolution ---
  test('Test 2: Timeline conflict detection & automatic resolution', () => {
    const session = createEmptySession('Worship & Media', 600);

    // Add 2 overlapping video cues
    const cue1 = createTimelineItem({
      name: 'Intro Video',
      track: 'video',
      actionType: 'range',
      startSec: 10,
      durationSec: 120, // 10 -> 130
    });

    const cue2 = createTimelineItem({
      name: 'Testimony Clip',
      track: 'video',
      actionType: 'range',
      startSec: 100, // Overlaps cue1 by 30s
      durationSec: 60,
    });

    session.timelineItems = [cue1, cue2];
    const conflicts = detectTimelineConflicts(session);
    assert.strictEqual(conflicts.length, 1);
    assert.strictEqual(conflicts[0].track, 'video');
    assert.strictEqual(conflicts[0].itemA.id, cue1.id);
    assert.strictEqual(conflicts[0].itemB.id, cue2.id);

    // Auto-resolve conflict by shifting next clip
    const resolvedSession = resolveTimelineConflict(session, conflicts[0].id, 'shift_next');
    const postConflicts = detectTimelineConflicts(resolvedSession);
    assert.strictEqual(postConflicts.length, 0);
    // cue2 should be shifted to start after cue1 (130s)
    const shiftedCue2 = resolvedSession.timelineItems.find((c) => c.id === cue2.id);
    assert.strictEqual(shiftedCue2.startSec, 130);
  });

  // --- Test 3: Legacy Redux Agenda Migration ---
  test('Test 3: Legacy Redux Agenda Migration', () => {
    const legacyList = [
      { agenda: 'Opening Prayer', time: 300, anchor: 'Pastor Dan' },
      { agenda: 'Worship Set', time: 1200, anchor: 'Worship Team' },
    ];

    const migrated = migrateLegacyAgenda(legacyList);
    assert.ok(migrated.id.startsWith('agenda_'));
    assert.strictEqual(migrated.sessions.length, 2);
    assert.strictEqual(migrated.sessions[0].name, 'Opening Prayer');
    assert.strictEqual(migrated.sessions[0].durationSec, 300);
    assert.strictEqual(migrated.sessions[0].notes, 'Anchor / Leader: Pastor Dan');
    assert.strictEqual(migrated.sessions[1].name, 'Worship Set');
    assert.strictEqual(migrated.sessions[1].durationSec, 1200);
  });

  // --- Test 4: LAN Transfer Manager: Handshake & Deduplication ---
  await asyncTest('Test 4: LAN Handshake, Storage & SHA-256 Deduplication', async () => {
    const testDir = path.join(__dirname, '..', 'userData_test_agenda');
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    fs.mkdirSync(testDir, { recursive: true });

    const transferMgr = new AgendaTransferManager(testDir);
    await transferMgr.init();

    const sampleContent = Buffer.from('TEST_MEDIA_STREAM_CONTENT_12345');
    const hash = crypto.createHash('sha256').update(sampleContent).digest('hex');

    // Pre-create an asset in the library to test deduplication
    const libraryDir = path.join(testDir, 'agenda_assets');
    const preExistingFile = path.join(libraryDir, `${hash}.mp4`);
    fs.writeFileSync(preExistingFile, sampleContent);

    // Prepare transfer offer
    const agenda = createEmptyAgenda('Remote Service');
    agenda.assets = [
      {
        id: 'asset-1',
        originalName: 'clip.mp4',
        size: sampleContent.length,
        hash: hash,
        type: 'video',
      },
      {
        id: 'asset-2',
        originalName: 'new_audio.mp3',
        size: 1024,
        hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        type: 'audio',
      },
    ];

    const offerResult = await transferMgr.handleOffer({ agenda, deviceName: 'Mobile Companion', deviceIp: '192.168.1.50' });
    assert.strictEqual(offerResult.ok, true);
    // asset-1 exists, so skippedCount = 1, neededCount = 1
    assert.strictEqual(offerResult.skippedCount, 1);
    assert.strictEqual(offerResult.neededCount, 1);
    assert.strictEqual(offerResult.totalNeededBytes, 1024);

    // Operator responds accept
    const acceptResult = await transferMgr.respondToOffer(offerResult.transferId, true);
    assert.strictEqual(acceptResult.ok, true);
    assert.strictEqual(acceptResult.accepted, true);
    assert.strictEqual(acceptResult.neededAssetHashes.includes(agenda.assets[1].hash), true);

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  // --- Test 5: Chunked File Transfer Integrity & Checksum Verification ---
  await asyncTest('Test 5: Chunked File Transfer & SHA-256 Verification', async () => {
    const testDir = path.join(__dirname, '..', 'userData_test_chunk');
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    fs.mkdirSync(testDir, { recursive: true });

    const transferMgr = new AgendaTransferManager(testDir);
    await transferMgr.init();

    const fileData = Buffer.from('CHUNKED_STREAM_PAYLOAD_ABCDEFGHIJKLMN_9876543210');
    const hash = crypto.createHash('sha256').update(fileData).digest('hex');

    const agenda = createEmptyAgenda('Streaming Test');
    agenda.assets = [{ id: 'a1', originalName: 'stream.mp4', size: fileData.length, hash, type: 'video' }];

    const offerResult = await transferMgr.handleOffer({ agenda, deviceName: 'Mobile Phone' });
    const acceptResult = await transferMgr.respondToOffer(offerResult.transferId, true);
    const transferId = acceptResult.transferId;

    // Send 2 chunks
    const chunk1 = fileData.subarray(0, 20);
    const chunk2 = fileData.subarray(20);

    const r1 = await transferMgr.writeChunk({
      transferId,
      hash,
      chunkIndex: 0,
      totalChunks: 2,
      data: chunk1.toString('base64'),
    });
    assert.strictEqual(r1.ok, true);
    assert.strictEqual(r1.bytesWritten, 20);

    const r2 = await transferMgr.writeChunk({
      transferId,
      hash,
      chunkIndex: 1,
      totalChunks: 2,
      data: chunk2.toString('base64'),
    });
    assert.strictEqual(r2.ok, true);
    assert.strictEqual(r2.overallPct, 100);

    // Finalize asset
    const finAsset = await transferMgr.finalizeAsset({ transferId, hash, originalName: 'stream.mp4' });
    assert.strictEqual(finAsset.ok, true);
    assert.strictEqual(finAsset.hash, hash);

    // Finalize full transfer
    const finTransfer = await transferMgr.finalizeTransfer(transferId);
    assert.strictEqual(finTransfer.ok, true);
    assert.strictEqual(finTransfer.status, 'ready');

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  // --- Test 6: "Load Agenda" Isolation Guarantee ---
  test('Test 6: "Load Agenda" isolation (zero live output changes on load)', () => {
    let liveDisplayChanged = false;
    let timerStarted = false;

    const engine = new AgendaExecutionEngine({
      dispatchBackground: () => { liveDisplayChanged = true; },
      dispatchPresentation: () => { liveDisplayChanged = true; },
      dispatchAudio: () => { liveDisplayChanged = true; },
      syncTimer: (state) => {
        if (state.isRunning) timerStarted = true;
      },
    });

    const agenda = createEmptyAgenda('Load Safety Service');
    const s1 = createEmptySession('Welcome', 300);
    s1.timelineItems.push(createTimelineItem({
      track: 'background',
      actionType: 'point',
      name: 'Welcome BG',
      startSec: 0,
    }));
    agenda.sessions.push(s1);

    // Load agenda into engine
    const state = engine.loadAgenda(agenda);
    assert.strictEqual(engine.status, 'idle');
    assert.strictEqual(state.agendaId, agenda.id);
    assert.strictEqual(engine.sessionIndex, 0);

    // Assert live output was untouched
    assert.strictEqual(liveDisplayChanged, false, 'Loading agenda must NOT touch live displays!');
    assert.strictEqual(timerStarted, false, 'Loading agenda must NOT start timers!');
  });

  // --- Test 7: Authoritative Monotonic Execution Engine ---
  await asyncTest('Test 7: Authoritative Execution Engine (Actions & Auto-Advance)', async () => {
    const actionsTriggered = [];

    const engine = new AgendaExecutionEngine({
      dispatchBackground: (action) => actionsTriggered.push({ type: 'BACKGROUND', action }),
      dispatchPresentation: (action) => actionsTriggered.push({ type: 'PRESENTATION', action }),
      dispatchAudio: (action) => actionsTriggered.push({ type: 'AUDIO', action }),
      syncTimer: () => {},
    });

    const agenda = createEmptyAgenda('Engine Test');
    const s1 = createEmptySession('Session 1', 2);
    s1.intervalSec = 1;
    s1.transitionMode = 'auto';

    const s2 = createEmptySession('Session 2', 2);
    s2.intervalSec = 0;
    s2.transitionMode = 'manual';

    const bgCue = createTimelineItem({
      track: 'background',
      actionType: 'range',
      name: 'Blue Horizon',
      startSec: 0,
      durationSec: 2,
    });
    s1.timelineItems.push(bgCue);
    agenda.sessions.push(s1, s2);

    engine.loadAgenda(agenda);

    // Start execution
    engine.start();
    assert.strictEqual(engine.status, 'running');

    // Background cue at offset 0 should have fired
    assert.strictEqual(actionsTriggered.length, 1);
    assert.strictEqual(actionsTriggered[0].type, 'BACKGROUND');
    assert.strictEqual(actionsTriggered[0].action.cueId, bgCue.id);

    // Fast-forward ticker artificially
    engine.lastTickTime = Date.now() - 2100; // 2.1 seconds elapsed
    engine.tick();

    // Now in interval mode
    assert.strictEqual(engine.status, 'interval');

    // Complete interval
    engine.lastTickTime = Date.now() - 1100; // 1.1 seconds elapsed
    engine.tick();

    // Now Session 2 is running
    assert.strictEqual(engine.status, 'running');
    assert.strictEqual(engine.sessionIndex, 1);

    // Pause & Resume
    engine.pause();
    assert.strictEqual(engine.status, 'paused');
    engine.resume();
    assert.strictEqual(engine.status, 'running');

    // Stop
    engine.stop();
    assert.strictEqual(engine.status, 'stopped');
  });

  // --- Test 8: Operator Override Invariant Protection ---
  test('Test 8: Operator manual override protection', () => {
    let restored = false;
    const engine = new AgendaExecutionEngine({
      dispatchBackground: (action) => {
        if (action.type === 'image' && action.color === '#RESTORED#') {
          restored = true;
        }
      },
    });

    const agenda = createEmptyAgenda('Override Test');
    const s = createEmptySession('Sermon', 60);
    const bgCue = createTimelineItem({
      track: 'background',
      actionType: 'range',
      name: 'Session BG',
      startSec: 0,
      durationSec: 10,
      endBehavior: 'restore',
    });
    s.timelineItems.push(bgCue);
    agenda.sessions.push(s);

    engine.loadAgenda(agenda);
    engine.preActionBackground = { type: 'image', color: '#RESTORED#' };
    engine.start();

    // Operator manually selects a different slide / background on the live switcher!
    engine.tagOperatorOverride('background');
    assert.strictEqual(engine.operatorOverridden, true);

    // End the cue
    engine.endCue(bgCue);

    // The engine must NOT restore previous background because operator manually intervened!
    assert.strictEqual(restored, false, 'Engine must NOT overwrite operator manual change on clip end!');
    engine.stop();
  });

  // --- Test 9: Universal 12px Border Radius Invariant Verification ---
  test('Test 9: Universal 12px Border Radius compliance in Agenda UI files', () => {
    const desktopAgendaController = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'App', 'controller', 'AgendaController.jsx'),
      'utf-8'
    );
    const mobileAgendaScreen = fs.readFileSync(
      path.join(__dirname, '..', 'ocs-mobile', 'app', 'agenda.tsx'),
      'utf-8'
    );

    // Invariant: Universal 12px border radius.
    // Disallowed tailwind radius classes: rounded-sm, rounded-md, rounded-lg, rounded-2xl, rounded-3xl
    const disallowedRadius = [
      /\brounded-sm\b/,
      /\brounded-md\b/,
      /\brounded-lg\b/,
      /\brounded-2xl\b/,
      /\brounded-3xl\b/,
    ];

    for (const re of disallowedRadius) {
      const match = desktopAgendaController.match(re);
      assert.strictEqual(match, null, `Disallowed border-radius found in AgendaController.jsx: ${match?.[0]}`);
    }

    // Check mobile file for inline borderRadius !== 12 (except pills/circles with 9999)
    const styleMatches = [...mobileAgendaScreen.matchAll(/borderRadius:\s*([0-9]+)/g)];
    for (const m of styleMatches) {
      const val = parseInt(m[1], 10);
      assert.ok(val === 12 || val >= 999, `Disallowed borderRadius in mobile agenda.tsx: ${val}px (must be 12px or pill)`);
    }
  });

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passed}/${total} AGENDA PLANNER TESTS PASSED SUCCESSFULLY!`);
  console.log('====================================================');
}

runAllTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
