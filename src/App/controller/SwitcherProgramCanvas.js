import React, { useEffect, useRef, useState } from "react";
import { PiVideoCamera, PiX } from "react-icons/pi";
import { transitionEngine } from "./TransitionEngine";
import { renderCustomLowerThirdUI, DEFAULT_LOWER_THIRD_STYLE } from "./LowerThirdGraphic";

const _programImageCache = {};

/**
 * SwitcherProgramCanvas
 *
 * Renders the high-resolution program output stream and animated transitions.
 * - Hardware-accelerated continuous video when WebRTC `stream` is present (30-60 FPS)
 * - Canvas-driven transition compositing (Cut, Fade, Wipe) using TransitionEngine
 * - Fallback to high-res program frame channel and preview frames
 * - Broadcast overlays & scaling engine (Logo, Speaker Lower Thirds, Bible Auto-Trigger, Ticker)
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
  isMirrored = false,
  broadcastConfig,
  isBroadcastActive = false, // true when streaming or recording — triggers continuous 30fps frame push
  outputWidth = 1280,
  outputHeight = 720,
}) {
  const broadcastConfigRef = useRef(broadcastConfig);
  useEffect(() => {
    broadcastConfigRef.current = broadcastConfig;
  }, [broadcastConfig]);

  const bConfig = broadcastConfig || {
    scale: 1.0,
    fitMode: "cover",
    logo: { enabled: false },
    lowerThird: { enabled: false },
    bibleLowerThird: { enabled: false, isShowing: false },
    ticker: { enabled: false },
  };
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const latestImgRef = useRef(null);
  const lastRenderedBitmapRef = useRef(null);
  const isDirtyRef = useRef(false);
  const animRef = useRef(null);
  const statsRef = useRef({ fps: 0, frameCount: 0, lastFpsTime: performance.now(), lastFrame: 0 });
  const [hudStats, setHudStats] = useState({ fps: 0, isAlive: false });
  const [hasFrame, setHasFrame] = useState(false);
  const latestEffectRef = useRef(null);
  const [currentEffect, setCurrentEffect] = useState(null);
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

  // Draw graphic overlays directly onto canvas context for shared sanctuary and confidence outputs
  const drawCanvasOverlays = (ctx, w, h, cfg) => {
    if (!ctx || !cfg) return;

    // 1. Watermark Logo
    if (cfg.logo?.enabled) {
      ctx.save();
      ctx.globalAlpha = cfg.logo.opacity || 0.9;
      const size = Math.round((cfg.logo.size || 72) * (w / 1280));
      const pad = 24;
      let lx = w - size - pad;
      let ly = pad;
      if (cfg.logo.position === "top-left") { lx = pad; ly = pad; }
      else if (cfg.logo.position === "bottom-right") { lx = w - size - pad; ly = h - size - pad - 30; }
      else if (cfg.logo.position === "bottom-left") { lx = pad; ly = h - size - pad - 30; }

      ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(lx, ly, size, size * 0.7, 12);
      else ctx.rect(lx, ly, size, size * 0.7);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "#FDE047";
      ctx.font = `bold ${Math.round(size * 0.38)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = cfg.logo.preset === "cross" ? "✝" : cfg.logo.preset === "dove" ? "🕊" : "OCS";
      ctx.fillText(label, lx + size / 2, ly + size * 0.35);
      ctx.restore();
    }

    // 2. Bible Scripture Lower Third (High Priority)
    if (cfg.bibleLowerThird?.enabled && cfg.bibleLowerThird?.isShowing) {
      ctx.save();
      const bx = 32;
      const bw = w - 64;
      const bh = Math.round(92 * (h / 720));
      const by = h - bh - (cfg.ticker?.enabled ? 44 : 24);

      ctx.fillStyle = "rgba(10, 10, 16, 0.94)";
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(bx, by, bw, bh, 12);
      else ctx.rect(bx, by, bw, bh);
      ctx.fill();
      ctx.strokeStyle = "rgba(234, 179, 8, 0.6)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#FDE047";
      ctx.font = `bold ${Math.round(18 * (h / 720))}px sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(`📖 ${cfg.bibleLowerThird.currentRef || 'Scripture'} (${cfg.bibleLowerThird.version || 'KJV'})`, bx + 16, by + 12);

      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.font = `${Math.round(15 * (h / 720))}px sans-serif`;
      const snippet = (cfg.bibleLowerThird.currentText || "").slice(0, 140) + ((cfg.bibleLowerThird.currentText || "").length > 140 ? "..." : "");
      ctx.fillText(`"${snippet}"`, bx + 16, by + 46);
      ctx.restore();
    } else if (cfg.lowerThird?.enabled) {
      // 3. Speaker Lower Third (Custom Shapes, Badges, and Sizing)
      ctx.save();
      const lt = cfg.lowerThird;
      const ltStyle = lt.style || DEFAULT_LOWER_THIRD_STYLE;
      const ltWidthPercent = (typeof lt.width === "number" && lt.width > 0) ? lt.width : 36;
      const sw = Math.round(w * (ltWidthPercent / 100));
      const sh = Math.round(68 * (h / 720));
      const anchorX = typeof lt.x === "number" ? lt.x : 22;
      const anchorY = typeof lt.y === "number" ? lt.y : 88;
      const sx = Math.max(16, Math.min(w - sw - 16, Math.round((w * (anchorX / 100)) - (sw / 2))));
      const sy = Math.max(16, Math.min(h - sh - 16, Math.round((h * (anchorY / 100)) - (sh / 2))));

      ctx.globalAlpha = ltStyle.opacity ?? 0.95;

      // Background Gradient
      const grad = ctx.createLinearGradient(sx, sy, sx + sw, sy + sh);
      grad.addColorStop(0, ltStyle.primaryColor || "#581c87");
      grad.addColorStop(1, ltStyle.secondaryColor || "#3b0764");
      ctx.fillStyle = grad;

      ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(sx, sy, sw, sh, 12);
      else ctx.rect(sx, sy, sw, sh);
      ctx.fill();

      ctx.strokeStyle = ltStyle.accentColor || "#a855f7";
      ctx.lineWidth = 2;
      ctx.stroke();

      let textStartX = sx + 16;

      // Draw Badge (Circle, Triangle, Rectangle)
      if (ltStyle.badgeShape && ltStyle.badgeShape !== "none") {
        const bSize = Math.round(34 * (h / 720));
        const bx = sx + 12;
        const by = sy + (sh - bSize) / 2;

        ctx.save();
        if (ltStyle.badgeShape === "circle") {
          ctx.beginPath();
          ctx.arc(bx + bSize / 2, by + bSize / 2, bSize / 2, 0, Math.PI * 2);
          ctx.fillStyle = (ltStyle.accentColor || "#a855f7") + "40";
          ctx.fill();
          ctx.strokeStyle = ltStyle.accentColor || "#a855f7";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else if (ltStyle.badgeShape === "triangle") {
          ctx.beginPath();
          ctx.moveTo(bx + bSize / 2, by);
          ctx.lineTo(bx + bSize, by + bSize);
          ctx.lineTo(bx, by + bSize);
          ctx.closePath();
          ctx.fillStyle = ltStyle.accentColor || "#a855f7";
          ctx.fill();
        } else {
          // Rectangle badge (Universal 12px)
          ctx.beginPath();
          if (typeof ctx.roundRect === "function") ctx.roundRect(bx, by, bSize, bSize, 12);
          else ctx.rect(bx, by, bSize, bSize);
          ctx.fillStyle = (ltStyle.accentColor || "#a855f7") + "40";
          ctx.fill();
          ctx.strokeStyle = ltStyle.accentColor || "#a855f7";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Badge icon symbol
        ctx.fillStyle = "#FFFFFF";
        ctx.font = `bold ${Math.round(14 * (h / 720))}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const iconChar = ltStyle.badgeIcon === "cross" ? "✝" :
                         ltStyle.badgeIcon === "dove" ? "🕊" :
                         ltStyle.badgeIcon === "mic" ? "🎙" :
                         ltStyle.badgeIcon === "star" ? "⭐" :
                         ltStyle.badgeIcon === "bible" ? "📖" : "👤";
        ctx.fillText(iconChar, bx + bSize / 2, by + bSize / 2);
        ctx.restore();

        textStartX = bx + bSize + 14;
      }

      // Slanted Accent Divider
      if (ltStyle.showAccentSlash && ltStyle.shape !== "minimal-bar") {
        ctx.save();
        ctx.fillStyle = ltStyle.accentColor || "#a855f7";
        ctx.beginPath();
        const slashW = 5;
        const slashH = Math.round(sh * 0.65);
        const slashX = textStartX - 6;
        const slashY = sy + (sh - slashH) / 2;
        ctx.moveTo(slashX + 4, slashY);
        ctx.lineTo(slashX + 4 + slashW, slashY);
        ctx.lineTo(slashX, slashY + slashH);
        ctx.lineTo(slashX - slashW, slashY + slashH);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        textStartX += 8;
      }

      // Title
      const titleText = (lt.title || "Speaker");
      const displayTitle = ltStyle.uppercaseTitle ? titleText.toUpperCase() : titleText;
      const fontScale = ltStyle.fontSize === "small" ? 14 : ltStyle.fontSize === "large" ? 20 : 17;
      ctx.fillStyle = ltStyle.textColor || "#FFFFFF";
      ctx.font = `bold ${Math.round(fontScale * (h / 720))}px sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(displayTitle, textStartX, sy + 12);

      // Subtitle
      if (lt.subtitle) {
        ctx.fillStyle = ltStyle.subtitleColor || "rgba(255, 255, 255, 0.75)";
        const subFontScale = ltStyle.fontSize === "small" ? 11 : 13;
        ctx.font = `${Math.round(subFontScale * (h / 720))}px sans-serif`;
        ctx.fillText(lt.subtitle, textStartX, sy + 38);
      }
      ctx.restore();
    }

    // 4. Live Announcement Ticker Banner
    if (cfg.ticker?.enabled && cfg.ticker.text) {
      ctx.save();
      const th = Math.round(32 * (h / 720));
      const ty = h - th;
      ctx.fillStyle = "rgba(15, 23, 42, 0.96)";
      ctx.fillRect(0, ty, w, th);
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      ctx.fillRect(0, ty, w, 1);

      ctx.fillStyle = "#DC2626";
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(8, ty + 4, 52, th - 8, 12);
      else ctx.rect(8, ty + 4, 52, th - 8);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `bold ${Math.round(11 * (h / 720))}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("LIVE", 34, ty + th / 2);

      ctx.fillStyle = "#FFFFFF";
      ctx.font = `600 ${Math.round(13 * (h / 720))}px sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(cfg.ticker.text, 70, ty + th / 2);
      ctx.restore();
    }
  };

  // Helper to emit live composited frame to shared outputs (displays, recorder, broadcast)
  const maybeEmitLiveOutputFrame = (canvas) => {
    if (!canvas) return;
    const now = performance.now();
    if (now - lastSentFrameTimeRef.current < 33) return; // Cap at ~30 FPS
    lastSentFrameTimeRef.current = now;
    try {
      const ctx = canvas.getContext("2d");
      drawCanvasOverlays(ctx, canvas.width, canvas.height, broadcastConfigRef.current);

      // 1. Shared JPEG dataUrl for local/remote display mirrors
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      if (window.electron?.Switcher?.sendLiveOutputFrame) {
        window.electron.Switcher.sendLiveOutputFrame({
          data: dataUrl,
          effect: latestEffectRef.current,
        });
      }

      // 2. High-performance raw RGBA extraction for Program Recorder & Broadcast Supervisor
      // If either native recorder or native broadcast supervisor is active, deliver raw pixel buffer
      const hasRecorder = typeof window.electron?.Recorder?.pushVideoFrame === "function";
      const hasBroadcast = typeof window.electron?.Broadcast?.pushVideoFrame === "function";

      if (hasRecorder || hasBroadcast) {
        const cw = outputWidth || canvas.width || 1280;
        const ch = outputHeight || canvas.height || 720;
        const imgData = ctx.getImageData(0, 0, cw, ch);
        if (imgData && imgData.data) {
          // IMPORTANT: ArrayBuffer.transfer() is destructive — the first receiver
          // neuterates the buffer, making it zero-length for subsequent consumers.
          // We must create independent copies so each IPC send gets its own buffer.
          if (hasRecorder && hasBroadcast) {
            // Two consumers: copy once, slice into two independent ArrayBuffers
            const shared = imgData.data.buffer;
            const recBuf = shared.slice(0);   // independent copy for recorder
            const bcastBuf = shared.slice(0); // independent copy for broadcast
            window.electron.Recorder.pushVideoFrame(recBuf);
            window.electron.Broadcast.pushVideoFrame(bcastBuf);
          } else if (hasRecorder) {
            window.electron.Recorder.pushVideoFrame(imgData.data.buffer);
          } else {
            window.electron.Broadcast.pushVideoFrame(imgData.data.buffer);
          }
        }
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

          const targetW = outputWidth || 1280;
          const targetH = outputHeight || 720;
          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
          }

          transitionEngine.render(ctx, fromSource, toSource, mixProgress, targetW, targetH, {
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

          const targetW = outputWidth || 1280;
          const targetH = outputHeight || 720;
          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
          }

          transitionEngine.render(ctx, fromSource, toSource, progress, targetW, targetH, {
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
        // Continuous WebRTC stream playing: copy frame to canvas.
        // Always render to canvas so preview and broadcast receive continuous frames.
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (ctx) {
          const targetW = outputWidth || 1280;
          const targetH = outputHeight || 720;
          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
          }
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          if (isMirrored) {
            ctx.save();
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            ctx.restore();
          } else {
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          }
          maybeEmitLiveOutputFrame(canvas);
        }
      } else if (!stream && canvasRef.current) {
        // Static frame path (slides, Bible, presentations).
        // When broadcast is active, emit frames continuously at ~30fps to maintain RTMP cadence.
        const bitmap = lastRenderedBitmapRef.current;
        const img = latestImgRef.current;
        const source = bitmap || img;
        if (source) {
          const w = source.width || source.naturalWidth;
          const h = source.height || source.naturalHeight;
          if (w > 0 && h > 0 && (isDirtyRef.current || isBroadcastActive)) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d", { alpha: false });
            if (ctx) {
              const targetW = outputWidth || 1280;
              const targetH = outputHeight || 720;
              if (canvas.width !== targetW || canvas.height !== targetH) {
                canvas.width = targetW;
                canvas.height = targetH;
              }
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = "high";
              const eff = latestEffectRef.current;
              if (eff && eff.filter && eff.filter !== "none") {
                ctx.filter = eff.filter;
              } else {
                ctx.filter = "none";
              }
              if (isMirrored) {
                ctx.save();
                ctx.translate(canvas.width, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
                ctx.restore();
              } else {
                ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
              }
              if (eff && eff.overlayColor && eff.overlayColor !== "transparent") {
                ctx.save();
                ctx.filter = "none";
                ctx.fillStyle = eff.overlayColor;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.restore();
              }
              maybeEmitLiveOutputFrame(canvas);
              isDirtyRef.current = false;
            }
          }
        } else if (isBroadcastActive) {
          // STANDBY BROADCAST SLATE:
          // Emits clean standby slate frame matching outputWidth and outputHeight.
          const canvas = canvasRef.current;
          const ctx = canvas.getContext("2d", { alpha: false });
          if (ctx) {
            const targetW = outputWidth || 1280;
            const targetH = outputHeight || 720;
            if (canvas.width !== targetW || canvas.height !== targetH) {
              canvas.width = targetW;
              canvas.height = targetH;
            }
            // Crisp dark slate
            ctx.fillStyle = "#09090b";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Subtle purple gradient backdrop
            const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
            grad.addColorStop(0, "rgba(147, 51, 234, 0.15)");
            grad.addColorStop(1, "rgba(79, 70, 229, 0.08)");
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Standby title & instruction
            ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
            ctx.font = `bold ${Math.round(28 * (targetH / 720))}px system-ui, -apple-system, sans-serif`;
            ctx.textAlign = "center";
            ctx.fillText("OCS BROADCAST READY", canvas.width / 2, canvas.height / 2 - Math.round(12 * (targetH / 720)));

            ctx.font = `${Math.round(14 * (targetH / 720))}px system-ui, -apple-system, sans-serif`;
            ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
            ctx.fillText("Standby — Select Camera or Slide in Live Switcher", canvas.width / 2, canvas.height / 2 + Math.round(24 * (targetH / 720)));
            ctx.textAlign = "start";

            maybeEmitLiveOutputFrame(canvas);
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
  }, [stream, programSourceId, previewSourceId, mixProgress, transitionSetting, isSharingActive, isBroadcastActive]);

  // Frame subscribers
  useEffect(() => {
    let isDecoding = false;
    let pendingFrame = null;
    let lastDecodedTimestamp = 0;

    const processNext = async () => {
      if (isDecoding || !pendingFrame) return;
      isDecoding = true;
      const { fromId, src, isProg, timestamp } = pendingFrame;
      pendingFrame = null;

      try {
        if (typeof window.createImageBitmap === "function" && typeof window.fetch === "function") {
          const res = await fetch(src);
          const blob = await res.blob();
          const bitmap = await createImageBitmap(blob);

          _programImageCache[fromId || "default"] = bitmap;
          if (isProg || fromId === programSourceId) {
            if (timestamp && timestamp < lastDecodedTimestamp) {
              bitmap.close();
            } else {
              const old = lastRenderedBitmapRef.current;
              lastRenderedBitmapRef.current = bitmap;
              lastDecodedTimestamp = timestamp || Date.now();
              isDirtyRef.current = true;
              setHasFrame(true);
              if (old && old !== bitmap && typeof old.close === "function") {
                old.close();
              }
            }
          }
        } else {
          await new Promise((resolve) => {
            const nextImg = new Image();
            nextImg.onload = () => {
              _programImageCache[fromId || "default"] = nextImg;
              if (isProg || fromId === programSourceId) {
                latestImgRef.current = nextImg;
                isDirtyRef.current = true;
                setHasFrame(true);
              }
              resolve();
            };
            nextImg.onerror = resolve;
            nextImg.src = src;
          });
        }
      } catch (_) {
        try {
          await new Promise((resolve) => {
            const nextImg = new Image();
            nextImg.onload = () => {
              _programImageCache[fromId || "default"] = nextImg;
              if (isProg || fromId === programSourceId) {
                latestImgRef.current = nextImg;
                isDirtyRef.current = true;
                setHasFrame(true);
              }
              resolve();
            };
            nextImg.onerror = resolve;
            nextImg.src = src;
          });
        } catch (__) {}
      } finally {
        isDecoding = false;
        if (pendingFrame) processNext();
      }
    };

    const handleFrame = (fromId, data, isProg, timestamp, effect) => {
      if (!data) return;
      const src = data.startsWith("data:") ? data : `data:image/jpeg;base64,${data}`;
      pendingFrame = { fromId, src, isProg, timestamp: timestamp || Date.now() };
      processNext();

      if (isProg || fromId === programSourceId) {
        if (effect) {
          latestEffectRef.current = effect;
          setCurrentEffect(effect);
        }
        statsRef.current.lastFrame = Date.now();
        statsRef.current.frameCount++;
      }
    };

    let cleanupProgram = null;
    if (window.electron?.Switcher?.onProgramFrame) {
      cleanupProgram = window.electron.Switcher.onProgramFrame((payload) => {
        handleFrame(payload?.fromId || programSourceId, payload?.data || payload?.frame, true, payload?.timestamp, payload?.effect);
      });
    }

    let cleanupFallback = null;
    if (window.electron?.Switcher?.onCameraFrame) {
      cleanupFallback = window.electron.Switcher.onCameraFrame((payload) => {
        handleFrame(payload?.fromId, payload?.data || payload?.frame, payload?.fromId === programSourceId, payload?.timestamp, payload?.effect);
      });
    }

    let cleanupMirror = null;
    if (window.electron?.Switcher?.onDisplayMirrorFrame) {
      cleanupMirror = window.electron.Switcher.onDisplayMirrorFrame((payload) => {
        if (!payload?.data) return;
        const key = payload.destination;
        const isCurrentProgram = ((!programSourceId || programSourceId === "general") && key === "general") ||
          (programSourceId === "speaker" && key === "speaker");

        handleFrame(key || "general", payload.data, isCurrentProgram, payload?.timestamp, payload?.effect);
      });
    }

    return () => {
      if (cleanupProgram) cleanupProgram();
      if (cleanupFallback) cleanupFallback();
      if (cleanupMirror) cleanupMirror();
      if (lastRenderedBitmapRef.current && typeof lastRenderedBitmapRef.current.close === "function") {
        lastRenderedBitmapRef.current.close();
        lastRenderedBitmapRef.current = null;
      }
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

      {/* Scaled Frame Container */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="relative overflow-hidden transition-all duration-300 pointer-events-auto"
          style={{
            width: `${(bConfig.scale || 1.0) * 100}%`,
            height: `${(bConfig.scale || 1.0) * 100}%`,
            borderRadius: bConfig.scale < 1.0 ? "12px" : "0px",
            boxShadow: bConfig.scale < 1.0 ? "0 0 25px rgba(0,0,0,0.8)" : "none",
            border: bConfig.scale < 1.0 ? "1.5px solid rgba(168, 85, 247, 0.5)" : "none",
          }}
        >
          {/* Offscreen video element for WebRTC camera stream decoding */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ display: "none" }}
          />

          {/* Master Program Output Canvas — ALWAYS mounted for continuous composite playout */}
          <canvas
            ref={canvasRef}
            style={{
              transform: isMirrored ? "scaleX(-1) translateZ(0)" : "translateZ(0)",
              filter: currentEffect?.filter && currentEffect.filter !== "none" ? currentEffect.filter : "none",
            }}
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              isTransitioning || hasFrame || stream ? "opacity-100" : "opacity-0"
            }`}
          />

          {currentEffect?.overlayColor && currentEffect.overlayColor !== "transparent" && (
            <div
              className="absolute inset-0 pointer-events-none z-[5]"
              style={{ backgroundColor: currentEffect.overlayColor }}
            />
          )}
        </div>
      </div>

      {/* No-signal state */}
      {!isTransitioning && !hasFrame && !stream && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#090a0f] z-[6]">
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

      {/* ── Broadcast Overlays (HTML UI Layer) ───────────────────────────────── */}

      {/* 0. Custom Image & Graphic Overlay Layers (Presentation-Style Layers) */}
      {Array.isArray(bConfig.layers) && bConfig.layers.map((layer) => {
        if (!layer || !layer.content) return null;
        const x = layer.x ?? 50;
        const y = layer.y ?? 50;
        const widthPct = layer.style?.width || 20;
        const opacity = layer.style?.opacity ?? 1;
        return (
          <div
            key={layer.id}
            className="absolute pointer-events-none z-20 transition-all duration-75"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              transform: "translate(-50%, -50%)",
              width: `${widthPct}%`,
              opacity,
            }}
          >
            <img
              src={layer.content}
              alt={layer.name || "Overlay"}
              className="w-full h-auto object-contain select-none"
              style={{ borderRadius: "12px" }}
            />
          </div>
        );
      })}

      {/* 1. Watermark Logo */}
      {bConfig.logo?.enabled && (
        <div
          className={`absolute pointer-events-none z-20 transition-all ${
            bConfig.logo.position === "top-right"
              ? "top-3 right-3"
              : bConfig.logo.position === "top-left"
              ? "top-3 left-3"
              : bConfig.logo.position === "bottom-right"
              ? (bConfig.ticker?.enabled ? "bottom-9 right-3" : "bottom-3 right-3")
              : (bConfig.ticker?.enabled ? "bottom-9 left-3" : "bottom-3 left-3")
          }`}
          style={{ opacity: bConfig.logo.opacity || 0.9 }}
        >
          {bConfig.logo.preset === "cross" ? (
            <div className="px-2.5 py-1 rounded-[12px] bg-black/40 border border-white/20 backdrop-blur-sm flex items-center gap-1.5 shadow-md">
              <span className="text-amber-300 text-sm font-black">✝</span>
              <span className="text-[10px] text-white/80 font-black tracking-wider">FAITH</span>
            </div>
          ) : bConfig.logo.preset === "ocs" ? (
            <div className="px-2.5 py-1 rounded-[12px] bg-black/40 border border-white/20 backdrop-blur-sm flex items-center gap-1.5 shadow-md">
              <span className="text-white text-xs font-black tracking-wider">OCS</span>
              <span className="text-[8px] text-red-500 font-bold">● LIVE</span>
            </div>
          ) : bConfig.logo.preset === "dove" ? (
            <div className="px-2.5 py-1 rounded-[12px] bg-black/40 border border-white/20 backdrop-blur-sm flex items-center gap-1.5 shadow-md">
              <span className="text-base">🕊</span>
              <span className="text-[10px] text-white/80 font-black tracking-wider">PEACE</span>
            </div>
          ) : bConfig.logo.url ? (
            <img
              src={bConfig.logo.url}
              alt="Logo"
              className="object-contain"
              style={{ width: bConfig.logo.size || 72, height: (bConfig.logo.size || 72) * 0.7 }}
            />
          ) : null}
        </div>
      )}

      {/* 2. Speaker Lower Third (if active and not suppressed by bible scripture) */}
      {bConfig.lowerThird?.enabled && !bConfig.bibleLowerThird?.isShowing && (
        <div
          className="absolute z-20 pointer-events-none transition-all"
          style={{
            left: `${bConfig.lowerThird.x ?? 22}%`,
            top: `${bConfig.lowerThird.y ?? 88}%`,
            transform: "translate(-50%, -50%)",
            width: `${bConfig.lowerThird.width ?? 36}%`,
            maxWidth: "75%",
            minWidth: "220px",
          }}
        >
          {renderCustomLowerThirdUI(bConfig.lowerThird)}
        </div>
      )}

      {/* 3. Bible Scripture Lower Third (High Priority Broadcast Graphic) */}
      {bConfig.bibleLowerThird?.enabled && bConfig.bibleLowerThird?.isShowing && (
        <div
          className="absolute z-25 flex flex-col rounded-[12px] bg-[#0c0a14]/95 border-2 border-amber-500/50 shadow-2xl p-3 backdrop-blur-md transition-all"
          style={{
            left: `${bConfig.bibleLowerThird.x ?? 50}%`,
            top: `${bConfig.bibleLowerThird.y ?? 85}%`,
            transform: "translate(-50%, -50%)",
            width: `${bConfig.bibleLowerThird.width ?? 90}%`,
          }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="text-amber-300 font-black text-xs tracking-wide">
                📖 {bConfig.bibleLowerThird.currentRef || "Scripture"}
              </span>
              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-[12px] bg-amber-400/20 text-amber-200 border border-amber-400/30">
                {bConfig.bibleLowerThird.version || "KJV"}
              </span>
            </div>
            <button
              onClick={() => {
                if (window.electron?.Switcher?.updateBroadcastConfig) {
                  window.electron.Switcher.updateBroadcastConfig({
                    bibleLowerThird: { ...bConfig.bibleLowerThird, isShowing: false },
                  });
                }
              }}
              className="p-1 rounded-[12px] bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all text-xs"
              title="Dismiss scripture overlay"
            >
              <PiX size={12} />
            </button>
          </div>
          <p className="text-[11px] font-medium text-white/95 leading-relaxed line-clamp-2">
            "{bConfig.bibleLowerThird.currentText}"
          </p>
        </div>
      )}

      {/* 4. Live Announcement Ticker Banner */}
      {bConfig.ticker?.enabled && bConfig.ticker.text && (
        <div className="absolute bottom-0 left-0 right-0 h-6 bg-slate-950/95 border-t border-white/10 flex items-center px-2.5 z-20 overflow-hidden">
          <div className="px-1.5 py-0.2 rounded-[12px] bg-red-600 text-white text-[8px] font-black uppercase tracking-wider mr-2 shrink-0">
            LIVE
          </div>
          <p className="text-[10px] text-white font-semibold truncate">
            {bConfig.ticker.text}
          </p>
        </div>
      )}

      {/* Overlaid HUD */}
      {(isTransitioning || hasFrame || stream) && (
        <>
          <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10">
            <div className={`text-white text-[10px] font-bold px-2 py-0.5 rounded-[12px] flex items-center gap-1.5 shadow-md ${
              isManualMixing ? "bg-amber-600/90" : isTransitioning ? "bg-amber-600/85" : "bg-red-600/85"
            }`}>
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              {isManualMixing ? `T-BAR: ${Math.round(mixProgress * 100)}%` : isTransitioning ? "TRANSITION" : "LIVE OUTPUT"}
            </div>
            {isMirrored && (
              <div className="bg-purple-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-[12px] shadow-sm">
                MIRRORED
              </div>
            )}
            {isManualMixing && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-300 bg-black/60 px-1.5 py-0.5 rounded-[12px] border border-amber-500/30">
                {transitionSetting?.type?.toUpperCase() || "FADE"} ({Math.round(mixProgress * 100)}%)
              </span>
            )}
            {!isManualMixing && isTransitioning && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-300 bg-black/60 px-1.5 py-0.5 rounded-[12px] border border-amber-500/30">
                {activeTransition?.type} ({activeTransition?.duration}ms)
              </span>
            )}
            {bConfig.scale < 1.0 && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-purple-300 bg-black/60 px-1.5 py-0.5 rounded-[12px] border border-purple-500/30">
                {Math.round(bConfig.scale * 100)}% INSET
              </span>
            )}
          </div>
          <div className="absolute top-2.5 right-2.5 bg-black/60 text-white/50 text-[9px] font-mono px-1.5 py-0.5 rounded-[12px] border border-white/10 z-10">
            {isTransitioning ? "Compositing" : stream ? "30 fps HD" : `${hudStats.fps || 30} fps`}
          </div>
          <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-end justify-between z-10">
            <span className="bg-black/60 backdrop-blur-sm text-white/80 text-[10px] font-medium px-2 py-0.5 rounded-[12px] border border-white/10 truncate max-w-[70%]">
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

