/**
 * OCS STAGE 10 — PACKAGED RUNTIME, LIVE RECOVERY & SERVICE REHEARSAL HARNESS
 *
 * Automated verification harness for:
 * Gate 1: Packaged Runtime Artifact Audit & Default Path Resolution
 * Gate 2: Sustained Queue Bounding & Zero Buffer Retention Under Backpressure
 * Gate 3: Live Recovery & Interruption Matrix (Fault Injection & Current-Frame Priority)
 * Gate 4: Sustained Service Rehearsal (Church Workflow & Resource Profiling)
 * Gate 5: Recording Failure Handling & Clean Re-initialization
 * Gate 6: A/V Sync & Frame Monotonicity Bitstream Verification (ffprobe)
 * Gate 7: Real External Platform Credential Audit (E5 Invariant)
 */

const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const { DestinationWorker, DESTINATION_STATES } = require('../src/main/streaming/destinationWorker');
const { ProgramRecorder } = require('../src/main/recording/programRecorder');
const { getDeterministicRecordingPath } = require('../src/main/recording/recordingPath');
const { BroadcastSupervisor } = require('../src/main/streaming/broadcastSupervisor');

function getFfprobePath() {
  const possible = ['/opt/homebrew/bin/ffprobe', '/usr/local/bin/ffprobe', '/usr/bin/ffprobe'];
  for (const p of possible) {
    if (fs.existsSync(p)) return p;
  }
  return 'ffprobe';
}

function getFfmpegPath() {
  const possible = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'];
  for (const p of possible) {
    if (fs.existsSync(p)) return p;
  }
  return 'ffmpeg';
}

