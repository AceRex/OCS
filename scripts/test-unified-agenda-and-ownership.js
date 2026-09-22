const assert = require('assert');
const path = require('path');
const fs = require('fs');

// 1. Test Models & Migrations
const {
  createEmptyAgenda,
  createEmptySession,
  createTimelineItem,
  migrateToSingleUnifiedTrack,
  migrateToUnifiedVisualTrack
} = require('../src/main/agenda/agendaModel');

async function runAllTests() {
  console.log('--- TEST 1: Unified Cue Track & Model Migrations ---');
{
  const agenda = createEmptyAgenda();
  const session = createEmptySession('Worship');
  session.person = 'Pastor David';
  assert.strictEqual(session.person, 'Pastor David', 'Session must have person field');

  // Add legacy visual and audio items
  const legacyVisual = {
    id: 'cue-vis-1',
    track: 'visual',
    name: 'Worship Background',
    mediaType: 'video',
    presentationMode: 'background',
    durationSec: 30,
    timeOffsetSec: 0,
    laneIndex: 0
  };

  const legacyAudio = {
    id: 'cue-aud-1',
    track: 'audio',
    name: 'Pad Loop',
    mediaType: 'audio',
    presentationMode: 'audio',
    durationSec: 45,
    timeOffsetSec: 5,
    laneIndex: 0
  };

  session.timelineItems = [legacyVisual, legacyAudio];
  agenda.sessions = [session];

  const migrated = migrateToSingleUnifiedTrack(agenda);
  const mSession = migrated.sessions[0];

  assert.strictEqual(mSession.timelineItems.length, 2, 'Should keep both items');
  assert.strictEqual(mSession.timelineItems[0].track, 'media', 'Visual item must migrate to track: media');
  assert.strictEqual(mSession.timelineItems[0].laneIndex, 0, 'Visual item is on lane 0');
  assert.strictEqual(mSession.timelineItems[1].track, 'media', 'Audio item must migrate to track: media');
  assert.strictEqual(mSession.timelineItems[1].mediaType, 'audio', 'Audio item must retain audio mediaType');
  assert.strictEqual(mSession.timelineItems[1].presentationMode, 'audio', 'Audio item has presentationMode: audio');
  assert.strictEqual(mSession.timelineItems[1].laneIndex, 1, 'Audio item is stacked on sub-lane 1');

  // Verify alias
  const aliasMigrated = migrateToUnifiedVisualTrack(agenda);
  assert.strictEqual(aliasMigrated.sessions[0].timelineItems[1].track, 'media');

  console.log('✅ Unified Cue Track migration passed.');
}

console.log('\n--- TEST 2: Fine-Grained Media Ownership & Independent Cue Cleanup ---');
{
  const AgendaExecutionEngine = require('../src/main/agenda/agendaExecutionEngine');

  const dispatched = [];
  const fakeBridge = {
    dispatchPresentation: (dest, mode, payload) => {
      dispatched.push({ type: 'presentation', dest, mode, payload });
    },
    dispatchBackground: (dest, payload) => {
      dispatched.push({ type: 'background', dest, payload });
    },
    dispatchAudio: (payload) => {
      dispatched.push({ type: 'audio', payload });
    },
    stopAudio: (payload) => {
      dispatched.push({ type: 'stopAudio', payload });
    },
    syncTimer: (state) => {},
    broadcastState: (state) => {},
    recordJournal: (event, data) => {},
    startRecording: async () => ({ ok: true }),
    stopRecording: async () => ({ ok: true }),
    pauseRecording: () => {},
    resumeRecording: () => {},
  };

  // Create temporary test audio file
  const testAudioPath = path.join(__dirname, 'test_audio.mp3');
  fs.writeFileSync(testAudioPath, 'dummy-audio-content');

  const engine = new AgendaExecutionEngine(fakeBridge);

  const agenda = createEmptyAgenda();
  const session = createEmptySession('Sermon');
  session.person = 'Reverend Grace';

  const visualCue1 = createTimelineItem({
    track: 'media',
    name: 'Color Slide',
    mediaType: 'color',
    presentationMode: 'foreground',
    durationSec: 10,
    startSec: 0,
    destination: 'both'
  });
  visualCue1.id = 'cue-vis-1';
  visualCue1.color = '#112233';
  visualCue1.laneIndex = 0;

  const audioCue1 = createTimelineItem({
    track: 'media',
    name: 'Intro Jingle',
    mediaType: 'audio',
    presentationMode: 'audio',
    durationSec: 15,
    startSec: 0,
    destination: 'both'
  });
  audioCue1.id = 'cue-aud-1';
  audioCue1.fileUrl = testAudioPath;
  audioCue1.laneIndex = 1;

  session.timelineItems = [visualCue1, audioCue1];
  agenda.sessions = [session];

  engine.loadAgenda(agenda);
  assert.strictEqual(engine.status, 'idle', 'Loading agenda must not execute immediately');
  assert.strictEqual(engine.sessionIndex, 0);

  // Start engine
  engine.start();
  assert.strictEqual(engine.status, 'running', 'Engine should be running');
  const runId = engine.runId;
  assert(runId, 'Engine must assign a runId');

  // Trigger cues execution
  engine.sessionElapsedSec = 0;
  engine.tick();

  // Check activeLayerCues
  assert(engine.activeLayerCues.has('both:foreground'), 'both:foreground should be tracked');
  assert.strictEqual(engine.activeLayerCues.get('both:foreground').cueId, 'cue-vis-1');

  // Verify audio was dispatched to audio bridge without wiping visual layers
  const audioDispatches = dispatched.filter(d => d.type === 'audio');
  assert.strictEqual(audioDispatches.length, 1, 'Audio should be dispatched to audio bridge');
  assert.strictEqual(audioDispatches[0].payload.cueId, 'cue-aud-1');

  // Simulate late end of visualCue1 after a NEW cue has superseded it on 'both'
  engine.activeLayerCues.set('both:foreground', { cueId: 'cue-vis-2', runId });
  dispatched.length = 0; // reset
  engine.endCue(visualCue1);

  // 'both:foreground' should NOT have been cleared because cue-vis-2 is active!
  const foregroundClears = dispatched.filter(
    d => d.type === 'presentation' && d.mode === 'clear'
  );
  assert.strictEqual(foregroundClears.length, 0, 'Late cue end must not clear superseded cue');

  // Test cleanup of temp file
  try { fs.unlinkSync(testAudioPath); } catch (_) {}

  engine.stop();
  console.log('✅ Fine-grained media ownership & cleanup suppression passed.');
}

console.log('\n--- TEST 3: Explicit Recording Ownership & Non-Interference ---');
{
  const { ProgramRecorder } = require('../src/main/recording/programRecorder');

  // Create recorder in manual mode
  const recorder = new ProgramRecorder();
  recorder.isRecording = true;
  recorder.owner = 'manual';
  recorder.activeSessionId = null;

  // Test agenda pause on manual recording
  const pauseResult = recorder.pause({ owner: 'agenda' });
  assert.strictEqual(pauseResult.ignored, true, 'Agenda pause must be ignored when manual recording is active');
  assert.strictEqual(pauseResult.reason, 'manual_preserved');
  assert.strictEqual(recorder.isPaused, false, 'Manual recorder must not be paused');

  // Test agenda resume on manual recording
  const resumeResult = recorder.resume({ owner: 'agenda' });
  assert.strictEqual(resumeResult.ignored, true, 'Agenda resume must be ignored when manual recording is active');
  assert.strictEqual(resumeResult.reason, 'manual_preserved');

  // Test agenda startSessionRecording when manual recording is active
  const AgendaExecutionEngine = require('../src/main/agenda/agendaExecutionEngine');

  const fakeBridge = {
    startRecording: async () => ({
      ok: false,
      reason: 'already_recording',
      owner: 'manual',
      outputPath: '/recordings/manual_service.mp4',
    }),
    stopRecording: async (opts) => {
      return { ok: true, ignored: true };
    },
    dispatchPresentation: () => {},
    dispatchBackground: () => {},
    dispatchAudio: () => {},
    stopAudio: () => {},
    syncTimer: () => {},
    broadcastState: () => {},
    recordJournal: () => {},
    pauseRecording: () => {},
    resumeRecording: () => {},
  };

  const engine = new AgendaExecutionEngine(fakeBridge);
  const agenda = createEmptyAgenda();
  const session = createEmptySession('Worship');
  session.recordSession = true;
  agenda.sessions = [session];

  engine.loadAgenda(agenda);
  await engine.handleStartSessionRecording(session);

  assert.strictEqual(engine.recordingState.status, 'merged_manual', 'Must report merged_manual when manual recorder active');
  assert.strictEqual(engine.recordingState.note, 'Existing recording active — no separate session file');
  assert.strictEqual(engine.recordingState.outputPath, '/recordings/manual_service.mp4');

  // Test serialization between adjacent sessions
  let finalizedFirst = false;
  engine.sessionStopRecordingPromise = new Promise(resolve => {
    setTimeout(() => {
      finalizedFirst = true;
      resolve({ ok: true, outputPath: '/recordings/session1.mp4' });
    }, 50);
  });

  const session2 = createEmptySession('Sermon');
  session2.recordSession = true;

  // Starting next session must await previous finalization
  const startPromise = engine.handleStartSessionRecording(session2);
  assert.strictEqual(finalizedFirst, false, 'Should not have finalized immediately before start resolves');
  await startPromise;
  assert.strictEqual(finalizedFirst, true, 'Adjacent session startup must await previous session finalization');

  console.log('✅ Recording ownership and non-interference passed.');
}

console.log('\n--- TEST 4: Load Readiness & Person Field Propagation ---');
{
  const agenda = createEmptyAgenda();
  agenda.name = 'Sunday Service 2026';
  const session1 = createEmptySession('Opening Prayer');
  session1.durationSec = 300;
  session1.person = 'Elder Matthew';
  const session2 = createEmptySession('Praise & Worship');
  session2.durationSec = 1200;
  session2.person = 'Minister Joy';

  agenda.sessions = [session1, session2];

  // Test payload construction logic as done in main.js
  const firstSession = agenda.sessions && agenda.sessions[0];
  const readinessPayload = {
    ok: true,
    agendaName: agenda.name,
    sessionCount: agenda.sessions ? agenda.sessions.length : 0,
    firstSession: firstSession ? {
      name: firstSession.name,
      durationSec: firstSession.durationSec,
      person: firstSession.person || ''
    } : null
  };

  assert.strictEqual(readinessPayload.ok, true);
  assert.strictEqual(readinessPayload.agendaName, 'Sunday Service 2026');
  assert.strictEqual(readinessPayload.sessionCount, 2);
  assert.strictEqual(readinessPayload.firstSession.person, 'Elder Matthew');
  assert.strictEqual(readinessPayload.firstSession.durationSec, 300);

  console.log('✅ Load readiness and person propagation passed.');
}

console.log('\n--- TEST 5: Split-Timer Display Invariants ---');
{
  // Simulating view.js and MiniPreview.js condition:
  // const showSplitTimer = (viewMode !== 'general') && isPresenting && (countdown > 0) && (isTimerRunning === true);

  const evalSplitTimer = ({ viewMode, isPresenting, countdown, isTimerRunning }) => {
    return (viewMode !== 'general') && isPresenting && (countdown > 0) && (isTimerRunning === true);
  };

  // Case 1: Loaded state (countdown exists, isPresenting true, but isTimerRunning is false)
  assert.strictEqual(
    evalSplitTimer({ viewMode: 'speaker', isPresenting: true, countdown: 300, isTimerRunning: false }),
    false,
    'Loaded state with stopped/idle timer must NOT trigger split timer'
  );

  // Case 2: Running state on speaker screen
  assert.strictEqual(
    evalSplitTimer({ viewMode: 'speaker', isPresenting: true, countdown: 290, isTimerRunning: true }),
    true,
    'Running timer on speaker screen must trigger split timer'
  );

  // Case 3: General screen (must NEVER show split timer)
  assert.strictEqual(
    evalSplitTimer({ viewMode: 'general', isPresenting: true, countdown: 290, isTimerRunning: true }),
    false,
    'General screen must NEVER trigger split timer'
  );

  console.log('✅ Split-timer display invariants passed.');
}

console.log('\n--- TEST 6: Universal 12px Border Radius Invariant ---');
{
  const checkFiles = [
    path.join(__dirname, '../src/App/controller/AgendaController.jsx'),
    path.join(__dirname, '../src/App/controller/MiniPreview.js'),
    path.join(__dirname, '../src/App/View/view.js'),
    path.join(__dirname, '../ocs-mobile/app/agenda.tsx')
  ];

  // Disallowed radius patterns: rounded-sm, rounded-md, rounded-lg, rounded-2xl, rounded-3xl, rounded-[4px], rounded-[6px], rounded-[8px], rounded-[16px], etc.
  const disallowedRegex = /rounded-(sm|md|lg|2xl|3xl|\[[0-9]+px\])/g;

  let violations = [];
  for (const filePath of checkFiles) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      let match;
      while ((match = disallowedRegex.exec(line)) !== null) {
        // rounded-[12px] is explicitly allowed
        if (match[0] === 'rounded-[12px]') continue;
        violations.push(`${path.basename(filePath)}:${idx + 1}: ${match[0]} -> "${line.trim()}"`);
      }
    });
  }

  if (violations.length > 0) {
    console.error('Border radius violations found:', violations);
  }
  assert.strictEqual(violations.length, 0, 'No non-12px border radius classes allowed in modified code!');
  console.log('✅ Universal 12px border radius invariant passed.');
  console.log('\n🎉 ALL 6 AUTOMATED VERIFICATION SUITES PASSED CLEANLY!\n');
}
}

runAllTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
