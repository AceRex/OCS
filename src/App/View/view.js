import React, { useEffect, useRef, useState, useMemo } from "react";
import DisplayCanvas from "./DisplayCanvas";

function App({ mode: propMode }) {
  const [countdown, setCountDown] = useState(null);
  const [bgChange, setBgChange] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [isEventMode, setIsEventMode] = useState(false);
  const [theme, setTheme] = useState("default");
  const [sessionRec, setSessionRec] = useState({ recording: false, title: null });
  const viewMode = propMode || (typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('mode')
    : null);
  const isAlphaMode = typeof window !== 'undefined'
    ? (new URLSearchParams(window.location.search).get('alpha') === '1' || new URLSearchParams(window.location.search).get('mode') === 'overlay')
    : false;

  // 4-Band Compositor Canvas State (FR-4.13, FR-4.14, FR-4.15)
  const [canvasState, setCanvasState] = useState({
    background: {
      type: "color",
      url: null,
      color: "#000000",
      panX: 0,
      panY: 0,
      zoom: 1,
      muted: true,
      loop: true,
      autoPlay: true,
    },
    contentSlot: {
      type: "none",
      data: null,
    },
    pinnedLayers: [],
    chrome: {
      blackout: false,
      logo: false,
      logoUrl: null,
      brandingText: null,
      timerSplit: false,
      timerCountdown: null,
    },
  });

  // Presentation State (backward compatibility)
  const [presentationContent, setPresentationContent] = useState(null);
  const [presentationStyle, setPresentationStyle] = useState({
    backgroundColor: '#000000',
    textColor: '#FFFFFF',
    fontFamily: 'serif',
    backgroundImage: null,
    backgroundVideo: null,
    lowerThirdImage: null
  });

  const videoRef = useRef(null);

  const presentationMemo = useMemo(() => {
    const { 
      backgroundColor, textColor, backgroundImage, backgroundVideo, 
      backgroundX, backgroundY, backgroundWidth, backgroundHeight,
      bibleRefPosition = 'top-center',
      bibleBodyPosition = 'center',
      bibleTranslation = 'KJV',
      bibleServiceLabel = '',
      bibleShowOrbs = true,
      lowerThirdImage = null
    } = presentationStyle || {};
    const hasContent = presentationContent && presentationContent.data;
    const isCustomLayers = hasContent && presentationContent.type === 'custom_layers';
    const bgStyle = {
      left: `${backgroundX || 50}%`,
      top: `${backgroundY || 50}%`,
      transform: 'translate(-50%, -50%)',
      width: `${backgroundWidth || 100}%`,
      height: `${backgroundHeight || 100}%`,
      minWidth: '10px',
      objectFit: 'fill'
    };

    const customLayers = isCustomLayers ? presentationContent.data.layers.map((layer, idx) => {
      const shadowStyle = layer.style?.shadow
        ? `${layer.style.shadow.x || 0}px ${layer.style.shadow.y || 0}px ${layer.style.shadow.blur || 10}px ${layer.style.shadow.color || 'rgba(0,0,0,0.6)'}`
        : null;
      return (
        <div 
          key={layer.id || idx}
          className="absolute flex items-center justify-center text-center"
          style={{
            left: `${layer.x || 50}%`,
            top: `${layer.y || 50}%`,
            transform: 'translate(-50%, -50%)',
            width: layer.type === 'image' ? `${layer.style?.width || 30}%` : 'auto',
            zIndex: 10,
            minWidth: '10px', 
            minHeight: '10px'
          }}
        >
          {layer.type === 'text' ? (
            <p style={{
              fontSize: `${layer.style?.fontSize || 5}cqw`,
              color: layer.style?.color || '#ffffff',
              fontFamily: layer.style?.fontFamily === 'serif' ? 'Georgia, serif' : (layer.style?.fontFamily === 'mono' ? '"Courier New", monospace' : 'system-ui, sans-serif'),
              fontWeight: layer.style?.fontWeight || 'normal',
              textTransform: layer.style?.textTransform || 'none',
              lineHeight: layer.style?.lineHeight || 1.2,
              whiteSpace: 'pre-wrap',
              textShadow: shadowStyle || '0 2px 10px rgba(0,0,0,0.3)',
            }}>{layer.content || ""}</p>
          ) : (
            <img 
              src={layer.content} 
              className="w-full h-auto pointer-events-none" 
              style={{ 
                boxShadow: shadowStyle,
                display: 'block'
              }}
              alt="layer" 
            />
          )}
        </div>
      );
    }) : null;

    let biblePresentation = null;
    if (hasContent && !isCustomLayers && presentationContent.type !== 'slide_index') {
      const { title, body, readAlong, rangeStart, rangeEnd, currentVerse } = presentationContent.data;
      const safeBody = body || "";
      const bodyLen = safeBody.length;
      const fontSize = bodyLen > 600 ? '2.8vw' : bodyLen > 300 ? '3.5vw' : bodyLen > 150 ? '4.5vw' : '6vw';
      const useReadAlong = !!readAlong?.enabled
        && Array.isArray(readAlong.tokens)
        && readAlong.tokens.length > 0;

      let bookLabel = '';
      let cvLabel = '';
      if (title && typeof title === 'string') {
        const parts = title.match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
        if (parts) {
          bookLabel = parts[1].toUpperCase();
          const ch = parts[2];
          const rs = rangeStart != null ? rangeStart : parseInt(parts[3], 10);
          const re = rangeEnd != null ? rangeEnd : (parts[4] ? parseInt(parts[4], 10) : rs);
          const cur = currentVerse != null ? currentVerse : rs;
          if (re > rs) {
            // e.g. John 3:1-4 → CHAPTER 3 · VERSES 1–4 (current verse in body)
            cvLabel = cur !== rs
              ? `CHAPTER ${ch} · VERSES ${rs}–${re} · ${cur}`
              : `CHAPTER ${ch} · VERSES ${rs}–${re}`;
          } else {
            cvLabel = `CHAPTER ${ch} · VERSE ${rs}`;
          }
        } else {
          bookLabel = title.toUpperCase();
        }
      } else if (title) {
        bookLabel = String(title).toUpperCase();
      }

      const refPositionMap = {
        'top-center': 'top-[4vw] left-1/2 -translate-x-1/2',
        'top-left': 'top-[4vw] left-[4vw]',
        'top-right': 'top-[4vw] right-[4vw]',
        'bottom-center': 'bottom-[4vw] left-1/2 -translate-x-1/2',
        'bottom-left': 'bottom-[4vw] left-[4vw]',
        'bottom-right': 'bottom-[4vw] right-[4vw]',
      };

      const bodyAlignMap = {
        'center': 'items-center justify-center text-center',
        'bottom-left': 'items-end justify-end text-left pb-[12vw] pl-[6vw]',
        'bottom-right': 'items-end justify-end text-right pb-[12vw] pr-[6vw]',
      };

      const refPosClass = refPositionMap[bibleRefPosition] || refPositionMap['top-center'];
      const bodyAlign = bodyAlignMap[bibleBodyPosition] || bodyAlignMap['center'];
      const useCustomBg = !!backgroundImage || !!backgroundVideo;
      const bgColor = isAlphaMode ? 'transparent' : (useCustomBg ? '#000000' : (backgroundColor || '#0B0814'));
      const activeIdx = typeof readAlong?.activeIndex === 'number' ? readAlong.activeIndex : -1;
      const baseColor = textColor || '#F5F2FA';

      biblePresentation = (
        <div className="w-full h-full relative overflow-hidden flex flex-col" style={{ backgroundColor: bgColor }}>
          {bibleShowOrbs && !useCustomBg && (
            <>
              <div className="absolute pointer-events-none" style={{
                top: '-15vw', left: '-15vw',
                width: '55vw', height: '55vw',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(167,136,250,0.55) 0%, rgba(167,136,250,0.12) 55%, transparent 70%)',
                filter: 'blur(2px)',
              }} />
              <div className="absolute pointer-events-none" style={{
                bottom: '-15vw', right: '-15vw',
                width: '50vw', height: '50vw',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(103,232,249,0.45) 0%, rgba(103,232,249,0.10) 55%, transparent 70%)',
                filter: 'blur(2px)',
              }} />
              <div className="absolute pointer-events-none" style={{
                top: '-8vw', left: '-8vw',
                width: '38vw', height: '38vw',
                borderRadius: '50%',
                border: '0.3vw solid rgba(167,136,250,0.25)',
              }} />
              <div className="absolute pointer-events-none" style={{
                top: '-3vw', left: '-3vw',
                width: '28vw', height: '28vw',
                borderRadius: '50%',
                border: '0.2vw solid rgba(167,136,250,0.15)',
              }} />
              <div className="absolute pointer-events-none" style={{
                bottom: '-8vw', right: '-8vw',
                width: '35vw', height: '35vw',
                borderRadius: '50%',
                border: '0.3vw solid rgba(103,232,249,0.2)',
              }} />
            </>
          )}

          {backgroundVideo ? (
            <video className="absolute inset-0 w-full h-full object-cover z-0" autoPlay loop muted playsInline>
              <source src={backgroundVideo} />
            </video>
          ) : backgroundImage ? (
            <img src={backgroundImage} className="absolute inset-0 w-full h-full object-cover z-0" alt="bg" />
          ) : null}
          {useCustomBg && <div className="absolute inset-0 bg-black/50 z-[1]" />}

          {lowerThirdImage && (
            <div className="absolute bottom-12 left-12 w-[80%] h-[20%] z-30 pointer-events-none">
              <img src={lowerThirdImage} className="h-full w-auto object-contain drop-shadow-2xl" alt="lower third" />
            </div>
          )}

          {title && (
            <div className={`absolute z-20 flex items-center gap-[0.8vw] ${refPosClass}`}>
              <span style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: '1.4vw',
                fontWeight: 700,
                letterSpacing: '0.18em',
                color: '#67E8F9',
                textTransform: 'uppercase',
              }}>
                {bookLabel}
                {cvLabel && <> · <span style={{ color: '#A788FA' }}>{cvLabel}</span></>}
              </span>
            </div>
          )}

          <div
            className={`w-full h-full flex ${bodyAlign} z-10 relative`}
            style={{
              overflow: 'hidden',
              boxSizing: 'border-box',
              paddingLeft: useReadAlong ? 0 : '6vw',
              paddingRight: useReadAlong ? 0 : '6vw',
            }}
          >
            <p style={{
              fontFamily: '"Outfit", "Space Grotesk", sans-serif',
              fontSize: fontSize,
              fontWeight: useReadAlong ? 600 : 800,
              color: baseColor,
              lineHeight: 1.15,
              maxWidth: useReadAlong ? '100%' : '90%',
              width: useReadAlong ? '100%' : undefined,
              boxSizing: 'border-box',
              padding: 0,
              margin: 0,
              textShadow: '0 2px 30px rgba(0,0,0,0.6)',
              letterSpacing: '-0.01em',
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
            }}>
              {useReadAlong ? (
                readAlong.tokens.map((tok, i) => {
                  const isActive = i === activeIdx;
                  const isPast = activeIdx >= 0 && i < activeIdx;
                  return (
                    <span
                      key={`${i}-${tok}`}
                      className="ocs-ra-word"
                      data-i={i}
                      style={{
                        display: 'inline',
                        // Same weight for every token — bolding via shadow avoids layout growth / frame overflow
                        fontWeight: 600,
                        color: isActive ? '#FFFFFF' : baseColor,
                        opacity: isActive ? 1 : (isPast ? 0.42 : 0.58),
                        transition: 'color 180ms cubic-bezier(0.33, 1, 0.68, 1), opacity 180ms cubic-bezier(0.33, 1, 0.68, 1), text-shadow 180ms cubic-bezier(0.33, 1, 0.68, 1)',
                        textShadow: isActive
                          ? '0 0 0.6px #fff, 0 0 0.6px #fff, 0 0 12px rgba(255,255,255,0.25), 0 2px 30px rgba(0,0,0,0.6)'
                          : '0 2px 30px rgba(0,0,0,0.6)',
                      }}
                    >
                      {tok}{i < readAlong.tokens.length - 1 ? ' ' : ''}
                    </span>
                  );
                })
              ) : (
                <span dangerouslySetInnerHTML={{ __html: safeBody }} />
              )}
            </p>
          </div>

          <div className="absolute bottom-[3vw] left-1/2 -translate-x-1/2 z-20 flex items-center gap-[1vw]">
            <span style={{
              fontFamily: '"Outfit", sans-serif',
              fontSize: '1.1vw',
              fontWeight: 500,
              color: 'rgba(245,242,250,0.45)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}>
              {bibleTranslation}
              {bibleServiceLabel && (
                <> · <span style={{ color: 'rgba(245,242,250,0.35)' }}>{bibleServiceLabel}</span></>
              )}
            </span>
          </div>
        </div>
      );
    }

    const slideIndexView = hasContent && presentationContent.type === 'slide_index' ? (
      <div className="w-full h-full flex items-center justify-center">
        <img 
          src={presentationContent.data.slideImageUrl} 
          className="w-full h-full object-contain" 
          alt={`Slide ${presentationContent.data.slideIndex + 1}`} 
        />
      </div>
    ) : null;

    return {
      hasContent,
      isCustomLayers,
      bgStyle,
      backgroundVideo,
      backgroundImage,
      backgroundColor,
      lowerThirdImage,
      customLayers,
      biblePresentation,
      slideIndexView,
    };
  }, [presentationStyle, presentationContent, viewMode]);

  // Read-along uses weight/opacity only — no auto-scroll (keeps stage frame stable)

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
    const searchParams = new URLSearchParams(window.location.search);
    const mode = propMode || searchParams.get('mode'); // 'speaker' or 'general'
    let unsubContent = null;
    let unsubStyle = null;
    let unsubSession = null;
    let unsubCanvas = null;

    // Session archive REC badge — Speaker View default on; General View off (FR-5.16)
    if (mode === 'speaker' && window.electron?.Session) {
      window.electron.Session.status?.().then((s) => {
        setSessionRec({ recording: !!s?.recording, title: s?.title || null });
      }).catch(() => {});
      unsubSession = window.electron.Session.onStatus((s) => {
        setSessionRec({ recording: !!s?.recording, title: s?.title || null });
      });
    }

    // Timer Listener
    if (window.electron && window.electron.Timer) {
      window.electron.Timer.onSetTimer((value) => {
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

        if (mode === 'general' && !newEventMode) {
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
    }

    if (window.electron && window.electron.Presentation) {
      unsubContent = window.electron.Presentation.onSetContent((value) => {
        // null = black/blank screen — must not touch .target
        if (value && value.target && Array.isArray(value.target)) {
          if (!value.target.includes(mode) && !value.target.includes('all') && mode !== 'controller') {
            setPresentationContent(null);
            setCanvasState(prev => ({
              ...prev,
              contentSlot: { type: 'none', data: null }
            }));
            return;
          }
        }
        const summary = value == null
          ? 'null (black/none)'
          : `${value.type || '?'} ${value.data?.title || ''}`.trim();
        console.log(`[View] RENDER mode=${mode} set-content (scoped to Content Slot) ←`, summary);
        setPresentationContent(value);

        // FR-4.14: Content Slot scoping — only update contentSlot, preserve background & pinned layers
        setCanvasState(prev => ({
          ...prev,
          contentSlot: value == null
            ? { type: 'none', data: null }
            : { type: value.type || 'none', data: value.data || value }
        }));
      });

      unsubStyle = window.electron.Presentation.onSetStyle((value) => {
        if (!value) return;
        if (value.target && Array.isArray(value.target)) {
          if (!value.target.includes(mode) && !value.target.includes('all')) return;
        }
        console.log("View received style:", value);
        setPresentationStyle(prev => ({ ...prev, ...value }));

        setCanvasState(prev => {
          const bg = { ...prev.background };
          if (value.backgroundImage) {
            bg.type = 'image';
            bg.url = value.backgroundImage;
          } else if (value.backgroundVideo) {
            bg.type = 'video';
            bg.url = value.backgroundVideo;
          } else if (value.backgroundColor) {
            bg.type = 'color';
            bg.color = value.backgroundColor;
          }
          if (value.backgroundX != null) bg.panX = value.backgroundX - 50;
          if (value.backgroundY != null) bg.panY = value.backgroundY - 50;
          return {
            ...prev,
            background: bg
          };
        });
      });

      if (window.electron.Presentation.getStyle) {
        window.electron.Presentation.getStyle().then((initialStyle) => {
          if (initialStyle && Object.keys(initialStyle).length > 0) {
            setPresentationStyle(prev => ({ ...prev, ...initialStyle }));
            setCanvasState(prev => {
              const bg = { ...prev.background };
              if (initialStyle.backgroundImage) {
                bg.type = 'image';
                bg.url = initialStyle.backgroundImage;
              } else if (initialStyle.backgroundVideo) {
                bg.type = 'video';
                bg.url = initialStyle.backgroundVideo;
              } else if (initialStyle.backgroundColor) {
                bg.type = 'color';
                bg.color = initialStyle.backgroundColor;
              }
              return { ...prev, background: bg };
            });
          }
        }).catch(() => {});
      }
    }

    if (window.electron && window.electron.Canvas && window.electron.Canvas.onCanvasSync) {
      unsubCanvas = window.electron.Canvas.onCanvasSync((state) => {
        if (state) {
          setCanvasState(prev => ({
            ...prev,
            ...state,
            background: { ...prev.background, ...(state.background || {}) },
            contentSlot: state.contentSlot || prev.contentSlot,
            pinnedLayers: state.pinnedLayers || prev.pinnedLayers,
            chrome: { ...prev.chrome, ...(state.chrome || {}) }
          }));
        }
      });
    }

    // If running in OBS Studio Browser Source / Web Browser overlay mode (no Electron preload)
    let socket = null;
    if (!window.electron) {
      console.log(`[View Browser Mode] Initializing Socket.IO overlay sync for mode=${mode}`);
      try {
        const ioFunc = typeof window !== 'undefined' ? window.io : null;
        if (typeof ioFunc === 'function') {
          socket = ioFunc(typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:4000', {
            transports: ['websocket', 'polling'],
            reconnection: true,
          });
        }

        socket.on('overlay-timer', (value) => {
          let newTime, newEventMode, newTheme;
          if (typeof value === 'object' && value !== null) {
            newTime = value.time;
            newEventMode = value.isEventMode || false;
            newTheme = value.theme || 'default';
          } else {
            newTime = value;
            newEventMode = false;
            newTheme = 'default';
          }

          if (mode === 'general' && !newEventMode) {
            setCountDown(null);
            setIsEventMode(false);
            return;
          }

          setIsEventMode(newEventMode);
          setTheme(newTheme);
          setCountDown((prev) => {
            if (newTime === 0 && prev === null) {
              setTimeUp(false);
              return null;
            }
            if (newTime === 0) setTimeUp(true);
            else setTimeUp(false);
            return newTime;
          });
        });

        socket.on('overlay-content', (value) => {
          if (value && value.target && Array.isArray(value.target)) {
            if (!value.target.includes(mode) && !value.target.includes('all') && mode !== 'controller') {
              setPresentationContent(null);
              setCanvasState((prev) => ({
                ...prev,
                contentSlot: { type: 'none', data: null },
              }));
              return;
            }
          }
          setPresentationContent(value);
          setCanvasState((prev) => ({
            ...prev,
            contentSlot: value == null
              ? { type: 'none', data: null }
              : { type: value.type || 'none', data: value.data || value },
          }));
        });

        socket.on('overlay-style', (value) => {
          if (!value) return;
          if (value.target && Array.isArray(value.target)) {
            if (!value.target.includes(mode) && !value.target.includes('all')) return;
          }
          setPresentationStyle((prev) => ({ ...prev, ...value }));
          setCanvasState((prev) => {
            const bg = { ...prev.background };
            if (value.backgroundImage) {
              bg.type = 'image';
              bg.url = value.backgroundImage;
            } else if (value.backgroundVideo) {
              bg.type = 'video';
              bg.url = value.backgroundVideo;
            } else if (value.backgroundColor) {
              bg.type = 'color';
              bg.color = value.backgroundColor;
            }
            if (value.backgroundX != null) bg.panX = value.backgroundX - 50;
            if (value.backgroundY != null) bg.panY = value.backgroundY - 50;
            return { ...prev, background: bg };
          });
        });

        socket.on('overlay-canvas', (state) => {
          if (state) {
            setCanvasState((prev) => ({
              ...prev,
              ...state,
              background: { ...prev.background, ...(state.background || {}) },
              contentSlot: state.contentSlot || prev.contentSlot,
              pinnedLayers: state.pinnedLayers || prev.pinnedLayers,
              chrome: { ...prev.chrome, ...(state.chrome || {}) },
            }));
          }
        });
      } catch (err) {
        console.warn('[View Browser Mode] Socket.IO initialization notice:', err);
      }
    }

    return () => {
      if (socket) {
        try { socket.disconnect(); } catch (_) {}
      }
      if (window.electron && window.electron.Timer) {
        window.electron.Timer.removeSetTimerListener();
      }
      if (typeof unsubContent === 'function') unsubContent();
      if (typeof unsubStyle === 'function') unsubStyle();
      if (typeof unsubSession === 'function') unsubSession();
      if (typeof unsubCanvas === 'function') unsubCanvas();
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

  const renderPresentation = () => {
    return (
      <DisplayCanvas
        canvasState={canvasState}
        mode={viewMode || 'general'}
      />
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

  const hasContentSlot = canvasState.contentSlot && canvasState.contentSlot.type !== 'none' && canvasState.contentSlot.data != null;
  const hasBackgroundMedia = canvasState.background && canvasState.background.url != null;
  const hasPinnedLayers = Array.isArray(canvasState.pinnedLayers) && canvasState.pinnedLayers.length > 0;
  const hasLegacyContent = presentationContent && ['bible', 'custom', 'custom_layers', 'scene', 'presentation', 'slide_index'].includes(presentationContent.type) && presentationContent.data;

  const isPresenting = Boolean(hasContentSlot || hasBackgroundMedia || hasPinnedLayers || hasLegacyContent);
  const showSplitTimer = isPresenting && countdown > 0;
  console.log(`[View ${viewMode}] RENDER: isPresenting=${isPresenting}, hasContentSlot=${hasContentSlot}, countdown=${countdown}, type=${canvasState.contentSlot?.type}`);

  return (
    <div className={`h-screen flex flex-col justify-center items-center w-full ${isAlphaMode ? 'bg-transparent' : 'bg-primary'} overflow-hidden`} style={{ color: 'white', backgroundColor: isAlphaMode ? 'transparent' : undefined }}>
      {sessionRec.recording && (
        <div
          className="absolute top-6 right-8 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/50 border border-red-500/40"
          title={sessionRec.title || 'Session archive'}
        >
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-widest text-red-300">REC</span>
        </div>
      )}
      <section className={`w-full h-full flex flex-col items-center justify-center relative ${showSplitTimer ? '' : 'max-lg:p-[0.5em]'}`}>
        <div className={`w-full ${showSplitTimer ? 'h-[100vh] flex-1' : 'h-screen flex flex-col items-center justify-center flex-1'} transition-all duration-500`}>
          {isPresenting ? renderPresentation() : (
            !showSplitTimer && (
              countdown === null ? (
                <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: isAlphaMode ? 'transparent' : '#282828' }}>
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
