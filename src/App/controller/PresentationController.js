import React, { useState, useEffect, useRef, useCallback } from "react";
import {
    PiFolder, PiImage, PiShapes, PiTextT,
    PiTrash, PiSliders, PiTextAa, PiBroadcast,
    PiCheckSquare, PiSquare, PiPlus, PiMonitorPlay, PiFilmSlate,
    PiArrowLeft, PiArrowRight, PiPencil, PiFloppyDisk, PiX,
    PiArrowUp, PiArrowDown, PiWifiHigh, PiHandPointing, PiMicrophone,
    PiCaretDownBold, PiTextAlignLeft, PiTextAlignCenter, PiTextAlignRight,
    PiEye, PiPlay, PiPause, PiSkipBack, PiSkipForward, PiStop, PiSpeakerHigh, PiSpeakerSlash, PiCornersOut,
    PiStack, PiMusicNotes, PiRepeat, PiFileText, PiDotsThreeVertical,
    PiPresentation, PiSlideshow, PiDotsSixVertical, PiSlidersHorizontal, PiArrowsDownUp, PiVideo,
} from "react-icons/pi";
import SceneModal from "./SceneModal";
import { PresentationImportProgressModal, PresentationFontAdvisoryModal } from "./PresentationImportModal";
import { renderAnimatedLyrics } from "./LyricAnimationEngine";

const isVideoFile = (url) => {
    if (!url || typeof url !== 'string') return false;
    const clean = url.split('?')[0].split('#')[0].toLowerCase();
    return clean.endsWith('.mp4') || clean.endsWith('.webm') || clean.endsWith('.mov') || clean.endsWith('.m4v') || clean.endsWith('.ogg') || clean.endsWith('.mkv');
};

const formatTimecode = (seconds) => {
    if (!seconds || isNaN(seconds) || seconds < 0) return '00:00:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * 30);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(frames)}`;
};

/**
 * One-word-ahead word tracking for Controller preview.
 * Active highlight is always at currentWordIndex + 1 (the next word to speak).
 */
function renderTrackedSceneWords(text, currentWordIndex, isTracking) {
    if (!text) return null;
    if (!isTracking || typeof currentWordIndex !== "number" || currentWordIndex < -1) {
        return text;
    }

    const segments = text.split(/(\s+)/);
    let wordCounter = 0;

    return segments.map((seg, idx) => {
        if (/^\s+$/.test(seg)) {
            return <span key={idx}>{seg}</span>;
        }

        const tokenIdx = wordCounter++;
        const isRead = tokenIdx <= currentWordIndex;
        const isActive = tokenIdx === currentWordIndex + 1;

        return (
            <span
                key={idx}
                className={`transition-all duration-150 ${
                    isActive
                        ? "text-cyan-300 font-bold underline decoration-cyan-400 decoration-2 underline-offset-4"
                        : isRead
                        ? "text-white font-semibold"
                        : "text-white/40"
                }`}
            >
                {seg}
            </span>
        );
    });
}

// ─── Scene Helpers & Chorus Flow Sequence Generator ─────────────────────────

function buildSceneSequence(scene) {
    if (!scene || !Array.isArray(scene.pages) || scene.pages.length === 0) {
        return [{ pageIndex: 0, label: 'Page 1', repeatIndex: 1, repeatTotal: 1 }];
    }

    const isSong = scene.sceneType === 'song';
    const autoChorus = scene.autoChorus !== false;

    if (!isSong || !autoChorus) {
        const seq = [];
        scene.pages.forEach((p, idx) => {
            const count = Math.max(1, p.repeatCount || 1);
            const baseLabel = isSong ? (p.label || `Verse ${idx + 1}`) : `Page ${idx + 1}`;
            for (let r = 1; r <= count; r++) {
                seq.push({
                    pageIndex: idx,
                    label: count > 1 ? `${baseLabel} (${r}/${count})` : baseLabel,
                    baseLabel,
                    sectionType: p.sectionType || 'page',
                    repeatIndex: r,
                    repeatTotal: count,
                });
            }
        });
        return seq;
    }

    const chorusIdx = scene.pages.findIndex(p => p.sectionType === 'chorus');
    if (chorusIdx === -1) {
        const seq = [];
        scene.pages.forEach((p, idx) => {
            const count = Math.max(1, p.repeatCount || 1);
            const baseLabel = p.label || `Verse ${idx + 1}`;
            for (let r = 1; r <= count; r++) {
                seq.push({
                    pageIndex: idx,
                    label: count > 1 ? `${baseLabel} (${r}/${count})` : baseLabel,
                    baseLabel,
                    sectionType: p.sectionType || 'verse',
                    repeatIndex: r,
                    repeatTotal: count,
                });
            }
        });
        return seq;
    }

    const chorusPage = scene.pages[chorusIdx];
    const chorusRepeats = Math.max(1, chorusPage.repeatCount || 1);
    const chorusLabel = chorusPage.label || 'Chorus';

    const addChorus = (seq) => {
        for (let r = 1; r <= chorusRepeats; r++) {
            seq.push({
                pageIndex: chorusIdx,
                label: chorusRepeats > 1 ? `${chorusLabel} (${r}/${chorusRepeats})` : chorusLabel,
                baseLabel: chorusLabel,
                sectionType: 'chorus',
                repeatIndex: r,
                repeatTotal: chorusRepeats,
                isAutoInserted: true,
            });
        }
    };

    const sequence = [];
    let verseCount = 1;

    scene.pages.forEach((p, idx) => {
        const sType = p.sectionType || (idx === chorusIdx ? 'chorus' : 'verse');
        const count = Math.max(1, p.repeatCount || 1);
        const baseLabel = p.label || (sType === 'chorus' ? 'Chorus' : (sType === 'bridge' ? 'Bridge' : `Verse ${verseCount++}`));

        if (idx === chorusIdx) {
            for (let r = 1; r <= count; r++) {
                sequence.push({
                    pageIndex: idx,
                    label: count > 1 ? `${baseLabel} (${r}/${count})` : baseLabel,
                    baseLabel,
                    sectionType: 'chorus',
                    repeatIndex: r,
                    repeatTotal: count,
                });
            }
        } else {
            for (let r = 1; r <= count; r++) {
                sequence.push({
                    pageIndex: idx,
                    label: count > 1 ? `${baseLabel} (${r}/${count})` : baseLabel,
                    baseLabel,
                    sectionType: sType,
                    repeatIndex: r,
                    repeatTotal: count,
                });
            }
            if (sType === 'verse') {
                const nextSec = scene.pages[idx + 1];
                if (!nextSec || nextSec.sectionType !== 'chorus') {
                    addChorus(sequence);
                }
            }
        }
    });

    return sequence;
}

