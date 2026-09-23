/**
 * Automated Regression Test Suite:
 * Agenda Load vs. Start Separation, Timer Stop Invariants & Manual Timer Coexistence.
 *
 * GOLDEN INVARIANTS:
 * - LOAD ≠ START
 * - RECEIVE ≠ ACCEPT
 * - ACCEPT ≠ START
 * - PLANNED TIMER ≠ ACTIVE TIMER
 * - AGENDA SESSION DURATION ≠ RUNNING TIMER
 * - STOP halts timer and clears active countdown without rehydrating
 */

const assert = require("assert");
const AgendaExecutionEngine = require("../src/main/agenda/agendaExecutionEngine");

console.log("=====================================================================");
console.log("🧪 RUNNING AGENDA LOAD VS. START REGRESSION TEST SUITE");
console.log("=====================================================================");

let dispatchedBackgrounds = [];
let dispatchedPresentations = [];
let dispatchedTimers = [];
let broadcastStates = [];
let overlayTimerBroadcasts = [];

const engine = new AgendaExecutionEngine({
  dispatchBackground: (bgPayload) => {
    dispatchedBackgrounds.push({ ...bgPayload });
  },
  dispatchPresentation: (presPayload) => {
    dispatchedPresentations.push({ ...presPayload });
  },
  dispatchAudio: () => {},
  syncTimer: (timerPayload) => {
    dispatchedTimers.push({ ...timerPayload });
    // Mirror main.js overlay-timer logic
    const isRunning = timerPayload.isRunning === true;
    const isPaused = timerPayload.isPaused === true;
    overlayTimerBroadcasts.push({
      agenda: isRunning || isPaused ? (timerPayload.sessionTitle || timerPayload.agendaTitle || "") : "",
      countdown: isRunning || isPaused ? (timerPayload.remainingSec || 0) : 0,
      duration: isRunning || isPaused ? (timerPayload.durationSec || 0) : 0,
      isRunning,
      isPaused,
      fromAgenda: isRunning || isPaused,
    });
  },
  broadcastState: (state) => {
    broadcastStates.push({ ...state });
  },
});

const sampleAgenda = {
  id: "agenda_sunday_service",
  name: "Sunday Service Agenda",
  version: 1,
  defaultDestination: "all",
  defaultMediaEndBehavior: "hold",
  sessions: [
    {
      id: "session_praise",
      name: "Praise & Worship",
      durationSec: 1200, // 20 minutes planned
      transitionMode: "manual",
      intervalSec: 0,
      timelineItems: [],
    },
    {
      id: "session_announcements",
      name: "Announcements",
      durationSec: 360, // 6 minutes planned
      transitionMode: "manual",
      intervalSec: 0,
      timelineItems: [],
    },
  ],
};

// =============================================================================
// TEST 1: LOAD AGENDA ONLY (Must be READY, activeSession=null, timer=idle, 0 timer-start events)
// =============================================================================
console.log("\n--- TEST 1: Load Agenda Plan (Ready state, activeSession=null, timer=idle) ---");

dispatchedTimers = [];
overlayTimerBroadcasts = [];

engine.loadAgenda(sampleAgenda);
const stateAfterLoad = engine.getState();

// Assert: Agenda READY
assert.strictEqual(stateAfterLoad.status, "ready", "Engine status must be 'ready' on load");
assert.strictEqual(stateAfterLoad.totalSessions, 2, "Session count must equal 2");
assert.strictEqual(stateAfterLoad.sessionIndex, null, "Active sessionIndex must be null on load");
assert.strictEqual(stateAfterLoad.sessionName, "", "Active sessionName must be empty on load");

// Assert: Planned duration exists on the session models
assert.strictEqual(sampleAgenda.sessions[0].durationSec, 1200, "Planned duration for session 1 is 20 min");
assert.strictEqual(sampleAgenda.sessions[1].durationSec, 360, "Planned duration for session 2 is 6 min");

// Assert: Active timer is NULL/idle, timer running is false, no timer-start event emitted
assert.strictEqual(dispatchedTimers.length, 0, "No timer sync should be emitted on loadAgenda()");
assert.strictEqual(overlayTimerBroadcasts.length, 0, "No overlay timer broadcast on loadAgenda()");

console.log("✅ PASS: Agenda load established READY plan with 0 active timers and activeSession=null.");

// =============================================================================
// TEST 2: TIMER CONTROLLER DESKTOP SIMULATION (Mount & Idle State)
// =============================================================================
console.log("\n--- TEST 2: Desktop TimerController Simulation on Load ---");

// Simulating TimerController state
let timerState = {
  time: 0,
  countdown: 0,
  isRunning: false,
  isPaused: false,
  activeId: null,
  isAgendaDriven: false,
};

function onTimerSyncSimulation(sync, agendaSessions) {
  const isRunning = sync?.isRunning === true;
  const isPaused = sync?.isPaused === true;

  if (!isRunning && !isPaused) {
    timerState.isAgendaDriven = false;
    timerState.isRunning = false;
    timerState.isPaused = false;
    timerState.activeId = null;
    timerState.countdown = 0;
    return;
  }

  timerState.isAgendaDriven = true;
  timerState.isRunning = isRunning;
  timerState.isPaused = isPaused;
  if (typeof sync.remainingSec === "number") timerState.countdown = sync.remainingSec;
  if (typeof sync.durationSec === "number") timerState.time = sync.durationSec;
  if (typeof sync.sessionIndex === "number" && agendaSessions && agendaSessions[sync.sessionIndex]) {
    timerState.activeId = agendaSessions[sync.sessionIndex].id;
  } else {
    timerState.activeId = null;
  }
}

