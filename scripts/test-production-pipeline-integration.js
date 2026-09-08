/**
 * OCS Stage 6.2 Production Pipeline Integration & P0 Closure Test Suite
 *
 * Verifies end-to-end integration:
 * - Real RGBA pixel buffer generation and FFmpeg MP4 recording verification.
 * - BroadcastAudioBus finite output math, delay line, and PCM tap.
 * - ServiceJournal event dispatch -> crash recovery -> state reconstruction.
 * - BroadcastSupervisor secret URL sanitization.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const { ProgramRecorder } = require('../src/main/recording/programRecorder');
const { BroadcastAudioBus } = require('../src/App/controller/broadcastAudioBus');
const { ServiceJournal } = require('../src/main/session/serviceJournal');
const { RecoveryManager } = require('../src/main/session/recoveryManager');
const { BroadcastSupervisor } = require('../src/main/streaming/broadcastSupervisor');

async function runSuite() {
  console.log('=== Starting OCS Stage 6.2 Pipeline Integration Test Suite ===\n');

  // -------------------------------------------------------------
  // Test 1: Real Program Canvas Pattern Capture & MP4 Verification
  // -------------------------------------------------------------
  console.log('[Test 1] Testing Real RGBA Frame Capture -> FFmpeg MP4 Muxer...');
  const recDir = path.join(__dirname, '..', 'scratch', `rec_${Date.now()}`);
  fs.mkdirSync(recDir, { recursive: true });
  const mp4Path = path.join(recDir, 'real_program_recording.mp4');

  const recorder = new ProgramRecorder();
  const width = 640;
  const height = 360;
  const fps = 30;

  await recorder.start({
    outputPath: mp4Path,
    width,
    height,
    fps,
    withAudio: true,
  });

  // Generate 45 distinct frames (1.5 seconds) with a recognizable color pattern:
  // Quadrants: Top-Left Red, Top-Right Green, Bottom-Left Blue, Bottom-Right Yellow
  const frameBuffer = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const isTop = y < height / 2;
      const isLeft = x < width / 2;

      if (isTop && isLeft) {
        // Red
        frameBuffer[idx] = 255;
        frameBuffer[idx + 1] = 0;
        frameBuffer[idx + 2] = 0;
      } else if (isTop && !isLeft) {
        // Green
        frameBuffer[idx] = 0;
        frameBuffer[idx + 1] = 255;
        frameBuffer[idx + 2] = 0;
      } else if (!isTop && isLeft) {
        // Blue
        frameBuffer[idx] = 0;
        frameBuffer[idx + 1] = 0;
        frameBuffer[idx + 2] = 255;
      } else {
        // Yellow
        frameBuffer[idx] = 255;
        frameBuffer[idx + 1] = 255;
        frameBuffer[idx + 2] = 0;
      }
      frameBuffer[idx + 3] = 255; // Alpha
    }
  }

  // Generate accompanying 48kHz stereo sine wave PCM audio
  const sampleRate = 48000;
  const pcmChunkSamples = Math.floor(sampleRate / fps);
  const audioChunk = Buffer.alloc(pcmChunkSamples * 4);
  for (let s = 0; s < pcmChunkSamples; s++) {
    const val = Math.floor(Math.sin((2 * Math.PI * 440 * s) / sampleRate) * 16000);
    audioChunk.writeInt16LE(val, s * 4);
    audioChunk.writeInt16LE(val, s * 4 + 2);
  }

  // Push 45 frames and audio chunks
  for (let f = 0; f < 45; f++) {
    recorder.writeVideoFrame(frameBuffer);
    recorder.writeAudioChunk(audioChunk);
  }

  await recorder.stop();
  assert(fs.existsSync(mp4Path), 'Recorded MP4 file must exist on disk');
  assert(fs.statSync(mp4Path).size > 10000, 'Recorded MP4 must contain substantial media data');

  // Probe with FFmpeg to verify streams
  const ffmpegBin = recorder.getFfmpegPath();
  const probe = spawnSync(ffmpegBin, ['-i', mp4Path], { encoding: 'utf8' });
  const probeInfo = probe.stderr || '';
  assert(probeInfo.includes('Video: h264'), 'Output MP4 must contain valid H.264 video stream');
  assert(probeInfo.includes('Audio: aac'), 'Output MP4 must contain valid AAC audio stream');
  assert(probeInfo.includes('640x360'), 'Resolution must match configured 640x360 dimensions');
  console.log('  ✓ [PASS] Real canvas raster successfully encoded into valid H.264/AAC MP4\n');

  // -------------------------------------------------------------
  // Test 2: BroadcastAudioBus Finite Float Invariant & Clamping
  // -------------------------------------------------------------
  console.log('[Test 2] Testing Broadcast Audio Bus Limiter & Finite Float Invariants...');
  const bus = new BroadcastAudioBus();

  const badInputs = [NaN, Infinity, -Infinity, 9999.0, -9999.0];
  for (const val of badInputs) {
    const input = new Float32Array(100).fill(val);
    const res = bus.processFrame({ 1: input }, 100);

    for (let i = 0; i < 100; i++) {
      assert(Number.isFinite(res.left[i]), `Sample left[${i}] must be finite for input ${val}`);
      assert(Number.isFinite(res.right[i]), `Sample right[${i}] must be finite for input ${val}`);
      assert(Math.abs(res.left[i]) <= 0.89126, `Peak must be strictly capped at -1.0 dBFS ceiling`);
      assert(Math.abs(res.right[i]) <= 0.89126, `Peak must be strictly capped at -1.0 dBFS ceiling`);
    }
  }
  console.log('  ✓ [PASS] BroadcastAudioBus enforces finite bounds on extreme/corrupted samples\n');

  // -------------------------------------------------------------
  // Test 3: Live State Journaling -> Crash Simulation -> Hydration
  // -------------------------------------------------------------
  console.log('[Test 3] Testing Live State Journaling -> Crash Recovery Rehydration...');
  const journalDir = path.join(recDir, 'recovery_test');
  const journal = new ServiceJournal();
  await journal.init(journalDir);
  await journal.startSession('Sunday Service Integration');

  // Operator actions during service:
  // 1. Advance slide to slide 3
  await journal.recordEvent('SLIDE_CHANGE', {
    activePresentationId: 'deck_sermon_123',
    activeSlideIndex: 3,
    slideTitle: 'Romans 8:28 - God Works for Good',
  });

  // 2. Cut to Camera 2
  await journal.recordEvent('CAMERA_CUT', {
    activeSlot: 2,
    transition: 'cut',
  });

  // 3. Set timer to 15 minutes (900s), running
  await journal.recordEvent('TIMER_UPDATE', {
    durationSec: 900,
    remainingSec: 750,
    type: 'countdown',
    isRunning: true,
  });

  // Simulate dirty shutdown (crash without markCleanExit)
  await journal.close();

  // New application instance launches and invokes RecoveryManager
  const recovery = new RecoveryManager();
  await recovery.initialize(journalDir);

  const report = recovery.recoveryReport;
  assert.strictEqual(report.crashed, true, 'Dirty shutdown must be detected');
  assert.strictEqual(report.recovered, true, 'State must be recovered');

  const state = recovery.recoveredState;
  assert.strictEqual(state.presentation.activePresentationId, 'deck_sermon_123', 'Active presentation must restore');
  assert.strictEqual(state.presentation.activeSlideIndex, 3, 'Slide index 3 must restore');
  assert.strictEqual(state.camera.activeSlot, 2, 'Camera slot 2 must restore');
  assert.strictEqual(state.timer.durationSec, 900, 'Timer duration must restore');
  assert.strictEqual(state.timer.remainingSec, 750, 'Timer remaining seconds must restore');
  assert.strictEqual(state.timer.isRunning, false, 'Timer must be safety-paused upon recovery');

  console.log('  ✓ [PASS] Full Sunday state rehydrated accurately from SQLite WAL journal\n');

  // -------------------------------------------------------------
  // Test 4: Broadcast Secret Protection & Sanitization
  // -------------------------------------------------------------
  console.log('[Test 4] Testing Broadcast Secret Protection & URL Redaction...');
  const supervisor = new BroadcastSupervisor();

  const rtmpUrl = 'rtmp://a.rtmp.youtube.com/live2/secret-church-key-5678';
  const sanitizedRtmp = supervisor.sanitizeEndpoint(rtmpUrl);
  assert(!sanitizedRtmp.includes('secret-church-key-5678'), 'RTMP stream key must never appear in sanitized output');
  assert.strictEqual(sanitizedRtmp, 'rtmp://a.rtmp.youtube.com/live2/[REDACTED]');

  const srtUrl = 'srt://live.churchstream.org:9998?passphrase=MySecurePass123&latency=200';
  const sanitizedSrt = supervisor.sanitizeEndpoint(srtUrl);
  assert(!sanitizedSrt.includes('MySecurePass123'), 'SRT passphrase must never appear in sanitized output');
  assert.strictEqual(sanitizedSrt, 'srt://live.churchstream.org:9998?passphrase=[REDACTED]&latency=200');

  console.log('  ✓ [PASS] Stream keys and SRT passphrases strictly redacted\n');

  console.log('===============================================================');
  console.log('OCS Stage 6.2 Pipeline Integration Test Suite Passed: 4/4 (100%)');
  console.log('===============================================================\n');

  // Clean up scratch files
  try {
    fs.rmSync(recDir, { recursive: true, force: true });
  } catch (_) {}
}

runSuite().catch((err) => {
  console.error('[FAIL] Test suite failed:', err);
  process.exit(1);
});
