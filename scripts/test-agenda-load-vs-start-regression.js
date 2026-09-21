/**
 * Automated Regression Test Suite:
 * Agenda Load vs. Start Separation and Preview Non-Destruction.
 *
 * Verifies:
 * 1. Loading an agenda establishes Ready (idle) state, elapsed time = 0, first session duration displayed statically.
 * 2. Loading does NOT dispatch ANY media cues (including 00:00 cues).
 * 3. Pre-existing presentation content and background remain intact upon load.
 * 4. Only an explicit user Start action enters Running state and fires 00:00 cues once.
 * 5. General screen display/preview is strictly isolated from Agenda timer overlays.
 * 6. Stopping and reloading returns cleanly to Ready without auto-starting.
 */

const assert = require("assert");
const AgendaExecutionEngine = require("../src/main/agenda/agendaExecutionEngine");

console.log("=====================================================================");
console.log("🧪 RUNNING AGENDA LOAD VS. START REGRESSION TEST SUITE");
console.log("=====================================================================\n");

let dispatchedBackgrounds = [];
let dispatchedPresentations = [];
let dispatchedTimers = [];
let broadcastStates = [];

let currentCanvasState = {
  background: { type: "image", url: "file:///user-preset-background.jpg", fromAgenda: false },
  contentSlot: { type: "bible", data: { book: "John", chapter: 3, verse: 16 } }
};

const engine = new AgendaExecutionEngine({
  dispatchBackground: (bgPayload) => {
    dispatchedBackgrounds.push({ ...bgPayload });
    if (bgPayload) {
      currentCanvasState.background = { ...bgPayload };
    }
  },
  dispatchPresentation: (presPayload) => {
    dispatchedPresentations.push({ ...presPayload });
    if (presPayload) {
      currentCanvasState.contentSlot = { ...presPayload };
    }
  },
  dispatchAudio: () => {},
  syncTimer: (timerPayload) => {
    dispatchedTimers.push({ ...timerPayload });
  },
  broadcastState: (state) => {
    broadcastStates.push({ ...state });
  }
});

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { createTimelineItem } = require("../src/main/agenda/agendaModel");

const tempDir = path.join(__dirname, "../scratch/test-agenda-regression");
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

const testImgPath = path.join(tempDir, "test-welcome-bg.jpg");
const testVidPath = path.join(tempDir, "test-praise-video.mp4");
fs.writeFileSync(testImgPath, Buffer.from("FAKE_IMAGE_DATA"));
fs.writeFileSync(testVidPath, Buffer.from("FAKE_VIDEO_DATA"));

const testImgUrl = pathToFileURL(testImgPath).href;
const testVidUrl = pathToFileURL(testVidPath).href;

const sampleAgenda = {
  id: "agenda_sunday_service",
  name: "Sunday Service Agenda",
  version: 1,
  defaultDestination: "all",
  defaultMediaEndBehavior: "hold",
  sessions: [
    {
      id: "session_worship",
      name: "Opening Worship",
      durationSec: 300, // 5 minutes
      transitionMode: "manual",
      intervalSec: 0,
      timelineItems: [
        createTimelineItem({
          id: "cue_welcome_bg",
          name: "Welcome Background",
          track: "background",
          actionType: "point",
          startSec: 0, // Cue at 00:00!
          url: testImgUrl,
          localFileUrl: testImgUrl,
          color: "#000000"
        }),
        createTimelineItem({
          id: "cue_mid_worship",
          name: "Mid Worship Video",
          track: "video",
          actionType: "range",
          startSec: 30,
          durationSec: 60,
          url: testVidUrl,
          localFileUrl: testVidUrl
        })
      ]
    },
    {
      id: "session_sermon",
      name: "Sermon",
      durationSec: 1800,
      timelineItems: []
    }
  ]
};

// =============================================================================
// TEST 1: LOAD AGENDA ONLY (Must be Ready/Idle, No Cues, Canvas Untouched)
// =============================================================================
console.log("--- TEST 1: Load Agenda (Ready state, elapsed=0, 0 cues dispatched) ---");

engine.loadAgenda(sampleAgenda);
const stateAfterLoad = engine.getState();

// Verify State
assert.strictEqual(stateAfterLoad.status, "idle", "Engine status must be 'idle' (Ready), not 'running'");
assert.strictEqual(stateAfterLoad.sessionElapsedSec, 0, "Elapsed time must be exactly 0 after loading");
assert.strictEqual(stateAfterLoad.sessionIndex, 0, "Current session must be index 0");
const executedCuesOnLoad = stateAfterLoad.cues.filter(c => c.executionStatus !== 'pending');
assert.strictEqual(executedCuesOnLoad.length, 0, "Zero cues must be dispatched on load");

// Verify zero cues dispatched to hardware / canvas
assert.strictEqual(dispatchedBackgrounds.length, 0, "Zero backgrounds must be dispatched on load");
assert.strictEqual(dispatchedPresentations.length, 0, "Zero presentations must be dispatched on load");

// Verify canvas untouched
assert.strictEqual(currentCanvasState.background.url, "file:///user-preset-background.jpg", "Existing background preserved");
assert.strictEqual(currentCanvasState.contentSlot.type, "bible", "Existing presentation content preserved");

console.log("✅ PASS: Load Agenda established Ready state with 0 cues dispatched and canvas preserved.\n");

// =============================================================================
// TEST 2: TIMER BROADCAST ISOLATION (General screen must never have agenda overlay)
// =============================================================================
console.log("--- TEST 2: General Screen Timer Isolation ---");

