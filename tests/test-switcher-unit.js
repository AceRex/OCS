/**
 * test-switcher-unit.js
 *
 * Standalone integration unit test verifying all Phase A Live Switcher core logic:
 * 1. Up to 6 cameras can opt-in.
 * 2. 7th camera opt-in is rejected (MAX_CAMERA_SLOTS = 6).
 * 3. Non-controller client attempts to switch program -> REJECTED server-side.
 * 4. Non-controller client attempts to route destinations -> REJECTED server-side.
 * 5. Controller handoff: granting control to a client allows that client to switch & route.
 * 6. Program switch emits 'switcher:you-are-program' to target client.
 * 7. Controller reclaim: desktop reclaims authority, client is subsequently rejected.
 * 8. Client disconnect cleanup: camera slot freed, program source cleared if disconnected.
 */

const http = require('http');
const { Server } = require('socket.io');
const { io: ClientIO } = require('socket.io-client');

const PORT = 4099;
const MAX_CAMERA_SLOTS = 6;

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

// Set up an isolated test server replicating main.js switcher state & handlers
function createTestServer() {
  const httpServer = http.createServer();
  const io = new Server(httpServer, {
    cors: { origin: '*' }
  });

  const switcherCameraSlots = new Map();
  let switcherControllerSocketId = 'desktop';
  let switcherProgramSourceId = null;
  let switcherRouteGeneral = false;
  let switcherRouteSpeaker = false;

  function _nextSwitcherSlot() {
    const used = new Set(Array.from(switcherCameraSlots.values()).map(v => v.slotIndex));
    for (let i = 1; i <= MAX_CAMERA_SLOTS; i++) {
      if (!used.has(i)) return i;
    }
    return switcherCameraSlots.size + 1;
  }

  function _switcherSlotsPayload() {
    return Array.from(switcherCameraSlots.entries()).map(([socketId, info]) => ({
      socketId,
      name: info.name,
      slotIndex: info.slotIndex,
    }));
  }

  function broadcastSwitcherState() {
    const state = {
      cameraSlots: _switcherSlotsPayload(),
      controllerSocketId: switcherControllerSocketId,
      programSourceId: switcherProgramSourceId,
      routeGeneral: switcherRouteGeneral,
      routeSpeaker: switcherRouteSpeaker,
    };
    io.emit('switcher:state', state);
  }

  io.on('connection', (socket) => {
    socket.on('switcher:opt-in-camera', (payload = {}, ack = () => {}) => {
      if (switcherCameraSlots.has(socket.id)) {
        const info = switcherCameraSlots.get(socket.id);
        return ack({ ok: true, slotIndex: info.slotIndex });
      }
      if (switcherCameraSlots.size >= MAX_CAMERA_SLOTS) {
        return ack({ ok: false, error: `Maximum of ${MAX_CAMERA_SLOTS} cameras already connected` });
      }
      const slotIndex = _nextSwitcherSlot();
      const devName = payload.name || `Camera-${slotIndex}`;
      switcherCameraSlots.set(socket.id, { name: devName, slotIndex });
      broadcastSwitcherState();
      ack({ ok: true, slotIndex });
    });

    socket.on('switcher:opt-out-camera', (payload = {}, ack = () => {}) => {
      if (!switcherCameraSlots.has(socket.id)) {
        return ack({ ok: true });
      }
      switcherCameraSlots.delete(socket.id);
      if (switcherProgramSourceId === socket.id) {
        switcherProgramSourceId = null;
      }
      broadcastSwitcherState();
      ack({ ok: true });
    });

    socket.on('switcher:set-program', (payload = {}, ack = () => {}) => {
      if (switcherControllerSocketId !== socket.id) {
        return ack({ ok: false, error: 'Permission denied — you are not the current switcher controller' });
      }
      const targetId = payload.deviceId;
      if (!targetId || (!switcherCameraSlots.has(targetId) && targetId !== null)) {
        return ack({ ok: false, error: 'Invalid camera source' });
      }
      switcherProgramSourceId = targetId;
      const targetSock = targetId ? io.sockets.sockets.get(targetId) : null;
      if (targetSock) targetSock.emit('switcher:you-are-program', { active: true });
      broadcastSwitcherState();
      ack({ ok: true, programSourceId: targetId });
    });

    socket.on('switcher:route-destination', (payload = {}, ack = () => {}) => {
      if (switcherControllerSocketId !== socket.id) {
        return ack({ ok: false, error: 'Permission denied — you are not the current switcher controller' });
      }
      const { destination, active } = payload;
      if (destination !== 'general' && destination !== 'speaker') {
        return ack({ ok: false, error: 'Invalid destination' });
      }
      if (destination === 'general') switcherRouteGeneral = !!active;
      if (destination === 'speaker') switcherRouteSpeaker = !!active;
      broadcastSwitcherState();
      ack({ ok: true });
    });

    socket.on('switcher:get-state', (ack = () => {}) => {
      ack({
        ok: true,
        cameraSlots: _switcherSlotsPayload(),
        controllerSocketId: switcherControllerSocketId,
        programSourceId: switcherProgramSourceId,
        routeGeneral: switcherRouteGeneral,
        routeSpeaker: switcherRouteSpeaker,
      });
    });

    socket.on('disconnect', () => {
      if (switcherCameraSlots.has(socket.id)) {
        switcherCameraSlots.delete(socket.id);
        if (switcherProgramSourceId === socket.id) {
          switcherProgramSourceId = null;
        }
        broadcastSwitcherState();
      }
      if (switcherControllerSocketId === socket.id) {
        switcherControllerSocketId = 'desktop';
        broadcastSwitcherState();
      }
    });
  });

  return {
    httpServer,
    io,
    grantControl: (socketId) => {
      switcherControllerSocketId = socketId;
      io.emit('switcher:control-granted', { controllerSocketId: socketId });
      broadcastSwitcherState();
    },
    reclaimControl: () => {
      const old = switcherControllerSocketId;
      switcherControllerSocketId = 'desktop';
      io.emit('switcher:control-revoked', { oldControllerSocketId: old, newControllerSocketId: 'desktop' });
      broadcastSwitcherState();
    },
    getState: () => ({
      switcherControllerSocketId,
      switcherProgramSourceId,
      switcherCameraSlots,
    }),
  };
}

