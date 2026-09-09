/**
 * OCS Stage 8 — Broadcast Simulstream Engine Automated Tests
 *
 * Tests the multi-destination RTMP simulstreaming engine in broadcastSupervisor.js.
 * Uses local validation only (no real RTMP connection) to verify the engine API.
 */

'use strict';

const { BroadcastSupervisor } = require('../src/main/streaming/broadcastSupervisor');
const { execSync } = require('child_process');

let passed = 0;
let failed = 0;
const errors = [];

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
    errors.push(label);
  }
}

async function test_instantiation() {
  console.log('\n[1] Supervisor instantiation');
  const bs = new BroadcastSupervisor();
  assert(bs instanceof BroadcastSupervisor, 'creates BroadcastSupervisor instance');
  assert(typeof bs.start === 'function', 'has start() method (backward compat)');
  assert(typeof bs.stop === 'function', 'has stop() method (backward compat)');
  assert(typeof bs.getStatus === 'function', 'has getStatus() method (backward compat)');
  assert(typeof bs.startMulti === 'function', 'has startMulti() method');
  assert(typeof bs.stopAll === 'function', 'has stopAll() method');
  assert(typeof bs.writeVideoFrameAll === 'function', 'has writeVideoFrameAll() method');
  assert(typeof bs.writeAudioChunkAll === 'function', 'has writeAudioChunkAll() method');
  assert(typeof bs.getMultiStatus === 'function', 'has getMultiStatus() method');
  assert(typeof bs.isAnyStreaming === 'function', 'has isAnyStreaming() method');
}

async function test_startMulti_validation() {
  console.log('\n[2] startMulti() input validation');
  const bs = new BroadcastSupervisor();
  const r1 = await bs.startMulti(null);
  assert(r1.ok === false, 'returns ok=false for null destinations');
  const r2 = await bs.startMulti([]);
  assert(r2.ok === false, 'returns ok=false for empty destinations array');
  const r3 = await bs.startMulti([{ id: null, streamUrl: null }]);
  assert(Array.isArray(r3.results), 'returns results array for invalid destination');
  assert(r3.results[0].ok === false, 'marks invalid destination as ok=false');
}

async function test_getMultiStatus_empty() {
  console.log('\n[3] getMultiStatus() before streaming');
  const bs = new BroadcastSupervisor();
  const status = bs.getMultiStatus();
  assert(typeof status === 'object', 'getMultiStatus() returns an object');
  assert(Object.keys(status).length === 0, 'empty when no streams started');
  assert(bs.isAnyStreaming() === false, 'isAnyStreaming() is false before start');
}

async function test_writeVideoFrameAll_empty_fallback() {
  console.log('\n[4] writeVideoFrameAll() empty fallback');
  const bs = new BroadcastSupervisor();
  const buf = Buffer.alloc(1280 * 720 * 4);
  let threw = false;
  try {
    const n = bs.writeVideoFrameAll(buf);
    assert(n === 0 || n === 1, `writeVideoFrameAll returns 0 or 1 when no processes active (got ${n})`);
  } catch (e) {
    threw = true;
  }
  assert(!threw, 'writeVideoFrameAll does not throw when no processes running');
}

async function test_writeAudioChunkAll_empty_fallback() {
  console.log('\n[5] writeAudioChunkAll() empty fallback');
  const bs = new BroadcastSupervisor();
  const buf = Buffer.alloc(4096);
  let threw = false;
  try {
    const n = bs.writeAudioChunkAll(buf);
    assert(n === 0 || n === 1, `writeAudioChunkAll returns 0 or 1 when no processes active (got ${n})`);
  } catch (e) {
    threw = true;
  }
  assert(!threw, 'writeAudioChunkAll does not throw when no processes running');
}

async function test_stopAll_noop() {
  console.log('\n[6] stopAll() with no active streams');
  const bs = new BroadcastSupervisor();
  const result = await bs.stopAll();
  assert(result.ok === true, 'stopAll() returns ok=true when nothing is running');
  assert(result.stopped === 0, 'stopAll() reports 0 stopped destinations');
}