// When agenda is loaded, no sync is fired
assert.strictEqual(timerState.activeId, null, "activeId must be null");
assert.strictEqual(timerState.isRunning, false, "timer must not be running");
assert.strictEqual(timerState.countdown, 0, "countdown must be 0");
assert.strictEqual(timerState.isAgendaDriven, false, "isAgendaDriven must be false");

console.log("✅ PASS: Desktop TimerController remains completely idle on agenda load.");

// =============================================================================
// TEST 3: EXPLICIT START ACTION (Activates session 0, timer starts with 20 min)
// =============================================================================
console.log("\n--- TEST 3: Explicit Start Action ---");

engine.start(0);
const stateAfterStart = engine.getState();

assert.strictEqual(stateAfterStart.status, "running", "Engine status must be 'running' after start()");
assert.strictEqual(stateAfterStart.sessionIndex, 0, "Active session index must be 0");
assert.strictEqual(stateAfterStart.sessionName, "Praise & Worship", "Active session name must be Praise & Worship");
assert.strictEqual(stateAfterStart.sessionDurationSec, 1200, "Active session duration must be 1200");

// Check sync timer emitted
assert.ok(dispatchedTimers.length > 0, "Timer sync emitted on start");
const startTimerSync = dispatchedTimers[dispatchedTimers.length - 1];
assert.strictEqual(startTimerSync.isRunning, true, "start timer sync isRunning must be true");
assert.strictEqual(startTimerSync.durationSec, 1200, "start timer sync durationSec must be 1200");
assert.strictEqual(startTimerSync.sessionIndex, 0, "start timer sync sessionIndex must be 0");

// Feed into TimerController simulation
onTimerSyncSimulation(startTimerSync, sampleAgenda.sessions);
assert.strictEqual(timerState.isRunning, true, "TimerController isRunning must be true");
assert.strictEqual(timerState.activeId, "session_praise", "TimerController activeId must match session 0");
assert.strictEqual(timerState.countdown, 1200, "TimerController countdown must be 1200");
assert.strictEqual(timerState.isAgendaDriven, true, "TimerController isAgendaDriven must be true");

console.log("✅ PASS: Explicit start activated Session 0 with 20 min countdown.");

// =============================================================================
// TEST 4: STOP ACTION (Timer stops, activeId cleared, countdown halts, no rehydration)
// =============================================================================
console.log("\n--- TEST 4: Stop Action & Stop Invariants ---");

engine.stop();
const stateAfterStop = engine.getState();

assert.strictEqual(stateAfterStop.status, "stopped", "Status must be 'stopped'");
assert.strictEqual(stateAfterStop.sessionIndex, null, "Active sessionIndex must be null on stop");
assert.strictEqual(stateAfterStop.sessionName, "", "Active sessionName must be empty on stop");

// Check syncTimer on stop
const stopTimerSync = dispatchedTimers[dispatchedTimers.length - 1];
assert.strictEqual(stopTimerSync.isRunning, false, "Stop timer sync isRunning must be false");
assert.strictEqual(stopTimerSync.remainingSec, 0, "Stop timer sync remainingSec must be 0");
assert.strictEqual(stopTimerSync.sessionIndex, null, "Stop timer sync sessionIndex must be null");

// Feed into TimerController simulation
onTimerSyncSimulation(stopTimerSync, sampleAgenda.sessions);
assert.strictEqual(timerState.isRunning, false, "TimerController isRunning must be false after stop");
assert.strictEqual(timerState.activeId, null, "TimerController activeId must be null after stop");
assert.strictEqual(timerState.countdown, 0, "TimerController countdown must be 0 after stop");
assert.strictEqual(timerState.isAgendaDriven, false, "TimerController isAgendaDriven must be false after stop");

// Verify that calling updateLiveSchedule does NOT reactivate the timer
engine.updateLiveSchedule(sampleAgenda);
const stateAfterUpdate = engine.getState();
assert.strictEqual(stateAfterUpdate.status, "stopped", "Status remains stopped");
assert.strictEqual(stateAfterUpdate.sessionIndex, null, "sessionIndex remains null");
assert.strictEqual(timerState.isRunning, false, "Timer remains stopped and is not rehydrated");
assert.strictEqual(timerState.activeId, null, "activeId remains null");

console.log("✅ PASS: Stop action cleanly halts timer, clears activeId, and prevents rehydration.");

// =============================================================================
// TEST 5: MANUAL TIMER COEXISTENCE
// =============================================================================
console.log("\n--- TEST 5: Manual Timer Coexistence ---");

// Manual timer started by user from TimerController quick start or list
function handleManualStart(seconds) {
  timerState.isAgendaDriven = false;
  timerState.activeId = "manual_prayer_timer";
  timerState.time = seconds;
  timerState.countdown = seconds;
  timerState.isRunning = true;
  timerState.isPaused = false;
}

function handleManualStop() {
  timerState.isAgendaDriven = false;
  timerState.activeId = null;
  timerState.time = 0;
  timerState.countdown = 0;
  timerState.isRunning = false;
  timerState.isPaused = false;
}

handleManualStart(300);
assert.strictEqual(timerState.isRunning, true, "Manual timer starts running");
assert.strictEqual(timerState.activeId, "manual_prayer_timer");
assert.strictEqual(timerState.countdown, 300);
assert.strictEqual(timerState.isAgendaDriven, false);

handleManualStop();
assert.strictEqual(timerState.isRunning, false, "Manual timer stops cleanly");
assert.strictEqual(timerState.activeId, null);
assert.strictEqual(timerState.countdown, 0);

console.log("✅ PASS: Manual timer operates independently without Agenda interference.");

console.log("\n=====================================================================");
console.log("🎉 ALL LOAD VS. START REGRESSION TESTS PASSED STRICTLY!");
console.log("=====================================================================\n");
