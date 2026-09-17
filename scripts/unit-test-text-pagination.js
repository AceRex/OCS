/**
 * unit-test-text-pagination.js
 * 
 * Validates the text pagination, auto-fit, vertical alignment, and padding logic
 * without requiring Electron. Uses a mock canvas context.
 */

"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

// ─── Mock Canvas Context ──────────────────────────────────────────────────────

function makeMockCtx() {
  const drawn = [];
  const saved = [];
  let font = "";
  let textAlign = "left";
  let textBaseline = "middle";
  let fillStyle = "#fff";

  return {
    get font() { return font; },
    set font(v) { font = v; },
    get textAlign() { return textAlign; },
    set textAlign(v) { textAlign = v; },
    get textBaseline() { return textBaseline; },
    set textBaseline(v) { textBaseline = v; },
    get fillStyle() { return fillStyle; },
    set fillStyle(v) { fillStyle = v; },
    shadowColor: "transparent",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    filter: "none",
    globalAlpha: 1,
    save: () => saved.push({}),
    restore: () => saved.pop(),
    beginPath: () => {},
    rect: () => {},
    clip: () => {},
    fillText: (text, x, y) => drawn.push({ text, x, y }),
    measureText: (text) => ({ width: text.length * 8 }), // 8px per char
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    drawn,
  };
}

// ─── Replicate the exact pagination logic from SwitcherProgramCanvas.js ──────

