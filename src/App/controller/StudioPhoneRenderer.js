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
  const latestImgRef = useRef(null);
  const lastRenderedBitmapRef = useRef(null);
  const statsRef = useRef({
    frameCount: 0,
    lastFpsUpdateTime: performance.now(),
    fps: 0,
    latency: 0,
    lastFrameReceived: 0,
  });

  const [hudStats, setHudStats] = useState({ fps: 0, latency: 0, isAlive: false });
  const [hasReceivedFrame, setHasReceivedFrame] = useState(false);
  const latestEffectRef = useRef(null);
  const [currentEffect, setCurrentEffect] = useState(null);
  const animFrameIdRef = useRef(null);
  const isDirtyRef = useRef(false);

  useEffect(() => {
    // Continuous rendering loop decoupled from network arrivals (GPU texture blit)
    const renderLoop = () => {
      if (isDirtyRef.current && canvasRef.current) {
        const bitmap = lastRenderedBitmapRef.current;
        const img = latestImgRef.current;
        const source = bitmap || img;
        if (source) {
          const w = source.width || source.naturalWidth;
          const h = source.height || source.naturalHeight;
          if (w > 0 && h > 0) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d", { alpha: false });
            if (ctx) {
              if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
              }
              const eff = latestEffectRef.current;
              if (eff && eff.filter && eff.filter !== "none") {
                ctx.filter = eff.filter;
              } else {
                ctx.filter = "none";
              }
              ctx.drawImage(source, 0, 0, w, h);
              if (eff && eff.overlayColor && eff.overlayColor !== "transparent") {
                ctx.save();
                ctx.filter = "none";
                ctx.fillStyle = eff.overlayColor;
                ctx.fillRect(0, 0, w, h);
                ctx.restore();
              }
              isDirtyRef.current = false;
            }
          }
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
      let isDecoding = false;
      let pendingPayload = null;
      let lastDecodedTimestamp = 0;

      const decodeNext = async () => {
        if (isDecoding || !pendingPayload) return;
        isDecoding = true;
        const payload = pendingPayload;
        pendingPayload = null;

        const src = payload.data.startsWith("data:")
          ? payload.data
          : `data:image/jpeg;base64,${payload.data}`;

        try {
          if (typeof window.createImageBitmap === "function" && typeof window.fetch === "function") {
            const res = await fetch(src);
            const blob = await res.blob();
            const bitmap = await createImageBitmap(blob);

            // Discard bitmap if a newer frame has already rendered
            if (payload.timestamp && payload.timestamp < lastDecodedTimestamp) {
              bitmap.close();
            } else {
              const old = lastRenderedBitmapRef.current;
              lastRenderedBitmapRef.current = bitmap;
              lastDecodedTimestamp = payload.timestamp || Date.now();
              isDirtyRef.current = true;
              setHasReceivedFrame(true);
              if (old && typeof old.close === "function") {
                old.close();
              }
            }
          } else {
            await new Promise((resolve) => {
              const nextImg = new Image();
              nextImg.onload = () => {
                latestImgRef.current = nextImg;
                isDirtyRef.current = true;
                setHasReceivedFrame(true);
                resolve();
              };
              nextImg.onerror = resolve;
              nextImg.src = src;
            });
          }
        } catch (_) {
          // Robust fallback to HTMLImageElement
          try {
            await new Promise((resolve) => {
              const nextImg = new Image();
              nextImg.onload = () => {
                latestImgRef.current = nextImg;
                isDirtyRef.current = true;
                setHasReceivedFrame(true);
                resolve();
              };
              nextImg.onerror = resolve;
              nextImg.src = src;
            });
          } catch (__) {}
        } finally {
          isDecoding = false;
          if (pendingPayload) {
            decodeNext();
          }
        }
      };

      cleanup = window.electron.Network.onMobileFrame((payload) => {
        if (!payload?.data) return;
        const now = Date.now();
        statsRef.current.lastFrameReceived = now;
        statsRef.current.frameCount++;
        if (payload.timestamp) {
          statsRef.current.latency = Math.max(2, Math.min(999, now - payload.timestamp));
        }

        if (payload.effect) {
          latestEffectRef.current = payload.effect;
          setCurrentEffect(payload.effect);
        }
        pendingPayload = payload;
        decodeNext();
      });
    }

    return () => {
      if (cleanup) cleanup();
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      if (lastRenderedBitmapRef.current && typeof lastRenderedBitmapRef.current.close === "function") {
        lastRenderedBitmapRef.current.close();
        lastRenderedBitmapRef.current = null;
      }
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
          filter: (currentEffect?.filter && currentEffect.filter !== "none") ? currentEffect.filter : filterStyle,
          willChange: "transform, filter",
        }}
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          hasReceivedFrame ? "opacity-100" : "opacity-0"
        }`}
      />
      {currentEffect?.overlayColor && currentEffect.overlayColor !== "transparent" && (
        <div
          className="absolute inset-0 pointer-events-none z-[2]"
          style={{ backgroundColor: currentEffect.overlayColor }}
        />
      )}

      {/* Fallback standby state when waiting for stream */}
      {!hasReceivedFrame && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0c0d12] text-white/50 p-6 text-center">
          <div className="w-14 h-14 rounded-[12px] bg-[#8B5CF6]/10 border border-[#8B5CF6]/30 flex items-center justify-center text-[#8B5CF6] animate-pulse">
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
