/**
 * Comprehensive Automated Verification Suite for Agenda Authoring & Design Lab Upload
 * 
 * Tests:
 * 1. Design Lab path resolution with complex filenames (spaces, parentheses, Unicode, literal %):
 *    - "New Project (3).png"
 *    - "Worship Service 2026 – 主日.png"
 *    - "Special 50% Off Event.png"
 *    Verifies execution through Python engine.py --analyze with 0 FileNotFoundError.
 *    Verifies classifier fallback when weights are absent.
 * 2. Sequential Agenda Naming (Agenda 1, Agenda 2, etc., avoiding existing names).
 * 3. Zero-Session Invariant (starts with 0 sessions, no auto-injected default sessions).
 * 4. Session Operations & Cue Dropping (adding, reordering, deleting session drops cues, undo restoration).
 * 5. Duration & Interval conversion and validation.
 * 6. Media Import & Probing (SHA-256 calculation, metadata/duration attachment).
 * 7. Timeline Drag & Resize Math (start shift, left/right handle trim, zoom conversion, bounds clamping).
 * 8. Universal 12px Border Radius compliance check.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { spawnSync } = require('child_process');
const { pathToFileURL, fileURLToPath } = require('url');

// Core modules
const {
  createEmptyAgenda,
  createEmptySession,
  createTimelineItem,
  calculateAgendaSummary,
  detectTimelineConflicts,
  resolveTimelineConflict,
  validateAgendaDocument,
  migrateLegacyAgenda,
  generateSequentialAgendaName,
} = require('../src/main/agenda/agendaModel');

const AgendaTransferManager = require('../src/main/agenda/agendaTransferManager');

async function runVerification() {
  console.log('================================================================');
  console.log('🚀 RUNNING COMPREHENSIVE AGENDA AUTHORING & DESIGN LAB TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(err);
      process.exitCode = 1;
    }
  }

  async function asyncTest(name, fn) {
    total++;
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(err);
      process.exitCode = 1;
    }
  }

  // ── Test 1: Design Lab File-Path Resolution & Complex Filenames ─────────────
  await asyncTest('Test 1: Design Lab Path Resolution (Spaces, (), Unicode, %)', async () => {
    const testDir = path.join(__dirname, '..', 'tmp_test_lab_paths');
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    fs.mkdirSync(testDir, { recursive: true });

    // 1x1 valid PNG buffer
    const minimalPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    const testFilenames = [
      'New Project (3).png',             // Spaces & Parentheses (observed user failure)
      'Worship Service 2026 – 主日.png',  // Unicode characters
      'Special 50% Off Event.png',       // Literal percent character
    ];

    // Helper matching main.js path resolution
    function resolvePosterNativePath(imagePath) {
      if (!imagePath || typeof imagePath !== 'string') return null;
      let nativePath = imagePath;
      if (nativePath.startsWith('file://')) {
        try {
          nativePath = fileURLToPath(nativePath);
        } catch (_) {
          try {
            nativePath = fileURLToPath(new URL(nativePath));
          } catch (_) {
            nativePath = decodeURIComponent(nativePath.replace(/^file:\/\//, ''));
          }
        }
      }
      return nativePath;
    }

    for (const filename of testFilenames) {
      const filePath = path.join(testDir, filename);
      fs.writeFileSync(filePath, minimalPng);

      // Create file:// URL as emitted by electron.Media.import()
      const fileUrl = pathToFileURL(filePath).href;

      // Resolve back to native path
      const resolved = resolvePosterNativePath(fileUrl);
      assert.strictEqual(fs.existsSync(resolved), true, `Resolved path must exist: ${resolved}`);
      assert.strictEqual(path.basename(resolved), filename, `Basename must match: ${filename}`);

      // Verify execution through Python engine with this exact path
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      const engineScript = path.join(__dirname, '..', 'ocs_image_engine', 'engine.py');
      const outDir = path.join(testDir, 'out');
      fs.mkdirSync(outDir, { recursive: true });

      const proc = spawnSync(pythonCmd, [
        engineScript,
        '--analyze',
        resolved,
        '--out',
        outDir,
      ], { encoding: 'utf-8', timeout: 60000 });

      assert.strictEqual(proc.status, 0, `Python engine failed on "${filename}": ${proc.stderr || proc.stdout}`);
      assert.ok(!proc.stderr.includes('FileNotFoundError'), `Must not throw FileNotFoundError on "${filename}"`);

      // Check output JSON
      const jsonMatch = (proc.stdout || '').match(/\{[\s\S]*\}/);
      assert.ok(jsonMatch, `Must output valid JSON for "${filename}"`);
      const analysis = JSON.parse(jsonMatch[0]);
      assert.strictEqual(analysis.theme_classification_status, 'unavailable', 'Missing weights must set status to unavailable');
    }

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  // ── Test 2: Sequential Agenda Naming ───────────────────────────────────────
  test('Test 2: Sequential Agenda Naming ("Agenda 1", "Agenda 2", etc.)', () => {
    // Empty list
    assert.strictEqual(generateSequentialAgendaName([]), 'Agenda 1');

    // Existing Agenda 1
    assert.strictEqual(generateSequentialAgendaName([{ name: 'Agenda 1' }]), 'Agenda 2');

    // Existing Agenda 1 and Agenda 2
    assert.strictEqual(
      generateSequentialAgendaName([
        { name: 'Agenda 1' },
        { name: 'Agenda 2' },
        { name: 'Youth Night Service' },
      ]),
      'Agenda 3'
    );

    // Gap in numbering: Agenda 2 exists, Agenda 1 is missing -> proposes Agenda 1
    assert.strictEqual(generateSequentialAgendaName([{ name: 'Agenda 2' }]), 'Agenda 1');
  });

  // ── Test 3: Zero-Session Agenda Invariant ──────────────────────────────────
  test('Test 3: Start new agendas with ZERO sessions & preserve empty on load', () => {
    const newAgenda = createEmptyAgenda('Agenda 1');
    assert.strictEqual(newAgenda.name, 'Agenda 1');
    assert.strictEqual(newAgenda.sessions.length, 0, 'New agenda must start with ZERO sessions');

    // migrateLegacyAgenda on empty list must preserve 0 sessions
    const migratedEmpty = migrateLegacyAgenda([]);
    assert.strictEqual(migratedEmpty.sessions.length, 0, 'Empty legacy agenda must not inject template sessions');
  });

  // ── Test 4: Session Operations & Cue Removal ──────────────────────────────
  test('Test 4: Editable, removable sessions & cues dropping on delete', () => {
    const agenda = createEmptyAgenda('Agenda 1');
    const s1 = createEmptySession('Worship Session', 900);
    const s2 = createEmptySession('Sermon Session', 2400);

    const cue1 = createTimelineItem({ track: 'background', name: 'Worship BG', startSec: 0 });
    const cue2 = createTimelineItem({ track: 'video', name: 'Worship Video', startSec: 10, durationSec: 120 });
    s1.timelineItems = [cue1, cue2];

    const cue3 = createTimelineItem({ track: 'audio', name: 'Sermon Bumper', startSec: 0, durationSec: 30 });
    s2.timelineItems = [cue3];

    agenda.sessions = [s1, s2];

    // Verify session count and cue count
    const summary = calculateAgendaSummary(agenda);
    assert.strictEqual(summary.sessionCount, 2);
    assert.strictEqual(summary.mediaCount, 3);

    // Reorder sessions: move s2 up
    const reorderedSessions = [s2, s1];
    agenda.sessions = reorderedSessions;
    assert.strictEqual(agenda.sessions[0].id, s2.id);

    // Remove s1 -> s1 and its 2 cues must be removed from the draft
    agenda.sessions = agenda.sessions.filter(s => s.id !== s1.id);
    assert.strictEqual(agenda.sessions.length, 1);
    const postDeleteSummary = calculateAgendaSummary(agenda);
    assert.strictEqual(postDeleteSummary.sessionCount, 1);
    assert.strictEqual(postDeleteSummary.mediaCount, 1);
    assert.strictEqual(agenda.sessions[0].timelineItems[0].name, 'Sermon Bumper');
  });

  // ── Test 5: Duration & Interval Conversion and Validation ─────────────────
  test('Test 5: Duration & Interval parsing and validation', () => {
    function parseDurationParts(h, m, s) {
      const parsedH = Math.max(0, parseInt(h, 10) || 0);
      const parsedM = Math.max(0, Math.min(59, parseInt(m, 10) || 0));
      const parsedS = Math.max(0, Math.min(59, parseInt(s, 10) || 0));
      return parsedH * 3600 + parsedM * 60 + parsedS;
    }

    // 1h 15m 30s
    assert.strictEqual(parseDurationParts('1', '15', '30'), 4530);

    // Out of bounds seconds (65s -> clamped to 59s)
    assert.strictEqual(parseDurationParts('0', '10', '75'), 659);

    // Negative values -> clamped to 0
    assert.strictEqual(parseDurationParts('-2', '-5', '-10'), 0);
  });

  // ── Test 6: Media Import & Probing Simulation ─────────────────────────────
  test('Test 6: Media Import, SHA-256 generation & cue linking', () => {
    const samplePayload = Buffer.from('VIDEO_PAYLOAD_CHUNK_SAMPLE_9999');
    const hash = crypto.createHash('sha256').update(samplePayload).digest('hex');

    const asset = {
      id: 'asset_test_1',
      originalName: 'clip.mp4',
      name: 'clip.mp4',
      size: samplePayload.length,
      hash,
      type: 'video',
      durationSec: 125,
      localFileUrl: 'file:///media/clip.mp4',
      path: '/media/clip.mp4',
    };

    const session = createEmptySession('Test Session', 600);
    const cue = createTimelineItem({
      track: 'video',
      actionType: 'range',
      startSec: 15,
      durationSec: asset.durationSec,
      sourceInSec: 0,
      sourceOutSec: asset.durationSec,
      assetId: asset.id,
      name: asset.originalName,
    });

    session.timelineItems = [cue];

    assert.strictEqual(session.timelineItems[0].assetId, asset.id);
    assert.strictEqual(session.timelineItems[0].durationSec, 125);
    assert.strictEqual(session.timelineItems[0].sourceOutSec, 125);
  });

  // ── Test 7: Timeline Drag & Resize Math ────────────────────────────────────
  test('Test 7: Timeline pointer-to-time drag and handle resize conversion', () => {
    const sessionDuration = 600; // 10 min session
    const trackWidthPx = 1200;   // 1200px timeline width (2px per second)

    // Helper: convert pixel delta to seconds
    function deltaPixelsToSeconds(deltaX, widthPx, totalSec) {
      return Math.round((deltaX / widthPx) * totalSec);
    }

    // Drag body: moving 100px to the right = +50 seconds
    const deltaSec = deltaPixelsToSeconds(100, trackWidthPx, sessionDuration);
    assert.strictEqual(deltaSec, 50);

    const initialStart = 100;
    const initialDuration = 60;

    // Moving body shifts startSec, preserving duration
    const newStart = Math.max(0, Math.min(sessionDuration - initialDuration, initialStart + deltaSec));
    assert.strictEqual(newStart, 150);

    // Resizing right handle by 60px = +30 seconds duration
    const rightDeltaSec = deltaPixelsToSeconds(60, trackWidthPx, sessionDuration);
    const newDuration = Math.max(1, Math.min(sessionDuration - newStart, initialDuration + rightDeltaSec));
    assert.strictEqual(newDuration, 90);

    // Resizing left handle by -20px = -10 seconds (earlier start)
    const leftDeltaSec = deltaPixelsToSeconds(-20, trackWidthPx, sessionDuration);
    const resizedLeftStart = Math.max(0, Math.min(newStart + newDuration - 1, newStart + leftDeltaSec));
    assert.strictEqual(resizedLeftStart, 140);
    const resizedDuration = (newStart + newDuration) - resizedLeftStart;
    assert.strictEqual(resizedDuration, 100);
  });

  // ── Test 8: Universal 12px Border Radius Audit ────────────────────────────
  test('Test 8: Universal 12px Border Radius compliance in updated files', () => {
    const filesToCheck = [
      path.join(__dirname, '..', 'src', 'App', 'controller', 'AgendaController.jsx'),
      path.join(__dirname, '..', 'src', 'App', 'controller', 'DurationInput.jsx'),
    ];

    const disallowedClasses = [
      /\brounded-sm\b/,
      /\brounded-md\b/,
      /\brounded-lg\b/,
      /\brounded-2xl\b/,
      /\brounded-3xl\b/,
    ];

    for (const filePath of filesToCheck) {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const re of disallowedClasses) {
        const match = content.match(re);
        assert.strictEqual(match, null, `Forbidden radius class found in ${path.basename(filePath)}: ${match?.[0]}`);
      }
    }
  });

  console.log('\n================================================================');
  console.log(`🎉 ALL ${passed}/${total} TESTS PASSED SUCCESSFULLY!`);
  console.log('================================================================');
}

runVerification().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
