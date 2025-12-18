import React, { useEffect, useRef, useState } from "react";
// Import font if possible or rely on standard fonts

function App() {
  const [countdown, setCountDown] = useState(0);
  const [bgChange, setBgChange] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [isEventMode, setIsEventMode] = useState(false);
  const [theme, setTheme] = useState("default");

  // New Presentation State
  const [presentationContent, setPresentationContent] = useState(null);

  const timer = useRef(null);

  const formatTime = (timeToFormat) => {
    if (isNaN(timeToFormat)) {
      return "00:00:00";
    }

    let hr = Math.floor(timeToFormat / 3600);
    let min = Math.floor((timeToFormat % 3600) / 60);
    let sec = Math.floor(timeToFormat % 60);

    if (hr < 10) hr = "0" + hr;
    if (min < 10) min = "0" + min;
    if (sec < 10) sec = "0" + sec;
    return `${hr}:${min}:${sec}`;
  };

  useEffect(() => {
    electron.Timer.onSetTimer((value) => {
      if (typeof value === "object" && value !== null) {
        setCountDown(value.time);
        setIsEventMode(value.isEventMode || false);
        setTheme(value.theme || "default");
        // Implicitly clear presentation if timer action occurs? 
        // For now, let's reset presentation on timer start?
        // setPresentationContent(null); 
      } else {
        setCountDown(value);
        setIsEventMode(false);
      }
    });

    if (electron.Presentation) {
      electron.Presentation.onSetContent((value) => {
        setPresentationContent(value);
      });
    }

    return () => {
      electron.Timer.removeSetTimerListener();
      if (electron.Presentation) electron.Presentation.removeSetContentListener();
    };
  }, []);

  useEffect(() => {
    if (timer.current) {
      clearInterval(timer.current);
    }
    // Simple local countdown for smooth animation (reconciled by electron updates)
    timer.current = setInterval(() => {
      setCountDown((prevCountdown) => {
        if (prevCountdown <= 0) {
          return 0;
        }
        return prevCountdown - 1;
      });
    }, 1000);

    return () => clearInterval(timer.current);
  }, [countdown]);

  useEffect(() => {
    if (countdown <= 10 && countdown > 0) {
      setBgChange(true);
    } else {
      setBgChange(false);
    }
    if (countdown === 0) setTimeUp(true);
    else setTimeUp(false);
  }, [countdown]);


  // THEME RENDERERS

  const renderDefault = () => (
    <section
      className={`${bgChange ? "bg-red text-light" : "bg-green text-primary"} p-12 flex rounded-2xl transition-colors duration-500`}
    >
      <p className="text-[170px] font-extrabold tabular-nums">
        {formatTime(countdown)}
      </p>
    </section>
  );

  const renderDigital = () => (
    <section className="bg-gradient-to-r from-blue-900 to-purple-900 p-12 flex flex-col items-center justify-center shadow-[0_0_50px_rgba(100,0,255,0.5)] w-full h-full">
      <div className="bg-black/40 backdrop-blur-md px-16 py-8 rounded-2xl border border-white/10 shadow-inner">
        <p className="text-[160px] font-mono font-bold text-transparent bg-clip-text bg-gradient-to-b from-white to-blue-200 drop-shadow-[0_0_10px_rgba(255,255,255,0.5)] tabular-nums tracking-widest">
          {formatTime(countdown)}
        </p>
      </div>
    </section>
  );

  const renderMinimal = () => (
    <section className="bg-black p-12 flex flex-col items-center justify-center w-full h-full">
      <p className="text-[200px] text-white font-thin tracking-wider tabular-nums leading-none">
        {formatTime(countdown)}
      </p>
    </section>
  );

  const renderPill = () => {
    const timeStr = formatTime(countdown);
    const [hr, min, sec] = timeStr.split(':');

    const FlipCard = ({ value, label }) => (
      <div className="flex flex-col items-center gap-4">
        <div className="relative bg-[#1e1e1e] rounded-xl w-[25vw] h-[30vw] max-w-[300px] max-h-[360px] flex items-center justify-center shadow-2xl overflow-hidden border border-white/5">
          <div className="absolute w-full h-[2px] z-20 top-1/2 -translate-y-1/2 shadow-[0_1px_rgba(255,255,255,0.05)]" />
          <div className="absolute top-0 w-full h-1/2 bg-gradient-to-b from-white/5 to-transparent z-10 pointer-events-none" />
          <p className="text-[20vw] lg:text-[220px] font-bold text-[#d4d4d4] leading-none tracking-tighter z-0 font-sans">
            {value}
          </p>
        </div>
      </div>
    );

    return (
      <section className="bg-[#000000] flex items-center justify-center w-full h-full gap-4 lg:gap-8 px-4">
        <FlipCard value={hr} />
        <FlipCard value={min} />
        <FlipCard value={sec} />
      </section>
    );
  };

  const renderEvent = () => (
    <section className="bg-blue-600 text-light p-12 flex flex-col items-center justify-center rounded-2xl shadow-2xl border-4 border-blue-400">
      <p className="text-4xl font-bold uppercase tracking-widest mb-4">Event Starts In</p>
      <p className="text-[170px] font-extrabold leading-none tabular-nums">
        {formatTime(countdown)}
      </p>
    </section>
  );

  const renderBibleContent = () => {
    if (!presentationContent || !presentationContent.data) return null;

    const { title, body } = presentationContent.data;

    return (
      <section className="bg-black text-white w-full h-full flex flex-col items-center justify-center p-16 text-center animate-in fade-in duration-500">
        <div className="flex-1 flex flex-col items-center justify-center gap-8">
          <p className="text-[5vw] font-bold leading-tight max-w-[90%] font-serif">
            {body}
          </p>
        </div>
        {title && (
          <div className="mb-8 text-[3vw] font-medium text-white/60 uppercase tracking-widest font-sans">
            {title}
          </div>
        )}
      </section>
    );
  };

  const isPresenting = presentationContent && presentationContent.type === 'bible';

  return (
    <div className="h-full flex flex-col justify-center items-center w-full bg-primary overflow-hidden">
      <section className="max-lg:p-[0.5em] w-full h-full flex items-center justify-center">
        {isPresenting ? renderBibleContent() : (
          isEventMode ? renderEvent() : (
            <>
              {theme === 'default' && renderDefault()}
              {theme === 'digital' && renderDigital()}
              {theme === 'minimal' && renderMinimal()}
              {theme === 'pill' && renderPill()}
            </>
          )
        )}
      </section>
    </div>
  );
}

export default App;
