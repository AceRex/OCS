#!/usr/bin/env node
/**
 * test-alignment-harness.js
 *
 * Comprehensive diagnostic test harness for Scripture Read-Along and Scene Sing-Along.
 * Tests realistic spoken & sung speech deviations across both Vosk and whisper.cpp
 * ASR streaming modes against:
 *   1. ReferenceAligner (src/main/aligner/referenceAligner.js)
 *   2. SceneAutoAdvanceManager (src/main/aligner/sceneAutoAdvance.js)
 *   3. ScriptureReadAlong (src/App/controller/scriptureReadAlong.js)
 *
 * Evaluates:
 *   - Word-level tracking accuracy (% correct active position)
 *   - Cursor lag (in words and ms)
 *   - False-advance rate (% premature forward jumps)
 *   - False-resync rate (improper backward jumps)
 *   - Recovery time (words needed to re-acquire sync after skip/backtrack)
 */

'use strict';

const { ReferenceAligner, tokenize } = require('../src/main/aligner/referenceAligner');
const { SceneAutoAdvanceManager } = require('../src/main/aligner/sceneAutoAdvance');
const { advanceReadAlong, tokenizePassage } = require('../src/App/controller/scriptureReadAlong');

// ── Realistic ASR Stream Simulators ───────────────────────────────────────────

/**
 * Simulates Vosk streaming ASR:
 * - Emits cumulative partials within each utterance as each word is spoken.
 * - On utterance boundaries (or silence pause >= 900ms), emits a final result
 *   and resets the cumulative buffer for the next utterance.
 */
function simulateVoskStream(timedWords) {
  const events = [];
  let currentUtteranceWords = [];
  let lastTime = 0;

  for (let i = 0; i < timedWords.length; i++) {
    const { word, timeMs, isPause, isUtteranceBoundary } = timedWords[i];

    if (isPause || (timeMs - lastTime >= 900 && currentUtteranceWords.length > 0)) {
      // Finalize current utterance on pause
      events.push({
        type: 'final',
        text: currentUtteranceWords.join(' '),
        isFinal: true,
        role: 'final',
        timeMs: lastTime + 100,
        pass: 'A',
      });
      currentUtteranceWords = [];
    }

    if (word) {
      currentUtteranceWords.push(word);
      events.push({
        type: 'partial',
        text: currentUtteranceWords.join(' '),
        isFinal: false,
        role: 'partial',
        timeMs,
        pass: 'A',
        spokenWordIndex: timedWords[i].refIndex,
        rawWord: word,
      });
    }

    if (isUtteranceBoundary && currentUtteranceWords.length > 0) {
      events.push({
        type: 'final',
        text: currentUtteranceWords.join(' '),
        isFinal: true,
        role: 'final',
        timeMs: timeMs + 150,
        pass: 'A',
      });
      currentUtteranceWords = [];
    }

    lastTime = timeMs;
  }

  if (currentUtteranceWords.length > 0) {
    events.push({
      type: 'final',
      text: currentUtteranceWords.join(' '),
      isFinal: true,
      role: 'final',
      timeMs: lastTime + 200,
      pass: 'A',
    });
  }

  return events;
}

/**
 * Simulates whisper.cpp streaming ASR:
 * - Emits synthesized probe partials at ~500ms intervals over a rolling 1.6s window.
 * - Emits final full-utterance transcription on VAD silence boundary.
 */
