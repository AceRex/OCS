import React, { useState } from "react";
import { useDispatch } from "react-redux";
import { utilAction } from "../../Redux/state";

export default function SetTimePage() {
  let dispatch = useDispatch();
  const [timer, setTimer] = useState(0);
  const [label, setLabel] = useState("");
  const [inCharge, setInCharge] = useState("");

  const handleTimeValue = (e: any) => {
    e.preventDefault();
    const inputValue = e.target.value;

    const [hours, minutes] = inputValue.split(":").map(Number);

    const totalTimeInSeconds = hours * 3600 + minutes * 60;

    setTimer(totalTimeInSeconds);
  };
  const handleClose = () => {
    dispatch(utilAction.setTime(timer));
  };
  const handleClick = () => {
    dispatch(
      utilAction.setAgenda({
        _id: Date.now(),
        time: timer,
        agenda: label,
        anchor: inCharge,
      })
    );
    setTimer(0);
    setLabel("");
    setInCharge("");
  };
  return (
    <div className="w-[50%] bg-ash/20 rounded-lg p-4 text-light">
      <div className="w-[70%] m-auto mb-5">
        {/* @ts-ignore */}
        <input
          type="time"
          onChange={handleTimeValue}
          className="w-[100%] bg-primary/0 border border-light/30 text-center rounded-lg font-semibold p-4 text-8xl text-light"
        />
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
          Start Timer
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
