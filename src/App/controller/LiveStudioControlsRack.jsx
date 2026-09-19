import React, { useState, useEffect, useRef } from "react";
import {
  PiTelevision,
  PiClock,
  PiCheck,
  PiPencilSimple,
  PiTrash,
  PiPlay,
  PiStop,
  PiX,
  PiSlidersHorizontal,
  PiCalendar,
  PiHourglass,
  PiBroadcast,
  PiEyeSlash,
} from "react-icons/pi";
import ActionButton from "../components/feedback/ActionButton";

export default function LiveStudioControlsRack({ onOpenStudio, showFeedback }) {
  const [controls, setControls] = useState([]);
  const [activeStates, setActiveStates] = useState({}); // { [ctrlId]: { status: "hidden"|"delaying"|"entering"|"live"|"exiting", startTime, countdown, timerId, autoRemoveTimerId } }
  const [editingLabelId, setEditingLabelId] = useState(null);
  const [editingLabelText, setEditingLabelText] = useState("");
  const [timingModalCtrlId, setTimingModalCtrlId] = useState(null);

  const activeStatesRef = useRef(activeStates);
  activeStatesRef.current = activeStates;
  const controlsRef = useRef(controls);
  controlsRef.current = controls;
  const timersRef = useRef({});

  const clearControlTimers = (id) => {
    if (timersRef.current[id]) {
      if (timersRef.current[id].entranceTimeout) {
        clearTimeout(timersRef.current[id].entranceTimeout);
      }
      if (timersRef.current[id].exitTimeout) {
        clearTimeout(timersRef.current[id].exitTimeout);
      }
      delete timersRef.current[id];
    }
  };

  useEffect(() => {
    return () => {
      Object.keys(timersRef.current).forEach((id) => {
        clearControlTimers(id);
      });
    };
  }, []);

  // Load controls from storage
  useEffect(() => {
    let unmounted = false;
    async function load() {
      try {
        if (window.electron?.DesignStudio?.listLiveControls) {
          const res = await window.electron.DesignStudio.listLiveControls();
          if (!unmounted && res && Array.isArray(res.liveControls)) {
            setControls(res.liveControls);
          }
        }
      } catch (err) {
        console.error("[LiveStudioControlsRack] Load error:", err);
      }
    }
    load();

    let unsub = null;
    if (window.electron?.DesignStudio?.onLiveControlsChanged) {
      unsub = window.electron.DesignStudio.onLiveControlsChanged((updated) => {
        if (!unmounted && Array.isArray(updated)) {
          setControls(updated);
        }
      });
    }

    return () => {
      unmounted = true;
      if (typeof unsub === "function") unsub();
    };
  }, []);

  // Broadcast active overlays to main process whenever activeStates change
  const syncToBroadcast = (states, allControls) => {
    try {
      const activeList = [];
      for (const ctrl of allControls) {
        const st = states[ctrl.id];
        if (st && st.status !== "hidden") {
          const resolvedLayers = (Array.isArray(ctrl.snapshotLayers) && ctrl.snapshotLayers.length > 0)
            ? ctrl.snapshotLayers
            : (Array.isArray(ctrl.layers) ? ctrl.layers : []);
          activeList.push({
            id: ctrl.id,
            label: ctrl.label,
            snapshotLayers: resolvedLayers,
            transition: ctrl.transition || { entrance: { type: "fade", duration: 500 }, exit: { type: "fade", duration: 400 } },
            status: st.status,
            animStartTime: st.animStartTime || Date.now(),
          });
        }
      }
      if (window.electron?.DesignStudio?.setActiveControlsOverlays) {
        window.electron.DesignStudio.setActiveControlsOverlays(activeList);
      }
    } catch (e) {
      console.error("[LiveStudioControlsRack] Sync error:", e);
    }
  };

  // Schedule monitoring interval: check every second for armed schedules
  useEffect(() => {
    const schedInterval = setInterval(() => {
      const now = new Date();
      const currentDateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
      const currentHours = String(now.getHours()).padStart(2, "0");
      const currentMins = String(now.getMinutes()).padStart(2, "0");
      const currentTimeStr = `${currentHours}:${currentMins}`;

      controlsRef.current.forEach((ctrl) => {
        if (ctrl.timing?.scheduleArmed && ctrl.timing.scheduledTime) {
          const dateMatches = !ctrl.timing.scheduledDate || ctrl.timing.scheduledDate === currentDateStr;
          const timeMatches = ctrl.timing.scheduledTime === currentTimeStr;
          const currentStatus = activeStatesRef.current[ctrl.id]?.status || "hidden";

          if (dateMatches && timeMatches && currentStatus === "hidden") {
            // Trigger scheduled show!
            triggerShow(ctrl.id, true);
            // Disarm schedule so it doesn't fire multiple times in the same minute
            handleSaveTiming(ctrl.id, { ...ctrl.timing, scheduleArmed: false });
          }
        }
      });
    }, 1000);

    return () => clearInterval(schedInterval);
  }, []);

  // Countdown timer ticker for delaying and auto-removal
  useEffect(() => {
    const ticker = setInterval(() => {
      const current = { ...activeStatesRef.current };
      let changed = false;

      for (const id of Object.keys(current)) {
        const item = current[id];
        if (item.status === "delaying" && item.countdown > 0) {
          const nextCount = item.countdown - 1;
          if (nextCount <= 0) {
            // Delay expired -> start entrance transition
            const ctrl = controlsRef.current.find((c) => c.id === id);
            const entType = ctrl?.transition?.entrance?.type || "fade";
            const enterDuration = ctrl?.transition?.entrance?.duration || ctrl?.transition?.entrance?.durationMs || 500;
            const isCut = entType === "none" || entType === "cut";

            current[id] = {
              status: isCut ? "live" : "entering",
              animStartTime: Date.now(),
              countdown: 0,
            };
            changed = true;
            clearControlTimers(id);
            if (!isCut) {
              timersRef.current[id] = timersRef.current[id] || {};
              timersRef.current[id].entranceTimeout = setTimeout(() => {
                handleFinishEntrance(id);
              }, enterDuration);
            }
          } else {
            current[id] = { ...item, countdown: nextCount };
            changed = true;
          }
        } else if (item.status === "live" && typeof item.autoRemoveRemaining === "number" && item.autoRemoveRemaining > 0) {
          const nextRem = item.autoRemoveRemaining - 1;
          if (nextRem <= 0) {
            // Visible duration expired -> start exit transition
            triggerHide(id);
          } else {
            current[id] = { ...item, autoRemoveRemaining: nextRem };
            changed = true;
          }
        }
      }

      if (changed) {
        setActiveStates(current);
        syncToBroadcast(current, controlsRef.current);
      }
    }, 1000);

    return () => clearInterval(ticker);
  }, []);

  const handleFinishEntrance = (id) => {
    clearControlTimers(id);
    const ctrl = controlsRef.current.find((c) => c.id === id);
    if (!ctrl) return;
    const timing = ctrl?.timing || {};
    const autoRemoveSec = Number(timing.autoRemoveSeconds ?? timing.autoRemoveSec) || 0;

    setActiveStates((prev) => {
      if (prev[id]?.status !== "entering") return prev;
      const next = {
        ...prev,
        [id]: {
          status: "live",
          animStartTime: Date.now(),
          autoRemoveRemaining: autoRemoveSec > 0 ? autoRemoveSec : null,
        },
      };
      syncToBroadcast(next, controlsRef.current);
      return next;
    });
  };

  const triggerShow = (id, bypassDelay = false) => {
    const ctrl = controlsRef.current.find((c) => c.id === id);
    if (!ctrl) return;

    clearControlTimers(id);

    const timing = ctrl.timing || {};
    const delaySec = bypassDelay ? 0 : (Number(timing.delaySeconds ?? timing.delaySec) || 0);
    const entType = ctrl.transition?.entrance?.type || "fade";
    const enterDuration = ctrl.transition?.entrance?.duration || ctrl.transition?.entrance?.durationMs || 500;
    const isCut = entType === "none" || entType === "cut";

    if (delaySec > 0) {
      setActiveStates((prev) => {
        const next = {
          ...prev,
          [id]: {
            status: "delaying",
            countdown: delaySec,
            animStartTime: Date.now(),
          },
        };
        syncToBroadcast(next, controlsRef.current);
        return next;
      });
    } else {
      setActiveStates((prev) => {
        const next = {
          ...prev,
          [id]: {
            status: isCut ? "live" : "entering",
            countdown: 0,
            animStartTime: Date.now(),
          },
        };
        syncToBroadcast(next, controlsRef.current);
        return next;
      });

      if (!isCut) {
        timersRef.current[id] = timersRef.current[id] || {};
        timersRef.current[id].entranceTimeout = setTimeout(() => {
          handleFinishEntrance(id);
        }, enterDuration);
      }
    }
  };

  const triggerHide = (id) => {
    const ctrl = controlsRef.current.find((c) => c.id === id);
    if (!ctrl) return;

    clearControlTimers(id);
    const exitType = ctrl?.transition?.exit?.type || "fade";
    const exitDuration = ctrl?.transition?.exit?.duration || ctrl?.transition?.exit?.durationMs || 400;
    const isCut = exitType === "none" || exitType === "cut";

    if (isCut) {
      setActiveStates((prev) => {
        const next = {
          ...prev,
          [id]: { status: "hidden", countdown: 0, animStartTime: Date.now() },
        };
        syncToBroadcast(next, controlsRef.current);
        return next;
      });
      return;
    }

    setActiveStates((prev) => {
      const next = {
        ...prev,
        [id]: {
          status: "exiting",
          animStartTime: Date.now(),
          autoRemoveRemaining: null,
          countdown: 0,
        },
      };
      syncToBroadcast(next, controlsRef.current);
      return next;
    });

    timersRef.current[id] = timersRef.current[id] || {};
    timersRef.current[id].exitTimeout = setTimeout(() => {
      setActiveStates((prev) => {
        if (prev[id]?.status !== "exiting") return prev;
        const next = {
          ...prev,
          [id]: { status: "hidden", countdown: 0, animStartTime: Date.now() },
        };
        syncToBroadcast(next, controlsRef.current);
        return next;
      });
      clearControlTimers(id);
    }, exitDuration);
  };

  const toggleControl = (id) => {
    const current = activeStates[id]?.status || "hidden";
    if (current === "hidden") {
      triggerShow(id);
    } else {
      triggerHide(id);
    }
  };

  const handleHideAll = () => {
    const all = { ...activeStates };
    let anyActive = false;
    for (const id of Object.keys(all)) {
      if (all[id].status !== "hidden") {
        anyActive = true;
        triggerHide(id);
      }
    }
    if (anyActive && showFeedback) {
      showFeedback("Hiding all active studio overlays", "info");
    }
  };
  const hideAllActive = handleHideAll;

  const handleStartRename = (ctrl) => {
    setEditingLabelId(ctrl.id);
    setEditingLabelText(ctrl.label);
  };

  const handleSaveRename = async (id) => {
    const ctrl = controls.find((c) => c.id === id);
    if (ctrl && editingLabelText.trim()) {
      const updated = { ...ctrl, label: editingLabelText.trim() };
      await window.electron?.DesignStudio?.saveLiveControl(updated);
    }
    setEditingLabelId(null);
  };

  const handleDeleteControl = async (id) => {
    clearControlTimers(id);
    setActiveStates((prev) => {
      const next = { ...prev };
      delete next[id];
      syncToBroadcast(next, controlsRef.current.filter((c) => c.id !== id));
      return next;
    });
    await window.electron?.DesignStudio?.deleteLiveControl(id);
  };

  const handleSaveSettings = async (id, updatedTiming, updatedTransition) => {
    const ctrl = controls.find((c) => c.id === id);
    if (ctrl) {
      const updated = {
        ...ctrl,
        timing: updatedTiming || ctrl.timing,
        transition: updatedTransition || ctrl.transition,
      };
      await window.electron?.DesignStudio?.saveLiveControl(updated);
      setControls((prev) => prev.map((c) => (c.id === id ? updated : c)));
      controlsRef.current = controlsRef.current.map((c) => (c.id === id ? updated : c));
      syncToBroadcast(activeStatesRef.current, controlsRef.current);
      if (showFeedback) {
        showFeedback(
          updatedTiming?.scheduleArmed ? "Schedule armed! Keep OCS running." : "Control settings updated",
          "success"
        );
      }
    }
    setTimingModalCtrlId(null);
  };

  const activeCount = Object.values(activeStates).filter((s) => s.status && s.status !== "hidden").length;

  return (
    <div
      data-live-controls-rack="true"
      className="bg-white/[0.04] border border-white/10 rounded-[12px] p-3.5 flex flex-col gap-2.5 shrink-0 mt-1 select-none"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-[12px] bg-[#8B5CF6]/25 border border-[#8B5CF6]/40 flex items-center justify-center text-[#8B5CF6]/80">
            <PiTelevision size={14} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/70 flex items-center gap-1.5">
              STUDIO LIVE CONTROLS
              {activeCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-500/30 border border-rose-400/50 text-rose-300 text-[9px] font-bold animate-pulse">
                  {activeCount} Active
                </span>
              )}
            </p>
            <p className="text-[9px] text-white/40">
              One-click live program broadcast toggles
            </p>
          </div>
        </div>

        {/* Global actions: Hide All */}
        {activeCount > 0 && (
          <ActionButton
            onClick={handleHideAll}
            className="px-2.5 py-1 rounded-[12px] font-bold text-[10px] flex items-center gap-1 transition-all bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 border border-rose-500/40 shadow-sm"
          >
            <PiEyeSlash size={12} />
            <span>Hide All Active</span>
          </ActionButton>
        )}
      </div>

      {/* Control tiles grid */}
      {controls.length === 0 ? (
        <div className="p-4 border border-dashed border-white/10 rounded-[12px] text-center flex flex-col items-center justify-center gap-1 text-white/40">
          <p className="text-xs font-semibold">No Live Controls added</p>
          <p className="text-[10px] text-white/30 max-w-xs">
            In Live Design Studio, click "Add to Live Controls" on any design or layer group to publish a quick toggle tile here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-56 overflow-y-auto pr-1">
          {controls.map((ctrl) => {
            const st = activeStates[ctrl.id] || { status: "hidden", countdown: 0 };
            const isLive = st.status === "live";
            const isEntering = st.status === "entering";
            const isExiting = st.status === "exiting";
            const isDelaying = st.status === "delaying";
            const isArmed = ctrl.timing?.scheduleArmed && !isLive;

            let statusBadge = (
              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-white/10 text-white/50 border border-white/5">
                HIDDEN
              </span>
            );
            if (isLive) {
              statusBadge = (
                <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-rose-500 text-white animate-pulse shadow-sm flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                  LIVE ON AIR
                </span>
              );
            } else if (isEntering) {
              statusBadge = (
                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-amber-500/30 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                  ENTERING…
                </span>
              );
            } else if (isExiting) {
              statusBadge = (
                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-[#8B5CF6]/30 text-[#8B5CF6]/80 border border-[#8B5CF6]/40">
                  EXITING…
                </span>
              );
            } else if (isDelaying) {
              statusBadge = (
                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-sky-500/30 text-sky-300 border border-sky-500/40 flex items-center gap-1">
                  <PiClock size={10} />
                  SHOW IN {st.countdown}s
                </span>
              );
            }

            const entType = ctrl.transition?.entrance?.type || "fade";
            const entDur = ctrl.transition?.entrance?.duration || ctrl.transition?.entrance?.durationMs || 500;
            const transLabel = entType === "none" || entType === "cut" ? "Cut" : `${entType} (${entDur}ms)`;

            return (
              <div
                key={ctrl.id}
                data-control-tile-id={ctrl.id}
                className={`relative flex flex-col rounded-[12px] border transition-all duration-150 overflow-hidden ${
                  isLive
                    ? "bg-rose-950/40 border-rose-500/70 shadow-lg ring-1 ring-rose-500/50"
                    : isEntering || isExiting
                    ? "bg-amber-950/30 border-amber-500/50 ring-1 ring-amber-500/30"
                    : isDelaying
                    ? "bg-sky-950/30 border-sky-500/50"
                    : "bg-[#110f1c] hover:bg-[#161324] border-white/10"
                }`}
              >
                {/* Visual Thumbnail Area */}
                <div
                  onClick={() => toggleControl(ctrl.id)}
                  className="w-full aspect-video bg-[#07060c] relative overflow-hidden flex items-center justify-center cursor-pointer group select-none"
                >
                  {ctrl.thumbnailSvg ? (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      dangerouslySetInnerHTML={{ __html: ctrl.thumbnailSvg }}
                    />
                  ) : (
                    <div className="text-[10px] text-white/30 font-bold uppercase">
                      {ctrl.type || "Overlay"}
                    </div>
                  )}

                  {/* Hover play / stop overlay */}
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 text-white text-[10px] font-bold">
                    {isLive ? <PiEyeSlash size={14} /> : <PiPlay size={14} />}
                    <span>{isLive ? "Hide" : "Show"}</span>
                  </div>
                </div>

                {/* Info & Action Strip */}
                <div className="p-2 flex flex-col gap-1.5 bg-black/30 border-t border-white/5">
                  <div className="flex items-center justify-between gap-1">
                    {editingLabelId === ctrl.id ? (
                      <input
                        type="text"
                        value={editingLabelText}
                        onChange={(e) => setEditingLabelText(e.target.value)}
                        onBlur={() => handleSaveRename(ctrl.id)}
                        onKeyDown={(e) => e.key === "Enter" && handleSaveRename(ctrl.id)}
                        autoFocus
                        className="w-full bg-black/60 border border-[#8B5CF6] rounded px-1 text-[10px] text-white focus:outline-none"
                      />
                    ) : (
                      <div className="flex flex-col min-w-0 flex-1">
                        <span
                          onDoubleClick={() => handleStartRename(ctrl)}
                          className="text-[10px] font-bold text-white truncate hover:text-[#8B5CF6]/80 cursor-text"
                          title="Double-click to rename"
                        >
                          {ctrl.label}
                        </span>
                        <span className="text-[8px] font-mono text-white/40 truncate">
                          {transLabel}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => {
                          try {
                            if (Array.isArray(ctrl.snapshotLayers) && ctrl.snapshotLayers.length > 0) {
                              localStorage.setItem("ocs_live_studio_active_design", JSON.stringify({
                                id: `design_${ctrl.id}`,
                                name: ctrl.label,
                                layers: ctrl.snapshotLayers,
                                transition: ctrl.transition,
                              }));
                              localStorage.setItem("ocs_live_studio_layers", JSON.stringify(ctrl.snapshotLayers));
                            }
                          } catch (_) {}
                          if (typeof onOpenStudio === "function") onOpenStudio(ctrl);
                        }}
                        className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                        title="Edit snapshot in Live Design Studio"
                        aria-label="Edit in Studio"
                      >
                        <PiPencilSimple size={12} />
                      </button>

                      <button
                        onClick={() => setTimingModalCtrlId(ctrl.id)}
                        data-action="configure-timing"
                        className={`p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors ${
                          isArmed ? "text-sky-300" : ""
                        }`}
                        title="Configure Show/Hide Transitions & Automation"
                      >
                        <PiClock size={12} />
                      </button>

                      <button
                        onClick={() => handleDeleteControl(ctrl.id)}
                        className="p-1 rounded hover:bg-rose-500/20 text-white/30 hover:text-rose-400 transition-colors"
                        title="Delete Control"
                      >
                        <PiTrash size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Status badge & quick toggle */}
                  <div className="flex items-center justify-between">
                    {statusBadge}

                    <ActionButton
                      onClick={() => toggleControl(ctrl.id)}
                      className={`px-2 py-0.5 rounded-[12px] text-[9px] font-black transition-all ${
                        isLive
                          ? "bg-rose-600 text-white hover:bg-rose-500"
                          : "bg-emerald-600 text-white hover:bg-emerald-500"
                      }`}
                    >
                      {isLive ? "HIDE" : "SHOW"}
                    </ActionButton>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Control Settings Modal (Transitions + Timing + Schedule) ── */}
      {timingModalCtrlId && (
        <ControlSettingsModal
          control={controls.find((c) => c.id === timingModalCtrlId)}
          onClose={() => setTimingModalCtrlId(null)}
          onSave={(updatedTiming, updatedTransition) =>
            handleSaveSettings(timingModalCtrlId, updatedTiming, updatedTransition)
          }
        />
      )}
    </div>
  );
}

function ControlSettingsModal({ control, onClose, onSave }) {
  if (!control) return null;

  const [activeTab, setActiveTab] = useState("transition"); // "transition" | "timing"

  // Transition state
  const [entranceType, setEntranceType] = useState(control.transition?.entrance?.type || "fade");
  const [entranceDur, setEntranceDur] = useState(control.transition?.entrance?.duration || control.transition?.entrance?.durationMs || 500);
  const [exitType, setExitType] = useState(control.transition?.exit?.type || "fade");
  const [exitDur, setExitDur] = useState(control.transition?.exit?.duration || control.transition?.exit?.durationMs || 400);

  // Timing state
  const [delay, setDelay] = useState(control.timing?.delaySeconds || 0);
  const [autoRemove, setAutoRemove] = useState(control.timing?.autoRemoveSeconds || 0);
  const [schedDate, setSchedDate] = useState(control.timing?.scheduledDate || "");
  const [schedTime, setSchedTime] = useState(control.timing?.scheduledTime || "");
  const [armed, setArmed] = useState(Boolean(control.timing?.scheduleArmed));

  const handleSave = () => {
    const updatedTiming = {
      delaySeconds: Math.max(0, parseInt(delay, 10) || 0),
      autoRemoveSeconds: Math.max(0, parseInt(autoRemove, 10) || 0),
      scheduledDate: schedDate,
      scheduledTime: schedTime,
      scheduleArmed: armed,
    };

    const updatedTransition = {
      entrance: {
        type: entranceType,
        duration: Math.max(50, Math.min(5000, parseInt(entranceDur, 10) || 500)),
        durationMs: Math.max(50, Math.min(5000, parseInt(entranceDur, 10) || 500)),
        easing: "ease-out",
      },
      exit: {
        type: exitType,
        duration: Math.max(50, Math.min(5000, parseInt(exitDur, 10) || 400)),
        durationMs: Math.max(50, Math.min(5000, parseInt(exitDur, 10) || 400)),
        easing: "ease-in",
      },
    };

    onSave(updatedTiming, updatedTransition);
  };

  return (
    <div className="fixed inset-0 z-[999999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#12141a] border border-white/15 rounded-[12px] max-w-sm w-full p-4 shadow-2xl flex flex-col gap-3.5 text-white animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center gap-2">
            <PiClock size={16} className="text-[#8B5CF6]" />
            <h4 className="text-xs font-bold text-white truncate max-w-[240px]">
              Settings: {control.label}
            </h4>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white">
            <PiX size={14} />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="grid grid-cols-2 gap-1 bg-black/40 p-1 rounded-[12px] border border-white/10">
          <button
            type="button"
            onClick={() => setActiveTab("transition")}
            className={`py-1 rounded-[12px] text-xs font-bold transition-all ${
              activeTab === "transition" ? "bg-[#8B5CF6] text-white shadow" : "text-white/50 hover:text-white"
            }`}
          >
            Transitions
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("timing")}
            className={`py-1 rounded-[12px] text-xs font-bold transition-all ${
              activeTab === "timing" ? "bg-[#8B5CF6] text-white shadow" : "text-white/50 hover:text-white"
            }`}
          >
            Timing & Schedule
          </button>
        </div>

        {activeTab === "transition" ? (
          <div className="space-y-3">
            {/* Entrance Transition */}
            <div className="flex flex-col gap-1.5 p-2 rounded-[12px] bg-white/[0.02] border border-white/5">
              <label className="text-[10px] font-bold text-white/70">Entrance Animation</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[8px] text-white/40 block mb-0.5">Type</label>
                  <select
                    value={entranceType}
                    onChange={(e) => setEntranceType(e.target.value)}
                    className="w-full bg-black/60 border border-white/15 rounded-[12px] px-2 py-1 text-xs text-white focus:outline-none"
                  >
                    <option value="none">None (Cut)</option>
                    <option value="fade">Fade</option>
                    <option value="slide-fade-left">Slide + Fade Left</option>
                    <option value="slide-fade-right">Slide + Fade Right</option>
                    <option value="slide-fade-top">Slide + Fade Top</option>
                    <option value="slide-fade-bottom">Slide + Fade Bottom</option>
                    <option value="scale-fade">Scale + Fade</option>
                    <option value="slide-left">Full Slide Left</option>
                    <option value="slide-right">Full Slide Right</option>
                    <option value="slide-top">Full Slide Top</option>
                    <option value="slide-bottom">Full Slide Bottom</option>
                    <option value="wipe">Wipe Reveal</option>
                  </select>
                </div>
                <div>
                  <label className="text-[8px] text-white/40 block mb-0.5">Duration</label>
                  <div className="flex items-center bg-black/60 border border-white/15 rounded-[12px] px-2 py-1">
                    <input
                      type="number"
                      min="50"
                      max="3000"
                      step="50"
                      value={entranceDur}
                      onChange={(e) => setEntranceDur(e.target.value)}
                      className="w-full bg-transparent text-xs text-white focus:outline-none"
                    />
                    <span className="text-[9px] text-white/40">ms</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Exit Transition */}
            <div className="flex flex-col gap-1.5 p-2 rounded-[12px] bg-white/[0.02] border border-white/5">
              <label className="text-[10px] font-bold text-white/70">Exit Animation</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[8px] text-white/40 block mb-0.5">Type</label>
                  <select
                    value={exitType}
                    onChange={(e) => setExitType(e.target.value)}
                    className="w-full bg-black/60 border border-white/15 rounded-[12px] px-2 py-1 text-xs text-white focus:outline-none"
                  >
                    <option value="none">None (Cut)</option>
                    <option value="fade">Fade</option>
                    <option value="slide-fade-left">Slide + Fade Left</option>
                    <option value="slide-fade-right">Slide + Fade Right</option>
                    <option value="slide-fade-top">Slide + Fade Top</option>
                    <option value="slide-fade-bottom">Slide + Fade Bottom</option>
                    <option value="scale-fade">Scale + Fade</option>
                    <option value="slide-left">Full Slide Left</option>
                    <option value="slide-right">Full Slide Right</option>
                    <option value="slide-top">Full Slide Top</option>
                    <option value="slide-bottom">Full Slide Bottom</option>
                    <option value="wipe">Wipe Collapse</option>
                  </select>
                </div>
                <div>
                  <label className="text-[8px] text-white/40 block mb-0.5">Duration</label>
                  <div className="flex items-center bg-black/60 border border-white/15 rounded-[12px] px-2 py-1">
                    <input
                      type="number"
                      min="50"
                      max="3000"
                      step="50"
                      value={exitDur}
                      onChange={(e) => setExitDur(e.target.value)}
                      className="w-full bg-transparent text-xs text-white focus:outline-none"
                    />
                    <span className="text-[9px] text-white/40">ms</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Delay before show */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-white/70">Show Delay (seconds before entering)</label>
              <input
                type="number"
                min="0"
                max="300"
                value={delay}
                onChange={(e) => setDelay(e.target.value)}
                className="bg-black/50 border border-white/15 rounded-[12px] px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#8B5CF6]"
              />
              <span className="text-[9px] text-white/40">0 = Show immediately on click</span>
            </div>

            {/* Auto-remove visible duration */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-white/70">Auto-Remove Visible Duration (seconds on air)</label>
              <input
                type="number"
                min="0"
                max="3600"
                value={autoRemove}
                onChange={(e) => setAutoRemove(e.target.value)}
                className="bg-black/50 border border-white/15 rounded-[12px] px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#8B5CF6]"
              />
              <span className="text-[9px] text-white/40">0 = Disabled (stays live until manually hidden)</span>
            </div>

            {/* Scheduled Show */}
            <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
              <label className="text-[10px] font-bold text-white/70 flex items-center gap-1">
                <PiCalendar size={12} className="text-sky-400" />
                Scheduled Local Time (Optional)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={schedDate}
                  onChange={(e) => setSchedDate(e.target.value)}
                  className="bg-black/50 border border-white/15 rounded-[12px] px-2 py-1 text-xs text-white focus:outline-none"
                />
                <input
                  type="time"
                  value={schedTime}
                  onChange={(e) => setSchedTime(e.target.value)}
                  className="bg-black/50 border border-white/15 rounded-[12px] px-2 py-1 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between p-2 rounded-[12px] bg-white/[0.03] border border-white/10">
                <div>
                  <p className="text-[10px] font-bold text-white">Arm Local Schedule</p>
                  <p className="text-[8px] text-amber-300/80">OCS must remain running for schedule to execute</p>
                </div>
                <input
                  type="checkbox"
                  checked={armed}
                  onChange={(e) => setArmed(e.target.checked)}
                  className="w-4 h-4 rounded text-[#8B5CF6] focus:ring-0 cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        {/* Modal Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-[12px] bg-white/10 hover:bg-white/15 text-white/70 hover:text-white text-xs font-bold"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 rounded-[12px] bg-[#8B5CF6] hover:bg-[#8B5CF6]/90 text-white text-xs font-bold shadow-md"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