function connectClient(port) {
  return new Promise((resolve) => {
    const socket = ClientIO(`http://localhost:${port}`, {
      transports: ['websocket'],
      forceNew: true,
    });
    socket.on('connect', () => resolve(socket));
  });
}

async function runTests() {
  console.log('\n=== Live Switcher Phase A Verification Suite ===\n');

  const server = createTestServer();
  await new Promise((resolve) => server.httpServer.listen(PORT, resolve));

  const clients = [];

  try {
    // Connect 7 clients (Client 0 = potential controller, 1..6 = cameras, 7 = excess camera)
    for (let i = 0; i < 8; i++) {
      clients.push(await connectClient(PORT));
    }

    // ── Test 1: Opt-in 6 camera sources ───────────────────────────────────────
    console.log('[Phase A: Camera Slots & 6-Device Limit]');
    for (let i = 1; i <= 6; i++) {
      const res = await new Promise((r) =>
        clients[i].emit('switcher:opt-in-camera', { name: `Camera Phone ${i}` }, r)
      );
      assert(`Camera ${i} successfully opted in (slot ${res.slotIndex})`, res.ok === true && res.slotIndex === i);
    }

    // ── Test 2: 7th camera opt-in must be REJECTED ─────────────────────────────
    const excessRes = await new Promise((r) =>
      clients[7].emit('switcher:opt-in-camera', { name: 'Excess Phone' }, r)
    );
    assert('7th camera opt-in is REJECTED by server', excessRes.ok === false);
    assert('Error message specifies maximum of 6 cameras', excessRes.error.includes('Maximum of 6'));

    // ── Test 3: Server-side rejection of non-controller switch ─────────────────
    console.log('\n[Phase A: Controller Authority & Server-Side Enforcement]');
    const rogueSwitchRes = await new Promise((r) =>
      clients[1].emit('switcher:set-program', { deviceId: clients[2].id }, r)
    );
    assert('Non-controller switcher:set-program is REJECTED by server', rogueSwitchRes.ok === false);
    assert('Rejection specifies permission denied', rogueSwitchRes.error.includes('Permission denied'));

    // ── Test 4: Server-side rejection of non-controller destination routing ───
    const rogueRouteRes = await new Promise((r) =>
      clients[1].emit('switcher:route-destination', { destination: 'general', active: true }, r)
    );
    assert('Non-controller switcher:route-destination is REJECTED by server', rogueRouteRes.ok === false);
    assert('Rejection specifies permission denied', rogueRouteRes.error.includes('Permission denied'));

    // ── Test 5: Controller Handoff — Desktop grants control to Client 0 ────────
    console.log('\n[Phase A: Controller Handoff & Switching Execution]');
    server.grantControl(clients[0].id);

    // Verify client 0 can now switch program to Camera 3 (Client 3)
    const programNotifiedPromise = new Promise((resolve) => {
      clients[3].once('switcher:you-are-program', (payload) => {
        resolve(payload?.active === true);
      });
    });

    const validSwitchRes = await new Promise((r) =>
      clients[0].emit('switcher:set-program', { deviceId: clients[3].id }, r)
    );
    const programNotified = await programNotifiedPromise;
    assert('Authorized controller switcher:set-program succeeds', validSwitchRes.ok === true);
    assert('Target camera received switcher:you-are-program notification', programNotified);

    // Verify client 0 can route destinations
    const routeGenRes = await new Promise((r) =>
      clients[0].emit('switcher:route-destination', { destination: 'general', active: true }, r)
    );
    assert('Authorized controller routes to General View', routeGenRes.ok === true);

    const routeSpkRes = await new Promise((r) =>
      clients[0].emit('switcher:route-destination', { destination: 'speaker', active: true }, r)
    );
    assert('Authorized controller routes to Speaker View', routeSpkRes.ok === true);

    // ── Test 6: Controller Reclaim — Desktop reclaims control ─────────────────
    console.log('\n[Phase A: Controller Reclaim]');
    server.reclaimControl();

    // Verify client 0 is now REJECTED again
    const postReclaimRes = await new Promise((r) =>
      clients[0].emit('switcher:set-program', { deviceId: clients[1].id }, r)
    );
    assert('Former controller switcher:set-program is REJECTED after desktop reclaim', postReclaimRes.ok === false);
    assert('Rejection message confirms lack of permission', postReclaimRes.error.includes('Permission denied'));

    // ── Test 7: Disconnect Cleanup ────────────────────────────────────────────
    console.log('\n[Phase A: Disconnection & Slot Recycling]');
    // Disconnect active program camera (Client 3)
    clients[3].disconnect();
    await new Promise((r) => setTimeout(r, 100));

    const stateAfterDisconnect = await new Promise((r) =>
      clients[0].emit('switcher:get-state', r)
    );
    assert('Camera slot cleaned up on disconnect (slots = 5)', stateAfterDisconnect.cameraSlots.length === 5);
    assert('Program source cleared when active camera disconnects', stateAfterDisconnect.programSourceId === null);

    // Now client 7 can opt-in to the freed slot
    const recycleRes = await new Promise((r) =>
      clients[7].emit('switcher:opt-in-camera', { name: 'New Camera' }, r)
    );
    assert('Previously rejected 7th client can now opt-in to freed slot', recycleRes.ok === true);
    assert('Recycled slot has valid index 1..6', recycleRes.slotIndex >= 1 && recycleRes.slotIndex <= 6);

  } finally {
    for (const c of clients) {
      if (c.connected) c.disconnect();
    }
    await new Promise((resolve) => server.httpServer.close(resolve));
  }

  console.log('\n----------------------------------------------');
  console.log(`Passed: ${passed} | Failed: ${failed}`);
  if (failed === 0) {
    console.log('✅ ALL TESTS PASSED: Live Switcher Phase A Core Verified.\n');
    process.exit(0);
  } else {
    console.error(`❌ ${failed} test(s) failed.\n`);
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
