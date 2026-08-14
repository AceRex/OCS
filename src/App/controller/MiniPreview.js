import React, { useEffect, useState } from 'react';

export default function MiniPreview({ mode }) {
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

        let unsubContent = null;
        let unsubStyle = null;

        if (window.electron && window.electron.Presentation) {
            unsubContent = window.electron.Presentation.onSetContent((value) => {
                // null = black/blank screen — must not touch .target
                if (value && value.target && Array.isArray(value.target)) {
                    if (!value.target.includes(mode) && !value.target.includes('all') && mode !== 'controller') return;
                }
                const summary = value == null
                    ? 'null (black)'
                    : `${value.type || '?'} ${value.data?.title || ''}`.trim();
                console.log('[MiniPreview] RENDER set-content ←', summary);
                setPresentationContent(value);
            });
            unsubStyle = window.electron.Presentation.onSetStyle((value) => {
                if (!value) return;
                if (value.target && Array.isArray(value.target)) {
                    if (!value.target.includes(mode) && !value.target.includes('all')) return;
                }
                setPresentationStyle(prev => ({ ...prev, ...value }));
            });
        }

        return () => {
            if (window.electron && window.electron.Timer) {
                window.electron.Timer.removeSetTimerListener();
            }
            // Prefer per-listener disposer — removeAllListeners would kill sibling MiniPreviews
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

    const renderBibleContent = () => {
        if (!presentationContent || !presentationContent.data) return null;
        const { title, body, readAlong, rangeStart, rangeEnd, currentVerse } = presentationContent.data;
        const safeBody = body || "";
        const length = safeBody.length;
        const useReadAlong = readAlong?.enabled
            && Array.isArray(readAlong.tokens)
            && readAlong.tokens.length > 0;
        const activeIdx = typeof readAlong?.activeIndex === 'number' ? readAlong.activeIndex : -1;

        // Scaled down font sizes for preview
        let fontSize = length > 600 ? 'text-[11px]' : length > 300 ? 'text-[12px]' : length > 150 ? 'text-[16px]' : 'text-[22px]';

        const {
            backgroundColor = '#0B0814',
            textColor = '#F5F2FA',
            backgroundImage,
            backgroundVideo,
            bibleRefPosition = 'top-center',
            bibleBodyPosition = 'center',
            bibleTranslation = 'KJV',
            bibleServiceLabel = '',
            bibleShowOrbs = true,
        } = presentationStyle;

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
            'top-center': 'top-4 left-1/2 -translate-x-1/2',
            'top-left': 'top-4 left-4',
            'top-right': 'top-4 right-4',
            'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
            'bottom-left': 'bottom-4 left-4',
            'bottom-right': 'bottom-4 right-4',
        };

        const bodyAlignMap = {
            'center': 'items-center justify-center text-center',
            'bottom-left': 'items-end justify-end text-left pb-16 pl-8',
            'bottom-right': 'items-end justify-end text-right pb-16 pr-8',
        };

        const refPosClass = refPositionMap[bibleRefPosition] || refPositionMap['top-center'];
        const bodyAlign = bodyAlignMap[bibleBodyPosition] || bodyAlignMap['center'];
        const useCustomBg = !!backgroundImage || !!backgroundVideo;
        const bgColor = useCustomBg ? '#000000' : backgroundColor;

        return (
            <div className="w-full h-full relative overflow-hidden flex flex-col" style={{ backgroundColor: bgColor }}>
                {bibleShowOrbs && !useCustomBg && (
                    <>
                        <div className="absolute pointer-events-none" style={{
                            top: '-20%', left: '-20%', width: '60%', height: '60%', borderRadius: '50%',
                            background: 'radial-gradient(circle, rgba(167,136,250,0.55) 0%, rgba(167,136,250,0.12) 55%, transparent 70%)', filter: 'blur(2px)'
                        }} />
                        <div className="absolute pointer-events-none" style={{
                            bottom: '-20%', right: '-20%', width: '55%', height: '55%', borderRadius: '50%',
                            background: 'radial-gradient(circle, rgba(103,232,249,0.45) 0%, rgba(103,232,249,0.10) 55%, transparent 70%)', filter: 'blur(2px)'
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

                {title && (
                    <div className={`absolute z-20 flex items-center gap-1 ${refPosClass}`}>
                        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '10px', fontWeight: 700, letterSpacing: '0.15em', color: '#67E8F9', textTransform: 'uppercase' }}>
                            {bookLabel} {cvLabel && <>· <span style={{ color: '#A788FA' }}>{cvLabel}</span></>}
                        </span>
                    </div>
                )}

                <div
                    className={`w-full h-full flex ${bodyAlign} z-10 relative`}
                    style={{
                        overflow: 'hidden',
                        boxSizing: 'border-box',
                        paddingLeft: useReadAlong ? 0 : 32,
                        paddingRight: useReadAlong ? 0 : 32,
                    }}
                >
                    <p
                        className={`${fontSize}`}
                        style={{
                            fontFamily: '"Outfit", "Space Grotesk", sans-serif',
                            fontWeight: useReadAlong ? 600 : 800,
                            color: textColor,
                            lineHeight: 1.15,
                            maxWidth: useReadAlong ? '100%' : '95%',
                            width: useReadAlong ? '100%' : undefined,
                            boxSizing: 'border-box',
                            padding: 0,
                            margin: 0,
                            textShadow: '0 2px 10px rgba(0,0,0,0.5)',
                            overflowWrap: 'anywhere',
                            wordBreak: 'break-word',
                        }}
                    >
                        {useReadAlong ? (
                            readAlong.tokens.map((tok, i) => {
                                const isActive = i === activeIdx;
                                const isPast = activeIdx >= 0 && i < activeIdx;
                                return (
                                    <span
                                        key={`${i}-${tok}`}
                                        className="ocs-ra-word-mini"
                                        data-i={i}
                                        style={{
                                            display: 'inline',
                                            fontWeight: 600,
                                            color: isActive ? '#FFFFFF' : textColor,
                                            opacity: isActive ? 1 : (isPast ? 0.42 : 0.58),
                                            transition: 'color 180ms cubic-bezier(0.33, 1, 0.68, 1), opacity 180ms cubic-bezier(0.33, 1, 0.68, 1), text-shadow 180ms cubic-bezier(0.33, 1, 0.68, 1)',
                                            textShadow: isActive
                                                ? '0 0 0.5px #fff, 0 0 0.5px #fff, 0 0 8px rgba(255,255,255,0.2), 0 2px 10px rgba(0,0,0,0.5)'
                                                : '0 2px 10px rgba(0,0,0,0.5)',
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

                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
                    <span style={{ fontFamily: '"Outfit", sans-serif', fontSize: '9px', fontWeight: 600, color: 'rgba(245,242,250,0.45)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                        {bibleTranslation} {bibleServiceLabel && <>· <span style={{ color: 'rgba(245,242,250,0.35)' }}>{bibleServiceLabel}</span></>}
                    </span>
                </div>
            </div>
        );
    };

    const renderEvent = () => (
        <div className={`w-full h-full flex flex-col items-center justify-center ${bgChange ? "bg-red-600" : "bg-[#282828]"}`}>
            <h1 className="text-white text-sm font-bold uppercase mb-1 tracking-widest">Event Starts In</h1>
            <div className={`text-4xl font-bold ${bgChange ? "text-white" : "text-green-500"}`}>{formatTime(countdown)}</div>
        </div>
    );

    const renderDefault = () => (
        <div className={`w-full h-full flex items-center justify-center transition-colors duration-300 ${bgChange ? "bg-red-600 animate-pulse" : "bg-[#282828]"}`}>
            <p className={`text-5xl font-bold leading-none tracking-tight ${bgChange ? "text-white" : "text-green-500"}`}>{formatTime(countdown)}</p>
        </div>
    );

    const renderIdleScreen = () => (
        <div className="w-full h-full flex items-center justify-center bg-[#282828]">
            <div className="flex flex-col items-center animate-pulse scale-75">
                <h1 className="text-5xl font-black text-white tracking-tighter leading-none opacity-20">OCS</h1>
                <p className="text-white/30 text-xs font-bold tracking-[0.5em] uppercase mt-2">Service is Starting</p>
            </div>
        </div>
    );

    const renderTimeUp = () => (
        <div className="w-full h-full flex items-center justify-center bg-red-600 animate-pulse">
            <h1 className="text-5xl font-black text-white uppercase tracking-tight leading-none">TIME UP</h1>
        </div>
    );

    const isPresenting = presentationContent && (presentationContent.type === 'bible' || presentationContent.type === 'custom') && presentationContent.data;
    const showSplitTimer = isPresenting && countdown > 0;

    return (
        <div className="w-full h-full flex flex-col bg-black overflow-hidden relative">
            <div className="w-full flex-1 flex flex-col relative overflow-hidden">
                {isPresenting ? renderBibleContent() : (
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
                <div className={`absolute bottom-0 left-0 w-full h-[40px] flex items-center justify-center z-20 ${bgChange ? "bg-red-600" : "bg-black/60 backdrop-blur-md border-t border-white/10"}`}>
                    <p className={`text-xl font-bold ${bgChange ? "text-white" : "text-green-500"}`}>{formatTime(countdown)}</p>
                </div>
            )}
        </div>
    );
}
