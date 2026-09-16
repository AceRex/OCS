const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { DesignStudioService } = require("../src/main/design/designStudioService");

const testDir = path.join(os.tmpdir(), `ocs_lt_visibility_${Date.now()}`);
fs.mkdirSync(testDir, { recursive: true });

app.whenReady().then(async () => {
  console.log("================================================================================");
  console.log(" REPRODUCING LOWER-THIRD VISIBILITY IN RUNNING APP");
  console.log("================================================================================\n");

  const designStudioService = new DesignStudioService();
  designStudioService.initialize(testDir);

  let liveBroadcastConfig = {
    layers: [],
    activeStudioControls: [],
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
    if (typeof payload.hasSanctuaryOverlay === "boolean") liveBroadcastConfig.hasSanctuaryOverlay = payload.hasSanctuaryOverlay;
    console.log("[Main] updateLiveBroadcastConfig:", JSON.stringify({
      controlsCount: liveBroadcastConfig.activeStudioControls?.length,
      controls: liveBroadcastConfig.activeStudioControls?.map(c => ({ id: c.id, status: c.status, layers: c.snapshotLayers?.length })),
    }));
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

  ipcMain.handle("design:list-live-controls", async () => {
    return { ok: true, liveControls: designStudioService.listLiveControls() };
  });

  ipcMain.handle("design:save-live-control", async (_event, controlData) => {
    const saved = designStudioService.saveLiveControl(controlData);
    if (controllerWin && !controllerWin.isDestroyed()) {
      controllerWin.webContents.send("design:live-controls-changed", designStudioService.listLiveControls());
    }
    return saved;
  });

  ipcMain.handle("design:set-active-controls-overlays", async (_event, overlays) => {
    console.log("[Main IPC] design:set-active-controls-overlays called with:", JSON.stringify(overlays?.map(c => ({ id: c.id, status: c.status, layers: c.snapshotLayers?.length }))));
    updateLiveBroadcastConfig({ activeStudioControls: overlays || [] });
    return { ok: true };
  });

  ipcMain.handle("design:list", async () => ({ ok: true, designs: designStudioService.listDesigns() }));
  ipcMain.handle("design:save", async (_event, design) => ({ ok: true, design: designStudioService.saveDesign(design) }));
  ipcMain.handle("design:delete", async (_event, id) => designStudioService.deleteDesign(id));
  ipcMain.handle("design:get-live-state", async () => designStudioService.getLiveState());

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

  const capturedErrors = [];
  const capturedLogs = [];

  controllerWin.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    capturedLogs.push(`[Console ${level}] ${message} (line ${line} in ${sourceId})`);
    console.log(`[Renderer] ${message}`);
    if (level >= 2 || message.includes("Error") || message.includes("error") || message.includes("ReferenceError")) {
      capturedErrors.push(`[Console Error] ${message} (line ${line} in ${sourceId})`);
      console.error(`  >>> CONSOLE ERROR: ${message}`);
    }
  });

  await controllerWin.loadFile(path.resolve(__dirname, "../controller.html"));
  await new Promise((r) => setTimeout(r, 2000));

  console.log("Controller loaded. Executing reproduce-renderer-test.js...");

  const scriptContent = fs.readFileSync(path.resolve(__dirname, "./reproduce-renderer-test.js"), "utf8");
  const diagResult = await controllerWin.webContents.executeJavaScript(scriptContent);
  if (diagResult?.dataUrl) {
    const base64Data = diagResult.dataUrl.replace(/^data:image\/png;base64,/, "");
    const outPath = "/Users/rex/.gemini/antigravity-ide/brain/bd3bde1e-9a06-417e-8c35-186f76e2f2da/lower_third_rendered_visibility.png";
    fs.writeFileSync(outPath, Buffer.from(base64Data, "base64"));
    console.log(`Saved rendered canvas image to: ${outPath}`);
    delete diagResult.dataUrl;
  }

  console.log("Diagnostic Result:", JSON.stringify(diagResult, null, 2));
  console.log("Captured Errors Count:", capturedErrors.length);
  capturedErrors.forEach(e => console.log("ERROR:", e));

  await controllerWin.close();
  app.quit();
});
