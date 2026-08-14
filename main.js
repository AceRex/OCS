const { app, BrowserWindow, Menu, screen, ipcMain, session, dialog } = require("electron");

// ── Single Instance Lock (Enforce app only loads once) ──────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[App] Another instance of OCS is already running. Quitting duplicate process.');
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  console.log('[App] Second instance launch attempted. Focusing primary controller.');
  const windows = BrowserWindow.getAllWindows();
  const controller = windows.find(w => w.getTitle() === 'OCS Controller');
  if (controller && !controller.isDestroyed()) {
    if (controller.isMinimized()) controller.restore();
    controller.focus();
  }
});

const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const yauzl = require("yauzl");
const { spawn, execSync } = require("child_process");
const QRCode = require("qrcode");

const { AsrFacade } = require("./src/main/asr/asrFacade");
const { emitTimerLifecycle } = require("./src/main/timerLifecycle");
const { SessionArchiveService } = require("./src/main/sessionArchive");
const {
  generatePairing,
  buildPairPayload,
  clearPaired,
  markPaired,
  unmarkPaired,
  isPaired,
  validateCredential,
} = require("./src/main/pairing/pairing");
const { PairingRateLimiter } = require("./src/main/pairing/rateLimiter");
const { ollamaStatus, ollamaChat, piperAvailable, piperSpeak } = require("./src/main/aiHelpers");
const appSettings = require("./src/main/appSettings");
const sleepPrevention = require("./src/main/sleepPrevention");
const { ReferenceAligner } = require("./src/main/aligner/referenceAligner");
const { SceneAutoAdvanceManager } = require("./src/main/aligner/sceneAutoAdvance");

const globalAligner = new ReferenceAligner();
const sceneAutoAdvance = new SceneAutoAdvanceManager({ aligner: globalAligner });

sceneAutoAdvance.on('aligner:update', (update) => {
  broadcastAsrEvent('alignment:update', update);
});
sceneAutoAdvance.on('advance', (data) => {
  broadcastAsrEvent('scene-auto-advance', data);
});
sceneAutoAdvance.on('prev', (data) => {
  broadcastAsrEvent('scene-auto-prev', data);
});
sceneAutoAdvance.on('prompt:suggest', (prompt) => {
  broadcastAsrEvent('scene-prompt-suggest', prompt);
});
sceneAutoAdvance.on('prompt:clear', () => {
  broadcastAsrEvent('scene-prompt-clear', {});
});

// ── Platform helpers ──────────────────────────────────────────────────────────
const IS_WIN  = process.platform === 'win32';
const IS_MAC  = process.platform === 'darwin';
const IS_LINUX = process.platform === 'linux';

// ── ASR facade (whisper.cpp default, Vosk low-spec fallback) ──────────────────
const asrEngine = new AsrFacade(__dirname);
/** @deprecated use asrEngine — kept for any residual references */
const voskEngine = asrEngine;
let pairing = generatePairing();
let pairingQrDataUrl = null;
/** @type {SessionArchiveService|null} */
let sessionArchive = null;

function detectPython() {
  // Still used by optional ocs_image_engine design tools — not for ASR.
  const venvBin = IS_WIN ? ['Scripts', 'python.exe'] : ['bin', 'python'];
  const engineVenv = path.join(__dirname, 'ocs_image_engine', '.venv', ...venvBin);
  if (fs.existsSync(engineVenv)) return engineVenv;

  const candidates = IS_WIN
    ? ['py', 'python', 'python3']
    : ['python3.13', 'python3.12', 'python3.11', 'python3.10', 'python3.9', 'python3', 'python'];

  for (const cmd of candidates) {
    try {
      const probe = (cmd === 'py') ? 'py -3 --version' : `${cmd} --version`;
      const ver = execSync(`${probe} 2>&1`, { timeout: 3000 }).toString().trim();
      const m = ver.match(/Python 3\.(\d+)/);
      if (!m) continue;
      const minor = parseInt(m[1], 10);
      if (minor >= 9 && minor <= 13) {
        return (cmd === 'py') ? 'py -3' : cmd;
      }
    } catch (_) {}
  }
  return null;
}

function broadcastAsrEvent(channel, payload) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed()) continue;
    try { w.webContents.send(channel, payload); } catch (_) {}
  }
}