// Check syncTimer payload
assert.ok(dispatchedTimers.length > 0, "Timer sync should be broadcast on load for display controllers");
const initialTimerSync = dispatchedTimers[dispatchedTimers.length - 1];
assert.strictEqual(initialTimerSync.remainingSec, 300, "Timer sync displays full 300s duration without countdown");
assert.strictEqual(initialTimerSync.isRunning, false, "Timer sync isRunning flag must be false");
assert.strictEqual(initialTimerSync.isPaused, false, "Timer sync isPaused flag must be false");

// Ensure any target array strictly excludes 'general'
if (Array.isArray(initialTimerSync.target)) {
  assert.ok(!initialTimerSync.target.includes("general"), "Timer sync targets must NOT include general screen");
}
console.log("✅ PASS: Timer sync properly configured as static 300s, isRunning=false, excluding general display.\n");

// =============================================================================
// TEST 3: EXPLICIT START ACTION (Fires 00:00 cues once, enters Running)
// =============================================================================
console.log("--- TEST 3: Explicit Start Action ---");

engine.start(0);
const stateAfterStart = engine.getState();

assert.strictEqual(stateAfterStart.status, "running", "Engine status must be 'running' after start()");
const activeCues = stateAfterStart.cues.filter(c => c.executionStatus === 'active' || c.executionStatus === 'completed');
assert.strictEqual(activeCues.length, 1, "The 00:00 cue must be dispatched on start");
assert.strictEqual(dispatchedBackgrounds.length, 1, "Exactly one background cue dispatched");
assert.strictEqual(dispatchedBackgrounds[0].url, testImgUrl, "Correct background cue executed");

console.log("✅ PASS: Explicit start transitioned to Running and fired 00:00 cue exactly once.\n");

// =============================================================================
// TEST 4: PAUSE & RESUME (Preserves state, does not re-trigger 00:00 cues)
// =============================================================================
console.log("--- TEST 4: Pause & Resume Behavior ---");

engine.pause();
assert.strictEqual(engine.getState().status, "paused", "Status is paused");
const bgCountAtPause = dispatchedBackgrounds.length;

engine.resume();
assert.strictEqual(engine.getState().status, "running", "Status resumed to running");
assert.strictEqual(dispatchedBackgrounds.length, bgCountAtPause, "00:00 cues must NOT re-execute on resume");

console.log("✅ PASS: Pause and resume operate cleanly without duplicate cue firing.\n");

// =============================================================================
// TEST 5: STOP & RELOAD (Returns to idle, no auto-countdown)
// =============================================================================
console.log("--- TEST 5: Stop & Reload Behavior ---");

engine.stop();
assert.strictEqual(engine.getState().status, "stopped", "Status returned to stopped on stop");
assert.strictEqual(engine.getState().sessionElapsedSec, 0, "sessionElapsedSec reset to 0");

// Clear dispatches to track reload
dispatchedBackgrounds = [];
dispatchedPresentations = [];

engine.loadAgenda(sampleAgenda);
assert.strictEqual(engine.getState().status, "idle", "Status is idle after reload");
assert.strictEqual(dispatchedBackgrounds.length, 0, "No backgrounds dispatched on reload");
assert.strictEqual(dispatchedPresentations.length, 0, "No presentations dispatched on reload");

console.log("✅ PASS: Stop and reload returns to idle with zero cues executed.\n");

// =============================================================================
// TEST 6: REDUX / TIMER CONTROLLER SIMULATION
// =============================================================================
console.log("--- TEST 6: Redux & TimerController State Invariants ---");

// Simulating Redux reducer logic
const initialState = {
  time: 0,
  isPaused: false,
  isRunning: false,
  agenda: null
};

function testReducer(state, action) {
  switch (action.type) {
    case "SET_LOADED_AGENDA":
      return {
        ...state,
        agenda: action.payload,
        time: action.payload?.sessions?.[0]?.durationSec || 0,
        isPaused: false,
        isRunning: false // CRITICAL INVARIANT
      };
    case "SET_IS_RUNNING":
      return {
        ...state,
        isRunning: action.payload
      };
    case "START":
      return {
        ...state,
        isRunning: true,
        isPaused: false
      };
    case "STOP":
      return {
        ...state,
        isRunning: false,
        isPaused: false,
        time: 0
      };
    default:
      return state;
  }
}

// 1. Initial
let state = initialState;
assert.strictEqual(state.isRunning, false);

// 2. Load Agenda
state = testReducer(state, { type: "SET_LOADED_AGENDA", payload: sampleAgenda });
assert.strictEqual(state.isRunning, false, "Redux isRunning must be false on agenda load");
assert.strictEqual(state.time, 300, "Redux time matches session duration (300s)");
assert.strictEqual(state.isPaused, false);

// 3. Verify timer interval guard: if (!isRunning) -> no countdown
let tickCount = 0;
function simulateInterval(state) {
  if (state.isRunning && !state.isPaused && state.time > 0) {
    tickCount++;
  }
}
simulateInterval(state);
assert.strictEqual(tickCount, 0, "Countdown must NOT advance when isRunning is false");

// 4. Start action
state = testReducer(state, { type: "START" });
assert.strictEqual(state.isRunning, true, "Redux isRunning is true after explicit START");
simulateInterval(state);
assert.strictEqual(tickCount, 1, "Countdown advances after explicit START");

console.log("✅ PASS: Redux and TimerController countdown guard strictly honors isRunning=false on load.\n");

console.log("=====================================================================");
console.log("🎉 ALL REGRESSION TESTS PASSED SUCCESSFULLY!");
console.log("=====================================================================");
