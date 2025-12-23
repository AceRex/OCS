import React, { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import SetTimePage from "./SetTimePage.tsx";
import { utilAction } from "../../Redux/state.jsx";
import { PiEmpty, PiPlus, PiPencil, PiPause, PiStop, PiPlay, PiTrash, PiCheck, PiGear, PiClock } from "react-icons/pi";

export default function TimerController() {
    const time = useSelector((state) => state.util.time);
    const agenda = useSelector((state) => state.util.agenda);
    const isEventMode = useSelector((state) => state.util.isEventMode);
    const isPaused = useSelector((state) => state.util.isPaused);
    const activeId = useSelector((state) => state.util.activeId);
    const theme = useSelector((state) => state.util.theme);
    const [countdown, setCountDown] = useState(time);
    const [bgChange, setBgChange] = useState(false);
    const [timeUp, setTimeUp] = useState(false);
    const [activeMenuId, setActiveMenuId] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    // Edit states
    const [editLabel, setEditLabel] = useState("");
    const [editAnchor, setEditAnchor] = useState("");
    const [editTime, setEditTime] = useState(0);

    const timer = useRef(null);

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
            const removeListener = window.electron.Network.onMobileAction((action) => {
                console.log("Timer action:", action);
                if (action.type === 'set-timer') {
                    dispatch(utilAction.setEventMode(false));
                    dispatch(utilAction.setTime(Number(action.payload.time) || 0));
                    dispatch(utilAction.setPaused(false));
                    dispatch(utilAction.setActiveId(null));
                }
                else if (action.type === 'stop-timer') {
                    dispatch(utilAction.setTime(0));
                    dispatch(utilAction.setPaused(false));
                    dispatch(utilAction.setActiveId(null));
                }
                else if (action.type === 'toggle-pause') {
                    // Handled locally usually?
                }
                else if (action.type === 'set-paused') {
                    dispatch(utilAction.setPaused(action.payload.paused));
                }
                else if (action.type === 'add-agenda') {
                    dispatch(utilAction.setAgenda(action.payload));
                }
                else if (action.type === 'delete-agenda') {
                    dispatch(utilAction.delAgenda(action.payload));
                }
                else if (action.type === 'edit-agenda') {
                    dispatch(utilAction.editAgenda(action.payload));
                }
            });
            return () => removeListener();
        }
    }, [dispatch]); // Empty dep array for listener? No, dispatch is stable.

    useEffect(() => {
        setCountDown(time);
    }, [time]);

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
                        return 0;
                    }
                    return prevCountdown - 1;
                });
            }, 1000);
        }

        return () => clearInterval(timer.current);
    }, [time, isPaused]);

    useEffect(() => {
        if (countdown <= 10 && countdown > 0) {
            setBgChange(true);
        } else {
            setBgChange(false);
        }
    }, [countdown]);

    const handleStart = (item) => {
        dispatch(utilAction.setEventMode(false));
        dispatch(utilAction.setTime(Number(item.time) || 0));
        dispatch(utilAction.setActiveId(item._id));
        dispatch(utilAction.setPaused(false));
        setActiveMenuId(null);
    };

    const handleDeleteFromList = (id) => {
        dispatch(utilAction.delAgenda({ id }));
    };

    const handlePause = () => {
        dispatch(utilAction.setPaused(!isPaused));
    };

    const handleStop = () => {
        dispatch(utilAction.setTime(0));
        dispatch(utilAction.setPaused(false));
        dispatch(utilAction.setActiveId(null));
    };

    const handleAddTime = (id, currentAmount) => {
        const addAmount = 60;
        dispatch(utilAction.editAgenda({ _id: id, time: Number(currentAmount || 0) + addAmount })); // Add 1 minute to the list item

        if (activeId === id) {
            // If it's the active timer, add 1 minute to the running countdown
            dispatch(utilAction.setTime(Number(countdown || 0) + addAmount));
        }
    };

    const handleEditStart = (item) => {
        setEditingId(item._id);
        setEditLabel(item.agenda);
        setEditAnchor(item.anchor);
        setEditTime(item.time);
        setActiveMenuId(null);
    };

    const handleEditSave = (id) => {
        dispatch(utilAction.editAgenda({ _id: id, agenda: editLabel, anchor: editAnchor, time: editTime }));
        setEditingId(null);
    };

    const handleThemeChange = (newTheme) => {
        dispatch(utilAction.setTheme(newTheme));
    };

    return (
        <section className="w-full h-full flex flex-row gap-4 relative">

            <div className="absolute top-2 right-2 z-50">
                <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="p-3 bg-ash/40 hover:bg-ash/60 rounded-full text-light transition-all">
                    <PiGear size={24} />
                </button>
            </div>

            {isSettingsOpen && (
                <div className="absolute top-12 right-2 w-[300px] bg-primary border border-light/20 rounded-2xl shadow-2xl p-4 z-50 flex flex-col gap-4">
                    <h3 className="text-light font-bold text-lg">Display Settings</h3>
                    <div className="grid grid-cols-2 gap-2">
                        {['default', 'digital', 'minimal', 'pill'].map((t) => (
                            <button
                                key={t}
                                onClick={() => handleThemeChange(t)}
                                className={`p-3 rounded-lg text-sm capitalize ${theme === t ? 'bg-green text-primary font-bold' : 'bg-ash/20 text-light hover:bg-ash/40'}`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <SetTimePage />
            <div className="w-[60%] bg-ash/20 rounded-2xl p-4 space-y-4">
                <div
                    className={`${bgChange ? "bg-red text-light" : "bg-green text-primary"
                        }  p-10 rounded-lg w-[100%] text-center relative`}
                >
                    <p className="capitalize">current timer preview</p>
                    <p className={"text-6xl w-[90%] m-auto font-extrabold"}>
                        {timeUp && countdown === 0 ? "00:00:00" : formatTime(countdown)}
                    </p>
                    {time > 0 && <div className="absolute bottom-4 right-4 flex gap-2">
                        <button onClick={handlePause} className="p-2 bg-primary/20 rounded-full hover:bg-primary/40 text-light">
                            {isPaused ? <PiPlay /> : <PiPause />}
                        </button>
                        <button onClick={handleStop} className="p-2 bg-primary/20 rounded-full hover:bg-primary/40 text-light">
                            <PiStop />
                        </button>
                    </div>}

                </div>
                <div
                    className={`m-auto flex flex-col gap-4 p-4 h-[78%] overflow-y-scroll rounded-2xl bg-primary`}
                >

                    {agenda?.length === 0 ? <div className="font-normal flex flex-col h-full items-center justify-center gap-2 p-2 text-center rounded-md text-ash/60"><PiEmpty size={40} /> <p className="text-xl">No timers added yet</p></div> : agenda?.map((item) => {
                        const { _id, time: itemTime, agenda, anchor } = item;
                        const isActive = activeId === _id;
                        const isMenuOpen = activeMenuId === _id;
                        const isEditing = editingId === _id;

                        return (
                            <React.Fragment key={_id}>
                                <div
                                    className={`relative rounded-lg ${isActive ? "p-2 overflow-hidden" : ""}`}
                                >
                                    {isActive && (
                                        <div className="absolute inset-[-500%] animate-[spin_5s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#0000_0%,#0AEF76_50%,#0000_100%)]" />
                                    )}
                                    <li
                                        className={`font-bold text-light flex flex-col gap-2 p-4 justify-between list-none bg-ash border rounded-lg relative z-10 ${isActive ? "border-transparent" : "border-light/30"
                                            }`}
                                        onClick={() => !isEditing && setActiveMenuId(isMenuOpen ? null : _id)}
                                    >
                                        {!isEditing ? (
                                            <div className="flex flex-row justify-between items-center w-full">
                                                <div className="flex flex-col gap-1 w-[60%]">
                                                    <p className="font-bold capitalize text-sm">{agenda}</p>
                                                    <p className="font-light capitalize text-start text-sm truncate">{anchor}</p>
                                                </div>
                                                <p className="font-extrabold text-2xl ">{formatTime(itemTime)}</p>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-2 w-full" onClick={(e) => e.stopPropagation()}>
                                                <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="bg-primary p-1 rounded text-sm text-light" placeholder="Label" />
                                                <input value={editAnchor} onChange={(e) => setEditAnchor(e.target.value)} className="bg-primary p-1 rounded text-sm text-light" placeholder="Anchor" />
                                                <div className="flex justify-end gap-2 mt-2">
                                                    <button onClick={() => handleEditSave(_id)} className="p-1 bg-green-500 rounded"><PiCheck /></button>
                                                    <button onClick={() => setEditingId(null)} className="p-1 bg-red-500 rounded">X</button>
                                                </div>
                                            </div>
                                        )}

                                        {isMenuOpen && !isEditing && (
                                            <div className="flex flex-row gap-4 mt-2 justify-end items-center bg-primary/50 p-2 rounded-lg" onClick={(e) => e.stopPropagation()}>
                                                <button className="flex flex-col items-center gap-1 text-[10px]" onClick={() => handleStart(item)}>
                                                    <div className="p-2 bg-green-500 rounded-full"><PiPlay size={16} /></div>
                                                    Start
                                                </button>
                                                <button className="flex flex-col items-center gap-1 text-[10px]" onClick={() => handleAddTime(_id, itemTime)}>
                                                    <div className="p-2 bg-blue-500 rounded-full"><PiPlus size={16} /></div>
                                                    +1m
                                                </button>
                                                <button className="flex flex-col items-center gap-1 text-[10px]" onClick={() => handleEditStart(item)}>
                                                    <div className="p-2 bg-yellow-500 rounded-full"><PiPencil size={16} /></div>
                                                    Edit
                                                </button>
                                                {isActive && (
                                                    <>
                                                        <button className="flex flex-col items-center gap-1 text-[10px]" onClick={handlePause}>
                                                            <div className="p-2 bg-orange-500 rounded-full">{isPaused ? <PiPlay size={16} /> : <PiPause size={16} />}</div>
                                                            {isPaused ? "Resume" : "Pause"}
                                                        </button>
                                                        <button className="flex flex-col items-center gap-1 text-[10px]" onClick={handleStop}>
                                                            <div className="p-2 bg-red-500 rounded-full"><PiStop size={16} /></div>
                                                            Stop
                                                        </button>
                                                    </>
                                                )}
                                                <button className="flex flex-col items-center gap-1 text-[10px]" onClick={() => handleDeleteFromList(_id)}>
                                                    <div className="p-2 bg-gray-500 rounded-full"><PiTrash size={16} /></div>
                                                    Delete
                                                </button>
                                            </div>
                                        )}
                                    </li>
                                </div>
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
