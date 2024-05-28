import React, { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
// import { utilAction } from "../../Redux/state.jsx";

function App() {
  const setTime = useSelector((state) => state.util.setTime);
  const [countdown, setCountDown] = useState(Number(0.5) * 60);
  const [bgChange, setBgChange] = useState(false);
  let dispatch = useDispatch();

  const timer = useRef();

  const formatTime = (time) => {
    if (isNaN(time)) {
      return "Time Up!!!";
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
    timer.current = setInterval(() => {
      setCountDown((prev) => prev - 1);
    }, 1000);
    if (countdown <= 0) {
      clearInterval(timer.current);
      setCountDown("Time Up!!!");
    } else if (countdown <= 10) {
      setBgChange(true);
    }
    return () => {
      clearInterval(timer.current);
    };
  }, [countdown]);

  return (
    <>
      <div className="relative">
        {/* <SetTimePage /> */}

        <section className="p-[14em] max-lg:p-[0.5em] ">
          <section
            className={`${
              bgChange ? "bg-red text-light" : "bg-green text-primary"
            }  p-12 flex rounded-lg `}
          >
            <p className="text-[170px] font-extrabold">
              {formatTime(countdown)}
            </p>
            {time}
          </section>
        </section>
      </div>
    </>
  );
}

export default App;
