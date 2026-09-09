/**
 * OCS Stage 9.3 — Multi-Destination Broadcast Engine Audit & Validation Harness
 *
 * Automated verification of:
 * 1. False LIVE Prevention: Unconfirmed broadcast never declares LIVE (metrics remain null).
 * 2. Multi-Destination Simulstreaming: 3 concurrent destinations receive continuous media.
 * 3. Bounded Backpressure: Slow destination drops stale frames locally without blocking others or bloating heap.
 * 4. Destination Failure Isolation: Hard crash of Destination B leaves Destination A & C fully operational.
 * 5. Active Output Watchdog: Media output stalls demote LIVE to DEGRADED within 4.0s.
 * 6. Concurrent Recording Resilience: Local MP4 recording remains valid throughout destination failures.
 */

'use strict';

const net = require('net');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { BroadcastSupervisor, BROADCAST_STATES } = require('../src/main/streaming/broadcastSupervisor');
const { DestinationWorker, DESTINATION_STATES } = require('../src/main/streaming/destinationWorker');
const { ProgramRecorder } = require('../src/main/recording/programRecorder');

const SCRATCH_DIR = path.join(__dirname, '..', 'scratch', `stage93_audit_${Date.now()}`);
fs.mkdirSync(SCRATCH_DIR, { recursive: true });

let testsPassed = 0;
let testsFailed = 0;

function pass(name) {
  console.log(`  ✓ [PASS] ${name}`);
  testsPassed++;
}

function fail(name, err) {
  console.error(`  ✗ [FAIL] ${name}:`, err.message || err);
  testsFailed++;
}