function simulateWhisperStream(timedWords) {
  const events = [];
  let currentUtteranceWords = [];
  let rollingBuffer = []; // { word, timeMs }
  let lastProbeTime = 0;
  let lastTime = 0;

  for (let i = 0; i < timedWords.length; i++) {
    const { word, timeMs, isPause, isUtteranceBoundary } = timedWords[i];

    if (isPause || (timeMs - lastTime >= 500 && currentUtteranceWords.length > 0)) {
      // Finalize utterance on silence
      events.push({
        type: 'final',
        text: currentUtteranceWords.map(w => w.word).join(' '),
        isFinal: true,
        role: 'final',
        timeMs: lastTime + 300, // whisper inference delay
        pass: 'W',
      });
      currentUtteranceWords = [];
      rollingBuffer = [];
    }

    if (word) {
      currentUtteranceWords.push({ word, timeMs, refIndex: timedWords[i].refIndex });
      rollingBuffer.push({ word, timeMs, refIndex: timedWords[i].refIndex });

      // Rolling window 1.6s
      rollingBuffer = rollingBuffer.filter(w => timeMs - w.timeMs <= 1600);

      // Probe partial every ~500ms
      if (timeMs - lastProbeTime >= 500) {
        lastProbeTime = timeMs;
        events.push({
          type: 'partial',
          text: rollingBuffer.map(w => w.word).join(' '),
          isFinal: false,
          role: 'probe',
          timeMs: timeMs + 100, // rolling probe latency
          pass: 'W',
          spokenWordIndex: timedWords[i].refIndex,
          rawWord: word,
        });
      }
    }

    if (isUtteranceBoundary && currentUtteranceWords.length > 0) {
      events.push({
        type: 'final',
        text: currentUtteranceWords.map(w => w.word).join(' '),
        isFinal: true,
        role: 'final',
        timeMs: timeMs + 350,
        pass: 'W',
      });
      currentUtteranceWords = [];
      rollingBuffer = [];
    }

    lastTime = timeMs;
  }

  if (currentUtteranceWords.length > 0) {
    events.push({
      type: 'final',
      text: currentUtteranceWords.map(w => w.word).join(' '),
      isFinal: true,
      role: 'final',
      timeMs: lastTime + 350,
      pass: 'W',
    });
  }

  return events;
}

// ── Test Harness Runner ───────────────────────────────────────────────────────

function runAlignerTest({
  name,
  alignerType, // 'referenceAligner' | 'scriptureReadAlong' | 'sceneAutoAdvance'
  engineType,  // 'vosk' | 'whisper'
  referenceText,
  sceneConfig, // if sceneAutoAdvance
  timedWords,
  options = {},
}) {
  const events = engineType === 'vosk'
    ? simulateVoskStream(timedWords)
    : simulateWhisperStream(timedWords);

  let alignerInstance = null;
  let scriptureTokens = null;
  let scriptureCursor = -1;

  if (alignerType === 'referenceAligner') {
    alignerInstance = new ReferenceAligner(options);
    alignerInstance.setReference('test-ref', referenceText);
  } else if (alignerType === 'sceneAutoAdvance') {
    alignerInstance = new SceneAutoAdvanceManager(options);
    alignerInstance.startScene(sceneConfig, 0, 0);
  } else if (alignerType === 'scriptureReadAlong') {
    scriptureTokens = tokenizePassage(referenceText);
    scriptureCursor = -1;
  }

  // Metrics collection
  const stepObservations = [];
  let falseAdvances = 0;
  let falseResyncs = 0;
  let totalSpeechSteps = 0;
  let accurateSteps = 0;
  let totalLagWords = 0;
  let lagSamples = 0;
  let recoveryStepsNeeded = 0;
  let inRecovery = false;
  let recoveryTargetIndex = -1;
  let autoAdvanceEvents = [];

  if (alignerType === 'sceneAutoAdvance') {
    alignerInstance.on('advance', (data) => {
      autoAdvanceEvents.push(data);
    });
  }

  for (const ev of events) {
    let currentCursor = -1;
    let resyncFired = false;

    if (alignerType === 'referenceAligner') {
      const res = alignerInstance.feed(ev);
      currentCursor = alignerInstance.cursor;
      resyncFired = !!res?.resync;
    } else if (alignerType === 'sceneAutoAdvance') {
      const res = alignerInstance.feed(ev);
      currentCursor = alignerInstance.aligner.cursor;
    } else if (alignerType === 'scriptureReadAlong') {
      const next = advanceReadAlong(ev.text, scriptureTokens, scriptureCursor);
      currentCursor = next;
      scriptureCursor = next;
    }

    if (typeof ev.spokenWordIndex === 'number' && ev.spokenWordIndex >= 0) {
      totalSpeechSteps++;
      const truePos = ev.spokenWordIndex;
      const lag = truePos - currentCursor;

      // Accuracy: cursor is on or within 1 word of true spoken position
      const isAccurate = currentCursor === truePos || (currentCursor === truePos - 1 && lag === 1);
      if (currentCursor === truePos) {
        accurateSteps++;
      }

      if (currentCursor > truePos) {
        falseAdvances++;
      }

      if (lag >= 0) {
        totalLagWords += lag;
        lagSamples++;
      }

      // Check recovery after perturbation (skip / backtrack)
      if (ev.isPerturbationStart) {
        inRecovery = true;
        recoveryTargetIndex = ev.targetRefIndex;
        recoveryStepsNeeded = 0;
      } else if (inRecovery) {
        recoveryStepsNeeded++;
        if (currentCursor === truePos) {
          inRecovery = false;
        }
      }

      stepObservations.push({
        timeMs: ev.timeMs,
        spokenWord: ev.rawWord,
        truePos,
        cursor: currentCursor,
        lag,
        isFinal: ev.isFinal,
      });
    }

    if (resyncFired) {
      // If resync fired when speaker was moving forward, count as false resync
      if (ev.spokenWordIndex && ev.spokenWordIndex > currentCursor) {
        falseResyncs++;
      }
    }
  }

  const accuracyPct = totalSpeechSteps > 0 ? (accurateSteps / totalSpeechSteps) * 100 : 0;
  const avgLagWords = lagSamples > 0 ? totalLagWords / lagSamples : 0;
  const falseAdvanceRate = totalSpeechSteps > 0 ? (falseAdvances / totalSpeechSteps) * 100 : 0;

  return {
    name,
    alignerType,
    engineType,
    totalSpeechSteps,
    accurateSteps,
    accuracyPct: Number(accuracyPct.toFixed(1)),
    avgLagWords: Number(avgLagWords.toFixed(2)),
    falseAdvances,
    falseAdvanceRate: Number(falseAdvanceRate.toFixed(1)),
    falseResyncs,
    recoveryStepsNeeded: inRecovery ? -1 : recoveryStepsNeeded, // -1 = failed to recover
    autoAdvanceEvents,
    stepObservations,
  };
}