function simulateTextRender(layer, w, h, currentPage = 0) {
  const ctx = makeMockCtx();
  const xPct = typeof layer.x === "number" ? layer.x : 50;
  const yPct = typeof layer.y === "number" ? layer.y : 50;
  const wPct = typeof layer.width === "number" ? layer.width : 35;
  const hPct = typeof layer.height === "number" ? layer.height : 10;

  const layerW = (w * wPct) / 100;
  const layerH = (h * hPct) / 100;

  const text = layer.textTransform === "uppercase" ? layer.text.toUpperCase() : layer.text;
  const baseFontSize = Math.round((layer.fontSize || 22) * (h / 720));
  const minFontSize = Math.round((layer.minFontSize || 12) * (h / 720));
  const fontWeight = layer.fontWeight || "bold";
  const fontFamily = layer.fontFamily || "Inter, sans-serif";
  const lineSpacing = typeof layer.lineSpacing === "number" ? layer.lineSpacing : 1.25;
  const padPx = Math.round((typeof layer.padding === "number" ? layer.padding : 0) * (h / 720));
  const shouldWrap = layer.wrap !== false;

  ctx.textAlign = layer.textAlign || "left";

  const innerW = Math.max(1, layerW - padPx * 2);
  const innerH = Math.max(1, layerH - padPx * 2);
  const maxW = innerW > 0 ? innerW : 9999;
  const maxH = innerH > 0 ? innerH : 9999;

  const breakTextIntoLines = (fs) => {
    ctx.font = `${fontWeight} ${fs}px ${fontFamily}`;
    const lines = [];
    const rawLines = String(text).split("\n");
    for (const rawLine of rawLines) {
      if (!shouldWrap || maxW <= 0) {
        lines.push(rawLine);
        continue;
      }
      const words = rawLine.split(" ");
      if (words.length <= 1) {
        lines.push(rawLine);
      } else {
        let currentLine = words[0];
        for (let wIdx = 1; wIdx < words.length; wIdx++) {
          const testLine = currentLine + " " + words[wIdx];
          if (ctx.measureText(testLine).width > maxW) {
            lines.push(currentLine);
            currentLine = words[wIdx];
          } else {
            currentLine = testLine;
          }
        }
        lines.push(currentLine);
      }
    }
    return lines;
  };

  let effectiveFontSize = baseFontSize;
  let allLines = breakTextIntoLines(effectiveFontSize);

  if (layer.autoFit !== false && layerH > 0 && allLines.length * (effectiveFontSize * lineSpacing) > maxH) {
    while (effectiveFontSize > minFontSize) {
      effectiveFontSize = Math.max(minFontSize, effectiveFontSize - 1);
      allLines = breakTextIntoLines(effectiveFontSize);
      if (allLines.length * (effectiveFontSize * lineSpacing) <= maxH) {
        break;
      }
    }
  }

  const lineHeight = effectiveFontSize * lineSpacing;
  const linesPerPage = Math.max(1, Math.floor(maxH / lineHeight));

  layer._currentPage = currentPage;
  const totalPages = Math.ceil(allLines.length / linesPerPage);
  const pageStart = currentPage * linesPerPage;
  const renderLines = allLines.slice(pageStart, pageStart + linesPerPage);

  const totalTextH = renderLines.length * lineHeight;
  const vertAlign = layer.verticalAlign || "top";
  let baselineY;
  if (vertAlign === "middle") {
    baselineY = -totalTextH / 2 + lineHeight / 2;
  } else if (vertAlign === "bottom") {
    baselineY = innerH / 2 - totalTextH + lineHeight / 2;
  } else {
    baselineY = -innerH / 2 + lineHeight / 2;
  }

  ctx.font = `${fontWeight} ${effectiveFontSize}px ${fontFamily}`;
  renderLines.forEach((line, i) => {
    ctx.drawn.push({ text: line, x: 0, y: baselineY + i * lineHeight });
  });

  if (totalPages > 1) {
    layer._totalPages = totalPages;
  } else {
    delete layer._totalPages;
    delete layer._currentPage;
  }

  return {
    allLines,
    renderLines,
    effectiveFontSize,
    baseFontSize,
    lineHeight,
    linesPerPage,
    totalPages,
    baselineY,
    drawn: ctx.drawn,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

console.log("\n================================================================================");
console.log(" TEXT PAGINATION & AUTO-FIT UNIT TESTS");
console.log("================================================================================\n");

// Test 1: Short verse that fits in one page
test("Short verse fits without pagination", () => {
  const layer = {
    type: "text",
    text: "For God so loved the world.",
    x: 50, y: 80, width: 80, height: 10,
    fontSize: 22, minFontSize: 12,
    fontWeight: "bold",
  };
  const result = simulateTextRender(layer, 1280, 720);
  assert.strictEqual(result.totalPages, 1, "Short verse should not need pagination");
  assert.ok(result.renderLines.length >= 1, "Should render at least one line");
  assert.ok(!layer._totalPages, "Should not annotate _totalPages for single-page");
});

// Test 2: Long verse forces pagination (not truncation)
test("Long verse paginates instead of truncating", () => {
  const longVerse =
    "In the beginning God created the heavens and the earth. Now the earth was formless and empty, " +
    "darkness was over the surface of the deep, and the Spirit of God was hovering over the waters. " +
    "And God said, Let there be light, and there was light. God saw that the light was good, and he " +
    "separated the light from the darkness. God called the light day, and the darkness he called night. " +
    "And there was evening, and there was morning the first day.";
  const layer = {
    type: "text",
    text: longVerse,
    x: 50, y: 85, width: 80, height: 8, // narrow box to force overflow
    fontSize: 22, minFontSize: 14,
    fontWeight: "bold",
  };
  const result = simulateTextRender(layer, 1280, 720);
  assert.ok(result.totalPages >= 2, `Long verse should paginate (got ${result.totalPages} pages)`);
  assert.ok(layer._totalPages >= 2, "Should annotate _totalPages for multi-page content");
  // Verify no "..." truncation marker — pagination should avoid this
  const lastLine = result.renderLines[result.renderLines.length - 1];
  assert.ok(!lastLine.endsWith("..."), `Last rendered line should NOT be truncated with ellipsis: "${lastLine}"`);
});

// Test 3: Page 2 renders correct content
test("Page 2 renders second page content correctly", () => {
  const words = [];
  for (let i = 0; i < 60; i++) words.push(`word${i}`);
  const layer = {
    type: "text",
    text: words.join(" "),
    x: 50, y: 85, width: 40, height: 6,
    fontSize: 18, minFontSize: 12,
    fontWeight: "bold",
  };
  const result1 = simulateTextRender({ ...layer }, 1280, 720, 0);
  const result2 = simulateTextRender({ ...layer }, 1280, 720, 1);
  assert.ok(result1.totalPages >= 2, "Should have multiple pages");
  assert.notDeepStrictEqual(result1.renderLines, result2.renderLines, "Page 1 and Page 2 should have different lines");
  // Page 2 should start after page 1 ended
  const p1LastLine = result1.renderLines[result1.renderLines.length - 1];
  const p2FirstLine = result2.renderLines[0];
  assert.notStrictEqual(p1LastLine, p2FirstLine, "Page 2 should not repeat page 1 content");
});

// Test 4: Auto-fit scales down font to fit single-page if possible
test("Auto-fit scales font down to avoid pagination when box is tall enough", () => {
  const layer = {
    type: "text",
    text: "Long enough that at 22px it might wrap to many lines but minFont helps.",
    x: 50, y: 85, width: 50, height: 20,  // generous height
    fontSize: 22, minFontSize: 10,
    fontWeight: "bold",
  };
  const result = simulateTextRender(layer, 1280, 720);
  // With auto-fit, font should be ≤ 22
  assert.ok(result.effectiveFontSize <= result.baseFontSize, "Auto-fit should not increase font size");
  assert.ok(result.totalPages === 1, `With generous height, should fit in 1 page (got ${result.totalPages})`);
});

// Test 5: verticalAlign "middle" positions text correctly
test("Vertical alignment 'middle' centers text in box", () => {
  const layer = {
    type: "text",
    text: "Centered",
    x: 50, y: 50, width: 30, height: 10,
    fontSize: 18, verticalAlign: "middle",
    fontWeight: "bold",
  };
  const result = simulateTextRender(layer, 1280, 720);
  // For middle alignment, baselineY should be negative and near 0 for single line
  const lineH = result.lineHeight;
  const expectedBaseY = -lineH / 2 + lineH / 2; // = 0 for single line
  assert.ok(Math.abs(result.baselineY - expectedBaseY) < 1, `Middle baseline should be ~0, got ${result.baselineY}`);
});

// Test 6: verticalAlign "top" puts text at top of box
test("Vertical alignment 'top' places text at top of box", () => {
  const layer = {
    type: "text",
    text: "Top aligned",
    x: 50, y: 50, width: 30, height: 15,
    fontSize: 18, verticalAlign: "top",
    fontWeight: "bold",
  };
  const result = simulateTextRender(layer, 1280, 720);
  const layerH = 1280 * 0.15; // Actually h is 720, so layerH = 720 * 0.15
  const innerH = 720 * 0.15;
  const expectedBaseY = -innerH / 2 + result.lineHeight / 2;
  assert.ok(Math.abs(result.baselineY - expectedBaseY) < 1, `Top baseline mismatch: expected ~${expectedBaseY}, got ${result.baselineY}`);
});

// Test 7: Padding reduces available text width
test("Padding reduces effective text width", () => {
  const noPadLayer = {
    type: "text", text: "Testing padding behavior with some text",
    x: 50, y: 50, width: 30, height: 10,
    fontSize: 18, padding: 0, fontWeight: "bold",
  };
  const padLayer = {
    ...noPadLayer,
    padding: 20,
  };
  const resultNoPad = simulateTextRender(noPadLayer, 1280, 720);
  const resultPad = simulateTextRender(padLayer, 1280, 720);
  // Padding should cause more wrapping (more lines total)
  assert.ok(resultPad.allLines.length >= resultNoPad.allLines.length,
    `Padding should cause equal or more wrapping (noPad=${resultNoPad.allLines.length}, pad=${resultPad.allLines.length})`);
});

// Test 8: autoFit=false should NOT scale down font
test("autoFit=false disables automatic font scaling", () => {
  const layer = {
    type: "text",
    text: "Word ".repeat(50).trim(),
    x: 50, y: 80, width: 30, height: 5,
    fontSize: 22, minFontSize: 12,
    autoFit: false,
    fontWeight: "bold",
  };
  const result = simulateTextRender(layer, 1280, 720);
  const baseFontPx = Math.round(22 * (720 / 720));
  assert.strictEqual(result.effectiveFontSize, baseFontPx, `With autoFit=false, font should stay at ${baseFontPx}px`);
});

// Test 9: JSX syntax of LiveDesignStudioModal — confirm no corrupted text
test("LiveDesignStudioModal.jsx has no corrupted JSX at former line 7582", () => {
  const modalPath = path.join(__dirname, "../src/App/controller/LiveDesignStudioModal.jsx");
  const code = fs.readFileSync(modalPath, "utf8");
  // The corruption was "</div>     style={{"
  assert.ok(
    !code.includes("</div>     style={{"),
    "LiveDesignStudioModal.jsx should not contain corrupted '</div>     style={{'"
  );
  // Verify the overlay block is still present
  assert.ok(
    code.includes("Dedicated Clipped Image Editing Overlay"),
    "The crop overlay comment should still be present"
  );
  // Verify the text layer style is still correct (in the real text div)
  assert.ok(
    code.includes("data-studio-text-content=\"true\""),
    "Text layer div should still have data-studio-text-content attribute"
  );
});

// Test 10: SwitcherProgramCanvas exports setImageLoadCallback
test("SwitcherProgramCanvas exports setImageLoadCallback", () => {
  const canvasPath = path.join(__dirname, "../src/App/controller/SwitcherProgramCanvas.js");
  const code = fs.readFileSync(canvasPath, "utf8");
  assert.ok(
    code.includes("export function setImageLoadCallback"),
    "setImageLoadCallback should be exported"
  );
  assert.ok(
    code.includes("_onImageLoadCallback = cb"),
    "setImageLoadCallback should assign the callback"
  );
  assert.ok(
    code.includes("img.onload = () => { if (_onImageLoadCallback)"),
    "Image load sites should call _onImageLoadCallback"
  );
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log("\n================================================================================");
if (failed === 0) {
  console.log(` ALL ${passed} TESTS PASSED ✓`);
} else {
  console.log(` ${passed} passed, ${failed} FAILED ✗`);
}
console.log("================================================================================\n");

if (failed > 0) process.exit(1);
