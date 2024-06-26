import React, { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { utilAction } from "../../Redux/state.jsx";

function App() {
  const time = useSelector((state) => state.util.time);
  const [countdown, setCountDown] = useState(Number(time) * 60);
  const [bgChange, setBgChange] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const dispatch = useDispatch();
  const timer = useRef(null);

  const formatTime = (time) => {
    if (isNaN(time)) {
      return "Set Timer";
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
    return `${hr}:${min}:${sec}`;
  };

  useEffect(() => {
    electron.Timer.setTimer(time, (response) => {
      if (response.error) {
        console.log(response.error);
      } else {
        dispatch(utilAction.setTime(response));
      }
    });
  }, [dispatch]);

  useEffect(() => {
    setCountDown(Number(time) * 60);
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
    <div className="relative">
      <section className="p-[14em] max-lg:p-[0.5em]">
        <section
          className={`${
            bgChange ? "bg-red text-light" : "bg-green text-primary"
          } p-12 flex rounded-lg`}
        >
          <p className="text-[170px] font-extrabold">
            {timeUp ? "Time Up!!!" : formatTime(countdown)}
          </p>
        </section>
      </section>
    </div>
  );
}

export default App;
