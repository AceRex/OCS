const {
  app,
  BrowserWindow,
  Menu,
  screen,
  ipcMain,
  session,
  dialog,
  Notification,
  shell,
} = require("electron");

// ── Custom Protocol Scheme for Authentication & Deep Links (FR-13.8, FR-13.3) ───
app.setAsDefaultProtocolClient("ocs");

// ── Single Instance Lock (Enforce app only loads once) ──────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log(
    "[App] Another instance of OCS is already running. Quitting duplicate process.",
  );
  app.quit();
  process.exit(0);
}

app.setName("OCS");
if (process.platform === "win32") {
  app.setAppUserModelId("com.acerex.ocs");
}

app.on("second-instance", (_event, argv) => {
  console.log(
    "[App] Second instance launch attempted. Checking for deep link or focusing controller.",
  );
  const deepLink = argv.find(
    (arg) => typeof arg === "string" && arg.startsWith("ocs://"),
  );
  if (deepLink) {
    handleAuthDeepLink(deepLink);
    return;
  }
  const windows = BrowserWindow.getAllWindows();
  const controller = windows.find((w) => w.getTitle() === "OCS Controller");
  if (controller && !controller.isDestroyed()) {
    if (controller.isMinimized()) controller.restore();
    controller.focus();
  }
});

app.on("open-url", (event, rawUrl) => {
  event.preventDefault();
  handleAuthDeepLink(rawUrl);
});

const path = require("path");
const url = require("url");
const { pathToFileURL, fileURLToPath } = url;
const fs = require("fs");
const fsp = fs.promises;
const yauzl = require("yauzl");
const { spawn, execSync } = require("child_process");
const QRCode = require("qrcode");

const { AsrFacade } = require("./src/main/asr/asrFacade");
const { emitTimerLifecycle } = require("./src/main/timerLifecycle");
const { SessionArchiveService } = require("./src/main/sessionArchive");
const { probeMediaInfo } = require("./src/main/sessionAudio");
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
const {
  ollamaStatus,
  ollamaChat,
  piperAvailable,
  piperSpeak,
} = require("./src/main/aiHelpers");
const appSettings = require("./src/main/appSettings");
const sleepPrevention = require("./src/main/sleepPrevention");
const { ReferenceAligner } = require("./src/main/aligner/referenceAligner");
const {
  SceneAutoAdvanceManager,
} = require("./src/main/aligner/sceneAutoAdvance");
const { ndiEngine } = require("./src/main/ndi/ndiEngine");
const { authService } = require("./src/main/auth/authService");

const globalAligner = new ReferenceAligner();
const sceneAutoAdvance = new SceneAutoAdvanceManager({
  aligner: globalAligner,
});

sceneAutoAdvance.on("aligner:update", (update) => {
  broadcastAsrEvent("alignment:update", update);
});
sceneAutoAdvance.on("advance", (data) => {
  broadcastAsrEvent("scene-auto-advance", data);
});
sceneAutoAdvance.on("prev", (data) => {
  broadcastAsrEvent("scene-auto-prev", data);
});
sceneAutoAdvance.on("prompt:suggest", (prompt) => {
  broadcastAsrEvent("scene-prompt-suggest", prompt);
});
sceneAutoAdvance.on("prompt:clear", () => {
  broadcastAsrEvent("scene-prompt-clear", {});
});

// ── Platform helpers ──────────────────────────────────────────────────────────
const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";
const IS_LINUX = process.platform === "linux";

// ── ASR facade (whisper.cpp default, Vosk low-spec fallback) ──────────────────
const asrEngine = new AsrFacade(__dirname);
/** @deprecated use asrEngine — kept for any residual references */
const voskEngine = asrEngine;
let pairing = generatePairing();
let pairingQrDataUrl = null;
/** @type {SessionArchiveService|null} */
let sessionArchive = null;
let splashWindow = null;
let loginWindow = null;
let controllerWindow = null;
let speakerWindow = null;
let generalWindow = null;

function showSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.show();
    return splashWindow;
  }
  splashWindow = new BrowserWindow({
    width: 480,
    height: 320,
    frame: false,
    transparent: true,
    center: true,
    resizable: false,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  splashWindow.loadFile("splash.html");
  return splashWindow;
}

function showLoginWindow() {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.show();
    loginWindow.focus();
    return loginWindow;
  }
  loginWindow = new BrowserWindow({
    width: 540,
    height: 640,
    title: "OCS — Workstation Authentication",
    backgroundColor: "#0B0814",
    resizable: false,
    center: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  loginWindow.loadFile("login.html");
  loginWindow.on("closed", () => {
    loginWindow = null;
  });
  return loginWindow;
}

function handleAuthDeepLink(rawUrl) {
  console.log("[Auth] Processing deep-link callback:", rawUrl);
  const result = authService.validateAuthCallback(rawUrl);
  if (result.ok) {
    console.log("[Auth] Authentication successful for:", result.session?.email);
    if (loginWindow && !loginWindow.isDestroyed()) {
      loginWindow.close();
      loginWindow = null;
    }
    if (!controllerWindow || controllerWindow.isDestroyed()) {
      createWindows();
    } else {
      if (!controllerWindow.isVisible()) controllerWindow.show();
      controllerWindow.focus();
    }
    broadcastAuthStatus();
  } else {
    console.warn("[Auth] Callback validation failed:", result.error);
    // Broadcast error to login window and controller UI
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("auth-error", result.error);
      }
    }
  }
}

function broadcastAuthStatus() {
  const status = authService.getAuthStatus();
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("auth-status", status);
    }
  }
}

function detectPython() {
  // Still used by optional ocs_image_engine design tools — not for ASR.
  const venvBin = IS_WIN ? ["Scripts", "python.exe"] : ["bin", "python"];
  const engineVenv = path.join(
    __dirname,
    "ocs_image_engine",
    ".venv",
    ...venvBin,
  );
  if (fs.existsSync(engineVenv)) return engineVenv;

  const candidates = IS_WIN
    ? ["py", "python", "python3"]
    : [
        "python3.13",
        "python3.12",
        "python3.11",
        "python3.10",
        "python3.9",
        "python3",
        "python",
      ];

  for (const cmd of candidates) {
    try {
      const probe = cmd === "py" ? "py -3 --version" : `${cmd} --version`;
      const ver = execSync(`${probe} 2>&1`, { timeout: 3000 })
        .toString()
        .trim();
      const m = ver.match(/Python 3\.(\d+)/);
      if (!m) continue;
      const minor = parseInt(m[1], 10);
      if (minor >= 9 && minor <= 13) {
        return cmd === "py" ? "py -3" : cmd;
      }
    } catch (_) {}
  }
  return null;
}

function broadcastAsrEvent(channel, payload) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed()) continue;
    try {
      w.webContents.send(channel, payload);
    } catch (_) {}
  }
}

asrEngine.on("transcript", (payload) => {
  broadcastAsrEvent("vosk-transcript", payload);
  broadcastAsrEvent("asr-transcript", payload);

  // Feed active Read-Along aligner if enabled (FR-5.31 / FR-5.36)
  if (sceneAutoAdvance.isEnabled && payload) {
    sceneAutoAdvance.feed(payload);
  }
});
asrEngine.on("status", (payload) => {
  broadcastAsrEvent("vosk-status", payload);
  broadcastAsrEvent("asr-status", payload);
});
// FR-3.68 — broadcast engine switch so debug bar and BroadcastEngine can update
asrEngine.on("engine-changed", (payload) => {
  broadcastAsrEvent("asr-engine-changed", payload);
  console.log("[Asr] engine-changed broadcast →", payload);
});
asrEngine.on("engine-calibrated", (payload) => {
  broadcastAsrEvent("asr-engine-calibrated", payload);
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
      errorCorrectionLevel: "M",
      margin: 1,
      width: 280,
      color: { dark: "#0B0814", light: "#FFFFFF" },
    });
  } catch (err) {
    console.error("[Pairing] QR generation failed:", err.message);
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
const mediaPath = path.join(app.getPath("userData"), "media");
if (!fs.existsSync(mediaPath)) {
  fs.mkdirSync(mediaPath, { recursive: true });
}

// ------ MEDIA HANDLERS ------
ipcMain.handle("media-import", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "Media",
        extensions: [
          "jpg",
          "png",
          "gif",
          "jpeg",
          "webp",
          "mp4",
          "webm",
          "ogg",
          "mov",
          "avi",
          "m4v",
          "mkv",
        ],
      },
      {
        name: "Images",
        extensions: ["jpg", "png", "gif", "jpeg", "webp", "svg", "bmp"],
      },
      {
        name: "Videos",
        extensions: ["mp4", "webm", "ogg", "mov", "avi", "m4v", "mkv"],
      },
    ],
  });

  if (canceled || !filePaths || filePaths.length === 0) return null;

  const imported = [];
  for (const sourcePath of filePaths) {
    const filename = path.basename(sourcePath);
    const destPath = path.join(mediaPath, filename);
    try {
      await fsp.copyFile(sourcePath, destPath);
      imported.push(pathToFileURL(destPath).href);
    } catch (err) {
      console.error("Failed to copy media file", sourcePath, err);
    }
  }

  return imported.length === 1
    ? imported[0]
    : imported.length > 0
      ? imported
      : null;
});

const { convertPptxToPng, collectUsedFonts } = require("pptx-glimpse");
const { resolvePptxInheritance } = require("./src/App/utils/pptxInheritance");
const JSZip = require("jszip");

// ── Presentations Store (FR-4.1 - FR-4.7) ──────────────────────────────────
const presentationsFilePath = path.join(
  app.getPath("userData"),
  "presentations.json",
);
let presentationsStore = [];
try {
  if (fs.existsSync(presentationsFilePath)) {
    presentationsStore = JSON.parse(
      fs.readFileSync(presentationsFilePath, "utf8"),
    );
  }
} catch (_) {
  presentationsStore = [];
}
const savePresentations = () => {
  try {
    fs.writeFileSync(
      presentationsFilePath,
      JSON.stringify(presentationsStore, null, 2),
      "utf8",
    );
  } catch (_) {}
};

// ── Scenes Store (FR-4.28–FR-4.31) ──────────────────────────────────────────
const scenesFilePath = path.join(app.getPath("userData"), "scenes.json");
let scenesStore = [];
try {
  if (fs.existsSync(scenesFilePath)) {
    scenesStore = JSON.parse(fs.readFileSync(scenesFilePath, "utf8"));
  }
} catch (_) {
  scenesStore = [];
}
const saveScenes = () => {
  try {
    fs.writeFileSync(
      scenesFilePath,
      JSON.stringify(scenesStore, null, 2),
      "utf8",
    );
  } catch (_) {}
};

ipcMain.handle("presentation-list", () => presentationsStore);
ipcMain.handle("presentation-save", (event, deck) => {
  const idx = presentationsStore.findIndex((d) => d.id === deck.id);
  if (idx >= 0) presentationsStore[idx] = deck;
  else presentationsStore.push(deck);
  savePresentations();
  return deck;
});
ipcMain.handle("presentation-delete", async (event, deckIdOrUrl) => {
  const deck = presentationsStore.find(
    (d) => d.id === deckIdOrUrl || d.fileUrl === deckIdOrUrl,
  );
  if (deck) {
    presentationsStore = presentationsStore.filter((d) => d.id !== deck.id);
    savePresentations();
    try {
      const pPath = deck.fileUrl ? deck.fileUrl.replace("file://", "") : null;
      if (pPath && fs.existsSync(pPath))
        await fsp.unlink(pPath).catch(() => {});
      const slidesDir = path.join(mediaPath, `${deck.filename}_slides`);
      if (fs.existsSync(slidesDir))
        await fsp
          .rm(slidesDir, { recursive: true, force: true })
          .catch(() => {});
    } catch (_) {}
  } else {
    const filePath =
      typeof deckIdOrUrl === "string"
        ? deckIdOrUrl.replace("file://", "")
        : null;
    if (filePath && fs.existsSync(filePath))
      await fsp.unlink(filePath).catch(() => {});
  }
  return true;
});

