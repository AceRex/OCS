const assert = require('assert');
const path = require('path');
const fs = require('fs');
const AgendaExecutionEngine = require('../src/main/agenda/agendaExecutionEngine');
const { createEmptyAgenda, createEmptySession, createTimelineItem, migrateToUnifiedVisualTrack } = require('../src/main/agenda/agendaModel');

// Setup test media directory & dummy file
fs.mkdirSync('/tmp/test_media', { recursive: true });
fs.mkdirSync('/tmp/test_agenda_assets', { recursive: true });
fs.writeFileSync('/tmp/test_media/intro.mp4', 'dummy video content');

console.log('=== RUNNING TESTS: Visual Sequence & Session Recording ===');

// Mock recording and dispatch trackers
let recordingStarts = [];
let recordingStops = [];
let recordingPauses = 0;
let recordingResumes = 0;
let dispatchedBackgrounds = [];
let dispatchedPresentations = [];
let dispatchedAudios = [];
let timerSyncs = [];

function resetTrackers() {
  recordingStarts = [];
  recordingStops = [];
  recordingPauses = 0;
  recordingResumes = 0;
  dispatchedBackgrounds = [];
  dispatchedPresentations = [];
  dispatchedAudios = [];
  timerSyncs = [];
}

const mockOptions = {
  assetsDir: '/tmp/test_agenda_assets',
  mediaDir: '/tmp/test_media',
  startRecording: async (opts) => {
    recordingStarts.push(opts);
    return { ok: true, outputPath: `/tmp/recordings/${opts.sessionName}_test.mp4` };
  },
  stopRecording: async (opts) => {
    recordingStops.push(opts);
    return { ok: true, durationSec: 10, bytesWritten: 1024, framesRecorded: 300 };
  },
  pauseRecording: async () => {
    recordingPauses++;
    return { ok: true, isPaused: true };
  },
  resumeRecording: async () => {
    recordingResumes++;
    return { ok: true, isPaused: false };
  },
  dispatchBackground: (bg) => {
    dispatchedBackgrounds.push(bg);
  },
  dispatchPresentation: (pres) => {
    dispatchedPresentations.push(pres);
  },
  dispatchAudio: (aud) => {
    dispatchedAudios.push(aud);
  },
  syncTimer: (timer) => {
    timerSyncs.push(timer);
  },
};

