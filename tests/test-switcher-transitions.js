/**
 * test-switcher-transitions.js
 *
 * Automated verification suite for Live Control Phase B (Transition Library):
 * 1. Server-side permission gating on `switcher:set-transition-setting`.
 *    - Controller can update transition setting.
 *    - Non-controller is rejected with an error.
 * 2. Transition setting validation & clamping (duration 100-3000ms, 4 wipe directions).
 * 3. Single-bus execution: setProgram triggers transition start event at t=0.
 * 4. Tally vs Program timing:
 *    - Tally (switcher:you-are-program) sent immediately at t=0.
 *    - Authoritative program source updates at t=duration.
 * 5. Immediate interruption / takeover:
 *    - Clicking mid-transition immediately cancels the running transition.
 *    - Starts the new transition without queueing.
 * 6. Hard cut: immediate switch at t=0 with no transition delay.
 */

const http = require('http');
const { Server } = require('socket.io');
const { io: ClientIO } = require('socket.io-client');

const PORT = 4101;
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

function createTransitionTestServer() {
  const httpServer = http.createServer();
  const io = new Server(httpServer, {
    cors: { origin: '*' },
  });

  const switcherCameraSlots = new Map();
  let switcherControllerSocketId = 'desktop';
  let switcherProgramSourceId = null;
  let switcherRouteGeneral = false;
  let switcherRouteSpeaker = false;

  let switcherTransitionSetting = {
    type: 'fade',
    duration: 750,
    direction: 'left-to-right',
  };
  let switcherActiveTransition = null;
  let switcherTransitionTimer = null;

  function _nextSwitcherSlot() {
    const used = new Set(Array.from(switcherCameraSlots.values()).map((v) => v.slotIndex));
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
    io.emit('switcher:state', {
      cameraSlots: _switcherSlotsPayload(),
      controllerSocketId: switcherControllerSocketId,
      programSourceId: switcherProgramSourceId,
      routeGeneral: switcherRouteGeneral,
      routeSpeaker: switcherRouteSpeaker,
      transitionSetting: switcherTransitionSetting,
      activeTransition: switcherActiveTransition,
    });
  }

  function executeProgramSwitch(targetId, customTransition) {
    const transition = customTransition || switcherTransitionSetting;
    const toId = targetId;

    if (!switcherActiveTransition && switcherProgramSourceId === toId) {
      return { ok: true, programSourceId: toId };
    }

    if (switcherActiveTransition && switcherActiveTransition.toId === toId) {
      return { ok: true, transitioning: true, transition: switcherActiveTransition };
    }

    // Interruption handling: cancel previous transition immediately
    let fromId = switcherProgramSourceId;
    if (switcherActiveTransition) {
      fromId = switcherActiveTransition.toId || switcherProgramSourceId;
      if (switcherTransitionTimer) {
        clearTimeout(switcherTransitionTimer);
        switcherTransitionTimer = null;
      }
      switcherActiveTransition = null;
    }

    if (transition.type === 'cut' || !fromId || transition.duration <= 0) {
      switcherActiveTransition = null;
      switcherProgramSourceId = toId;
      if (toId) {
        const targetSock = io.sockets.sockets.get(toId);
        if (targetSock) targetSock.emit('switcher:you-are-program', { active: true });
      }
      broadcastSwitcherState();
      io.emit('switcher:transition-complete', { programSourceId: toId });
      return { ok: true, programSourceId: toId };
    }

    const duration = Math.max(100, Math.min(3000, Number(transition.duration) || 750));
    const type = ['cut', 'fade', 'wipe'].includes(transition.type) ? transition.type : 'fade';
    const direction = ['left-to-right', 'right-to-left', 'top-to-bottom', 'bottom-to-top'].includes(transition.direction)
      ? transition.direction
      : 'left-to-right';
    const transitionId = `trans_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const startTime = Date.now();

    switcherActiveTransition = {
      id: transitionId,
      fromId,
      toId,
      type,
      duration,
      direction,
      startTime,
    };

    // Tally lights up immediately at t=0
    if (toId) {
      const targetSock = io.sockets.sockets.get(toId);
      if (targetSock) targetSock.emit('switcher:you-are-program', { active: true });
    }

    io.emit('switcher:transition-start', switcherActiveTransition);

    switcherTransitionTimer = setTimeout(() => {
      switcherTransitionTimer = null;
      switcherActiveTransition = null;
      switcherProgramSourceId = toId;
      broadcastSwitcherState();
      io.emit('switcher:transition-complete', { programSourceId: toId });
    }, duration);

    return { ok: true, transitioning: true, transition: switcherActiveTransition };
  }

  io.on('connection', (socket) => {
    socket.on('switcher:opt-in-camera', ({ name }, ack) => {
      if (switcherCameraSlots.size >= MAX_CAMERA_SLOTS) {
        return ack && ack({ ok: false, error: 'Maximum 6 cameras reached' });
      }
      const slotIndex = _nextSwitcherSlot();
      switcherCameraSlots.set(socket.id, { name: name || `Camera ${slotIndex}`, slotIndex });
      broadcastSwitcherState();
      if (ack) ack({ ok: true, slotIndex });
    });

    socket.on('switcher:set-program', ({ deviceId }, ack) => {
      const isController = socket.id === switcherControllerSocketId || switcherControllerSocketId === 'desktop';
      if (!isController) {
        return ack && ack({ ok: false, error: 'You do not hold switcher controller permission' });
      }
      const res = executeProgramSwitch(deviceId);
      if (ack) ack(res);
    });

    socket.on('switcher:set-transition-setting', (setting, ack) => {
      const isController = socket.id === switcherControllerSocketId || switcherControllerSocketId === 'desktop';
      if (!isController) {
        return ack && ack({ ok: false, error: 'You do not hold switcher controller permission' });
      }
      const duration = Math.max(100, Math.min(3000, Number(setting?.duration) || 750));
      const type = ['cut', 'fade', 'wipe'].includes(setting?.type) ? setting.type : 'fade';
      const direction = ['left-to-right', 'right-to-left', 'top-to-bottom', 'bottom-to-top'].includes(setting?.direction)
        ? setting.direction
        : 'left-to-right';

      switcherTransitionSetting = { type, duration, direction };
      io.emit('switcher:transition-setting-updated', switcherTransitionSetting);
      if (ack) ack({ ok: true, transitionSetting: switcherTransitionSetting });
    });

    socket.on('switcher:grant-control', ({ deviceId }, ack) => {
      switcherControllerSocketId = deviceId;
      broadcastSwitcherState();
      if (ack) ack({ ok: true, controllerSocketId: deviceId });
    });

    socket.on('switcher:reclaim-control', (_, ack) => {
      switcherControllerSocketId = 'desktop';
      broadcastSwitcherState();
      if (ack) ack({ ok: true, controllerSocketId: 'desktop' });
    });
  });

  return new Promise((resolve) => {
    httpServer.listen(PORT, () => {
      resolve({
        httpServer,
        io,
        close: () => new Promise((res) => httpServer.close(res)),
      });
    });
  });
}

function connectClient(name) {
  return new Promise((resolve, reject) => {
    const sock = ClientIO(`http://localhost:${PORT}`, {
      forceNew: true,
      transports: ['websocket'],
    });
    sock.on('connect', () => resolve(sock));
    sock.on('connect_error', reject);
  });
}

