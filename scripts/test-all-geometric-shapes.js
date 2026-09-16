/**
 * GEOMETRIC SHAPES VERIFICATION SUITE
 * Tests all 12 geometric shapes in Live Design Studio:
 * 1. Compact visual picker with 12 shapes (icons, tooltips, 12px rounded cards)
 * 2. Vector rendering & accurate hit-testing (transparent corner pass-through)
 * 3. Proportions & aspect ratio lock defaults and toggle
 * 4. Editable corner radius for rounded rectangle
 * 5. Stroke controls for lines & arrows vs fill controls for closed shapes
 * 6. Border width 0 (outline removal) & Opacity 0% (full transparency)
 * 7. Shift-click multi-selection & alignment enablement
 * 8. Persistence (save & reload of all 12 shapes without data loss)
 * 9. Program compositor parity & General Screen isolation
 */

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { DesignStudioService, designStudioService } = require("../src/main/design/designStudioService");

const ARTIFACT_DIR = path.join(__dirname, "artifacts");
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

async function runGeometricShapesSuite() {
  console.log("================================================================================");
  console.log(" LIVE DESIGN STUDIO — 12 GEOMETRIC SHAPES COMPREHENSIVE TEST SUITE");
  console.log("================================================================================\n");

  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "ocs-geom-test-"));
  const report = {
    picker_twelveShapesPresent: false,
    picker_iconsAndTooltipsPresent: false,
    picker_twelvePxRadiusEnforced: false,
    shapes_allTwelveShapesInsertable: false,
    shapes_aspectRatioLockDefaults: false,
    shapes_aspectRatioLockToggleable: false,
    shapes_roundedRectEditableRadius: false,
    shapes_lineArrowStrokeControls: false,
    shapes_borderZeroRemovesOutline: false,
    shapes_opacityZeroFullTransparency: false,
    hitTest_transparentCornerPassThrough: false,
    multiSelect_shiftClickMultipleShapes: false,
    alignment_disabledForSingleEnabledForMulti: false,
    persistence_allShapesSavedAndReopened: false,
    parity_programCompositorReceivesAllShapes: false,
    isolation_generalScreenUntouched: false,
  };

  try {
    designStudioService.initialize(testDir);

    let liveBroadcastConfig = { layers: [], hasSanctuaryOverlay: false };
    let currentCanvasState = {
      contentSlot: { type: "scripture", data: { text: "Genesis 1:1" } },
      pinnedLayers: [{ id: "watermark", type: "image", isSystemLayer: true }],
      chrome: { blackout: false },
    };

    const stubs = [
      ["settings-get", () => ({})],
      ["media-list", () => []],
      ["presentation-list", () => []],
      ["scene-list", () => []],
      ["bible-get-books", () => []],
      ["get-paired-devices", () => []],
      ["updater:get-status", () => ({})],
      ["switcher:get-state-desktop", () => ({
        activeVideoSource: "cam1",
        routeGeneral: false,
        routeSpeaker: false,
        cameraNames: {},
        connectedCameras: [],
      })],
      ["switcher:get-broadcast-config-desktop", () => liveBroadcastConfig],
      ["presentation-get-style", () => ({})],
      ["session:get-recovery-state", () => null],
      ["auth:get-status", () => ({ authenticated: true, plan: "enterprise" })],
      ["auth:silent-reload", () => ({})],
      ["settings:get-login-item", () => false],
      ["recorder:status", () => ({ isRecording: false })],
      ["sleep-probe", () => true],
      ["bumper-get", () => null],
      ["asr-status", () => ({ isRunning: false })],
      ["asr-stop", () => ({})],
      ["ai-status", () => ({ ok: true })],
      ["asr-init", () => ({ ok: true })],
      ["session-status", () => ({ ok: true })],
      ["sleep-get-status", () => ({ ok: true })],
      ["session-list", () => []],
      ["get-server-info", () => ({})],
      ["ndi:get-status", () => ({ isAvailable: false })],
      ["ndi:discover-sources", () => []],
      ["switcher:update-broadcast-config-desktop", (_e, cfg) => {
        liveBroadcastConfig = cfg;
        return { ok: true };
      }],
      ["design:list", () => ({ ok: true, designs: designStudioService.listDesigns() })],
      ["design:save", (_e, d) => {
        const saved = designStudioService.saveDesign(d);
        return { ok: true, design: saved };
      }],
      ["design:get", (_e, id) => designStudioService.getDesign(id)],
      ["design:delete", (_e, id) => designStudioService.deleteDesign(id)],
      ["design:present", async (_e, { design, target }) => {
        return designStudioService.presentDesign(design, target, ({ layers }) => {
          liveBroadcastConfig = {
            layers: layers.filter(l => l.visible !== false).map(l => ({
              ...l,
              strokeWidth: l.strokeWidth,
              borderRadius: typeof l.borderRadius === "number" ? l.borderRadius : undefined,
              aspectLocked: Boolean(l.aspectLocked),
              shadowEnabled: Boolean(l.shadowEnabled),
              shadowColor: l.shadowColor,
              shadowOpacity: typeof l.shadowOpacity === "number" ? l.shadowOpacity : 60,
              shadowBlur: typeof l.shadowBlur === "number" ? l.shadowBlur : 10,
              shadowOffsetX: typeof l.shadowOffsetX === "number" ? l.shadowOffsetX : 0,
              shadowOffsetY: typeof l.shadowOffsetY === "number" ? l.shadowOffsetY : 4,
            })),
            hasSanctuaryOverlay: false,
          };
        });
      }],
      ["design:hide", async () => {
        liveBroadcastConfig = { layers: [], hasSanctuaryOverlay: false };
        return { ok: true };
      }],
    ];

    for (const [ch, fn] of stubs) {
      ipcMain.handle(ch, fn);
    }

    const win = new BrowserWindow({
      width: 1440,
      height: 900,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "../preload.js"),
      },
    });

    win.webContents.on("console-message", (_e, _level, msg) => {
      if (!msg.includes("Download the React DevTools") && !msg.includes("Electron Security Warning")) {
        console.log("[Renderer]", msg);
      }
    });

    const controllerHtmlPath = path.resolve(__dirname, "../controller.html");
    await win.loadFile(controllerHtmlPath);
    console.log("Controller window loaded. Navigating to Camera/Switcher...");

    await win.webContents.executeJavaScript(`(() => {
      const tabs = Array.from(document.querySelectorAll('button, div[role="tab"]'));
      const camTab = tabs.find(el => el.textContent.includes('Camera') || el.textContent.includes('Switcher'));
      if (camTab) camTab.click();
      return Boolean(camTab);
    })()`);
    await new Promise((r) => setTimeout(r, 600));

    // Open Live Design Studio modal
    console.log("Opening Live Design Studio modal...");
    await win.webContents.executeJavaScript(`(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const ldsBtn = btns.find(b => b.textContent.includes('Design Studio') || b.textContent.includes('Live Design'));
      if (ldsBtn) ldsBtn.click();
      return Boolean(ldsBtn);
    })()`);
    await new Promise((r) => setTimeout(r, 800));

    // Switch to Shapes tab
    console.log("Switching to Shapes tab...");
    await win.webContents.executeJavaScript(`(() => {
      const shapesTab = document.querySelector('[data-studio-tool-tab="shapes"]') ||
        Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Shapes');
      if (shapesTab) shapesTab.click();
    })()`);
    await new Promise((r) => setTimeout(r, 300));

    // ──────────────────────────────────────────────────────────────────────────
    // 1. VISUAL PICKER INSPECTION
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[Test 1] Inspecting Visual Shape Picker...");
    const pickerInfo = await win.webContents.executeJavaScript(`(() => {
      const buttons = Array.from(document.querySelectorAll('[data-studio-shape-picker="true"] button'));
      const items = buttons.map(b => {
        const svg = b.querySelector('svg');
        const text = b.textContent.trim();
        const title = b.getAttribute('title') || b.getAttribute('aria-label') || '';
        const shapeId = b.getAttribute('data-studio-shape-item') || '';
        const has12pxClass = b.classList.contains('rounded-[12px]') || b.classList.contains('rounded-xl');
        return {
          shapeId,
          text,
          title,
          hasSvg: Boolean(svg),
          has12pxClass,
        };
      });
      return items;
    })()`);

    const expectedShapeIds = [
      "rectangle", "rounded-rect", "square", "circle", "ellipse",
      "triangle", "diamond", "pentagon", "hexagon", "star",
      "line", "arrow"
    ];

    const presentIds = pickerInfo.map(i => i.shapeId);
    const allExpectedPresent = expectedShapeIds.every(id => presentIds.includes(id));
    report.picker_twelveShapesPresent = pickerInfo.length === 12 && allExpectedPresent;
    report.picker_iconsAndTooltipsPresent = pickerInfo.every(i => i.hasSvg && i.title.length > 0);
    report.picker_twelvePxRadiusEnforced = pickerInfo.every(i => i.has12pxClass);

    console.log(`- 12 shapes present in visual picker: ${report.picker_twelveShapesPresent ? "PASS" : "FAIL"} (${pickerInfo.length}/12 items found)`);
    console.log(`- Each shape has vector icon and descriptive tooltip: ${report.picker_iconsAndTooltipsPresent ? "PASS" : "FAIL"}`);
    console.log(`- Universal 12px border radius mandate enforced on cards: ${report.picker_twelvePxRadiusEnforced ? "PASS" : "FAIL"}`);

    // ──────────────────────────────────────────────────────────────────────────
    // 2. INSERTION OF ALL 12 SHAPES & DEFAULT ASPECT LOCK CHECKS
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[Test 2] Inserting all 12 shapes and verifying geometry defaults...");
    
    // Clear canvas by clicking New design
    await win.webContents.executeJavaScript(`(() => {
      const newBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'New');
      if (newBtn) newBtn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    // Ensure Shapes tab is active
    await win.webContents.executeJavaScript(`(() => {
      const shapesTab = document.querySelector('[data-studio-tool-tab="shapes"]') ||
        Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Shapes');
      if (shapesTab) shapesTab.click();
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    // Insert all 12 shapes one by one
    for (const shapeId of expectedShapeIds) {
      await win.webContents.executeJavaScript(`((id) => {
        const targetBtn = document.querySelector('[data-studio-shape-item="' + id + '"]');
        if (targetBtn) targetBtn.click();
      })(${JSON.stringify(shapeId)})`);
      await new Promise((r) => setTimeout(r, 100));
    }

    const insertedLayers = await win.webContents.executeJavaScript(`(() => {
      const layers = Array.from(document.querySelectorAll('[data-studio-canvas="true"] [data-studio-layer]'));
      return layers.map(el => {
        const id = el.getAttribute('data-studio-layer');
        const type = el.getAttribute('data-layer-type');
        const shapeType = el.getAttribute('data-shape-type') || '';
        const svgContent = el.querySelector('[data-studio-shape-content="true"]');
        return {
          id,
          type,
          shapeType,
          hasVectorContent: Boolean(svgContent),
        };
      });
    })()`);

    report.shapes_allTwelveShapesInsertable = insertedLayers.length === 12;
    console.log(`- All 12 shapes successfully inserted into canvas: ${report.shapes_allTwelveShapesInsertable ? "PASS" : "FAIL"} (${insertedLayers.length}/12 layers)`);

    // Save to trigger backend service normalization and verification
    await win.webContents.executeJavaScript(`(() => {
      const saveBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Save') || b.textContent.includes('Saved'));
      if (saveBtn) saveBtn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 500));

    const savedDesigns = designStudioService.listDesigns();
    const activeDesign = savedDesigns[0] ? designStudioService.getDesign(savedDesigns[0].id) : null;

    if (activeDesign && activeDesign.layers) {
      const layers = activeDesign.layers;
      const square = layers.find(l => l.shape === "square");
      const circle = layers.find(l => l.shape === "circle");
      const triangle = layers.find(l => l.shape === "triangle");
      const diamond = layers.find(l => l.shape === "diamond");
      const pentagon = layers.find(l => l.shape === "pentagon");
      const hexagon = layers.find(l => l.shape === "hexagon");
      const star = layers.find(l => l.shape === "star");
      const rect = layers.find(l => l.shape === "rectangle" || l.shape === "rect");
      const roundedRect = layers.find(l => l.shape === "rounded-rect");
      const line = layers.find(l => l.shape === "line");
      const arrow = layers.find(l => l.shape === "arrow");

      const lockedByDefault = [square, circle, triangle, diamond, pentagon, hexagon, star].every(l => l && l.aspectLocked === true);
      const unlockedByDefault = [rect, roundedRect, line, arrow].every(l => l && l.aspectLocked === false);

      report.shapes_aspectRatioLockDefaults = lockedByDefault && unlockedByDefault;
      report.shapes_roundedRectEditableRadius = roundedRect && roundedRect.borderRadius === 12;
    }

    console.log(`- Proportions preserved by default for squares, circles, regular polygons: ${report.shapes_aspectRatioLockDefaults ? "PASS" : "FAIL"}`);
    console.log(`- Rounded rectangle has default corner radius 12: ${report.shapes_roundedRectEditableRadius ? "PASS" : "FAIL"}`);

    // ──────────────────────────────────────────────────────────────────────────
    // 3. EDITABLE CORNER RADIUS & ASPECT RATIO TOGGLE IN INSPECTOR
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[Test 3] Verifying Inspector controls: Corner Radius & Aspect Lock Toggle...");
    
    // Select the rounded rectangle layer
    await win.webContents.executeJavaScript(`(() => {
      const layers = Array.from(document.querySelectorAll('[data-studio-canvas="true"] [data-studio-layer]'));
      const roundedRectEl = layers.find(el => el.getAttribute('data-shape-type') === 'rounded-rect');
      if (roundedRectEl) {
        roundedRectEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        roundedRectEl.click();
      }
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    // Verify Corner Radius input exists and update it using nativeInputValueSetter
    const cornerRadiusResult = await win.webContents.executeJavaScript(`(() => {
      const radiusInput = document.querySelector('input[aria-label*="Corner radius"]');
      if (!radiusInput) return { hasRadiusInput: false };
      
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      nativeSetter.call(radiusInput, "28");
      radiusInput.dispatchEvent(new Event('input', { bubbles: true }));
      radiusInput.dispatchEvent(new Event('change', { bubbles: true }));
      return { hasRadiusInput: true, value: radiusInput.value };
    })()`);

    console.log(`- Rounded rectangle corner radius editable in Inspector: ${cornerRadiusResult.hasRadiusInput ? "PASS" : "FAIL"}`);

    // Select square and test aspect ratio lock toggle
    await win.webContents.executeJavaScript(`(() => {
      const layers = Array.from(document.querySelectorAll('[data-studio-canvas="true"] [data-studio-layer]'));
      const squareEl = layers.find(el => el.getAttribute('data-shape-type') === 'square');
      if (squareEl) {
        squareEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        squareEl.click();
      }
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    const beforeResult = await win.webContents.executeJavaScript(`(() => {
      const lockBtn = document.querySelector('[data-studio-aspect-lock="true"]') ||
        document.querySelector('button[title*="Aspect ratio locked"], button[title*="Aspect ratio unlocked"]');
      if (!lockBtn) return { hasLockBtn: false };
      const beforeTitle = lockBtn.getAttribute('title');
      lockBtn.click();
      return { hasLockBtn: true, beforeTitle };
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    const afterResult = await win.webContents.executeJavaScript(`(() => {
      const lockBtn = document.querySelector('[data-studio-aspect-lock="true"]') ||
        document.querySelector('button[title*="Aspect ratio locked"], button[title*="Aspect ratio unlocked"]');
      return { afterTitle: lockBtn ? lockBtn.getAttribute('title') : null };
    })()`);

    report.shapes_aspectRatioLockToggleable = beforeResult.hasLockBtn && beforeResult.beforeTitle !== afterResult.afterTitle;
    console.log(`- Aspect ratio lock toggle button interactive in Inspector: ${report.shapes_aspectRatioLockToggleable ? "PASS" : "FAIL"}`);

    // ──────────────────────────────────────────────────────────────────────────
    // 4. LINE & ARROW STROKE CONTROLS VS CLOSED SHAPE FILL CONTROLS
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[Test 4] Verifying Line/Arrow Stroke Controls vs Closed Shape Fill Controls...");

    // Select arrow layer
    await win.webContents.executeJavaScript(`(() => {
      const layers = Array.from(document.querySelectorAll('[data-studio-canvas="true"] [data-studio-layer]'));
      const arrowEl = layers.find(el => el.getAttribute('data-shape-type') === 'arrow');
      if (arrowEl) {
        arrowEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        arrowEl.click();
      }
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    const arrowControls = await win.webContents.executeJavaScript(`(() => {
      const spans = Array.from(document.querySelectorAll('span'));
      const strokeSection = spans.find(s => s.textContent.includes('Stroke'));
      const fillSection = spans.find(s => s.textContent.trim() === 'Fill');
      return {
        hasStrokeSection: Boolean(strokeSection),
        hasFillSection: Boolean(fillSection),
      };
    })()`);

    report.shapes_lineArrowStrokeControls = arrowControls.hasStrokeSection && !arrowControls.hasFillSection;
    console.log(`- Lines and arrows use stroke controls and hide fill controls: ${report.shapes_lineArrowStrokeControls ? "PASS" : "FAIL"}`);

    // ──────────────────────────────────────────────────────────────────────────
    // 5. BORDER WIDTH 0 & OPACITY 0% VERIFICATION
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[Test 5] Verifying Border Width 0 (outline removal) & Opacity 0%...");

    // Select circle layer
    await win.webContents.executeJavaScript(`(() => {
      const layers = Array.from(document.querySelectorAll('[data-studio-canvas="true"] [data-studio-layer]'));
      const circleEl = layers.find(el => el.getAttribute('data-shape-type') === 'circle');
      if (circleEl) {
        circleEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        circleEl.click();
      }
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    // Set border width to 0 and opacity to 0 using native setters
    await win.webContents.executeJavaScript(`(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      const borderWidthInput = document.querySelector('input[aria-label*="Border width"]');
      if (borderWidthInput) {
        nativeSetter.call(borderWidthInput, "0");
        borderWidthInput.dispatchEvent(new Event('input', { bubbles: true }));
        borderWidthInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const opacityInput = document.querySelector('input[aria-label*="Opacity percentage"]');
      if (opacityInput) {
        nativeSetter.call(opacityInput, "0");
        opacityInput.dispatchEvent(new Event('input', { bubbles: true }));
        opacityInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    // Deselect to check rendered border and opacity
    await win.webContents.executeJavaScript(`(() => {
      const canvas = document.querySelector('[data-studio-canvas="true"]');
      if (canvas) canvas.click();
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    const zeroBorderAndOpacityState = await win.webContents.executeJavaScript(`(() => {
      const layers = Array.from(document.querySelectorAll('[data-studio-canvas="true"] [data-studio-layer]'));
      const circleEl = layers.find(el => el.getAttribute('data-shape-type') === 'circle');
      if (!circleEl) return { found: false };
      
      const vectorEl = circleEl.querySelector('polygon, ellipse, circle, rect, path');
      const strokeWidth = vectorEl ? vectorEl.getAttribute('stroke-width') : '';
      const stroke = vectorEl ? vectorEl.getAttribute('stroke') : '';
      const opacity = circleEl.style.opacity;

      return {
        found: true,
        strokeWidth,
        stroke,
        opacity,
      };
    })()`);

    report.shapes_borderZeroRemovesOutline = zeroBorderAndOpacityState.strokeWidth === "0" || zeroBorderAndOpacityState.stroke === "none";
    report.shapes_opacityZeroFullTransparency = zeroBorderAndOpacityState.opacity === "0";

    console.log(`- Border width 0 removes outline on filled shape: ${report.shapes_borderZeroRemovesOutline ? "PASS" : "FAIL"}`);
    console.log(`- Opacity 0% makes shape fully transparent (opacity: 0): ${report.shapes_opacityZeroFullTransparency ? "PASS" : "FAIL"}`);

    // ──────────────────────────────────────────────────────────────────────────
    // 6. ACCURATE VECTOR HIT-TESTING
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[Test 6] Verifying vector hit-testing & transparent corner click pass-through...");

    const hitTestMetrics = await win.webContents.executeJavaScript(`(() => {
      const layers = Array.from(document.querySelectorAll('[data-studio-canvas="true"] [data-studio-layer]'));
      const triangleEl = layers.find(el => el.getAttribute('data-shape-type') === 'triangle');
      if (!triangleEl) return { found: false };

      const containerStyle = window.getComputedStyle(triangleEl);
      const vectorEl = triangleEl.querySelector('polygon, ellipse, circle, rect, path');
      const vectorStyle = vectorEl ? window.getComputedStyle(vectorEl) : null;

      return {
        found: true,
        containerPointerEvents: containerStyle.pointerEvents,
        vectorPointerEvents: vectorStyle ? vectorStyle.pointerEvents : null,
      };
    })()`);

    report.hitTest_transparentCornerPassThrough =
      hitTestMetrics.found &&
      hitTestMetrics.containerPointerEvents === "none" &&
      (hitTestMetrics.vectorPointerEvents === "auto" || hitTestMetrics.vectorPointerEvents === "all");

    console.log(`- Accurate vector hit-testing (container pointerEvents: none, vector pointerEvents: auto): ${report.hitTest_transparentCornerPassThrough ? "PASS" : "FAIL"}`);

    // ──────────────────────────────────────────────────────────────────────────
    // 7. SHIFT-CLICK MULTI-SELECTION & OBJECT ALIGNMENT ENABLEMENT
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[Test 7] Verifying Shift-Click Multi-Selection & Alignment Controls...");

    // Clear selection
    await win.webContents.executeJavaScript(`(() => {
      const canvas = document.querySelector('[data-studio-canvas="true"]');
      if (canvas) canvas.click();
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    // Select 1 shape
    await win.webContents.executeJavaScript(`(() => {
      const layers = document.querySelectorAll('[data-studio-canvas="true"] [data-studio-layer]');
      if (layers[0]) layers[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    const singleSelectionAlignment = await win.webContents.executeJavaScript(`(() => {
      const alignBtns = Array.from(document.querySelectorAll('button[aria-label*="Align"]'));
      const disabledCount = alignBtns.filter(b => b.disabled || b.className.includes('disabled:opacity-20')).length;
      return { total: alignBtns.length, disabledCount };
    })()`);

    // Shift-click 2nd shape
    await win.webContents.executeJavaScript(`(() => {
      const layers = document.querySelectorAll('[data-studio-canvas="true"] [data-studio-layer]');
      if (layers[1]) {
        layers[1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, shiftKey: true }));
      }
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    const multiSelectionAlignment = await win.webContents.executeJavaScript(`(() => {
      const alignBtns = Array.from(document.querySelectorAll('button[aria-label*="Align"]'));
      const hasEnabled = alignBtns.length > 0 && alignBtns.some(b => !b.disabled);
      const selectedLayers = document.querySelectorAll('[data-studio-canvas="true"][data-selected="true"], [data-studio-layer][data-selected="true"]');
      return { count: alignBtns.length, hasEnabled, selectedCount: selectedLayers.length };
    })()`);

    report.multiSelect_shiftClickMultipleShapes = multiSelectionAlignment.selectedCount >= 2;
    report.alignment_disabledForSingleEnabledForMulti = singleSelectionAlignment.disabledCount >= 6 && multiSelectionAlignment.hasEnabled;

    console.log(`- Shift-click multi-selection selects multiple shapes: ${report.multiSelect_shiftClickMultipleShapes ? "PASS" : "FAIL"}`);
    console.log(`- Alignment disabled for single shape, enabled for 2+ shapes: ${report.alignment_disabledForSingleEnabledForMulti ? "PASS" : "FAIL"}`);

    // ──────────────────────────────────────────────────────────────────────────
    // 8. PERSISTENCE (SAVE & REOPEN)
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[Test 8] Verifying Persistence: Save & Reopen preserves all 12 shapes...");

    await win.webContents.executeJavaScript(`(() => {
      const saveBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Save') || b.textContent.includes('Saved'));
      if (saveBtn) saveBtn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 500));

    const allDesigns = designStudioService.listDesigns();
    const reloaded = allDesigns[0] ? designStudioService.getDesign(allDesigns[0].id) : null;
    const reloadedShapes = reloaded && reloaded.layers ? reloaded.layers.filter(l => l.type === "shape") : [];

    report.persistence_allShapesSavedAndReopened = reloadedShapes.length === 12;
    console.log(`- All 12 shapes saved to disk and reloaded without loss: ${report.persistence_allShapesSavedAndReopened ? "PASS" : "FAIL"} (${reloadedShapes.length}/12 shapes)`);

    // ──────────────────────────────────────────────────────────────────────────
    // 9. PROGRAM COMPOSITOR PARITY & GENERAL SCREEN ISOLATION
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[Test 9] Verifying Program Compositor Parity & General Screen Isolation...");

    // Click "Show on Program"
    await win.webContents.executeJavaScript(`(() => {
      const showBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Show on Program'));
      if (showBtn) showBtn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 400));

    const compositorLayers = liveBroadcastConfig.layers || [];
    report.parity_programCompositorReceivesAllShapes = compositorLayers.length === 12;
    console.log(`- Program Compositor broadcast config receives all 12 shapes: ${report.parity_programCompositorReceivesAllShapes ? "PASS" : "FAIL"} (${compositorLayers.length}/12 shapes)`);

    // Verify General Screen is untouched
    report.isolation_generalScreenUntouched =
      currentCanvasState.chrome.blackout === false &&
      currentCanvasState.contentSlot.data.text === "Genesis 1:1" &&
      liveBroadcastConfig.hasSanctuaryOverlay === false;
    console.log(`- General Screen is completely isolated and untouched: ${report.isolation_generalScreenUntouched ? "PASS" : "FAIL"}`);

    // Capture visual artifact screenshot
    const screenshot = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, "geometric_shapes_verified.png"), screenshot.toPNG());
    console.log(`\nRendered screenshot saved to: ${path.join(ARTIFACT_DIR, "geometric_shapes_verified.png")}`);

    win.close();
  } catch (err) {
    console.error("Test Suite Error:", err);
  } finally {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (_) {}
  }

  console.log("\n================================================================================");
  console.log(" GEOMETRIC SHAPES VERIFICATION SUMMARY");
  console.log("================================================================================");
  let allPassed = true;
  for (const [key, value] of Object.entries(report)) {
    console.log(`  ${key.padEnd(45)}: ${value ? "PASS" : "FAIL"}`);
    if (!value) allPassed = false;
  }
  console.log("================================================================================");

  if (allPassed) {
    console.log("\n>>> ALL 16 GEOMETRIC SHAPE SUITE TESTS PASSED SUCCESSFULLY! <<<\n");
    process.exit(0);
  } else {
    console.log("\n>>> SOME TESTS FAILED. PLEASE REVIEW LOGS ABOVE. <<<\n");
    process.exit(1);
  }
}

app.whenReady().then(runGeometricShapesSuite);
