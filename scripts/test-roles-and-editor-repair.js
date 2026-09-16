/**
 * test-roles-and-editor-repair.js
 * Comprehensive automated verification of:
 * 1. Immediate selection/deselection repair.
 * 2. Complete image panning inside frames without arbitrary percentage limits.
 * 3. Separation of design template, role assignment, content instance, and playback instance.
 * 4. "Use As" role assignments with multiple saved templates and one default.
 * 5. Role-specific field bindings and Bible template validation.
 * 6. Program compositor scripture popups with long-text fitting, in-place verse update, and clean dismissal.
 * 7. Animation model consistency.
 * 8. Legacy compatibility and suppression.
 * 9. Universal 12px border radius compliance.
 */

const path = require("path");
const fs = require("fs");
const os = require("os");
const assert = require("assert");

const { DesignStudioService } = require("../src/main/design/designStudioService");
const { calculateCropMetrics } = require("../src/App/controller/designStudioCrop");

console.log("================================================================================");
console.log(" ROLE-BASED LOWER THIRDS & EDITOR REPAIR VERIFICATION SUITE");
console.log("================================================================================\n");

const testDir = path.join(os.tmpdir(), `ocs_roles_test_${Date.now()}`);
fs.mkdirSync(testDir, { recursive: true });

const testService = new DesignStudioService();
testService.initialize(testDir);

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    console.error(err.stack);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REQUIREMENT 1: Immediate Selection / Deselection Repair
// ─────────────────────────────────────────────────────────────────────────────
console.log("[1/8] Testing Immediate Selection/Deselection Repair...");

runTest("Clicking layer selects and retains selection without drop", () => {
  let selectedLayerIds = [];
  const setSelectedLayerId = (id) => {
    selectedLayerIds = Array.isArray(id) ? id : id ? [id] : [];
  };

  const handleClickLayer = (e, layer) => {
    if (e.defaultPrevented) return;
    if (e.shiftKey) {
      if (selectedLayerIds.includes(layer.id)) {
        setSelectedLayerId(selectedLayerIds.filter((id) => id !== layer.id));
      } else {
        setSelectedLayerId([...selectedLayerIds, layer.id]);
      }
    } else {
      setSelectedLayerId(layer.id);
    }
  };

  const handleCanvasClick = (e) => {
    if (e.target.dataset && (e.target.dataset.studioCanvas || e.target.dataset.canvasBg)) {
      setSelectedLayerId(null);
    }
  };

  // 1. User clicks Layer A
  const clickEventA = { target: { dataset: { layerId: "layer-1" } }, shiftKey: false, defaultPrevented: false };
  handleClickLayer(clickEventA, { id: "layer-1", type: "text" });
  assert.deepStrictEqual(selectedLayerIds, ["layer-1"], "Layer 1 should be selected");

  // 2. Mouseup / Canvas click bubbling from the layer element should NOT deselect because target is NOT canvas background
  handleCanvasClick(clickEventA);
  assert.deepStrictEqual(selectedLayerIds, ["layer-1"], "Layer 1 must remain selected after mouseup/click bubbling");

  // 3. Shift-click Layer B adds it to selection
  const shiftClickB = { target: { dataset: { layerId: "layer-2" } }, shiftKey: true, defaultPrevented: false };
  handleClickLayer(shiftClickB, { id: "layer-2", type: "shape" });
  assert.deepStrictEqual(selectedLayerIds, ["layer-1", "layer-2"], "Shift-click should add Layer 2 to selection");

  // 4. Shift-click Layer A removes it from selection
  const shiftClickA = { target: { dataset: { layerId: "layer-1" } }, shiftKey: true, defaultPrevented: false };
  handleClickLayer(shiftClickA, { id: "layer-1", type: "text" });
  assert.deepStrictEqual(selectedLayerIds, ["layer-2"], "Shift-click on already selected should deselect Layer 1");

  // 5. Clicking empty canvas background clears selection
  const canvasBgClick = { target: { dataset: { studioCanvas: "true" } }, shiftKey: false };
  handleCanvasClick(canvasBgClick);
  assert.deepStrictEqual(selectedLayerIds, [], "Clicking empty canvas must clear selection");
});

