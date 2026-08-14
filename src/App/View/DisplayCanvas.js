import React, { useRef, useEffect } from "react";

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

  // Auto-play / reload background video when URL changes
  useEffect(() => {
    if (videoRef.current && background?.url && background?.type === "video") {
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    }
  }, [background?.url, background?.type]);

  // If Blackout is engaged (FR-1.5), render pure blackout
  if (chrome?.blackout) {
    return (
      <div
        className="w-full h-full bg-black relative flex items-center justify-center overflow-hidden"
        style={{ containerType: "size" }}
      >
        {mode === "controller" && (
          <span className="text-red-500 font-mono text-xs uppercase tracking-widest bg-black/80 px-2 py-1 rounded border border-red-500/30">
            Blackout Active (B)
          </span>
        )}
      </div>
    );
  }

  // If Logo screen is engaged (FR-1.5)
  if (chrome?.logo) {
    return (
      <div
        className="w-full h-full bg-[#0B0814] relative flex items-center justify-center overflow-hidden"
        style={{ containerType: "size" }}
      >
        {chrome.logoUrl ? (
          <img
            src={chrome.logoUrl}
            alt="Logo"
            className="max-w-[50%] max-h-[50%] object-contain drop-shadow-2xl animate-in fade-in zoom-in-95 duration-500"
          />
        ) : (
          <div className="flex flex-col items-center animate-pulse">
            <h1 className="text-[15vw] font-black text-[#F6F3F1] tracking-tighter leading-none opacity-25">
              OCS
            </h1>
            <p className="text-[#F6F3F1]/40 text-xl font-medium tracking-[0.8em] uppercase mt-4">
              {chrome.brandingText || "Organised Church Service"}
            </p>
          </div>
        )}
      </div>
    );
  }

  // --- BAND 1: Background Layer ---
  const renderBackgroundBand = () => {
    if (!background) {
      return <div className="absolute inset-0 bg-[#000000]" />;
    }

    const panStyle = {
      transform: `translate(${background.panX || 0}%, ${background.panY || 0}%) scale(${background.zoom || 1})`,
      transformOrigin: "center center",
      willChange: "transform",
    };

    if (background.type === "video" && background.url) {
      return (
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none"
          style={panStyle}
          autoPlay={background.autoPlay !== false}
          loop={background.loop !== false}
          muted={background.muted !== false} // FR-4.19: muted by default
          playsInline
        >
          <source src={background.url} />
        </video>
      );
    }

    if (background.type === "image" && background.url) {
      return (
        <img
          src={background.url}
          alt="Background"
          className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none"
          style={panStyle}
        />
      );
    }

    return (
      <div
        className="absolute inset-0 z-0 transition-colors duration-300"
        style={{ backgroundColor: background.color || "#000000" }}
      />
    );
  };

  // --- BAND 2: Content Slot ---
  const renderContentSlotBand = () => {
    if (!contentSlot || contentSlot.type === "none" || !contentSlot.data) {
      return null;
    }

    const { type, data } = contentSlot;

    switch (type) {
      case "bible": {
        const {
          title,
          body = "",
          readAlong,
          rangeStart,
          rangeEnd,
          currentVerse,
        } = data;
        const bodyLen = body.length;
        const fontSize =
          bodyLen > 600
            ? "2.8vw"
            : bodyLen > 300
              ? "3.5vw"
              : bodyLen > 150
                ? "4.5vw"
                : "5.8vw";

        let bookLabel = "";
        let cvLabel = "";
        if (title && typeof title === "string") {
          const parts = title.match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
          if (parts) {
            bookLabel = parts[1].toUpperCase();
            const ch = parts[2];
            const rs = rangeStart != null ? rangeStart : parseInt(parts[3], 10);
            const re =
              rangeEnd != null
                ? rangeEnd
                : parts[4]
                  ? parseInt(parts[4], 10)
                  : rs;
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

        const useReadAlong =
          !!readAlong?.enabled &&
          Array.isArray(readAlong.tokens) &&
          readAlong.tokens.length > 0;
        const activeIdx =
          typeof readAlong?.activeIndex === "number"
            ? readAlong.activeIndex
            : -1;

        return (
          <div className="w-full h-full relative z-10 flex flex-col justify-between p-[4vw] pointer-events-none select-none animate-in fade-in duration-300">
            {/* Top Bar: Book & Chapter Badge */}
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 bg-white/10 backdrop-blur-md rounded-lg text-white/90 text-sm font-semibold tracking-wider uppercase border border-white/10">
                  {bookLabel || "SCRIPTURE"}
                </span>
                {cvLabel && (
                  <span className="text-white/60 text-xs font-medium tracking-widest uppercase">
                    {cvLabel}
                  </span>
                )}
              </div>
            </div>

            {/* Middle: Verse Text with High Readability */}
            <div className="flex-1 flex items-center justify-center my-auto px-[2vw]">
              {useReadAlong ? (
                <p
                  className="font-serif leading-relaxed text-center drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)]"
                  style={{ fontSize }}
                >
                  {readAlong.tokens.map((token, i) => (
                    <span
                      key={i}
                      className={`transition-colors duration-150 ${
                        i === activeIdx
                          ? "text-[#FCD34D] font-bold bg-amber-400/20 rounded px-1"
                          : i < activeIdx
                            ? "text-white/95"
                            : "text-white/70"
                      }`}
                    >
                      {token}{" "}
                    </span>
                  ))}
                </p>
              ) : (
                <p
                  className="text-white font-serif leading-relaxed text-center drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)]"
                  style={{ fontSize }}
                >
                  {body}
                </p>
              )}
            </div>

            {/* Bottom: Translation Badge */}
            <div className="flex justify-end items-center w-full">
              <span className="text-white/40 text-xs font-mono tracking-widest uppercase">
                {data.version ? data.version.toUpperCase() : "KJV"}
              </span>
            </div>
          </div>
        );
      }

      case "presentation":
      case "slide_index": {
        // Presentation slide image / text
        const slideUrl = data.slideUrl || data.slideImageUrl;
        const { slideIndex, totalSlides } = data;
        return (
          <div className="w-full h-full relative z-10 flex items-center justify-center pointer-events-none select-none">
            {slideUrl ? (
              <img
                src={slideUrl}
                alt={`Slide ${slideIndex || 1}`}
                className="w-full h-full object-contain drop-shadow-2xl"
              />
            ) : (
              <div className="text-white/60 font-medium text-xl">
                Slide {slideIndex || 1} of {totalSlides || 1}
              </div>
            )}
          </div>
        );
      }

      case "scene": {
        // Paged text / lyrics with rich styling matching Bible flow
        const pageText = data.pageText || data.content || "";
        const style = data.style || {};

        // Bible-like responsive font scaling based on text length
        const textLen = pageText.length;
        const autoSize =
          textLen > 600
            ? "2.8vw"
            : textLen > 300
              ? "3.5vw"
              : textLen > 150
                ? "4.5vw"
                : textLen > 70
                  ? "5.2vw"
                  : "6.0vw";

        const fontSize =
          style.fontSize && style.fontSize !== "auto"
            ? typeof style.fontSize === "number"
              ? `${style.fontSize}px`
              : style.fontSize.includes("px") ||
                  style.fontSize.includes("vw") ||
                  style.fontSize.includes("rem") ||
                  style.fontSize.includes("%")
                ? style.fontSize
                : `${style.fontSize}px`
            : autoSize;

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

        return (
          <div
            className="w-full h-full relative z-10 flex flex-col justify-between p-[4vw] pointer-events-none select-none transition-colors duration-300 animate-in fade-in duration-300"
            style={{ backgroundColor: style.backgroundColor || "transparent" }}
          >
            {/* Middle: Scene / Slide Text with High Readability & Bible-style Drop Shadow */}
            <div className={`flex-1 flex justify-center my-auto px-[2vw] ${alignClass}`}>
              <div
                className={`leading-relaxed whitespace-pre-wrap drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)] ${fontClass}`}
                style={{
                  fontSize,
                  color: style.color || "#ffffff",
                  fontWeight: style.fontWeight || "600",
                  fontStyle: style.isItalic ? "italic" : "normal",
                  textDecoration: style.isUnderline ? "underline" : "none",
                  textAlign: style.textAlign || "center",
                  maxWidth: "96%",
                  width: "100%",
                }}
              >
                {pageText}
              </div>
            </div>
          </div>
        );
      }

      case "custom_layers": {
        const layers = data.layers || [];
        if (layers.length === 0) return null;
        
        // Sort by zIndex ascending
        const sorted = [...layers].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

        return (
          <div className="absolute inset-0 w-full h-full z-10 pointer-events-none overflow-hidden">
            {sorted.map((layer) => {
              if (layer.visible === false) return null;

              const xPct = (layer.x ?? layer.position?.x ?? 0.5) * 100;
              const yPct = (layer.y ?? layer.position?.y ?? 0.5) * 100;
              const widthPct = layer.width ? layer.width * 100 : null;
              const heightPct = layer.height ? layer.height * 100 : null;

              const layerStyle = {
                position: "absolute",
                left: `${xPct}%`,
                top: `${yPct}%`,
                transform: "translate(-50%, -50%)",
                width: widthPct ? `${widthPct}%` : "auto",
                height: heightPct ? `${heightPct}%` : "auto",
                zIndex: layer.zIndex || 20,
                opacity: layer.style?.opacity ?? 1,
                pointerEvents: "none",
              };

              return (
                <div key={layer.id} style={layerStyle}>
                  {layer.type === "text" ? (
                    <p
                      style={{
                        fontSize: layer.style?.fontSize ? `${layer.style.fontSize}cqw` : "4cqw",
                        color: layer.style?.color || "#ffffff",
                        fontFamily: layer.style?.fontFamily === "serif" ? "Georgia, serif"
                            : layer.style?.fontFamily === "mono" ? '"Courier New", monospace'
                            : "system-ui, sans-serif",
                        fontWeight: layer.style?.fontWeight || "bold",
                        lineHeight: layer.style?.lineHeight || 1.2,
                        textShadow: layer.style?.shadow || "0 2px 10px rgba(0,0,0,0.8)",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {layer.content}
                    </p>
                  ) : layer.type === "video" ? (
                    <video
                      src={layer.content}
                      autoPlay
                      loop={layer.loop !== false}
                      muted={layer.muted !== false}
                      className="w-full h-auto object-contain drop-shadow-xl"
                    />
                  ) : (
                    <img
                      src={layer.content}
                      alt="Layer"
                      className="w-full h-auto object-contain drop-shadow-xl"
                      style={{ boxShadow: layer.style?.shadow }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        );
      }

      case "timer": {
        const { timeRemaining, label } = data;
        return (
          <div className="w-full h-full relative z-10 flex flex-col items-center justify-center pointer-events-none select-none">
            {label && (
              <p className="text-white/80 text-[3vw] font-bold uppercase tracking-widest mb-2">
                {label}
              </p>
            )}
            <p className="text-white text-[12vw] font-mono font-black leading-none drop-shadow-2xl">
              {timeRemaining}
            </p>
          </div>
        );
      }

      default:
        return null;
    }
  };

  // --- BAND 3: Pinned Layers ---
  const renderPinnedLayersBand = () => {
    if (!Array.isArray(pinnedLayers) || pinnedLayers.length === 0) {
      return null;
    }

    // Sort by zIndex ascending
    const sorted = [...pinnedLayers].sort(
      (a, b) => (a.zIndex || 0) - (b.zIndex || 0),
    );

    return (
      <div className="absolute inset-0 w-full h-full z-20 pointer-events-none overflow-hidden">
        {sorted.map((layer) => {
          if (layer.visible === false) return null;

          const isSelected = isEditable && selectedLayerId === layer.id;
          const xPct = (layer.x ?? 0.5) * 100;
          const yPct = (layer.y ?? 0.5) * 100;
          const widthPct = layer.width ? layer.width * 100 : null;
          const heightPct = layer.height ? layer.height * 100 : null;

          const layerStyle = {
            position: "absolute",
            left: `${xPct}%`,
            top: `${yPct}%`,
            transform: "translate(-50%, -50%)",
            width: widthPct ? `${widthPct}%` : "auto",
            height: heightPct ? `${heightPct}%` : "auto",
            zIndex: layer.zIndex || 20,
            opacity: layer.style?.opacity ?? 1,
            pointerEvents: isEditable ? "auto" : "none",
          };

          return (
            <div
              key={layer.id}
              onClick={(e) => {
                if (isEditable && onSelectLayer) {
                  e.stopPropagation();
                  onSelectLayer(layer.id);
                }
              }}
              style={layerStyle}
              className={`transition-shadow ${
                isSelected ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-black/50" : ""
              }`}
            >
              {layer.type === "text" ? (
                <p
                  style={{
                    fontSize: layer.style?.fontSize
                      ? `${layer.style.fontSize}cqw`
                      : "4cqw",
                    color: layer.style?.color || "#ffffff",
                    fontFamily:
                      layer.style?.fontFamily === "serif"
                        ? "Georgia, serif"
                        : layer.style?.fontFamily === "mono"
                          ? '"Courier New", monospace'
                          : "system-ui, sans-serif",
                    fontWeight: layer.style?.fontWeight || "bold",
                    lineHeight: layer.style?.lineHeight || 1.2,
                    textShadow:
                      layer.style?.shadow || "0 2px 10px rgba(0,0,0,0.8)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {layer.content}
                </p>
              ) : layer.type === "video" ? (
                <video
                  src={layer.content}
                  autoPlay
                  loop={layer.loop !== false}
                  muted={layer.muted !== false}
                  className="w-full h-auto object-contain drop-shadow-xl"
                />
              ) : (
                <img
                  src={layer.content}
                  alt="Pinned Layer"
                  className="w-full h-auto object-contain drop-shadow-xl"
                  style={{
                    boxShadow: layer.style?.shadow,
                  }}
                />
              )}

              {/* Adjusting Node Handles in Edit Mode (FR-4.20) */}
              {isSelected && isEditable && (
                <>
                  <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-blue-500 border border-white rounded-full cursor-nwse-resize" />
                  <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-blue-500 border border-white rounded-full cursor-nesw-resize" />
                  <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-blue-500 border border-white rounded-full cursor-nesw-resize" />
                  <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-blue-500 border border-white rounded-full cursor-nwse-resize" />
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // --- BAND 4: Chrome Band (Topmost) ---
  const renderChromeBand = () => {
    if (chrome?.timerSplit && chrome?.timerCountdown > 0) {
      return (
        <div className="absolute bottom-0 left-0 w-full h-[15vh] flex items-center justify-center z-40 bg-black/60 backdrop-blur-md border-t border-white/10">
          <p className="text-[7vh] font-mono font-bold text-white tracking-widest">
            {chrome.timerCountdown}s
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div
      className="w-full h-full relative overflow-hidden bg-black flex flex-col items-center justify-center select-none"
      style={{ containerType: "size" }}
    >
      {/* Band 1: Background */}
      {renderBackgroundBand()}

      {/* Band 2: Content Slot */}
      {renderContentSlotBand()}

      {/* Band 3: Pinned Layers */}
      {renderPinnedLayersBand()}

      {/* Band 4: Chrome */}
      {renderChromeBand()}
    </div>
  );
}