asrEngine.on('transcript', (payload) => {
  broadcastAsrEvent('vosk-transcript', payload);
  broadcastAsrEvent('asr-transcript', payload);

  // Feed active Read-Along aligner if enabled (FR-5.31 / FR-5.36)
  if (sceneAutoAdvance.isEnabled && payload) {
    sceneAutoAdvance.feed(payload);
  }
});
asrEngine.on('status', (payload) => {
  broadcastAsrEvent('vosk-status', payload);
  broadcastAsrEvent('asr-status', payload);
});
// FR-3.68 — broadcast engine switch so debug bar and BroadcastEngine can update
asrEngine.on('engine-changed', (payload) => {
  broadcastAsrEvent('asr-engine-changed', payload);
  console.log('[Asr] engine-changed broadcast →', payload);
});
asrEngine.on('engine-calibrated', (payload) => {
  broadcastAsrEvent('asr-engine-calibrated', payload);
});

// FR-6.12 — rate limiter for 6-digit pairing code brute-force protection
const _pairingRateLimiter = new PairingRateLimiter();

async function refreshPairingQr() {
  try {
    const payload = buildPairPayload({
      ip: serverIp,
      port: PORT,
      token: pairing.token,
      code: pairing.code,
    });
    pairingQrDataUrl = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 280,
      color: { dark: '#0B0814', light: '#FFFFFF' },
    });
  } catch (err) {
    console.error('[Pairing] QR generation failed:', err.message);
    pairingQrDataUrl = null;
  }
}

function rotatePairing() {
  pairing = generatePairing();
  clearPaired();
  return refreshPairingQr();
}

app.isQuitting = false;
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
    await fsp.copyFile(sourcePath, destPath);
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
    await fsp.copyFile(sourcePath, destPath);
    
    // Create a folder for the slide images
    const slidesDir = path.join(mediaPath, `${filename}_slides`);
    try {
      await fsp.mkdir(slidesDir, { recursive: true });
    } catch (_) {}

    // Extract slides to images using pptx-glimpse
    const buffer = await fsp.readFile(destPath);
    const pngBuffers = await convertPptxToPng(buffer);
    
    const slideUrls = [];
    for (let i = 0; i < pngBuffers.length; i++) {
      const slidePath = path.join(slidesDir, `slide_${i + 1}.png`);
      await fsp.writeFile(slidePath, pngBuffers[i]);
      slideUrls.push(`file://${slidePath}`);
    }

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
  const filePath = fileUrl.replace('file://', '');
  try {
    await fsp.unlink(filePath);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    console.error("Failed to delete presentation", err);
    return false;
  }
});



ipcMain.handle("media-list", async () => {
  try {
    const files = await fsp.readdir(mediaPath);
    const fileStats = await Promise.all(files.map(async (file) => {
      if (file.startsWith('.')) return null;
      const filePath = path.join(mediaPath, file);
      try {
        const stat = await fsp.stat(filePath);
        return { name: file, time: stat.mtime.getTime() };
      } catch (err) {
        return null;
      }
    }));

    return fileStats
      .filter(Boolean)
      .sort((a, b) => b.time - a.time)
      .map(f => `file://${path.join(mediaPath, f.name)}`);
  } catch (err) {
    console.error("Failed to list media", err);
    return [];
  }
});

ipcMain.handle("media-delete", async (event, fileUrl) => {
  const filePath = fileUrl.replace('file://', '');
  try {
    await fsp.unlink(filePath);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    console.error(err);
    return false;
  }
});
// ----------------------------

// ------ DESIGN LAB HANDLERS ------
const axios = require('axios');
const FormData = require('form-data');

let currentDesignProcess = null;

ipcMain.handle("design-analyze", async (event, imagePath) => {
    try {
        // Kill existing process if running to prevent memory overflow
        if (currentDesignProcess) {
            currentDesignProcess.kill('SIGTERM');
            currentDesignProcess = null;
        }

        const scriptPath = path.join(__dirname, 'ocs_image_engine', 'engine.py');
        const posterPath = imagePath.replace('file://', '');
        const outputDir = path.join(app.getPath("userData"), "generated_assets");
        
        return new Promise((resolve, reject) => {
            const pythonCmd = detectPython() || (process.platform === "win32" ? "python" : "python3");
            
            try {
                // Pass --generate to trigger inference and --out to ensure files are written outside the project root
                currentDesignProcess = spawn(pythonCmd, [scriptPath, '--generate', posterPath, '--out', outputDir]);
            } catch (err) {
                return resolve({ error: `Could not start Python engine: ${err.message}` });
            }

            const proc = currentDesignProcess;

            proc.on('error', (err) => {
                if (currentDesignProcess === proc) currentDesignProcess = null;
                resolve({ error: `Python engine error: ${err.message}` });
            });
            
            let output = "";
            let errorOutput = "";

            proc.stdout.on('data', (data) => { output += data.toString(); });
            proc.stderr.on('data', (data) => { errorOutput += data.toString(); });

            proc.on('close', (code) => {
                if (currentDesignProcess === proc) currentDesignProcess = null;
                if (code === 0) {
                    try {
                        // Extract JSON from the output (handles any stray logs)
                        const jsonMatch = output.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            const result = JSON.parse(jsonMatch[0]);
                            resolve(result);
                        } else {
                            resolve({ error: "No valid JSON found in engine output", details: output });
                        }
                    } catch (e) {
                        resolve({ error: "Failed to parse AI output", details: output });
                    }
                } else {
                    resolve({ error: `Engine failed with code ${code}`, details: errorOutput });
                }
            });
        });
    } catch (err) {
        return { error: err.message };
    }
});

