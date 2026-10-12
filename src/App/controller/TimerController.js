import React, { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import SetTimePage from "./SetTimePage.tsx";
import { buildTimerAgenda } from "./timerAgenda";
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

const electron = (typeof window !== "undefined" && window.electron) || {};

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

  const timerRevision = useSelector((state) => state.util.timerRevision);
  const time = useSelector((state) => state.util.time);
  const agenda = useSelector((state) => state.util.agenda);
  const loadedAgenda = useSelector((state) => state.util?.loadedAgenda);
  const isEventMode = useSelector((state) => state.util.isEventMode);
  const isPaused = useSelector((state) => state.util.isPaused);
  const isRunning = useSelector((state) => state.util.isRunning);
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

  const dispatch = useDispatch();

  const formatTime = (timeToFormat) => {
    if (isNaN(timeToFormat)) return "00:00:00";
    let hr = Math.floor(timeToFormat / 3600);
    let min = Math.floor((timeToFormat % 3600) / 60);
    let sec = Math.floor(timeToFormat % 60);

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

  const isAgendaDrivenRef = useRef(false);
  const stateRef = useRef({});
  stateRef.current = { time, countdown, isPaused, isRunning, activeId, agenda, loadedAgenda, nextStartInterval };
  const syncRevision = useRef(0);
  const previousInterval = useRef(nextStartInterval);
  const lastEngineSession = useRef(null);
  const awaitingNextSession = useRef(false);
  const localClock = useRef({ key: null, remainingMs: 0 });

  const applySync = (sync) => {
    syncRevision.current += 1;
    const active = sync?.isRunning === true || sync?.isPaused === true;
    const previous = lastEngineSession.current;
    const sessionId = sync?.sessionId ?? null;
    if (previous && (sync?.completed || sync?.isInterval || (active && sessionId !== previous.id) || (sync?.isPaused && sync?.remainingSec === 0))) {
      window.electron?.Session?.emitTimerLifecycle?.({ type: 'timer:completed', timerId: previous.id, elapsedSec: previous.duration, title: previous.title });
      lastEngineSession.current = null;
      awaitingNextSession.current = sync?.isInterval === true;
    }
    if (active && !sync?.isInterval && sync?.remainingSec > 0 && sessionId != null) {
      if (!lastEngineSession.current && (awaitingNextSession.current || (previous && sessionId !== previous.id))) {
        window.electron?.Session?.emitTimerLifecycle?.({ type: 'timer:started', timerId: sessionId, durationSec: sync.durationSec, title: sync.sessionTitle || 'Session' });
      }
      awaitingNextSession.current = false;
      lastEngineSession.current = { id: sessionId, duration: sync.durationSec, title: sync.sessionTitle || 'Session' };
    }
    if (!active) { lastEngineSession.current = null; awaitingNextSession.current = false; }
    isAgendaDrivenRef.current = active;
    if (!active) {
      dispatch(utilAction.clearTimer());
      setCountDown(0);
      setTimeUp(sync?.completed === true);
      return;
    }
    dispatch(utilAction.setIsRunning(true));
    dispatch(utilAction.setPaused(sync.isPaused === true));
    dispatch(utilAction.setEventMode(false));
    dispatch(utilAction.setTime(Number(sync.durationSec) || 0));
    dispatch(utilAction.setActiveId(sync.isInterval ? null : (sync.sessionId ?? stateRef.current.agenda?.[sync.sessionIndex]?._id ?? null)));
    dispatch(utilAction.setIsDelayRunning(sync.isInterval === true));
    dispatch(utilAction.setNextItemToStart(sync.isInterval ? stateRef.current.agenda?.[sync.sessionIndex + 1] || null : null));
    dispatch(utilAction.setDelayCountdown(sync.isInterval ? Math.ceil(sync.remainingSec || 0) : 0));
    setCountDown(Math.max(0, Math.ceil(sync.remainingSec || 0)));
    setTimeUp(false);
  };

  useEffect(() => {
    const revision = syncRevision.current;
    const unsub = window.electron?.Agenda?.onTimerSync?.(applySync);
    window.electron?.Agenda?.getExecutionState?.().then((state) => {
      if (syncRevision.current !== revision || !state) return;
      if (['running', 'interval', 'paused'].includes(state.status)) {
        const interval = state.isInterval;
        applySync({
          durationSec: interval ? state.intervalDurationSec : state.sessionDurationSec,
          remainingSec: interval ? state.intervalRemainingSec : state.sessionRemainingSec,
          sessionIndex: state.sessionIndex, sessionId: state.sessionId,
          isInterval: interval, isRunning: state.status !== 'paused', isPaused: state.status === 'paused',
        });
      }
    }).catch(() => {});
    return () => unsub?.();
  }, [dispatch]);

  // Only standalone timers use the renderer clock; agenda timers belong to the engine.
  useEffect(() => {
    if (!isAgendaDrivenRef.current) {
      setCountDown(time);
      if (time > 0) setTimeUp(false);
    }
  }, [time, activeId, timerRevision]);

  useEffect(() => {
    if (isAgendaDrivenRef.current || !isRunning || isPaused || time <= 0) return;
    const key = `${timerRevision}:${time}:${activeId}`;
    const remainingMs = localClock.current.key === key ? localClock.current.remainingMs : time * 1000;
    const deadline = performance.now() + remainingMs;
    localClock.current = { key, remainingMs };
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
      setCountDown(remaining);
      if (remaining === 0) {
        clearInterval(timer.current);
        timer.current = null;
        dispatch(utilAction.clearTimer());
        setTimeUp(true);
        window.electron?.Session?.emitTimerLifecycle?.({ type: 'timer:completed', elapsedSec: time, title: 'Timer' });
      }
    };
    timer.current = setInterval(tick, 100);
    return () => {
      localClock.current.remainingMs = Math.max(0, deadline - performance.now());
      clearInterval(timer.current);
      timer.current = null;
    };
  }, [time, activeId, timerRevision, isRunning, isPaused, dispatch]);

  useEffect(() => {
    setBgChange(countdown > 0 && countdown <= 10);
    window.electron?.Timer?.setTimer?.({
      time: isRunning ? countdown : null,
      isRunning, isEventMode, isPaused, theme, fromAgenda: isAgendaDrivenRef.current,
      activeId, duration: time, countdown: isRunning ? countdown : 0, agendaItems: agenda,
    });
  }, [countdown, isRunning, isEventMode, isPaused, theme, agenda]);

  useEffect(() => {
    const cancelInterval = previousInterval.current > 0 && nextStartInterval === 0;
    previousInterval.current = nextStartInterval;
    if (!isAgendaDrivenRef.current) return;
    window.electron?.Agenda?.controlExecution?.({
      command: 'update-live-schedule',
      payload: { agenda: buildTimerAgenda(agenda || [], loadedAgenda, nextStartInterval), cancelInterval },
    }).catch(() => {});
  }, [agenda, loadedAgenda, nextStartInterval]);

  const handleQuickStart = async (seconds, eventMode = false) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    // Wait for the old engine's stop sync before starting the independent clock.
    if (isAgendaDrivenRef.current) {
      const result = await window.electron?.Agenda?.controlExecution?.({ command: 'stop' }).catch(() => ({ ok: false }));
      if (!result?.ok) return;
    }
    isAgendaDrivenRef.current = false;
    setCountDown(Math.ceil(seconds));
    dispatch(utilAction.startTimer({ time: seconds, isEventMode: eventMode }));
    window.electron?.Session?.emitTimerLifecycle?.({ type: 'timer:started', durationSec: Math.ceil(seconds), title: 'Timer', recordAudio: false });
  };

  useEffect(() => {
    const handleAction = (action) => {
      const state = stateRef.current;
      if (action.type === 'set-timer') {
        const item = state.agenda?.find((a) => a._id === action.payload?.activeId);
        if (item) handleStart(item);
        else handleQuickStart(Number(action.payload?.time), action.payload?.isEventMode === true);
      } else if (action.type === 'stop-timer') handleStop();
      else if (action.type === 'toggle-pause') handlePause();
      else if (action.type === 'set-paused' && Boolean(action.payload?.paused) !== state.isPaused) handlePause();
      else if (action.type === 'add-agenda') dispatch(utilAction.setAgenda(action.payload));
      else if (action.type === 'delete-agenda' && action.payload?.id !== state.activeId) handleDeleteFromList(action.payload.id);
      else if (action.type === 'edit-agenda') {
        const item = state.agenda?.find((a) => a._id === action.payload?._id);
        if (item) updateTimerItem(item, action.payload, action.payload.mode || (action.payload.time !== undefined ? 'replace' : 'preserve'));
      }
    };
    const unsub = window.electron?.Network?.onMobileAction?.(handleAction);
    const onCommand = (event) => handleAction(event.detail);
    window.addEventListener?.('ocs-timer-command', onCommand);
    return () => {
      unsub?.();
      window.removeEventListener?.('ocs-timer-command', onCommand);
    };
  });

  const handleStart = async (item, customPlanConfig) => {
    if (!Number.isFinite(Number(item.time)) || Number(item.time) <= 0) return;
    const state = stateRef.current;
    const sessIdx = state.agenda.findIndex((a) => a._id === item._id);
    if (sessIdx < 0) return;
    if (lastEngineSession.current) {
      window.electron?.Session?.emitTimerLifecycle?.({ type: 'timer:stopped', timerId: lastEngineSession.current.id, elapsedSec: Math.max(0, state.time - state.countdown), title: lastEngineSession.current.title });
      lastEngineSession.current = null;
      awaitingNextSession.current = false;
    }
    isAgendaDrivenRef.current = true;
    clearInterval(timer.current);
    const result = await window.electron?.Agenda?.controlExecution?.({
      command: "start",
      payload: {
        sessionIndex: sessIdx,
        agenda: buildTimerAgenda(state.agenda, state.loadedAgenda, state.nextStartInterval),
      },
    }).catch(() => ({ ok: false }));
    if (!result?.ok) {
      isAgendaDrivenRef.current = false;
      dispatch(utilAction.clearTimer());
      setCountDown(0);
      return;
    }
    setActiveMenuId(null);

    const activeConf = (customPlanConfig || plannerConfig)[item._id];
    const shouldRecordAudio = canAccessSessions
      ? activeConf?.recordAudio !== false
      : false;

    // Trigger Start Media Cue (if specified)
    if (activeConf?.startMedia === "color" && activeConf?.startValue) {
      try {
        window.electron?.Presentation?.setStyles?.({
          backgroundColor: activeConf.startValue,
        });
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

    try {
      if (window.electron?.Recovery?.recordEvent) {
        window.electron.Recovery.recordEvent("TIMER_UPDATE", {
          durationSec: Number(item.time) || 0,
          remainingSec: Number(item.time) || 0,
          type: "countdown",
          isRunning: true,
          activeId: item._id,
          title: item.agenda || item.anchor || "Session",
        });
      }
    } catch (_) {}
  };

  const handleDeleteFromList = (id) => {
    if (id === stateRef.current.activeId) return;
    const items = stateRef.current.agenda.filter((a) => a._id !== id);
    dispatch(utilAction.delAgenda({ id }));
    if (isAgendaDrivenRef.current) window.electron?.Agenda?.controlExecution?.({
      command: 'update-live-schedule',
      payload: { agenda: buildTimerAgenda(items, stateRef.current.loadedAgenda, stateRef.current.nextStartInterval) },
    }).catch(() => {});
  };

  const handlePause = () => {
    if (!stateRef.current.isRunning) return;
    const next = !stateRef.current.isPaused;
    dispatch(utilAction.setPaused(next));
    dispatch(utilAction.setIsRunning(true));

    if (isAgendaDrivenRef.current) window.electron?.Agenda?.controlExecution?.({
      command: next ? "pause" : "resume",
    }).catch(() => {});

    window.electron?.Session?.emitTimerLifecycle?.({
      type: next ? "timer:paused" : "timer:resumed",
      timerId: activeId,
      elapsedSec:
        Number(countdown) >= 0 && time > 0
          ? Math.max(0, Number(time) - Number(countdown))
          : 0,
    });

    try {
      if (window.electron?.Recovery?.recordEvent) {
        window.electron.Recovery.recordEvent("TIMER_UPDATE", {
          durationSec: Number(time) || 0,
          remainingSec: Number(countdown) || 0,
          type: "countdown",
          isRunning: !next,
          activeId,
        });
      }
    } catch (_) {}
  };

  const handleStop = () => {
    const elapsed =
      time > 0 && countdown >= 0
        ? Math.max(0, Number(time) - Number(countdown))
        : Number(time) || 0;

    if (isAgendaDrivenRef.current) window.electron?.Agenda?.controlExecution?.({ command: "stop" }).catch(() => {});
    isAgendaDrivenRef.current = false;
    clearInterval(timer.current);
    setCountDown(0);
    setTimeUp(false);

    window.electron?.Session?.emitTimerLifecycle?.({
      type: "timer:stopped",
      timerId: activeId,
      elapsedSec: elapsed,
      title: agenda?.find?.((a) => a._id === activeId)?.agenda,
    });
    dispatch(utilAction.clearTimer());

    try {
      if (window.electron?.Recovery?.recordEvent) {
        window.electron.Recovery.recordEvent("TIMER_UPDATE", {
          durationSec: 0,
          remainingSec: 0,
          type: "countdown",
          isRunning: false,
          activeId: null,
        });
      }
    } catch (_) {}
  };

  const updateTimerItem = (item, updates, mode = 'preserve') => {
    const state = stateRef.current;
    const next = { ...item, ...updates };
    if (!Number.isFinite(Number(next.time)) || Number(next.time) <= 0) return;
    dispatch(utilAction.editAgenda(next));
    if (isAgendaDrivenRef.current) {
      const items = state.agenda.map((a) => a._id === item._id ? next : a);
      const payload = { agenda: buildTimerAgenda(items, state.loadedAgenda, state.nextStartInterval) };
      if (state.activeId === item._id && mode === 'replace') {
        payload.remainingSec = Number(next.time);
      }
      window.electron?.Agenda?.controlExecution?.({ command: 'update-live-schedule', payload }).catch(() => {});
    }
  };

  const handleAddTime = (id, currentAmount, amount = 60) => {
    const item = stateRef.current.agenda.find((a) => a._id === id);
    if (item) updateTimerItem(item, { time: Number(item.time) + amount }, 'add');
  };

  const handleEditStart = (item) => {
    setEditingId(item._id);
    setEditLabel(item.agenda || "");
    setEditAnchor(item.anchor || "");
    setEditTimeMinutes("");
    setActiveMenuId(null);
  };

  const handleEditAdd = (item) => {
    const added = Number(editTimeMinutes) * 60;
    if (!Number.isFinite(added) || added < 0) return;
    updateTimerItem(item, { agenda: editLabel, anchor: editAnchor, time: Number(item.time) + added }, 'add');
    setEditingId(null);
    setEditTimeMinutes('');
  };

  const handleEditUpdate = (item) => {
    const seconds = editTimeMinutes === '' ? Number(item.time) : Number(editTimeMinutes) * 60;
    updateTimerItem(item, { agenda: editLabel, anchor: editAnchor, time: seconds }, editTimeMinutes === '' ? 'preserve' : 'replace');
    setEditingId(null);
    setEditTimeMinutes('');
  };

  const handleThemeChange = (newTheme) => {
    dispatch(utilAction.setTheme(newTheme));
  };

  return (
    <section className="w-full h-full flex flex-row gap-4 relative">
      <div className="absolute top-2 right-2 z-50 flex items-center gap-2">
        {/* {canAccessSessions && (
          <button
            onClick={() => setIsPlannerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-500 rounded-xl text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-[#8B5CF6]/40 transition-all cursor-pointer"
            title="Open Agenda Planner"
          >
            <PiCalendarCheck size={16} />
            <span>Agenda Planner</span>
          </button>
        )} */}

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
        <div className="absolute top-12 right-2 w-[300px] bg-primary border border-light/20 rounded-[12px] shadow-2xl p-4 z-50 flex flex-col gap-4">
          <h3 className="text-light font-bold text-lg">Display Settings</h3>
          <div className="grid grid-cols-2 gap-2">
            {["default", "digital", "minimal", "pill"].map((t) => (
              <button
                key={t}
                onClick={() => handleThemeChange(t)}
                className={`p-3 rounded-[12px] text-sm capitalize ${theme === t ? "bg-green text-primary font-bold" : "bg-ash/20 text-light hover:bg-ash/40"}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      <SetTimePage onStart={handleQuickStart} />
      <div className="w-[70%] bg-primary/50 flex flex-col h-full rounded-[12px] p-4 gap-4 overflow-hidden">
        {/* Timer Display */}
        <div
          className={`shrink-0 ${
            timeUp
              ? "bg-red text-light"
              : bgChange
                ? "bg-red text-light"
                : "bg-green text-primary"
          } p-8 rounded-[12px] w-full text-center relative`}
        >
          <p className="capitalize">current timer preview</p>
          <p className={"text-6xl w-[90%] m-auto font-extrabold"}>
            {timeUp && countdown === 0 ? "00:00:00" : formatTime(countdown)}
          </p>

          {time > 0 && isRunning && (
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
        <div className="w-full bg-primary/70 flex flex-col gap-3 p-4 flex-1 min-h-0 overflow-y-auto rounded-[12px]">
          {agenda?.length === 0 ? (
            <div className="font-normal flex flex-col h-full items-center justify-center gap-2 p-2 text-center rounded-[12px] text-ash/60">
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
                    className={`shrink-0 relative rounded-[12px] overflow-hidden p-[2px] transition-all ${
                      isActive
                        ? "shadow-[0_0_15px_rgba(10,239,118,0.2)]"
                        : "border border-light/20"
                    }`}
                  >
                    {isActive && (
                      <div className="absolute inset-[-500%] animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#0000_0%,#0AEF76_50%,#0000_100%)]" />
                    )}
                    <li
                      className="font-bold text-light flex flex-col gap-2 p-4 justify-between list-none bg-[#646464] rounded-[12px] relative z-10 w-full"
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
                          className="flex flex-row gap-4 mt-2 justify-end items-center bg-primary p-2 rounded-[12px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {(!isRunning || !isActive) && (
                            <Button
                              variant="secondary"
                              onClick={() => handleStart(item)}
                            >
                              <p>start</p>
                              <PiPlay size={12} />
                            </Button>
                          )}
                          {isActive && isRunning && (
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
          <div className="w-full max-w-md bg-[#161224] border border-[#2E2542] rounded-[12px] p-6 shadow-2xl flex flex-col items-center text-center space-y-4 text-white">
            <div className="w-14 h-14 rounded-[12px] bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-950/40">
              <PiLockKey size={28} />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-black uppercase tracking-wider text-white">
                Audio Recording Skipped
              </h3>
              <p className="text-xs text-white/70 leading-relaxed">
                Recording did not happen because your current subscription does
                not cover this feature. Subscribe to a Tier 2 plan (Standard,
                Large, or Premium) to unlock automated session audio recording
                and archiving.
              </p>
            </div>
            <div className="w-full pt-2">
              <button
                type="button"
                onClick={() => setShowSubscriptionNotice(false)}
                className="w-full py-3 rounded-[12px] bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-[#8B5CF6]/50 transition-all cursor-pointer"
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
