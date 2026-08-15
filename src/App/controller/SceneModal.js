import React, { useState, useEffect, useMemo, useRef } from "react";
import {
    PiFileText, PiBookmarkSimple, PiDeviceMobile,
    PiPlus, PiTrash, PiX,
    PiTextAlignLeft, PiTextAlignCenter, PiTextAlignRight,
    PiFloppyDisk, PiListBullets, PiListNumbers,
    PiArrowRight, PiArrowLeft, PiScissors,
    PiCaretDown, PiMusicNotes, PiImage, PiSparkle,
    PiRepeat, PiCheck, PiUploadSimple, PiGlobe,
} from "react-icons/pi";
import { LYRIC_ANIMATIONS, READ_ALONG_ANIMATIONS, renderAnimatedLyrics } from "./LyricAnimationEngine";

/**
 * SceneModal — High-Fidelity Scene & Song Editor
 *
 * Features:
 * - Scene Content Type: Song (with Verses & Chorus flow) vs Text
 * - Section tagging for Song pages: Verse, Chorus, Bridge
 * - Repeats: Set 1x, 2x (X2), 3x (X3), 4x (X4) on any verse or chorus!
 * - Auto Chorus return toggle
 * - Background Image upload / selection with opacity control
 * - Text Animations: Fade In, Slide Up, Zoom In, None
 * - Ordered & Unordered list formatting
 * - Smart Enter list auto-continuation & exit
 * - Smart HTML/Plaintext paste parser
 * - Smart "Split to Next Page" (Shift+Enter / button)
 */
