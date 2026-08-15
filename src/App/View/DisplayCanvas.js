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
    if (!contentSlot || contentSlot.type === "none" || !contentSlot.data) {
      return null;
    }

    const { type, data } = contentSlot;

    switch (type) {
      case "bible": {
        const { title, body, readAlong, rangeStart, rangeEnd, currentVerse } = data;
        const safeBody = body || "";
        const bodyLen = safeBody.length;
        const fontSize =
          bodyLen > 600 ? "2.8vw" : bodyLen > 300 ? "3.5vw" : bodyLen > 150 ? "4.5vw" : "6vw";
        const useReadAlong =
          !!readAlong?.enabled && Array.isArray(readAlong.tokens) && readAlong.tokens.length > 0;

        let bookLabel = "";
        let cvLabel = "";
        if (title && typeof title === "string") {
          const parts = title.match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
          if (parts) {
            bookLabel = parts[1].toUpperCase();
            const ch = parts[2];
            const rs = rangeStart != null ? rangeStart : parseInt(parts[3], 10);
            const re = rangeEnd != null ? rangeEnd : parts[4] ? parseInt(parts[4], 10) : rs;
            const cur = currentVerse != null ? currentVerse : rs;
            if (re > rs) {
              cvLabel =
                cur !== rs
                  ? `CHAPTER ${ch} · VERSES ${rs}–${re} · ${cur}`
                  : `CHAPTER ${ch} · VERSES ${rs}–${re}`;
            } else {
              cvLabel = `CHAPTER ${ch} · VERSE ${rs}`;
            }
          } else {
            bookLabel = title.toUpperCase();
          }
        } else if (title) {
          bookLabel = String(title).toUpperCase();
        }

        const activeIdx =
          typeof readAlong?.activeIndex === "number" ? readAlong.activeIndex : -1;

        return (
          <div className="w-full h-full relative z-10 flex flex-col justify-center items-center p-[4vw] pointer-events-none select-none">
            {/* Header Badge */}
            {bookLabel && (
              <div className="absolute top-[4vw] left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/60 backdrop-blur-md px-6 py-2 rounded-full border border-white/10 shadow-2xl">
                <span className="font-extrabold tracking-widest text-orange-400 text-[1.4vw] uppercase">
                  {bookLabel}
                </span>
                {cvLabel && (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                    <span className="font-bold tracking-wider text-white/80 text-[1.2vw]">
                      {cvLabel}
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Scripture Body with Read-Along Word Highlighting */}
            <div
              className="leading-tight font-extrabold text-center drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] text-white w-full max-w-[90%]"
              style={{ fontSize, letterSpacing: "-0.02em" }}
            >
              {useReadAlong
                ? readAlong.tokens.map((tok, i) => {
                    const isSpoken = i <= activeIdx;
                    const isCurrent = i === activeIdx;
                    return (
                      <span
                        key={i}
                        className={`transition-colors duration-150 ${
                          isCurrent
                            ? "text-yellow-300 font-black"
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
                : safeBody}
            </div>
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
        const layers = data.layers || [];
        if (layers.length === 0) return null;
        
        // Sort by zIndex ascending
        const sorted = [...layers].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

        return (
          <div className="w-full h-full relative z-10 pointer-events-none overflow-hidden">
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
                    width: layer.type === "image" ? `${layer.style?.width || 30}%` : "auto",
                    zIndex: layer.zIndex || 10,
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
                      }}
                    >
                      {layer.content}
                    </p>
                  ) : (
                    <img
                      src={layer.content}
                      className="w-full h-auto rounded-lg select-none pointer-events-none"
                      style={{
                        boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
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
                  className="w-full h-auto rounded"
                  style={{ opacity: layer.opacity ?? 1 }}
                />
              ) : layer.type === "video" ? (
                <video
                  src={layer.url || layer.content}
                  autoPlay
                  loop
                  muted
                  className="w-full h-auto rounded"
                  style={{ opacity: layer.opacity ?? 1 }}
                />
              ) : (
                <p
                  className="whitespace-pre-wrap text-center font-bold"
                  style={{
                    fontSize: `${(layer.fontSize ?? 0.05) * 100}vw`,
                    color: layer.color || "#ffffff",
                    opacity: layer.opacity ?? 1,
                  }}
                >
                  {layer.content}
                </p>
              )}
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
        {/* Full Blackout (FR-1.x) */}
        {chrome.blackout && (
          <div className="absolute inset-0 bg-black z-50 animate-in fade-in duration-150" />
        )}

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
        <div
          className="absolute inset-0 z-0 bg-cover bg-center transition-all duration-300"
          style={{
            backgroundImage: `url(${background.url})`,
            transform: `scale(${background.zoom || 1}) translate(${background.panX || 0}px, ${
              background.panY || 0
            }px)`,
          }}
        />
      )}

      {background.type === "video" && background.url && (
        <video
          ref={videoRef}
          src={background.url}
          autoPlay={background.autoPlay !== false}
          loop={background.loop !== false}
          muted={background.muted !== false}
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
