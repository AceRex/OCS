import React, { useEffect, useRef, useState } from "react";

function App() {
  const [countdown, setCountDown] = useState(null);
  const [bgChange, setBgChange] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [isEventMode, setIsEventMode] = useState(false);
  const [theme, setTheme] = useState("default");

  // New Presentation State
  const [presentationContent, setPresentationContent] = useState(null);
  const [presentationStyle, setPresentationStyle] = useState({
    backgroundColor: '#000000',
    textColor: '#FFFFFF',
    fontFamily: 'serif',
    backgroundImage: null,
    backgroundVideo: null
  });

  const timer = useRef(null);
  const videoRef = useRef(null);

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

  const [activeId, setActiveId] = useState(null);



  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const mode = searchParams.get('mode'); // 'speaker' or 'general'

    // Timer Listener
    electron.Timer.onSetTimer((value) => {
      let newTime, newEventMode, newTheme;

      if (typeof value === "object" && value !== null) {
        newTime = value.time;
        newEventMode = value.isEventMode || false;
        newTheme = value.theme || "default";
      } else {
        newTime = value;
        newEventMode = false;
        newTheme = "default";
      }

      // Logic:
      // Speaker View: ALWAYS updates.
      // General View: Updates ONLY if it's an "Event Mode" (Start Service) timer.
      if (mode === 'general' && !newEventMode) {
        // If we are in general view, and this is NOT an event mode timer,
        // we ignore it (essentially wiping the countdown state so it doesn't show).
        // Unless we want to clear it explicitly?
        setCountDown(null);
        setIsEventMode(false);
        return;
      }

      setIsEventMode(newEventMode);
      setTheme(newTheme);

      setCountDown(prev => {
        if (newTime === 0 && prev === null) {
          setTimeUp(false);
          return null;
        }

        if (newTime === 0) setTimeUp(true);
        else setTimeUp(false);

        return newTime;
      });
    });

    if (electron.Presentation) {
      electron.Presentation.onSetContent((value) => {
        setPresentationContent(value);
      });
      electron.Presentation.onSetStyle((value) => {
        setPresentationStyle(prev => ({ ...prev, ...value }));
      });
    }

    return () => {
      electron.Timer.removeSetTimerListener();
      if (electron.Presentation) {
        electron.Presentation.removeSetContentListener();
        electron.Presentation.removeSetStyleListener();
      }
    };
  }, []);

  // Reload video if source changes
  useEffect(() => {
    if (videoRef.current && presentationStyle.backgroundVideo) {
      videoRef.current.load();
      videoRef.current.play();
    }
  }, [presentationStyle.backgroundVideo]);

  // Background change effect for last 10 seconds
  useEffect(() => {
    if (countdown <= 10 && countdown > 0) {
      setBgChange(true);
    } else {
      setBgChange(false);
    }
  }, [countdown]);

  const renderBibleContent = () => {
    if (!presentationContent || !presentationContent.data) return null;

    const { title, body } = presentationContent.data;
    const safeBody = body || "";
    const length = safeBody.length;

    let fontSize = 'text-[5vw]';
    if (length > 400) fontSize = 'text-[2.5vw]';
    else if (length > 250) fontSize = 'text-[3vw]';
    else if (length > 150) fontSize = 'text-[4vw]';
    else if (length > 80) fontSize = 'text-[4.5vw]';

    const { backgroundColor, textColor, fontFamily, backgroundImage, backgroundVideo } = presentationStyle;

    const styleObj = {
      backgroundColor: (!backgroundImage && !backgroundVideo) ? backgroundColor : 'transparent',
      color: textColor,
      fontFamily: fontFamily === 'serif' ? 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif' :
        fontFamily === 'sans' ? 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' :
          fontFamily
    };

    return (
      <section
        className={`w-full h-full min-h-[50vh] flex flex-col items-center justify-center p-16 ${countdown > 0 ? "pb-[18vh]" : ""} text-center animate-in fade-in duration-500 relative overflow-hidden`}
        style={styleObj}
      >
        {/* Background Media Layer */}
        {backgroundVideo ? (
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover z-0"
            autoPlay loop muted playsInline
          >
            <source src={backgroundVideo} />
          </video>
        ) : backgroundImage ? (
          <img
            src={backgroundImage}
            className="absolute inset-0 w-full h-full object-cover z-0"
            alt="bg"
          />
        ) : null}

        {/* Overlay for readability if media exists */}
        {(backgroundVideo || backgroundImage) && (
          <div className="absolute inset-0 w-full h-full bg-black/40 z-1" />
        )}

        {/* Content Layer */}
        <div className="flex-1 flex flex-col items-center justify-center gap-8 z-10 relative w-full">
          <p className={`${fontSize} font-bold leading-tight max-w-[95%] transition-all duration-300 drop-shadow-lg`}>
            {safeBody}
          </p>
        </div>
        {title && (
          <div className="mb-8 text-[3vw] font-medium opacity-80 uppercase tracking-widest z-10 relative drop-shadow-md">
            {title}
          </div>
        )}
      </section>
    );
  };

  const renderEvent = () => (
    <div className={`w-full h-full flex flex-col items-center justify-center ${bgChange ? "bg-red" : "bg-primary"}`}>
      <h1 className="text-light text-[4vw] font-bold uppercase mb-4 tracking-widest">Event Starts In</h1>
      <div className={`text-[12vw] font-bold ${bgChange ? "text-light" : "text-green"}`}>{formatTime(countdown)}</div>
    </div>
  );

  const renderDefault = () => (
    <div className={`w-full rounded-2xl  flex items-center p-4 justify-center transition-colors duration-300 ${bgChange ? "bg-red animate-pulse" : "bg-green"}`}>
      <p className={`text-[14vw] font-bold leading-none tracking-tight ${bgChange ? "text-light" : "text-primary"}`}>{formatTime(countdown)}</p>
    </div>
  );

  const renderDigital = () => (
    <div className={`w-full h-full flex items-center justify-center transition-colors duration-300 ${bgChange ? "bg-red" : ""}`}>
      <p className={`text-[12vw] font-mono leading-none tracking-tight ${bgChange ? "text-light" : "text-green"}`} style={{ fontFamily: '"Courier New", Courier, monospace' }}>{formatTime(countdown)}</p>
    </div>
  );

  const renderMinimal = () => (
    <div className={`w-full h-full flex items-center justify-center transition-colors duration-300 ${bgChange ? "bg-red" : ""}`}>
      <p className={`text-[16vw] font-light leading-none tracking-tight ${bgChange ? "text-light" : "text-light"}`}>{formatTime(countdown)}</p>
    </div>
  );

  const renderPill = () => (
    <div className={`w-full h-full flex items-center justify-center transition-colors duration-300 ${bgChange ? "bg-red" : ""}`}>
      <div className={`px-16 py-6 rounded-full border-[0.8vw] flex items-center justify-center ${bgChange ? "border-light text-light" : "border-green text-green"}`}>
        <p className="text-[13vw] font-bold leading-none tracking-tight">{formatTime(countdown)}</p>
      </div>
    </div>
  );

  const renderFooterTimer = () => (
    <div className={`absolute bottom-0 left-0 w-full h-[15vh] flex items-center justify-center z-20 ${bgChange ? "bg-red" : "bg-green backdrop-blur-md"}`}>
      <p className={`text-[8vh] font-bold ${bgChange ? "text-light" : "text-primary"}`}>{formatTime(countdown)}</p>
    </div>
  );

  const renderIdleScreen = () => (
    <div className="w-full h-full flex items-center justify-center bg-primary">
      <div className="flex flex-col items-center animate-pulse">
        <h1 className="text-[15vw] font-black text-light tracking-tighter leading-none opacity-20">OCS</h1>
        <p className="text-light/30 text-2xl font-medium tracking-[1em] uppercase mt-4">Service is Starting</p>
      </div>
    </div>
  );

  const renderTimeUp = () => (
    <div className="w-full rounded-2xl flex items-center justify-center bg-red animate-pulse">
      <h1 className="text-[12vw] font-black text-light uppercase tracking-tight leading-none">TIME UP</h1>
    </div>
  );

  // Debug check
  if (!window.electron) return <div style={{ color: 'red', fontSize: 50, backgroundColor: 'white' }}>ELECTRON PRELOAD FAILED</div>;

  const isPresenting = presentationContent && (presentationContent.type === 'bible' || presentationContent.type === 'custom') && presentationContent.data;
  const showSplitTimer = isPresenting && countdown > 0;

  return (
    <div className="h-full flex flex-col justify-center items-center w-full bg-primary overflow-hidden" style={{ color: 'white' }}>
      <section className={`w-full h-full flex flex-col items-center justify-center relative ${showSplitTimer ? '' : 'max-lg:p-[0.5em]'}`}>
        <div className={`w-full ${showSplitTimer ? 'h-[100vh] flex-1' : 'h-full flex flex-col items-center justify-center flex-1'} transition-all duration-500`}>
          {isPresenting ? renderBibleContent() : (
            !showSplitTimer && (
              countdown === null ? (
                <div className="w-full h-full flex items-center justify-center bg-primary" style={{ backgroundColor: '#282828' }}>
                  <div className="flex flex-col items-center animate-pulse">
                    <h1 className="text-[15vw] font-black text-light tracking-tighter leading-none opacity-20" style={{ color: '#F6F3F1' }}>OCS</h1>
                    <p className="text-light/30 text-2xl font-medium tracking-[1em] uppercase mt-4" style={{ color: '#F6F3F1' }}>Service is Starting</p>
                  </div>
                </div>
              ) : (
                // If countdown is 0 (Time Up) AND we are in Event Mode, show Idle Screen instead of "TIME UP"
                countdown === 0 ? (isEventMode ? renderIdleScreen() : renderTimeUp()) : (
                  isEventMode ? renderEvent() : (
                    <>
                      {theme === 'default' && renderDefault()}
                      {theme === 'digital' && renderDigital()}
                      {theme === 'minimal' && renderMinimal()}
                      {theme === 'pill' && renderPill()}
                    </>
                  )
                )
              )
            )
          )}
        </div>
      </section>
      {showSplitTimer && renderFooterTimer()}
    </div>
  );
}

export default App;
