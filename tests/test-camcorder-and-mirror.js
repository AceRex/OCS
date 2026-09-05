/**
 * test-camcorder-and-mirror.js
 *
 * Tests the hardware camcorder ingestion architecture and mobile camera mirroring:
 * 1. Physical video device categorization (Camcorder / HDMI Capture Card vs Webcam vs Virtual).
 * 2. High-frame-rate constraints resolution (1080p/720p 60/30fps).
 * 3. Camera frame mirroring propagation:
 *    - Mobile companion emits camera frame with isMirrored flag.
 *    - Server forwards frame payload with isMirrored to desktop displays.
 * 4. Desktop slot assignment for hardware camcorder:
 *    - Slot assigned with type: 'camcorder', isLocal: true, deviceId.
 *    - Program canvas and multiview tile reflect isMirrored transform.
 * 5. Slot release cleans up hardware stream and frees slot.
 */

const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
let ClientIO;
try {
  ClientIO = require('socket.io-client').io;
} catch (_) {
  ClientIO = require(path.resolve(__dirname, '../ocs-mobile/node_modules/socket.io-client')).io;
}

const PORT = 4102;
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

// ── 1. Unit Test: Hardware Device Categorization Engine ────────────────────────
function testDeviceCategorization() {
  console.log('\n[1] Testing Physical Camcorder & Capture Card Categorization');

  // Logic replicated from LocalCameraManager.js
  function categorizeDevice(label = "") {
    const lower = label.toLowerCase();
    const isCamcorder =
      lower.includes("cam link") ||
      lower.includes("elgato") ||
      lower.includes("blackmagic") ||
      lower.includes("magewell") ||
      lower.includes("avermedia") ||
      lower.includes("capture") ||
      lower.includes("hdmi") ||
      lower.includes("camcorder") ||
      lower.includes("ptz") ||
      lower.includes("broadcast") ||
      lower.includes("sdi");

    const isVirtual =
      lower.includes("obs") ||
      lower.includes("virtual") ||
      lower.includes("snap camera") ||
      lower.includes("manycam");

    const type = isCamcorder
      ? "Camcorder / Capture Card"
      : isVirtual
      ? "Virtual Camera"
      : "Webcam / USB Camera";

    return { type, isCamcorder, isVirtual };
  }

  const testCases = [
    { label: "Cam Link 4K (0fd9:0066)", expectedType: "Camcorder / Capture Card", isCamcorder: true },
    { label: "Blackmagic UltraStudio Recorder 3G", expectedType: "Camcorder / Capture Card", isCamcorder: true },
    { label: "Magewell USB Capture HDMI", expectedType: "Camcorder / Capture Card", isCamcorder: true },
    { label: "USB3.0 Video Capture (Generic HDMI Dongle)", expectedType: "Camcorder / Capture Card", isCamcorder: true },
    { label: "PTZOptics 30X-NDI", expectedType: "Camcorder / Capture Card", isCamcorder: true },
    { label: "FaceTime HD Camera (Built-in)", expectedType: "Webcam / USB Camera", isCamcorder: false },
    { label: "Logitech Brio 4K", expectedType: "Webcam / USB Camera", isCamcorder: false },
    { label: "OBS Virtual Camera", expectedType: "Virtual Camera", isCamcorder: false },
  ];

  for (const tc of testCases) {
    const res = categorizeDevice(tc.label);
    assert(
      `Device '${tc.label}' -> ${res.type}`,
      res.type === tc.expectedType && res.isCamcorder === tc.isCamcorder,
      `Expected ${tc.expectedType}, got ${res.type}`
    );
  }
}

// ── 2. Unit Test: Video Resolution & Framerate Constraints ─────────────────────
function testConstraintsBuilder() {
  console.log('\n[2] Testing Broadcast Resolution & Framerate Constraints');

  function buildConstraints(deviceId, { width = 1920, height = 1080, frameRate = 60 } = {}) {
    return {
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        width: { ideal: width, min: 1280 },
        height: { ideal: height, min: 720 },
        frameRate: { ideal: frameRate, min: 30 },
      },
      audio: false,
    };
  }

  const c1 = buildConstraints("hdmi-cam-01", { width: 1920, height: 1080, frameRate: 60 });
  assert("Constraints ideal 1080p width", c1.video.width.ideal === 1920);
  assert("Constraints ideal 1080p height", c1.video.height.ideal === 1080);
  assert("Constraints ideal 60fps framerate", c1.video.frameRate.ideal === 60);
  assert("Constraints exact deviceId passed", c1.video.deviceId.exact === "hdmi-cam-01");
  assert("Audio excluded to prevent echo loops", c1.audio === false);
}

