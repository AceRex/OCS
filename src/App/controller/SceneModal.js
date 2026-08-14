import React, { useState, useEffect, useMemo, useRef } from "react";
import {
    PiFileText, PiBookmarkSimple, PiDeviceMobile,
    PiPlus, PiTrash, PiX,
    PiTextAlignLeft, PiTextAlignCenter, PiTextAlignRight,
    PiFloppyDisk, PiListBullets, PiListNumbers,
    PiArrowRight, PiArrowLeft, PiScissors,
    PiCaretDown, PiMusicNotes, PiImage, PiSparkle,
    PiRepeat, PiCheck,
} from "react-icons/pi";

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
            color: "#FFFFFF",
            backgroundColor: "#000000",
            backgroundImage: scene.style?.backgroundImage || null,
            backgroundOpacity: typeof scene.style?.backgroundOpacity === "number" ? scene.style.backgroundOpacity : 0.85,
            animation: scene.style?.animation || "fade",
            textAlign: "left",
            isItalic: false,
            isUnderline: false,
            ...(scene.style || {}),
        },
    }));

    const [activePageIdx, setActivePageIdx] = useState(0);
    const textareaRef = useRef(null);

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
                    color: "#FFFFFF",
                    backgroundColor: "#000000",
                    backgroundImage: scene.style?.backgroundImage || null,
                    backgroundOpacity: typeof scene.style?.backgroundOpacity === "number" ? scene.style.backgroundOpacity : 0.85,
                    animation: scene.style?.animation || "fade",
                    textAlign: "left",
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

    const activePage = currentScene.pages[activePageIdx] || currentScene.pages[0] || { content: "", sectionType: "verse", label: "Verse 1", repeatCount: 1 };

    const handleContentChange = (newText) => {
        setCurrentScene(prev => ({
            ...prev,
            pages: prev.pages.map((p, idx) => idx === activePageIdx ? { ...p, content: newText } : p),
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

    const handleBgUpload = async () => {
        const file = await window.electron?.Presentation?.importMedia?.();
        if (file) {
            updateStyle("backgroundImage", file);
        }
    };

    // Dynamic Font Size Auto-Calculation
    const dynamicFontSize = useMemo(() => {
        if (currentScene.style?.fontSize && currentScene.style?.fontSize !== "auto") {
            const val = currentScene.style.fontSize;
            return typeof val === 'number' || (!val.includes('px') && !val.includes('vw') && !val.includes('rem'))
                ? `${val}px`
                : val;
        }
        const textLen = (activePage.content || "").length;
        if (textLen === 0) return "44px";
        if (textLen < 60) return "48px";
        if (textLen < 140) return "40px";
        if (textLen < 260) return "32px";
        if (textLen < 450) return "26px";
        if (textLen < 700) return "22px";
        return "18px";
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

                    {/* Main Canvas Preview Box with Background Image and Animations */}
                    <div
                        className="flex-1 rounded-3xl border border-white/10 overflow-hidden flex items-center justify-center p-8 relative shadow-2xl transition-all"
                        style={{ backgroundColor: currentScene.style.backgroundColor || "#000000" }}
                    >
                        {/* Background Image Layer */}
                        {currentScene.style.backgroundImage && (
                            <div
                                className="absolute inset-0 z-0 bg-cover bg-center transition-all duration-300"
                                style={{
                                    backgroundImage: `url(${currentScene.style.backgroundImage})`,
                                    opacity: currentScene.style.backgroundOpacity ?? 0.85,
                                }}
                            />
                        )}
                        {currentScene.style.backgroundImage && (
                            <div className="absolute inset-0 z-0 bg-black/40" />
                        )}

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
                                textAlign: currentScene.style.textAlign || "left",
                                lineHeight: "1.45",
                                textShadow: "0 4px 16px rgba(0,0,0,0.85)",
                            }}
                            className="w-full h-full bg-transparent outline-none resize-none border-none flex items-center justify-center drop-shadow-md placeholder:text-white/20 overflow-y-auto z-10"
                        />
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
                                >
                                    <option value="auto">Auto Size</option>
                                    <option value="24">24px</option>
                                    <option value="32">32px</option>
                                    <option value="40">40px</option>
                                    <option value="48">48px</option>
                                    <option value="56">56px</option>
                                    <option value="64">64px</option>
                                    <option value="72">72px</option>
                                    <option value="84">84px</option>
                                </select>
                                <PiCaretDown size={12} className="absolute right-2.5 pointer-events-none text-white/40" />
                            </div>

                            {/* Animation Selector */}
                            <div className="relative flex items-center">
                                <select
                                    value={currentScene.style.animation || "fade"}
                                    onChange={(e) => updateStyle("animation", e.target.value)}
                                    className="bg-[#24242a] text-xs font-semibold text-white/90 py-1.5 px-3 pr-7 rounded-xl border border-white/10 outline-none appearance-none cursor-pointer hover:bg-[#2b2b33] transition-colors"
                                    title="Text Transition Animation"
                                >
                                    <option value="fade">✨ Fade In</option>
                                    <option value="slide-up">🚀 Slide Up</option>
                                    <option value="zoom">🔍 Zoom In</option>
                                    <option value="none">⏹️ No Animation</option>
                                </select>
                                <PiCaretDown size={12} className="absolute right-2.5 pointer-events-none text-white/40" />
                            </div>

                            <div className="h-4 w-px bg-white/10" />

                            {/* Background Image Trigger */}
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={handleBgUpload}
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
        </div>
    );
}
