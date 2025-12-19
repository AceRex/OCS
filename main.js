const { app, BrowserWindow, Menu, screen, ipcMain, session, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

// Media Dictionary Setup
const mediaPath = path.join(app.getPath('userData'), 'media');
if (!fs.existsSync(mediaPath)) {
  fs.mkdirSync(mediaPath, { recursive: true });
}

// ------ MEDIA HANDLERS ------
ipcMain.handle("media-import", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'png', 'gif', 'jpeg', 'webp'] },
      { name: 'Videos', extensions: ['mp4', 'webm', 'ogg'] }
    ]
  });

  if (canceled || filePaths.length === 0) return null;

  const sourcePath = filePaths[0];
  const filename = path.basename(sourcePath);
  const destPath = path.join(mediaPath, filename);

  try {
    fs.copyFileSync(sourcePath, destPath);
    // Return full file path so renderer can use it directly?
    // Or just filename? Filename implies we need a way to serve it.
    // Since we enabled local file access (conceptually), format as file:// URL logic?
    // Let's return the filename, and let the renderer construct the URL or we construct it.
    // Constructing full URL is safer.
    return `file://${destPath}`;
  } catch (err) {
    console.error("Failed to copy file", err);
    return null;
  }
});

ipcMain.handle("media-list", async () => {
  try {
    const files = fs.readdirSync(mediaPath);
    return files.map(file => `file://${path.join(mediaPath, file)}`);
  } catch (err) {
    return [];
  }
});

ipcMain.handle("media-delete", async (event, fileUrl) => {
  try {
    // fileUrl is file:///path/to/media/filename.ext
    const filePath = fileUrl.replace('file://', '');
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (err) {
    console.error(err);
    return false;
  }
});
// ----------------------------

function createWindows() {
  // ... existing createWindows code ...
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
  // IPC Handlers that depend on viewWindow
  ipcMain.on("activate_set_timer", (event, value) => {
    viewWindow.webContents.send("set-timer", value);
    controllerWindow.webContents.send("set-timer", value);
  });

  ipcMain.on("activate_set_content", (event, value) => {
    viewWindow.webContents.send("set-content", value);
    controllerWindow.webContents.send("set-content", value);
  });

  ipcMain.on("activate_set_style", (event, value) => {
    viewWindow.webContents.send("set-style", value);
    controllerWindow.webContents.send("set-style", value);
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
