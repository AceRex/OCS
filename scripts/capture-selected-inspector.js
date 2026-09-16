const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { designStudioService } = require("../src/main/design/designStudioService");

const testDir = path.join(os.tmpdir(), `ocs_snap_${Date.now()}`);
fs.mkdirSync(testDir, { recursive: true });
designStudioService.initialize(testDir);

app.whenReady().then(async () => {
  const win = new BrowserWindow({
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

  const stubs = [
    ["settings-get", () => ({})],
    ["media-list", () => []],
    ["presentation-list", () => []],
    ["scene-list", () => []],
    ["bible-get-books", () => []],
    ["get-paired-devices", () => []],
    ["updater:get-status", () => ({})],
    ["switcher:get-state-desktop", () => ({ activeVideoSource: "cam1" })],
    ["switcher:get-broadcast-config-desktop", () => ({ layers: [], hasSanctuaryOverlay: false })],
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
    ["design:list", async () => ({ ok: true, designs: [] })],
    ["design:save", async (_event, d) => ({ ok: true, design: d })],
    ["design:get-live-state", async () => ({ isLive: false, layers: [] })],
  ];
  for (const [ch, fn] of stubs) ipcMain.handle(ch, fn);

  await win.loadFile(path.resolve(__dirname, "../controller.html"));
  await new Promise(r => setTimeout(r, 1500));

  // Open Studio
  await win.webContents.executeJavaScript(`
    (() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const studioBtn = buttons.find(b => b.textContent.includes("Live Design Studio") || b.textContent.includes("Design Studio"));
      if (studioBtn) studioBtn.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 1200));

  // Click on a layer in the Layers Stack on the right to select it
  await win.webContents.executeJavaScript(`
    (() => {
      const stackItems = Array.from(document.querySelectorAll(".truncate.font-semibold"));
      if (stackItems.length > 0) {
        stackItems[0].closest('[class*="cursor-pointer"]').click();
      }
    })()
  `);
  await new Promise(r => setTimeout(r, 800));

  // Expand Advanced Properties
  await win.webContents.executeJavaScript(`
    (() => {
      const advBtn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Advanced Properties"));
      if (advBtn) advBtn.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 800));

  const image = await win.webContents.capturePage();
  const outPath = "/Users/rex/.gemini/antigravity-ide/brain/3260508d-d03b-49f1-9602-e75052fbe4b1/revised_inspector_selected.png";
  fs.writeFileSync(outPath, image.toPNG());
  console.log("Saved screenshot to:", outPath);

  win.destroy();
  app.exit(0);
});
