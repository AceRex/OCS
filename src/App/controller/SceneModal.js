import React, { useState, useEffect, useMemo, useRef } from "react";
import {
    PiFileText, PiBookmarkSimple, PiDeviceMobile,
    PiPlus, PiTrash, PiX,
    PiTextAlignLeft, PiTextAlignCenter, PiTextAlignRight,
    PiFloppyDisk, PiListBullets, PiListNumbers,
    PiArrowRight, PiArrowLeft, PiScissors,
    PiCaretDown,
} from "react-icons/pi";

/**
 * SceneModal — High-fidelity Scene Editor
 *
 * Updates:
 * - Removed dropdown accordion on scene pages: only shows page name in a clean list
 * - Removed "Present Now" button: only Save and Close
 * - Target screen toggle: choose between "Both Screens (Speaker & General)" vs "Speaker Screen Only"
 * - Smart Enter list auto-continuation & exit on empty item
 * - Smart HTML/Plaintext paste parser that preserves title, headings, and lists
 * - Smart "Go to Next" page splitter (Shift+Enter / button)
 * - Large legible font sizes and exact user font presets
 * - Clean preview canvas without header banners
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
        navMode: scene.navMode || "manual",
        targetMode: scene.targetMode || (scene.targets && !scene.targets.general ? "speaker_only" : "both"),
        targets: scene.targets || { general: scene.targetMode !== "speaker_only", speaker: true },
        pages: Array.isArray(scene.pages) && scene.pages.length > 0
            ? scene.pages
            : [{ id: `pg-${Date.now()}`, content: "" }],
        style: {
            fontFamily: "Inter Tight",
            fontWeight: "600",
            fontSize: "auto",
            color: "#FFFFFF",
            backgroundColor: "#000000",
            textAlign: "center",
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
                navMode: scene.navMode || "manual",
                targetMode: scene.targetMode || (scene.targets && !scene.targets.general ? "speaker_only" : "both"),
                targets: scene.targets || { general: scene.targetMode !== "speaker_only", speaker: true },
                pages: Array.isArray(scene.pages) && scene.pages.length > 0
                    ? scene.pages
                    : [{ id: `pg-${Date.now()}`, content: "" }],
                style: {
                    fontFamily: "Inter Tight",
                    fontWeight: "600",
                    fontSize: "auto",
                    color: "#FFFFFF",
                    backgroundColor: "#000000",
                    textAlign: "center",
                    isItalic: false,
                    isUnderline: false,
                    ...(scene.style || {}),
                },
            });
            setActivePageIdx(0);
        }
    }, [scene]);

    const activePage = currentScene.pages[activePageIdx] || currentScene.pages[0] || { content: "" };

    const handleContentChange = (newText) => {
        setCurrentScene(prev => ({
            ...prev,
            pages: prev.pages.map((p, idx) => idx === activePageIdx ? { ...p, content: newText } : p),
        }));
    };

    const handleAddPage = () => {
        const newPageObj = { id: `pg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, content: "" };
        const newIdx = currentScene.pages.length;
        setCurrentScene(prev => ({
            ...prev,
            pages: [...prev.pages, newPageObj],
        }));
        setActivePageIdx(newIdx);
    };

    const handleDeletePage = (idx, e) => {
        e?.stopPropagation();
        if (currentScene.pages.length <= 1) return;
        const filtered = currentScene.pages.filter((_, i) => i !== idx);
        setCurrentScene(prev => ({ ...prev, pages: filtered }));
        const nextIdx = Math.max(0, Math.min(activePageIdx, filtered.length - 1));
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

    const setTargetMode = (mode) => {
        setCurrentScene(prev => ({
            ...prev,
            targetMode: mode,
            targets: {
                general: mode === "both",
                speaker: true,
            },
        }));
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
            if (allBulleted) {
                return l.replace(/^\s*•\s*/, "");
            }
            if (/^\s*\d+\.\s*/.test(l)) {
                return l.replace(/^\s*\d+\.\s*/, "• ");
            }
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
            if (allNumbered) {
                return l.replace(/^\s*\d+\.\s*/, "");
            }
            if (/^\s*•\s*/.test(l)) {
                return `${numCounter++}. ${l.replace(/^\s*•\s*/, "")}`;
            }
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
        };

        const updatedPages = [...currentScene.pages];
        updatedPages[activePageIdx] = { ...activePage, content: firstPart };
        updatedPages.splice(activePageIdx + 1, 0, newPageObj);

        setCurrentScene(prev => ({ ...prev, pages: updatedPages }));
        setActivePageIdx(activePageIdx + 1);
    };

    const handleKeyDown = (e) => {
        // Shift + Enter or Cmd/Ctrl + Enter = Smart Split to Next Page
        if (e.key === "Enter" && (e.shiftKey || e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSplitToNextPage();
            return;
        }

        // Smart List Continuation on plain Enter
        if (e.key === "Enter" && !e.shiftKey) {
            const textarea = textareaRef.current;
            if (!textarea) return;

            const val = textarea.value;
            const pos = textarea.selectionStart;
            const lineStart = val.lastIndexOf("\n", pos - 1) + 1;
            const currentLine = val.slice(lineStart, pos);

            // Check for bullet list item: e.g. "• item" or "- item" or "* item"
            const bulletMatch = currentLine.match(/^(\s*)([•\-\*])\s*(.*)$/);
            if (bulletMatch) {
                const indent = bulletMatch[1];
                const content = bulletMatch[3];
                if (content.trim() === "") {
                    // Empty bullet line -> Exit list mode on this line
                    e.preventDefault();
                    const nextVal = val.slice(0, lineStart) + val.slice(pos);
                    handleContentChange(nextVal);
                    setTimeout(() => {
                        textarea.setSelectionRange(lineStart, lineStart);
                    }, 0);
                    return;
                } else {
                    // Continue bullet list
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

            // Check for numbered list item: e.g. "1. item"
            const numMatch = currentLine.match(/^(\s*)(\d+)\.\s*(.*)$/);
            if (numMatch) {
                const indent = numMatch[1];
                const curNum = parseInt(numMatch[2], 10);
                const content = numMatch[3];
                if (content.trim() === "") {
                    // Empty number line -> Exit list mode on this line
                    e.preventDefault();
                    const nextVal = val.slice(0, lineStart) + val.slice(pos);
                    handleContentChange(nextVal);
                    setTimeout(() => {
                        textarea.setSelectionRange(lineStart, lineStart);
                    }, 0);
                    return;
                } else {
                    // Continue numbered list
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

    // ─── Smart Paste Parser (Preserves Title, Headings, Paragraphs, & Lists) ─

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
                            if (text && !isInsideList && node.parentElement === body) {
                                lines.push(text);
                            }
                            return;
                        }

                        if (node.nodeType !== Node.ELEMENT_NODE) return;

                        const tag = node.tagName.toLowerCase();

                        // Headings & Titles
                        if (/^h[1-6]$/.test(tag)) {
                            const text = node.textContent?.trim();
                            if (text) lines.push(text);
                            return;
                        }

                        // Paragraphs / Div blocks
                        if (tag === "p" || tag === "div") {
                            if (node.querySelector("ul, ol, li")) {
                                Array.from(node.childNodes).forEach(child => walk(child, isInsideList, listType, itemIndex));
                            } else {
                                const text = node.textContent?.trim();
                                if (text) lines.push(text);
                            }
                            return;
                        }

                        // Unordered List
                        if (tag === "ul") {
                            let idx = 0;
                            Array.from(node.children).forEach(child => {
                                if (child.tagName.toLowerCase() === "li") {
                                    walk(child, true, "ul", idx++);
                                } else {
                                    walk(child, false, "ul", idx);
                                }
                            });
                            return;
                        }

                        // Ordered List
                        if (tag === "ol") {
                            let idx = 0;
                            Array.from(node.children).forEach(child => {
                                if (child.tagName.toLowerCase() === "li") {
                                    walk(child, true, "ol", idx++);
                                } else {
                                    walk(child, false, "ol", idx);
                                }
                            });
                            return;
                        }

                        // List Item
                        if (tag === "li") {
                            const prefix = listType === "ol" ? `${itemIndex + 1}. ` : "• ";
                            const text = node.textContent?.trim();
                            if (text) lines.push(`${prefix}${text}`);
                            return;
                        }

                        if (tag === "br") {
                            return;
                        }

                        // Default: walk child nodes
                        Array.from(node.childNodes).forEach(child => walk(child, isInsideList, listType, itemIndex));
                    };

                    walk(body);

                    if (lines.length > 0) {
                        cleanText = lines.join("\n");
                    }
                }
            } catch (_) {}
        }

        if (!cleanText && plain) {
            // Normalize plain text with raw markdown / dashed bullets while preserving title & regular lines
            const rawLines = plain.split(/\r?\n/);
            let numIdx = 1;
            const formatted = rawLines.map(l => {
                // Bullet items like "- item" or "* item" or "+ item" -> "• item"
                if (/^\s*[\-\*\+]\s+/.test(l)) {
                    return l.replace(/^\s*[\-\*\+]\s+/, "• ");
                }
                // Numbered items like "1) item" or "(1) item" -> "1. item"
                if (/^\s*\(?\d+\)[\.\s]+/.test(l)) {
                    return l.replace(/^\s*\(?\d+\)[\.\s]+/, () => `${numIdx++}. `);
                }
                return l;
            });
            cleanText = formatted.join("\n");
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

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="bg-[#0e0e11] border border-white/10 rounded-3xl w-full max-w-5xl h-[90vh] flex overflow-hidden shadow-2xl relative text-white">
                
                {/* ─── LEFT SIDEBAR (Controls & Clean Pages List) ───────────── */}
                <div className="w-72 bg-[#141418] border-r border-white/5 flex flex-col justify-between p-5 overflow-hidden shrink-0">
                    <div className="flex flex-col gap-5 overflow-y-auto pr-1">
                        
                        {/* Heading / Scene Name */}
                        <div>
                            <h3 className="text-sm font-bold text-white tracking-wide mb-1">
                                {currentScene.name || "Untitled Scene"}
                            </h3>
                            <span className="text-[10px] uppercase font-bold text-white/30 tracking-widest">
                                Scene Setup & Slides
                            </span>
                        </div>

                        {/* Title Input Field */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] uppercase font-bold text-white/40 tracking-wider">
                                Title
                            </label>
                            <input
                                type="text"
                                value={currentScene.name || ""}
                                onChange={(e) => setCurrentScene(prev => ({ ...prev, name: e.target.value }))}
                                placeholder="Type your Title here..."
                                className="w-full bg-[#1b1b22] text-xs font-semibold text-white/90 p-3 rounded-2xl border border-white/10 outline-none focus:border-purple-500/50 transition-colors placeholder:text-white/20"
                            />
                        </div>

                        {/* Mode Selector (3 Icon Cards) */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] uppercase font-bold text-white/40 tracking-wider">
                                Navigation Mode
                            </label>
                            <div className="bg-[#1b1b22] border border-white/10 rounded-2xl p-1.5 flex gap-1">
                                {[
                                    { id: "manual", icon: PiFileText, label: "Manual", desc: "Space / Arrow keyboard nav" },
                                    { id: "read_along", icon: PiBookmarkSimple, label: "Read-Along", desc: "Voice auto-advance" },
                                    { id: "mobile", icon: PiDeviceMobile, label: "Mobile", desc: "Mobile companion app" },
                                ].map(mode => (
                                    <button
                                        key={mode.id}
                                        type="button"
                                        onClick={() => setCurrentScene(prev => ({ ...prev, navMode: mode.id }))}
                                        title={mode.desc}
                                        className={`flex-1 flex flex-col items-center justify-center py-2.5 px-1 rounded-xl transition-all ${
                                            currentScene.navMode === mode.id
                                                ? "bg-white text-black font-bold shadow-md"
                                                : "text-white/40 hover:text-white/80 hover:bg-white/5"
                                        }`}
                                    >
                                        <mode.icon size={16} />
                                        <span className="text-[9px] font-bold tracking-tight mt-1 uppercase leading-none">
                                            {mode.label}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Target Screen Selector (Speaker Only vs Both Screens) */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] uppercase font-bold text-white/40 tracking-wider">
                                Display Output
                            </label>
                            <div className="bg-[#1b1b22] border border-white/10 rounded-2xl p-1.5 flex gap-1">
                                <button
                                    type="button"
                                    onClick={() => setTargetMode("both")}
                                    className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all ${
                                        currentScene.targetMode !== "speaker_only"
                                            ? "bg-white text-black font-bold shadow-md"
                                            : "text-white/40 hover:text-white/80 hover:bg-white/5"
                                    }`}
                                >
                                    <span className="text-[10px] font-bold tracking-tight uppercase leading-none">
                                        Both
                                    </span>
                                    <span className="text-[8px] opacity-70 mt-0.5">Speaker & General</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTargetMode("speaker_only")}
                                    className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all ${
                                        currentScene.targetMode === "speaker_only"
                                            ? "bg-white text-black font-bold shadow-md"
                                            : "text-white/40 hover:text-white/80 hover:bg-white/5"
                                    }`}
                                >
                                    <span className="text-[10px] font-bold tracking-tight uppercase leading-none">
                                        Speaker Only
                                    </span>
                                    <span className="text-[8px] opacity-70 mt-0.5">Only Speaker View</span>
                                </button>
                            </div>
                        </div>

                        {/* Clean Page Name List (No dropdowns, only page names) */}
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] uppercase font-bold text-white/40 tracking-wider">
                                    Pages ({currentScene.pages.length})
                                </label>
                                <button
                                    type="button"
                                    onClick={handleAddPage}
                                    className="text-orange-400 hover:text-orange-300 text-xs font-bold flex items-center gap-1 bg-orange-400/10 px-2 py-0.5 rounded-lg transition-colors"
                                >
                                    <PiPlus size={12} /> Add
                                </button>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                {currentScene.pages.map((p, idx) => {
                                    const isActive = idx === activePageIdx;
                                    return (
                                        <div
                                            key={p.id || idx}
                                            onClick={() => setActivePageIdx(idx)}
                                            className={`rounded-xl px-3.5 py-2.5 flex items-center justify-between transition-all cursor-pointer border ${
                                                isActive
                                                    ? "bg-white text-black border-white shadow-md"
                                                    : "bg-[#1b1b22] text-white/80 border-white/5 hover:border-white/20 hover:text-white"
                                            }`}
                                        >
                                            <span className={`text-xs font-bold tracking-wide ${isActive ? "text-black font-extrabold" : "text-white/80"}`}>
                                                Page {idx + 1}
                                            </span>

                                            {currentScene.pages.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleDeletePage(idx, e)}
                                                    className={`p-1 rounded transition-colors ${
                                                        isActive
                                                            ? "text-black/40 hover:text-red-600"
                                                            : "text-white/20 hover:text-red-400"
                                                    }`}
                                                    title="Delete Page"
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
                    <div className="pt-3 border-t border-white/5">
                        <button
                            type="button"
                            onClick={handleAddPage}
                            className="w-full bg-[#1c1c22] hover:bg-[#25252c] text-white/90 text-xs font-bold py-2.5 px-4 rounded-2xl border border-white/10 flex items-center justify-center gap-2 transition-all active:scale-98 shadow-sm"
                        >
                            <PiPlus size={14} /> Add Page
                        </button>
                    </div>
                </div>

                {/* ─── RIGHT MAIN CONTENT (Preview & Formatting Toolbar) ───── */}
                <div className="flex-1 flex flex-col justify-between p-6 overflow-hidden bg-[#0a0a0d]">
                    
                    {/* Top Action & Navigation Bar */}
                    <div className="flex items-center justify-between mb-3 shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1 border border-white/5">
                                <button
                                    type="button"
                                    onClick={() => setActivePageIdx(prev => Math.max(0, prev - 1))}
                                    disabled={activePageIdx === 0}
                                    className="p-1 rounded-lg text-white/50 hover:text-white disabled:opacity-20 transition-all"
                                    title="Previous Page"
                                >
                                    <PiArrowLeft size={14} />
                                </button>
                                <span className="text-xs font-bold text-white/70 px-2 font-mono">
                                    Page {activePageIdx + 1} / {currentScene.pages.length}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setActivePageIdx(prev => Math.min(currentScene.pages.length - 1, prev + 1))}
                                    disabled={activePageIdx >= currentScene.pages.length - 1}
                                    className="p-1 rounded-lg text-white/50 hover:text-white disabled:opacity-20 transition-all"
                                    title="Next Page"
                                >
                                    <PiArrowRight size={14} />
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => handleSplitToNextPage()}
                                className="bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-bold px-3 py-1.5 rounded-xl border border-white/10 flex items-center gap-1.5 transition-all"
                                title="Split text at cursor into next page (Shift+Enter)"
                            >
                                <PiScissors size={13} className="text-orange-400" /> Split to Next Page
                            </button>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Target Screen Toggle Pill in Top Bar */}
                            <div className="flex items-center bg-[#1b1b22] border border-white/10 rounded-xl p-0.5 text-xs">
                                <button
                                    type="button"
                                    onClick={() => setTargetMode("both")}
                                    className={`px-2.5 py-1 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-all ${
                                        currentScene.targetMode !== "speaker_only"
                                            ? "bg-purple-600 text-white shadow-sm"
                                            : "text-white/40 hover:text-white"
                                    }`}
                                >
                                    Both Screens
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTargetMode("speaker_only")}
                                    className={`px-2.5 py-1 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-all ${
                                        currentScene.targetMode === "speaker_only"
                                            ? "bg-purple-600 text-white shadow-sm"
                                            : "text-white/40 hover:text-white"
                                    }`}
                                >
                                    Speaker Only
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={handleSave}
                                className="bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-400 hover:to-purple-500 text-white text-xs font-bold px-5 py-2 rounded-xl flex items-center gap-2 shadow-lg transition-all active:scale-95"
                            >
                                <PiFloppyDisk size={15} /> Save
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

                    {/* Main Canvas Preview Box with Exact Font Scaling & No Headers */}
                    <div
                        className="flex-1 rounded-3xl border border-white/10 overflow-hidden flex items-center justify-center p-8 relative shadow-2xl transition-all"
                        style={{ backgroundColor: currentScene.style.backgroundColor || "#000000" }}
                    >
                        <textarea
                            ref={textareaRef}
                            value={activePage.content}
                            onChange={(e) => handleContentChange(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onPaste={handlePaste}
                            placeholder="Type or paste scene text / lyrics / lists here..."
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
                                lineHeight: "1.45",
                            }}
                            className="w-full h-full bg-transparent outline-none resize-none border-none flex items-center justify-center text-center drop-shadow-md placeholder:text-white/20 overflow-y-auto"
                        />
                    </div>

                    {/* Bottom Formatting Toolbar (Including Bullet & Numbered Lists) */}
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
                                    <option value="auto">Auto (Smart Scale)</option>
                                    <option value="18">18px</option>
                                    <option value="24">24px</option>
                                    <option value="32">32px</option>
                                    <option value="40">40px</option>
                                    <option value="48">48px</option>
                                    <option value="56">56px</option>
                                    <option value="64">64px</option>
                                    <option value="72">72px</option>
                                    <option value="84">84px</option>
                                    <option value="96">96px</option>
                                </select>
                                <PiCaretDown size={12} className="absolute right-2.5 pointer-events-none text-white/40" />
                            </div>

                            <div className="h-4 w-px bg-white/10" />

                            {/* List Formatting Buttons (Bullet List & Numbered List) */}
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={toggleBulletList}
                                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors text-white/70 hover:text-white hover:bg-white/10 active:bg-white/20"
                                    title="Unordered Bullet List (•)"
                                >
                                    <PiListBullets size={15} />
                                </button>
                                <button
                                    type="button"
                                    onClick={toggleNumberedList}
                                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors text-white/70 hover:text-white hover:bg-white/10 active:bg-white/20"
                                    title="Ordered Numbered List (1, 2, 3)"
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
                                <span className="text-[11px] font-mono font-medium text-white/80 uppercase">
                                    {currentScene.style.color || "#FFFFFF"}
                                </span>
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
                                        currentScene.style.fontWeight === "700"
                                            ? "bg-white/20 text-white"
                                            : "text-white/40 hover:text-white/80 hover:bg-white/5"
                                    }`}
                                    title="Bold"
                                >
                                    B
                                </button>
                                <button
                                    type="button"
                                    onClick={() => updateStyle("isItalic", !currentScene.style.isItalic)}
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center italic font-serif text-xs transition-colors ${
                                        currentScene.style.isItalic
                                            ? "bg-white/20 text-white"
                                            : "text-white/40 hover:text-white/80 hover:bg-white/5"
                                    }`}
                                    title="Italic"
                                >
                                    I
                                </button>
                                <button
                                    type="button"
                                    onClick={() => updateStyle("isUnderline", !currentScene.style.isUnderline)}
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center underline text-xs transition-colors ${
                                        currentScene.style.isUnderline
                                            ? "bg-white/20 text-white"
                                            : "text-white/40 hover:text-white/80 hover:bg-white/5"
                                    }`}
                                    title="Underline"
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
                                                : "text-white/40 hover:text-white/80 hover:bg-white/5"
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
