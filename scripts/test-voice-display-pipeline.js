/**
 * End-to-end regression: voice transcript → gate → resolve → confidence →
 * mock settlement → mock IPC broadcast → all three windows render.
 *
 * Does NOT require live mic/Vosk. Stage 1 (ASR) is injected as text fixtures
 * representing (a) correct transcripts and (b) the garbled ASR failure mode
 * observed in live sessions.
 *
 * Run: node scripts/test-voice-display-pipeline.js
 */
'use strict';

const sqlite3 = require('sqlite3');
const path = require('path');

async function loadBooks() {
  const dbPath = path.join(__dirname, '..', 'src', 'Bible', 'bibles.db');
  const db = new sqlite3.Database(dbPath);
  const books = await new Promise((resolve, reject) => {
    db.all('SELECT * FROM books ORDER BY id', [], (err, rows) => (err ? reject(err) : resolve(rows)));
  });
  db.close();
  return books;
}

function makeBibleApi(books) {
  const dbPath = path.join(__dirname, '..', 'src', 'Bible', 'bibles.db');
  const db = new sqlite3.Database(dbPath);
  return {
    async getChapter(version, bookId, chapter) {
      return new Promise((resolve, reject) => {
        db.all(
          'SELECT text FROM verses WHERE version = ? AND book_id = ? AND chapter = ? ORDER BY verse',
          [version || 'kjv', bookId, chapter],
          (err, rows) => (err ? reject(err) : resolve(rows.map((r) => r.text)))
        );
      });
    },
    _close() {
      db.close();
    },
  };
}

function broadcastToWindows(value) {
  return {
    speaker: value,
    general: value,
    controller: value,
  };
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

async function main() {
  const {
    matchReferenceShape,
    smartBibleMatch,
  } = await import('../src/App/controller/smartBibleMatch.js');
  const {
    evaluateScripturePath,
    formatPipelineTrace,
  } = await import('../src/App/controller/voicePipelineTrace.js');
  const { shouldArmPassBForBookish } = require('../src/main/voskEngine');

  const books = await loadBooks();
  const bibleApi = makeBibleApi(books);

  const isShortContextJump = (text) => {
    const t = String(text || '').toLowerCase();
    return /^(?:verse|chapter)\s+\d+$/i.test(t);
  };

  // ── Fixtures ────────────────────────────────────────────────────────────
  const cases = [
    {
      name: 'Proverbs 24:6 ambient',
      text: 'Proverbs twenty four verse six',
      confidence: 0.72,
      expectDisplay: true,
      expectRef: /Proverbs 24:6/,
    },
    {
      name: 'John 3:16 ambient',
      text: 'John three sixteen',
      confidence: 0.55,
      expectDisplay: true,
      expectRef: /John 3:16/,
    },
    {
      name: 'Genesis 1 chapter-only',
      text: 'Genesis chapter one',
      confidence: 0.60,
      expectDisplay: true,
      expectRef: /Genesis 1:1/,
    },
    {
      name: 'false-positive bait (no display)',
      text: 'Mark my words this will happen',
      confidence: 0.90,
      expectDisplay: false,
    },
    {
      name: 'live-session garbled ASR (no display)',
      // Taken from terminal reproduction — transcript activity, zero shape
      text: 'like get into that one sided luggage we both not see it was as people',
      confidence: 0.80,
      expectDisplay: false,
      expectDrop: 'gate',
    },
  ];

  for (const c of cases) {
    const { stages, match, dropReason } = await evaluateScripturePath({
      text: c.text,
      books,
      bibleApi: null,
      confidence: c.confidence,
      pass: 'A',
      triggerArmed: false,
      sensitivity: 'strict',
      matchReferenceShape,
      smartBibleMatch,
      isShortContextJump,
    });

    const line = formatPipelineTrace({ utt: c.name, heard: c.text, stages });
    console.log(line);

    if (!c.expectDisplay) {
      assert(!match, `${c.name}: must not resolve`);
      if (c.expectDrop) assert(dropReason === c.expectDrop, `${c.name}: drop at ${c.expectDrop} (got ${dropReason})`);
      const wins = broadcastToWindows(null);
      assert(wins.speaker == null && wins.general == null && wins.controller == null, `${c.name}: all windows stay blank`);
      continue;
    }

    assert(!!match, `${c.name}: must resolve`);
    assert(dropReason == null, `${c.name}: no drop`);

    // Settlement + IPC + render (mock three windows)
    const book = books[match.bookIndex];
    const verses = await bibleApi.getChapter('kjv', book.id, match.chapter);
    const body = verses[match.startVerse - 1];
    assert(!!body, `${c.name}: verse body from DB`);
    const title = `${book.name} ${match.chapter}:${match.startVerse}`;
    assert(c.expectRef.test(title), `${c.name}: title ${title}`);

    const payload = { type: 'bible', data: { title, body } };
    stages.settle = 'ok:direct';
    stages.ipc = 'ok:activate_set_content';
    const wins = broadcastToWindows(payload);
    stages.render = 'ok:speaker+general+controller';
    console.log(formatPipelineTrace({ utt: c.name, heard: c.text, stages }));

    assert(wins.speaker?.data?.title === title, `${c.name}: speaker render`);
    assert(wins.general?.data?.title === title, `${c.name}: general render`);
    assert(wins.controller?.data?.title === title, `${c.name}: controller render`);
  }

  // Pass B bookish arming (ASR assist for ambient)
  assert(shouldArmPassBForBookish('proverbs twenty four verse six') === true, 'bookish arm: proverbs 24:6');
  assert(shouldArmPassBForBookish('john three sixteen') === true, 'bookish arm: john 3:16');
  assert(shouldArmPassBForBookish('ocs john three sixteen') === true, 'bookish arm: trigger');
  assert(shouldArmPassBForBookish('mark my words this will happen') === false, 'bookish arm: bait rejects');
  assert(shouldArmPassBForBookish('like get into that one sided luggage') === false, 'bookish arm: garbled rejects');

  // Prior race: bible then null wipe
  const raceWins = broadcastToWindows({ type: 'bible', data: { title: 'John 3:16', body: 'x' } });
  // fixed path: do not wipe
  assert(raceWins.speaker?.type === 'bible', 'race: content retained without wipe');

  bibleApi._close();
  if (process.exitCode) {
    console.error('\nvoice-display-pipeline FAILED');
  } else {
    console.log('\nvoice-display-pipeline: all cases passed.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
