const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { DesignStudioService } = require("../src/main/design/designStudioService");

const testDir = path.join(os.tmpdir(), `ocs_role_lt_vis_${Date.now()}`);
fs.mkdirSync(testDir, { recursive: true });

const ARTIFACT_DIR = "/Users/rex/.gemini/antigravity-ide/brain/bd3bde1e-9a06-417e-8c35-186f76e2f2da";

app.whenReady().then(async () => {
  console.log("================================================================================");
  console.log(" VISUAL VERIFICATION: ROLE-BASED LOWER THIRDS IN RUNNING APP");
  console.log("================================================================================\n");

  const designStudioService = new DesignStudioService();
  designStudioService.initialize(testDir);

  // Create and save an elegant Bible Lower Third template
  const bibleTemplate = designStudioService.saveDesign({
    name: "Sanctuary Gold Scripture",
    role: "bible",
    transition: {
      entrance: { type: "slide-bottom", duration: 450, easing: "ease-out" },
      exit: { type: "slide-bottom", duration: 350, easing: "ease-in" },
    },
    layers: [
      // Outer card (universal 12px border radius)
      {
        id: "bible-card-bg",
        type: "shape",
        shape: "rounded-rect",
        fill: "rgba(15, 17, 26, 0.92)",
        stroke: "rgba(245, 158, 11, 0.6)",
        strokeWidth: 2,
        borderRadius: 12,
        width: 86,
        height: 18,
        x: 50,
        y: 86,
        shadowEnabled: true,
        shadowColor: "#000000",
        shadowOpacity: 80,
        shadowBlur: 20,
        shadowOffsetY: 6,
      },
      // Accent bar
      {
        id: "bible-accent-bar",
        type: "shape",
        shape: "rounded-rect",
        fill: "#F59E0B",
        borderRadius: 12,
        width: 0.8,
        height: 14,
        x: 10,
        y: 86,
      },
      // Reference header
      {
        id: "bible-txt-ref",
        type: "text",
        fieldBinding: "reference",
        text: "Reference",
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
      // Version pill
      {
        id: "bible-txt-ver",
        type: "text",
        fieldBinding: "version",
        text: "KJV",
        fontSize: 16,
        fontWeight: "bold",
        fontFamily: "Inter, sans-serif",
        color: "#9CA3AF",
        textAlign: "right",
        width: 15,
        height: 5,
        x: 85,
        y: 81,
      },
      // Scripture passage body
      {
        id: "bible-txt-verse",
        type: "text",
        fieldBinding: "verseText",
        text: "Scripture passage text...",
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

  // Assign this template as default
  designStudioService.setRoleAssignment("bible", bibleTemplate.id);
  console.log(`[Setup] Created & assigned default Bible template: ${bibleTemplate.id}`);

  let liveBroadcastConfig = {
    layers: [],
    activeStudioControls: [],
    bibleLowerThird: { enabled: true, autoTrigger: true, isShowing: false },
    hasSanctuaryOverlay: false,
    scale: 1.0,
    fitMode: "cover",
  };

  let controllerWin = null;

  function broadcastLiveConfig() {
    if (controllerWin && !controllerWin.isDestroyed()) {
      controllerWin.webContents.send("switcher-broadcast-config", liveBroadcastConfig);
    }
  }

  function updateLiveBroadcastConfig(payload = {}) {
    if (!payload || typeof payload !== "object") return;
    if (Array.isArray(payload.layers)) liveBroadcastConfig.layers = payload.layers;
    if (Array.isArray(payload.activeStudioControls)) liveBroadcastConfig.activeStudioControls = payload.activeStudioControls;
    if (payload.bibleLowerThird && typeof payload.bibleLowerThird === "object") {
      liveBroadcastConfig.bibleLowerThird = { ...liveBroadcastConfig.bibleLowerThird, ...payload.bibleLowerThird };
    }
    broadcastLiveConfig();
  }

  // Stubs
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
    ["switcher:update-broadcast-config-desktop", (_e, cfg) => updateLiveBroadcastConfig(cfg)],
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
  ];

  for (const [channel, handler] of stubs) {
    ipcMain.handle(channel, handler);
  }

  ipcMain.handle("design:list-live-controls", async () => ({ ok: true, liveControls: designStudioService.listLiveControls() }));
  ipcMain.handle("design:list", async () => ({ ok: true, designs: designStudioService.listDesigns() }));
  ipcMain.handle("design:listDesigns", async () => ({ ok: true, designs: designStudioService.listDesigns() }));
  ipcMain.handle("design:save", async (_event, design) => ({ ok: true, design: designStudioService.saveDesign(design) }));
  ipcMain.handle("design:get-live-state", async () => designStudioService.getLiveState());
  ipcMain.handle("design:get-role-assignments", async () => ({ ok: true, roleAssignments: designStudioService.getRoleAssignments() }));
  ipcMain.handle("design:set-role-assignment", async (_event, { role, templateId }) => designStudioService.setRoleAssignment(role, templateId));

  ipcMain.handle("design:set-active-controls-overlays", async (_event, overlays) => {
    updateLiveBroadcastConfig({ activeStudioControls: overlays || [] });
    return { ok: true };
  });

  controllerWin = new BrowserWindow({
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

  console.log("Controller loaded. Resolving and publishing assigned Scripture Lower-Third...");

  // Resolve John 3:16
  const scripture1 = {
    verseText: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
    reference: "John 3:16",
    version: "KJV",
  };

  const resolvedLayers1 = designStudioService.resolveTemplateLayers(bibleTemplate, "bible", scripture1);

  const testScript = `
    (async () => {
      const canvases = Array.from(document.querySelectorAll("canvas"));
      const programCanvas = canvases.find((c) => c.width === 1280 && c.height === 720) || canvases[0];

      // Publish resolved Bible Lower-Third control
      await window.electron.DesignStudio.setActiveControlsOverlays([
        {
          id: "role_playback_bible",
          role: "bible",
          label: "Scripture: John 3:16",
          snapshotLayers: ${JSON.stringify(resolvedLayers1)},
          transition: ${JSON.stringify(bibleTemplate.transition)},
          status: "live",
          animStartTime: Date.now(),
        }
      ]);

      await new Promise((r) => setTimeout(r, 500));

      const dataUrl1 = programCanvas.toDataURL("image/png");

      // In-place update to Romans 8:28
      const scripture2 = {
        verseText: "And we know that all things work together for good to them that love God, to them who are the called according to his purpose.",
        reference: "Romans 8:28",
        version: "KJV",
      };

      const resolvedLayers2 = ${JSON.stringify(
        designStudioService.resolveTemplateLayers(bibleTemplate, "bible", {
          verseText: "And we know that all things work together for good to them that love God, to them who are the called according to his purpose.",
          reference: "Romans 8:28",
          version: "KJV",
        })
      )};

      await window.electron.DesignStudio.setActiveControlsOverlays([
        {
          id: "role_playback_bible",
          role: "bible",
          label: "Scripture: Romans 8:28",
          snapshotLayers: resolvedLayers2,
          transition: ${JSON.stringify(bibleTemplate.transition)},
          status: "live",
          animStartTime: Date.now() - 5000, // untouched
        }
      ]);

      await new Promise((r) => setTimeout(r, 500));

      const dataUrl2 = programCanvas.toDataURL("image/png");

      return { dataUrl1, dataUrl2 };
    })()
  `;

  const { dataUrl1, dataUrl2 } = await controllerWin.webContents.executeJavaScript(testScript);

  if (dataUrl1) {
    const base64Data = dataUrl1.replace(/^data:image\/png;base64,/, "");
    const outPath = path.join(ARTIFACT_DIR, "scripture_role_lower_third_verified.png");
    fs.writeFileSync(outPath, Buffer.from(base64Data, "base64"));
    console.log(`✓ Saved visual verification screenshot (John 3:16) to: ${outPath}`);
  }

  if (dataUrl2) {
    const base64Data2 = dataUrl2.replace(/^data:image\/png;base64,/, "");
    const outPath2 = path.join(ARTIFACT_DIR, "scripture_in_place_update_verified.png");
    fs.writeFileSync(outPath2, Buffer.from(base64Data2, "base64"));
    console.log(`✓ Saved in-place update screenshot (Romans 8:28) to: ${outPath2}`);
  }

  console.log("\nVisual runtime proof complete!");
  await controllerWin.close();
  app.quit();
});
