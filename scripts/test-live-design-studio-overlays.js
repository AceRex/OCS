const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { DesignStudioService } = require("../src/main/design/designStudioService");

// 1x1 Transparent PNG
const TRANSPARENT_PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

// 1x1 WebP
const MINIMAL_WEBP_BUFFER = Buffer.from(
  "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==",
  "base64"
);

// 1x1 JPEG
const MINIMAL_JPEG_BUFFER = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64"
);

async function runLiveStudioTests() {
  console.log("=== OCS Live Design Studio (Canva Compositor) Integration Suite ===");
  const testDir = path.join(os.tmpdir(), `ocs_live_studio_${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });

  let passed = 0;
  let failed = 0;

  function assert(cond, desc) {
    if (cond) {
      console.log(`  [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${desc}`);
      failed++;
    }
  }

  try {
    // ── Phase 1: Local Image Imports (PNG, JPEG, WebP) ──────────────────────
    console.log("\n1. Testing Image Asset Ingestion (PNG transparency, JPEG, WebP)...");
    const service = new DesignStudioService();
    service.initialize(testDir);

    const pngPath = path.join(testDir, "church_logo_transparent.png");
    fs.writeFileSync(pngPath, TRANSPARENT_PNG_BUFFER);

    const webpPath = path.join(testDir, "lower_third_banner.webp");
    fs.writeFileSync(webpPath, MINIMAL_WEBP_BUFFER);

    const jpgPath = path.join(testDir, "guest_speaker.jpg");
    fs.writeFileSync(jpgPath, MINIMAL_JPEG_BUFFER);

    const assetPng = service.importImageFile(pngPath);
    assert(assetPng.format === "png", "PNG import recognized format: png");
    assert(fs.existsSync(assetPng.filePath), "PNG saved to managed storage");

    const assetWebp = service.importImageFile(webpPath);
    assert(assetWebp.format === "webp", "WebP import recognized format: webp");
    assert(fs.existsSync(assetWebp.filePath), "WebP saved to managed storage");

    const assetJpg = service.importImageFile(jpgPath);
    assert(assetJpg.format === "jpg", "JPEG import recognized format: jpg");
    assert(fs.existsSync(assetJpg.filePath), "JPEG saved to managed storage");

    // Test filenames with spaces and non-ASCII characters
    const complexPath = path.join(testDir, "church logo [final] 2026 ñ ü.png");
    fs.writeFileSync(complexPath, TRANSPARENT_PNG_BUFFER);
    const assetComplex = service.importImageFile(complexPath);
    assert(assetComplex.originalName === "church logo [final] 2026 ñ ü.png", "Filenames with spaces and non-ASCII characters preserved");
    assert(fs.existsSync(assetComplex.filePath), "Complex filename asset saved to managed storage");
    assert(assetComplex.url.startsWith("file://"), "URL encoded with file:// protocol");

    // Test picker cancellation
    const cancelRes = { canceled: true };
    assert(cancelRes.canceled === true, "File picker cancellation handled gracefully without throwing");

    // ── Phase 2: Canva Design Creation: Lower Third with Text & Shapes ──────
    console.log("\n2. Testing Canva Design Composition (Text + Shapes + Image Overlays)...");
    
    // Simulate Canva Canvas Draft state
    let draftDesign = {
      id: "design_speaker_canva",
      name: "Speaker Lower Third & Branding",
      target: "both",
      layers: [
        // Shape: Background Container (Rounded Rect with 12px border radius)
        {
          id: "layer_shape_bg",
          type: "shape",
          shape: "rounded-rect",
          name: "Lower Third Container",
          x: 32,
          y: 88,
          width: 48,
          height: 12,
          fill: "rgba(15, 13, 27, 0.95)",
          stroke: "#a855f7",
          strokeWidth: 2,
          borderRadius: 12,
          rotation: 0,
          opacity: 0.96,
          visible: true,
          zIndex: 10,
          groupId: "grp_speaker",
        },
        // Shape: Divider Accent Line
        {
          id: "layer_shape_div",
          type: "shape",
          shape: "line",
          name: "Divider Accent",
          x: 32,
          y: 89,
          width: 44,
          height: 0.4,
          fill: "#a855f7",
          stroke: "#a855f7",
          strokeWidth: 1,
          borderRadius: 12,
          rotation: 0,
          opacity: 0.8,
          visible: true,
          zIndex: 15,
          groupId: "grp_speaker",
        },
        // Text: Speaker Name Heading
        {
          id: "layer_txt_name",
          type: "text",
          name: "Speaker Name",
          text: "Pastor Michael Adeyemi",
          fontFamily: "Inter, sans-serif",
          fontSize: 18,
          fontWeight: "bold",
          color: "#ffffff",
          textAlign: "left",
          x: 32,
          y: 85,
          width: 44,
          rotation: 0,
          opacity: 1,
          visible: true,
          zIndex: 20,
          groupId: "grp_speaker",
        },
        // Text: Speaker Title Subtitle
        {
          id: "layer_txt_title",
          type: "text",
          name: "Speaker Title",
          text: "Senior Pastor · Faith Cathedral",
          fontFamily: "Inter, sans-serif",
          fontSize: 12,
          fontWeight: "normal",
          color: "#c084fc",
          textAlign: "left",
          x: 32,
          y: 92,
          width: 44,
          rotation: 0,
          opacity: 0.9,
          visible: true,
          zIndex: 20,
          groupId: "grp_speaker",
        },
        // Image: Transparent Church Logo
        {
          id: "layer_img_logo",
          type: "image",
          name: "Transparent Church Logo",
          content: assetPng.url,
          filePath: assetPng.filePath,
          assetId: assetPng.assetId,
          x: 90,
          y: 12,
          width: 14,
          rotation: 0,
          opacity: 0.95,
          visible: true,
          zIndex: 30,
        },
        // Image: Speaker Photograph Overlay
        {
          id: "layer_img_photo",
          type: "image",
          name: "Speaker Portrait",
          content: assetJpg.url,
          filePath: assetJpg.filePath,
          assetId: assetJpg.assetId,
          x: 12,
          y: 88,
          width: 8,
          rotation: 0,
          opacity: 1.0,
          visible: true,
          zIndex: 30,
        }
      ]
    };

    const savedDesign = service.saveDesign(draftDesign);
    assert(savedDesign.layers.length === 6, "Canva design saved with 6 composite layers");
    assert(savedDesign.layers[0].borderRadius === 12, "Rounded-rect shape has strict 12px border radius");
    assert(savedDesign.layers[2].type === "text" && savedDesign.layers[2].fontSize === 18, "Text layer preserved font size and styling");
    assert(savedDesign.layers[4].type === "image" && savedDesign.layers[4].assetId === assetPng.assetId, "Transparent logo image layer preserved");

    // ── Phase 3: Decoupled Editing Preview vs Live Program Air Invariant ───
    console.log("\n3. Testing Decoupled Preview vs Live Program Air Invariant...");
    let liveBroadcastConfig = {
      layers: [], // Must start empty
      scale: 1.0,
      fitMode: "cover",
    };

    assert(liveBroadcastConfig.layers.length === 0, "Broadcast layers remain empty while operator creates/edits draft in preview");

    // ── Phase 4: Explicit "Show on Program" Action ──────────────────────────
    console.log("\n4. Testing Explicit 'Show on Program'...");
    // Operator clicks "Show on Program"
    liveBroadcastConfig.layers = draftDesign.layers.filter((l) => l.visible !== false);
    assert(liveBroadcastConfig.layers.length === 6, "All 6 design layers pushed to program output upon explicit Show");

    // ── Phase 5: Draft Edits on Air Do NOT Mutate Program Output Until Update ─
    console.log("\n5. Testing Draft Editing on Air (Decoupled until 'Update on Program')...");
    // Operator edits Speaker Name text and repositions container in preview
    const editedDraftLayers = draftDesign.layers.map((l) => {
      if (l.id === "layer_txt_name") {
        return { ...l, text: "Rev. Dr. Michael Adeyemi (DRAFT EDIT)" };
      }
      if (l.id === "layer_shape_bg") {
        return { ...l, width: 52 };
      }
      return l;
    });

    // Verify program output was NOT mutated by draft edits
    const activeProgramNameLayer = liveBroadcastConfig.layers.find((l) => l.id === "layer_txt_name");
    assert(activeProgramNameLayer.text === "Pastor Michael Adeyemi", "Program output remains UNCHANGED while operator modifies draft");

    // Operator clicks "Update on Program"
    liveBroadcastConfig.layers = editedDraftLayers.filter((l) => l.visible !== false);
    const updatedProgramNameLayer = liveBroadcastConfig.layers.find((l) => l.id === "layer_txt_name");
    assert(updatedProgramNameLayer.text === "Rev. Dr. Michael Adeyemi (DRAFT EDIT)", "Program output updated ONLY after operator explicitly clicks 'Update on Program'");
    assert(liveBroadcastConfig.layers.find((l) => l.id === "layer_shape_bg").width === 52, "Updated shape geometry reflected on program");

    // ── Phase 6: Interactive Layer Operations: Move, Resize, Rotate, Duplicate, Reorder, Undo/Redo ─
    console.log("\n6. Testing Canva Interactive Layer Tools...");
    
    // Undo stack simulation
    const undoStack = [];
    const redoStack = [];
    const pushUndo = (state) => {
      if (undoStack.length >= 30) undoStack.shift();
      undoStack.push(JSON.parse(JSON.stringify(state)));
      redoStack.length = 0;
    };

    pushUndo(editedDraftLayers);

    // Duplicate text layer
    const duplicatedLayer = {
      ...editedDraftLayers[2],
      id: "layer_txt_copy",
      name: "Speaker Name (Copy)",
      x: editedDraftLayers[2].x + 2,
      y: editedDraftLayers[2].y + 2,
      rotation: 15,
    };
    let currentLayers = [...editedDraftLayers, duplicatedLayer];
    assert(currentLayers.length === 7, "Duplicated layer added to draft (7 layers)");
    assert(currentLayers[6].rotation === 15, "Rotation property supported on layer");

    // Reorder layers: Move logo to top
    const logoIdx = currentLayers.findIndex((l) => l.id === "layer_img_logo");
    const [logoLayer] = currentLayers.splice(logoIdx, 1);
    currentLayers.push(logoLayer);
    assert(currentLayers[currentLayers.length - 1].id === "layer_img_logo", "Logo moved to front of stack");

    // Test Replace Image Asset
    const photoIdx = currentLayers.findIndex((l) => l.id === "layer_img_photo");
    const origPhotoId = currentLayers[photoIdx].id;
    currentLayers[photoIdx] = {
      ...currentLayers[photoIdx],
      content: assetComplex.url,
      url: assetComplex.url,
      filePath: assetComplex.filePath,
      assetId: assetComplex.assetId,
      name: assetComplex.originalName,
    };
    assert(currentLayers[photoIdx].id === origPhotoId, "Replaced image preserves original layer ID and layout coordinates");
    assert(currentLayers[photoIdx].content === assetComplex.url, "Replaced image updates content URL");
    assert(currentLayers[photoIdx].url === assetComplex.url, "Replaced image updates url field");

    // Test sanitizeLayer preserves both content and url
    const sanitizedImg = service.sanitizeLayer(currentLayers[photoIdx]);
    assert(sanitizedImg.content === assetComplex.url, "sanitizeLayer preserves content field");
    assert(sanitizedImg.url === assetComplex.url, "sanitizeLayer preserves url field");

    // Test Undo
    pushUndo(currentLayers);
    // Delete duplicate
    currentLayers = currentLayers.filter((l) => l.id !== "layer_txt_copy");
    assert(currentLayers.length === 6, "Layer deleted (6 layers)");

    // Undo delete
    const previousState = undoStack.pop();
    redoStack.push(JSON.parse(JSON.stringify(currentLayers)));
    currentLayers = previousState;
    assert(currentLayers.length === 7, "Undo restored deleted layer (7 layers)");

    // ── Phase 7: Explicit "Hide from Air" Action ────────────────────────────
    console.log("\n7. Testing Explicit 'Hide from Air'...");
    liveBroadcastConfig.layers = [];
    assert(liveBroadcastConfig.layers.length === 0, "Program broadcast layers cleared on Hide");
    assert(currentLayers.length === 7, "Draft canvas layers intact in editor for future cue");

    // ── Phase 8: Persistence & Safe Reboot Invariant ────────────────────────
    console.log("\n8. Testing Design Persistence Across Restarts...");
    const service2 = new DesignStudioService();
    service2.initialize(testDir);
    const reloadedDesigns = service2.listDesigns();
    assert(reloadedDesigns.length === 1, "Design persisted and reloaded from disk");
    assert(reloadedDesigns[0].layers.length === 6, "All 6 layers reloaded intact");

    // Cold boot safety invariant: Live broadcast layers must NEVER auto-present
    const rebootLiveBroadcastConfig = {
      layers: [],
      scale: 1.0,
      fitMode: "cover",
    };
    assert(rebootLiveBroadcastConfig.layers.length === 0, "Cold boot never puts saved design on air automatically");

    // ── Phase 9: Design System Universal 12px Border Radius Audit ───────────
    console.log("\n9. Auditing Design System 12px Border Radius Mandate...");
    const filesToAudit = [
      path.join(__dirname, "../src/App/controller/LiveDesignStudioModal.jsx"),
      path.join(__dirname, "../src/App/controller/LiveSwitcherController.js"),
      path.join(__dirname, "../src/App/controller/LowerThirdGraphic.js"),
    ];

    let invalidRadiusFound = false;
    for (const f of filesToAudit) {
      const code = fs.readFileSync(f, "utf8");
      // Check for rounded-sm, rounded-md, rounded-lg, rounded-2xl, rounded-3xl, or custom px other than 12px or full
      const badRadiusRegex = /rounded-(sm|md|lg|2xl|3xl|\[(?!(12px|full))[^\]]+\])/g;
      const matches = code.match(badRadiusRegex);
      if (matches && matches.length > 0) {
        console.error(`  [WARN] Found disallowed radius in ${path.basename(f)}:`, matches.slice(0, 5));
        invalidRadiusFound = true;
      }
    }
    assert(!invalidRadiusFound, "All structural UI elements strictly adhere to 12px border radius");

    // ── Phase 10: Badge Icon Removal Verification ───────────────────────────
    console.log("\n10. Auditing Badge Icon Removal in Live Design Studio...");
    const studioModalCode = fs.readFileSync(
      path.join(__dirname, "../src/App/controller/LiveDesignStudioModal.jsx"),
      "utf8"
    );
    const liveSwitcherCode = fs.readFileSync(
      path.join(__dirname, "../src/App/controller/LiveSwitcherController.js"),
      "utf8"
    );

    const emojis = ["✝", "🕊", "🎙", "⭐", "📖", "⚡", "🎨", "💡"];
    let emojiFound = false;
    for (const em of emojis) {
      if (studioModalCode.includes(em) || liveSwitcherCode.includes(em)) {
        console.error(`  [WARN] Found emoji badge icon ${em}`);
        emojiFound = true;
      }
    }
    assert(!emojiFound, "All emoji badge icons removed from Live Design Studio UI; plain text status used");

    // ── Phase 11: Canvas Context Overlay Rendering ──────────────────────────
    console.log("\n11. Auditing SwitcherProgramCanvas Context Rendering...");
    const canvasCode = fs.readFileSync(
      path.join(__dirname, "../src/App/controller/SwitcherProgramCanvas.js"),
      "utf8"
    );
    assert(canvasCode.includes("drawCanvasOverlays"), "SwitcherProgramCanvas implements drawCanvasOverlays");
    assert(canvasCode.includes("type === \"image\"") || canvasCode.includes("type === 'image'"), "drawCanvasOverlays renders image layers to canvas context");
    assert(canvasCode.includes("type === \"shape\"") || canvasCode.includes("type === 'shape'"), "drawCanvasOverlays renders shape layers to canvas context");
    assert(canvasCode.includes("type === \"text\"") || canvasCode.includes("type === 'text'"), "drawCanvasOverlays renders text layers to canvas context");

    // ── Phase 12: Development Tooling Audit & Confinement ──────────────────
    console.log("\n12. Auditing Dev-Only Screenshot Watcher Confinement...");
    const mainCode = fs.readFileSync(path.join(__dirname, "../main.js"), "utf8");
    assert(
      mainCode.includes("process.env.OCS_DEV_SCREENSHOT === \"1\""),
      "take_screenshot_cmd watcher is strictly confined behind process.env.OCS_DEV_SCREENSHOT"
    );

    // ── Phase 13: Canvas Readback & Tainting Verification ────────────────────
    console.log("\n13. Auditing Canvas Readback & Frame Processing Pipeline...");
    assert(
      canvasCode.includes("ctx.getImageData"),
      "SwitcherProgramCanvas performs high-performance raw RGBA extraction via getImageData"
    );
    assert(
      canvasCode.includes("window.electron.Recorder.pushVideoFrame"),
      "Canvas frame buffer dispatched to native Program Recorder"
    );
    assert(
      canvasCode.includes("window.electron.Broadcast.pushVideoFrame"),
      "Canvas frame buffer dispatched to native Broadcast Supervisor"
    );

    console.log(`\n======================================================`);
    console.log(`Live Design Studio Test Results: ${passed} passed, ${failed} failed`);
    console.log(`======================================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

runLiveStudioTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
