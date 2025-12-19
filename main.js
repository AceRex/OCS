const { app, BrowserWindow, Menu, screen, ipcMain, session } = require("electron");
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

  // IPC Handlers that depend on viewWindow
  ipcMain.on("activate_set_timer", (event, value) => {
    viewWindow.webContents.send("set-timer", value);
  });

  ipcMain.on("activate_set_content", (event, value) => {
    viewWindow.webContents.send("set-content", value);
  });

  ipcMain.on("activate_set_style", (event, value) => {
    viewWindow.webContents.send("set-style", value);
  });

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

// ------ BIBLE DATABASE HANDLERS ------
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, 'src/Bible/bibles.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error("Database opening error: ", err);
});

ipcMain.handle("bible-get-books", async (event) => {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM books ORDER BY id", [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
});

ipcMain.handle("bible-get-chapter", async (event, { version, bookId, chapter }) => {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT text FROM verses WHERE version = ? AND book_id = ? AND chapter = ? ORDER BY verse",
      [version, bookId, chapter],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(r => r.text));
      }
    );
  });
});
// -------------------------------------

app.whenReady().then(() => {
  // GRANT MICROPHONE ACCESS AUTOMATICALLY
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });

  const template = require("./menu.js").createTemplate(app);
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  createWindows();
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
