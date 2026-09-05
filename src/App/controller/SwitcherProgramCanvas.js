import React, { useEffect, useRef, useState } from "react";
import { PiVideoCamera } from "react-icons/pi";

/**
 * SwitcherProgramCanvas
 *
 * Renders the high-resolution program output stream.
 * - Hardware-accelerated continuous video when WebRTC `stream` is present (30-60 FPS)
 * - Fallback to high-res program frame channel and low-res preview frames
 * - Universal 12px border radius
 */
export default function SwitcherProgramCanvas({ programSourceId, programSourceName, stream }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(new Image());
  const isDirtyRef = useRef(false);
  const animRef = useRef(null);
  const statsRef = useRef({ fps: 0, frameCount: 0, lastFpsTime: performance.now(), lastFrame: 0 });
  const [hudStats, setHudStats] = useState({ fps: 0, isAlive: false });
  const [hasFrame, setHasFrame] = useState(false);

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

  // Frame buffer render loop fallback
  useEffect(() => {
    if (stream) return;

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
    if (stream || !programSourceId) { if (!stream) setHasFrame(false); return; }
    let cleanupProgram = null;
    let cleanupFallback = null;

    const paintFrame = (data) => {
      if (!data) return;
      statsRef.current.lastFrame = Date.now();
      statsRef.current.frameCount++;
      const src = data.startsWith("data:") ? data : `data:image/jpeg;base64,${data}`;
      imgRef.current.onload = () => { isDirtyRef.current = true; };
      imgRef.current.src = src;
      setHasFrame(true);
    };

    // Primary: high-res program frame channel
    if (window.electron?.Switcher?.onProgramFrame) {
      cleanupProgram = window.electron.Switcher.onProgramFrame((payload) => {
        if (!payload?.data) return;
        paintFrame(payload.data);
      });
    }

    // Fallback: low-res preview frame filtered to program source
    if (window.electron?.Switcher?.onCameraFrame) {
      cleanupFallback = window.electron.Switcher.onCameraFrame((payload) => {
        if (payload?.fromId !== programSourceId) return;
        if (!payload?.data) return;
        if (Date.now() - statsRef.current.lastFrame > 200) {
          paintFrame(payload.data);
        }
      });
    }

    return () => {
      if (cleanupProgram) cleanupProgram();
      if (cleanupFallback) cleanupFallback();
      if (!stream) setHasFrame(false);
    };
  }, [programSourceId, stream]);

  return (
    <div className="relative w-full overflow-hidden rounded-[12px] bg-black border border-white/10 shadow-2xl" style={{ aspectRatio: "16/9" }}>
      {/* Tally border */}
      <div className="absolute inset-0 rounded-[12px] ring-2 ring-red-500/60 pointer-events-none z-10" />

      {/* Video / Canvas */}
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

      {/* No-signal state */}
      {(!programSourceId || (!hasFrame && !stream) || (!hudStats.isAlive && !stream)) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#090a0f]">
          <div className="w-14 h-14 rounded-[12px] bg-white/5 border border-white/10 flex items-center justify-center">
            <PiVideoCamera size={28} className="text-white/25" />
          </div>
          <div className="text-center">
            <p className="text-white/40 text-sm font-semibold">
              {programSourceId ? "Awaiting continuous stream…" : "No camera selected"}
            </p>
            <p className="text-white/20 text-xs mt-1">
              {programSourceId ? `Connecting to ${programSourceName || "camera"}` : "Click a camera tile to cut to it"}
            </p>
          </div>
        </div>
      )}

      {/* Overlaid HUD */}
      {programSourceId && (hasFrame || stream) && (hudStats.isAlive || stream) && (
        <>
          <div className="absolute top-3 left-3 bg-red-600/90 text-white text-xs font-black px-3 py-1 rounded-full flex items-center gap-1.5 shadow-lg z-10">
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
            PROGRAM
          </div>
          <div className="absolute top-3 right-3 bg-black/70 text-white/60 text-[10px] font-mono px-2 py-1 rounded-[12px] border border-white/10 z-10">
            {stream ? "30 fps HD" : `${hudStats.fps} fps`}
          </div>
          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between z-10">
            <span className="bg-black/70 text-white text-xs font-bold px-3 py-1 rounded-[12px] border border-white/10 truncate max-w-[70%]">
              {programSourceName || "Program"}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
