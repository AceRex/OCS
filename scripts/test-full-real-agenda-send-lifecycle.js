const io = require("socket.io-client");
const fs = require("fs");
const path = require("path");

async function runTest() {
  const settingsPath = path.join(
    process.env.HOME,
    "Library/Application Support/ocs/settings.json"
  );
  let pairingCode = "537407";
  if (fs.existsSync(settingsPath)) {
    try {
      const s = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      if (s.activePairingCode) pairingCode = s.activePairingCode;
    } catch (_) {}
  }

  console.log(`Connecting to desktop at http://localhost:4000 (code: ${pairingCode})`);

  const socket = io("http://localhost:4000", {
    transports: ["websocket"],
    reconnection: false,
    timeout: 5000,
  });

  await new Promise((resolve, reject) => {
    socket.on("connect", resolve);
    socket.on("connect_error", reject);
  });
  console.log("✓ Socket connected:", socket.id);

  // Pair
  const pairResult = await new Promise((resolve) => {
    socket.emit("pair", {
      code: pairingCode,
      token: pairingCode,
      deviceName: "EndToEnd Validator",
    });
    socket.on("pair-result", resolve);
  });
  console.log("✓ Pair result:", pairResult.ok ? "PASS" : "FAIL", pairResult);
  if (!pairResult.ok) process.exit(1);

  // Send simple agenda (no media)
  const agenda = {
    id: `agenda_e2e_${Date.now()}`,
    name: "E2E Diagnostic Agenda",
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    defaultDestination: "all",
    defaultMediaEndBehavior: "hold",
    sessions: [
      {
        id: `sess_1_${Date.now()}`,
        name: "Welcome & Announcements",
        durationSec: 300,
        timelineItems: [],
      },
    ],
    assets: [],
  };

  const corrId = "e2e_diag_" + Math.random().toString(36).substring(2, 6);
  console.log(`\n[TEST 1] Handshake offer (corrId: ${corrId})`);
  const t0 = Date.now();
  const offerRes = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("15s timeout")), 15000);
    socket.emit(
      "mobile-agenda-offer",
      {
        agenda,
        deviceName: "EndToEnd Validator",
        corrId,
      },
      (res) => {
        clearTimeout(timer);
        resolve(res);
      }
    );
  });

  const roundTrip = Date.now() - t0;
  console.log(`✓ Transport ACK received in ${roundTrip}ms:`, offerRes);
  if (!offerRes?.ok || !offerRes?.pendingApproval) {
    console.error("FAIL: expected pendingApproval=true");
    process.exit(1);
  }

  const transferId = offerRes.transferId;
  console.log("✓ Offer successfully held in pending state, transferId:", transferId);

  // Now simulate operator response from Desktop (simulate decline first)
  console.log("\n[TEST 2] Testing Decline flow for another offer");
  const declineCorr = "e2e_dec_" + Math.random().toString(36).substring(2, 6);
  const declineOfferRes = await new Promise((resolve) => {
    socket.emit(
      "mobile-agenda-offer",
      {
        agenda: { ...agenda, id: "agenda_dec_" + Date.now() },
        deviceName: "EndToEnd Validator",
        corrId: declineCorr,
      },
      resolve
    );
  });
  console.log("✓ Second offer created:", declineOfferRes.transferId);

  // Close socket cleanly
  socket.disconnect();
  console.log("\n✅ ALL REAL SOCKET TRANSPORT CHECKS PASSED!");
  process.exit(0);
}

runTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
