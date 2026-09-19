import React, { useRef, useEffect, useState } from "react";
import { renderAnimatedLyrics } from "../controller/LyricAnimationEngine";

// ─── Live Camera canvas ref (shared across renderContentSlot calls) ────────────
// Allocated once per DisplayCanvas instance so the painting useEffect below
// can always target the same canvas element even when the component re-renders.
const _liveCameraImgCache = {}; // keyed by deviceId

function getContrastTextColor(hexColor) {
  if (!hexColor || typeof hexColor !== "string") return "#000000";
  let hex = hexColor.replace("#", "").trim();
  if (hex.length === 3) {
    hex = hex.split("").map((c) => c + c).join("");
  }
  if (hex.length !== 6) return "#000000";
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return "#000000";
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#000000" : "#FFFFFF";
}

function getShadowRgba(color = "#000000", opacity = 60) {
  const alpha = typeof opacity === "number" ? Math.max(0, Math.min(100, opacity)) / 100 : 0.6;
  if (!color) return `rgba(0,0,0,${alpha})`;
  let c = String(color).trim();
  if (c.startsWith("#")) {
    let hex = c.slice(1);
    if (hex.length === 3) hex = hex.split("").map((x) => x + x).join("");
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16) || 0;
      const g = parseInt(hex.substring(2, 4), 16) || 0;
      const b = parseInt(hex.substring(4, 6), 16) || 0;
      return `rgba(${r},${g},${b},${alpha})`;
    }
  }
  return c;
}

function formatLayerShadow(layer) {
  if (!layer || !layer.shadowEnabled) return "none";
  const ox = typeof layer.shadowOffsetX === "number" ? layer.shadowOffsetX : 0;
  const oy = typeof layer.shadowOffsetY === "number" ? layer.shadowOffsetY : 4;
  const blur = typeof layer.shadowBlur === "number" ? layer.shadowBlur : 10;
  const rgba = getShadowRgba(layer.shadowColor, layer.shadowOpacity);
  return `${ox}px ${oy}px ${blur}px ${rgba}`;
}

