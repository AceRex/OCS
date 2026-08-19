/**
 * Comprehensive integration test for bumper media probe, settings, and merge pipeline
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { spawnSync } = require('child_process');
const { getFfmpegPath, ffmpegAvailable, probeMediaInfo, mergeBumpersToRecording } = require('../src/main/sessionAudio');
const appSettings = require('../src/main/appSettings');

async function runTests() {
  console.log('Testing Bumpers Pipeline...');

  // 1. Check appSettings defaults
  const defaults = appSettings.DEFAULTS;
  assert.strictEqual(defaults.sessionIntroPath, null, 'default sessionIntroPath should be null');
  assert.strictEqual(defaults.sessionOutroPath, null, 'default sessionOutroPath should be null');
  assert.strictEqual(defaults.sessionAutoMergeBumpers, true, 'default sessionAutoMergeBumpers should be true');
  console.log('✓ appSettings defaults verified');

  // 2. Check ffmpeg detection
  const ffmpeg = getFfmpegPath();
  console.log('✓ getFfmpegPath() resolved:', ffmpeg);
  assert.ok(ffmpeg, 'ffmpeg binary should be resolved');
  assert.strictEqual(ffmpegAvailable(), true, 'ffmpegAvailable() should be true');

  // 3. Test probeMediaInfo on non-existent file
  const invalidInfo = probeMediaInfo('/tmp/non_existent_media_file.mp4');
  assert.strictEqual(invalidInfo.hasVideo, false);
  assert.strictEqual(invalidInfo.hasAudio, false);
  assert.strictEqual(invalidInfo.duration, 0);
  console.log('✓ probeMediaInfo safely handles invalid paths');

  // 4. Test synthetic media creation and merging
  const testDir = '/tmp/ocs_bumper_integration_test';
  await fsp.mkdir(testDir, { recursive: true });

  const introPath = path.join(testDir, 'intro.mp4');
  const sessionPath = path.join(testDir, 'session.mp4');
  const outroPath = path.join(testDir, 'outro.mp4');

  console.log('Generating test media clips...');
  // Create 2s intro video with audio
  spawnSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=640x360:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=2', '-c:v', 'libx264', '-c:a', 'aac', introPath]);
  
  // Create 3s audio-only recording
  spawnSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:a', 'aac', sessionPath]);

  // Create 2s outro video with audio
  spawnSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=640x360:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=800:duration=2', '-c:v', 'libx264', '-c:a', 'aac', outroPath]);

  const introInfo = probeMediaInfo(introPath);
  const sessionInfo = probeMediaInfo(sessionPath);
  const outroInfo = probeMediaInfo(outroPath);

  console.log('Probed media durations:', {
    intro: introInfo.duration,
    session: sessionInfo.duration,
    outro: outroInfo.duration,
  });

  assert.ok(introInfo.duration >= 1.8, 'intro should be ~2s');
  assert.ok(sessionInfo.duration >= 2.8, 'session should be ~3s');
  assert.ok(outroInfo.duration >= 1.8, 'outro should be ~2s');

  console.log('Executing mergeBumpersToRecording...');
  const mergeRes = await mergeBumpersToRecording(sessionPath, {
    introPath,
    outroPath,
  });

  console.log('Merge Result:', mergeRes);
  assert.strictEqual(mergeRes.merged, true, 'merge should succeed');
  assert.ok(mergeRes.totalDurationSec >= 6.5 && mergeRes.totalDurationSec <= 7.5, `total duration should be ~7s, got ${mergeRes.totalDurationSec}`);

  const finalProbed = probeMediaInfo(sessionPath);
  console.log('Final merged file probed duration:', finalProbed.duration);
  assert.ok(finalProbed.duration >= 6.5, 'final session.mp4 duration should reflect merged intro + session + outro');

  // Clean up
  await fsp.rm(testDir, { recursive: true, force: true });

  console.log('\n🎉 All Bumper unit and integration tests passed with 100% success!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
