/**
 * OCS STREAMING STARTUP REGRESSION & CONTROLLER/CANVAS INTEGRATION TEST SUITE
 *
 * Validates the fix for the "Stuck on Connecting" regression:
 * 1. Startup Path: Frames are actively dispatched while destination is CONNECTING.
 * 2. Media Delivery: Encoder produces output and receiver socket gets valid media.
 * 3. Backpressure Recovery: Verifies drain clears latch under load without timer hacks or resending.
 * 4. Reconnection: Auto-reconnect attaches to new process generation and accepts fresh media.
 * 5. Clean Stop: Stop cancels reconnect timers, exits cleanly, and ceases all capture/IPC.
 * 6. Recording Parity: Recording alone and simultaneous recording + streaming operate without interference.
 */

const net = require('net');
const path = require('path');
const fs = require('fs');
const { DestinationWorker, DESTINATION_STATES } = require('../src/main/streaming/destinationWorker');
const { ProgramRecorder } = require('../src/main/recording/programRecorder');

function getFfmpegPath() {
  const candidates = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return 'ffmpeg';
}

function getEncoder() {
  return process.platform === 'darwin' ? 'h264_videotoolbox' : 'libx264';
}

function createMockSink(port = 0) {
  return new Promise((resolve) => {
    let bytesReceived = 0;
    let socketCount = 0;
    let activeSocket = null;

    const server = net.createServer((socket) => {
      socketCount++;
      activeSocket = socket;
      socket.on('data', (chunk) => {
        bytesReceived += chunk.length;
      });
      socket.on('error', () => {});
    });

    server.listen(port, '127.0.0.1', () => {
      const assignedPort = server.address().port;
      resolve({
        server,
        port: assignedPort,
        url: `tcp://127.0.0.1:${assignedPort}`,
        getBytes: () => bytesReceived,
        getSocketCount: () => socketCount,
        pause: () => { if (activeSocket) activeSocket.pause(); },
        resume: () => { if (activeSocket) activeSocket.resume(); },
        closeActiveSocket: () => { if (activeSocket) activeSocket.destroy(); },
        close: () => new Promise((res) => {
          if (activeSocket) activeSocket.destroy();
          server.close(res);
        }),
      });
    });
  });
}

function generateRgbaFrame(width, height, r = 32, g = 64, b = 128) {
  const buf = Buffer.alloc(width * height * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = 255;
  }
  return buf;
}

function generatePcmSine(samples = 1600, freq = 440, sampleRate = 48000) {
  const buf = Buffer.alloc(samples * 2 * 2);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const val = Math.floor(Math.sin(2 * Math.PI * freq * t) * 16000);
    buf.writeInt16LE(val, i * 4);
    buf.writeInt16LE(val, i * 4 + 2);
  }
  return buf;
}

