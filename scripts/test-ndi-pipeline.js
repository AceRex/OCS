const assert = require('assert');
const http = require('http');
const express = require('express');
const { NdiEngine } = require('../src/main/ndi/ndiEngine');

async function runTests() {
  console.log('=== Starting NDI & Broadcast Streaming Integration Tests (FR-4.41–FR-4.44) ===\n');

  // 1. Engine Initialization & Defaults (FR-4.42: Off by default on fresh launch)
  console.log('--- Test 1: NDI Engine Lifecycle & Off-by-Default State (FR-4.42) ---');
  const engine = new NdiEngine();
  const status = engine.getStatus();

  assert.strictEqual(status.enabled, false, 'NDI Engine MUST be disabled by default (FR-4.42)');
  assert.strictEqual(status.isRunning, false, 'NDI Engine MUST NOT run automatically on fresh launch (FR-4.42)');
  assert.strictEqual(status.resolution, '1080p', 'Default resolution should be 1080p');
  assert.strictEqual(status.fps, 30, 'Default FPS should be 30');
  assert.strictEqual(typeof status.urls.programOverlay, 'string', 'Program overlay URL should be defined');
  assert.strictEqual(typeof status.urls.stageOverlay, 'string', 'Stage overlay URL should be defined');
  assert.strictEqual(typeof status.urls.programMjpeg, 'string', 'Program MJPEG URL should be defined');
  console.log('✓ NDI Engine initialized with OFF-by-default security posture (FR-4.42)');

  // 2. HTTP Server & Disabled Stream Gating
  console.log('\n--- Test 2: HTTP Stream Gating When Disabled (FR-4.43 / FR-4.44) ---');
  const testApp = express();
  const TEST_PORT = 49293;

  testApp.get('/overlay/program', (_req, res) => res.json({ ok: true, mode: 'program' }));
  testApp.get('/overlay/stage', (_req, res) => res.json({ ok: true, mode: 'stage' }));
  testApp.get('/stream/program.mjpg', (req, res) => engine.handleMjpegRequest(req, res, 'program'));
  testApp.get('/api/ndi/status', (_req, res) => res.json(engine.getStatus()));

  const server = http.createServer(testApp);
  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`✓ Test HTTP server listening on port ${TEST_PORT}`);

  // Test /stream/program.mjpg when disabled -> MUST return 403 Forbidden
  const blockedRes = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${TEST_PORT}/stream/program.mjpg`, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    }).on('error', reject);
  });
  assert.strictEqual(blockedRes.statusCode, 403, 'Unauthenticated/Disabled stream request must return 403 Forbidden');
  assert(blockedRes.body.includes('disabled in OCS Settings'), 'Response body must mention NDI is disabled in Settings');
  console.log('✓ /stream/program.mjpg correctly returned 403 Forbidden when disabled');

  // 3. Explicit Enable & Configuration Mutation
  console.log('\n--- Test 3: Explicit Enable & Configuration Mutation ---');
  engine.setConfig({ enabled: true, resolution: '720p', fps: 60, alphaEnabled: false });
  engine.start();

  const enabledStatus = engine.getStatus();
  assert.strictEqual(enabledStatus.enabled, true, 'Engine should be enabled after explicit setConfig');
  assert.strictEqual(enabledStatus.isRunning, true, 'Engine should be running after start()');
  assert.strictEqual(enabledStatus.resolution, '720p', 'Resolution should update to 720p');
  assert.strictEqual(enabledStatus.fps, 60, 'FPS should update to 60');
  console.log('✓ NDI Engine explicitly enabled (720p @ 60fps)');

  // Test /stream/program.mjpg when enabled -> MUST return 200 OK multipart stream
  const mjpegRes = await new Promise((resolve, reject) => {
    const req = http.request(`http://127.0.0.1:${TEST_PORT}/stream/program.mjpg`, (res) => {
      resolve({ statusCode: res.statusCode, headers: res.headers });
      res.destroy();
      req.destroy();
    });
    req.on('error', (err) => {
      if (err.code !== 'ECONNRESET') reject(err);
    });
    req.end();
  });
  assert.strictEqual(mjpegRes.statusCode, 200, 'MJPEG stream should return 200 OK when enabled');
  assert(
    mjpegRes.headers['content-type']?.includes('multipart/x-mixed-replace'),
    'Content-Type must be multipart/x-mixed-replace'
  );
  console.log('✓ /stream/program.mjpg initiated multipart video stream successfully when enabled');

  // 4. Network Source Discovery
  console.log('\n--- Test 4: Network NDI Source Discovery ---');
  const sources = await engine.discoverSources();
  assert(Array.isArray(sources), 'Discovered sources must be an array');
  assert(sources.length >= 2, 'Should discover local program and stage streams');
  const programSource = sources.find((s) => s.id === 'ocs-program');
  assert(programSource, 'Program output stream must be listed in discovery');
  console.log(`✓ Discovered ${sources.length} active NDI / LAN sources (including ${programSource.name})`);

  // 5. Disable & Teardown
  console.log('\n--- Test 5: Disable & Teardown ---');
  engine.stop();
  engine.setConfig({ enabled: false });

  const finalBlockedRes = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${TEST_PORT}/stream/program.mjpg`, (res) => {
      resolve({ statusCode: res.statusCode });
    }).on('error', reject);
  });
  assert.strictEqual(finalBlockedRes.statusCode, 403, 'Disabled stream must return 403 Forbidden after stop()');
  console.log('✓ Stream endpoint re-gated with 403 Forbidden upon disabling');

  server.close();
  console.log('\n🎉 ALL NDI & Broadcast Streaming Security & Pipeline Tests PASSED (100%)!\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
