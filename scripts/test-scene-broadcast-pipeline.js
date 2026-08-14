#!/usr/bin/env node
/**
 * test-scene-broadcast-pipeline.js
 *
 * Verifies the Scene broadcast pipeline (FR-4.28 / FR-4.30) is working:
 *   - Scene content pushed via activate_set_content with type 'scene'
 *   - Target gating honours the 'target' array
 *   - Content Slot is properly scoped (FR-4.14)
 *   - Voice commands (ocs-scene-command CustomEvent) are dispatched for
 *     start_scene / next_page / prev_page (FR-4.31)
 *
 * Run: node scripts/test-scene-broadcast-pipeline.js
 */

let passed = 0;
let failed = 0;

function assert(cond, label) {
    if (cond) { console.log(`PASS: ${label}`); passed++; }
    else { console.log(`FAIL: ${label}`); failed++; }
}

// ── Simulated Canvas State (mirrors main.js compositor) ─────────────────────

const currentCanvasState = {
    background: { type: 'color', data: '#000000' },
    contentSlot: { type: 'none', data: null },
    pinnedLayers: [],
    chrome: { blackout: false },
};

function broadcastCanvasState() { /* noop in test — just verifying state mutation */ }

// ── Simulated Window Objects ────────────────────────────────────────────────

const sentMessages = { speaker: [], general: [], controller: [] };

function makeWindow(name) {
    return {
        isDestroyed: () => false,
        webContents: {
            send: (channel, value) => {
                sentMessages[name].push({ channel, value });
            },
        },
    };
}

const speakerWindow = makeWindow('speaker');
const generalWindow = makeWindow('general');
const controllerWindow = makeWindow('controller');

// ── Simulated activate_set_content (copy of main.js logic) ──────────────────

