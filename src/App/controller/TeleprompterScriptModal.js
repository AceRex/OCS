import React, { useState, useEffect } from "react";
import {
  PiX,
  PiPlus,
  PiTrash,
  PiArrowLeft,
  PiArrowRight,
  PiFloppyDisk,
  PiFileText,
  PiCopy,
  PiScissors,
  PiTextAlignLeft,
  PiSquaresFour,
} from "react-icons/pi";

/**
 * TeleprompterScriptModal
 *
 * Scene-styled script authoring modal per PRD Section 5.5 / FR-5.30(b).
 * Allows authoring multi-page / multi-section teleprompter scripts with
 * page reordering, splitting, and script library persistence.
 */
export default function TeleprompterScriptModal({
  isOpen,
  onClose,
  initialScript,
  onSaveScript,
}) {
  const [scriptTitle, setScriptTitle] = useState("");
  const [pages, setPages] = useState([
    { id: "page-1", label: "Section 1", text: "" },
  ]);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [rawPasteOpen, setRawPasteOpen] = useState(false);
  const [rawPasteText, setRawPasteText] = useState("");
  // FR-5.46 [NEW]: per-script scroll mode
  const [scrollMode, setScrollMode] = useState("continuous");

  useEffect(() => {
    if (isOpen) {
      if (initialScript) {
        setScriptTitle(initialScript.title || "Untitled Content");
        setPages(
          initialScript.pages && initialScript.pages.length > 0
            ? initialScript.pages
            : [{ id: `page-${Date.now()}`, label: "Section 1", text: initialScript.rawText || "" }]
        );
        setScrollMode(initialScript.scrollMode || "continuous");
        setActivePageIndex(0);
      } else {
        setScriptTitle("");
        setScrollMode("continuous");
        setPages([
          {
            id: `page-${Date.now()}-1`,
            label: "Section 1",
            text: "",
          },
        ]);
        setActivePageIndex(0);
      }
      setRawPasteOpen(false);
      setRawPasteText("");
    }
  }, [isOpen, initialScript]);

  if (!isOpen) return null;

  const activePage = pages[activePageIndex] || pages[0] || { id: "p1", label: "Page 1", text: "" };

  const handleUpdatePageText = (text) => {
    setPages((prev) =>
      prev.map((p, idx) => (idx === activePageIndex ? { ...p, text } : p))
    );
  };

  const handleUpdatePageLabel = (label) => {
    setPages((prev) =>
      prev.map((p, idx) => (idx === activePageIndex ? { ...p, label } : p))
    );
  };

  const handleAddPage = () => {
    const newPage = {
      id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: `Section ${pages.length + 1}`,
      text: "",
    };
    setPages((prev) => [...prev, newPage]);
    setActivePageIndex(pages.length);
  };

  const handleDeletePage = (idx, e) => {
    e.stopPropagation();
    if (pages.length <= 1) return;
    const nextPages = pages.filter((_, i) => i !== idx);
    setPages(nextPages);
    if (activePageIndex >= nextPages.length) {
      setActivePageIndex(Math.max(0, nextPages.length - 1));
    } else if (activePageIndex === idx) {
      setActivePageIndex(Math.max(0, idx - 1));
    }
  };

  const handleMovePage = (fromIdx, toIdx) => {
    if (toIdx < 0 || toIdx >= pages.length) return;
    const next = [...pages];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setPages(next);
    setActivePageIndex(toIdx);
  };

  const handleDuplicatePage = () => {
    const curr = pages[activePageIndex];
    if (!curr) return;
    const copy = {
      ...curr,
      id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: `${curr.label || "Section"} (Copy)`,
    };
    const next = [...pages];
    next.splice(activePageIndex + 1, 0, copy);
    setPages(next);
    setActivePageIndex(activePageIndex + 1);
  };

  const handleApplyRawPaste = () => {
    if (!rawPasteText.trim()) {
      setRawPasteOpen(false);
      return;
    }
    const blocks = rawPasteText
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter(Boolean);

    if (blocks.length === 0) {
      blocks.push(rawPasteText.trim());
    }

    const newPages = blocks.map((b, i) => ({
      id: `page-${Date.now()}-${i}`,
      label: `Section ${i + 1}`,
      text: b,
    }));

    setPages(newPages);
    setActivePageIndex(0);
    setRawPasteOpen(false);
    setRawPasteText("");
  };

  const handleSave = () => {
    const rawJoinedText = pages
      .map((p) => (p.text || "").trim())
      .filter(Boolean)
      .join("\n\n");

    const saved = {
      id: initialScript?.id || `script_${Date.now()}`,
      title: (scriptTitle || "Untitled Script").trim(),
      pages,
      rawText: rawJoinedText,
      scrollMode, // FR-5.46 [NEW]: persist per-script scroll mode
      wordCount: rawJoinedText ? rawJoinedText.split(/\s+/).filter(Boolean).length : 0,
      updatedAt: Date.now(),
    };

    onSaveScript(saved);
    onClose();
  };

  const totalWords = pages.reduce((acc, p) => {
    return acc + (p.text ? p.text.split(/\s+/).filter(Boolean).length : 0);
  }, 0);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200 font-outfit">
      <div className="bg-[#0e0e14] border border-white/10 rounded-3xl w-full max-w-5xl h-[88vh] flex overflow-hidden shadow-2xl relative text-white flex-col">
        
        {/* Header */}
        <div className="h-16 px-6 border-b border-white/10 flex items-center justify-between bg-[#13121c] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
              <PiFileText size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Teleprompter Content Editor
              </h2>
              <span className="text-xs text-white/40">
                Author and organize multi-section reading content with word-tracking alignment
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* FR-5.46 [NEW]: Per-script scroll mode toggle */}
            <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden" title="Scroll Mode: how the teleprompter advances during a session">
              <button
                onClick={() => setScrollMode("continuous")}
                className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  scrollMode === "continuous"
                    ? "bg-purple-600 text-white shadow-inner"
                    : "text-white/50 hover:text-white/80"
                }`}
                title="Continuous: words scroll smoothly as you speak"
              >
                <PiTextAlignLeft size={13} /> Continuous
              </button>
              <button
                onClick={() => setScrollMode("segmented")}
                className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  scrollMode === "segmented"
                    ? "bg-cyan-600 text-white shadow-inner"
                    : "text-white/50 hover:text-white/80"
                }`}
                title="Segmented: section-by-section paging with vocal cue triggers"
              >
                <PiSquaresFour size={13} /> Segmented
              </button>
            </div>
            <button
              onClick={() => setRawPasteOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-all"
            >
              <PiScissors size={14} /> Paste Plain Text
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-purple-600/30 transition-all active:scale-95"
            >
              <PiFloppyDisk size={15} /> Save Script
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
            >
              <PiX size={18} />
            </button>
          </div>
        </div>

        {/* Body Container */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Left Sidebar: Sections List */}
          <div className="w-80 bg-[#12111a] border-r border-white/10 flex flex-col p-4 shrink-0 overflow-hidden">
            {/* Content Title */}
            <div className="mb-4">
              <label className="text-[10px] font-bold uppercase tracking-wider text-white/40 block mb-1.5">
                Content Title
              </label>
              <input
                type="text"
                value={scriptTitle}
                onChange={(e) => setScriptTitle(e.target.value)}
                placeholder="e.g. Opening Remarks / Keynote / Announcements"
                className="w-full bg-[#1b1926] text-xs font-semibold text-white px-3 py-2 rounded-xl border border-white/10 outline-none focus:border-purple-500/50 transition-colors placeholder:text-white/20"
              />
            </div>

            {/* Sections Header */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                Sections ({pages.length}) • {totalWords} words
              </span>
            </div>

            {/* Sections Scrollable List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 no-scrollbar">
              {pages.map((p, idx) => {
                const isActive = idx === activePageIndex;
                const wordCount = p.text ? p.text.split(/\s+/).filter(Boolean).length : 0;
                return (
                  <div
                    key={p.id || idx}
                    onClick={() => setActivePageIndex(idx)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col gap-1 relative group ${
                      isActive
                        ? "bg-purple-600/20 border-purple-500/60 shadow-md text-white"
                        : "bg-[#181622]/60 hover:bg-[#1f1d2b] border-white/5 text-white/70"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-black ${
                          isActive ? "bg-purple-500 text-white" : "bg-white/10 text-white/60"
                        }`}>
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold truncate max-w-[140px]">
                          {p.label || `Section ${idx + 1}`}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                        {/* Move Up/Down */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMovePage(idx, idx - 1);
                          }}
                          disabled={idx === 0}
                          className="p-1 rounded text-white/40 hover:text-white disabled:opacity-20 transition-colors"
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMovePage(idx, idx + 1);
                          }}
                          disabled={idx === pages.length - 1}
                          className="p-1 rounded text-white/40 hover:text-white disabled:opacity-20 transition-colors"
                          title="Move down"
                        >
                          ↓
                        </button>
                        {pages.length > 1 && (
                          <button
                            onClick={(e) => handleDeletePage(idx, e)}
                            className="p-1 rounded text-white/30 hover:text-red-400 transition-colors ml-1"
                            title="Delete section"
                          >
                            <PiTrash size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-[11px] text-white/40 line-clamp-2 mt-0.5 leading-relaxed font-sans">
                      {p.text || "(Empty section)"}
                    </p>

                    <div className="flex items-center justify-between text-[9px] text-white/30 mt-1 font-mono">
                      <span>{wordCount} words</span>
                      <span>~{Math.max(1, Math.round(wordCount / 130))} min</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add Section Button */}
            <div className="pt-3 border-t border-white/10 mt-2">
              <button
                onClick={handleAddPage}
                className="w-full py-2.5 px-3 rounded-xl bg-[#1b1926] hover:bg-[#252233] text-white/90 text-xs font-bold border border-white/10 flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-98"
              >
                <PiPlus size={14} /> Add Section
              </button>
            </div>
          </div>

          {/* Right Main Editor Canvas */}
          <div className="flex-1 flex flex-col p-6 bg-[#0a0a0f] overflow-hidden">
            {/* Top Editor Toolbar */}
            <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0 flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={activePage.label || ""}
                  onChange={(e) => handleUpdatePageLabel(e.target.value)}
                  placeholder={`Section ${activePageIndex + 1} Title`}
                  className="bg-[#15141e] text-sm font-bold text-white px-3 py-1.5 rounded-xl border border-white/10 outline-none focus:border-purple-500/50 min-w-[200px]"
                />

                <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1 border border-white/5 text-xs">
                  <button
                    onClick={() => setActivePageIndex((prev) => Math.max(0, prev - 1))}
                    disabled={activePageIndex === 0}
                    className="p-1 rounded-lg text-white/50 hover:text-white disabled:opacity-20 transition-all"
                  >
                    <PiArrowLeft size={14} />
                  </button>
                  <span className="font-mono text-white/70 px-2 font-bold">
                    {activePageIndex + 1} / {pages.length}
                  </span>
                  <button
                    onClick={() => setActivePageIndex((prev) => Math.min(pages.length - 1, prev + 1))}
                    disabled={activePageIndex >= pages.length - 1}
                    className="p-1 rounded-lg text-white/50 hover:text-white disabled:opacity-20 transition-all"
                  >
                    <PiArrowRight size={14} />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleDuplicatePage}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-all"
                >
                  <PiCopy size={13} /> Duplicate
                </button>
              </div>
            </div>

            {/* Textarea Canvas */}
            <div className="flex-1 pt-4 flex flex-col relative overflow-hidden">
              <textarea
                value={activePage.text || ""}
                onChange={(e) => handleUpdatePageText(e.target.value)}
                placeholder="Type or paste teleprompter text for this section here..."
                className="w-full flex-1 bg-transparent text-white text-base md:text-lg leading-relaxed resize-none outline-none font-sans font-medium placeholder:text-white/20 selection:bg-purple-600/40 p-2 overflow-y-auto no-scrollbar"
                autoFocus
              />

              <div className="h-10 border-t border-white/5 flex items-center justify-between text-xs text-white/40 pt-2 shrink-0 font-mono">
                <span>
                  Section Words: {activePage.text ? activePage.text.split(/\s+/).filter(Boolean).length : 0}
                </span>
                <span>
                  Tip: ASR aligns word-by-word with live audio as you speak
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Raw Paste Plain Text Modal Overlay */}
        {rawPasteOpen && (
          <div className="absolute inset-0 z-30 bg-black/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-150">
            <div className="bg-[#12111a] border border-white/10 rounded-2xl w-full max-w-2xl flex flex-col p-6 gap-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <PiScissors size={16} className="text-purple-400" />
                  Import / Paste Entire Script
                </h3>
                <button
                  onClick={() => setRawPasteOpen(false)}
                  className="text-white/40 hover:text-white"
                >
                  <PiX size={16} />
                </button>
              </div>
              <p className="text-xs text-white/50 leading-relaxed">
                Paste your complete sermon or speech text below. Paragraph breaks (blank lines) will automatically create separate sections.
              </p>
              <textarea
                value={rawPasteText}
                onChange={(e) => setRawPasteText(e.target.value)}
                placeholder="Paste full plain-text script here..."
                rows={10}
                className="w-full bg-[#1b1926] text-xs text-white p-3 rounded-xl border border-white/10 outline-none focus:border-purple-500/50 font-sans leading-relaxed resize-none"
              />
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setRawPasteOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyRawPaste}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md"
                >
                  Split into Sections
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