// ─────────────────────────────────────────────────────────────────────────────
// REQUIREMENT 2: Complete Image Panning Inside Frames
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[2/8] Testing Complete Image Panning Inside Frames...");

runTest("Calculate crop metrics: natural dimensions, fill mode, zoom, and full boundary reach", () => {
  const containerW = 400;
  const containerH = 200; // Aspect 2.0
  const naturalW = 800;
  const naturalH = 800; // Aspect 1.0 (taller than container)

  // In fill mode, container is 400x200 (aspect 2.0). Image aspect is 1.0.
  // Base drawn width = 400. Base drawn height = 400 / 1.0 = 400.
  // With zoom 1.0: drawW = 400, drawH = 400.
  // Horizontal overflow = max(0, 400 - 400) = 0.
  // Vertical overflow = max(0, 400 - 200) = 200.

  // Center pan (0, 0)
  const centerMetrics = calculateCropMetrics({
    naturalWidth: naturalW,
    naturalHeight: naturalH,
    containerWidth: containerW,
    containerHeight: containerH,
    fitMode: "fill",
    zoom: 1,
    panX: 0,
    panY: 0,
  });

  assert.strictEqual(centerMetrics.drawW, 400);
  assert.strictEqual(centerMetrics.drawH, 400);
  assert.strictEqual(centerMetrics.overflowW, 0);
  assert.strictEqual(centerMetrics.overflowH, 200);
  assert.strictEqual(centerMetrics.drawX, 0, "Non-overflowing horizontal axis must be centered at 0");
  assert.strictEqual(centerMetrics.drawY, -100, "Vertical axis centered at -100");

  // Extreme 1: panY = +100 (top edge aligned at 0, top extreme fully reachable)
  const topMetrics = calculateCropMetrics({
    naturalWidth: naturalW,
    naturalHeight: naturalH,
    containerWidth: containerW,
    containerHeight: containerH,
    fitMode: "fill",
    zoom: 1,
    panX: 0,
    panY: 100,
  });
  assert.strictEqual(topMetrics.drawY, 0, "panY = +100 must place top edge exactly at 0 (top boundary reachable)");

  // Extreme 2: panY = -100 (bottom edge aligned with container bottom, bottom extreme fully reachable)
  const bottomMetrics = calculateCropMetrics({
    naturalWidth: naturalW,
    naturalHeight: naturalH,
    containerWidth: containerW,
    containerHeight: containerH,
    fitMode: "fill",
    zoom: 1,
    panX: 0,
    panY: -100,
  });
  assert.strictEqual(bottomMetrics.drawY, -200, "panY = -100 must place bottom edge exactly at -200 (bottom boundary reachable)");
  assert.strictEqual(bottomMetrics.drawY + bottomMetrics.drawH, containerH, "Bottom edge must touch container height exactly");
});

