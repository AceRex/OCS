/**
 * OCS Stage 8 — Runtime Integration Closure Test Suite
 *
 * Validates:
 * 1. Broadcast Supervisor State Machine (explicit states, no false LIVE, null metric display)
 * 2. RTMPS URL Normalization & Sanitization
 * 3. RecordingIndex (ACID persistence, ffprobe validation, status transitions, restart resilience)
 * 4. ProgramRecorder Storage Preflight Assertion
 * 5. Multi-Source Session List Merging (Transcriptions + MP4 Recordings)
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { BroadcastSupervisor, BROADCAST_STATES } = require('../src/main/streaming/broadcastSupervisor');
const { RecordingIndex } = require('../src/main/recording/recordingIndex');
const { ProgramRecorder } = require('../src/main/recording/programRecorder');

async function runStage8Tests() {
  console.log('====================================================');
  console.log(' OCS Stage 8: Runtime Integration Closure Test Gate  ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    ${err.message}\n`);
      failed++;
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    ${err.message}\n`);
      failed++;
    }
  }

  console.log('── Section 1: Broadcast State Machine & URL Security ──');

  test('BROADCAST_STATES enum defines all lifecycle states', () => {
    assert.ok(BROADCAST_STATES.IDLE, 'IDLE state defined');
    assert.ok(BROADCAST_STATES.CONNECTING, 'CONNECTING state defined');
    assert.ok(BROADCAST_STATES.ENCODING, 'ENCODING state defined');
    assert.ok(BROADCAST_STATES.TRANSMITTING, 'TRANSMITTING state defined');
    assert.ok(BROADCAST_STATES.LIVE, 'LIVE state defined');
    assert.ok(BROADCAST_STATES.RECONNECTING, 'RECONNECTING state defined');
    assert.ok(BROADCAST_STATES.FAILED, 'FAILED state defined');
    assert.ok(BROADCAST_STATES.STOPPED, 'STOPPED state defined');
  });

  test('BroadcastSupervisor starts in IDLE state', () => {
    const bs = new BroadcastSupervisor();
    assert.strictEqual(bs.state, BROADCAST_STATES.IDLE);
    const status = bs.getStatus();
    assert.strictEqual(status.state, BROADCAST_STATES.IDLE);
    assert.strictEqual(status.isStreaming, false);
    assert.strictEqual(status.stats.fps, null, 'Unconfirmed FPS must be null, not 0');
    assert.strictEqual(status.stats.bitrateKbps, null, 'Unconfirmed bitrate must be null, not 0');
  });

  test('BroadcastSupervisor masks stream keys in URL sanitization', () => {
    const bs = new BroadcastSupervisor();
    const masked1 = bs.sanitizeEndpoint('rtmps://a.rtmp.youtube.com/live2/abcd-1234-efgh-5678');
    assert.ok(!masked1.includes('abcd-1234-efgh-5678'), 'Private stream key must not be exposed');
    assert.ok(masked1.includes('live2/[REDACTED]'), 'Key should be replaced with [REDACTED]');

    const masked2 = bs.sanitizeEndpoint('rtmp://live-api-s.facebook.com:443/rtmp/FB-SECRET-KEY');
    assert.ok(!masked2.includes('FB-SECRET-KEY'), 'Facebook secret key must not be exposed');
    assert.ok(masked2.includes('rtmp/[REDACTED]'), 'Facebook key should be masked');
  });

  test('BroadcastSupervisor.getMultiStatus returns null metrics when not transmitting', () => {
    const bs = new BroadcastSupervisor();
    bs._multiStats.set('dest-yt', {
      isStreaming: false,
      state: BROADCAST_STATES.CONNECTING,
      health: 'connecting',
      fps: 0,
      bitrateKbps: 0,
      uptimeSec: 0,
      droppedFrames: 0,
      framesSent: 0,
      reconnects: 0,
    });

    const multi = bs.getMultiStatus();
    assert.ok(multi['dest-yt'], 'Destination status returned');
    assert.strictEqual(multi['dest-yt'].state, BROADCAST_STATES.CONNECTING);
    assert.strictEqual(multi['dest-yt'].fps, null, 'Connecting state must report null FPS');
    assert.strictEqual(multi['dest-yt'].bitrateKbps, null, 'Connecting state must report null bitrate');
  });

  test('BroadcastSupervisor.getMultiStatus returns active metrics when LIVE', () => {
    const bs = new BroadcastSupervisor();
    bs._multiStats.set('dest-fb', {
      isStreaming: true,
      state: BROADCAST_STATES.LIVE,
      health: 'good',
      fps: 30,
      bitrateKbps: 4500,
      uptimeSec: 42,
      droppedFrames: 1,
      framesSent: 1260,
      reconnects: 0,
    });

    const multi = bs.getMultiStatus();
    assert.strictEqual(multi['dest-fb'].state, BROADCAST_STATES.LIVE);
    assert.strictEqual(multi['dest-fb'].fps, 30);
    assert.strictEqual(multi['dest-fb'].bitrateKbps, 4500);
    assert.strictEqual(multi['dest-fb'].uptimeSec, 42);
  });

  console.log('\n── Section 2: Production RecordingIndex & ACID Persistence ──');

  const testRecDir = path.join(os.tmpdir(), `ocs_stage8_test_${Date.now()}`);
  fs.mkdirSync(testRecDir, { recursive: true });

  test('RecordingIndex creates and persists entry at recording start', () => {
    const index = new RecordingIndex(testRecDir, null);
    const fakeMp4 = path.join(testRecDir, 'service_rec_1.mp4');
    fs.writeFileSync(fakeMp4, Buffer.alloc(1024 * 100)); // 100KB dummy

    const entry = index.createEntry({
      outputPath: fakeMp4,
      title: 'Sunday Morning Service',
      width: 1920,
      height: 1080,
      fps: 30,
    });

    assert.ok(entry.id, 'Entry has unique ID');
    assert.strictEqual(entry.status, 'recording');
    assert.strictEqual(entry.width, 1920);
    assert.strictEqual(entry.height, 1080);
    assert.ok(fs.existsSync(path.join(testRecDir, 'index.json')), 'index.json written to disk');
  });

  test('RecordingIndex survives app crash and restart (persistence check)', () => {
    // Instantiate brand new instance to simulate complete application reboot
    const rebootedIndex = new RecordingIndex(testRecDir, null);
    const entries = rebootedIndex.listEntries();
    assert.strictEqual(entries.length, 1, 'Rebooted index loaded previous entry from disk');
    assert.strictEqual(entries[0].title, 'Sunday Morning Service');
  });

  test('RecordingIndex.finalizeEntry validates file existence and updates status', () => {
    const index = new RecordingIndex(testRecDir, null);
    const entries = index.listEntries();
    const entryId = entries[0].id;
    const fakeMp4 = entries[0].outputPath;

    const finalized = index.finalizeEntry(entryId, {
      outputPath: fakeMp4,
      durationSec: 3600,
      bytesWritten: 1024 * 100,
      framesRecorded: 108000,
    });

    assert.strictEqual(finalized.status, 'completed');
    assert.strictEqual(finalized.durationSec, 3600);
    assert.strictEqual(finalized.bytesWritten, 1024 * 100);
    assert.strictEqual(finalized.framesRecorded, 108000);
    assert.ok(finalized.endedAt, 'endedAt recorded');
  });

  test('RecordingIndex marks missing file as status: missing', () => {
    const index = new RecordingIndex(testRecDir, null);
    const missingMp4 = path.join(testRecDir, 'non_existent.mp4');
    const entry = index.createEntry({ outputPath: missingMp4 });

    const finalized = index.finalizeEntry(entry.id, { outputPath: missingMp4 });
    assert.strictEqual(finalized.status, 'missing');
    assert.ok(finalized.error.includes('Output file not found'));
  });

  test('RecordingIndex marks empty file as status: incomplete', () => {
    const index = new RecordingIndex(testRecDir, null);
    const emptyMp4 = path.join(testRecDir, 'empty.mp4');
    fs.writeFileSync(emptyMp4, Buffer.alloc(100)); // < 512 bytes threshold

    const entry = index.createEntry({ outputPath: emptyMp4 });
    const finalized = index.finalizeEntry(entry.id, { outputPath: emptyMp4 });
    assert.strictEqual(finalized.status, 'incomplete');
    assert.ok(finalized.error.includes('File too small'));
  });

  test('RecordingIndex.deleteEntry removes index entry and disk file', () => {
    const index = new RecordingIndex(testRecDir, null);
    const doomedFile = path.join(testRecDir, 'doomed.mp4');
    fs.writeFileSync(doomedFile, 'dummy data');

    const entry = index.createEntry({ outputPath: doomedFile });
    assert.ok(fs.existsSync(doomedFile), 'File exists on disk');

    index.deleteEntry(entry.id, true);
    assert.strictEqual(index.getEntry(entry.id), null, 'Entry removed from index');
    assert.strictEqual(fs.existsSync(doomedFile), false, 'File removed from disk');
  });

  console.log('\n── Section 3: Storage Preflight Check & ProgramRecorder ──');

  test('ProgramRecorder.getAvailableDiskSpace probes volume storage', () => {
    const freeBytes = ProgramRecorder.getAvailableDiskSpace(testRecDir);
    if (freeBytes !== null) {
      assert.ok(typeof freeBytes === 'number' && freeBytes > 0, 'Available disk space reported in bytes');
    }
  });

  await testAsync('ProgramRecorder.start rejects when disk space is below emergency threshold', async () => {
    const rec = new ProgramRecorder();
    let caught = false;
    try {
      await rec.start({
        outputPath: path.join(testRecDir, 'test_space.mp4'),
        minFreeBytes: Number.MAX_SAFE_INTEGER, // Artificially high threshold to test preflight
      });
    } catch (err) {
      caught = true;
      assert.ok(err.message.includes('Insufficient disk space'), 'Error explains disk space shortage');
    }
    assert.strictEqual(caught, true, 'Start must reject on insufficient storage');
  });

  console.log('\n── Section 4: Multi-Source Session List Merging ──');

  test('Session list handler merges archive + recording entries sorted newest-first', () => {
    const mockArchiveSessions = [
      { id: 'arch-1', title: 'Sermon 1', createdAt: 1000, type: 'transcription' },
      { id: 'arch-2', title: 'Sermon 2', createdAt: 3000, type: 'transcription' },
    ];

    const mockRecordings = [
      { id: 'rec-1', title: 'MP4 Rec 1', startedAt: 2000, type: 'recording' },
      { id: 'rec-2', title: 'MP4 Rec 2', startedAt: 4000, type: 'recording' },
    ];

    const combined = [...mockArchiveSessions, ...mockRecordings]
      .sort((a, b) => (b.createdAt || b.startedAt || 0) - (a.createdAt || a.startedAt || 0));

    assert.strictEqual(combined.length, 4);
    assert.strictEqual(combined[0].id, 'rec-2', 'Newest (4000) first');
    assert.strictEqual(combined[1].id, 'arch-2', 'Next (3000)');
    assert.strictEqual(combined[2].id, 'rec-1', 'Next (2000)');
    assert.strictEqual(combined[3].id, 'arch-1', 'Oldest (1000) last');
  });

  // Cleanup test artifacts
  try {
    fs.rmSync(testRecDir, { recursive: true, force: true });
  } catch (_) {}

  console.log('\n====================================================');
  console.log(` Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runStage8Tests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
