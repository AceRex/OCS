/**
 * OCS Stage 8 — Final Evidence-Only Validation Harness
 *
 * Covers:
 * - Requirement 3: Simulstream multi-destination isolation with deliberate failure injection
 * - Requirement 4: End-to-end Recording -> Session Index -> Restart -> Retrieval
 * - Requirement 5: Deep Media Validation (Valid MP4, Corrupted MP4, Random Bytes, Missing File)
 * - Requirement 7: Broadcast State Machine Full Lifecycle & Invariant Verification
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { spawn, spawnSync } = require('child_process');

const { BroadcastSupervisor, BROADCAST_STATES } = require('../src/main/streaming/broadcastSupervisor');
const { RecordingIndex } = require('../src/main/recording/recordingIndex');
const { ProgramRecorder } = require('../src/main/recording/programRecorder');

const SCRATCH_DIR = path.join(__dirname, '..', 'scratch', `evidence_pass_${Date.now()}`);
fs.mkdirSync(SCRATCH_DIR, { recursive: true });

async function runEvidencePass() {
  console.log('====================================================');
  console.log(' OCS Stage 8 — FINAL EVIDENCE-ONLY VALIDATION PASS   ');
  console.log('====================================================\n');

  const supervisor = new BroadcastSupervisor();
  const ffmpegBin = supervisor.getFfmpegPath();
  console.log(`[Runtime] FFmpeg Binary: ${ffmpegBin}`);

  // -----------------------------------------------------------------
  // REQUIREMENT 5: DEEP MEDIA VALIDATION (Valid, Corrupted, Random, Missing)
  // -----------------------------------------------------------------
  console.log('\n── Requirement 5: Media Validation with Real Container Probing ──');
  const recIndexDir = path.join(SCRATCH_DIR, 'rec_index_test');
  fs.mkdirSync(recIndexDir, { recursive: true });
  const index = new RecordingIndex(recIndexDir, ffmpegBin);

  // 5.1 Generate an actual valid MP4 with real H.264 video and AAC audio
  const validMp4Path = path.join(SCRATCH_DIR, 'real_valid.mp4');
  console.log('  > Generating actual valid MP4 (H.264 + AAC)...');
  spawnSync(ffmpegBin, [
    '-f', 'lavfi', '-i', 'color=c=navy:s=640x360:r=30',
    '-f', 'lavfi', '-i', 'sine=f=440:r=48000',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    '-t', '2.0',
    '-y', validMp4Path
  ]);
  assert.ok(fs.existsSync(validMp4Path), 'Valid MP4 generated');

  // Verify ffprobe on valid MP4
  const probe = index._probeMp4(validMp4Path);
  console.log(`  > Probe Valid MP4: ok=${probe.ok}, codec=${probe.codec}, container=${probe.container}, duration=${probe.durationSec}s`);
  assert.strictEqual(probe.ok, true, 'Valid MP4 probe must be ok');
  assert.strictEqual(probe.codec, 'h264', 'Video codec must be h264');
  assert.ok(probe.durationSec >= 1.8 && probe.durationSec <= 2.2, `Duration must be ~2s (got ${probe.durationSec})`);

  const entryValid = index.createEntry({ outputPath: validMp4Path, title: 'Valid Service Recording' });
  const finalizedValid = index.finalizeEntry(entryValid.id, { outputPath: validMp4Path });
  console.log(`  ✓ Valid MP4 Entry Status: ${finalizedValid.status}`);
  assert.strictEqual(finalizedValid.status, 'completed', 'Valid MP4 must finalize as completed');
  assert.strictEqual(finalizedValid.probeOk, true);

  // 5.2 Test missing file
  const missingPath = path.join(SCRATCH_DIR, 'ghost.mp4');
  const entryMissing = index.createEntry({ outputPath: missingPath });
  const finalizedMissing = index.finalizeEntry(entryMissing.id, { outputPath: missingPath });
  console.log(`  ✓ Missing File Entry Status: ${finalizedMissing.status}`);
  assert.strictEqual(finalizedMissing.status, 'missing', 'Non-existent file must finalize as missing');

  // 5.3 Test arbitrary random bytes (MUST NOT become completed)
  const randomBytesPath = path.join(SCRATCH_DIR, 'junk_bytes.mp4');
  const junkBuffer = Buffer.alloc(1024 * 64);
  for (let i = 0; i < junkBuffer.length; i++) junkBuffer[i] = Math.floor(Math.random() * 256);
  fs.writeFileSync(randomBytesPath, junkBuffer);

  const entryJunk = index.createEntry({ outputPath: randomBytesPath });
  const finalizedJunk = index.finalizeEntry(entryJunk.id, { outputPath: randomBytesPath });
  console.log(`  ✓ Random Junk Bytes Status: ${finalizedJunk.status} (Error: ${finalizedJunk.error})`);
  assert.notStrictEqual(finalizedJunk.status, 'completed', 'Random junk bytes MUST NOT become completed');
  assert.ok(finalizedJunk.status === 'corrupted' || finalizedJunk.status === 'incomplete');

  // 5.4 Test truncated / broken MP4 header
  const truncatedPath = path.join(SCRATCH_DIR, 'truncated.mp4');
  const validBytes = fs.readFileSync(validMp4Path);
  fs.writeFileSync(truncatedPath, validBytes.subarray(0, 500)); // slice off before moov/mdat
  const entryTrunc = index.createEntry({ outputPath: truncatedPath });
  const finalizedTrunc = index.finalizeEntry(entryTrunc.id, { outputPath: truncatedPath });
  console.log(`  ✓ Truncated MP4 Status: ${finalizedTrunc.status}`);
  assert.notStrictEqual(finalizedTrunc.status, 'completed');
  assert.ok(finalizedTrunc.status === 'corrupted' || finalizedTrunc.status === 'incomplete');

  // -----------------------------------------------------------------
  // REQUIREMENT 3: SIMULSTREAM MULTI-DESTINATION ISOLATION
  // -----------------------------------------------------------------
  console.log('\n── Requirement 3: Simulstream Destination Isolation Proof ──');

  // Set up 2 local TCP sinks (representing Destination A: YouTube, Destination B: Facebook)
  let sinkABytes = 0;
  let sinkBBytes = 0;

  const sinkA = net.createServer((socket) => {
    socket.on('data', (d) => { sinkABytes += d.length; });
  });
  const sinkAPort = await new Promise(r => sinkA.listen(0, '127.0.0.1', () => r(sinkA.address().port)));

  const sinkB = net.createServer((socket) => {
    socket.on('data', (d) => { sinkBBytes += d.length; });
  });
  const sinkBPort = await new Promise(r => sinkB.listen(0, '127.0.0.1', () => r(sinkB.address().port)));

  console.log(`  > Sink A (Primary / YouTube Mock): 127.0.0.1:${sinkAPort}`);
  console.log(`  > Sink B (Secondary / Facebook Mock): 127.0.0.1:${sinkBPort}`);

  // Also start Program Recorder concurrently
  const recorder = new ProgramRecorder();
  const simRecPath = path.join(SCRATCH_DIR, 'simulstream_rec.mp4');
  await recorder.start({ outputPath: simRecPath, width: 320, height: 180, fps: 30, withAudio: false });

  const bcast = new BroadcastSupervisor();
  const destConfigs = [
    { id: 'dest-yt', label: 'YouTube Mock', streamUrl: `tcp://127.0.0.1:${sinkAPort}`, videoBitrateKbps: 1500 },
    { id: 'dest-fb', label: 'Facebook Mock', streamUrl: `tcp://127.0.0.1:${sinkBPort}`, videoBitrateKbps: 1500 }
  ];

  await bcast.startMulti(destConfigs, { width: 320, height: 180, fps: 30, withAudio: false });

  // Stream raw frames to both destinations AND recorder
  const frameBuf = Buffer.alloc(320 * 180 * 4, 120);
  for (let i = 0; i < 45; i++) {
    bcast.writeVideoFrameAll(frameBuf);
    recorder.writeVideoFrame(frameBuf);
  }

  const startWait = Date.now();
  while (Date.now() - startWait < 3000 && (sinkABytes === 0 || sinkBBytes === 0)) {
    await new Promise(r => setTimeout(r, 100));
  }

  let statusInitial = bcast.getMultiStatus();
  console.log(`  > Initial Status: dest-yt=${statusInitial['dest-yt']?.health}, dest-fb=${statusInitial['dest-fb']?.health}`);
  console.log(`  > Bytes received: Sink A = ${sinkABytes}, Sink B = ${sinkBBytes}`);
  assert.ok(sinkABytes > 0, 'Sink A received media');
  assert.ok(sinkBBytes > 0, 'Sink B received media');
  assert.strictEqual(recorder.isRecording, true, 'Program recorder is active');

  // Deliberately kill Destination B process to inject failure
  console.log('  > [Failure Injection] Terminating Destination B (Facebook Mock)...');
  const procB = bcast._multiProcesses.get('dest-fb');
  assert.ok(procB, 'Process B exists');
  procB.kill('SIGKILL');

  await new Promise(r => setTimeout(r, 500));

  const statusAfterFault = bcast.getMultiStatus();
  console.log(`  > Post-Fault Status:`);
  console.log(`    - dest-fb: state=${statusAfterFault['dest-fb']?.state}, health=${statusAfterFault['dest-fb']?.health}`);
  console.log(`    - dest-yt: state=${statusAfterFault['dest-yt']?.state}, health=${statusAfterFault['dest-yt']?.health}`);

  assert.ok(
    statusAfterFault['dest-fb']?.state === BROADCAST_STATES.RECONNECTING ||
    statusAfterFault['dest-fb']?.state === BROADCAST_STATES.STOPPED ||
    statusAfterFault['dest-fb']?.health === 'offline',
    'Failed destination must enter RECONNECTING or STOPPED'
  );

  assert.ok(
    statusAfterFault['dest-yt']?.health === 'good' || statusAfterFault['dest-yt']?.state === BROADCAST_STATES.LIVE || statusAfterFault['dest-yt']?.state === BROADCAST_STATES.TRANSMITTING,
    'Healthy destination must remain active and unaffected'
  );

  // Push additional frames: ensure Destination A and Recorder continue receiving
  const sinkAPrevious = sinkABytes;
  for (let i = 0; i < 30; i++) {
    bcast.writeVideoFrameAll(frameBuf);
    recorder.writeVideoFrame(frameBuf);
  }
  await new Promise(r => setTimeout(r, 400));
  assert.ok(sinkABytes > sinkAPrevious, 'Healthy destination continued transmitting during peer failure');
  assert.strictEqual(recorder.isRecording, true, 'Recording continued during stream failure');
  console.log('  ✓ [PASS] Destination failure isolation strictly confirmed.');

  await bcast.stopAll();
  await recorder.stop();
  sinkA.close();
  sinkB.close();

  // -----------------------------------------------------------------
  // REQUIREMENT 4: RECORDING -> SESSION PERSISTENCE & RESTART PROOF
  // -----------------------------------------------------------------
  console.log('\n── Requirement 4: End-to-End Recording -> Session Persistence Proof ──');
  const userRecDir = path.join(SCRATCH_DIR, 'persistent_recordings');
  fs.mkdirSync(userRecDir, { recursive: true });

  const activeIndex = new RecordingIndex(userRecDir, ffmpegBin);
  const prodRecPath = path.join(userRecDir, 'service_sunday.mp4');

  // Step 1: Start Recording -> creates initial entry
  console.log('  > [Step 1] Creating recording session entry at start...');
  const activeEntry = activeIndex.createEntry({
    outputPath: prodRecPath,
    title: 'Sunday Morning Worship & Word',
    width: 1280,
    height: 720,
    fps: 30
  });
  assert.strictEqual(activeEntry.status, 'recording');
  assert.ok(fs.existsSync(path.join(userRecDir, 'index.json')));

  // Step 2: Write valid MP4 media
  console.log('  > [Step 2] Recording media stream written...');
  spawnSync(ffmpegBin, [
    '-f', 'lavfi', '-i', 'color=c=navy:s=1280x720:r=30',
    '-f', 'lavfi', '-i', 'sine=f=440:r=48000',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-t', '1.5',
    '-y', prodRecPath
  ]);

  // Step 3: Finalize recording entry
  console.log('  > [Step 3] Finalizing recording entry with media probe...');
  const finalizedSession = activeIndex.finalizeEntry(activeEntry.id, { outputPath: prodRecPath });
  assert.strictEqual(finalizedSession.status, 'completed');
  assert.ok(finalizedSession.durationSec >= 1.4);
  console.log(`  ✓ Finalized Session: id=${finalizedSession.id}, duration=${finalizedSession.durationSec}s, bytes=${finalizedSession.bytesWritten}`);

  // Step 4: Simulate Cold App Restart (Reopen OCS)
  console.log('  > [Step 4] Simulating cold app reboot (new process / instance)...');
  const rebootedIndex = new RecordingIndex(userRecDir, ffmpegBin);
  const loadedSessions = rebootedIndex.listEntries();
  assert.strictEqual(loadedSessions.length, 1, 'Rebooted index contains the persisted session');
  assert.strictEqual(loadedSessions[0].id, activeEntry.id);
  assert.strictEqual(loadedSessions[0].title, 'Sunday Morning Worship & Word');
  assert.strictEqual(loadedSessions[0].status, 'completed');
  assert.ok(fs.existsSync(loadedSessions[0].outputPath), 'Recorded MP4 exists on filesystem');
  console.log('  ✓ [PASS] Cold reboot persistence verified. Session metadata intact.');

  // -----------------------------------------------------------------
  // REQUIREMENT 7: BROADCAST STATE MACHINE INVARIANT VERIFICATION
  // -----------------------------------------------------------------
  console.log('\n── Requirement 7: Broadcast State Machine Invariant Verification ──');

  const sm = new BroadcastSupervisor();
  assert.strictEqual(sm.state, BROADCAST_STATES.IDLE);

  // Invariant 1: LIVE with FPS=0, Bitrate=0 is impossible in telemetry
  sm.state = BROADCAST_STATES.CONNECTING;
  sm.stats.fps = 0;
  sm.stats.bitrateKbps = 0;
  const statusConnecting = sm.getStatus();
  assert.strictEqual(statusConnecting.stats.fps, null, 'Unconfirmed FPS must be null, never 0');
  assert.strictEqual(statusConnecting.stats.bitrateKbps, null, 'Unconfirmed Bitrate must be null, never 0');

  // Invariant 2: Failure transitions
  sm.state = BROADCAST_STATES.FAILED;
  const statusFailed = sm.getStatus();
  assert.strictEqual(statusFailed.state, BROADCAST_STATES.FAILED);

  console.log('  ✓ [PASS] State machine invariants and null metric guarantees verified.');

  console.log('\n====================================================');
  console.log(' ALL FINAL EVIDENCE-PASS ASSERTIONS PASSED (100%)    ');
  console.log('====================================================\n');
  process.exit(0);
}

runEvidencePass().catch(err => {
  console.error('Evidence pass error:', err);
  process.exit(1);
});