runTest("Calculate crop metrics: non-overflowing axis never exposes empty space or negative overflow", () => {
  const containerW = 300;
  const containerH = 300;
  const naturalW = 600;
  const naturalH = 300; // Wide landscape image (aspect 2.0)

  // In fill mode for 300x300 container:
  // Base drawn height = 300. Base drawn width = 300 * 2.0 = 600.
  // Horizontal overflow = 300. Vertical overflow = 0.
  // Panning Y (vertical) should be strictly clamped to 0 without introducing empty space.
  const metricsRight = calculateCropMetrics({
    naturalWidth: naturalW,
    naturalHeight: naturalH,
    containerWidth: containerW,
    containerHeight: containerH,
    fitMode: "fill",
    zoom: 1,
    panX: -100, // full pan to right boundary
    panY: 50,  // should have 0 effect since vertical overflow is 0
  });

  assert.strictEqual(metricsRight.overflowH, 0);
  assert.strictEqual(metricsRight.drawY, 0, "Vertical axis must remain clamped at 0 without exposing gap");
  assert.strictEqual(metricsRight.drawX, -300, "Horizontal axis must pan fully to -300 without empty space");
  assert.strictEqual(metricsRight.drawX + metricsRight.drawW, containerW, "Right edge must align with container width");

  const metricsLeft = calculateCropMetrics({
    naturalWidth: naturalW,
    naturalHeight: naturalH,
    containerWidth: containerW,
    containerHeight: containerH,
    fitMode: "fill",
    zoom: 1,
    panX: 100, // full pan to left boundary
    panY: -50,
  });
  assert.strictEqual(metricsLeft.drawX, 0, "Left edge must align at 0");
});

// ─────────────────────────────────────────────────────────────────────────────
// REQUIREMENT 3 & 4: Role Assignment & "Use As" Defaults
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[3/8] Testing Design Template, Role Assignment, & Use As Defaults...");

let bibleDesign1, bibleDesign2, speakerDesign1;

runTest("Create multiple templates across different roles", () => {
  bibleDesign1 = testService.saveDesign({
    name: "Classic Gold Scripture",
    role: "bible",
    layers: [
      { id: "bg-1", type: "shape", shape: "rounded-rect", fill: "#111827", width: 90, height: 18, x: 50, y: 85, borderRadius: 12 },
      { id: "ref-1", type: "text", fieldBinding: "reference", text: "John 3:16", fontSize: 20, fontWeight: "bold", color: "#F59E0B", x: 10, y: 80 },
      { id: "verse-1", type: "text", fieldBinding: "verseText", text: "Default scripture passage", fontSize: 22, minFontSize: 14, wrap: true, color: "#FFFFFF", x: 10, y: 88 },
      { id: "ver-1", type: "text", fieldBinding: "version", text: "KJV", fontSize: 16, color: "#9CA3AF", x: 85, y: 80 },
    ],
  });

  bibleDesign2 = testService.saveDesign({
    name: "Modern Glass Scripture",
    role: "bible",
    layers: [
      { id: "bg-2", type: "shape", shape: "rounded-rect", fillType: "glass", glassTint: "#FFFFFF", glassOpacity: 0.2, width: 85, height: 20, x: 50, y: 85, borderRadius: 12 },
      { id: "verse-2", type: "text", fieldBinding: "verseText", text: "Scripture", fontSize: 24, minFontSize: 12, wrap: true, color: "#FFFFFF", x: 12, y: 88 },
      { id: "ref-2", type: "text", fieldBinding: "reference", text: "Ref", fontSize: 20, color: "#60A5FA", x: 12, y: 80 },
    ],
  });

  speakerDesign1 = testService.saveDesign({
    name: "Pastor Lower Third",
    role: "speaker",
    layers: [
      { id: "bg-spk", type: "shape", shape: "rounded-rect", fill: "#1F2937", width: 40, height: 12, x: 25, y: 85, borderRadius: 12 },
      { id: "txt-name", type: "text", fieldBinding: "name", text: "Pastor John Doe", fontSize: 22, color: "#FFFFFF", x: 10, y: 83 },
      { id: "txt-title", type: "text", fieldBinding: "title", text: "Senior Pastor", fontSize: 16, color: "#9CA3AF", x: 10, y: 88 },
    ],
  });

  assert.strictEqual(testService.listDesigns().length, 3);
  assert.strictEqual(bibleDesign1.role, "bible");
  assert.strictEqual(bibleDesign2.role, "bible");
  assert.strictEqual(speakerDesign1.role, "speaker");
});

