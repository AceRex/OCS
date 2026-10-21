'use strict';
const assert = require('assert');
const { scrollDistance, ignoresPlaybackShortcut, createTranscriptGate } = require('../src/App/controller/teleprompterPlayback');
const total = hz => Array.from({ length: hz }, () => scrollDistance(1.5, 1000 / hz)).reduce((a, b) => a + b, 0);
for (const hz of [30, 60, 120, 144]) assert.ok(Math.abs(total(hz) - 72) < .001, `${hz} Hz speed must match`);
assert.equal(scrollDistance(1, 10000), 4.8, 'Returning from a suspended window must not jump');
assert.equal(scrollDistance(0, 16), 0);
for (const tag of ['input', 'select', 'button', 'textarea', 'a', 'contenteditable']) {
  assert.equal(ignoresPlaybackShortcut({ target: { closest: () => ({ tag }) } }), true);
}
assert.equal(ignoresPlaybackShortcut({ repeat: true }), true);
assert.equal(ignoresPlaybackShortcut({ key: 'Escape', target: { closest: () => ({}) } }), false, 'Escape must still close the reader when controls have focus');
assert.equal(!!ignoresPlaybackShortcut({ target: { closest: () => null } }), false);
const accept = createTranscriptGate();
assert.ok(accept({ text: 'holy holy', utteranceId: 1, isFinal: false }, 1000));
assert.equal(accept({ text: 'holy holy', utteranceId: 1, isFinal: true }, 1050), null, 'Duplicate IPC/DOM deliveries must not advance twice');
assert.ok(accept({ text: 'holy holy', utteranceId: 2 }, 1060), 'New utterance can repeat lyrics');
assert.ok(accept('holy holy', 1300), 'Later genuine repetition is preserved');
const payload = accept({ partial: '  next   line ', confidence: .92 }, 1500);
assert.equal(payload.text, 'next line'); assert.equal(payload.confidence, .92);
for (const modulePath of ['../src/main/whisperPrompt', '../src/main/asr/whisperPrompt']) {
  const { buildWhisperInitialPrompt } = require(modulePath);
  const prompt = buildWhisperInitialPrompt({ maxChars: 400 });
  assert.ok(prompt.length <= 400);
  for (const phrase of ['next verse', 'previous verse', 'clear screen', 'Colossians']) assert.ok(prompt.includes(phrase), `${phrase} missing from bounded prompt`);
}
const { WhisperEngine } = require('../src/main/asr/whisperEngine');
const engine = new WhisperEngine({ rootDir: process.cwd() });
engine.setSongContext({ lyrics: 'The Lord is my shepherd', isSong: false });
assert.equal(engine._isSongMode, false);
assert.ok(engine._initialPrompt.startsWith('Reading passage:'));
engine.setSongContext({ lyrics: 'Holy holy holy' }); assert.equal(engine._isSongMode, true);
engine.clearSongContext(); assert.equal(engine._isSongMode, false);
console.log('Teleprompter timing, keyboard, duplicate transcript, bounded prompt and speech/song context regressions passed.');