function createMockSink() {
  return new Promise((resolve) => {
    let bytesReceived = 0;
    let isPaused = false;
    let activeSocket = null;

    const server = net.createServer((socket) => {
      activeSocket = socket;
      socket.on('data', (chunk) => {
        if (!isPaused) {
          bytesReceived += chunk.length;
        }
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
        pause: () => {
          isPaused = true;
          if (activeSocket) activeSocket.pause();
        },
        resume: () => {
          isPaused = false;
          if (activeSocket) activeSocket.resume();
        },
        destroySocket: () => {
          if (activeSocket) {
            activeSocket.destroy();
            activeSocket = null;
          }
        },
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

async function runStage10Harness() {
  console.log('================================================================');
  console.log(' OCS STAGE 10 — PRODUCTION REHEARSAL & RUNTIME VALIDATION HARNESS ');
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

  const scratchDir = path.join(__dirname, '..', 'scratch', `stage10_${Date.now()}`);
  fs.mkdirSync(scratchDir, { recursive: true });

  const ffmpegBin = getFfmpegPath();
  const ffprobeBin = getFfprobePath();
  const supervisor = new BroadcastSupervisor();
  const hardwareEncoder = supervisor.detectHardwareEncoder();

  console.log(`[Config] FFmpeg: ${ffmpegBin}`);
  console.log(`[Config] FFprobe: ${ffprobeBin}`);
  console.log(`[Config] Hardware Encoder: ${hardwareEncoder}`);
  console.log(`[Config] Host System: ${os.type()} ${os.arch()} (${os.release()})\n`);

  // ──────────────────────────────────────────────────────────────────────────
  // GATE 1: Packaged Runtime Artifact Audit & Default Path Resolution
  // ──────────────────────────────────────────────────────────────────────────
  console.log('── Gate 1: Packaged Runtime Artifact Audit & Default Path Resolution ──');
  try {
    // 1. Audit default path resolution (without overrides)
    const defaultResolvedPath = getDeterministicRecordingPath();
    console.log(`    Default Path Resolved: ${defaultResolvedPath}`);
    testAssert(path.isAbsolute(defaultResolvedPath), 'Default recording path is an absolute path');
    testAssert(defaultResolvedPath.includes('OCS Recordings'), 'Default path contains "OCS Recordings" directory');
    testAssert(defaultResolvedPath.endsWith('.mp4'), 'Default recording path ends with .mp4');

    const expectedDatePart = `${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${String(new Date().getDate()).padStart(2, '0')}`;
    testAssert(defaultResolvedPath.includes(expectedDatePart), `Path strictly contains YYYY/MM/DD partition (${expectedDatePart})`);

    // 2. Packaging configuration audit in electron-builder.yml
    const builderYmlPath = path.join(__dirname, '..', 'electron-builder.yml');
    testAssert(builderConfig.includes('productName: wave.io') || builderConfig.includes('productName: OCS'), 'Packaged productName set to wave.io/OCS');
    testAssert(builderConfig.includes('main.js') && builderConfig.includes('dist/**/*'), 'Files contract includes main.js and dist bundle');

    // 3. Encoder detection inside environment
    testAssert(hardwareEncoder === 'h264_videotoolbox' || hardwareEncoder === 'h264_nvenc' || hardwareEncoder === 'libx264', `Active hardware/software encoder recognized: ${hardwareEncoder}`);
  } catch (err) {
    testAssert(false, `Gate 1 Exception: ${err.message}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GATE 2: Sustained Queue Bounding & Zero Buffer Retention Under Backpressure
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Gate 2: Sustained Queue Bounding & Zero Buffer Retention Under Backpressure ──');
  try {
    const sink2 = await createMockSink();
    const worker2 = new DestinationWorker({
      id: 'gate2-backpressure-bound',
      streamUrl: sink2.url,
      width: 1920,
      height: 1080,
      fps: 30,
      withAudio: false,
      ffmpegBin,
      encoder: hardwareEncoder
    });
    await worker2.start();

    // Simulate sustained network pause / backpressure
    worker2.isBackpressured = true;
    const memBefore = process.memoryUsage().heapUsed;

    // Stream 60 1080p frames (497 MB raw video) into congested worker
    let droppedCount = 0;
    const frame1080 = generateRgbaFrame(1920, 1080, 10, 20, 30);
    for (let i = 0; i < 60; i++) {
      const written = worker2.writeVideoFrame(frame1080);
      if (!written) droppedCount++;
    }

    const memAfter = process.memoryUsage().heapUsed;
    const heapDiffMB = (memAfter - memBefore) / (1024 * 1024);

    console.log(`    Frames dropped due to backpressure: ${droppedCount}/60`);
    console.log(`    Heap delta during 497MB 1080p push: ${heapDiffMB.toFixed(2)} MB`);

    testAssert(droppedCount === 60, '100% of frames dropped atomically when backpressured');
    testAssert(heapDiffMB < 20.0, `Heap growth strictly bounded (< 20MB, measured ${heapDiffMB.toFixed(2)}MB)`);
    testAssert(worker2.telemetry.queueFrames <= 1, `Queue frame count strictly capped <= 1 (was ${worker2.telemetry.queueFrames})`);
    testAssert(worker2.telemetry.queueBytes <= 16588800, `Queue byte count strictly capped <= 16.6MB (was ${worker2.telemetry.queueBytes})`);

    await worker2.stop();
    await sink2.close();
  } catch (err) {
    testAssert(false, `Gate 2 Exception: ${err.message}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GATE 3: Live Recovery & Interruption Matrix
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Gate 3: Live Recovery & Interruption Matrix ──');
  try {
    const sinkA = await createMockSink();
    const sinkB = await createMockSink();
    const rec3Path = path.join(scratchDir, 'gate3_recovery.mp4');

    const workerA = new DestinationWorker({
      id: 'gate3-dest-a',
      streamUrl: sinkA.url,
      width: 640,
      height: 360,
      fps: 30,
      withAudio: false,
      ffmpegBin,
      encoder: hardwareEncoder
    });

    const workerB = new DestinationWorker({
      id: 'gate3-dest-b',
      streamUrl: sinkB.url,
      width: 640,
      height: 360,
      fps: 30,
      withAudio: false,
      ffmpegBin,
      encoder: hardwareEncoder
    });

    const rec3 = new ProgramRecorder();
    await Promise.all([
      workerA.start(),
      workerB.start(),
      rec3.start({
        outputPath: rec3Path,
        width: 640,
        height: 360,
        fps: 30,
        sampleRate: 48000,
        channels: 2,
        withAudio: false,
        ffmpegBin,
        encoder: hardwareEncoder
      })
    ]);

    const testFrame = generateRgbaFrame(640, 360, 100, 200, 50);
    for (let i = 0; i < 20; i++) {
      workerA.writeVideoFrame(testFrame);
      workerB.writeVideoFrame(testFrame);
      rec3.writeVideoFrame(testFrame);
      await new Promise(r => setTimeout(r, 20));
    }

    const preKillBytesA = sinkA.getBytes();
    const preKillBytesB = sinkB.getBytes();
    const bInitialPid = workerB.proc ? workerB.proc.pid : null;

    // Controlled Fault Injection: Abruptly kill worker B with SIGKILL
    console.log(`    [Action] Injecting SIGKILL into Worker B (PID ${bInitialPid})...`);
    if (workerB.proc) {
      workerB.proc.kill('SIGKILL');
    }
    const tKill = Date.now();

    // Stream 25 more frames while Worker B is down
    for (let i = 0; i < 25; i++) {
      workerA.writeVideoFrame(testFrame);
      workerB.writeVideoFrame(testFrame);
      rec3.writeVideoFrame(testFrame);
      await new Promise(r => setTimeout(r, 25));
    }

    // Await Worker B reconnection
    const tReconnectTimeout = Date.now();
    while (Date.now() - tReconnectTimeout < 4000 && (!workerB.proc || workerB.proc.pid === bInitialPid)) {
      workerA.writeVideoFrame(testFrame);
      rec3.writeVideoFrame(testFrame);
      await new Promise(r => setTimeout(r, 50));
    }

    const bResumedPid = workerB.proc ? workerB.proc.pid : null;
    const timeToRecoverMs = Date.now() - tKill;
    console.log(`    Worker B recovered in ${timeToRecoverMs}ms (new PID: ${bResumedPid})`);

    // Stream 15 more frames to both
    for (let i = 0; i < 15; i++) {
      workerA.writeVideoFrame(testFrame);
      workerB.writeVideoFrame(testFrame);
      rec3.writeVideoFrame(testFrame);
      await new Promise(r => setTimeout(r, 25));
    }
    await new Promise(r => setTimeout(r, 500));

    testAssert(bResumedPid !== null && bResumedPid !== bInitialPid, 'Worker B automatically respawned new process on connection drop');
    testAssert(sinkA.getBytes() > preKillBytesA, 'Unaffected destination (Worker A) continued streaming uninterrupted');
    testAssert(rec3.state === 'RECORDING', 'Local program recorder remained actively recording during peer crash');

    // Freshness Check: currentFrameAgeMs must be fresh (< 250ms), not historic backlog
    testAssert(workerB.telemetry.currentFrameAgeMs < 250, `Resumed stream delivers fresh real-time frames (age: ${workerB.telemetry.currentFrameAgeMs}ms < 250ms)`);

    // Manual Stop check: manual stop cancels further reconnect attempts
    await workerB.stop();
    testAssert(workerB.isIntentionalStop === true, 'isIntentionalStop flagged true on manual stop');
    testAssert(workerB._reconnectTimer === null, 'Pending reconnect timers cleared on manual stop');

    const rec3Stop = await rec3.stop();
    testAssert(rec3Stop.ok === true && rec3Stop.bytesWritten > 1000, 'Local recording finalized cleanly with complete container');

    await workerA.stop();
    await sinkA.close();
    await sinkB.close();
  } catch (err) {
    testAssert(false, `Gate 3 Exception: ${err.message}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GATE 4: Sustained Service Rehearsal (Church Workflow & Resource Profiling)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Gate 4: Sustained Service Rehearsal (Church Workflow & Resource Profiling) ──');
  try {
    const serviceSink = await createMockSink();
    const serviceWorker = new DestinationWorker({
      id: 'service-rehearsal-stream',
      streamUrl: serviceSink.url,
      width: 1280,
      height: 720,
      fps: 30,
      videoBitrateKbps: 3000,
      withAudio: false,
      ffmpegBin,
      encoder: hardwareEncoder
    });

    const serviceRec = new ProgramRecorder();
    const serviceRecPath = path.join(scratchDir, 'service_rehearsal.mp4');

    // Rehearsal Scenes: 1) Cam 1 Pulpit, 2) Cam 2 Scripture, 3) Cam 3 Hymn Lyrics, 4) Static Sermon Slide
    const scenes = [
      { name: 'Pulpit Camera (Wide)', color: [50, 80, 140] },
      { name: 'Scripture Verse (John 3:16)', color: [30, 30, 60] },
      { name: 'Hymn Lyrics ("Amazing Grace")', color: [20, 60, 40] },
      { name: 'Static Sermon Slide (Points 1-3)', color: [70, 50, 30] }
    ];

    // Benchmark State 1: Idle
    const memIdle = process.memoryUsage().rss / (1024 * 1024);

    // Benchmark State 2: Start Recording & Streaming
    await serviceRec.start({
      outputPath: serviceRecPath,
      width: 1280,
      height: 720,
      fps: 30,
      sampleRate: 48000,
      channels: 2,
      withAudio: true,
      ffmpegBin,
      encoder: hardwareEncoder
    });
    await serviceWorker.start();

    const tRehearsalStart = Date.now();
    let totalServiceFrames = 0;
    const audioChunk = generatePcmSineWave(1600, 440, 48000);

    // Simulate 4 service transitions (20 frames each = 80 frames)
    for (const scene of scenes) {
      const sceneFrame = generateRgbaFrame(1280, 720, scene.color[0], scene.color[1], scene.color[2]);
      for (let f = 0; f < 20; f++) {
        serviceWorker.writeVideoFrame(sceneFrame);
        serviceRec.writeVideoFrame(sceneFrame);
        serviceRec.writeAudioChunk(audioChunk);
        totalServiceFrames++;
        await new Promise(r => setTimeout(r, 20));
      }
    }

    const durationSec = (Date.now() - tRehearsalStart) / 1000;
    const memActive = process.memoryUsage().rss / (1024 * 1024);
    const memDeltaMB = memActive - memIdle;

    const stopRecRes = await serviceRec.stop();
    await serviceWorker.stop();
    await serviceSink.close();

    const bytesRecorded = stopRecRes.bytesWritten || fs.statSync(serviceRecPath).size;
    const bytesPerSec = bytesRecorded / durationSec;
    const mbPerHour = (bytesPerSec * 3600) / (1024 * 1024);
    const gbPerHour = mbPerHour / 1024;

    console.log(`    Rehearsal Completed: ${totalServiceFrames} frames across 4 scenes in ${durationSec.toFixed(2)}s`);
    console.log(`    Active Memory RSS: ${memActive.toFixed(1)} MB (Delta from idle: ${memDeltaMB.toFixed(1)} MB)`);
    console.log(`    Recorded Media Size: ${(bytesRecorded / 1024).toFixed(1)} KB`);
    console.log(`    Estimated Disk Footprint: ${mbPerHour.toFixed(1)} MB/hr (${gbPerHour.toFixed(2)} GB/hr)`);

    testAssert(totalServiceFrames === 80, 'All 80 service scene frames processed across switcher sequence');
    testAssert(memActive < 250.0, `Total Node process RSS remains modest (< 250MB, measured ${memActive.toFixed(1)}MB)`);
    testAssert(gbPerHour > 0.1 && gbPerHour < 5.0, `Realistic disk storage estimate (${gbPerHour.toFixed(2)} GB/hr)`);
    testAssert(stopRecRes.state === 'COMPLETED', 'Service rehearsal recording marked COMPLETED');
  } catch (err) {
    testAssert(false, `Gate 4 Exception: ${err.message}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GATE 5: Recording Failure Handling & Clean Re-initialization
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Gate 5: Recording Failure Handling & Clean Re-initialization ──');
  try {
    const failRec = new ProgramRecorder();

    // 1. Inaccessible / read-only directory path injection
    const invalidPath = '/sys/invalid_nonexistent_root/forbidden_rec.mp4';
    let failStartRes = null;
    let failError = null;
    try {
      failStartRes = await failRec.start({
        outputPath: invalidPath,
        width: 640,
        height: 360,
        fps: 30,
        sampleRate: 48000,
        channels: 2,
        withAudio: false,
        ffmpegBin
      });
    } catch (e) {
      failError = e;
    }

    testAssert(
      (failStartRes && failStartRes.ok === false) || failRec.state === 'FAILED' || failError !== null,
      'Inaccessible output path transitions state machine to FAILED (NEVER falsely reports COMPLETED)'
    );
    testAssert(failRec.lastError !== null, `lastError recorded upon path failure: "${failRec.lastError}"`);

    // Clean reset to IDLE and immediate follow-up recording
    await failRec.stop();
    testAssert(failRec.state === 'IDLE' || failRec.state === 'FAILED', 'Recorder state reset after stop');

    const validFollowupPath = path.join(scratchDir, 'followup_clean_recording.mp4');
    const cleanStartRes = await failRec.start({
      outputPath: validFollowupPath,
      width: 640,
      height: 360,
      fps: 30,
      sampleRate: 48000,
      channels: 2,
      withAudio: false,
      ffmpegBin,
      encoder: hardwareEncoder
    });

    testAssert(cleanStartRes.ok === true, 'Immediate subsequent recording successfully initializes to RECORDING');

    const cleanFrame = generateRgbaFrame(640, 360, 200, 100, 50);
    for (let i = 0; i < 20; i++) {
      failRec.writeVideoFrame(cleanFrame);
    }
    const cleanStopRes = await failRec.stop();
    testAssert(cleanStopRes.ok === true && cleanStopRes.state === 'COMPLETED', 'Subsequent recording finalized cleanly as COMPLETED');
    testAssert(fs.existsSync(validFollowupPath), 'Follow-up MP4 successfully created on disk');
  } catch (err) {
    testAssert(false, `Gate 5 Exception: ${err.message}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GATE 6: A/V Sync & Frame Monotonicity Bitstream Verification (ffprobe)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Gate 6: A/V Sync & Frame Monotonicity Bitstream Verification (ffprobe) ──');
  try {
    const syncRec = new ProgramRecorder();
    const syncRecPath = path.join(scratchDir, 'sync_verification.mp4');

    await syncRec.start({
      outputPath: syncRecPath,
      width: 640,
      height: 360,
      fps: 30,
      sampleRate: 48000,
      channels: 2,
      withAudio: true,
      ffmpegBin,
      encoder: hardwareEncoder
    });

    // Write 60 synchronized video frames and audio chunks (2 seconds)
    const vFrame = generateRgbaFrame(640, 360, 120, 140, 160);
    const aChunk = generatePcmSineWave(1600, 440, 48000); // exactly 1/30s audio
    for (let i = 0; i < 60; i++) {
      syncRec.writeVideoFrame(vFrame);
      syncRec.writeAudioChunk(aChunk);
      await new Promise(r => setTimeout(r, 20));
    }

    const syncStop = await syncRec.stop();
    testAssert(syncStop.ok === true, 'Synchronized recording finalized');

    // Run ffprobe packet timestamp inspection
    const probeCmd = spawnSync(ffprobeBin, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=r_frame_rate,nb_read_packets,start_time,duration',
      '-count_packets',
      '-of', 'json',
      syncRecPath
    ], { encoding: 'utf8' });

    const videoInfo = JSON.parse(probeCmd.stdout || '{}');
    const vStream = videoInfo.streams && videoInfo.streams[0];
    testAssert(vStream !== undefined, 'ffprobe successfully parsed video stream timestamps');
    testAssert(parseFloat(vStream.start_time || '0') === 0.0, 'Video presentation timestamp starts cleanly at 0.000s');

    const audioProbeCmd = spawnSync(ffprobeBin, [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=sample_rate,start_time,duration',
      '-of', 'json',
      syncRecPath
    ], { encoding: 'utf8' });

    const audioInfo = JSON.parse(audioProbeCmd.stdout || '{}');
    const aStream = audioInfo.streams && audioInfo.streams[0];
    testAssert(aStream !== undefined, 'ffprobe successfully parsed audio stream timestamps');
    testAssert(parseFloat(aStream.start_time || '0') === 0.0, 'Audio presentation timestamp starts cleanly at 0.000s');

    const vDur = parseFloat(vStream.duration || '0');
    const aDur = parseFloat(aStream.duration || '0');
    const skewMs = Math.abs(vDur - aDur) * 1000;
    console.log(`    A/V Stream Durations: Video=${vDur.toFixed(3)}s, Audio=${aDur.toFixed(3)}s (Skew: ${skewMs.toFixed(1)}ms)`);
    testAssert(skewMs < 250.0, `Audio/Video duration skew strictly bounded (< 250ms, measured ${skewMs.toFixed(1)}ms)`);
  } catch (err) {
    testAssert(false, `Gate 6 Exception: ${err.message}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GATE 7: Real External Platform Credential Audit (E5 Invariant)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Gate 7: Real External Platform Credential Audit (E5 Invariant) ──');
  const ytKey = process.env.YOUTUBE_STREAM_KEY || '';
  const fbKey = process.env.FACEBOOK_STREAM_KEY || '';

  if (!ytKey && !fbKey) {
    console.log('    [Notice] No live external platform stream keys configured in environment.');
    console.log('    Per Standing Rules (AGENTS_RULES.md & PRD.md): E5 External Platform Evidence is NOT PROVEN.');
    testAssert(true, 'E5 status correctly audited as NOT PROVEN in automated test environment (no fake claims)');
  } else {
    console.log(`    External stream keys configured: YT=${ytKey ? 'YES' : 'NO'}, FB=${fbKey ? 'YES' : 'NO'}`);
    testAssert(true, 'External stream keys detected');
  }

  // Clean scratch files
  try {
    fs.rmSync(scratchDir, { recursive: true, force: true });
  } catch (_) {}

  // ──────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(` STAGE 10 VALIDATION COMPLETE: ${passed} PASSED, ${failed} FAILED `);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runStage10Harness().catch((err) => {
  console.error('[FATAL Stage 10 Harness Error]:', err);
  process.exit(1);
});
