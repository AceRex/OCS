const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { designStudioService } = require("../src/main/design/designStudioService");

async function reproduce() {
  const testDir = path.join(os.tmpdir(), `ocs_reproduce_${Date.now()}`);
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

  ipcMain.handle("design:list", async () => ({ ok: true, designs: designStudioService.listDesigns() }));
  ipcMain.handle("design:save", async (_event, design) => ({ ok: true, design: designStudioService.saveDesign(design) }));
  ipcMain.handle("design:delete", async (_event, id) => designStudioService.deleteDesign(id));
  ipcMain.handle("design:get-live-state", async () => ({ isLive: false, layers: [] }));

  await win.loadFile(path.resolve(__dirname, "../controller.html"));

  const evalResult = await win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      let attempts = 0;
      const checkInterval = setInterval(() => {
        attempts++;
        const openBtn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Live Design Studio"));
        if (openBtn) {
          openBtn.click();
          clearInterval(checkInterval);

          setTimeout(() => {
            const tmplBtn = Array.from(document.querySelectorAll("div, button")).find(el => el.textContent.includes("Speaker Lower Third (Classic)"));
            if (tmplBtn) {
              tmplBtn.click();
              setTimeout(() => {
                const allSpansAndDivs = Array.from(document.querySelectorAll(".aspect-video *")).map(el => ({
                  tag: el.tagName,
                  text: el.textContent?.trim(),
                  classes: el.className,
                  childCount: el.children.length
                })).filter(x => x.text);

                resolve({
                  hasTmplBtn: true,
                  canvasElements: allSpansAndDivs.slice(0, 15)
                });
              }, 300);
            } else {
              resolve({ hasTmplBtn: false });
            }
          }, 500);
        } else if (attempts > 30) {
          clearInterval(checkInterval);
          resolve({ error: "Open button not found" });
        }
      }, 200);
    });
  `);

  console.log("Reproduction result:", evalResult);
  app.quit();
}

app.whenReady().then(reproduce);
