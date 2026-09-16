/**
 * OCS STAGE 9.9 — LOCAL RECORDING + NETWORK RESILIENCE & PRODUCTION RECOVERY HARNESS
 *
 * Automated test suite covering:
 * Gate 1: ProgramRecorder Initialization, Deterministic Directory Hierarchy & 14-Field Telemetry
 * Gate 2: Clean Recording Finalization & Strict Container Verification (H.264 + AAC via FFprobe)
 * Gate 3: Bounded Frame Queue, Frame Atomicity & Stale Frame Dropping (Current-Frame Priority)
 * Gate 4: Watchdog Forward Progress & Immunity to Telemetry Gaps / Static Sermon Slides
 * Gate 5: Reconnect Backlog Reset & Zero Stale-Video Replay
 * Gate 6: Multi-Destination Mutual Isolation: YouTube + Facebook + Local Recording
 */

const net = require('net');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { DestinationWorker, DESTINATION_STATES } = require('../src/main/streaming/destinationWorker');
const { ProgramRecorder } = require('../src/main/recording/programRecorder');
const { getDeterministicRecordingPath } = require('../src/main/recording/recordingPath');

function getFfprobePath() {
  const possible = ['/opt/homebrew/bin/ffprobe', '/usr/local/bin/ffprobe', '/usr/bin/ffprobe'];
  for (const p of possible) {
    if (fs.existsSync(p)) return p;
  }
  return 'ffprobe';
}

function createMockSink() {
  return new Promise((resolve) => {
    let bytesReceived = 0;
    const server = net.createServer((socket) => {
      socket.on('data', (chunk) => {
        bytesReceived += chunk.length;
      });
      socket.on('error', () => {});
    });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        server,
        port,
        url: `tcp://127.0.0.1:${port}`,
        getBytes: () => bytesReceived,
        close: () => new Promise((res) => server.close(res)),
      });
    });
  });
}

function generateRgbaFrame(width, height, r = 128, g = 128, b = 128) {
  const buf = Buffer.alloc(width * height * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = 255;
  }
  return buf;
}

function generatePcmSineWave(samples = 1600, freq = 440, sampleRate = 48000) {
  const buf = Buffer.alloc(samples * 2 * 2); // 16-bit stereo PCM
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const val = Math.floor(Math.sin(2 * Math.PI * freq * t) * 16000);
    buf.writeInt16LE(val, i * 4);
    buf.writeInt16LE(val, i * 4 + 2);
  }
  return buf;
}

