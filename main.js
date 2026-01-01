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

// ------ SERVER SETUP ------
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const ip = require('ip');

const serverApp = express();
serverApp.use(cors());
const server = http.createServer(serverApp);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});


// ------ BIBLE DATABASE HANDLERS ------
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, 'src/Bible/bibles.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error("Database opening error: ", err);
});

const PORT = 4000;
let serverIp = ip.address(); // Get initial IP
let connectedDevices = [];

// Update IP if network changes (optional, but good practice)
// For now, static check on startup is fine.

io.on('connection', (socket) => {
  console.log('a user connected', socket.id);

  const device = { id: socket.id, ip: socket.handshake.address };
  connectedDevices.push(device);

  const windows = BrowserWindow.getAllWindows();
  const controller = windows.find(w => w.getTitle() === "OCS Controller");

  if (controller && !controller.isDestroyed()) {
    controller.webContents.send('mobile-connected', device);
  }

  socket.on('disconnect', () => {
    console.log('user disconnected');

    connectedDevices = connectedDevices.filter(d => d.id !== socket.id);

    if (controller && !controller.isDestroyed()) {
      controller.webContents.send('mobile-disconnected', { id: socket.id });
    }
  });

  // Handle commands from mobile
  socket.on('mobile-action', async (action) => {
    console.log("Action received from mobile:", action);

    if (action.type === 'bible-get-books') {
      console.log("Fetching books for mobile...");
      db.all("SELECT * FROM books ORDER BY id", [], (err, books) => {
        if (err) {
          console.error("Error fetching books:", err);
          return;
        }

        // Get chapter counts (using KJV as standard structure)
        db.all("SELECT book_id, MAX(chapter) as count FROM verses WHERE version='kjv' GROUP BY book_id", [], (err2, counts) => {
          if (err2) {
            console.error("Error fetching chapter counts:", err2);
            // Fallback: send books without explicit chapters (mobile might default to 150)
            socket.emit('mobile-data', { type: 'bible-books', payload: books });
            return;
          }

          const booksWithChapters = books.map(b => {
            const c = counts.find(x => x.book_id === b.id);
            return {
              ...b,
              chapters: c ? c.count : 50 // Default to 50 if counts match fails
            };
          });

          console.log(`Sending ${booksWithChapters.length} books with chapter counts to mobile`);
          socket.emit('mobile-data', { type: 'bible-books', payload: booksWithChapters });
        });
      });
      return;
    }

    if (action.type === 'bible-get-chapter') {
      const { version, bookId, chapter } = action.payload;
      console.log(`Fetching chapter for mobile: ${version} ${bookId}:${chapter}`);
      db.all(
        "SELECT text FROM verses WHERE version = ? AND book_id = ? AND chapter = ? ORDER BY verse",
        [version, bookId, chapter],
        (err, rows) => {
          if (err) {
            console.error("Error fetching chapter:", err);
            return;
          }
          console.log(`Sending ${rows.length} verses to mobile`);
          const verses = rows.map(r => r.text);
          socket.emit('mobile-data', { type: 'bible-chapter', payload: verses });
        }
      );
      return;
    }

    // Forward other actions (timer, bible-present) to windows
    BrowserWindow.getAllWindows().forEach(w => {
      if (!w.isDestroyed()) {
        w.webContents.send('mobile-action', action);
      }
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Local IP: ${serverIp}`);
});

ipcMain.handle('get-server-info', () => {
  // Refresh IP in case it changed
  serverIp = ip.address();
  return { ip: serverIp, port: PORT, devices: connectedDevices };
});

ipcMain.on('bible-sync', (event, state) => {
  // Broadcast to all connected mobile clients
  io.emit('mobile-data', { type: 'bible-sync', payload: state });
});
// --------------------------

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
