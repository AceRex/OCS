const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { AsrFacade } = require('../src/main/asr/asrFacade');
const { smartBibleMatch } = require('../src/App/controller/smartBibleMatch');

async function testWhisperFallbackSimulation() {
  console.log('=== Task 1: Simulating whisper.cpp Load Failure & Fallback to Vosk ===\n');

  const rootDir = path.join(__dirname, '..');
  const tempFakeDir = path.join(rootDir, 'temp_output', 'fake_whisper_root');
  fs.mkdirSync(tempFakeDir, { recursive: true });

  // 1. Test load failure when whisper model is absent
  console.log('[Step 1] Initializing AsrFacade pointing to empty model directory...');
  // Point to a directory without whisper model but with symlinked voice_server/models for vosk
  const fakeVoiceDir = path.join(tempFakeDir, 'voice_server', 'models');
  fs.mkdirSync(fakeVoiceDir, { recursive: true });
  // Symlink vosk model so Vosk is available
  const realVoskModel = path.join(rootDir, 'voice_server', 'models', 'vosk-model-small-en-us-0.15');
  const fakeVoskModel = path.join(fakeVoiceDir, 'vosk-model-small-en-us-0.15');
  if (!fs.existsSync(fakeVoskModel) && fs.existsSync(realVoskModel)) {
    try {
      fs.symlinkSync(realVoskModel, fakeVoskModel, 'dir');
    } catch (_) {
      // copy if symlink not permitted
    }
  }

  // Force 'whisper' on AsrFacade
  const facade = new AsrFacade(tempFakeDir);
  let engineChangedEmitted = null;
  facade.on('engine-changed', (evt) => {
    engineChangedEmitted = evt;
    console.log('  → Event emitted: engine-changed:', evt);
  });

  console.log('[Step 2] Calling facade.initialize("whisper")...');
  const state = await facade.initialize('whisper');

  console.log('[Step 3] Verifying fallback state:');
  console.log('  - State status:', state.status);
  console.log('  - Active asrEngine:', state.asrEngine);
  console.log('  - EngineName:', state.engineName);
  console.log('  - Confidence threshold (FR-3.68):', state.confidenceThreshold);

  assert.strictEqual(state.asrEngine, 'vosk', 'Must have fallen back to vosk');
  assert.strictEqual(state.engineName, 'vosk', 'Must have fallen back to vosk');
  assert(['ready', 'listening'].includes(state.status), 'Status must be ready or listening');
  assert.strictEqual(state.confidenceThreshold, 0.48, 'Vosk confidence threshold must be calibrated to 0.48 per FR-3.13 / FR-3.68');

  // 2. Test FR-3.68 engine switch recalibration on the real rootDir
  console.log('\n[Step 4] Testing FR-3.68 Engine Switch Recalibration:');
  const realFacade = new AsrFacade(rootDir);
  let switchEvents = [];
  realFacade.on('engine-changed', (evt) => {
    switchEvents.push(evt);
    console.log('  → Event: engine-changed:', evt);
  });

  console.log('  - Initializing Whisper (primary)...');
  const s1 = await realFacade.initialize('whisper');
  console.log('    Whisper initialized. asrEngine =', s1.asrEngine, 'conf =', s1.confidenceThreshold);
  assert.strictEqual(s1.asrEngine, 'whisper');
  assert.strictEqual(s1.confidenceThreshold, 0.42, 'Whisper default confidence must be 0.42');

  console.log('  - Switching to Vosk (fallback)...');
  const s2 = await realFacade.initialize('vosk');
  console.log('    Vosk initialized. asrEngine =', s2.asrEngine, 'conf =', s2.confidenceThreshold);
  assert.strictEqual(s2.asrEngine, 'vosk');
  assert.strictEqual(s2.confidenceThreshold, 0.48, 'Vosk threshold must reset to 0.48 on switch');

  console.log('  - Switching back to Whisper...');
  const s3 = await realFacade.initialize('whisper');
  console.log('    Whisper initialized. asrEngine =', s3.asrEngine, 'conf =', s3.confidenceThreshold);
  assert.strictEqual(s3.asrEngine, 'whisper');
  assert.strictEqual(s3.confidenceThreshold, 0.42, 'Whisper threshold must reset to 0.42 on switch');

  assert.strictEqual(switchEvents.length, 2, 'Should have received 2 engine-changed events');
  assert.strictEqual(switchEvents[0].fromEngine, 'whisper');
  assert.strictEqual(switchEvents[0].toEngine, 'vosk');
  assert.strictEqual(switchEvents[0].newThreshold, 0.48);
  assert.strictEqual(switchEvents[1].fromEngine, 'vosk');
  assert.strictEqual(switchEvents[1].toEngine, 'whisper');
  assert.strictEqual(switchEvents[1].newThreshold, 0.42);

  // 3. Test that commands execute through smartBibleMatch using Vosk output format
  console.log('\n[Step 5] Testing command execution with Vosk adapter transcript format:');
  const books = [
    { id: 19, name: "Psalms", chapters: 150 },
    { id: 43, name: "John", chapters: 21 },
    { id: 45, name: "Romans", chapters: 16 }
  ];

  // Vosk-style all-lowercase transcript event
  const voskPayload = {
    text: 'psalms twenty three verse six',
    utteranceId: 'utt-101',
    confidence: 0.78,
    pass: 'A',
    role: 'final',
    isFinal: true,
    asrEngine: 'vosk'
  };

  const match = await smartBibleMatch(voskPayload.text, books, null, null, { allowPass2: true });
  console.log('  - Input:', voskPayload.text);
  console.log('  - Match result:', books[match.bookIndex].name, `${match.chapter}:${match.startVerse}`);
  assert.strictEqual(books[match.bookIndex].name, 'Psalms');
  assert.strictEqual(match.chapter, 23);
  assert.strictEqual(match.startVerse, 6);

  realFacade.shutdown();
  facade.shutdown();

  console.log('\n🎉 Task 1 verification PASSED completely!\n');
}

testWhisperFallbackSimulation().catch((err) => {
  console.error('Task 1 Verification FAILED:', err);
  process.exit(1);
});
