import React, { useEffect, useRef, useState } from "react";
import { PiVideoCamera } from "react-icons/pi";
import { transitionEngine } from "./TransitionEngine";

const _programImageCache = {};

/**
 * SwitcherProgramCanvas
 *
 * Renders the high-resolution program output stream and animated transitions.
 * - Hardware-accelerated continuous video when WebRTC `stream` is present (30-60 FPS)
 * - Canvas-driven transition compositing (Cut, Fade, Wipe) using TransitionEngine
 * - Fallback to high-res program frame channel and preview frames
 * - Universal 12px border radius
 */
export default function SwitcherProgramCanvas({
  programSourceId,
  programSourceName,
  previewSourceId,
  previewSourceName,
  stream,
  cameraStreams,
  activeTransition: externalTransition,
  mixProgress = null,
  transitionSetting,
  isSharingActive = false,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const latestImgRef = useRef(null);
  const isDirtyRef = useRef(false);
  const animRef = useRef(null);
  const statsRef = useRef({ fps: 0, frameCount: 0, lastFpsTime: performance.now(), lastFrame: 0 });
  const [hudStats, setHudStats] = useState({ fps: 0, isAlive: false });
  const [hasFrame, setHasFrame] = useState(false);
  const lastSentFrameTimeRef = useRef(0);

  // Active transition state (supports both internal listener and prop)
  const [activeTransition, setActiveTransition] = useState(null);
  const activeTransRef = useRef(null);

  // Offscreen videos for WebRTC stream compositing during transitions
  const outgoingVideoRef = useRef(null);
  const incomingVideoRef = useRef(null);

  useEffect(() => {
    if (externalTransition !== undefined) {
      activeTransRef.current = externalTransition;
      setActiveTransition(externalTransition);
    }
  }, [externalTransition]);

  // Transition listeners
  useEffect(() => {
    let unsubStart = null;
    let unsubComplete = null;

    if (window.electron?.Switcher?.onTransitionStart) {
      unsubStart = window.electron.Switcher.onTransitionStart((trans) => {
        activeTransRef.current = trans;
        setActiveTransition(trans);
      });
    }

    if (window.electron?.Switcher?.onTransitionComplete) {
      unsubComplete = window.electron.Switcher.onTransitionComplete(() => {
        activeTransRef.current = null;
        setActiveTransition(null);
        isDirtyRef.current = true;
      });
    }

    return () => {
      if (unsubStart) unsubStart();
      if (unsubComplete) unsubComplete();
    };
  }, []);

  // Bind WebRTC continuous stream to main <video>
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

  // Bind outgoing & incoming streams to hidden transition videos
  useEffect(() => {
    const fromId = activeTransition?.fromId || programSourceId;
    const toId = activeTransition?.toId || previewSourceId;
    if (cameraStreams) {
      const fromStream = cameraStreams.get(fromId);
      const toStream = cameraStreams.get(toId);

      if (outgoingVideoRef.current) {
        outgoingVideoRef.current.srcObject = fromStream || null;
        if (fromStream) outgoingVideoRef.current.play().catch(() => {});
      }
      if (incomingVideoRef.current) {
        incomingVideoRef.current.srcObject = toStream || null;
        if (toStream) incomingVideoRef.current.play().catch(() => {});
      }
    }
  }, [activeTransition, programSourceId, previewSourceId, cameraStreams]);

  // Helper to emit live composited frame to shared outputs
  const maybeEmitLiveOutputFrame = (canvas) => {
    if (!canvas) return;
    const now = performance.now();
    if (now - lastSentFrameTimeRef.current < 33) return; // Cap at ~30 FPS
    lastSentFrameTimeRef.current = now;
    try {
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      if (window.electron?.Switcher?.sendLiveOutputFrame) {
        window.electron.Switcher.sendLiveOutputFrame(dataUrl);
      }
    } catch (_) {}
  };

  // Frame buffer & transition render loop
  useEffect(() => {
    const renderLoop = () => {
      const trans = activeTransRef.current;
      const isManualMixing = mixProgress !== null && mixProgress !== undefined && mixProgress >= 0;

      if (isManualMixing && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (ctx) {
          let fromSource = outgoingVideoRef.current?.readyState >= 2
            ? outgoingVideoRef.current
            : _programImageCache[programSourceId || "default"];
          let toSource = incomingVideoRef.current?.readyState >= 2
            ? incomingVideoRef.current
            : _programImageCache[previewSourceId || "default"];

          const w = Math.max(1280, canvas.width || 1280);
          const h = Math.max(720, canvas.height || 720);
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
          }

          transitionEngine.render(ctx, fromSource, toSource, mixProgress, w, h, {
            type: transitionSetting?.type || "fade",
            direction: transitionSetting?.direction || "left-to-right",
          });
          maybeEmitLiveOutputFrame(canvas);
        }
      } else if (trans && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (ctx) {
          const now = Date.now();
          const progress = Math.min(1, Math.max(0, (now - trans.startTime) / trans.duration));

          // Resolve outgoing source (Video element -> Image cache)
          let fromSource = null;
          if (outgoingVideoRef.current && outgoingVideoRef.current.readyState >= 2) {
            fromSource = outgoingVideoRef.current;
          } else {
            fromSource = _programImageCache[trans.fromId || "default"];
          }

          // Resolve incoming source (Video element -> Image cache)
          let toSource = null;
          if (incomingVideoRef.current && incomingVideoRef.current.readyState >= 2) {
            toSource = incomingVideoRef.current;
          } else {
            toSource = _programImageCache[trans.toId || programSourceId || "default"];
          }

          const w = Math.max(1280, canvas.width || 1280);
          const h = Math.max(720, canvas.height || 720);
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
          }

          transitionEngine.render(ctx, fromSource, toSource, progress, w, h, {
            type: trans.type,
            direction: trans.direction,
          });
          maybeEmitLiveOutputFrame(canvas);

          if (progress >= 1) {
            activeTransRef.current = null;
            setActiveTransition(null);
            isDirtyRef.current = true;
          }
        }
      } else if (stream && videoRef.current && videoRef.current.readyState >= 2 && canvasRef.current) {
        // Continuous WebRTC stream playing: copy frame to canvas & broadcast if sharing
        if (isSharingActive) {
          const canvas = canvasRef.current;
          const ctx = canvas.getContext("2d", { alpha: false });
          if (ctx) {
            const targetW = Math.max(1280, videoRef.current.videoWidth || 1280);
            const targetH = Math.max(720, videoRef.current.videoHeight || 720);
            if (canvas.width !== targetW || canvas.height !== targetH) {
              canvas.width = targetW;
              canvas.height = targetH;
            }
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            maybeEmitLiveOutputFrame(canvas);
          }
        }
      } else if (!stream && isDirtyRef.current && canvasRef.current) {
        const img = latestImgRef.current;
        if (img && img.complete && img.naturalWidth > 0) {
          const canvas = canvasRef.current;
          const ctx = canvas.getContext("2d", { alpha: false });
          if (ctx) {
            const targetW = Math.max(1280, img.naturalWidth || 1280);
            const targetH = Math.max(720, img.naturalHeight || 720);
            if (canvas.width !== targetW || canvas.height !== targetH) {
              canvas.width = targetW;
              canvas.height = targetH;
            }
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            maybeEmitLiveOutputFrame(canvas);
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
      if (!isAlive && !stream && !isTransitioning) {
        setHasFrame(false);
      }
    }, 500);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      clearInterval(statsInterval);
    };
  }, [stream, programSourceId, previewSourceId, mixProgress, transitionSetting, isSharingActive]);

  // Frame subscribers
  useEffect(() => {
    const handleFrame = (fromId, data, isProg) => {
      if (!data) return;
      const src = data.startsWith("data:") ? data : `data:image/jpeg;base64,${data}`;
      const nextImg = new Image();
      nextImg.onload = () => {
        _programImageCache[fromId || "default"] = nextImg;
        if (isProg || fromId === programSourceId) {
          latestImgRef.current = nextImg;
          isDirtyRef.current = true;
          setHasFrame(true);
        }
      };
      nextImg.src = src;

      if (isProg || fromId === programSourceId) {
        statsRef.current.lastFrame = Date.now();
        statsRef.current.frameCount++;
      }
    };

    let cleanupProgram = null;
    if (window.electron?.Switcher?.onProgramFrame) {
      cleanupProgram = window.electron.Switcher.onProgramFrame((payload) => {
        handleFrame(payload?.fromId || programSourceId, payload?.data, true);
      });
    }

    let cleanupFallback = null;
    if (window.electron?.Switcher?.onCameraFrame) {
      cleanupFallback = window.electron.Switcher.onCameraFrame((payload) => {
        handleFrame(payload?.fromId, payload?.data, payload?.fromId === programSourceId);
      });
    }

    let cleanupMirror = null;
    if (window.electron?.Switcher?.onDisplayMirrorFrame) {
      cleanupMirror = window.electron.Switcher.onDisplayMirrorFrame((payload) => {
        if (!payload?.data) return;
        const key = payload.destination;
        const src = payload.data.startsWith("data:") ? payload.data : `data:image/jpeg;base64,${payload.data}`;
        const isCurrentProgram = ((!programSourceId || programSourceId === "general") && key === "general") ||
          (programSourceId === "speaker" && key === "speaker");

        const nextImg = new Image();
        nextImg.onload = () => {
          _programImageCache[key || "general"] = nextImg;
          if (isCurrentProgram) {
            latestImgRef.current = nextImg;
            isDirtyRef.current = true;
            setHasFrame(true);
          }
        };
        nextImg.src = src;

        if (isCurrentProgram) {
          statsRef.current.lastFrame = Date.now();
          statsRef.current.frameCount++;
        }
      });
    }

    return () => {
      if (cleanupProgram) cleanupProgram();
      if (cleanupFallback) cleanupFallback();
      if (cleanupMirror) cleanupMirror();
      if (!stream) setHasFrame(false);
    };
  }, [programSourceId, stream]);

  const isManualMixing = mixProgress !== null && mixProgress !== undefined && mixProgress > 0 && mixProgress < 1;
  const isTransitioning = !!activeTransition || isManualMixing;
  const isGeneralProgram = !programSourceId || programSourceId === "general";

  return (
    <div className="relative w-full overflow-hidden rounded-[12px] bg-black border border-white/10 shadow-2xl" style={{ aspectRatio: "16/9" }}>
      {/* Hidden offscreen videos for WebRTC stream transition compositing */}
      <video ref={outgoingVideoRef} autoPlay playsInline muted style={{ display: "none" }} />
      <video ref={incomingVideoRef} autoPlay playsInline muted style={{ display: "none" }} />

      {/* Tally border */}
      <div className={`absolute inset-0 rounded-[12px] ring-2 transition-colors duration-150 pointer-events-none z-10 ${
        isTransitioning ? "ring-amber-500/80 animate-pulse" : "ring-red-500/60"
      }`} />

      {/* Video element when not transitioning and stream is present */}
      {stream && !isTransitioning ? (
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
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            isTransitioning || hasFrame ? "opacity-100" : "opacity-0"
          }`}
        />
      )}

      {/* No-signal state */}
      {!isTransitioning && !hasFrame && !stream && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#090a0f]">
          <div className="w-14 h-14 rounded-[12px] bg-white/5 border border-white/10 flex items-center justify-center">
            <PiVideoCamera size={28} className="text-white/25" />
          </div>
          <div className="text-center">
            <p className="text-white/40 text-sm font-semibold">
              Connecting output stream…
            </p>
            <p className="text-white/20 text-xs mt-1">
              Select a camera source to preview and switch
            </p>
          </div>
        </div>
      )}

      {/* Overlaid HUD */}
      {(isTransitioning || hasFrame || stream) && (
        <>
          <div className="absolute top-3 left-3 flex items-center gap-2 z-10">
            <div className={`text-white text-xs font-black px-3 py-1 rounded-full flex items-center gap-1.5 shadow-lg ${
              isManualMixing ? "bg-amber-600/95" : isTransitioning ? "bg-amber-600/90" : "bg-red-600/90"
            }`}>
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              {isManualMixing ? `T-BAR: ${Math.round(mixProgress * 100)}%` : isTransitioning ? "TRANSITION" : "LIVE OUTPUT"}
            </div>
            {isManualMixing && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 bg-black/60 px-2 py-0.5 rounded-[12px] border border-amber-500/30">
                {transitionSetting?.type?.toUpperCase() || "FADE"} ({Math.round(mixProgress * 100)}%)
              </span>
            )}
            {!isManualMixing && isTransitioning && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 bg-black/60 px-2 py-0.5 rounded-[12px] border border-amber-500/30">
                {activeTransition?.type} ({activeTransition?.duration}ms)
              </span>
            )}
          </div>
          <div className="absolute top-3 right-3 bg-black/70 text-white/60 text-[10px] font-mono px-2 py-1 rounded-[12px] border border-white/10 z-10">
            {isTransitioning ? "Compositing" : stream ? "30 fps HD" : `${hudStats.fps || 30} fps`}
          </div>
          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between z-10">
            <span className="bg-black/70 text-white text-xs font-bold px-3 py-1 rounded-[12px] border border-white/10 truncate max-w-[70%]">
              {isManualMixing
                ? `${programSourceName || "Program"} ➔ ${previewSourceName || "Preview"}`
                : (programSourceName || "Live Output")}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

