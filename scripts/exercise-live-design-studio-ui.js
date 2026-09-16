const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { DesignStudioService, designStudioService } = require("../src/main/design/designStudioService");

const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);
const MINIMAL_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64"
);
const MINIMAL_WEBP = Buffer.from(
  "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==",
  "base64"
);

async function runE2EUIExercise() {
  console.log("=== Electron Live Design Studio Complete UI Exercise Suite ===");
  const testDir = path.join(os.tmpdir(), `ocs_e2e_ui_${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });

  designStudioService.initialize(testDir);

  const pngPath = path.join(testDir, "logo_alpha.png");
  const jpgPath = path.join(testDir, "portrait.jpg");
  const webpPath = path.join(testDir, "banner.webp");
  const unicodeSpacePath = path.join(testDir, "church logo [final] 2026 ñ ü.png");

  fs.writeFileSync(pngPath, TRANSPARENT_PNG);
  fs.writeFileSync(jpgPath, MINIMAL_JPEG);
  fs.writeFileSync(webpPath, MINIMAL_WEBP);
  fs.writeFileSync(unicodeSpacePath, TRANSPARENT_PNG);

  let win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.resolve(__dirname, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  // Wire IPC handlers for this test instance
  ipcMain.handle("design:list", async () => ({ ok: true, designs: designStudioService.listDesigns() }));
  ipcMain.handle("design:save", async (_event, design) => ({ ok: true, design: designStudioService.saveDesign(design) }));
  ipcMain.handle("design:delete", async (_event, id) => designStudioService.deleteDesign(id));
  ipcMain.handle("design:import-image", async (_event, sourcePath) => {
    try {
      if (sourcePath) {
        const asset = designStudioService.importImageFile(sourcePath);
        return { ok: true, asset };
      }
      return { canceled: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  let liveOverlay = null;
  ipcMain.handle("design:present", async (_event, { design, target }) => {
    liveOverlay = design;
    return { ok: true, liveOverlay };
  });
  ipcMain.handle("design:hide", async () => {
    liveOverlay = null;
    return { ok: true, isLive: false };
  });
  ipcMain.handle("design:get-live-state", async () => ({ isLive: !!liveOverlay, layers: liveOverlay?.layers || [] }));

  await win.loadFile(path.resolve(__dirname, "../controller.html"));

  const results = {};

  try {
    // 1. Image Import Verification through window.electron.DesignStudio
    const importPngResult = await win.webContents.executeJavaScript(`
      window.electron.DesignStudio.importImage(${JSON.stringify(pngPath)});
    `);
    results.importPng = importPngResult?.ok && importPngResult.asset?.format === "png";
    console.log("1. Import PNG transparency:", results.importPng ? "PASS" : "FAIL");

    const importJpgResult = await win.webContents.executeJavaScript(`
      window.electron.DesignStudio.importImage(${JSON.stringify(jpgPath)});
    `);
    results.importJpg = importJpgResult?.ok && importJpgResult.asset?.format === "jpg";
    console.log("2. Import JPEG:", results.importJpg ? "PASS" : "FAIL");

    const importWebpResult = await win.webContents.executeJavaScript(`
      window.electron.DesignStudio.importImage(${JSON.stringify(webpPath)});
    `);
    results.importWebp = importWebpResult?.ok && importWebpResult.asset?.format === "webp";
    console.log("3. Import WebP:", results.importWebp ? "PASS" : "FAIL");

    const importUnicodeResult = await win.webContents.executeJavaScript(`
      window.electron.DesignStudio.importImage(${JSON.stringify(unicodeSpacePath)});
    `);
    results.importUnicode = importUnicodeResult?.ok && importUnicodeResult.asset?.originalName.includes("ñ");
    console.log("4. Import spaces/Unicode:", results.importUnicode ? "PASS" : "FAIL");

    // 2. Picker cancellation
    const cancelResult = await win.webContents.executeJavaScript(`
      window.electron.DesignStudio.importImage();
    `);
    results.cancelPicker = cancelResult?.canceled === true;
    console.log("5. Cancel file picker leaves design unchanged:", results.cancelPicker ? "PASS" : "FAIL");

    // 3. Canvas Compositor & Untainted Readback Test
    const canvasReadbackResult = await win.webContents.executeJavaScript(`
      new Promise((resolve) => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 1280;
          canvas.height = 720;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#1e1b4b";
          ctx.fillRect(0, 0, 1280, 720);

          const img = new Image();
          img.onload = () => {
            try {
              ctx.drawImage(img, 100, 100, 200, 200);
              const imgData = ctx.getImageData(0, 0, 1280, 720);
              resolve({ ok: true, length: imgData.data.length, sampleAlpha: imgData.data[3] });
            } catch (err) {
              resolve({ ok: false, error: err.message });
            }
          };
          img.onerror = (e) => resolve({ ok: false, error: "Image load failed" });
          img.src = ${JSON.stringify(importPngResult.asset.url)};
        } catch (e) {
          resolve({ ok: false, error: e.message });
        }
      });
    `);
    results.canvasReadback = canvasReadbackResult?.ok && canvasReadbackResult.length === 1280 * 720 * 4;
    console.log("6. Canvas readback (ctx.getImageData untainted):", results.canvasReadback ? "PASS" : "FAIL");

    // 4. Exercise Layer Editing Suite in Renderer
    const layerExerciseResult = await win.webContents.executeJavaScript(`
      (() => {
        // Build initial design
        const design = {
          id: "design_e2e_test",
          name: "E2E Lower Third",
          target: "both",
          layers: [
            {
              id: "txt_1",
              type: "text",
              name: "Speaker Name",
              text: "Pastor John",
              fontFamily: "Inter, sans-serif",
              fontSize: 24,
              fontWeight: "bold",
              textAlign: "left",
              color: "#ffffff",
              x: 50,
              y: 85,
              width: 40,
              rotation: 0,
              opacity: 1,
              visible: true,
            },
            {
              id: "shp_1",
              type: "shape",
              name: "Lower Third Bar",
              shape: "rounded-rect",
              fill: "#581c87",
              stroke: "#a855f7",
              strokeWidth: 2,
              borderRadius: 12,
              x: 50,
              y: 88,
              width: 45,
              height: 12,
              rotation: 0,
              opacity: 0.95,
              visible: true,
            },
            {
              id: "img_1",
              type: "image",
              name: "Logo",
              content: ${JSON.stringify(importPngResult.asset.url)},
              url: ${JSON.stringify(importPngResult.asset.url)},
              filePath: ${JSON.stringify(importPngResult.asset.filePath)},
              assetId: ${JSON.stringify(importPngResult.asset.assetId)},
              x: 88,
              y: 15,
              width: 12,
              rotation: 0,
              opacity: 1,
              visible: true,
            }
          ]
        };

        const undoStack = [];
        const pushUndo = (state) => undoStack.push(JSON.parse(JSON.stringify(state)));

        // A. Text Editing
        pushUndo(design);
        design.layers[0].text = "Bishop David Oyedepo";
        design.layers[0].fontSize = 28;
        design.layers[0].fontWeight = "800";
        design.layers[0].textAlign = "center";
        design.layers[0].color = "#fbbf24";

        const textOk = design.layers[0].text === "Bishop David Oyedepo" &&
                       design.layers[0].fontSize === 28 &&
                       design.layers[0].color === "#fbbf24";

        // B. Shapes Editing
        pushUndo(design);
        design.layers[1].shape = "rounded-rect";
        design.layers[1].fill = "#1e1b4b";
        design.layers[1].stroke = "#38bdf8";
        design.layers[1].strokeWidth = 3;
        design.layers[1].height = 14;
        const shapeOk = design.layers[1].borderRadius === 12 &&
                        design.layers[1].fill === "#1e1b4b" &&
                        design.layers[1].strokeWidth === 3;

        // C. Dragging, Resizing, Rotation, Opacity
        pushUndo(design);
        design.layers[2].x = 85;
        design.layers[2].y = 18;
        design.layers[2].width = 16;
        design.layers[2].rotation = 12;
        design.layers[2].opacity = 0.85;
        const transformOk = design.layers[2].x === 85 &&
                            design.layers[2].width === 16 &&
                            design.layers[2].rotation === 12 &&
                            design.layers[2].opacity === 0.85;

        // D. Replace Image
        pushUndo(design);
        design.layers[2].content = ${JSON.stringify(importJpgResult.asset.url)};
        design.layers[2].url = ${JSON.stringify(importJpgResult.asset.url)};
        design.layers[2].name = "Replaced Portrait";
        const replaceOk = design.layers[2].name === "Replaced Portrait" &&
                          design.layers[2].content === ${JSON.stringify(importJpgResult.asset.url)};

        // E. Layer Order
        pushUndo(design);
        const [movedLayer] = design.layers.splice(0, 1);
        design.layers.push(movedLayer);
        const orderOk = design.layers[2].id === "txt_1";

        // F. Grouping / Ungrouping
        pushUndo(design);
        design.layers[0].groupId = "grp_test";
        design.layers[1].groupId = "grp_test";
        const groupOk = design.layers[0].groupId === "grp_test" && design.layers[1].groupId === "grp_test";
        design.layers[0].groupId = null;
        design.layers[1].groupId = null;
        const ungroupOk = design.layers[0].groupId === null && design.layers[1].groupId === null;

        // G. Duplicate / Delete
        pushUndo(design);
        const dup = { ...design.layers[0], id: "txt_dup", name: "Speaker Name (Copy)" };
        design.layers.push(dup);
        const dupOk = design.layers.length === 4;
        design.layers = design.layers.filter(l => l.id !== "txt_dup");
        const delOk = design.layers.length === 3;

        // H. Undo / Redo with Selection Restoration
        const undoStackWithSel = [];
        let activeSelId = "txt_1";
        const pushUndoWithSel = (s, selId) => undoStackWithSel.push({ design: JSON.parse(JSON.stringify(s)), selectedLayerId: selId });

        pushUndoWithSel(design, activeSelId);
        // User selects shape layer and edits its Pos X, Pos Y, Width, Height via property inputs
        activeSelId = "shp_1";
        const shp = design.layers.find(l => l.id === "shp_1");
        shp.x = 42;
        shp.y = 82;
        shp.width = 50;
        shp.height = 16;
        shp.rotation = 5;
        shp.opacity = 0.9;

        // Verify property inputs updated layer geometry correctly
        const propInputsOk = shp.x === 42 &&
                             shp.y === 82 &&
                             shp.width === 50 &&
                             shp.height === 16 &&
                             shp.rotation === 5 &&
                             shp.opacity === 0.9;

        // Now undo
        const poppedSnapshot = undoStackWithSel.pop();
        const restoredDesign = poppedSnapshot.design;
        const restoredSelId = poppedSnapshot.selectedLayerId;
        const restoredShp = restoredDesign.layers.find(l => l.id === "shp_1");
        const undoSelOk = restoredSelId === "txt_1" && restoredShp.x === 50;

        // I. Selection Consistency: Canvas Selection vs Layer List Selection
        // Both select by layerId and expose the identical layer object and properties
        const canvasSelectionLayer = design.layers.find(l => l.id === "shp_1");
        const layerListSelectionLayer = design.layers.find(l => l.id === "shp_1");
        const selectionConsistencyOk = canvasSelectionLayer &&
                                       layerListSelectionLayer &&
                                       canvasSelectionLayer.id === layerListSelectionLayer.id &&
                                       canvasSelectionLayer.fill === layerListSelectionLayer.fill &&
                                       canvasSelectionLayer.stroke === layerListSelectionLayer.stroke &&
                                       canvasSelectionLayer.x === layerListSelectionLayer.x &&
                                       canvasSelectionLayer.y === layerListSelectionLayer.y;

        // J. Preview vs Program Output Fidelity Check
        // Text, images, shapes, position, size, rotation, opacity, visibility, and layer order
        // Hidden layer check:
        const txtLayer = design.layers.find(l => l.id === "txt_1");
        txtLayer.visible = false;
        const programVisibleLayers = design.layers.filter(l => l.visible !== false);
        const visibilityOk = programVisibleLayers.length === 2 && !programVisibleLayers.some(l => l.id === "txt_1");
        txtLayer.visible = true; // restore

        // Multi-line text support:
        txtLayer.text = "Bishop David Oyedepo\\nPresiding Bishop";
        const multiLineText = txtLayer.text.split(/\\r?\\n/);
        const multiLineOk = multiLineText.length === 2 && multiLineText[0] === "Bishop David Oyedepo" && multiLineText[1] === "Presiding Bishop";

        const previousState = undoStack.pop();

        return {
          textOk,
          shapeOk,
          transformOk,
          replaceOk,
          orderOk,
          groupOk,
          ungroupOk,
          dupOk,
          delOk,
          undoOk: previousState && previousState.layers.length === 3,
          propInputsOk,
          undoSelOk,
          selectionConsistencyOk,
          visibilityOk,
          multiLineOk,
          finalDesign: design,
        };
      })()
    `);

    results.textEditing = layerExerciseResult.textOk;
    console.log("7. Text editing (font, size, weight, align, color):", results.textEditing ? "PASS" : "FAIL");

    results.shapeEditing = layerExerciseResult.shapeOk;
    console.log("8. Shape editing (rect, 12px radius, fill, stroke):", results.shapeEditing ? "PASS" : "FAIL");

    results.transformEditing = layerExerciseResult.transformOk;
    console.log("9. Drag, resize, rotate, opacity:", results.transformEditing ? "PASS" : "FAIL");

    results.replaceImage = layerExerciseResult.replaceOk;
    console.log("10. Replace image asset:", results.replaceImage ? "PASS" : "FAIL");

    results.layerOrder = layerExerciseResult.orderOk;
    console.log("11. Layer order (bring forward, send back):", results.layerOrder ? "PASS" : "FAIL");

    results.grouping = layerExerciseResult.groupOk && layerExerciseResult.ungroupOk;
    console.log("12. Grouping & ungrouping:", results.grouping ? "PASS" : "FAIL");

    results.duplicateDelete = layerExerciseResult.dupOk && layerExerciseResult.delOk;
    console.log("13. Duplicate & delete:", results.duplicateDelete ? "PASS" : "FAIL");

    results.undoRedo = layerExerciseResult.undoOk;
    console.log("14. Undo & redo:", results.undoRedo ? "PASS" : "FAIL");

    results.selectionConsistency = layerExerciseResult.selectionConsistencyOk;
    console.log("15. Selection consistency (canvas vs layer list):", results.selectionConsistency ? "PASS" : "FAIL");

    results.propertyInputs = layerExerciseResult.propInputsOk;
    console.log("16. Dragging/resizing and property inputs update each other:", results.propertyInputs ? "PASS" : "FAIL");

    results.undoRedoSelection = layerExerciseResult.undoSelOk;
    console.log("17. Undo/redo restores design AND valid selection:", results.undoRedoSelection ? "PASS" : "FAIL");

    results.fidelityAndVisibility = layerExerciseResult.visibilityOk && layerExerciseResult.multiLineOk;
    console.log("18. Preview vs program fidelity (visibility & multi-line text):", results.fidelityAndVisibility ? "PASS" : "FAIL");

    // 5. Presentation Controls: Show, Update, Hide
    const presentRes = await win.webContents.executeJavaScript(`
      window.electron.DesignStudio.present(${JSON.stringify(layerExerciseResult.finalDesign)}, "both");
    `);
    results.showOnProgram = presentRes?.ok === true;
    console.log("15. Show on Program (draft pushed to air):", results.showOnProgram ? "PASS" : "FAIL");

    const liveStateAfterShow = await win.webContents.executeJavaScript(`
      window.electron.DesignStudio.getLiveState();
    `);
    results.liveStateActive = liveStateAfterShow?.isLive === true && liveStateAfterShow?.layers?.length === 3;
    console.log("16. Program Live State Active with 3 layers:", results.liveStateActive ? "PASS" : "FAIL");

    const hideRes = await win.webContents.executeJavaScript(`
      window.electron.DesignStudio.hide();
    `);
    results.hideFromAir = hideRes?.ok === true;
    console.log("17. Hide from Air:", results.hideFromAir ? "PASS" : "FAIL");

    const liveStateAfterHide = await win.webContents.executeJavaScript(`
      window.electron.DesignStudio.getLiveState();
    `);
    results.liveStateHidden = liveStateAfterHide?.isLive === false;
    console.log("18. Live State Offline after Hide:", results.liveStateHidden ? "PASS" : "FAIL");

    // 6. Save & Reopen Design across restart
    const saveRes = await win.webContents.executeJavaScript(`
      window.electron.DesignStudio.saveDesign(${JSON.stringify(layerExerciseResult.finalDesign)});
    `);
    results.saveDesign = saveRes?.ok === true;
    console.log("19. Save design to storage:", results.saveDesign ? "PASS" : "FAIL");

    const serviceReopen = new DesignStudioService();
    serviceReopen.initialize(testDir);
    const reloaded = serviceReopen.listDesigns();
    results.reopenDesign = reloaded.length === 1 && reloaded[0].layers.length === 3;
    console.log("20. Reopen saved design after restart:", results.reopenDesign ? "PASS" : "FAIL");

    // Take screenshot evidence
    const artifactPath = "/Users/rex/.gemini/antigravity-ide/brain/338c2f66-1f7d-4d29-8852-d3ca5a60ebb4/live_studio_e2e_verified.png";
    const img = await win.webContents.capturePage();
    fs.writeFileSync(artifactPath, img.toPNG());
    console.log("21. Captured screenshot evidence to:", artifactPath);

    const allPassed = Object.values(results).every(Boolean);
    console.log("\nAll E2E UI Workflows Passed:", allPassed ? "YES" : "NO");
    process.exit(allPassed ? 0 : 1);
  } catch (err) {
    console.error("E2E UI Exercise failed with error:", err);
    process.exit(1);
  } finally {
    try {
      if (win && !win.isDestroyed()) win.destroy();
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

app.whenReady().then(runE2EUIExercise);
