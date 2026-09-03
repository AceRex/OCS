import React, { useEffect, useRef, useState } from "react";
import {
  PiX,
  PiTextAa,
  PiPlay,
  PiPause,
  PiSparkle,
  PiArrowClockwise,
} from "react-icons/pi";
import {
  getFilterStyleString,
  TeleprompterSharpenerSvgDef,
  PRO_FILTER_PRESETS,
} from "./TeleprompterFilterModal";

/**
 * TeleprompterFullscreenOverlay
 *
 * Fullscreen Reading Overlay with Scene-by-Scene & Line-by-Line Pacing:
 * - Scene break styles: 'scroll-out' (Slide/Roll up), 'fade' (Soft Dissolve), 'spotlight', 'badge'
 * - Word transitions: 'text-glow', 'underline', 'text-pop'
 * - Real-time word-by-word alignment tracking at ~35% reading horizon.
 */
export default function TeleprompterFullscreenOverlay({
  isOpen,
  onClose,
  videoStream,
  phoneFrame = null,
  script,
  activeWordIndex = 0,
  cameraOpacity = 15,
  fontSize = 42,
  isMirrored = false,
  onToggleMirror = null,
  filterState = null,
  onOpenFilterModal = null,
  sceneBreakStyle = "scroll-out",
  wordTransitionStyle = "text-glow",
  currentSegmentIndex = 0,
  isAutoScrolling = false,
  onToggleAutoScroll = null,
  scrollSpeed = 1.5,
  onChangeScrollSpeed = null,
}) {
  const containerRef = useRef(null);
  const textContainerRef = useRef(null);
  const videoRef = useRef(null);
  const [localFontSize, setLocalFontSize] = useState(fontSize);
  const [localOpacity, setLocalOpacity] = useState(cameraOpacity);
  const [localBreakStyle, setLocalBreakStyle] = useState(sceneBreakStyle);
  const [localWordStyle, setLocalWordStyle] = useState(wordTransitionStyle);
  const [isPaused, setIsPaused] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideControlsTimerRef = useRef(null);

  // Continuous auto-scroll loop matching mobile experience
  useEffect(() => {
    let animFrame = null;
    if (isOpen && isAutoScrolling && !isPaused) {
      const step = () => {
        if (textContainerRef.current) {
          textContainerRef.current.scrollTop += (scrollSpeed || 1.5) * 0.8;
        }
        animFrame = requestAnimationFrame(step);
      };
      animFrame = requestAnimationFrame(step);
    }
    return () => {
      if (animFrame) cancelAnimationFrame(animFrame);
    };
  }, [isOpen, isAutoScrolling, isPaused, scrollSpeed]);

  // Sync props
  useEffect(() => {
    setLocalOpacity(cameraOpacity);
  }, [cameraOpacity]);

  useEffect(() => {
    setLocalBreakStyle(sceneBreakStyle);
  }, [sceneBreakStyle]);

  useEffect(() => {
    setLocalWordStyle(wordTransitionStyle);
  }, [wordTransitionStyle]);

  // Sync video stream to the background video element
  useEffect(() => {
    if (videoRef.current && videoStream) {
      videoRef.current.srcObject = videoStream;
      videoRef.current.play().catch((err) => {
        console.warn("[TeleprompterFullscreen] video play notice:", err.message);
      });
    }
  }, [videoStream, isOpen]);

  // Handle ESC key and Spacebar
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === " ") {
        e.preventDefault();
        setIsPaused((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Auto-hide top control bar after 3.5 seconds of inactivity
  const handleMouseMove = () => {
    setShowControls(true);
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    hideControlsTimerRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3500);
  };

  useEffect(() => {
    return () => {
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    };
  }, []);

  // Structured Scene-by-Scene & Line-by-Line Token Mapping
  const processedSections = React.useMemo(() => {
    if (!script) {
      return [
        {
          id: "default-sec",
          label: "Scene 1",
          lines: [
            {
              id: "l1",
              text: "Welcome to the OCS Live Teleprompter.",
              words: [
                { word: "Welcome", index: 0 },
                { word: "to", index: 1 },
                { word: "the", index: 2 },
                { word: "OCS", index: 3 },
                { word: "Live", index: 4 },
                { word: "Teleprompter.", index: 5 },
              ],
              startIdx: 0,
              endIdx: 5,
            },
          ],
          startIdx: 0,
          endIdx: 5,
        },
      ];
    }

    const pages =
      script.pages && script.pages.length > 0
        ? script.pages
        : [{ id: "p1", label: script.title || "Scene 1", text: script.rawText || "" }];

    let currentWordIdx = 0;
    return pages.map((page, pIdx) => {
      const rawLines = (page.text || "").split(/\n+/).filter(Boolean);
      const lines = rawLines.length > 0 ? rawLines : [page.text || ""];

      const parsedLines = lines.map((lineText, lIdx) => {
        const words = lineText.split(/\s+/).filter(Boolean).map((word) => {
          const idx = currentWordIdx++;
          return { word, index: idx };
        });
        return {
          id: `${page.id || `p${pIdx}`}-l${lIdx}`,
          text: lineText,
          words,
          startIdx: words[0]?.index ?? currentWordIdx,
          endIdx: words[words.length - 1]?.index ?? currentWordIdx,
        };
      });

      return {
        ...page,
        sectionIndex: pIdx,
        lines: parsedLines,
        startIdx: parsedLines[0]?.words[0]?.index ?? 0,
        endIdx: currentWordIdx - 1,
      };
    });
  }, [script]);

  const totalTokensCount = React.useMemo(() => {
    if (processedSections.length === 0) return 0;
    const lastSec = processedSections[processedSections.length - 1];
    return lastSec.endIdx + 1;
  }, [processedSections]);

  // Smoothly scroll active word into the reading horizon (~35% viewport) across all sections
  useEffect(() => {
    if (!isOpen || isPaused || activeWordIndex < 0) return;
    const isSegmented = script?.scrollMode === "segmented";
    if (isSegmented) {
      const secEl = document.getElementById(`tp-fs-sec-${currentSegmentIndex}`);
      if (secEl && textContainerRef.current) {
        const container = textContainerRef.current;
        const elRect = secEl.getBoundingClientRect();
        const contRect = container.getBoundingClientRect();
        const relativeTop = elRect.top - contRect.top + container.scrollTop;
        const targetOffset = relativeTop - container.clientHeight * 0.25;
        container.scrollTo({
          top: Math.max(0, targetOffset),
          behavior: "smooth",
        });
      }
    } else {
      const activeEl = document.getElementById(`tp-fs-word-${activeWordIndex}`);
      if (activeEl && textContainerRef.current) {
        const container = textContainerRef.current;
        const elRect = activeEl.getBoundingClientRect();
        const contRect = container.getBoundingClientRect();
        const relativeTop = elRect.top - contRect.top + container.scrollTop;
        const targetOffset = relativeTop - container.clientHeight * 0.35;
        container.scrollTo({
          top: Math.max(0, targetOffset),
          behavior: "smooth",
        });
      }
    }
  }, [activeWordIndex, currentSegmentIndex, isOpen, isPaused, script?.scrollMode]);

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="fixed inset-0 z-[300] bg-black overflow-hidden flex flex-col font-outfit select-none"
    >
      {/* SVG Sharpener Definition */}
      <TeleprompterSharpenerSvgDef
        sharpness={
          filterState?.custom?.sharpness ??
          (filterState?.presetId ? PRO_FILTER_PRESETS.find((p) => p.id === filterState.presetId)?.settings?.sharpness : 25)
        }
      />

      {/* ─── LAYER 1: Background Camera Feed (System Webcam or Mobile Phone) ─── */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none flex items-center justify-center">
        {videoStream ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover transition-opacity duration-300"
            style={{
              opacity: localOpacity / 100,
              transform: isMirrored ? "scaleX(-1) translateZ(0)" : "translateZ(0)",
              filter: getFilterStyleString(filterState),
              willChange: "transform, filter",
              backfaceVisibility: "hidden",
            }}
          />
        ) : phoneFrame ? (
          <img
            src={phoneFrame}
            alt="Phone Camera Live"
            className="w-full h-full object-cover transition-opacity duration-300"
            style={{
              opacity: localOpacity / 100,
              transform: isMirrored ? "scaleX(-1) translateZ(0)" : "translateZ(0)",
              filter: getFilterStyleString(filterState),
            }}
          />
        ) : (
          <div className="w-full h-full bg-[#08080c]" />
        )}
      </div>

      {/* ─── LAYER 2: Reading Horizon Marker (Subtle guide at ~35% height) ─── */}
      <div
        className="absolute left-0 right-0 z-10 pointer-events-none flex items-center justify-between px-8 opacity-25"
        style={{ top: "35%" }}
      >
        <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
      </div>

      {/* ─── LAYER 3: Top Floating Control Header ─── */}
      <div
        className={`absolute top-0 left-0 right-0 z-50 p-4 flex items-center justify-between bg-gradient-to-b from-black/95 via-black/60 to-transparent transition-all duration-300 flex-wrap gap-2 ${
          showControls ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none"
        }`}
      >
        {/* Left: Script Title & Status */}
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-bold text-white flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{script?.title || "Live Teleprompter"}</span>
          </div>
          <span className="text-xs text-white/50 font-mono">
            Word {activeWordIndex + 1} of {totalTokensCount}
          </span>
        </div>

        {/* Center: Live Quick Adjustments & Playback Deck */}
        <div className="flex items-center gap-3 bg-black/75 backdrop-blur-xl border border-white/15 rounded-2xl px-4 py-2 text-xs text-white flex-wrap">
          {/* Play / Pause Auto-Scroll */}
          <button
            onClick={() => onToggleAutoScroll && onToggleAutoScroll()}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95 ${
              isAutoScrolling
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20"
                : "bg-white/10 hover:bg-white/20 text-white/80 hover:text-white"
            }`}
            title="Toggle Continuous Auto-Scroll (Spacebar)"
          >
            {isAutoScrolling ? <PiPause size={13} /> : <PiPlay size={13} />}
            <span>{isAutoScrolling ? "Scrolling" : "Play"}</span>
          </button>

          {/* Speed Selector */}
          <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-0.5">
            {[0.5, 1, 1.5, 2, 3].map((spd) => (
              <button
                key={spd}
                onClick={() => onChangeScrollSpeed && onChangeScrollSpeed(spd)}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                  scrollSpeed === spd
                    ? "bg-purple-600 text-white"
                    : "text-white/50 hover:text-white"
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>

          {/* Opacity Slider */}
          <div className="flex items-center gap-2">
            <span className="text-white/40 uppercase font-bold text-[10px]">
              Cam {localOpacity}%
            </span>
            <input
              type="range"
              min="1"
              max="40"
              value={localOpacity}
              onChange={(e) => setLocalOpacity(parseInt(e.target.value, 10))}
              className="w-20 accent-purple-500 cursor-pointer"
            />
          </div>

          {/* Camera Mirror Quick Toggle */}
          {videoStream && onToggleMirror && (
            <>
              <div className="w-[1px] h-4 bg-white/15" />
              <button
                onClick={onToggleMirror}
                className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border transition-all flex items-center gap-1 ${
                  isMirrored
                    ? "bg-purple-600/30 border-purple-500/50 text-purple-200"
                    : "bg-white/5 border-white/10 text-white/60 hover:text-white"
                }`}
                title={isMirrored ? "Camera is mirrored (selfie view). Click for standard view." : "Camera is standard (unmirrored). Click to mirror."}
              >
                <PiArrowClockwise size={12} />
                <span>{isMirrored ? "Mirrored" : "Normal"}</span>
              </button>
            </>
          )}

          {/* Camera Effects Quick Trigger */}
          {onOpenFilterModal && (
            <>
              <div className="w-[1px] h-4 bg-white/15" />
              <button
                onClick={onOpenFilterModal}
                className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border transition-all flex items-center gap-1 ${
                  filterState?.presetId && filterState.presetId !== "normal"
                    ? "bg-purple-600/30 border-purple-500/50 text-purple-200"
                    : "bg-white/5 border-white/10 text-white/60 hover:text-white"
                }`}
                title="Camera video sharpener, color grading & balancing effects"
              >
                <PiSparkle size={12} className={filterState?.presetId && filterState.presetId !== "normal" ? "text-purple-300 animate-pulse" : ""} />
                <span>
                  {filterState?.presetId && filterState.presetId !== "normal"
                    ? (PRO_FILTER_PRESETS.find((p) => p.id === filterState.presetId)?.label || "Graded")
                    : "Effects"}
                </span>
              </button>
            </>
          )}

          <div className="w-[1px] h-4 bg-white/15" />

          {/* Scene Break Quick Selector */}
          <div className="flex items-center gap-1">
            <span className="text-purple-400 font-bold text-[10px] uppercase mr-1">
              Break:
            </span>
            {[
              { id: "scroll-out", label: "Scroll" },
              { id: "fade", label: "Fade" },
              { id: "spotlight", label: "Spotlight" },
            ].map((b) => (
              <button
                key={b.id}
                onClick={() => setLocalBreakStyle(b.id)}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                  localBreakStyle === b.id
                    ? "bg-purple-600 text-white"
                    : "bg-white/5 text-white/50 hover:text-white"
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>

          <div className="w-[1px] h-4 bg-white/15" />

          {/* Font Size Adjust */}
          <div className="flex items-center gap-1.5">
            <PiTextAa size={14} className="text-white/50" />
            <button
              onClick={() => setLocalFontSize((prev) => Math.max(24, prev - 4))}
              className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center font-bold"
            >
              -
            </button>
            <span className="font-mono text-white/80 w-6 text-center">
              {localFontSize}
            </span>
            <button
              onClick={() => setLocalFontSize((prev) => Math.min(92, prev + 4))}
              className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center font-bold"
            >
              +
            </button>
          </div>

          <div className="w-[1px] h-4 bg-white/15" />

          {/* Play / Pause Toggle */}
          <button
            onClick={() => setIsPaused((prev) => !prev)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 font-semibold text-white/90 transition-colors"
          >
            {isPaused ? <PiPlay size={13} /> : <PiPause size={13} />}
            <span>{isPaused ? "Resume" : "Pause"}</span>
          </button>
        </div>

        {/* Right: Exit Fullscreen */}
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-2xl bg-red-600/80 hover:bg-red-600 text-white font-bold text-xs flex items-center gap-2 shadow-lg backdrop-blur-md transition-all active:scale-95"
        >
          <PiX size={15} />
          <span>Exit [Esc]</span>
        </button>
      </div>

      {/* ─── LAYER 4: High-Contrast Teleprompter Canvas (Scene-by-Scene & Line-by-Line) ─── */}
      <div
        ref={textContainerRef}
        className="relative z-20 flex-1 overflow-y-auto px-[10vw] py-[25vh] no-scrollbar text-center space-y-16"
      >
        {processedSections.map((sec, secIdx) => {
          const isSegmented = script?.scrollMode === "segmented";
          const isSecActive = isSegmented
            ? secIdx === currentSegmentIndex
            : (sec.startIdx <= activeWordIndex && activeWordIndex <= sec.endIdx);
          const isSecPast = isSegmented
            ? secIdx < currentSegmentIndex
            : (sec.endIdx < activeWordIndex);

          return (
            <div
              key={sec.id || `sec-${secIdx}`}
              id={`tp-fs-sec-${secIdx}`}
              className={`transition-all duration-500 transform ${
                localBreakStyle === "scroll-out" && isSecPast
                  ? "-translate-y-4 opacity-35 scale-[0.98]"
                  : localBreakStyle === "fade" && isSecPast
                  ? "opacity-35"
                  : localBreakStyle === "spotlight"
                  ? isSecActive
                    ? "opacity-100 scale-100"
                    : "opacity-25 scale-95"
                  : isSecActive
                  ? "opacity-100"
                  : "opacity-45"
              }`}
            >
              {/* Scene Divider Card Header */}
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-xs font-bold text-purple-200 mb-8 tracking-widest uppercase backdrop-blur-md shadow-lg shadow-purple-500/10">
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                {sec.label || `Scene ${secIdx + 1}`}
              </div>

              {/* Lines in Scene */}
              <div
                className="max-w-4xl mx-auto font-sans font-bold leading-snug tracking-normal space-y-6 transition-all"
                style={{
                  fontSize: `${localFontSize}px`,
                  lineHeight: 1.5,
                }}
              >
                {sec.lines.map((line) => {
                  const isLineActive = line.startIdx <= activeWordIndex && activeWordIndex <= line.endIdx;
                  const isLinePast = line.endIdx < activeWordIndex;

                  return (
                    <div
                      key={line.id}
                      className={`transition-all duration-300 py-2 rounded-2xl ${
                        isLineActive
                          ? "bg-white/[0.06] backdrop-blur-sm px-4 shadow-xl"
                          : isLinePast
                          ? localBreakStyle === "scroll-out"
                            ? "-translate-y-1 opacity-55"
                            : "opacity-55"
                          : "opacity-30"
                      }`}
                    >
                      {line.words.map((wObj) => {
                        const isWordActive = wObj.index === activeWordIndex;
                        const isWordPast = wObj.index < activeWordIndex;

                        let activeWordStyles = {};
                        if (isWordActive) {
                          if (localWordStyle === "text-glow") {
                            activeWordStyles = {
                              color: "#FFFFFF",
                              transform: "scale(1.12) translateY(-2px)",
                              textShadow:
                                "0 0 24px rgba(56,189,248,0.95), 0 0 44px rgba(56,189,248,0.7), 0 4px 18px rgba(0,0,0,0.9)",
                              borderBottom: "3px solid #38bdf8",
                            };
                          } else if (localWordStyle === "underline") {
                            activeWordStyles = {
                              color: "#FFFFFF",
                              borderBottom: "4px solid #38bdf8",
                              paddingBottom: "3px",
                            };
                          } else if (localWordStyle === "text-pop") {
                            activeWordStyles = {
                              color: "#38bdf8",
                              transform: "scale(1.24) translateY(-3px)",
                              fontWeight: 900,
                              textShadow: "0 4px 20px rgba(56,189,248,0.85)",
                            };
                          }
                        }

                        return (
                          <React.Fragment key={`w-${wObj.index}`}>
                            <span
                              id={`tp-fs-word-${wObj.index}`}
                              style={{
                                display: "inline-block",
                                color: isWordActive
                                  ? "#FFFFFF"
                                  : isWordPast
                                  ? "rgba(255,255,255,0.8)"
                                  : "rgba(255,255,255,0.35)",
                                fontWeight: isWordActive ? 900 : isWordPast ? 700 : 600,
                                transition: "all 140ms cubic-bezier(0.2, 0.8, 0.2, 1)",
                                textShadow: isWordActive
                                  ? undefined
                                  : "0 4px 14px rgba(0,0,0,0.85)",
                                ...activeWordStyles,
                              }}
                              className="mx-1.5 my-1"
                            >
                              {wObj.word}
                            </span>{" "}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Hint Banner */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none text-[11px] text-white/30 font-mono">
        Space = Pause/Resume • Move mouse for controls • Esc = Exit
      </div>
    </div>
  );
}
