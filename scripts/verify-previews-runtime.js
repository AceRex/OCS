/**
 * Complete Verification Script:
 * Verifies General Preview and Speaker Preview (both mounted MiniPreview in controller and physical View windows)
 * across scripture, image, video, timer, PreviewModal, intentional clear, and Agenda Load vs Start.
 */

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

console.log("================================================================================");
console.log("🚀 EXECUTING COMPLETE RUNTIME VERIFICATION: PREVIEWS & AGENDA");
console.log("================================================================================\n");

app.whenReady().then(async () => {
  let latestOverlayContent = null;
  let latestOverlayTimer = null;
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
    bibleServiceLabel: 'Sunday Morning',
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

  function clearContent() {
    latestOverlayContent = null;
    currentCanvasState.contentSlot = { type: "none", data: null };
    broadcastCanvasState(currentCanvasState);
    safeSend(generalWin, "set-content", null);
    safeSend(speakerWin, "set-content", null);
    safeSend(controllerWin, "set-content", null);
    console.log("[Test IPC] Content cleared");
  }

  // Register standard IPC handlers
  ipcMain.on("activate_set_content", (_e, val) => {
    latestOverlayContent = val;
    if (val == null) {
      clearContent();
      return;
    }
    const targets = Array.isArray(val?.target) ? val.target : null;
    const spkOk = targets === null || targets.includes("speaker") || targets.includes("all");
    const genOk = targets === null || targets.includes("general") || targets.includes("all");

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
    const spkOk = targets === null || targets.includes("speaker") || targets.includes("all");
    const genOk = targets === null || targets.includes("general") || targets.includes("all");

    if (spkOk) safeSend(speakerWin, "set-style", latestOverlayStyle);
    if (genOk) safeSend(generalWin, "set-style", latestOverlayStyle);
    safeSend(controllerWin, "set-style", latestOverlayStyle);
  });

  ipcMain.on("activate_set_timer", (_e, val) => {
    latestOverlayTimer = val;
    safeSend(speakerWin, "set-timer", val);
    if (val?.fromAgenda) {
      safeSend(generalWin, "set-timer", { time: null, isEventMode: false, fromAgenda: true });
    } else {
      safeSend(generalWin, "set-timer", val);
    }
    safeSend(controllerWin, "set-timer", val);
  });

  ipcMain.handle("presentation-get-style", () => latestOverlayStyle);
  ipcMain.handle("presentation-get-content", () => latestOverlayContent);
  ipcMain.handle("canvas-get-state", () => currentCanvasState);
  ipcMain.handle("timer-get-state", () => latestOverlayTimer);

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
      if (level >= 2 || msg.includes("Error") || msg.includes("Exception") || msg.includes("ReferenceError")) {
        errors.push(`[${name} Error] ${msg} (${src}:${line})`);
      }
    });
  };

  hookConsole("Controller", controllerWin);
  hookConsole("GeneralWin", generalWin);
  hookConsole("SpeakerWin", speakerWin);

  const outDir = path.resolve(__dirname, "../scratch/preview-verification");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const artifactDir = "/Users/rex/.gemini/antigravity-ide/brain/db9dac3e-e031-4141-aefe-ca89a31e0839";

  const results = {};

  // Step 1: Initial load of all windows
  console.log("Loading Windows...");
  await Promise.all([
    controllerWin.loadFile(path.resolve(__dirname, "../controller.html")),
    generalWin.loadFile(path.resolve(__dirname, "../view.html"), { search: "mode=general" }),
    speakerWin.loadFile(path.resolve(__dirname, "../view.html"), { search: "mode=speaker" }),
  ]);
  await new Promise((r) => setTimeout(r, 2500));

  // Check errors on initial load
  const criticalErrors = errors.filter(e => e.includes("ReferenceError") || e.includes("mode is not defined") || e.includes("SyntaxError"));
  results.criticalErrors = criticalErrors;
  console.log(`Critical errors count: ${criticalErrors.length}`);

  // Step 2: Present Scripture (John 3:16)
  console.log("\n--- TEST 1: Present Scripture (John 3:16) ---");
  const scripturePayload = {
    type: "bible",
    target: ["general", "speaker"],
    data: {
      title: "John 3:16",
      book: "John",
      chapter: 3,
      verse: 16,
      body: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
      version: "KJV",
      translation: "KJV",
      bibleServiceLabel: "Sunday Morning",
    },
  };
  ipcMain.emit("activate_set_content", {}, scripturePayload);
  await new Promise((r) => setTimeout(r, 1200));

  // Inspect physical windows for scripture
  const checkGenScripture = await generalWin.webContents.executeJavaScript(`(() => {
    const txt = (document.body.innerText || "").toLowerCase();
    return {
      hasGod: txt.includes("god so loved the world"),
      hasJohn: txt.includes("john") && (txt.includes("chapter 3") || txt.includes("3:16")),
    };
  })()`);
  const checkSpkScripture = await speakerWin.webContents.executeJavaScript(`(() => {
    const txt = (document.body.innerText || "").toLowerCase();
    return {
      hasGod: txt.includes("god so loved the world"),
      hasJohn: txt.includes("john") && (txt.includes("chapter 3") || txt.includes("3:16")),
    };
  })()`);
  const checkCtrlScripture = await controllerWin.webContents.executeJavaScript(`(() => {
    const txt = (document.body.innerText || "").toLowerCase();
    return {
      hasGod: txt.includes("god so loved the world"),
      hasJohn: txt.includes("john") && (txt.includes("chapter 3") || txt.includes("3:16")),
    };
  })()`);

  results.scripture = {
    generalWindow: checkGenScripture.hasGod && checkGenScripture.hasJohn,
    speakerWindow: checkSpkScripture.hasGod && checkSpkScripture.hasJohn,
    controllerPreview: checkCtrlScripture.hasGod && checkCtrlScripture.hasJohn,
  };
  console.log("Scripture render check:", results.scripture);

  // Capture scripture screenshot
  const imgCtrlScripture = await controllerWin.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, "01_scripture_controller.png"), imgCtrlScripture.toPNG());
  fs.writeFileSync(path.join(artifactDir, "01_scripture_controller.png"), imgCtrlScripture.toPNG());

  const imgGenScripture = await generalWin.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, "01_scripture_general_window.png"), imgGenScripture.toPNG());
  fs.writeFileSync(path.join(artifactDir, "01_scripture_general_window.png"), imgGenScripture.toPNG());

  const imgSpkScripture = await speakerWin.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, "01_scripture_speaker_window.png"), imgSpkScripture.toPNG());
  fs.writeFileSync(path.join(artifactDir, "01_scripture_speaker_window.png"), imgSpkScripture.toPNG());

  // Step 3: Present Image
  console.log("\n--- TEST 2: Present Image ---");
  const testImageUrl = "file://" + path.resolve(__dirname, "../src/assets/wave/wave_icon_gray.png");
  const imagePayload = {
    type: "image",
    target: ["general", "speaker"],
    data: {
      title: "Wave Logo Image",
      url: testImageUrl,
      fit: "contain",
    },
  };
  ipcMain.emit("activate_set_content", {}, imagePayload);
  await new Promise((r) => setTimeout(r, 1000));

  const checkCtrlImage = await controllerWin.webContents.executeJavaScript(`(() => {
    const imgs = Array.from(document.querySelectorAll('img')).map(i => i.src);
    return { hasLogoImg: imgs.some(s => s.includes("wave_icon_gray")) };
  })()`);
  const checkGenImage = await generalWin.webContents.executeJavaScript(`(() => {
    const imgs = Array.from(document.querySelectorAll('img')).map(i => i.src);
    return { hasLogoImg: imgs.some(s => s.includes("wave_icon_gray")) };
  })()`);

  results.image = {
    controllerPreview: checkCtrlImage.hasLogoImg,
    generalWindow: checkGenImage.hasLogoImg,
  };
  console.log("Image render check:", results.image);

  // Step 4: Present Speaker Timer & General Timer Suppression
  console.log("\n--- TEST 3: Present Timer (General Suppression vs Speaker Display) ---");
  ipcMain.emit("activate_set_timer", {}, {
    time: 300,
    fromAgenda: true,
    isEventMode: false,
    theme: "default",
  });
  await new Promise((r) => setTimeout(r, 1000));

  const checkSpkTimer = await speakerWin.webContents.executeJavaScript(`(() => {
    return { hasTimer: document.body.innerText.includes("05:00") || document.body.innerText.includes("00:05:00") };
  })()`);
  const checkGenTimer = await generalWin.webContents.executeJavaScript(`(() => {
    return { hasTimer: document.body.innerText.includes("05:00") || document.body.innerText.includes("00:05:00") };
  })()`);
  const checkCtrlTimer = await controllerWin.webContents.executeJavaScript(`(() => {
    return {
      text: document.body.innerText,
      hasTimer: document.body.innerText.includes("05:00") || document.body.innerText.includes("00:05:00")
    };
  })()`);

  results.timer = {
    speakerShowsTimer: checkSpkTimer.hasTimer,
    generalSuppressesAgendaTimer: !checkGenTimer.hasTimer,
    controllerReflectsTimer: checkCtrlTimer.hasTimer,
  };
  console.log("Timer render check:", results.timer);

  // Step 5: Test Initial State Hydration on Fresh Mount
  console.log("\n--- TEST 4: Initial State Hydration on Mount ---");
  const testHydrateWin = new BrowserWindow({
    width: 640,
    height: 360,
    show: false,
    webPreferences: {
      preload: path.resolve(__dirname, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await testHydrateWin.loadFile(path.resolve(__dirname, "../view.html"), { search: "mode=general" });
  await new Promise((r) => setTimeout(r, 1500));

  const checkHydrated = await testHydrateWin.webContents.executeJavaScript(`(() => {
    const imgs = Array.from(document.querySelectorAll('img')).map(i => i.src);
    return { hasImage: imgs.some(s => s.includes("wave_icon_gray")) };
  })()`);
  results.mountHydration = {
    newWindowObtainsActiveStateImmediately: checkHydrated.hasImage,
  };
  console.log("Mount hydration check:", results.mountHydration);
  testHydrateWin.destroy();

  // Step 6: Test PreviewModal Expand & Non-zero Height
  console.log("\n--- TEST 5: PreviewModal Expand ---");
  // Restore scripture for modal preview
  ipcMain.emit("activate_set_content", {}, scripturePayload);
  await new Promise((r) => setTimeout(r, 1000));

  const modalExpandResult = await controllerWin.webContents.executeJavaScript(`(() => {
    const btn = document.querySelector('[title="Expand General Preview"]');
    if (btn) {
      btn.click();
      return { clicked: true };
    }
    return { clicked: false };
  })()`);

  await new Promise((r) => setTimeout(r, 1000));

  const checkModalRender = await controllerWin.webContents.executeJavaScript(`(() => {
    const modalTitle = document.querySelector('span.text-sm.font-bold');
    const modalContainer = modalTitle ? modalTitle.closest('.aspect-video') : null;
    const miniPreviewInside = modalContainer ? modalContainer.querySelector('[class*="MiniPreview"], section, .w-full.h-full') : null;
    const rect = modalContainer ? modalContainer.getBoundingClientRect() : null;
    return {
      modalOpen: !!modalContainer,
      modalWidth: rect ? rect.width : 0,
      modalHeight: rect ? rect.height : 0,
      hasContent: modalContainer ? (modalContainer.innerText || "").includes("For God so loved") || (modalContainer.innerText || "").toLowerCase().includes("god so loved") : false,
    };
  })()`);

  results.previewModal = {
    modalOpened: checkModalRender.modalOpen,
    nonZeroDimensions: checkModalRender.modalWidth > 0 && checkModalRender.modalHeight > 0,
    rendersContentProperly: checkModalRender.hasContent,
  };
  console.log("PreviewModal check:", results.previewModal);

  // Capture modal screenshot
  const imgModal = await controllerWin.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, "03_expanded_modal_preview.png"), imgModal.toPNG());
  fs.writeFileSync(path.join(artifactDir, "03_expanded_modal_preview.png"), imgModal.toPNG());

  // Close modal
  await controllerWin.webContents.executeJavaScript(`(() => {
    const closeBtn = document.querySelector('.aspect-video button');
    if (closeBtn) closeBtn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 600));

  // Step 7: Intentional Clear
  console.log("\n--- TEST 6: Intentional Clear ---");
  ipcMain.emit("activate_set_content", {}, null);
  await new Promise((r) => setTimeout(r, 1000));

  const checkGenCleared = await generalWin.webContents.executeJavaScript(`(() => {
    return {
      hasNoGod: !document.body.innerText.includes("For God so loved"),
      noActiveImage: !Array.from(document.querySelectorAll('img')).some(i => i.src.includes("wave_icon_gray") && i.className.includes("object-cover")),
    };
  })()`);
  results.intentionalClear = {
    generalWindowCleared: checkGenCleared.hasNoGod,
    noStaleContentRetained: checkGenCleared.noActiveImage,
  };
  console.log("Intentional clear check:", results.intentionalClear);

  // Capture cleared screenshot
  const imgCleared = await controllerWin.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, "02_cleared_controller.png"), imgCleared.toPNG());
  fs.writeFileSync(path.join(artifactDir, "02_cleared_controller.png"), imgCleared.toPNG());

  // Step 8: Agenda Load vs Start Invariant Verification
  console.log("\n--- TEST 7: Agenda Load vs Start Separation ---");
  const AgendaExecutionEngine = require("../src/main/agenda/agendaExecutionEngine");
  const testEngine = new AgendaExecutionEngine();
  const testAgenda = {
    id: "test_agenda_001",
    name: "Sunday Service",
    sessions: [
      {
        id: "session_1",
        name: "Praise & Worship",
        durationSec: 600,
        timelineItems: [
          { id: "cue_1", name: "Welcome BG", track: "background", startSec: 0, durationSec: 300, color: "#112233" },
          { id: "cue_2", name: "Praise BG", track: "background", startSec: 60, durationSec: 300, color: "#445566" },
        ],
      },
      {
        id: "session_2",
        name: "Sermon",
        durationSec: 1800,
        timelineItems: [],
      },
    ],
    assets: [],
  };

  let executedCues = [];
  testEngine.dispatchBackground = (bg) => {
    executedCues.push(bg);
  };

  const loadRes = testEngine.loadAgenda(testAgenda);
  const statusAfterLoad = testEngine.status;
  const elapsedAfterLoad = testEngine.sessionElapsedSec;
  const cuesFiredOnLoad = executedCues.length;

  console.log(`Status after load: "${statusAfterLoad}" (expected: "idle")`);
  console.log(`Elapsed after load: ${elapsedAfterLoad}s (expected: 0)`);
  console.log(`Cues fired during load: ${cuesFiredOnLoad} (expected: 0)`);

  // Explicit user Start
  const startRes = testEngine.start();
  const statusAfterStart = testEngine.status;
  const cuesFiredAfterStart = executedCues.length;

  console.log(`Status after start: "${statusAfterStart}" (expected: "running")`);
  console.log(`00:00 cues fired after start: ${cuesFiredAfterStart} (expected: 1)`);

  testEngine.stop();

  results.agendaLoadVsStart = {
    loadLeavesStatusIdle: statusAfterLoad === "idle",
    loadLeavesElapsedZero: elapsedAfterLoad === 0,
    loadFiresZeroCues: cuesFiredOnLoad === 0,
    startBeginsExecution: statusAfterStart === "running",
    startFiresZeroSecondCues: cuesFiredAfterStart === 1,
  };
  console.log("Agenda Load vs Start check:", results.agendaLoadVsStart);

  // Present John 3:16 again for final controller view
  ipcMain.emit("activate_set_content", {}, scripturePayload);
  await new Promise((r) => setTimeout(r, 1200));

  const finalCtrlImg = await controllerWin.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, "final_previews_both_active.png"), finalCtrlImg.toPNG());
  fs.writeFileSync(path.join(artifactDir, "final_previews_both_active.png"), finalCtrlImg.toPNG());

  console.log("\n================================================================================");
  console.log("🏁 ALL RUNTIME CHECKS COMPLETE - FINAL RESULTS SUMMARY:");
  console.log(JSON.stringify(results, null, 2));
  console.log("================================================================================\n");

  app.quit();
});
