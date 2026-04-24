const { app, BrowserWindow, Menu, screen, ipcMain, session, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const yauzl = require("yauzl");
const { spawn, execSync } = require("child_process");

// ── Python Voice Sidecar ──────────────────────────────────────────────────────
// Spawns voice_server/server.py as a local HTTP server on 127.0.0.1:5421.
// Falls back gracefully if Python is not installed (WASM engine activates).
let voiceSidecarProcess = null;
const SIDECAR_PORT = 5421;
const SIDECAR_SCRIPT = path.join(__dirname, 'voice_server', 'server.py');

function detectPython() {
  // 1. Prefer the isolated venv we created in voice_server/.venv — packages guaranteed present
  const venvPython = path.join(__dirname, 'voice_server', '.venv', 'bin', 'python');
  if (fs.existsSync(venvPython)) {
    try {
      const ver = execSync(`"${venvPython}" --version 2>&1`, { timeout: 3000 }).toString().trim();
      console.log(`[Sidecar] Using venv Python: ${ver}`);
      return venvPython;
    } catch (_) {}
  }

  // 2. Fall back to system Python 3.9–3.13 (faster-whisper compatible range)
  const candidates = ['python3.13', 'python3.12', 'python3.11', 'python3.10', 'python3.9', 'python3', 'python'];
  for (const cmd of candidates) {
    try {
      const ver = execSync(`${cmd} --version 2>&1`, { timeout: 3000 }).toString().trim();
      const m = ver.match(/Python 3\.(\d+)/);
      if (!m) continue;
      const minor = parseInt(m[1], 10);
      if (minor >= 9 && minor <= 13) {
        console.log(`[Sidecar] Found compatible system Python ${cmd}: ${ver}`);
        return cmd;
      }
      if (minor >= 14) {
        console.warn(`[Sidecar] ${cmd} (${ver}) is incompatible with faster-whisper. Run: python3.12 -m venv voice_server/.venv && voice_server/.venv/bin/pip install -r voice_server/requirements.txt`);
      }
    } catch (_) {}
  }
  return null;
}

function startVoiceSidecar() {
  const pythonCmd = detectPython();
  if (!pythonCmd) {
    console.warn('[Sidecar] Python 3.9+ not found — voice engine will use WASM fallback');
    return;
  }
  if (!fs.existsSync(SIDECAR_SCRIPT)) {
    console.warn('[Sidecar] voice_server/server.py not found — skipping');
    return;
  }

  const modelCacheDir = path.join(app.getPath('userData'), 'ocs_whisper_cache');
  if (!fs.existsSync(modelCacheDir)) fs.mkdirSync(modelCacheDir, { recursive: true });

  voiceSidecarProcess = spawn(pythonCmd, [SIDECAR_SCRIPT], {
    env: { ...process.env, OCS_MODEL_CACHE: modelCacheDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  voiceSidecarProcess.stdout.on('data', (d) => process.stdout.write(`[PY] ${d}`));
  voiceSidecarProcess.stderr.on('data', (d) => process.stderr.write(`[PY ERR] ${d}`));

  voiceSidecarProcess.on('exit', (code, signal) => {
    console.log(`[Sidecar] Exited (code=${code}, signal=${signal})`);
    voiceSidecarProcess = null;

    if (app.isQuitting) return;

    if (code !== 0) {
      app.sidecarRestartCount++;
      if (app.sidecarRestartCount >= MAX_SIDECAR_RESTARTS) {
        console.error(
          `[Sidecar] ❌ Stopped after ${MAX_SIDECAR_RESTARTS} failed attempts.\n` +
          `[Sidecar] ⚠️  Missing Python packages. Run this in Terminal:\n` +
          `[Sidecar]    python3 -m pip install numpy flask scipy noisereduce faster-whisper\n` +
          `[Sidecar] Voice engine will use WASM fallback until packages are installed.`
        );
        return; // Stop retrying
      }
      // Exponential back-off: 5s, 10s, 20s...
      const delay = Math.min(5000 * Math.pow(2, app.sidecarRestartCount - 1), 60000);
      console.warn(`[Sidecar] Restarting in ${delay / 1000}s (attempt ${app.sidecarRestartCount}/${MAX_SIDECAR_RESTARTS})...`);
      setTimeout(() => {
        if (!app.isQuitting) startVoiceSidecar();
      }, delay);
    } else {
      // Clean exit (code 0) — reset counter
      app.sidecarRestartCount = 0;
    }
  });

  // Reset restart counter after process has been alive for 10s (healthy start)
  const healthTimer = setTimeout(() => { app.sidecarRestartCount = 0; }, 10000);
  voiceSidecarProcess.once('exit', () => clearTimeout(healthTimer));

  console.log(`[Sidecar] Started (PID: ${voiceSidecarProcess.pid}) on port ${SIDECAR_PORT}`);
}

app.isQuitting = false;
app.sidecarRestartCount = 0;
const MAX_SIDECAR_RESTARTS = 5; // Stop retrying if packages are missing
// ─────────────────────────────────────────────────────────────────────────────

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
      { name: 'Media', extensions: ['jpg', 'png', 'gif', 'jpeg', 'webp', 'mp4', 'webm', 'ogg', 'mov', 'avi'] },
      { name: 'Images', extensions: ['jpg', 'png', 'gif', 'jpeg', 'webp'] },
      { name: 'Videos', extensions: ['mp4', 'webm', 'ogg', 'mov', 'avi'] }
    ]
  });

  if (canceled || filePaths.length === 0) return null;

  const sourcePath = filePaths[0];
  const filename = path.basename(sourcePath);
  const destPath = path.join(mediaPath, filename);

  try {
    fs.copyFileSync(sourcePath, destPath);
    return `file://${destPath}`;
  } catch (err) {
    console.error("Failed to copy file", err);
    return null;
  }
});