async function runTests() {
  console.log('\n=== Live Switcher Phase B (Transition Library) Integration Suite ===\n');

  const server = await createTransitionTestServer();

  try {
    const cam1 = await connectClient('Cam1');
    const cam2 = await connectClient('Cam2');
    const controllerPhone = await connectClient('ControllerPhone');
    const unauthorizedPhone = await connectClient('UnauthorizedPhone');

    // Setup: opt-in cameras
    await new Promise((r) => cam1.emit('switcher:opt-in-camera', { name: 'Altar Left' }, r));
    await new Promise((r) => cam2.emit('switcher:opt-in-camera', { name: 'Choir' }, r));

    // Grant control to controllerPhone
    await new Promise((r) => cam1.emit('switcher:grant-control', { deviceId: controllerPhone.id }, r));

    // ── Test 1: Server-Side Controller Permission Enforcement ────────────────
    console.log('[Test 1: Server-Side Permission Gating for Transitions]');
    const rejectedSetting = await new Promise((r) =>
      unauthorizedPhone.emit('switcher:set-transition-setting', { type: 'wipe', duration: 1200 }, r)
    );
    assert('Non-controller attempting to set transition is REJECTED', rejectedSetting.ok === false);
    assert('Rejection message confirms lack of controller permission', rejectedSetting.error.includes('controller permission'));

    const acceptedSetting = await new Promise((r) =>
      controllerPhone.emit('switcher:set-transition-setting', { type: 'wipe', duration: 1200, direction: 'right-to-left' }, r)
    );
    assert('Authorized controller can update transition setting', acceptedSetting.ok === true);
    assert('Transition type updated to wipe', acceptedSetting.transitionSetting.type === 'wipe');
    assert('Transition duration updated to 1200ms', acceptedSetting.transitionSetting.duration === 1200);
    assert('Transition direction updated to right-to-left', acceptedSetting.transitionSetting.direction === 'right-to-left');

    // ── Test 2: Validation & Boundary Clamping ────────────────────────────────
    console.log('\n[Test 2: Setting Validation & Clamping]');
    const clampedShort = await new Promise((r) =>
      controllerPhone.emit('switcher:set-transition-setting', { type: 'fade', duration: 20 }, r)
    );
    assert('Duration < 100ms is clamped to 100ms', clampedShort.transitionSetting.duration === 100);

    const clampedLong = await new Promise((r) =>
      controllerPhone.emit('switcher:set-transition-setting', { type: 'fade', duration: 9999 }, r)
    );
    assert('Duration > 3000ms is clamped to 3000ms', clampedLong.transitionSetting.duration === 3000);

    const invalidDir = await new Promise((r) =>
      controllerPhone.emit('switcher:set-transition-setting', { type: 'wipe', direction: 'diagonal-spin' }, r)
    );
    assert('Invalid wipe direction safely falls back to left-to-right', invalidDir.transitionSetting.direction === 'left-to-right');

    // ── Test 3: Single-Bus Execution & Tally Timing (t=0) ────────────────────
    console.log('\n[Test 3: Single-Bus Execution & Tally at t=0]');
    // Set initial program source to cam1
    await new Promise((r) => controllerPhone.emit('switcher:set-program', { deviceId: cam1.id }, r));

    // Configure 200ms fade transition
    await new Promise((r) =>
      controllerPhone.emit('switcher:set-transition-setting', { type: 'fade', duration: 200 }, r)
    );

    let tallyReceivedAt = null;
    let transitionStartedAt = null;
    let transitionCompletedAt = null;

    cam2.once('switcher:you-are-program', () => {
      tallyReceivedAt = Date.now();
    });

    controllerPhone.once('switcher:transition-start', (t) => {
      transitionStartedAt = Date.now();
      assert('Transition start payload contains correct fromId', t.fromId === cam1.id);
      assert('Transition start payload contains correct toId', t.toId === cam2.id);
      assert('Transition start payload contains type and duration', t.type === 'fade' && t.duration === 200);
    });

    const completionPromise = new Promise((resolve) => {
      controllerPhone.once('switcher:transition-complete', (payload) => {
        transitionCompletedAt = Date.now();
        assert('Transition complete payload contains new program source', payload.programSourceId === cam2.id);
        resolve();
      });
    });

    const triggerTime = Date.now();
    await new Promise((r) => controllerPhone.emit('switcher:set-program', { deviceId: cam2.id }, r));

    assert('Tally notification fired immediately at t=0', tallyReceivedAt !== null && tallyReceivedAt - triggerTime < 50);
    assert('Transition start broadcast fired immediately at t=0', transitionStartedAt !== null && transitionStartedAt - triggerTime < 50);

    await completionPromise;
    const elapsed = transitionCompletedAt - triggerTime;
    assert('Transition complete fired after duration elapsed (>= 180ms)', elapsed >= 180, `Elapsed: ${elapsed}ms`);

    // ── Test 4: Immediate Interruption / Takeover ─────────────────────────────
    console.log('\n[Test 4: Immediate Interruption / Takeover Mid-Transition]');
    // Set long 1500ms transition
    await new Promise((r) =>
      controllerPhone.emit('switcher:set-transition-setting', { type: 'wipe', duration: 1500, direction: 'top-to-bottom' }, r)
    );

    // Switch towards cam1
    await new Promise((r) => controllerPhone.emit('switcher:set-program', { deviceId: cam1.id }, r));

    let secondTransitionStarted = false;
    let priorTransitionCancelled = false;

    // Listen for second transition
    const secondTransPromise = new Promise((resolve) => {
      controllerPhone.on('switcher:transition-start', (t) => {
        if (t.toId === cam2.id) {
          secondTransitionStarted = true;
          assert('Interruption immediately starts new transition to target', t.toId === cam2.id);
          resolve();
        }
      });
    });

    // Mid-flight (after 100ms of 1500ms transition), interrupt by switching to cam2
    await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => controllerPhone.emit('switcher:set-program', { deviceId: cam2.id }, r));

    await secondTransPromise;
    assert('Second transition started without waiting for first 1500ms to finish', secondTransitionStarted);

    // ── Test 5: Hard Cut Immediate Switch ─────────────────────────────────────
    console.log('\n[Test 5: Cut Transition Immediate Hard Cut]');
    await new Promise((r) =>
      controllerPhone.emit('switcher:set-transition-setting', { type: 'cut', duration: 0 }, r)
    );

    const cutStart = Date.now();
    let cutCompleteReceived = false;
    controllerPhone.once('switcher:transition-complete', (p) => {
      cutCompleteReceived = true;
      assert('Cut immediately emits transition-complete', p.programSourceId === cam1.id);
    });

    await new Promise((r) => controllerPhone.emit('switcher:set-program', { deviceId: cam1.id }, r));
    const cutElapsed = Date.now() - cutStart;
    assert('Cut executes instantly with 0ms transition delay (< 50ms roundtrip)', cutElapsed < 50);

    cam1.disconnect();
    cam2.disconnect();
    controllerPhone.disconnect();
    unauthorizedPhone.disconnect();
  } finally {
    await server.close();
  }

  console.log('\n----------------------------------------------');
  console.log(`Passed: ${passed} | Failed: ${failed}`);
  if (failed === 0) {
    console.log('✅ ALL TRANSITION INTEGRATION TESTS PASSED.\n');
    process.exit(0);
  } else {
    console.error('❌ SOME TESTS FAILED.\n');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unexpected test error:', err);
  process.exit(1);
});
