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
  isRouted,          // boolean: whether this destination display is actively routed to Program
  programSourceId,   // string | null: socketId of active program camera source
  programSourceName, // string | null: display name of program camera
}) {
  const canvasRef = useRef(null);
  const imgRef = useRef(new Image());
  const isDirtyRef = useRef(false);
  const animRef = useRef(null);
  const statsRef = useRef({ frameCount: 0, lastFpsTime: performance.now(), fps: 0, lastFrame: 0 });
  const [hudStats, setHudStats] = useState({ fps: 0, isAlive: false });
  const [hasFrame, setHasFrame] = useState(false);

  const isLive = !!(isRouted && programSourceId);

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
  const accentBorder = isGeneral
    ? "border-sky-500/70 ring-2 ring-sky-500/50 shadow-[0_0_20px_rgba(56,189,248,0.25)]"
    : "border-violet-500/70 ring-2 ring-violet-500/50 shadow-[0_0_20px_rgba(167,139,250,0.25)]";
  const accentBadgeBg = isGeneral ? "bg-sky-500 text-sky-950" : "bg-violet-500 text-violet-950";

  return (
    <div
      className={[
        "relative flex flex-col overflow-hidden rounded-[12px] border select-none transition-all duration-200 bg-black",
        isLive ? accentBorder : "border-white/10"
      ].join(" ")}
      style={{ aspectRatio: "16/9" }}
      title={`${label} — read-only display mirror (${isLive ? "LIVE CAMERA" : "DISPLAY PIXELS"})`}
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
      <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between pointer-events-none z-10">
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-[12px] text-[8px] font-black uppercase tracking-wider ${
          isLive ? `${accentBadgeBg} shadow-md` : "bg-black/75 border border-white/10 text-white/80"
        }`}>
          {isLive && <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping" />}
          <span>{isLive ? `LIVE · ${isGeneral ? "GENERAL" : "SPEAKER"}` : (isGeneral ? "GENERAL VIEW" : "SPEAKER VIEW")}</span>
        </div>
        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-[12px] border ${
          isLive
            ? "border-white/20 bg-black/75 text-white/80 font-mono"
            : "border-white/10 bg-black/60 text-white/50 font-mono"
        }`}>
          {isLive ? "LIVE CAM" : "PIXEL MIRROR"}
        </span>
      </div>

      {/* ── 4. Bottom HUD: Display Out Label & FPS ────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-2.5 py-1.5 flex items-center justify-between pointer-events-none z-10">
        <span className="text-[9px] font-bold text-white/80 truncate max-w-[120px]">
          {isLive ? (programSourceName || "Program Camera") : (isGeneral ? "General Out (Projector)" : "Speaker Out (Stage)")}
        </span>
        {hudStats.isAlive && (
          <span className="text-[8px] font-mono text-white/50 flex items-center gap-0.5">
            <PiWifiHigh size={9} className={isGeneral ? "text-sky-400" : "text-violet-400"} />
            {hudStats.fps} fps
          </span>
        )}
      </div>
    </div>
  );
}