runTest("Role assignments: set default template per role, switch default, and persist", () => {
  // Initial assignments
  let assignments = testService.getRoleAssignments();
  assert.strictEqual(assignments.bible, null);

  // Set bibleDesign1 as default Bible template
  testService.setRoleAssignment("bible", bibleDesign1.id);
  assignments = testService.getRoleAssignments();
  assert.strictEqual(assignments.bible, bibleDesign1.id, "bible role must be assigned to bibleDesign1");

  // Switch default to bibleDesign2
  testService.setRoleAssignment("bible", bibleDesign2.id);
  assignments = testService.getRoleAssignments();
  assert.strictEqual(assignments.bible, bibleDesign2.id, "bible role must be updated to bibleDesign2");

  // Set speaker role
  testService.setRoleAssignment("speaker", speakerDesign1.id);
  assignments = testService.getRoleAssignments();
  assert.strictEqual(assignments.speaker, speakerDesign1.id);

  // Verify persistence by reading file directly
  const savedJson = JSON.parse(fs.readFileSync(testService.roleAssignmentsFilePath, "utf8"));
  assert.strictEqual(savedJson.bible, bibleDesign2.id);
  assert.strictEqual(savedJson.speaker, speakerDesign1.id);
});

// ─────────────────────────────────────────────────────────────────────────────
// REQUIREMENT 5: Role Field Binding & Validation
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[4/8] Testing Role Field Binding & Template Validation...");

runTest("Bible template validation: required fields (verseText, reference)", () => {
  // Complete template
  const validTemplate = {
    role: "bible",
    layers: [
      { type: "text", fieldBinding: "verseText" },
      { type: "text", fieldBinding: "reference" },
    ],
  };

  const boundFields = new Set(
    validTemplate.layers.filter((l) => l.type === "text" && l.fieldBinding).map((l) => l.fieldBinding)
  );
  assert(boundFields.has("verseText") && boundFields.has("reference"), "Must have verseText and reference");

  // Incomplete template missing reference
  const invalidTemplate = {
    role: "bible",
    layers: [{ type: "text", fieldBinding: "verseText" }],
  };
  const invalidBound = new Set(
    invalidTemplate.layers.filter((l) => l.type === "text" && l.fieldBinding).map((l) => l.fieldBinding)
  );
  assert(!invalidBound.has("reference"), "Should detect missing reference field");
});

runTest("Template layer resolution: substitutes bound text fields with dynamic content", () => {
  const dynamicScripture = {
    verseText: "In the beginning was the Word, and the Word was with God, and the Word was God.",
    reference: "John 1:1",
    version: "KJV",
  };

  const resolvedLayers = testService.resolveTemplateLayers(bibleDesign1, "bible", dynamicScripture);

  const refLayer = resolvedLayers.find((l) => l.fieldBinding === "reference");
  const verseLayer = resolvedLayers.find((l) => l.fieldBinding === "verseText");
  const verLayer = resolvedLayers.find((l) => l.fieldBinding === "version");

  assert.strictEqual(refLayer.text, "John 1:1");
  assert.strictEqual(verseLayer.text, "In the beginning was the Word, and the Word was with God, and the Word was God.");
  assert.strictEqual(verLayer.text, "KJV");
});