ipcMain.handle("design-generate", async (event, prompt) => {
    // For the local engine, generation happens during the analysis phase 
    // or as a follow-up. Since engine.py currently does both in process_poster,
    // we can return the already generated files.
    return { success: true, message: "Assets already generated during analysis." };
});

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

// Read-only endpoints — unpaired devices may probe the server but cannot control it
serverApp.get('/pair-info', (_req, res) => {
  res.json({
    ok: true,
    port: PORT,
    pairingRequired: true,
    // Never expose the live token/code over an unauthenticated HTTP GET
  });
});

/**
 * Socket.IO auth (FR-6.10 / NFR-26):
 * - Connection is allowed so the socket can attempt to pair
 * - Control actions require a successful `pair` event with valid token/code
 */
io.on('connection', (socket) => {
  console.log('[Remote] socket connected', socket.id);

  const device = {
    id: socket.id,
    ip: socket.handshake.address,
    paired: false,
    connectedAt: Date.now(),
  };
  connectedDevices.push(device);

  const windows = BrowserWindow.getAllWindows();
  const controller = windows.find(w => w.getTitle() === "OCS Controller");

  const notifyController = (channel, payload) => {
    if (controller && !controller.isDestroyed()) {
      controller.webContents.send(channel, payload);
    }
  };

  // Auth attempt via handshake auth (preferred) or explicit pair event
  const handshakeCred = socket.handshake.auth && (socket.handshake.auth.token || socket.handshake.auth.code);
  if (handshakeCred && validateCredential(pairing, handshakeCred)) {
    markPaired(socket.id);
    device.paired = true;
    device.name = socket.handshake.auth.deviceName || 'Mobile';
    console.log('[Remote] paired via handshake:', socket.id);
    socket.emit('pair-result', { ok: true });
    notifyController('mobile-connected', device);
  } else {
    // Unpaired — connected but cannot control. Surface in debug/UI as pending.
    notifyController('mobile-unpaired-attempt', {
      id: socket.id,
      ip: device.ip,
      at: Date.now(),
    });
    socket.emit('pair-required', { message: 'Send pair event with token or 6-digit code' });
  }

  socket.on('pair', (payload = {}) => {
    const clientIp = device.ip || socket.handshake.address;

    // FR-6.12 — rate-limit 6-digit code attempts per source IP
    const rateCheck = _pairingRateLimiter.check(clientIp);
    if (!rateCheck.allowed) {
      notifyController('mobile-unpaired-attempt', {
        id: socket.id,
        ip: clientIp,
        at: Date.now(),
        reason: rateCheck.reason,
        lockedMs: rateCheck.retryAfterMs,
      });
      socket.emit('pair-result', {
        ok: false,
        error: 'Too many attempts. Try again later.',
        retryAfterMs: rateCheck.retryAfterMs,
      });
      return;
    }

    const cred = payload.token || payload.code;
    if (!validateCredential(pairing, cred)) {
      console.warn('[Remote] rejected pair attempt from', socket.id);
      _pairingRateLimiter.recordFailure(clientIp);  // FR-6.12
      notifyController('mobile-unpaired-attempt', {
        id: socket.id,
        ip: clientIp,
        at: Date.now(),
        reason: 'invalid_credential',
      });
      socket.emit('pair-result', { ok: false, error: 'Invalid pairing code' });
      return;
    }
    _pairingRateLimiter.recordSuccess(clientIp);  // FR-6.12: reset counter on success
    markPaired(socket.id);
    device.paired = true;
    device.name = payload.deviceName || device.name || 'Mobile';
    socket.emit('pair-result', { ok: true });
    notifyController('mobile-connected', device);
  });

  socket.on('disconnect', () => {
    console.log('[Remote] disconnected', socket.id);
    unmarkPaired(socket.id);
    connectedDevices = connectedDevices.filter(d => d.id !== socket.id);
    notifyController('mobile-disconnected', { id: socket.id });
  });

  // Handle commands from mobile — gated by pairing (NFR-26)
  socket.on('mobile-action', async (action) => {
    if (!isPaired(socket.id)) {
      console.warn('[Remote] blocked unpaired mobile-action from', socket.id, action && action.type);
      notifyController('mobile-unpaired-attempt', {
        id: socket.id,
        ip: device.ip,
        at: Date.now(),
        reason: 'unpaired_action',
        actionType: action && action.type,
      });
      socket.emit('pair-required', { message: 'Pairing required before control commands' });
      return;
    }

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

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`[Server] Port ${PORT} is already in use by another running instance. Remote Companion server is operating on existing process.`);
  } else {
    console.error('[Server] Server error:', err);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Local IP: ${serverIp}`);
  refreshPairingQr().then(() => {
    console.log(`[Pairing] code ${pairing.code} ready`);
  });
});

ipcMain.handle('get-server-info', async () => {
  // Refresh IP in case it changed
  serverIp = ip.address();
  if (!pairingQrDataUrl) await refreshPairingQr();
  return {
    ip: serverIp,
    port: PORT,
    devices: connectedDevices.filter(d => d.paired),
    pairingCode: pairing.code,
    pairingQrDataUrl,
  };
});

ipcMain.handle('pairing-rotate', async () => {
  await rotatePairing();
  serverIp = ip.address();
  return {
    ip: serverIp,
    port: PORT,
    pairingCode: pairing.code,
    pairingQrDataUrl,
    devices: connectedDevices.filter(d => d.paired),
  };
});

ipcMain.on('mobile-disconnect-device', (event, deviceId) => {
  const sock = io.sockets.sockets.get(deviceId);
  if (sock) sock.disconnect(true);
});

ipcMain.on('bible-sync', (event, state) => {
  // Broadcast only to paired mobile clients
  for (const [id, sock] of io.sockets.sockets) {
    if (isPaired(id)) {
      sock.emit('mobile-data', { type: 'bible-sync', payload: state });
    }
  }
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

  // Dev / Debug Listeners
  speakerWindow.webContents.on('console-message', (e, level, msg, line, src) => {
    console.log(`[SpeakerView JS (L${line})]`, msg);
  });
  speakerWindow.webContents.on('did-fail-load', (e, code, desc) => {
    console.error('[SpeakerView did-fail-load]', code, desc);
  });
  generalWindow.webContents.on('console-message', (e, level, msg, line, src) => {
    console.log(`[GeneralView JS (L${line})]`, msg);
  });
  generalWindow.webContents.on('did-fail-load', (e, code, desc) => {
    console.error('[GeneralView did-fail-load]', code, desc);
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
    const t = typeof value === 'object' && value != null ? Number(value.time) : Number(value);
    sleepPrevention.reconcile({ timerLive: Number.isFinite(t) && t > 0 });
  });

  // Display Canvas State Store (FR-4.13, FR-4.14, FR-4.15)
  let currentCanvasState = {
    background: {
      type: "color",
      url: null,
      color: "#000000",
      panX: 0,
      panY: 0,
      zoom: 1,
      muted: true,
      loop: true,
      autoPlay: true,
    },
    contentSlot: {
      type: "none",
      data: null,
    },
    pinnedLayers: [],
    chrome: {
      blackout: false,
      logo: false,
      logoUrl: null,
      brandingText: null,
      timerSplit: false,
      timerCountdown: null,
    },
  };

  function broadcastCanvasState(state, allowedTargets = null) {
    if (state) currentCanvasState = state;
    const speakerAllowed = allowedTargets === null || allowedTargets.includes('speaker') || allowedTargets.includes('all');
    const generalAllowed = allowedTargets === null || allowedTargets.includes('general') || allowedTargets.includes('all');

    if (speakerWindow && !speakerWindow.isDestroyed()) {
      const speakerState = speakerAllowed ? currentCanvasState : { ...currentCanvasState, contentSlot: { type: "none", data: null } };
      speakerWindow.webContents.send("canvas-state-update", speakerState);
    }
    if (generalWindow && !generalWindow.isDestroyed()) {
      const generalState = generalAllowed ? currentCanvasState : { ...currentCanvasState, contentSlot: { type: "none", data: null } };
      generalWindow.webContents.send("canvas-state-update", generalState);
    }
    if (controllerWindow && !controllerWindow.isDestroyed()) {
      controllerWindow.webContents.send("canvas-state-update", currentCanvasState);
    }

    // FR-4.15: lightweight summary to Mobile Companion
    const summary = {
      activeContentSlotType: currentCanvasState.contentSlot?.type || "none",
      hasContent: currentCanvasState.contentSlot?.type !== "none" && currentCanvasState.contentSlot?.data != null,
      pinnedLayerCount: Array.isArray(currentCanvasState.pinnedLayers) ? currentCanvasState.pinnedLayers.length : 0,
      isBlackout: !!currentCanvasState.chrome?.blackout,
    };
    if (io) {
      for (const [id, sock] of io.sockets.sockets) {
        if (isPaired(id)) {
          sock.emit("mobile-data", { type: "canvas-summary", payload: summary });
        }
      }
    }
  }

  ipcMain.on("canvas-sync-state", (event, state) => {
    broadcastCanvasState(state);
  });

  ipcMain.on("canvas-set-background", (event, bg) => {
    currentCanvasState.background = { ...currentCanvasState.background, ...bg };
    broadcastCanvasState(currentCanvasState);
  });

  ipcMain.on("canvas-set-pinned-layers", (event, layers) => {
    currentCanvasState.pinnedLayers = Array.isArray(layers) ? layers : [];
    broadcastCanvasState(currentCanvasState);
  });

  ipcMain.on("canvas-set-chrome", (event, chrome) => {
    currentCanvasState.chrome = { ...currentCanvasState.chrome, ...chrome };
    broadcastCanvasState(currentCanvasState);
  });

  ipcMain.on("activate_set_content", (event, value) => {
    const summary = value == null
      ? 'null (black)'
      : `${value.type || '?'} ${value.data && value.data.title ? value.data.title : ''}`.trim();

    // FR-4.9 / Task-1 fix: if value carries a `target` array (Presentation path), respect it.
    // When target is absent (Bible path), broadcast to all output windows (FR-1.3).
    const allowedTargets = Array.isArray(value?.target) ? value.target : null;
    const speakerOk = speakerWindow && !speakerWindow.isDestroyed() &&
      (allowedTargets === null || allowedTargets.includes('speaker'));
    const generalOk = generalWindow && !generalWindow.isDestroyed() &&
      (allowedTargets === null || allowedTargets.includes('general'));
    const controllerOk = controllerWindow && !controllerWindow.isDestroyed();

    console.log('[IPC] activate_set_content', summary, '→ speaker:', speakerOk, 'general:', generalOk, 'target:', allowedTargets ?? 'all');

    // FR-4.14: Content Slot scoping — update only the contentSlot band, preserve Background and Pinned layers
    if (value == null) {
      currentCanvasState.contentSlot = { type: "none", data: null };
    } else {
      currentCanvasState.contentSlot = {
        type: value.type || "none",
        data: value.data || value,
      };
    }
    broadcastCanvasState(currentCanvasState, allowedTargets);

    // Dispatch to gated windows
    if (speakerOk) speakerWindow.webContents.send("set-content", value);
    if (generalOk) generalWindow.webContents.send("set-content", value);
    if (controllerOk) controllerWindow.webContents.send("set-content", value);

    // Tier 2 cleanup bias: record displayed scripture refs during active session
    if (sessionArchive && value && (value.type === 'bible' || value.type === 'scripture')) {
      const d = value.data || {};
      const book = d.book || d.bookName || d.title;
      const chapter = d.chapter;
      const verse = d.verse ?? d.startVerse;
      if (book && chapter != null) {
        const ref = verse != null ? `${book} ${chapter}:${verse}` : `${book} ${chapter}`;
        sessionArchive.recordScriptureRef(ref);
      }
    }
  });

  ipcMain.on("activate_set_style", (event, value) => {
    // FR-4.9 fix: respect target array just like activate_set_content
    const allowedTargets = Array.isArray(value?.target) ? value.target : null;
    if (!speakerWindow.isDestroyed() && (allowedTargets === null || allowedTargets.includes('speaker')))
      speakerWindow.webContents.send("set-style", value);
    if (!generalWindow.isDestroyed() && (allowedTargets === null || allowedTargets.includes('general')))
      generalWindow.webContents.send("set-style", value);
    if (!controllerWindow.isDestroyed())
      controllerWindow.webContents.send("set-style", value);
  });

  // ── Scene IPC (FR-4.28–FR-4.31) ────────────────────────────────────────────
  // Persist scenes as JSON in userData (no SQLite migration needed for Phase 2)
  const scenesFilePath = path.join(app.getPath('userData'), 'scenes.json');
  let scenesStore = [];
  try {
    if (fs.existsSync(scenesFilePath)) {
      scenesStore = JSON.parse(fs.readFileSync(scenesFilePath, 'utf8'));
    }
  } catch (_) { scenesStore = []; }
  const saveScenes = () => {
    try { fs.writeFileSync(scenesFilePath, JSON.stringify(scenesStore, null, 2), 'utf8'); } catch (_) {}
  };

  ipcMain.handle('scene-list', () => scenesStore);
  ipcMain.handle('scene-save', (event, scene) => {
    const idx = scenesStore.findIndex(s => s.id === scene.id);
    if (idx >= 0) scenesStore[idx] = scene;
    else scenesStore.push(scene);
    saveScenes();
    return scene;
  });
  ipcMain.handle('scene-delete', (event, sceneId) => {
    scenesStore = scenesStore.filter(s => s.id !== sceneId);
    saveScenes();
    return true;
  });

  // ── Scene Read-Along Auto-Advance IPC (FR-5.36–FR-5.39) ────────────────────
  ipcMain.on('scene-read-along-start', (event, { scene, pageIndex, sequenceIndex }) => {
    console.log('[Scene] Read-Along start:', scene?.name, 'page:', pageIndex, 'seq:', sequenceIndex);
    sceneAutoAdvance.startScene(scene, pageIndex, sequenceIndex);
    if (scene?.sceneType === 'song' || scene?.navMode === 'read_along') {
      const allLyrics = (scene?.pages || []).map(p => p.content).filter(Boolean).join('. ');
      const tokens = (scene?.pages || []).flatMap(p => p.content ? p.content.toLowerCase().split(/\s+/) : []);
      asrEngine.setSongContext({ isSong: true, lyrics: allLyrics, tokens });
      broadcastAsrEvent('scene-song-active', { isSong: true, sceneId: scene?.id, sceneName: scene?.name });
    } else {
      asrEngine.clearSongContext();
      broadcastAsrEvent('scene-song-active', { isSong: false });
    }
  });
  ipcMain.on('scene-read-along-set-page', (event, pageIndex, sequenceIndex) => {
    sceneAutoAdvance.setPage(pageIndex, sequenceIndex);
  });
  ipcMain.on('scene-read-along-stop', () => {
    console.log('[Scene] Read-Along stop');
    sceneAutoAdvance.stop();
    asrEngine.clearSongContext();
    broadcastAsrEvent('scene-song-active', { isSong: false });
  });
  ipcMain.on('scene-read-along-manual-advance', () => {
    sceneAutoAdvance.manualAdvance();
  });
  ipcMain.on('scene-read-along-manual-prev', () => {
    sceneAutoAdvance.manualPrev();
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

// ── ASR IPC (whisper default / vosk fallback) — vosk-* kept as aliases ────────
ipcMain.handle('vosk-status', async () => asrEngine.getState());
ipcMain.handle('asr-status', async () => asrEngine.getState());

ipcMain.handle('vosk-init', async () => asrEngine.initialize());
ipcMain.handle('asr-init', async (_e, opts) => asrEngine.initialize(opts?.engine));

ipcMain.handle('vosk-start', async () => {
  const state = await asrEngine.initialize();
  if (state.status === 'error') return state;
  try {
    return asrEngine.startSession();
  } catch (err) {
    return { ...asrEngine.getState(), status: 'error', error: err.message };
  }
});
ipcMain.handle('asr-start', async () => {
  const state = await asrEngine.initialize();
  if (state.status === 'error') return state;
  try {
    return asrEngine.startSession();
  } catch (err) {
    return { ...asrEngine.getState(), status: 'error', error: err.message };
  }
});

ipcMain.handle('vosk-stop', async () => asrEngine.stopSession());
ipcMain.handle('asr-stop', async () => asrEngine.stopSession());

ipcMain.on('vosk-audio', (_event, pcm) => {
  asrEngine.pushAudio(pcm);
});
ipcMain.on('asr-audio', (_event, pcm) => {
  asrEngine.pushAudio(pcm);
});

let _asrAudioPackets = 0;
asrEngine.on('transcript', (payload) => {
  if (payload && payload.text) {
    console.log(
      `[Asr:${payload.asrEngine || asrEngine.engineName || '?'}]`,
      payload.role || (payload.isFinal ? 'final' : 'partial'),
      JSON.stringify(payload.text),
      'conf=', payload.confidence,
      payload.ignored ? '(ignored)' : ''
    );
  }
});
const _origPush = asrEngine.pushAudio.bind(asrEngine);
asrEngine.pushAudio = (pcm) => {
  if (_asrAudioPackets < 3) {
    const len = pcm ? (pcm.byteLength || pcm.length || 0) : 0;
    console.log(`[Asr] audio packet #${_asrAudioPackets + 1} bytes=${len} session=${asrEngine.getState().sessionActive}`);
    _asrAudioPackets += 1;
  }
  return _origPush(pcm);
};

ipcMain.handle('vosk-set-confidence', async (_e, value) => {
  asrEngine.setConfidenceThreshold(value);
  return asrEngine.getState();
});
ipcMain.handle('asr-set-confidence', async (_e, value) => {
  asrEngine.setConfidenceThreshold(value);
  return asrEngine.getState();
});
ipcMain.handle('asr-transcribe-secondary', async (_e, pcm) => {
  return asrEngine.transcribeSecondary(pcm);
});

// ── Session Archive / Timer lifecycle (FR-5.9–5.28) ───────────────────────────
function broadcastSessionStatus(status) {
  try {
    sleepPrevention.reconcile({ sessionRecording: !!status?.recording });
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('session-archive-status', status);
    }
  } catch (_) {}
}