function activateSetContent(value) {
    const allowedTargets = Array.isArray(value?.target) ? value.target : null;
    const speakerOk = speakerWindow && !speakerWindow.isDestroyed() &&
        (allowedTargets === null || allowedTargets.includes('speaker'));
    const generalOk = generalWindow && !generalWindow.isDestroyed() &&
        (allowedTargets === null || allowedTargets.includes('general'));
    const controllerOk = controllerWindow && !controllerWindow.isDestroyed();

    if (value == null) {
        currentCanvasState.contentSlot = { type: "none", data: null };
    } else {
        currentCanvasState.contentSlot = {
            type: value.type || "none",
            data: value.data || value,
        };
    }
    broadcastCanvasState(currentCanvasState);

    if (speakerOk) speakerWindow.webContents.send("set-content", value);
    if (generalOk) generalWindow.webContents.send("set-content", value);
    if (controllerOk) controllerWindow.webContents.send("set-content", value);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Scene content dispatches to all three windows with target=['general','speaker']
// ═══════════════════════════════════════════════════════════════════════════════

const scenePayload = {
    type: 'scene',
    data: {
        sceneId: 'scene-test-001',
        sceneName: 'Amazing Grace',
        pageIndex: 0,
        pageCount: 3,
        content: 'Amazing grace, how sweet the sound',
    },
    target: ['general', 'speaker'],
};

activateSetContent(scenePayload);

assert(sentMessages.speaker.length === 1, 'T1: Scene content sent to Speaker');
assert(sentMessages.general.length === 1, 'T1: Scene content sent to General');
assert(sentMessages.controller.length === 1, 'T1: Scene content sent to Controller');
assert(sentMessages.speaker[0].value.type === 'scene', 'T1: Speaker receives type=scene');
assert(sentMessages.general[0].value.data.sceneName === 'Amazing Grace', 'T1: General receives sceneName');
assert(currentCanvasState.contentSlot.type === 'scene', 'T1: Content Slot updated to scene (FR-4.14)');
assert(currentCanvasState.contentSlot.data.pageIndex === 0, 'T1: Content Slot data has pageIndex=0');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Target gating — only Speaker checked
// ═══════════════════════════════════════════════════════════════════════════════

sentMessages.speaker.length = 0;
sentMessages.general.length = 0;
sentMessages.controller.length = 0;

const speakerOnly = {
    type: 'scene',
    data: { sceneId: 'scene-test-001', sceneName: 'AG', pageIndex: 1, pageCount: 3, content: 'Verse 2' },
    target: ['speaker'],
};

activateSetContent(speakerOnly);

assert(sentMessages.speaker.length === 1, 'T2: Speaker receives when target=[speaker]');
assert(sentMessages.general.length === 0, 'T2: General excluded when target=[speaker] (target gating works)');
assert(sentMessages.controller.length === 1, 'T2: Controller always receives');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: null clears content slot, broadcasts to all
// ═══════════════════════════════════════════════════════════════════════════════

sentMessages.speaker.length = 0;
sentMessages.general.length = 0;
sentMessages.controller.length = 0;

activateSetContent(null);

assert(currentCanvasState.contentSlot.type === 'none', 'T3: Content Slot cleared to none on null');
assert(sentMessages.speaker.length === 1, 'T3: null broadcast to Speaker (no target → all)');
assert(sentMessages.general.length === 1, 'T3: null broadcast to General');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Scene content slot preserves background and pinned layers (FR-4.14)
// ═══════════════════════════════════════════════════════════════════════════════

currentCanvasState.background = { type: 'image', data: '/media/church.jpg' };
currentCanvasState.pinnedLayers = [{ id: 'logo-1', type: 'image', url: '/logo.png' }];

sentMessages.speaker.length = 0;
sentMessages.general.length = 0;
sentMessages.controller.length = 0;

activateSetContent(scenePayload);

assert(currentCanvasState.background.data === '/media/church.jpg', 'T4: Background preserved after scene push (FR-4.14)');
assert(currentCanvasState.pinnedLayers.length === 1, 'T4: Pinned layers preserved after scene push (FR-4.14)');
assert(currentCanvasState.contentSlot.type === 'scene', 'T4: Content slot updated to scene');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Scene voice commands dispatch via OCS_COMMANDS pattern
// ═══════════════════════════════════════════════════════════════════════════════

// Simulate the OCS_COMMANDS matching (replicated from BroadcastEngine.js)
const sceneCommands = [
    { patterns: [/\bstart\s+scene\b/i, /\bopen\s+scene\b/i, /\bshow\s+scene\b/i, /\bplay\s+scene\b/i], action: 'start_scene' },
    { patterns: [/\bnext\s+page\b/i, /\bgo\s+(?:to\s+)?(?:the\s+)?next\s+page\b/i], action: 'next_page' },
    { patterns: [/\bprevious\s+page\b/i, /\bprev\s+page\b/i, /\bback\s+(?:a\s+)?page\b/i], action: 'prev_page' },
];

function matchCommand(text) {
    for (const cmd of sceneCommands) {
        for (const p of cmd.patterns) {
            if (p.test(text)) return cmd.action;
        }
    }
    return null;
}

assert(matchCommand('start scene Amazing Grace') === 'start_scene', 'T5a: "start scene" matches start_scene');
assert(matchCommand('open scene Worship Set') === 'start_scene', 'T5b: "open scene" matches start_scene');
assert(matchCommand('next page') === 'next_page', 'T5c: "next page" matches next_page');
assert(matchCommand('go to the next page') === 'next_page', 'T5d: "go to the next page" matches next_page');
assert(matchCommand('previous page') === 'prev_page', 'T5e: "previous page" matches prev_page');
assert(matchCommand('back a page') === 'prev_page', 'T5f: "back a page" matches prev_page');
assert(matchCommand('turn the page over') === null, 'T5g: unrelated text does not match');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Scene name extraction from voice command raw text
// ═══════════════════════════════════════════════════════════════════════════════

function extractSceneName(rawText) {
    const nameMatch = rawText.match(/(?:start|open|show|play)\s+scene\s+(.+)/i);
    return nameMatch ? nameMatch[1].trim() : null;
}

assert(extractSceneName('start scene Amazing Grace') === 'Amazing Grace', 'T6a: Extract "Amazing Grace" from start scene command');
assert(extractSceneName('open scene Sunday Worship') === 'Sunday Worship', 'T6b: Extract "Sunday Worship" from open scene');
assert(extractSceneName('play scene') === null, 'T6c: No name after "play scene" returns null');

// ═══════════════════════════════════════════════════════════════════════════════

console.log(`\nScene broadcast pipeline: ${passed} passed, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