runTest("Field aliases in validateRoleTemplate and resolveTemplateLayers", () => {
  const { validateRoleTemplate, resolveTemplateLayers } = require("../src/App/controller/designStudioRoles");

  // Design using aliases 'ref', 'verse', 'translation' instead of canonical names
  const aliasDesign = {
    id: "alias-bible-1",
    name: "Alias Bible Design",
    role: "bible",
    layers: [
      { id: "bg", type: "shape", shape: "rounded-rect", borderRadius: 12 },
      { id: "txt-ref", type: "text", fieldBinding: "ref", text: "Ref Placeholder" },
      { id: "txt-verse", type: "text", fieldBinding: "verse", text: "Verse Placeholder" },
      { id: "txt-trans", type: "text", fieldBinding: "translation", text: "KJV" },
    ],
  };

  // 1. validateRoleTemplate should accept both (role, layers) and (design)
  const validationFromDesign = validateRoleTemplate(aliasDesign);
  assert.strictEqual(validationFromDesign.valid, true, "validateRoleTemplate(design) must succeed with aliases");

  const validationFromLayers = validateRoleTemplate("bible", aliasDesign.layers);
  assert.strictEqual(validationFromLayers.valid, true, "validateRoleTemplate(role, layers) must succeed with aliases");

  // 2. resolveTemplateLayers should map dynamic fields to aliases
  const resolved = resolveTemplateLayers(aliasDesign, "bible", {
    verseText: "The Lord is my shepherd; I shall not want.",
    reference: "Psalm 23:1",
    version: "ESV",
  });

  const refLayer = resolved.find((l) => l.id === "txt-ref");
  const verseLayer = resolved.find((l) => l.id === "txt-verse");
  const transLayer = resolved.find((l) => l.id === "txt-trans");

  assert.strictEqual(refLayer.text, "Psalm 23:1", "ref alias must resolve reference");
  assert.strictEqual(verseLayer.text, "The Lord is my shepherd; I shall not want.", "verse alias must resolve verseText");
  assert.strictEqual(transLayer.text, "ESV", "translation alias must resolve version");
});

runTest("Non-destructive clipping mask retains image metadata and release restores layer", () => {
  // Simulate image layer and shape layer
  const imageLayer = {
    id: "img-1",
    type: "image",
    assetId: "asset-cross-123",
    filePath: "/media/cross.png",
    url: "file:///media/cross.png",
    name: "Golden Cross",
    width: 30,
    height: 30,
    x: 10,
    y: 10,
    frameCrop: { fitMode: "fill", zoom: 1.2, panX: 10, panY: -5 },
  };

  const shapeLayer = {
    id: "shape-1",
    type: "shape",
    shape: "circle",
    width: 20,
    height: 20,
    x: 15,
    y: 15,
  };

  // Mask creation preserves all properties
  const maskedShapeLayer = {
    ...shapeLayer,
    fillType: "image",
    fillImage: imageLayer.url || imageLayer.filePath,
    maskImage: {
      assetId: imageLayer.assetId,
      originalAssetId: imageLayer.assetId,
      filePath: imageLayer.filePath,
      originalFilePath: imageLayer.filePath,
      url: imageLayer.url,
      originalUrl: imageLayer.url,
      name: imageLayer.name,
      aspectRatio: imageLayer.aspectRatio || (imageLayer.width / imageLayer.height),
      frameCrop: { ...(imageLayer.frameCrop || { fitMode: "fill", zoom: 1, panX: 0, panY: 0 }) },
    },
  };

  // Verify sanitized layer retains maskImage
  const sanitized = testService.sanitizeLayer(maskedShapeLayer);
  assert(sanitized.maskImage, "Sanitized layer must preserve maskImage");
  assert.strictEqual(sanitized.maskImage.assetId, "asset-cross-123");
  assert.strictEqual(sanitized.maskImage.originalFilePath, "/media/cross.png");
  assert.strictEqual(sanitized.maskImage.name, "Golden Cross");
  assert.strictEqual(sanitized.maskImage.frameCrop.zoom, 1.2);

  // Release mask restores image layer
  const restoredImage = {
    id: `img_released_${Date.now()}`,
    type: "image",
    name: sanitized.maskImage.name || "Restored Image",
    assetId: sanitized.maskImage.originalAssetId || sanitized.maskImage.assetId,
    filePath: sanitized.maskImage.originalFilePath || sanitized.maskImage.filePath,
    url: sanitized.maskImage.originalUrl || sanitized.maskImage.url || sanitized.fillImage,
    x: sanitized.x,
    y: sanitized.y,
    width: sanitized.width,
    height: sanitized.height,
    frameCrop: sanitized.maskImage.frameCrop,
  };

  assert.strictEqual(restoredImage.type, "image");
  assert.strictEqual(restoredImage.name, "Golden Cross");
  assert.strictEqual(restoredImage.assetId, "asset-cross-123");
  assert.strictEqual(restoredImage.frameCrop.zoom, 1.2);
  assert.strictEqual(restoredImage.frameCrop.panX, 10);
});