const GOOGLE_FONTS_CATALOG = new Set([
  "montserrat",
  "poppins",
  "roboto",
  "open sans",
  "lato",
  "inter",
  "oswald",
  "raleway",
  "nunito",
  "playfair display",
  "merriweather",
  "lora",
  "bebas neue",
  "rubik",
  "work sans",
  "fira sans",
  "pt sans",
  "source sans 3",
  "source sans pro",
  "barlow",
  "mulish",
  "kanit",
  "quicksand",
  "titillium web",
  "inconsolata",
  "heebo",
  "ibm plex sans",
  "dm sans",
  "cabin",
  "outfit",
  "manrope",
  "plus jakarta sans",
  "syne",
  "epilogue",
  "space grotesk",
  "cormorant garamond",
  "cinzel",
  "abril fatface",
  "anton",
  "comfortaa",
  "caveat",
  "pacifico",
  "dancing script",
  "lobster",
  "great vibes",
  "sacramento",
  "righteous",
  "bungee",
  "fredoka",
  "bangers",
  "permanent marker",
]);

function getBaseFontFamily(name) {
  if (!name) return "";
  return name
    .replace(/[-_]/g, " ")
    .replace(
      /\b(ExtraLight|Light|SemiBold|ExtraBold|Bold|Black|Medium|Regular|Thin|Heavy|Italic|Oblique|Condensed|LT|Pro|Display|Text|MT|Std)\b/gi,
      "",
    )
    .trim();
}

function analyzePptxFonts(usedFonts, embeddedFontNames, fontMapping) {
  const referenced = usedFonts?.fonts || [];
  const results = [];
  const advisories = [];

  for (const fontName of referenced) {
    const baseName = getBaseFontFamily(fontName).toLowerCase();
    const isEmbedded = embeddedFontNames.some((ef) =>
      ef.toLowerCase().includes(baseName),
    );
    const isMapped = Object.keys(fontMapping).some(
      (k) =>
        k.toLowerCase() === fontName.toLowerCase() ||
        k.toLowerCase() === baseName,
    );
    const isGoogleFont = GOOGLE_FONTS_CATALOG.has(baseName);
    const googleFontsUrl = isGoogleFont
      ? `https://fonts.google.com/specimen/${encodeURIComponent(getBaseFontFamily(fontName))}`
      : null;

    let status = "system";
    if (isEmbedded) {
      status = "embedded";
    } else if (isMapped) {
      status = "bundled";
    } else if (isGoogleFont) {
      status = "fallback_substituted";
      advisories.push({
        fontName,
        status: "google_font_downloadable",
        googleFontsUrl,
        message: `Font "${fontName}" is available on Google Fonts.`,
      });
    } else {
      status = "fallback_substituted";
      advisories.push({
        fontName,
        status: "unresolved_fallback",
        googleFontsUrl: null,
        message: `Exact font "${fontName}" could not be located in catalog; standard fallback is used.`,
      });
    }

    results.push({
      fontName,
      status,
      googleFontsUrl,
    });
  }

  return {
    fonts: results,
    advisories,
  };
}

async function processPptxDeck(destPath, filename, sendProgress = () => {}) {
  // Create a folder for the slide images
  const slidesDir = path.join(mediaPath, `${filename}_slides`);
  try {
    await fsp.mkdir(slidesDir, { recursive: true });
  } catch (_) {}

  // Handle PDF documents as presentation decks
  if (filename.toLowerCase().endsWith(".pdf")) {
    const { convertPdfToPngSlides } = require("./src/main/pdfConverter");
    sendProgress({
      stage: "converting",
      percent: 10,
      message: "Rendering PDF slides...",
    });
    const pdfResult = await convertPdfToPngSlides(
      destPath,
      slidesDir,
      sendProgress,
    );

    const deck = {
      id: `deck-${Date.now()}`,
      name: filename.replace(/\.pdf$/i, ""),
      filename: filename,
      fileUrl: `file://${destPath}`,
      slideCount: pdfResult.totalSlides,
      slides: pdfResult.slideList,
      errors: [],
      fontAnalysis: null,
      importedAt: Date.now(),
    };

    const existingIdx = presentationsStore.findIndex(
      (d) => d.filename === filename,
    );
    if (existingIdx >= 0) presentationsStore[existingIdx] = deck;
    else presentationsStore.push(deck);
    savePresentations();

    sendProgress({
      stage: "done",
      percent: 100,
      message: "PDF conversion complete!",
    });
    return deck;
  }

  const buffer = await fsp.readFile(destPath);
  const os = require("os");
  const fontDirs = [
    "/System/Library/Fonts",
    "/System/Library/Fonts/Supplemental",
    "/Library/Fonts",
    path.join(os.homedir(), "Library/Fonts"),
    "/Library/Application Support/Microsoft/Fonts",
    "C:\\Windows\\Fonts",
    "C:\\Program Files\\Microsoft Office\\root\\vfs\\Fonts",
    "/usr/share/fonts",
    "/usr/local/share/fonts",
  ].filter((d) => {
    try {
      return fs.existsSync(d);
    } catch (_) {
      return false;
    }
  });

  const fontMapping = {
    "Century Gothic": "Arial",
    Aptos: "Arial",
    "Aptos Display": "Arial",
    Calibri: "Arial",
    "Calibri Light": "Arial",
    "Segoe UI": "Arial",
    "Segoe UI Semibold": "Arial",
    "Segoe UI Light": "Arial",
    Tahoma: "Arial",
    "Trebuchet MS": "Arial",
    Verdana: "Arial",
    Impact: "Arial Black",
    Georgia: "Times New Roman",
    Garamond: "Times New Roman",
    "Book Antiqua": "Times New Roman",
    Palatino: "Times New Roman",
    "Palatino Linotype": "Times New Roman",
    Consolas: "Courier New",
    "Lucida Console": "Courier New",
    "Franklin Gothic Medium": "Arial",
    "Gill Sans MT": "Arial",
    Century: "Times New Roman",
    Baskerville: "Times New Roman",
    Montserrat: "Arial",
    "Montserrat ExtraBold": "Arial Bold",
    "Montserrat Medium": "Arial",
    "Montserrat SemiBold": "Arial Bold",
    "Montserrat Light": "Arial",
    "Montserrat Black": "Arial Black",
    Poppins: "Arial",
    "Poppins Medium": "Arial",
    "Poppins SemiBold": "Arial Bold",
    "Poppins Bold": "Arial Bold",
    Roboto: "Arial",
    "Roboto Medium": "Arial",
    "Roboto Bold": "Arial Bold",
    "Open Sans": "Arial",
    "Open Sans SemiBold": "Arial Bold",
    Lato: "Arial",
    "Lato Bold": "Arial Bold",
    Inter: "Arial",
    Oswald: "Arial",
    Raleway: "Arial",
    Nunito: "Arial",
    "Playfair Display": "Georgia",
    Merriweather: "Georgia",
    Lora: "Georgia",
    "Bebas Neue": "Arial Black",
    Futura: "Arial",
    "Helvetica Neue": "Helvetica",
  };

  // Pre-process PPTX buffer to resolve 3-level placeholder & background inheritance (FR-4.2)
  const resolvedBuffer = await resolvePptxInheritance(buffer);

  // Stage 2: Font detection and OpenXML inspection (Task 2)
  sendProgress({
    stage: "fonts",
    percent: 15,
    message: "Analyzing fonts and structure...",
  });
  let totalSlides = 1;
  let notesMap = {};
  let embeddedFontNames = [];
  let usedFonts = { fonts: [] };

  try {
    if (typeof collectUsedFonts !== "undefined")
      usedFonts = collectUsedFonts(resolvedBuffer);
  } catch (_) {}

  try {
    const zip = await JSZip.loadAsync(resolvedBuffer);
    const slideFiles = Object.keys(zip.files).filter((k) =>
      k.match(/^ppt\/slides\/slide\d+\.xml$/),
    );
    if (slideFiles.length > 0) totalSlides = slideFiles.length;

    const fontFiles = Object.keys(zip.files).filter((k) =>
      k.startsWith("ppt/fonts/"),
    );
    embeddedFontNames = fontFiles.map((fn) =>
      path.basename(fn, path.extname(fn)),
    );

    // Extract speaker notes via OpenXML (FR-4.3)
    const noteFiles = Object.keys(zip.files).filter((k) =>
      k.startsWith("ppt/notesSlides/notesSlide"),
    );
    for (const nf of noteFiles) {
      const match = nf.match(/notesSlide(\d+)\.xml/);
      const slideNum = match ? parseInt(match[1], 10) : null;
      if (slideNum) {
        const xml = await zip.file(nf).async("string");
        const texts = [...xml.matchAll(/<a:t>(.*?)<\/a:t>/gs)]
          .map((m) => m[1])
          .join(" ")
          .trim();
        notesMap[slideNum] = texts;
      }
    }
  } catch (err) {
    console.warn("[PPTX] Zip parsing warning:", err);
  }

  const fontAnalysis = analyzePptxFonts(
    usedFonts,
    embeddedFontNames,
    fontMapping,
  );

  // Stage 3: Slide conversion with batch engine and progressive progress reporting (FR-4.2, FR-4.34)
  sendProgress({
    stage: "converting",
    current: 0,
    total: totalSlides,
    percent: 30,
    message: `Converting ${totalSlides} slides to presentation graphics...`,
  });

  const slideList = [];
  const errors = [];

  try {
    // Single-pass batch conversion (10x faster: loads fonts and OpenXML DOM once for all slides)
    const convertedAll = await convertPptxToPng(resolvedBuffer, {
      fontDirs,
      fontMapping,
      width: 1920,
      height: 1080,
    });

    const totalConverted = Array.isArray(convertedAll)
      ? convertedAll.length
      : 0;
    for (let s = 1; s <= totalConverted; s++) {
      const slideItem = convertedAll[s - 1];
      if (slideItem) {
        const pngBuf = slideItem.png ? slideItem.png : slideItem;
        const slideNumber = slideItem.slideNumber || s;
        const slidePath = path.join(slidesDir, `slide_${slideNumber}.png`);
        await fsp.writeFile(slidePath, pngBuf);
        slideList.push({
          slideIndex: s - 1,
          slideNumber: slideNumber,
          url: `file://${slidePath}`,
          notes: notesMap[slideNumber] || "",
          width: slideItem.width || 1920,
          height: slideItem.height || 1080,
        });
      }

      const pct = Math.round(30 + (s / Math.max(1, totalConverted)) * 60);
      sendProgress({
        stage: "converting",
        current: s,
        total: totalConverted,
        percent: pct,
        message: `Saved slide ${s} of ${totalConverted}...`,
      });
    }
  } catch (batchErr) {
    console.warn(
      "[PPTX] Batch conversion warning, falling back to per-slide conversion:",
      batchErr,
    );
    for (let s = 1; s <= totalSlides; s++) {
      const pct = Math.round(30 + (s / totalSlides) * 60);
      sendProgress({
        stage: "converting",
        current: s,
        total: totalSlides,
        percent: pct,
        message: `Converting slide ${s} of ${totalSlides}...`,
      });
      try {
        const converted = await convertPptxToPng(resolvedBuffer, {
          slides: [s],
          fontDirs,
          fontMapping,
          width: 1920,
          height: 1080,
        });
        const slideItem = converted && converted[0] ? converted[0] : null;
        if (slideItem) {
          const pngBuf = slideItem.png ? slideItem.png : slideItem;
          const slideNumber = slideItem.slideNumber || s;
          const slidePath = path.join(slidesDir, `slide_${slideNumber}.png`);
          await fsp.writeFile(slidePath, pngBuf);
          slideList.push({
            slideIndex: s - 1,
            slideNumber: slideNumber,
            url: `file://${slidePath}`,
            notes: notesMap[slideNumber] || "",
            width: slideItem.width || 1920,
            height: slideItem.height || 1080,
          });
        }
      } catch (slideErr) {
        errors.push({
          slideIndex: s - 1,
          slideNumber: s,
          error: slideErr.message,
        });
      }
    }
  }

  // Stage 4: Finalizing
  sendProgress({
    stage: "finalizing",
    percent: 95,
    message: "Finalizing slide deck...",
  });

  const deck = {
    id: `deck-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fileUrl: `file://${destPath}`,
    filename: filename,
    name: path.basename(filename, path.extname(filename)),
    slideCount: slideList.length,
    slides: slideList,
    fontAnalysis: fontAnalysis,
    errors: errors.length > 0 ? errors : undefined,
    importedAt: Date.now(),
  };

  const idx = presentationsStore.findIndex((d) => d.filename === filename);
  if (idx >= 0) presentationsStore[idx] = deck;
  else presentationsStore.push(deck);
  savePresentations();

  sendProgress({ stage: "done", percent: 100, message: "Import complete!" });
  return deck;
}

