const assert = require('assert');
const http = require('http');
const express = require('express');
const { NdiEngine } = require('../src/main/ndi/ndiEngine');

async function runTests() {
  console.log('=== Starting NDI & Broadcast Streaming Integration Tests ===\n');

  // 1. Engine Initialization & Status
  console.log('--- Test 1: NDI Engine Lifecycle & Defaults ---');
  const engine = new NdiEngine();
  const status = engine.getStatus();

  assert.strictEqual(status.enabled, true, 'NDI Engine should be enabled by default');
  assert.strictEqual(status.resolution, '1080p', 'Default resolution should be 1080p');
  assert.strictEqual(status.fps, 30, 'Default FPS should be 30');
  assert.strictEqual(typeof status.urls.programOverlay, 'string', 'Program overlay URL should be defined');
  assert.strictEqual(typeof status.urls.stageOverlay, 'string', 'Stage overlay URL should be defined');
  assert.strictEqual(typeof status.urls.programMjpeg, 'string', 'Program MJPEG URL should be defined');
  console.log('✓ NDI Engine initialized with valid defaults & stream URLs');

  // 2. Configuration Mutation
  console.log('\n--- Test 2: Configuration & Stream Resolution Mutation ---');
  const updated = engine.setConfig({ resolution: '720p', fps: 60, alphaEnabled: false });
  assert.strictEqual(updated.resolution, '720p', 'Resolution should update to 720p');
  assert.strictEqual(updated.fps, 60, 'FPS should update to 60');
  assert.strictEqual(updated.alphaEnabled, false, 'Alpha should be set to false');
  console.log('✓ NDI Engine config successfully updated (720p @ 60fps)');

  // 3. Network Source Discovery
  console.log('\n--- Test 3: Network NDI Source Discovery ---');
  const sources = await engine.discoverSources();
  assert(Array.isArray(sources), 'Discovered sources must be an array');
  assert(sources.length >= 2, 'Should discover local program and stage streams');
  const programSource = sources.find((s) => s.id === 'ocs-program');
  assert(programSource, 'Program output stream must be listed in discovery');
  console.log(`✓ Discovered ${sources.length} active NDI / LAN sources (including ${programSource.name})`);

  // 4. HTTP & MJPEG Stream Server Integration
  console.log('\n--- Test 4: HTTP Overlay & MJPEG Stream Endpoints ---');
  const testApp = express();
  const TEST_PORT = 49293;

  testApp.get('/overlay/program', (_req, res) => res.json({ ok: true, mode: 'program' }));
  testApp.get('/overlay/stage', (_req, res) => res.json({ ok: true, mode: 'stage' }));
  testApp.get('/stream/program.mjpg', (req, res) => engine.handleMjpegRequest(req, res, 'program'));
  testApp.get('/api/ndi/status', (_req, res) => res.json(engine.getStatus()));

  const server = http.createServer(testApp);
  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`✓ Test HTTP server listening on port ${TEST_PORT}`);

  // Test /api/ndi/status
  const statusRes = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${TEST_PORT}/api/ndi/status`, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => resolve(JSON.parse(raw)));
    }).on('error', reject);
  });
  assert.strictEqual(statusRes.resolution, '720p', 'Status API should return current config');
  console.log('✓ /api/ndi/status responded with valid NDI configuration');

  // Test /stream/program.mjpg header check
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
  assert.strictEqual(mjpegRes.statusCode, 200, 'MJPEG stream should return 200 OK');
  assert(
    mjpegRes.headers['content-type']?.includes('multipart/x-mixed-replace'),
    'Content-Type must be multipart/x-mixed-replace'
  );
  console.log('✓ /stream/program.mjpg initiated multipart video stream successfully');

  // Cleanup
  engine.stop();
  server.close();

  console.log('\n🎉 ALL NDI & Broadcast Streaming Integration Tests PASSED (100%)!\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