async function test_sanitize_endpoint() {
  console.log('\n[7] sanitizeEndpoint() security redaction');
  const bs = new BroadcastSupervisor();
  const yt = bs.sanitizeEndpoint('rtmp://a.rtmp.youtube.com/live2/abcd-1234-efgh-5678');
  assert(yt.includes('[REDACTED]'), 'YouTube stream key is redacted');
  assert(!yt.includes('abcd-1234'), 'Raw YouTube stream key not present in sanitized URL');
  const fb = bs.sanitizeEndpoint('rtmps://live-api-s.facebook.com:443/rtmp/4123456789:abcdef');
  assert(fb.includes('[REDACTED]'), 'Facebook stream key is redacted');
  const srt = bs.sanitizeEndpoint('srt://ingest.twitch.tv:2935?passphrase=supersecret&streamid=live_key');
  assert(!srt.includes('supersecret'), 'SRT passphrase not present in sanitized URL');
}

async function test_getStatus_backward_compat() {
  console.log('\n[8] getStatus() backward compatibility');
  const bs = new BroadcastSupervisor();
  const status = bs.getStatus();
  assert(typeof status === 'object', 'getStatus() returns an object');
  assert(status.isStreaming === false, 'isStreaming is false before start');
  assert(status.streamUrl === null, 'streamUrl is null before start');
  assert(typeof status.stats === 'object', 'stats object is present');
}

async function test_hardware_encoder_detection() {
  console.log('\n[9] detectHardwareEncoder()');
  const bs = new BroadcastSupervisor();
  const encoder = bs.detectHardwareEncoder();
  const valid = ['h264_videotoolbox', 'h264_nvenc', 'h264_qsv', 'libx264'];
  assert(typeof encoder === 'string', 'encoder is a string');
  assert(valid.includes(encoder), `encoder "${encoder}" is a known H.264 encoder`);
}

async function test_ffmpeg_path() {
  console.log('\n[10] getFfmpegPath()');
  const bs = new BroadcastSupervisor();
  const path = bs.getFfmpegPath();
  assert(typeof path === 'string' && path.length > 0, 'FFmpeg path is a non-empty string');
  let ffmpegWorks = false;
  try {
    const result = execSync(`"${path}" -version 2>&1`, { timeout: 5000, encoding: 'utf8' });
    ffmpegWorks = result.includes('ffmpeg version');
  } catch (_) {}
  assert(ffmpegWorks, `FFmpeg binary at "${path}" is executable`);
}

async function test_parseDestStats() {
  console.log('\n[11] _parseDestStats() metric parsing');
  const bs = new BroadcastSupervisor();
  if (!bs._multiStats) bs._multiStats = new Map();
  bs._multiStats.set('test', {
    fps: 0, bitrateKbps: 0, framesSent: 0, droppedFrames: 0,
    speedFactor: 1.0, health: 'connecting', isStreaming: true, startTime: Date.now(), uptimeSec: 0
  });
  const sample = 'frame= 120 fps= 30 q=28.0 size=    1240kB time=00:00:04.00 bitrate=2539.5kbits/s speed=1.00x drop=0';
  bs._parseDestStats('test', sample);
  const stat = bs._multiStats.get('test');
  assert(stat.fps === 30, `fps parsed correctly (got ${stat.fps})`);
  assert(Math.abs(stat.bitrateKbps - 2539.5) < 1, `bitrate parsed correctly (got ${stat.bitrateKbps})`);
  assert(stat.framesSent === 120, `framesSent parsed correctly (got ${stat.framesSent})`);
  assert(stat.droppedFrames === 0, `droppedFrames parsed correctly (got ${stat.droppedFrames})`);
  assert(stat.health === 'good', `health is "good" at 1.0x speed (got "${stat.health}")`);
  const degraded = 'frame= 200 fps= 28 q=30.0 size=    1800kB time=00:00:06.66 bitrate=2214kbits/s speed=0.90x drop=3';
  bs._parseDestStats('test', degraded);
  const stat2 = bs._multiStats.get('test');
  assert(stat2.health === 'fair', `health is "fair" at 0.90x speed (got "${stat2.health}")`);
  assert(stat2.droppedFrames === 3, `dropped frames updated correctly (got ${stat2.droppedFrames})`);
}

async function run() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('OCS Stage 8 — Broadcast Simulstream Engine Tests');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await test_instantiation();
  await test_startMulti_validation();
  await test_getMultiStatus_empty();
  await test_writeVideoFrameAll_empty_fallback();
  await test_writeAudioChunkAll_empty_fallback();
  await test_stopAll_noop();
  await test_sanitize_endpoint();
  await test_getStatus_backward_compat();
  await test_hardware_encoder_detection();
  await test_ffmpeg_path();
  await test_parseDestStats();
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (errors.length > 0) {
    console.error('Failed tests:');
    errors.forEach(e => console.error(`  - ${e}`));
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('[FATAL] Test runner crashed:', err);
  process.exit(1);
});
