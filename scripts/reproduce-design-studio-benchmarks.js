const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { designStudioService } = require("../src/main/design/designStudioService");

async function runBenchmark() {
  console.log("=== REPRODUCING LIVE DESIGN STUDIO WORKFLOW & MEASURING BOTTLENECK METRICS ===");
  setTimeout(() => {
    console.log("Safety timeout reached. Quitting Electron process.");
    app.exit(0);
  }, 25000);

  const testDir = path.join(os.tmpdir(), `ocs_bench_${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });
  designStudioService.initialize(testDir);

  const pngPath = path.join(testDir, "test_logo.png");
  fs.writeFileSync(
    pngPath,
    Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64")
  );

  let win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.resolve(__dirname, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });

  let liveOverlay = null;
  ipcMain.handle("design:list", async () => ({ ok: true, designs: designStudioService.listDesigns() }));
  ipcMain.handle("design:save", async (_event, design) => ({ ok: true, design: designStudioService.saveDesign(design) }));
  ipcMain.handle("design:delete", async (_event, id) => designStudioService.deleteDesign(id));
  ipcMain.handle("design:import-image", async (_event, sourcePath) => {
    try {
      const asset = designStudioService.importImageFile(sourcePath || pngPath);
      return { ok: true, asset };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle("design:present", async (_event, { design }) => {
    liveOverlay = design;
    return { ok: true, liveOverlay };
  });
  ipcMain.handle("design:hide", async () => {
    liveOverlay = null;
    return { ok: true, isLive: false };
  });
  ipcMain.handle("design:get-live-state", async () => ({ isLive: !!liveOverlay, layers: liveOverlay?.layers || [] }));

  // Register stub handlers for controller polling channels to prevent console noise
  const commonIpcs = [
    "recorder:status", "get-paired-devices", "settings-get", "ai-status",
    "auth:silent-reload", "multiview:get-active-cameras", "intercom:status",
    "obs:status", "streaming:status", "ndi:sources", "audio:get-sources",
    "get-network-interfaces", "display:get-displays", "get-cameras", "auth:get-user",
    "ndi:status", "projector:status", "lower-third:status", "presentation-get-style",
    "updater:get-status", "session:get-recovery-state", "auth:get-status",
    "bible-get-books", "asr-init", "settings:get-login-item", "switcher:get-state-desktop",
    "switcher:get-broadcast-config-desktop", "sleep-probe", "bumper-get", "asr-status"
  ];
  for (const ch of commonIpcs) {
    try {
      ipcMain.handle(ch, async () => ({ ok: true, success: true, status: "idle", cameras: [], devices: [] }));
    } catch (_) {}
  }

  win.webContents.on("console-message", (e, level, msg, line, src) => {
    if (!msg.includes("Error occurred in handler") && !msg.includes("Security Warning")) {
      console.log(`[Renderer L${line}]`, msg);
    }
  });

  await win.loadFile(path.resolve(__dirname, "../controller.html"));
  console.log("Controller loaded successfully.");

  // Collect baseline memory
  const memBaseline = process.memoryUsage();

  let report = null;
  try {
    report = await win.webContents.executeJavaScript(`
    (async () => {
      localStorage.clear();
      const delay = (ms) => new Promise((res) => setTimeout(res, ms));
      const results = {
        interactionFailures: [],
        delays: {},
        metrics: {}
      };

      // 1. Switch to Live Switcher tab ("Live")
      const asideBtns = Array.from(document.querySelectorAll("aside button"));
      const liveTab = asideBtns.find(b => b.textContent.includes("Live"));
      if (liveTab) {
        liveTab.click();
        await delay(500);
      }

      // Open Live Design Studio button in switcher
      let openBtn = null;
      for (let i = 0; i < 30; i++) {
        const buttons = Array.from(document.querySelectorAll("button"));
        openBtn = buttons.find(b => b.textContent && (b.textContent.includes("LIVE DESIGN STUDIO") || b.textContent.includes("Live Design Studio")));
        if (openBtn) break;
        await delay(100);
      }
      if (!openBtn) {
        results.interactionFailures.push("Could not find 'Live Design Studio' button");
        return results;
      }
      openBtn.click();
      await delay(800);

      // 2. Select Template: "Speaker Lower Third (Classic)"
      await delay(500);
      const cards = Array.from(document.querySelectorAll(".cursor-pointer"));
      const tmplCard = cards.find(el => el.textContent.includes("Speaker Lower Third (Classic)"));
      if (!tmplCard) {
        results.interactionFailures.push("Template card not found. Found cards: " + cards.map(c => c.textContent.slice(0, 30)).join(", "));
        return results;
      }
      tmplCard.click();
      await delay(500);

      // Verify layers loaded
      const modalEl = Array.from(document.querySelectorAll("div")).find(el => el.className?.includes?.("z-[9999]") && el.textContent.includes("CANVA COMPOSITOR"));
      if (!modalEl) {
        results.interactionFailures.push("Modal container with CANVA COMPOSITOR not found");
        return results;
      }
      const canvasEl = modalEl.querySelector(".aspect-video");
      if (!canvasEl) {
        results.interactionFailures.push("Canvas element not found in modal");
        return results;
      }

      // Check localStorage writing frequency by spying on setItem
      let localStorageWriteCount = 0;
      const origSetItem = localStorage.setItem.bind(localStorage);
      localStorage.setItem = function(...args) {
        localStorageWriteCount++;
        return origSetItem(...args);
      };

      // Find individual child elements on canvas
      const canvasChildren = Array.from(canvasEl.querySelectorAll(".aspect-video > div.absolute.group"));
      results.metrics.initialLayerCount = canvasChildren.length;

      // 3. Test: Select individual element "Speaker Name"
      const nameEl = canvasChildren.find(el => el.textContent.includes("Pastor John Doe"));
      if (!nameEl) {
        results.interactionFailures.push("Could not find 'Pastor John Doe' layer on canvas. Found child texts: " + canvasChildren.map(c => c.textContent.trim().slice(0, 30)).join(", "));
        return results;
      }

      // Record positions of all group items before drag
      const subtitleEl = canvasChildren.find(el => el.textContent.includes("Senior Pastor"));
      const getPos = (el) => ({ left: parseFloat(el.style.left), top: parseFloat(el.style.top) });

      const nameInitialPos = getPos(nameEl);
      const subInitialPos = subtitleEl ? getPos(subtitleEl) : null;

      // Simulate real mouse drag on "Speaker Name" element
      const rect = nameEl.getBoundingClientRect();
      const startX = rect.left + rect.width / 2;
      const startY = rect.top + rect.height / 2;

      nameEl.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: startX, clientY: startY }));
      await delay(50);

      const dragMoveCount = 25;
      const t0 = performance.now();
      for (let i = 1; i <= dragMoveCount; i++) {
        window.dispatchEvent(new MouseEvent("mousemove", {
          bubbles: true,
          clientX: startX + i * 4,
          clientY: startY + i * 2,
        }));
        await delay(8); // ~120Hz drag stream
      }
      const dragDuration = performance.now() - t0;
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await delay(100);

      const nameAfterPos = getPos(nameEl);
      const subAfterPos = subtitleEl ? getPos(subtitleEl) : null;

      // Check: Did child move?
      const nameMoved = Math.abs(nameAfterPos.left - nameInitialPos.left) > 1;
      // Check: Did whole group move accidentally when child was selected?
      const groupAccidentallyMoved = subtitleEl && Math.abs(subAfterPos.left - subInitialPos.left) > 1;
      if (groupAccidentallyMoved) {
        results.interactionFailures.push("ACCIDENTAL_GROUP_MOVE: Dragging child 'Speaker Name' moved 'Senior Pastor' subtitle layer as well!");
      }

      results.metrics.dragDurationMs = dragDuration;
      results.metrics.localStorageWritesDuring25PointerEvents = localStorageWriteCount;
      if (localStorageWriteCount > 5) {
        results.interactionFailures.push("EXCESSIVE_LOCALSTORAGE: " + localStorageWriteCount + " synchronous localStorage writes during drag pointer movements!");
      }

      // 4. Test: Missed click / selection box dismissal on canvas click
      // Click on the nameEl again
      nameEl.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      nameEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await delay(100);
      const isSelectedAfterClick = nameEl.className.includes("ring-purple-500");
      if (!isSelectedAfterClick) {
        results.interactionFailures.push("MISSED_CLICK_DESELECTION: Clicking on element bubbled to canvas and dropped selection!");
      }

      // 5. Test: Double-click inline text editing
      nameEl.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      await delay(150);
      let inlineTextarea = nameEl.querySelector("textarea");
      results.metrics.hasInlineTextarea = !!inlineTextarea;
      if (inlineTextarea) {
        inlineTextarea.value = "Pastor David Green";
        inlineTextarea.dispatchEvent(new Event("input", { bubbles: true }));
        inlineTextarea.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
        await delay(100);
      } else {
        results.interactionFailures.push("INLINE_TEXT_EDIT_FAILED: Double-clicking did not mount inline textarea");
      }

      // 6. Test: Resize Element via Handle
      const handles = Array.from(nameEl.querySelectorAll(".cursor-se-resize, .cursor-e-resize, [class*='cursor-']"));
      results.metrics.handleCount = handles.length;
      const seHandle = handles.find(h => h.className.includes("cursor-se-resize")) || handles[0];
      if (seHandle) {
        const hRect = seHandle.getBoundingClientRect();
        seHandle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: hRect.left, clientY: hRect.top }));
        await delay(50);
        for (let i = 1; i <= 10; i++) {
          window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: hRect.left + i * 3, clientY: hRect.top + i * 2 }));
          await delay(8);
        }
        window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        await delay(100);
      }

      // 7. Test: Switch Selection
      if (subtitleEl) {
        subtitleEl.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        subtitleEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await delay(100);
        results.metrics.switchedSelectionToSubtitle = subtitleEl.className.includes("ring-purple-500");
      }

      // 8. Test: Tool Shelf Tabs & Image Upload
      const shelfTabs = Array.from(modalEl.querySelectorAll("button")).filter(b => ["Templates", "Text", "Shapes", "Images", "Layers"].some(t => b.textContent?.includes(t)));
      const imagesTab = shelfTabs.find(b => b.textContent?.includes("Images"));
      if (imagesTab) {
        imagesTab.click();
        await delay(200);
        const uploadBtn = Array.from(modalEl.querySelectorAll("button")).find(b => b.textContent?.includes("Upload Image Asset") || b.textContent?.includes("Import Image"));
        results.metrics.hasUploadImageButton = !!uploadBtn;
      }

      // 9. Test: Undo / Redo
      const undoBtn = Array.from(modalEl.querySelectorAll("button")).find(b => b.textContent?.includes("Undo"));
      const redoBtn = Array.from(modalEl.querySelectorAll("button")).find(b => b.textContent?.includes("Redo"));
      results.metrics.canUndo = undoBtn && !undoBtn.disabled;
      if (undoBtn && !undoBtn.disabled) {
        undoBtn.click();
        await delay(150);
      }
      results.metrics.canRedo = redoBtn && !redoBtn.disabled;
      if (redoBtn && !redoBtn.disabled) {
        redoBtn.click();
        await delay(150);
      }

      // 10. Test: Video Preview Element
      const videoEl = modalEl.querySelector("video");
      results.metrics.hasPreviewVideo = !!videoEl;

      // 11. Test: Show / Update / Hide Live Output
      const showBtn = Array.from(modalEl.querySelectorAll("button")).find(b => b.textContent?.includes("Show on Program"));
      results.metrics.hasShowBtn = !!showBtn;
      if (showBtn) {
        showBtn.click();
        await delay(300);
      }

      const statusBadge = Array.from(modalEl.querySelectorAll("div, span")).find(el => el.textContent?.includes("Program Output:"));
      results.metrics.liveBadgeAfterShow = statusBadge ? statusBadge.textContent.trim() : "not found";

      const hideBtn = Array.from(modalEl.querySelectorAll("button")).find(b => b.textContent?.includes("Hide from Air"));
      results.metrics.hasHideBtn = !!hideBtn;
      if (hideBtn) {
        hideBtn.click();
        await delay(300);
      }
      results.metrics.liveBadgeAfterHide = statusBadge ? statusBadge.textContent.trim() : "not found";

      return results;
    })()
  `);
  } catch (err) {
    console.error("EXECUTE JS ERROR:", err);
  }

  const memFinal = process.memoryUsage();

  console.log("REPRODUCTION RESULTS:", JSON.stringify(report, null, 2));
  console.log("MEMORY USAGE (MB):", {
    baselineRss: (memBaseline.rss / 1024 / 1024).toFixed(1),
    baselineHeap: (memBaseline.heapUsed / 1024 / 1024).toFixed(1),
    finalRss: (memFinal.rss / 1024 / 1024).toFixed(1),
    finalHeap: (memFinal.heapUsed / 1024 / 1024).toFixed(1),
  });

  app.quit();
}

app.whenReady().then(runBenchmark);