ipcMain.handle("media-import-presentation", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const sendProgress = (data) => {
    try {
      if (window && !window.isDestroyed()) {
        window.webContents.send("presentation-import-progress", data);
      }
    } catch (_) {}
  };

  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    properties: ["openFile"],
    filters: [
      {
        name: "Presentations & PDF Documents",
        extensions: ["pptx", "ppt", "pdf"],
      },
      { name: "PowerPoint Presentations", extensions: ["pptx", "ppt"] },
      { name: "PDF Documents", extensions: ["pdf"] },
    ],
  });

  if (canceled || filePaths.length === 0) return null;

  const sourcePath = filePaths[0];
  const filename = path.basename(sourcePath);
  const destPath = path.join(mediaPath, filename);

  try {
    sendProgress({
      stage: "reading",
      percent: 5,
      message: "Reading presentation file...",
    });
    await fsp.copyFile(sourcePath, destPath);
    return await processPptxDeck(destPath, filename, sendProgress);
  } catch (err) {
    console.error("Failed to copy presentation or convert slides", err);
    sendProgress({
      stage: "error",
      percent: 100,
      error: err.message,
      message: `Import failed: ${err.message}`,
    });
    return { error: err.message };
  }
});

ipcMain.handle("open-external-url", async (_event, url) => {
  if (
    url &&
    typeof url === "string" &&
    (url.startsWith("https://") || url.startsWith("http://"))
  ) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});

ipcMain.handle("media-list", async () => {
  try {
    const files = await fsp.readdir(mediaPath);
    const fileStats = await Promise.all(
      files.map(async (file) => {
        if (file.startsWith(".") || file.endsWith("_slides")) return null;
        const filePath = path.join(mediaPath, file);
        try {
          const stat = await fsp.stat(filePath);
          if (stat.isDirectory()) return null;
          return { name: file, time: stat.mtime.getTime() };
        } catch (err) {
          return null;
        }
      }),
    );

    return fileStats
      .filter(Boolean)
      .sort((a, b) => b.time - a.time)
      .map((f) => pathToFileURL(path.join(mediaPath, f.name)).href);
  } catch (err) {
    console.error("Failed to list media", err);
    return [];
  }
});

ipcMain.handle("media-delete", async (event, fileUrl) => {
  try {
    const filePath = fileUrl.startsWith("file://")
      ? fileURLToPath(fileUrl)
      : fileUrl;
    const stat = await fsp.stat(filePath).catch(() => null);
    if (!stat) return false;
    if (stat.isDirectory()) {
      await fsp.rm(filePath, { recursive: true, force: true });
    } else {
      await fsp.unlink(filePath);
    }
    return true;
  } catch (err) {
    if (err.code === "ENOENT") return false;
    console.error("Failed to delete media", err);
    return false;
  }
});
// ----------------------------

// ------ DESIGN LAB HANDLERS ------
const axios = require("axios");
const FormData = require("form-data");

let currentDesignProcess = null;

