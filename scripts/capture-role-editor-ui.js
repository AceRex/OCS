const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { DesignStudioService } = require("../src/main/design/designStudioService");

const testDir = path.join(os.tmpdir(), `ocs_editor_ui_vis_${Date.now()}`);
fs.mkdirSync(testDir, { recursive: true });

const ARTIFACT_DIR = "/Users/rex/.gemini/antigravity-ide/brain/bd3bde1e-9a06-417e-8c35-186f76e2f2da";

app.whenReady().then(async () => {
  const designStudioService = new DesignStudioService();
  designStudioService.initialize(testDir);

  const bibleTemplate = designStudioService.saveDesign({
    name: "Sanctuary Gold Scripture",
    role: "bible",
    layers: [
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
      },
      {
        id: "bible-txt-ref",
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
        id: "bible-txt-verse",
        type: "text",
        fieldBinding: "verseText",
        text: "For God so loved the world...",
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

  let liveBroadcastConfig = {
    layers: [],
    activeStudioControls: [],
    bibleLowerThird: { enabled: true, autoTrigger: true, isShowing: false },
    hasSanctuaryOverlay: false,
    scale: 1.0,
    fitMode: "cover",
  };

  let controllerWin = null;

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
    ["switcher:update-broadcast-config-desktop", () => ({})],
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
    ["design:list-live-controls", async () => ({ ok: true, liveControls: designStudioService.listLiveControls() })],
    ["design:list", async () => ({ ok: true, designs: designStudioService.listDesigns() })],
    ["design:listDesigns", async () => ({ ok: true, designs: designStudioService.listDesigns() })],
    ["design:save", async (_event, design) => ({ ok: true, design: designStudioService.saveDesign(design) })],
    ["design:get-live-state", async () => designStudioService.getLiveState()],
    ["design:get-role-assignments", async () => ({ ok: true, roleAssignments: designStudioService.getRoleAssignments() })],
    ["design:set-role-assignment", async (_event, { role, templateId }) => designStudioService.setRoleAssignment(role, templateId)],
  ];

  for (const [channel, handler] of stubs) {
    ipcMain.handle(channel, handler);
  }

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

  const selectLayerScript = `
    (async () => {
      // Find and click the layer item in the layer stack
      const layerItems = Array.from(document.querySelectorAll("button, div")).filter(el => el.textContent?.includes("Speaker Name") || el.textContent?.includes("Role / Subtitle"));
      if (layerItems[0]) {
        layerItems[0].click();
      }
      return { ok: true };
    })()
  `;

  await controllerWin.webContents.executeJavaScript(selectLayerScript);
  await new Promise((r) => setTimeout(r, 800));

  const image = await controllerWin.capturePage();
  const outPath = path.join(ARTIFACT_DIR, "live_design_studio_inspector_verified.png");
  fs.writeFileSync(outPath, image.toPNG());
  console.log(`✓ Saved inspector screenshot to: ${outPath}`);

  await controllerWin.close();
  app.quit();
});
