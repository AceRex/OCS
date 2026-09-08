/**
 * OCS Integration Test — P0-02 Broadcast Audio Bus & Brickwall Limiter
 *
 * Verifies:
 * 1. 4-channel audio summing and channel gain scaling.
 * 2. Mute and solo mutual exclusivity logic.
 * 3. Lip-Sync circular delay buffer (sample-accurate delay).
 * 4. Brickwall master limiter strictly capping peaks at -1.0 dBFS (~0.891 linear).
 * 5. PCM-16 / Float-32 conversion roundtrip fidelity.
 */

const assert = require('assert');
const { BroadcastAudioBus } = require('../src/App/controller/broadcastAudioBus');

function runAudioBusTestSuite() {
  console.log('=== Starting P0-02 Broadcast Audio Bus Test Suite ===\n');
  let passed = 0;

  const bus = new BroadcastAudioBus({ sampleRate: 48000 });

  // -------------------------------------------------------------
  // Test 1: Channel Summing & Gain Scaling
  // -------------------------------------------------------------
  console.log('[Test 1] Channel Summing & Gain Scaling');
  const numSamples = 1000;
  const ch1Samples = new Float32Array(numSamples).fill(0.3); // 0.3 linear
  const ch2Samples = new Float32Array(numSamples).fill(0.2); // 0.2 linear

  const out1 = bus.processFrame({ 1: ch1Samples, 2: ch2Samples }, numSamples);
  // Sum = 0.3 + 0.2 = 0.5
  assert.ok(Math.abs(out1.left[0] - 0.5) < 0.001, `Expected sum 0.5, got ${out1.left[0]}`);
  console.log('  ✓ [PASS] Channels 1 & 2 accurately summed (0.3 + 0.2 = 0.5)');
  passed++;

  // -------------------------------------------------------------
  // Test 2: Mute & Solo Behavior
  // -------------------------------------------------------------
  console.log('\n[Test 2] Channel Muting & Solo Priority');
  bus.setChannelMute(1, true);
  const outMute = bus.processFrame({ 1: ch1Samples, 2: ch2Samples }, numSamples);
  assert.ok(Math.abs(outMute.left[0] - 0.2) < 0.001, `Expected muted ch1, got ${outMute.left[0]}`);
  console.log('  ✓ [PASS] Channel 1 muted; only Channel 2 present');

  bus.setChannelMute(1, false);
  bus.setChannelSolo(1, true); // Solo ch1, ch2 should be silenced
  const outSolo = bus.processFrame({ 1: ch1Samples, 2: ch2Samples }, numSamples);
  assert.ok(Math.abs(outSolo.left[0] - 0.3) < 0.001, `Expected solo ch1, got ${outSolo.left[0]}`);
  console.log('  ✓ [PASS] Channel 1 solo active; Channel 2 automatically suppressed');

  bus.setChannelSolo(1, false); // Clear solo
  passed++;

  // -------------------------------------------------------------
  // Test 3: Lip-Sync Delay Ring Buffer
  // -------------------------------------------------------------
  console.log('\n[Test 3] Lip-Sync Delay Line Verification');
  const delayMs = 50; // 50ms = 0.05 * 48000 = 2400 samples
  bus.setDelayMs(delayMs);

  const delaySamples = 2400;
  const impulseBuf = new Float32Array(delaySamples * 2);
  impulseBuf[0] = 0.8; // Impulse at sample 0

  const outDelayed = bus.processFrame({ 1: impulseBuf }, delaySamples * 2);

  // At index 0, the output must be 0 because of delay
  assert.strictEqual(outDelayed.left[0], 0, 'Sample 0 must be 0 due to 50ms delay');

  // At index 2400 (50ms later), the impulse must appear
  assert.ok(Math.abs(outDelayed.left[delaySamples] - 0.8) < 0.001, `Expected impulse at sample ${delaySamples}, got ${outDelayed.left[delaySamples]}`);
  console.log('  ✓ [PASS] 50ms delay line accurately placed sample at index 2400');
  bus.setDelayMs(0); // Reset delay
  passed++;

  // -------------------------------------------------------------
  // Test 4: Brickwall Master Limiter (-1.0 dBFS Peak Ceiling)
  // -------------------------------------------------------------
  console.log('\n[Test 4] Brickwall Master Limiter Verification');
  // Input hot signals: ch1 = 0.9, ch2 = 0.9. Sum = 1.8 (+5.1 dBFS, normally massive digital clip)
  const hotCh1 = new Float32Array(500).fill(0.9);
  const hotCh2 = new Float32Array(500).fill(0.9);

  const outHot = bus.processFrame({ 1: hotCh1, 2: hotCh2 }, 500);

  const ceiling = Math.pow(10, -1.0 / 20); // ~0.89125 linear
  let maxOutputPeak = 0;
  for (let i = 0; i < 500; i++) {
    maxOutputPeak = Math.max(maxOutputPeak, Math.abs(outHot.left[i]));
  }

  console.log(`  Raw unclipped sum: 1.8000 (+5.1 dBFS)`);
  console.log(`  Limited output peak: ${maxOutputPeak.toFixed(5)} (${(20 * Math.log10(maxOutputPeak)).toFixed(2)} dBFS)`);
  console.log(`  Limiter ceiling target: ${ceiling.toFixed(5)} (-1.00 dBFS)`);

  assert.ok(outHot.limiterActive, 'Limiter must report active when peak exceeds -1.0 dBFS');
  assert.ok(maxOutputPeak <= ceiling + 0.0001, `Output peak (${maxOutputPeak}) MUST NOT exceed -1.0 dBFS ceiling (${ceiling})`);
  assert.ok(maxOutputPeak >= ceiling - 0.01, 'Output peak should be held at ceiling');
  console.log('  ✓ [PASS] Brickwall limiter strictly clamped output peak at -1.0 dBFS');
  passed++;

  // -------------------------------------------------------------
  // Test 5: PCM-16 / Float-32 Buffer Interconversion
  // -------------------------------------------------------------
  console.log('\n[Test 5] PCM-16 to Float-32 Conversion Fidelity');
  const originalFloats = new Float32Array([0.0, 0.5, -0.5, 0.89, -0.89]);
  const pcmBuffer = BroadcastAudioBus.float32ToPcm16(originalFloats, originalFloats);
  const roundtripStereo = BroadcastAudioBus.pcm16ToFloat32(pcmBuffer);

  // In interleaved stereo: even indices are Left, odd are Right
  for (let i = 0; i < originalFloats.length; i++) {
    assert.ok(Math.abs(originalFloats[i] - roundtripStereo[i * 2]) < 0.001, `Left channel fidelity mismatch at index ${i}`);
    assert.ok(Math.abs(originalFloats[i] - roundtripStereo[i * 2 + 1]) < 0.001, `Right channel fidelity mismatch at index ${i}`);
  }
  console.log('  ✓ [PASS] PCM-16 <-> Float32 conversion maintains 16-bit fidelity');
  passed++;

  console.log(`\n=== P0-02 Test Suite Completed: ${passed}/5 Passed (100%) ===\n`);
  process.exit(0);
}

runAudioBusTestSuite();