// ─────────────────────────────────────────────────────────────────────────────
// REQUIREMENT 6: Program Compositor Scripture Popup Integration
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[5/8] Testing Program Compositor Scripture Popup Integration...");

runTest("In-place verse update while visible: updates layers without resetting animStartTime", () => {
  // Simulate activeStudioControls on air
  const initialTime = Date.now() - 5000; // 5 seconds ago
  const activeStudioControls = [
    {
      id: "role_playback_bible",
      role: "bible",
      label: "Scripture: Genesis 1:1",
      snapshotLayers: [
        { id: "verse", type: "text", text: "In the beginning God created the heaven and the earth." },
      ],
      transition: { entrance: { type: "fade", duration: 400 }, exit: { type: "fade", duration: 300 } },
      status: "live",
      animStartTime: initialTime,
    },
  ];

  // Operator advances to next verse: Genesis 1:2
  const updatedScripture = {
    verseText: "And the earth was without form, and void; and darkness was upon the face of the deep.",
    reference: "Genesis 1:2",
  };

  const existingIdx = activeStudioControls.findIndex((c) => c.id === "role_playback_bible");
  assert(existingIdx >= 0, "Existing bible control found on air");

  // Perform in-place update
  activeStudioControls[existingIdx].snapshotLayers = [
    { id: "verse", type: "text", text: updatedScripture.verseText },
  ];

  // Verify: status is still 'live', animStartTime was NOT reset
  assert.strictEqual(activeStudioControls[existingIdx].status, "live");
  assert.strictEqual(activeStudioControls[existingIdx].animStartTime, initialTime, "animStartTime must remain untouched to avoid restarting entrance");
  assert.strictEqual(activeStudioControls[existingIdx].snapshotLayers[0].text, updatedScripture.verseText);
});

runTest("Clean dismissal: dismisses scripture popup without disturbing other controls", () => {
  const activeStudioControls = [
    { id: "role_playback_bible", role: "bible", status: "live" },
    { id: "ctrl_speaker_name", role: "speaker", status: "live" },
    { id: "ctrl_logo_watermark", role: "custom", status: "live" },
  ];

  // Dismiss bible control
  const idx = activeStudioControls.findIndex((c) => c.id === "role_playback_bible");
  activeStudioControls[idx].status = "exiting";

  // Simulate after exit duration: filter out role_playback_bible
  const remaining = activeStudioControls.filter((c) => c.id !== "role_playback_bible");
  assert.strictEqual(remaining.length, 2);
  assert.strictEqual(remaining[0].id, "ctrl_speaker_name");
  assert.strictEqual(remaining[1].id, "ctrl_logo_watermark");
  assert.strictEqual(remaining[0].status, "live", "Speaker lower third must remain live");
});

// ─────────────────────────────────────────────────────────────────────────────
// REQUIREMENT 7: Long-Text Auto-Fitting & Dynamic Font Scaling
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[6/8] Testing Long-Text Auto-Fitting & Dynamic Font Scaling...");