async function runTests() {
  // TEST 1: Migration of legacy agenda to unified visual track
  console.log('\n--- Test 1: Legacy Agenda Migration to Unified Visual Track ---');
  const legacyAgenda = {
    id: 'leg_1',
    name: 'Legacy Sunday Service',
    sessions: [
      {
        id: 'sess_1',
        name: 'Worship',
        durationSec: 300,
        timelineItems: [
          { id: 'c1', track: 'background', name: 'Background A', startSec: 0, durationSec: 60, color: '#333333' },
          { id: 'c2', track: 'video', name: 'Sermon Video.mp4', startSec: 60, durationSec: 120, url: 'file:///video.mp4' },
          { id: 'c3', track: 'audio', name: 'Praise Track.mp3', startSec: 0, durationSec: 180, url: 'file:///praise.mp3' },
        ],
      },
    ],
  };

  const migrated = migrateToUnifiedVisualTrack(legacyAgenda);
  assert.strictEqual(migrated.sessions[0].recordSession, false, 'Default recordSession should be false');
  assert.strictEqual(migrated.sessions[0].timelineItems[0].track, 'visual', 'c1 track migrated to visual');
  assert.strictEqual(migrated.sessions[0].timelineItems[0].presentationMode, 'background', 'c1 mode is background');
  assert.strictEqual(migrated.sessions[0].timelineItems[1].track, 'visual', 'c2 track migrated to visual');
  assert.strictEqual(migrated.sessions[0].timelineItems[1].mediaType, 'video', 'c2 mediaType is video');
  assert.strictEqual(migrated.sessions[0].timelineItems[1].presentationMode, 'foreground', 'c2 mode is foreground');
  assert.strictEqual(migrated.sessions[0].timelineItems[2].track, 'audio', 'c3 remains audio track');
  console.log('✔ Migration test passed.');

  // TEST 2: Load-versus-Start Invariant
  console.log('\n--- Test 2: Load-versus-Start Invariant with Recording Option ---');
  resetTrackers();
  const engine = new AgendaExecutionEngine(mockOptions);

  const agendaDoc = createEmptyAgenda('Sunday Service');
  const session1 = createEmptySession('Welcome & Praise', 600);
  session1.recordSession = true; // Session recording enabled

  // Cues: Image A at 0s, Video at 60s, Image B at 120s
  session1.timelineItems = [
    createTimelineItem({
      id: 'cue_img_a',
      name: 'Welcome Slide',
      track: 'visual',
      mediaType: 'color',
      presentationMode: 'background',
      startSec: 0,
      durationSec: 60,
      color: '#112233',
    }),
    createTimelineItem({
      id: 'cue_vid',
      name: 'Intro Video.mp4',
      track: 'visual',
      mediaType: 'video',
      presentationMode: 'foreground',
      startSec: 60,
      durationSec: 60,
      url: 'file:///tmp/test_media/intro.mp4',
      color: '#2563EB',
    }),
    createTimelineItem({
      id: 'cue_img_b',
      name: 'Announcement Slide',
      track: 'visual',
      mediaType: 'color',
      presentationMode: 'background',
      startSec: 120,
      durationSec: 60,
      color: '#445566',
    }),
  ];
  agendaDoc.sessions = [session1];

  // Load agenda
  const loadRes = engine.loadAgenda(agendaDoc);
  assert.strictEqual(loadRes.status, 'idle', 'Load agenda should return state with status: idle');
  assert.strictEqual(engine.status, 'idle', 'Engine status must be idle (ready to start), NOT running');
  assert.strictEqual(engine.sessionElapsedSec, 0, 'Elapsed seconds must be 0');
  assert.strictEqual(recordingStarts.length, 0, 'Recorder must NOT start on load');
  assert.strictEqual(dispatchedBackgrounds.length, 0, 'No background cues should be dispatched on load');
  assert.strictEqual(dispatchedPresentations.length, 0, 'No presentation cues should be dispatched on load');
  console.log('✔ Load-versus-Start invariant strictly preserved (zero recordings, zero cues fired).');

  // TEST 3: Execution of Image A -> Video -> Image B Handover
  console.log('\n--- Test 3: Image A -> Video -> Image B Sequence Execution ---');
  // Start execution explicitly
  engine.start();
  await engine.sessionRecordingPromise;
  assert.strictEqual(engine.status, 'running', 'Engine should be running');
  assert.strictEqual(recordingStarts.length, 1, 'Recorder should start on explicit engine.start()');
  assert.strictEqual(recordingStarts[0].sessionName, 'Welcome & Praise', 'Recording should capture session name');

  // 00:00 cues fire on start: Image A
  assert.strictEqual(dispatchedBackgrounds.length, 1, 'Image A should dispatch to background');
  assert.strictEqual(dispatchedBackgrounds[0].color, '#112233');
  assert.strictEqual(engine.activeVisualCueId, 'cue_img_a');

  // Advance time to 60s: Video should start
  console.log('Advancing time to 60s (Video start)...');
  engine.sessionElapsedSec = 60;
  engine.evaluateCues();

  assert.strictEqual(dispatchedPresentations.length, 1, 'Video should dispatch to foreground presentation layer');
  assert.strictEqual(dispatchedPresentations[0].cueId, 'cue_vid');
  assert.strictEqual(engine.activeVisualCueId, 'cue_vid');

  // Advance time to 120s: Image B should start
  console.log('Advancing time to 120s (Image B start)...');
  engine.sessionElapsedSec = 120;
  engine.evaluateCues();

  // Handover verification:
  // 1. Video presentation layer must have been cleared so Image B is NOT occluded!
  const clearPres = dispatchedPresentations.filter(p => p.type === 'clear');
  assert.strictEqual(clearPres.length >= 1, true, 'Presentation layer must receive type: clear on Image B start');
  assert.strictEqual(clearPres[0].fromAgenda, true, 'Clear must indicate fromAgenda: true');

  // 2. Image B must be active on background
  assert.strictEqual(dispatchedBackgrounds.length, 2, 'Image B must be dispatched to background');
  assert.strictEqual(dispatchedBackgrounds[1].color, '#445566');
  assert.strictEqual(engine.activeVisualCueId, 'cue_img_b');

  // 3. Late callback test: Video cue completion should NOT clear Image B!
  console.log('Simulating late endCue for Video cue...');
  const vidCue = session1.timelineItems[1];
  engine.endCue(vidCue);
  assert.strictEqual(engine.currentBackgroundState.color, '#445566', 'Image B background must be preserved after late video endCue');
  assert.strictEqual(engine.activeVisualCueId, 'cue_img_b', 'Visual track must still be owned by cue_img_b');
  console.log('✔ Image A -> Video -> Image B sequence and handover verified successfully.');

  // TEST 4: Pause, Resume, Stop Recording Synchronization
  console.log('\n--- Test 4: Pause, Resume, Stop Recording Synchronization ---');
  engine.pause();
  assert.strictEqual(recordingPauses, 1, 'Pause should pause recording stream');

  engine.resume();
  assert.strictEqual(recordingResumes, 1, 'Resume should resume recording stream');

  engine.stop();
  await engine.sessionStopRecordingPromise;
  assert.strictEqual(recordingStops.length, 1, 'Stop should stop recording stream');
  assert.strictEqual(recordingStops[0].owner, 'agenda', 'Stop option owner must be agenda');
  console.log('✔ Recording lifecycle synchronization verified successfully.');

  // TEST 5: Manual Recording Conflict Protection
  console.log('\n--- Test 5: Manual Recording Conflict Protection ---');
  const manualConflictOptions = {
    ...mockOptions,
    startRecording: async () => {
      // Return already_recording as programRecorder does when manual recording is running
      return { ok: false, reason: 'already_recording', outputPath: '/tmp/recordings/manual_rec.mp4', owner: 'manual' };
    },
  };
  const engineWithConflict = new AgendaExecutionEngine(manualConflictOptions);
  engineWithConflict.loadAgenda(agendaDoc);
  await engineWithConflict.start();

  const state = engineWithConflict.getState();
  assert.strictEqual(state.recordingState.status, 'merged_manual', 'Status must report merged_manual without throwing error');
  console.log('✔ Manual recording conflict protection verified successfully.');

  console.log('\nALL 5 INTEGRATION SUITES PASSED CLEANLY!');
}

runTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