export default function SceneModal({
    isOpen,
    scene,
    onClose,
    onSave,
}) {
    if (!isOpen || !scene) return null;

    const [currentScene, setCurrentScene] = useState(() => ({
        ...scene,
        sceneType: scene.sceneType || "song",
        autoChorus: scene.autoChorus !== false,
        navMode: scene.navMode || "read_along",
        pages: Array.isArray(scene.pages) && scene.pages.length > 0
            ? scene.pages.map((p, idx) => ({
                id: p.id || `pg-${Date.now()}-${idx}`,
                content: p.content || "",
                sectionType: p.sectionType || (idx === 1 && scene.sceneType === "song" ? "chorus" : "verse"),
                label: p.label || (scene.sceneType === "song" ? (idx === 1 ? "Chorus" : `Verse ${idx + 1}`) : `Page ${idx + 1}`),
                repeatCount: typeof p.repeatCount === "number" && p.repeatCount >= 1 ? p.repeatCount : 1,
            }))
            : [{ id: `pg-${Date.now()}`, content: "", sectionType: "verse", label: "Verse 1", repeatCount: 1 }],
        style: {
            fontFamily: "Inter Tight",
            fontWeight: "600",
            fontSize: "auto",
            lineHeight: "1.45",
            color: "#FFFFFF",
            backgroundColor: "#000000",
            backgroundImage: scene.style?.backgroundImage || null,
            backgroundOpacity: typeof scene.style?.backgroundOpacity === "number" ? scene.style.backgroundOpacity : 0.85,
            backgroundPosition: scene.style?.backgroundPosition || "center",
            textShadow: scene.style?.textShadow || "strong",
            animation: scene.style?.animation || "fade",
            textAlign: scene.style?.textAlign || "center",
            isItalic: false,
            isUnderline: false,
            ...(scene.style || {}),
        },
    }));

    const [activePageIdx, setActivePageIdx] = useState(0);
    const [isBgModalOpen, setIsBgModalOpen] = useState(false);
    const [isAnimMenuOpen, setIsAnimMenuOpen] = useState(false);
    const [hoveredAnimation, setHoveredAnimation] = useState(null);
    const [hoverWordIndex, setHoverWordIndex] = useState(-1);
    const [mediaAssets, setMediaAssets] = useState([]);
    const textareaRef = useRef(null);
    const animMenuRef = useRef(null);

    // Live Simulated Word-by-Word Progression during Animation Hover
    useEffect(() => {
        if (!hoveredAnimation) {
            setHoverWordIndex(-1);
            return;
        }
        const textSample = (currentScene.pages[activePageIdx]?.content || "").trim() || "Amazing grace how sweet the sound that saved a wretch like me";
        const words = textSample.split(/\s+/).filter(Boolean);
        const total = words.length;
        let cur = -1;
        const timer = setInterval(() => {
            cur = (cur + 1) % (total + 4);
            setHoverWordIndex(cur < total ? cur : -1);
        }, 320);
        return () => clearInterval(timer);
    }, [hoveredAnimation, activePageIdx, currentScene.pages]);

    // Close animation menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (animMenuRef.current && !animMenuRef.current.contains(e.target)) {
                setIsAnimMenuOpen(false);
                setHoveredAnimation(null);
            }
        };
        if (isAnimMenuOpen) {
            document.addEventListener("mousedown", handleClickOutside);
            return () => document.removeEventListener("mousedown", handleClickOutside);
        }
    }, [isAnimMenuOpen]);

    const loadMediaAssets = async () => {
        try {
            if (window.electron?.Media?.list) {
                const files = await window.electron.Media.list();
                if (Array.isArray(files)) {
                    setMediaAssets(files);
                }
            }
        } catch (e) {
            console.error("Failed to load media assets:", e);
        }
    };

    useEffect(() => {
        loadMediaAssets();
    }, []);

    // Sync if scene prop changes
    useEffect(() => {
        if (scene) {
            setCurrentScene({
                ...scene,
                sceneType: scene.sceneType || "song",
                autoChorus: scene.autoChorus !== false,
                navMode: scene.navMode || "read_along",
                pages: Array.isArray(scene.pages) && scene.pages.length > 0
                    ? scene.pages.map((p, idx) => ({
                        id: p.id || `pg-${Date.now()}-${idx}`,
                        content: p.content || "",
                        sectionType: p.sectionType || (idx === 1 && (scene.sceneType || "song") === "song" ? "chorus" : "verse"),
                        label: p.label || ((scene.sceneType || "song") === "song" ? (idx === 1 ? "Chorus" : `Verse ${idx + 1}`) : `Page ${idx + 1}`),
                        repeatCount: typeof p.repeatCount === "number" && p.repeatCount >= 1 ? p.repeatCount : 1,
                    }))
                    : [{ id: `pg-${Date.now()}`, content: "", sectionType: "verse", label: "Verse 1", repeatCount: 1 }],
                style: {
                    fontFamily: "Inter Tight",
                    fontWeight: "600",
                    fontSize: "auto",
                    lineHeight: "1.45",
                    color: "#FFFFFF",
                    backgroundColor: "#000000",
                    backgroundImage: scene.style?.backgroundImage || null,
                    backgroundOpacity: typeof scene.style?.backgroundOpacity === "number" ? scene.style.backgroundOpacity : 0.85,
                    backgroundPosition: scene.style?.backgroundPosition || "center",
                    textShadow: scene.style?.textShadow || "strong",
                    animation: scene.style?.animation || "fade",
                    textAlign: scene.style?.textAlign || "center",
                    isItalic: false,
                    isUnderline: false,
                    ...(scene.style || {}),
                },
            });
            setActivePageIdx(0);
        }
    }, [scene]);

    // Recalculate default labels when pages change
    const updatePageLabels = (pagesList, sceneType) => {
        let vNum = 1;
        return pagesList.map((p, idx) => {
            const repeat = typeof p.repeatCount === "number" && p.repeatCount >= 1 ? p.repeatCount : 1;
            if (sceneType === "text") {
                return { ...p, sectionType: "page", label: `Page ${idx + 1}`, repeatCount: repeat };
            }
            if (p.sectionType === "chorus") {
                return { ...p, label: "Chorus", repeatCount: repeat };
            }
            if (p.sectionType === "bridge") {
                return { ...p, label: "Bridge", repeatCount: repeat };
            }
            return { ...p, sectionType: "verse", label: `Verse ${vNum++}`, repeatCount: repeat };
        });
    };

    const activePage = currentScene.pages[activePageIdx] || currentScene.pages[0] || { content: "", translation: "", sectionType: "verse", label: "Verse 1", repeatCount: 1 };

    const handleContentChange = (val) => {
        setCurrentScene((prev) => ({
            ...prev,
            pages: prev.pages.map((p, idx) => (idx === activePageIdx ? { ...p, content: val } : p)),
        }));
    };

    const handleTranslationChange = (val) => {
        setCurrentScene((prev) => ({
            ...prev,
            pages: prev.pages.map((p, idx) => (idx === activePageIdx ? { ...p, translation: val } : p)),
        }));
    };

    const handleSceneTypeChange = (type) => {
        setCurrentScene(prev => {
            const updated = updatePageLabels(prev.pages, type);
            return { ...prev, sceneType: type, navMode: type === "song" ? "read_along" : prev.navMode, pages: updated };
        });
    };

    const handleSectionTypeChange = (secType) => {
        setCurrentScene(prev => {
            const pages = prev.pages.map((p, idx) => {
                if (idx === activePageIdx) {
                    return { ...p, sectionType: secType };
                }
                return p;
            });
            return { ...prev, pages: updatePageLabels(pages, prev.sceneType) };
        });
    };

    const handleRepeatCountChange = (count) => {
        setCurrentScene(prev => ({
            ...prev,
            pages: prev.pages.map((p, idx) => idx === activePageIdx ? { ...p, repeatCount: count } : p),
        }));
    };

    const handleAddPage = (secType = "verse") => {
        const newPageObj = {
            id: `pg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            content: "",
            sectionType: secType,
            repeatCount: 1,
        };
        const newPages = [...currentScene.pages, newPageObj];
        const updated = updatePageLabels(newPages, currentScene.sceneType);
        setCurrentScene(prev => ({ ...prev, pages: updated }));
        setActivePageIdx(updated.length - 1);
    };

    const handleDeletePage = (idx, e) => {
        e?.stopPropagation();
        if (currentScene.pages.length <= 1) return;
        const filtered = currentScene.pages.filter((_, i) => i !== idx);
        const updated = updatePageLabels(filtered, currentScene.sceneType);
        setCurrentScene(prev => ({ ...prev, pages: updated }));
        const nextIdx = Math.max(0, Math.min(activePageIdx, updated.length - 1));
        setActivePageIdx(nextIdx);
    };

    const updateStyle = (key, value) => {
        setCurrentScene(prev => ({
            ...prev,
            style: {
                ...prev.style,
                [key]: value,
            },
        }));
    };

    const handleUploadNewBg = async () => {
        try {
            if (window.electron?.Media?.import) {
                const file = await window.electron.Media.import();
                if (file) {
                    updateStyle("backgroundImage", file);
                    setMediaAssets(prev => prev.includes(file) ? prev : [file, ...prev]);
                    setIsBgModalOpen(false);
                    return;
                }
            }
        } catch (e) {
            console.error("Media import failed, using fallback:", e);
        }

        // Native file input fallback (reads as DataURL for reliable preview)
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = (e) => {
            const file = e.target.files?.[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = () => {
                    updateStyle("backgroundImage", reader.result);
                    setMediaAssets(prev => [reader.result, ...prev]);
                    setIsBgModalOpen(false);
                };
                reader.readAsDataURL(file);
            }
        };
        input.click();
    };

    // Dynamic Font Size Auto-Calculation matching Controller Preview & Stage Output
    const dynamicFontSize = useMemo(() => {
        if (currentScene.style?.fontSize && currentScene.style?.fontSize !== "auto") {
            const parsed = parseFloat(currentScene.style.fontSize);
            if (!isNaN(parsed)) {
                return parsed > 15 ? `${(parsed / 10).toFixed(1)}cqw` : `${parsed}cqw`;
            }
            return currentScene.style.fontSize;
        }
        const textLen = (activePage.content || "").length;
        return textLen > 600 ? "2.4cqw" : textLen > 350 ? "2.9cqw" : textLen > 180 ? "3.5cqw" : textLen > 80 ? "4.0cqw" : "4.8cqw";
    }, [activePage.content, currentScene.style?.fontSize]);

    // ─── Smart List Formatting ──────────────────────────────────────────────────

    const toggleBulletList = () => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const val = textarea.value;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;

        const lineStart = val.lastIndexOf("\n", start - 1) + 1;
        const lineEnd = val.indexOf("\n", end) === -1 ? val.length : val.indexOf("\n", end);
        const selectedChunk = val.slice(lineStart, lineEnd);
        const lines = selectedChunk.split("\n");

        const allBulleted = lines.every(l => /^\s*•\s*/.test(l));
        const newLines = lines.map(l => {
            if (allBulleted) return l.replace(/^\s*•\s*/, "");
            if (/^\s*\d+\.\s*/.test(l)) return l.replace(/^\s*\d+\.\s*/, "• ");
            return l.trim().length > 0 ? `• ${l.replace(/^\s*[•\-\*]\s*/, "")}` : l;
        });

        const replaced = newLines.join("\n");
        const nextVal = val.slice(0, lineStart) + replaced + val.slice(lineEnd);
        handleContentChange(nextVal);

        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(lineStart, lineStart + replaced.length);
            }
        }, 10);
    };

    const toggleNumberedList = () => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const val = textarea.value;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;

        const lineStart = val.lastIndexOf("\n", start - 1) + 1;
        const lineEnd = val.indexOf("\n", end) === -1 ? val.length : val.indexOf("\n", end);
        const selectedChunk = val.slice(lineStart, lineEnd);
        const lines = selectedChunk.split("\n");

        const allNumbered = lines.every(l => /^\s*\d+\.\s*/.test(l));
        let numCounter = 1;
        const newLines = lines.map(l => {
            if (allNumbered) return l.replace(/^\s*\d+\.\s*/, "");
            if (/^\s*•\s*/.test(l)) return `${numCounter++}. ${l.replace(/^\s*•\s*/, "")}`;
            return l.trim().length > 0 ? `${numCounter++}. ${l.replace(/^\s*(\d+\.|[•\-\*])\s*/, "")}` : l;
        });

        const replaced = newLines.join("\n");
        const nextVal = val.slice(0, lineStart) + replaced + val.slice(lineEnd);
        handleContentChange(nextVal);

        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(lineStart, lineStart + replaced.length);
            }
        }, 10);
    };

    // ─── Smart Enter / Smart Split To Next Page ─────────────────────────────────

    const handleSplitToNextPage = (splitIndex = null) => {
        const textarea = textareaRef.current;
        const val = activePage.content || "";
        const idx = splitIndex ?? (textarea ? textarea.selectionStart : val.length);

        const firstPart = val.slice(0, idx).trimEnd();
        const secondPart = val.slice(idx).trimStart();

        const newPageObj = {
            id: `pg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            content: secondPart,
            sectionType: currentScene.sceneType === "song" ? "verse" : "page",
            repeatCount: 1,
        };

        const updatedPages = [...currentScene.pages];
        updatedPages[activePageIdx] = { ...activePage, content: firstPart };
        updatedPages.splice(activePageIdx + 1, 0, newPageObj);

        const normalized = updatePageLabels(updatedPages, currentScene.sceneType);
        setCurrentScene(prev => ({ ...prev, pages: normalized }));
        setActivePageIdx(activePageIdx + 1);
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && (e.shiftKey || e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSplitToNextPage();
            return;
        }

        if (e.key === "Enter" && !e.shiftKey) {
            const textarea = textareaRef.current;
            if (!textarea) return;

            const val = textarea.value;
            const pos = textarea.selectionStart;
            const lineStart = val.lastIndexOf("\n", pos - 1) + 1;
            const currentLine = val.slice(lineStart, pos);

            const bulletMatch = currentLine.match(/^(\s*)([•\-\*])\s*(.*)$/);
            if (bulletMatch) {
                const indent = bulletMatch[1];
                const content = bulletMatch[3];
                if (content.trim() === "") {
                    e.preventDefault();
                    const nextVal = val.slice(0, lineStart) + val.slice(pos);
                    handleContentChange(nextVal);
                    setTimeout(() => { textarea.setSelectionRange(lineStart, lineStart); }, 0);
                    return;
                } else {
                    e.preventDefault();
                    const insertText = `\n${indent}• `;
                    const nextVal = val.slice(0, pos) + insertText + val.slice(pos);
                    handleContentChange(nextVal);
                    setTimeout(() => {
                        const nextPos = pos + insertText.length;
                        textarea.setSelectionRange(nextPos, nextPos);
                    }, 0);
                    return;
                }
            }

            const numMatch = currentLine.match(/^(\s*)(\d+)\.\s*(.*)$/);
            if (numMatch) {
                const indent = numMatch[1];
                const curNum = parseInt(numMatch[2], 10);
                const content = numMatch[3];
                if (content.trim() === "") {
                    e.preventDefault();
                    const nextVal = val.slice(0, lineStart) + val.slice(pos);
                    handleContentChange(nextVal);
                    setTimeout(() => { textarea.setSelectionRange(lineStart, lineStart); }, 0);
                    return;
                } else {
                    e.preventDefault();
                    const insertText = `\n${indent}${curNum + 1}. `;
                    const nextVal = val.slice(0, pos) + insertText + val.slice(pos);
                    handleContentChange(nextVal);
                    setTimeout(() => {
                        const nextPos = pos + insertText.length;
                        textarea.setSelectionRange(nextPos, nextPos);
                    }, 0);
                    return;
                }
            }
        }
    };

    const handlePaste = (e) => {
        const clipboardData = e.clipboardData;
        if (!clipboardData) return;

        const html = clipboardData.getData("text/html");
        const plain = clipboardData.getData("text/plain");
        let cleanText = "";

        if (html) {
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, "text/html");
                const body = doc.body;
                if (body) {
                    const lines = [];
                    const walk = (node, isInsideList = false, listType = "ul", itemIndex = 0) => {
                        if (!node) return;
                        if (node.nodeType === Node.TEXT_NODE) {
                            const text = node.textContent?.trim();
                            if (text && !isInsideList && node.parentElement === body) lines.push(text);
                            return;
                        }
                        if (node.nodeType !== Node.ELEMENT_NODE) return;
                        const tag = node.tagName.toLowerCase();
                        if (/^h[1-6]$/.test(tag)) {
                            const text = node.textContent?.trim();
                            if (text) lines.push(text);
                            return;
                        }
                        if (tag === "p" || tag === "div") {
                            if (node.querySelector("ul, ol, li")) {
                                Array.from(node.childNodes).forEach(child => walk(child, isInsideList, listType, itemIndex));
                            } else {
                                const text = node.textContent?.trim();
                                if (text) lines.push(text);
                            }
                            return;
                        }
                        if (tag === "ul" || tag === "ol") {
                            let idx = 0;
                            Array.from(node.children).forEach(child => {
                                walk(child, child.tagName.toLowerCase() === "li", tag, idx++);
                            });
                            return;
                        }
                        if (tag === "li") {
                            const prefix = listType === "ol" ? `${itemIndex + 1}. ` : "• ";
                            const text = node.textContent?.trim();
                            if (text) lines.push(`${prefix}${text}`);
                            return;
                        }
                        if (tag === "br") return;
                        Array.from(node.childNodes).forEach(child => walk(child, isInsideList, listType, itemIndex));
                    };
                    walk(body);
                    if (lines.length > 0) cleanText = lines.join("\n");
                }
            } catch (_) {}
        }

        if (!cleanText && plain) {
            cleanText = plain;
        }

        if (cleanText) {
            e.preventDefault();
            const textarea = textareaRef.current;
            if (textarea) {
                const val = textarea.value;
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const nextVal = val.slice(0, start) + cleanText + val.slice(end);
                handleContentChange(nextVal);
                setTimeout(() => {
                    const nextPos = start + cleanText.length;
                    textarea.setSelectionRange(nextPos, nextPos);
                }, 0);
            }
        }
    };

    const handleSave = () => {
        onSave(currentScene);
        onClose();
    };

    const isSong = currentScene.sceneType === "song";

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="bg-[#0e0e11] border border-white/10 rounded-3xl w-full max-w-5xl h-[90vh] flex overflow-hidden shadow-2xl relative text-white">
                
                {/* ─── LEFT SIDEBAR (Type, Sections, Controls) ───────────── */}
                <div className="w-72 bg-[#141418] border-r border-white/5 flex flex-col justify-between p-5 overflow-hidden shrink-0">
                    <div className="flex flex-col gap-4 overflow-y-auto pr-1">
                        
                        {/* Heading */}
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-bold text-white tracking-wide">
                                    {currentScene.name || "Untitled Scene"}
                                </h3>
                                <span className="text-[10px] uppercase font-bold text-white/30 tracking-widest">
                                    Scene Setup
                                </span>
                            </div>
                        </div>

                        {/* Content Type Selector (Song vs Text) */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] uppercase font-bold text-white/40 tracking-wider">
                                Content Type
                            </label>
                            <div className="bg-[#1b1b22] border border-white/10 rounded-2xl p-1 flex gap-1">
                                <button
                                    type="button"
                                    onClick={() => handleSceneTypeChange("song")}
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-all ${
                                        isSong
                                            ? "bg-purple-600 text-white shadow-md"
                                            : "text-white/40 hover:text-white hover:bg-white/5"
                                    }`}
                                >
                                    <PiMusicNotes size={14} /> Song
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSceneTypeChange("text")}
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-all ${
                                        !isSong
                                            ? "bg-purple-600 text-white shadow-md"
                                            : "text-white/40 hover:text-white hover:bg-white/5"
                                    }`}
                                >
                                    <PiFileText size={14} /> Text Only
                                </button>
                            </div>
                        </div>

                        {/* Title Input Field */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] uppercase font-bold text-white/40 tracking-wider">
                                {isSong ? "Song Title" : "Scene Title"}
                            </label>
                            <input
                                type="text"
                                value={currentScene.name || ""}
                                onChange={(e) => setCurrentScene(prev => ({ ...prev, name: e.target.value }))}
                                placeholder={isSong ? "e.g. Amazing Grace" : "Type Title here..."}
                                className="w-full bg-[#1b1b22] text-xs font-semibold text-white/90 p-2.5 rounded-2xl border border-white/10 outline-none focus:border-purple-500/50 transition-colors placeholder:text-white/20"
                            />
                        </div>

                        {/* If Song: Chorus Flow Setting */}
                        {isSong && (
                            <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-3 flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                                        <PiRepeat size={13} /> Chorus Flow
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setCurrentScene(prev => ({ ...prev, autoChorus: !prev.autoChorus }))}
                                        className={`w-7 h-4 rounded-full p-0.5 transition-colors relative ${
                                            currentScene.autoChorus ? "bg-purple-500" : "bg-white/10"
                                        }`}
                                    >
                                        <div className={`w-3 h-3 rounded-full bg-white transition-transform ${currentScene.autoChorus ? "translate-x-3" : "translate-x-0"}`} />
                                    </button>
                                </div>
                                <span className="text-[9px] text-white/40 leading-relaxed">
                                    Automatically return to Chorus after every Verse during presentation
                                </span>
                            </div>
                        )}

                        {/* Navigation Mode */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] uppercase font-bold text-white/40 tracking-wider">
                                Navigation Mode
                            </label>
                            <div className="bg-[#1b1b22] border border-white/10 rounded-2xl p-1 flex gap-1">
                                {[
                                    { id: "read_along", icon: PiBookmarkSimple, label: isSong ? "Sing-Along" : "Read-Along" },
                                    { id: "manual", icon: PiFileText, label: "Manual" },
                                ].map(mode => (
                                    <button
                                        key={mode.id}
                                        type="button"
                                        onClick={() => setCurrentScene(prev => ({ ...prev, navMode: mode.id }))}
                                        className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all ${
                                            currentScene.navMode === mode.id
                                                ? "bg-white text-black font-bold shadow-md"
                                                : "text-white/40 hover:text-white/80 hover:bg-white/5"
                                        }`}
                                    >
                                        <mode.icon size={15} />
                                        <span className="text-[9px] font-bold tracking-tight mt-1 uppercase leading-none">
                                            {mode.label}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Section / Page List */}
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] uppercase font-bold text-white/40 tracking-wider">
                                    {isSong ? `Song Parts (${currentScene.pages.length})` : `Pages (${currentScene.pages.length})`}
                                </label>
                                <button
                                    type="button"
                                    onClick={() => handleAddPage(isSong ? "verse" : "page")}
                                    className="text-orange-400 hover:text-orange-300 text-xs font-bold flex items-center gap-1 bg-orange-400/10 px-2 py-0.5 rounded-lg transition-colors"
                                >
                                    <PiPlus size={12} /> Add
                                </button>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                {currentScene.pages.map((p, idx) => {
                                    const isActive = idx === activePageIdx;
                                    const isChorus = isSong && p.sectionType === "chorus";
                                    const isBridge = isSong && p.sectionType === "bridge";
                                    const repeat = p.repeatCount > 1 ? p.repeatCount : 1;

                                    return (
                                        <div
                                            key={p.id || idx}
                                            onClick={() => setActivePageIdx(idx)}
                                            className={`rounded-xl px-3 py-2 flex items-center justify-between transition-all cursor-pointer border ${
                                                isActive
                                                    ? "bg-white text-black border-white shadow-md"
                                                    : isChorus
                                                    ? "bg-purple-950/40 text-purple-200 border-purple-500/30 hover:border-purple-500/50"
                                                    : isBridge
                                                    ? "bg-blue-950/40 text-blue-200 border-blue-500/30 hover:border-blue-500/50"
                                                    : "bg-[#1b1b22] text-white/80 border-white/5 hover:border-white/20 hover:text-white"
                                            }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs font-bold tracking-wide ${isActive ? "text-black font-extrabold" : ""}`}>
                                                    {p.label || (isSong ? `Verse ${idx + 1}` : `Page ${idx + 1}`)}
                                                </span>
                                                {isChorus && (
                                                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.2 rounded ${isActive ? 'bg-black/10 text-black' : 'bg-purple-500/20 text-purple-300'}`}>
                                                        Chorus
                                                    </span>
                                                )}
                                                {repeat > 1 && (
                                                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.2 rounded ${isActive ? 'bg-black/20 text-black font-extrabold' : 'bg-orange-500/20 text-orange-300 border border-orange-500/30'}`}>
                                                        {repeat}x
                                                    </span>
                                                )}
                                            </div>

                                            {currentScene.pages.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleDeletePage(idx, e)}
                                                    className={`p-1 rounded transition-colors ${
                                                        isActive
                                                            ? "text-black/40 hover:text-red-600"
                                                            : "text-white/20 hover:text-red-400"
                                                    }`}
                                                    title="Delete"
                                                >
                                                    <PiTrash size={13} />
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Bottom Add Page Button */}
                    <div className="pt-3 border-t border-white/5 flex gap-1.5">
                        {isSong ? (
                            <>
                                <button
                                    type="button"
                                    onClick={() => handleAddPage("verse")}
                                    className="flex-1 bg-[#1c1c22] hover:bg-[#25252c] text-white/90 text-xs font-bold py-2.5 px-2 rounded-xl border border-white/10 flex items-center justify-center gap-1 transition-all active:scale-98"
                                >
                                    <PiPlus size={13} /> Add Verse
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleAddPage("chorus")}
                                    className="bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-xs font-bold py-2.5 px-3 rounded-xl border border-purple-500/30 flex items-center justify-center gap-1 transition-all active:scale-98"
                                >
                                    <PiPlus size={13} /> Chorus
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                onClick={() => handleAddPage("page")}
                                className="w-full bg-[#1c1c22] hover:bg-[#25252c] text-white/90 text-xs font-bold py-2.5 px-4 rounded-2xl border border-white/10 flex items-center justify-center gap-2 transition-all active:scale-98 shadow-sm"
                            >
                                <PiPlus size={14} /> Add Page
                            </button>
                        )}
                    </div>
                </div>

                {/* ─── RIGHT MAIN CONTENT (Preview Canvas & Formatting Toolbar) ─── */}
                <div className="flex-1 flex flex-col justify-between p-6 overflow-hidden bg-[#0a0a0d]">
                    
                    {/* Top Action & Navigation Bar */}
                    <div className="flex items-center justify-between mb-3 shrink-0 flex-wrap gap-2">
                        <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1 border border-white/5">
                                <button
                                    type="button"
                                    onClick={() => setActivePageIdx(prev => Math.max(0, prev - 1))}
                                    disabled={activePageIdx === 0}
                                    className="p-1 rounded-lg text-white/50 hover:text-white disabled:opacity-20 transition-all"
                                    title="Previous"
                                >
                                    <PiArrowLeft size={14} />
                                </button>
                                <span className="text-xs font-bold text-white/70 px-2 font-mono">
                                    {activePage.label || `Page ${activePageIdx + 1}`} ({activePageIdx + 1}/{currentScene.pages.length})
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setActivePageIdx(prev => Math.min(currentScene.pages.length - 1, prev + 1))}
                                    disabled={activePageIdx >= currentScene.pages.length - 1}
                                    className="p-1 rounded-lg text-white/50 hover:text-white disabled:opacity-20 transition-all"
                                    title="Next"
                                >
                                    <PiArrowRight size={14} />
                                </button>
                            </div>

                            {/* If Song: Part Type Selector Pills for active page */}
                            {isSong && (
                                <div className="flex items-center bg-[#1b1b22] border border-white/10 rounded-xl p-0.5 text-xs">
                                    {["verse", "chorus", "bridge"].map(sec => (
                                        <button
                                            key={sec}
                                            type="button"
                                            onClick={() => handleSectionTypeChange(sec)}
                                            className={`px-2.5 py-1 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-all ${
                                                activePage.sectionType === sec
                                                    ? "bg-purple-600 text-white shadow-sm"
                                                    : "text-white/40 hover:text-white"
                                            }`}
                                        >
                                            {sec}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Repeat Count (1x, 2x, 3x, 4x) */}
                            <div className="flex items-center bg-[#1b1b22] border border-white/10 rounded-xl p-0.5 text-xs">
                                <span className="text-[9px] font-bold text-white/40 uppercase px-2">Repeat</span>
                                {[1, 2, 3, 4].map(num => (
                                    <button
                                        key={num}
                                        type="button"
                                        onClick={() => handleRepeatCountChange(num)}
                                        className={`px-2 py-1 rounded-lg font-bold text-[10px] tracking-wider transition-all ${
                                            (activePage.repeatCount || 1) === num
                                                ? "bg-orange-500 text-white shadow-sm font-extrabold"
                                                : "text-white/40 hover:text-white"
                                        }`}
                                        title={`Sing/repeat this part ${num} time${num !== 1 ? 's' : ''}`}
                                    >
                                        {num}x
                                    </button>
                                ))}
                            </div>

                            <button
                                type="button"
                                onClick={() => handleSplitToNextPage()}
                                className="bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-bold px-3 py-1.5 rounded-xl border border-white/10 flex items-center gap-1.5 transition-all"
                                title="Split text at cursor into next page (Shift+Enter)"
                            >
                                <PiScissors size={13} className="text-orange-400" /> Split Next
                            </button>
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={handleSave}
                                className="bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-400 hover:to-purple-500 text-white text-xs font-bold px-5 py-2 rounded-xl flex items-center gap-2 shadow-lg transition-all active:scale-95"
                            >
                                <PiFloppyDisk size={15} /> Save Scene
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                className="text-white/40 hover:text-white p-2 rounded-xl hover:bg-white/5 transition-colors"
                            >
                                <PiX size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Main Canvas Preview Area & Side Docked Animation Palette */}
                    <div className="w-full flex-1 flex gap-4 items-center justify-center min-h-0 relative overflow-hidden">
                        
                        {/* 16:9 Canvas Preview Box */}
                        <div className="flex-1 flex items-center justify-center min-h-0 h-full relative">
                            <div
                                className="aspect-video w-full max-h-full rounded-3xl border border-white/10 overflow-hidden flex flex-col justify-center items-center p-8 relative shadow-2xl transition-all"
                                style={{
                                    backgroundColor: currentScene.style.backgroundColor || "#000000",
                                    containerType: "size",
                                }}
                            >
                            {/* Background Image Layer */}
                            {currentScene.style.backgroundImage && (
                                <div
                                    className="absolute inset-0 z-0 bg-cover transition-all duration-300 pointer-events-none"
                                    style={{
                                        backgroundImage: currentScene.style.backgroundImage.startsWith('url(')
                                            ? currentScene.style.backgroundImage
                                            : `url("${currentScene.style.backgroundImage}")`,
                                        backgroundPosition: currentScene.style.backgroundPosition === 'top'
                                            ? 'center top'
                                            : currentScene.style.backgroundPosition === 'bottom'
                                            ? 'center bottom'
                                            : 'center center',
                                        opacity: typeof currentScene.style.backgroundOpacity === 'number' ? currentScene.style.backgroundOpacity : 0.85,
                                    }}
                                />
                            )}
                            {currentScene.style.backgroundImage && (
                                <div className="absolute inset-0 z-0 bg-black/40 pointer-events-none" />
                            )}

                            {/* Centered Content Container or Live Hover Animation Preview */}
                            <div className="w-full max-w-[92%] flex flex-col justify-center items-center my-auto z-10 relative">
                                {hoveredAnimation ? (
                                    /* Live Animated Sing-Along Simulation Preview while Hovering */
                                    <div
                                        className="w-full flex justify-center items-center my-auto z-10 select-none animate-in fade-in duration-150"
                                        style={{
                                            fontSize: dynamicFontSize,
                                            color: currentScene.style.color || "#FFFFFF",
                                            fontFamily: currentScene.style.fontFamily === "serif"
                                                ? "Georgia, serif"
                                                : currentScene.style.fontFamily === "mono"
                                                ? '"Courier New", monospace'
                                                : '"Inter Tight", sans-serif',
                                            fontWeight: currentScene.style.fontWeight || "600",
                                            fontStyle: currentScene.style.isItalic ? "italic" : "normal",
                                            textDecoration: currentScene.style.isUnderline ? "underline" : "none",
                                            textAlign: currentScene.style.textAlign || "center",
                                            lineHeight: currentScene.style.lineHeight || "1.45",
                                            textShadow: currentScene.style.textShadow === "none"
                                                ? "none"
                                                : currentScene.style.textShadow === "soft"
                                                ? "0 2px 8px rgba(0,0,0,0.65)"
                                                : "0 4px 16px rgba(0,0,0,0.85), 0 1px 3px rgba(0,0,0,0.9)",
                                            width: "100%",
                                        }}
                                    >
                                        {renderAnimatedLyrics({
                                            text: (activePage.content || "").trim() || (isSong ? "Amazing grace how sweet the sound that saved a wretch like me" : "The Lord is my light and my salvation"),
                                            translation: activePage.translation || (isSong ? "Oore-ọ̀fẹ́ tí ó yanilẹ́nu, bí ohùn náà ti dùn tó" : ""),
                                            currentWordIndex: hoverWordIndex,
                                            animationType: hoveredAnimation,
                                            style: currentScene.style,
                                            isSingAlong: true,
                                            enableWordTracking: true,
                                            sectionType: activePage.sectionType,
                                            sectionLabel: activePage.label,
                                        })}
                                    </div>
                                ) : (
                                    /* Normal Perfectly Centered Live Textarea */
                                    <div className="grid grid-cols-1 grid-rows-1 w-full items-center justify-center">
                                        {/* Invisible mirrored element that gives the exact auto-height */}
                                        <div
                                            aria-hidden="true"
                                            className="invisible whitespace-pre-wrap select-none pointer-events-none col-start-1 row-start-1"
                                            style={{
                                                fontSize: dynamicFontSize,
                                                fontFamily: currentScene.style.fontFamily === "serif"
                                                    ? "Georgia, serif"
                                                    : currentScene.style.fontFamily === "mono"
                                                    ? '"Courier New", monospace'
                                                    : '"Inter Tight", sans-serif',
                                                fontWeight: currentScene.style.fontWeight || "600",
                                                fontStyle: currentScene.style.isItalic ? "italic" : "normal",
                                                textDecoration: currentScene.style.isUnderline ? "underline" : "none",
                                                textAlign: currentScene.style.textAlign || "center",
                                                lineHeight: currentScene.style.lineHeight || "1.45",
                                                padding: 0,
                                                margin: 0,
                                                width: "100%",
                                            }}
                                        >
                                            {(activePage.content || (isSong ? "Type or paste song lyrics / verses / chorus here..." : "Type or paste scene text here...")) + "\n"}
                                        </div>

                                        <textarea
                                            ref={textareaRef}
                                            value={activePage.content}
                                            onChange={(e) => handleContentChange(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                            onPaste={handlePaste}
                                            placeholder={isSong ? "Type or paste song lyrics / verses / chorus here..." : "Type or paste scene text here..."}
                                            style={{
                                                fontSize: dynamicFontSize,
                                                color: currentScene.style.color || "#FFFFFF",
                                                fontFamily: currentScene.style.fontFamily === "serif"
                                                    ? "Georgia, serif"
                                                    : currentScene.style.fontFamily === "mono"
                                                    ? '"Courier New", monospace'
                                                    : '"Inter Tight", sans-serif',
                                                fontWeight: currentScene.style.fontWeight || "600",
                                                fontStyle: currentScene.style.isItalic ? "italic" : "normal",
                                                textDecoration: currentScene.style.isUnderline ? "underline" : "none",
                                                textAlign: currentScene.style.textAlign || "center",
                                                lineHeight: currentScene.style.lineHeight || "1.45",
                                                textShadow: currentScene.style.textShadow === "none"
                                                    ? "none"
                                                    : currentScene.style.textShadow === "soft"
                                                    ? "0 2px 8px rgba(0,0,0,0.65)"
                                                    : "0 4px 16px rgba(0,0,0,0.85), 0 1px 3px rgba(0,0,0,0.9)",
                                                padding: 0,
                                                margin: 0,
                                                width: "100%",
                                            }}
                                            className="w-full h-full bg-transparent outline-none resize-none border-none drop-shadow-md placeholder:text-white/20 overflow-hidden col-start-1 row-start-1 z-10"
                                        />
                                    </div>
                                )}

                                {/* Translated Lyrics Input Bar below lyrics for Song scenes */}
                                {isSong && (
                                    <div className="w-full mt-3 flex items-center gap-2 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 z-20">
                                        <PiGlobe size={14} className="text-amber-400 shrink-0" />
                                        <input
                                            type="text"
                                            value={activePage.translation || ""}
                                            onChange={(e) => handleTranslationChange(e.target.value)}
                                            placeholder="Translation (Optional): e.g. Olóòótọ́ ni ìṣòtítọ́ Rẹ..."
                                            className="w-full bg-transparent text-xs text-amber-200 placeholder:text-white/25 outline-none border-none"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Side Docked Animation Palette (Never blocks the canvas preview!) */}
                    {isAnimMenuOpen && (
                            <div
                                ref={animMenuRef}
                                className="w-72 h-full bg-[#14141b] border border-white/15 rounded-3xl p-3 shadow-2xl flex flex-col gap-2 overflow-hidden animate-in slide-in-from-right-6 duration-200 shrink-0 z-30"
                            >
                                <div className="flex items-center justify-between px-2 py-1 border-b border-white/10 shrink-0">
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold text-white">
                                            {isSong ? "Sing-Along FX & Translations" : "Read-Along Animations"}
                                        </span>
                                        <span className="text-[10px] text-cyan-400 font-mono">Hover to live preview</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsAnimMenuOpen(false);
                                            setHoveredAnimation(null);
                                        }}
                                        className="p-1 text-white/40 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                                    >
                                        <PiX size={14} />
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto flex flex-col gap-1 pr-1 no-scrollbar">
                                    {(isSong ? LYRIC_ANIMATIONS : READ_ALONG_ANIMATIONS).map((anim) => {
                                        const isSelected = (currentScene.style.animation || (isSong ? "karaoke" : "word-highlight")) === anim.id;
                                        return (
                                            <button
                                                key={anim.id}
                                                type="button"
                                                onMouseEnter={() => setHoveredAnimation(anim.id)}
                                                onMouseLeave={() => setHoveredAnimation(null)}
                                                onClick={() => {
                                                    updateStyle("animation", anim.id);
                                                    setIsAnimMenuOpen(false);
                                                    setHoveredAnimation(null);
                                                }}
                                                className={`w-full text-left px-2.5 py-1.5 rounded-xl transition-all flex flex-col gap-0.5 group ${
                                                    isSelected
                                                        ? "bg-purple-500/25 text-white border border-purple-500/40 shadow-sm"
                                                        : "hover:bg-white/10 text-white/80 hover:text-white border border-transparent"
                                                }`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-bold flex items-center gap-1.5">
                                                        {anim.badge?.split(" ")[0]} {anim.name}
                                                    </span>
                                                    {isSelected && <PiCheck size={14} className="text-purple-400" />}
                                                </div>
                                                <p className="text-[10px] text-white/40 group-hover:text-white/70 leading-tight">
                                                    {anim.description}
                                                </p>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Bottom Formatting Toolbar (Font, Colors, BG Image, Animation) */}
                    <div className="mt-4 flex items-center justify-center shrink-0">
                        <div className="bg-[#18181c] border border-white/10 rounded-2xl p-2 px-4 flex items-center gap-3 shadow-2xl flex-wrap justify-center">
                            
                            {/* Font Selector Dropdown */}
                            <div className="relative flex items-center">
                                <select
                                    value={`${currentScene.style.fontFamily || 'Inter Tight'}__${currentScene.style.fontWeight || '600'}`}
                                    onChange={(e) => {
                                        const [fam, wgt] = e.target.value.split("__");
                                        updateStyle("fontFamily", fam);
                                        updateStyle("fontWeight", wgt);
                                    }}
                                    className="bg-[#24242a] text-xs font-semibold text-white/90 py-1.5 px-3 pr-7 rounded-xl border border-white/10 outline-none appearance-none cursor-pointer hover:bg-[#2b2b33] transition-colors"
                                >
                                    <option value="Inter Tight__600">Inter • Semibold</option>
                                    <option value="Inter Tight__400">Inter • Regular</option>
                                    <option value="Inter Tight__700">Inter • Bold</option>
                                    <option value="serif__600">Serif • Semibold</option>
                                    <option value="serif__400">Serif • Regular</option>
                                    <option value="mono__600">Mono • Semibold</option>
                                </select>
                                <PiCaretDown size={12} className="absolute right-2.5 pointer-events-none text-white/40" />
                            </div>

                            {/* Font Size Selector */}
                            <div className="relative flex items-center">
                                <select
                                    value={currentScene.style.fontSize || "auto"}
                                    onChange={(e) => updateStyle("fontSize", e.target.value)}
                                    className="bg-[#24242a] text-xs font-semibold text-white/90 py-1.5 px-3 pr-7 rounded-xl border border-white/10 outline-none appearance-none cursor-pointer hover:bg-[#2b2b33] transition-colors"
                                    title="Font Size"
                                >
                                    <option value="auto">Auto Size</option>
                                    <option value="28">Small (2.8vw)</option>
                                    <option value="35">Medium (3.5vw)</option>
                                    <option value="40">Regular (4.0vw)</option>
                                    <option value="48">Large (4.8vw)</option>
                                    <option value="56">Extra Large (5.6vw)</option>
                                    <option value="64">Huge (6.4vw)</option>
                                </select>
                                <PiCaretDown size={12} className="absolute right-2.5 pointer-events-none text-white/40" />
                            </div>

                            {/* Line Height Selector */}
                            <div className="relative flex items-center">
                                <select
                                    value={currentScene.style.lineHeight || "1.45"}
                                    onChange={(e) => updateStyle("lineHeight", e.target.value)}
                                    className="bg-[#24242a] text-xs font-semibold text-white/90 py-1.5 px-3 pr-7 rounded-xl border border-white/10 outline-none appearance-none cursor-pointer hover:bg-[#2b2b33] transition-colors"
                                    title="Line Height / Spacing"
                                >
                                    <option value="1.15">Line: 1.15 (Tight)</option>
                                    <option value="1.3">Line: 1.30 (Compact)</option>
                                    <option value="1.45">Line: 1.45 (Normal)</option>
                                    <option value="1.65">Line: 1.65 (Relaxed)</option>
                                    <option value="1.85">Line: 1.85 (Loose)</option>
                                    <option value="2.0">Line: 2.00 (Double)</option>
                                </select>
                                <PiCaretDown size={12} className="absolute right-2.5 pointer-events-none text-white/40" />
                            </div>

                            {/* Text Shadow Selector */}
                            <div className="relative flex items-center">
                                <select
                                    value={currentScene.style.textShadow || "strong"}
                                    onChange={(e) => updateStyle("textShadow", e.target.value)}
                                    className="bg-[#24242a] text-xs font-semibold text-white/90 py-1.5 px-3 pr-7 rounded-xl border border-white/10 outline-none appearance-none cursor-pointer hover:bg-[#2b2b33] transition-colors"
                                    title="Text Drop Shadow"
                                >
                                    <option value="strong">Shadow: Strong</option>
                                    <option value="soft">Shadow: Soft</option>
                                    <option value="none">Shadow: None</option>
                                </select>
                                <PiCaretDown size={12} className="absolute right-2.5 pointer-events-none text-white/40" />
                            </div>

                            {/* Background Position Selector (Top, Center, Bottom) */}
                            {currentScene.style.backgroundImage && (
                                <div className="relative flex items-center">
                                    <select
                                        value={currentScene.style.backgroundPosition || "center"}
                                        onChange={(e) => updateStyle("backgroundPosition", e.target.value)}
                                        className="bg-[#24242a] text-xs font-semibold text-white/90 py-1.5 px-3 pr-7 rounded-xl border border-white/10 outline-none appearance-none cursor-pointer hover:bg-[#2b2b33] transition-colors"
                                        title="Background Image Vertical Alignment"
                                    >
                                        <option value="center">BG: Center</option>
                                        <option value="top">BG: Top</option>
                                        <option value="bottom">BG: Bottom</option>
                                    </select>
                                    <PiCaretDown size={12} className="absolute right-2.5 pointer-events-none text-white/40" />
                                </div>
                            )}

                            {/* Animation Palette Toggle Button */}
                            <div className="relative flex items-center">
                                <button
                                    type="button"
                                    onClick={() => setIsAnimMenuOpen(prev => !prev)}
                                    className={`text-xs font-semibold py-1.5 px-3 rounded-xl border transition-colors flex items-center gap-1.5 ${
                                        isAnimMenuOpen
                                            ? "bg-purple-600 text-white border-purple-500 shadow-md"
                                            : "bg-[#24242a] text-white/90 border-white/10 hover:bg-[#2b2b33]"
                                    }`}
                                    title={`Choose ${isSong ? 'Sing-Along' : 'Read-Along'} Animation`}
                                >
                                    <PiSparkle size={13} className="text-amber-400" />
                                    <span>
                                        {(isSong ? LYRIC_ANIMATIONS : READ_ALONG_ANIMATIONS).find(a => a.id === (currentScene.style.animation || (isSong ? "karaoke" : "word-highlight")))?.name || (isSong ? "Karaoke Highlight" : "Word Highlight")}
                                    </span>
                                    <PiCaretDown size={12} className={`transition-transform duration-200 ${isAnimMenuOpen ? "rotate-180 text-white" : "text-white/40"}`} />
                                </button>
                            </div>

                            <div className="h-4 w-px bg-white/10" />

                            {/* Background Image Trigger (Opens Asset Selection Modal) */}
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => {
                                        loadMediaAssets();
                                        setIsBgModalOpen(true);
                                    }}
                                    className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
                                        currentScene.style.backgroundImage
                                            ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                                            : "bg-[#24242a] text-white/70 border-white/10 hover:bg-[#2b2b33] hover:text-white"
                                    }`}
                                    title="Choose Background Image"
                                >
                                    <PiImage size={14} />
                                    {currentScene.style.backgroundImage ? "BG Set" : "Add BG"}
                                </button>

                                {currentScene.style.backgroundImage && (
                                    <button
                                        type="button"
                                        onClick={() => updateStyle("backgroundImage", null)}
                                        className="p-1 text-white/40 hover:text-red-400 rounded-lg hover:bg-white/5 transition-colors"
                                        title="Remove Background Image"
                                    >
                                        <PiX size={12} />
                                    </button>
                                )}
                            </div>

                            <div className="h-4 w-px bg-white/10" />

                            {/* List Formatting */}
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={toggleBulletList}
                                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors text-white/70 hover:text-white hover:bg-white/10"
                                    title="Bullet List (•)"
                                >
                                    <PiListBullets size={15} />
                                </button>
                                <button
                                    type="button"
                                    onClick={toggleNumberedList}
                                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors text-white/70 hover:text-white hover:bg-white/10"
                                    title="Numbered List (1, 2, 3)"
                                >
                                    <PiListNumbers size={15} />
                                </button>
                            </div>

                            <div className="h-4 w-px bg-white/10" />

                            {/* Text Color Pill */}
                            <div
                                className="flex items-center gap-2 bg-[#24242a] border border-white/10 rounded-xl px-2.5 py-1 cursor-pointer hover:bg-[#2b2b33] transition-colors relative"
                                title="Text Color"
                            >
                                <div
                                    className="w-4 h-4 rounded-full border border-white/30 shadow-inner"
                                    style={{ backgroundColor: currentScene.style.color || "#FFFFFF" }}
                                />
                                <input
                                    type="color"
                                    value={currentScene.style.color || "#FFFFFF"}
                                    onChange={(e) => updateStyle("color", e.target.value)}
                                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                />
                            </div>

                            {/* Background Color Pill */}
                            <div
                                className="flex items-center gap-2 bg-[#24242a] border border-white/10 rounded-xl px-2.5 py-1 cursor-pointer hover:bg-[#2b2b33] transition-colors relative"
                                title="Background Color"
                            >
                                <span className="text-[10px] text-white/40 uppercase font-bold">BG</span>
                                <div
                                    className="w-4 h-4 rounded-full border border-white/30 shadow-inner"
                                    style={{ backgroundColor: currentScene.style.backgroundColor || "#000000" }}
                                />
                                <input
                                    type="color"
                                    value={currentScene.style.backgroundColor || "#000000"}
                                    onChange={(e) => updateStyle("backgroundColor", e.target.value)}
                                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                />
                            </div>

                            <div className="h-4 w-px bg-white/10" />

                            {/* Style Toggles: B, I, U */}
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => updateStyle("fontWeight", currentScene.style.fontWeight === "700" ? "400" : "700")}
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs transition-colors ${
                                        currentScene.style.fontWeight === "700" ? "bg-white/20 text-white" : "text-white/40 hover:text-white hover:bg-white/5"
                                    }`}
                                >
                                    B
                                </button>
                                <button
                                    type="button"
                                    onClick={() => updateStyle("isItalic", !currentScene.style.isItalic)}
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center italic font-serif text-xs transition-colors ${
                                        currentScene.style.isItalic ? "bg-white/20 text-white" : "text-white/40 hover:text-white hover:bg-white/5"
                                    }`}
                                >
                                    I
                                </button>
                                <button
                                    type="button"
                                    onClick={() => updateStyle("isUnderline", !currentScene.style.isUnderline)}
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center underline text-xs transition-colors ${
                                        currentScene.style.isUnderline ? "bg-white/20 text-white" : "text-white/40 hover:text-white hover:bg-white/5"
                                    }`}
                                >
                                    U
                                </button>
                            </div>

                            <div className="h-4 w-px bg-white/10" />

                            {/* Alignment Group */}
                            <div className="flex items-center gap-1">
                                {[
                                    { id: "left", icon: PiTextAlignLeft },
                                    { id: "center", icon: PiTextAlignCenter },
                                    { id: "right", icon: PiTextAlignRight },
                                ].map((a) => (
                                    <button
                                        key={a.id}
                                        type="button"
                                        onClick={() => updateStyle("textAlign", a.id)}
                                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                                            currentScene.style.textAlign === a.id
                                                ? "bg-white/20 text-white"
                                                : "text-white/40 hover:text-white hover:bg-white/5"
                                        }`}
                                    >
                                        <a.icon size={14} />
                                    </button>
                                ))}
                            </div>

                        </div>
                    </div>

                </div>
            </div>

            {/* Background Image Selection & Management Modal */}
            {isBgModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
                    <div className="bg-[#18181f] border border-white/15 rounded-3xl w-full max-w-xl p-6 flex flex-col gap-5 shadow-2xl animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center">
                                    <PiImage size={18} />
                                </div>
                                <div>
                                    <h4 className="text-base font-bold text-white">Choose Background Image</h4>
                                    <p className="text-xs text-white/50">Select an existing image asset or upload a new one</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsBgModalOpen(false)}
                                className="text-white/40 hover:text-white p-2 rounded-xl hover:bg-white/5 transition-colors"
                            >
                                <PiX size={18} />
                            </button>
                        </div>

                        {/* Top Actions: Upload New & Clear */}
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={handleUploadNewBg}
                                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-xs transition-all shadow-lg shadow-blue-600/20"
                            >
                                <PiUploadSimple size={16} />
                                Upload New Image
                            </button>

                            {currentScene.style.backgroundImage && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        updateStyle("backgroundImage", null);
                                        setIsBgModalOpen(false);
                                    }}
                                    className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-bold py-2.5 px-4 rounded-xl flex items-center gap-1.5 text-xs transition-all"
                                >
                                    <PiTrash size={14} />
                                    Clear BG
                                </button>
                            )}
                        </div>

                        {/* Background Alignment & Opacity Controls */}
                        <div className="bg-[#121216] border border-white/10 rounded-2xl p-3 flex items-center justify-between gap-4 flex-wrap">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-white/60">Position:</span>
                                <div className="flex items-center bg-[#24242a] rounded-lg p-0.5 border border-white/10">
                                    {["top", "center", "bottom"].map((pos) => (
                                        <button
                                            key={pos}
                                            type="button"
                                            onClick={() => updateStyle("backgroundPosition", pos)}
                                            className={`text-[11px] font-bold uppercase px-2.5 py-1 rounded-md transition-all ${
                                                (currentScene.style.backgroundPosition || "center") === pos
                                                    ? "bg-white text-black shadow-sm"
                                                    : "text-white/40 hover:text-white"
                                            }`}
                                        >
                                            {pos}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                                <span className="text-xs font-semibold text-white/60 shrink-0">Opacity:</span>
                                <input
                                    type="range"
                                    min="0.2"
                                    max="1.0"
                                    step="0.05"
                                    value={typeof currentScene.style.backgroundOpacity === 'number' ? currentScene.style.backgroundOpacity : 0.85}
                                    onChange={(e) => updateStyle("backgroundOpacity", parseFloat(e.target.value))}
                                    className="w-full accent-purple-500 cursor-pointer"
                                />
                                <span className="text-xs font-mono text-white/40 shrink-0">
                                    {Math.round((typeof currentScene.style.backgroundOpacity === 'number' ? currentScene.style.backgroundOpacity : 0.85) * 100)}%
                                </span>
                            </div>
                        </div>

                        {/* Image Thumbnails Grid */}
                        <div className="flex flex-col gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">
                                Available Images ({mediaAssets.length})
                            </span>
                            <div className="grid grid-cols-4 gap-2.5 max-h-56 overflow-y-auto pr-1 no-scrollbar">
                                {mediaAssets.map((imgUrl, idx) => {
                                    const isSelected = currentScene.style.backgroundImage === imgUrl;
                                    return (
                                        <div
                                            key={idx}
                                            onClick={() => {
                                                updateStyle("backgroundImage", imgUrl);
                                                setIsBgModalOpen(false);
                                            }}
                                            className={`aspect-video rounded-xl overflow-hidden relative cursor-pointer border-2 transition-all group ${
                                                isSelected
                                                    ? "border-purple-500 ring-2 ring-purple-500/30"
                                                    : "border-white/10 hover:border-white/40"
                                            }`}
                                        >
                                            <div
                                                className="absolute inset-0 bg-cover bg-center group-hover:scale-105 transition-transform duration-300"
                                                style={{ backgroundImage: imgUrl.startsWith('url(') ? imgUrl : `url("${imgUrl}")` }}
                                            />
                                            {isSelected && (
                                                <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-purple-500 text-white flex items-center justify-center shadow-lg">
                                                    <PiCheck size={12} />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {mediaAssets.length === 0 && (
                                    <div className="col-span-4 py-8 text-center text-white/30 text-xs flex flex-col items-center gap-2">
                                        <PiImage size={24} className="opacity-40" />
                                        <span>No images saved yet. Click "Upload New Image" above.</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                            <button
                                type="button"
                                onClick={() => setIsBgModalOpen(false)}
                                className="px-4 py-2 text-xs font-semibold text-white/60 hover:text-white rounded-xl hover:bg-white/5 transition-colors"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
