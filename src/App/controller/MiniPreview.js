import React, { useEffect, useState } from 'react';
import { renderAnimatedLyrics } from './LyricAnimationEngine';
import logoIconGray from "@/assets/wave/wave_icon_gray.png";
import {
  tokenizeVerseWithWhitespace,
  isTokenHighlighted,
  getWordHighlightStyles,
} from '../utils/bibleHighlightUtils';

export default function MiniPreview({ mode }) {
    const [countdown, setCountDown] = useState(null);
    const [bgChange, setBgChange] = useState(false);
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const [isEventMode, setIsEventMode] = useState(false);
    const [timeUp, setTimeUp] = useState(false);
    const [theme, setTheme] = useState('default');
    const [presentationContent, setPresentationContent] = useState(null);
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
        // Bible-specific display settings
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

                if (mode === 'general' && (value?.fromAgenda || !newEventMode)) {
                    setCountDown(null);
                    setIsEventMode(false);
                    setIsTimerRunning(false);
                    return;
                }

                setIsEventMode(newEventMode);
                setTheme(newTheme);
                if (value?.isRunning !== undefined) {
                    setIsTimerRunning(Boolean(value.isRunning));
                } else {
                    setIsTimerRunning(newTime > 0 && !value?.isPaused);
                }

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

        if (window.electron && window.electron.Timer && window.electron.Timer.getState) {
            window.electron.Timer.getState().then((value) => {
                if (value == null) return;
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

                if (mode === 'general' && (value?.fromAgenda || !newEventMode)) {
                    setCountDown(null);
                    setIsEventMode(false);
                    setIsTimerRunning(false);
                    return;
                }

                setIsEventMode(newEventMode);
                setTheme(newTheme);
                if (value?.isRunning !== undefined) {
                    setIsTimerRunning(Boolean(value.isRunning));
                } else {
                    setIsTimerRunning(newTime > 0 && !value?.isPaused);
                }
                if (newTime !== undefined && newTime !== null) {
                    setCountDown(newTime);
                    setTimeUp(newTime === 0);
                }
            }).catch(() => {});
        }

        let unsubContent = null;
        let unsubStyle = null;
        let unsubCanvas = null;

        if (window.electron && window.electron.Canvas) {
            if (window.electron.Canvas.getState) {
                window.electron.Canvas.getState().then((cState) => {
                    if (!cState) return;
                    if (cState.background) {
                        const bg = cState.background;
                        const isBgMedia = (bg.type === 'image' || bg.type === 'video') && Boolean(bg.url);
                        if (isBgMedia || bg.fromAgenda) {
                            const dest = bg.destination;
                            if (!dest || dest === 'all' || dest === mode || mode === 'controller') {
                                setPresentationStyle((prev) => ({
                                    ...prev,
                                    backgroundImage: bg.type === 'image' ? bg.url : null,
                                    backgroundVideo: bg.type === 'video' ? bg.url : null,
                                    backgroundColor: bg.color || prev.backgroundColor,
                                }));
                            }
                        }
                    }

                    if (cState.contentSlot && cState.contentSlot.type !== 'none' && cState.contentSlot.data) {
                        const dest = cState.contentSlot.data?.destination || cState.contentSlot.destination;
                        if (!dest || dest === 'all' || dest === mode || mode === 'controller') {
                            setPresentationContent((prev) => prev || {
                                type: cState.contentSlot.type,
                                data: cState.contentSlot.data,
                            });
                        }
                    }
                }).catch(() => {});
            }

            if (window.electron.Canvas.onCanvasSync) {
                unsubCanvas = window.electron.Canvas.onCanvasSync((cState) => {
                    if (!cState) return;

                    // Only update background from canvas if it's explicitly from agenda or an active media background
                    if (cState.background) {
                        const bg = cState.background;
                        const isBgMedia = (bg.type === 'image' || bg.type === 'video') && Boolean(bg.url);
                        if (isBgMedia || bg.fromAgenda) {
                            const dest = bg.destination;
                            if (!dest || dest === 'all' || dest === mode || mode === 'controller') {
                                setPresentationStyle((prev) => ({
                                    ...prev,
                                    backgroundImage: bg.type === 'image' ? bg.url : null,
                                    backgroundVideo: bg.type === 'video' ? bg.url : null,
                                    backgroundColor: bg.color || prev.backgroundColor,
                                }));
                            }
                        } else if (bg.url === null && bg.type === 'color') {
                            setPresentationStyle((prev) => ({
                                ...prev,
                                backgroundImage: null,
                                backgroundVideo: null,
                                backgroundColor: bg.color || prev.backgroundColor,
                            }));
                        }
                    }

                    // Update content slot from canvas sync
                    if (cState.contentSlot && cState.contentSlot.type !== 'none' && cState.contentSlot.data) {
                        const dest = cState.contentSlot.data?.destination || cState.contentSlot.destination;
                        if (!dest || dest === 'all' || dest === mode || mode === 'controller') {
                            setPresentationContent({
                                type: cState.contentSlot.type,
                                data: cState.contentSlot.data,
                            });
                        }
                    } else if (cState.contentSlot && cState.contentSlot.type === 'none') {
                        setPresentationContent(null);
                    }
                });
            }
        }

        if (window.electron && window.electron.Presentation) {
            unsubContent = window.electron.Presentation.onSetContent((value) => {
                // null = black/blank screen — must not touch .target
                if (value && value.target && Array.isArray(value.target)) {
                    if (!value.target.includes(mode) && !value.target.includes('all') && mode !== 'controller') {
                        setPresentationContent(null);
                        return;
                    }
                }
                const summary = value == null
                    ? 'null (black)'
                    : `${value.type || '?'} ${value.data?.title || ''}`.trim();
                console.log(`[MiniPreview] RENDER mode=${mode} set-content ←`, summary);
                setPresentationContent(value);
            });
            unsubStyle = window.electron.Presentation.onSetStyle((value) => {
                if (!value) return;
                if (value.target && Array.isArray(value.target)) {
                    if (!value.target.includes(mode) && !value.target.includes('all') && mode !== 'controller') return;
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
            if (window.electron.Presentation.getContent) {
                window.electron.Presentation.getContent().then((initialContent) => {
                    if (initialContent != null) {
                        if (initialContent.target && Array.isArray(initialContent.target)) {
                            if (!initialContent.target.includes(mode) && !initialContent.target.includes('all') && mode !== 'controller') {
                                return;
                            }
                        }
                        console.log(`[MiniPreview] Hydrated initial presentation content for mode=${mode}:`, initialContent.type);
                        setPresentationContent(initialContent);
                    }
                }).catch(() => {});
            }
        }

        return () => {
            if (typeof unsubTimer === 'function') unsubTimer();
            if (typeof unsubContent === 'function') unsubContent();
            if (typeof unsubStyle === 'function') unsubStyle();
            if (typeof unsubCanvas === 'function') unsubCanvas();
        };
    }, [mode]);

    useEffect(() => {
        if (countdown <= 10 && countdown > 0) {
            setBgChange(true);
        } else {
            setBgChange(false);
        }
    }, [countdown]);

    const renderSceneContent = () => {
        if (!presentationContent || !presentationContent.data) return null;
        const { content, pageText, style = {}, translation = "", sceneType = "song", navMode = "read_along" } = presentationContent.data;
        const text = pageText || content || "";
        const length = text.length;
        const isSong = sceneType === "song" || navMode === "read_along";

        // Scaled down font sizes for mini preview matching Bible preview scale
        let fontSize = length > 600 ? 'text-[11px]' : length > 300 ? 'text-[12px]' : length > 150 ? 'text-[15px]' : length > 70 ? 'text-[18px]' : 'text-[22px]';

        if (style.fontSize && style.fontSize !== "auto") {
            const num = parseFloat(style.fontSize);
            if (!isNaN(num)) {
                const scaled = num > 15 ? num * 0.35 : num * 3.5;
                fontSize = `text-[${Math.max(10, Math.round(scaled))}px]`;
            }
        }

        const alignClass = style.textAlign === "left"
            ? "text-left items-start"
            : style.textAlign === "right"
            ? "text-right items-end"
            : "text-center items-center";

        const fontClass = style.fontFamily === "serif"
            ? "font-serif"
            : style.fontFamily === "mono"
            ? "font-mono"
            : "font-sans";

        const bgColor = style.backgroundColor || "#000000";
        const textColor = style.color || "#FFFFFF";

        return (
            <div className="w-full h-full relative overflow-hidden flex flex-col justify-center items-center px-8 py-6 transition-colors" style={{ backgroundColor: bgColor }}>
                {style.backgroundImage && (
                    <div
                        className="absolute inset-0 z-0 bg-cover pointer-events-none"
                        style={{
                            backgroundImage: style.backgroundImage.startsWith('url(')
                                ? style.backgroundImage
                                : `url("${style.backgroundImage}")`,
                            backgroundPosition: style.backgroundPosition === 'top'
                                ? 'center top'
                                : style.backgroundPosition === 'bottom'
                                ? 'center bottom'
                                : 'center center',
                            opacity: typeof style.backgroundOpacity === 'number' ? style.backgroundOpacity : 0.85,
                        }}
                    />
                )}
                {style.backgroundImage && (
                    <div className="absolute inset-0 z-0 bg-black/40 pointer-events-none" />
                )}
                <div className={`w-full max-w-[92%] flex justify-center my-auto px-2 z-10 ${alignClass}`}>
                    <div
                        className={`leading-relaxed whitespace-pre-wrap ${fontClass} ${fontSize}`}
                        style={{
                            color: textColor,
                            fontWeight: style.fontWeight || "600",
                            fontStyle: style.isItalic ? "italic" : "normal",
                            textDecoration: style.isUnderline ? "underline" : "none",
                            textAlign: style.textAlign || "center",
                            lineHeight: style.lineHeight || "1.45",
                            textShadow: style.textShadow === "none"
                                ? "none"
                                : style.textShadow === "soft"
                                ? "0 2px 8px rgba(0,0,0,0.65)"
                                : "0 4px 16px rgba(0,0,0,0.85), 0 1px 3px rgba(0,0,0,0.9)",
                            maxWidth: "96%",
                            width: "100%",
                        }}
                    >
                        {renderAnimatedLyrics({
                            text,
                            translation: translation || "",
                            currentWordIndex: -1,
                            animationType: style.animation || "karaoke",
                            style,
                            isSingAlong: isSong,
                            enableWordTracking: false,
                        })}
                    </div>
                </div>
            </div>
        );
    };

    const renderCustomLayersContent = () => {
        if (!presentationContent || !presentationContent.data) return null;
        const { background: bg = {}, layers = [] } = presentationContent.data;
        const bgUrl = bg.url || presentationStyle.backgroundImage || presentationStyle.backgroundVideo;
        const isBgVid = bg.type === 'video' || (bgUrl && /\.(mp4|webm|mov)$/i.test(bgUrl));

        const sortedLayers = [...layers].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

        return (
            <div className="w-full h-full relative overflow-hidden bg-black flex items-center justify-center pointer-events-none select-none">
                {bgUrl && (
                    <div className="absolute inset-0 z-0">
                        {isBgVid ? (
                            <video src={bgUrl} autoPlay loop muted playsInline className="w-full h-full object-cover" />
                        ) : (
                            <img src={bgUrl} className="w-full h-full object-cover" alt="bg" />
                        )}
                    </div>
                )}
                {sortedLayers.map((layer) => {
                    const x = layer.x != null ? `${layer.x}%` : '50%';
                    const y = layer.y != null ? `${layer.y}%` : '50%';
                    return (
                        <div
                            key={layer.id || Math.random()}
                            className="absolute pointer-events-none"
                            style={{
                                left: x,
                                top: y,
                                transform: 'translate(-50%, -50%)',
                                width: (layer.type === 'image' || layer.type === 'video') ? `${layer.style?.width || 30}%` : 'auto',
                                zIndex: layer.zIndex || 10,
                            }}
                        >
                            {layer.type === 'text' ? (
                                <p
                                    className="whitespace-pre-wrap text-center px-1 font-bold text-white"
                                    style={{
                                        fontSize: `${Math.max(10, Math.round((layer.style?.fontSize || 5) * 2.2))}px`,
                                        color: layer.style?.color || '#ffffff',
                                    }}
                                >
                                    {layer.content}
                                </p>
                            ) : layer.type === 'video' ? (
                                <video src={layer.content} autoPlay loop muted playsInline className="w-full h-auto rounded-[12px]" />
                            ) : (
                                <img src={layer.content} className="w-full h-auto rounded-[12px]" alt="layer" />
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderPresentationContent = () => {
        if (!presentationContent || !presentationContent.data) return null;
        const { slideUrl, slideImageUrl, url, slideIndex = 0, slideCount = 0, notes } = presentationContent.data;
        const imgUrl = slideUrl || slideImageUrl || url;
        if (!imgUrl) return null;

        return (
            <div className="w-full h-full relative overflow-hidden flex flex-col bg-black items-center justify-center p-2">
                <img src={imgUrl} className="w-full h-full object-contain pointer-events-none" alt="Slide" />
                {slideCount > 0 && (
                    <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded text-[10px] font-mono text-white/70 border border-white/10">
                        Slide {slideIndex + 1}/{slideCount}
                    </div>
                )}
                {notes && mode === 'speaker' && (
                    <div className="absolute bottom-2 left-2 max-w-[70%] bg-black/85 px-2 py-1 rounded text-[10px] text-yellow-300 border border-yellow-500/30 truncate">
                        📝 {notes}
                    </div>
                )}
            </div>
        );
    };

    const renderBibleContent = () => {
        if (!presentationContent || !presentationContent.data) return null;
        const {
            title,
            body,
            readAlong,
            rangeStart,
            rangeEnd,
            currentVerse,
            manualHighlights = [],
            bibleHighlightColor = '#FFEB3B',
            verseOffsets = {},
            version = 'KJV',
            bookIndex = 0,
            chapterIndex = 0,
        } = presentationContent.data;
        const safeBody = body || "";
        const manualHighlightSet = new Set(manualHighlights || []);
        const effectiveHlColor = presentationStyle?.bibleHighlightColor || presentationContent.data.bibleHighlightColor || bibleHighlightColor || '#FFEB3B';
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
            bibleReadAlongTransition = 'text-glow',
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
            'bottom-left': 'items-end justify-start text-left pb-8 pl-8',
            'bottom-right': 'items-end justify-end text-right pb-8 pr-8',
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

                {mode === 'speaker' && presentationContent?.data?.isPresentationOverlay && (
                    <div className="absolute top-2 right-2 z-30 flex items-center gap-1 bg-black/80 border border-cyan-400/50 text-cyan-200 px-2 py-0.5 rounded-full text-[9px] font-bold shadow-lg animate-pulse">
                        <span>↩ {presentationContent?.data?.overlayPrompt || 'Say "return" to resume presentation'}</span>
                    </div>
                )}

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
                        paddingLeft: 24,
                        paddingRight: 24,
                        paddingTop: 28,
                        paddingBottom: 24,
                    }}
                >
                    <p
                        className={`${fontSize}`}
                        style={{
                            fontFamily: '"Outfit", "Space Grotesk", sans-serif',
                            fontWeight: useReadAlong ? 600 : 800,
                            lineHeight: 1.25,
                            maxWidth: '88%',
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '0 4px',
                            margin: '0 auto',
                            textShadow: '0 2px 10px rgba(0,0,0,0.5)',
                            overflowWrap: 'anywhere',
                            wordBreak: 'break-word',
                        }}
                    >
                        {useReadAlong ? (
                            readAlong.tokens.map((tok, i) => {
                                const isActive = i === activeIdx;
                                const isPast = activeIdx >= 0 && i < activeIdx;
                                const isManualHL = isTokenHighlighted(i, manualHighlightSet, verseOffsets, {
                                    version,
                                    bookIndex,
                                    chapterIndex,
                                });
                                const trans = bibleReadAlongTransition || 'text-glow';
                                const wordStyle = getWordHighlightStyles({
                                    isManualHL,
                                    isActiveVoice: isActive,
                                    isPastVoice: isPast,
                                    highlightColor: effectiveHlColor,
                                    voiceTransition: trans,
                                    baseTextColor: '#FFFFFF',
                                });

                                return (
                                    <React.Fragment key={`${i}-${tok}`}>
                                        <span
                                            className="ocs-ra-word-mini"
                                            data-i={i}
                                            style={wordStyle}
                                        >
                                            {tok}
                                        </span>
                                        {i < readAlong.tokens.length - 1 ? ' ' : ''}
                                    </React.Fragment>
                                );
                            })
                        ) : (
                            (() => {
                                const bodyParts = tokenizeVerseWithWhitespace(safeBody);
                                let wordCount = 0;
                                return bodyParts.map((part, i) => {
                                    if (/^\s+$/.test(part)) {
                                        return <React.Fragment key={`ws-${i}`}>{part}</React.Fragment>;
                                    }
                                    const absWordIdx = wordCount++;
                                    const isHL = isTokenHighlighted(absWordIdx, manualHighlightSet, verseOffsets, {
                                        version,
                                        bookIndex,
                                        chapterIndex,
                                    });
                                    const wordStyle = getWordHighlightStyles({
                                        isManualHL: isHL,
                                        isActiveVoice: false,
                                        isPastVoice: false,
                                        highlightColor: effectiveHlColor,
                                        baseTextColor: '#FFFFFF',
                                    });

                                    return (
                                        <span
                                            key={`w-${i}`}
                                            data-i={absWordIdx}
                                            style={wordStyle}
                                        >
                                            {part}
                                        </span>
                                    );
                                });
                            })()
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

    const renderIdleScreen = () => {
        const bgImg = presentationStyle.backgroundImage;
        const bgVid = presentationStyle.backgroundVideo;
        const bgColor = presentationStyle.backgroundColor || '#0B0814';

        if (bgImg) {
            return (
                <div className="w-full h-full relative overflow-hidden bg-black flex items-center justify-center">
                    <img
                        src={bgImg}
                        className="w-full h-full object-cover absolute inset-0"
                        alt="bg"
                    />
                </div>
            );
        }
        if (bgVid) {
            return (
                <div className="w-full h-full relative overflow-hidden bg-black flex items-center justify-center">
                    <video
                        src={bgVid}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="w-full h-full object-cover absolute inset-0"
                    />
                </div>
            );
        }
        return (
            <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: bgColor }}>
                <div className="flex flex-col items-center animate-pulse">
                    <img
                        src={logoIconGray}
                        alt="Service is Starting"
                        className="w-16 h-16 object-contain opacity-25"
                    />
                </div>
            </div>
        );
    };

    const renderTimeUp = () => (
        <div className="w-full h-full flex items-center justify-center bg-red-600 animate-pulse">
            <h1 className="text-5xl font-black text-white uppercase tracking-tight leading-none">TIME UP</h1>
        </div>
    );

    const renderMediaContent = () => {
        if (!presentationContent) return null;
        const type = presentationContent.type;
        const data = presentationContent.data || {};
        const url = data.url || presentationContent.url;
        if (!url) return null;

        if (type === 'video') {
            return (
                <div className="w-full h-full relative overflow-hidden bg-black flex items-center justify-center">
                    <video
                        src={url}
                        autoPlay
                        loop={data.loop !== false}
                        muted
                        playsInline
                        className={`w-full h-full ${data.fit === 'cover' ? 'object-cover' : 'object-contain'}`}
                    />
                </div>
            );
        }
        if (type === 'image') {
            return (
                <div className="w-full h-full relative overflow-hidden bg-black flex items-center justify-center">
                    <img
                        src={url}
                        className={`w-full h-full ${data.fit === 'cover' ? 'object-cover' : 'object-contain'}`}
                        alt="Preview Media"
                    />
                </div>
            );
        }
        return null;
    };

    const hasBackgroundMedia = Boolean(
        presentationStyle.backgroundImage || presentationStyle.backgroundVideo
    );
    const hasForegroundContent = Boolean(
        presentationContent &&
        ['bible', 'custom', 'custom_layers', 'scene', 'presentation', 'slide_index', 'video', 'image'].includes(presentationContent.type) &&
        (presentationContent.data || presentationContent.url)
    );
    const isPresenting = hasForegroundContent || hasBackgroundMedia;
    // General Screen and its preview must display scheduled media without an agenda timer overlay.
    // Speaker View split-timer renders ONLY when isRunning === true
    const showSplitTimer = mode !== 'general' && isPresenting && countdown > 0 && isTimerRunning;

    return (
        <div className="w-full h-full flex flex-col bg-black overflow-hidden relative">
            <div className="w-full flex-1 flex flex-col relative overflow-hidden">
                {isPresenting ? (
                    hasForegroundContent ? (
                        (presentationContent.type === 'video' || presentationContent.type === 'image')
                            ? renderMediaContent()
                            : presentationContent.type === 'custom_layers'
                            ? renderCustomLayersContent()
                            : presentationContent.type === 'scene'
                            ? renderSceneContent()
                            : (presentationContent.type === 'presentation' || presentationContent.type === 'slide_index')
                            ? renderPresentationContent()
                            : renderBibleContent()
                    ) : (
                        renderIdleScreen()
                    )
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
                <div className={`absolute bottom-0 left-0 w-full h-[40px] flex items-center justify-center z-20 ${bgChange ? "bg-red-600" : "bg-black/60 backdrop-blur-md border-t border-white/10"}`}>
                    <p className={`text-xl font-bold ${bgChange ? "text-white" : "text-green-500"}`}>{formatTime(countdown)}</p>
                </div>
            )}
        </div>
    );
}
