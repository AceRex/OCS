/**
 * Display sleep prevention — FR-13.1–13.5
 */
const { powerSaveBlocker, BrowserWindow } = require('electron');
const { get, load, save } = require('./appSettings');

let blockerId = null;
let timerLive = false;
let sessionRecording = false;
let heartbeat = null;

function broadcastStatus(status) {
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('sleep-prevention-status', status);
    }
  } catch (_) {}
}

function getStatus() {
  const mode = get('sleepPrevention') || 'always';
  const want = mode === 'always' || timerLive || sessionRecording;
  const active = blockerId != null && powerSaveBlocker.isStarted(blockerId);
  let state = 'idle';
  if (want && active) state = 'active';
  else if (want && !active) state = 'failed';
  return {
    state,
    mode,
    timerLive,
    sessionRecording,
    blockerId,
    isStarted: active,
  };
}

function ensureStopped() {
  if (blockerId == null) return;
  try {
    if (powerSaveBlocker.isStarted(blockerId)) powerSaveBlocker.stop(blockerId);
  } catch (_) {}
  blockerId = null;
}

function ensureStarted() {
  if (blockerId != null && powerSaveBlocker.isStarted(blockerId)) return true;
  if (blockerId != null) ensureStopped();
  try {
    blockerId = powerSaveBlocker.start('prevent-display-sleep');
    const ok = powerSaveBlocker.isStarted(blockerId);
    if (!ok) {
      console.error('[SleepPrevention] start returned but isStarted=false');
      blockerId = null;
    }
    return ok;
  } catch (err) {
    console.error('[SleepPrevention] start failed', err);
    blockerId = null;
    return false;
  }
}

function reconcile(partial = {}) {
  if (partial.timerLive != null) timerLive = !!partial.timerLive;
  if (partial.sessionRecording != null) sessionRecording = !!partial.sessionRecording;
  const mode = get('sleepPrevention') || 'always';
  const want = mode === 'always' || timerLive || sessionRecording;
  if (want) ensureStarted();
  else ensureStopped();
  const status = getStatus();
  broadcastStatus(status);
  return status;
}

async function setMode(mode) {
  const m = mode === 'live' ? 'live' : 'always';
  await save({ sleepPrevention: m });
  return reconcile();
}

/** Wizard / startup probe — brief start test without leaving duplicate blockers */
function probe() {
  const priorId = blockerId;
  const priorStarted = priorId != null && powerSaveBlocker.isStarted(priorId);
  let testId = null;
  let ok = false;
  try {
    testId = powerSaveBlocker.start('prevent-display-sleep');
    ok = powerSaveBlocker.isStarted(testId);
    if (testId != null) powerSaveBlocker.stop(testId);
  } catch (err) {
    console.error('[SleepPrevention] probe failed', err);
  }
  if (priorStarted && priorId != null) {
    try {
      blockerId = priorId;
      if (!powerSaveBlocker.isStarted(blockerId)) {
        blockerId = powerSaveBlocker.start('prevent-display-sleep');
      }
    } catch (_) {
      blockerId = null;
    }
  }
  return { ok, message: ok ? null : 'Display sleep prevention unavailable — screens may sleep mid-service.' };
}

function init() {
  load().catch(() => {});
  reconcile();
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = setInterval(() => {
    const mode = get('sleepPrevention') || 'always';
    const want = mode === 'always' || timerLive || sessionRecording;
    if (want && blockerId != null && !powerSaveBlocker.isStarted(blockerId)) {
      console.warn('[SleepPrevention] blocker lost — re-arming');
      blockerId = null;
      ensureStarted();
      broadcastStatus(getStatus());
    } else {
      broadcastStatus(getStatus());
    }
  }, 60000);
}

function shutdown() {
  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
  ensureStopped();
}

module.exports = {
  init,
  shutdown,
  reconcile,
  setMode,
  getStatus,
  probe,
  ensureStopped,
};
