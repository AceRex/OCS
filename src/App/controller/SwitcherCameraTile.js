import React, { useEffect, useRef, useState } from "react";
import {
  PiVideoCamera,
  PiWifiHigh,
  PiArrowsLeftRight,
  PiPlus,
  PiX,
  PiDeviceMobile,
  PiTelevision,
} from "react-icons/pi";

/**
 * SwitcherCameraTile
 *
 * Renders one of the 6 camera-source slots in the multiview grid.
 * - Hardware-accelerated continuous video when WebRTC or local MediaStream is present
 * - Low-resolution preview fallback (frames arrive via onCameraFrame keyed by deviceId)
 * - Horizontal mirroring support for front-facing phones or mirrored monitors
 * - Quick camcorder / hardware video camera ingestion button when empty
 * - Tally border when isProgram
 * - Universal 12px border radius
 */
export default function SwitcherCameraTile({
  slotIndex,
  slotInfo,
  stream,
  isProgram,
  isPreview = false,
  assignedDisplayNumber = null,
  isMirrored = false,
  canSwitch,
  onSelect,
  onSetDisplay,
  onToggleMirror,
  onAssignSlot,
  onRemoveSlot,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const latestImgRef = useRef(null);
  const isDirtyRef = useRef(false);
  const animRef = useRef(null);
  const statsRef = useRef({ frameCount: 0, lastFpsTime: performance.now(), fps: 0, lastFrame: 0 });
  const [hudStats, setHudStats] = useState({ fps: 0, isAlive: false });
  const [hasFrame, setHasFrame] = useState(false);

  const socketId = slotInfo?.socketId || null;

  // Bind WebRTC or local hardware camcorder continuous stream to <video>
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
    if (stream) return; // Skip canvas loop if continuous stream is active

    const renderLoop = () => {
      if (isDirtyRef.current && canvasRef.current) {
        const img = latestImgRef.current;
        if (img && img.naturalWidth > 0) {
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
      if (!isAlive && !stream) {
        setHasFrame(false);
      }
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
        const nextImg = new Image();
        nextImg.onload = () => {
          latestImgRef.current = nextImg;
          isDirtyRef.current = true;
          setHasFrame(true);
        };
        nextImg.src = src;
      });
    }
    return () => { if (cleanup) cleanup(); if (!stream) setHasFrame(false); };
  }, [socketId, stream]);

  const isEmpty = !slotInfo;
  const isClickable = !isEmpty && canSwitch && !isProgram;
  const isCamcorder = slotInfo?.type === "camcorder" || slotInfo?.isLocal;

  return (
    <div
      onClick={() => { if (isClickable && socketId) onSelect(socketId); }}
      title={isEmpty ? `Camera Slot ${slotIndex} — Click to assign` : slotInfo.name}
      className={[
        "relative flex flex-col overflow-hidden rounded-[12px] border transition-all duration-150 select-none group",
        isEmpty ? "border-white/10 bg-white/[0.03] hover:border-white/20" :
          isProgram ? "border-red-500/80 ring-2 ring-red-500/60 bg-black cursor-default shadow-[0_0_20px_rgba(239,68,68,0.3)]" :
          isPreview ? "border-emerald-500/80 ring-2 ring-emerald-500/60 bg-black cursor-pointer shadow-[0_0_20px_rgba(16,185,129,0.3)]" :
          isClickable ? "border-white/15 bg-black/60 cursor-pointer hover:border-white/30 hover:ring-1 hover:ring-white/20 active:scale-[0.98]" :
          "border-white/10 bg-black/60 cursor-default"
      ].join(" ")}
      style={{ aspectRatio: "16/9" }}
    >
      {isEmpty && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (typeof onAssignSlot === "function") onAssignSlot(slotIndex);
          }}
          className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-white/30 hover:text-white/80 hover:bg-white/[0.06] transition-all cursor-pointer p-2 text-center"
        >
          <div className="w-7 h-7 rounded-[12px] bg-white/5 border border-white/10 flex items-center justify-center text-white/40 group-hover:text-purple-400 group-hover:border-purple-500/40 transition-colors">
            <PiPlus size={15} />
          </div>
          <div>
            <div className="text-[9px] font-black uppercase tracking-wider">Slot {slotIndex}</div>
            <div className="text-[8px] text-white/40 group-hover:text-white/60 transition-colors">
              + Assign Camcorder / Mobile
            </div>
          </div>
        </div>
      )}

      {!isEmpty && (
        <>
          {/* Continuous WebRTC or Local Hardware Video Stream */}
          {stream ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ transform: isMirrored ? "scaleX(-1) translateZ(0)" : "translateZ(0)" }}
              className="w-full h-full object-cover"
            />
          ) : (
            <canvas
              ref={canvasRef}
              style={{ transform: isMirrored ? "scaleX(-1) translateZ(0)" : "translateZ(0)" }}
              className={`w-full h-full object-cover transition-opacity duration-300 ${hasFrame ? "opacity-100" : "opacity-0"}`}
            />
          )}

          {!hasFrame && !stream && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0c0d12] text-white/40">
              <PiVideoCamera size={20} className="animate-pulse text-white/30" />
              <span className="text-[9px] font-semibold">Camera not streaming</span>
            </div>
          )}

          {/* Top Left: Program / Preview / Display Badges */}
          <div className="absolute top-1.5 left-1.5 flex items-center gap-1 z-10">
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
            {isProgram && (
              <div className="bg-red-600/95 text-white text-[8px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-lg border border-red-400/40">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                ON AIR
              </div>
            )}
            {!isProgram && isPreview && (
              <div className="bg-emerald-600/95 text-white text-[8px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-lg border border-emerald-400/40">
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                STANDBY
              </div>
            )}
          </div>

          {/* Bottom Bar: Camera Name, Device Type, and FPS */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 py-1.5 flex items-center justify-between z-10">
            <div className="flex items-center gap-1 truncate mr-1">
              {isCamcorder ? (
                <PiTelevision size={11} className="text-purple-400 flex-shrink-0" title="Hardware Camcorder / Video Input" />
              ) : (
                <PiDeviceMobile size={11} className="text-emerald-400 flex-shrink-0" title="Mobile Companion" />
              )}
              <span className="text-[9px] font-bold text-white/90 truncate">{slotInfo.name}</span>
            </div>
            {hudStats.isAlive && (
              <span className="text-[8px] font-mono text-white/50 flex items-center gap-0.5 flex-shrink-0">
                <PiWifiHigh size={9} className="text-emerald-400" />
                {stream ? "HD 30fps" : `${hudStats.fps} fps`}
              </span>
            )}
          </div>

          {/* Top Right: Mirror Toggle, Quick Assign Buttons, CAM Badge, and Release */}
          <div className="absolute top-1.5 right-1.5 flex items-center gap-1 z-10">
            {/* Mirror Toggle */}
            {typeof onToggleMirror === "function" && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleMirror(slotIndex, socketId);
                }}
                title={isMirrored ? "Mirror active (click to unmirror)" : "Click to mirror camera horizontally"}
                className={`px-1.5 py-0.5 rounded-[12px] text-[8px] font-black border transition-all flex items-center gap-0.5 ${
                  isMirrored
                    ? "bg-purple-600 border-purple-400 text-white shadow-sm"
                    : "bg-black/70 border-white/15 text-white/50 hover:text-white hover:bg-white/20"
                }`}
              >
                <PiArrowsLeftRight size={9} />
                <span>{isMirrored ? "MIR" : "MIR"}</span>
              </button>
            )}

            {canSwitch && typeof onSetDisplay === "function" && (
              <div className="flex items-center gap-0.5 bg-black/80 rounded-[12px] p-0.5 border border-white/20">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSetDisplay(socketId, 1); }}
                  title="Set as Display 1"
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
                  onClick={(e) => { e.stopPropagation(); onSetDisplay(socketId, 2); }}
                  title="Set as Display 2"
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

            <div className="bg-black/70 text-white/60 text-[8px] font-black px-1.5 py-0.5 rounded-[12px] border border-white/10">
              CAM {slotIndex}
            </div>

            {/* Unassign / Remove Button for local camcorders */}
            {slotInfo?.isLocal && typeof onRemoveSlot === "function" && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveSlot(slotIndex, socketId);
                }}
                title="Release camcorder slot"
                className="p-1 rounded-[12px] bg-black/70 border border-white/15 text-white/40 hover:text-red-400 hover:border-red-400/40 hover:bg-red-500/20 transition-all"
              >
                <PiX size={10} />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
