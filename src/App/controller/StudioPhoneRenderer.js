import React, { useEffect, useRef, useState } from "react";
import { PiVideoCamera, PiSparkle, PiWarning, PiWifiHigh } from "react-icons/pi";

/**
 * StudioPhoneRenderer
 * Hardware-accelerated, decoupled direct-canvas renderer for mobile studio camera.
 * Completely isolates per-frame rendering from parent React state to prevent
 * component re-renders, GC pauses, and UI stutter.
 */
export default function StudioPhoneRenderer({
  isMirrored = false,
  filterStyle = "none",
  isRecording = false,
  onStreamActiveChange,
}) {
  const canvasRef = useRef(null);
  const imgCacheRef = useRef(new Image());
  const statsRef = useRef({
    frameCount: 0,
    lastFpsUpdateTime: performance.now(),
    fps: 0,
    latency: 0,
    lastFrameReceived: 0,
  });

  const [hudStats, setHudStats] = useState({ fps: 0, latency: 0, isAlive: false });
  const [hasReceivedFrame, setHasReceivedFrame] = useState(false);
  const animFrameIdRef = useRef(null);
  const isDirtyRef = useRef(false);

  useEffect(() => {
    const img = imgCacheRef.current;
    img.crossOrigin = "anonymous";

    // Continuous rendering loop decoupled from network arrivals
    const renderLoop = () => {
      if (isDirtyRef.current && canvasRef.current && img.complete && img.naturalWidth > 0) {
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
      animFrameIdRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameIdRef.current = requestAnimationFrame(renderLoop);

    // Periodic HUD stat updater (once every 500ms to avoid React churn)
    const statsInterval = setInterval(() => {
      const now = performance.now();
      const deltaSec = (now - statsRef.current.lastFpsUpdateTime) / 1000;
      const currentFps = deltaSec > 0 ? Math.round((statsRef.current.frameCount / deltaSec) * 10) / 10 : 0;
      statsRef.current.fps = currentFps;
      statsRef.current.frameCount = 0;
      statsRef.current.lastFpsUpdateTime = now;

      const isAlive = Date.now() - statsRef.current.lastFrameReceived < 3000;

      setHudStats({
        fps: isAlive ? currentFps : 0,
        latency: isAlive ? statsRef.current.latency : 0,
        isAlive,
      });

      if (onStreamActiveChange) {
        onStreamActiveChange(isAlive);
      }
    }, 500);

    // Direct listener for mobile camera frames from Electron IPC
    let cleanup = null;
    if (window.electron?.Network?.onMobileFrame) {
      cleanup = window.electron.Network.onMobileFrame((payload) => {
        if (!payload?.data) return;
        const now = Date.now();
        statsRef.current.lastFrameReceived = now;
        statsRef.current.frameCount++;
        if (payload.timestamp) {
          statsRef.current.latency = Math.max(2, Math.min(999, now - payload.timestamp));
        }

        const src = payload.data.startsWith("data:")
          ? payload.data
          : `data:image/jpeg;base64,${payload.data}`;

        img.onload = () => {
          isDirtyRef.current = true;
        };
        img.src = src;

        setHasReceivedFrame(true);
      });
    }

    return () => {
      if (cleanup) cleanup();
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      clearInterval(statsInterval);
    };
  }, [onStreamActiveChange]);

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden select-none">
      {/* Hardware-accelerated Canvas with Filters and CSS Mirroring */}
      <canvas
        ref={canvasRef}
        style={{
          transform: isMirrored ? "scaleX(-1) translateZ(0)" : "translateZ(0)",
          filter: filterStyle,
          willChange: "transform, filter",
        }}
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          hasReceivedFrame && hudStats.isAlive ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Fallback standby state when waiting for stream */}
      {(!hasReceivedFrame || !hudStats.isAlive) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0c0d12] text-white/50 p-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-300 animate-pulse">
            <PiVideoCamera size={30} />
          </div>
          <div>
            <div className="text-xs font-bold text-white/80">Awaiting Phone Camera Stream...</div>
            <div className="text-[11px] text-white/40 mt-1 max-w-xs leading-relaxed">
              Open the <strong>Stage Teleprompter</strong> on your mobile companion or tap <strong>Accept</strong> on the stream prompt.
            </div>
          </div>
        </div>
      )}

      {/* ─── Top Studio Status Deck ─── */}
      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
        {/* Left: Tally / Live Indicator */}
        <div className="flex items-center gap-2">
          {isRecording ? (
            <div className="bg-red-600/95 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-lg border border-red-400/40 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              <span>REC • ON AIR</span>
            </div>
          ) : hudStats.isAlive ? (
            <div className="bg-emerald-600/90 text-white text-[9px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-md border border-emerald-400/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
              <span>STUDIO CAM LIVE</span>
            </div>
          ) : null}
        </div>

        {/* Right: Technical Stats HUD (FPS, Latency, Bandwidth) */}
        {hudStats.isAlive && (
          <div className="flex items-center gap-1.5 bg-black/75 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-[9px] font-mono text-white/80 shadow-md">
            <PiWifiHigh size={11} className="text-emerald-400" />
            <span>{hudStats.fps} FPS</span>
            <span className="text-white/20">|</span>
            <span className={hudStats.latency < 80 ? "text-emerald-300" : "text-amber-300"}>
              {hudStats.latency}ms
            </span>
          </div>
        )}
      </div>

      {/* Tally Border on Active Recording */}
      {isRecording && (
        <div className="absolute inset-0 border-2 border-red-500/80 pointer-events-none rounded-xl" />
      )}
    </div>
  );
}