function broadcastSessionProgress(progress) {
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('session-archive-progress', progress);
    }
  } catch (_) {}
}

ipcMain.on('timer-lifecycle', (_e, event) => {
  emitTimerLifecycle(event || {});
});

ipcMain.handle('session-list', async () => {
  if (!sessionArchive) return [];
  return sessionArchive.listSessions();
});

ipcMain.handle('session-get', async (_e, id) => {
  if (!sessionArchive) throw new Error('Session archive not ready');
  return sessionArchive.getSession(id);
});

ipcMain.handle('session-update', async (_e, { id, patch }) => {
  if (!sessionArchive) throw new Error('Session archive not ready');
  return sessionArchive.updateSession(id, patch || {});
});

ipcMain.handle('session-delete', async (_e, id) => {
  if (!sessionArchive) throw new Error('Session archive not ready');
  return sessionArchive.deleteSession(id);
});

ipcMain.handle('session-retry-pdf', async (_e, id) => {
  if (!sessionArchive) throw new Error('Session archive not ready');
  return sessionArchive.retryPdf(id);
});

ipcMain.handle('session-status', async () => {
  return sessionArchive ? sessionArchive.getStatus() : { recording: false };
});

ipcMain.on('session-transcript-line', (_e, line) => {
  if (sessionArchive) sessionArchive.appendTranscriptLine(line || {});
});