const { convertPptxToPng } = require('pptx-glimpse');

ipcMain.handle("media-import-presentation", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    properties: ['openFile'],
    filters: [
      { name: 'Presentations', extensions: ['ppt', 'pptx'] }
    ]
  });

  if (canceled || filePaths.length === 0) return null;

  const sourcePath = filePaths[0];
  const filename = path.basename(sourcePath);
  const destPath = path.join(mediaPath, filename);

  try {
    fs.copyFileSync(sourcePath, destPath);
    
    // Create a folder for the slide images
    const slidesDir = path.join(mediaPath, `${filename}_slides`);
    if (!fs.existsSync(slidesDir)) {
      fs.mkdirSync(slidesDir, { recursive: true });
    }

    // Extract slides to images using pptx-glimpse
    const buffer = fs.readFileSync(destPath);
    const pngBuffers = await convertPptxToPng(buffer);
    
    const slideUrls = [];
    pngBuffers.forEach((buf, i) => {
      const slidePath = path.join(slidesDir, `slide_${i + 1}.png`);
      fs.writeFileSync(slidePath, buf);
      slideUrls.push(`file://${slidePath}`);
    });

    return { 
        fileUrl: `file://${destPath}`, 
        filename, 
        slideCount: pngBuffers.length,
        pages: slideUrls 
    };
  } catch (err) {
    console.error("Failed to copy presentation or convert slides", err);
    return null;
  }
});

// Count slides in a PPTX file by reading its ZIP structure
function countPptxSlides(filePath) {
  return new Promise((resolve) => {
    let count = 0;
    yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
      if (err) { resolve(0); return; }
      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        // PPTX slides are at ppt/slides/slide1.xml, slide2.xml etc.
        if (/^ppt\/slides\/slide\d+\.xml$/.test(entry.fileName)) {
          count++;
        }
        zipfile.readEntry();
      });
      zipfile.on('end', () => resolve(count));
      zipfile.on('error', () => resolve(count));
    });
  });
}

ipcMain.handle("presentation-delete", async (event, fileUrl) => {
  try {
    const filePath = fileUrl.replace('file://', '');
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (err) {
    console.error("Failed to delete presentation", err);
    return false;
  }
});



ipcMain.handle("media-list", async () => {
  try {
    const files = fs.readdirSync(mediaPath);
    // Sort files by modification time descending (newest first)
    const sortedFiles = files
        .filter(file => !file.startsWith('.')) // hide hidden files
        .map(file => {
            const filePath = path.join(mediaPath, file);
            return {
                name: file,
                time: fs.statSync(filePath).mtime.getTime()
            };
        })
        .sort((a, b) => b.time - a.time)
        .map(f => `file://${path.join(mediaPath, f.name)}`);
    return sortedFiles;
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

// ── Bible Full-Text Search (Pass 3 of Smart Bible Matcher) ───────────────────
// Searches verse text for keywords, returns top N matches with book/chapter/verse.
ipcMain.handle("bible-search-verses", async (event, { query, version, limit }) => {
  const v = version || 'kjv';
  const n = Math.min(limit || 5, 20);
  // Build a LIKE pattern for each word (up to 4 keywords)
  const words = query.trim().split(/\s+/).filter(w => w.length >= 3).slice(0, 4);
  if (words.length === 0) return [];

  // Build SQL: all keywords must appear (AND logic via chained LIKE)
  const conditions = words.map(() => "text LIKE ?").join(" AND ");
  const params = words.map(w => `%${w}%`);

  return new Promise((resolve, reject) => {
    db.all(
      `SELECT book_id, chapter, verse, text FROM verses WHERE version = ? AND ${conditions} ORDER BY book_id, chapter, verse LIMIT ?`,
      [v, ...params, n],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
});

// ── Sidecar health check (for debug bar in renderer) ─────────────────────────
ipcMain.handle("voice-sidecar-status", async () => {
  return { running: voiceSidecarProcess !== null && !voiceSidecarProcess.killed, port: SIDECAR_PORT };
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

  // Start Python voice sidecar (non-blocking — app stays usable while it loads)
  startVoiceSidecar();

  createWindows();
});

app.on("before-quit", () => {
  app.isQuitting = true;
  // Cleanly terminate the Python voice sidecar
  if (voiceSidecarProcess && !voiceSidecarProcess.killed) {
    console.log('[Sidecar] Shutting down Python voice server...');
    voiceSidecarProcess.kill('SIGTERM');
  }
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
