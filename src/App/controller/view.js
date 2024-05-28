import React, { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { utilAction } from "../../Redux/state.jsx";
import SetTimePage from "./SetTimePage.tsx";

function App() {
  const time = useSelector((state) => state.util.time);
  const setTime = useSelector((state) => state.util.setTime);
  const agenda = useSelector((state) => state.util.agenda);
  const [countdown, setCountDown] = useState(Number(0.1) * 60);
  const [bgChange, setBgChange] = useState(false);
  let dispatch = useDispatch();
  console.log(agenda.length);

  const timer = useRef();

  const formatTime = (time) => {
    if (isNaN(time)) {
      return "Time Up";
    }

    let hr = Math.floor(time / 3600);
    let min = Math.floor((time % 3600) / 60);
    let sec = Math.floor(time % 60);

    if (hr < 10) {
      hr = "0" + hr;
    }
    if (min < 10) {
      min = "0" + min;
    }
    if (sec < 10) {
      sec = "0" + sec;
    }
    return hr + ":" + min + ":" + sec;
  };

  useEffect(() => {
    electron.Timer.setTimer();
    timer.current = setInterval(() => {
      setCountDown((prev) => prev - 1);
    }, 1000);
    if (countdown <= 0) {
      clearInterval(timer.current);
      setCountDown("Time Up");
    } else if (countdown <= 10) {
      setBgChange(true);
    }
    return () => {
      clearInterval(timer.current);
    };
  }, [countdown]);

  return (
    <section className="w-[100vw] h-[100vh] flex flex-row p-4 gap-4">
      <SetTimePage />
      <div className="w-[50%] bg-ash/20 rounded-lg p-4">
        <div
          className={`${
            bgChange ? "bg-red text-light" : "bg-green text-primary"
          }  p-10 rounded-lg w-[100%] text-center mb-4`}
        >
          <p className="capitalize">current timer{time}</p>
          <p className={"text-6xl w-[90%] m-auto font-extrabold"}>
            {formatTime(countdown)}
          </p>
        </div>
        <div
          className={`m-auto flex flex-col gap-4 p-4 h-[77%] overflow-y-scroll  rounded-lg ${
            agenda.length >= 1 ? "bg-primary" : "hidden"
          }`}
        >
          {agenda?.map(({ time, agenda, anchor }, index) => (
            <li
              className="font-bold text-light flex flex-row gap-3 p-5 items-center justify-between list-none bg-ash border border-light/30 rounded-lg"
              key={index}
            >
              <p className="font-bold text-sm">{agenda}</p>
              <p className="font-light text-start text-sm truncate">{anchor}</p>
              <p className="font-extrabold text-2xl ">{time}</p>
              <p className="font-black text-sm text-red ">X</p>
            </li>
          ))}
        </div>
      </div>
    </section>
  );
}

export default App;