ipcMain.handle("design-analyze", async (event, imagePath) => {
  try {
    // Kill existing process if running to prevent memory overflow
    if (currentDesignProcess) {
      currentDesignProcess.kill("SIGTERM");
      currentDesignProcess = null;
    }

    const scriptPath = path.join(__dirname, "ocs_image_engine", "engine.py");
    const posterPath = imagePath.replace("file://", "");
    const outputDir = path.join(app.getPath("userData"), "generated_assets");

    return new Promise((resolve, reject) => {
      const pythonCmd =
        detectPython() || (process.platform === "win32" ? "python" : "python3");

      try {
        // Pass --generate to trigger inference and --out to ensure files are written outside the project root
        currentDesignProcess = spawn(pythonCmd, [
          scriptPath,
          "--generate",
          posterPath,
          "--out",
          outputDir,
        ]);
      } catch (err) {
        return resolve({
          error: `Could not start Python engine: ${err.message}`,
        });
      }

      const proc = currentDesignProcess;

      proc.on("error", (err) => {
        if (currentDesignProcess === proc) currentDesignProcess = null;
        resolve({ error: `Python engine error: ${err.message}` });
      });

      let output = "";
      let errorOutput = "";

      proc.stdout.on("data", (data) => {
        output += data.toString();
      });
      proc.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      proc.on("close", (code) => {
        if (currentDesignProcess === proc) currentDesignProcess = null;
        if (code === 0) {
          try {
            // Extract JSON from the output (handles any stray logs)
            const jsonMatch = output.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const result = JSON.parse(jsonMatch[0]);
              resolve(result);
            } else {
              resolve({
                error: "No valid JSON found in engine output",
                details: output,
              });
            }
          } catch (e) {
            resolve({ error: "Failed to parse AI output", details: output });
          }
        } else {
          resolve({
            error: `Engine failed with code ${code}`,
            details: errorOutput,
          });
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
  return {
    success: true,
    message: "Assets already generated during analysis.",
  };
});

// ------ SERVER SETUP ------
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const ip = require("ip");

const serverApp = express();
serverApp.use(cors());
const server = http.createServer(serverApp);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  maxHttpBufferSize: 1e8, // 100MB buffer for large media & video transfers
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ------ BIBLE DATABASE HANDLERS ------
const sqlite3 = require("sqlite3").verbose();
const dbPath = path.join(__dirname, "src/Bible/bibles.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error("Database opening error: ", err);
});

const PORT = 4000;
let serverIp = ip.address(); // Get initial IP
let connectedDevices = [];

// 100MB Body Parsers for heavy media & video transfers
serverApp.use(express.json({ limit: "100mb" }));
serverApp.use(express.urlencoded({ limit: "100mb", extended: true }));

// Read-only endpoints — unpaired devices may probe the server but cannot control it
serverApp.get("/pair-info", (_req, res) => {
  res.json({
    ok: true,
    port: PORT,
    pairingRequired: true,
    // Never expose the live token/code over an unauthenticated HTTP GET
  });
});

// Direct HTTP Upload Endpoint for heavy video/media transfers
serverApp.post("/api/upload-asset", async (req, res) => {
  try {
    const { name, type, size, mimeType, dataBase64, deviceName, pairingCode } = req.body || {};

    if (!name || !dataBase64) {
      return res.status(400).json({ ok: false, error: "Invalid asset payload" });
    }

    const transferId = `xfer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const clientIp = req.ip || req.socket.remoteAddress;

    let responded = false;
    pendingAssetTransfers.set(transferId, {
      transferId,
      device: { id: "http-upload", name: deviceName || "Mobile Companion", ip: clientIp },
      payload: { name, type, size, mimeType, dataBase64 },
      ack: (result) => {
        if (!responded) {
          responded = true;
          res.json(result);
        }
      },
      createdAt: Date.now(),
    });

    console.log(
      `[Remote Asset HTTP] Incoming transfer ${transferId} from ${deviceName || "Mobile"}: ${name} (${type}, ${size} bytes)`
    );

    // Surface accept/reject prompt to desktop
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("mobile-asset-request", {
          transferId,
          deviceId: "http-upload",
          deviceName: deviceName || "Mobile Companion",
          deviceIp: clientIp,
          fileName: name,
          fileType: type || "media",
          fileSize: size || 0,
          mimeType: mimeType || "",
          previewDataUrl:
            type === "image" || type === "video"
              ? dataBase64.startsWith("data:")
                ? dataBase64
                : `data:${mimeType || (type === "video" ? "video/mp4" : "image/jpeg")};base64,${dataBase64}`
              : null,
        });
      }
    }

    // Trigger OS Desktop Push Notification
    if (Notification.isSupported()) {
      try {
        const notif = new Notification({
          title: `OCS — Incoming Asset Request`,
          body: `${deviceName || "Mobile"} wants to share "${name}". Click to review & accept.`,
          silent: false,
        });
        notif.show();
      } catch (_) {}
    }
  } catch (err) {
    console.error("[Remote Asset HTTP Error]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Direct Raw Binary Stream Upload Endpoint (compatible with Expo uploadAsync)
serverApp.post("/api/upload-asset-raw", (req, res) => {
  try {
    const filename = decodeURIComponent(req.headers["x-filename"] || `asset_${Date.now()}`);
    const fileType = req.headers["x-filetype"] || "media";
    const deviceName = decodeURIComponent(req.headers["x-devicename"] || "Mobile Companion");
    const clientIp = req.ip || req.socket.remoteAddress;
    const transferId = `xfer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const buf = Buffer.concat(chunks);
      const dataBase64 = buf.toString("base64");

      let responded = false;
      pendingAssetTransfers.set(transferId, {
        transferId,
        device: { id: "http-upload", name: deviceName, ip: clientIp },
        payload: {
          name: filename,
          type: fileType,
          size: buf.length,
          mimeType: req.headers["content-type"] || "application/octet-stream",
          dataBase64,
        },
        ack: (result) => {
          if (!responded) {
            responded = true;
            res.json(result);
          }
        },
        createdAt: Date.now(),
      });

      console.log(
        `[Remote Asset RAW HTTP] Incoming transfer ${transferId} from ${deviceName}: ${filename} (${fileType}, ${buf.length} bytes)`
      );

      // Surface accept/reject prompt to desktop
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send("mobile-asset-request", {
            transferId,
            deviceId: "http-upload",
            deviceName,
            deviceIp: clientIp,
            fileName: filename,
            fileType,
            fileSize: buf.length,
            mimeType: req.headers["content-type"] || "",
            previewDataUrl: null,
          });
        }
      }

      if (Notification.isSupported()) {
        try {
          const notif = new Notification({
            title: `OCS — Incoming Asset Request`,
            body: `${deviceName} wants to share "${filename}". Click to review & accept.`,
            silent: false,
          });
          notif.show();
        } catch (_) {}
      }
    });

    req.on("error", (err) => {
      console.error("[Remote Asset RAW Stream Error]", err);
      res.status(500).json({ ok: false, error: err.message });
    });
  } catch (err) {
    console.error("[Remote Asset RAW Error]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Serve static directory for OBS Browser Sources & overlay views
serverApp.use(express.static(__dirname));

// NDI & Broadcast Overlays (for OBS Browser Source, vMix, etc.)
serverApp.get("/overlay/program", (_req, res) => {
  res.redirect("/view.html?mode=general&alpha=1");
});
serverApp.get("/overlay/stage", (_req, res) => {
  res.redirect("/view.html?mode=speaker&alpha=1");
});
serverApp.get("/stream/program.mjpg", (req, res) => {
  ndiEngine.handleMjpegRequest(req, res, "program");
});
serverApp.get("/stream/stage.mjpg", (req, res) => {
  ndiEngine.handleMjpegRequest(req, res, "stage");
});
serverApp.get("/api/ndi/status", (_req, res) => {
  res.json(ndiEngine.getStatus());
});
serverApp.get("/api/ndi/sources", async (_req, res) => {
  res.json(await ndiEngine.discoverSources());
});

let pendingAssetTransfers = new Map();
let latestOverlayContent = null;
let latestOverlayStyle = null;
let latestOverlayTimer = null;
const adminDeviceIds = new Set();
const adminDeviceNames = new Set();

function broadcastDevicesUpdated() {
  const devicesList = connectedDevices.map((d) => ({
    id: d.id,
    ip: d.ip,
    name: d.name,
    paired: !!d.paired,
    status: d.paired ? "connected" : "pending",
    isAdmin: adminDeviceIds.has(d.id) || adminDeviceNames.has(d.name) || !!d.isAdmin,
    isVoiceActive: !!d.isVoiceActive,
    connectedAt: d.connectedAt,
  }));
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("mobile-devices-updated", devicesList);
    }
  }
}

/**
 * Socket.IO auth (FR-6.10 / NFR-26):
 * - Connection is allowed so the socket can attempt to pair
 * - Control actions require a successful `pair` event with valid token/code
 */
io.on("connection", (socket) => {
  console.log("[Remote] socket connected", socket.id);

  // Send current active overlay state to newly connected client (OBS Browser Source / Web View)
  try {
    if (latestOverlayContent)
      socket.emit("overlay-content", latestOverlayContent);
    if (latestOverlayStyle) socket.emit("overlay-style", latestOverlayStyle);
    if (latestOverlayTimer != null)
      socket.emit("overlay-timer", latestOverlayTimer);
    if (currentCanvasState) socket.emit("overlay-canvas", currentCanvasState);
  } catch (_) {}

  const device = {
    id: socket.id,
    ip: socket.handshake.address,
    paired: false,
    name:
      (socket.handshake.auth && socket.handshake.auth.deviceName) || "Mobile",
    isVoiceActive: false,
    connectedAt: Date.now(),
  };
  connectedDevices.push(device);

  const windows = BrowserWindow.getAllWindows();
  const controller = windows.find((w) => w.getTitle() === "OCS Controller");

  const notifyController = (channel, payload) => {
    if (controller && !controller.isDestroyed()) {
      controller.webContents.send(channel, payload);
    }
  };

  // Auth attempt via handshake auth (preferred) or explicit pair event
  const handshakeCred =
    socket.handshake.auth &&
    (socket.handshake.auth.token || socket.handshake.auth.code);
  if (handshakeCred && validateCredential(pairing, handshakeCred)) {
    // Gate mobile pairing on desktop auth state (FR-13.7)
    if (!authService.isAuthenticated()) {
      socket.emit("pair-result", {
        ok: false,
        error:
          "Desktop Controller must be authenticated to accept mobile pairings (FR-13.7).",
      });
      return;
    }
    markPaired(socket.id);
    device.paired = true;
    device.status = "connected";
    device.name = socket.handshake.auth.deviceName || "Mobile";
    device.isAdmin = adminDeviceIds.has(device.id) || adminDeviceNames.has(device.name);
    console.log("[Remote] paired via handshake:", socket.id, "isAdmin:", device.isAdmin);
    socket.emit("pair-result", { ok: true, deviceName: device.name, isAdmin: device.isAdmin });
    notifyController("mobile-connected", device);
    broadcastDevicesUpdated();
  } else {
    // Unpaired — connected but pending pairing.
    device.status = "pending";
    notifyController("mobile-unpaired-attempt", {
      id: socket.id,
      ip: device.ip,
      at: Date.now(),
    });
    socket.emit("pair-required", {
      message: "Send pair event with token or 6-digit code",
    });
    broadcastDevicesUpdated();
  }

  socket.on("pair", (payload = {}) => {
    // Gate mobile pairing on desktop auth state (FR-13.7)
    if (!authService.isAuthenticated()) {
      socket.emit("pair-result", {
        ok: false,
        error:
          "Desktop Controller must be authenticated to accept mobile pairings (FR-13.7).",
      });
      return;
    }

    const clientIp = device.ip || socket.handshake.address;

    // FR-6.12 — rate-limit 6-digit code attempts per source IP
    const rateCheck = _pairingRateLimiter.check(clientIp);
    if (!rateCheck.allowed) {
      notifyController("mobile-unpaired-attempt", {
        id: socket.id,
        ip: clientIp,
        at: Date.now(),
        reason: rateCheck.reason,
        lockedMs: rateCheck.retryAfterMs,
      });
      socket.emit("pair-result", {
        ok: false,
        error: "Too many attempts. Try again later.",
        retryAfterMs: rateCheck.retryAfterMs,
      });
      return;
    }

    const cred = payload.token || payload.code;
    if (!validateCredential(pairing, cred)) {
      console.warn("[Remote] rejected pair attempt from", socket.id);
      _pairingRateLimiter.recordFailure(clientIp); // FR-6.12
      notifyController("mobile-unpaired-attempt", {
        id: socket.id,
        ip: clientIp,
        at: Date.now(),
        reason: "invalid_credential",
      });
      socket.emit("pair-result", { ok: false, error: "Invalid pairing code" });
      return;
    }
    _pairingRateLimiter.recordSuccess(clientIp); // FR-6.12: reset counter on success
    markPaired(socket.id);
    device.paired = true;
    device.status = "connected";
    device.name = payload.deviceName || device.name || "Mobile";
    device.isAdmin = adminDeviceIds.has(device.id) || adminDeviceNames.has(device.name);
    socket.emit("pair-result", { ok: true, deviceName: device.name, isAdmin: device.isAdmin });
    notifyController("mobile-connected", device);
    broadcastDevicesUpdated();
  });

  socket.on("device-rename", (payload = {}) => {
    const newName = (payload.name || "").trim();
    if (newName) {
      device.name = newName;
      socket.emit("device-renamed", { name: newName });
      broadcastDevicesUpdated();
    }
  });

  socket.on("mobile-voice-state", (payload = {}) => {
    device.isVoiceActive = !!payload.active;
    broadcastDevicesUpdated();
  });

  // Task 3: Secondary Voice Input (FR-3.35 - FR-3.40) (Admin Only for Controller & Mic)
  socket.on("mobile-audio", async (payload = {}, ack = () => {}) => {
    if (!isPaired(socket.id)) {
      ack({ ok: false, error: "Pairing required before sending voice audio" });
      return;
    }

    const isDeviceAdmin =
      adminDeviceIds.has(device.id) ||
      adminDeviceNames.has(device.name) ||
      !!device.isAdmin;
    if (!isDeviceAdmin) {
      console.warn(
        `[Remote Voice] Blocked non-admin device ${device.name} (${socket.id}) from controller/mic mode`,
      );
      ack({
        ok: false,
        error:
          "Unauthorized: Controller Voice and Wireless Mic modes are strictly for Admin devices.",
      });
      return;
    }

    try {
      let pcmBuffer;
      if (Buffer.isBuffer(payload.pcm)) {
        pcmBuffer = payload.pcm;
      } else if (
        payload.pcm &&
        typeof payload.pcm === "object" &&
        payload.pcm.data
      ) {
        pcmBuffer = Buffer.from(payload.pcm.data);
      } else if (typeof payload.pcmBase64 === "string") {
        const clean = payload.pcmBase64.includes("base64,")
          ? payload.pcmBase64.split("base64,")[1]
          : payload.pcmBase64;
        pcmBuffer = Buffer.from(clean, "base64");
      } else if (typeof payload.dataBase64 === "string") {
        const clean = payload.dataBase64.includes("base64,")
          ? payload.dataBase64.split("base64,")[1]
          : payload.dataBase64;
        pcmBuffer = Buffer.from(clean, "base64");
      } else {
        ack({ ok: false, error: "No audio data provided" });
        return;
      }

      console.log(
        `[Remote Voice] Received secondary audio from ${device.name}: ${pcmBuffer.length} bytes`,
      );
      const { decodeAudioToPcm16k } = require("./src/main/audioDecoder");
      const pcm16k = await decodeAudioToPcm16k(pcmBuffer);
      console.log(`[Remote Voice] Decoded to ${pcm16k.length} bytes 16kHz PCM`);

      const result = await asrEngine.transcribeSecondary(pcm16k);
      const text = result?.text || "";

      // Broadcast transcript to desktop windows with source: 'secondary' and deviceName
      broadcastAsrEvent("asr-transcript", {
        text,
        isFinal: true,
        confidence: result?.confidence ?? 1.0,
        source: "secondary",
        deviceName: device.name,
        utteranceId: `sec-${Date.now()}`,
        role: payload.role || "final",
      });

      ack({
        ok: true,
        text,
        confidence: result?.confidence ?? 1.0,
        ignored: !!result?.ignored,
      });
    } catch (err) {
      console.error("[Remote Voice] Error in transcribeSecondary:", err);
      ack({ ok: false, error: err.message });
    }
  });

  // Intercom Mode 1: Peer-to-Peer / Group Speak
  socket.on("intercom-get-peers", (ack = () => {}) => {
    if (!isPaired(socket.id)) return ack({ ok: false, peers: [] });
    const peers = connectedDevices
      .filter((d) => d.paired && d.id !== socket.id)
      .map((d) => ({
        id: d.id,
        name: d.name,
        ip: d.ip,
        isVoiceActive: !!d.isVoiceActive,
      }));
    ack({ ok: true, peers });
  });

  socket.on("intercom-speak", (payload = {}, ack = () => {}) => {
    if (!isPaired(socket.id))
      return ack({ ok: false, error: "Pairing required" });
    const { target, audioBase64, format, durationMs } = payload;
    if (!audioBase64) return ack({ ok: false, error: "No audio provided" });

    const message = {
      fromId: socket.id,
      fromName: device.name,
      audioBase64,
      format: format || "m4a",
      durationMs: durationMs || 0,
      timestamp: Date.now(),
      target: target || "all",
    };

    if (target && target !== "all") {
      io.to(target).emit("intercom-message", message);
    } else {
      socket.broadcast.emit("intercom-message", message);
    }
    ack({ ok: true });
  });

  // Intercom Mode 3: Wireless Microphone Audio Stream
  socket.on("mobile-mic-stream", (payload = {}) => {
    if (!isPaired(socket.id)) return;
    const { volume, active } = payload;
    device.isVoiceActive = !!active;
    broadcastDevicesUpdated();
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("mobile-mic-meter", {
          deviceId: socket.id,
          deviceName: device.name,
          volume: volume ?? 0,
          active: !!active,
        });
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("[Remote] disconnected", socket.id);
    unmarkPaired(socket.id);
    connectedDevices = connectedDevices.filter((d) => d.id !== socket.id);
    notifyController("mobile-disconnected", { id: socket.id });
    broadcastDevicesUpdated();
  });

  // Mobile Companion Scene / Song Transfer & Creation
  socket.on("mobile-scene-transfer", async (payload = {}, ack = () => {}) => {
    if (!isPaired(socket.id)) {
      ack({ ok: false, error: "Pairing required before sharing scenes" });
      return;
    }

    try {
      const sceneData = payload.scene || payload;
      if (!sceneData || !sceneData.name) {
        ack({ ok: false, error: "Scene must have a name" });
        return;
      }

      const sceneId = sceneData.id || `scene-${Date.now()}`;
      const scene = {
        id: sceneId,
        name: sceneData.name,
        sceneType: sceneData.sceneType || "song",
        navMode: sceneData.navMode || "read_along",
        pages:
          Array.isArray(sceneData.pages) && sceneData.pages.length > 0
            ? sceneData.pages
            : [
                {
                  label: "Section 1",
                  content: sceneData.content || "",
                  translation: sceneData.translation || "",
                },
              ],
        style: sceneData.style || {
          fontSize: 32,
          textAlign: "center",
          fontFamily: "sans",
          color: "#ffffff",
          backgroundColor: "transparent",
        },
        createdAt: sceneData.createdAt || Date.now(),
        author: device.name || "Mobile Companion",
      };

      const idx = scenesStore.findIndex((s) => s.id === scene.id);
      if (idx >= 0) scenesStore[idx] = scene;
      else scenesStore.push(scene);
      saveScenes();

      // Broadcast to all desktop windows
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send("scene-list-updated", scenesStore);
          win.webContents.send("scene-imported", scene);
        }
      }

      // Push OS notification to desktop
      if (Notification.isSupported()) {
        try {
          const notif = new Notification({
            title: "OCS — New Scene Received",
            body: `${device.name} shared "${scene.name}". Click to view in Controller.`,
            silent: false,
          });
          notif.on("click", () => {
            if (controllerWindow && !controllerWindow.isDestroyed()) {
              if (controllerWindow.isMinimized()) controllerWindow.restore();
              controllerWindow.show();
              controllerWindow.focus();
            }
          });
          notif.show();
        } catch (_) {}
      }

      console.log(
        `[Remote Scene] Imported scene "${scene.name}" from ${device.name}`,
      );
      ack({
        ok: true,
        scene,
        message: `Scene "${scene.name}" added to desktop library`,
      });
    } catch (err) {
      console.error("[Remote Scene] Failed to import scene:", err);
      ack({ ok: false, error: err.message });
    }
  });

  // Task 3: Asset transfer from mobile
  socket.on("mobile-asset-transfer", async (payload = {}, ack = () => {}) => {
    if (!isPaired(socket.id)) {
      ack({ ok: false, error: "Pairing required before sending assets" });
      return;
    }

    const { name, type, size, mimeType, dataBase64 } = payload;
    if (!name || !dataBase64) {
      ack({ ok: false, error: "Invalid asset payload" });
      return;
    }

    // Size limit check (50MB)
    const MAX_SIZE_BYTES = 50 * 1024 * 1024;
    if (size && size > MAX_SIZE_BYTES) {
      ack({ ok: false, error: "File exceeds 50MB limit" });
      return;
    }

    const transferId = `xfer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    pendingAssetTransfers.set(transferId, {
      transferId,
      socketId: socket.id,
      device: { id: socket.id, name: device.name, ip: device.ip },
      payload,
      ack,
      createdAt: Date.now(),
    });

    console.log(
      `[Remote Asset] Incoming transfer ${transferId} from ${device.name}: ${name} (${type}, ${size} bytes)`,
    );

    // Surface accept/reject prompt to desktop
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("mobile-asset-request", {
          transferId,
          deviceId: socket.id,
          deviceName: device.name,
          deviceIp: device.ip,
          fileName: name,
          fileType: type || "media",
          fileSize: size || 0,
          mimeType: mimeType || "",
          previewDataUrl:
            type === "image" || type === "video"
              ? dataBase64.startsWith("data:")
                ? dataBase64
                : `data:${mimeType || (type === "video" ? "video/mp4" : "image/jpeg")};base64,${dataBase64}`
              : null,
        });
      }
    }

    // Trigger OS Desktop Push Notification
    if (Notification.isSupported()) {
      try {
        const fileTypeName =
          type === "image"
            ? "Image"
            : type === "presentation"
              ? "Presentation"
              : type === "audio"
                ? "Audio Track"
                : "Document";
        const notif = new Notification({
          title: `OCS — Incoming ${fileTypeName} Request`,
          body: `${device.name} wants to share "${name}" with your presentation. Click to review & accept.`,
          silent: false,
          urgency: "critical",
        });
        notif.on("click", () => {
          if (controllerWindow && !controllerWindow.isDestroyed()) {
            if (controllerWindow.isMinimized()) controllerWindow.restore();
            controllerWindow.show();
            controllerWindow.focus();
          }
        });
        notif.show();
      } catch (notifErr) {
        console.warn(
          "[Notification] Could not display desktop notification:",
          notifErr.message,
        );
      }
    }
  });

  // Handle commands from mobile — gated by pairing (NFR-26)
  socket.on("mobile-action", async (action, ack = () => {}) => {
    if (!isPaired(socket.id)) {
      console.warn(
        "[Remote] blocked unpaired mobile-action from",
        socket.id,
        action && action.type,
      );
      notifyController("mobile-unpaired-attempt", {
        id: socket.id,
        ip: device.ip,
        at: Date.now(),
        reason: "unpaired_action",
        actionType: action && action.type,
      });
      socket.emit("pair-required", {
        message: "Pairing required before control commands",
      });
      if (typeof ack === "function") ack({ ok: false, error: "Pairing required" });
      return;
    }

    console.log("Action received from mobile:", action);

    // Stage Master Control — authorized for mobile admins only
    if (action.type === "stage-control") {
      const isDeviceAdmin =
        adminDeviceIds.has(device.id) ||
        adminDeviceNames.has(device.name) ||
        !!device.isAdmin;
      if (!isDeviceAdmin) {
        console.warn(
          `[Remote] Unauthorized stage-control action attempted by non-admin ${device.name} (${socket.id})`,
        );
        socket.emit("mobile-action-result", {
          ok: false,
          error:
            "Unauthorized: Admin privileges required for Stage Master Control",
        });
        if (typeof ack === "function") {
          ack({
            ok: false,
            error:
              "Unauthorized: Admin privileges required for Stage Master Control",
          });
        }
        return;
      }

      console.log(
        `[Remote Stage Control] Admin ${device.name} executed:`,
        action.command,
      );
      BrowserWindow.getAllWindows().forEach((w) => {
        if (!w.isDestroyed()) {
          w.webContents.send("mobile-action", action);
        }
      });
      if (typeof ack === "function") ack({ ok: true, command: action.command });
      socket.emit("mobile-action-result", {
        ok: true,
        command: action.command,
      });
      return;
    }

    if (action.type === "bible-get-books") {
      console.log("Fetching books for mobile...");
      db.all("SELECT * FROM books ORDER BY id", [], (err, books) => {
        if (err) {
          console.error("Error fetching books:", err);
          return;
        }

        // Get chapter counts (using KJV as standard structure)
        db.all(
          "SELECT book_id, MAX(chapter) as count FROM verses WHERE version='kjv' GROUP BY book_id",
          [],
          (err2, counts) => {
            if (err2) {
              console.error("Error fetching chapter counts:", err2);
              // Fallback: send books without explicit chapters (mobile might default to 150)
              socket.emit("mobile-data", {
                type: "bible-books",
                payload: books,
              });
              return;
            }

            const booksWithChapters = books.map((b) => {
              const c = counts.find((x) => x.book_id === b.id);
              return {
                ...b,
                chapters: c ? c.count : 50, // Default to 50 if counts match fails
              };
            });

            console.log(
              `Sending ${booksWithChapters.length} books with chapter counts to mobile`,
            );
            socket.emit("mobile-data", {
              type: "bible-books",
              payload: booksWithChapters,
            });
          },
        );
      });
      return;
    }

    if (action.type === "bible-get-chapter") {
      const { version, bookId, chapter } = action.payload;
      console.log(
        `Fetching chapter for mobile: ${version} ${bookId}:${chapter}`,
      );
      db.all(
        "SELECT text FROM verses WHERE version = ? AND book_id = ? AND chapter = ? ORDER BY verse",
        [version, bookId, chapter],
        (err, rows) => {
          if (err) {
            console.error("Error fetching chapter:", err);
            return;
          }
          console.log(`Sending ${rows.length} verses to mobile`);
          const verses = rows.map((r) => r.text);
          socket.emit("mobile-data", {
            type: "bible-chapter",
            payload: verses,
          });
        },
      );
      return;
    }

    // Forward other actions (timer, bible-present) to windows
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) {
        w.webContents.send("mobile-action", action);
      }
    });
  });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.warn(
      `[Server] Port ${PORT} is already in use by another running instance. Remote Companion server is operating on existing process.`,
    );
  } else {
    console.error("[Server] Server error:", err);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Local IP: ${serverIp}`);
  refreshPairingQr().then(() => {
    console.log(`[Pairing] code ${pairing.code} ready`);
  });
});

ipcMain.handle("get-server-info", async () => {
  // Refresh IP in case it changed
  serverIp = ip.address();
  if (!pairingQrDataUrl) await refreshPairingQr();
  return {
    ip: serverIp,
    port: PORT,
    devices: connectedDevices.map((d) => ({
      id: d.id,
      ip: d.ip,
      name: d.name,
      paired: !!d.paired,
      status: d.paired ? "connected" : "pending",
      isAdmin: adminDeviceIds.has(d.id) || adminDeviceNames.has(d.name) || !!d.isAdmin,
      isVoiceActive: !!d.isVoiceActive,
      connectedAt: d.connectedAt,
    })),
    pairingCode: pairing.code,
    pairingQrDataUrl,
  };
});

ipcMain.handle("pairing-rotate", async () => {
  await rotatePairing();
  serverIp = ip.address();
  return {
    ip: serverIp,
    port: PORT,
    pairingCode: pairing.code,
    pairingQrDataUrl,
    devices: connectedDevices.map((d) => ({
      id: d.id,
      ip: d.ip,
      name: d.name,
      paired: !!d.paired,
      status: d.paired ? "connected" : "pending",
      isAdmin: adminDeviceIds.has(d.id) || adminDeviceNames.has(d.name) || !!d.isAdmin,
      isVoiceActive: !!d.isVoiceActive,
      connectedAt: d.connectedAt,
    })),
  };
});

ipcMain.handle("mobile-device-set-admin", async (_event, { deviceId, isAdmin }) => {
  const dev = connectedDevices.find((d) => d.id === deviceId);
  if (dev) {
    dev.isAdmin = !!isAdmin;
    if (isAdmin) {
      adminDeviceIds.add(dev.id);
      if (dev.name) adminDeviceNames.add(dev.name);
    } else {
      adminDeviceIds.delete(dev.id);
      if (dev.name) adminDeviceNames.delete(dev.name);
    }
    const sock = io.sockets.sockets.get(deviceId);
    if (sock) sock.emit("device-role-updated", { isAdmin: dev.isAdmin });
    broadcastDevicesUpdated();
    return { ok: true, isAdmin: dev.isAdmin };
  }
  return { ok: false, error: "Device not found" };
});

ipcMain.handle("mobile-device-remove", async (_event, deviceId) => {
  const devIndex = connectedDevices.findIndex((d) => d.id === deviceId);
  if (devIndex !== -1) {
    const dev = connectedDevices[devIndex];
    adminDeviceIds.delete(deviceId);
    if (dev.name) adminDeviceNames.delete(dev.name);
    connectedDevices.splice(devIndex, 1);
  }
  const sock = io.sockets.sockets.get(deviceId);
  if (sock) {
    sock.emit("pair-required", { message: "Device pairing has been removed by the controller operator" });
    sock.disconnect(true);
  }
  broadcastDevicesUpdated();
  return { ok: true };
});

ipcMain.handle("mobile-device-rename", async (_event, { deviceId, name }) => {
  const dev = connectedDevices.find((d) => d.id === deviceId);
  if (dev) {
    dev.name = (name || "").trim() || dev.name;
    const sock = io.sockets.sockets.get(deviceId);
    if (sock) sock.emit("device-renamed", { name: dev.name });
    broadcastDevicesUpdated();
    return { ok: true, name: dev.name };
  }
  return { ok: false, error: "Device not found" };
});

ipcMain.handle(
  "mobile-asset-respond",
  async (_event, { transferId, accepted, targetRole, applyToCanvas }) => {
    const transfer = pendingAssetTransfers.get(transferId);
    if (!transfer) return { ok: false, error: "Transfer expired or not found" };

    pendingAssetTransfers.delete(transferId);

    if (!accepted) {
      if (typeof transfer.ack === "function") {
        transfer.ack({ ok: false, error: "Declined by operator" });
      }
      return { ok: true, action: "rejected" };
    }

    try {
      const rawData = transfer.payload.dataBase64;
      const cleanBase64 = rawData.includes("base64,")
        ? rawData.split("base64,")[1]
        : rawData;
      const buf = Buffer.from(cleanBase64, "base64");

      const originalName = path.basename(transfer.payload.name || "asset");
      let filename = originalName;
      let destPath = path.join(mediaPath, filename);

      // If destination exists, add timestamp prefix to prevent overwrite
      if (fs.existsSync(destPath)) {
        const ext = path.extname(originalName);
        const base = path.basename(originalName, ext);
        filename = `${base}_${Date.now()}${ext}`;
        destPath = path.join(mediaPath, filename);
      }

      await fsp.writeFile(destPath, buf);
      console.log(`[Remote Asset] Saved accepted file to ${destPath}`);

      const fileType = (transfer.payload.type || "").toLowerCase();
      const isAudio =
        fileType === "audio" || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(filename);
      const isPptxOrPdf =
        fileType === "presentation" || /\.(pptx|ppt|pdf)$/i.test(filename);
      const isImage =
        fileType === "image" ||
        /\.(png|jpe?g|webp|gif|svg|bmp)$/i.test(filename);
      const isVideo =
        fileType === "video" || /\.(mp4|webm|mov|mkv|avi)$/i.test(filename);

      let resultPayload = { filename, fileUrl: pathToFileURL(destPath).href };

      // Task 4.1: Audio routing into bumper system & media library
      if (isAudio) {
        const appSettings = require("./src/main/appSettings");
        if (targetRole === "intro") {
          await appSettings.save({ sessionIntroPath: destPath });
          console.log(
            `[Remote Asset] Audio set as Session Intro Bumper: ${destPath}`,
          );
        } else if (targetRole === "outro") {
          await appSettings.save({ sessionOutroPath: destPath });
          console.log(
            `[Remote Asset] Audio set as Session Outro Bumper: ${destPath}`,
          );
        }
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) {
            win.webContents.send("session-bumpers-updated", {
              intro: appSettings.get("sessionIntroPath"),
              outro: appSettings.get("sessionOutroPath"),
            });
          }
        }

        // Always broadcast to Media column on desktop so audio tracks appear in media list
        const fileUrl = pathToFileURL(destPath).href;
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) {
            win.webContents.send("media-imported", fileUrl);
            win.webContents.send("media-list-updated", {
              url: fileUrl,
              filename,
              type: "audio",
            });
          }
        }
      }

      // Task 4.2: PPTX / PDF routing into presentation pipeline
      if (isPptxOrPdf) {
        try {
          const deck = await processPptxDeck(destPath, filename);
          resultPayload.deck = deck;
          for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed()) {
              win.webContents.send("presentation-decks-updated", {
                deck,
                filename,
              });
            }
          }
        } catch (deckErr) {
          console.warn(
            "[Remote Asset] Could not process presentation deck:",
            deckErr.message,
          );
        }
      }

      // Task 4.3: Image / Video routing into media library and canvas
      if (isImage || isVideo || (!isAudio && !isPptxOrPdf)) {
        const fileUrl = pathToFileURL(destPath).href;
        // Broadcast updated media list to all windows
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) {
            win.webContents.send("media-imported", fileUrl);
            win.webContents.send("media-list-updated", { url: fileUrl });
          }
        }

        if (applyToCanvas) {
          for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed()) {
              win.webContents.send("canvas-set-background", {
                url: fileUrl,
                type: isVideo ? "video" : "image",
                crop: { x: 0, y: 0 },
              });
            }
          }
        }
      }

      if (typeof transfer.ack === "function") {
        transfer.ack({
          ok: true,
          message: "Asset accepted and saved",
          role: targetRole || "media",
        });
      }

      return { ok: true, action: "accepted", ...resultPayload };
    } catch (err) {
      console.error("[Remote Asset] Error processing accepted asset:", err);
      if (typeof transfer.ack === "function") {
        transfer.ack({ ok: false, error: err.message });
      }
      return { ok: false, error: err.message };
    }
  },
);

