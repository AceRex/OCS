const { app, BrowserWindow, Menu, screen, ipcMain } = require("electron");
const path = require("path");

function createWindows() {
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();
  const secondaryDisplay = displays.length > 1 ? displays[1] : null;

  const viewWindow = new BrowserWindow({
    width: secondaryDisplay
      ? secondaryDisplay.bounds.width
      : primaryDisplay.bounds.width,
    height: secondaryDisplay
      ? secondaryDisplay.bounds.height
      : primaryDisplay.bounds.height,
    x: secondaryDisplay ? secondaryDisplay.bounds.x : 0,
    y: secondaryDisplay ? secondaryDisplay.bounds.y : 0,
    title: "OCS",
    backgroundColor: "white",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      worldSafeExecuteJavaScript: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // viewWindow.webContents.openDevTools();

  const controllerWindow = new BrowserWindow({
    width: primaryDisplay.bounds.width,
    height: primaryDisplay.bounds.height,
    x: primaryDisplay.bounds.x,
    y: primaryDisplay.bounds.y,
    title: "OCS",
    backgroundColor: "white",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      worldSafeExecuteJavaScript: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  // controllerWindow.webContents.openDevTools();

  viewWindow.loadFile("view.html");
  controllerWindow.loadFile("controller.html");

  if (secondaryDisplay) {
    viewWindow.setFullScreen(true);
  } else {
    viewWindow.setFullScreen(true);
    viewWindow.setAlwaysOnTop(true, "screen-saver");
    controllerWindow.setAlwaysOnTop(true);
  }

  viewWindow.show();
  controllerWindow.show();
}

app.whenReady().then(() => {
  const template = require("./menu.js").createTemplate(app);
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  createWindows();
});
ipcMain.on("activate-set-timer", (event, value) => {
  event.reply("set-timer", value);
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindows();
  }
});
