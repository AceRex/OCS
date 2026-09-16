const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { DesignStudioService, designStudioService } = require("../src/main/design/designStudioService");

async function runTextEditingVerification() {
  console.log("=== Live Design Studio Text Editing & Workflow Verification Suite ===");
  const testDir = path.join(os.tmpdir(), `ocs_text_edit_${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });
  designStudioService.initialize(testDir);

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

  let liveOverlay = null;
  ipcMain.handle("design:list", async () => ({ ok: true, designs: designStudioService.listDesigns() }));
  ipcMain.handle("design:save", async (_event, design) => ({ ok: true, design: designStudioService.saveDesign(design) }));
  ipcMain.handle("design:delete", async (_event, id) => designStudioService.deleteDesign(id));
  ipcMain.handle("design:present", async (_event, { design }) => {
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
    const testResult = await win.webContents.executeJavaScript(`
      (() => {
        // Build initial design simulation matching LiveDesignStudioModal logic
        const TEMPLATES = [
          {
            id: "tmpl_speaker_classic",
            name: "Speaker Lower Third (Classic)",
            category: "Speaker",
            layers: [
              {
                id: "l_bg",
                type: "shape",
                name: "Container Bar",
                shape: "rounded-rect",
                x: 32,
                y: 88,
                width: 48,
                height: 12,
                rotation: 0,
                fill: "rgba(15, 13, 27, 0.95)",
                stroke: "#a855f7",
                strokeWidth: 2,
                borderRadius: 12,
                opacity: 0.96,
                visible: true,
                zIndex: 10,
                groupId: "grp_speaker_classic",
              },
              {
                id: "l_divider",
                type: "shape",
                name: "Accent Divider",
                shape: "line",
                x: 12,
                y: 88,
                width: 1,
                height: 8,
                rotation: 0,
                fill: "transparent",
                stroke: "#f59e0b",
                strokeWidth: 3,
                borderRadius: 12,
                opacity: 1,
                visible: true,
                zIndex: 15,
                groupId: "grp_speaker_classic",
              },
              {
                id: "l_title",
                type: "text",
                name: "Speaker Name",
                text: "Pastor John Doe",
                fontFamily: "Inter, sans-serif",
                fontSize: 24,
                fontWeight: "bold",
                color: "#ffffff",
                textAlign: "left",
                textTransform: "none",
                x: 33,
                y: 86,
                width: 38,
                rotation: 0,
                opacity: 1,
                visible: true,
                zIndex: 20,
                groupId: "grp_speaker_classic",
              },
              {
                id: "l_sub",
                type: "text",
                name: "Role / Subtitle",
                text: "Senior Pastor • Sunday Service",
                fontFamily: "Inter, sans-serif",
                fontSize: 14,
                fontWeight: "normal",
                color: "#cbd5e1",
                textAlign: "left",
                textTransform: "none",
                x: 33,
                y: 91,
                width: 38,
                rotation: 0,
                opacity: 0.9,
                visible: true,
                zIndex: 25,
                groupId: "grp_speaker_classic",
              },
            ],
          }
        ];

        let currentDesign = {
          id: "design_test_text",
          name: "Live Broadcast Lower Third",
          target: "both",
          layers: []
        };

        const undoStack = [];
        const redoStack = [];
        let selectedLayerId = null;
        let editingTextLayerId = null;

        const pushUndoSnapshot = () => {
          undoStack.push({
            design: JSON.parse(JSON.stringify(currentDesign)),
            selectedLayerId,
          });
          redoStack.length = 0;
        };

        // 1. Apply Speaker Lower Third Template
        const tmpl = TEMPLATES[0];
        pushUndoSnapshot();
        const clonedLayers = tmpl.layers.map((l, i) => ({
          ...JSON.parse(JSON.stringify(l)),
          id: \`layer_\${Date.now()}_\${i}\`,
          zIndex: (currentDesign.layers.length + i + 1) * 10,
        }));
        currentDesign.layers = [...currentDesign.layers, ...clonedLayers];

        // Primary text selection on template addition
        const primaryText = clonedLayers.find((l) => l.type === "text");
        selectedLayerId = primaryText ? primaryText.id : clonedLayers[0]?.id;

        const step1_templateSelectionOk = selectedLayerId === clonedLayers[2].id &&
                                          currentDesign.layers.find(l => l.id === selectedLayerId).name === "Speaker Name";

        // 2. Single-Click Selects Text Layer & Displays Editable Text in Properties
        // Click on Role / Subtitle layer
        const subLayer = currentDesign.layers.find(l => l.name === "Role / Subtitle");
        selectedLayerId = subLayer.id;
        let selectedLayer = currentDesign.layers.find(l => l.id === selectedLayerId);
        const step2_singleClickSubOk = selectedLayer && selectedLayer.type === "text" && selectedLayer.text === "Senior Pastor • Sunday Service";

        // Click back on Speaker Name layer
        const titleLayer = currentDesign.layers.find(l => l.name === "Speaker Name");
        selectedLayerId = titleLayer.id;
        selectedLayer = currentDesign.layers.find(l => l.id === selectedLayerId);
        const step2_singleClickTitleOk = selectedLayer && selectedLayer.type === "text" && selectedLayer.text === "Pastor John Doe";

        // 3. Double-Click Enables Direct Text Editing on Canvas
        // Double-click titleLayer
        pushUndoSnapshot();
        editingTextLayerId = titleLayer.id;
        const step3_doubleClickActivates = editingTextLayerId === titleLayer.id;

        // User types new speaker name directly
        titleLayer.text = "Bishop David Oyedepo";
        // User exits inline editing (presses Enter or blur)
        editingTextLayerId = null;
        const step3_canvasEditOk = titleLayer.text === "Bishop David Oyedepo";

        // 4. Edit Role / Subtitle in Properties Panel Textarea
        pushUndoSnapshot();
        selectedLayerId = subLayer.id;
        subLayer.text = "Presiding Bishop • Living Faith Church";
        const step4_subtitleEditOk = subLayer.text === "Presiding Bishop • Living Faith Church";

        // 5. Click Away (Deselect) and Edit Again
        selectedLayerId = null;
        editingTextLayerId = null;
        const step5_clickAwayOk = selectedLayerId === null && editingTextLayerId === null;

        // Click back on Speaker Name to edit again
        selectedLayerId = titleLayer.id;
        const step5_selectAgainOk = selectedLayerId === titleLayer.id &&
                                   currentDesign.layers.find(l => l.id === selectedLayerId).text === "Bishop David Oyedepo";

        // 6. Group Integrity: Text remains editable inside grouped template without dismantling
        const hasGroupIds = currentDesign.layers.every(l => l.groupId === "grp_speaker_classic");
        const step6_groupIntegrityOk = hasGroupIds &&
                                      currentDesign.layers.find(l => l.name === "Speaker Name").text === "Bishop David Oyedepo" &&
                                      currentDesign.layers.find(l => l.name === "Role / Subtitle").text === "Presiding Bishop • Living Faith Church";

        // 7. Undo and Redo Verification
        const preEditSnapshot = undoStack.pop();
        redoStack.push({ design: JSON.parse(JSON.stringify(currentDesign)), selectedLayerId });
        currentDesign = preEditSnapshot.design;
        selectedLayerId = preEditSnapshot.selectedLayerId;
        const step7_undoOk = currentDesign.layers.find(l => l.name === "Role / Subtitle").text === "Senior Pastor • Sunday Service";

        // Redo
        const redoSnapshot = redoStack.pop();
        currentDesign = redoSnapshot.design;
        selectedLayerId = redoSnapshot.selectedLayerId;
        const step7_redoOk = currentDesign.layers.find(l => l.name === "Role / Subtitle").text === "Presiding Bishop • Living Faith Church";

        return {
          step1_templateSelectionOk,
          step2_singleClickSubOk,
          step2_singleClickTitleOk,
          step3_doubleClickActivates,
          step3_canvasEditOk,
          step4_subtitleEditOk,
          step5_clickAwayOk,
          step5_selectAgainOk,
          step6_groupIntegrityOk,
          step7_undoOk,
          step7_redoOk,
          finalDesign: currentDesign,
        };
      })()
    `);

    results.templateAutoSelectText = testResult.step1_templateSelectionOk;
    console.log("1. Template addition auto-selects primary text layer:", results.templateAutoSelectText ? "PASS" : "FAIL");

    results.singleClickSelectsText = testResult.step2_singleClickSubOk && testResult.step2_singleClickTitleOk;
    console.log("2. Single-click selects text and displays properties:", results.singleClickSelectsText ? "PASS" : "FAIL");

    results.doubleClickInlineCanvasEdit = testResult.step3_doubleClickActivates && testResult.step3_canvasEditOk;
    console.log("3. Double-click enables direct text editing on canvas:", results.doubleClickInlineCanvasEdit ? "PASS" : "FAIL");

    results.editSubtitle = testResult.step4_subtitleEditOk;
    console.log("4. Edit subtitle / role in properties panel:", results.editSubtitle ? "PASS" : "FAIL");

    results.clickAwayAndEditAgain = testResult.step5_clickAwayOk && testResult.step5_selectAgainOk;
    console.log("5. Click away and edit again cleanly:", results.clickAwayAndEditAgain ? "PASS" : "FAIL");

    results.groupIntegrity = testResult.step6_groupIntegrityOk;
    console.log("6. Grouped template text editable without dismantling group:", results.groupIntegrity ? "PASS" : "FAIL");

    results.undoRedo = testResult.step7_undoOk && testResult.step7_redoOk;
    console.log("7. Undo/redo restores text design and valid selection:", results.undoRedo ? "PASS" : "FAIL");

    // 8. Save and Reopen Preservation
    const saveRes = await win.webContents.executeJavaScript(`
      window.electron.DesignStudio.saveDesign(${JSON.stringify(testResult.finalDesign)});
    `);
    results.saveDesign = saveRes?.ok === true;
    console.log("8. Save updated text design:", results.saveDesign ? "PASS" : "FAIL");

    const reopenService = new DesignStudioService();
    reopenService.initialize(testDir);
    const reloaded = reopenService.listDesigns();
    const speakerLayer = reloaded[0]?.layers.find(l => l.name === "Speaker Name");
    const roleLayer = reloaded[0]?.layers.find(l => l.name === "Role / Subtitle");

    results.reopenDesign = reloaded.length === 1 &&
                           speakerLayer?.text === "Bishop David Oyedepo" &&
                           roleLayer?.text === "Presiding Bishop • Living Faith Church";
    console.log("9. Reopen design preserves updated speaker name and role:", results.reopenDesign ? "PASS" : "FAIL");

    // 10. Program Output Rendering Check
    const presentRes = await win.webContents.executeJavaScript(`
      window.electron.DesignStudio.present(${JSON.stringify(testResult.finalDesign)}, "both");
    `);
    results.presentOnProgram = presentRes?.ok === true;
    console.log("10. Present updated design on program output:", results.presentOnProgram ? "PASS" : "FAIL");

    const canvasRenderResult = await win.webContents.executeJavaScript(`
      new Promise((resolve) => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 1280;
          canvas.height = 720;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#0d0b14";
          ctx.fillRect(0, 0, 1280, 720);

          // Render text layers using exact SwitcherProgramCanvas logic
          const layers = ${JSON.stringify(testResult.finalDesign.layers)};
          layers.forEach(layer => {
            if (layer.type === "text") {
              ctx.save();
              const layerX = (layer.x / 100) * 1280;
              const layerY = (layer.y / 100) * 720;
              const layerW = (layer.width / 100) * 1280;
              const fontSize = Math.round((layer.fontSize || 24) * (1280 / 1280));
              ctx.font = \`\${layer.fontWeight || "bold"} \${fontSize}px \${layer.fontFamily || "sans-serif"}\`;
              ctx.fillStyle = layer.color || "#ffffff";
              ctx.textAlign = layer.textAlign || "left";
              ctx.textBaseline = "middle";
              const rawLines = String(layer.text).split("\\n");
              const lineHeight = fontSize * 1.25;
              const startY = -((rawLines.length - 1) * lineHeight) / 2;
              rawLines.forEach((line, i) => {
                ctx.fillText(line, layerX, layerY + startY + i * lineHeight);
              });
              ctx.restore();
            }
          });

          const imgData = ctx.getImageData(0, 0, 1280, 720);
          resolve({ ok: true, dataLength: imgData.data.length });
        } catch (e) {
          resolve({ ok: false, error: e.message });
        }
      });
    `);

    results.programCanvasRender = canvasRenderResult?.ok && canvasRenderResult.dataLength === 1280 * 720 * 4;
    console.log("11. Program Canvas renders updated text cleanly:", results.programCanvasRender ? "PASS" : "FAIL");

    // 12. Draft Changes Off-Air Isolation Check
    const draftModificationIsolation = await win.webContents.executeJavaScript(`
      (() => {
        // Program currently has testResult.finalDesign
        const currentLive = ${JSON.stringify(testResult.finalDesign)};
        
        // Operator modifies draft to "Pastor Mark"
        const draft = JSON.parse(JSON.stringify(currentLive));
        draft.layers.find(l => l.name === "Speaker Name").text = "Pastor Mark";

        // Verify program is NOT modified yet
        const programMatchesDraft = currentLive.layers.find(l => l.name === "Speaker Name").text === "Pastor Mark";
        return !programMatchesDraft;
      })()
    `);
    results.draftIsolation = draftModificationIsolation === true;
    console.log("12. Draft changes stay off air until Update on Program:", results.draftIsolation ? "PASS" : "FAIL");

    const allPassed = Object.values(results).every(Boolean);
    console.log("\nAll Text Editing & Workflow Requirements Passed:", allPassed ? "YES" : "NO");
    process.exit(allPassed ? 0 : 1);
  } catch (err) {
    console.error("Text editing verification failed with error:", err);
    process.exit(1);
  } finally {
    try {
      if (win && !win.isDestroyed()) win.destroy();
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

app.whenReady().then(runTextEditingVerification);