ipcMain.on("mobile-disconnect-device", (event, deviceId) => {
  const sock = io.sockets.sockets.get(deviceId);
  if (sock) sock.disconnect(true);
});

ipcMain.on("bible-sync", (event, state) => {
  // Broadcast only to paired mobile clients
  for (const [id, sock] of io.sockets.sockets) {
    if (isPaired(id)) {
      sock.emit("mobile-data", { type: "bible-sync", payload: state });
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
  speakerWindow = new BrowserWindow({
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
      backgroundThrottling: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // 2. General Window (Projector) - Shows Bible ONLY
  generalWindow = new BrowserWindow({
    width: tertiaryDisplay
      ? tertiaryDisplay.bounds.width
      : secondaryDisplay
        ? secondaryDisplay.bounds.width
        : 800,
    height: tertiaryDisplay
      ? tertiaryDisplay.bounds.height
      : secondaryDisplay
        ? secondaryDisplay.bounds.height
        : 600,
    x: tertiaryDisplay
      ? tertiaryDisplay.bounds.x
      : secondaryDisplay
        ? secondaryDisplay.bounds.x + 50
        : 100,
    y: tertiaryDisplay
      ? tertiaryDisplay.bounds.y
      : secondaryDisplay
        ? secondaryDisplay.bounds.y + 50
        : 100,
    title: "OCS General View",
    backgroundColor: "black",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // 3. Controller Window
  controllerWindow = new BrowserWindow({
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
      backgroundThrottling: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Dev / Debug Listeners
  speakerWindow.webContents.on(
    "console-message",
    (e, level, msg, line, src) => {
      console.log(`[SpeakerView JS (L${line})]`, msg);
    },
  );
  speakerWindow.webContents.on("did-fail-load", (e, code, desc) => {
    console.error("[SpeakerView did-fail-load]", code, desc);
  });
  generalWindow.webContents.on(
    "console-message",
    (e, level, msg, line, src) => {
      console.log(`[GeneralView JS (L${line})]`, msg);
    },
  );
  generalWindow.webContents.on("did-fail-load", (e, code, desc) => {
    console.error("[GeneralView did-fail-load]", code, desc);
  });

  // Load Content with Modes
  speakerWindow.loadFile("view.html", { search: "mode=speaker" });
  generalWindow.loadFile("view.html", { search: "mode=general" });
  controllerWindow.loadFile("controller.html");

  // Initialize NDI and Broadcast Video Engine (FR-4.42: always default off on launch/login; manual user start required)
  ndiEngine.init({
    programWindow: generalWindow,
    stageWindow: speakerWindow,
    io,
    port: PORT,
    enabled: false,
  });

  ndiEngine.on("stats", (status) => {
    if (controllerWindow && !controllerWindow.isDestroyed()) {
      controllerWindow.webContents.send("ndi-status-update", status);
    }
  });

  // Master Unthrottled Auth & Guest Session State Broadcaster
  authService.on("auth-changed", (status) => {
    broadcastAuthStatus();
  });

  // Fast UI pulse for sub-second guest counters
  setInterval(() => {
    if (controllerWindow && !controllerWindow.isDestroyed()) {
      controllerWindow.webContents.send("auth:status", authService.getAuthStatus());
    }
  }, 3000);

  // Periodic Silent Reload of Days Left (Offline Wall-Clock + Background Sync)
  setInterval(() => {
    authService.silentCheckDaysLeft().catch(() => {});
  }, 60000);

  ipcMain.handle("auth:silent-reload", async () => {
    return await authService.silentCheckDaysLeft();
  });

  ipcMain.handle("auth:check-status", async () => {
    return await authService.silentCheckDaysLeft();
  });

  // IPC Handlers
  ipcMain.on("activate_set_timer", (event, value) => {
    latestOverlayTimer = value;
    if (io) io.emit("overlay-timer", value);
    // Timer -> Speaker View (Always)
    if (!speakerWindow.isDestroyed())
      speakerWindow.webContents.send("set-timer", value);
    // Timer -> General View (Always - view.js now checks 'mode' and 'isEventMode' to decide whether to show it)
    if (!generalWindow.isDestroyed())
      generalWindow.webContents.send("set-timer", value);
    if (!controllerWindow.isDestroyed())
      controllerWindow.webContents.send("set-timer", value);
    const t =
      typeof value === "object" && value != null
        ? Number(value.time)
        : Number(value);
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
    if (io) io.emit("overlay-canvas", currentCanvasState);
    const speakerAllowed =
      allowedTargets === null ||
      allowedTargets.includes("speaker") ||
      allowedTargets.includes("all");
    const generalAllowed =
      allowedTargets === null ||
      allowedTargets.includes("general") ||
      allowedTargets.includes("all");

    if (speakerWindow && !speakerWindow.isDestroyed()) {
      const speakerState = speakerAllowed
        ? currentCanvasState
        : { ...currentCanvasState, contentSlot: { type: "none", data: null } };
      speakerWindow.webContents.send("canvas-state-update", speakerState);
    }
    if (generalWindow && !generalWindow.isDestroyed()) {
      const generalState = generalAllowed
        ? currentCanvasState
        : { ...currentCanvasState, contentSlot: { type: "none", data: null } };
      generalWindow.webContents.send("canvas-state-update", generalState);
    }
    if (controllerWindow && !controllerWindow.isDestroyed()) {
      controllerWindow.webContents.send(
        "canvas-state-update",
        currentCanvasState,
      );
    }

    // FR-4.15: lightweight summary to Mobile Companion
    const summary = {
      activeContentSlotType: currentCanvasState.contentSlot?.type || "none",
      hasContent:
        currentCanvasState.contentSlot?.type !== "none" &&
        currentCanvasState.contentSlot?.data != null,
      pinnedLayerCount: Array.isArray(currentCanvasState.pinnedLayers)
        ? currentCanvasState.pinnedLayers.length
        : 0,
      isBlackout: !!currentCanvasState.chrome?.blackout,
    };
    if (io) {
      for (const [id, sock] of io.sockets.sockets) {
        if (isPaired(id)) {
          sock.emit("mobile-data", {
            type: "canvas-summary",
            payload: summary,
          });
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
    latestOverlayContent = value;
    if (io) io.emit("overlay-content", value);

    const summary =
      value == null
        ? "null (black)"
        : `${value.type || "?"} ${value.data && value.data.title ? value.data.title : ""}`.trim();

    // FR-4.9 / Task-1 fix: if value carries a `target` array (Presentation path), respect it.
    // When target is absent (Bible path), broadcast to all output windows (FR-1.3).
    const allowedTargets = Array.isArray(value?.target) ? value.target : null;
    const speakerOk =
      speakerWindow &&
      !speakerWindow.isDestroyed() &&
      (allowedTargets === null || allowedTargets.includes("speaker"));
    const generalOk =
      generalWindow &&
      !generalWindow.isDestroyed() &&
      (allowedTargets === null || allowedTargets.includes("general"));
    const controllerOk = controllerWindow && !controllerWindow.isDestroyed();

    console.log(
      "[IPC] activate_set_content",
      summary,
      "→ speaker:",
      speakerOk,
      "general:",
      generalOk,
      "target:",
      allowedTargets ?? "all",
    );

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
    if (
      sessionArchive &&
      value &&
      (value.type === "bible" || value.type === "scripture")
    ) {
      const d = value.data || {};
      const book = d.book || d.bookName || d.title;
      const chapter = d.chapter;
      const verse = d.verse ?? d.startVerse;
      if (book && chapter != null) {
        const ref =
          verse != null ? `${book} ${chapter}:${verse}` : `${book} ${chapter}`;
        sessionArchive.recordScriptureRef(ref);
      }
    }
  });

  ipcMain.on("activate_set_style", async (event, value) => {
    latestOverlayStyle = { ...(latestOverlayStyle || {}), ...(value || {}) };
    if (io) io.emit("overlay-style", latestOverlayStyle);

    try {
      await appSettings.save({ styles: latestOverlayStyle });
    } catch (_) {}

    // FR-4.9 fix: respect target array just like activate_set_content
    const allowedTargets = Array.isArray(value?.target) ? value.target : null;
    if (
      !speakerWindow.isDestroyed() &&
      (allowedTargets === null || allowedTargets.includes("speaker"))
    )
      speakerWindow.webContents.send("set-style", latestOverlayStyle);
    if (
      !generalWindow.isDestroyed() &&
      (allowedTargets === null || allowedTargets.includes("general"))
    )
      generalWindow.webContents.send("set-style", latestOverlayStyle);
    if (!controllerWindow.isDestroyed())
      controllerWindow.webContents.send("set-style", latestOverlayStyle);
  });

  ipcMain.handle("presentation-get-style", () => {
    if (!latestOverlayStyle) {
      const s = appSettings.loadSync();
      latestOverlayStyle = s?.styles ? { ...s.styles } : {};
    }
    return latestOverlayStyle;
  });

  // ── Scene IPC (FR-4.28–FR-4.31) ────────────────────────────────────────────
  ipcMain.handle("scene-list", () => scenesStore);
  ipcMain.handle("scene-save", (event, scene) => {
    const idx = scenesStore.findIndex((s) => s.id === scene.id);
    if (idx >= 0) scenesStore[idx] = scene;
    else scenesStore.push(scene);
    saveScenes();
    return scene;
  });
  ipcMain.handle("scene-delete", (event, sceneId) => {
    scenesStore = scenesStore.filter((s) => s.id !== sceneId);
    saveScenes();
    return true;
  });

  // ── Scene Read-Along Auto-Advance IPC (FR-5.36–FR-5.39) ────────────────────
  ipcMain.on(
    "scene-read-along-start",
    (event, { scene, pageIndex, sequenceIndex }) => {
      console.log(
        "[Scene] Read-Along start:",
        scene?.name,
        "page:",
        pageIndex,
        "seq:",
        sequenceIndex,
      );
      sceneAutoAdvance.startScene(scene, pageIndex, sequenceIndex);
      if (scene?.sceneType === "song" || scene?.navMode === "read_along") {
        const allLyrics = (scene?.pages || [])
          .map((p) => p.content)
          .filter(Boolean)
          .join(". ");
        const tokens = (scene?.pages || []).flatMap((p) =>
          p.content ? p.content.toLowerCase().split(/\s+/) : [],
        );
        asrEngine.setSongContext({ isSong: true, lyrics: allLyrics, tokens });
        broadcastAsrEvent("scene-song-active", {
          isSong: true,
          sceneId: scene?.id,
          sceneName: scene?.name,
        });
      } else {
        asrEngine.clearSongContext();
        broadcastAsrEvent("scene-song-active", { isSong: false });
      }
    },
  );
  ipcMain.on("scene-read-along-set-page", (event, pageIndex, sequenceIndex) => {
    sceneAutoAdvance.setPage(pageIndex, sequenceIndex);
  });
  ipcMain.on("scene-read-along-stop", () => {
    console.log("[Scene] Read-Along stop");
    sceneAutoAdvance.stop();
    asrEngine.clearSongContext();
    broadcastAsrEvent("scene-song-active", { isSong: false });
  });
  ipcMain.on("scene-read-along-manual-advance", () => {
    sceneAutoAdvance.manualAdvance();
  });
  ipcMain.on("scene-read-along-manual-prev", () => {
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
  controllerWindow.on("closed", () => {
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

ipcMain.handle(
  "bible-get-chapter",
  async (event, { version, bookId, chapter }) => {
    return new Promise((resolve, reject) => {
      db.all(
        "SELECT text FROM verses WHERE version = ? AND book_id = ? AND chapter = ? ORDER BY verse",
        [version, bookId, chapter],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map((r) => r.text));
        },
      );
    });
  },
);

// ── Bible Full-Text Search (Pass 3 of Smart Bible Matcher) ───────────────────
// Searches verse text for keywords, returns top N matches with book/chapter/verse.
ipcMain.handle(
  "bible-search-verses",
  async (event, { query, version, limit }) => {
    const v = version || "kjv";
    const n = Math.min(limit || 5, 20);
    // Build a LIKE pattern for each word (up to 4 keywords)
    const words = query
      .trim()
      .split(/\s+/)
      .filter((w) => w.length >= 3)
      .slice(0, 4);
    if (words.length === 0) return [];

    // Build SQL: all keywords must appear (AND logic via chained LIKE)
    const conditions = words.map(() => "text LIKE ?").join(" AND ");
    const params = words.map((w) => `%${w}%`);

    return new Promise((resolve, reject) => {
      db.all(
        `SELECT book_id, chapter, verse, text FROM verses WHERE version = ? AND ${conditions} ORDER BY book_id, chapter, verse LIMIT ?`,
        [v, ...params, n],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        },
      );
    });
  },
);

// ── ASR IPC (whisper default / vosk fallback) — vosk-* kept as aliases ────────
ipcMain.handle("vosk-status", async () => asrEngine.getState());
ipcMain.handle("asr-status", async () => asrEngine.getState());

ipcMain.handle("vosk-init", async () => asrEngine.initialize());
ipcMain.handle("asr-init", async (_e, opts) =>
  asrEngine.initialize(opts?.engine),
);

ipcMain.handle("vosk-start", async () => {
  const state = await asrEngine.initialize();
  if (state.status === "error") return state;
  try {
    return asrEngine.startSession();
  } catch (err) {
    return { ...asrEngine.getState(), status: "error", error: err.message };
  }
});
ipcMain.handle("asr-start", async () => {
  const state = await asrEngine.initialize();
  if (state.status === "error") return state;
  try {
    return asrEngine.startSession();
  } catch (err) {
    return { ...asrEngine.getState(), status: "error", error: err.message };
  }
});

ipcMain.handle("vosk-stop", async () => asrEngine.stopSession());
ipcMain.handle("asr-stop", async () => asrEngine.stopSession());

ipcMain.on("vosk-audio", (_event, pcm) => {
  asrEngine.pushAudio(pcm);
});
ipcMain.on("asr-audio", (_event, pcm) => {
  asrEngine.pushAudio(pcm);
});

let _asrAudioPackets = 0;
asrEngine.on("transcript", (payload) => {
  if (payload && payload.text) {
    console.log(
      `[Asr:${payload.asrEngine || asrEngine.engineName || "?"}]`,
      payload.role || (payload.isFinal ? "final" : "partial"),
      JSON.stringify(payload.text),
      "conf=",
      payload.confidence,
      payload.ignored ? "(ignored)" : "",
    );
  }
});
const _origPush = asrEngine.pushAudio.bind(asrEngine);
asrEngine.pushAudio = (pcm) => {
  if (_asrAudioPackets < 3) {
    const len = pcm ? pcm.byteLength || pcm.length || 0 : 0;
    console.log(
      `[Asr] audio packet #${_asrAudioPackets + 1} bytes=${len} session=${asrEngine.getState().sessionActive}`,
    );
    _asrAudioPackets += 1;
  }
  return _origPush(pcm);
};

ipcMain.handle("vosk-set-confidence", async (_e, value) => {
  asrEngine.setConfidenceThreshold(value);
  return asrEngine.getState();
});
ipcMain.handle("asr-set-confidence", async (_e, value) => {
  asrEngine.setConfidenceThreshold(value);
  return asrEngine.getState();
});
ipcMain.handle("asr-transcribe-secondary", async (_e, pcm) => {
  return asrEngine.transcribeSecondary(pcm);
});

// ── Session Archive / Timer lifecycle (FR-5.9–5.28) ───────────────────────────
function broadcastSessionStatus(status) {
  try {
    sleepPrevention.reconcile({ sessionRecording: !!status?.recording });
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed())
        win.webContents.send("session-archive-status", status);
    }
  } catch (_) {}
}

function broadcastSessionProgress(progress) {
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed())
        win.webContents.send("session-archive-progress", progress);
    }
  } catch (_) {}
}

ipcMain.on("timer-lifecycle", (_e, event) => {
  emitTimerLifecycle(event || {});
});

ipcMain.handle("session-list", async () => {
  if (!sessionArchive) return [];
  return sessionArchive.listSessions();
});

ipcMain.handle("session-get", async (_e, id) => {
  if (!sessionArchive) throw new Error("Session archive not ready");
  return sessionArchive.getSession(id);
});

ipcMain.handle("session-update", async (_e, { id, patch }) => {
  if (!sessionArchive) throw new Error("Session archive not ready");
  return sessionArchive.updateSession(id, patch || {});
});

ipcMain.handle("session-delete", async (_e, id) => {
  if (!sessionArchive) throw new Error("Session archive not ready");
  return sessionArchive.deleteSession(id);
});

ipcMain.handle("session-delete-many", async (_e, ids) => {
  if (!sessionArchive) throw new Error("Session archive not ready");
  if (Array.isArray(ids)) {
    for (const id of ids) {
      await sessionArchive.deleteSession(id);
    }
  }
  return { ok: true };
});

ipcMain.handle("session-update-transcript", async (_e, { id, text }) => {
  if (!sessionArchive) throw new Error("Session archive not ready");
  return sessionArchive.updateTranscript(id, text);
});

ipcMain.handle("session-open-file", async (_e, { id, filename }) => {
  if (!sessionArchive) return { ok: false };
  const s = await sessionArchive.getSession(id);
  const { shell } = require("electron");
  const target = filename ? path.join(s.paths.dir, filename) : s.paths.dir;
  await shell.openPath(target);
  return { ok: true, path: target };
});

ipcMain.handle("session-retry-pdf", async (_e, id) => {
  if (!sessionArchive) throw new Error("Session archive not ready");
  return sessionArchive.retryPdf(id);
});

ipcMain.handle("session-status", async () => {
  return sessionArchive ? sessionArchive.getStatus() : { recording: false };
});

ipcMain.on("session-transcript-line", (_e, line) => {
  if (sessionArchive) sessionArchive.appendTranscriptLine(line || {});
});

ipcMain.on("session-audio-chunk", (_e, chunk) => {
  if (sessionArchive) sessionArchive.pushAudioChunk(chunk);
});

ipcMain.on("session-audio-mime", (_e, mime) => {
  if (sessionArchive) sessionArchive.setAudioMime(mime);
});

ipcMain.handle("session-show-in-folder", async (_e, id) => {
  if (!sessionArchive) return { ok: false };
  const s = await sessionArchive.getSession(id);
  const { shell } = require("electron");
  const candidates = [
    s.paths.audio,
    s.paths.video,
    s.paths.pdf,
    s.paths.dir,
  ].filter(Boolean);
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

// ── Bumper Media Handlers (Intro / Outro auto-merge) ──────────────────────────
const bumpersPath = path.join(app.getPath("userData"), "bumpers");
if (!fs.existsSync(bumpersPath)) {
  fs.mkdirSync(bumpersPath, { recursive: true });
}

ipcMain.handle("bumper-get", async () => {
  const introPath = appSettings.get("sessionIntroPath");
  const outroPath = appSettings.get("sessionOutroPath");
  const autoMerge = appSettings.get("sessionAutoMergeBumpers") !== false;

  const getBumperMeta = async (filePath, type) => {
    if (!filePath) return null;
    try {
      await fsp.access(filePath);
      const st = await fsp.stat(filePath);
      const info = probeMediaInfo(filePath);
      return {
        type,
        path: filePath,
        name: path.basename(filePath),
        sizeBytes: st.size,
        durationSec: info.duration || 0,
        hasVideo: info.hasVideo,
        hasAudio: info.hasAudio,
        url: `file://${filePath}`,
      };
    } catch (_) {
      return null;
    }
  };

  return {
    intro: await getBumperMeta(introPath, "intro"),
    outro: await getBumperMeta(outroPath, "outro"),
    autoMerge,
  };
});

ipcMain.handle("bumper-upload", async (event, { type }) => {
  if (type !== "intro" && type !== "outro")
    throw new Error("Invalid bumper type");
  const window = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    properties: ["openFile"],
    title: `Select ${type === "intro" ? "Intro" : "Outro"} Recording Bumper`,
    filters: [
      {
        name: "Video / Audio Bumper",
        extensions: ["mp4", "mov", "webm", "mp3", "wav", "m4a", "aac", "ogg"],
      },
      { name: "Video Files", extensions: ["mp4", "mov", "webm", "avi", "mkv"] },
      { name: "Audio Files", extensions: ["mp3", "wav", "m4a", "aac", "ogg"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (canceled || !filePaths || filePaths.length === 0) return null;

  const sourcePath = filePaths[0];
  const ext = path.extname(sourcePath) || ".mp4";
  const cleanName = `${type}_${Date.now()}${ext}`;
  const destPath = path.join(bumpersPath, cleanName);

  // Remove old bumper file if present
  const oldPath =
    type === "intro"
      ? appSettings.get("sessionIntroPath")
      : appSettings.get("sessionOutroPath");
  if (oldPath && oldPath !== sourcePath) {
    await fsp.unlink(oldPath).catch(() => {});
  }

  await fsp.copyFile(sourcePath, destPath);
  const patch =
    type === "intro"
      ? { sessionIntroPath: destPath }
      : { sessionOutroPath: destPath };
  await appSettings.save(patch);

  const st = await fsp.stat(destPath);
  const info = probeMediaInfo(destPath);
  return {
    type,
    path: destPath,
    name: path.basename(sourcePath),
    sizeBytes: st.size,
    durationSec: info.duration || 0,
    hasVideo: info.hasVideo,
    hasAudio: info.hasAudio,
    url: `file://${destPath}`,
  };
});

ipcMain.handle("bumper-remove", async (_e, { type }) => {
  if (type !== "intro" && type !== "outro")
    throw new Error("Invalid bumper type");
  const curPath =
    type === "intro"
      ? appSettings.get("sessionIntroPath")
      : appSettings.get("sessionOutroPath");
  if (curPath) {
    await fsp.unlink(curPath).catch(() => {});
  }
  const patch =
    type === "intro" ? { sessionIntroPath: null } : { sessionOutroPath: null };
  await appSettings.save(patch);
  return { ok: true };
});

ipcMain.handle("bumper-set-auto-merge", async (_e, enabled) => {
  await appSettings.save({ sessionAutoMergeBumpers: !!enabled });
  return { ok: true, autoMerge: !!enabled };
});

ipcMain.handle("session-audio-url", async (_e, id) => {
  if (!sessionArchive) return null;
  const s = await sessionArchive.getSession(id);
  const mediaPath = s.paths.audio || s.paths.video;
  try {
    await fsp.access(mediaPath);
    const st = await fsp.stat(mediaPath);
    if (!st.size) return null;
    const { pathToFileURL } = require("url");
    return pathToFileURL(mediaPath).href;
  } catch (_) {
    return null;
  }
});

// ── Sleep prevention (FR-13) ───────────────────────────────────────────────────
ipcMain.handle("sleep-get-status", () => sleepPrevention.getStatus());
ipcMain.handle("sleep-set-mode", async (_e, mode) =>
  sleepPrevention.setMode(mode),
);
ipcMain.handle("sleep-probe", () => sleepPrevention.probe());
ipcMain.handle("settings-get", async () => appSettings.load());
ipcMain.handle("settings-set", async (_e, patch) => {
  const saved = await appSettings.save(patch || {});
  if (patch && patch.styles) {
    latestOverlayStyle = { ...(latestOverlayStyle || {}), ...patch.styles };
    if (io) io.emit("overlay-style", latestOverlayStyle);
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send("set-style", latestOverlayStyle);
    }
  }
  // Broadcast settings-updated to all windows
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("settings-updated", saved);
  }
  // Keep ASR language gate in sync with Settings (primary + secondary share policy)
  if (
    patch &&
    (Object.prototype.hasOwnProperty.call(patch, "transcriptionLanguage") ||
      Object.prototype.hasOwnProperty.call(patch, "languageGateEnabled"))
  ) {
    asrEngine.setLanguagePolicy({
      enabled: saved.languageGateEnabled !== false,
      languages: [saved.transcriptionLanguage || "en"],
    });
  }
  return saved;
});
ipcMain.handle("settings-reset-defaults", async () => {
  const reset = await appSettings.resetDefaults();
  latestOverlayStyle = { ...reset.styles };
  if (io) io.emit("overlay-style", latestOverlayStyle);
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("set-style", latestOverlayStyle);
      win.webContents.send("settings-updated", reset);
    }
  }
  return reset;
});
ipcMain.handle("settings:get-login-item", () => {
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch (_) {
    return false;
  }
});
ipcMain.handle("settings:set-login-item", async (_event, enabled) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      openAsHidden: false,
    });
    await appSettings.save({ startAtLogin: !!enabled });
    return { ok: true, openAtLogin: !!enabled };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── NDI & Broadcast Streaming Handlers ─────────────────────────────────────────
ipcMain.handle("ndi:get-status", () => ndiEngine.getStatus());
ipcMain.handle("ndi:set-config", async (_event, config) => {
  if (config && config.enabled !== undefined) {
    try {
      await appSettings.save({ ndiStreamEnabled: !!config.enabled });
    } catch (_) {}
  }
  const updated = ndiEngine.setConfig(config);
  if (config.enabled && !ndiEngine.isRunning) {
    ndiEngine.start();
  } else if (config.enabled === false && ndiEngine.isRunning) {
    ndiEngine.stop();
  }
  return ndiEngine.getStatus();
});
ipcMain.handle(
  "ndi:discover-sources",
  async () => await ndiEngine.discoverSources(),
);
ipcMain.handle("ndi:restart-stream", () => {
  ndiEngine.stop();
  ndiEngine.start();
  return ndiEngine.getStatus();
});

// Legacy alias used by older debug UI
ipcMain.handle("voice-sidecar-status", async () => {
  const s = asrEngine.getState();
  return {
    running: s.status === "ready" || s.status === "listening",
    port: null,
    backend: s.asrEngine === "whisper" ? "whisper-cpp" : "native-koffi",
    ...s,
  };
});

// ── AI: Ollama + Piper (direct from main — no Python) ─────────────────────────
ipcMain.handle("ai-status", async () => {
  const asr = asrEngine.getState();
  const ollama = await ollamaStatus();
  return {
    ok: asr.status === "ready" || asr.status === "listening",
    asrEngine: asr.asrEngine,
    vosk: asr.model ? asr.model.name : null,
    voskStatus: asr.status,
    piper: piperAvailable(__dirname),
    ollama,
  };
});

ipcMain.handle("ai-chat", async (_event, { prompt, system, model }) => {
  try {
    return await ollamaChat({ prompt, system, model });
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── Authentication & Licensing Handlers (FR-13.1–FR-13.8) ────────────────────
ipcMain.handle("auth:get-status", () => authService.getAuthStatus());
ipcMain.handle("auth:open-browser-login", async () => {
  const loginInfo = authService.getLoginUrl();
  await shell.openExternal(loginInfo.url);
  return { ok: true, state: loginInfo.state, url: loginInfo.url };
});
ipcMain.handle("auth:simulate-callback", async (_event, customUrl) => {
  const pendingState =
    authService.pendingAuthState?.state || authService.generateAuthState();
  const mockUrl =
    customUrl ||
    `ocs://auth-callback?token=demo_token_${Date.now()}&state=${pendingState}&email=pastor@ocstest.org&org=OCS%20Community%20test&tier=enterprise`;
  handleAuthDeepLink(mockUrl);
  return { ok: true, url: mockUrl };
});
ipcMain.handle("auth:logout", async () => {
  await authService.logout();
  if (controllerWindow && !controllerWindow.isDestroyed()) {
    controllerWindow.close();
    controllerWindow = null;
  }
  if (speakerWindow && !speakerWindow.isDestroyed()) {
    speakerWindow.close();
    speakerWindow = null;
  }
  if (generalWindow && !generalWindow.isDestroyed()) {
    generalWindow.close();
    generalWindow = null;
  }
  showLoginWindow();
  broadcastAuthStatus();
  return { ok: true };
});
// ─────────────────────────────────────────────────────────────────────────────


// Clipboard IPC Handlers
ipcMain.handle("clipboard:write-text", (_event, text) => {
  try {
    const { clipboard } = require("electron");
    if (text != null) clipboard.writeText(String(text));
    return true;
  } catch (err) {
    console.error("Clipboard write IPC error:", err);
    return false;
  }
});
ipcMain.handle("clipboard:read-text", () => {
  try {
    const { clipboard } = require("electron");
    return clipboard.readText();
  } catch (_) {
    return "";
  }
});

app.whenReady().then(async () => {
  // Show splash window immediately on startup (FR-13.2)
  showSplashWindow();

  // GRANT MICROPHONE ACCESS AUTOMATICALLY
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      if (permission === "media") {
        callback(true);
      } else {
        callback(false);
      }
    },
  );

  const template = require("./menu.js").createTemplate(app);
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  appSettings.init(app.getPath("userData"));
  await appSettings.load();
  const settings = appSettings.loadSync();
  latestOverlayStyle = settings?.styles ? { ...settings.styles } : null;

  // Initialize AuthService (FR-13.4, FR-13.5) with safety assertions
  authService.init(app.getPath("userData"), {
    gracePeriodHours: settings?.authGracePeriodHours || 72,
    defaultAuthHost: settings?.authLoginUrl,
  });

  // Session archive (FR-5.10+)
  sessionArchive = new SessionArchiveService(app.getPath("userData"));
  await sessionArchive.init();
  sessionArchive.on("status", broadcastSessionStatus);
  sessionArchive.on("progress", broadcastSessionProgress);
  sessionArchive.on("session-updated", (meta) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send("session-updated", meta);
    }
  });
  sessionArchive.on("session-finalized", (meta) => {
    broadcastSessionStatus(sessionArchive.getStatus());
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send("session-finalized", meta);
    }
  });

  sleepPrevention.init();
  const sleepProbe = sleepPrevention.probe();
  if (!sleepProbe.ok) {
    console.warn("[SleepPrevention]", sleepProbe.message);
  }

  // Load ASR in-process (whisper default, vosk fallback)
  asrEngine
    .initialize()
    .then(() => {
      const s = appSettings.loadSync();
      asrEngine.setLanguagePolicy({
        enabled: s.languageGateEnabled !== false,
        languages: [s.transcriptionLanguage || "en"],
      });
    })
    .catch((err) => {
      console.error("[Asr] init error:", err.message);
    });

  // Minimum splash display duration for smooth branding transition (FR-13.2)
  await new Promise((r) => setTimeout(r, 1200));

  const authCheck = authService.checkSession();
  console.log(
    "[Auth] Session check on launch:",
    authCheck.valid ? authCheck.state : authCheck.reason,
    authCheck.session?.email || "(no cached session)",
  );

  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }

  // Launch controller window directly after splash screen
  createWindows();
  if (authCheck.valid) {
    authService.validateTokenOnline().catch(() => {});
    authService.registerDeviceOnline().catch(() => {});
    setTimeout(() => broadcastAuthStatus(), 500);
  }
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