// ── Test Scenarios ────────────────────────────────────────────────────────────

function generateScenarios() {
  const scenarios = [];

  // ============================================================================
  // SCENARIO 1: SCRIPTURE READ-ALONG — Perfect Verbatim Reading (Baseline)
  // Psalm 23:1-3 (32 words)
  // ============================================================================
  const psalm23Text = "The Lord is my shepherd I shall not want He makes me lie down in green pastures He leads me beside still waters He restores my soul";
  const psalm23Words = psalm23Text.split(' ');
  const verbatimPsalm = psalm23Words.map((word, idx) => ({
    word,
    refIndex: idx,
    timeMs: idx * 350, // ~170 WPM
    isUtteranceBoundary: (idx + 1) % 8 === 0,
  }));

  scenarios.push({
    name: 'Scripture 1: Verbatim Baseline (Psalm 23)',
    category: 'scripture',
    referenceText: psalm23Text,
    timedWords: verbatimPsalm,
  });

  // ============================================================================
  // SCENARIO 2: SCRIPTURE READ-ALONG — Phonetic Mishearings / ASR Substitutions
  // ============================================================================
  const noisyPsalmWords = [...psalm23Words];
  noisyPsalmWords[1] = 'laud';     // Lord -> laud (homophone)
  noisyPsalmWords[4] = 'shepard';  // shepherd -> shepard (edit dist 1)
  noisyPsalmWords[13] = 'pastors'; // pastures -> pastors (edit dist 2)
  noisyPsalmWords[20] = 'restors'; // restores -> restors (edit dist 1)

  const noisyPsalm = noisyPsalmWords.map((word, idx) => ({
    word,
    refIndex: idx,
    timeMs: idx * 350,
    isUtteranceBoundary: (idx + 1) % 8 === 0,
  }));

  scenarios.push({
    name: 'Scripture 2: ASR Mishearings & Homophones',
    category: 'scripture',
    referenceText: psalm23Text,
    timedWords: noisyPsalm,
  });

  // ============================================================================
  // SCENARIO 3: SCRIPTURE READ-ALONG — Mid-Sentence Pause (Silence Gap)
  // Speaker reads 5 words, pauses 2.5s, then continues
  // ============================================================================
  const pausedPsalm = [];
  psalm23Words.forEach((word, idx) => {
    let timeMs = idx * 350;
    let isPause = false;
    if (idx >= 5) {
      timeMs += 2500; // 2.5s pause after word 4
    }
    if (idx === 4) {
      isPause = true;
    }
    pausedPsalm.push({
      word,
      refIndex: idx,
      timeMs,
      isPause,
      isUtteranceBoundary: idx === 4 || (idx + 1) % 8 === 0,
    });
  });

  scenarios.push({
    name: 'Scripture 3: Mid-Sentence 2.5s Pause',
    category: 'scripture',
    referenceText: psalm23Text,
    timedWords: pausedPsalm,
  });

  // ============================================================================
  // SCENARIO 4: SCRIPTURE READ-ALONG — Skip Ahead 3 Words
  // Speaker skips words 6..8 ("I shall not") and jumps to word 9 ("want")
  // ============================================================================
  const skippedPsalm = [];
  let currTime = 0;
  for (let idx = 0; idx < psalm23Words.length; idx++) {
    if (idx >= 6 && idx <= 8) {
      // Skip words 6, 7, 8
      continue;
    }
    currTime += 350;
    skippedPsalm.push({
      word: psalm23Words[idx],
      refIndex: idx,
      timeMs: currTime,
      isPerturbationStart: idx === 9,
      targetRefIndex: 9,
      isUtteranceBoundary: (idx + 1) % 8 === 0,
    });
  }

  scenarios.push({
    name: 'Scripture 4: Forward Skip 3 Words',
    category: 'scripture',
    referenceText: psalm23Text,
    timedWords: skippedPsalm,
  });

  // ============================================================================
  // SCENARIO 5: SCRIPTURE READ-ALONG — Backtrack and Re-read Phrase (FR-5.34)
  // Speaker reads through word 14 ("green pastures"), then backtracks to word 10 ("He makes me lie down")
  // ============================================================================
  const backtrackPsalm = [];
  let bTime = 0;
  // First read words 0..14
  for (let i = 0; i <= 14; i++) {
    bTime += 350;
    backtrackPsalm.push({
      word: psalm23Words[i],
      refIndex: i,
      timeMs: bTime,
      isUtteranceBoundary: i === 14,
    });
  }
  // Pause 1s, then re-read words 10..22
  bTime += 1000;
  for (let i = 10; i < psalm23Words.length; i++) {
    bTime += 350;
    backtrackPsalm.push({
      word: psalm23Words[i],
      refIndex: i,
      timeMs: bTime,
      isPerturbationStart: i === 10,
      targetRefIndex: 10,
      isUtteranceBoundary: (i + 1) % 8 === 0,
    });
  }

  scenarios.push({
    name: 'Scripture 5: Backtrack 5 Words (FR-5.34 Resync)',
    category: 'scripture',
    referenceText: psalm23Text,
    timedWords: backtrackPsalm,
  });

  // ============================================================================
  // SCENARIO 6: SCRIPTURE READ-ALONG — Repeated Content Words
  // Genesis 1:3-5 with multiple "light" and "called" occurrences
  // ============================================================================
  const gen1Text = "And God said Let there be light and there was light And God saw the light that it was good";
  const gen1Words = gen1Text.split(' ');
  const gen1Timed = gen1Words.map((word, idx) => ({
    word,
    refIndex: idx,
    timeMs: idx * 350,
    isUtteranceBoundary: (idx + 1) % 7 === 0,
  }));

  scenarios.push({
    name: 'Scripture 6: Repeated Content Words ("light" x3)',
    category: 'scripture',
    referenceText: gen1Text,
    timedWords: gen1Timed,
  });

  // ============================================================================
  // SCENARIO 7: SCENE SING-ALONG — Chorus Flow with Repeated Chorus (X2)
  // Page 0: Verse 1, Page 1: Chorus (item 1), Page 2: Chorus (item 2 - repeat), Page 3: Bridge
  // ============================================================================
  const songChorusText = "Holy holy holy is the Lord God Almighty who was and is to come";
  const songVerseText = "Worthy is the Lamb that was slain";
  const songBridgeText = "Blessing and honor glory and power be unto Him";

  const songSceneConfig = {
    id: 'song-ag',
    sceneType: 'song',
    pages: [
      { content: songVerseText, label: 'Verse 1' },
      { content: songChorusText, label: 'Chorus' },
      { content: songChorusText, label: 'Chorus (x2)' },
      { content: songBridgeText, label: 'Bridge' },
    ],
    sequence: [
      { pageIndex: 0, label: 'Verse 1' },
      { pageIndex: 1, label: 'Chorus (1)' },
      { pageIndex: 2, label: 'Chorus (2)' },
      { pageIndex: 3, label: 'Bridge' },
    ],
  };

  // Singer sings Verse 1, then Chorus 1, then Chorus 2
  const chorusFlowWords = [];
  let sTime = 0;
  // Verse 1
  songVerseText.split(' ').forEach((word, idx) => {
    sTime += 400;
    chorusFlowWords.push({ word, refIndex: idx, timeMs: sTime, isUtteranceBoundary: idx === 6 });
  });
  // Chorus 1
  songChorusText.split(' ').forEach((word, idx) => {
    sTime += 400;
    chorusFlowWords.push({ word, refIndex: idx, timeMs: sTime, isUtteranceBoundary: idx === 12 });
  });
  // Chorus 2
  songChorusText.split(' ').forEach((word, idx) => {
    sTime += 400;
    chorusFlowWords.push({ word, refIndex: idx, timeMs: sTime, isUtteranceBoundary: idx === 12 });
  });

  scenarios.push({
    name: 'Song 1: Chorus Flow Repeated Chorus (X2)',
    category: 'song',
    sceneConfig: songSceneConfig,
    referenceText: songChorusText,
    timedWords: chorusFlowWords,
  });

  // ============================================================================
  // SCENARIO 8: SCENE SING-ALONG — Melisma / Sustained Vowels
  // Singer holds "graaaaace" across 3 seconds -> ASR produces elongated token or repeated partials
  // ============================================================================
  const melismaText = "Amazing grace how sweet the sound";
  const melismaWords = [
    { word: 'amazing', refIndex: 0, timeMs: 400, isUtteranceBoundary: false },
    { word: 'graaaaace', refIndex: 1, timeMs: 800, isUtteranceBoundary: false }, // elongated
    { word: 'grace', refIndex: 1, timeMs: 1400, isUtteranceBoundary: false },     // held note 2nd chunk
    { word: 'grace', refIndex: 1, timeMs: 2000, isUtteranceBoundary: false },     // held note 3rd chunk
    { word: 'how', refIndex: 2, timeMs: 2600, isUtteranceBoundary: false },
    { word: 'sweet', refIndex: 3, timeMs: 3100, isUtteranceBoundary: false },
    { word: 'the', refIndex: 4, timeMs: 3500, isUtteranceBoundary: false },
    { word: 'sound', refIndex: 5, timeMs: 4000, isUtteranceBoundary: true },
  ];

  scenarios.push({
    name: 'Song 2: Melisma / Sustained Vowels ("graaaaace" held 2s)',
    category: 'song',
    referenceText: melismaText,
    timedWords: melismaWords,
  });

  // ============================================================================
  // SCENARIO 9: SCENE SING-ALONG — Live Ad-libs Between Lines
  // Singer inserts "come on", "yeah", "hallelujah" between lyric lines
  // ============================================================================
  const adlibLyricText = "You are good and Your mercy is forever";
  const adlibWords = [
    { word: 'you', refIndex: 0, timeMs: 400 },
    { word: 'are', refIndex: 1, timeMs: 700 },
    { word: 'good', refIndex: 2, timeMs: 1000 },
    { word: 'yeah', refIndex: -1, timeMs: 1400 },     // Ad-lib 1 (not in ref)
    { word: 'come', refIndex: -1, timeMs: 1800 },     // Ad-lib 2
    { word: 'on', refIndex: -1, timeMs: 2100 },       // Ad-lib 3
    { word: 'and', refIndex: 3, timeMs: 2600 },
    { word: 'your', refIndex: 4, timeMs: 2900 },
    { word: 'mercy', refIndex: 5, timeMs: 3300 },
    { word: 'hallelujah', refIndex: -1, timeMs: 3700 }, // Ad-lib 4
    { word: 'is', refIndex: 6, timeMs: 4200 },
    { word: 'forever', refIndex: 7, timeMs: 4600, isUtteranceBoundary: true },
  ];

  scenarios.push({
    name: 'Song 3: Live Ad-libs ("yeah", "come on", "hallelujah")',
    category: 'song',
    referenceText: adlibLyricText,
    timedWords: adlibWords,
  });

  // ============================================================================
  // SCENARIO 10: SCENE SING-ALONG — Cross-Section Lookahead False-Advance
  // Page 1 ends with "Lord We Praise You", Page 2 begins with "We Praise You Jesus"
  // Singer sings Page 1, but "We Praise You" matches Page 2 lookahead!
  // ============================================================================
  const crossSectionScene = {
    id: 'cross-scene',
    sceneType: 'song',
    pages: [
      { content: 'Lord We Praise You with all our hearts', label: 'Section 1' },
      { content: 'We Praise You Jesus forever and ever', label: 'Section 2' },
    ],
    sequence: [
      { pageIndex: 0, label: 'Section 1' },
      { pageIndex: 1, label: 'Section 2' },
    ],
  };

  const section1Words = "Lord We Praise You with all our hearts".split(' ').map((word, idx) => ({
    word,
    refIndex: idx,
    timeMs: idx * 400,
    isUtteranceBoundary: idx === 7,
  }));

  scenarios.push({
    name: 'Song 4: Cross-Section Shared Words ("We Praise You")',
    category: 'song',
    sceneConfig: crossSectionScene,
    referenceText: 'Lord We Praise You with all our hearts',
    timedWords: section1Words,
  });

  return scenarios;
}

