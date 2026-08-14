/**
 * End-to-end-ish IPC broadcast smoke test (no Electron UI).
 * Simulates main.js activate_set_content fan-out to three windows.
 *
 * Run: node scripts/test-set-content-broadcast.js
 */
'use strict';

function createFakeWindows() {
  const received = { speaker: [], general: [], controller: [] };
  return {
    received,
    speaker: { isDestroyed: () => false, webContents: { send: (_ch, v) => received.speaker.push(v) } },
    general: { isDestroyed: () => false, webContents: { send: (_ch, v) => received.general.push(v) } },
    controller: { isDestroyed: () => false, webContents: { send: (_ch, v) => received.controller.push(v) } },
  };
}

/** Mirrors main.js activate_set_content handler */
function activateSetContent(wins, value) {
  const targets = {
    speaker: wins.speaker && !wins.speaker.isDestroyed(),
    general: wins.general && !wins.general.isDestroyed(),
    controller: wins.controller && !wins.controller.isDestroyed(),
  };
  if (targets.speaker) wins.speaker.webContents.send('set-content', value);
  if (targets.general) wins.general.webContents.send('set-content', value);
  if (targets.controller) wins.controller.webContents.send('set-content', value);
  return targets;
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
    return false;
  }
  console.log('PASS:', msg);
  return true;
}

const wins = createFakeWindows();
const payload = {
  type: 'bible',
  data: { title: 'Genesis 1:1', body: 'In the beginning God created the heaven and the earth.' },
};

const targets = activateSetContent(wins, payload);
assert(targets.speaker && targets.general && targets.controller, 'all three windows targeted');
assert(wins.received.speaker.length === 1, 'speaker received 1 event');
assert(wins.received.general.length === 1, 'general received 1 event');
assert(wins.received.controller.length === 1, 'controller received 1 event');
assert(wins.received.speaker[0].data.title === 'Genesis 1:1', 'speaker got Genesis 1:1');
assert(wins.received.general[0].data.title === 'Genesis 1:1', 'general got Genesis 1:1');
assert(wins.received.controller[0].data.title === 'Genesis 1:1', 'controller got Genesis 1:1');

// null (blank screen) must also fan out without throwing
activateSetContent(wins, null);
assert(wins.received.speaker[1] === null, 'speaker received null black');
assert(wins.received.general[1] === null, 'general received null black');
assert(wins.received.controller[1] === null, 'controller received null black');

if (process.exitCode) {
  console.error('\nBroadcast smoke FAILED');
} else {
  console.log('\nset-content broadcast smoke passed.');
}
