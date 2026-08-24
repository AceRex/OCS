import React, { useEffect, useState } from 'react';
import { renderAnimatedLyrics } from './LyricAnimationEngine';
import { PiShieldCheckFill } from 'react-icons/pi';

export default function MiniPreview({ mode }) {
    const [countdown, setCountDown] = useState(null);
    const [bgChange, setBgChange] = useState(false);
    const [timeUp, setTimeUp] = useState(false);
    const [isEventMode, setIsEventMode] = useState(false);
    const [theme, setTheme] = useState("default");
    const [presentationContent, setPresentationContent] = useState(null);
    const [canvasState, setCanvasState] = useState({
        background: { type: "color", color: "#0B0814", url: null },
        contentSlot: { type: "none", data: null },
        pinnedLayers: [],
        chrome: { blackout: false, logo: false },
    });

    const [currentTime, setCurrentTime] = useState("");

    // Live clock for standby preview
    useEffect(() => {
        const updateClock = () => {
            const now = new Date();
            setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        };
        updateClock();
        const timer = setInterval(updateClock, 1000);
        return () => clearInterval(timer);
    }, []);

    const [presentationStyle, setPresentationStyle] = useState({
        backgroundColor: '#0B0814',
        textColor: '#F5F2FA',
        accentColor: '#A788FA',
        fontFamily: 'Outfit',
        fontSize: '5rem',
        textAlign: 'center',
        textShadow: true,
        backgroundImage: null,
        backgroundVideo: null,
        bibleRefPosition: 'top-center',
        bibleBodyPosition: 'center',
        bibleTranslation: 'KJV',
        bibleServiceLabel: '',
        bibleShowOrbs: true,
    });

    const formatTime = (timeToFormat) => {
        if (isNaN(timeToFormat)) return "00:00:00";
        let hr = Math.floor(timeToFormat / 3600);
        let min = Math.floor((timeToFormat % 3600) / 60);
        let sec = Math.floor(timeToFormat % 60);

        if (hr < 10) hr = "0" + hr;
        if (min < 10) min = "0" + min;
        if (sec < 10) sec = "0" + sec;
        return `${hr}:${min}:${sec}`;
    };

    useEffect(() => {
        // 1. Subscribe to Canvas Compositor State (FR-4.15)
        const unsubCanvas = (window.electron?.Canvas?.onCanvasSync || window.api?.Canvas?.onCanvasSync)?.((state) => {
            if (state) {
                setCanvasState(state);
                if (state.contentSlot && state.contentSlot.type !== 'none' && state.contentSlot.data) {
                    setPresentationContent({
                        type: state.contentSlot.type,
                        data: state.contentSlot.data,
                    });
                } else if (state.contentSlot && state.contentSlot.type === 'none') {
                    setPresentationContent(null);
                }
            }
        });

        // 2. Subscribe to Timer
        let unsubTimer = null;
        if (window.electron && window.electron.Timer) {
            unsubTimer = window.electron.Timer.onSetTimer((value) => {
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

        // 3. Subscribe to Presentation content & styles
        let unsubContent = null;
        let unsubStyle = null;

        if (window.electron && window.electron.Presentation) {
            unsubContent = window.electron.Presentation.onSetContent((value) => {
                if (value && value.target && Array.isArray(value.target)) {
                    if (!value.target.includes(mode) && !value.target.includes('all') && mode !== 'controller') {
                        setPresentationContent(null);
                        return;
                    }
                }
                setPresentationContent(value);
            });
            unsubStyle = window.electron.Presentation.onSetStyle((value) => {
                if (!value) return;
                if (value.target && Array.isArray(value.target)) {
                    if (!value.target.includes(mode) && !value.target.includes('all')) return;
                }
                setPresentationStyle(prev => ({ ...prev, ...value }));
            });
            if (window.electron.Presentation.getStyle) {
                window.electron.Presentation.getStyle().then((initialStyle) => {
                    if (initialStyle && Object.keys(initialStyle).length > 0) {
                        setPresentationStyle(prev => ({ ...prev, ...initialStyle }));
                    }
                }).catch(() => {});
            }
        }

        return () => {
            if (typeof unsubCanvas === 'function') unsubCanvas();
            if (typeof unsubTimer === 'function') unsubTimer();
            if (typeof unsubContent === 'function') unsubContent();
            if (typeof unsubStyle === 'function') unsubStyle();
        };
    }, [mode]);

    useEffect(() => {
        if (countdown <= 10 && countdown > 0) {
            setBgChange(true);
        } else {
            setBgChange(false);
        }
    }, [countdown]);

    const isBlackout = !!canvasState?.chrome?.blackout;
    const isLogo = !!canvasState?.chrome?.logo;

    const renderSceneContent = () => {
        if (!presentationContent || !presentationContent.data) return null;
        const { content, pageText, style = {}, sceneType = "song" } = presentationContent.data;
        const text = pageText || content || "";
        const length = text.length;

        let fontSize = length > 600 ? 'text-[11px]' : length > 300 ? 'text-[12px]' : length > 150 ? 'text-[14px]' : length > 70 ? 'text-[16px]' : 'text-[20px]';

        if (style.fontSize && style.fontSize !== "auto") {
            const num = parseFloat(style.fontSize);
            if (!isNaN(num)) {
                const scaled = num > 15 ? num * 0.35 : num * 3.5;
                fontSize = `text-[${Math.max(10, Math.round(scaled))}px]`;
            }
        }

        const bgUrl = style.backgroundImage || style.backgroundUrl || canvasState?.background?.url || presentationStyle.backgroundImage;
        const bgVid = style.backgroundVideo || canvasState?.background?.url || presentationStyle.backgroundVideo;
        const bgColor = style.backgroundColor || presentationStyle.backgroundColor || "#0B0814";

        return (
            <div className="w-full h-full relative overflow-hidden flex flex-col justify-center items-center p-3 select-none" style={{ backgroundColor: bgColor }}>
                {bgVid && canvasState?.background?.type === "video" ? (
                    <video src={bgVid} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-60 pointer-events-none" />
                ) : bgUrl ? (
                    <img src={bgUrl} alt="Background" className="absolute inset-0 w-full h-full object-cover opacity-60 pointer-events-none" />
                ) : null}

                <div className="relative z-10 w-full flex flex-col items-center justify-center text-center">
                    <p className={`${fontSize} font-bold text-white leading-relaxed drop-shadow-md`}>
                        {text}
                    </p>
                </div>
            </div>
        );
    };

    const renderPresentationContent = () => {
        if (!presentationContent || !presentationContent.data) return null;
        const { currentSlide, slideIndex, totalSlides, title } = presentationContent.data;
        return (
            <div className="w-full h-full relative overflow-hidden flex flex-col justify-center items-center p-4 bg-[#090710] select-none">
                {currentSlide?.imageUrl ? (
                    <img src={currentSlide.imageUrl} alt="Slide" className="w-full h-full object-contain" />
                ) : (
                    <div className="flex flex-col items-center justify-center text-center space-y-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
                            {title || "Presentation"}
                        </span>
                        <p className="text-sm font-bold text-white">
                            Slide {(slideIndex != null ? slideIndex : 0) + 1} of {totalSlides || 1}
                        </p>
                    </div>
                )}
            </div>
        );
    };

    const renderBibleContent = () => {
        if (!presentationContent || !presentationContent.data) return null;
        const { title, fullText, content, translation = "KJV" } = presentationContent.data;
        const text = fullText || content || "";
        const length = text.length;
        const fontSize = length > 400 ? 'text-[11px]' : length > 200 ? 'text-[13px]' : length > 100 ? 'text-[15px]' : 'text-[18px]';

        return (
            <div className="w-full h-full relative overflow-hidden flex flex-col justify-between p-4 bg-gradient-to-b from-[#140e2b] to-[#080512] text-white select-none">
                {/* Header reference */}
                <div className="flex items-center justify-between border-b border-white/10 pb-1.5 z-10">
                    <span className="text-xs font-black text-amber-300 tracking-wide">{title || "Scripture"}</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase">{translation}</span>
                </div>

                {/* Body Text */}
                <div className="flex-1 flex items-center justify-center text-center my-2 overflow-hidden z-10">
                    <p className={`${fontSize} font-bold leading-relaxed text-white drop-shadow-md line-clamp-6`}>
                        "{text}"
                    </p>
                </div>

                <div className="flex items-center justify-between text-[9px] text-white/40 border-t border-white/5 pt-1 z-10">
                    <span>{mode === 'speaker' ? 'Stage Foldback' : 'Congregation Output'}</span>
                    <span className="text-emerald-400 font-semibold">● LIVE</span>
                </div>
            </div>
        );
    };

    const renderLogo = () => (
        <div className="w-full h-full bg-[#0d0a1a] flex flex-col items-center justify-center relative overflow-hidden select-none p-4">
            <div className="flex flex-col items-center gap-2 text-center">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center shadow-lg border border-purple-400/30">
                    <PiShieldCheckFill className="text-white text-2xl" />
                </div>
                <span className="text-xs font-black text-purple-200 uppercase tracking-wider">Church Logo Splash</span>
                <span className="text-[9px] text-purple-300/50 font-mono">Screen Muted with Branding</span>
            </div>
        </div>
    );

    const renderIdleScreen = () => {
        const bgImg = canvasState?.background?.url || presentationStyle.backgroundImage;
        const bgVid = canvasState?.background?.type === "video" ? canvasState?.background?.url : presentationStyle.backgroundVideo;
        const isSpeaker = mode === 'speaker';

        return (
            <div className="w-full h-full relative overflow-hidden bg-gradient-to-br from-[#120e26] via-[#090714] to-[#04030a] flex flex-col justify-between p-3 select-none">
                {bgVid ? (
                    <video src={bgVid} autoPlay loop muted playsInline className="w-full h-full object-cover absolute inset-0 opacity-40 pointer-events-none" />
                ) : bgImg ? (
                    <img src={bgImg} className="w-full h-full object-cover absolute inset-0 opacity-35 pointer-events-none" alt="bg" />
                ) : null}

                {/* Top bar indicator */}
                <div className="flex items-center justify-between z-10">
                    <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                        {isSpeaker ? "Output 2 • Speaker Foldback" : "Output 1 • Auditorium Main"}
                    </span>
                    <span className="text-[10px] font-mono text-white/50 font-bold">{currentTime}</span>
                </div>

                {/* Center Standby / Blackout OCS Screen */}
                <div className="flex flex-col items-center justify-center text-center my-auto z-10 space-y-1">
                    <div className="size-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-1 shadow-inner">
                        <span className="text-white font-black text-sm tracking-tighter opacity-80">OCS</span>
                    </div>
                    <span className="text-xs font-black text-white/80 tracking-wide uppercase">
                        {isSpeaker ? "Stage Confidence Display" : "Sanctuary Projection"}
                    </span>
                    <p className="text-[10px] text-emerald-400/80 font-bold tracking-widest uppercase flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        {isBlackout ? "BLACKOUT • SCREEN READY" : "STANDBY • READY"}
                    </p>
                </div>

                {/* Bottom Bar Info */}
                <div className="flex items-center justify-between text-[9px] text-white/30 border-t border-white/5 pt-1 z-10">
                    <span>1080p 60FPS</span>
                    <span>Direct Feed</span>
                </div>
            </div>
        );
    };

    const renderEvent = () => (
        <div className={`w-full h-full flex flex-col items-center justify-center p-3 ${bgChange ? "bg-red-600 animate-pulse" : "bg-[#18122c]"}`}>
            <h1 className="text-white text-xs font-black uppercase mb-1 tracking-widest">Service Starts In</h1>
            <div className={`text-3xl font-black font-mono ${bgChange ? "text-white" : "text-emerald-400"}`}>{formatTime(countdown)}</div>
        </div>
    );

    const renderDefault = () => (
        <div className={`w-full h-full flex items-center justify-center transition-colors duration-300 p-3 ${bgChange ? "bg-red-600 animate-pulse" : "bg-[#18122c]"}`}>
            <p className={`text-4xl font-black font-mono leading-none tracking-tight ${bgChange ? "text-white" : "text-emerald-400"}`}>{formatTime(countdown)}</p>
        </div>
    );

    const renderTimeUp = () => (
        <div className="w-full h-full flex items-center justify-center bg-red-600 animate-pulse">
            <h1 className="text-3xl font-black text-white uppercase tracking-tight leading-none">TIME UP</h1>
        </div>
    );

    // If Logo is active, show Logo Splash
    if (isLogo) return renderLogo();

    // If Blackout is active, return to the user's background or OCS screen
    if (isBlackout) return renderIdleScreen();

    const isPresenting = presentationContent && ['bible', 'custom', 'custom_layers', 'scene', 'presentation', 'slide_index'].includes(presentationContent.type) && presentationContent.data;
    const showSplitTimer = isPresenting && countdown > 0;

    return (
        <div className="w-full h-full flex flex-col bg-black overflow-hidden relative rounded-xl border border-white/10 shadow-inner">
            <div className="w-full flex-1 flex flex-col relative overflow-hidden">
                {isPresenting ? (
                    presentationContent.type === 'scene'
                        ? renderSceneContent()
                        : (presentationContent.type === 'presentation' || presentationContent.type === 'slide_index')
                        ? renderPresentationContent()
                        : renderBibleContent()
                ) : (
                    !showSplitTimer && (
                        countdown === null ? renderIdleScreen() : (
                            countdown === 0 ? (isEventMode ? renderIdleScreen() : renderTimeUp()) : (
                                isEventMode ? renderEvent() : renderDefault()
                            )
                        )
                    )
                )}
            </div>
            {showSplitTimer && (
                <div className={`absolute bottom-0 left-0 w-full h-[32px] flex items-center justify-center z-20 ${bgChange ? "bg-red-600" : "bg-black/80 backdrop-blur-md border-t border-white/10"}`}>
                    <p className={`text-sm font-black font-mono ${bgChange ? "text-white" : "text-emerald-400"}`}>{formatTime(countdown)}</p>
                </div>
            )}
        </div>
    );
}
