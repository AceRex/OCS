import React, { useState } from "react";
import { useDispatch } from "react-redux";
import { utilAction } from "../../Redux/state";

export default function SetTimePage() {
  let dispatch = useDispatch();
  const [hours, setHours] = useState<number | string>(0);
  const [minutes, setMinutes] = useState<number | string>(0);
  const [label, setLabel] = useState("");
  const [inCharge, setInCharge] = useState("");
  const [eventTime, setEventTime] = useState("");

  const handleEventStart = () => {
    if (!eventTime) return;
    const now = new Date();
    const [hours, minutes] = eventTime.split(":").map(Number);
    const eventDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);

    if (eventDate < now) {
      // If time has passed today, assume it's for tomorrow
      eventDate.setDate(eventDate.getDate() + 1);
    }

    const diffInSeconds = Math.floor((eventDate.getTime() - now.getTime()) / 1000);
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
      })
    );
    setHours(0);
    setMinutes(0);
    setLabel("");
    setInCharge("");
  };
  return (
    <div className="w-[40%] bg-ash/20 rounded-2xl space-y-4 p-4 text-light">
      <div className="w-full m-auto flex flex-row items-center justify-center bg-primary border border-light/30 rounded-2xl p-4">
        <div className="w-[50%] flex flex-col justify-center items-center rounded-2xl bg-ash/20 p-2">
          <input
            name="HH"
            type="number"
            min="0"
            value={hours}
            onClick={() => setHours("")}
            onChange={(e) => setHours(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder="HH"
            className="w-full h-[100%] bg-primary/0 text-center font-semibold text-8xl text-light focus:outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <p className="font-extrabold text-ash">HOURS</p>
        </div>
        <span className="text-8xl text-light font-semibold pb-4">:</span>
        <div className="w-[50%] flex flex-col justify-center items-center rounded-lg bg-ash/20 p-2">
          <input
            type="number"
            min="0"
            max="59"
            value={minutes}
            onClick={() => setMinutes("")}
            onChange={(e) => setMinutes(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder="MM"
            className="w-full h-[100%] bg-primary/0 text-center font-semibold text-8xl text-light focus:outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <p className="font-extrabold text-ash">MINUTES</p>

        </div>
      </div>
      <div className="w-full m-auto flex flex-col gap-6">
        <div className="flex flex-row gap-3 items-center">
          <label className="font-normal text-lg w-[15%]">Label: </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="bg-primary p-3 border border-light/30 rounded-lg w-[85%]"
            placeholder="Enter text here..."
          />
        </div>
        <div className="flex flex-row gap-3 items-center">
          <label className="font-normal text-lg w-[15%]">Anchor: </label>
          <input
            type="text"
            value={inCharge}
            onChange={(e) => setInCharge(e.target.value)}
            className="bg-primary p-3 border border-light/30 rounded-lg w-[85%]"
            placeholder="Enter text here..."
          />
        </div>
      </div>
      <div className="w-full m-auto flex flex-row gap-4 place-content-center">
        <button
          onClick={handleClose}
          className="p-2 bg-ash hover:bg-opacity-90 rounded-lg w-[50%]"
        >
          Quick Start
        </button>
        <button
          onClick={handleClick}
          className="p-2 bg-green hover:bg-opacity-90 text-primary rounded-lg w-[50%]"
        >
          Add to list
        </button>
      </div>

      <div className="w-full pt-4 border-t border-light/10 mt-4">
        <p className="text-center text-sm font-semibold mb-3 text-light/70 uppercase tracking-wider">Event Starts At</p>
        <div className="flex flex-row gap-4 items-center">
          <input
            type="time"
            value={eventTime}
            onChange={(e) => setEventTime(e.target.value)}
            className="p-3 bg-primary border border-light/30 rounded-lg text-xl text-center flex-1 text-light color-scheme-dark"
            style={{ colorScheme: "dark" }}
          />
          <button
            onClick={handleEventStart}
            className="p-3 bg-blue-500 hover:bg-blue-600 text-light font-bold rounded-lg w-[40%]"
          >
            Start Event
          </button>
        </div>
      </div>
    </div>
  );
}