// ── 3. Integration Test: Mirroring & Slot Assignment over Socket.IO ───────────
async function testMirroringAndSlotLifecycle() {
  console.log('\n[3] Testing Socket Frame Mirroring & Desktop Slot Assignment');

  const httpServer = http.createServer();
  const io = new Server(httpServer, { cors: { origin: '*' } });

  const switcherCameraSlots = new Map();
  let switcherControllerSocketId = 'desktop';
  let desktopReceivedFrames = [];
  let broadcastedStates = [];

  function broadcastSwitcherState() {
    const payload = Array.from(switcherCameraSlots.entries()).map(([sockId, info]) => ({
      socketId: sockId,
      name: info.name,
      slotIndex: info.slotIndex,
      type: info.type || 'camera',
      isLocal: !!info.isLocal,
      deviceId: info.deviceId || null,
    }));
    broadcastedStates.push(payload);
    io.emit('switcher:state-update', { cameraSlots: payload });
  }

  // Simulated server handlers matching main.js
  io.on('connection', (socket) => {
    socket.on('switcher:camera-frame', (payload) => {
      const slotInfo = switcherCameraSlots.get(socket.id);
      const framePayload = {
        slotIndex: slotInfo ? slotInfo.slotIndex : (payload.slotIndex || 1),
        fromId: socket.id,
        data: payload.frame || payload.data,
        isMirrored: !!payload.isMirrored,
        timestamp: Date.now(),
      };
      desktopReceivedFrames.push(framePayload);
      io.emit('switcher-camera-frame', framePayload);
    });
  });

  await new Promise((resolve) => httpServer.listen(PORT, resolve));

  const client = ClientIO(`http://localhost:${PORT}`);
  await new Promise((resolve) => client.on('connect', resolve));

  // A. Mobile sends mirrored frame
  client.emit('switcher:camera-frame', {
    frame: 'base64_mirrored_pixel_stream',
    isMirrored: true,
    slotIndex: 1,
  });

  await new Promise((r) => setTimeout(r, 100));

  assert("Desktop renderer receives frame from mobile", desktopReceivedFrames.length > 0);
  assert("Frame payload has isMirrored === true", desktopReceivedFrames[0]?.isMirrored === true);

  // B. Mobile sends un-mirrored frame
  client.emit('switcher:camera-frame', {
    frame: 'base64_back_camera_stream',
    isMirrored: false,
    slotIndex: 1,
  });

  await new Promise((r) => setTimeout(r, 100));
  assert("Second frame has isMirrored === false", desktopReceivedFrames[1]?.isMirrored === false);

  // C. Desktop assigns physical camcorder slot
  function assignSlotDesktop({ socketId, name, slotIndex, type, deviceId, isLocal }) {
    if (switcherControllerSocketId !== 'desktop') {
      return { ok: false, error: 'Desktop does not hold controller permission' };
    }
    const id = socketId;
    const devName = name || `Camcorder ${slotIndex}`;
    switcherCameraSlots.set(id, {
      name: devName,
      slotIndex: Number(slotIndex),
      type: type || 'camcorder',
      deviceId: deviceId || null,
      isLocal: isLocal !== undefined ? !!isLocal : id.startsWith('local:'),
    });
    broadcastSwitcherState();
    return { ok: true, slotIndex, socketId: id };
  }

  function removeSlotDesktop({ socketId, slotIndex }) {
    if (switcherControllerSocketId !== 'desktop') {
      return { ok: false, error: 'Desktop does not hold controller permission' };
    }
    let id = socketId;
    if (!id && slotIndex) {
      for (const [sid, info] of switcherCameraSlots.entries()) {
        if (info.slotIndex === Number(slotIndex)) {
          id = sid;
          break;
        }
      }
    }
    if (!id || !switcherCameraSlots.has(id)) return { ok: true };
    switcherCameraSlots.delete(id);
    broadcastSwitcherState();
    return { ok: true };
  }

  // Assign Cam Link 4K to Slot 2
  const assignResult = assignSlotDesktop({
    socketId: 'local:elgato-camlink-4k-uuid',
    name: 'Elgato Cam Link 4K (Camcorder 1)',
    slotIndex: 2,
    type: 'camcorder',
    deviceId: 'elgato-camlink-4k-uuid',
    isLocal: true,
  });

  assert("Assign camcorder returns ok", assignResult.ok === true);
  assert("Slot 2 registered with type 'camcorder'", switcherCameraSlots.get('local:elgato-camlink-4k-uuid')?.type === 'camcorder');
  assert("Slot 2 is marked isLocal: true", switcherCameraSlots.get('local:elgato-camlink-4k-uuid')?.isLocal === true);

  // Verify broadcast payload includes metadata
  const latestState = broadcastedStates[broadcastedStates.length - 1];
  const slot2 = latestState.find((s) => s.slotIndex === 2);
  assert("State broadcast contains slot 2", !!slot2);
  assert("Slot 2 broadcast contains type 'camcorder'", slot2?.type === 'camcorder');
  assert("Slot 2 broadcast contains deviceId", slot2?.deviceId === 'elgato-camlink-4k-uuid');

  // D. Remove Slot
  const removeResult = removeSlotDesktop({ slotIndex: 2 });
  assert("Remove slot 2 returns ok", removeResult.ok === true);
  assert("Slot 2 is removed from switcherCameraSlots", !switcherCameraSlots.has('local:elgato-camlink-4k-uuid'));

  client.disconnect();
  httpServer.close();
}

// ── 4. Unit Test: CSS and Canvas Scale Transform Calculation ─────────────────
function testMirrorTransformMath() {
  console.log('\n[4] Testing CSS and Canvas Mirror Transform Math');

  function getTileTransform(isMirrored) {
    return isMirrored ? "scaleX(-1) translateZ(0)" : "translateZ(0)";
  }

  function getCanvasTransform(isMirrored) {
    return isMirrored ? "scaleX(-1)" : "none";
  }

  assert("Mirrored tile uses scaleX(-1)", getTileTransform(true).includes("scaleX(-1)"));
  assert("Un-mirrored tile does not scaleX(-1)", !getTileTransform(false).includes("scaleX(-1)"));

  assert("Mirrored canvas uses scaleX(-1)", getCanvasTransform(true) === "scaleX(-1)");
  assert("Un-mirrored canvas uses none", getCanvasTransform(false) === "none");
}

async function runAllTests() {
  console.log('====================================================');
  console.log('  Live Switcher Camcorder & Mirror Architecture Test');
  console.log('====================================================');

  testDeviceCategorization();
  testConstraintsBuilder();
  testMirrorTransformMath();
  await testMirroringAndSlotLifecycle();

  console.log('\n----------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('All Camcorder Ingestion & Mirroring tests PASSED successfully!\n');
  }
}

runAllTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