function renderLiveDesignShape(layer) {
  if (!layer) return null;
  const shape = layer.shape || "rounded-rect";
  const isLine = shape === "line";
  const isArrow = shape === "arrow";
  const isLineOrArrow = isLine || isArrow;
  const sw = typeof layer.strokeWidth === "number" ? layer.strokeWidth : (isLineOrArrow ? 3 : 2);
  const strokeColor = sw > 0 && layer.stroke && layer.stroke !== "transparent" ? layer.stroke : "none";
  const strokeW = sw > 0 ? sw : 0;
  const fillColor = isLineOrArrow ? "transparent" : (layer.fill || "#581c87");
  const shadowFilter = layer.shadowEnabled ? `drop-shadow(${formatLayerShadow(layer)})` : "none";
  const shadowBox = layer.shadowEnabled ? formatLayerShadow(layer) : "none";
  const gradientCss = layer.gradient && Array.isArray(layer.gradient.stops) && layer.gradient.stops.length >= 2
    ? (layer.gradient.type === "radial"
        ? `radial-gradient(circle at ${layer.gradient.radialCenter?.x ?? 50}% ${layer.gradient.radialCenter?.y ?? 50}%, ${layer.gradient.stops.map(s => `${getShadowRgba(s.color, Math.round((s.opacity ?? 1) * 100))} ${s.position}%`).join(", ")})`
        : `linear-gradient(${layer.gradient.angle ?? 90}deg, ${layer.gradient.stops.map(s => `${getShadowRgba(s.color, Math.round((s.opacity ?? 1) * 100))} ${s.position}%`).join(", ")})`)
    : null;
  const bgFill = gradientCss || fillColor;
  const gradId = `disp_grad_${layer.id || Math.random().toString(36).substr(2, 6)}`;

  if (shape === "rectangle" || shape === "square") {
    return (
      <div
        data-studio-shape-content="true"
        style={{
          width: "100%",
          height: `${(layer.height || 12) * 4}px`,
          background: bgFill,
          border: strokeW > 0 && strokeColor !== "none" ? `${strokeW}px solid ${strokeColor}` : "none",
          borderRadius: "0px",
          boxShadow: shadowBox,
          opacity,
        }}
      />
    );
  }

  if (shape === "rounded-rect") {
    const radius = typeof layer.borderRadius === "number" ? layer.borderRadius : 12;
    return (
      <div
        data-studio-shape-content="true"
        style={{
          width: "100%",
          height: `${(layer.height || 12) * 4}px`,
          background: bgFill,
          border: strokeW > 0 && strokeColor !== "none" ? `${strokeW}px solid ${strokeColor}` : "none",
          borderRadius: `${radius}px`,
          boxShadow: shadowBox,
          opacity,
        }}
      />
    );
  }

  if (shape === "line") {
    return (
      <div data-studio-shape-content="true" style={{ width: "100%", height: `${Math.max(12, (layer.height || 4) * 4)}px`, filter: shadowFilter, opacity }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
          {strokeW > 0 && strokeColor !== "none" && (
            <line x1="0" y1="50" x2="100" y2="50" stroke={strokeColor} strokeWidth={strokeW} vectorEffect="non-scaling-stroke" />
          )}
        </svg>
      </div>
    );
  }

  if (shape === "arrow") {
    return (
      <div data-studio-shape-content="true" style={{ width: "100%", height: `${Math.max(16, (layer.height || 8) * 4)}px`, filter: shadowFilter, opacity }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
          {strokeW > 0 && strokeColor !== "none" && (
            <>
              <line x1="0" y1="50" x2="80" y2="50" stroke={strokeColor} strokeWidth={strokeW} vectorEffect="non-scaling-stroke" />
              <polygon points="76,28 100,50 76,72" fill={strokeColor} stroke={strokeColor} strokeWidth={Math.max(1, Math.round(strokeW / 2))} strokeLinejoin="round" />
            </>
          )}
        </svg>
      </div>
    );
  }

  if (shape === "bracket-left") {
    return (
      <div data-studio-shape-content="true" style={{ width: "100%", height: `${(layer.height || 12) * 4}px`, filter: shadowFilter, opacity }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
          {strokeW > 0 && strokeColor !== "none" && (
            <polyline points="35,2 4,2 4,98 35,98" fill="none" stroke={strokeColor} strokeWidth={strokeW} strokeLinecap="square" strokeLinejoin="miter" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
      </div>
    );
  }

  if (shape === "bracket-right") {
    return (
      <div data-studio-shape-content="true" style={{ width: "100%", height: `${(layer.height || 12) * 4}px`, filter: shadowFilter, opacity }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
          {strokeW > 0 && strokeColor !== "none" && (
            <polyline points="65,2 96,2 96,98 65,98" fill="none" stroke={strokeColor} strokeWidth={strokeW} strokeLinecap="square" strokeLinejoin="miter" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
      </div>
    );
  }

  const svgFill = gradientCss ? `url(#${gradId})` : fillColor;

  let svgBody = null;
  if (shape === "circle" || shape === "ellipse") {
    svgBody = <ellipse cx="50" cy="50" rx="49" ry="49" fill={svgFill} stroke={strokeColor} strokeWidth={strokeW} vectorEffect="non-scaling-stroke" />;
  } else if (shape === "parallelogram") {
    svgBody = <polygon points="12,2 98,2 86,98 0,98" fill={svgFill} stroke={strokeColor} strokeWidth={strokeW} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
  } else if (shape === "triangle") {
    svgBody = <polygon points="50,2 98,98 2,98" fill={svgFill} stroke={strokeColor} strokeWidth={strokeW} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
  } else if (shape === "diamond") {
    svgBody = <polygon points="50,2 98,50 50,98 2,50" fill={svgFill} stroke={strokeColor} strokeWidth={strokeW} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
  } else if (shape === "pentagon") {
    svgBody = <polygon points="50,2 97.55,36.5 79.39,94 20.61,94 2.45,36.5" fill={svgFill} stroke={strokeColor} strokeWidth={strokeW} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
  } else if (shape === "hexagon") {
    svgBody = <polygon points="50,2 96,26.5 96,73.5 50,98 4,73.5 4,26.5" fill={svgFill} stroke={strokeColor} strokeWidth={strokeW} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
  } else if (shape === "star") {
    svgBody = <polygon points="50,2 61.8,36.5 98,36.5 68.7,57.8 79.9,93.5 50,71.8 20.1,93.5 31.3,57.8 2,36.5 38.2,36.5" fill={svgFill} stroke={strokeColor} strokeWidth={strokeW} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
  }

  return (
    <div data-studio-shape-content="true" style={{ width: "100%", height: `${(layer.height || 12) * 4}px`, filter: shadowFilter, opacity }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
        {gradientCss && layer.gradient && (
          <defs>
            {layer.gradient.type === "radial" ? (
              <radialGradient id={gradId} cx={`${layer.gradient.radialCenter?.x ?? 50}%`} cy={`${layer.gradient.radialCenter?.y ?? 50}%`} r="50%">
                {(layer.gradient.stops || []).map((s, idx) => (
                  <stop key={idx} offset={`${s.position}%`} stopColor={s.color} stopOpacity={s.opacity ?? 1} />
                ))}
              </radialGradient>
            ) : (
              <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
                {(layer.gradient.stops || []).map((s, idx) => (
                  <stop key={idx} offset={`${s.position}%`} stopColor={s.color} stopOpacity={s.opacity ?? 1} />
                ))}
              </linearGradient>
            )}
          </defs>
        )}
        {svgBody}
      </svg>
    </div>
  );
}

/**
 * Render text with real-time word tracking — ONE WORD AHEAD model.
 *
 * Visual states:
 *   - Confirmed/Read words (index <= currentWordIndex): solid white, bold
 *   - Active/Next word (index === currentWordIndex + 1): cyan underline — the word to say next
 *   - Upcoming words (index > currentWordIndex + 1): 40% opacity — not yet reached
 *
 * When currentWordIndex is -1 (initial), word 0 is highlighted as the active word.
 */
function renderTrackedSceneWords(text, currentWordIndex, isTracking) {
  if (!text) return null;
  if (!isTracking || typeof currentWordIndex !== "number" || currentWordIndex < -1) {
    return text;
  }

  const segments = text.split(/(\s+)/);
  let wordCounter = 0;

  return segments.map((seg, idx) => {
    if (/^\s+$/.test(seg)) {
      return <span key={idx}>{seg}</span>;
    }

    const tokenIdx = wordCounter++;
    const isRead = tokenIdx <= currentWordIndex;
    const isActive = tokenIdx === currentWordIndex + 1;

    return (
      <span
        key={idx}
        className={`transition-all duration-150 ${
          isActive
            ? "text-cyan-300 font-bold underline decoration-cyan-400 decoration-2 underline-offset-4"
            : isRead
            ? "text-white font-semibold"
            : "text-white/40"
        }`}
      >
        {seg}
      </span>
    );
  });
}

/**
 * DisplayCanvas — Unified 4-Band Compositor (FR-4.13, FR-4.14, FR-4.15)
 *
 * Ordered Bands (back-to-front):
 * 1. Background Layer: at most one active image/video/color, fills canvas (FR-4.17, FR-4.19)
 * 2. Content Slot: exactly one active content type: 'bible' | 'scene' | 'presentation' | 'timer' | 'none'
 * 3. Pinned Layers: zero or more persistent image/video/text overlays with normalized (0.0-1.0) coords (FR-4.20, FR-4.21, FR-4.25)
 * 4. Chrome: blackout, logo, OCS branding, split timer (FR-1.x, topmost)
 */
export default function DisplayCanvas({
  canvasState = {},
  mode = "general", // 'general' | 'speaker' | 'controller' | 'preview'
  isEditable = false,
  selectedLayerId = null,
  onSelectLayer,
  onUpdateLayer,
}) {
  const videoRef = useRef(null);
  const [alignProgress, setAlignProgress] = useState({ wordIndex: -1, totalTokens: 0 });

  const {
    background = {
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
    contentSlot = {
      type: "none",
      data: null,
    },
    pinnedLayers = [],
    chrome = {
      blackout: false,
      logo: false,
      logoUrl: null,
      brandingText: null,
      timerSplit: false,
      timerCountdown: null,
    },
  } = canvasState;

  // Listen to real-time word tracking events
  useEffect(() => {
    const unsub = window.electron?.Aligner?.onAlignmentUpdate?.((update) => {
      setAlignProgress({
        wordIndex: update.wordIndex ?? -1,
        totalTokens: update.totalTokens ?? 0,
      });
    });
    return () => unsub?.();
  }, []);

  // Reset alignment progress when contentSlot changes page
  useEffect(() => {
    setAlignProgress({ wordIndex: -1, totalTokens: 0 });
  }, [contentSlot?.data?.pageIndex, contentSlot?.data?.sceneId]);

  // ── Live-camera canvas ref & transition state for 'live-camera' Content Slot ─
  const liveCameraCanvasRef = useRef(null);
  const liveCameraIsDirtyRef = useRef(false);
  const liveCameraAnimRef = useRef(null);
  const [hasLiveFrame, setHasLiveFrame] = useState(false);
  const [isCameraMirrored, setIsCameraMirrored] = useState(false);
  const liveCameraEffectRef = useRef(null);
  const [liveCameraEffect, setLiveCameraEffect] = useState(null);

  // ── Live-camera & Live-output single source of truth render loop ─────
  useEffect(() => {
    if (contentSlot?.type !== 'live-camera' && contentSlot?.type !== 'live-output') return;

    const deviceId = contentSlot?.data?.deviceId || 'live-output';

    const cached = _liveCameraImgCache['live-output'] || _liveCameraImgCache[deviceId] || _liveCameraImgCache['default'];
    if (cached && cached.complete && cached.naturalWidth > 0) {
      setHasLiveFrame(true);
      liveCameraIsDirtyRef.current = true;
    } else {
      setHasLiveFrame(false);
      liveCameraIsDirtyRef.current = true;
    }

    // Render loop directly drawing composited live output stream
    const renderLoop = () => {
      if (liveCameraIsDirtyRef.current && liveCameraCanvasRef.current) {
        const img = _liveCameraImgCache['live-output'] || _liveCameraImgCache[deviceId] || _liveCameraImgCache['default'];
        if (img && img.complete && img.naturalWidth > 0) {
          const canvas = liveCameraCanvasRef.current;
          const ctx = canvas.getContext('2d', { alpha: false });
          if (ctx) {
            if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
              canvas.width = img.naturalWidth;
              canvas.height = img.naturalHeight;
            }
            const eff = liveCameraEffectRef.current;
            if (eff && eff.filter && eff.filter !== "none") {
              ctx.filter = eff.filter;
            } else {
              ctx.filter = "none";
            }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            if (eff && eff.overlayColor && eff.overlayColor !== "transparent") {
              ctx.save();
              ctx.filter = "none";
              ctx.fillStyle = eff.overlayColor;
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.restore();
            }
            liveCameraIsDirtyRef.current = false;
          }
        }
      }
      liveCameraAnimRef.current = requestAnimationFrame(renderLoop);
    };
    liveCameraAnimRef.current = requestAnimationFrame(renderLoop);

    const handleFrame = (fromId, data, isMirrored, effect) => {
      if (!data) return;
      if (isMirrored !== undefined) {
        setIsCameraMirrored(!!isMirrored);
      }
      if (effect) {
        liveCameraEffectRef.current = effect;
        setLiveCameraEffect(effect);
      }
      const key = fromId || 'live-output';
      const img = _liveCameraImgCache[key] || new Image();
      _liveCameraImgCache[key] = img;
      const src = data.startsWith('data:') ? data : `data:image/jpeg;base64,${data}`;
      img.onload = () => {
        liveCameraIsDirtyRef.current = true;
        setHasLiveFrame(true);
      };
      img.src = src;
    };

    // Single source of truth: Subscribe to composited live output stream from switcher mixing engine
    let cleanupLiveOutput = null;
    if (window.electron?.Switcher?.onLiveOutputFrame) {
      cleanupLiveOutput = window.electron.Switcher.onLiveOutputFrame((payload) => {
        const frameData = payload?.data || payload;
        if (frameData) {
          handleFrame('live-output', frameData, payload?.isMirrored, payload?.effect);
          if (deviceId) {
            handleFrame(deviceId, frameData, payload?.isMirrored, payload?.effect);
          }
        }
      });
    }

    let cleanupMirror = null;
    if (window.electron?.Switcher?.onDisplayMirrorFrame) {
      cleanupMirror = window.electron.Switcher.onDisplayMirrorFrame((payload) => {
        if (!payload?.data) return;
        if (deviceId === payload.destination || payload.destination === mode) {
          handleFrame(payload.destination, payload.data);
        }
      });
    }

    return () => {
      if (liveCameraAnimRef.current) cancelAnimationFrame(liveCameraAnimRef.current);
      if (cleanupLiveOutput) cleanupLiveOutput();
      if (cleanupMirror) cleanupMirror();
    };
  }, [contentSlot?.type, contentSlot?.data?.deviceId]);

  // Auto-play / reload background video when URL changes
  useEffect(() => {
    if (background?.type === "video" && background?.url && videoRef.current) {
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    }
  }, [background?.url, background?.type]);

  // Handle Layer Selection (Editable / Controller mode)
  const handleLayerClick = (e, layerId) => {
    if (!isEditable) return;
    e.stopPropagation();
    onSelectLayer && onSelectLayer(layerId);
  };

  // Helper to render Content Slot band (Band 2)
  const renderContentSlot = () => {
    if (chrome?.blackout) return null;
    if (!contentSlot || contentSlot.type === "none" || !contentSlot.data) {
      return null;
    }

    const { type, data } = contentSlot;

    switch (type) {
      case "bible": {
        const { title, body, readAlong, version, translation, isPresentationOverlay, overlayPrompt } = data || {};
        const safeBody = (body || "").trim();
        const bodyLen = safeBody.length;
        const fontSize =
          bodyLen > 600
            ? "clamp(12px, 2.6cqw, 2.8vw)"
            : bodyLen > 300
            ? "clamp(14px, 3.2cqw, 3.6vw)"
            : bodyLen > 150
            ? "clamp(16px, 4.2cqw, 4.5vw)"
            : "clamp(18px, 5.2cqw, 5.5vw)";
        const useReadAlong =
          !!readAlong?.enabled && Array.isArray(readAlong.tokens) && readAlong.tokens.length > 0;

        // Manual highlight support — configurable colour with stable identity resolution
        const manualHighlightSet = new Set(data?.manualHighlights || []);
        const verseOffsets = data?.verseOffsets || {};
        const hasManualHighlights = manualHighlightSet.size > 0;
        const highlightColor = data?.bibleHighlightColor || canvasState?.bibleHighlightColor || "#FFEB3B";
        const highlightTextColor = getContrastTextColor(highlightColor);

        /**
         * Resolve whether an absolute token index (within the joined body) is manually highlighted.
         * Resolves via verseOffsets using stable schema `${version}:${bookIndex}:${chapterIndex}:${verseNumber}:${wordIdx}`
         * and falls back to legacy `${vi}:${wordIdx}`.
         */
        const isTokenHighlighted = (absIdx) => {
          if (!hasManualHighlights) return false;
          for (const [vi, offsetInfo] of Object.entries(verseOffsets)) {
            const { start, count, version, bookIndex, chapterIndex, verseNumber } = offsetInfo || {};
            if (absIdx >= start && absIdx < start + count) {
              const wordIdx = absIdx - start;
              const vNum = verseNumber || (parseInt(vi, 10) + 1);
              const ver = (version || data?.version || "KJV").toUpperCase();
              const bIdx = bookIndex ?? data?.bookIndex ?? 0;
              const cIdx = chapterIndex ?? data?.chapterIndex ?? 0;
              const stableKey = `${ver}:${bIdx}:${cIdx}:${vNum}:${wordIdx}`;
              return manualHighlightSet.has(stableKey) || manualHighlightSet.has(`${vi}:${wordIdx}`);
            }
          }
          return false;
        };

        let bookLabel = "";
        let chapterStr = "";
        let verseStr = "";

        const rawTitle = title || data?.book || data?.reference || data?.bookName || "";
        if (rawTitle && typeof rawTitle === "string") {
          const parts = rawTitle.trim().match(/^(.+?)\s+(\d+):([\d,-]+)$/);
          if (parts) {
            bookLabel = parts[1].toUpperCase();
            chapterStr = parts[2];
            verseStr = parts[3];
          } else {
            const chParts = rawTitle.trim().match(/^(.+?)\s+(\d+)$/);
            if (chParts) {
              bookLabel = chParts[1].toUpperCase();
              chapterStr = chParts[2];
            } else {
              bookLabel = rawTitle.toUpperCase();
            }
          }
        }

        const activeVersion = (version || translation || data?.versionKey || canvasState?.translation || "KJV").toUpperCase();
        const activeServiceLabel = data?.bibleServiceLabel || data?.serviceLabel || canvasState?.serviceLabel || canvasState?.bibleServiceLabel || "";
        const activeIdx =
          typeof readAlong?.activeIndex === "number" ? readAlong.activeIndex : -1;

        const refPosition = canvasState?.bibleRefPosition || data?.bibleRefPosition || "top-center";
        const bodyPosition = canvasState?.bibleBodyPosition || data?.bibleBodyPosition || "center";
        const showOrbs = canvasState?.bibleShowOrbs !== false && data?.bibleShowOrbs !== false;
        const bibleReadAlongTransition = canvasState?.bibleReadAlongTransition || data?.bibleReadAlongTransition || "text-glow";

        const refPositionMap = {
          'top-center': 'top-[3.5vw] left-1/2 -translate-x-1/2 justify-center',
          'top-left': 'top-[3.5vw] left-[4vw] justify-start',
          'top-right': 'top-[3.5vw] right-[4vw] justify-end',
          'bottom-center': 'bottom-[3.5vw] left-1/2 -translate-x-1/2 justify-center',
          'bottom-left': 'bottom-[3.5vw] left-[4vw] justify-start',
          'bottom-right': 'bottom-[3.5vw] right-[4vw] justify-end',
        };

        const bodyAlignMap = {
          'center': 'items-center justify-center text-center mx-auto my-auto',
          'bottom-left': 'items-start justify-end text-left mr-auto mt-auto mb-[6vw] pl-[4vw]',
          'bottom-right': 'items-end justify-end text-right ml-auto mt-auto mb-[6vw] pr-[4vw]',
        };

        const refPosClass = refPositionMap[refPosition] || refPositionMap['top-center'];
        const bodyAlign = bodyAlignMap[bodyPosition] || bodyAlignMap['center'];
        const bodyTextAlign = bodyPosition === 'bottom-left' ? 'text-left' : bodyPosition === 'bottom-right' ? 'text-right' : 'text-center';

        return (
          <div
            className="w-full h-full relative z-10 flex flex-col items-center justify-center p-[4%] pointer-events-none select-none overflow-hidden bg-[#07060e]"
            style={{ containerType: "size" }}
          >
            {/* Presentation return prompt chip when Bible is overlayed on presentation - Speaker confidence display only */}
            {(mode === "speaker" || mode === "controller") && isPresentationOverlay && (
              <div className="absolute top-[2vw] right-[2.5vw] z-30 flex items-center gap-2 bg-slate-950/85 backdrop-blur-md border border-cyan-400/50 text-cyan-200 px-4 py-1.5 rounded-full text-[clamp(10px,1cqw,1.1vw)] font-semibold shadow-2xl tracking-wide animate-pulse">
                <span>↩ {overlayPrompt || 'Say "return" to go back to presentation'}</span>
              </div>
            )}

            {/* Ambient Background Glows */}
            {showOrbs && (
              <>
                <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[55%] rounded-full bg-[#8B5CF6]/20 blur-[90px] pointer-events-none" />
                <div className="absolute -bottom-[20%] -right-[10%] w-[50%] h-[55%] rounded-full bg-teal-500/20 blur-[90px] pointer-events-none" />
              </>
            )}

            {/* Header Reference Line */}
            {bookLabel && (
              <div className={`absolute z-20 flex items-center gap-3 ${refPosClass} text-[clamp(11px,1.3cqw,1.4vw)] font-extrabold tracking-[0.25em] uppercase whitespace-nowrap`}>
                <span className="text-[#38bdf8] drop-shadow-[0_0_12px_rgba(56,189,248,0.4)]">
                  {bookLabel}
                </span>
                {chapterStr && (
                  <>
                    <span className="text-indigo-400/60 font-black">•</span>
                    <span className="text-[#a78bfa]">
                      CHAPTER {chapterStr}
                    </span>
                  </>
                )}
                {verseStr && (
                  <>
                    <span className="text-indigo-400/60 font-black">•</span>
                    <span className="text-[#a78bfa]">
                      VERSE{verseStr.includes("-") || verseStr.includes(",") ? "S" : ""} {verseStr}
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Main Centered Content */}
            <div className={`flex flex-col ${bodyAlign} w-full max-w-[88%] z-20 gap-6`}>
              {/* Scripture Body Text wrapped in quotes */}
              <div
                className={`leading-snug font-extrabold ${bodyTextAlign} drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)] text-white w-full tracking-tight mx-auto`}
                style={{ fontSize }}
              >
                "{useReadAlong
                  ? readAlong.tokens.map((tok, i) => {
                      const isCurrent = activeIdx >= 0 && i === activeIdx;
                      const isPast = activeIdx >= 0 && i < activeIdx;
                      const trans = bibleReadAlongTransition || "text-glow";
                      const isUnderline = trans === "underline";
                      const isPop = trans === "text-pop" || trans === "pop";
                      // Manual highlight tint (additive with ASR cursor effect)
                      const isManualHL = isTokenHighlighted(i);

                      let wordStyle = {
                        color: "#FFFFFF",
                        opacity: isPast ? 0.85 : 0.45,
                        fontWeight: isPast ? 700 : 500,
                        textShadow: "0 2px 10px rgba(0,0,0,0.5)",
                        transition: "all 160ms cubic-bezier(0.2, 0.8, 0.2, 1)",
                        display: "inline-block",
                      };

                      if (isCurrent) {
                        if (isUnderline) {
                          wordStyle = {
                            color: "#FFFFFF",
                            opacity: 1,
                            fontWeight: 900,
                            textDecoration: "underline",
                            textDecorationColor: "#38bdf8",
                            textUnderlineOffset: "6px",
                            textDecorationThickness: "3px",
                            textShadow: "0 2px 14px rgba(0,0,0,0.7)",
                            display: "inline-block",
                            transition: "all 160ms cubic-bezier(0.2, 0.8, 0.2, 1)",
                          };
                        } else if (isPop) {
                          wordStyle = {
                            color: "#FFFFFF",
                            opacity: 1,
                            fontWeight: 900,
                            transform: "scale(1.18) translateY(-2px)",
                            textShadow: "0 4px 18px rgba(0,0,0,0.85), 0 0 12px rgba(255,255,255,0.4)",
                            display: "inline-block",
                            transition: "all 160ms cubic-bezier(0.2, 0.8, 0.2, 1)",
                          };
                        } else {
                          // text-glow
                          wordStyle = {
                            color: "#FFFFFF",
                            opacity: 1,
                            fontWeight: 900,
                            transform: "scale(1.06) translateY(-1px)",
                            textShadow: "0 0 18px rgba(56,189,248,0.95), 0 0 32px rgba(56,189,248,0.6), 0 2px 10px rgba(0,0,0,0.7)",
                            display: "inline-block",
                            transition: "all 160ms cubic-bezier(0.2, 0.8, 0.2, 1)",
                          };
                        }
                      }

                      // Apply manual highlight background tint on top of ASR cursor style
                      if (isManualHL) {
                        wordStyle = {
                          ...wordStyle,
                          backgroundColor: highlightColor,
                          color: highlightTextColor,
                          borderRadius: '4px',
                          padding: '0 3px',
                          boxShadow: isCurrent ? '0 0 0 3px #00E5FF, 0 0 16px rgba(0,229,255,0.85)' : undefined,
                        };
                      }

                      return (
                        <React.Fragment key={i}>
                          <span style={wordStyle}>
                            {tok}
                          </span>
                          {i < readAlong.tokens.length - 1 ? " " : ""}
                        </React.Fragment>
                      );
                    })
                  : (() => {
                      const bodyParts = safeBody.split(/(\s+)/).filter((p) => p.length > 0);
                      let wordCount = 0;
                      return bodyParts.map((part, i) => {
                        if (/^\s+$/.test(part)) {
                          return <React.Fragment key={`ws-${i}`}>{part}</React.Fragment>;
                        }
                        const absWordIdx = wordCount++;
                        const isHL = isTokenHighlighted(absWordIdx);
                        return (
                          <span
                            key={`w-${i}`}
                            style={
                              isHL
                                ? {
                                    backgroundColor: highlightColor,
                                    color: highlightTextColor,
                                    borderRadius: "4px",
                                    padding: "0 3px",
                                    display: "inline-block",
                                    transition: "background 160ms, color 160ms",
                                  }
                                : { display: "inline-block" }
                            }
                          >
                            {part}
                          </span>
                        );
                      });
                    })()
                }"
              </div>
            </div>

            {/* Footer Translation & Service Label */}
            {!refPosition?.startsWith('bottom') && (
              <div className="absolute bottom-[2vw] left-1/2 -translate-x-1/2 z-20 flex items-center justify-center gap-2 text-[clamp(9px,0.9cqw,1vw)] font-mono font-bold tracking-[0.2em] text-white/35 uppercase">
                <span>{activeVersion}</span>
                {activeServiceLabel && (
                  <>
                    <span className="text-white/20">•</span>
                    <span className="text-white/30">{activeServiceLabel}</span>
                  </>
                )}
              </div>
            )}
          </div>
        );
      }

      case "presentation":
      case "slide_index": {
        // FR-4.13 / FR-4.3 Presentation Slide Content Slot
        const slideUrl = data.slideUrl || data.slideImageUrl || data.url;
        const slideIndex = data.slideIndex ?? (data.slideNumber != null ? data.slideNumber - 1 : 0);
        const slideCount = data.slideCount ?? data.totalSlides ?? 0;
        const notes = data.notes || "";
        const deckName = data.deckName || data.name || "";
        const isSpeaker = mode === "speaker" || mode === "controller";

        if (!slideUrl) return null;

        return (
          <div className="w-full h-full relative z-10 flex items-center justify-center overflow-hidden bg-black select-none pointer-events-none">
            <img
              src={slideUrl}
              className="w-full h-full object-contain pointer-events-none"
              alt={`Slide ${slideIndex + 1}`}
            />

            {/* FR-4.3: Speaker Notes & Slide Counter — Rendered ONLY on Speaker View / Controller, NEVER on General View */}
            {isSpeaker && (
              <div className="absolute bottom-[2vw] left-[3vw] right-[3vw] z-20 flex items-end justify-between pointer-events-none">
                {notes ? (
                  <div className="max-w-[70%] bg-black/85 backdrop-blur-md px-[1.8vw] py-[1vw] rounded-2xl border border-white/20 shadow-2xl">
                    <span className="text-[1vw] uppercase font-bold text-yellow-400 block mb-1 tracking-wider">
                      Speaker Notes
                    </span>
                    <p className="text-[1.3vw] text-white/95 font-medium leading-snug whitespace-pre-wrap">
                      {notes}
                    </p>
                  </div>
                ) : (
                  <div />
                )}

                {slideCount > 0 && (
                  <div className="bg-black/70 backdrop-blur-md px-[1.5vw] py-[0.6vw] rounded-full border border-white/10 shadow-lg">
                    <span className="font-mono font-bold text-white/70 text-[1.2vw]">
                      {deckName ? `${deckName} · ` : ""}Slide {slideIndex + 1} / {slideCount}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }

      case "scene": {
        // FR-4.14 / FR-4.15 Unified Scene & Song Slides Rendering
        const pageText = data.content || "";
        const style = data.style || {};
        const pageIndex = data.pageIndex || 0;
        const pageCount = data.pageCount || 0;
        const sectionLabel = data.sectionLabel || (data.sceneType === "song" ? `Verse ${pageIndex + 1}` : `Page ${pageIndex + 1}`);

        // Responsive proportional font sizing matching Controller Preview & Scene Modal
        const len = pageText.length;
        let fontSize;
        if (style.fontSize && style.fontSize !== "auto") {
          const parsed = parseFloat(style.fontSize);
          if (!isNaN(parsed)) {
            fontSize = parsed > 15 ? `${(parsed / 10).toFixed(1)}vw` : `${parsed}vw`;
          } else {
            fontSize = style.fontSize;
          }
        } else {
          fontSize = len > 600 ? "2.4vw" : len > 350 ? "2.9vw" : len > 180 ? "3.5vw" : len > 80 ? "4.0vw" : "4.8vw";
        }

        const alignClass =
          style.textAlign === "left"
            ? "text-left items-start"
            : style.textAlign === "right"
              ? "text-right items-end"
              : "text-center items-center";

        const fontClass =
          style.fontFamily === "serif"
            ? "font-serif"
            : style.fontFamily === "mono"
              ? "font-mono"
              : "font-sans";

        const animationClass =
          style.animation === "slide-up"
            ? "animate-in slide-in-from-bottom-8 duration-500 fade-in"
            : style.animation === "zoom"
              ? "animate-in zoom-in-95 duration-500 fade-in"
              : style.animation === "none"
                ? ""
                : "animate-in fade-in duration-400";

        const isSpeakerView = mode === "speaker";
        const isManual = data.navMode === "manual";
        const enableWordTracking = !isManual && (isSpeakerView || mode === "controller" || mode === "preview" || style.karaokeTracking === true);

        return (
          <div
            className="w-full h-full relative z-10 flex flex-col justify-center items-center p-[4vw] pointer-events-none select-none transition-colors duration-300 overflow-hidden"
            style={{
              backgroundColor: style.backgroundColor || "#000000",
            }}
          >
            {/* Optional Background Image Layer */}
            {style.backgroundImage && (
              <div
                className="absolute inset-0 z-0 bg-cover pointer-events-none transition-all duration-500"
                style={{
                  backgroundImage: style.backgroundImage.startsWith('url(')
                    ? style.backgroundImage
                    : `url("${style.backgroundImage}")`,
                  backgroundPosition: style.backgroundPosition === 'top'
                    ? 'center top'
                    : style.backgroundPosition === 'bottom'
                    ? 'center bottom'
                    : 'center center',
                  opacity: typeof style.backgroundOpacity === "number" ? style.backgroundOpacity : 0.85,
                }}
              />
            )}
            {/* Dark overlay for contrast when background image is present */}
            {style.backgroundImage && (
              <div
                className="absolute inset-0 z-0 pointer-events-none"
                style={{
                  backgroundColor: style.overlayColor || "rgba(0,0,0,0.45)",
                }}
              />
            )}

            {/* Center Content Box with Clean High Readability Typography */}
            <div className={`w-full max-w-[92%] flex justify-center my-auto z-10 ${alignClass}`}>
              <div
                key={`${data.sceneId || 'scene'}-${pageIndex}-${pageText.slice(0, 10)}`}
                className={`leading-relaxed whitespace-pre-wrap ${fontClass} ${animationClass}`}
                style={{
                  fontSize,
                  color: style.color || "#ffffff",
                  fontWeight: style.fontWeight || "600",
                  fontStyle: style.isItalic ? "italic" : "normal",
                  textDecoration: style.isUnderline ? "underline" : "none",
                  textAlign: style.textAlign || "center",
                  lineHeight: style.lineHeight || "1.45",
                  textShadow: style.textShadow === "none"
                    ? "none"
                    : style.textShadow === "soft"
                    ? "0 2px 8px rgba(0,0,0,0.65)"
                    : "0 4px 16px rgba(0,0,0,0.85), 0 1px 3px rgba(0,0,0,0.9)",
                  width: "100%",
                }}
              >
                {renderAnimatedLyrics({
                  text: pageText,
                  translation: data.translation || "",
                  currentWordIndex: alignProgress.wordIndex,
                  animationType: style.animation || "karaoke",
                  style,
                  isSingAlong: data.sceneType === "song" || data.navMode === "read_along",
                  enableWordTracking,
                  sectionType: data.sectionType,
                  sectionLabel,
                })}
              </div>
            </div>

            {/* Section / Page Number Badge — ONLY on Speaker Screen */}
            {isSpeakerView && pageCount > 0 && (
              <div className="absolute bottom-[2vw] right-[3vw] z-20 pointer-events-none">
                <span
                  className="font-mono font-bold text-white/60 bg-black/70 px-[1.5vw] py-[0.5vw] rounded-full border border-white/10 shadow-lg"
                  style={{ fontSize: "1.2vw", letterSpacing: "0.05em" }}
                >
                  {sectionLabel} ({pageIndex + 1}/{pageCount})
                </span>
              </div>
            )}
          </div>
        );
      }

      case "custom_layers": {
        const bg = data?.background || background || {};
        const layers = data?.layers || [];
        if (layers.length === 0 && !bg.url) return null;
        
        // Compute zIndex based on array position if not provided, then sort ascending for DOM
        const layersWithZ = layers.map((layer, idx) => ({
          ...layer,
          computedZIndex: layer.zIndex != null ? layer.zIndex : (layers.length - idx) * 10,
        }));
        const sorted = [...layersWithZ].sort((a, b) => a.computedZIndex - b.computedZIndex);

        return (
          <div className="w-full h-full relative z-10 pointer-events-none overflow-hidden">
            {/* Custom Layer Background */}
            {bg.url && (
              <div
                className="absolute z-0"
                style={{
                  left: `${bg.x ?? 50}%`,
                  top: `${bg.y ?? 50}%`,
                  transform: "translate(-50%, -50%)",
                  width: `${bg.width ?? 100}%`,
                  height: `${bg.height ?? 100}%`,
                }}
              >
                {bg.type === "video" ? (
                  <video
                    src={bg.url}
                    key={bg.url}
                    autoPlay
                    loop
                    muted={bg.muted === true || data?.muted === true}
                    playsInline
                    className="w-full h-full object-fill pointer-events-none"
                  />
                ) : (
                  <img
                    src={bg.url}
                    key={bg.url}
                    className="w-full h-full object-fill pointer-events-none select-none"
                    alt="bg"
                  />
                )}
              </div>
            )}
            {sorted.map((layer) => {
              const xPct = layer.x != null ? `${layer.x}%` : "50%";
              const yPct = layer.y != null ? `${layer.y}%` : "50%";
              const isSelected = selectedLayerId === layer.id;

              return (
                <div
                  key={layer.id}
                  onClick={(e) => handleLayerClick(e, layer.id)}
                  className={`absolute transition-all duration-75 ${
                    isEditable ? "pointer-events-auto cursor-pointer" : "pointer-events-none"
                  }`}
                  style={{
                    left: xPct,
                    top: yPct,
                    transform: "translate(-50%, -50%)",
                    width: (layer.type === "image" || layer.type === "video") ? `${layer.style?.width || 30}%` : "auto",
                    zIndex: layer.computedZIndex,
                  }}
                >
                  {isSelected && isEditable && (
                    <div className="absolute -inset-2 border-2 border-[#00A8FF]/50 border-dashed rounded-lg pointer-events-none z-50" />
                  )}

                  {layer.type === "text" ? (
                    <p
                      className="whitespace-pre-wrap text-center px-2 py-1 select-none"
                      style={{
                        fontSize: `${layer.style?.fontSize || 5}vw`,
                        lineHeight: layer.style?.lineHeight || 1.2,
                        color: layer.style?.color || "#ffffff",
                        fontFamily:
                          layer.style?.fontFamily === "serif"
                            ? "Georgia, serif"
                            : layer.style?.fontFamily === "mono"
                              ? '"Courier New", monospace'
                              : "sans-serif",
                        fontWeight: layer.style?.fontWeight || "bold",
                        textTransform: layer.style?.textTransform || "none",
                        textShadow: layer.style?.shadow
                          ? `${layer.style.shadow.x || 0}px ${layer.style.shadow.y || 0}px ${layer.style.shadow.blur || 10}px ${layer.style.shadow.color || "rgba(0,0,0,0.6)"}`
                          : "none",
                      }}
                    >
                      {layer.content}
                    </p>
                  ) : layer.type === "video" ? (
                    <video
                      src={layer.content}
                      key={layer.content}
                      autoPlay={layer.style?.autoPlay !== false}
                      loop={layer.style?.loop !== false}
                      muted={layer.style?.muted === true || data?.muted === true}
                      playsInline
                      ref={(el) => {
                        if (el) {
                          el.volume = typeof layer.style?.volume === 'number' ? layer.style.volume : (typeof data?.volume === 'number' ? data.volume : 1);
                        }
                      }}
                      className="w-full h-auto select-none pointer-events-none transition-all"
                      style={{
                        borderRadius: `${layer.style?.borderRadius ?? 12}px`,
                        opacity: layer.style?.opacity ?? 1,
                        objectFit: layer.style?.aspectRatio === 'fill' ? 'cover' : (layer.style?.aspectRatio === 'fit' ? 'contain' : (layer.style?.objectFit || "contain")),
                        boxShadow: layer.style?.shadow
                          ? `${layer.style.shadow.x || 0}px ${layer.style.shadow.y || 0}px ${layer.style.shadow.blur || 14}px ${layer.style.shadow.color || "rgba(0,0,0,0.6)"}`
                          : (layer.style?.shadow === false ? "none" : "0 4px 20px rgba(0,0,0,0.4)"),
                      }}
                    />
                  ) : (
                    <img
                      src={layer.content}
                      className="w-full h-auto select-none pointer-events-none transition-all"
                      style={{
                        borderRadius: `${layer.style?.borderRadius ?? 12}px`,
                        opacity: layer.style?.opacity ?? 1,
                        objectFit: layer.style?.objectFit || "contain",
                        boxShadow: layer.style?.shadow
                          ? `${layer.style.shadow.x || 0}px ${layer.style.shadow.y || 0}px ${layer.style.shadow.blur || 14}px ${layer.style.shadow.color || "rgba(0,0,0,0.6)"}`
                          : (layer.style?.shadow === false ? "none" : "0 4px 20px rgba(0,0,0,0.4)"),
                      }}
                      alt="layer"
                    />
                  )}
                </div>
              );
            })}
          </div>
        );
      }

      case "timer": {
        const { displayTime, label, isFinished } = data;
        return (
          <div className="w-full h-full relative z-10 flex flex-col justify-center items-center pointer-events-none select-none">
            {label && (
              <span className="text-[3vw] font-bold uppercase tracking-widest text-white/70 mb-[1vw] drop-shadow-md">
                {label}
              </span>
            )}
            <span
              className={`font-mono font-black text-[12vw] leading-none tracking-tight ${
                isFinished ? "text-red-500 animate-pulse" : "text-white"
              }`}
            >
              {displayTime || "00:00"}
            </span>
          </div>
        );
      }

      // ── live-camera & live-output: renders the program stream on a canvas ────────
      // FR-4.14: Only Band 2 (Content Slot) is touched here. Background (Band 1)
      // and Pinned Layers (Band 3) are rendered in completely separate branches
      // and are entirely unaffected by this case.
      case 'live-camera':
      case 'live-output': {
        const { deviceId } = data || {};
        const isLiveOutput = type === 'live-output';
        return (
          <div
            className="w-full h-full relative z-10 bg-black overflow-hidden flex items-center justify-center"
            style={{ containerType: 'size' }}
          >
            <canvas
              ref={liveCameraCanvasRef}
              className="w-full h-full object-cover absolute inset-0"
              style={{
                display: 'block',
                transform: (!isLiveOutput && (data?.isMirrored || isCameraMirrored)) ? 'scaleX(-1)' : 'none',
                filter: (liveCameraEffect?.filter && liveCameraEffect.filter !== 'none') ? liveCameraEffect.filter : 'none',
              }}
            />
            {liveCameraEffect?.overlayColor && liveCameraEffect.overlayColor !== 'transparent' && (
              <div
                className="absolute inset-0 pointer-events-none z-[1]"
                style={{ backgroundColor: liveCameraEffect.overlayColor }}
              />
            )}
            {/* Standby HUD overlay when no live frames have arrived yet */}
            {!hasLiveFrame && (
              <div className="relative z-10 flex flex-col items-center justify-center gap-3 p-6 rounded-[12px] bg-white/[0.04] border border-white/10 backdrop-blur-md max-w-sm text-center select-none pointer-events-none shadow-2xl">
                <div className="w-12 h-12 rounded-[12px] bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400">
                  <svg className="w-6 h-6 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm tracking-wide">
                    {isLiveOutput ? 'Live Output' : deviceId === 'speaker' ? 'Speaker Screen Channel' : 'Live Camera Channel'}
                  </h3>
                  <p className="text-white/40 text-xs mt-1">
                    {isLiveOutput
                      ? 'Displaying live broadcast stream...'
                      : deviceId === 'speaker'
                      ? 'Mirroring confidence monitor output'
                      : 'Awaiting video stream from mobile companion...'}
                  </p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 rounded-[12px] bg-amber-500/15 border border-amber-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                  <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">Awaiting Stream</span>
                </div>
              </div>
            )}
            {/* PROGRAM tally indicator — shown in speaker/general view */}
            {(mode === 'speaker' || mode === 'general') && (
              <div className="absolute top-3 left-3 bg-red-600/90 text-white text-[clamp(10px,1.2cqw,1.4vw)] font-black px-3 py-1 rounded-[12px] flex items-center gap-1.5 shadow-lg pointer-events-none select-none z-20">
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                LIVE
              </div>
            )}
          </div>
        );
      }

      default:
        return null;
    }
  };

  // Helper to render Pinned Overlays (Band 3)
  const renderPinnedLayers = () => {
    if (chrome?.blackout) return null;
    if (!pinnedLayers || pinnedLayers.length === 0) return null;

    return (
      <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden">
        {pinnedLayers.map((layer) => {
          const xPct = typeof layer.x === 'number' ? (layer.x > 1 ? `${layer.x}%` : `${layer.x * 100}%`) : '50%';
          const yPct = typeof layer.y === 'number' ? (layer.y > 1 ? `${layer.y}%` : `${layer.y * 100}%`) : '50%';
          const wPct = typeof layer.width === 'number' ? (layer.width > 1 ? `${layer.width}%` : `${layer.width * 100}%`) : (layer.style?.width ? `${layer.style.width}%` : '20%');
          const isSelected = selectedLayerId === layer.id;

          return (
            <div
              key={layer.id}
              onClick={(e) => handleLayerClick(e, layer.id)}
              className={`absolute transition-all duration-75 ${
                isEditable ? "pointer-events-auto cursor-pointer" : "pointer-events-none"
              }`}
              style={{
                left: xPct,
                top: yPct,
                transform: "translate(-50%, -50%)",
                width: wPct,
                zIndex: layer.zIndex || 30,
              }}
            >
              {isSelected && isEditable && (
                <div className="absolute -inset-2 border-2 border-yellow-500 border-dashed rounded-[12px] pointer-events-none z-50" />
              )}

              {layer.type === "image" ? (
                layer.url || layer.content ? (
                  <img
                    src={layer.url || layer.content}
                    alt="pinned"
                    className={`w-full h-auto ${isSelected ? "ring-2 ring-[#8B5CF6]/30" : ""}`}
                    style={{
                      opacity: layer.opacity ?? 1,
                      borderRadius: layer.mask === "circle" ? "50%" : layer.mask === "diamond" ? "0px" : `${layer.borderRadius ?? 12}px`,
                      clipPath: layer.mask === "diamond" ? "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" : "none",
                    }}
                  />
                ) : (
                  <div
                    className={`w-full aspect-square flex items-center justify-center bg-zinc-900 ${isSelected ? "ring-2 ring-[#8B5CF6]/30" : ""}`}
                    style={{
                      opacity: layer.opacity ?? 1,
                      borderRadius: layer.mask === "circle" ? "50%" : layer.mask === "diamond" ? "0px" : `${layer.borderRadius ?? 12}px`,
                      clipPath: layer.mask === "diamond" ? "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" : "none",
                    }}
                  >
                    <svg viewBox="0 0 100 100" className="w-full h-full text-zinc-400">
                      <rect width="100" height="100" fill="#1f242d" />
                      <circle cx="50" cy="38" r="17" fill="#64748b" />
                      <path d="M22,86 C22,66 35,58 50,58 C65,58 78,66 78,86 Z" fill="#64748b" />
                    </svg>
                  </div>
                )
              ) : layer.type === "video" ? (
                <video
                  src={layer.url || layer.content}
                  autoPlay
                  loop
                  muted
                  className={`w-full h-auto rounded-[12px] ${
                    isSelected ? "ring-2 ring-[#8B5CF6]/30" : ""
                  }`}
                  style={{ opacity: layer.opacity ?? 1 }}
                />
              ) : layer.type === "text" ? (
                <div
                  className={`p-2 font-bold whitespace-pre-wrap ${
                    isSelected ? "ring-2 ring-[#8B5CF6]/30 rounded bg-[#8B5CF6]/40" : ""
                  }`}
                  style={{
                    color: layer.color || "#FFFFFF",
                    fontSize: layer.fontSize || "2vw",
                    fontFamily: layer.fontFamily || "sans-serif",
                    textAlign: layer.textAlign || "center",
                    textShadow: layer.shadowEnabled ? formatLayerShadow(layer) : "none",
                  }}
                >
                  {layer.text || layer.content || ""}
                </div>
              ) : layer.type === "shape" ? (
                renderLiveDesignShape(layer)
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  // Helper to render Chrome (Band 4)
  const renderChrome = () => {
    if (!chrome) return null;

    return (
      <div className="absolute inset-0 z-40 pointer-events-none">
        {/* Full Blackout / Blank Screen Feature */}
        {chrome.blackout && (
          <div className="absolute inset-0 bg-black z-50 animate-in fade-in duration-150" />
        )}

        {/* Optional Branding Text Overlay */}
        {chrome.brandingText && !chrome.blackout && (
          <div className="absolute bottom-[2vw] left-[3vw] z-40">
            <span className="font-bold text-white/50 text-[1.2vw] tracking-wider uppercase">
              {chrome.brandingText}
            </span>
          </div>
        )}

        {/* Split Timer Corner Badge (if split timer active) */}
        {chrome.timerSplit && chrome.timerCountdown && !chrome.blackout && (
          <div className="absolute top-[2vw] right-[3vw] z-40 bg-black/70 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 shadow-2xl">
            <span className="font-mono font-bold text-orange-400 text-[1.8vw] tracking-tight">
              {chrome.timerCountdown}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full h-full relative bg-black overflow-hidden select-none flex items-center justify-center">
      {/* ── BAND 1: BACKGROUND LAYER ──────────────────────────────────────── */}
      {background.type === "color" && (
        <div
          className="absolute inset-0 z-0 transition-colors duration-300"
          style={{ backgroundColor: background.color || "#000000" }}
        />
      )}

      {background.type === "image" && background.url && (
        <img
          src={background.url}
          key={background.url}
          className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none transition-all duration-300"
          style={{
            transform: `scale(${background.zoom || 1}) translate(${background.panX || 0}px, ${
              background.panY || 0
            }px)`,
          }}
          alt="display-bg"
        />
      )}

      {background.type === "video" && background.url && (
        <video
          ref={videoRef}
          src={background.url}
          autoPlay={background.autoPlay !== false}
          loop={background.loop !== false}
          muted={background.muted === true || data?.muted === true}
          playsInline
          className="absolute inset-0 w-full h-full object-cover z-0"
          style={{
            transform: `scale(${background.zoom || 1}) translate(${background.panX || 0}px, ${
              background.panY || 0
            }px)`,
          }}
        />
      )}

      {/* ── BAND 2: CONTENT SLOT ──────────────────────────────────────────── */}
      {renderContentSlot()}

      {/* ── BAND 3: PINNED LAYERS ─────────────────────────────────────────── */}
      {renderPinnedLayers()}

      {/* ── BAND 4: CHROME (Blackout / Logo / Brand / Split Timer) ─────────── */}
      {renderChrome()}
    </div>
  );
}
