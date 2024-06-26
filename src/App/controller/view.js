import React, { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { utilAction } from "../../Redux/state.jsx";
import SetTimePage from "./SetTimePage.tsx";

function App() {
  const time = useSelector((state) => state.util.time);
  const agenda = useSelector((state) => state.util.agenda);
  const [countdown, setCountDown] = useState(time);
  const [bgChange, setBgChange] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const timer = useRef(null);

  const formatTime = (timeToFormat) => {
    if (isNaN(timeToFormat)) {
      return "Set Timer";
    }

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

  useEffect(() => {
    electron.Timer.setTimer(time);
  }, [time]);

  useEffect(() => {
    setCountDown(time);
  }, [time]);

  useEffect(() => {
    if (timer.current) {
      clearInterval(timer.current);
    }

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

    return () => clearInterval(timer.current);
  }, [time]);

  useEffect(() => {
    if (countdown <= 10) {
      setBgChange(true);
    } else {
      setBgChange(false);
    }
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
          <p className="capitalize">current timer</p>
          <p className={"text-6xl w-[90%] m-auto font-extrabold"}>
            {timeUp && formatTime(countdown)}
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
