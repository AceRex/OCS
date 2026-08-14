import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { utilAction } from "../../Redux/state";
import { Button, Input } from "../../../components";

export default function SetTimePage() {
  let dispatch = useDispatch();
  const [hours, setHours] = useState<number | string>(0);
  const [minutes, setMinutes] = useState<number | string>(0);
  const [isEditingHours, setIsEditingHours] = useState(false);
  const [isEditingMinutes, setIsEditingMinutes] = useState(false);
  const [label, setLabel] = useState("");
  const [inCharge, setInCharge] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [period, setPeriod] = useState<"AM" | "PM">("AM");

  const nextStartInterval = useSelector(
    (state: any) => state.util.nextStartInterval,
  );
  const [intervalInput, setIntervalInput] = useState(() => {
    if (nextStartInterval > 0) {
      const m = Math.floor(nextStartInterval / 60);
      const s = nextStartInterval % 60;
      return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return "";
  });

  const handleIntervalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/[^0-9:]/g, "");
    if (val.length === 2 && !val.includes(":") && intervalInput.length < 2) {
      val = val + ":";
    }
    if (val.length > 5) val = val.slice(0, 5);
    setIntervalInput(val);
  };

  const handleSetInterval = () => {
    if (!intervalInput) {
      dispatch(utilAction.setNextStartInterval(0));
      return;
    }
    let [m, s] = intervalInput.split(":").map(Number);
    if (isNaN(m)) m = 0;
    if (isNaN(s)) s = 0;
    const totalSeconds = m * 60 + s;
    dispatch(utilAction.setNextStartInterval(totalSeconds));
  };

  const handleClearInterval = () => {
    setIntervalInput("");
    dispatch(utilAction.setNextStartInterval(0));
    // Also cancel any in-progress delay so a running countdown doesn't fire
    dispatch(utilAction.setDelayCountdown(0));
    dispatch(utilAction.setIsDelayRunning(false));
    dispatch(utilAction.setNextItemToStart(null));
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/[^0-9:]/g, "");
    if (val.length === 2 && !val.includes(":") && eventTime.length < 2) {
      val = val + ":";
    }
    if (val.length > 5) val = val.slice(0, 5);
    setEventTime(val);
  };

  const handleEventStart = () => {
    if (!eventTime) return;
    const now = new Date();
    let [hours, minutes] = eventTime.split(":").map(Number);
    if (isNaN(hours)) hours = 0;
    if (isNaN(minutes)) minutes = 0;

    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;

    const eventDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hours,
      minutes,
      0,
    );

    if (eventDate < now) {
      // If time has passed today, assume it's for tomorrow
      eventDate.setDate(eventDate.getDate() + 1);
    }

    const diffInSeconds = Math.floor(
      (eventDate.getTime() - now.getTime()) / 1000,
    );
    dispatch(utilAction.setEventMode(true));
    dispatch(utilAction.setTime(diffInSeconds));
  };
  const handleClose = () => {
    const totalTimeInSeconds = Number(hours) * 3600 + Number(minutes) * 60;
    dispatch(utilAction.setEventMode(false));
    dispatch(utilAction.setTime(totalTimeInSeconds));
  };
  const handleClick = () => {
    const totalTimeInSeconds = Number(hours) * 3600 + Number(minutes) * 60;
    dispatch(
      utilAction.setAgenda({
        _id: Date.now(),
        time: totalTimeInSeconds,
        agenda: label,
        anchor: inCharge,
      }),
    );
    setHours(0);
    setMinutes(0);
    setIsEditingHours(false);
    setIsEditingMinutes(false);
    setLabel("");
    setInCharge("");
  };
  return (
    <div className="max-w-[30%] min-w-[30%] rounded-2xl space-y-4 text-light">
      <div className="bg-primary/70 p-4 rounded-[50px] space-y-8">
        <div className="w-full max-h-[200px] min-h-0 bg-primary rounded-[35px] flex items-center justify-center">
          {isEditingHours ? (
            <input
              name="HH"
              type="number"
              min="0"
              autoFocus
              value={hours}
              onChange={(e) =>
                setHours(e.target.value === "" ? "" : Number(e.target.value))
              }
              onBlur={() => {
                setIsEditingHours(false);
                if (hours === "") setHours(0);
              }}
              placeholder="HH"
              className="w-[45%] text-right pr-2 bg-primary/0 font-semibold text-7xl text-light focus:outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          ) : (
            <p
              onClick={() => {
                setIsEditingHours(true);
                if (hours === 0) setHours("");
              }}
              className="w-[45%] text-right pr-2 font-semibold text-7xl text-light/70 hover:text-light cursor-pointer select-none flex items-center justify-end"
            >
              {hours !== "" && Number(hours) > 0
                ? String(hours).padStart(2, "0")
                : "HH"}
            </p>
          )}

          <span className="text-8xl text-light font-semibold pb-4 select-none">
            :
          </span>

          {isEditingMinutes ? (
            <input
              type="number"
              min="0"
              max="59"
              autoFocus
              value={minutes}
              onChange={(e) =>
                setMinutes(e.target.value === "" ? "" : Number(e.target.value))
              }
              onBlur={() => {
                setIsEditingMinutes(false);
                if (minutes === "") setMinutes(0);
              }}
              placeholder="MM"
              className="w-[45%] bg-primary/0 text-left pl-2 font-semibold text-7xl text-light focus:outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          ) : (
            <p
              onClick={() => {
                setIsEditingMinutes(true);
                if (minutes === 0) setMinutes("");
              }}
              className="w-[45%] text-left pl-2 font-semibold text-7xl text-light/70 hover:text-light cursor-pointer select-none flex items-center justify-start"
            >
              {minutes !== "" && Number(minutes) > 0
                ? String(minutes).padStart(2, "0")
                : "MM"}
            </p>
          )}
        </div>
        <div className="w-full m-auto flex flex-col gap-4">
          <div className="flex flex-col gap-2 items-start">
            <label className="font-normal text-xs w-full">Session Label</label>
            <Input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Enter text here..."
            />
          </div>
          <div className="flex flex-col gap-2 items-start">
            <label className="font-normal text-xs w-full">Speaker</label>
            <Input
              type="text"
              value={inCharge}
              onChange={(e) => setInCharge(e.target.value)}
              placeholder="Speaker name..."
            />
          </div>
        </div>
        <div className="w-full m-auto flex flex-row gap-4 place-content-center pb-4">
          <Button variant="secondary" onClick={handleClose} className="w-[50%]">
            Quick Start
          </Button>
          <Button variant="success" onClick={handleClick} className="w-[50%]">
            Add to list
          </Button>
        </div>
      </div>

      <div className="w-full py-8 border-y border-light/10 mt-4">
        <p className="text-center text-sm font-semibold mb-3 text-light/70 uppercase tracking-wider">
          Set event start time
        </p>
        <div className="flex flex-col gap-4 justify-center items-center">
          <div className="flex flex-row justify-center items-center w-1/2 mx-auto bg-transparent">
            <input
              type="text"
              value={eventTime}
              onChange={handleTimeChange}
              placeholder="00:00"
              maxLength={5}
              className="py-3 w-[110px] bg-transparent text-[35px] text-center text-light focus:outline-none placeholder:text-light/40 font-semibold"
            />
            <button
              type="button"
              onClick={() => setPeriod((p) => (p === "AM" ? "PM" : "AM"))}
              className="py-3 bg-transparent text-[35px] font-bold text-blue-500 transition-colors select-none"
            >
              {period}
            </button>
          </div>

          <Button
            variant="primary"
            onClick={handleEventStart}
            className="w-[50%]"
          >
            Start Event
          </Button>
        </div>
      </div>
      <div className="w-full border-light/10 mt-4 pt-4">
        <p className="text-center text-sm font-semibold mb-3 text-light/70 uppercase tracking-wider">
          agenda start interval
        </p>
        <div className="flex flex-col gap-4 justify-center items-center">
          <div className="flex flex-row justify-center items-center w-1/2 mx-auto bg-transparent">
            <input
              type="text"
              value={intervalInput}
              onChange={handleIntervalChange}
              placeholder="00:00"
              maxLength={5}
              className="py-3 w-[110px] bg-transparent text-[35px] text-center text-light focus:outline-none placeholder:text-light/40 font-semibold"
            />
          </div>
          <div className="flex items-center gap-2 w-full">
            <Button
              variant="secondary"
              disabled={intervalInput === ""}
              onClick={handleSetInterval}
              className="w-full"
            >
              Set
            </Button>
            <Button
              variant="secondary"
              disabled={nextStartInterval === 0}
              onClick={handleClearInterval}
              className="w-full"
            >
              Clear
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
