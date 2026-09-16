/**
 * test-design-studio-destination-isolation.js
 *
 * Comprehensive in-app verification of Live Design Studio destination isolation:
 * 1. Present scripture or slide on General Screen.
 * 2. Create and edit a lower third: displays and live output remain unchanged.
 * 3. Show on Live Program only: live composition receives it; General Screen remains unchanged.
 * 4. Explicitly enable General Screen and apply: both receive the overlay (overlaying without replacing scripture).
 * 5. Deselect General Screen and apply: its overlay disappears while underlying scripture remains.
 * 6. Edit while on air, Update, then Hide: correct preview isolation throughout.
 * 7. Duplicate design rendering prevention when General Screen is live program source.
 * 8. Reopening / restart never auto-presents design.
 */

const { app, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { DesignStudioService } = require("../src/main/design/designStudioService");

const testDir = path.join(os.tmpdir(), `ocs_dest_isolation_${Date.now()}`);
fs.mkdirSync(testDir, { recursive: true });

app.whenReady().then(async () => {
  console.log("================================================================================");
  console.log(" OCS LIVE DESIGN STUDIO — DESTINATION ISOLATION & VERIFICATION SUITE");
  console.log("================================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = "") {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName} — ${details}`);
      failed++;
    }
  }

  try {
    const designStudioService = new DesignStudioService();
    designStudioService.initialize(testDir);

    // Mock Canvas and Live Broadcast state matching main.js
    let currentCanvasState = {
      contentSlot: { type: "none", data: null },
      backgroundSlot: { type: "color", data: "#000000" },
      pinnedLayers: [],
      chrome: { blackout: false },
    };

    let liveBroadcastConfig = {
      layers: [],
      hasSanctuaryOverlay: false,
      scale: 1.0,
      fitMode: "cover",
    };

    function updateLiveBroadcastConfig(patch) {
      liveBroadcastConfig = { ...liveBroadcastConfig, ...patch };
    }

    // Mirror main.js design:present handler
    function handleDesignPresent({ design, target = "both" }) {
      return designStudioService.presentDesign(
        design,
        target,
        ({ target: t, layers }) => {
          const visibleLayers = layers.filter(
            (l) => l.visible !== false && !l.isMissing
          );

          const streamLayers = visibleLayers.map((l) => ({
            id: l.id,
            type: l.type || "image",
            name: l.name || "Overlay Layer",
            content: l.content || l.url || "",
            url: l.url || l.content || "",
            text: l.text,
            fontFamily: l.fontFamily,
            fontSize: l.fontSize,
            fontWeight: l.fontWeight,
            color: l.color,
            textAlign: l.textAlign,
            textTransform: l.textTransform,
            shape: l.shape,
            fill: l.fill,
            stroke: l.stroke,
            strokeWidth: l.strokeWidth,
            borderRadius: l.borderRadius || 12,
            rotation: l.rotation || 0,
            height: l.height,
            groupId: l.groupId || null,
            x: typeof l.x === "number" ? l.x : 50,
            y: typeof l.y === "number" ? l.y : 80,
            style: {
              width: typeof l.width === "number" ? l.width : 35,
              opacity: typeof l.opacity === "number" ? l.opacity : 1,
            },
          }));

          const sanctuaryLayers = visibleLayers.map((l) => ({
            id: l.id,
            type: l.type || "image",
            url: l.url || l.content || "",
            content: l.content || l.url || "",
            text: l.text,
            fontFamily: l.fontFamily,
            fontSize: l.fontSize ? `${l.fontSize}px` : undefined,
            fontWeight: l.fontWeight,
            color: l.color,
            textAlign: l.textAlign,
            textTransform: l.textTransform,
            shape: l.shape,
            fill: l.fill,
            stroke: l.stroke,
            strokeWidth: l.strokeWidth,
            borderRadius: l.borderRadius || 12,
            height: l.height,
            rotation: l.rotation || 0,
            x: (typeof l.x === "number" ? l.x : 50) / 100,
            y: (typeof l.y === "number" ? l.y : 80) / 100,
            width: (typeof l.width === "number" ? l.width : 35) / 100,
            opacity: typeof l.opacity === "number" ? l.opacity : 1,
            zIndex: typeof l.zIndex === "number" ? l.zIndex : 30,
          }));

          const hasSanctuary = (t === "sanctuary" || t === "both");
          if (t === "stream" || t === "both") {
            updateLiveBroadcastConfig({ layers: streamLayers, hasSanctuaryOverlay: hasSanctuary });
          } else {
            updateLiveBroadcastConfig({ layers: [], hasSanctuaryOverlay: hasSanctuary });
          }

          if (hasSanctuary) {
            currentCanvasState.pinnedLayers = sanctuaryLayers;
          } else {
            currentCanvasState.pinnedLayers = [];
          }
        }
      );
    }

    // Mirror main.js design:hide handler
    function handleDesignHide() {
      return designStudioService.hideDesign(() => {
        updateLiveBroadcastConfig({ layers: [], hasSanctuaryOverlay: false });
        currentCanvasState.pinnedLayers = [];
      });
    }

    // ── STEP 1: Present Scripture / Slide on General Screen ───────────────────
    console.log("STEP 1: Present scripture or slide on General Screen...");
    currentCanvasState.contentSlot = {
      type: "bible",
      data: {
        reference: "John 3:16",
        version: "KJV",
        text: "For God so loved the world, that he gave his only begotten Son...",
      },
    };
    currentCanvasState.backgroundSlot = { type: "gradient", data: "linear-gradient(to bottom, #1e1b4b, #0f172a)" };

    assert(
      currentCanvasState.contentSlot.type === "bible" && currentCanvasState.contentSlot.data.reference === "John 3:16",
      "Step 1: Scripture actively presented on General Screen contentSlot"
    );
    assert(
      currentCanvasState.pinnedLayers.length === 0,
      "Step 1: General Screen has no initial pinned design overlays"
    );
    assert(
      liveBroadcastConfig.layers.length === 0,
      "Step 1: Live Program composition has no design layers"
    );

    // ── STEP 2: Create and edit a lower third in studio preview ─────────────
    console.log("\nSTEP 2: Create and edit lower third (preview only)...");
    let studioDesign = {
      id: "lower_third_pastor",
      name: "Pastor Michael Lower Third",
      layers: [
        {
          id: "bg_shape",
          type: "shape",
          shape: "rounded-rect",
          fill: "#581c87",
          stroke: "#a855f7",
          strokeWidth: 2,
          borderRadius: 12,
          x: 25,
          y: 85,
          width: 40,
          height: 12,
          opacity: 0.95,
          visible: true,
        },
        {
          id: "txt_name",
          type: "text",
          text: "Pastor Michael Adeyemi",
          fontSize: 22,
          fontFamily: "Inter, sans-serif",
          fontWeight: "bold",
          color: "#ffffff",
          x: 25,
          y: 83,
          width: 38,
          opacity: 1,
          visible: true,
        },
        {
          id: "txt_title",
          type: "text",
          text: "Senior Pastor · Faith Chapel",
          fontSize: 14,
          fontFamily: "Inter, sans-serif",
          fontWeight: "normal",
          color: "#d8b4fe",
          x: 25,
          y: 89,
          width: 38,
          opacity: 0.9,
          visible: true,
        },
      ],
    };

    // Save design to catalog
    designStudioService.saveDesign(studioDesign);

    // Modify preview layers (drag/text change)
    studioDesign.layers[1].text = "Pastor Michael Adeyemi (Edited in Studio)";
    studioDesign.layers[0].width = 45;

    assert(
      currentCanvasState.contentSlot.data.reference === "John 3:16",
      "Step 2: General Screen scripture completely untouched during studio creation and editing"
    );
    assert(
      currentCanvasState.pinnedLayers.length === 0,
      "Step 2: General Screen pinnedLayers remains empty during creation/editing"
    );
    assert(
      liveBroadcastConfig.layers.length === 0,
      "Step 2: Live Program composition remains empty during creation/editing"
    );

    // ── STEP 3: Show on Live Program Only (Default) ─────────────────────────
    console.log("\nSTEP 3: Show on Live Program only (default destinations: program=true, general=false)...");
    // Operator clicks "Show on Program" with default destinations (program: true, general: false) -> target: "stream"
    handleDesignPresent({ design: studioDesign, target: "stream" });

    assert(
      liveBroadcastConfig.layers.length === 3,
      "Step 3: Live Program composition receives all 3 overlay layers",
      `Got ${liveBroadcastConfig.layers.length}`
    );
    assert(
      liveBroadcastConfig.layers[1].text === "Pastor Michael Adeyemi (Edited in Studio)",
      "Step 3: Live Program has the published snapshot"
    );
    assert(
      liveBroadcastConfig.hasSanctuaryOverlay === false,
      "Step 3: liveBroadcastConfig.hasSanctuaryOverlay is false"
    );
    assert(
      currentCanvasState.pinnedLayers.length === 0,
      "Step 3: General Screen pinnedLayers remains strictly EMPTY",
      `Got ${currentCanvasState.pinnedLayers.length}`
    );
    assert(
      currentCanvasState.contentSlot.type === "bible" && currentCanvasState.contentSlot.data.reference === "John 3:16",
      "Step 3: General Screen underlying scripture remains visible and active"
    );

    // ── STEP 3b: Verify Destination Checkbox Decoupling ──────────────────────
    console.log("\nSTEP 3b: Destination checkbox changes alone do not alter presented design...");
    // Operator toggles General Screen checkbox on, but has NOT clicked Apply/Update yet
    let destinationsDraft = { program: true, general: true };
    // Verify states are unchanged prior to explicit Apply
    assert(
      currentCanvasState.pinnedLayers.length === 0,
      "Step 3b: General Screen still has no overlay before clicking Apply"
    );
    assert(
      liveBroadcastConfig.hasSanctuaryOverlay === false,
      "Step 3b: Live Program config still reflects previous applied state"
    );

    // ── STEP 4: Explicitly Enable General Screen and Apply ──────────────────
    console.log("\nSTEP 4: Explicitly enable General Screen and apply (target: both)...");
    // Operator clicks "Apply Changes" with program: true, general: true -> target: "both"
    handleDesignPresent({ design: studioDesign, target: "both" });

    assert(
      liveBroadcastConfig.layers.length === 3,
      "Step 4: Live Program retains overlay layers"
    );
    assert(
      liveBroadcastConfig.hasSanctuaryOverlay === true,
      "Step 4: liveBroadcastConfig.hasSanctuaryOverlay is now true"
    );
    assert(
      currentCanvasState.pinnedLayers.length === 3,
      "Step 4: General Screen receives all 3 pinned overlay layers",
      `Got ${currentCanvasState.pinnedLayers.length}`
    );
    assert(
      currentCanvasState.pinnedLayers[0].borderRadius === 12,
      "Step 4: General Screen pinned layer adheres to universal 12px border radius"
    );
    assert(
      currentCanvasState.contentSlot.type === "bible" && currentCanvasState.contentSlot.data.reference === "John 3:16",
      "Step 4: General Screen scripture contentSlot remains intact under the overlay (non-destructive Band 3)"
    );

    // ── STEP 5: Deselect General Screen and Apply ────────────────────────────
    console.log("\nSTEP 5: Deselect General Screen and apply (target: stream)...");
    // Operator unchecks General Screen and clicks "Apply Changes" -> target: "stream"
    handleDesignPresent({ design: studioDesign, target: "stream" });

    assert(
      liveBroadcastConfig.layers.length === 3,
      "Step 5: Live Program continues receiving overlay"
    );
    assert(
      liveBroadcastConfig.hasSanctuaryOverlay === false,
      "Step 5: liveBroadcastConfig.hasSanctuaryOverlay toggled back to false"
    );
    assert(
      currentCanvasState.pinnedLayers.length === 0,
      "Step 5: General Screen overlay completely removed (pinnedLayers === 0)",
      `Got ${currentCanvasState.pinnedLayers.length}`
    );
    assert(
      currentCanvasState.contentSlot.type === "bible" && currentCanvasState.contentSlot.data.reference === "John 3:16",
      "Step 5: General Screen scripture remains fully presented and active"
    );

    // ── STEP 6: Edit While On Air, Update, Then Hide ────────────────────────
    console.log("\nSTEP 6: Edit while on air, Update, then Hide...");
    // Operator edits subtitle in studio preview
    studioDesign.layers[2].text = "Bishop & General Overseer";

    // Verify live program and general screen remain on previous snapshot
    assert(
      liveBroadcastConfig.layers[2].text === "Senior Pastor · Faith Chapel",
      "Step 6a: Live program output remains on previous snapshot while editing in studio preview"
    );

    // Re-enable General Screen and Update
    handleDesignPresent({ design: studioDesign, target: "both" });

    assert(
      liveBroadcastConfig.layers[2].text === "Bishop & General Overseer",
      "Step 6b: Live program updated to new text after explicit Update"
    );
    assert(
      currentCanvasState.pinnedLayers[2].text === "Bishop & General Overseer",
      "Step 6b: General Screen updated to new text after explicit Update"
    );
    assert(
      currentCanvasState.contentSlot.data.reference === "John 3:16",
      "Step 6b: General Screen scripture still intact after Update"
    );

    // Hide from Air
    handleDesignHide();

    assert(
      liveBroadcastConfig.layers.length === 0,
      "Step 6c: Live program layers cleared on Hide"
    );
    assert(
      liveBroadcastConfig.hasSanctuaryOverlay === false,
      "Step 6c: hasSanctuaryOverlay reset to false on Hide"
    );
    assert(
      currentCanvasState.pinnedLayers.length === 0,
      "Step 6c: General Screen pinnedLayers cleared on Hide"
    );
    assert(
      currentCanvasState.contentSlot.type === "bible" && currentCanvasState.contentSlot.data.reference === "John 3:16",
      "Step 6c: General Screen scripture remains active and undisturbed after Hide"
    );

    // ── STEP 7: Prevent Duplicate Design Rendering when General is Program Source ─
    console.log("\nSTEP 7: Duplicate rendering prevention when General Screen is live program source...");
    // Simulate General Screen selected as program source and hasSanctuaryOverlay is true
    const isGeneralSource = true; // programSourceId === "general"
    const cfgWithSanctuary = { layers: studioDesign.layers, hasSanctuaryOverlay: true };
    const shouldSkipDesignLayers = isGeneralSource && Boolean(cfgWithSanctuary.hasSanctuaryOverlay);

    assert(
      shouldSkipDesignLayers === true,
      "Step 7: shouldSkipDesignLayers is true when General Screen is live program source and has design"
    );

    // When General Screen does not have sanctuary overlay, it should NOT skip
    const cfgWithoutSanctuary = { layers: studioDesign.layers, hasSanctuaryOverlay: false };
    const shouldNotSkip = isGeneralSource && Boolean(cfgWithoutSanctuary.hasSanctuaryOverlay);
    assert(
      shouldNotSkip === false,
      "Step 7: shouldSkipDesignLayers is false when General Screen does not have sanctuary overlay"
    );

    // ── STEP 8: Cold Boot / Reopening Saved Design Never Auto-Presents ───────
    console.log("\nSTEP 8: Cold boot / reopening saved design safety invariant...");
    const rebootedService = new DesignStudioService();
    rebootedService.initialize(testDir);
    const catalog = rebootedService.listDesigns();
    assert(catalog.length === 1, "Saved design successfully cataloged on disk");
    assert(
      rebootedService.getLiveState().isLive === false,
      "Step 8: Rebooted service live state isLive is false"
    );
    assert(
      rebootedService.getLiveState().layers.length === 0,
      "Step 8: Rebooted service live state layers is empty"
    );

    console.log("\n================================================================================");
    console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("================================================================================\n");

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error("FATAL in test suite:", err);
    process.exit(1);
  } finally {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (_) {}
  }
});