ipcMain.on('session-audio-chunk', (_e, chunk) => {
  if (sessionArchive) sessionArchive.pushAudioChunk(chunk);
});

ipcMain.on('session-audio-mime', (_e, mime) => {
  if (sessionArchive) sessionArchive.setAudioMime(mime);
});

ipcMain.handle('session-show-in-folder', async (_e, id) => {
  if (!sessionArchive) return { ok: false };
  const s = await sessionArchive.getSession(id);
  const { shell } = require('electron');
  const candidates = [s.paths.audio, s.paths.video, s.paths.pdf, s.paths.dir].filter(Boolean);
  let target = s.paths.dir;
  for (const p of candidates) {
    try {
      await fsp.access(p);
      target = p;
      break;
    } catch (_) {}
  }
  if (target === s.paths.dir) {
    await shell.openPath(target);
  } else {
    shell.showItemInFolder(target);
  }
  return { ok: true, path: target };
});

ipcMain.handle('session-audio-url', async (_e, id) => {
  if (!sessionArchive) return null;
  const s = await sessionArchive.getSession(id);
  const mediaPath = s.paths.audio || s.paths.video;
  try {
    await fsp.access(mediaPath);
    const st = await fsp.stat(mediaPath);
    if (!st.size) return null;
    const { pathToFileURL } = require('url');
    return pathToFileURL(mediaPath).href;
  } catch (_) {
    return null;
  }
});

