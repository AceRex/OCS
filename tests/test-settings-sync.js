/**
 * Unit & Integration Test for Settings Persistence & Synchronization Architecture
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const appSettings = require('../src/main/appSettings');

async function runTests() {
  console.log('Testing Settings Persistence & Synchronization Architecture...\n');

  const testDir = '/tmp/ocs_settings_test_' + Date.now();
  await fsp.mkdir(testDir, { recursive: true });

  // 1. Initialize appSettings with test directory
  appSettings.init(testDir);

  // 2. Test initial load returns complete DEFAULTS
  const initial = await appSettings.load();
  console.log('✓ Initial settings loaded');
  assert.ok(initial.styles, 'styles object should exist');
  assert.strictEqual(initial.styles.fontFamily, 'Outfit');
  assert.strictEqual(initial.styles.backgroundColor, '#0B0814');
  assert.strictEqual(initial.styles.textColor, '#F5F2FA');
  assert.strictEqual(initial.styles.bibleTranslation, 'KJV');
  assert.strictEqual(initial.styles.bibleRefPosition, 'top-center');
  assert.strictEqual(initial.styles.bibleShowOrbs, true);
  assert.strictEqual(initial.sleepPrevention, 'always');
  assert.strictEqual(initial.transcriptionLanguage, 'en');
  assert.strictEqual(initial.languageGateEnabled, true);

  // 3. Test saving partial styles without losing sibling style properties (deep merge)
  console.log('Testing partial styles save and deep merge...');
  const patched1 = await appSettings.save({
    styles: {
      backgroundColor: '#1E1B4B',
      fontFamily: 'Space Grotesk',
      bibleTranslation: 'NIV',
    }
  });

  assert.strictEqual(patched1.styles.backgroundColor, '#1E1B4B');
  assert.strictEqual(patched1.styles.fontFamily, 'Space Grotesk');
  assert.strictEqual(patched1.styles.bibleTranslation, 'NIV');
  // Sibling style properties should still be preserved
  assert.strictEqual(patched1.styles.textColor, '#F5F2FA', 'textColor should be preserved');
  assert.strictEqual(patched1.styles.bibleRefPosition, 'top-center', 'bibleRefPosition should be preserved');
  assert.strictEqual(patched1.styles.bibleShowOrbs, true, 'bibleShowOrbs should be preserved');
  console.log('✓ Deep merge for styles verified');

  // 4. Test saving top-level settings without overwriting styles
  console.log('Testing top-level settings save...');
  const patched2 = await appSettings.save({
    transcriptionLanguage: 'fr',
    sleepPrevention: 'live',
    sessionTranscriptCleanup: true,
  });

  assert.strictEqual(patched2.transcriptionLanguage, 'fr');
  assert.strictEqual(patched2.sleepPrevention, 'live');
  assert.strictEqual(patched2.sessionTranscriptCleanup, true);
  assert.strictEqual(patched2.styles.backgroundColor, '#1E1B4B', 'styles should be preserved across top-level updates');
  console.log('✓ Top-level settings updates preserved nested styles');

  // 5. Test disk persistence by reading directly from filesystem
  console.log('Testing disk persistence in settings.json...');
  const rawFile = JSON.parse(await fsp.readFile(path.join(testDir, 'settings.json'), 'utf8'));
  assert.strictEqual(rawFile.transcriptionLanguage, 'fr');
  assert.strictEqual(rawFile.styles.backgroundColor, '#1E1B4B');
  assert.strictEqual(rawFile.styles.bibleTranslation, 'NIV');
  console.log('✓ Settings successfully written and read from disk');

  // 6. Test resetDefaults()
  console.log('Testing resetDefaults()...');
  const reset = await appSettings.resetDefaults();
  assert.strictEqual(reset.transcriptionLanguage, 'en');
  assert.strictEqual(reset.sleepPrevention, 'always');
  assert.strictEqual(reset.styles.backgroundColor, '#0B0814');
  assert.strictEqual(reset.styles.fontFamily, 'Outfit');
  assert.strictEqual(reset.styles.bibleTranslation, 'KJV');
  console.log('✓ resetDefaults() restores clean factory configuration');

  // Clean up
  await fsp.rm(testDir, { recursive: true, force: true });

  console.log('\n🎉 All Settings Synchronization & Persistence tests passed with 100% success!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
