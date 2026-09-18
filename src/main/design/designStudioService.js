const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { pathToFileURL } = require("url");
let electronModule = null;
try {
  electronModule = require("electron");
} catch (_) {}

function getImageDimensions(buffer, filePath) {
  try {
    if (electronModule?.nativeImage?.createFromPath) {
      const img = electronModule.nativeImage.createFromPath(filePath);
      const size = img.getSize();
      if (size && size.width > 0 && size.height > 0) {
        return size;
      }
    }
  } catch (_) {}

  // Pure node fallback for tests / environments where Electron nativeImage is not present
  if (!buffer || buffer.length < 24) return { width: 0, height: 0 };

  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  }

  // JPEG: scan for SOF markers (0xFF, 0xC0 .. 0xC3, except 0xC4, 0xC8, 0xCC)
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length - 8) {
      if (buffer[offset] === 0xff) {
        const marker = buffer[offset + 1];
        if ([0xc0, 0xc1, 0xc2, 0xc3].includes(marker)) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return { width, height };
        }
        const len = buffer.readUInt16BE(offset + 2);
        offset += 2 + len;
      } else {
        offset++;
      }
    }
  }

  // WebP (RIFF....WEBP)
  if (buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WEBP") {
    const vp8 = buffer.slice(12, 16).toString("ascii");
    if (vp8 === "VP8X" && buffer.length >= 30) {
      const width = 1 + buffer.readUIntLE(24, 3);
      const height = 1 + buffer.readUIntLE(27, 3);
      return { width, height };
    } else if (vp8 === "VP8 " && buffer.length >= 30) {
      const width = buffer.readUInt16LE(26) & 0x3fff;
      const height = buffer.readUInt16LE(28) & 0x3fff;
      return { width, height };
    } else if (vp8 === "VP8L" && buffer.length >= 25) {
      const b1 = buffer[21], b2 = buffer[22], b3 = buffer[23], b4 = buffer[24];
      const width = 1 + (((b2 & 0x3f) << 8) | b1);
      const height = 1 + (((b4 & 0xf) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
      return { width, height };
    }
  }

  return { width: 0, height: 0 };
}

class DesignStudioService {
  constructor() {
    this.userDataPath = null;
    this.designAssetsPath = null;
    this.designsFilePath = null;
    this.liveControlsFilePath = null;
    this.designs = [];
    this.liveControls = [];
    this.activeLiveOverlay = null;
    this.isInitialized = false;
  }

  initialize(userDataPath) {
    this.userDataPath = userDataPath;
    this.designAssetsPath = path.join(userDataPath, "design_assets");
    this.designsFilePath = path.join(userDataPath, "designs.json");
    this.liveControlsFilePath = path.join(userDataPath, "live_controls.json");
    this.roleAssignmentsFilePath = path.join(userDataPath, "role_assignments.json");
    this.roleAssignments = { bible: null, announcement: null, speaker: null };

    try {
      if (!fs.existsSync(this.designAssetsPath)) {
        fs.mkdirSync(this.designAssetsPath, { recursive: true });
      }
    } catch (err) {
      console.error("[DesignStudio] Failed to create assets directory:", err);
    }

    this.loadDesigns();
    this.loadLiveControls();
    this.loadRoleAssignments();
    this.isInitialized = true;
    console.log(`[DesignStudio] Initialized. Loaded ${this.designs.length} designs, ${this.liveControls.length} live controls.`);
  }

  loadRoleAssignments() {
    try {
      if (fs.existsSync(this.roleAssignmentsFilePath)) {
        const raw = fs.readFileSync(this.roleAssignmentsFilePath, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          this.roleAssignments = {
            bible: parsed.bible || null,
            announcement: parsed.announcement || null,
            speaker: parsed.speaker || null,
          };
          return;
        }
      }
    } catch (err) {
      console.error("[DesignStudio] Failed to load role_assignments.json:", err);
    }
    this.roleAssignments = { bible: null, announcement: null, speaker: null };
  }

  persistRoleAssignments() {
    try {
      fs.writeFileSync(this.roleAssignmentsFilePath, JSON.stringify(this.roleAssignments, null, 2), "utf8");
      return true;
    } catch (err) {
      console.error("[DesignStudio] Failed to persist role_assignments.json:", err);
      return false;
    }
  }

  getRoleAssignments() {
    return { ...this.roleAssignments };
  }

  setRoleAssignment(role, templateId) {
    if (!["bible", "announcement", "speaker"].includes(role)) {
      throw new Error(`Invalid role: ${role}`);
    }
    this.roleAssignments[role] = templateId || null;
    this.persistRoleAssignments();
    return { ok: true, roleAssignments: this.getRoleAssignments() };
  }

  loadDesigns() {
    try {
      if (fs.existsSync(this.designsFilePath)) {
        const raw = fs.readFileSync(this.designsFilePath, "utf8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.designs = parsed.map((d) => this.sanitizeDesign(d));
          return;
        }
      }
    } catch (err) {
      console.error("[DesignStudio] Failed to load designs.json:", err);
    }
    this.designs = [];
  }

  sanitizeDesign(design) {
    if (!design || typeof design !== "object") {
      return {
        id: `design_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        name: "Untitled Design",
        target: "both",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        layers: [],
      };
    }

    return {
      id: design.id || `design_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: (design.name && design.name.trim()) || "Untitled Design",
      role: ["custom", "bible", "announcement", "speaker"].includes(design.role) ? design.role : "custom",
      target: ["both", "stream", "sanctuary"].includes(design.target) ? design.target : "both",
      createdAt: design.createdAt || new Date().toISOString(),
      updatedAt: design.updatedAt || new Date().toISOString(),
      transition: this.sanitizeTransition(design.transition),
      layers: Array.isArray(design.layers) ? design.layers.map((l) => this.sanitizeLayer(l)) : [],
    };
  }

  sanitizeLayer(layer) {
    if (!layer || typeof layer !== "object") {
      return {
        id: `layer_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        name: "Layer",
        type: "shape",
        x: 50,
        y: 80,
        width: 35,
        opacity: 1,
        visible: true,
        zIndex: 10,
      };
    }

    const type = ["image", "text", "shape"].includes(layer.type) ? layer.type : "image";
    const x = typeof layer.x === "number" && !isNaN(layer.x) ? Math.max(0, Math.min(100, layer.x)) : 50;
    const y = typeof layer.y === "number" && !isNaN(layer.y) ? Math.max(0, Math.min(100, layer.y)) : 80;
    const width = typeof layer.width === "number" && !isNaN(layer.width) ? Math.max(0.1, Math.min(100, layer.width)) : 35;
    const height = typeof layer.height === "number" && !isNaN(layer.height) ? Math.max(0.1, Math.min(100, layer.height)) : (type === "shape" ? 15 : undefined);
    const rotation = typeof layer.rotation === "number" && !isNaN(layer.rotation) ? layer.rotation : 0;
    const opacity = typeof layer.opacity === "number" && !isNaN(layer.opacity) ? Math.max(0, Math.min(1, layer.opacity)) : 1;
    const groupId = layer.groupId || null;

    let isMissing = false;
    if (type === "image" && layer.filePath) {
      try {
        isMissing = !fs.existsSync(layer.filePath);
      } catch (_) {
        isMissing = true;
      }
    }

    const base = {
      id: layer.id || `layer_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: layer.name || (type === "text" ? "Text Box" : type === "shape" ? "Shape" : "Image Layer"),
      type,
      x,
      y,
      width,
      height,
      rotation,
      opacity,
      visible: layer.visible !== false,
      zIndex: typeof layer.zIndex === "number" ? layer.zIndex : 10,
      groupId,
      transition: this.sanitizeTransition(layer.transition),
      shadowEnabled: Boolean(layer.shadowEnabled),
      shadowColor: typeof layer.shadowColor === "string" ? layer.shadowColor : "#000000",
      shadowOpacity: typeof layer.shadowOpacity === "number" ? Math.max(0, Math.min(100, layer.shadowOpacity)) : 60,
      shadowBlur: typeof layer.shadowBlur === "number" ? Math.max(0, layer.shadowBlur) : 10,
      shadowOffsetX: typeof layer.shadowOffsetX === "number" ? layer.shadowOffsetX : 0,
      shadowOffsetY: typeof layer.shadowOffsetY === "number" ? layer.shadowOffsetY : 4,
    };

    if (type === "image") {
      const resolvedUrl = layer.url || layer.content || (layer.filePath ? pathToFileURL(layer.filePath).href : "");
      const crop = layer.frameCrop && typeof layer.frameCrop === "object" ? layer.frameCrop : {};
      const fitMode = ["fit", "fill"].includes(crop.fitMode) ? crop.fitMode : "fill";
      const zoom = typeof crop.zoom === "number" && crop.zoom >= 1 ? Math.min(5, crop.zoom) : 1;
      const panX = typeof crop.panX === "number" ? Math.max(-100, Math.min(100, crop.panX)) : 0;
      const panY = typeof crop.panY === "number" ? Math.max(-100, Math.min(100, crop.panY)) : 0;
      const frameShape = [
        "none",
        "rectangle",
        "rounded-rect",
        "circle",
        "diamond",
        "triangle",
        "pentagon",
        "hexagon",
        "star",
        "parallelogram",
      ].includes(layer.frameShape)
        ? layer.frameShape
        : (layer.mask === "circle" ? "circle" : layer.mask === "diamond" ? "diamond" : "none");

      return {
        ...base,
        assetId: layer.assetId || null,
        filePath: layer.filePath || null,
        url: resolvedUrl,
        content: resolvedUrl,
        aspectRatio: typeof layer.aspectRatio === "number" && layer.aspectRatio > 0 ? layer.aspectRatio : 1.777,
        aspectLocked: layer.aspectLocked !== false,
        mask: ["circle", "diamond", "square"].includes(layer.mask) ? layer.mask : (layer.mask || "square"),
        frameShape,
        frameCrop: { fitMode, zoom, panX, panY },
        borderRadius:
          typeof layer.borderRadius === "number"
            ? Math.max(0, layer.borderRadius)
            : (frameShape === "rounded-rect" ? 12 : 0),
        stroke: layer.stroke !== undefined ? layer.stroke : "transparent",
        strokeWidth: typeof layer.strokeWidth === "number" ? Math.max(0, layer.strokeWidth) : 0,
        originalAssetId: layer.originalAssetId || null,
        originalFilePath: layer.originalFilePath || null,
        originalUrl: layer.originalUrl || null,
        hasBgRemoved: Boolean(layer.hasBgRemoved),
        isPlaceholder: Boolean(layer.isPlaceholder),
        isMissing,
      };
    }

    if (type === "text") {
      return {
        ...base,
        text: typeof layer.text === "string" ? layer.text : "Heading Text",
        fontFamily: layer.fontFamily || "Inter, sans-serif",
        fontSize: typeof layer.fontSize === "number" ? layer.fontSize : 24,
        fontWeight: layer.fontWeight || "bold",
        color: layer.color || "#ffffff",
        textAlign: ["left", "center", "right"].includes(layer.textAlign) ? layer.textAlign : "left",
        textTransform: layer.textTransform || "none",
        fieldBinding: typeof layer.fieldBinding === "string" ? layer.fieldBinding : null,
        minFontSize: typeof layer.minFontSize === "number" ? Math.max(8, layer.minFontSize) : 12,
        maxLines: typeof layer.maxLines === "number" ? Math.max(1, layer.maxLines) : 4,
        wrap: layer.wrap !== false,
      };
    }

    if (type === "shape") {
      const allowedShapes = [
        "rectangle",
        "rounded-rect",
        "square",
        "circle",
        "ellipse",
        "triangle",
        "diamond",
        "pentagon",
        "hexagon",
        "star",
        "line",
        "arrow",
        "parallelogram",
        "bracket-left",
        "bracket-right",
      ];
      const shape = allowedShapes.includes(layer.shape) ? layer.shape : "rounded-rect";
      const isLineOrArrow = shape === "line" || shape === "arrow" || shape === "bracket-left" || shape === "bracket-right";
      const isRegularProportionShape = [
        "square",
        "circle",
        "triangle",
        "diamond",
        "pentagon",
        "hexagon",
        "star",
      ].includes(shape);

      const fillType = ["solid", "linear-gradient", "radial-gradient", "glass"].includes(layer.fillType)
        ? layer.fillType
        : (layer.gradient ? (layer.gradient.type === "radial" ? "radial-gradient" : "linear-gradient") : "solid");

      return {
        ...base,
        shape,
        fillType,
        fill: layer.fill !== undefined ? layer.fill : (isLineOrArrow ? "transparent" : "#581c87"),
        gradient: this.sanitizeGradient(layer.gradient),
        glassTarget: ["image", "backdrop"].includes(layer.glassTarget) ? layer.glassTarget : "image",
        glassTint: typeof layer.glassTint === "string" ? layer.glassTint : "#ffffff",
        glassOpacity: typeof layer.glassOpacity === "number" ? Math.max(0, Math.min(1, layer.glassOpacity)) : 0.25,
        backgroundBlur: typeof layer.backgroundBlur === "number" ? Math.max(0, Math.min(100, layer.backgroundBlur)) : 16,
        lightweightGlass: Boolean(layer.lightweightGlass),
        sweepHighlight: Boolean(layer.sweepHighlight),
        stroke: layer.stroke !== undefined ? layer.stroke : (isLineOrArrow ? "#f59e0b" : "#a855f7"),
        strokeWidth: typeof layer.strokeWidth === "number" ? Math.max(0, layer.strokeWidth) : (isLineOrArrow ? 3 : 2),
        borderRadius: Array.isArray(layer.borderRadius)
          ? layer.borderRadius.slice(0, 4).map((r) => Math.max(0, Number(r) || 0))
          : (typeof layer.borderRadius === "number"
            ? Math.max(0, layer.borderRadius)
            : (shape === "rounded-rect" ? 12 : 0)),
        cornerRadiiLinked: layer.cornerRadiiLinked !== false,
        maskImage: (layer.maskImage && typeof layer.maskImage === "object") ? (() => {
          const m = layer.maskImage;
          const crop = (m.frameCrop && typeof m.frameCrop === "object") ? m.frameCrop : m;
          const fitMode = ["fit", "fill", "free"].includes(crop.fitMode) ? crop.fitMode : "fill";
          const zoom = typeof crop.zoom === "number" && crop.zoom >= 0.1 ? Math.min(5, crop.zoom) : 1;
          const panX = typeof crop.panX === "number" ? Math.max(-100, Math.min(100, crop.panX)) : 0;
          const panY = typeof crop.panY === "number" ? Math.max(-100, Math.min(100, crop.panY)) : 0;
          const rotation = typeof crop.rotation === "number" ? crop.rotation : 0;
          return {
            url: m.url || m.content || "",
            assetId: m.assetId || null,
            filePath: m.filePath || null,
            originalAssetId: m.originalAssetId || m.assetId || null,
            originalFilePath: m.originalFilePath || m.filePath || null,
            originalUrl: m.originalUrl || m.url || null,
            name: m.name || "Masked Image",
            aspectRatio: typeof m.aspectRatio === "number" && m.aspectRatio > 0 ? m.aspectRatio : 1.777,
            fitMode,
            zoom,
            panX,
            panY,
            rotation,
            frameCrop: { fitMode, zoom, panX, panY, rotation },
          };
        })() : null,
        customPath: Array.isArray(layer.customPath) ? layer.customPath : null,
        isPathEditing: Boolean(layer.isPathEditing),
        aspectLocked:
          typeof layer.aspectLocked === "boolean"
            ? layer.aspectLocked
            : isRegularProportionShape,
      };
    }

    return base;
  }

  sanitizeGradient(g) {
    if (!g || typeof g !== "object") return null;
    const type = g.type === "radial" ? "radial" : "linear";
    const angle = typeof g.angle === "number" ? ((Math.round(g.angle) % 360) + 360) % 360 : 90;
    const rx = g.radialCenter && typeof g.radialCenter.x === "number" ? Math.max(0, Math.min(100, g.radialCenter.x)) : 50;
    const ry = g.radialCenter && typeof g.radialCenter.y === "number" ? Math.max(0, Math.min(100, g.radialCenter.y)) : 50;
    const stops = Array.isArray(g.stops) && g.stops.length >= 2
      ? g.stops
          .map((s) => ({
            position: typeof s.position === "number" ? Math.max(0, Math.min(100, Math.round(s.position))) : 0,
            color: typeof s.color === "string" ? s.color : "#ffffff",
            opacity: typeof s.opacity === "number" ? Math.max(0, Math.min(1, s.opacity)) : 1,
          }))
          .sort((a, b) => a.position - b.position)
      : [
          { position: 0, color: "#2e0854", opacity: 1 },
          { position: 100, color: "#fdd835", opacity: 1 },
        ];
    return { type, angle, radialCenter: { x: rx, y: ry }, stops };
  }

  sanitizeTransition(t) {
    if (!t || typeof t !== "object") return null;
    const allowedTransitions = [
      "none",
      "fade",
      "slide-left",
      "slide-right",
      "slide-top",
      "slide-bottom",
      "slide-fade-left",
      "slide-fade-right",
      "slide-fade-top",
      "slide-fade-bottom",
      "scale-fade",
      "wipe",
    ];
    const entrance = t.entrance || {};
    const exit = t.exit || {};
    return {
      entrance: {
        type: allowedTransitions.includes(entrance.type) ? entrance.type : "fade",
        duration: typeof entrance.duration === "number" ? Math.max(50, Math.min(5000, entrance.duration)) : 500,
        easing: typeof entrance.easing === "string" ? entrance.easing : "ease-out",
        sweepHighlight: Boolean(entrance.sweepHighlight || t.sweepHighlight),
      },
      exit: {
        type: allowedTransitions.includes(exit.type) ? exit.type : "fade",
        duration: typeof exit.duration === "number" ? Math.max(50, Math.min(5000, exit.duration)) : 400,
        easing: typeof exit.easing === "string" ? exit.easing : "ease-in",
      },
      animateGroup: t.animateGroup !== false,
    };
  }

  persistDesigns() {
    try {
      const tempPath = `${this.designsFilePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.designs, null, 2), "utf8");
      fs.renameSync(tempPath, this.designsFilePath);
      return true;
    } catch (err) {
      console.error("[DesignStudio] Failed to persist designs:", err);
      return false;
    }
  }

  listDesigns() {
    // Re-verify missing asset status
    return this.designs.map((d) => this.sanitizeDesign(d));
  }

  getDesign(id) {
    return this.designs.find((d) => d.id === id) || null;
  }

  saveDesign(designData) {
    if (!designData) throw new Error("No design data provided");

    const sanitized = this.sanitizeDesign({
      ...designData,
      updatedAt: new Date().toISOString(),
    });

    const existingIndex = this.designs.findIndex((d) => d.id === sanitized.id);
    if (existingIndex >= 0) {
      this.designs[existingIndex] = sanitized;
    } else {
      this.designs.push(sanitized);
    }

    if ((designData.setAsDefault || designData.isDefault) && sanitized.role && sanitized.role !== "custom") {
      this.roleAssignments[sanitized.role] = sanitized.id;
      this.persistRoleAssignments();
    }

    this.persistDesigns();
    return sanitized;
  }

  deleteDesign(id) {
    const prevCount = this.designs.length;
    this.designs = this.designs.filter((d) => d.id !== id);

    if (this.designs.length < prevCount) {
      this.persistDesigns();
      this.cleanupOrphanAssets();
    }

    // If deleting currently live design, hide it
    if (this.activeLiveOverlay && this.activeLiveOverlay.designId === id) {
      this.activeLiveOverlay = null;
    }

    return { ok: true };
  }

  importImageFile(sourcePath) {
    if (!sourcePath || typeof sourcePath !== "string") {
      throw new Error("Invalid source image path");
    }

    if (!fs.existsSync(sourcePath)) {
      throw new Error(`File not found: ${sourcePath}`);
    }

    const ext = path.extname(sourcePath).replace(".", "").toLowerCase();
    const allowed = ["png", "jpg", "jpeg", "webp"];
    if (!allowed.includes(ext)) {
      throw new Error(`Unsupported format '.${ext}'. Only PNG, JPEG, and WebP are supported.`);
    }

    // Compute SHA-256 for deduplication
    const buffer = fs.readFileSync(sourcePath);
    if (buffer.length === 0) {
      throw new Error("Cannot import an empty image file.");
    }

    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const normalizedExt = ext === "jpeg" ? "jpg" : ext;
    const destFileName = `${hash}.${normalizedExt}`;
    const destFilePath = path.join(this.designAssetsPath, destFileName);

    // If destination does not exist, copy into managed storage
    if (!fs.existsSync(destFilePath)) {
      fs.writeFileSync(destFilePath, buffer);
    }

    // Validate and measure dimensions via nativeImage or fallback
    const size = getImageDimensions(buffer, destFilePath);
    if (!size || size.width === 0 || size.height === 0) {
      // Clean up corrupt asset if it was just written and not referenced
      try {
        if (fs.existsSync(destFilePath)) fs.unlinkSync(destFilePath);
      } catch (_) {}
      throw new Error("Failed to decode image data. The file may be corrupt or unreadable.");
    }

    return {
      assetId: hash,
      fileName: destFileName,
      originalName: path.basename(sourcePath),
      filePath: destFilePath,
      url: pathToFileURL(destFilePath).href,
      width: size.width,
      height: size.height,
      aspectRatio: size.width / size.height,
      format: normalizedExt,
      sizeBytes: buffer.length,
    };
  }

  async promptAndImportImage(parentWindow) {
    const activeDialog = electronModule?.dialog;
    if (!activeDialog || typeof activeDialog.showOpenDialog !== "function") {
      throw new Error("Native file dialog is not available in current process.");
    }

    const { canceled, filePaths } = await activeDialog.showOpenDialog(parentWindow, {
      title: "Import Overlay Image",
      buttonLabel: "Import Image",
      properties: ["openFile"],
      filters: [
        { name: "Image Files (PNG, JPG, WebP)", extensions: ["png", "jpg", "jpeg", "webp"] },
      ],
    });

    if (canceled || !filePaths || filePaths.length === 0) {
      return { canceled: true };
    }

    try {
      const asset = this.importImageFile(filePaths[0]);
      return { ok: true, asset };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  cleanupOrphanAssets() {
    if (!this.designAssetsPath || !fs.existsSync(this.designAssetsPath)) return;

    try {
      const referencedAssetIds = new Set();
      for (const design of this.designs) {
        if (Array.isArray(design.layers)) {
          for (const layer of design.layers) {
            if (layer.assetId) referencedAssetIds.add(layer.assetId);
          }
        }
      }

      const files = fs.readdirSync(this.designAssetsPath);
      let removedCount = 0;
      for (const file of files) {
        const hash = file.split(".")[0];
        if (hash && !referencedAssetIds.has(hash)) {
          const filePath = path.join(this.designAssetsPath, file);
          try {
            fs.unlinkSync(filePath);
            removedCount++;
          } catch (e) {
            console.warn(`[DesignStudio] Could not remove orphan asset ${file}:`, e.message);
          }
        }
      }
      if (removedCount > 0) {
        console.log(`[DesignStudio] Cleaned up ${removedCount} orphan assets.`);
      }
    } catch (err) {
      console.error("[DesignStudio] Error during orphan asset cleanup:", err);
    }
  }

  presentDesign(design, target = "stream", onLiveUpdate) {
    const sanitized = this.sanitizeDesign(design);
    const resolvedTarget = target || "stream";
    this.activeLiveOverlay = {
      designId: sanitized.id,
      name: sanitized.name,
      target: resolvedTarget,
      layers: sanitized.layers,
      isLive: true,
      updatedAt: new Date().toISOString(),
    };

    if (typeof onLiveUpdate === "function") {
      onLiveUpdate({
        target: resolvedTarget,
        layers: sanitized.layers,
      });
    }

    return { ok: true, activeLiveOverlay: this.activeLiveOverlay };
  }

  hideDesign(onLiveUpdate) {
    this.activeLiveOverlay = null;

    if (typeof onLiveUpdate === "function") {
      onLiveUpdate({
        target: "none",
        layers: [],
      });
    }

    return { ok: true, isLive: false };
  }

  getLiveState() {
    return this.activeLiveOverlay || { isLive: false, layers: [] };
  }

  loadLiveControls() {
    this.liveControlsFilePath = path.join(this.userDataPath, "live_controls.json");
    try {
      if (fs.existsSync(this.liveControlsFilePath)) {
        const raw = fs.readFileSync(this.liveControlsFilePath, "utf8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Disarm any previously armed schedules on restart per requirement:
          // "do not automatically re-arm schedules or replay missed events after restart"
          this.liveControls = parsed.map((c) => {
            const item = this.sanitizeLiveControl(c);
            if (item.timing) item.timing.scheduleArmed = false;
            return item;
          });
          return;
        }
      }
    } catch (err) {
      console.error("[DesignStudio] Failed to load live_controls.json:", err);
    }
    this.liveControls = [];
  }

  persistLiveControls() {
    try {
      if (!this.liveControlsFilePath) return false;
      const tempPath = `${this.liveControlsFilePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.liveControls, null, 2), "utf8");
      fs.renameSync(tempPath, this.liveControlsFilePath);
      return true;
    } catch (err) {
      console.error("[DesignStudio] Failed to persist live controls:", err);
      return false;
    }
  }

  listLiveControls() {
    return this.liveControls.map((c) => this.sanitizeLiveControl(c));
  }

  getLiveControl(id) {
    return this.liveControls.find((c) => c.id === id) || null;
  }

  saveLiveControl(controlData) {
    if (!controlData) throw new Error("No live control data provided");
    const sanitized = this.sanitizeLiveControl({
      ...controlData,
      updatedAt: new Date().toISOString(),
    });
    const existingIndex = this.liveControls.findIndex((c) => c.id === sanitized.id);
    if (existingIndex >= 0) {
      this.liveControls[existingIndex] = sanitized;
    } else {
      this.liveControls.push(sanitized);
    }
    this.persistLiveControls();
    return sanitized;
  }

  deleteLiveControl(id) {
    const prevCount = this.liveControls.length;
    this.liveControls = this.liveControls.filter((c) => c.id !== id);
    if (this.liveControls.length < prevCount) {
      this.persistLiveControls();
    }
    return { ok: true };
  }

  clearAllLiveControls() {
    this.liveControls = [];
    this.persistLiveControls();
    return { ok: true };
  }

  sanitizeLiveControl(c) {
    if (!c || typeof c !== "object") {
      return {
        id: `ctrl_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        label: "Live Control",
        designId: null,
        targetType: "design",
        targetId: null,
        thumbnail: "",
        snapshotLayers: [],
        timing: { delaySeconds: 0, autoRemoveSeconds: 0, scheduledDate: "", scheduledTime: "", scheduleArmed: false },
        transition: { entrance: { type: "fade", duration: 500, easing: "ease-out" }, exit: { type: "fade", duration: 400, easing: "ease-in" } },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    const timing = c.timing || {};
    const rawDelay = timing.delaySeconds ?? timing.delaySec;
    const rawAutoRemove = timing.autoRemoveSeconds ?? timing.autoRemoveSec;
    const rawLayers = Array.isArray(c.snapshotLayers) ? c.snapshotLayers : (Array.isArray(c.layers) ? c.layers : []);

    return {
      id: c.id || `ctrl_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      label: (c.label && String(c.label).trim()) || (c.name && String(c.name).trim()) || "Live Control",
      designId: c.designId || null,
      targetType: ["element", "group", "design"].includes(c.targetType) ? c.targetType : (["element", "group", "design"].includes(c.type) ? c.type : "design"),
      targetId: c.targetId || null,
      thumbnail: typeof c.thumbnail === "string" ? c.thumbnail : (typeof c.thumbnailSvg === "string" ? c.thumbnailSvg : ""),
      snapshotLayers: rawLayers.map((l) => this.sanitizeLayer(l)),
      timing: {
        delaySeconds: typeof rawDelay === "number" ? Math.max(0, Math.min(3600, rawDelay)) : 0,
        autoRemoveSeconds: typeof rawAutoRemove === "number" ? Math.max(0, Math.min(3600, rawAutoRemove)) : 0,
        scheduledDate: typeof timing.scheduledDate === "string" ? timing.scheduledDate : "",
        scheduledTime: typeof timing.scheduledTime === "string" ? timing.scheduledTime : (typeof timing.scheduleTime === "string" ? timing.scheduleTime : ""),
        scheduleArmed: Boolean(timing.scheduleArmed),
      },
      transition: this.sanitizeTransition(c.transition),
      createdAt: c.createdAt || new Date().toISOString(),
      updatedAt: c.updatedAt || new Date().toISOString(),
    };
  }

  saveProcessedAsset({ base64Data, originalAssetId }) {
    if (!base64Data || typeof base64Data !== "string") throw new Error("Invalid image data");
    const matches = base64Data.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
    const rawBase64 = matches ? matches[2] : base64Data;
    const buffer = Buffer.from(rawBase64, "base64");
    if (buffer.length === 0) throw new Error("Empty image buffer");

    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const destFileName = `${hash}_nobg.png`;
    const destFilePath = path.join(this.designAssetsPath, destFileName);

    fs.writeFileSync(destFilePath, buffer);
    const size = getImageDimensions(buffer, destFilePath);

    return {
      assetId: hash,
      fileName: destFileName,
      filePath: destFilePath,
      url: pathToFileURL(destFilePath).href,
      width: size.width || 0,
      height: size.height || 0,
      aspectRatio: size.width && size.height ? size.width / size.height : 1,
      format: "png",
      sizeBytes: buffer.length,
      originalAssetId: originalAssetId || null,
    };
  }

  resolveTemplateLayers(template, role, content) {
    if (!template || !Array.isArray(template.layers)) return [];
    const sourceContent = content || {};

    const FIELD_ALIASES = {
      verseText: ["verseText", "verse", "text", "body", "scripture", "passageText"],
      reference: ["reference", "ref", "title", "passage", "bookVerse"],
      version: ["version", "translation"],
      heading: ["heading", "title", "name", "header"],
      message: ["message", "body", "description", "details"],
      footer: ["footer", "subtext", "caption"],
      name: ["name", "speakerName", "speaker", "person"],
      title: ["title", "role", "designation"],
      organization: ["organization", "organisation", "church", "ministry"],
    };

    const normalize = (fieldId) => {
      if (!fieldId || typeof fieldId !== "string") return fieldId;
      const lower = fieldId.trim().toLowerCase();
      for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
        if (aliases.some((a) => a.toLowerCase() === lower)) {
          return canonical;
        }
      }
      return fieldId;
    };

    const getFieldValue = (fieldKey) => {
      if (!fieldKey) return undefined;
      const canonical = normalize(fieldKey);
      let val = sourceContent[fieldKey];
      if (val === undefined && canonical) {
        val = sourceContent[canonical];
      }
      if (val === undefined && FIELD_ALIASES[canonical]) {
        for (const alias of FIELD_ALIASES[canonical]) {
          if (sourceContent[alias] !== undefined) {
            val = sourceContent[alias];
            break;
          }
        }
      }
      return typeof val === "string" ? val : undefined;
    };

    return template.layers.map((l) => {
      const layer = { ...l };
      // Deep-clone maskImage to preserve transforms and frameCrop intact
      if (layer.maskImage) {
        layer.maskImage = {
          ...layer.maskImage,
          frameCrop: layer.maskImage.frameCrop ? { ...layer.maskImage.frameCrop } : undefined,
        };
      }

      if (layer.type === "text") {
        // 1. Explicit fieldBinding or roleBinding
        let targetField = layer.fieldBinding || layer.roleBinding;
        if (targetField) {
          const parts = targetField.split(".");
          const rawFieldId = parts.length === 2 ? parts[1] : parts[0];
          const val = getFieldValue(rawFieldId);
          if (val !== undefined && val.trim().length > 0) {
            layer.text = val;
            return layer;
          }
        }

        // 2. Mustache replacement in layer.text: {{verseText}}, {{reference}}, {{version}}, etc.
        if (typeof layer.text === "string" && layer.text.includes("{{")) {
          let updatedText = layer.text;
          const tokens = layer.text.match(/\{\{([^}]+)\}\}/g);
          if (tokens) {
            for (const token of tokens) {
              const key = token.replace(/\{\{|\}\}/g, "").trim();
              const val = getFieldValue(key);
              if (val !== undefined) {
                updatedText = updatedText.replace(token, val);
              }
            }
            layer.text = updatedText;
            return layer;
          }
        }

        // 3. Infer binding by layer name or text content if fieldBinding is unset
        const inferredKey = normalize(layer.name) || normalize(layer.text);
        if (inferredKey && ["verseText", "reference", "version", "heading", "message", "name", "title"].includes(inferredKey)) {
          const val = getFieldValue(inferredKey);
          if (val !== undefined && val.trim().length > 0) {
            layer.text = val;
            return layer;
          }
        }
      }
      return layer;
    });
  }

  validateRoleTemplate(roleOrDesign, layers) {
    let role = typeof roleOrDesign === "string" ? roleOrDesign : roleOrDesign?.role;
    let checkLayers = Array.isArray(layers) ? layers : (roleOrDesign?.layers || []);

    if (!role || role === "custom") {
      return { valid: true, missingFields: [] };
    }

    const ROLE_REQUIRED_FIELDS = {
      bible: ["verseText", "reference"],
      announcement: ["heading", "message"],
      speaker: ["name"],
    };

    const required = ROLE_REQUIRED_FIELDS[role] || [];
    if (required.length === 0) {
      return { valid: true, missingFields: [] };
    }

    const FIELD_ALIASES = {
      verseText: ["verseText", "verse", "text", "body", "scripture", "passageText"],
      reference: ["reference", "ref", "title", "passage", "bookVerse"],
      version: ["version", "translation"],
      heading: ["heading", "title", "name", "header"],
      message: ["message", "body", "description", "details"],
      footer: ["footer", "subtext", "caption"],
      name: ["name", "speakerName", "speaker", "person"],
      title: ["title", "role", "designation"],
      organization: ["organization", "organisation", "church", "ministry"],
    };

    const normalize = (fieldId) => {
      if (!fieldId || typeof fieldId !== "string") return fieldId;
      const lower = fieldId.trim().toLowerCase();
      for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
        if (aliases.some((a) => a.toLowerCase() === lower)) {
          return canonical;
        }
      }
      return fieldId;
    };

    const boundFields = new Set();
    for (const layer of checkLayers) {
      if (layer && layer.type === "text") {
        if (layer.fieldBinding || layer.roleBinding) {
          const binding = layer.fieldBinding || layer.roleBinding;
          const parts = binding.split(".");
          const rawField = parts.length === 2 ? parts[1] : parts[0];
          boundFields.add(rawField);
          boundFields.add(normalize(rawField));
        }
        if (typeof layer.text === "string" && layer.text.includes("{{")) {
          const tokens = layer.text.match(/\{\{([^}]+)\}\}/g);
          if (tokens) {
            for (const token of tokens) {
              const key = token.replace(/\{\{|\}\}/g, "").trim();
              boundFields.add(key);
              boundFields.add(normalize(key));
            }
          }
        }
        const nameKey = normalize(layer.name);
        if (nameKey) {
          boundFields.add(nameKey);
        }
        const textKey = normalize(layer.text);
        if (textKey) {
          boundFields.add(textKey);
        }
      }
    }

    const missingFields = required.filter((f) => !boundFields.has(f));
    if (missingFields.length > 0) {
      return {
        valid: false,
        missingFields,
        message: `${role} template requires layers bound to: ${missingFields.join(" and ")}.`,
      };
    }

    return { valid: true, missingFields: [] };
  }
}

const designStudioService = new DesignStudioService();

module.exports = {
  DesignStudioService,
  designStudioService,
};
