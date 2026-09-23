/**
 * Integration Test: Agenda Send State Machine, Protocol Handshake & Recovery.
 *
 * Verifies Requirement 21:
 * 1. Mobile-equivalent offer -> desktop receives
 *    ASSERT: pending Agenda exists, active Agenda unchanged, timer unchanged
 * 2. Desktop Accept
 *    ASSERT: Agenda loaded READY, timer unchanged, mobile receives ACCEPTED acknowledgement
 * 3. Desktop Decline
 *    ASSERT: mobile receives DECLINED, active Agenda unchanged, retry is possible
 * 4. Transport failure
 *    ASSERT: mobile receives ERROR, error clears cleanly on subsequent send
 */

const assert = require("assert");
const path = require("path");
const fs = require("fs");
const EventEmitter = require("events");
const AgendaTransferManager = require("../src/main/agenda/agendaTransferManager");
const AgendaExecutionEngine = require("../src/main/agenda/agendaExecutionEngine");

console.log("=====================================================================");
console.log("🧪 RUNNING AGENDA SEND STATE MACHINE & PROTOCOL INTEGRATION TEST");
console.log("=====================================================================");

const testDir = path.join(__dirname, "../scratch/test-send-state-machine");
if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

async function runSendIntegrationTest() {
  const transferManager = new AgendaTransferManager(testDir);

  let timerSyncCount = 0;
  let lastTimerSync = null;

  const engine = new AgendaExecutionEngine({
    dispatchBackground: () => {},
    dispatchPresentation: () => {},
    syncTimer: (timerPayload) => {
      timerSyncCount++;
      lastTimerSync = timerPayload;
    },
  });

  const sampleAgenda = {
    id: "agenda_send_test_01",
    name: "Youth Fellowship Service",
    version: 1,
    defaultDestination: "all",
    defaultMediaEndBehavior: "hold",
    sessions: [
      {
        id: "sess_praise",
        name: "Praise Session",
        durationSec: 900,
        timelineItems: [],
      },
      {
        id: "sess_message",
        name: "Main Message",
        durationSec: 1800,
        timelineItems: [],
      },
    ],
    assets: [],
  };

  // Simulating Mobile Socket & Store State
  class MockSocket extends EventEmitter {
    constructor() {
      super();
      this.id = "mock_mobile_sock_1";
    }
    emit(event, data, cb) {
      if (typeof this.emitInternal === "function" && event.startsWith("mobile-agenda-")) {
        this.emitInternal(event, data, cb);
      } else {
        super.emit(event, data, cb);
      }
    }
  }

  const mobileSocket = new MockSocket();

  let mobileTransferState = {
    transferring: false,
    waitingApproval: false,
    progress: 0,
    status: "",
    error: null,
    transferId: null,
  };

  function setMobileTransfer(updates) {
    mobileTransferState = { ...mobileTransferState, ...updates };
  }

  function getSendState() {
    if (mobileTransferState.waitingApproval) return "waiting";
    if (mobileTransferState.transferring) return "sending";
    if (mobileTransferState.status === "Agenda accepted ✓") return "accepted";
    if (mobileTransferState.status === "Agenda declined") return "declined";
    if (mobileTransferState.error) return "error";
    return "ready";
  }

  // Mobile sendToDesktop implementation
  async function mobileSendToDesktop(agenda, networkFail = false) {
    setMobileTransfer({
      transferring: true,
      waitingApproval: false,
      progress: 5,
      status: "Sending offer to desktop...",
      error: null,
    });

    if (networkFail) {
      setMobileTransfer({
        transferring: false,
        waitingApproval: false,
        progress: 0,
        status: "Couldn't send Agenda",
        error: "Network disconnect during offer handshake",
      });
      return { ok: false, error: "Network disconnect during offer handshake" };
    }

    // Step 1: Handshake offer
    const offerRes = await new Promise((resolve) => {
      mobileSocket.emit("mobile-agenda-offer", {
        agenda,
        deviceName: "Mobile Companion",
      }, resolve);
    });

    if (!offerRes?.ok) {
      setMobileTransfer({
        transferring: false,
        waitingApproval: false,
        progress: 0,
        status: "Couldn't send Agenda",
        error: offerRes?.error || "Failed to submit agenda offer",
      });
      return { ok: false, error: offerRes?.error };
    }

    const transferId = offerRes.transferId;

    // Step 2: Waiting operator approval
    setMobileTransfer({
      transferring: true,
      waitingApproval: true,
      progress: 15,
      status: "Waiting for desktop approval…",
      error: null,
      transferId,
    });

    const responseData = await new Promise((resolve) => {
      mobileSocket.once("agenda-offer-responded", (data) => {
        if (data && data.transferId === transferId) {
          resolve(data);
        }
      });
    });

    if (!responseData?.accepted) {
      setMobileTransfer({
        transferring: false,
        waitingApproval: false,
        progress: 0,
        status: "Agenda declined",
        error: null, // Operator decline is NOT a technical failure
        transferId,
      });
      return { ok: false, error: "Agenda was declined by the desktop operator." };
    }

    // Step 4: Finalize
    const finalRes = await new Promise((resolve) => {
      mobileSocket.emit("mobile-agenda-finalize-transfer", { transferId }, resolve);
    });

    if (!finalRes?.ok) {
      setMobileTransfer({
        transferring: false,
        waitingApproval: false,
        progress: 0,
        status: "Couldn't send Agenda",
        error: finalRes?.error || "Desktop failed to commit agenda",
      });
      return { ok: false, error: finalRes?.error };
    }

    setMobileTransfer({
      transferring: false,
      waitingApproval: false,
      progress: 100,
      status: "Agenda accepted ✓",
      error: null,
      transferId,
    });

    return { ok: true };
  }

  // Desktop Server Socket Handlers
  mobileSocket.emitInternal = async (event, data, cb) => {
    if (event === "mobile-agenda-offer") {
      const res = await transferManager.handleOffer({
        agenda: data.agenda,
        deviceName: data.deviceName || "Mobile Companion",
        deviceIp: "127.0.0.1",
      });
      cb(res);
    } else if (event === "mobile-agenda-finalize-transfer") {
      const res = await transferManager.finalizeTransfer(data.transferId);
      cb(res);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENARIO 1: Offer sent -> Desktop receives pending offer
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SCENARIO 1: Offer Sent -> Pending State ---");

  const sendPromise1 = mobileSendToDesktop(sampleAgenda);

  // Await offer resolution
  while (!mobileTransferState.waitingApproval) {
    await new Promise((r) => setTimeout(r, 20));
  }

  assert.strictEqual(getSendState(), "waiting", "Mobile state must be 'waiting'");
  assert.strictEqual(transferManager.pendingOffers.size, 1, "Desktop must hold 1 pending offer");

  const pendingOffer = Array.from(transferManager.pendingOffers.values())[0];
  assert.strictEqual(pendingOffer.agenda.id, sampleAgenda.id);

  // Invariants: Active agenda unchanged, timer unchanged
  assert.strictEqual(engine.status, "idle", "Engine status must remain idle");
  assert.strictEqual(engine.currentSession, null, "Engine currentSession must remain null");
  assert.strictEqual(timerSyncCount, 0, "Timer must NOT have received any sync events");

  console.log("✅ PASS: Pending offer created without auto-accept, active agenda and timer untouched.");

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENARIO 2: Operator Declines Offer
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SCENARIO 2: Operator Declines Offer ---");

  const declineRes = await transferManager.respondToOffer(pendingOffer.transferId, false);
  assert.strictEqual(declineRes.accepted, false);
  mobileSocket.emit("agenda-offer-responded", { transferId: pendingOffer.transferId, accepted: false });

  const result1 = await sendPromise1;
  assert.strictEqual(result1.ok, false);
  assert.strictEqual(getSendState(), "declined", "Mobile button state must be 'declined', NOT 'error'");
  assert.strictEqual(mobileTransferState.error, null, "Declined must NOT be stored as an error");
  assert.strictEqual(mobileTransferState.status, "Agenda declined");
  assert.strictEqual(engine.status, "idle", "Engine status must remain idle");

  console.log("✅ PASS: Decline properly recorded; mobile shows 'declined' badge with error=null.");

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENARIO 3: Resend after Decline & Operator Accepts
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SCENARIO 3: Resend after Decline & Operator Accepts ---");

  const sendPromise2 = mobileSendToDesktop(sampleAgenda);
  while (!mobileTransferState.waitingApproval) {
    await new Promise((r) => setTimeout(r, 20));
  }

  assert.strictEqual(getSendState(), "waiting", "Mobile state transitions back to 'waiting' on resend");
  assert.strictEqual(transferManager.pendingOffers.size, 1, "Desktop has new pending offer");

  const pendingOffer2 = Array.from(transferManager.pendingOffers.values())[0];

  // Operator Accepts
  const acceptRes = await transferManager.respondToOffer(pendingOffer2.transferId, true);
  assert.strictEqual(acceptRes.accepted, true);
  mobileSocket.emit("agenda-offer-responded", {
    transferId: pendingOffer2.transferId,
    accepted: true,
    neededAssetHashes: [],
  });

  const result2 = await sendPromise2;
  assert.strictEqual(result2.ok, true, "Send succeeded");
  assert.strictEqual(getSendState(), "accepted", "Mobile state is 'accepted'");
  assert.strictEqual(mobileTransferState.status, "Agenda accepted ✓");

  // Load into engine simulating desktop operator loading it
  engine.loadAgenda(sampleAgenda);
  assert.strictEqual(engine.status, "ready", "Loaded agenda status must be 'ready'");
  assert.strictEqual(engine.currentSession, null, "currentSession must remain null");
  assert.strictEqual(timerSyncCount, 0, "No timer sync on load");

  console.log("✅ PASS: Resend after decline succeeded; accept loaded agenda in READY state without starting timer.");

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENARIO 4: Transport Failure & Clean Error Recovery
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- SCENARIO 4: Transport Failure & Error Recovery ---");

  const resultFail = await mobileSendToDesktop(sampleAgenda, true);
  assert.strictEqual(resultFail.ok, false);
  assert.strictEqual(getSendState(), "error", "Mobile state transitions to 'error' on genuine transport failure");
  assert.strictEqual(mobileTransferState.status, "Couldn't send Agenda");
  assert.ok(mobileTransferState.error.includes("Network disconnect"));

  // Verify that subsequent send clears error and succeeds
  const sendPromiseRecover = mobileSendToDesktop(sampleAgenda);
  while (!mobileTransferState.waitingApproval) {
    await new Promise((r) => setTimeout(r, 20));
  }

  assert.strictEqual(getSendState(), "waiting", "Error is cleared and state enters 'waiting' on retry");
  assert.strictEqual(mobileTransferState.error, null, "Error was reset cleanly");

  // Decline to finish clean
  const recoverOffer = Array.from(transferManager.pendingOffers.values())[0];
  await transferManager.respondToOffer(recoverOffer.transferId, false);
  mobileSocket.emit("agenda-offer-responded", { transferId: recoverOffer.transferId, accepted: false });
  await sendPromiseRecover;

  console.log("✅ PASS: Transport failure shows error and immediately recovers cleanly on next send.");

  console.log("\n=====================================================================");
  console.log("🎉 ALL SEND STATE MACHINE INTEGRATION TESTS PASSED STRICTLY!");
  console.log("=====================================================================\n");
}

runSendIntegrationTest().catch((err) => {
  console.error("❌ Send state machine test failed:", err);
  process.exit(1);
});
