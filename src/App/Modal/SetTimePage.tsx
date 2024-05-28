import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Rootstate } from "../Redux/interface";
import { utilAction } from "../Redux/state";

export default function SetTimePage() {
  let dispatch = useDispatch();
  const [timer, setTimer] = useState("");
  const [label, setLabel] = useState("");
  const [inCharge, setInCharge] = useState("");
  const agenda = useSelector((state: Rootstate) => state.util.agenda);

  const handleTimeValue = (e: any) => {
    setTimer(e.target.value);
  };
  const handleClose = () => {
    dispatch(utilAction.setTimeState(false));
  };
  const handleClick = () => {
    dispatch(utilAction.setTime(timer));
    dispatch(
      utilAction.setAgenda({ time: timer, agenda: label, anchor: inCharge })
    );
    setTimer("");
    setLabel("");
    setInCharge("");
  };
  return (
    <div className="absolute min-w-[100vw] top-0 -left-28 min-h-[100vh] backdrop-blur-lg bg-primary/10">
      <div className="m-auto bg-primary w-[45%] my-24 p-12 px-24 text-light border border-light/30 rounded-lg">
        <div className="w-[70%] m-auto mb-5">
          {/* @ts-ignore */}
          <input
            type="time"
            value={timer}
            onChange={handleTimeValue}
            className="w-[100%] bg-primary/0 border border-light/30 text-center rounded-lg font-semibold p-4 text-8xl text-light"
          />
        </div>
        <div className="m-auto flex flex-col gap-4">
          {agenda?.map(({ time, agenda, anchor }, index) => (
            <li
              className="font-bold flex flex-row gap-3 p-5 items-center justify-between list-none bg-ash border border-light/30 rounded-lg"
              key={index}
            >
              <p className="font-bold text-sm">{agenda}</p>
              <p className="font-light text-start text-sm truncate">{anchor}</p>
              <p className="font-extrabold text-2xl ">{time}</p>
              <p className="font-black text-sm text-red ">X</p>
            </li>
          ))}
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
        <div className="w-[80%] m-auto flex flex-row gap-4 place-content-end mt-8">
          <button
            onClick={handleClose}
            className="p-2 bg-ash hover:bg-opacity-90 rounded-lg w-[30%]"
          >
            Close
          </button>
          <button
            onClick={handleClick}
            className="p-2 bg-green hover:bg-opacity-90 text-primary rounded-lg w-[30%]"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
