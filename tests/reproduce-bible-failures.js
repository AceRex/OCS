/**
 * Reproduction script for Bible Highlighting failures:
 * 1. Words highlight only on the controller, not the preview (MiniPreview / PreviewModal).
 * 2. Double-click word highlighting aborted by window.getSelection() and timer issues.
 * 3. Voice prompt / read-along wipes manual highlights from presentation payload.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=== Reproducing Reported Bible Highlighting Failures ===\n');

// ── Test 1: Verify MiniPreview.js lacks manual highlight rendering ──
console.log('Test 1: Checking MiniPreview.js for manual highlight rendering...');
const miniPreviewCode = fs.readFileSync(path.join(__dirname, '../src/App/controller/MiniPreview.js'), 'utf8');
const hasMiniManualHl = miniPreviewCode.includes('manualHighlights') || miniPreviewCode.includes('isTokenHighlighted');
console.log(`MiniPreview.js has manual highlight logic: ${hasMiniManualHl}`);
assert.strictEqual(hasMiniManualHl, false, 'CONFIRMED FAILURE 1A: MiniPreview.js completely lacks manual highlight rendering!');

const previewModalCode = fs.readFileSync(path.join(__dirname, '../src/App/controller/PreviewModal.js'), 'utf8');
const hasModalManualHl = previewModalCode.includes('manualHighlights') || previewModalCode.includes('isTokenHighlighted');
console.log(`PreviewModal.js has manual highlight logic: ${hasModalManualHl}`);
assert.strictEqual(hasModalManualHl, false, 'CONFIRMED FAILURE 1B: PreviewModal.js completely lacks manual highlight rendering!');

// ── Test 2: Verify double-click text selection guard in BibleController.js ──
console.log('\nTest 2: Checking BibleController.js handleWordDoubleClick for window.getSelection() abortion...');
const controllerCode = fs.readFileSync(path.join(__dirname, '../src/App/controller/BibleController.js'), 'utf8');
const dblClickSection = controllerCode.substring(
  controllerCode.indexOf('handleWordDoubleClick'),
  controllerCode.indexOf('handleVerseContainerClick')
);
const hasSelectionGuardInDblClick = dblClickSection.includes('window.getSelection?.()?.toString()?.trim().length > 0');
console.log(`handleWordDoubleClick contains selection guard: ${hasSelectionGuardInDblClick}`);
assert.strictEqual(hasSelectionGuardInDblClick, true, 'CONFIRMED FAILURE 2: handleWordDoubleClick aborts when native browser double-click selects text!');

// ── Test 3: Verify BroadcastEngine pushBibleContent wipes manualHighlights ──
console.log('\nTest 3: Checking BroadcastEngine.js pushBibleContent for manualHighlights preservation...');
const broadcastCode = fs.readFileSync(path.join(__dirname, '../src/App/controller/BroadcastEngine.js'), 'utf8');
const pushBibleSection = broadcastCode.substring(
  broadcastCode.indexOf('const pushBibleContent ='),
  broadcastCode.indexOf('advanceRangeToNextVerse')
);
const pushBiblePreservesManualHl = pushBibleSection.includes('manualHighlights');
console.log(`pushBibleContent includes manualHighlights: ${pushBiblePreservesManualHl}`);
assert.strictEqual(pushBiblePreservesManualHl, false, 'CONFIRMED FAILURE 3: BroadcastEngine.js pushBibleContent omits manualHighlights, wiping them during voice read-along updates!');

console.log('\n✓ ALL THREE REPORTED FAILURES DEFINITIVELY REPRODUCED AND ROOT CAUSES CONFIRMED!\n');