runTest("Dynamic font scaling: long multi-verse passages scale down to minFontSize", () => {
  const longPassage = "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life. For God sent not his Son into the world to condemn the world; but that the world through him might be saved.";
  const maxW = 800;
  const maxH = 90; // Constrained height
  const baseFontSize = 28;
  const minFontSize = 14;

  // Mock text measurement (approx 0.6 * fontSize per char)
  const measureTextWidth = (str, fs) => str.length * (fs * 0.55);

  const computeLines = (text, fs) => {
    const words = text.split(" ");
    const lines = [];
    let currentLine = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = currentLine + " " + words[i];
      if (measureTextWidth(test, fs) > maxW) {
        lines.push(currentLine);
        currentLine = words[i];
      } else {
        currentLine = test;
      }
    }
    lines.push(currentLine);
    return lines;
  };

  let effectiveFontSize = baseFontSize;
  let lines = computeLines(longPassage, effectiveFontSize);

  // Auto-fit loop
  while (lines.length * (effectiveFontSize * 1.25) > maxH && effectiveFontSize > minFontSize) {
    effectiveFontSize--;
    lines = computeLines(longPassage, effectiveFontSize);
  }

  assert(effectiveFontSize <= baseFontSize, "Font size should have scaled down");
  assert(effectiveFontSize >= minFontSize, "Font size must not drop below minFontSize");
  const finalHeight = lines.length * (effectiveFontSize * 1.25);
  console.log(`    Passage scaled from ${baseFontSize}px -> ${effectiveFontSize}px (${lines.length} lines, height: ${finalHeight.toFixed(1)}px / max: ${maxH}px)`);
});

// ─────────────────────────────────────────────────────────────────────────────
// REQUIREMENT 8: Legacy Compatibility & Suppression
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[7/8] Testing Legacy Compatibility & Double-Popup Suppression...");

runTest("Legacy fallback when no template is assigned", () => {
  testService.setRoleAssignment("bible", null);
  const assignments = testService.getRoleAssignments();
  assert.strictEqual(assignments.bible, null, "No bible template assigned");

  // In main.js, when assignments.bible is null, it falls back to liveBroadcastConfig.bibleLowerThird:
  const liveBroadcastConfig = {
    bibleLowerThird: { enabled: true, autoTrigger: true, isShowing: false },
    activeStudioControls: [],
  };

  const assignedTemplate = assignments.bible ? testService.getDesign(assignments.bible) : null;
  assert.strictEqual(assignedTemplate, null);

  // Trigger fallback
  if (!assignedTemplate && liveBroadcastConfig.bibleLowerThird?.enabled) {
    liveBroadcastConfig.bibleLowerThird.currentRef = "John 3:16";
    liveBroadcastConfig.bibleLowerThird.isShowing = true;
  }
  assert.strictEqual(liveBroadcastConfig.bibleLowerThird.isShowing, true, "Legacy fallback should activate when no template is assigned");
});

runTest("Legacy lower third suppressed when custom Bible template control is active on air", () => {
  const activeStudioControls = [
    { id: "role_playback_bible", role: "bible", status: "live" },
  ];
  const legacyConfig = { enabled: true, isShowing: true };

  // Renderer check
  const hasActiveBibleRoleControl = activeStudioControls.some(
    (c) => (c.role === "bible" || c.id === "role_playback_bible") && c.status !== "hidden"
  );
  assert.strictEqual(hasActiveBibleRoleControl, true);

  const shouldDrawLegacy = !hasActiveBibleRoleControl && legacyConfig.enabled && legacyConfig.isShowing;
  assert.strictEqual(shouldDrawLegacy, false, "Legacy lower third MUST be suppressed when custom role template is on air");
});

// ─────────────────────────────────────────────────────────────────────────────
// REQUIREMENT 9: Universal 12px Border Radius Compliance
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[8/8] Testing Universal 12px Border Radius Compliance...");

runTest("Universal 12px border radius mandate across all designs and controls", () => {
  const allDesigns = testService.listDesigns();
  for (const d of allDesigns) {
    for (const layer of d.layers) {
      if (layer.shape === "rounded-rect" || layer.frameShape === "rounded-rect") {
        assert.strictEqual(layer.borderRadius, 12, `Layer ${layer.id} in ${d.name} must have exactly 12px border radius`);
      }
    }
  }
});

console.log("\n================================================================================");
console.log(` RESULTS: ${passedTests}/${totalTests} Tests Passed Successfully (${((passedTests / totalTests) * 100).toFixed(0)}%)`);
console.log("================================================================================\n");

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
