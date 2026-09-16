const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { DesignStudioService } = require("../src/main/design/designStudioService");

const testDir = path.join(os.tmpdir(), `ocs_studio_simple_ui_${Date.now()}`);
fs.mkdirSync(testDir, { recursive: true });

const ARTIFACT_DIR = "/Users/rex/.gemini/antigravity-ide/brain/bd3bde1e-9a06-417e-8c35-186f76e2f2da";

app.whenReady().then(async () => {
  const designStudioService = new DesignStudioService();
  designStudioService.initialize(testDir);

  const bibleTemplate = designStudioService.saveDesign({
    name: "Sanctuary Scripture Gold",
    role: "bible",
    layers: [
      {
        id: "bg-shape",
        type: "shape",
        shape: "rounded-rect",
        fill: "rgba(15, 17, 26, 0.95)",
        stroke: "rgba(245, 158, 11, 0.6)",
        strokeWidth: 2,
        borderRadius: 12,
        width: 86,
        height: 18,
        x: 50,
        y: 86,
      },
      {
        id: "ref-text",
        type: "text",
        fieldBinding: "reference",
        text: "John 3:16",
        fontSize: 22,
        fontWeight: "bold",
        fontFamily: "Inter, sans-serif",
        color: "#FBBF24",
        textAlign: "left",
        width: 30,
        height: 5,
        x: 27,
        y: 81,
      },
      {
        id: "verse-text",
        type: "text",
        fieldBinding: "verseText",
        text: "For God so loved the world that He gave His only begotten Son...",
        fontSize: 20,
        minFontSize: 14,
        wrap: true,
        fontFamily: "Inter, sans-serif",
        color: "#FFFFFF",
        textAlign: "left",
        width: 76,
        height: 10,
        x: 50,
        y: 89,
      },
    ],
  });

  designStudioService.setRoleAssignment("bible", bibleTemplate.id);

  let presentedStream = null;
  let activeOverlays = [];

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
    ["switcher:get-broadcast-config-desktop", () => ({
      layers: [],
      activeStudioControls: [],
      bibleLowerThird: { enabled: true, autoTrigger: true, isShowing: false },
      hasSanctuaryOverlay: false,
      scale: 1.0,
      fitMode: "cover",
    })],
    ["switcher:update-broadcast-config-desktop", (_event, cfg) => {
      // Record any uncommanded broadcast config updates
      return { ok: true };
    }],
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
    ["ai-status", () => ({ enabled: false })],
    ["asr-init", () => ({})],
    ["session-status", () => ({})],
    ["sleep-get-status", () => ({})],
    ["session-list", () => []],
    ["get-server-info", () => ({ ip: "127.0.0.1", port: 4000 })],
    ["ndi:get-status", () => ({ enabled: false })],
    ["ndi:discover-sources", () => []],
    ["design:list-live-controls", async () => ({ ok: true, liveControls: designStudioService.listLiveControls() })],
    ["design:list", async () => ({ ok: true, designs: designStudioService.listDesigns() })],
    ["design:listDesigns", async () => ({ ok: true, designs: designStudioService.listDesigns() })],
    ["design:save", async (_event, design) => ({ ok: true, design: designStudioService.saveDesign(design) })],
    ["design:create-live-control", async (_event, data) => ({ ok: true, control: designStudioService.createLiveControlFromDesign(data.designId, data) })],
    ["design:update-live-control", async (_event, data) => ({ ok: true, control: designStudioService.updateLiveControl(data.controlId, data.updates) })],
    ["design:delete-live-control", async (_event, data) => ({ ok: true, success: designStudioService.deleteLiveControl(data.controlId) })],
    ["design:set-active-controls-overlays", async (_event, overlays) => {
      activeOverlays = overlays;
      return { ok: true };
    }],
    ["design:get-live-state", async () => designStudioService.getLiveState()],
    ["design:get-role-assignments", async () => ({ ok: true, roleAssignments: designStudioService.getRoleAssignments() })],
    ["design:set-role-assignment", async (_event, { role, templateId }) => designStudioService.setRoleAssignment(role, templateId)],
    ["design:present", async (_event, { design, destination }) => {
      presentedStream = { design, destination };
      return { ok: true };
    }],
    ["design:hide", async () => {
      presentedStream = null;
      return { ok: true };
    }],
  ];

  for (const [channel, handler] of stubs) {
    ipcMain.handle(channel, handler);
  }

  const controllerWin = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.resolve(__dirname, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  await controllerWin.loadFile(path.resolve(__dirname, "../controller.html"));
  await new Promise((r) => setTimeout(r, 2000));

  // 1. Verify studio modal can be opened and inspect its DOM
  const testResults = await controllerWin.webContents.executeJavaScript(`
    (async () => {
      const results = {
        checks: [],
        errors: [],
      };

      // Find studio button: look specifically for button element
      const asideBtns = Array.from(document.querySelectorAll("aside button"));
      let studioBtn = null;

      // Try on current screen first
      const getStudioBtn = () => Array.from(document.querySelectorAll("button")).find(b => {
        const txt = b.textContent?.toLowerCase() || "";
        return (txt.includes("live design studio") || txt.includes("design studio")) && !b.closest("aside");
      });

      studioBtn = getStudioBtn();

      if (!studioBtn) {
        // Navigate through aside buttons
        for (const btn of asideBtns) {
          btn.click();
          await new Promise(r => setTimeout(r, 400));
          studioBtn = getStudioBtn();
          if (studioBtn) break;
        }
      }

      if (!studioBtn) {
        results.errors.push("Could not find button to open Live Design Studio. Found text snippets: " + allButtons.slice(0, 20).join(" | "));
        return results;
      }

      results.checks.push({ name: "Found studio open button: " + studioBtn.textContent?.trim().slice(0, 30), passed: true });
      studioBtn.click();
      await new Promise(r => setTimeout(r, 1200));

      const modal = document.querySelector('[data-studio-modal="true"]');
      if (!modal) {
        results.errors.push("Live Design Studio modal did not open");
        return results;
      }
      results.checks.push({ name: "Studio modal opened", passed: true });

      const modalText = modal.innerText || "";

      // 1. Verify 'Show on Program' is completely absent
      const hasShowOnProgram = modalText.includes("Show on Program") || !!modal.querySelector('[aria-label="Show on Program"]');
      results.checks.push({
        name: "Absent: 'Show on Program'",
        passed: !hasShowOnProgram,
        detail: hasShowOnProgram ? "Found 'Show on Program' in modal" : "Absent as required"
      });

      // 2. Verify 'Output: Standby' and 'ON AIR (Live Program)' are absent
      const hasOutputStatus = modalText.includes("Output: STANDBY") || modalText.includes("Output: Standby") || modalText.includes("ON AIR (Live Program)");
      results.checks.push({
        name: "Absent: 'Output: Standby' / Output status badge",
        passed: !hasOutputStatus,
        detail: hasOutputStatus ? "Found output status badge in modal" : "Absent as required"
      });

      // 3. Verify 'Sample Preview' / 'Realistic Sample Preview' are absent
      const hasSamplePreview = modalText.includes("Sample Preview") || modalText.includes("Realistic Sample Preview");
      results.checks.push({
        name: "Absent: 'Sample Preview' toggle/button",
        passed: !hasSamplePreview,
        detail: hasSamplePreview ? "Found Sample Preview in modal" : "Absent as required"
      });

      // Verify 'CANVA COMPOSITOR' badge is absent
      const hasCanvaBadge = modalText.includes("CANVA COMPOSITOR");
      results.checks.push({
        name: "Absent: 'CANVA COMPOSITOR' badge",
        passed: !hasCanvaBadge,
        detail: hasCanvaBadge ? "Found CANVA COMPOSITOR badge in modal" : "Absent as required"
      });

      // Verify select dropdown after New button is absent
      const hasDesignSelect = !!modal.querySelector('select[aria-label="Select Saved Design"]');
      results.checks.push({
        name: "Absent: Saved design select dropdown after New button",
        passed: !hasDesignSelect,
        detail: hasDesignSelect ? "Found select dropdown after New button" : "Absent as required"
      });

      // 4. Verify editing canvas is visible and rendered
      const canvasContainer = modal.querySelector(".canvas-interactive-area") || modal.querySelector('[data-canvas-container="true"]') || modal.querySelector("div.relative.shadow-2xl");
      results.checks.push({
        name: "Editing canvas visible and interactive",
        passed: !!canvasContainer,
        detail: canvasContainer ? "Canvas is mounted and visible" : "Canvas container not found"
      });

      // 5. Verify Save / Add to Live Controls button is present
      const addLiveCtrlBtn = modal.querySelector('[aria-label="Add to Live Controls"]') || Array.from(modal.querySelectorAll("button")).find(b => b.textContent?.includes("Add to Live Controls"));
      results.checks.push({
        name: "Present: 'Add to Live Controls'",
        passed: !!addLiveCtrlBtn,
        detail: addLiveCtrlBtn ? "Add to Live Controls button present" : "Missing button"
      });

      // 6. Verify Role selection ('Use As') is present
      const roleSelect = modal.querySelector('[aria-label="Use As Role"]');
      results.checks.push({
        name: "Present: Role selection ('Use As')",
        passed: !!roleSelect,
        detail: roleSelect ? "Role dropdown found (label: Use As Role)" : "Missing role selector"
      });

      if (roleSelect) {
        roleSelect.value = "bible";
        roleSelect.dispatchEvent(new Event("change", { bubbles: true }));
        await new Promise(r => setTimeout(r, 600));
      }

      // Click a template in the shelf to populate layers with field bindings
      const templateCard = Array.from(modal.querySelectorAll('[role="button"]')).find(el => el.textContent?.includes("Minimal") || el.textContent?.includes("Lower Third"));
      if (templateCard) {
        templateCard.click();
        await new Promise(r => setTimeout(r, 600));
      }

      // 7. Verify 'Set as Default' button is present for role
      const setDefaultBtn = Array.from(modal.querySelectorAll("button")).find(b => b.textContent?.includes("Default"));
      results.checks.push({
        name: "Present: 'Set as Default' role button",
        passed: !!setDefaultBtn,
        detail: setDefaultBtn ? ("Default role button present ('" + setDefaultBtn.textContent.trim() + "')") : "Missing Set as Default button"
      });

      // 8. Verify field bindings displayed on canvas
      const fieldBadges = Array.from(modal.querySelectorAll("span")).filter(s => s.textContent?.includes("[reference]") || s.textContent?.includes("[verseText]") || s.textContent?.includes("[speakerName]"));
      results.checks.push({
        name: "Content-field bindings visible on canvas",
        passed: fieldBadges.length > 0,
        detail: fieldBadges.length > 0 ? fieldBadges.map(b => b.textContent.trim()).join(", ") : "No field badges found"
      });

      // 9. Verify 12px border radius compliance on buttons and containers
      const headerBtns = Array.from(modal.querySelectorAll("button"));
      const non12px = headerBtns.filter(b => {
        const style = window.getComputedStyle(b);
        const radius = style.borderRadius;
        // Accept 12px or full-rounded pills (like 9999px)
        return radius !== "12px" && radius !== "9999px" && radius !== "50%";
      });
      const non12pxDetails = non12px.map(b => '"' + (b.textContent?.trim() || b.getAttribute('title') || b.className) + '" (' + window.getComputedStyle(b).borderRadius + ')').slice(0, 5);
      results.checks.push({
        name: "Universal 12px border radius compliance",
        passed: non12px.length === 0,
        detail: non12px.length === 0 ? "All buttons adhere to 12px or pill radius" : (non12px.length + " buttons have non-compliant radius: " + non12pxDetails.join(", "))
      });

      return results;
    })()
  `);

  console.log("\n================================================================================");
  console.log(" SIMPLIFIED LIVE DESIGN STUDIO INTERFACE VERIFICATION");
  console.log("================================================================================\n");

  let allPassed = true;
  for (const check of testResults.checks) {
    const mark = check.passed ? "✓ PASS:" : "✗ FAIL:";
    console.log(`  ${mark} ${check.name} - ${check.detail}`);
    if (!check.passed) allPassed = false;
  }

  if (testResults.errors && testResults.errors.length > 0) {
    console.error("\nErrors encountered:");
    testResults.errors.forEach(e => console.error(`  - ${e}`));
    allPassed = false;
  }

  // Also verify that nothing was presented on air unexpectedly
  console.log(`  ${presentedStream === null ? "✓ PASS:" : "✗ FAIL:"} Uncommanded presentation: presentedStream is null (no air output triggered)`);
  if (presentedStream !== null) allPassed = false;

  // Capture screenshot of simplified studio UI
  await new Promise(r => setTimeout(r, 600));
  const image = await controllerWin.capturePage();
  const outPath = path.join(ARTIFACT_DIR, "live_design_studio_simplified_verified.png");
  fs.writeFileSync(outPath, image.toPNG());
  console.log(`\n✓ Saved verified simplified studio UI screenshot to: ${outPath}`);

  await controllerWin.close();
  app.quit();

  if (!allPassed) {
    process.exit(1);
  }
});
