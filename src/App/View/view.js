import React, { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";

function App() {
  const [countdown, setCountDown] = useState(0);
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
    electron.Timer.onSetTimer((value) => {
      setCountDown(value);
    });

    return () => {
      electron.Timer.removeSetTimerListener();
    };
  }, [countdown]);

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
  }, [countdown]);

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
            {timeUp && formatTime(countdown)}
          </p>
        </section>
      </section>
    </div>
  );
}

export default App;