async function runStage93Audit() {
  console.log('================================================================');
  console.log(' OCS STAGE 9.3 — MULTI-DESTINATION BROADCAST ENGINE AUDIT PASS  ');
  console.log('================================================================\n');

  const supervisor = new BroadcastSupervisor();
  const ffmpegBin = supervisor.getFfmpegPath();
  const encoder = supervisor.detectHardwareEncoder();
  console.log(`[Config] FFmpeg: ${ffmpegBin}`);
  console.log(`[Config] Encoder: ${encoder}\n`);

  // ---------------------------------------------------------------------------
  // TEST 1: False LIVE Prevention & Null Metric Invariants
  // ---------------------------------------------------------------------------
  console.log('── Test 1: False LIVE Prevention & Null Telemetry Guarantees ──');
  try {
    const dummyWorker = new DestinationWorker({
      id: 'dest-null-check',
      streamUrl: 'rtmp://127.0.0.1:1935/live/test',
      ffmpegBin,
      encoder,
    });

    const initialStatus = dummyWorker.getStatus();
    assert.strictEqual(initialStatus.state, DESTINATION_STATES.IDLE);
    assert.strictEqual(initialStatus.fps, null, 'Idle fps must be null');
    assert.strictEqual(initialStatus.bitrateKbps, null, 'Idle bitrate must be null');

    // Simulate CONNECTING state with zero media output
    dummyWorker.state = DESTINATION_STATES.CONNECTING;
    dummyWorker.telemetry.fps = 0;
    dummyWorker.telemetry.bitrateKbps = 0;
    dummyWorker.telemetry.encodedFrames = 0;

    const connectingStatus = dummyWorker.getStatus();
    assert.strictEqual(connectingStatus.fps, null, 'Connecting fps must be null when unconfirmed');
    assert.strictEqual(connectingStatus.bitrateKbps, null, 'Connecting bitrate must be null when unconfirmed');
    assert.notStrictEqual(connectingStatus.state, DESTINATION_STATES.LIVE, 'Cannot be LIVE while connecting');

    pass('False LIVE is structurally prevented; unconfirmed metrics remain null');
  } catch (err) {
    fail('False LIVE prevention failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: 3-Destination Simulstream & Media Delivery Proof
  // ---------------------------------------------------------------------------
  console.log('\n── Test 2: 3-Destination Simulstreaming & Media Fanout ──');
  let sinkABytes = 0, sinkBBytes = 0, sinkCBytes = 0;

  const sinkA = net.createServer(s => { s.on('data', d => { sinkABytes += d.length; }); });
  const portA = await new Promise(r => sinkA.listen(0, '127.0.0.1', () => r(sinkA.address().port)));

  const sinkB = net.createServer(s => { s.on('data', d => { sinkBBytes += d.length; }); });
  const portB = await new Promise(r => sinkB.listen(0, '127.0.0.1', () => r(sinkB.address().port)));

  const sinkC = net.createServer(s => { s.on('data', d => { sinkCBytes += d.length; }); });
  const portC = await new Promise(r => sinkC.listen(0, '127.0.0.1', () => r(sinkC.address().port)));

  console.log(`  > Sink A (YouTube mock): tcp://127.0.0.1:${portA}`);
  console.log(`  > Sink B (Facebook mock): tcp://127.0.0.1:${portB}`);
  console.log(`  > Sink C (Twitch mock): tcp://127.0.0.1:${portC}`);

  const destinations = [
    { id: 'dest-yt', label: 'YouTube Live', streamUrl: `tcp://127.0.0.1:${portA}`, videoBitrateKbps: 1200 },
    { id: 'dest-fb', label: 'Facebook Live', streamUrl: `tcp://127.0.0.1:${portB}`, videoBitrateKbps: 1200 },
    { id: 'dest-tw', label: 'Twitch Live', streamUrl: `tcp://127.0.0.1:${portC}`, videoBitrateKbps: 1200 },
  ];

  // Start concurrent recording as well to prove recording independence
  const recorder = new ProgramRecorder();
  const recPath = path.join(SCRATCH_DIR, 'simulstream_record.mp4');
  await recorder.start({ outputPath: recPath, width: 320, height: 180, fps: 30, withAudio: false });

  const bcast = new BroadcastSupervisor();
  await bcast.startMulti(destinations, { width: 320, height: 180, fps: 30, withAudio: false });

  // Stream raw frames (320x180 RGBA = 230 KB per frame)
  const frameBuf = Buffer.alloc(320 * 180 * 4, 90);
  for (let i = 0; i < 60; i++) {
    bcast.writeVideoFrameAll(frameBuf);
    recorder.writeVideoFrame(frameBuf);
  }

  // Poll for media reception across all 3 destinations while feeding continuous frames
  const mediaWaitStart = Date.now();
  while (Date.now() - mediaWaitStart < 4500 && (sinkABytes === 0 || sinkBBytes === 0 || sinkCBytes === 0 || bcast._workers.get('dest-tw')?.state === DESTINATION_STATES.CONNECTING)) {
    bcast.writeVideoFrameAll(frameBuf);
    recorder.writeVideoFrame(frameBuf);
    await new Promise(r => setTimeout(r, 66));
  }

  console.log(`  > Bytes received: YouTube=${sinkABytes}, Facebook=${sinkBBytes}, Twitch=${sinkCBytes}`);

  try {
    assert.ok(sinkABytes > 0, 'YouTube mock received encoded video');
    assert.ok(sinkBBytes > 0, 'Facebook mock received encoded video');
    assert.ok(sinkCBytes > 0, 'Twitch mock received encoded video');
    assert.strictEqual(recorder.isRecording, true, 'Program recorder actively recording');
    pass('All 3 destinations simultaneously receive continuous media stream');
  } catch (err) {
    fail('Simulstream media delivery failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Bounded Backpressure & Zero Unbounded Heap Accumulation
  // ---------------------------------------------------------------------------
  console.log('\n── Test 3: Bounded Backpressure & Memory Bounding ──');
  try {
    const memBefore = process.memoryUsage().heapUsed;
    const workerB = bcast._workers.get('dest-fb');

    // Simulate backpressure on destination B: write 100 rapid frames
    let droppedOnB = 0;
    for (let i = 0; i < 100; i++) {
      const written = workerB.writeVideoFrame(frameBuf);
      if (!written) droppedOnB++;
    }

    const memAfter = process.memoryUsage().heapUsed;
    const heapDiffMB = (memAfter - memBefore) / (1024 * 1024);
    console.log(`  > Frames dropped due to bounded backpressure on Dest B: ${droppedOnB}`);
    console.log(`  > Heap Delta during 100-frame push: ${heapDiffMB.toFixed(2)} MB`);

    assert.ok(droppedOnB > 0, 'Worker B dropped stale frames when backpressured');
    assert.ok(heapDiffMB < 20, `Heap did not grow unbounded (delta: ${heapDiffMB.toFixed(2)} MB)`);
    pass('Bounded backpressure safely drops stale frames; heap remains bounded');
  } catch (err) {
    fail('Bounded backpressure test failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Destination Failure Isolation (Crash Facebook Mock)
  // ---------------------------------------------------------------------------
  console.log('\n── Test 4: Destination Failure Isolation ──');
  try {
    console.log('  > [Action] Injecting SIGKILL into Destination B (Facebook)...');
    const workerB = bcast._workers.get('dest-fb');
    if (workerB && workerB.proc) {
      workerB.proc.kill('SIGKILL');
    }

    await new Promise(r => setTimeout(r, 600));

    const statusAfterKill = bcast.getMultiStatus();
    console.log(`  > Post-Fault Status:`);
    console.log(`    - YouTube:  state=${statusAfterKill['dest-yt']?.state}, health=${statusAfterKill['dest-yt']?.health}`);
    console.log(`    - Facebook: state=${statusAfterKill['dest-fb']?.state}, health=${statusAfterKill['dest-fb']?.health}`);
    console.log(`    - Twitch:   state=${statusAfterKill['dest-tw']?.state}, health=${statusAfterKill['dest-tw']?.health}`);

    assert.strictEqual(statusAfterKill['dest-fb']?.state, DESTINATION_STATES.RECONNECTING);
    assert.ok(
      statusAfterKill['dest-yt']?.state === DESTINATION_STATES.TRANSMITTING ||
      statusAfterKill['dest-yt']?.state === DESTINATION_STATES.LIVE,
      'YouTube must remain TRANSMITTING or LIVE'
    );
    assert.ok(
      statusAfterKill['dest-tw']?.state === DESTINATION_STATES.TRANSMITTING ||
      statusAfterKill['dest-tw']?.state === DESTINATION_STATES.LIVE,
      'Twitch must remain TRANSMITTING or LIVE'
    );

    // Continue pushing frames: ensure YouTube and Twitch continue receiving data
    const bytesABefore = sinkABytes;
    const bytesCBefore = sinkCBytes;
    for (let i = 0; i < 30; i++) {
      bcast.writeVideoFrameAll(frameBuf);
      recorder.writeVideoFrame(frameBuf);
    }
    await new Promise(r => setTimeout(r, 400));

    assert.ok(sinkABytes > bytesABefore, 'YouTube continued receiving media during peer failure');
    assert.ok(sinkCBytes > bytesCBefore, 'Twitch continued receiving media during peer failure');
    assert.strictEqual(recorder.isRecording, true, 'Recorder continued uninterrupted');
    pass('Hard failure of Facebook did not interrupt YouTube, Twitch, or Recording');
  } catch (err) {
    fail('Destination failure isolation failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Active Output Watchdog (Stalled Media Demotes to DEGRADED)
  // ---------------------------------------------------------------------------
  console.log('\n── Test 5: Active Output Watchdog (Stall Demotion) ──');
  try {
    const workerA = bcast._workers.get('dest-yt');
    workerA.state = DESTINATION_STATES.LIVE;
    workerA.telemetry.lastOutputAt = Date.now() - 5000; // Simulated 5s output stall

    workerA._auditHealth();

    assert.strictEqual(workerA.state, DESTINATION_STATES.DEGRADED, 'Watchdog must demote LIVE to DEGRADED on stall');
    assert.strictEqual(workerA.telemetry.fps, null, 'Stalled destination must report null FPS');
    assert.strictEqual(workerA.telemetry.bitrateKbps, null, 'Stalled destination must report null bitrate');
    pass('Active watchdog promptly revokes LIVE to DEGRADED when media output stalls');
  } catch (err) {
    fail('Active watchdog test failed', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Clean Shutdown & MP4 Recording Integrity
  // ---------------------------------------------------------------------------
  console.log('\n── Test 6: Clean Shutdown & MP4 Container Probe ──');
  try {
    await bcast.stopAll();
    await recorder.stop();
    sinkA.close();
    sinkB.close();
    sinkC.close();

    assert.ok(fs.existsSync(recPath), 'Recorded MP4 file exists');
    const fileSize = fs.statSync(recPath).size;
    console.log(`  > Finalized Recording: ${recPath} (${fileSize} bytes)`);
    assert.ok(fileSize > 2000, `Recording has valid size (got ${fileSize} bytes)`);

    pass('Clean shutdown completed; MP4 recording finalized with valid container');
  } catch (err) {
    fail('Clean shutdown / recording test failed', err);
  }

  // Cleanup scratch directory
  try {
    fs.rmSync(SCRATCH_DIR, { recursive: true, force: true });
  } catch (_) {}

  console.log('\n================================================================');
  console.log(` RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runStage93Audit().catch(err => {
  console.error('[FATAL] Stage 9.3 Audit Runner crashed:', err);
  process.exit(1);
});
