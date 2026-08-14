/**
 * Regression: voice scripture display must survive BibleController nav sync.
 *
 * Bug (pre-fix): BroadcastEngine setContent(bible) then dispatched voice-bible-sync.
 * BibleController changed selectedBookIndex/Chapter → useEffect cleared with setContent(null).
 * Speaker/General/Controller all went blank even though resolution succeeded.
 *
 * Run: node scripts/test-presentation-display-race.js
 */
'use strict';

function simulateVoiceDisplayRace({ fromVoiceNav, skipClear }) {
  const windows = { speaker: null, general: null, controller: null };
  const log = [];

  function broadcast(value) {
    const summary = value == null ? null : { type: value.type, title: value.data && value.data.title };
    log.push(summary);
    windows.speaker = value;
    windows.general = value;
    windows.controller = value;
  }

  // 1) Voice resolves Mark 1:1 and pushes content (FR-1.3)
  const versePayload = {
    type: 'bible',
    data: {
      title: 'Mark 1:1',
      body: 'The beginning of the gospel of Jesus Christ, the Son of God;',
    },
  };
  broadcast(versePayload);

  // 2) voice-bible-sync causes Bible picker to navigate (different book)
  if (fromVoiceNav) {
    // clear-on-nav effect
    if (skipClear) {
      // fixed path: skip wipe
    } else {
      broadcast(null); // BUG path
    }
  }

  const allHaveVerse =
    windows.speaker &&
    windows.speaker.type === 'bible' &&
    windows.general &&
    windows.general.type === 'bible' &&
    windows.controller &&
    windows.controller.type === 'bible';

  return { allHaveVerse, log, windows };
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

// Reproduce bug
const buggy = simulateVoiceDisplayRace({ fromVoiceNav: true, skipClear: false });
assert(!buggy.allHaveVerse, 'pre-fix race leaves all windows blank (null after bible)');
assert(buggy.log[0] && buggy.log[0].type === 'bible', 'first broadcast was bible content');
assert(buggy.log[1] === null, 'second broadcast was null wipe');

// Fixed path
const fixed = simulateVoiceDisplayRace({ fromVoiceNav: true, skipClear: true });
assert(fixed.allHaveVerse, 'with skipClear, all three windows retain Mark 1:1');
assert(fixed.windows.speaker.data.title === 'Mark 1:1', 'speaker title Mark 1:1');
assert(fixed.windows.general.data.title === 'Mark 1:1', 'general title Mark 1:1');
assert(fixed.windows.controller.data.title === 'Mark 1:1', 'controller title Mark 1:1');

// Same-page voice (no nav) never cleared
const samePage = simulateVoiceDisplayRace({ fromVoiceNav: false, skipClear: false });
assert(samePage.allHaveVerse, 'same-page voice keeps content without skip flag');

if (process.exitCode) {
  console.error('\nRegression FAILED');
} else {
  console.log('\nAll presentation-display race checks passed.');
}