// ── Sleep prevention (FR-13) ───────────────────────────────────────────────────
ipcMain.handle('sleep-get-status', () => sleepPrevention.getStatus());
ipcMain.handle('sleep-set-mode', async (_e, mode) => sleepPrevention.setMode(mode));
ipcMain.handle('sleep-probe', () => sleepPrevention.probe());
ipcMain.handle('settings-get', async () => appSettings.load());
ipcMain.handle('settings-set', async (_e, patch) => {
  const saved = await appSettings.save(patch || {});
  // Keep ASR language gate in sync with Settings (primary + secondary share policy)
  if (
    patch
    && (Object.prototype.hasOwnProperty.call(patch, 'transcriptionLanguage')
      || Object.prototype.hasOwnProperty.call(patch, 'languageGateEnabled'))
  ) {
    asrEngine.setLanguagePolicy({
      enabled: saved.languageGateEnabled !== false,
      languages: [saved.transcriptionLanguage || 'en'],
    });
  }
  return saved;
});

// Legacy alias used by older debug UI
ipcMain.handle('voice-sidecar-status', async () => {
  const s = asrEngine.getState();
  return {
    running: s.status === 'ready' || s.status === 'listening',
    port: null,
    backend: s.asrEngine === 'whisper' ? 'whisper-cpp' : 'native-koffi',
    ...s,
  };
});

