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
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();
  const secondaryDisplay = displays.length > 1 ? displays[1] : null;
  const tertiaryDisplay = displays.length > 2 ? displays[2] : null;

  // 1. Speaker Window (Stage Display) - Shows Timer + Bible
  const speakerWindow = new BrowserWindow({
    width: secondaryDisplay ? secondaryDisplay.bounds.width : 800,
    height: secondaryDisplay ? secondaryDisplay.bounds.height : 600,
    x: secondaryDisplay ? secondaryDisplay.bounds.x : 50,
    y: secondaryDisplay ? secondaryDisplay.bounds.y : 50,
    title: "OCS Speaker View",
    backgroundColor: "black",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // 2. General Window (Projector) - Shows Bible ONLY
  const generalWindow = new BrowserWindow({
    width: tertiaryDisplay ? tertiaryDisplay.bounds.width : (secondaryDisplay ? secondaryDisplay.bounds.width : 800),
    height: tertiaryDisplay ? tertiaryDisplay.bounds.height : (secondaryDisplay ? secondaryDisplay.bounds.height : 600),
    x: tertiaryDisplay ? tertiaryDisplay.bounds.x : (secondaryDisplay ? secondaryDisplay.bounds.x + 50 : 100),
    y: tertiaryDisplay ? tertiaryDisplay.bounds.y : (secondaryDisplay ? secondaryDisplay.bounds.y + 50 : 100),
    title: "OCS General View",
    backgroundColor: "black",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // 3. Controller Window
  const controllerWindow = new BrowserWindow({
    width: primaryDisplay.bounds.width,
    height: primaryDisplay.bounds.height,
    x: primaryDisplay.bounds.x,
    y: primaryDisplay.bounds.y,
    title: "OCS Controller",
    backgroundColor: "white",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Load Content with Modes
  speakerWindow.loadFile("view.html", { search: "mode=speaker" });
  generalWindow.loadFile("view.html", { search: "mode=general" });
  controllerWindow.loadFile("controller.html");

  // IPC Handlers
  ipcMain.on("activate_set_timer", (event, value) => {
    // Timer -> Speaker View (Always)
    if (!speakerWindow.isDestroyed()) speakerWindow.webContents.send("set-timer", value);
    // Timer -> General View (Always - view.js now checks 'mode' and 'isEventMode' to decide whether to show it)
    if (!generalWindow.isDestroyed()) generalWindow.webContents.send("set-timer", value);
    if (!controllerWindow.isDestroyed()) controllerWindow.webContents.send("set-timer", value);
  });

  ipcMain.on("activate_set_content", (event, value) => {
    // Content -> Both Views
    if (!speakerWindow.isDestroyed()) speakerWindow.webContents.send("set-content", value);
    if (!generalWindow.isDestroyed()) generalWindow.webContents.send("set-content", value);
    if (!controllerWindow.isDestroyed()) controllerWindow.webContents.send("set-content", value);
  });

  ipcMain.on("activate_set_style", (event, value) => {
    // Style -> Both Views
    if (!speakerWindow.isDestroyed()) speakerWindow.webContents.send("set-style", value);
    if (!generalWindow.isDestroyed()) generalWindow.webContents.send("set-style", value);
    if (!controllerWindow.isDestroyed()) controllerWindow.webContents.send("set-style", value);
  });

  // Window Management
  if (secondaryDisplay) {
    speakerWindow.setFullScreen(true);
  }
  if (tertiaryDisplay) {
    generalWindow.setFullScreen(true);
  } else if (!secondaryDisplay) {
    // Dev mode on single screen
    // speakerWindow.show(); 
    // generalWindow.show();
    // Let them just appear as windows
  }

  speakerWindow.show();
  generalWindow.show();
  controllerWindow.show();

  // Close app when controller closes
  controllerWindow.on('closed', () => {
    app.quit();
  });
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
