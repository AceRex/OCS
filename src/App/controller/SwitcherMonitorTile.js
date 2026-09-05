import React, { useEffect, useRef, useState } from "react";
import { PiWifiHigh, PiTelevision } from "react-icons/pi";

/**
 * SwitcherMonitorTile
 *
 * True pixel-capture mirror for the 8-tile multiview grid (General View & Speaker View).
 * - Architected as a "dumb" visual mirror: never independently lays out scripture,
 *   verses, badges, or typography. All layout logic resides strictly in DisplayCanvas.
 * - Displays the actual rendered raster from Electron webContents.capturePage()
 *   scaled uniformly via standard canvas drawImage / object-contain.
 * - Zero overlapping text, zero typesetting drift.
 * - Dynamic live-tally accent border and strict 12px border radius.
 */
export default function SwitcherMonitorTile({
  type,              // 'general' | 'speaker'
  label,             // "GENERAL VIEW" | "SPEAKER VIEW"
  displayNumber,     // 1 | 2
  assignedDisplayNumber = null, // 1 | 2 | "both" | null
  isRouted,          // boolean: whether this destination display is actively routed to Program
  programSourceId,   // string | null: socketId of active program camera source
  programSourceName, // string | null: display name of program camera
  isSelected = false,// boolean: whether this display is selected
  isShowing = false, // boolean: whether this display is currently on air / showing
  canSelect = true,  // boolean: whether operator can select
  onSelect,          // function (type) => void
  onSetDisplay,      // function (type, 1 | 2) => void
  assignedSourceLabel, // optional string: e.g. "Presentation (Slides)" or "Cam 1"
}) {
  const canvasRef = useRef(null);
  const imgRef = useRef(new Image());
  const isDirtyRef = useRef(false);
  const animRef = useRef(null);
  const statsRef = useRef({ frameCount: 0, lastFpsTime: performance.now(), fps: 0, lastFrame: 0 });
  const [hudStats, setHudStats] = useState({ fps: 0, isAlive: false });
  const [hasFrame, setHasFrame] = useState(false);

  const isLive = !!(isShowing || (isRouted && programSourceId));
  const dispNum = displayNumber || (type === "general" ? 1 : 2);

  // ── Render loop via requestAnimationFrame (draws captured raster into canvas) ────────
  useEffect(() => {
    const renderLoop = () => {
      if (isDirtyRef.current && canvasRef.current) {
        const img = imgRef.current;
        if (img.complete && img.naturalWidth > 0) {
          const canvas = canvasRef.current;
          const ctx = canvas.getContext("2d", { alpha: false });
          if (ctx) {
            if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
              canvas.width = img.naturalWidth;
              canvas.height = img.naturalHeight;
            }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            isDirtyRef.current = false;
          }
        }
      }
      animRef.current = requestAnimationFrame(renderLoop);
    };
    animRef.current = requestAnimationFrame(renderLoop);

    const statsInterval = setInterval(() => {
      const now = performance.now();
      const deltaSec = (now - statsRef.current.lastFpsTime) / 1000;
      const fps = deltaSec > 0 ? Math.round(statsRef.current.frameCount / deltaSec) : 0;
      statsRef.current.fps = fps;
      statsRef.current.frameCount = 0;
      statsRef.current.lastFpsTime = now;
      const isAlive = Date.now() - statsRef.current.lastFrame < 4000;
      setHudStats({ fps: isAlive ? fps : 0, isAlive });
    }, 500);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      clearInterval(statsInterval);
    };
  }, []);

  // ── Ingest genuine display window raster frames via capturePage IPC ──────────────────
  useEffect(() => {
    let cleanup = null;
    const handleFrame = (payload) => {
      if (!payload || payload.destination !== type || !payload.data) return;
      statsRef.current.lastFrame = Date.now();
      statsRef.current.frameCount++;
      const src = payload.data.startsWith("data:") ? payload.data : `data:image/jpeg;base64,${payload.data}`;
      imgRef.current.onload = () => {
        isDirtyRef.current = true;
      };
      imgRef.current.src = src;
      setHasFrame(true);
    };

    if (window.electron?.Switcher?.onDisplayMirrorFrame) {
      cleanup = window.electron.Switcher.onDisplayMirrorFrame(handleFrame);
    }

    return () => {
      if (cleanup) cleanup();
    };
  }, [type]);

  // ── Also ingest live camera program frames when actively routed ───────────────────────
  useEffect(() => {
    if (!isLive) return;
    let cleanup = null;
    const handleProgramFrame = (payload) => {
      if (!payload?.data) return;
      statsRef.current.lastFrame = Date.now();
      statsRef.current.frameCount++;
      const src = payload.data.startsWith("data:") ? payload.data : `data:image/jpeg;base64,${payload.data}`;
      imgRef.current.onload = () => {
        isDirtyRef.current = true;
      };
      imgRef.current.src = src;
      setHasFrame(true);
    };

    if (window.electron?.Switcher?.onProgramFrame) {
      cleanup = window.electron.Switcher.onProgramFrame(handleProgramFrame);
    }

    return () => {
      if (cleanup) cleanup();
    };
  }, [isLive, programSourceId]);

  const isGeneral = type === "general";
  const accentTheme = isGeneral ? "sky" : "violet";

  // Border & Ring determination
  let borderRingClass = "border-white/10 hover:border-white/25";
  if (isShowing) {
    borderRingClass = "border-red-500 ring-2 ring-red-500/80 shadow-[0_0_20px_rgba(239,68,68,0.4)]";
  } else if (isSelected) {
    borderRingClass = isGeneral
      ? "border-sky-400 ring-2 ring-sky-400/60 shadow-[0_0_16px_rgba(56,189,248,0.25)]"
      : "border-violet-400 ring-2 ring-violet-400/60 shadow-[0_0_16px_rgba(167,139,250,0.25)]";
  } else if (isLive) {
    borderRingClass = isGeneral
      ? "border-sky-500/60 ring-1 ring-sky-500/40"
      : "border-violet-500/60 ring-1 ring-violet-500/40";
  }

  const handleClick = () => {
    if (canSelect && typeof onSelect === "function") {
      onSelect(type);
    }
  };

  const handleKeyDown = (e) => {
    if ((e.key === "Enter" || e.key === " ") && canSelect && typeof onSelect === "function") {
      e.preventDefault();
      onSelect(type);
    }
  };

  return (
    <div
      role={canSelect ? "button" : undefined}
      tabIndex={canSelect ? 0 : -1}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={[
        "group relative flex flex-col overflow-hidden rounded-[12px] border select-none transition-all duration-200 bg-black",
        canSelect ? "cursor-pointer hover:scale-[1.01] active:scale-[0.99] focus:outline-none" : "cursor-default",
        borderRingClass,
      ].join(" ")}
      style={{ aspectRatio: "16/9" }}
      title={`${label} (Display ${dispNum}) — Click to select / show on Program`}
    >
      {/* ── 1. True Raster Pixel Mirror Canvas (Scaled Uniformly) ─────────────── */}
      <canvas
        ref={canvasRef}
        className={`w-full h-full object-contain transition-opacity duration-200 ${
          hasFrame && hudStats.isAlive ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* ── 2. Connecting / Standby State ─────────────────────────────────────── */}
      {(!hasFrame || !hudStats.isAlive) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0a0b10] text-white/40">
          <PiTelevision size={22} className={isGeneral ? "text-sky-400/50 animate-pulse" : "text-violet-400/50 animate-pulse"} />
          <span className="text-[9px] font-bold tracking-wider uppercase">
            Connecting display mirror…
          </span>
        </div>
      )}

      {/* ── 3. Persistent Header Bar (12px standard) ──────────────────────────── */}
      <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between z-10 pointer-events-none">
        {/* Left: Display Number + Label + Assigned Badges */}
        <div className="flex items-center gap-1">
          <span className={`w-5 h-5 flex items-center justify-center rounded-[12px] text-[10px] font-black tracking-tighter ${
            isShowing
              ? "bg-red-500 text-white shadow-md animate-pulse"
              : isSelected
              ? isGeneral
                ? "bg-sky-500 text-sky-950 font-black"
                : "bg-violet-500 text-violet-950 font-black"
              : "bg-black/80 border border-white/20 text-white"
          }`}>
            {dispNum}
          </span>
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-[12px] text-[8px] font-black uppercase tracking-wider ${
            isShowing
              ? "bg-red-500/90 text-white shadow-md"
              : isLive
              ? isGeneral
                ? "bg-sky-500/80 text-sky-950 shadow-md"
                : "bg-violet-500/80 text-violet-950 shadow-md"
              : "bg-black/75 border border-white/10 text-white/80"
          }`}>
            {isShowing && <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />}
            <span>{isShowing ? `LIVE · DISPLAY ${dispNum}` : `DISPLAY ${dispNum} · ${isGeneral ? "GENERAL" : "SPEAKER"}`}</span>
          </div>
          {assignedDisplayNumber === 1 && (
            <span className="bg-sky-500 text-sky-950 text-[8px] font-black px-1.5 py-0.5 rounded-[12px] shadow-md">
              DISP 1
            </span>
          )}
          {assignedDisplayNumber === 2 && (
            <span className="bg-violet-500 text-violet-950 text-[8px] font-black px-1.5 py-0.5 rounded-[12px] shadow-md">
              DISP 2
            </span>
          )}
          {assignedDisplayNumber === "both" && (
            <span className="bg-gradient-to-r from-sky-500 to-violet-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-[12px] shadow-md">
              DISP 1 & 2
            </span>
          )}
        </div>

        {/* Right: Quick Assign Buttons & Mode Badge */}
        <div className="flex items-center gap-1 pointer-events-auto">
          {typeof onSetDisplay === "function" && (
            <div className="flex items-center gap-0.5 bg-black/80 rounded-[12px] p-0.5 border border-white/20">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSetDisplay(type, 1); }}
                title={`Set ${isGeneral ? "General Screen" : "Speaker Screen"} as Display 1`}
                className={`px-1.5 py-0.5 rounded-[12px] text-[8px] font-black transition-all ${
                  assignedDisplayNumber === 1 || assignedDisplayNumber === "both"
                    ? "bg-sky-500 text-sky-950"
                    : "text-white/60 hover:text-white hover:bg-white/20"
                }`}
              >
                1
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSetDisplay(type, 2); }}
                title={`Set ${isGeneral ? "General Screen" : "Speaker Screen"} as Display 2`}
                className={`px-1.5 py-0.5 rounded-[12px] text-[8px] font-black transition-all ${
                  assignedDisplayNumber === 2 || assignedDisplayNumber === "both"
                    ? "bg-violet-500 text-violet-950"
                    : "text-white/60 hover:text-white hover:bg-white/20"
                }`}
              >
                2
              </button>
            </div>
          )}
          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-[12px] border ${
            isShowing
              ? "border-red-400/40 bg-red-950/80 text-red-200 font-mono"
              : isLive
              ? "border-white/20 bg-black/75 text-white/80 font-mono"
              : "border-white/10 bg-black/60 text-white/50 font-mono"
          }`}>
            {isShowing ? "ON AIR" : isLive ? "LIVE CAM" : "PRESENTATION"}
          </span>
        </div>
      </div>

      {/* ── 4. Bottom HUD: Display Out Label, Source & FPS ───────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-2.5 py-1.5 flex items-center justify-between pointer-events-none z-10">
        <div className="flex flex-col min-w-0">
          <span className="text-[9px] font-bold text-white/90 truncate max-w-[130px]">
            {assignedSourceLabel || (isGeneral ? "General Out (Projector)" : "Speaker Out (Stage)")}
          </span>
          {programSourceName && isLive && (
            <span className="text-[8px] text-amber-300 font-medium truncate max-w-[130px]">
              ↳ {programSourceName}
            </span>
          )}
        </div>
        {hudStats.isAlive && (
          <span className="text-[8px] font-mono text-white/50 flex items-center gap-0.5 shrink-0">
            <PiWifiHigh size={9} className={isGeneral ? "text-sky-400" : "text-violet-400"} />
            {hudStats.fps} fps
          </span>
        )}
      </div>
    </div>
  );
}