// ── AI: Ollama + Piper (direct from main — no Python) ─────────────────────────
ipcMain.handle('ai-status', async () => {
  const asr = asrEngine.getState();
  const ollama = await ollamaStatus();
  return {
    ok: asr.status === 'ready' || asr.status === 'listening',
    asrEngine: asr.asrEngine,
    vosk: asr.model ? asr.model.name : null,
    voskStatus: asr.status,
    piper: piperAvailable(__dirname),
    ollama,
  };
});

ipcMain.handle('ai-chat', async (_event, { prompt, system, model }) => {
  try {
    return await ollamaChat({ prompt, system, model });
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('ai-speak', async (_event, { text, voice }) => {
  try {
    return await piperSpeak(__dirname, text, voice);
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
// ─────────────────────────────────────────────────────────────────────────────


app.whenReady().then(async () => {
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

  appSettings.init(app.getPath('userData'));
  await appSettings.load();

  // Session archive (FR-5.10+)
  sessionArchive = new SessionArchiveService(app.getPath('userData'));
  await sessionArchive.init();
  sessionArchive.on('status', broadcastSessionStatus);
  sessionArchive.on('progress', broadcastSessionProgress);
  sessionArchive.on('session-updated', (meta) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('session-updated', meta);
    }
  });
  sessionArchive.on('session-finalized', (meta) => {
    broadcastSessionStatus(sessionArchive.getStatus());
    // Do not null progress before UI can paint 100% / error — view clears itself
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('session-finalized', meta);
    }
  });

  sleepPrevention.init();
  const sleepProbe = sleepPrevention.probe();
  if (!sleepProbe.ok) {
    console.warn('[SleepPrevention]', sleepProbe.message);
  }

  // Load ASR in-process (whisper default, vosk fallback) — non-blocking for windows
  asrEngine.initialize().then(() => {
    const s = appSettings.loadSync();
    asrEngine.setLanguagePolicy({
      enabled: s.languageGateEnabled !== false,
      languages: [s.transcriptionLanguage || 'en'],
    });
  }).catch((err) => {
    console.error('[Asr] init error:', err.message);
  });

  createWindows();
});

app.on("web-contents-created", (_event, contents) => {
  contents.on("context-menu", (_e, params) => {
    const { isEditable, selectionText, editFlags } = params;
    if (isEditable) {
      const contextMenu = Menu.buildFromTemplate([
        { role: "undo", enabled: editFlags.canUndo },
        { role: "redo", enabled: editFlags.canRedo },
        { type: "separator" },
        { role: "cut", enabled: editFlags.canCut },
        { role: "copy", enabled: editFlags.canCopy },
        { role: "paste", enabled: editFlags.canPaste },
        { role: "pasteAndMatchStyle", enabled: editFlags.canPaste },
        { role: "delete", enabled: editFlags.canDelete },
        { type: "separator" },
        { role: "selectAll", enabled: editFlags.canSelectAll },
      ]);
      const win = BrowserWindow.fromWebContents(contents);
      if (win) contextMenu.popup({ window: win });
    } else if (selectionText && selectionText.trim().length > 0) {
      const contextMenu = Menu.buildFromTemplate([
        { role: "copy", enabled: editFlags.canCopy },
        { type: "separator" },
        { role: "selectAll", enabled: editFlags.canSelectAll },
      ]);
      const win = BrowserWindow.fromWebContents(contents);
      if (win) contextMenu.popup({ window: win });
    }
  });
});

app.on("before-quit", async () => {
  app.isQuitting = true;
  try {
    if (sessionArchive && sessionArchive.active) {
      await sessionArchive.finalizeSession({ incomplete: true });
    }
  } catch (_) {}
  sleepPrevention.shutdown();
  asrEngine.shutdown();
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