// ── Main Execution ────────────────────────────────────────────────────────────

function runAllTests() {
  console.log('================================================================================');
  console.log('OCS ALIGNMENT DIAGNOSTIC TEST HARNESS (Vosk vs whisper.cpp)');
  console.log('================================================================================\n');

  const scenarios = generateScenarios();
  const results = [];

  for (const sc of scenarios) {
    console.log(`\n--------------------------------------------------------------------------------`);
    console.log(`SCENARIO: ${sc.name}`);
    console.log(`--------------------------------------------------------------------------------`);

    // 1. ReferenceAligner on Vosk
    const refVosk = runAlignerTest({
      name: `${sc.name} [RefAligner / Vosk]`,
      alignerType: 'referenceAligner',
      engineType: 'vosk',
      referenceText: sc.referenceText,
      timedWords: sc.timedWords,
    });
    results.push(refVosk);

    // 2. ReferenceAligner on Whisper
    const refWhisper = runAlignerTest({
      name: `${sc.name} [RefAligner / Whisper]`,
      alignerType: 'referenceAligner',
      engineType: 'whisper',
      referenceText: sc.referenceText,
      timedWords: sc.timedWords,
    });
    results.push(refWhisper);

    // 3. ScriptureReadAlong on Vosk (for scripture scenarios)
    if (sc.category === 'scripture') {
      const scrVosk = runAlignerTest({
        name: `${sc.name} [ScriptureReadAlong / Vosk]`,
        alignerType: 'scriptureReadAlong',
        engineType: 'vosk',
        referenceText: sc.referenceText,
        timedWords: sc.timedWords,
      });
      results.push(scrVosk);

      const scrWhisper = runAlignerTest({
        name: `${sc.name} [ScriptureReadAlong / Whisper]`,
        alignerType: 'scriptureReadAlong',
        engineType: 'whisper',
        referenceText: sc.referenceText,
        timedWords: sc.timedWords,
      });
      results.push(scrWhisper);
    }

    // 4. SceneAutoAdvance on Vosk (for song scenarios with sceneConfig)
    if (sc.sceneConfig) {
      const sceneVosk = runAlignerTest({
        name: `${sc.name} [SceneAutoAdvance / Vosk]`,
        alignerType: 'sceneAutoAdvance',
        engineType: 'vosk',
        referenceText: sc.referenceText,
        sceneConfig: sc.sceneConfig,
        timedWords: sc.timedWords,
      });
      results.push(sceneVosk);

      const sceneWhisper = runAlignerTest({
        name: `${sc.name} [SceneAutoAdvance / Whisper]`,
        alignerType: 'sceneAutoAdvance',
        engineType: 'whisper',
        referenceText: sc.referenceText,
        sceneConfig: sc.sceneConfig,
        timedWords: sc.timedWords,
      });
      results.push(sceneWhisper);
    }

    // Print summary table for this scenario
    const curResults = results.filter(r => r.name.startsWith(sc.name));
    console.table(curResults.map(r => ({
      Pipeline: r.name.split(' [')[1].replace(']', ''),
      'Accuracy %': r.accuracyPct + '%',
      'Avg Lag (words)': r.avgLagWords,
      'False Adv %': r.falseAdvanceRate + '%',
      'False Resyncs': r.falseResyncs,
      'Recovery Steps': r.recoveryStepsNeeded === -1 ? 'FAILED' : (r.recoveryStepsNeeded || 'N/A'),
      'Auto-Advances': r.autoAdvanceEvents ? r.autoAdvanceEvents.length : '-',
    })));
  }

  return results;
}

if (require.main === module) {
  const results = runAllTests();
  console.log('\n================================================================================');
  console.log('ALL TESTS COMPLETED. Summary of ' + results.length + ' pipeline configurations.');
  console.log('================================================================================\n');
}

module.exports = {
  runAlignerTest,
  generateScenarios,
  simulateVoskStream,
  simulateWhisperStream,
};