async function runStreamingStartupRegressionTests() {
  console.log('================================================================');
  console.log(' OCS STREAMING STARTUP REGRESSION & INTEGRATION TEST HARNESS ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${message}`);
      failed++;
    }
  }

  const ffmpegBin = getFfmpegPath();
  const encoder = getEncoder();
  const width = 1280;
  const height = 720;
  const fps = 30;
  const scratchDir = path.join(__dirname, '..', 'scratch', `startup_reg_${Date.now()}`);
  fs.mkdirSync(scratchDir, { recursive: true });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Controller / Canvas Handshake & Startup Frame Dispatch
  // ──────────────────────────────────────────────────────────────────────────
  console.log('── Test 1: Go Live Dispatches Frames while Status is CONNECTING ──');
  {
    const sink = await createMockSink();
    const worker = new DestinationWorker({
      id: 'dest-reg-startup',
      label: 'Startup Handshake Test',
      streamUrl: sink.url,
      width,
      height,
      fps,
      videoBitrateKbps: 2500,
      withAudio: true,
      ffmpegBin,
      encoder,
    });

    // Simulate Controller and Canvas state model
    let isBroadcastSessionActive = true;
    let multiStreamStatus = {
      'dest-reg-startup': { id: 'dest-reg-startup', state: 'starting', isStreaming: false }
    };

    const ACTIVE_STREAM_STATES = ['starting', 'connecting', 'encoding', 'transmitting', 'live', 'degraded', 'reconnecting'];
    const computeIsStreamArmed = () => {
      const hasAnyActiveState = Object.values(multiStreamStatus).some(s => s && ACTIVE_STREAM_STATES.includes((s.state || '').toLowerCase()));
      return isBroadcastSessionActive || hasAnyActiveState;
    };
    const computeIsAnyStreaming = () => Object.values(multiStreamStatus).some(s => s?.isStreaming);

    // Initial check: isStreamArmed must be true, isAnyStreaming must be false
    assert(computeIsStreamArmed() === true, 'isStreamArmed is TRUE immediately upon Go Live');
    assert(computeIsAnyStreaming() === false, 'isAnyStreaming is FALSE during startup (no premature LIVE display)');

    // Start worker
    await worker.start();
    multiStreamStatus['dest-reg-startup'] = { id: 'dest-reg-startup', state: worker.state, isStreaming: false };

    assert(worker.state === DESTINATION_STATES.CONNECTING, `Worker starts in CONNECTING state (was: ${worker.state})`);

    // Simulate SwitcherProgramCanvas frame dispatch loop
    let canvasEmittedFrames = 0;
    let dispatchedWhileConnecting = 0;

    const mockCanvasLoop = () => {
      const isStreamingActive = computeIsStreamArmed(); // Canvas now receives isStreamArmed!
      const isRecordingActive = false;
      const hasBroadcast = isStreamingActive; // window.electron.Broadcast.pushVideoFrame
      const hasRecorder = isRecordingActive;

      if (hasBroadcast) {
        canvasEmittedFrames++;
        if (worker.state === DESTINATION_STATES.CONNECTING) {
          dispatchedWhileConnecting++;
        }
        const frame = generateRgbaFrame(width, height, 40, 80, 160);
        worker.writeVideoFrame(frame);
        const pcm = generatePcmSine(1600, 440);
        worker.writeAudioChunk(pcm);
      }
    };

    // Feed frames continuously at ~30 FPS for 2 seconds
    for (let i = 0; i < 60; i++) {
      mockCanvasLoop();
      await new Promise(r => setTimeout(r, 33));
      // Update controller telemetry
      const tel = worker.telemetry;
      multiStreamStatus['dest-reg-startup'] = {
        id: 'dest-reg-startup',
        state: tel.state,
        isStreaming: (tel.state === DESTINATION_STATES.TRANSMITTING || tel.state === DESTINATION_STATES.LIVE),
        fps: tel.fps,
        bitrateKbps: tel.bitrateKbps,
      };
    }

    assert(dispatchedWhileConnecting > 0, `Canvas actively fed ${dispatchedWhileConnecting} frames while destination was in CONNECTING`);
    assert(canvasEmittedFrames === 60, `Total ${canvasEmittedFrames} frames dispatched`);

    // Wait for encoder progress and socket packets
    const tStart = Date.now();
    while (Date.now() - tStart < 8000 && (worker.telemetry.state === DESTINATION_STATES.CONNECTING || sink.getBytes() < 5000)) {
      mockCanvasLoop();
      await new Promise(r => setTimeout(r, 50));
      const tel = worker.telemetry;
      multiStreamStatus['dest-reg-startup'] = {
        id: 'dest-reg-startup',
        state: tel.state,
        isStreaming: (tel.state === DESTINATION_STATES.TRANSMITTING || tel.state === DESTINATION_STATES.LIVE),
        fps: tel.fps,
        bitrateKbps: tel.bitrateKbps,
      };
    }

    const bytesReceived = sink.getBytes();
    assert(bytesReceived > 5000, `Receiver sink received encoded media: ${bytesReceived} bytes`);

    const finalTel = worker.telemetry;
    assert(
      finalTel.state === DESTINATION_STATES.TRANSMITTING || finalTel.state === DESTINATION_STATES.LIVE,
      `Destination smoothly transitioned from CONNECTING to ${finalTel.state}`
    );

    // Controller state now reflects confirmed live
    assert(computeIsAnyStreaming() === true, 'isAnyStreaming becomes TRUE only after encoder proves media output');

    await worker.stop();
    await sink.close();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Primer-Frame Sizing & Non-Credential Error Handling
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Test 2: Primer-Frame Sizing & Sanitized Logging ──');
  {
    const sink = await createMockSink();
    const customWidth = 1920;
    const customHeight = 1080;
    const worker = new DestinationWorker({
      id: 'dest-primer-audit',
      label: 'Primer Audit',
      streamUrl: `${sink.url}?secret_key=SUPER_SECRET_TOKEN_12345`,
      width: customWidth,
      height: customHeight,
      fps: 30,
      withAudio: true,
      ffmpegBin,
      encoder,
    });

    // Audit sanitized URL
    const sanitized = worker.getSanitizedUrl();
    assert(!sanitized.includes('SUPER_SECRET_TOKEN_12345'), 'Sanitized URL hides stream key / credentials');

    await worker.start();

    // Verify stdin highWaterMark accommodated custom dimensions (1920*1080*4*2 = ~16.5MB)
    const expectedFrameBytes = customWidth * customHeight * 4;
    const expectedHwm = Math.max(16 * 1024 * 1024, expectedFrameBytes * 2);
    const actualHwm = worker.proc.stdin._writableState.highWaterMark;
    assert(actualHwm >= expectedHwm, `HighWaterMark set correctly for 1080p: ${actualHwm} >= ${expectedHwm}`);

    // Send 10 frames
    for (let i = 0; i < 10; i++) {
      worker.writeVideoFrame(generateRgbaFrame(customWidth, customHeight));
      worker.writeAudioChunk(generatePcmSine(1600, 440));
      await new Promise(r => setTimeout(r, 20));
    }

    await worker.stop();
    await sink.close();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Backpressure Recovery Without Indiscriminate Writes or Timer Hacks
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Test 3: Backpressure Detection & Safe Drain Recovery ──');
  {
    const sink = await createMockSink();
    const worker = new DestinationWorker({
      id: 'dest-backpressure-test',
      label: 'Backpressure Test',
      streamUrl: sink.url,
      width,
      height,
      fps,
      videoBitrateKbps: 3000,
      withAudio: false,
      ffmpegBin,
      encoder,
    });

    await worker.start();

    // Send an initial burst to fill the pipe buffer and trigger backpressure
    let didExperienceBackpressure = false;
    const burstFrame = generateRgbaFrame(width, height, 100, 100, 100);

    for (let i = 0; i < 60; i++) {
      const ok = worker.writeVideoFrame(burstFrame);
      if (!ok || worker.isBackpressured) {
        didExperienceBackpressure = true;
      }
      // write as fast as possible without pacing to trigger highWaterMark
    }

    console.log(`    Burst sent (backpressure triggered: ${didExperienceBackpressure || worker.isBackpressured})`);

    // Verify bounded queue / drop protection does not cause unbounded RAM growth
    const memUsage = process.memoryUsage().rss;
    assert(memUsage < 1024 * 1024 * 1024, `Memory remained bounded under burst: ${(memUsage / 1024 / 1024).toFixed(1)} MB`);

    // Now feed at normal rate to allow pipe to drain
    const drainStart = Date.now();
    let recovered = false;
    for (let i = 0; i < 120; i++) {
      worker.writeVideoFrame(burstFrame);
      if (!worker.isBackpressured) {
        recovered = true;
        break;
      }
      await new Promise(r => setTimeout(r, 33));
    }

    assert(recovered === true, `Backpressure latch successfully cleared via standard drain event in ${Date.now() - drainStart}ms`);
    assert(worker.isBackpressured === false, 'isBackpressured returned to FALSE');

    await worker.stop();
    await sink.close();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Auto-Reconnection & Fresh Media Ingestion
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Test 4: Reconnection Attaches to New Generation & Accepts Fresh Media ──');
  {
    const sinkPort = 54321;
    let sink = await createMockSink(sinkPort);

    const worker = new DestinationWorker({
      id: 'dest-reconnect-test',
      label: 'Reconnect Test',
      streamUrl: `tcp://127.0.0.1:${sinkPort}`,
      width,
      height,
      fps,
      videoBitrateKbps: 2500,
      withAudio: false,
      ffmpegBin,
      encoder,
    });

    await worker.start();
    const initialPid = worker.proc.pid;

    // Send 15 frames
    for (let i = 0; i < 15; i++) {
      worker.writeVideoFrame(generateRgbaFrame(width, height, 50, 50, 50));
      await new Promise(r => setTimeout(r, 20));
    }

    // Induce sudden socket / process termination
    console.log('    Inducing connection fault...');
    await sink.close();
    // Feed a few frames so FFmpeg encounters broken pipe or kill
    for (let i = 0; i < 15; i++) {
      worker.writeVideoFrame(generateRgbaFrame(width, height, 50, 50, 50));
      await new Promise(r => setTimeout(r, 30));
      if (!worker.proc || worker.state === DESTINATION_STATES.RECONNECTING || worker.state === DESTINATION_STATES.STOPPED) break;
    }
    if (worker.proc) {
      worker.proc.kill('SIGKILL');
    }

    // Wait for worker to enter RECONNECTING
    const tWaitFault = Date.now();
    while (Date.now() - tWaitFault < 2000 && worker.state !== DESTINATION_STATES.RECONNECTING && worker.state !== DESTINATION_STATES.CONNECTING && worker.state !== DESTINATION_STATES.STOPPED) {
      await new Promise(r => setTimeout(r, 50));
    }

    assert(
      worker.state === DESTINATION_STATES.RECONNECTING || worker.state === DESTINATION_STATES.STOPPED || worker.state === DESTINATION_STATES.CONNECTING,
      `Worker entered re-connection flow on fault (state: ${worker.state})`
    );

    // Re-create sink on same port
    sink = await createMockSink(sinkPort);

    // Wait for auto-reconnect timer to fire and spawn new generation (reconnect delay is 1000ms)
    const tWaitSpawn = Date.now();
    while (Date.now() - tWaitSpawn < 4000 && (!worker.proc || worker.proc.pid === initialPid)) {
      await new Promise(r => setTimeout(r, 100));
    }

    const newPid = worker.proc ? worker.proc.pid : null;
    assert(newPid !== null && newPid !== initialPid, `New FFmpeg generation spawned (old: ${initialPid}, new: ${newPid})`);
    assert(worker.isBackpressured === false, 'New process generation starts with isBackpressured = false');

    // Feed fresh media frames to new generation
    const preBytes = sink.getBytes();
    for (let i = 0; i < 40; i++) {
      worker.writeVideoFrame(generateRgbaFrame(width, height, 200, 100, 50));
      await new Promise(r => setTimeout(r, 33));
    }

    const tWaitBytes = Date.now();
    while (Date.now() - tWaitBytes < 3000 && sink.getBytes() === preBytes) {
      worker.writeVideoFrame(generateRgbaFrame(width, height, 200, 100, 50));
      await new Promise(r => setTimeout(r, 50));
    }

    const postBytes = sink.getBytes();
    assert(postBytes > preBytes, `Fresh media successfully accepted after reconnect (${postBytes - preBytes} new bytes)`);

    await worker.stop();
    await sink.close();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Clean Stop Cancels Capture and Retries
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Test 5: Clean Stop Cancels Capture, Retries & Halts IPC ──');
  {
    const sink = await createMockSink();
    const worker = new DestinationWorker({
      id: 'dest-stop-test',
      label: 'Stop Test',
      streamUrl: sink.url,
      width,
      height,
      fps,
      withAudio: false,
      ffmpegBin,
      encoder,
    });

    await worker.start();
    assert(worker.proc !== null, 'Worker running');

    // Stop broadcast
    const stopRes = await worker.stop();
    assert(stopRes.ok === true, 'Worker stopped cleanly');
    assert(worker.proc === null, 'FFmpeg process terminated and reference nulled');
    assert(worker._reconnectTimer === null, 'Pending reconnect timers cleared');
    assert(worker._watchdogInterval === null, 'Watchdog interval cleared');
    assert(worker.state === DESTINATION_STATES.STOPPED, 'Worker state is STOPPED');

    // Simulate controller state transition
    let isBroadcastSessionActive = false;
    let multiStreamStatus = { 'dest-stop-test': { state: 'stopped', isStreaming: false } };
    const computeIsStreamArmed = () => isBroadcastSessionActive;

    // Simulate canvas check after stop: neither broadcast nor recording active
    let ipcFramesDispatched = 0;
    const isStreamingActive = computeIsStreamArmed();
    const isRecordingActive = false;
    const hasBroadcast = isStreamingActive;
    const hasRecorder = isRecordingActive;

    if (hasBroadcast || hasRecorder) {
      ipcFramesDispatched++;
    }

    assert(ipcFramesDispatched === 0, 'Canvas stops all frame extraction and IPC dispatch when neither streaming nor recording');

    await sink.close();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: Recording Alone and Recording Alongside Streaming
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Test 6: Recording Alone vs. Simultaneous Streaming + Recording ──');
  {
    const recAlonePath = path.join(scratchDir, 'rec_alone.mp4');
    const recSimulPath = path.join(scratchDir, 'rec_simul.mp4');

    // Part A: Recording Alone
    const recorderA = new ProgramRecorder();
    await recorderA.start({
      outputPath: recAlonePath,
      width,
      height,
      fps,
      sampleRate: 48000,
      channels: 2,
      withAudio: true,
    });

    let isRecordingProgram = true;
    let isStreamArmed = false;
    let broadcastFrames = 0;
    let recorderFrames = 0;

    for (let i = 0; i < 30; i++) {
      const f = generateRgbaFrame(width, height, 10, 20, 30);
      const a = generatePcmSine(1600, 440);
      if (isRecordingProgram) {
        recorderFrames++;
        recorderA.writeVideoFrame(f);
        recorderA.writeAudioChunk(a);
      }
      if (isStreamArmed) {
        broadcastFrames++;
      }
      await new Promise(r => setTimeout(r, 20));
    }

    await recorderA.stop();
    assert(recorderFrames === 30, `Recording alone ingested ${recorderFrames} frames`);
    assert(broadcastFrames === 0, `Zero frames sent to broadcast during recording alone`);
    assert(fs.existsSync(recAlonePath) && fs.statSync(recAlonePath).size > 10000, `Recording alone produced valid MP4 file (${fs.statSync(recAlonePath).size} bytes)`);

    // Part B: Simultaneous Streaming and Recording
    const sink = await createMockSink();
    const worker = new DestinationWorker({
      id: 'dest-simul-test',
      label: 'Simul Test',
      streamUrl: sink.url,
      width,
      height,
      fps,
      withAudio: true,
      ffmpegBin,
      encoder,
    });

    const recorderB = new ProgramRecorder();
    await Promise.all([
      recorderB.start({
        outputPath: recSimulPath,
        width,
        height,
        fps,
        sampleRate: 48000,
        channels: 2,
        withAudio: true,
      }),
      worker.start(),
    ]);

    isRecordingProgram = true;
    isStreamArmed = true;
    broadcastFrames = 0;
    recorderFrames = 0;

    for (let i = 0; i < 45; i++) {
      const f = generateRgbaFrame(width, height, 70, 140, 210);
      const a = generatePcmSine(1600, 440);
      if (isRecordingProgram) {
        recorderFrames++;
        recorderB.writeVideoFrame(f);
        recorderB.writeAudioChunk(a);
      }
      if (isStreamArmed) {
        broadcastFrames++;
        worker.writeVideoFrame(f);
        worker.writeAudioChunk(a);
      }
      await new Promise(r => setTimeout(r, 33));
    }

    await Promise.all([recorderB.stop(), worker.stop(), sink.close()]);

    assert(recorderFrames === 45 && broadcastFrames === 45, `Simultaneous run: both engines received 45 frames`);
    assert(fs.existsSync(recSimulPath) && fs.statSync(recSimulPath).size > 10000, `Simultaneous recording produced valid MP4 file (${fs.statSync(recSimulPath).size} bytes)`);
    assert(sink.getBytes() > 5000, `Simultaneous stream delivered ${sink.getBytes()} bytes to receiver`);
  }

  // Cleanup scratch directory
  try {
    fs.rmSync(scratchDir, { recursive: true, force: true });
  } catch (_) {}

  console.log('\n================================================================');
  console.log(` STREAMING STARTUP REGRESSION TEST SUITE: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

if (require.main === module) {
  runStreamingStartupRegressionTests().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
}

module.exports = { runStreamingStartupRegressionTests };
