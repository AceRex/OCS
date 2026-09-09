/**
 * OCS Automated CI Test Runner
 *
 * Executes the production test suites required for CI gating.
 * Any individual suite failure terminates execution with a non-zero exit code.
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const TEST_SUITES = [
  { name: 'P0-03 Live Execution State Recovery', script: 'scripts/test-service-journal-recovery.js' },
  { name: 'Display Canvas Dynamic Sizing & Bands', script: 'scripts/test-display-canvas-bands.js' },
  { name: 'NDI Network Video Transmission Pipeline', script: 'scripts/test-ndi-pipeline.js' },
  { name: 'Authentication, Security & Licensing', script: 'scripts/test-auth-licensing-pipeline.js' },
  { name: 'Video Switcher Camera Logic & Transitions', script: 'tests/test-switcher-unit.js' },
  { name: 'Live Broadcast Studio Compositing Engine', script: 'tests/test-live-broadcast-studio.js' },
  { name: 'ASR & Grammar Voice Recognition Suite', script: 'scripts/run-voice-suite.js' },
  { name: 'P0-05 Program Video MP4 Recorder', script: 'scripts/test-program-recorder.js' },
  { name: 'P0-02 Broadcast Audio Mixer & Limiter', script: 'scripts/test-broadcast-audio-bus.js' },
  { name: 'P0-01 Native RTMP/SRT Broadcast Supervisor', script: 'scripts/test-broadcast-supervisor.js' },
  { name: 'Stage 6.2 Production Pipeline Integration & P0 Closure', script: 'scripts/test-production-pipeline-integration.js' },
  { name: 'Stage 6.3 Runtime Proof & Sunday Simulation', script: 'scripts/test-stage63-runtime-proof.js' },
  { name: 'Stage 7 Field Production Validation', script: 'scripts/test-stage7-field-validation.js' },
  { name: 'Stage 7.1 Field Pilot & Operator Reliability', script: 'scripts/test-stage71-field-pilot.js' },
  { name: 'Stage 7.2 Final Church Service Field Gate', script: 'scripts/test-stage72-field-gate.js' },
  { name: 'Stage 8 Runtime Integration Closure', script: 'scripts/test-stage8-runtime.js' }
];

console.log('====================================================');
console.log('       OCS Production CI Automated Test Gate        ');
console.log('====================================================\n');

let totalPassed = 0;
let totalFailed = 0;
let skipped = 0;
const rootDir = path.resolve(__dirname, '..');

for (const suite of TEST_SUITES) {
  const fullPath = path.join(rootDir, suite.script);
  if (!fs.existsSync(fullPath)) {
    if (suite.optionalUntilImplemented) {
      console.log(`[-] SKIPPED: ${suite.name} (Implementation in progress: ${suite.script})`);
      skipped++;
      continue;
    } else {
      console.error(`[X] FAILED: Missing required test script: ${suite.script}`);
      totalFailed++;
      process.exit(1);
    }
  }

  console.log(`[+] RUNNING: ${suite.name} (${suite.script})...`);
  const result = spawnSync('node', [suite.script], {
    cwd: rootDir,
    stdio: 'inherit',
    env: { ...process.env, CI: 'true' }
  });

  if (result.status === 0) {
    console.log(`[PASS] ${suite.name}\n`);
    totalPassed++;
  } else {
    console.error(`\n[FAIL] ${suite.name} exited with status code ${result.status}\n`);
    totalFailed++;
    process.exit(result.status || 1);
  }
}

console.log('====================================================');
console.log(`CI Test Gate Result: ${totalPassed} Passed, ${totalFailed} Failed, ${skipped} Skipped`);
console.log('====================================================\n');

if (totalFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
