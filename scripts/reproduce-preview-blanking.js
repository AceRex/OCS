/**
 * Diagnostic Reproduction Script:
 * Accurately traces General Preview, Speaker Preview, physical General View,
 * and physical Speaker View in the real built Electron runtime.
 */

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

console.log("================================================================================");
console.log("🔍 REPRODUCING GENERAL & SPEAKER PREVIEW REGRESSIONS IN ELECTRON RUNTIME");
console.log("================================================================================\n");

app.whenReady().then(async () => {
  let latestOverlayContent = null;
  let latestOverlayStyle = {
    backgroundColor: '#0B0814',
    textColor: '#F5F2FA',
    accentColor: '#A788FA',
    fontFamily: 'Outfit',
    fontSize: '5rem',
    textAlign: 'center',
    textShadow: true,
    backgroundImage: null,
    backgroundVideo: null,
    bibleRefPosition: 'top-left',
    bibleBodyPosition: 'center',
    bibleTranslation: 'KJV',
    bibleServiceLabel: '',
    bibleShowOrbs: true,
  };

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

  // Create Controller Window
  const controllerWin = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.resolve(__dirname, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Create Physical General Display Window
  const generalWin = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    webPreferences: {
      preload: path.resolve(__dirname, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Create Physical Speaker Display Window
  const speakerWin = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    webPreferences: {
      preload: path.resolve(__dirname, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  function safeSend(win, channel, ...args) {
    if (win && !win.isDestroyed() && win.webContents) {
      win.webContents.send(channel, ...args);
    }
  }

  function broadcastCanvasState(state, allowedTargets = null) {
    if (state) currentCanvasState = state;
    const speakerAllowed = allowedTargets === null || allowedTargets.includes("speaker") || allowedTargets.includes("all");
    const generalAllowed = allowedTargets === null || allowedTargets.includes("general") || allowedTargets.includes("all");

    if (speakerWin) {
      safeSend(speakerWin, "canvas-state-update", speakerAllowed ? currentCanvasState : { ...currentCanvasState, contentSlot: { type: "none", data: null } });
    }
    if (generalWin) {
      safeSend(generalWin, "canvas-state-update", generalAllowed ? currentCanvasState : { ...currentCanvasState, contentSlot: { type: "none", data: null } });
    }
    safeSend(controllerWin, "canvas-state-update", currentCanvasState);
  }

  // Register standard IPC stubs
  ipcMain.on("activate_set_content", (_e, val) => {
    latestOverlayContent = val;
    const targets = Array.isArray(val?.target) ? val.target : null;
    const spkOk = targets === null || targets.includes("speaker");
    const genOk = targets === null || targets.includes("general");

    currentCanvasState.contentSlot = {
      type: val?.type || "none",
      data: val?.data || val,
    };
    broadcastCanvasState(currentCanvasState, targets);

    if (spkOk) safeSend(speakerWin, "set-content", val);
    if (genOk) safeSend(generalWin, "set-content", val);
    safeSend(controllerWin, "set-content", val);
  });

  ipcMain.on("activate_set_style", (_e, val) => {
    if (!val) return;
    latestOverlayStyle = { ...latestOverlayStyle, ...val };
    const targets = Array.isArray(val?.target) ? val.target : null;
    const spkOk = targets === null || targets.includes("speaker");
    const genOk = targets === null || targets.includes("general");

    if (spkOk) safeSend(speakerWin, "set-style", latestOverlayStyle);
    if (genOk) safeSend(generalWin, "set-style", latestOverlayStyle);
    safeSend(controllerWin, "set-style", latestOverlayStyle);
  });

  ipcMain.handle("presentation-get-style", () => latestOverlayStyle);
  ipcMain.handle("settings-get", () => ({}));
  ipcMain.handle("auth:get-status", () => ({ authenticated: true, plan: "enterprise" }));
  ipcMain.handle("session:get-recovery-state", () => null);
  ipcMain.handle("media-list", () => []);
  ipcMain.handle("presentation-list", () => []);
  ipcMain.handle("scene-list", () => []);
  ipcMain.handle("bible-get-books", () => []);
  ipcMain.handle("get-paired-devices", () => []);
  ipcMain.handle("updater:get-status", () => ({}));
  ipcMain.handle("switcher:get-state-desktop", () => ({ activeVideoSource: "cam1" }));
  ipcMain.handle("switcher:get-broadcast-config-desktop", () => ({ layers: [], activeStudioControls: [] }));
  ipcMain.handle("recorder:status", () => ({ isRecording: false }));
  ipcMain.handle("sleep-probe", () => true);

  const errors = [];
  const hookConsole = (name, win) => {
    win.webContents.on("console-message", (_e, level, msg, line, src) => {
      if (level >= 2 || msg.includes("Error") || msg.includes("Exception")) {
        errors.push(`[${name} Error] ${msg} (${src}:${line})`);
        console.error(`  >>> [${name} ERROR]: ${msg}`);
      }
    });
  };

  hookConsole("Controller", controllerWin);
  hookConsole("GeneralWin", generalWin);
  hookConsole("SpeakerWin", speakerWin);

  console.log("Loading Windows...");
  await Promise.all([
    controllerWin.loadFile(path.resolve(__dirname, "../controller.html")),
    generalWin.loadFile(path.resolve(__dirname, "../view.html"), { search: "mode=general" }),
    speakerWin.loadFile(path.resolve(__dirname, "../view.html"), { search: "mode=speaker" }),
  ]);

  // Give React 2 seconds to mount
  await new Promise((r) => setTimeout(r, 2000));
  console.log("Windows loaded.\n");

  const scratchDir = path.resolve(__dirname, "../scratch/preview-diagnosis");
  if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

  // Helper to inspect DOM inside a window
  async function inspectWindow(win, winName) {
    return await win.webContents.executeJavaScript(`(() => {
      const miniPreviews = Array.from(document.querySelectorAll('[data-preview-mode], [class*="MiniPreview"], .absolute.inset-0'));
      const textNodes = document.body.innerText.trim();
      const canvases = Array.from(document.querySelectorAll('canvas')).map(c => ({
        width: c.width,
        height: c.height,
        clientW: c.clientWidth,
        clientH: c.clientHeight,
        hasContext: !!c.getContext('2d')
      }));
      const images = Array.from(document.querySelectorAll('img')).map(img => ({
        src: img.src?.slice(0, 60),
        naturalW: img.naturalWidth,
        naturalH: img.naturalHeight,
        clientW: img.clientWidth,
        clientH: img.clientHeight,
        alt: img.alt
      }));
      const videos = Array.from(document.querySelectorAll('video')).map(v => ({
        src: v.src?.slice(0, 60),
        paused: v.paused,
        clientW: v.clientWidth,
        clientH: v.clientHeight
      }));

      // Find the two preview cards in BroadcastEngine
      const previewCards = Array.from(document.querySelectorAll('.grid.grid-cols-2 > div')).map(div => {
        const title = div.querySelector('span')?.innerText;
        const rect = div.getBoundingClientRect();
        const innerContainer = div.querySelector('.absolute.inset-0');
        const innerRect = innerContainer?.getBoundingClientRect();
        return {
          title,
          outerRect: { w: rect.width, h: rect.height },
          innerRect: innerRect ? { w: innerRect.width, h: innerRect.height } : null,
          innerHTMLSnippet: innerContainer ? innerContainer.innerHTML.slice(0, 200) : null
        };
      });

      return {
        winName: '${winName}',
        canvases,
        images,
        videos,
        previewCards,
        bodyTextSnippet: textNodes.slice(0, 150)
      };
    })()`);
  }

  // Helper to capture screenshot
  async function capture(win, filename) {
    const img = await win.webContents.capturePage();
    const filePath = path.join(scratchDir, filename);
    fs.writeFileSync(filePath, img.toPNG());
    console.log(`📸 Saved screenshot to: ${filePath}`);
    return filePath;
  }

  // ── STEP 1: Baseline inspection ───────────────────────────────────────────
  console.log("--- STEP 1: Baseline Standby Inspection (Nothing Presented) ---");
  const baseCtrl = await inspectWindow(controllerWin, "Controller");
  const baseGen = await inspectWindow(generalWin, "General");
  const baseSpk = await inspectWindow(speakerWin, "Speaker");
  console.log("Controller Preview Cards:", JSON.stringify(baseCtrl.previewCards, null, 2));
  console.log("General Win Canvases:", baseGen.canvases);
  console.log("Speaker Win Canvases:", baseSpk.canvases);
  await capture(controllerWin, "01_baseline_controller.png");

  // ── STEP 2: Present Scripture ──────────────────────────────────────────────
  console.log("\n--- STEP 2: Presenting Scripture (John 3:16) ---");
  const scripturePayload = {
    type: "bible",
    data: {
      title: "John 3:16",
      body: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
      version: "KJV",
      bookIndex: 42,
      chapterIndex: 2,
      verseIndices: [15],
      verseNumbers: [16],
      manualHighlights: [],
      bibleHighlightColor: "#FFEB3B",
      verseOffsets: { 15: { start: 0, count: 25, version: "KJV", bookIndex: 42, chapterIndex: 2, verseNumber: 16 } },
    }
  };

  // Dispatch via IPC directly into the controller
  await controllerWin.webContents.executeJavaScript(`(() => {
    window.electron.Presentation.setContent(${JSON.stringify(scripturePayload)});
  })()`);
  await new Promise((r) => setTimeout(r, 1000));

  const postBibleCtrl = await inspectWindow(controllerWin, "Controller");
  const postBibleGen = await inspectWindow(generalWin, "General");
  const postBibleSpk = await inspectWindow(speakerWin, "Speaker");
  console.log("Controller Post-Bible Preview Cards:", JSON.stringify(postBibleCtrl.previewCards, null, 2));
  console.log("General Win Post-Bible Canvases:", postBibleGen.canvases);
  console.log("Speaker Win Post-Bible Canvases:", postBibleSpk.canvases);
  await capture(controllerWin, "02_scripture_controller.png");
  await capture(generalWin, "02_scripture_general.png");
  await capture(speakerWin, "02_scripture_speaker.png");

  // ── STEP 3: Check PreviewModal Dimensions & Rendering ─────────────────────
  console.log("\n--- STEP 3: Inspecting PreviewModal Mounting & Dimensions ---");
  const modalInspection = await controllerWin.webContents.executeJavaScript(`(() => {
    // Open preview modal programmatically or check its presence
    const modal = document.querySelector('.fixed.inset-0.z-\\\\[100\\\\]') || document.querySelector('.aspect-video');
    return {
      modalFound: !!modal,
      modalRect: modal ? modal.getBoundingClientRect() : null,
      innerHTML: modal ? modal.innerHTML.slice(0, 300) : null
    };
  })()`);
  console.log("Modal Inspection:", modalInspection);

  console.log("\n================================================================================");
  console.log(" DIAGNOSTIC COMPLETE. Errors encountered:", errors.length);
  errors.forEach(e => console.log(e));
  console.log("================================================================================");

  await controllerWin.close();
  await generalWin.close();
  await speakerWin.close();
  app.quit();
});