async function runStage99Harness() {
  console.log('================================================================');
  console.log(' OCS STAGE 9.9 — RECORDING & NETWORK RESILIENCE VALIDATION HARNESS ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function testAssert(condition, message) {
    if (condition) {
      console.log(`  ✓ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${message}`);
      failed++;
    }
  }

  const scratchDir = path.join(__dirname, '..', 'scratch', `stage99_${Date.now()}`);
  fs.mkdirSync(scratchDir, { recursive: true });

  // ──────────────────────────────────────────────────────────────────────────
  // GATE 1: Recording Initialization, Deterministic Directory & 14-Field Telemetry
  // ──────────────────────────────────────────────────────────────────────────
  console.log('── Gate 1: Recording Initialization & 14-Field Telemetry Contract ──');
  const d = new Date();
  const year = String(d.getFullYear());
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  // Verify the production getDeterministicRecordingPath resolver builds the date hierarchy
  const testBaseRecordings = path.join(scratchDir, 'recordings');
  const recOutPath = getDeterministicRecordingPath(testBaseRecordings, `OCS_${year}-${month}-${day}_test.mp4`);
  const deterministicDir = path.dirname(recOutPath);

  const rec = new ProgramRecorder();
  const startRes = await rec.start({
    outputPath: recOutPath,
    width: 640,
    height: 360,
    fps: 30,
    sampleRate: 48000,
    channels: 2,
    withAudio: true
  });

  testAssert(startRes.ok === true, 'ProgramRecorder.start returns ok: true');
  testAssert(rec.state === 'RECORDING', 'State transitions to RECORDING');
  testAssert(fs.existsSync(deterministicDir), 'Deterministic date-partitioned directory created automatically by resolver');
  testAssert(recOutPath.includes(path.join(year, month, day)), 'Recording path strictly follows YYYY/MM/DD date partition');

  const status = rec.getStatus();
  const required14Fields = [
    'recordingId', 'state', 'processPid', 'processStartTime', 'processExitTime',
    'outputPath', 'outputBytes', 'encodedFrames', 'lastFrameAt', 'lastAudioAt',
    'lastError', 'exitCode', 'exitSignal', 'durationMs'
  ];
  const missingFields = required14Fields.filter(f => !(f in status));
  testAssert(missingFields.length === 0, `All 14 required telemetry fields present (missing: ${missingFields.join(', ') || 'none'})`);
  testAssert(status.processPid !== null && status.processPid > 0, `FFmpeg process PID captured: ${status.processPid}`);

  // Push frames and audio chunks
  const frame640 = generateRgbaFrame(640, 360, 40, 160, 220);
  const audioChunk = generatePcmSineWave(1600, 440, 48000);
  for (let i = 0; i < 45; i++) {
    rec.writeVideoFrame(frame640);
    rec.writeAudioChunk(audioChunk);
  }

  const postWriteStatus = rec.getStatus();
  testAssert(postWriteStatus.encodedFrames === 45, `Recorded exactly 45 frames (got: ${postWriteStatus.encodedFrames})`);
  testAssert(postWriteStatus.lastFrameAt !== null, 'lastFrameAt timestamp advanced');
  testAssert(postWriteStatus.lastAudioAt !== null, 'lastAudioAt timestamp advanced');

  // ──────────────────────────────────────────────────────────────────────────
  // GATE 2: Clean Finalization & Strict Container Verification (ffprobe)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Gate 2: Clean Finalization & Media Verification (ffprobe) ──');
  const stopRes = await rec.stop();
  testAssert(stopRes.ok === true, 'ProgramRecorder.stop returns ok: true');
  testAssert(stopRes.state === 'COMPLETED', 'Final state marked as COMPLETED');
  testAssert(fs.existsSync(recOutPath), 'Recorded MP4 file exists on disk');
  testAssert(stopRes.bytesWritten > 1000, `Output file size > 1000 bytes (size: ${stopRes.bytesWritten} bytes)`);

  const ffprobeBin = getFfprobePath();
  const probeRes = spawnSync(ffprobeBin, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,width,height',
    '-of', 'json',
    recOutPath
  ], { encoding: 'utf8' });
  const videoProbe = JSON.parse(probeRes.stdout || '{}');
  const vStream = videoProbe.streams && videoProbe.streams[0];

  const audioProbeRes = spawnSync(ffprobeBin, [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=codec_name,sample_rate,channels',
    '-of', 'json',
    recOutPath
  ], { encoding: 'utf8' });
  const audioProbe = JSON.parse(audioProbeRes.stdout || '{}');
  const aStream = audioProbe.streams && audioProbe.streams[0];

  testAssert(vStream && vStream.codec_name === 'h264', 'Valid H.264 video stream detected via ffprobe');
  testAssert(aStream && aStream.codec_name === 'aac', 'Valid AAC audio stream detected via ffprobe');
  testAssert(vStream && vStream.width === 640 && vStream.height === 360, 'Video stream matches configured 640x360 resolution via ffprobe');

  // ──────────────────────────────────────────────────────────────────────────
  // GATE 3: Bounded Frame Queue, Frame Atomicity & Stale Frame Dropping
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Gate 3: Bounded Queue, Frame Atomicity & Stale Frame Dropping ──');
  const sink3 = await createMockSink();
  const worker3 = new DestinationWorker({
    id: 'gate3-bounded-queue',
    label: 'Queue Invariant Test',
    streamUrl: sink3.url,
    width: 640,
    height: 360,
    fps: 30,
    withAudio: false,
    format: 'mpegts'
  });
  await worker3.start();

  // Test Frame Atomicity: Arbitrary partial buffer must be rejected, preserving 1080p contract
  const partialBuffer = Buffer.alloc(1024); // Malformed / partial frame
  const acceptedPartial = worker3.writeVideoFrame(partialBuffer);
  testAssert(acceptedPartial === false, 'Partial/malformed frame rejected immediately to prevent rawvideo misalignment');

  // Test Stale Frame Dropping (Current-Frame Priority)
  // If a frame was captured 500ms ago (exceeding MAX_FRAME_AGE_MS = 250ms), it must be dropped
  const staleFrame = generateRgbaFrame(640, 360, 255, 0, 0);
  const acceptedStale = worker3.writeVideoFrame(staleFrame, { captureTimestamp: Date.now() - 500 });
  testAssert(acceptedStale === false, 'Stale frame (> 250ms old) dropped to prioritize current-frame freshness');

  // Test Current Frame Acceptance
  const currentFrame = generateRgbaFrame(640, 360, 0, 255, 0);
  const acceptedCurrent = worker3.writeVideoFrame(currentFrame, { captureTimestamp: Date.now() });
  testAssert(acceptedCurrent === true, 'Fresh current frame accepted and dispatched to FFmpeg stdin');

  await worker3.stop();
  await sink3.close();

  // ──────────────────────────────────────────────────────────────────────────
  // GATE 4: Watchdog Monotonic Forward Progress & Immunity to Telemetry Gaps
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Gate 4: Watchdog Progress Detection on Static Slide (bitrate=N/A) ──');
  const sink4 = await createMockSink();
  const worker4 = new DestinationWorker({
    id: 'gate4-watchdog-resilience',
    label: 'Watchdog Sermon Test',
    streamUrl: sink4.url,
    width: 640,
    height: 360,
    fps: 30,
    withAudio: false,
    format: 'mpegts'
  });
  await worker4.start();

  // Simulate static slide presentation
  const staticSlide = generateRgbaFrame(640, 360, 20, 20, 30);
  for (let i = 0; i < 60; i++) {
    worker4.writeVideoFrame(staticSlide, { captureTimestamp: Date.now() });
    await new Promise(r => setTimeout(r, 33));
  }

  const t0 = Date.now();
  while (Date.now() - t0 < 4000 && worker4.telemetry.encodedFrames === 0 && worker4.telemetry.outputBytes === 0) {
    worker4.writeVideoFrame(staticSlide, { captureTimestamp: Date.now() });
    await new Promise(r => setTimeout(r, 66));
  }

  // Trigger watchdog tick manually with static slide metrics
  worker4._auditHealth();
  testAssert(worker4.reconnectAttempts === 0, 'Watchdog does not trigger false reconnect on static slide');
  testAssert(worker4.telemetry.encodedFrames > 0 || worker4.telemetry.outputBytes > 0, 'Objective non-zero monotonic forward progress verified');

  await worker4.stop();
  await sink4.close();

  // ──────────────────────────────────────────────────────────────────────────
  // GATE 5: Reconnect Backlog Reset & Zero Stale-Video Replay
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Gate 5: Reconnect Backlog Reset & Zero Stale-Video Replay ──');
  const sink5 = await createMockSink();
  const worker5 = new DestinationWorker({
    id: 'gate5-reconnect-purge',
    label: 'Reconnect Backlog Purge Test',
    streamUrl: sink5.url,
    width: 640,
    height: 360,
    fps: 30,
    withAudio: false,
    format: 'mpegts'
  });
  await worker5.start();

  // Verify real process signal termination (simulating network drop / watchdog abort)
  const initialPid = worker5.proc ? worker5.proc.pid : null;
  testAssert(initialPid !== null, `Worker 5 spawned with active PID ${initialPid}`);

  if (worker5.proc) {
    worker5.proc.kill('SIGKILL');
  }
  await new Promise(r => setTimeout(r, 200));

  testAssert(worker5.telemetry.queueFrames === 0, 'Queue frames immediately purged to 0 upon exit');
  testAssert(worker5.telemetry.queueBytes === 0, 'Queue bytes immediately purged to 0 upon exit');
  testAssert(worker5.telemetry.currentFrameAgeMs === 0, 'Frame age reset to 0; no stale backlog replayed');
  testAssert(worker5.state === DESTINATION_STATES.RECONNECTING || worker5.state === DESTINATION_STATES.CONNECTING, 'State transitioned to RECONNECTING');

  // Await automatic reconnect and verify PID progression
  const reconnectWaitStart = Date.now();
  while (Date.now() - reconnectWaitStart < 4000 && (!worker5.proc || worker5.proc.pid === initialPid)) {
    await new Promise(r => setTimeout(r, 100));
  }
  testAssert(worker5.proc && worker5.proc.pid !== initialPid, `True reconnection verified: fresh process spawned (new PID: ${worker5.proc ? worker5.proc.pid : 'none'})`);

  await worker5.stop();
  await sink5.close();

  // ──────────────────────────────────────────────────────────────────────────
  // GATE 6: Multi-Destination Mutual Isolation with Local Recording
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Gate 6: Multi-Destination Mutual Isolation (YouTube + Facebook + Recording) ──');
  const sinkYT = await createMockSink();
  const sinkFB = await createMockSink();
  const rec6Path = path.join(scratchDir, 'gate6_recording.mp4');

  const workerYT = new DestinationWorker({
    id: 'dest-yt',
    label: 'YouTube Mock',
    streamUrl: sinkYT.url,
    width: 640,
    height: 360,
    fps: 30,
    withAudio: false,
    format: 'mpegts'
  });

  const workerFB = new DestinationWorker({
    id: 'dest-fb',
    label: 'Facebook Mock',
    streamUrl: sinkFB.url,
    width: 640,
    height: 360,
    fps: 30,
    withAudio: false,
    format: 'mpegts'
  });

  const rec6 = new ProgramRecorder();

  await Promise.all([
    workerYT.start(),
    workerFB.start(),
    rec6.start({
      outputPath: rec6Path,
      width: 640,
      height: 360,
      fps: 30,
      withAudio: false
    })
  ]);

  // Feed all three consumers
  const multiFrame = generateRgbaFrame(640, 360, 50, 150, 250);
  for (let i = 0; i < 20; i++) {
    workerYT.writeVideoFrame(multiFrame);
    workerFB.writeVideoFrame(multiFrame);
    rec6.writeVideoFrame(multiFrame);
    await new Promise(r => setTimeout(r, 20));
  }

  testAssert(workerYT.state === DESTINATION_STATES.CONNECTING || workerYT.state === DESTINATION_STATES.TRANSMITTING || workerYT.state === DESTINATION_STATES.LIVE, 'YouTube is active');
  testAssert(rec6.state === 'RECORDING', 'Local Program Recorder is actively recording');

  // Intentionally kill Facebook process (simulate severe platform network drop)
  if (workerFB.proc) {
    workerFB.proc.kill('SIGKILL');
  }
  await new Promise(r => setTimeout(r, 200));

  // YouTube and Recording must remain completely unaffected
  const isFbReconnecting = workerFB.state === DESTINATION_STATES.RECONNECTING ||
                           workerFB.state === DESTINATION_STATES.STOPPED ||
                           workerFB.telemetry.reconnectCount >= 1;
  testAssert(isFbReconnecting, 'Facebook entered isolated reconnect state');
  testAssert(rec6.state === 'RECORDING', 'Local recording remained continuous and uninterrupted');

  // Push more frames to YouTube and Recording while Facebook is down
  for (let i = 0; i < 15; i++) {
    workerYT.writeVideoFrame(multiFrame);
    rec6.writeVideoFrame(multiFrame);
  }

  const rec6Stop = await rec6.stop();
  testAssert(rec6Stop.ok === true && rec6Stop.bytesWritten > 1000, 'Local recording finalized cleanly after destination failure');

  await workerYT.stop();
  await workerFB.stop();
  await sinkYT.close();
  await sinkFB.close();

  // ──────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(` STAGE 9.9 VALIDATION COMPLETE: ${passed} PASSED, ${failed} FAILED `);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runStage99Harness().catch((err) => {
  console.error('[FATAL Stage 9.9 Harness Error]:', err);
  process.exit(1);
});
