import React, { useRef, useEffect, useState } from "react";
import { renderAnimatedLyrics } from "../controller/LyricAnimationEngine";

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
        const { title, body, readAlong, version, translation } = data || {};
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
            {/* Ambient Background Glows */}
            {showOrbs && (
              <>
                <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[55%] rounded-full bg-purple-600/20 blur-[90px] pointer-events-none" />
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
                      const isSpoken = i <= activeIdx;
                      const isCurrent = i === activeIdx;
                      return (
                        <span
                          key={i}
                          className={`transition-colors duration-150 ${
                            isCurrent
                              ? "text-white font-black underline decoration-cyan-400 decoration-2 underline-offset-4"
                              : isSpoken
                                ? "text-white"
                                : "text-white/40"
                          }`}
                        >
                          {tok}
                          {i < readAlong.tokens.length - 1 ? " " : ""}
                        </span>
                      );
                    })
                  : safeBody}"
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
                    <div className="absolute -inset-2 border-2 border-blue-500 border-dashed rounded-lg pointer-events-none z-50" />
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
                        borderRadius: `${layer.style?.borderRadius ?? 8}px`,
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
                        borderRadius: `${layer.style?.borderRadius ?? 8}px`,
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
          const xPct = `${(layer.x ?? 0.5) * 100}%`;
          const yPct = `${(layer.y ?? 0.5) * 100}%`;
          const wPct = `${(layer.width ?? 0.2) * 100}%`;
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
                <div className="absolute -inset-2 border-2 border-yellow-500 border-dashed rounded-lg pointer-events-none z-50" />
              )}

              {layer.type === "image" ? (
                <img
                  src={layer.url || layer.content}
                  alt="pinned"
                  className={`w-full h-auto rounded ${
                    isSelected ? "ring-2 ring-purple-500" : ""
                  }`}
                  style={{ opacity: layer.opacity ?? 1 }}
                />
              ) : layer.type === "video" ? (
                <video
                  src={layer.url || layer.content}
                  autoPlay
                  loop
                  muted
                  className={`w-full h-auto rounded ${
                    isSelected ? "ring-2 ring-purple-500" : ""
                  }`}
                  style={{ opacity: layer.opacity ?? 1 }}
                />
              ) : layer.type === "text" ? (
                <div
                  className={`p-2 font-bold whitespace-pre-wrap ${
                    isSelected ? "ring-2 ring-purple-500 rounded bg-purple-900/40" : ""
                  }`}
                  style={{
                    color: layer.color || "#FFFFFF",
                    fontSize: layer.fontSize || "2vw",
                    fontFamily: layer.fontFamily || "sans-serif",
                    textAlign: layer.textAlign || "center",
                  }}
                >
                  {layer.text || layer.content || ""}
                </div>
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
        {/* Logo Screen Mode */}
        {chrome.logo && chrome.logoUrl && !chrome.blackout && (
          <div className="absolute inset-0 bg-black flex items-center justify-center z-45 animate-in fade-in duration-200">
            <img
              src={chrome.logoUrl}
              alt="Logo"
              className="max-w-[40%] max-h-[40%] object-contain shadow-2xl"
            />
          </div>
        )}

        {/* Optional Branding Text Overlay */}
        {chrome.brandingText && !chrome.blackout && !chrome.logo && (
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
