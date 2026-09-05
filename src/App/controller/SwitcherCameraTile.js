import React, { useEffect, useRef, useState } from "react";
import { PiVideoCamera, PiWifiHigh } from "react-icons/pi";

/**
 * SwitcherCameraTile
 *
 * Renders one of the 6 camera-source slots in the multiview grid.
 * - Hardware-accelerated continuous video when WebRTC `stream` is present
 * - Low-resolution preview fallback (frames arrive via onCameraFrame keyed by deviceId)
 * - Tally border when isProgram
 * - Empty-slot placeholder when slotInfo is null
 * - Click disabled when empty or !canSwitch
 * - Universal 12px border radius
 */
export default function SwitcherCameraTile({
  slotIndex,
  slotInfo,
  stream,
  isProgram,
  canSwitch,
  onSelect,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(new Image());
  const isDirtyRef = useRef(false);
  const animRef = useRef(null);
  const statsRef = useRef({ frameCount: 0, lastFpsTime: performance.now(), fps: 0, lastFrame: 0 });
  const [hudStats, setHudStats] = useState({ fps: 0, isAlive: false });
  const [hasFrame, setHasFrame] = useState(false);

  const socketId = slotInfo?.socketId || null;

  // Bind WebRTC continuous stream to <video>
  useEffect(() => {
    if (videoRef.current) {
      if (stream) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
        setHasFrame(true);
        setHudStats({ fps: 30, isAlive: true });
      } else {
        videoRef.current.srcObject = null;
      }
    }
  }, [stream]);

  // Frame pump fallback loop (for frame buffer stream)
  useEffect(() => {
    if (stream) return; // Skip canvas loop if continuous WebRTC stream is active

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
      const isAlive = Date.now() - statsRef.current.lastFrame < 3000;
      setHudStats({ fps: isAlive ? fps : 0, isAlive });
    }, 500);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      clearInterval(statsInterval);
    };
  }, [stream]);

  useEffect(() => {
    if (stream || !socketId) { if (!stream) setHasFrame(false); return; }
    let cleanup = null;
    if (window.electron?.Switcher?.onCameraFrame) {
      cleanup = window.electron.Switcher.onCameraFrame((payload) => {
        if (payload?.fromId !== socketId) return;
        if (!payload?.data) return;
        statsRef.current.lastFrame = Date.now();
        statsRef.current.frameCount++;
        const src = payload.data.startsWith("data:") ? payload.data : `data:image/jpeg;base64,${payload.data}`;
        imgRef.current.onload = () => { isDirtyRef.current = true; };
        imgRef.current.src = src;
        setHasFrame(true);
      });
    }
    return () => { if (cleanup) cleanup(); if (!stream) setHasFrame(false); };
  }, [socketId, stream]);

  const isEmpty = !slotInfo;
  const isClickable = !isEmpty && canSwitch && !isProgram;

  return (
    <div
      onClick={() => { if (isClickable && socketId) onSelect(socketId); }}
      title={isEmpty ? `Camera Slot ${slotIndex} — Empty` : slotInfo.name}
      className={[
        "relative flex flex-col overflow-hidden rounded-[12px] border transition-all duration-150 select-none",
        isEmpty ? "border-white/10 bg-white/[0.03] cursor-default" :
          isProgram ? "border-red-500/80 ring-2 ring-red-500/60 bg-black cursor-default shadow-[0_0_20px_rgba(239,68,68,0.3)]" :
          isClickable ? "border-white/15 bg-black/60 cursor-pointer hover:border-white/30 hover:ring-1 hover:ring-white/20 active:scale-[0.98]" :
          "border-white/10 bg-black/60 cursor-default"
      ].join(" ")}
      style={{ aspectRatio: "16/9" }}
    >
      {isEmpty && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-white/20">
          <PiVideoCamera size={22} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Slot {slotIndex} — Empty</span>
        </div>
      )}

      {!isEmpty && (
        <>
          {/* Continuous WebRTC Video Stream */}
          {stream ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          ) : (
            <canvas
              ref={canvasRef}
              className={`w-full h-full object-cover transition-opacity duration-300 ${hasFrame && hudStats.isAlive ? "opacity-100" : "opacity-0"}`}
            />
          )}

          {(!hasFrame || !hudStats.isAlive) && !stream && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0c0d12] text-white/40">
              <PiVideoCamera size={20} className="animate-pulse text-white/30" />
              <span className="text-[9px] font-semibold">Camera not streaming</span>
            </div>
          )}
          {isProgram && (
            <div className="absolute top-1.5 left-1.5 bg-red-600/95 text-white text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-lg border border-red-400/40 z-10">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
              PROGRAM
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5 flex items-center justify-between z-10">
            <span className="text-[9px] font-bold text-white/80 truncate">{slotInfo.name}</span>
            {hudStats.isAlive && (
              <span className="text-[8px] font-mono text-white/40 flex items-center gap-0.5">
                <PiWifiHigh size={9} className="text-emerald-400" />
                {stream ? "30 fps" : `${hudStats.fps} fps`}
              </span>
            )}
          </div>
          <div className="absolute top-1.5 right-1.5 bg-black/60 text-white/50 text-[8px] font-black px-1.5 py-0.5 rounded-[12px] border border-white/10 z-10">
            CAM {slotIndex}
          </div>
        </>
      )}
    </div>
  );
}
