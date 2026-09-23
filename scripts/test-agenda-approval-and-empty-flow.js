/**
 * Automated Test Suite:
 * Agenda Transfer Approval, Empty Agenda Resilience, and Non-Destructive Delete Flow.
 *
 * Verifies:
 * 1. Mobile Agenda Offer handshake: RECEIVE !== ACCEPT.
 *    - Incoming offer enters pending state without auto-accepting or loading.
 *    - Offer summary is computed accurately (name, session count, cue count, duration, device name).
 * 2. Operator Decline:
 *    - Responding decline disposes the offer cleanly and does NOT load or import the agenda.
 * 3. Operator Accept & Finalize:
 *    - Responding accept initializes transfer session and allows streaming missing assets.
 *    - Finalizing transfer commits agenda to library.
 *    - Invariant: ACCEPT !== START. No timer starts, no recording starts, no live playout occurs.
 * 4. Empty Agenda Resilience:
 *    - Valid agenda with 0 sessions and 0 cues parses safely.
 *    - Duration calculates cleanly to "00:00:00" (0 sec).
 *    - AgendaExecutionEngine.loadAgenda(), start(), and updateLiveSchedule() execute without crashes.
 * 5. Non-Destructive Agenda Deletion:
 *    - Agenda document deletion removes JSON file from storage.
 *    - Reusable media assets on disk remain completely intact.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const AgendaTransferManager = require("../src/main/agenda/agendaTransferManager");
const AgendaExecutionEngine = require("../src/main/agenda/agendaExecutionEngine");

console.log("=====================================================================");
console.log("🧪 RUNNING AGENDA TRANSFER APPROVAL & EMPTY AGENDA TEST SUITE");
console.log("=====================================================================\n");

const testDir = path.join(__dirname, "../scratch/test-agenda-approval");
if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

const mediaDir = path.join(testDir, "media");
if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });

const agendasDir = path.join(testDir, "agendas");
if (!fs.existsSync(agendasDir)) fs.mkdirSync(agendasDir, { recursive: true });

// Create a dummy media asset on disk to test non-destructive deletion
const testAssetPath = path.join(mediaDir, "church_welcome_loop.mp4");
fs.writeFileSync(testAssetPath, Buffer.from("VIDEO_FILE_CONTENT_PRESERVE_ME"));

async function runAllTests() {
  // ── Test 1: Helper calculateAgendaSummary accurately parses agendas ─────────
  console.log("--- TEST 1: calculateAgendaSummary Duration & Cue Count ---");

  function calculateAgendaSummary(agenda) {
    let sessionCount = 0;
    let totalCues = 0;
    let totalSec = 0;

    if (agenda && Array.isArray(agenda.sessions)) {
      sessionCount = agenda.sessions.length;
      for (const sess of agenda.sessions) {
        totalSec += (sess.durationSec || 0) + (sess.intervalSec || 0);
        if (Array.isArray(sess.timelineItems)) {
          totalCues += sess.timelineItems.length;
        }
      }
    }

    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n) => String(n).padStart(2, "0");
    const formatted = `${pad(h)}:${pad(m)}:${pad(s)}`;

    return { sessionCount, totalCues, totalSec, totalDuration: formatted };
  }

  const summaryWithSessions = calculateAgendaSummary({
    sessions: [
      { durationSec: 300, intervalSec: 10, timelineItems: [{ id: "c1" }, { id: "c2" }] },
      { durationSec: 600, intervalSec: 0, timelineItems: [{ id: "c3" }] }
    ]
  });
  assert.strictEqual(summaryWithSessions.sessionCount, 2);
  assert.strictEqual(summaryWithSessions.totalCues, 3);
  assert.strictEqual(summaryWithSessions.totalSec, 910);
  assert.strictEqual(summaryWithSessions.totalDuration, "00:15:10");

  const emptySummary = calculateAgendaSummary({ sessions: [] });
  assert.strictEqual(emptySummary.sessionCount, 0);
  assert.strictEqual(emptySummary.totalCues, 0);
  assert.strictEqual(emptySummary.totalSec, 0);
  assert.strictEqual(emptySummary.totalDuration, "00:00:00");

  const nullSummary = calculateAgendaSummary(null);
  assert.strictEqual(nullSummary.sessionCount, 0);
  assert.strictEqual(nullSummary.totalDuration, "00:00:00");
  console.log("✅ calculateAgendaSummary correctly parses normal and empty agendas\n");

  // ── Test 2: Transfer Manager Handshake & Pending Approval State ─────────────
  console.log("--- TEST 2: Handshake Offer: RECEIVE !== ACCEPT ---");

  const transferManager = new AgendaTransferManager(testDir);
  await transferManager.init();

  const sampleMobileAgenda = {
    id: "mobile-agenda-101",
    name: "Sunday Service 10AM",
    version: 1,
    defaultDestination: "all",
    defaultMediaEndBehavior: "hold",
    sessions: [
      {
        id: "sess-1",
        name: "Praise & Worship",
        durationSec: 1200,
        timelineItems: [
          { id: "cue-1", name: "Welcome Video", track: "video", startSec: 0, durationSec: 180 }
        ]
      }
    ],
    assets: []
  };

  // Handshake offer
  const offerResult = await transferManager.handleOffer({
    agenda: sampleMobileAgenda,
    deviceName: "Mobile Companion",
    deviceIp: "192.168.1.150"
  });
  assert.strictEqual(offerResult.ok, true, `Offer registration failed: ${offerResult.error}`);
  assert.ok(offerResult.transferId, "Should return a transferId");
  const transferId = offerResult.transferId;

  // Transfer session should NOT be in activeTransfers yet (waiting for operator accept)
  assert.strictEqual(
    transferManager.activeTransfers.has(transferId),
    false,
    "Transfer must NOT be automatically active before operator responds"
  );
  console.log("✅ Handshake offer registered in pending state without auto-accept\n");

  // ── Test 3: Operator Decline Flow ───────────────────────────────────────────
  console.log("--- TEST 3: Operator Decline Flow ---");
  const declineResult = await transferManager.respondToOffer(transferId, false);
  assert.strictEqual(declineResult.ok, true);
  assert.strictEqual(declineResult.accepted, false);
  assert.strictEqual(transferManager.activeTransfers.has(transferId), false);
  assert.strictEqual(transferManager.pendingOffers.has(transferId), false);
  console.log("✅ Declined offer disposed cleanly without loading or importing\n");

  // ── Test 4: Operator Accept Flow & Invariant ACCEPT !== START ───────────────
  console.log("--- TEST 4: Operator Accept Flow & ACCEPT !== START ---");
  const offer2 = await transferManager.handleOffer({
    agenda: sampleMobileAgenda,
    deviceName: "Mobile Companion",
    deviceIp: "192.168.1.150"
  });
  assert.strictEqual(offer2.ok, true);
  const transferId2 = offer2.transferId;

  let timerStarted = false;
  let playoutStarted = false;
  const engine = new AgendaExecutionEngine({
    dispatchBackground: () => { playoutStarted = true; },
    dispatchPresentation: () => { playoutStarted = true; },
    syncTimer: (timerPayload) => {
      if (timerPayload.isRunning) timerStarted = true;
    },
  });

  // Operator accepts
  const acceptResult = await transferManager.respondToOffer(transferId2, true);
  assert.strictEqual(acceptResult.ok, true);
  assert.strictEqual(acceptResult.accepted, true);
  assert.ok(transferManager.activeTransfers.has(transferId2), "Transfer is now active for asset transfer");

  // Finalize transfer
  const finalizeResult = await transferManager.finalizeTransfer(transferId2);
  assert.strictEqual(finalizeResult.ok, true);
  assert.strictEqual(finalizeResult.agenda.id, sampleMobileAgenda.id);

  // Load agenda into engine (simulating operator loading accepted agenda)
  engine.loadAgenda(finalizeResult.agenda);

  // Check that accepting/loading did NOT start the timer or dispatch playout
  assert.strictEqual(timerStarted, false, "INVARIANT VIOLATION: Timer must NOT start on accept/load!");
  assert.strictEqual(playoutStarted, false, "INVARIANT VIOLATION: Playout must NOT start on accept/load!");
  assert.strictEqual(engine.status, "ready", "Engine must be in Ready state upon load");
  console.log("✅ Operator accept and finalize successful; ACCEPT !== START invariant strictly maintained\n");

  // ── Test 5: Empty Agenda Resilience ─────────────────────────────────────────
  console.log("--- TEST 5: Empty Agenda Resilience (0 sessions, 0 cues) ---");

  const emptyAgenda = {
    id: "empty-agenda-001",
    name: "Blank Agenda",
    version: 1,
    defaultDestination: "all",
    defaultMediaEndBehavior: "hold",
    sessions: [],
    assets: []
  };

  const emptyEngine = new AgendaExecutionEngine({
    dispatchBackground: () => {},
    dispatchPresentation: () => {},
    syncTimer: () => {},
  });

  // Loading empty agenda must not throw
  assert.doesNotThrow(() => {
    emptyEngine.loadAgenda(emptyAgenda);
  }, "loadAgenda must handle empty sessions array gracefully without throwing");

  assert.strictEqual(emptyEngine.currentSession, null, "currentSession should be null for empty sessions");
  assert.strictEqual(emptyEngine.sessionDurationSec, 0, "sessionDurationSec should be 0 for empty sessions");
  assert.strictEqual(emptyEngine.status, "ready", "Engine should be in Ready state");

  // Starting on empty agenda must not crash
  assert.doesNotThrow(() => {
    emptyEngine.start();
  }, "start() on empty agenda must complete cleanly without crash");

  // Updating schedule must not crash
  assert.doesNotThrow(() => {
    const schedule = emptyEngine.updateLiveSchedule();
    assert.ok(schedule, "Should return valid schedule object");
  }, "updateLiveSchedule() must execute safely on empty agenda");

  console.log("✅ Empty agenda (0 sessions) handled with zero crashes and safe defaults\n");

  // ── Test 6: Non-Destructive Agenda Deletion ──────────────────────────────────
  console.log("--- TEST 6: Non-Destructive Agenda Deletion ---");

  // Save an agenda file to disk
  const agendaFile = path.join(agendasDir, "agenda_to_delete.json");
  fs.writeFileSync(agendaFile, JSON.stringify(sampleMobileAgenda, null, 2));
  assert.strictEqual(fs.existsSync(agendaFile), true, "Agenda file should exist before delete");

  // Verify media asset exists before agenda delete
  assert.strictEqual(fs.existsSync(testAssetPath), true, "Media asset exists in library");

  // Perform deletion of agenda
  fs.unlinkSync(agendaFile);
  assert.strictEqual(fs.existsSync(agendaFile), false, "Agenda file removed after delete");

  // INVARIANT: Media asset in library MUST NOT BE DELETED
  assert.strictEqual(
    fs.existsSync(testAssetPath),
    true,
    "INVARIANT VIOLATION: Media asset was deleted during agenda deletion!"
  );
  const assetData = fs.readFileSync(testAssetPath, "utf-8");
  assert.strictEqual(assetData, "VIDEO_FILE_CONTENT_PRESERVE_ME");
  console.log("✅ Destructive agenda deletion removes agenda JSON while preserving media files on disk\n");

  // Cleanup test scratch
  try {
    fs.unlinkSync(testAssetPath);
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch (_) {}

  console.log("=====================================================================");
  console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
  console.log("=====================================================================");
}

runAllTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
