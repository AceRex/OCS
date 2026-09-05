import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  PiVideoCamera,
  PiMonitor,
  PiArrowCounterClockwise,
  PiUser,
  PiCheckCircle,
  PiWarning,
  PiTelevision,
  PiUsersThree,
  PiLockKey,
  PiBroadcast,
  PiSlidersHorizontal,
  PiLightning,
  PiClock,
  PiArrowRight,
  PiArrowLeft,
  PiArrowDown,
  PiArrowUp,
  PiArrowsLeftRight,
  PiPlay,
  PiRadio,
} from "react-icons/pi";
import SwitcherCameraTile from "./SwitcherCameraTile";
import SwitcherMonitorTile from "./SwitcherMonitorTile";
import SwitcherProgramCanvas from "./SwitcherProgramCanvas";

/** Total camera slots in the multiview grid (always rendered, even if empty) */
const TOTAL_SLOTS = 6;

export default function LiveSwitcherController() {
  // ── Switcher state ───────────────────────────────────────────────────────────
  const [cameraSlots, setCameraSlots] = useState([]); // [{ socketId, name, slotIndex }]
  const [activeDisplay, setActiveDisplay] = useState("display1"); // "display1" | "display2"
  const [display1Source, setDisplay1Source] = useState("general"); // "general" | "speaker" | socketId
  const [display2Source, setDisplay2Source] = useState(null); // "general" | "speaker" | socketId | null
  const [controllerSocketId, setControllerSocketId] = useState("desktop");
  const [routeGeneral, setRouteGeneral] = useState(false);
  const [routeSpeaker, setRouteSpeaker] = useState(false);

  // ── Manual Broadcast T-Bar mix state (0: 100% Display 1, 1: 100% Display 2) ──
  const [mixProgress, setMixProgress] = useState(0);

  // ── Transition state ─────────────────────────────────────────────────────────
  const [transitionSetting, setTransitionSettingState] = useState({
    type: "fade",
    duration: 750,
    direction: "left-to-right",
  });
  const [activeTransition, setActiveTransition] = useState(null);

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [feedback, setFeedback] = useState(null); // { text, ok }
  const [pairedDevices, setPairedDevices] = useState([]);
  const [grantTarget, setGrantTarget] = useState("");
  const [cameraStreams, setCameraStreams] = useState(new Map()); // socketId -> MediaStream
  const peerConnectionsRef = useRef(new Map()); // socketId -> RTCPeerConnection

  const isDesktopController = controllerSocketId === "desktop";

  // Effective Program and Preview sources based on activeDisplay
  const effectiveProgramSourceId = activeDisplay === "display1"
    ? (display1Source || "general")
    : (display2Source || (cameraSlots[0]?.socketId || "speaker"));

  const effectivePreviewSourceId = activeDisplay === "display1"
    ? (display2Source || (cameraSlots[0]?.socketId || "speaker"))
    : (display1Source || "general");

  // Keep legacy state variables synced for consumers/tests
  const programSourceId = effectiveProgramSourceId;
  const previewSourceId = effectivePreviewSourceId;

  // ── Hydrate on mount ─────────────────────────────────────────────────────────
  useEffect(() => {
    const hydrate = async () => {
      try {
        const state = await window.electron?.Switcher?.getState?.();
        if (state) applyState(state);
      } catch (e) {
        console.error("[SwitcherController] Failed to fetch initial state:", e);
      }
      try {
        const devs = await window.electron?.MobileDevices?.getConnected?.();
        if (Array.isArray(devs)) setPairedDevices(devs);
      } catch (e) {
        console.error("[SwitcherController] Failed to fetch connected devices:", e);
      }
    };
    hydrate();

    // Live state updates
    const unsubState = window.electron?.Switcher?.onStateUpdate?.((newState) => {
      if (newState) applyState(newState);
    });

    const unsubDevices = window.electron?.MobileDevices?.onUpdated?.((devs) => {
      if (Array.isArray(devs)) setPairedDevices(devs);
    });

    const unsubReclaim = window.electron?.Switcher?.onControllerReclaimed?.((payload) => {
      setControllerSocketId("desktop");
      showFeedback(`Switcher control reclaimed by desktop (${payload?.reason || "phone disconnected"})`, true);
    });

    // Transition start / complete / setting updates
    const unsubTransStart = window.electron?.Switcher?.onTransitionStart?.((t) => {
      setActiveTransition(t);
    });

    const unsubTransComplete = window.electron?.Switcher?.onTransitionComplete?.((payload) => {
      setActiveTransition(null);
      setMixProgress(0);
      if (payload?.programSourceId !== undefined) {
        // Source completed
      }
    });

    const unsubTransSetting = window.electron?.Switcher?.onTransitionSettingUpdate?.((setting) => {
      if (setting) setTransitionSettingState(setting);
    });

    // ── WebRTC Continuous Video Ingestion ─────────────────────────────────────
    const unsubOffer = window.electron?.Switcher?.onWebRtcOffer?.(async ({ socketId, slotIndex, offer }) => {
      try {
        const existingPc = peerConnectionsRef.current.get(socketId);
        if (existingPc) {
          existingPc.close();
          peerConnectionsRef.current.delete(socketId);
        }

        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        peerConnectionsRef.current.set(socketId, pc);

        pc.ontrack = (event) => {
          if (event.streams && event.streams[0]) {
            setCameraStreams((prev) => {
              const next = new Map(prev);
              next.set(socketId, event.streams[0]);
              return next;
            });
          }
        };

        pc.onicecandidate = (event) => {
          if (event.candidate && window.electron?.Switcher?.sendWebRtcIce) {
            window.electron.Switcher.sendWebRtcIce({
              targetSocketId: socketId,
              candidate: event.candidate,
            });
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (window.electron?.Switcher?.sendWebRtcAnswer) {
          window.electron.Switcher.sendWebRtcAnswer({
            targetSocketId: socketId,
            answer,
          });
        }
      } catch (err) {
        console.error(`[SwitcherController] WebRTC negotiation error with ${socketId}:`, err);
      }
    });

    const unsubIce = window.electron?.Switcher?.onWebRtcIce?.(async ({ socketId, candidate }) => {
      try {
        const pc = peerConnectionsRef.current.get(socketId);
        if (pc && candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (err) {
        console.error(`[SwitcherController] WebRTC ICE addition error:`, err);
      }
    });

    return () => {
      if (typeof unsubState === "function") unsubState();
      if (typeof unsubDevices === "function") unsubDevices();
      if (typeof unsubReclaim === "function") unsubReclaim();
      if (typeof unsubTransStart === "function") unsubTransStart();
      if (typeof unsubTransComplete === "function") unsubTransComplete();
      if (typeof unsubTransSetting === "function") unsubTransSetting();
      if (typeof unsubOffer === "function") unsubOffer();
      if (typeof unsubIce === "function") unsubIce();
      peerConnectionsRef.current.forEach((pc) => {
        try { pc.close(); } catch (_) {}
      });
      peerConnectionsRef.current.clear();
    };
  }, []);

  const applyState = (state) => {
    if (Array.isArray(state.cameraSlots)) {
      setCameraSlots(state.cameraSlots);
      // If Display 2 is unset and cameras are connected, default Display 2 to first camera
      setDisplay2Source((prev) => {
        if (!prev && state.cameraSlots.length > 0) return state.cameraSlots[0].socketId;
        return prev;
      });
    }
    if (state.controllerSocketId !== undefined) setControllerSocketId(state.controllerSocketId);
    if (state.activeDisplay !== undefined) setActiveDisplay(state.activeDisplay);
    if (state.display1Source !== undefined) setDisplay1Source(state.display1Source);
    if (state.display2Source !== undefined) setDisplay2Source(state.display2Source);
    if (state.routeGeneral !== undefined) setRouteGeneral(!!state.routeGeneral);
    if (state.routeSpeaker !== undefined) setRouteSpeaker(!!state.routeSpeaker);
    if (state.transitionSetting) setTransitionSettingState(state.transitionSetting);
  };

  const showFeedback = (text, ok) => {
    setFeedback({ text, ok });
    setTimeout(() => setFeedback(null), 3000);
  };

  const getSourceName = useCallback((srcId) => {
    if (!srcId) return "None (Standby)";
    if (srcId === "general") return "General Screen (Presentation)";
    if (srcId === "speaker") return "Speaker Screen (Confidence)";
    const cam = cameraSlots.find((s) => s.socketId === srcId);
    if (cam) return `${cam.name || "Camera"} (Slot ${cam.slotIndex})`;
    return srcId;
  }, [cameraSlots]);

  // ── Transition Setting Update ────────────────────────────────────────────────
  const updateTransitionSetting = async (patch) => {
    if (!isDesktopController) {
      showFeedback("Desktop does not hold controller permission", false);
      return;
    }
    const nextSetting = { ...transitionSetting, ...patch };
    setTransitionSettingState(nextSetting);
    try {
      const res = await window.electron?.Switcher?.setTransitionSetting?.(nextSetting);
      if (res?.ok && res.transitionSetting) {
        setTransitionSettingState(res.transitionSetting);
      } else if (res?.error) {
        showFeedback(res.error, false);
      }
    } catch (e) {
      showFeedback("Failed to update transition: " + e.message, false);
    }
  };

  // ── Switch Active Display Channel ('display1' vs 'display2') ──────────────────
  const handleSetActiveDisplay = useCallback(async (targetDisplay, customTrans = null) => {
    if (!isDesktopController) {
      showFeedback("Desktop does not hold controller permission", false);
      return;
    }
    const targetSource = targetDisplay === "display1"
      ? (display1Source || "general")
      : (display2Source || (cameraSlots[0]?.socketId || "speaker"));

    setActiveDisplay(targetDisplay);
    setMixProgress(0);

    try {
      const res = await window.electron?.Switcher?.setActiveDisplay?.({
        displayId: targetDisplay,
        transition: customTrans || transitionSetting,
      });
      if (res?.ok) {
        showFeedback(
          `Showing ${targetDisplay === "display1" ? "Display 1" : "Display 2"}: ${getSourceName(targetSource)}`,
          true
        );
      } else {
        showFeedback(res?.error || "Display switch failed", false);
      }
    } catch (e) {
      showFeedback("IPC error: " + e.message, false);
    }
  }, [isDesktopController, display1Source, display2Source, cameraSlots, transitionSetting, getSourceName]);

  // ── Set Source Assignment for Display 1 or Display 2 ─────────────────────────
  const handleSetDisplaySource = useCallback(async (displayId, sourceId) => {
    if (!isDesktopController) {
      showFeedback("Desktop does not hold controller permission", false);
      return;
    }
    if (displayId === "display1") {
      setDisplay1Source(sourceId);
    } else {
      setDisplay2Source(sourceId);
    }

    try {
      const res = await window.electron?.Switcher?.setDisplaySource?.(displayId, sourceId);
      if (res?.ok) {
        showFeedback(
          `Assigned ${displayId === "display1" ? "Display 1" : "Display 2"} ➔ ${getSourceName(sourceId)}`,
          true
        );
      } else {
        showFeedback(res?.error || "Failed to set display source", false);
      }
    } catch (e) {
      showFeedback("IPC error: " + e.message, false);
    }
  }, [isDesktopController, getSourceName]);

  // ── CUT: Instant Hard Cut Between Display 1 and Display 2 ─────────────────────
  const handleCut = useCallback(async () => {
    const targetDisplay = activeDisplay === "display1" ? "display2" : "display1";
    await handleSetActiveDisplay(targetDisplay, { type: "cut", duration: 100 });
  }, [activeDisplay, handleSetActiveDisplay]);

  // ── AUTO: Take Animated Transition Between Display 1 and Display 2 ────────────
  const handleAuto = useCallback(async () => {
    const targetDisplay = activeDisplay === "display1" ? "display2" : "display1";
    await handleSetActiveDisplay(targetDisplay, transitionSetting);
  }, [activeDisplay, transitionSetting, handleSetActiveDisplay]);

  // ── T-BAR Manual Mix Fader Dragging ──────────────────────────────────────────
  const handleTBarChange = (val) => {
    const num = Math.min(1, Math.max(0, Number(val)));
    setMixProgress(num);

    // When dragged fully to 100%, commit take to Display 2; at 0%, commit to Display 1
    if (num >= 0.99 && activeDisplay === "display1") {
      handleSetActiveDisplay("display2");
    } else if (num <= 0.01 && activeDisplay === "display2") {
      handleSetActiveDisplay("display1");
    }
  };

  // ── Multiview Tile Selection (Queue into Standby or Cut if already Standby) ───
  const handleTileSelect = useCallback((srcId) => {
    if (!isDesktopController) {
      showFeedback("Desktop does not hold controller permission", false);
      return;
    }
    if (srcId === effectiveProgramSourceId) {
      showFeedback(`${getSourceName(srcId)} is already showing on Live Output`, true);
      return;
    }
    if (srcId === effectivePreviewSourceId) {
      // Already queued in standby channel: switch to it!
      handleAuto();
      return;
    }
    // Assign to standby channel
    const standbyDisplay = activeDisplay === "display1" ? "display2" : "display1";
    handleSetDisplaySource(standbyDisplay, srcId);
    showFeedback(`Queued for ${standbyDisplay === "display1" ? "Display 1" : "Display 2"}: ${getSourceName(srcId)}`, true);
  }, [isDesktopController, effectiveProgramSourceId, effectivePreviewSourceId, activeDisplay, handleSetDisplaySource, handleAuto, getSourceName]);

  const handleCameraSelect = (socketId) => handleTileSelect(socketId);
  const handleDisplaySelect = (type) => handleTileSelect(type);

  // ── Non-destructive Live Output Destination Sharing ──────────────────────────
  const handleRouteToggle = async (destination) => {
    if (!isDesktopController) {
      showFeedback("Desktop does not hold controller permission", false);
      return;
    }
    const currentActive = destination === "general" ? routeGeneral : routeSpeaker;
    const nextActive = !currentActive;

    if (destination === "general") setRouteGeneral(nextActive);
    if (destination === "speaker") setRouteSpeaker(nextActive);

    try {
      const res = await window.electron?.Switcher?.routeDestination?.(destination, nextActive);
      if (res?.ok) {
        showFeedback(
          `${destination === "general" ? "General Screen" : "Speaker Screen"} Live Output: ${
            nextActive ? "LIVE ON AIR" : "OFF (Presentation Restored)"
          }`,
          true
        );
      } else {
        showFeedback(res?.error || "Routing failed", false);
      }
    } catch (e) {
      showFeedback("IPC error: " + e.message, false);
    }
  };

  // ── Keyboard Hotkeys: [1], [2], [Space], [C], [G], [S] ────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target?.tagName)) return;
      if (e.key === "1") {
        e.preventDefault();
        handleSetActiveDisplay("display1");
      } else if (e.key === "2") {
        e.preventDefault();
        handleSetActiveDisplay("display2");
      } else if (e.code === "Space" || e.key === "Enter") {
        e.preventDefault();
        handleAuto();
      } else if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        handleCut();
      } else if (e.key === "g" || e.key === "G") {
        e.preventDefault();
        handleRouteToggle("general");
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        handleRouteToggle("speaker");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSetActiveDisplay, handleAuto, handleCut, handleRouteToggle]);

  // ── Switcher Controller Grant & Reclaim ───────────────────────────────────────
  const handleGrantControl = async () => {
    if (!grantTarget) return;
    try {
      const res = await window.electron?.Switcher?.grantControl?.(grantTarget);
      if (res?.ok) {
        setControllerSocketId(grantTarget);
        const dev = pairedDevices.find((d) => d.id === grantTarget);
        showFeedback(`Control granted to: ${dev?.name || grantTarget}`, true);
        setGrantTarget("");
      } else {
        showFeedback(res?.error || "Grant failed", false);
      }
    } catch (e) {
      showFeedback("IPC error: " + e.message, false);
    }
  };

  const handleReclaimControl = async () => {
    try {
      const res = await window.electron?.Switcher?.reclaimControl?.();
      if (res?.ok) {
        setControllerSocketId("desktop");
        showFeedback("Switcher control reclaimed by desktop", true);
      } else {
        showFeedback(res?.error || "Reclaim failed", false);
      }
    } catch (e) {
      showFeedback("IPC error: " + e.message, false);
    }
  };

  // ── Derived Properties ───────────────────────────────────────────────────────
  const controllerName =
    controllerSocketId === "desktop"
      ? "Desktop"
      : pairedDevices.find((d) => d.id === controllerSocketId)?.name ||
        cameraSlots.find((s) => s.socketId === controllerSocketId)?.name ||
        controllerSocketId;

  const isSharingActive = routeGeneral || routeSpeaker;

  // Helper for camera slot assigned display numbers
  const getCameraAssignedDisplay = (socketId) => {
    const isDisp1 = display1Source === socketId;
    const isDisp2 = display2Source === socketId;
    if (isDisp1 && isDisp2) return "both";
    if (isDisp1) return 1;
    if (isDisp2) return 2;
    return null;
  };

  const getMonitorAssignedDisplay = (type) => {
    const isDisp1 = display1Source === type;
    const isDisp2 = display2Source === type;
    if (isDisp1 && isDisp2) return "both";
    if (isDisp1) return 1;
    if (isDisp2) return 2;
    return null;
  };

  return (
    <div className="w-full h-full flex flex-col overflow-hidden gap-0 bg-[#0c0d14] font-outfit text-white select-none">
      {/* ── Top Bar Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-white/[0.02] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[12px] bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400">
            <PiVideoCamera size={18} />
          </div>
          <div>
            <h1 className="text-sm font-black text-white tracking-wide uppercase flex items-center gap-2">
              Live Switcher
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-[12px] bg-sky-500/20 text-sky-300 border border-sky-500/30">
                A/B DUAL CHANNEL
              </span>
            </h1>
            <p className="text-[11px] text-white/40 font-medium">
              Select any display as 1 or 2, switch live output, and share to screens non-destructively.
            </p>
          </div>
        </div>

        {/* Hotkeys HUD */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-[12px] bg-white/[0.04] border border-white/10 text-[10px] font-mono text-white/50">
            <span>[1]: DISP 1</span>
            <span className="text-white/20">|</span>
            <span>[2]: DISP 2</span>
            <span className="text-white/20">|</span>
            <span>[Space]: AUTO</span>
            <span className="text-white/20">|</span>
            <span>[C]: CUT</span>
            <span className="text-white/20">|</span>
            <span>[G]: GENERAL</span>
          </div>

          {/* Controller status indicator */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-[12px] border text-xs font-semibold ${
            isDesktopController
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-amber-500/10 border-amber-500/30 text-amber-300"
          }`}>
            <span className={`w-2 h-2 rounded-full ${isDesktopController ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />
            <span>Controller: {isDesktopController ? "Desktop (Local)" : controllerName}</span>
          </div>
        </div>
      </div>


      {/* ── Main Work Area ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex gap-5 p-5 min-h-0 overflow-hidden">
        {/* ── Left Column: Multiview 8-Tile Grid ──────────────────────────────── */}
        <div className="flex flex-col gap-3 w-7/12 shrink-0 min-h-0 overflow-y-auto pr-1">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">
              Multiview Grid · Cameras & Output Monitors
            </p>
            <span className="text-[10px] text-white/40 font-mono">
              Click [1] or [2] to assign · Click tile to queue
            </span>
          </div>

          {/* 6 Camera Slots */}
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: TOTAL_SLOTS }, (_, idx) => {
              const slotIndex = idx + 1;
              const slotInfo = cameraSlots.find((s) => s.slotIndex === slotIndex) || null;
              const stream = slotInfo ? cameraStreams.get(slotInfo.socketId) : null;
              const isProgram = !!(slotInfo && slotInfo.socketId === effectiveProgramSourceId);
              const isPreview = !!(slotInfo && slotInfo.socketId === effectivePreviewSourceId);
              const assignedDisp = slotInfo ? getCameraAssignedDisplay(slotInfo.socketId) : null;

              return (
                <SwitcherCameraTile
                  key={slotIndex}
                  slotIndex={slotIndex}
                  slotInfo={slotInfo}
                  stream={stream}
                  isProgram={isProgram}
                  isPreview={isPreview}
                  assignedDisplayNumber={assignedDisp}
                  canSwitch={isDesktopController}
                  onSelect={handleCameraSelect}
                  onSetDisplay={(sockId, num) => handleSetDisplaySource(num === 1 ? "display1" : "display2", sockId)}
                />
              );
            })}
          </div>

          {/* 2 Physical Destination Monitors: General Screen & Speaker Screen */}
          <div className="pt-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">
              Physical Screen Output Mirrors (Selectable as 1 or 2)
            </p>
            <div className="grid grid-cols-2 gap-3">
              {/* General View */}
              <SwitcherMonitorTile
                type="general"
                label="GENERAL SCREEN"
                displayNumber={1}
                assignedDisplayNumber={getMonitorAssignedDisplay("general")}
                isRouted={routeGeneral}
                isShowing={effectiveProgramSourceId === "general"}
                isSelected={effectivePreviewSourceId === "general"}
                programSourceId={effectiveProgramSourceId}
                programSourceName={getSourceName(effectiveProgramSourceId)}
                canSelect={isDesktopController}
                onSelect={handleDisplaySelect}
                onSetDisplay={(type, num) => handleSetDisplaySource(num === 1 ? "display1" : "display2", "general")}
                assignedSourceLabel={routeGeneral ? "Live Output (Sharing ON)" : "Church Presentation (Slides)"}
              />

              {/* Speaker View */}
              <SwitcherMonitorTile
                type="speaker"
                label="SPEAKER SCREEN"
                displayNumber={2}
                assignedDisplayNumber={getMonitorAssignedDisplay("speaker")}
                isRouted={routeSpeaker}
                isShowing={effectiveProgramSourceId === "speaker"}
                isSelected={effectivePreviewSourceId === "speaker"}
                programSourceId={effectiveProgramSourceId}
                programSourceName={getSourceName(effectiveProgramSourceId)}
                canSelect={isDesktopController}
                onSelect={handleDisplaySelect}
                onSetDisplay={(type, num) => handleSetDisplaySource(num === 1 ? "display1" : "display2", "speaker")}
                assignedSourceLabel={routeSpeaker ? "Live Output (Sharing ON)" : "Stage Confidence Monitor"}
              />
            </div>
          </div>

          {/* ── Broadcast Mixing & T-Bar Fader Deck (Below Screens) ──────────── */}
          <div className="bg-white/[0.04] border border-white/10 rounded-[12px] p-3.5 flex flex-col gap-2.5 shrink-0 mt-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <PiSlidersHorizontal size={14} className="text-amber-400" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                  Broadcast Mixing & Transition Control
                </p>
              </div>
              <span className="text-[9px] font-mono font-bold text-white/40">
                {mixProgress > 0 ? `Mixing: ${Math.round(mixProgress * 100)}%` : "Ready"}
              </span>
            </div>

            {/* Split layout: T-Bar on the Left, Take & Transition Controls on the Right */}
            <div className="grid grid-cols-2 gap-3 items-center">
              {/* LEFT: T-Bar Manual Mix Fader */}
              <div className="flex flex-col gap-2 p-3 rounded-[12px] bg-black/40 border border-white/5 h-full justify-between">
                <div className="flex items-center justify-between text-[10px] font-bold">
                  <span className="text-sky-400 flex items-center gap-1 truncate max-w-[48%]">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${activeDisplay === "display1" ? "bg-red-500 animate-pulse" : "bg-sky-500"}`} />
                    <span className="truncate">1: {getSourceName(display1Source)}</span>
                  </span>
                  <span className="text-violet-400 flex items-center gap-1 truncate max-w-[48%] justify-end">
                    <span className="truncate">2: {getSourceName(display2Source)}</span>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${activeDisplay === "display2" ? "bg-red-500 animate-pulse" : "bg-violet-500"}`} />
                  </span>
                </div>

                {/* T-Bar Slider Control */}
                <div className="relative flex items-center py-1">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={activeDisplay === "display1" ? mixProgress : 1 - mixProgress}
                    onChange={(e) => handleTBarChange(activeDisplay === "display1" ? e.target.value : 1 - e.target.value)}
                    disabled={!isDesktopController}
                    className="w-full h-3 bg-white/10 rounded-[12px] appearance-none cursor-pointer accent-amber-500 disabled:opacity-40"
                  />
                </div>

                <div className="flex items-center justify-between text-[9px] font-mono text-white/30">
                  <span>0% (Disp 1)</span>
                  <span>50% (Cross)</span>
                  <span>100% (Disp 2)</span>
                </div>
              </div>

              {/* RIGHT: CUT / AUTO Action Buttons & Transition Effect / Duration */}
              <div className="flex flex-col gap-2 p-3 rounded-[12px] bg-black/40 border border-white/5 h-full justify-between">
                {/* CUT and AUTO Take Action Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleCut}
                    disabled={!isDesktopController}
                    className="py-2 px-3 rounded-[12px] border border-red-500/50 bg-red-600/30 hover:bg-red-600/40 active:scale-[0.98] text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(239,68,68,0.2)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <PiLightning size={14} className="text-red-400" />
                    CUT [C]
                  </button>

                  <button
                    onClick={handleAuto}
                    disabled={!isDesktopController}
                    className="py-2 px-3 rounded-[12px] border border-emerald-500/50 bg-emerald-600/30 hover:bg-emerald-600/40 active:scale-[0.98] text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(16,185,129,0.2)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <PiPlay size={14} className="text-emerald-400" />
                    AUTO [Space]
                  </button>
                </div>

                {/* Effect and Duration Settings */}
                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-white/10">
                  {/* Effects */}
                  <div className="flex items-center gap-1">
                    {["fade", "wipe", "cut"].map((type) => (
                      <button
                        key={type}
                        onClick={() => updateTransitionSetting({ type })}
                        className={`px-2 py-0.5 rounded-[12px] text-[9px] font-bold uppercase transition-all border ${
                          transitionSetting.type === type
                            ? "bg-amber-500/20 text-amber-300 border-amber-400/40"
                            : "bg-white/5 text-white/40 border-white/10 hover:text-white"
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>

                  {/* Durations */}
                  {transitionSetting.type !== "cut" && (
                    <div className="flex items-center gap-1">
                      {[250, 500, 750, 1000].map((ms) => (
                        <button
                          key={ms}
                          onClick={() => updateTransitionSetting({ duration: ms })}
                          className={`px-1.5 py-0.5 rounded-[12px] text-[9px] font-mono font-bold transition-all border ${
                            transitionSetting.duration === ms
                              ? "bg-white/20 text-white border-white/40"
                              : "bg-white/5 text-white/30 border-white/10 hover:text-white"
                          }`}
                        >
                          {ms}ms
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right Column: Program Output, Channels, T-Bar & Sharing Deck ──── */}
        <div className="flex flex-col gap-4 flex-1 min-w-0 overflow-y-auto pl-1">
          {/* Program Output Canvas */}
          <div className="shrink-0">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                Live Output (Program Mix)
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-[12px] bg-red-500/20 text-red-400 border border-red-500/30">
                  ON AIR: {activeDisplay === "display1" ? "DISPLAY 1" : "DISPLAY 2"} ({getSourceName(effectiveProgramSourceId)})
                </span>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-[12px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  STANDBY: {activeDisplay === "display1" ? "DISPLAY 2" : "DISPLAY 1"} ({getSourceName(effectivePreviewSourceId)})
                </span>
              </div>
            </div>

            <SwitcherProgramCanvas
              programSourceId={effectiveProgramSourceId}
              programSourceName={getSourceName(effectiveProgramSourceId)}
              previewSourceId={effectivePreviewSourceId}
              previewSourceName={getSourceName(effectivePreviewSourceId)}
              stream={cameraStreams.get(effectiveProgramSourceId)}
              cameraStreams={cameraStreams}
              activeTransition={activeTransition}
              mixProgress={mixProgress}
              transitionSetting={transitionSetting}
              isSharingActive={isSharingActive}
            />
          </div>

          {/* ── Live Display Channels & Take Deck (A/B Deck) ────────────────── */}
          <div className="bg-white/[0.04] border border-white/10 rounded-[12px] p-4 flex flex-col gap-3 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <PiTelevision size={14} className="text-sky-400" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                  Live Display Channels · Select What To Show
                </p>
              </div>
              <span className="text-[9px] font-mono font-bold text-white/40">
                Hotkeys: [1], [2], [Space]
              </span>
            </div>

            {/* A/B Channels Grid */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* DISPLAY 1 CHANNEL */}
              <div className={`flex flex-col gap-2 p-3 rounded-[12px] border transition-all ${
                activeDisplay === "display1"
                  ? "bg-red-500/10 border-red-500/40 ring-1 ring-red-500/50 shadow-[0_0_16px_rgba(239,68,68,0.15)]"
                  : "bg-black/30 border-white/5"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-[12px] bg-sky-500/20 text-sky-400 text-[10px] font-black flex items-center justify-center border border-sky-500/30">
                      1
                    </span>
                    <span className="text-xs font-black text-white tracking-tight">DISPLAY 1</span>
                  </div>
                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-[12px] uppercase ${
                    activeDisplay === "display1"
                      ? "bg-red-500 text-white animate-pulse"
                      : "bg-white/5 text-white/40"
                  }`}>
                    {activeDisplay === "display1" ? "● ON AIR" : "STANDBY"}
                  </span>
                </div>

                {/* Source selector for Display 1 */}
                <select
                  value={display1Source || "general"}
                  onChange={(e) => handleSetDisplaySource("display1", e.target.value)}
                  disabled={!isDesktopController}
                  className="w-full bg-black/60 border border-white/10 rounded-[12px] px-2 py-1.5 text-[11px] font-semibold text-white/80 focus:outline-none focus:border-white/30"
                >
                  <option value="general">General Screen (Presentation / Slides)</option>
                  <option value="speaker">Speaker Screen (Stage / Confidence)</option>
                  {cameraSlots.map((cam) => (
                    <option key={cam.socketId} value={cam.socketId}>
                      {cam.name || `Camera ${cam.slotIndex}`} (Slot {cam.slotIndex})
                    </option>
                  ))}
                </select>

                {/* Take Display 1 Button */}
                <button
                  onClick={() => handleSetActiveDisplay("display1")}
                  disabled={!isDesktopController}
                  className={`w-full py-2 px-3 rounded-[12px] border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    activeDisplay === "display1"
                      ? "bg-red-500 text-white border-red-400 shadow-[0_0_12px_rgba(239,68,68,0.3)]"
                      : "bg-white/[0.05] border-white/10 text-white/70 hover:bg-white/[0.1] hover:text-white"
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <PiMonitor size={14} />
                  {activeDisplay === "display1" ? "SHOWING DISPLAY 1" : "SHOW DISPLAY 1 [1]"}
                </button>
              </div>

              {/* DISPLAY 2 CHANNEL */}
              <div className={`flex flex-col gap-2 p-3 rounded-[12px] border transition-all ${
                activeDisplay === "display2"
                  ? "bg-red-500/10 border-red-500/40 ring-1 ring-red-500/50 shadow-[0_0_16px_rgba(239,68,68,0.15)]"
                  : "bg-black/30 border-white/5"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-[12px] bg-violet-500/20 text-violet-400 text-[10px] font-black flex items-center justify-center border border-violet-500/30">
                      2
                    </span>
                    <span className="text-xs font-black text-white tracking-tight">DISPLAY 2</span>
                  </div>
                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-[12px] uppercase ${
                    activeDisplay === "display2"
                      ? "bg-red-500 text-white animate-pulse"
                      : "bg-white/5 text-white/40"
                  }`}>
                    {activeDisplay === "display2" ? "● ON AIR" : "STANDBY"}
                  </span>
                </div>

                {/* Source selector for Display 2 */}
                <select
                  value={display2Source || (cameraSlots[0]?.socketId || "speaker")}
                  onChange={(e) => handleSetDisplaySource("display2", e.target.value)}
                  disabled={!isDesktopController}
                  className="w-full bg-black/60 border border-white/10 rounded-[12px] px-2 py-1.5 text-[11px] font-semibold text-white/80 focus:outline-none focus:border-white/30"
                >
                  {cameraSlots.map((cam) => (
                    <option key={cam.socketId} value={cam.socketId}>
                      {cam.name || `Camera ${cam.slotIndex}`} (Slot {cam.slotIndex})
                    </option>
                  ))}
                  <option value="speaker">Speaker Screen (Stage / Confidence)</option>
                  <option value="general">General Screen (Presentation / Slides)</option>
                </select>

                {/* Take Display 2 Button */}
                <button
                  onClick={() => handleSetActiveDisplay("display2")}
                  disabled={!isDesktopController}
                  className={`w-full py-2 px-3 rounded-[12px] border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    activeDisplay === "display2"
                      ? "bg-red-500 text-white border-red-400 shadow-[0_0_12px_rgba(239,68,68,0.3)]"
                      : "bg-white/[0.05] border-white/10 text-white/70 hover:bg-white/[0.1] hover:text-white"
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <PiVideoCamera size={14} />
                  {activeDisplay === "display2" ? "SHOWING DISPLAY 2" : "SHOW DISPLAY 2 [2]"}
                </button>
              </div>
            </div>

            {/* Quick Swap Displays Button */}
            <button
              onClick={() => handleSetActiveDisplay(activeDisplay === "display1" ? "display2" : "display1")}
              disabled={!isDesktopController}
              className="w-full py-2 px-3 rounded-[12px] bg-gradient-to-r from-sky-500/20 via-white/10 to-violet-500/20 hover:from-sky-500/30 hover:to-violet-500/30 border border-white/15 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <PiArrowsLeftRight size={14} className="text-amber-400" />
              <span>
                Swap Displays: Switch to {activeDisplay === "display1" ? "Display 2" : "Display 1"} ({transitionSetting.type.toUpperCase()})
              </span>
              <span className="text-[10px] font-mono text-white/50 bg-black/40 px-1.5 py-0.5 rounded-[12px] border border-white/10">
                Space
              </span>
            </button>
          </div>


          {/* ── Live Output Destination Sharing Deck ─────────────────────────── */}
          <div className="bg-white/[0.04] border border-white/10 rounded-[12px] p-4 flex flex-col gap-3 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <PiBroadcast size={14} className="text-sky-400" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                  Share Live Output
                </p>
              </div>
              <span className="text-[9px] text-white/40 font-mono">
                Non-destructive · Presentation preserved
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {/* Share to General Screen Toggle */}
              <button
                onClick={() => handleRouteToggle("general")}
                disabled={!isDesktopController}
                className={`flex items-center justify-between p-3 rounded-[12px] border transition-all text-left ${
                  routeGeneral
                    ? "bg-sky-500/15 border-sky-500/40 text-sky-200 shadow-[0_0_16px_rgba(14,165,233,0.2)]"
                    : "bg-black/30 border-white/10 text-white/70 hover:bg-white/[0.04]"
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-[12px] flex items-center justify-center border ${
                    routeGeneral
                      ? "bg-sky-500/20 border-sky-400/40 text-sky-300"
                      : "bg-white/5 border-white/10 text-white/40"
                  }`}>
                    <PiMonitor size={18} />
                  </div>
                  <div>
                    <span className="text-xs font-bold block text-white">Share to General Screen [G]</span>
                    <span className="text-[10px] text-white/40 block">
                      {routeGeneral ? "Live Output showing on sanctuary display" : "Currently showing church presentation"}
                    </span>
                  </div>
                </div>
                <span className={`text-[9px] font-black px-2.5 py-1 rounded-[12px] uppercase tracking-wider border ${
                  routeGeneral
                    ? "bg-sky-500 text-white border-sky-400 animate-pulse shadow-md"
                    : "bg-white/5 border-white/10 text-white/40"
                }`}>
                  {routeGeneral ? "● ON AIR" : "OFF"}
                </span>
              </button>

              {/* Share to Speaker Screen Toggle */}
              <button
                onClick={() => handleRouteToggle("speaker")}
                disabled={!isDesktopController}
                className={`flex items-center justify-between p-3 rounded-[12px] border transition-all text-left ${
                  routeSpeaker
                    ? "bg-violet-500/15 border-violet-500/40 text-violet-200 shadow-[0_0_16px_rgba(139,92,246,0.2)]"
                    : "bg-black/30 border-white/10 text-white/70 hover:bg-white/[0.04]"
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-[12px] flex items-center justify-center border ${
                    routeSpeaker
                      ? "bg-violet-500/20 border-violet-400/40 text-violet-300"
                      : "bg-white/5 border-white/10 text-white/40"
                  }`}>
                    <PiUsersThree size={18} />
                  </div>
                  <div>
                    <span className="text-xs font-bold block text-white">Share to Speaker Screen [S]</span>
                    <span className="text-[10px] text-white/40 block">
                      {routeSpeaker ? "Live Output showing on confidence screen" : "Currently showing speaker confidence monitor"}
                    </span>
                  </div>
                </div>
                <span className={`text-[9px] font-black px-2.5 py-1 rounded-[12px] uppercase tracking-wider border ${
                  routeSpeaker
                    ? "bg-violet-500 text-white border-violet-400 animate-pulse shadow-md"
                    : "bg-white/5 border-white/10 text-white/40"
                }`}>
                  {routeSpeaker ? "● ON AIR" : "OFF"}
                </span>
              </button>

              {/* Share to Social Media & Live Stream */}
              <div className="flex items-center justify-between p-3 rounded-[12px] bg-black/30 border border-white/10 text-white/70">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-[12px] bg-white/5 border border-white/10 flex items-center justify-center text-white/40">
                    <PiRadio size={18} />
                  </div>
                  <div>
                    <span className="text-xs font-bold block text-white">Social Media & Live Stream</span>
                    <span className="text-[10px] text-white/40 block">
                      Broadcast Live Output to YouTube, Facebook, and RTMP
                    </span>
                  </div>
                </div>
                <span className="text-[9px] font-bold px-2 py-1 rounded-[12px] bg-amber-500/10 border border-amber-500/20 text-amber-300 uppercase tracking-wider">
                  STREAM HUB READY
                </span>
              </div>
            </div>
          </div>

          {/* ── Switcher Controller Permission ───────────────────────────────── */}
          <div className="bg-white/[0.04] border border-white/10 rounded-[12px] p-4 flex flex-col gap-3 shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 flex items-center gap-1.5">
              <PiLockKey size={12} />
              Switcher Controller Permission
            </p>

            <div className={`flex items-center gap-2.5 px-3 py-2 rounded-[12px] border text-sm ${
              isDesktopController
                ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                : "bg-amber-500/10 border-amber-500/25 text-amber-300"
            }`}>
              {isDesktopController ? <PiTelevision size={14} /> : <PiUser size={14} />}
              <span className="font-semibold text-[11px]">
                {isDesktopController ? "Desktop (this machine)" : controllerName}
              </span>
              <span className="ml-auto text-[9px] font-black px-2 py-0.5 rounded-[12px] bg-current/20 border border-current/30 opacity-80">
                {isDesktopController ? "LOCAL" : "REMOTE"}
              </span>
            </div>

            {/* Grant control */}
            {isDesktopController && pairedDevices.filter((d) => d.paired).length > 0 && (
              <div className="flex gap-2">
                <select
                  value={grantTarget}
                  onChange={(e) => setGrantTarget(e.target.value)}
                  className="flex-1 bg-black/60 border border-white/10 rounded-[12px] px-2 py-1.5 text-xs text-white/80 focus:outline-none focus:border-white/30"
                >
                  <option value="">Select phone to grant control…</option>
                  {pairedDevices.filter((d) => d.paired).map((dev) => (
                    <option key={dev.id} value={dev.id}>{dev.name || dev.id}</option>
                  ))}
                </select>
                <button
                  onClick={handleGrantControl}
                  disabled={!grantTarget}
                  className="px-3 py-1.5 rounded-[12px] bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/15 disabled:opacity-40 transition-all"
                >
                  Grant
                </button>
              </div>
            )}

            {/* Reclaim control */}
            {!isDesktopController && (
              <button
                onClick={handleReclaimControl}
                className="w-full py-2 px-3 rounded-[12px] bg-red-600/30 hover:bg-red-600/40 border border-red-500/40 text-red-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-md"
              >
                <PiArrowCounterClockwise size={14} />
                Reclaim Control Immediately
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
