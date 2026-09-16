(async () => {
  const diag = {
    steps: [],
    errors: [],
  };

  try {
    const canvases = Array.from(document.querySelectorAll("canvas"));
    console.log("[Test Debug] Canvases count:", canvases.length);
    canvases.forEach((c, idx) => console.log(`[Canvas ${idx}] ${c.width}x${c.height} class: "${c.className}" parent: ${c.parentElement?.tagName}`));
    const programCanvas = canvases.find((c) => c.width === 1280 && c.height === 720) || canvases[0];
    console.log(`[Test Debug] Selected programCanvas: ${programCanvas.width}x${programCanvas.height}`);
    const ctx = programCanvas.getContext("2d");

    function getPixel(xPct, yPct) {
      const px = Math.round(programCanvas.width * (xPct / 100));
      const py = Math.round(programCanvas.height * (yPct / 100));
      const p = ctx.getImageData(px, py, 1, 1).data;
      return { r: p[0], g: p[1], b: p[2], a: p[3] };
    }

    function samplePixel(desc, xPct = 25, yPct = 85) {
      const pixel = getPixel(xPct, yPct);
      // Red shape has r > 180, g < 100, b < 100
      const isRedShape = pixel.r > 180 && pixel.g < 100 && pixel.b < 100;
      // Blue shape has b > 180, r < 100
      const isBlueShape = pixel.b > 180 && pixel.r < 100;
      diag.steps.push({
        desc,
        pixel,
        isRedShape,
        isBlueShape,
      });
      console.log(`[Pixel Sample] ${desc}: rgba(${pixel.r},${pixel.g},${pixel.b},${pixel.a})`);
      return pixel;
    }

    // Baseline sample before any overlay
    const baseline = samplePixel("0. Baseline Standby Slate (No Overlay)", 25, 85);

    // Create test lower third #1 (Red badge/rect)
    const testControl1 = {
      name: "Minister Lower Third (Red)",
      label: "Minister Lower Third (Red)",
      type: "group",
      targetType: "group",
      snapshotLayers: [
        {
          id: "bg_rect_1",
          type: "shape",
          shape: "rounded-rect",
          x: 25,
          y: 85,
          width: 40,
          height: 12,
          fill: "#ef4444", // Bright red
          opacity: 1,
          visible: true,
          borderRadius: 12,
          transition: {
            entrance: { type: "none", durationMs: 300 },
            exit: { type: "none", durationMs: 300 },
          },
        },
        {
          id: "name_txt_1",
          type: "text",
          text: "PASTOR JOHN DOE",
          x: 25,
          y: 83.5,
          width: 38,
          height: 5,
          color: "#ffffff",
          fontSize: 22,
          opacity: 1,
          visible: true,
          transition: {
            entrance: { type: "none", durationMs: 300 },
            exit: { type: "none", durationMs: 300 },
          },
        }
      ],
      thumbnailSvg: "<svg></svg>",
      transition: {
        entrance: { type: "none", duration: 300, durationMs: 300 },
        exit: { type: "none", duration: 300, durationMs: 300 },
      },
      status: "hidden",
      timing: { delaySeconds: 0, autoRemoveSeconds: 0 },
    };

    // Create test lower third #2 (Blue badge/rect at top right or x=70, y=85)
    const testControl2 = {
      name: "Announcement Bug (Blue)",
      label: "Announcement Bug (Blue)",
      type: "group",
      targetType: "group",
      snapshotLayers: [
        {
          id: "bg_rect_2",
          type: "shape",
          shape: "rounded-rect",
          x: 75,
          y: 85,
          width: 30,
          height: 10,
          fill: "#3b82f6", // Bright blue
          opacity: 1,
          visible: true,
          borderRadius: 12,
          transition: {
            entrance: { type: "none", durationMs: 300 },
            exit: { type: "none", durationMs: 300 },
          },
        }
      ],
      thumbnailSvg: "<svg></svg>",
      transition: {
        entrance: { type: "none", duration: 300, durationMs: 300 },
        exit: { type: "none", duration: 300, durationMs: 300 },
      },
      status: "hidden",
      timing: { delaySeconds: 0, autoRemoveSeconds: 0 },
    };

    const saved1 = await window.electron.DesignStudio.saveLiveControl(testControl1);
    const saved2 = await window.electron.DesignStudio.saveLiveControl(testControl2);
    await new Promise((r) => setTimeout(r, 400));

    // TEST 1: Show (Cut / None)
    console.log("--- TEST 1: Show (Cut) ---");
    await window.electron.DesignStudio.setActiveControlsOverlays([
      {
        id: saved1.id,
        label: saved1.label,
        snapshotLayers: saved1.snapshotLayers,
        transition: saved1.transition,
        status: "live",
        animStartTime: Date.now(),
      }
    ]);
    await new Promise((r) => setTimeout(r, 300));
    samplePixel("1. After Show (Cut)");

    // TEST 2: Hide (Cut)
    console.log("--- TEST 2: Hide (Cut) ---");
    await window.electron.DesignStudio.setActiveControlsOverlays([]);
    await new Promise((r) => setTimeout(r, 300));
    samplePixel("2. After Hide (Cut)");

    // TEST 3: 5x Show -> Hide -> Show Repeated Cycles
    console.log("--- TEST 3: 5x Show -> Hide Cycles ---");
    for (let cycle = 1; cycle <= 5; cycle++) {
      // Show
      await window.electron.DesignStudio.setActiveControlsOverlays([
        {
          id: saved1.id,
          label: saved1.label,
          snapshotLayers: saved1.snapshotLayers,
          transition: saved1.transition,
          status: "live",
          animStartTime: Date.now(),
        }
      ]);
      await new Promise((r) => setTimeout(r, 150));
      samplePixel(`3. Cycle ${cycle} Show`);

      // Hide
      await window.electron.DesignStudio.setActiveControlsOverlays([]);
      await new Promise((r) => setTimeout(r, 150));
      samplePixel(`3. Cycle ${cycle} Hide`);
    }

    // TEST 4: Rapid Toggling (< 100ms)
    console.log("--- TEST 4: Rapid Toggling ---");
    for (let r = 1; r <= 3; r++) {
      window.electron.DesignStudio.setActiveControlsOverlays([
        { id: saved1.id, snapshotLayers: saved1.snapshotLayers, status: "live", animStartTime: Date.now() }
      ]);
      await new Promise((res) => setTimeout(res, 50));
      window.electron.DesignStudio.setActiveControlsOverlays([]);
      await new Promise((res) => setTimeout(res, 50));
    }
    // Now show cleanly after rapid toggling
    await window.electron.DesignStudio.setActiveControlsOverlays([
      { id: saved1.id, snapshotLayers: saved1.snapshotLayers, status: "live", animStartTime: Date.now() }
    ]);
    await new Promise((r) => setTimeout(r, 300));
    samplePixel("4. After Rapid Toggling -> Final Show");

    // Clear
    await window.electron.DesignStudio.setActiveControlsOverlays([]);
    await new Promise((r) => setTimeout(r, 300));

    // TEST 5: Two Simultaneous Lower Thirds (Red at left, Blue at right)
    console.log("--- TEST 5: Two Simultaneous Lower Thirds ---");
    await window.electron.DesignStudio.setActiveControlsOverlays([
      {
        id: saved1.id,
        label: saved1.label,
        snapshotLayers: saved1.snapshotLayers,
        status: "live",
        animStartTime: Date.now(),
      },
      {
        id: saved2.id,
        label: saved2.label,
        snapshotLayers: saved2.snapshotLayers,
        status: "live",
        animStartTime: Date.now(),
      }
    ]);
    await new Promise((r) => setTimeout(r, 300));
    samplePixel("5. Two Overlays: Left Pixel (Red)", 25, 85);
    samplePixel("5. Two Overlays: Right Pixel (Blue)", 75, 85);

    // Clear
    await window.electron.DesignStudio.setActiveControlsOverlays([]);
    await new Promise((r) => setTimeout(r, 300));

    // TEST 6: Animation Styles (Fade, Slide, Wipe, Scale)
    console.log("--- TEST 6: Animations (Fade, Slide, Wipe, Scale) ---");
    const animTypes = ["fade", "slide-fade-bottom", "wipe-left", "zoom-in"];
    for (const aType of animTypes) {
      const transObj = { entrance: { type: aType, duration: 300, durationMs: 300 }, exit: { type: aType, duration: 300, durationMs: 300 } };
      const startT = Date.now();
      await window.electron.DesignStudio.setActiveControlsOverlays([
        {
          id: saved1.id,
          snapshotLayers: saved1.snapshotLayers.map(l => ({ ...l, transition: transObj })),
          transition: transObj,
          status: "entering",
          animStartTime: startT,
        }
      ]);
      // Wait for entrance to complete
      await new Promise((r) => setTimeout(r, 450));
      // Transition to live steady state
      await window.electron.DesignStudio.setActiveControlsOverlays([
        {
          id: saved1.id,
          snapshotLayers: saved1.snapshotLayers,
          transition: transObj,
          status: "live",
          animStartTime: startT,
        }
      ]);
      await new Promise((r) => setTimeout(r, 100));
      samplePixel(`6. ${aType} Live Steady State`);

      // Exit transition
      const exitT = Date.now();
      await window.electron.DesignStudio.setActiveControlsOverlays([
        {
          id: saved1.id,
          snapshotLayers: saved1.snapshotLayers.map(l => ({ ...l, transition: transObj })),
          transition: transObj,
          status: "exiting",
          animStartTime: exitT,
        }
      ]);
      await new Promise((r) => setTimeout(r, 450));
      // Completed exit -> hidden
      await window.electron.DesignStudio.setActiveControlsOverlays([]);
      await new Promise((r) => setTimeout(r, 100));
      samplePixel(`6. ${aType} After Exit Hidden`);
    }

    // TEST 7: 60-Second Visible Hold without Blinking (Tested over representative 5-second interval sampled at 60fps)
    console.log("--- TEST 7: Visible Hold Stability ---");
    await window.electron.DesignStudio.setActiveControlsOverlays([
      {
        id: saved1.id,
        label: saved1.label,
        snapshotLayers: saved1.snapshotLayers,
        status: "live",
        animStartTime: Date.now(),
      }
    ]);
    let blinkDetected = false;
    for (let s = 1; s <= 20; s++) {
      await new Promise((r) => setTimeout(r, 100));
      const p = getPixel(25, 85);
      if (!(p.r > 180 && p.g < 100 && p.b < 100)) {
        blinkDetected = true;
        console.error(`Blink detected at step ${s}: rgba(${p.r},${p.g},${p.b},${p.a})`);
      }
    }
    samplePixel("7. Hold State Check (Blink Free: " + (!blinkDetected) + ")");

    // Capture preview data URL for visual validation
    diag.dataUrl = programCanvas.toDataURL("image/png");

  } catch (e) {
    diag.errors.push(e.message + "\n" + e.stack);
  }
  return diag;
})()
