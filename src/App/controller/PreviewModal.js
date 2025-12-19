import React, { useEffect, useState } from 'react';
import { PiX } from "react-icons/pi";

export default function PreviewModal({ isOpen, onClose }) {
    const [countdown, setCountDown] = useState(null);
    const [bgChange, setBgChange] = useState(false);
    const [timeUp, setTimeUp] = useState(false);
    const [isEventMode, setIsEventMode] = useState(false);
    const [theme, setTheme] = useState("default");
    const [presentationContent, setPresentationContent] = useState(null);
    const [presentationStyle, setPresentationStyle] = useState({
        backgroundColor: '#000000',
        textColor: '#FFFFFF',
        fontFamily: 'serif',
        backgroundImage: null,
        backgroundVideo: null
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
        // Listen to Timer Updates
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

        // Listen to Content Updates
        electron.Presentation.onSetContent(setPresentationContent);
        electron.Presentation.onSetStyle((value) => {
            setPresentationStyle(prev => ({ ...prev, ...value }));
        });

        return () => {
            electron.Timer.removeSetTimerListener();
            electron.Presentation.removeSetContentListener();
            electron.Presentation.removeSetStyleListener();
        };
    }, []);

    useEffect(() => {
        if (countdown <= 10 && countdown > 0) {
            setBgChange(true);
        } else {
            setBgChange(false);
        }
    }, [countdown]);

    // Render Helpers (Scaled down logic from View.js)
    const renderBibleContent = () => {
        if (!presentationContent || !presentationContent.data) return null;
        const { title, body } = presentationContent.data;
        const safeBody = body || "";
        const length = safeBody.length;

        // Approximate scaling for preview
        let fontSize = 'text-[24px]';
        if (length > 400) fontSize = 'text-[12px]';
        else if (length > 250) fontSize = 'text-[14px]';
        else if (length > 150) fontSize = 'text-[18px]';
        else if (length > 80) fontSize = 'text-[20px]';

        const { backgroundColor, textColor, fontFamily, backgroundImage, backgroundVideo } = presentationStyle;

        const styleObj = {
            backgroundColor: (!backgroundImage && !backgroundVideo) ? backgroundColor : 'transparent',
            color: textColor,
            fontFamily: fontFamily === 'serif' ? 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif' :
                fontFamily === 'sans' ? 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' : fontFamily
        };

        return (
            <section className="w-full h-full flex flex-col items-center justify-center p-8 text-center relative overflow-hidden" style={styleObj}>
                {backgroundVideo ? (
                    <video className="absolute inset-0 w-full h-full object-cover z-0" autoPlay loop muted playsInline>
                        <source src={backgroundVideo} />
                    </video>
                ) : backgroundImage ? (
                    <img src={backgroundImage} className="absolute inset-0 w-full h-full object-cover z-0" alt="bg" />
                ) : null}

                {(backgroundVideo || backgroundImage) && <div className="absolute inset-0 w-full h-full bg-black/40 z-1" />}

                <div className="flex-1 flex flex-col items-center justify-center gap-4 z-10 relative w-full">
                    <p className={`${fontSize} font-bold leading-tight max-w-[95%] drop-shadow-lg`}>{safeBody}</p>
                </div>
                {title && <div className="mb-4 text-sm font-medium opacity-80 uppercase tracking-widest z-10 relative drop-shadow-md">{title}</div>}
            </section>
        );
    };

    const renderEvent = () => (
        <div className={`w-full h-full flex flex-col items-center justify-center ${bgChange ? "bg-red" : "bg-primary"}`}>
            <h1 className="text-light text-xl font-bold uppercase mb-2 tracking-widest">Event Timer</h1>
            <div className={`text-6xl font-bold ${bgChange ? "text-light" : "text-green"}`}>{formatTime(countdown)}</div>
        </div>
    );

    const renderDefault = () => (
        <div className={`w-full h-full flex items-center justify-center transition-colors duration-300 ${bgChange ? "bg-red animate-pulse" : "bg-green"}`}>
            <p className={`text-8xl font-bold leading-none tracking-tight ${bgChange ? "text-light" : "text-primary"}`}>{formatTime(countdown)}</p>
        </div>
    );

    const renderIdleScreen = () => (
        <div className="w-full h-full flex items-center justify-center bg-primary">
            <div className="flex flex-col items-center animate-pulse scale-50">
                <h1 className="text-6xl font-black text-light tracking-tighter leading-none opacity-20">OCS</h1>
                <p className="text-light/30 text-lg font-medium tracking-[1em] uppercase mt-2">Service is Starting</p>
            </div>
        </div>
    );

    const renderTimeUp = () => (
        <div className="w-full h-full flex items-center justify-center bg-red animate-pulse">
            <h1 className="text-6xl font-black text-light uppercase tracking-tight leading-none">TIME UP</h1>
        </div>
    );

    const isPresenting = presentationContent && (presentationContent.type === 'bible' || presentationContent.type === 'custom') && presentationContent.data;
    const showSplitTimer = isPresenting && countdown > 0;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-primary border border-white/10 w-[80vw] max-w-[800px] aspect-video rounded-2xl shadow-2xl flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="h-12 bg-white/5 flex items-center justify-between px-4 border-b border-white/5">
                    <span className="text-sm font-bold text-light uppercase tracking-widest">Audience View Preview</span>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-light transition-colors">
                        <PiX size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 bg-black flex items-center justify-center relative overflow-hidden">
                    <div className={`w-full h-full flex flex-col`}>
                        <div className={`w-full flex-1 flex flex-col relative`}>
                            {isPresenting ? renderBibleContent() : (
                                !showSplitTimer && (
                                    countdown === null ? renderIdleScreen() : (
                                        countdown === 0 ? renderTimeUp() : (
                                            isEventMode ? renderEvent() : renderDefault()
                                        )
                                    )
                                )
                            )}
                        </div>
                        {showSplitTimer && (
                            <div className={`absolute bottom-0 left-0 w-full h-[60px] flex items-center justify-center z-20 ${bgChange ? "bg-red" : "bg-black/50 backdrop-blur-md"}`}>
                                <p className={`text-3xl font-bold ${bgChange ? "text-light" : "text-green"}`}>{formatTime(countdown)}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
