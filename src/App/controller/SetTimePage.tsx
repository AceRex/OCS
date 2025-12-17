import React, { useState } from "react";
import { useDispatch } from "react-redux";
import { utilAction } from "../../Redux/state";

export default function SetTimePage() {
  let dispatch = useDispatch();
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [label, setLabel] = useState("");
  const [inCharge, setInCharge] = useState("");

  const handleClose = () => {
    const totalTimeInSeconds = hours * 3600 + minutes * 60;
    dispatch(utilAction.setTime(totalTimeInSeconds));
  };
  const handleClick = () => {
    const totalTimeInSeconds = hours * 3600 + minutes * 60;
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
    <div className="w-[50%] bg-ash/20 rounded-2xl p-4 text-light">
      <div className="w-full m-auto mb-5 flex flex-row items-center justify-center bg-primary border border-light/30 rounded-2xl p-4">
        <div className="w-[50%] flex flex-col justify-center items-center rounded-2xl bg-ash/20 p-2">
          <input
            name="HH"
            type="number"
            min="0"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
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
            onChange={(e) => setMinutes(Number(e.target.value))}
            placeholder="MM"
            className="w-full h-[100%] bg-primary/0 text-center font-semibold text-8xl text-light focus:outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <p className="font-extrabold text-ash">MINUTES</p>

        </div>
      </div>
      <div className="w-[80%] m-auto mt-8 flex flex-col gap-6">
        <div className="flex flex-row gap-3 items-center">
          <label className="font-normal text-lg w-[15%]">Label: </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="bg-light/5 p-3 border border-light/30 rounded-lg w-[85%]"
            placeholder="Enter text here..."
          />
        </div>
        <div className="flex flex-row gap-3 items-center">
          <label className="font-normal text-lg w-[15%]">Anchor: </label>
          <input
            type="text"
            value={inCharge}
            onChange={(e) => setInCharge(e.target.value)}
            className="bg-light/5 p-3 border border-light/30 rounded-lg w-[85%]"
            placeholder="Enter text here..."
          />
        </div>
      </div>
      <div className="w-[100%] m-auto flex flex-row gap-4 place-content-center mt-8">
        <button
          onClick={handleClose}
          className="p-2 bg-ash hover:bg-opacity-90 rounded-lg w-[30%]"
        >
          Quick Start
        </button>
        <button
          onClick={handleClick}
          className="p-2 bg-green hover:bg-opacity-90 text-primary rounded-lg w-[30%]"
        >
          Add to list
        </button>
      </div>
    </div>
  );
}
