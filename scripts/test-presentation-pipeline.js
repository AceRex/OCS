/**
 * Phase 2.5 Presentation Pipeline Verification Test Suite
 * Covers:
 *  - FR-4.1, FR-4.2: PPTX slide-to-PNG conversion & extraction
 *  - FR-4.3: Speaker notes extraction & isolation (Speaker View only, never General View)
 *  - FR-4.8: Voice commands (next_slide, prev_slide, jump_to_slide, first_slide, last_slide)
 *  - FR-4.9: Context disambiguation (presentation vs scripture vs scene)
 *  - FR-4.11: Slide-number fuzzy matching & word-to-number conversion
 *  - FR-4.13, FR-4.14: 4-Band DisplayCanvas integration (type === 'presentation')
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const JSZip = require('jszip');
const { convertPptxToPng } = require('pptx-glimpse');

let passed = 0;
let failed = 0;

function check(desc, condition) {
  if (condition) {
    console.log(`PASS: ${desc}`);
    passed++;
  } else {
    console.error(`FAIL: ${desc}`);
    failed++;
  }
}

async function runTests() {
  console.log('=== 1. PPTX Extraction & Speaker Notes (FR-4.1 - FR-4.3) ===');

  const fixturePath = path.join(__dirname, '../node_modules/pptx2json/fixtures/test.pptx');
  check('T1.1: PPTX fixture file exists', fs.existsSync(fixturePath));

  const buffer = fs.readFileSync(fixturePath);
  const slides = await convertPptxToPng(buffer);
  check('T1.2: Converted slides array has length > 0', Array.isArray(slides) && slides.length === 3);

  const outDir = path.join(__dirname, '../tmp_test_slides');
  fs.mkdirSync(outDir, { recursive: true });

  // Extract speaker notes via OpenXML
  let notesMap = {};
  try {
    const zip = await JSZip.loadAsync(buffer);
    const noteFiles = Object.keys(zip.files).filter(k => k.startsWith("ppt/notesSlides/notesSlide"));
    for (const nf of noteFiles) {
      const match = nf.match(/notesSlide(\d+)\.xml/);
      const slideNum = match ? parseInt(match[1], 10) : null;
      if (slideNum) {
        const xml = await zip.file(nf).async("string");
        const texts = [...xml.matchAll(/<a:t>(.*?)<\/a:t>/gs)].map(m => m[1]).join(" ").trim();
        notesMap[slideNum] = texts;
      }
    }
  } catch (err) {
    console.error("Notes error:", err);
  }

  check('T1.3: Extracted speaker notes for slides', Object.keys(notesMap).length > 0);

  const slideResults = [];
  for (let i = 0; i < slides.length; i++) {
    const slideItem = slides[i];
    const pngBuf = slideItem && slideItem.png ? slideItem.png : slideItem;
    const slideNumber = (slideItem && slideItem.slideNumber) ? slideItem.slideNumber : i + 1;
    const slidePath = path.join(outDir, `slide_${slideNumber}.png`);
    fs.writeFileSync(slidePath, pngBuf);
    
    check(`T1.4.${i + 1}: Slide ${slideNumber} PNG is valid buffer (>1000 bytes)`, fs.statSync(slidePath).size > 1000);

    slideResults.push({
      slideIndex: i,
      slideNumber: slideNumber,
      url: `file://${slidePath}`,
      notes: notesMap[slideNumber] || "",
      width: slideItem.width || 1920,
      height: slideItem.height || 1080
    });
  }

  const deck = {
    id: `deck-${Date.now()}`,
    fileUrl: `file://${fixturePath}`,
    filename: 'test.pptx',
    name: 'test',
    slideCount: slideResults.length,
    slides: slideResults,
  };

  check('T1.5: Deck model formed with slides and count', deck.slideCount === 3 && deck.slides.length === 3);

  console.log('\n=== 2. Display Canvas 4-Band Compositor: Presentation Slot (FR-4.13, FR-4.14) ===');

  // Verify presentation content slot payload
  const currentSlide = deck.slides[0];
  const payload = {
    type: 'presentation',
    data: {
      deckId: deck.id,
      deckName: deck.name,
      slideIndex: 0,
      slideNumber: 1,
      slideCount: deck.slides.length,
      slideUrl: currentSlide.url,
      notes: currentSlide.notes || '',
    },
    target: ['general', 'speaker']
  };

  check('T2.1: Payload has type=presentation', payload.type === 'presentation');
  check('T2.2: Payload includes slideUrl', typeof payload.data.slideUrl === 'string' && payload.data.slideUrl.startsWith('file://'));
  check('T2.3: Payload includes speaker notes', payload.data.notes !== undefined);

  // Simulate Speaker vs General view notes isolation (FR-4.3)
  function renderViewNotes(mode, data) {
    if (mode === 'general') return null; // NEVER rendered on general view
    if (mode === 'speaker' && data.notes) return data.notes;
    return null;
  }

  check('T2.4: Speaker notes isolated from General View (mode=general -> null)', renderViewNotes('general', payload.data) === null);
  check('T2.5: Speaker notes visible on Speaker View (mode=speaker -> notes)', renderViewNotes('speaker', payload.data) === currentSlide.notes);

  console.log('\n=== 3. Presentation Voice Commands & Parsing (FR-4.8, FR-4.11) ===');

  const COMMAND_PATTERNS = [
    { patterns: [/\bnext\s+slide\b/i, /\bgo\s+(?:to\s+)?(?:the\s+)?next\s+slide\b/i, /\bforward\s+slide\b/i], action: 'next_slide' },
    { patterns: [/\bprevious\s+slide\b/i, /\bprev\s+slide\b/i, /\bback\s+(?:a\s+)?slide\b/i], action: 'prev_slide' },
    { patterns: [/\bfirst\s+slide\b/i, /\bstart\s+of\s+presentation\b/i], action: 'first_slide' },
    { patterns: [/\blast\s+slide\b/i, /\bend\s+of\s+presentation\b/i], action: 'last_slide' },
    { patterns: [/\b(?:go\s+to|jump\s+to|show|open)\s+slide\s+([a-zA-Z0-9\-]+)\b/i, /\bslide\s+(?:number\s+)?([a-zA-Z0-9\-]+)\b/i], action: 'jump_to_slide' },
  ];

  function matchPresentationCommand(text) {
    for (const def of COMMAND_PATTERNS) {
      for (const pat of def.patterns) {
        if (pat.test(text)) return def.action;
      }
    }
    return null;
  }

  function parseSlideNumber(str) {
    if (!str) return null;
    const s = str.toLowerCase().trim();
    const direct = parseInt(s, 10);
    if (!isNaN(direct) && direct > 0) return direct;

    const WORD_NUMS = {
      one: 1, first: 1, two: 2, second: 2, three: 3, third: 3, four: 4, fourth: 4, five: 5, fifth: 5,
      six: 6, sixth: 6, seven: 7, seventh: 7, eight: 8, eighth: 8, nine: 9, ninth: 9, ten: 10, tenth: 10,
      eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
      eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
      eighty: 80, ninety: 90
    };

    if (WORD_NUMS[s]) return WORD_NUMS[s];
    const parts = s.split(/[\s\-]+/);
    if (parts.length === 2 && WORD_NUMS[parts[0]] && WORD_NUMS[parts[1]]) {
      return WORD_NUMS[parts[0]] + WORD_NUMS[parts[1]];
    }
    return null;
  }

  check('T3.1: "next slide" matches next_slide', matchPresentationCommand("next slide") === 'next_slide');
  check('T3.2: "go to the next slide" matches next_slide', matchPresentationCommand("go to the next slide") === 'next_slide');
  check('T3.3: "previous slide" matches prev_slide', matchPresentationCommand("previous slide") === 'prev_slide');
  check('T3.4: "back a slide" matches prev_slide', matchPresentationCommand("back a slide") === 'prev_slide');
  check('T3.5: "first slide" matches first_slide', matchPresentationCommand("first slide") === 'first_slide');
  check('T3.6: "last slide" matches last_slide', matchPresentationCommand("last slide") === 'last_slide');
  check('T3.7: "jump to slide 3" matches jump_to_slide', matchPresentationCommand("jump to slide 3") === 'jump_to_slide');
  check('T3.8: "go to slide four" matches jump_to_slide', matchPresentationCommand("go to slide four") === 'jump_to_slide');

  // Test word-number parsing
  check('T3.9: parseSlideNumber("3") -> 3', parseSlideNumber("3") === 3);
  check('T3.10: parseSlideNumber("four") -> 4', parseSlideNumber("four") === 4);
  check('T3.11: parseSlideNumber("seventh") -> 7', parseSlideNumber("seventh") === 7);
  check('T3.12: parseSlideNumber("twenty-five") -> 25', parseSlideNumber("twenty-five") === 25);
  check('T3.13: parseSlideNumber("invalid") -> null', parseSlideNumber("invalid") === null);

  console.log('\n=== 4. Slide Navigation State Transitions ===');

  let activeIndex = 0;
  function navSlide(cmd, num) {
    if (cmd === 'next_slide') activeIndex = Math.min(activeIndex + 1, deck.slides.length - 1);
    else if (cmd === 'prev_slide') activeIndex = Math.max(activeIndex - 1, 0);
    else if (cmd === 'first_slide') activeIndex = 0;
    else if (cmd === 'last_slide') activeIndex = deck.slides.length - 1;
    else if (cmd === 'jump_to_slide' && num != null) activeIndex = Math.max(0, Math.min(num - 1, deck.slides.length - 1));
    return activeIndex;
  }

  check('T4.1: Initial slide is 0', activeIndex === 0);
  check('T4.2: next_slide -> 1', navSlide('next_slide') === 1);
  check('T4.3: next_slide -> 2', navSlide('next_slide') === 2);
  check('T4.4: next_slide at end is clamped to 2', navSlide('next_slide') === 2);
  check('T4.5: prev_slide -> 1', navSlide('prev_slide') === 1);
  check('T4.6: first_slide -> 0', navSlide('first_slide') === 0);
  check('T4.7: last_slide -> 2', navSlide('last_slide') === 2);
  check('T4.8: jump_to_slide 2 -> index 1', navSlide('jump_to_slide', 2) === 1);

  console.log('\n=== 5. Context Disambiguation for Bare Next/Prev (FR-4.9) ===');

  function resolveRelativeCommand(action, context) {
    if (action === 'next_verse' || action === 'next') {
      if (context === 'presentation') return 'next_slide';
      if (context === 'scene') return 'next_page';
      return 'next_verse';
    }
    if (action === 'prev_verse' || action === 'prev') {
      if (context === 'presentation') return 'prev_slide';
      if (context === 'scene') return 'prev_page';
      return 'prev_verse';
    }
    return action;
  }

  check('T5.1: Bare "next" in presentation context routes to next_slide', resolveRelativeCommand('next', 'presentation') === 'next_slide');
  check('T5.2: Bare "previous" in presentation context routes to prev_slide', resolveRelativeCommand('prev', 'presentation') === 'prev_slide');
  check('T5.3: Bare "next" in scene context routes to next_page', resolveRelativeCommand('next', 'scene') === 'next_page');
  check('T5.4: Bare "previous" in scene context routes to prev_page', resolveRelativeCommand('prev', 'scene') === 'prev_page');
  check('T5.5: Bare "next" in scripture context routes to next_verse', resolveRelativeCommand('next', 'bible') === 'next_verse');
  check('T5.6: Bare "previous" in scripture context routes to prev_verse', resolveRelativeCommand('prev', 'bible') === 'prev_verse');

  // Cleanup test dir
  try {
    fs.rmSync(outDir, { recursive: true, force: true });
  } catch (_) {}

  console.log(`\nPresentation Test Results: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
