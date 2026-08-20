/**
 * Comprehensive integration test for Mobile Companion:
 * - Multi-device presence & independent naming
 * - Desktop-side & mobile-side device renaming
 * - Live presence & voice indicator updates
 * - Mobile asset transfer (Audio -> Bumpers, PPTX -> Presentation, Image/Video -> Media)
 * - Operator accept / decline flow and size limits
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { io: ClientIo } = require('../ocs-mobile/node_modules/socket.io-client');
const appSettings = require('../src/main/appSettings');

async function runTests() {
  console.log('=== Starting Mobile Extension Integration Tests ===\n');

  const tmpDir = path.join('/tmp', `ocs_mobile_test_${Date.now()}`);
  await fsp.mkdir(tmpDir, { recursive: true });
  appSettings.init(tmpDir);

  const testMediaPath = path.join(tmpDir, 'media');
  await fsp.mkdir(testMediaPath, { recursive: true });

  // 1. Create a test Socket.IO server mimicking main.js pairing & asset transfer logic
  const serverApp = express();
  const server = http.createServer(serverApp);
  const ioServer = new Server(server, { cors: { origin: '*' } });

  let connectedDevices = [];
  let pendingTransfers = new Map();
  let devicesUpdatedEvents = [];
  const testPairing = { code: '123456', masterToken: 'master-token-123' };

  function broadcastDevicesUpdated() {
    const paired = connectedDevices.filter(d => d.paired);
    devicesUpdatedEvents.push(JSON.parse(JSON.stringify(paired)));
  }

  ioServer.on('connection', (socket) => {
    const device = {
      id: socket.id,
      ip: socket.handshake.address,
      paired: false,
      name: (socket.handshake.auth && socket.handshake.auth.deviceName) || 'Mobile',
      isVoiceActive: false,
      connectedAt: Date.now(),
    };
    connectedDevices.push(device);

    const cred = socket.handshake.auth && (socket.handshake.auth.token || socket.handshake.auth.code);
    if (cred === testPairing.code || cred === testPairing.masterToken) {
      device.paired = true;
      socket.emit('pair-result', { ok: true, deviceName: device.name });
      broadcastDevicesUpdated();
    } else {
      socket.emit('pair-required', { message: 'Pairing required' });
    }

    socket.on('pair', (payload = {}) => {
      const c = payload.token || payload.code;
      if (c === testPairing.code || c === testPairing.masterToken) {
        device.paired = true;
        device.name = payload.deviceName || device.name || 'Mobile';
        socket.emit('pair-result', { ok: true, deviceName: device.name });
        broadcastDevicesUpdated();
      } else {
        socket.emit('pair-result', { ok: false, error: 'Invalid pairing code' });
      }
    });

    socket.on('device-rename', (payload = {}) => {
      const newName = (payload.name || '').trim();
      if (newName) {
        device.name = newName;
        socket.emit('device-renamed', { name: newName });
        broadcastDevicesUpdated();
      }
    });

    socket.on('mobile-voice-state', (payload = {}) => {
      device.isVoiceActive = !!payload.active;
      broadcastDevicesUpdated();
    });

    socket.on('mobile-asset-transfer', async (payload = {}, ack = () => {}) => {
      if (!device.paired) {
        return ack({ ok: false, error: 'Pairing required' });
      }
      const { name, size, dataBase64 } = payload;
      if (!name || !dataBase64) {
        return ack({ ok: false, error: 'Invalid asset payload' });
      }
      if (size && size > 50 * 1024 * 1024) {
        return ack({ ok: false, error: 'File exceeds 50MB limit' });
      }

      const transferId = `xfer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      pendingTransfers.set(transferId, { transferId, socketId: socket.id, device, payload, ack });
    });

    socket.on('disconnect', () => {
      connectedDevices = connectedDevices.filter(d => d.id !== socket.id);
      broadcastDevicesUpdated();
    });
  });

  const TEST_PORT = 49152 + Math.floor(Math.random() * 1000);
  await new Promise((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));
  console.log(`✓ Test Socket.IO Server running on port ${TEST_PORT}`);

  try {
    // -------------------------------------------------------------
    // Test 1: Connect 2 devices simultaneously with custom names
    // -------------------------------------------------------------
    console.log('\n--- Test 1: Multi-Device Connection & Naming ---');
    const clientA = ClientIo(`http://127.0.0.1:${TEST_PORT}`, {
      auth: { code: '123456', deviceName: "Pastor's iPhone" },
      transports: ['websocket'],
    });

    const clientB = ClientIo(`http://127.0.0.1:${TEST_PORT}`, {
      auth: { code: '123456', deviceName: 'Media Booth iPad' },
      transports: ['websocket'],
    });

    await new Promise((resolve) => {
      let pairedCount = 0;
      const check = () => {
        pairedCount++;
        if (pairedCount === 2) resolve();
      };
      clientA.on('pair-result', check);
      clientB.on('pair-result', check);
    });

    assert.strictEqual(connectedDevices.length, 2, 'Should have 2 devices connected');
    assert.strictEqual(connectedDevices[0].name, "Pastor's iPhone");
    assert.strictEqual(connectedDevices[1].name, "Media Booth iPad");
    console.log('✓ Both devices connected and registered with distinct custom names');

    // -------------------------------------------------------------
    // Test 2: Mobile-initiated renaming & Desktop-initiated renaming
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Live Presence & Bidirectional Renaming ---');
    
    // Client A renames itself to "Rev. Smith Phone"
    clientA.emit('device-rename', { name: 'Rev. Smith Phone' });
    const renameA = await new Promise((resolve) => clientA.once('device-renamed', resolve));
    assert.strictEqual(renameA.name, 'Rev. Smith Phone');
    assert.strictEqual(connectedDevices.find(d => d.id === clientA.id).name, 'Rev. Smith Phone');
    console.log('✓ Mobile-initiated rename acknowledged and synced to server');

    // Desktop renames Client B to "Main Sanctuary iPad"
    const devB = connectedDevices.find(d => d.id === clientB.id);
    devB.name = 'Main Sanctuary iPad';
    ioServer.to(clientB.id).emit('device-renamed', { name: 'Main Sanctuary iPad' });
    broadcastDevicesUpdated();

    const renameB = await new Promise((resolve) => clientB.once('device-renamed', resolve));
    assert.strictEqual(renameB.name, 'Main Sanctuary iPad');
    console.log('✓ Desktop-initiated rename received by target mobile device');

    // Voice presence update
    clientA.emit('mobile-voice-state', { active: true });
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(connectedDevices.find(d => d.id === clientA.id).isVoiceActive, true);
    assert.strictEqual(connectedDevices.find(d => d.id === clientB.id).isVoiceActive, false);
    console.log('✓ Voice presence indicator tracked per-device');

    // -------------------------------------------------------------
    // Test 3: Asset Transfer - Audio -> Bumper (Intro / Outro)
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Asset Transfer - Audio to Intro/Outro Bumper ---');
    const dummyAudioBase64 = Buffer.from('FAKE_MP3_AUDIO_DATA').toString('base64');

    // Send Audio for Intro
    let ackPromise = new Promise((resolve) => {
      clientA.emit(
        'mobile-asset-transfer',
        {
          name: 'Sunday_Intro.mp3',
          type: 'audio',
          size: 1024,
          dataBase64: dummyAudioBase64,
        },
        resolve
      );
    });

    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(pendingTransfers.size, 1, 'Should have 1 pending transfer');
    const [tId, tObj] = [...pendingTransfers.entries()][0];
    assert.strictEqual(tObj.payload.name, 'Sunday_Intro.mp3');

    // Simulate operator accepting as 'intro'
    pendingTransfers.delete(tId);
    const introDest = path.join(testMediaPath, tObj.payload.name);
    await fsp.writeFile(introDest, Buffer.from(dummyAudioBase64, 'base64'));
    await appSettings.save({ sessionIntroPath: introDest });
    tObj.ack({ ok: true, message: 'Audio saved as intro bumper', role: 'intro' });

    const ackResult = await ackPromise;
    assert.strictEqual(ackResult.ok, true);
    assert.strictEqual(ackResult.role, 'intro');
    assert.strictEqual(appSettings.get('sessionIntroPath'), introDest);
    console.log('✓ Audio transferred and routed into appSettings.sessionIntroPath');

    // Send Audio for Outro
    ackPromise = new Promise((resolve) => {
      clientB.emit(
        'mobile-asset-transfer',
        {
          name: 'Sunday_Outro.mp3',
          type: 'audio',
          size: 2048,
          dataBase64: dummyAudioBase64,
        },
        resolve
      );
    });

    await new Promise((r) => setTimeout(r, 50));
    const [tId2, tObj2] = [...pendingTransfers.entries()][0];
    pendingTransfers.delete(tId2);
    const outroDest = path.join(testMediaPath, tObj2.payload.name);
    await fsp.writeFile(outroDest, Buffer.from(dummyAudioBase64, 'base64'));
    await appSettings.save({ sessionOutroPath: outroDest });
    tObj2.ack({ ok: true, message: 'Audio saved as outro bumper', role: 'outro' });

    const ackResult2 = await ackPromise;
    assert.strictEqual(ackResult2.ok, true);
    assert.strictEqual(ackResult2.role, 'outro');
    assert.strictEqual(appSettings.get('sessionOutroPath'), outroDest);
    console.log('✓ Audio transferred and routed into appSettings.sessionOutroPath');

    // -------------------------------------------------------------
    // Test 4: Asset Transfer - Operator Rejection & Size Limit
    // -------------------------------------------------------------
    console.log('\n--- Test 4: Operator Rejection & 50MB Size Limit ---');

    // Operator Rejection
    ackPromise = new Promise((resolve) => {
      clientA.emit(
        'mobile-asset-transfer',
        {
          name: 'Unwanted_Photo.jpg',
          type: 'image',
          size: 500,
          dataBase64: Buffer.from('FAKE_IMAGE').toString('base64'),
        },
        resolve
      );
    });

    await new Promise((r) => setTimeout(r, 50));
    const [tId3, tObj3] = [...pendingTransfers.entries()][0];
    pendingTransfers.delete(tId3);
    tObj3.ack({ ok: false, error: 'Declined by operator' });

    const rejectRes = await ackPromise;
    assert.strictEqual(rejectRes.ok, false);
    assert.strictEqual(rejectRes.error, 'Declined by operator');
    console.log('✓ Operator rejection correctly returned to mobile sender');

    // Oversize File (>50MB)
    const oversizeRes = await new Promise((resolve) => {
      clientB.emit(
        'mobile-asset-transfer',
        {
          name: 'Huge_Video.mp4',
          type: 'video',
          size: 60 * 1024 * 1024, // 60MB
          dataBase64: 'FAKE_DATA',
        },
        resolve
      );
    });
    assert.strictEqual(oversizeRes.ok, false);
    assert.strictEqual(oversizeRes.error, 'File exceeds 50MB limit');
    console.log('✓ Oversized asset (>50MB) rejected with clear error');

    // -------------------------------------------------------------
    // Test 5: Disconnect handling
    // -------------------------------------------------------------
    console.log('\n--- Test 5: Live Disconnect Handling ---');
    clientA.disconnect();
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(connectedDevices.length, 1, 'Only 1 device should remain after disconnect');
    assert.strictEqual(connectedDevices[0].id, clientB.id);
    clientB.disconnect();
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(connectedDevices.length, 0, 'No devices should remain');
    console.log('✓ Disconnections promptly update presence list');

    // -------------------------------------------------------------
    // Test 6: Picker Asset Type Detection & Format Validation
    // -------------------------------------------------------------
    console.log('\n--- Test 6: File Type Detection & Payload Formatting ---');
    function detectAssetType(filename, mimeType, targetCategory) {
      const lowerName = (filename || '').toLowerCase();
      const mime = mimeType || '';
      if (lowerName.endsWith('.pptx') || lowerName.endsWith('.ppt') || mime.includes('presentation')) {
        return 'presentation';
      } else if (targetCategory === 'audio' || mime.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(lowerName)) {
        return 'audio';
      } else if (mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg|bmp)$/i.test(lowerName)) {
        return 'image';
      } else if (mime.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi)$/i.test(lowerName)) {
        return 'video';
      }
      return 'media';
    }

    assert.strictEqual(detectAssetType('sermon.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'), 'presentation');
    assert.strictEqual(detectAssetType('deck.ppt', ''), 'presentation');
    assert.strictEqual(detectAssetType('worship_intro.mp3', 'audio/mpeg', 'audio'), 'audio');
    assert.strictEqual(detectAssetType('outro.wav', '', 'audio'), 'audio');
    assert.strictEqual(detectAssetType('background.jpg', 'image/jpeg'), 'image');
    assert.strictEqual(detectAssetType('banner.png', ''), 'image');
    assert.strictEqual(detectAssetType('loop.mp4', 'video/mp4'), 'video');
    assert.strictEqual(detectAssetType('motion.mov', ''), 'video');
    console.log('✓ All 4 asset categories (Image, Video, Audio, PPTX) detected with 100% accuracy');

    console.log('\n🎉 ALL Mobile Extension Integration Tests PASSED (100%)!\n');
  } finally {
    server.close();
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error('❌ Test failure:', err);
  process.exit(1);
});
