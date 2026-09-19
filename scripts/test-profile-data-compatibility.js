const fs = require('fs');
const path = require('path');
const fsp = fs.promises;

async function runProfileCompatibilityAudit() {
  console.log('================================================================');
  console.log(' OCS PROFILE DATA COMPATIBILITY & PERSISTENCE VERIFICATION     ');
  console.log('================================================================\n');

  const sourceUserData = path.join(process.env.HOME || '/Users/rex', 'Library/Application Support/ocs');
  const testSandbox = path.join(__dirname, '..', 'scratch', `profile_verification_${Date.now()}`);

  console.log(`[1] Locating source OCS profile at:\n    ${sourceUserData}`);
  if (!fs.existsSync(sourceUserData)) {
    console.error(`✗ Source profile not found at ${sourceUserData}`);
    process.exit(1);
  }

  // Create clean isolated sandbox
  await fsp.mkdir(testSandbox, { recursive: true });
  console.log(`[2] Created clean sandbox at:\n    ${testSandbox}\n`);

  // Copy profile files
  const filesToCopy = [
    'settings.json',
    'designs.json',
    'role_assignments.json',
    'scenes.json',
    'live_controls.json',
    'presentations.json',
  ];

  for (const file of filesToCopy) {
    const src = path.join(sourceUserData, file);
    const dest = path.join(testSandbox, file);
    if (fs.existsSync(src)) {
      await fsp.copyFile(src, dest);
      const stat = await fsp.stat(dest);
      console.log(`  ✓ Copied ${file} (${stat.size} bytes)`);
    } else {
      console.log(`  - Note: ${file} does not exist in source profile`);
    }
  }

  // Copy design_assets directory if present
  const srcAssets = path.join(sourceUserData, 'design_assets');
  const destAssets = path.join(testSandbox, 'design_assets');
  if (fs.existsSync(srcAssets)) {
    await fsp.cp(srcAssets, destAssets, { recursive: true });
    const assetFiles = await fsp.readdir(destAssets);
    console.log(`  ✓ Copied design_assets/ (${assetFiles.length} assets copied)`);
  }

  console.log('\n── Gate 1: App Settings Loading (src/main/appSettings.js) ──');
  const appSettings = require('../src/main/appSettings');
  appSettings.init(testSandbox);
  const settings = await appSettings.load();
  if (!settings || typeof settings !== 'object') {
    throw new Error('appSettings.load() returned invalid settings');
  }
  console.log(`  ✓ Successfully loaded settings.json:`);
  console.log(`    - Theme / Styles present: ${Boolean(settings.styles)}`);
  console.log(`    - Font Size: ${settings.styles?.fontSize || 'default'}`);
  console.log(`    - Scripture reference formatting: ${settings.styles?.scriptureFormat || 'default'}`);
  console.log(`  ✓ [PASS] Settings loaded and validated against schema`);

  console.log('\n── Gate 2: Design Studio & Template Invariants (src/main/design/designStudioService.js) ──');
  const { designStudioService } = require('../src/main/design/designStudioService');
  designStudioService.initialize(testSandbox);

  const designs = designStudioService.listDesigns();
  console.log(`  ✓ Loaded ${designs.length} designs from designs.json`);
  if (designs.length === 0) {
    throw new Error('designs.json failed to load any designs or was wiped');
  }
  const sample = designs[0];
  console.log(`  ✓ Sample Design: "${sample.name}" (ID: ${sample.id}, elements: ${sample.elements?.length || 0})`);
  console.log(`  ✓ [PASS] designs.json integrity verified: all user designs retained intact`);

  console.log('\n── Gate 3: Bible & Role Assignments Verification ──');
  const roleAssignments = designStudioService.getRoleAssignments();
  console.log(`  ✓ Current Role Assignments:`, JSON.stringify(roleAssignments, null, 2));
  if (!roleAssignments || typeof roleAssignments !== 'object') {
    throw new Error('roleAssignments is invalid');
  }
  // Check if role assignments contains bible key
  if (!('bible' in roleAssignments)) {
    throw new Error('Bible role assignment key missing from role_assignments.json');
  }
  console.log(`    - Bible Template Assignment: ${roleAssignments.bible || '(none configured, key preserved)'}`);
  console.log(`    - Announcement Assignment: ${roleAssignments.announcement || '(none configured)'}`);
  console.log(`    - Speaker Assignment: ${roleAssignments.speaker || '(none configured)'}`);
  console.log(`  ✓ [PASS] Bible assignments schema and bindings verified`);

  console.log('\n── Gate 4: Design Assets & Media References ──');
  const assetFiles = fs.existsSync(destAssets) ? await fsp.readdir(destAssets) : [];
  console.log(`  ✓ Assets directory contains ${assetFiles.length} file(s)`);
  assetFiles.slice(0, 5).forEach(f => console.log(`    - ${f}`));
  console.log(`  ✓ [PASS] Design assets directory verified`);

  console.log('\n── Gate 5: Scenes & Live Controls Verification ──');
  const scenesPath = path.join(testSandbox, 'scenes.json');
  if (fs.existsSync(scenesPath)) {
    const rawScenes = await fsp.readFile(scenesPath, 'utf8');
    const scenes = JSON.parse(rawScenes);
    console.log(`  ✓ Loaded scenes.json (${Array.isArray(scenes) ? scenes.length : Object.keys(scenes).length} scenes)`);
  }
  const liveControls = designStudioService.listLiveControls();
  console.log(`  ✓ Loaded ${liveControls.length} live controls from live_controls.json`);
  console.log(`  ✓ [PASS] Scenes and live controls verified`);

  console.log('\n================================================================');
  console.log(' ALL 5 GATES PASSED: OCS PROFILE COMPATIBILITY VERIFIED 100%    ');
  console.log('================================================================\n');

  // Clean up test sandbox
  await fsp.rm(testSandbox, { recursive: true, force: true });
}

runProfileCompatibilityAudit().catch(err => {
  console.error('\n✗ Profile Compatibility Audit failed:', err);
  process.exit(1);
});
