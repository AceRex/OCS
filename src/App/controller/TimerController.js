import React, { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import SetTimePage from "./SetTimePage.tsx";
import { utilAction } from "../../Redux/state.jsx";
import {
  PiEmpty,
  PiPlus,
  PiPencil,
  PiPause,
  PiStop,
  PiPlay,
  PiTrash,
  PiCheck,
  PiGear,
  PiClock,
  PiX,
  PiCalendarCheck,
  PiLockKey,
} from "react-icons/pi";
import { Button, DisabledContainer, Input } from "../../../components";
import { useAuth } from "../context/AuthContext";
import AgendaPlannerModal from "./AgendaPlannerModal.jsx";

export default function TimerController() {
  const { hasPermission } = useAuth();
  const canChangeView = hasPermission("timer.change_view");
  const canUseInterval = hasPermission("timer.interval");
  const canUseStartTime = hasPermission("timer.start_time");
  const canAccessSessions = hasPermission("session.recording");
  const hasOnlyBasicTimer =
    hasPermission("timer.basic") &&
    !canUseInterval &&
    !canChangeView &&
    !canUseStartTime;

  const time = useSelector((state) => state.util.time);
  const agenda = useSelector((state) => state.util.agenda);
  const isEventMode = useSelector((state) => state.util.isEventMode);
  const isPaused = useSelector((state) => state.util.isPaused);
  const activeId = useSelector((state) => state.util.activeId);
  const theme = useSelector((state) => state.util.theme);
  const nextStartInterval = useSelector(
    (state) => state.util.nextStartInterval,
  );
  const isDelayRunning = useSelector((state) => state.util.isDelayRunning);
  const delayCountdown = useSelector((state) => state.util.delayCountdown);
  const pendingNextItem = useSelector((state) => state.util.nextItemToStart);
  const [countdown, setCountDown] = useState(time);
  const [bgChange, setBgChange] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPlannerOpen, setIsPlannerOpen] = useState(false);
  const [plannerConfig, setPlannerConfig] = useState({});
  const [showSubscriptionNotice, setShowSubscriptionNotice] = useState(false);

  // Edit states
  const [editLabel, setEditLabel] = useState("");
  const [editAnchor, setEditAnchor] = useState("");
  const [editTimeMinutes, setEditTimeMinutes] = useState("");

  const timer = useRef(null);
  const delayTimer = useRef(null);
  const delayCountRef = useRef(0); // tracks live countdown inside the interval (no stale closure)

  const dispatch = useDispatch();

  const formatTime = (timeToFormat) => {
    const totalSeconds = Number(timeToFormat);
    if (isNaN(totalSeconds) || !isFinite(totalSeconds)) {
      return "Set Timer";
    }

    let hr = Math.floor(totalSeconds / 3600);
    let min = Math.floor((totalSeconds % 3600) / 60);
    let sec = Math.floor(totalSeconds % 60);

    if (hr < 10) {
      hr = "0" + hr;
    }
    if (min < 10) {
      min = "0" + min;
    }
    if (sec < 10) {
      sec = "0" + sec;
    }
    return `${hr}:${min}:${sec}`;
  };

  const prevTime = useRef(time);
  const prevActiveId = useRef(activeId);

  useEffect(() => {
    let timeToSend = countdown;

    // Check if it's a "New Start" (Time or ID changed)
    if (time !== prevTime.current || activeId !== prevActiveId.current) {
      timeToSend = time;
      prevTime.current = time;
      prevActiveId.current = activeId;
    } else {
      // It's a localized update (Theme, Pause) -> keep current progress
      timeToSend = countdown;
    }

    electron.Timer.setTimer({ time: timeToSend, isEventMode, isPaused, theme });
  }, [time, isEventMode, isPaused, theme, countdown, activeId]);

  // Listener for Mobile Actions
  useEffect(() => {
    if (window.electron && window.electron.Network) {
      const removeListener = window.electron.Network.onMobileAction(
        (action) => {
          console.log("Timer action:", action);
          if (action.type === "set-timer") {
            dispatch(utilAction.setEventMode(false));
            dispatch(utilAction.setTime(Number(action.payload.time) || 0));
            dispatch(utilAction.setPaused(false));
            dispatch(utilAction.setActiveId(null));
          } else if (action.type === "stop-timer") {
            dispatch(utilAction.setTime(0));
            dispatch(utilAction.setPaused(false));
            dispatch(utilAction.setActiveId(null));
          } else if (action.type === "toggle-pause") {
            // Handled locally usually?
          } else if (action.type === "set-paused") {
            dispatch(utilAction.setPaused(action.payload.paused));
          } else if (action.type === "add-agenda") {
            dispatch(utilAction.setAgenda(action.payload));
          } else if (action.type === "delete-agenda") {
            dispatch(utilAction.delAgenda(action.payload));
          } else if (action.type === "edit-agenda") {
            dispatch(utilAction.editAgenda(action.payload));
          }
        },
      );
      return () => removeListener();
    }
  }, [dispatch]);

  useEffect(() => {
    setCountDown(time);
    if (time > 0) {
      setTimeUp(false);
    }
  }, [time, activeId]);

  useEffect(() => {
    if (timer.current) {
      clearInterval(timer.current);
    }

    if (!isPaused && time > 0) {
      timer.current = setInterval(() => {
        setCountDown((prevCountdown) => {
          if (prevCountdown <= 1) {
            clearInterval(timer.current);
            setTimeUp(true);

            // ── AUTO-BLACKOUT on time up ──
            try {
              window.electron?.Presentation?.setContent(null);
            } catch (_) {}

            const currentIndex = agenda?.findIndex((a) => a._id === activeId);
            const item = currentIndex > -1 ? agenda[currentIndex] : null;

            window.electron?.Session?.emitTimerLifecycle?.({
              type: "timer:completed",
              timerId: activeId,
              elapsedSec: Number(time) || 0,
              title: item?.agenda || "Session",
              speakerName:
                (item?.anchor && String(item.anchor).trim()) || undefined,
            });

            if (!canAccessSessions) {
              setShowSubscriptionNotice(true);
            }

            const nextItem =
              currentIndex > -1 ? agenda[currentIndex + 1] : null;

            if (nextItem) {
              const nextTime = Number(nextItem.time) || 0;
              if (nextStartInterval > 0) {
                // Schedule next item with a delay
                dispatch(utilAction.setNextItemToStart(nextItem));
                dispatch(utilAction.setDelayCountdown(nextStartInterval));
                dispatch(utilAction.setIsDelayRunning(true));
              } else {
                // Auto-start immediately
                setCountDown(nextTime);
                setTimeUp(false);
                dispatch(utilAction.setEventMode(false));
                dispatch(utilAction.setTime(nextTime));
                dispatch(utilAction.setActiveId(nextItem._id));
                dispatch(utilAction.setPaused(false));

                window.electron?.Session?.emitTimerLifecycle?.({
                  type: "timer:started",
                  timerId: nextItem._id,
                  title: nextItem.agenda || nextItem.anchor || "Session",
                  durationSec: nextTime,
                  category: nextItem.agenda || "",
                  speakerName:
                    (nextItem.anchor && String(nextItem.anchor).trim()) ||
                    "Speaker",
                });
              }
            } else {
              // All items completed — end timer session
              dispatch(utilAction.setTime(0));
              dispatch(utilAction.setActiveId(null));
              dispatch(utilAction.setPaused(false));
            }

            return 0;
          }
          return prevCountdown - 1;
        });
      }, 1000);
    }

    return () => clearInterval(timer.current);
  }, [time, isPaused, activeId, agenda, dispatch, nextStartInterval]);

  // Delay countdown ticker
  useEffect(() => {
    if (delayTimer.current) {
      clearInterval(delayTimer.current);
      delayTimer.current = null;
    }

    if (!isDelayRunning || !pendingNextItem) return;

    delayCountRef.current = delayCountdown;

    delayTimer.current = setInterval(() => {
      delayCountRef.current -= 1;
      dispatch(utilAction.setDelayCountdown(delayCountRef.current));

      if (delayCountRef.current <= 0) {
        clearInterval(delayTimer.current);
        delayTimer.current = null;

        const nextTime = Number(pendingNextItem.time) || 0;

        setCountDown(nextTime);
        setTimeUp(false);

        dispatch(utilAction.setIsDelayRunning(false));
        dispatch(utilAction.setEventMode(false));
        dispatch(utilAction.setTime(nextTime));
        dispatch(utilAction.setActiveId(pendingNextItem._id));
        dispatch(utilAction.setPaused(false));
        dispatch(utilAction.setNextItemToStart(null));
        window.electron?.Session?.emitTimerLifecycle?.({
          type: "timer:started",
          timerId: pendingNextItem._id,
          title: pendingNextItem.agenda || pendingNextItem.anchor || "Session",
          durationSec: nextTime,
          category: pendingNextItem.agenda || "",
          speakerName:
            (pendingNextItem.anchor && String(pendingNextItem.anchor).trim()) ||
            "Speaker",
        });
      }
    }, 1000);

    return () => {
      if (delayTimer.current) {
        clearInterval(delayTimer.current);
        delayTimer.current = null;
      }
    };
  }, [isDelayRunning, pendingNextItem, dispatch]);

  useEffect(() => {
    if (countdown <= 10 && countdown > 0) {
      setBgChange(true);
    } else {
      setBgChange(false);
    }
  }, [countdown]);

  const handleStart = (item, customPlanConfig) => {
    dispatch(utilAction.setEventMode(false));
    dispatch(utilAction.setTime(Number(item.time) || 0));
    dispatch(utilAction.setActiveId(item._id));
    dispatch(utilAction.setPaused(false));
    setActiveMenuId(null);

    const activeConf = (customPlanConfig || plannerConfig)[item._id];
    const shouldRecordAudio = canAccessSessions ? (activeConf?.recordAudio !== false) : false;

    // Trigger Start Media Cue (if specified)
    if (activeConf?.startMedia === "color" && activeConf?.startValue) {
      try {
        window.electron?.Presentation?.setStyles?.({ backgroundColor: activeConf.startValue });
      } catch (_) {}
    }

    window.electron?.Session?.emitTimerLifecycle?.({
      type: "timer:started",
      timerId: item._id,
      title: item.agenda || item.anchor || "Session",
      durationSec: Number(item.time) || 0,
      category: item.agenda || "",
      speakerName: (item.anchor && String(item.anchor).trim()) || "Speaker",
      recordAudio: shouldRecordAudio,
    });
  };

  const handleDeleteFromList = (id) => {
    dispatch(utilAction.delAgenda({ id }));
  };

  const handlePause = () => {
    const next = !isPaused;
    dispatch(utilAction.setPaused(next));
    window.electron?.Session?.emitTimerLifecycle?.({
      type: next ? "timer:paused" : "timer:resumed",
      timerId: activeId,
      elapsedSec:
        Number(countdown) >= 0 && time > 0
          ? Math.max(0, Number(time) - Number(countdown))
          : 0,
    });
  };

  const handleStop = () => {
    const elapsed =
      time > 0 && countdown >= 0
        ? Math.max(0, Number(time) - Number(countdown))
        : Number(time) || 0;
    window.electron?.Session?.emitTimerLifecycle?.({
      type: "timer:stopped",
      timerId: activeId,
      elapsedSec: elapsed,
      title: agenda?.find?.((a) => a._id === activeId)?.agenda,
    });
    dispatch(utilAction.setTime(0));
    dispatch(utilAction.setPaused(false));
    dispatch(utilAction.setActiveId(null));
  };

  const handleAddTime = (id, currentAmount, amount = 60) => {
    const isActive = activeId === id;
    const baseAmount = isActive ? countdown : currentAmount;
    const newTime = Math.max(0, Number(baseAmount || 0) + amount);
    dispatch(utilAction.editAgenda({ _id: id, time: newTime }));
    if (isActive) {
      dispatch(utilAction.setTime(newTime));
    }
  };

  const handleEditStart = (item) => {
    setEditingId(item._id);
    setEditLabel(item.agenda || "");
    setEditAnchor(item.anchor || "");
    setEditTimeMinutes("");
    setActiveMenuId(null);
  };

  const handleEditAdd = (item) => {
    const enteredSec = (Number(editTimeMinutes) || 0) * 60;
    const newTime = Math.max(0, (Number(item.time) || 0) + enteredSec);

    dispatch(
      utilAction.editAgenda({
        _id: item._id,
        agenda: editLabel,
        anchor: editAnchor,
        time: newTime,
      }),
    );

    if (activeId === item._id) {
      const newCountdown = Math.max(0, (Number(countdown) || 0) + enteredSec);
      setCountDown(newCountdown);
      dispatch(utilAction.setTime(newTime));
    }

    setEditingId(null);
    setEditTimeMinutes("");
  };

  const handleEditUpdate = (item) => {
    const enteredSec = (Number(editTimeMinutes) || 0) * 60;
    const newTime =
      editTimeMinutes !== "" ? Math.max(0, enteredSec) : Number(item.time) || 0;

    dispatch(
      utilAction.editAgenda({
        _id: item._id,
        agenda: editLabel,
        anchor: editAnchor,
        time: newTime,
      }),
    );

    if (activeId === item._id) {
      setCountDown(newTime);
      dispatch(utilAction.setTime(newTime));
    }

    setEditingId(null);
    setEditTimeMinutes("");
  };

  const handleThemeChange = (newTheme) => {
    dispatch(utilAction.setTheme(newTheme));
  };

  return (
    <section className="w-full h-full flex flex-row gap-4 relative">
      <div className="absolute top-2 right-2 z-50 flex items-center gap-2">
        {canAccessSessions && (
          <button
            onClick={() => setIsPlannerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-500 rounded-xl text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-purple-950/40 transition-all cursor-pointer"
            title="Open Agenda Planner"
          >
            <PiCalendarCheck size={16} />
            <span>Agenda Planner</span>
          </button>
        )}

        {canChangeView && (
          <button
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className="p-2.5 bg-ash/40 hover:bg-ash/60 rounded-xl text-light transition-all cursor-pointer"
            title="Display Settings"
          >
            <PiGear size={20} />
          </button>
        )}
      </div>

      {canChangeView && isSettingsOpen && (
        <div className="absolute top-12 right-2 w-[300px] bg-primary border border-light/20 rounded-2xl shadow-2xl p-4 z-50 flex flex-col gap-4">
          <h3 className="text-light font-bold text-lg">Display Settings</h3>
          <div className="grid grid-cols-2 gap-2">
            {["default", "digital", "minimal", "pill"].map((t) => (
              <button
                key={t}
                onClick={() => handleThemeChange(t)}
                className={`p-3 rounded-lg text-sm capitalize ${theme === t ? "bg-green text-primary font-bold" : "bg-ash/20 text-light hover:bg-ash/40"}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      <SetTimePage />
      <div className="w-[70%] bg-primary/50 flex flex-col h-full rounded-2xl p-4 gap-4 overflow-hidden">
        {/* Timer Display */}
        <div
          className={`shrink-0 ${
            timeUp
              ? "bg-red text-light"
              : bgChange
              ? "bg-red text-light"
              : "bg-green text-primary"
          } p-8 rounded-lg w-full text-center relative`}
        >
          <p className="capitalize">current timer preview</p>
          <p className={"text-6xl w-[90%] m-auto font-extrabold"}>
            {timeUp && countdown === 0 ? "00:00:00" : formatTime(countdown)}
          </p>

          {time > 0 && (
            <div className="absolute bottom-4 right-4 flex gap-2">
              <button
                onClick={handlePause}
                className="p-2 bg-primary/20 rounded-full hover:bg-primary/40 text-light"
              >
                {isPaused ? <PiPlay /> : <PiPause />}
              </button>
              <button
                onClick={handleStop}
                className="p-2 bg-primary/20 rounded-full hover:bg-primary/40 text-light"
              >
                <PiStop />
              </button>
            </div>
          )}
        </div>

        {/* Session List */}
        <div className="w-full bg-primary/70 flex flex-col gap-3 p-4 flex-1 min-h-0 overflow-y-auto rounded-2xl">
          {agenda?.length === 0 ? (
            <div className="font-normal flex flex-col h-full items-center justify-center gap-2 p-2 text-center rounded-md text-ash/60">
              <PiEmpty size={40} />
              <p className="text-xl">Session not added yet</p>
            </div>
          ) : (
            agenda?.map((item) => {
              const { _id, time: itemTime, agenda, anchor } = item;
              const isActive = activeId === _id;
              const isMenuOpen = activeMenuId === _id;
              const isEditing = editingId === _id;

              return (
                <React.Fragment key={_id}>
                  <div
                    className={`shrink-0 relative rounded-lg overflow-hidden p-[2px] transition-all ${
                      isActive
                        ? "shadow-[0_0_15px_rgba(10,239,118,0.2)]"
                        : "border border-light/20"
                    }`}
                  >
                    {isActive && (
                      <div className="absolute inset-[-500%] animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#0000_0%,#0AEF76_50%,#0000_100%)]" />
                    )}
                    <li
                      className="font-bold text-light flex flex-col gap-2 p-4 justify-between list-none bg-[#646464] rounded-[6px] relative z-10 w-full"
                      onClick={() =>
                        !isEditing && setActiveMenuId(isMenuOpen ? null : _id)
                      }
                    >
                      {!isEditing ? (
                        <div className="flex flex-row justify-between items-center w-full">
                          <div className="flex flex-col gap-1 w-[60%]">
                            <p className="font-bold capitalize text-sm">
                              {agenda}
                            </p>
                            <p className="font-light capitalize text-start text-sm truncate">
                              {anchor}
                            </p>
                          </div>
                          <p className="font-extrabold text-2xl ">
                            {formatTime(itemTime)}
                          </p>
                        </div>
                      ) : (
                        <div
                          className="flex flex-col gap-2 w-full"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Input
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            className="bg-primary p-1 rounded text-sm text-light"
                            placeholder="Label"
                          />
                          <Input
                            value={editAnchor}
                            onChange={(e) => setEditAnchor(e.target.value)}
                            className="bg-primary p-1 rounded text-sm text-light"
                            placeholder="Speaker / Anchor"
                          />
                          <Input
                            value={editTimeMinutes}
                            onChange={(e) => setEditTimeMinutes(e.target.value)}
                            type="number"
                            min="0"
                            className="bg-primary p-1 rounded text-sm text-light"
                            placeholder="Time (minutes)..."
                          />
                          <div className="flex justify-end items-center gap-2 mt-2">
                            <Button
                              onClick={() => handleEditAdd(item)}
                              variant="secondary"
                              title="Add entered minutes to existing timer"
                            >
                              <p>Add</p>
                              <PiPlus size={12} />
                            </Button>
                            <Button
                              onClick={() => handleEditUpdate(item)}
                              variant="primary"
                              title="Override timer with entered minutes"
                            >
                              <p>Update</p>
                              <PiCheck size={12} />
                            </Button>
                            <Button
                              onClick={() => setEditingId(null)}
                              variant="secondary"
                            >
                              <p>Cancel</p>
                              <PiX size={12} />
                            </Button>
                          </div>
                        </div>
                      )}

                      {isMenuOpen && !isEditing && (
                        <div
                          className="flex flex-row gap-4 mt-2 justify-end items-center bg-primary p-2 rounded-lg"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {!isPaused && !isActive && (
                            <Button
                              variant="secondary"
                              onClick={() => handleStart(item)}
                            >
                              <p>start</p>
                              <PiPlay size={12} />
                            </Button>
                          )}
                          {isActive && (
                            <Button variant="secondary" onClick={handlePause}>
                              <p> {isPaused ? "Resume" : "Pause"}</p>
                              {isPaused ? (
                                <PiPlay size={12} />
                              ) : (
                                <PiPause size={12} />
                              )}
                            </Button>
                          )}
                          <Button
                            variant="secondary"
                            onClick={() => handleAddTime(_id, itemTime)}
                          >
                            <p>add 1 minute</p>
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => handleEditStart(item)}
                            disabled={hasOnlyBasicTimer}
                            title={
                              hasOnlyBasicTimer
                                ? "Your current plan does not support editing timers"
                                : undefined
                            }
                          >
                            <p>Edit timer</p>
                            <PiPencil size={12} />
                          </Button>
                          {isActive && (
                            <Button variant="secondary" onClick={handleStop}>
                              <p>stop</p>
                              <PiStop size={12} />
                            </Button>
                          )}
                          <Button
                            variant="delete"
                            onClick={() => handleDeleteFromList(_id)}
                            disabled={isActive || isPaused}
                          >
                            <p>Delete</p>
                            <PiTrash size={12} />
                          </Button>
                        </div>
                      )}
                    </li>
                  </div>
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>

      <AgendaPlannerModal
        isOpen={isPlannerOpen}
        onClose={() => setIsPlannerOpen(false)}
        agenda={agenda}
        onApplyPlan={(config) => {
          setPlannerConfig(config);
        }}
        onStartWithPlan={(config, startItem) => {
          setPlannerConfig(config);
          const target = startItem || (agenda && agenda[0]);
          if (target) {
            handleStart(target, config);
          }
        }}
      />

      {/* Subscription Tier 1 Recording Notice Modal */}
      {showSubscriptionNotice && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md bg-[#161224] border border-[#2E2542] rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center space-y-4 text-white">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-950/40">
              <PiLockKey size={28} />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-black uppercase tracking-wider text-white">
                Audio Recording Skipped
              </h3>
              <p className="text-xs text-white/70 leading-relaxed">
                Recording did not happen because your current subscription does not cover this feature. Subscribe to a Tier 2 plan (Standard, Large, or Premium) to unlock automated session audio recording and archiving.
              </p>
            </div>
            <div className="w-full pt-2">
              <button
                type="button"
                onClick={() => setShowSubscriptionNotice(false)}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-purple-950/50 transition-all cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