function newScene(name = "Untitled Song", sceneType = "song") {
    return {
        id: `scene-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        sceneType,
        autoChorus: true,
        navMode: "read_along",
        pages: [
            { id: `pg-${Date.now()}-1`, content: "", sectionType: sceneType === 'song' ? 'verse' : 'page', label: sceneType === 'song' ? 'Verse 1' : 'Page 1', repeatCount: 1 },
            ...(sceneType === 'song' ? [{ id: `pg-${Date.now()}-2`, content: "", sectionType: 'chorus', label: 'Chorus', repeatCount: 1 }] : []),
        ],
        style: {
            fontFamily: "Inter Tight",
            fontWeight: "600",
            fontSize: "auto",
            lineHeight: "1.45",
            color: "#FFFFFF",
            backgroundColor: "#000000",
            backgroundImage: null,
            backgroundOpacity: 0.85,
            animation: "fade",
            textAlign: "center",
            isItalic: false,
            isUnderline: false,
        },
        createdAt: Date.now(),
    };
}

// ─── Scene Tab ─────────────────────────────────────────────────────────────

function SceneTab({
    onOpenModal,
    scenes,
    setScenes,
    activeSceneId,
    activePageIndex,
    activeSequenceIndex,
    isPresenting,
    suggestPrompt,
    alignProgress,
    activateScene,
    handleNextPage,
    handlePrevPage,
    handleStopScene,
    onToggleLiveNavMode,
    previewScene,
    onLoadToPreview,
}) {
    const handleDeleteScene = async (sceneId) => {
        await window.electron?.Scene?.delete(sceneId).catch(() => {});
        setScenes(prev => prev.filter(s => s.id !== sceneId));
        if (activeSceneId === sceneId) {
            handleStopScene();
        }
    };

    const activeScene = scenes.find(s => s.id === activeSceneId);
    const activeSequence = activeScene ? buildSceneSequence(activeScene) : [];
    const currentSeqItem = activeSequence[activeSequenceIndex] || { label: `Page ${activePageIndex + 1}` };

    return (
        <div className="flex flex-col h-full gap-0">
            <div className="flex flex-col gap-3 flex-1 overflow-y-auto p-3">
                <div className="flex justify-between items-center">
                    <span className="text-[10px] uppercase text-white/40 font-bold tracking-widest">Scenes & Songs</span>
                    <button
                        onClick={() => onOpenModal(newScene(`Song ${scenes.length + 1}`, "song"))}
                        className="text-orange-400 hover:text-orange-300 bg-orange-400/10 p-1.5 rounded transition-colors flex items-center gap-1 text-xs font-bold"
                        title="Add Scene"
                    >
                        <PiPlus size={14} /> Add
                    </button>
                </div>

                {/* Live Scene Floating Banner if presenting */}
                {isPresenting && activeScene && (
                    <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3 flex flex-col gap-2 shadow-inner">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400">
                                    ● Live: {activeScene.name}
                                </span>
                                <button
                                    type="button"
                                    onClick={onToggleLiveNavMode}
                                    title="Click to toggle between Voice-tracking (Sing/Read-Along) and Manual Navigation"
                                    className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border transition-colors ${
                                        activeScene.navMode !== 'manual' && (activeScene.navMode === 'read_along' || activeScene.sceneType === 'song')
                                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/30 animate-pulse"
                                            : "bg-white/10 text-white/60 border-white/10 hover:bg-white/20 hover:text-white"
                                    }`}
                                >
                                    {activeScene.navMode !== 'manual' && (activeScene.navMode === 'read_along' || activeScene.sceneType === 'song')
                                        ? (activeScene.sceneType === 'song' ? '🎤 Sing-Along' : '📖 Read-Along')
                                        : '✋ Manual'}
                                </button>
                            </div>
                            <button onClick={handleStopScene} className="text-[10px] text-red-400 hover:text-red-300 bg-red-500/10 px-2 py-0.5 rounded transition-colors font-bold">
                                Stop
                            </button>
                        </div>

                        {/* Live voice tracking meter */}
                        {activeScene.navMode !== 'manual' && (activeScene.navMode === 'read_along' || activeScene.sceneType === 'song') && (
                            <div className="flex flex-col gap-1 bg-black/40 p-2 rounded-lg border border-white/5">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-orange-300">
                                        {currentSeqItem.label || `Part ${activePageIndex + 1}`}
                                    </span>
                                    <span className="text-[10px] font-mono text-white/40">
                                        Step {activeSequenceIndex + 1} / {activeSequence.length}
                                    </span>
                                </div>
                                <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden mt-1">
                                    <div
                                        className="bg-gradient-to-r from-emerald-400 to-cyan-400 h-full transition-all duration-150"
                                        style={{ width: `${alignProgress.progressPct}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Fallback prompt when stalled in Read-Along */}
                        {suggestPrompt && (
                            <div className="bg-white/10 border border-white/20 rounded-lg p-2 flex items-center justify-between animate-in fade-in duration-200">
                                <span className="text-[11px] font-bold text-white">
                                    {suggestPrompt.label || "Advance to Next?"}
                                </span>
                                <button
                                    onClick={handleNextPage}
                                    className="text-[10px] font-bold uppercase px-2 py-1 rounded bg-white/20 hover:bg-white/30 text-white border border-white/30 transition-colors"
                                >
                                    Advance Now →
                                </button>
                            </div>
                        )}

                        <div className="flex items-center gap-2">
                            <button
                                onClick={handlePrevPage}
                                disabled={activeSequenceIndex === 0}
                                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white disabled:opacity-30 transition-all text-xs font-bold"
                            >
                                <PiArrowLeft size={14} /> Prev
                            </button>
                            <span className="text-[10px] text-white/40 tabular-nums font-mono">
                                {activeSequenceIndex + 1} / {activeSequence.length}
                            </span>
                            <button
                                onClick={handleNextPage}
                                disabled={activeSequenceIndex >= activeSequence.length - 1}
                                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white disabled:opacity-30 transition-all text-xs font-bold"
                            >
                                Next <PiArrowRight size={14} />
                            </button>
                        </div>
                    </div>
                )}

                {scenes.length === 0 && (
                    <div className="text-white/20 text-xs text-center mt-6 flex flex-col items-center gap-2">
                        <PiMusicNotes size={28} className="opacity-30" />
                        <span>No songs or scenes yet. Click + to create one.</span>
                    </div>
                )}

                {/* Scene Cards List — Clicking card selects & loads it directly into the Main Preview */}
                {scenes.map(scene => {
                    const isActive = scene.id === activeSceneId && isPresenting;
                    const isPreviewingThisScene = previewScene && previewScene.scene?.id === scene.id;
                    const isSong = scene.sceneType === 'song';
                    const sequence = buildSceneSequence(scene);

                    return (
                        <div
                            key={scene.id}
                            onClick={() => onLoadToPreview(scene, isPreviewingThisScene ? previewScene.pageIndex : 0, isPreviewingThisScene ? previewScene.sequenceIndex : 0)}
                            className={`p-3 rounded-xl border transition-all flex flex-col gap-2 cursor-pointer select-none ${
                                isActive
                                    ? 'bg-orange-500/15 border-orange-500/50 shadow-md ring-1 ring-orange-500/30'
                                    : isPreviewingThisScene
                                    ? 'bg-blue-500/15 border-blue-500/50 shadow-md ring-1 ring-blue-500/30'
                                    : 'bg-white/5 border-white/5 hover:border-white/20 hover:bg-white/10'
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 flex-1 min-w-0 pointer-events-none">
                                    {isSong ? (
                                        <PiMusicNotes size={16} className={isActive ? 'text-orange-400' : isPreviewingThisScene ? 'text-blue-400' : 'text-purple-400/90'} />
                                    ) : (
                                        <PiFileText size={16} className={isActive ? 'text-orange-400' : isPreviewingThisScene ? 'text-blue-400' : 'text-emerald-400/90'} />
                                    )}
                                    <span className={`text-sm font-bold truncate ${isActive ? 'text-orange-300' : isPreviewingThisScene ? 'text-blue-300' : 'text-white/90'}`}>
                                        {scene.name}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onOpenModal(scene); }}
                                        className="p-1.5 text-white/30 hover:text-blue-400 rounded transition-colors"
                                        title="Edit Scene"
                                    >
                                        <PiPencil size={13} />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteScene(scene.id); }}
                                        className="p-1.5 text-white/30 hover:text-red-400 rounded transition-colors"
                                        title="Delete"
                                    >
                                        <PiTrash size={13} />
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-white/40 pointer-events-none">
                                <span className="flex items-center gap-1.5">
                                    <span className="font-semibold uppercase tracking-wider text-white/50">{isSong ? 'Song' : 'Text'}</span>
                                    <span>·</span>
                                    <span>{scene.pages.length} part{scene.pages.length !== 1 ? 's' : ''}</span>
                                    {isSong && scene.autoChorus && (
                                        <span className="text-purple-400/80 font-medium">· Chorus Flow</span>
                                    )}
                                </span>
                                {isPreviewingThisScene && (
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                                        Selected
                                    </span>
                                )}
                            </div>

                            {/* Section / Page selector dropdown */}
                            <div className="flex flex-col gap-1 pt-1 border-t border-white/5" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-lg px-2 py-1">
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-white/40 shrink-0">
                                        {isSong ? "Section" : "Page"}
                                    </span>
                                    <select
                                        value={isPreviewingThisScene ? (previewScene.sequenceIndex ?? 0) : 0}
                                        onChange={(e) => {
                                            const seqIdx = parseInt(e.target.value, 10);
                                            const seqItem = sequence[seqIdx] || { pageIndex: 0 };
                                            onLoadToPreview(scene, seqItem.pageIndex, seqIdx);
                                        }}
                                        className="bg-transparent text-[11px] font-semibold text-white/90 outline-none w-full cursor-pointer"
                                    >
                                        {sequence.map((item, sIdx) => {
                                            const page = scene.pages[item.pageIndex] || {};
                                            const snippet = (page.content || '').replace(/\s+/g, ' ').trim().slice(0, 24);
                                            return (
                                                <option key={`${item.pageIndex}-${sIdx}`} value={sIdx} className="bg-[#1b1b22] text-white">
                                                    {item.label}: {snippet ? `"${snippet}..."` : '(Empty)'}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Main PresentationController ───────────────────────────────────────────

export default function PresentationController() {
    const [mediaFiles, setMediaFiles] = useState([]);
    const [activeTab, setActiveTab] = useState('media');
    const [presentations, setPresentations] = useState([]);
    const [selectedPresentation, setSelectedPresentation] = useState(null);
    const [activeSlideIndex, setActiveSlideIndex] = useState(0);
    const [isPresentingSlide, setIsPresentingSlide] = useState(false);
    const [activeDeckId, setActiveDeckId] = useState(null);
    const [importProgress, setImportProgress] = useState(null);
    const [showFontAdvisoryModal, setShowFontAdvisoryModal] = useState(null);

    // Scene State (Songs & Text Presentation)
    const [scenes, setScenes] = useState([]);
    const [activeSceneId, setActiveSceneId] = useState(null);
    const [activePageIndex, setActivePageIndex] = useState(0);
    const [activeSequenceIndex, setActiveSequenceIndex] = useState(0);
    const [isPresentingScene, setIsPresentingScene] = useState(false);
    const [suggestPrompt, setSuggestPrompt] = useState(null);
    const [sceneModalOpen, setSceneModalOpen] = useState(false);
    const [modalScene, setModalScene] = useState(null);

    // Live Voice Alignment Progress State
    const [alignProgress, setAlignProgress] = useState({ wordIndex: -1, totalTokens: 0, progressPct: 0 });

    // Scene Loaded in Preview Canvas: { scene, pageIndex, sequenceIndex }
    const [previewScene, setPreviewScene] = useState(null);

    const [background, setBackground] = useState({ url: null, type: 'image', x: 50, y: 50, width: 100, height: 100 });
    const [layers, setLayers] = useState([
        { id: 'text-1', type: 'text', content: "Welcome", x: 50, y: 50, style: { fontSize: 5, color: '#ffffff', fontFamily: 'sans', width: 0 } }
    ]);
    const [selectedLayerId, setSelectedLayerId] = useState('text-1');
    const [layersPanelHeight, setLayersPanelHeight] = useState(220);
    const [isResizingPanel, setIsResizingPanel] = useState(false);
    const panelDragStartRef = useRef({ startY: 0, startH: 220 });
    const [draggedLayerIndex, setDraggedLayerIndex] = useState(null);

    // Video Playback & Audio Sound States (Reference Image design)
    const [videoPlaying, setVideoPlaying] = useState(true);
    const [videoCurrentTime, setVideoCurrentTime] = useState(0);
    const [videoDuration, setVideoDuration] = useState(0);
    const [videoVolume, setVideoVolume] = useState(1);
    const [videoMuted, setVideoMuted] = useState(false);
    const [videoAspectRatio, setVideoAspectRatio] = useState('16:9');
    const activeVideoRef = useRef(null);

    // Media Asset Batch Selection & Context Menu
    const [selectedAssetUrls, setSelectedAssetUrls] = useState([]);
    const [contextMenu, setContextMenu] = useState(null);

    // General and Speaker targets from the Preview Page header
    const [targets, setTargets] = useState({ general: true, speaker: true });

    const [isDragging, setIsDragging] = useState(false);
    const [resizeHandle, setResizeHandle] = useState(null);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0, initialVal: 0 });
    const [draggingId, setDraggingId] = useState(null);

    const canvasRef = useRef(null);

    // Initial Scene, Media & Presentation Fetch
    useEffect(() => {
        refreshMedia();
        if (window.electron?.Scene?.list) {
            window.electron.Scene.list().then(list => {
                setScenes(Array.isArray(list) ? list : []);
            }).catch(() => {});
        }
        const loadDecks = () => {
            if (window.electron?.Presentation?.list) {
                window.electron.Presentation.list().then(list => {
                    setPresentations(Array.isArray(list) ? list : []);
                }).catch(() => {});
            }
        };
        loadDecks();

        const unsubDecks = window.electron?.Presentation?.onDecksUpdated?.((payload) => {
            loadDecks();
            if (payload?.deck) {
                setSelectedPresentation(payload.deck);
                setActiveTab('presentation');
            }
        });
        const unsubMedia = window.electron?.Media?.onMediaUpdated?.(() => {
            refreshMedia();
        });

        return () => {
            unsubDecks?.();
            unsubMedia?.();
        };
    }, []);

    // Listen to Reference Aligner advance/suggestion/update events
    useEffect(() => {
        const AlignerApi = window.electron?.Aligner;
        if (!AlignerApi) return;

        const advanceFn = AlignerApi.onAdvance || AlignerApi.onAutoAdvance;
        const suggestFn = AlignerApi.onSuggestPrompt || AlignerApi.onPromptSuggest;
        const clearFn = AlignerApi.onClearSuggestion || AlignerApi.onPromptClear;
        const updateFn = AlignerApi.onAlignmentUpdate;

        const unsubAdvance = advanceFn?.((data) => {
            if (!activeSceneId) return;
            const current = scenes.find(s => s.id === activeSceneId);
            if (!current) return;
            const nextIdx = data.pageIndex;
            const nextSeqIdx = typeof data.sequenceIndex === 'number' ? data.sequenceIndex : nextIdx;

            if (nextIdx < current.pages.length) {
                setActivePageIndex(nextIdx);
                setActiveSequenceIndex(nextSeqIdx);
                pushPageContent(current, nextIdx, targets, nextSeqIdx);
                setSuggestPrompt(null);
                setAlignProgress({ wordIndex: -1, totalTokens: 0, progressPct: 0 });
            }
        });

        const unsubSuggest = suggestFn?.((prompt) => {
            setSuggestPrompt(prompt);
        });

        const unsubClear = clearFn?.(() => {
            setSuggestPrompt(null);
        });

        const unsubUpdate = updateFn?.((update) => {
            setAlignProgress({
                wordIndex: update.wordIndex ?? -1,
                totalTokens: update.totalTokens ?? 0,
                progressPct: update.progressPct ?? (update.totalTokens ? Math.round(((update.wordIndex + 1) / update.totalTokens) * 100) : 0),
            });
        });

        return () => {
            unsubAdvance?.();
            unsubSuggest?.();
            unsubClear?.();
            unsubUpdate?.();
        };
    }, [scenes, activeSceneId, targets]);

    const handlePresentSlide = (deck = selectedPresentation, slideIndex = activeSlideIndex) => {
        if (!deck || !deck.slides || deck.slides.length === 0) return;
        const sIdx = Math.max(0, Math.min(slideIndex, deck.slides.length - 1));
        const slide = deck.slides[sIdx];
        if (!slide) return;

        setActiveDeckId(deck.id);
        setActiveSlideIndex(sIdx);
        setIsPresentingSlide(true);
        setIsPresentingScene(false);

        const targetList = Object.keys(targets).filter(k => targets[k]);
        const payload = {
            type: 'presentation',
            data: {
                deckId: deck.id,
                deckName: deck.name,
                slideIndex: sIdx,
                slideNumber: sIdx + 1,
                slideCount: deck.slides.length,
                slideUrl: slide.url,
                notes: slide.notes || '',
            },
            target: targetList.length > 0 ? targetList : ['general', 'speaker']
        };

        if (window.electron?.Presentation?.setContent) {
            window.electron.Presentation.setContent(payload);
        }
    };

    const handleStopSlidePresentation = () => {
        setIsPresentingSlide(false);
        setActiveDeckId(null);
        if (window.electron?.Presentation?.setContent) {
            window.electron.Presentation.setContent(null);
        }
    };

    const handleNextSlide = () => {
        const activeDeck = presentations.find(d => d.id === activeDeckId) || selectedPresentation;
        if (!activeDeck || !activeDeck.slides || activeDeck.slides.length === 0) return;
        const nextIdx = Math.min(activeSlideIndex + 1, activeDeck.slides.length - 1);
        setActiveSlideIndex(nextIdx);
        if (isPresentingSlide) handlePresentSlide(activeDeck, nextIdx);
    };

    const handlePrevSlide = () => {
        const activeDeck = presentations.find(d => d.id === activeDeckId) || selectedPresentation;
        if (!activeDeck || !activeDeck.slides || activeDeck.slides.length === 0) return;
        const prevIdx = Math.max(activeSlideIndex - 1, 0);
        setActiveSlideIndex(prevIdx);
        if (isPresentingSlide) handlePresentSlide(activeDeck, prevIdx);
    };

    // Voice commands from BroadcastEngine via CustomEvent (Scenes & Presentations)
    useEffect(() => {
        const handleVoiceCommand = (e) => {
            const { command, sceneName } = e.detail || {};
            if (command === "start_scene" && sceneName) {
                const match = scenes.find(s =>
                    s.name.toLowerCase().includes(sceneName.toLowerCase())
                );
                if (match) activateScene(match, 0, 0);
            }
            if (command === "next_page") handleNextScenePage();
            if (command === "prev_page") handlePrevScenePage();
        };

        const handlePresentationVoice = (e) => {
            const { command, slideIndex, slideNumber } = e.detail || {};
            const activeDeck = presentations.find(d => d.id === activeDeckId) || selectedPresentation;
            if (!activeDeck || !activeDeck.slides || activeDeck.slides.length === 0) return;

            if (command === "next_slide") {
                setActiveSlideIndex(prev => {
                    const nextIdx = Math.min(prev + 1, activeDeck.slides.length - 1);
                    handlePresentSlide(activeDeck, nextIdx);
                    return nextIdx;
                });
            } else if (command === "prev_slide") {
                setActiveSlideIndex(prev => {
                    const prevIdx = Math.max(prev - 1, 0);
                    handlePresentSlide(activeDeck, prevIdx);
                    return prevIdx;
                });
            } else if (command === "first_slide") {
                handlePresentSlide(activeDeck, 0);
                setActiveSlideIndex(0);
            } else if (command === "last_slide") {
                const lastIdx = activeDeck.slides.length - 1;
                handlePresentSlide(activeDeck, lastIdx);
                setActiveSlideIndex(lastIdx);
            } else if (command === "jump_to_slide") {
                const targetIdx = typeof slideIndex === 'number' ? slideIndex : (slideNumber ? slideNumber - 1 : 0);
                const clamped = Math.max(0, Math.min(targetIdx, activeDeck.slides.length - 1));
                handlePresentSlide(activeDeck, clamped);
                setActiveSlideIndex(clamped);
            }
        };

        window.addEventListener("ocs-scene-command", handleVoiceCommand);
        window.addEventListener("ocs-presentation-command", handlePresentationVoice);
        return () => {
            window.removeEventListener("ocs-scene-command", handleVoiceCommand);
            window.removeEventListener("ocs-presentation-command", handlePresentationVoice);
        };
    }, [scenes, activeSceneId, activePageIndex, activeSequenceIndex, presentations, activeDeckId, selectedPresentation, targets, activeSlideIndex]);

    // Space / Arrow keyboard nav when presenting scenes or slides
    useEffect(() => {
        const handleKey = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (isPresentingScene) {
                if (e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); handleNextScenePage(); }
                if (e.key === 'ArrowLeft') { e.preventDefault(); handlePrevScenePage(); }
            } else if (isPresentingSlide || (activeTab === 'presentation' && selectedPresentation)) {
                if (e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); handleNextSlide(); }
                if (e.key === 'ArrowLeft') { e.preventDefault(); handlePrevSlide(); }
            }
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [isPresentingScene, activeSceneId, activePageIndex, activeSequenceIndex, scenes, isPresentingSlide, activeTab, selectedPresentation, activeSlideIndex]);

    const pushPageContent = (scene, pageIdx, currentTargets = targets, sequenceIndex = 0) => {
        if (!scene || !scene.pages[pageIdx]) return;
        const page = scene.pages[pageIdx];
        const sequence = buildSceneSequence(scene);
        const currentSeqItem = sequence[sequenceIndex] || { label: page.label || `Page ${pageIdx + 1}` };

        const targetArr = [];
        if (currentTargets.general) targetArr.push('general');
        if (currentTargets.speaker) targetArr.push('speaker');
        if (targetArr.length === 0) return;

        const navMode = scene.navMode === 'manual' ? 'manual' : (scene.navMode || (scene.sceneType === 'song' ? 'read_along' : 'manual'));

        const payload = {
            type: 'scene',
            data: {
                sceneId: scene.id,
                sceneName: scene.name,
                sceneType: scene.sceneType || 'song',
                navMode,
                sectionLabel: currentSeqItem.label || page.label || (scene.sceneType === 'song' ? `Verse ${pageIdx + 1}` : `Page ${pageIdx + 1}`),
                pageIndex: pageIdx,
                sequenceIndex: sequenceIndex,
                pageCount: scene.pages.length,
                content: page.content,
                translation: page.translation || '',
                sectionType: page.sectionType || 'verse',
                style: scene.style || page.style || {},
            },
            target: targetArr,
        };

        window.electron?.Presentation?.setContent(payload);
    };

    const activateScene = (scene, pageIdx = 0, seqIdx = 0) => {
        setActiveSceneId(scene.id);
        setActivePageIndex(pageIdx);
        setActiveSequenceIndex(seqIdx);
        setIsPresentingScene(true);
        setSuggestPrompt(null);
        setAlignProgress({ wordIndex: -1, totalTokens: 0, progressPct: 0 });
        pushPageContent(scene, pageIdx, targets, seqIdx);

        const sequence = buildSceneSequence(scene);
        const navMode = scene.navMode === 'manual' ? 'manual' : ((scene.sceneType === 'song' || scene.navMode === 'read_along') ? 'read_along' : (scene.navMode || 'manual'));

        if (navMode === 'read_along') {
            window.electron?.Aligner?.startScene({ ...scene, sequence, navMode: 'read_along' }, pageIdx, seqIdx);
            // Activate microphone ONLY when user presents a scene/song in read_along / sing_along mode
            window.dispatchEvent(new CustomEvent('ocs-mic-activate', { detail: { sceneId: scene.id, navMode } }));
        } else {
            window.electron?.Aligner?.stop();
        }
    };

    const handleLoadSceneToPreview = (scene, pageIdx = 0, seqIdx = 0) => {
        setPreviewScene({ scene, pageIndex: pageIdx, sequenceIndex: seqIdx });
    };

    const handleNextScenePage = () => {
        const cur = scenes.find(s => s.id === activeSceneId);
        if (!cur) return;
        const sequence = buildSceneSequence(cur);

        if (activeSequenceIndex < sequence.length - 1) {
            const nextSeqIdx = activeSequenceIndex + 1;
            const nextItem = sequence[nextSeqIdx];
            setActiveSequenceIndex(nextSeqIdx);
            setActivePageIndex(nextItem.pageIndex);
            pushPageContent(cur, nextItem.pageIndex, targets, nextSeqIdx);
            if (cur.navMode !== 'manual' && (cur.navMode === 'read_along' || cur.sceneType === 'song')) {
                window.electron?.Aligner?.startScene({ ...cur, sequence, navMode: 'read_along' }, nextItem.pageIndex, nextSeqIdx);
            }
        }
    };

    const handlePrevScenePage = () => {
        const cur = scenes.find(s => s.id === activeSceneId);
        if (!cur) return;
        const sequence = buildSceneSequence(cur);

        if (activeSequenceIndex > 0) {
            const prevSeqIdx = activeSequenceIndex - 1;
            const prevItem = sequence[prevSeqIdx];
            setActiveSequenceIndex(prevSeqIdx);
            setActivePageIndex(prevItem.pageIndex);
            pushPageContent(cur, prevItem.pageIndex, targets, prevSeqIdx);
            if (cur.navMode !== 'manual' && (cur.navMode === 'read_along' || cur.sceneType === 'song')) {
                window.electron?.Aligner?.startScene({ ...cur, sequence, navMode: 'read_along' }, prevItem.pageIndex, prevSeqIdx);
            }
        }
    };

    const handleToggleLiveNavMode = () => {
        const cur = scenes.find(s => s.id === activeSceneId);
        if (!cur) return;
        const currentMode = cur.navMode === 'manual' ? 'manual' : (cur.navMode || (cur.sceneType === 'song' ? 'read_along' : 'manual'));
        const newMode = currentMode === 'manual' ? 'read_along' : 'manual';
        const updated = { ...cur, navMode: newMode };

        setScenes(prev => prev.map(s => s.id === cur.id ? updated : s));
        window.electron?.Scene?.save(updated).catch(() => {});

        pushPageContent(updated, activePageIndex, targets, activeSequenceIndex);

        if (newMode === 'manual') {
            window.electron?.Aligner?.stop();
            window.dispatchEvent(new CustomEvent('ocs-mic-stop'));
            setAlignProgress({ wordIndex: -1, totalTokens: 0, progressPct: 0 });
            setSuggestPrompt(null);
        } else {
            const sequence = buildSceneSequence(updated);
            window.electron?.Aligner?.startScene({ ...updated, sequence, navMode: 'read_along' }, activePageIndex, activeSequenceIndex);
            window.dispatchEvent(new CustomEvent('ocs-mic-activate', { detail: { sceneId: updated.id, navMode: 'read_along' } }));
        }
    };

    const handleStopScene = () => {
        setIsPresentingScene(false);
        setActiveSceneId(null);
        setActiveSequenceIndex(0);
        setSuggestPrompt(null);
        setAlignProgress({ wordIndex: -1, totalTokens: 0, progressPct: 0 });
        window.electron?.Aligner?.stop();
        window.dispatchEvent(new CustomEvent('ocs-mic-stop'));
        window.electron?.Presentation?.setContent(null);
    };

    const handleOpenNewScene = () => {
        const created = newScene(`Song ${scenes.length + 1}`, "song");
        setModalScene(created);
        setSceneModalOpen(true);
    };

    const handleOpenEditScene = (scene) => {
        setModalScene(scene);
        setSceneModalOpen(true);
    };

    const handleSaveSceneFromModal = async (updatedScene) => {
        await window.electron?.Scene?.save(updatedScene).catch(() => {});
        setScenes(prev => {
            const exists = prev.some(s => s.id === updatedScene.id);
            if (exists) return prev.map(s => s.id === updatedScene.id ? updatedScene : s);
            return [...prev, updatedScene];
        });
        if (activeSceneId === updatedScene.id && isPresentingScene) {
            pushPageContent(updatedScene, activePageIndex, targets, activeSequenceIndex);
            if (updatedScene.navMode === 'manual') {
                window.electron?.Aligner?.stop();
                window.dispatchEvent(new CustomEvent('ocs-mic-stop'));
                setAlignProgress({ wordIndex: -1, totalTokens: 0, progressPct: 0 });
                setSuggestPrompt(null);
            } else if (updatedScene.navMode === 'read_along') {
                const sequence = buildSceneSequence(updatedScene);
                window.electron?.Aligner?.startScene({ ...updatedScene, sequence, navMode: 'read_along' }, activePageIndex, activeSequenceIndex);
                window.dispatchEvent(new CustomEvent('ocs-mic-activate', { detail: { sceneId: updatedScene.id, navMode: 'read_along' } }));
            }
        }
        if (previewScene && previewScene.scene?.id === updatedScene.id) {
            setPreviewScene({
                scene: updatedScene,
                pageIndex: Math.min(previewScene.pageIndex, updatedScene.pages.length - 1),
                sequenceIndex: previewScene.sequenceIndex || 0,
            });
        }
    };

    const refreshMedia = () => {
        window.electron?.Media?.list?.().then(files => {
            if (Array.isArray(files)) setMediaFiles(files);
        }).catch(() => {});
        window.electron?.Presentation?.list?.().then(decks => {
            if (Array.isArray(decks)) setPresentations(decks);
        }).catch(() => {});
    };

    // Presentation Import Progress Listener
    useEffect(() => {
        if (window.electron?.Presentation?.onImportProgress) {
            const unsub = window.electron.Presentation.onImportProgress((data) => {
                setImportProgress(data);
                if (data.stage === 'done') {
                    setTimeout(() => setImportProgress(null), 1200);
                }
            });
            return () => {
                if (typeof unsub === 'function') unsub();
            };
        }
    }, []);

    const handleImport = () => {
        window.electron?.Media?.import?.().then(result => {
            if (!result) return;
            const newFiles = Array.isArray(result) ? result : [result];
            setMediaFiles(prev => {
                const combined = [...newFiles, ...prev];
                return Array.from(new Set(combined));
            });
        }).catch((err) => {
            console.error("Media import error:", err);
        });
    };

    const handleImportPresentation = () => {
        const importFn = window.electron?.Presentation?.importPresentation || window.electron?.Media?.importPresentation;
        if (typeof importFn === 'function') {
            importFn().then(deck => {
                if (deck) {
                    setPresentations(prev => {
                        const idx = prev.findIndex(p => p.id === deck.id);
                        if (idx >= 0) {
                            const updated = [...prev];
                            updated[idx] = deck;
                            return updated;
                        }
                        return [deck, ...prev];
                    });
                }
            }).catch(err => {
                console.error("Presentation import error:", err);
            });
        }
    };

    const handleToggleSelectAsset = (url, e) => {
        e?.stopPropagation();
        setSelectedAssetUrls(prev =>
            prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]
        );
    };

    const handleSelectAllAssets = () => {
        if (selectedAssetUrls.length === mediaFiles.length) {
            setSelectedAssetUrls([]);
        } else {
            setSelectedAssetUrls([...mediaFiles]);
        }
    };

    const handleAddSelectedAsLayers = () => {
        selectedAssetUrls.forEach((url, i) => {
            const isVideo = isVideoFile(url);
            addLayer(isVideo ? 'video' : 'image', url, { x: 50 + (i * 2), y: 50 + (i * 2) });
        });
        setSelectedAssetUrls([]);
        setContextMenu(null);
    };

    const handleSetFirstSelectedAsBg = () => {
        if (selectedAssetUrls.length === 0) return;
        const url = selectedAssetUrls[0];
        setMediaAsBackground(url, isVideoFile(url));
        setSelectedAssetUrls([]);
        setContextMenu(null);
    };

    const handleDeleteSelectedAssets = async () => {
        if (selectedAssetUrls.length === 0) return;
        for (const url of selectedAssetUrls) {
            try {
                await window.electron?.Media?.delete?.(url);
            } catch (_) {}
        }
        setMediaFiles(prev => prev.filter(f => !selectedAssetUrls.includes(f)));
        setSelectedAssetUrls([]);
        setContextMenu(null);
    };

    const handleDeletePresentation = async (deckId) => {
        try {
            if (window.electron?.Presentation?.delete) {
                await window.electron.Presentation.delete(deckId);
            } else if (window.electron?.Presentation?.deletePresentation) {
                await window.electron.Presentation.deletePresentation(deckId);
            }
            setPresentations(prev => prev.filter(d => d.id !== deckId && d.fileUrl !== deckId));
            if (selectedPresentation && (selectedPresentation.id === deckId || selectedPresentation.fileUrl === deckId)) {
                setSelectedPresentation(null);
            }
        } catch (err) {
            console.error("Failed to delete presentation deck:", err);
        }
    };

    const handleAssetContextMenu = (e, fileUrl) => {
        e.preventDefault();
        e.stopPropagation();
        const isVideo = isVideoFile(fileUrl);
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            url: fileUrl,
            isVideo
        });
        if (!selectedAssetUrls.includes(fileUrl)) {
            setSelectedAssetUrls([fileUrl]);
        }
    };

    // Video Playback Controls (Matching Reference Image)
    const toggleVideoPlay = () => {
        if (!activeVideoRef.current) return;
        if (activeVideoRef.current.paused) {
            activeVideoRef.current.play().catch(() => {});
            setVideoPlaying(true);
        } else {
            activeVideoRef.current.pause();
            setVideoPlaying(false);
        }
    };

    const stopVideo = () => {
        if (!activeVideoRef.current) return;
        activeVideoRef.current.pause();
        activeVideoRef.current.currentTime = 0;
        setVideoPlaying(false);
        setVideoCurrentTime(0);
    };

    const restartVideo = () => {
        if (!activeVideoRef.current) return;
        activeVideoRef.current.currentTime = 0;
        activeVideoRef.current.play().catch(() => {});
        setVideoPlaying(true);
    };

    const jumpToEndVideo = () => {
        if (!activeVideoRef.current || !videoDuration) return;
        activeVideoRef.current.currentTime = Math.max(0, videoDuration - 0.5);
    };

    const handleSeekVideo = (newTime) => {
        if (!activeVideoRef.current) return;
        activeVideoRef.current.currentTime = newTime;
        setVideoCurrentTime(newTime);
    };

    const handleVolumeChange = (newVol) => {
        const v = parseFloat(newVol);
        setVideoVolume(v);
        setVideoMuted(v === 0);
        if (activeVideoRef.current) {
            activeVideoRef.current.volume = v;
            activeVideoRef.current.muted = v === 0;
        }
    };

    const toggleVideoMute = () => {
        const nextMute = !videoMuted;
        setVideoMuted(nextMute);
        if (activeVideoRef.current) {
            activeVideoRef.current.muted = nextMute;
        }
    };

    const addLayer = (type, content = "", options = {}) => {
        setPreviewScene(null);
        setSelectedPresentation(null);
        const id = `${type}-${Date.now()}`;
        const newLayer = {
            id,
            type,
            content,
            x: options.x ?? 50,
            y: options.y ?? 50,
            style: {
                fontSize: type === 'text' ? 5 : undefined,
                color: type === 'text' ? '#ffffff' : undefined,
                fontFamily: 'sans',
                width: (type === 'image' || type === 'video') ? 30 : 0,
                borderRadius: 8,
                opacity: 1,
                ...options.style
            }
        };
        // Top layer is rendered in front (index 0)
        setLayers(prev => [newLayer, ...prev]);
        setSelectedLayerId(id);
    };

    const updateLayer = (id, updates) => {
        setLayers(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
    };

    const removeLayer = (id) => {
        setLayers(prev => prev.filter(l => l.id !== id));
        if (selectedLayerId === id) setSelectedLayerId(null);
    };

    const moveLayerToFront = (index) => {
        // Moves item toward index 0 (Top of list = Front)
        if (index <= 0) return;
        setLayers(prev => {
            const next = [...prev];
            const temp = next[index];
            next[index] = next[index - 1];
            next[index - 1] = temp;
            return next;
        });
    };

    const moveLayerToBack = (index) => {
        // Moves item toward index N-1 (Bottom of list = Back)
        if (index >= layers.length - 1) return;
        setLayers(prev => {
            const next = [...prev];
            const temp = next[index];
            next[index] = next[index + 1];
            next[index + 1] = temp;
            return next;
        });
    };

    const handleLayerDragStart = (e, index) => {
        setDraggedLayerIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(index)); } catch (_) {}
    };

    const handleLayerDragOver = (e, index) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleLayerDrop = (e, targetIndex) => {
        e.preventDefault();
        if (draggedLayerIndex === null || draggedLayerIndex === targetIndex) return;
        setLayers(prev => {
            const next = [...prev];
            const [moved] = next.splice(draggedLayerIndex, 1);
            next.splice(targetIndex, 0, moved);
            return next;
        });
        setDraggedLayerIndex(null);
    };

    const handlePanelResizeStart = (e) => {
        e.stopPropagation();
        e.preventDefault();
        setIsResizingPanel(true);
        panelDragStartRef.current = { startY: e.clientY, startH: layersPanelHeight };
    };

    const setMediaAsBackground = (url, isVideo) => {
        setPreviewScene(null);
        setSelectedPresentation(null);
        // Immediately set background so the preview displays it instantly
        setBackground({ url, type: isVideo ? 'video' : 'image', x: 50, y: 50, width: 100, height: 100 });
        setSelectedLayerId('bg');

        const loadable = isVideo ? document.createElement('video') : new Image();
        loadable.src = url;
        const onLoad = () => {
            const w = isVideo ? loadable.videoWidth : loadable.naturalWidth;
            const h = isVideo ? loadable.videoHeight : loadable.naturalHeight;
            if (w && h) {
                const ratio = w / h;
                const slideRatio = 16 / 9;
                let bw = 100, bh = 100;
                if (ratio > slideRatio) {
                    bh = (slideRatio / ratio) * 100;
                } else {
                    bw = (ratio / slideRatio) * 100;
                }
                setBackground({ url, type: isVideo ? 'video' : 'image', x: 50, y: 50, width: Math.round(bw), height: Math.round(bh) });
            }
        };
        if (isVideo) { loadable.onloadedmetadata = onLoad; } else { loadable.onload = onLoad; }
    };

    const clearBg = () => setBackground({ url: null, type: 'image', x: 50, y: 50, width: 100, height: 100 });

    const handleMouseDown = (e, id, handle = null) => {
        e.stopPropagation();
        let target;
        if (id === 'bg') { target = background; setSelectedLayerId('bg'); }
        else { target = layers.find(l => l.id === id); setSelectedLayerId(id); }
        if (!target) return;
        setDraggingId(id);
        if (handle) {
            setResizeHandle(handle); setIsDragging(false);
            let w = undefined, h = undefined, s = undefined;
            if (id === 'bg') { w = background.width; h = background.height; }
            else if (target.type === 'image' || target.type === 'video') { w = typeof target.style?.width === 'number' ? target.style.width : 30; }
            else { s = target.style?.fontSize || 5; }
            setDragStart({ mouseX: e.clientX, mouseY: e.clientY, initialWidth: w, initialHeight: h, initialSize: s, objX: target.x, objY: target.y });
        } else {
            setResizeHandle(null); setIsDragging(true);
            setDragStart({ mouseX: e.clientX, mouseY: e.clientY, objX: target.x, objY: target.y });
        }
    };

    const handleMouseMove = (e) => {
        if (isResizingPanel) {
            const delta = panelDragStartRef.current.startY - e.clientY;
            const maxH = Math.max(260, Math.floor(window.innerHeight * 0.52));
            const nextH = Math.max(90, Math.min(maxH, panelDragStartRef.current.startH + delta));
            setLayersPanelHeight(nextH);
            return;
        }

        if (!draggingId || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const deltaX = e.clientX - dragStart.mouseX;
        const deltaXPct = (deltaX / rect.width) * 100;
        const deltaYPct = ((e.clientY - dragStart.mouseY) / rect.height) * 100;
        if (resizeHandle) {
            const layer = draggingId !== 'bg' ? layers.find(l => l.id === draggingId) : null;
            const isLeft = resizeHandle.includes('w') || resizeHandle === 'ml';
            const isRight = resizeHandle.includes('e') || resizeHandle === 'mr';
            const isTop = resizeHandle.includes('n') || resizeHandle === 'mt';
            const isBottom = resizeHandle.includes('s') || resizeHandle === 'mb';
            const wMult = isLeft ? -1 : (isRight ? 1 : 0);
            const hMult = isTop ? -1 : (isBottom ? 1 : 0);
            if (layer && layer.type === 'text') {
                const mult = wMult !== 0 ? wMult : 1;
                const newSize = Math.max(1, (dragStart.initialSize || 5) + deltaX * mult * 0.05);
                updateLayer(draggingId, { style: { ...layer.style, fontSize: Math.round(newSize * 10) / 10 } });
            } else if (draggingId === 'bg') {
                let newWidth = background.width, newHeight = background.height;
                if (wMult !== 0) newWidth = Math.max(10, (dragStart.initialWidth || 100) + deltaXPct * wMult);
                if (hMult !== 0) newHeight = Math.max(10, (dragStart.initialHeight || 100) + deltaYPct * hMult);
                setBackground(prev => ({ ...prev, width: Math.round(newWidth), height: Math.round(newHeight) }));
            } else if (layer && (layer.type === 'image' || layer.type === 'video')) {
                const baseW = typeof dragStart.initialWidth === 'number' ? dragStart.initialWidth : 30;
                const mult = (wMult !== 0) ? wMult : (hMult !== 0 ? hMult : 1);
                const newWidth = Math.max(5, Math.min(100, baseW + deltaXPct * mult));
                updateLayer(draggingId, { style: { ...layer.style, width: Math.round(newWidth) } });
            }
        } else if (isDragging) {
            if (draggingId === 'bg') setBackground(prev => ({ ...prev, x: Math.round(dragStart.objX + deltaXPct), y: Math.round(dragStart.objY + deltaYPct) }));
            else updateLayer(draggingId, { x: Math.round(dragStart.objX + deltaXPct), y: Math.round(dragStart.objY + deltaYPct) });
        }
    };

    const handleMouseUp = () => {
        setIsResizingPanel(false);
        setIsDragging(false);
        setResizeHandle(null);
        setDraggingId(null);
    };

    const handlePresent = () => {
        if (!window.electron?.Presentation) return;
        const targetArr = [];
        if (targets.general) targetArr.push('general');
        if (targets.speaker) targetArr.push('speaker');
        if (targetArr.length === 0) return;

        // If previewing a scene, present that scene
        if (previewScene) {
            activateScene(previewScene.scene, previewScene.pageIndex, previewScene.sequenceIndex || 0);
            return;
        }

        const payload = {
            type: 'custom_layers',
            data: {
                background: {
                    ...background,
                    muted: videoMuted || videoVolume === 0,
                    volume: videoVolume,
                    aspectRatio: videoAspectRatio,
                },
                layers: layers.map(l => ({
                    ...l,
                    style: {
                        ...l.style,
                        muted: videoMuted || videoVolume === 0,
                        volume: videoVolume,
                        aspectRatio: videoAspectRatio,
                    }
                })),
                volume: videoVolume,
                muted: videoMuted || videoVolume === 0,
                aspectRatio: videoAspectRatio,
            },
            target: targetArr,
        };
        window.electron.Presentation.setContent(payload);
    };

    const toggleTarget = (key) => {
        const nextTargets = { ...targets, [key]: !targets[key] };
        setTargets(nextTargets);
        if (isPresentingScene && activeSceneId) {
            const cur = scenes.find(s => s.id === activeSceneId);
            if (cur) {
                pushPageContent(cur, activePageIndex, nextTargets, activeSequenceIndex);
            }
        }
    };

    const selectedLayer = layers.find(l => l.id === selectedLayerId);

    const TABS = [
        { id: 'media', label: 'Media', icon: PiImage },
        { id: 'text', label: 'Text', icon: PiTextT },
        { id: 'scene', label: 'Scene', icon: PiFilmSlate },
        { id: 'presentation', label: 'Slides', icon: PiPresentation },
    ];

    const renderLayersSection = () => (
        <div
            className="bg-[#111114] flex flex-col shrink-0 overflow-hidden relative border-t border-white/10"
            style={{ height: `${layersPanelHeight}px` }}
        >
            {/* Draggable Vertical Splitter handle (allows dragging up to ~50% of sidebar) */}
            <div
                onMouseDown={handlePanelResizeStart}
                className="w-full h-3 bg-[#18181c] hover:bg-blue-600/40 active:bg-blue-600/60 cursor-row-resize flex items-center justify-center border-b border-white/10 group transition-colors select-none shrink-0"
                title="Drag up or down to resize Layers panel (up to 50% of screen)"
            >
                <div className="w-12 h-1 bg-white/25 group-hover:bg-blue-400 group-active:bg-blue-400 rounded-full transition-colors" />
            </div>

            <div className="p-3 flex flex-col gap-2 flex-1 min-h-0 overflow-hidden">
                <div className="flex items-center justify-between shrink-0">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-white/40 flex items-center gap-1.5">
                        <PiStack size={12} /> Layers ({layers.length + (background.url ? 1 : 0)})
                    </span>
                    {layers.length > 0 && (
                        <button
                            onClick={() => setLayers([])}
                            className="text-[10px] text-red-400 hover:text-red-300 transition-colors font-bold"
                        >
                            Clear Layers
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto flex flex-col gap-1 pr-0.5">
                    {/* Top item in this list (idx = 0) is rendered at the FRONT */}
                    {layers.map((layer, idx) => {
                        const isSelected = selectedLayerId === layer.id;
                        return (
                            <div
                                key={layer.id}
                                draggable
                                onDragStart={(e) => handleLayerDragStart(e, idx)}
                                onDragOver={(e) => handleLayerDragOver(e, idx)}
                                onDrop={(e) => handleLayerDrop(e, idx)}
                                onClick={() => setSelectedLayerId(layer.id)}
                                className={`px-2 py-1.5 rounded-lg flex items-center justify-between text-xs cursor-pointer transition-all border group ${
                                    isSelected
                                        ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 shadow-sm'
                                        : 'bg-white/5 text-white/70 border-transparent hover:bg-white/10'
                                } ${draggedLayerIndex === idx ? 'opacity-40 border-dashed border-blue-400' : ''}`}
                            >
                                <div className="flex items-center gap-1.5 truncate min-w-0 pr-2">
                                    <span className="cursor-grab active:cursor-grabbing text-white/30 group-hover:text-white/70 p-0.5" title="Drag to reorder layer stack">
                                        <PiDotsSixVertical size={13} />
                                    </span>
                                    {layer.type === 'text' ? (
                                        <PiTextT size={13} className="text-blue-400 shrink-0" />
                                    ) : layer.type === 'video' ? (
                                        <PiVideo size={13} className="text-cyan-400 shrink-0" />
                                    ) : (
                                        <PiImage size={13} className="text-purple-400 shrink-0" />
                                    )}
                                    <span className="truncate font-medium text-xs">
                                        {layer.type === 'text' ? (layer.content || 'Text Layer') : layer.type === 'video' ? `Video Layer ${idx + 1}` : `Image Layer ${idx + 1}`}
                                    </span>
                                    {idx === 0 && (
                                        <span className="text-[9px] bg-blue-500/25 text-blue-300 font-bold px-1.5 py-0.5 rounded tracking-wide shrink-0">
                                            Front
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-0.5 shrink-0">
                                    <button
                                        type="button"
                                        disabled={idx === 0}
                                        onClick={(e) => { e.stopPropagation(); moveLayerToFront(idx); }}
                                        className="p-1 rounded text-white/40 hover:text-white hover:bg-white/10 disabled:opacity-20 disabled:pointer-events-none transition-colors"
                                        title="Bring Forward (Towards Front)"
                                    >
                                        <PiArrowUp size={11} />
                                    </button>
                                    <button
                                        type="button"
                                        disabled={idx === layers.length - 1}
                                        onClick={(e) => { e.stopPropagation(); moveLayerToBack(idx); }}
                                        className="p-1 rounded text-white/40 hover:text-white hover:bg-white/10 disabled:opacity-20 disabled:pointer-events-none transition-colors"
                                        title="Send Backward (Towards Back)"
                                    >
                                        <PiArrowDown size={11} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); removeLayer(layer.id); }}
                                        className="text-white/30 hover:text-red-400 p-1 rounded hover:bg-red-500/10 transition-colors"
                                        title="Delete Layer"
                                    >
                                        <PiTrash size={12} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}

                    {/* Background Base Layer */}
                    {background.url && (
                        <div
                            onClick={() => setSelectedLayerId('bg')}
                            className={`px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs cursor-pointer transition-all border ${
                                selectedLayerId === 'bg'
                                    ? 'bg-white/15 text-white border-white/30 shadow-sm'
                                    : 'bg-white/5 text-white/60 border-transparent hover:bg-white/10'
                            }`}
                        >
                            <div className="flex items-center gap-2 truncate">
                                {background.type === 'video' ? <PiVideo size={13} className="text-white" /> : <PiImage size={13} className="text-white" />}
                                <span className="font-semibold truncate">Background (Base)</span>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); clearBg(); }}
                                className="text-white/30 hover:text-red-400 p-0.5 rounded"
                                title="Remove Background"
                            >
                                <PiTrash size={12} />
                            </button>
                        </div>
                    )}

                    {layers.length === 0 && !background.url && (
                        <span className="text-[10px] text-white/20 italic py-1 text-center">No active layers</span>
                    )}
                </div>
            </div>
        </div>
    );

    // Computed preview sequence & item
    const previewSequence = previewScene ? buildSceneSequence(previewScene.scene) : [];
    const previewSeqIndex = previewScene?.sequenceIndex || 0;
    const previewItem = previewSequence[previewSeqIndex] || { label: 'Page 1', pageIndex: 0 };
    const previewPage = previewScene?.scene?.pages[previewItem.pageIndex] || {};

    return (
        <div className="h-full w-full bg-[#0d0d0d] flex flex-col overflow-hidden text-light font-sans" onMouseUp={handleMouseUp} onMouseMove={handleMouseMove} onClick={() => setContextMenu(null)}>
            <div className="flex-1 flex min-h-0">

                {/* LEFT: PREVIEW */}
                <div className="flex-[2] bg-[#141414] m-2 rounded-2xl border border-white/5 flex flex-col relative overflow-hidden">
                    <div className="h-12 border-b border-white/5 flex items-center justify-between px-4 bg-[#1a1a1a]">
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-bold uppercase tracking-widest text-white/50 flex items-center gap-2">
                                <PiMonitorPlay size={16} /> Main Preview
                            </span>
                            <button
                                onClick={handleOpenNewScene}
                                className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-orange-500/20 to-purple-500/20 hover:from-orange-500/30 hover:to-purple-500/30 text-orange-300 rounded-lg text-xs font-bold uppercase tracking-wider border border-orange-500/30 transition-all shadow-sm active:scale-95"
                            >
                                <PiPlus size={13} /> Add Scene
                            </button>
                        </div>
                        {/* Target Toggles — Controls General and Speaker output for All Content (Media, Text, Scenes, & Slides) */}
                        <div className="flex gap-2">
                            {['general', 'speaker'].map(t => (
                                <button
                                    key={t}
                                    onClick={() => toggleTarget(t)}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                                        targets[t]
                                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                            : 'bg-white/5 text-white/30 border border-transparent hover:bg-white/10'
                                    }`}
                                >
                                    {targets[t] ? <PiCheckSquare size={14} /> : <PiSquare size={14} />} {t}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 relative flex items-center justify-center bg-black/50 p-2 overflow-hidden">
                        {activeTab === 'presentation' && selectedPresentation ? (
                            /* High-Resolution PPTX Slide Preview with Speaker Notes Drawer */
                            <div className="aspect-video w-full max-h-full rounded-lg overflow-hidden relative shadow-2xl border border-white/10 flex flex-col justify-center items-center bg-black select-none">
                                {selectedPresentation.slides?.[activeSlideIndex]?.url ? (
                                    <img
                                        src={selectedPresentation.slides[activeSlideIndex].url}
                                        className="w-full h-full object-contain pointer-events-none"
                                        alt={`Slide ${activeSlideIndex + 1}`}
                                    />
                                ) : (
                                    <div className="text-white/40 text-xs">No Slide Image</div>
                                )}

                                {/* Floating Live Badge */}
                                {isPresentingSlide && activeDeckId === selectedPresentation.id && (
                                    <div className="absolute top-3 right-4 z-20 flex items-center gap-1.5 bg-emerald-500/90 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-bold text-white uppercase tracking-wider shadow-lg">
                                        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                        On Display
                                    </div>
                                )}

                                {/* Slide Number Badge */}
                                <div className="absolute bottom-3 right-4 z-20 bg-black/80 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
                                    <span className="text-xs font-mono font-bold text-white/80">
                                        Slide {activeSlideIndex + 1} / {selectedPresentation.slides?.length || 0}
                                    </span>
                                </div>

                                {/* Speaker Notes Preview in Controller (FR-4.3) */}
                                {selectedPresentation.slides?.[activeSlideIndex]?.notes && (
                                    <div className="absolute bottom-3 left-4 max-w-[60%] bg-black/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/20 text-left">
                                        <span className="text-[9px] uppercase font-bold text-white block mb-0.5 tracking-wider">Speaker Notes</span>
                                        <p className="text-[11px] text-white/90 leading-tight whitespace-pre-wrap max-h-16 overflow-y-auto">
                                            {selectedPresentation.slides[activeSlideIndex].notes}
                                        </p>
                                    </div>
                                )}
                            </div>
                        ) : previewScene ? (
                            /* Clean High-Fidelity Scene Slide Preview with Background Image & Animation */
                            <div
                                className="aspect-video w-full max-h-full rounded-lg overflow-hidden relative shadow-2xl border border-white/10 flex flex-col justify-center items-center p-[4%] transition-all select-none"
                                style={{
                                    backgroundColor: previewScene.scene.style?.backgroundColor || '#000000',
                                    containerType: 'size',
                                }}
                            >
                                {previewScene.scene.style?.backgroundImage && (
                                    <div
                                        className="absolute inset-0 z-0 bg-cover transition-all duration-300 pointer-events-none"
                                        style={{
                                            backgroundImage: previewScene.scene.style.backgroundImage.startsWith('url(')
                                                ? previewScene.scene.style.backgroundImage
                                                : `url("${previewScene.scene.style.backgroundImage}")`,
                                            backgroundPosition: previewScene.scene.style.backgroundPosition === 'top'
                                                ? 'center top'
                                                : previewScene.scene.style.backgroundPosition === 'bottom'
                                                ? 'center bottom'
                                                : 'center center',
                                            opacity: typeof previewScene.scene.style.backgroundOpacity === 'number' ? previewScene.scene.style.backgroundOpacity : 0.85,
                                        }}
                                    />
                                )}
                                {previewScene.scene.style?.backgroundImage && (
                                    <div className="absolute inset-0 z-0 bg-black/40 pointer-events-none" />
                                )}

                                {/* Center Scene Text */}
                                <div className="w-full max-w-[92%] flex justify-center my-auto z-10">
                                    <div
                                        key={`prev-${previewItem.pageIndex}-${previewSeqIndex}`}
                                        className={`leading-relaxed whitespace-pre-wrap ${
                                            previewScene.scene.style?.animation === 'slide-up' ? 'animate-in slide-in-from-bottom-6 duration-300 fade-in' :
                                            previewScene.scene.style?.animation === 'zoom' ? 'animate-in zoom-in-95 duration-300 fade-in' :
                                            'animate-in fade-in duration-300'
                                        }`}
                                        style={{
                                            fontSize: (() => {
                                                const text = previewPage.content || '';
                                                const len = text.length;
                                                if (previewScene.scene.style?.fontSize && previewScene.scene.style.fontSize !== 'auto') {
                                                    const parsed = parseFloat(previewScene.scene.style.fontSize);
                                                    if (!isNaN(parsed)) {
                                                        return parsed > 15 ? `${(parsed / 10).toFixed(1)}cqw` : `${parsed}cqw`;
                                                    }
                                                    return previewScene.scene.style.fontSize;
                                                }
                                                return len > 600 ? '2.4cqw' : len > 350 ? '2.9cqw' : len > 180 ? '3.5cqw' : len > 80 ? '4.0cqw' : '4.8cqw';
                                            })(),
                                            color: previewScene.scene.style?.color || '#FFFFFF',
                                            fontFamily: previewScene.scene.style?.fontFamily === 'serif' ? 'Georgia, serif' : (previewScene.scene.style?.fontFamily === 'mono' ? '"Courier New", monospace' : '"Inter Tight", sans-serif'),
                                            fontWeight: previewScene.scene.style?.fontWeight || '600',
                                            fontStyle: previewScene.scene.style?.isItalic ? 'italic' : 'normal',
                                            textDecoration: previewScene.scene.style?.isUnderline ? 'underline' : 'none',
                                            textAlign: previewScene.scene.style?.textAlign || 'center',
                                            lineHeight: previewScene.scene.style?.lineHeight || '1.45',
                                            textShadow: previewScene.scene.style?.textShadow === "none"
                                                ? "none"
                                                : previewScene.scene.style?.textShadow === "soft"
                                                ? "0 2px 8px rgba(0,0,0,0.65)"
                                                : "0 4px 16px rgba(0,0,0,0.85), 0 1px 3px rgba(0,0,0,0.9)",
                                            width: '100%',
                                        }}
                                    >
                                        {renderAnimatedLyrics({
                                            text: previewPage.content || '',
                                            translation: previewPage.translation || '',
                                            currentWordIndex: isPresentingScene && activeSceneId === previewScene.scene.id && previewScene.scene.navMode !== 'manual' ? alignProgress.wordIndex : -1,
                                            animationType: previewScene.scene.style?.animation || 'karaoke',
                                            style: previewScene.scene.style || {},
                                            isSingAlong: previewScene.scene.sceneType === 'song' || previewScene.scene.navMode === 'read_along',
                                            enableWordTracking: isPresentingScene && activeSceneId === previewScene.scene.id && previewScene.scene.navMode !== 'manual',
                                            sectionType: previewPage.sectionType,
                                            sectionLabel: previewItem.label,
                                        })}
                                    </div>
                                </div>

                                {/* Bottom Live Voice Sing-Along Meter (When Live and not manual) */}
                                {isPresentingScene && activeSceneId === previewScene.scene.id && previewScene.scene.navMode !== 'manual' && (
                                    <div className="absolute bottom-3 left-4 right-4 z-20 flex items-center justify-between bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                            <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">
                                                Voice Tracking
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-28 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-150"
                                                    style={{ width: `${alignProgress.progressPct}%` }}
                                                />
                                            </div>
                                            <span className="text-[10px] font-mono font-bold text-white/60">{alignProgress.progressPct}%</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* Standard Custom Layers Canvas */
                            <div
                                ref={canvasRef}
                                onMouseDown={(e) => handleMouseDown(e, 'bg')}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = 'copy';
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    const fileUrl = e.dataTransfer.getData('application/ocs-media') || e.dataTransfer.getData('text/plain');
                                    if (!fileUrl) return;
                                    if (!canvasRef.current) return;
                                    const rect = canvasRef.current.getBoundingClientRect();
                                    const dropX = Math.round(Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100)));
                                    const dropY = Math.round(Math.max(5, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100)));
                                    const isVideo = isVideoFile(fileUrl);
                                    addLayer(isVideo ? 'video' : 'image', fileUrl, { x: dropX, y: dropY });
                                }}
                                className="aspect-video w-full max-h-full bg-black rounded-lg overflow-hidden relative shadow-2xl border border-white/10"
                                style={{ containerType: 'size' }}
                            >
                                {background.url && (
                                    <div className="absolute z-0" style={{ left: `${background.x}%`, top: `${background.y}%`, transform: 'translate(-50%,-50%)', width: `${background.width}%`, height: `${background.height}%` }} onMouseDown={(e) => handleMouseDown(e, 'bg')}>
                                        {selectedLayerId === 'bg' && (
                                            <>
                                                <div className="absolute -inset-0.5 border-2 border-white/80 border-dashed pointer-events-none z-50" />
                                                {['nw','ne','sw','se','ml','mr','mt','mb'].map(h => {
                                                    const pos = { nw:'-top-1.5 -left-1.5 cursor-nwse-resize', ne:'-top-1.5 -right-1.5 cursor-nesw-resize', sw:'-bottom-1.5 -left-1.5 cursor-nesw-resize', se:'-bottom-1.5 -right-1.5 cursor-nwse-resize', ml:'top-1/2 -translate-y-1/2 -left-1.5 cursor-ew-resize', mr:'top-1/2 -translate-y-1/2 -right-1.5 cursor-ew-resize', mt:'left-1/2 -translate-x-1/2 -top-1.5 cursor-ns-resize', mb:'left-1/2 -translate-x-1/2 -bottom-1.5 cursor-ns-resize' }[h];
                                                    return <div key={h} onMouseDown={(e) => handleMouseDown(e, 'bg', h)} className={`absolute w-3 h-3 bg-white border border-black rounded-full z-50 shadow-sm ${pos}`} />;
                                                })}
                                            </>
                                        )}
                                        {background.type === 'video'
                                            ? (
                                                <video
                                                    ref={background.type === 'video' ? activeVideoRef : null}
                                                    src={background.url}
                                                    key={background.url}
                                                    className="w-full h-full object-fill pointer-events-none"
                                                    autoPlay={videoPlaying}
                                                    loop
                                                    muted={videoMuted || videoVolume === 0}
                                                    playsInline
                                                    onTimeUpdate={(e) => setVideoCurrentTime(e.target.currentTime)}
                                                    onLoadedMetadata={(e) => {
                                                        setVideoDuration(e.target.duration);
                                                        if (activeVideoRef.current) activeVideoRef.current.volume = videoVolume;
                                                    }}
                                                    onPlay={() => setVideoPlaying(true)}
                                                    onPause={() => setVideoPlaying(false)}
                                                />
                                            ) : (
                                                <img
                                                    src={background.url}
                                                    key={background.url}
                                                    className="w-full h-full object-fill pointer-events-none select-none"
                                                    alt="bg"
                                                />
                                            )
                                        }
                                    </div>
                                )}
                                {layers.map((layer, idx) => {
                                    const isSelected = selectedLayerId === layer.id;
                                    const zIndex = isSelected ? 100 : (layers.length - idx) * 10;
                                    return (
                                        <div
                                            key={layer.id}
                                            onMouseDown={(e) => handleMouseDown(e, layer.id)}
                                            className="absolute cursor-move group"
                                            style={{
                                                left: `${layer.x}%`,
                                                top: `${layer.y}%`,
                                                transform: 'translate(-50%,-50%)',
                                                width: (layer.type === 'image' || layer.type === 'video') ? `${layer.style?.width || 30}%` : 'auto',
                                                zIndex,
                                            }}
                                        >
                                            {isSelected && (
                                                <>
                                                    <div className="absolute -inset-2 border-2 border-blue-500 border-dashed rounded-lg pointer-events-none z-50" />
                                                    {['nw','ne','sw','se','ml','mr','mt','mb'].map(h => {
                                                        const pos = { nw:'-top-2 -left-2 cursor-nwse-resize', ne:'-top-2 -right-2 cursor-nesw-resize', sw:'-bottom-2 -left-2 cursor-nesw-resize', se:'-bottom-2 -right-2 cursor-nwse-resize', ml:'top-1/2 -translate-y-1/2 -left-2 cursor-ew-resize', mr:'top-1/2 -translate-y-1/2 -right-2 cursor-ew-resize', mt:'left-1/2 -translate-x-1/2 -top-2 cursor-ns-resize', mb:'left-1/2 -translate-x-1/2 -bottom-2 cursor-ns-resize' }[h];
                                                        return <div key={h} onMouseDown={(e) => handleMouseDown(e, layer.id, h)} className={`absolute w-3 h-3 bg-blue-500 border border-white rounded-full z-50 shadow-sm ${pos}`} />;
                                                    })}
                                                </>
                                            )}
                                            {layer.type === 'text' ? (
                                                <p className="whitespace-pre-wrap text-center px-2 py-1 relative z-10 select-none" style={{ fontSize: `${layer.style.fontSize}cqw`, lineHeight: layer.style.lineHeight || 1.2, color: layer.style.color, fontFamily: layer.style.fontFamily === 'serif' ? 'Georgia,serif' : (layer.style.fontFamily === 'mono' ? '"Courier New",monospace' : 'system-ui,sans-serif'), fontWeight: layer.style.fontWeight || 'normal', textTransform: layer.style.textTransform || 'none', textShadow: layer.style.shadow ? `${layer.style.shadow.x||0}px ${layer.style.shadow.y||0}px ${layer.style.shadow.blur||10}px ${layer.style.shadow.color||'rgba(0,0,0,0.6)'}` : 'none' }}>
                                                    {layer.content}
                                                </p>
                                            ) : layer.type === 'video' ? (
                                                <video
                                                    ref={selectedLayerId === layer.id || background.type !== 'video' ? activeVideoRef : null}
                                                    src={layer.content}
                                                    key={layer.content}
                                                    autoPlay={videoPlaying}
                                                    loop
                                                    muted={videoMuted || videoVolume === 0}
                                                    playsInline
                                                    className="w-full h-auto relative z-10 pointer-events-none select-none transition-all"
                                                    style={{
                                                        borderRadius: `${layer.style?.borderRadius ?? 8}px`,
                                                        opacity: layer.style?.opacity ?? 1,
                                                        objectFit: videoAspectRatio === 'fill' ? 'cover' : (videoAspectRatio === 'fit' ? 'contain' : (layer.style?.objectFit || 'contain')),
                                                        boxShadow: layer.style?.shadow ? `${layer.style.shadow.x||0}px ${layer.style.shadow.y||0}px ${layer.style.shadow.blur||14}px ${layer.style.shadow.color||'rgba(0,0,0,0.6)'}` : 'none',
                                                    }}
                                                    onTimeUpdate={(e) => setVideoCurrentTime(e.target.currentTime)}
                                                    onLoadedMetadata={(e) => {
                                                        setVideoDuration(e.target.duration);
                                                        if (activeVideoRef.current) activeVideoRef.current.volume = videoVolume;
                                                    }}
                                                    onPlay={() => setVideoPlaying(true)}
                                                    onPause={() => setVideoPlaying(false)}
                                                />
                                            ) : (
                                                <img
                                                    src={layer.content}
                                                    className="w-full h-auto relative z-10 pointer-events-none select-none transition-all"
                                                    style={{
                                                        borderRadius: `${layer.style?.borderRadius ?? 8}px`,
                                                        opacity: layer.style?.opacity ?? 1,
                                                        objectFit: layer.style?.objectFit || 'contain',
                                                        boxShadow: layer.style?.shadow ? `${layer.style.shadow.x||0}px ${layer.style.shadow.y||0}px ${layer.style.shadow.blur||14}px ${layer.style.shadow.color||'rgba(0,0,0,0.6)'}` : 'none',
                                                    }}
                                                    alt="layer"
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Video Audio & Video Playback Control Bar (Reference Image Design) */}
                    {((background.url && background.type === 'video') || layers.some(l => l.type === 'video')) && (
                        <div className="w-full bg-[#161619] border-t border-white/10 px-4 py-2 flex flex-col gap-1.5 shrink-0 select-none">
                            {/* Top Row: Scrubber + Timecode */}
                            <div className="flex items-center gap-3 w-full">
                                <input
                                    type="range"
                                    min="0"
                                    max={videoDuration || 100}
                                    step="0.1"
                                    value={videoCurrentTime || 0}
                                    onChange={(e) => handleSeekVideo(parseFloat(e.target.value))}
                                    className="flex-1 h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-red-500 hover:accent-red-400 transition-all"
                                />
                                <span className="font-mono text-xs font-semibold text-red-400 shrink-0">
                                    {formatTimecode(videoCurrentTime)} / {formatTimecode(videoDuration)}
                                </span>
                            </div>

                            {/* Bottom Row: Controls */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 text-white/80">
                                    <button
                                        type="button"
                                        onClick={toggleVideoPlay}
                                        className="hover:text-white transition-colors p-1"
                                        title={videoPlaying ? "Pause" : "Play"}
                                    >
                                        {videoPlaying ? <PiPause size={16} /> : <PiPlay size={16} />}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={restartVideo}
                                        className="hover:text-white transition-colors p-1"
                                        title="Restart (Jump to Start)"
                                    >
                                        <PiSkipBack size={16} />
                                    </button>

                                    <button
                                        type="button"
                                        onClick={jumpToEndVideo}
                                        className="hover:text-white transition-colors p-1"
                                        title="Jump to End"
                                    >
                                        <PiSkipForward size={16} />
                                    </button>

                                    <button
                                        type="button"
                                        onClick={stopVideo}
                                        className="hover:text-white transition-colors p-1"
                                        title="Stop (Reset to 0)"
                                    >
                                        <PiStop size={16} />
                                    </button>

                                    <button
                                        type="button"
                                        onClick={toggleVideoMute}
                                        className="hover:text-white transition-colors p-1 ml-1"
                                        title={videoMuted || videoVolume === 0 ? "Unmute Sound" : "Mute Sound"}
                                    >
                                        {videoMuted || videoVolume === 0 ? <PiSpeakerSlash size={16} /> : <PiSpeakerHigh size={16} />}
                                    </button>

                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={videoMuted ? 0 : videoVolume}
                                        onChange={(e) => handleVolumeChange(e.target.value)}
                                        className="w-20 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white hover:accent-blue-400 transition-all"
                                        title={`Volume: ${Math.round(videoVolume * 100)}%`}
                                    />
                                </div>

                                <div className="flex items-center gap-2">
                                    <div className="relative">
                                        <select
                                            value={videoAspectRatio}
                                            onChange={(e) => setVideoAspectRatio(e.target.value)}
                                            className="bg-[#242428] hover:bg-[#2c2c32] text-white text-xs font-mono font-bold px-2.5 py-1 rounded border border-white/10 focus:outline-none focus:border-red-500 cursor-pointer appearance-none pr-6"
                                            title="Select Aspect Ratio"
                                        >
                                            <option value="16:9">16:9</option>
                                            <option value="4:3">4:3</option>
                                            <option value="21:9">21:9</option>
                                            <option value="fit">Fit</option>
                                            <option value="fill">Fill</option>
                                        </select>
                                        <PiCaretDownBold size={10} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-white/50" />
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setBackground(prev => ({ ...prev, width: 100, height: 100, x: 50, y: 50 }))}
                                        className="text-white/80 hover:text-white p-1 rounded hover:bg-white/5 transition-colors"
                                        title="Fit to Screen"
                                    >
                                        <PiCornersOut size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="h-14 border-t border-white/5 flex items-center justify-between px-6 bg-[#1a1a1a]">
                        <div className="flex items-center gap-3">
                            {activeTab === 'presentation' && selectedPresentation ? (
                                <>
                                    <button onClick={() => setSelectedPresentation(null)} className="text-white/50 hover:text-white text-xs flex items-center gap-1.5 transition-colors">
                                        <PiX size={14} /> Close Deck
                                    </button>
                                    <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5 border border-white/10 pl-2">
                                        <span className="text-xs text-purple-300 font-bold pr-2 truncate max-w-[160px]">
                                            {selectedPresentation.name}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={handlePrevSlide}
                                            disabled={activeSlideIndex === 0}
                                            className="p-1 rounded text-white/60 hover:text-white disabled:opacity-20 transition-all"
                                            title="Previous Slide"
                                        >
                                            <PiArrowLeft size={13} />
                                        </button>
                                        <span className="text-xs font-mono font-bold text-white/70 px-1">
                                            {activeSlideIndex + 1} / {selectedPresentation.slides?.length || 0}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={handleNextSlide}
                                            disabled={activeSlideIndex >= (selectedPresentation.slides?.length || 0) - 1}
                                            className="p-1 rounded text-white/60 hover:text-white disabled:opacity-20 transition-all"
                                            title="Next Slide"
                                        >
                                            <PiArrowRight size={13} />
                                        </button>
                                    </div>
                                </>
                            ) : previewScene ? (
                                <>
                                    <button onClick={() => setPreviewScene(null)} className="text-white/50 hover:text-white text-xs flex items-center gap-1.5 transition-colors">
                                        <PiX size={14} /> Clear Preview
                                    </button>
                                    <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5 border border-white/10 pl-2">
                                        <span className="text-xs text-orange-300 font-bold pr-2 truncate max-w-[160px]">
                                            {previewScene.scene.name}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const prevSeqIdx = Math.max(0, (previewScene.sequenceIndex || 0) - 1);
                                                const item = previewSequence[prevSeqIdx];
                                                setPreviewScene(prev => ({ ...prev, sequenceIndex: prevSeqIdx, pageIndex: item ? item.pageIndex : 0 }));
                                            }}
                                            disabled={(previewScene.sequenceIndex || 0) === 0}
                                            className="p-1 rounded text-white/60 hover:text-white disabled:opacity-20 transition-all"
                                            title="Previous Part"
                                        >
                                            <PiArrowLeft size={13} />
                                        </button>
                                        <span className="text-xs font-mono font-bold text-white/70 px-1">
                                            {previewItem.label} ({(previewScene.sequenceIndex || 0) + 1}/{previewSequence.length})
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const nextSeqIdx = Math.min(previewSequence.length - 1, (previewScene.sequenceIndex || 0) + 1);
                                                const item = previewSequence[nextSeqIdx];
                                                setPreviewScene(prev => ({ ...prev, sequenceIndex: nextSeqIdx, pageIndex: item ? item.pageIndex : 0 }));
                                            }}
                                            disabled={(previewScene.sequenceIndex || 0) >= previewSequence.length - 1}
                                            className="p-1 rounded text-white/60 hover:text-white disabled:opacity-20 transition-all"
                                            title="Next Part"
                                        >
                                            <PiArrowRight size={13} />
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <button onClick={clearBg} className="text-red-400/80 hover:text-red-400 text-xs flex items-center gap-2 transition-colors"><PiTrash /> Clear Slide</button>
                                    <span className="text-xs text-white/30 border-l border-white/10 pl-4">{layers.length} Layers Active</span>
                                </>
                            )}
                        </div>
                        <button
                            onClick={() => {
                                if (activeTab === 'presentation' && selectedPresentation) {
                                    if (isPresentingSlide && activeDeckId === selectedPresentation.id) {
                                        handleStopSlidePresentation();
                                    } else {
                                        handlePresentSlide(selectedPresentation, activeSlideIndex);
                                    }
                                } else {
                                    handlePresent();
                                }
                            }}
                            className={`${
                                activeTab === 'presentation' && selectedPresentation
                                    ? (isPresentingSlide && activeDeckId === selectedPresentation.id
                                        ? 'bg-red hover:bg-red/90'
                                        : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500')
                                    : previewScene
                                    ? 'bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-400 hover:to-purple-500'
                                    : 'bg-red hover:bg-red/90'
                            } text-white px-8 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg active:scale-95`}
                        >
                            <PiBroadcast size={16} />
                            {activeTab === 'presentation' && selectedPresentation
                                ? (isPresentingSlide && activeDeckId === selectedPresentation.id ? 'Stop Slides' : 'Present Slide Now')
                                : previewScene
                                ? (previewScene.scene.sceneType === 'song' ? 'Present Song Now' : 'Present Scene Now')
                                : 'Present Now'}
                        </button>
                    </div>
                </div>

                {/* RIGHT: 4 TABS (MEDIA, TEXT, SCENE, SLIDES) + LAYERS SECTION BELOW */}
                <div className="flex-1 bg-[#141414] m-2 ml-0 rounded-2xl border border-white/5 flex flex-col overflow-hidden w-full max-w-sm relative">
                    
                    {/* Top 4 Tabs Bar */}
                    <div className="flex border-b border-white/5 bg-[#1a1a1a] shrink-0">
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => {
                                    setActiveTab(tab.id);
                                    if (tab.id !== 'presentation') setSelectedPresentation(null);
                                    if (tab.id !== 'scene') setPreviewScene(null);
                                }}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                                    activeTab === tab.id
                                        ? (tab.id === 'scene'
                                            ? 'bg-white/5 text-orange-400 border-b-2 border-orange-500'
                                            : tab.id === 'presentation'
                                            ? 'bg-white/5 text-purple-400 border-b-2 border-purple-500'
                                            : 'bg-white/5 text-blue-400 border-b-2 border-blue-500')
                                        : 'text-white/40 hover:bg-white/5 hover:text-white/70'
                                }`}
                            >
                                <tab.icon size={14} /> {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Active Tab Content Area */}
                    <div className={`flex-1 overflow-y-auto content-start ${activeTab !== 'scene' && activeTab !== 'presentation' ? 'p-3' : ''}`}>

                        {activeTab === 'media' && (
                            <div className="flex flex-col gap-3">
                                {/* TOP OF INTERFACE: Background Asset Setting Card */}
                                <div className={`p-3 rounded-xl border transition-all ${background.url ? 'bg-white/5 border-white/20 shadow-md' : 'bg-white/[0.02] border-white/10'}`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] uppercase font-bold tracking-widest text-white flex items-center gap-1.5">
                                                <PiSlidersHorizontal size={13} className="text-white" /> Background Asset Setting
                                            </span>
                                            {background.url && (
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/20 text-white uppercase tracking-wider">
                                                    {background.type === 'video' ? 'Video' : 'Image'}
                                                </span>
                                            )}
                                        </div>
                                        {background.url && (
                                            <button
                                                type="button"
                                                onClick={clearBg}
                                                className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1 font-bold px-2 py-0.5 rounded hover:bg-red-500/10 transition-colors"
                                                title="Remove background"
                                            >
                                                <PiTrash size={12} /> Clear
                                            </button>
                                        )}
                                    </div>

                                    {background.url ? (
                                        <div className="flex flex-col gap-2.5">
                                            {/* Preview & Actions */}
                                            <div className="flex items-center gap-3 bg-black/40 p-2 rounded-lg border border-white/10">
                                                <div className="w-16 h-10 rounded overflow-hidden bg-black shrink-0 border border-white/20">
                                                    {background.type === 'video' ? (
                                                        <video src={background.url} className="w-full h-full object-cover" muted />
                                                    ) : (
                                                        <img src={background.url} className="w-full h-full object-cover" alt="bg-thumb" />
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1.5 flex-1 justify-end">
                                                    <button
                                                        type="button"
                                                        onClick={() => setBackground(prev => ({ ...prev, width: 100, height: 100, x: 50, y: 50 }))}
                                                        className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-[10px] font-bold transition-all border border-white/10"
                                                    >
                                                        Fit (100%)
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setBackground(prev => ({ ...prev, x: 50, y: 50 }))}
                                                        className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-[10px] font-bold transition-all border border-white/10"
                                                    >
                                                        Center
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Width Scale */}
                                            <div className="flex flex-col gap-1">
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="text-white/60">Width Scale</span>
                                                    <span className="font-mono text-white font-bold">{Math.round(background.width || 100)}%</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="20"
                                                    max="200"
                                                    step="2"
                                                    value={background.width || 100}
                                                    onChange={(e) => setBackground(prev => ({ ...prev, width: parseInt(e.target.value, 10) }))}
                                                    className="w-full accent-white cursor-pointer"
                                                />
                                            </div>

                                            {/* Height Scale */}
                                            <div className="flex flex-col gap-1">
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="text-white/60">Height Scale</span>
                                                    <span className="font-mono text-white font-bold">{Math.round(background.height || 100)}%</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="20"
                                                    max="200"
                                                    step="2"
                                                    value={background.height || 100}
                                                    onChange={(e) => setBackground(prev => ({ ...prev, height: parseInt(e.target.value, 10) }))}
                                                    className="w-full accent-white cursor-pointer"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-[11px] text-white/40 leading-tight">
                                            No background set. Select any asset below and click <span className="text-white font-semibold">"Set Background"</span> or drag onto canvas.
                                        </p>
                                    )}
                                </div>

                                <div className="flex justify-between items-center mb-0.5">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] uppercase text-white/40 font-bold tracking-widest">
                                            Imported Assets ({mediaFiles.length})
                                        </span>
                                        {mediaFiles.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={handleSelectAllAssets}
                                                className="text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors"
                                            >
                                                {selectedAssetUrls.length === mediaFiles.length ? 'Deselect All' : 'Select All'}
                                            </button>
                                        )}
                                    </div>
                                    <button
                                        onClick={handleImport}
                                        className="text-blue-400 hover:text-blue-300 bg-blue-400/10 hover:bg-blue-400/20 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 transition-all"
                                        title="Import Images or Videos"
                                    >
                                        <PiPlus size={13} /> Import
                                    </button>
                                </div>

                                {/* Selected Assets Action Bar (Single or Multi-Select Menu) */}
                                {selectedAssetUrls.length > 0 && (
                                    <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/30 rounded-xl px-2.5 py-1.5 transition-all">
                                        <span className="text-[10px] font-bold text-blue-300">
                                            {selectedAssetUrls.length} Selected
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                type="button"
                                                onClick={handleSetFirstSelectedAsBg}
                                                className="px-2 py-0.5 bg-white/15 hover:bg-white/25 text-white rounded text-[10px] font-bold transition-all border border-white/20"
                                                title="Set as Background"
                                            >
                                                Set Background
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleAddSelectedAsLayers}
                                                className="px-2 py-0.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded text-[10px] font-bold transition-all"
                                                title="Add as Layer"
                                            >
                                                Add Layer
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleDeleteSelectedAssets}
                                                className="px-1.5 py-0.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-[10px] font-bold transition-all"
                                                title="Delete Selected"
                                            >
                                                <PiTrash size={12} />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Media Assets Grid */}
                                <div className="grid grid-cols-3 gap-2">
                                    {mediaFiles.map((fileUrl, index) => {
                                        const isVideo = isVideoFile(fileUrl);
                                        const isSelected = selectedAssetUrls.includes(fileUrl);
                                        return (
                                            <div
                                                key={`${fileUrl}-${index}`}
                                                draggable
                                                onDragStart={(e) => {
                                                    e.dataTransfer.setData('application/ocs-media', fileUrl);
                                                    e.dataTransfer.setData('text/plain', fileUrl);
                                                    e.dataTransfer.effectAllowed = 'copy';
                                                }}
                                                onClick={(e) => handleToggleSelectAsset(fileUrl, e)}
                                                onDoubleClick={() => addLayer(isVideo ? 'video' : 'image', fileUrl)}
                                                onContextMenu={(e) => handleAssetContextMenu(e, fileUrl)}
                                                className={`aspect-square w-full h-[90px] bg-[#1a1a1e] rounded-xl relative overflow-hidden border transition-all cursor-pointer group ${
                                                    isSelected
                                                        ? 'border-blue-500 ring-2 ring-blue-500/40 shadow-lg'
                                                        : 'border-white/10 hover:border-white/30 hover:scale-[1.02]'
                                                }`}
                                                title="Click to select, Double-click to add layer, Drag onto canvas, Right-click for menu"
                                            >
                                                {/* Checkbox Selector */}
                                                <div
                                                    onClick={(e) => handleToggleSelectAsset(fileUrl, e)}
                                                    className={`absolute top-1.5 left-1.5 z-20 rounded p-0.5 transition-all ${
                                                        isSelected
                                                            ? 'text-blue-400 bg-black/70'
                                                            : 'text-white/40 opacity-0 group-hover:opacity-100 bg-black/50 hover:text-white'
                                                    }`}
                                                >
                                                    {isSelected ? <PiCheckSquare size={14} /> : <PiSquare size={14} />}
                                                </div>

                                                {/* Media Type Badge */}
                                                {isVideo && (
                                                    <div className="absolute top-1.5 right-1.5 z-20 bg-black/70 backdrop-blur-xs text-cyan-300 px-1 py-0.5 rounded text-[9px] font-bold uppercase flex items-center gap-0.5">
                                                        <PiVideo size={10} /> Video
                                                    </div>
                                                )}

                                                {/* Media Content */}
                                                {isVideo ? (
                                                    <video
                                                        src={fileUrl}
                                                        className="absolute inset-0 w-full h-full object-cover opacity-75 group-hover:opacity-100 transition-opacity pointer-events-none"
                                                        muted
                                                        playsInline
                                                        preload="metadata"
                                                    />
                                                ) : (
                                                    <img
                                                        src={fileUrl}
                                                        className="absolute inset-0 w-full h-full object-cover opacity-75 group-hover:opacity-100 transition-opacity pointer-events-none"
                                                        alt="asset"
                                                        onError={(e) => {
                                                            e.currentTarget.style.display = 'none';
                                                        }}
                                                    />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {mediaFiles.length === 0 && (
                                    <div className="text-center py-6 text-white/30 text-xs flex flex-col items-center gap-1.5 border border-dashed border-white/10 rounded-xl p-4">
                                        <PiImage size={24} />
                                        <span>No imported assets yet</span>
                                        <button onClick={handleImport} className="text-blue-400 hover:underline text-[11px] font-bold">Import Media</button>
                                    </div>
                                )}

                                {/* Image Layer Adjustments */}
                                {selectedLayer && selectedLayer.type === 'image' && (
                                    <div className="flex flex-col gap-3.5 border-t border-white/10 pt-3 mt-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] uppercase text-purple-400 font-bold tracking-widest flex items-center gap-1.5">
                                                <PiSlidersHorizontal size={13} /> Adjust Selected Image Layer
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => removeLayer(selectedLayer.id)}
                                                className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1 font-bold"
                                            >
                                                <PiTrash size={12} /> Remove
                                            </button>
                                        </div>

                                        {/* Width / Scale Slider */}
                                        <div className="flex flex-col gap-1">
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-white/60">Width / Scale</span>
                                                <span className="font-mono text-purple-300 font-bold">{selectedLayer.style?.width || 30}%</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="5"
                                                max="100"
                                                step="1"
                                                value={selectedLayer.style?.width || 30}
                                                onChange={(e) => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, width: parseInt(e.target.value, 10) } })}
                                                className="w-full accent-purple-500"
                                            />
                                        </div>

                                        {/* Opacity Slider */}
                                        <div className="flex flex-col gap-1">
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-white/60">Opacity</span>
                                                <span className="font-mono text-purple-300 font-bold">{Math.round((selectedLayer.style?.opacity ?? 1) * 100)}%</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0.05"
                                                max="1"
                                                step="0.05"
                                                value={selectedLayer.style?.opacity ?? 1}
                                                onChange={(e) => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, opacity: parseFloat(e.target.value) } })}
                                                className="w-full accent-purple-500"
                                            />
                                        </div>

                                        {/* Rounded Corners */}
                                        <div className="flex flex-col gap-1">
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-white/60">Corner Radius</span>
                                                <span className="font-mono text-purple-300 font-bold">{selectedLayer.style?.borderRadius ?? 8}px</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0"
                                                max="48"
                                                step="2"
                                                value={selectedLayer.style?.borderRadius ?? 8}
                                                onChange={(e) => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, borderRadius: parseInt(e.target.value, 10) } })}
                                                className="w-full accent-purple-500"
                                            />
                                        </div>

                                        {/* Drop Shadow & Quick Alignment */}
                                        <div className="flex items-center justify-between pt-1">
                                            <button
                                                type="button"
                                                onClick={() => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, width: 100 }, x: 50, y: 50 })}
                                                className="px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded text-[10px] font-bold text-white/70 hover:text-white transition-colors"
                                            >
                                                Fit (100%)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => updateLayer(selectedLayer.id, { x: 50, y: 50 })}
                                                className="px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded text-[10px] font-bold text-white/70 hover:text-white transition-colors"
                                            >
                                                Center on Canvas
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'text' && (
                            <div className="flex flex-col gap-4">
                                <button onClick={() => addLayer('text', 'New Text Element')} className="w-full flex items-center justify-center gap-2 text-xs font-bold uppercase bg-blue-500 hover:bg-blue-600 text-white p-3 rounded-xl transition-all shadow-lg active:scale-95">
                                    <PiTextT size={16} /> Add New Text
                                </button>
                                {selectedLayer && selectedLayer.type === 'text' ? (
                                    <div className="flex flex-col gap-4 border-t border-white/10 pt-4">
                                        <span className="text-[10px] uppercase text-white/40 font-bold tracking-widest">Edit Selected Text</span>
                                        <textarea value={selectedLayer.content} onChange={(e) => updateLayer(selectedLayer.id, { content: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors h-24 resize-none" placeholder="Enter text..." />
                                        <div className="flex flex-col gap-3">
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs text-white/60">Font Size</span>
                                                <span className="text-xs text-white/40">{selectedLayer.style.fontSize}cqw</span>
                                            </div>
                                            <input type="range" min="1" max="20" step="0.5" value={selectedLayer.style.fontSize || 5} onChange={(e) => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, fontSize: parseFloat(e.target.value) } })} className="w-full accent-blue-500" />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center py-6 text-white/20 text-xs flex flex-col items-center gap-2">
                                        <PiTextAa size={24} /> Select a text layer below to edit
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'scene' && (
                            <SceneTab
                                onOpenModal={handleOpenEditScene}
                                scenes={scenes}
                                setScenes={setScenes}
                                activeSceneId={activeSceneId}
                                activePageIndex={activePageIndex}
                                activeSequenceIndex={activeSequenceIndex}
                                isPresenting={isPresentingScene}
                                suggestPrompt={suggestPrompt}
                                alignProgress={alignProgress}
                                activateScene={activateScene}
                                handleNextPage={handleNextScenePage}
                                handlePrevPage={handlePrevScenePage}
                                handleStopScene={handleStopScene}
                                onToggleLiveNavMode={handleToggleLiveNavMode}
                                previewScene={previewScene}
                                onLoadToPreview={handleLoadSceneToPreview}
                            />
                        )}

                        {activeTab === 'presentation' && (
                            <div className="flex flex-col gap-3 p-3 h-full overflow-y-auto">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-[10px] uppercase text-white/40 font-bold tracking-widest">
                                        PowerPoint ({presentations.length})
                                    </span>
                                    <button
                                        onClick={handleImportPresentation}
                                        className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded-lg text-xs font-bold uppercase tracking-wider border border-purple-500/30 transition-all shadow-sm active:scale-95"
                                    >
                                        <PiPlus size={13} /> Import PPTX
                                    </button>
                                </div>

                                {presentations.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-white/30 text-center gap-2 border border-dashed border-white/10 rounded-2xl p-4">
                                        <PiPresentation size={36} className="text-purple-400/50 mb-1" />
                                        <p className="text-xs font-bold text-white/60">No PowerPoint Decks Yet</p>
                                        <p className="text-[11px] text-white/40 max-w-[200px]">
                                            Click "Import PPTX" to convert your slides to high-res presentation graphics.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        {presentations.map((deck) => {
                                            const isSelected = selectedPresentation?.id === deck.id;
                                            const isLive = isPresentingSlide && activeDeckId === deck.id;
                                            const firstSlideUrl = deck.slides?.[0]?.url;

                                            return (
                                                <div
                                                    key={deck.id}
                                                    onClick={() => {
                                                        setSelectedPresentation(deck);
                                                        setActiveSlideIndex(0);
                                                        setPreviewScene(null);
                                                    }}
                                                    className={`p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 ${
                                                        isSelected
                                                            ? 'bg-purple-500/15 border-purple-500/50 shadow-md shadow-purple-500/10'
                                                            : 'bg-white/5 border-white/5 hover:border-white/20 hover:bg-white/[0.07]'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-14 h-10 bg-black rounded-lg overflow-hidden shrink-0 border border-white/10 relative">
                                                            {firstSlideUrl ? (
                                                                <img src={firstSlideUrl} className="w-full h-full object-cover" alt="slide 1" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-white/30 text-[10px]">PPTX</div>
                                                            )}
                                                            {isLive && (
                                                                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                                            )}
                                                        </div>

                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-1.5">
                                                                <h4 className="text-xs font-bold text-white truncate">{deck.name}</h4>
                                                                {isLive && (
                                                                    <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 text-[9px] font-bold rounded uppercase">
                                                                        Live
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-[10px] text-white/40">
                                                                {deck.slideCount || deck.slides?.length || 0} Slides
                                                            </p>
                                                        </div>

                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setShowFontAdvisoryModal(deck);
                                                                }}
                                                                className="p-1.5 text-white/40 hover:text-purple-400 hover:bg-purple-500/10 rounded-lg transition-colors"
                                                                title="Font Info & Advisory"
                                                            >
                                                                <PiTextT size={14} />
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDeletePresentation(deck.id);
                                                                }}
                                                                className="p-1.5 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                                title="Delete Deck"
                                                            >
                                                                <PiTrash size={14} />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* If per-slide errors exist (FR-4.2 / NFR-13), display error badge */}
                                                    {deck.errors && deck.errors.length > 0 && (
                                                        <div className="text-[10px] text-amber-400 bg-amber-400/10 px-2 py-1 rounded border border-amber-400/20">
                                                            ⚠️ Warning: {deck.errors.length} slide(s) could not convert.
                                                        </div>
                                                    )}

                                                    {/* If deck is selected, show slide thumbnail strip */}
                                                    {isSelected && deck.slides && deck.slides.length > 0 && (
                                                        <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-white/10">
                                                            {deck.slides.map((s, idx) => (
                                                                <div
                                                                    key={idx}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setActiveSlideIndex(idx);
                                                                        if (isPresentingSlide && activeDeckId === deck.id) {
                                                                            handlePresentSlide(deck, idx);
                                                                        }
                                                                    }}
                                                                    className={`aspect-video rounded overflow-hidden relative border cursor-pointer ${
                                                                        activeSlideIndex === idx
                                                                            ? 'border-purple-400 ring-2 ring-purple-500/40'
                                                                            : 'border-white/10 hover:border-white/30'
                                                                    }`}
                                                                >
                                                                    <img src={s.url} className="w-full h-full object-cover" alt={`Slide ${idx + 1}`} />
                                                                    <span className="absolute bottom-0 right-0 bg-black/80 text-[8px] font-mono px-1 text-white/70">
                                                                        {idx + 1}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                    </div>

                    {/* LAYERS SECTION (Resizable Panel at Bottom of Sidebar) */}
                    {renderLayersSection()}

                </div>

            </div>

            {/* Scene Editor Modal */}
            <SceneModal
                isOpen={sceneModalOpen}
                scene={modalScene}
                onClose={() => setSceneModalOpen(false)}
                onSave={handleSaveSceneFromModal}
            />

            {/* Presentation Import Progress Modal (FR-4.2, FR-4.34) */}
            <PresentationImportProgressModal
                progress={importProgress}
                onDismiss={() => setImportProgress(null)}
            />

            {/* Presentation Font Advisory & Inspection Modal (FR-4.37) */}
            <PresentationFontAdvisoryModal
                deck={showFontAdvisoryModal}
                onClose={() => setShowFontAdvisoryModal(null)}
            />

            {/* Media Asset Context Menu (Right Click & Actions) */}
            {contextMenu && (
                <div
                    className="fixed z-50 bg-[#1e1e24] border border-white/15 rounded-xl shadow-2xl p-1.5 flex flex-col gap-1 min-w-[170px] backdrop-blur-lg select-none"
                    style={{ left: Math.min(window.innerWidth - 180, contextMenu.x), top: Math.min(window.innerHeight - 150, contextMenu.y) }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        type="button"
                        onClick={() => {
                            setMediaAsBackground(contextMenu.url, contextMenu.isVideo);
                            setContextMenu(null);
                        }}
                        className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-yellow-300 hover:bg-yellow-500/20 rounded-lg text-left font-semibold transition-colors"
                    >
                        <PiImage size={14} /> Set as Background
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            addLayer(contextMenu.isVideo ? 'video' : 'image', contextMenu.url);
                            setContextMenu(null);
                        }}
                        className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-blue-300 hover:bg-blue-500/20 rounded-lg text-left font-semibold transition-colors"
                    >
                        <PiStack size={14} /> Add as Layer
                    </button>
                    <div className="h-px bg-white/10 my-0.5" />
                    <button
                        type="button"
                        onClick={() => {
                            handleDeleteSelectedAssets();
                        }}
                        className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/20 rounded-lg text-left font-semibold transition-colors"
                    >
                        <PiTrash size={14} /> Delete Asset{selectedAssetUrls.length > 1 ? ` (${selectedAssetUrls.length})` : ''}
                    </button>
                </div>
            )}
        </div>
    );
}
