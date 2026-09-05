import React, { useEffect, useState, useCallback } from "react";
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
} from "react-icons/pi";
import SwitcherCameraTile from "./SwitcherCameraTile";
import SwitcherMonitorTile from "./SwitcherMonitorTile";
import SwitcherProgramCanvas from "./SwitcherProgramCanvas";

/** Total camera slots in the multiview grid (always rendered, even if empty) */
const TOTAL_SLOTS = 6;

export default function LiveSwitcherController() {
  // ── Switcher state ───────────────────────────────────────────────────────────
  const [cameraSlots, setCameraSlots] = useState([]); // [{ socketId, name, slotIndex }]
  const [programSourceId, setProgramSourceId] = useState(null);
  const [controllerSocketId, setControllerSocketId] = useState("desktop");
  const [routeGeneral, setRouteGeneral] = useState(false);
  const [routeSpeaker, setRouteSpeaker] = useState(false);

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [feedback, setFeedback] = useState(null); // { text, ok }
  const [pairedDevices, setPairedDevices] = useState([]);
  const [grantTarget, setGrantTarget] = useState("");
  const [cameraStreams, setCameraStreams] = useState(new Map()); // socketId -> MediaStream
  const peerConnectionsRef = useRef(new Map()); // socketId -> RTCPeerConnection

  const isDesktopController = controllerSocketId === "desktop";

  // ── Hydrate on mount ─────────────────────────────────────────────────────────
  useEffect(() => {
    const hydrate = async () => {
      try {
        const state = await window.electron?.Switcher?.getState?.();
        if (state?.ok) applyState(state);
      } catch (_) {}
    };
    hydrate();

    // Subscribe to devices list for grant-control dropdown
    const fetchDevices = async () => {
      try {
        const devs = await window.electron?.Network?.getPairedDevices?.();
        if (Array.isArray(devs)) setPairedDevices(devs.filter((d) => d.paired));
      } catch (_) {}
    };
    fetchDevices();

    // Live state updates
    const unsubState = window.electron?.Switcher?.onStateUpdate?.((state) => {
      applyState(state);
    });

    // Devices list updates
    const unsubDevices = window.electron?.Network?.onDevicesUpdated?.((devs) => {
      if (Array.isArray(devs)) setPairedDevices(devs.filter((d) => d.paired));
    });

    // Controller forcibly reclaimed (phone disconnected etc.)
    const unsubReclaim = window.electron?.Switcher?.onControllerReclaimed?.((payload) => {
      setControllerSocketId("desktop");
      showFeedback(`Switcher control reclaimed by desktop (${payload?.reason || "phone disconnected"})`, true);
    });

    // ── WebRTC Continuous Video Ingestion ─────────────────────────────────────
    const unsubOffer = window.electron?.Switcher?.onWebRtcOffer?.(async ({ socketId, slotIndex, offer }) => {
      try {
        console.log("[Live Switcher] Received WebRTC offer for socketId:", socketId, "slot:", slotIndex);
        if (peerConnectionsRef.current.has(socketId)) {
          try { peerConnectionsRef.current.get(socketId).close(); } catch (_) {}
        }

        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });

        pc.ontrack = (event) => {
          console.log("[Live Switcher] Received remote MediaStreamTrack for socketId:", socketId);
          if (event.streams && event.streams[0]) {
            const stream = event.streams[0];
            setCameraStreams((prev) => {
              const next = new Map(prev);
              next.set(socketId, stream);
              return next;
            });
          }
        };

        pc.onicecandidate = (event) => {
          if (event.candidate && window.electron?.Switcher?.sendWebRtcIceCandidate) {
            window.electron.Switcher.sendWebRtcIceCandidate({
              targetId: socketId,
              candidate: event.candidate,
            });
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (window.electron?.Switcher?.sendWebRtcAnswer) {
          window.electron.Switcher.sendWebRtcAnswer({
            targetId: socketId,
            answer,
          });
        }

        peerConnectionsRef.current.set(socketId, pc);
      } catch (err) {
        console.error("[Live Switcher] WebRTC negotiation error:", err);
      }
    });

    const unsubIce = window.electron?.Switcher?.onWebRtcIceCandidate?.(async ({ socketId, candidate }) => {
      const pc = peerConnectionsRef.current.get(socketId);
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error("[Live Switcher] Error adding ICE candidate:", err);
        }
      }
    });

    return () => {
      if (typeof unsubState === "function") unsubState();
      if (typeof unsubDevices === "function") unsubDevices();
      if (typeof unsubReclaim === "function") unsubReclaim();
      if (typeof unsubOffer === "function") unsubOffer();
      if (typeof unsubIce === "function") unsubIce();
      peerConnectionsRef.current.forEach((pc) => {
        try { pc.close(); } catch (_) {}
      });
      peerConnectionsRef.current.clear();
    };
  }, []);

  const applyState = (state) => {
    if (Array.isArray(state.cameraSlots)) setCameraSlots(state.cameraSlots);
    if (state.controllerSocketId !== undefined) setControllerSocketId(state.controllerSocketId);
    if (state.programSourceId !== undefined) setProgramSourceId(state.programSourceId);
    if (state.routeGeneral !== undefined) setRouteGeneral(!!state.routeGeneral);
    if (state.routeSpeaker !== undefined) setRouteSpeaker(!!state.routeSpeaker);
  };

  const showFeedback = (text, ok) => {
    setFeedback({ text, ok });
    setTimeout(() => setFeedback(null), 3000);
  };

  // ── Hard-cut switch ──────────────────────────────────────────────────────────
  const handleCameraSelect = useCallback(async (socketId) => {
    if (!isDesktopController) {
      showFeedback("Desktop does not hold controller permission", false);
      return;
    }
    try {
      const res = await window.electron?.Switcher?.setProgramSource?.(socketId);
      if (res?.ok) {
        setProgramSourceId(socketId);
        showFeedback(`Cut to: ${cameraSlots.find((s) => s.socketId === socketId)?.name || socketId}`, true);
      } else {
        showFeedback(res?.error || "Switch failed", false);
      }
    } catch (e) {
      showFeedback("IPC error: " + e.message, false);
    }
  }, [isDesktopController, cameraSlots]);

  // ── Grant control to phone ───────────────────────────────────────────────────
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

  // ── Reclaim control ──────────────────────────────────────────────────────────
  const handleReclaimControl = async () => {
    try {
      const res = await window.electron?.Switcher?.reclaimControl?.();
      if (res?.ok) {
        setControllerSocketId("desktop");
        showFeedback("Control reclaimed by desktop", true);
      } else {
        showFeedback(res?.error || "Reclaim failed", false);
      }
    } catch (e) {
      showFeedback("IPC error: " + e.message, false);
    }
  };

  // ── Destination routing ──────────────────────────────────────────────────────
  const handleRouteToggle = async (destination) => {
    if (!isDesktopController) {
      showFeedback("Desktop does not hold controller permission", false);
      return;
    }
    const current = destination === "general" ? routeGeneral : routeSpeaker;
    const next = !current;
    try {
      const res = await window.electron?.Switcher?.routeDestination?.(destination, next);
      if (res?.ok) {
        if (destination === "general") setRouteGeneral(next);
        else setRouteSpeaker(next);
        showFeedback(`${destination === "general" ? "General View" : "Speaker View"} → ${next ? "LIVE" : "off"}`, true);
      } else {
        showFeedback(res?.error || "Route failed", false);
      }
    } catch (e) {
      showFeedback("IPC error: " + e.message, false);
    }
  };

  // ── Derived ──────────────────────────────────────────────────────────────────
  const programSource = cameraSlots.find((s) => s.socketId === programSourceId);
  const controllerName =
    controllerSocketId === "desktop"
      ? "Desktop"
      : pairedDevices.find((d) => d.id === controllerSocketId)?.name ||
        cameraSlots.find((s) => s.socketId === controllerSocketId)?.name ||
        controllerSocketId;

  // Build a 6-slot grid (fill empty slots with null)
  const grid = Array.from({ length: TOTAL_SLOTS }, (_, i) => {
    const slot = i + 1;
    return cameraSlots.find((s) => s.slotIndex === slot) || null;
  });

  return (
    <div className="w-full h-full flex flex-col overflow-hidden gap-4 font-outfit">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[12px] bg-red-500/15 border border-red-500/30 flex items-center justify-center">
            <PiVideoCamera size={18} className="text-red-400" />
          </div>
          <div>
            <h1 className="text-base font-black text-white tracking-tight">Live Switcher</h1>
            <p className="text-[10px] text-white/40 font-medium">Phase A · Hard-cut multi-camera</p>
          </div>
        </div>

        {/* Feedback pill */}
        {feedback && (
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-semibold transition-all ${
              feedback.ok
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                : "bg-red-500/15 border-red-500/30 text-red-400"
            }`}
          >
            {feedback.ok ? <PiCheckCircle size={13} /> : <PiWarning size={13} />}
            {feedback.text}
          </div>
        )}
      </div>

      {/* ── Main layout: left = grid, right = program + controls ─────────── */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">

        {/* ── Left column: 8-tile multiview grid ─────────────────────────── */}
        <div className="flex flex-col gap-3 w-[55%] min-w-0 overflow-y-auto">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 shrink-0">Multiview Grid</p>

          {/* 3×3 grid (6 cameras + 2 monitor tiles) */}
          <div className="grid grid-cols-3 gap-2 shrink-0">
            {grid.map((slotInfo, i) => (
              <SwitcherCameraTile
                key={`cam-slot-${i + 1}`}
                slotIndex={i + 1}
                slotInfo={slotInfo}
                stream={cameraStreams.get(slotInfo?.socketId)}
                isProgram={slotInfo?.socketId === programSourceId}
                canSwitch={isDesktopController}
                onSelect={handleCameraSelect}
              />
            ))}

            {/* Monitor tiles — genuine pixel mirrors via capturePage */}
            <SwitcherMonitorTile
              type="general"
              label="GENERAL VIEW"
              isRouted={routeGeneral}
              programSourceId={programSourceId}
              programSourceName={programSource?.name}
            />
            <SwitcherMonitorTile
              type="speaker"
              label="SPEAKER VIEW"
              isRouted={routeSpeaker}
              programSourceId={programSourceId}
              programSourceName={programSource?.name}
            />
          </div>

          {/* Camera count badge */}
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[10px] font-bold px-2 py-1 rounded-[12px] border ${
              cameraSlots.length >= 6
                ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                : "bg-white/5 border-white/10 text-white/40"
            }`}>
              {cameraSlots.length} / 6 cameras connected
            </span>
            <span className="text-[9px] text-white/25">Max 6 sources per session</span>
          </div>
        </div>

        {/* ── Right column: program + controls ─────────────────────────────── */}
        <div className="flex flex-col gap-4 flex-1 min-w-0 overflow-y-auto">

          {/* Program preview */}
          <div className="shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">Program Output</p>
            <SwitcherProgramCanvas
              programSourceId={programSourceId}
              programSourceName={programSource?.name}
              stream={cameraStreams.get(programSourceId)}
            />
          </div>

          {/* Destination routing */}
          <div className="bg-white/[0.04] border border-white/10 rounded-[12px] p-4 flex flex-col gap-3 shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 flex items-center gap-1.5">
              <PiBroadcast size={12} />
              Route to Display
            </p>
            <div className="flex flex-col gap-2">
              {[
                { dest: "general", label: "General View", icon: PiMonitor, active: routeGeneral, color: "sky" },
                { dest: "speaker", label: "Speaker View", icon: PiUsersThree, active: routeSpeaker, color: "violet" },
              ].map(({ dest, label, icon: Icon, active, color }) => (
                <button
                  key={dest}
                  onClick={() => handleRouteToggle(dest)}
                  disabled={!isDesktopController || !programSourceId}
                  title={!programSourceId ? "Select a program source first" : !isDesktopController ? "Desktop does not hold controller permission" : undefined}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-[12px] border transition-all duration-150 text-sm font-semibold
                    ${active
                      ? color === "sky"
                        ? "bg-sky-500/20 border-sky-500/40 text-sky-300 shadow-[0_0_12px_rgba(14,165,233,0.2)]"
                        : "bg-violet-500/20 border-violet-500/40 text-violet-300 shadow-[0_0_12px_rgba(139,92,246,0.2)]"
                      : "bg-white/[0.03] border-white/10 text-white/50 hover:bg-white/[0.06] hover:text-white/70"
                    }
                    disabled:opacity-40 disabled:cursor-not-allowed
                  `}
                >
                  <span className="flex items-center gap-2">
                    <Icon size={15} />
                    {label}
                  </span>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${
                    active
                      ? color === "sky"
                        ? "bg-sky-500/30 border-sky-500/40 text-sky-200"
                        : "bg-violet-500/30 border-violet-500/40 text-violet-200"
                      : "bg-white/5 border-white/10 text-white/30"
                  }`}>
                    {active ? "LIVE" : "OFF"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Controller permission panel */}
          <div className="bg-white/[0.04] border border-white/10 rounded-[12px] p-4 flex flex-col gap-3 shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 flex items-center gap-1.5">
              <PiLockKey size={12} />
              Switcher Controller
            </p>

            {/* Current controller indicator */}
            <div className={`flex items-center gap-2.5 px-3 py-2 rounded-[12px] border text-sm ${
              isDesktopController
                ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                : "bg-amber-500/10 border-amber-500/25 text-amber-300"
            }`}>
              {isDesktopController ? <PiTelevision size={14} /> : <PiUser size={14} />}
              <span className="font-semibold text-[11px]">
                {isDesktopController ? "Desktop (this machine)" : controllerName}
              </span>
              <span className="ml-auto text-[9px] font-black px-2 py-0.5 rounded-full bg-current/20 border border-current/30 opacity-80">
                {isDesktopController ? "LOCAL" : "REMOTE"}
              </span>
            </div>

            {/* Grant control */}
            {isDesktopController && pairedDevices.filter((d) => d.paired).length > 0 && (
              <div className="flex gap-2">
                <select
                  value={grantTarget}
                  onChange={(e) => setGrantTarget(e.target.value)}
                  className="flex-1 bg-white/5 border border-white/10 rounded-[12px] px-3 py-2 text-xs text-white/70 focus:outline-none focus:border-white/25 min-w-0"
                >
                  <option value="">Grant control to a phone…</option>
                  {pairedDevices.filter((d) => d.paired).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name || d.id}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleGrantControl}
                  disabled={!grantTarget}
                  className="shrink-0 px-3 py-2 rounded-[12px] bg-white/10 border border-white/15 text-xs font-semibold text-white/70 hover:bg-white/15 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Grant
                </button>
              </div>
            )}

            {/* Reclaim button — always available */}
            {!isDesktopController && (
              <button
                onClick={handleReclaimControl}
                className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-[12px] bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-500/25 transition-all"
              >
                <PiArrowCounterClockwise size={14} />
                Reclaim Control (Desktop)
              </button>
            )}

            <p className="text-[9px] text-white/25 leading-relaxed">
              Controller permission is separate from device admin roles.
              Only the current controller can cut cameras or toggle destinations.
              Desktop can reclaim at any time.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
