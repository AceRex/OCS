import React, { useState, useEffect, useRef, useCallback } from "react";
import {
    PiFolder, PiImage, PiShapes, PiTextT,
    PiTrash, PiSliders, PiTextAa, PiBroadcast,
    PiCheckSquare, PiSquare, PiPlus, PiMonitorPlay, PiFilmSlate,
    PiArrowLeft, PiArrowRight, PiPencil, PiFloppyDisk, PiX,
    PiArrowUp, PiArrowDown, PiWifiHigh, PiHandPointing, PiMicrophone,
    PiCaretDownBold, PiTextAlignLeft, PiTextAlignCenter, PiTextAlignRight,
} from "react-icons/pi";
import SceneModal from "./SceneModal";

// ─── Scene Helpers ──────────────────────────────────────────────────────────

function newScene(name = "Untitled Scene") {
    return {
        id: `scene-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        navMode: "manual",
        targetMode: "both",
        targets: { general: true, speaker: true },
        pages: [{ id: `pg-${Date.now()}`, content: "" }],
        style: {
            fontFamily: "Inter Tight",
            fontWeight: "600",
            fontSize: "auto",
            color: "#FFFFFF",
            backgroundColor: "#000000",
            textAlign: "center",
            isItalic: false,
            isUnderline: false,
        },
        createdAt: Date.now(),
    };
}

function newPage() {
    return { id: `pg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, content: "" };
}

// ─── Scene Tab ─────────────────────────────────────────────────────────────

function SceneTab({ targets, onOpenModal, scenes, setScenes, activeSceneId, setActiveSceneId, activePageIndex, setActivePageIndex, isPresenting, setIsPresenting, suggestPrompt, setSuggestPrompt, pushPageContent, activateScene, handleNextPage, handlePrevPage, handleStopScene }) {
    const handleDeleteScene = async (sceneId) => {
        await window.electron?.Scene?.delete(sceneId).catch(() => {});
        setScenes(prev => prev.filter(s => s.id !== sceneId));
        if (activeSceneId === sceneId) {
            handleStopScene();
        }
    };

    const activeScene = scenes.find(s => s.id === activeSceneId);

    return (
        <div className="flex flex-col h-full gap-0">
            <div className="flex flex-col gap-3 flex-1 overflow-y-auto p-3">
                <div className="flex justify-between items-center">
                    <span className="text-[10px] uppercase text-white/40 font-bold tracking-widest">Scenes</span>
                    <button
                        onClick={() => onOpenModal(newScene(`Scene ${scenes.length + 1}`))}
                        className="text-orange-400 hover:text-orange-300 bg-orange-400/10 p-1.5 rounded transition-colors flex items-center gap-1 text-xs font-bold"
                        title="Add Scene"
                    >
                        <PiPlus size={14} /> Add
                    </button>
                </div>

                {isPresenting && activeScene && (
                    <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3 flex flex-col gap-2 shadow-inner">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400">
                                    ● Live: {activeScene.name}
                                </span>
                                {activeScene.navMode === 'read_along' && (
                                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                        Read-Along
                                    </span>
                                )}
                            </div>
                            <button onClick={handleStopScene} className="text-[10px] text-red-400 hover:text-red-300 bg-red-500/10 px-2 py-0.5 rounded transition-colors font-bold">
                                Stop
                            </button>
                        </div>

                        {/* FR-5.38: Suggestion fallback prompt when stalled */}
                        {suggestPrompt && (
                            <div className="bg-yellow-500/15 border border-yellow-500/40 rounded-lg p-2 flex items-center justify-between animate-in fade-in duration-200">
                                <span className="text-[11px] font-bold text-yellow-300">
                                    {suggestPrompt.label || "Advance to Next Page?"}
                                </span>
                                <button
                                    onClick={handleNextPage}
                                    className="text-[10px] font-bold uppercase px-2 py-1 rounded bg-yellow-500/30 hover:bg-yellow-500/50 text-yellow-200 border border-yellow-500/40 transition-colors"
                                >
                                    Advance Now →
                                </button>
                            </div>
                        )}

                        <div className="flex items-center gap-2">
                            <button
                                onClick={handlePrevPage}
                                disabled={activePageIndex === 0}
                                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white disabled:opacity-30 transition-all text-xs font-bold"
                            >
                                <PiArrowLeft size={14} /> Prev
                            </button>
                            <span className="text-[10px] text-white/40 tabular-nums font-mono">
                                {activePageIndex + 1} / {activeScene.pages.length}
                            </span>
                            <button
                                onClick={handleNextPage}
                                disabled={activePageIndex >= activeScene.pages.length - 1}
                                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white disabled:opacity-30 transition-all text-xs font-bold"
                            >
                                Next <PiArrowRight size={14} />
                            </button>
                        </div>
                    </div>
                )}

                {scenes.length === 0 && (
                    <div className="text-white/20 text-xs text-center mt-6 flex flex-col items-center gap-2">
                        <PiFilmSlate size={28} className="opacity-30" />
                        <span>No scenes yet. Click + to create one.</span>
                    </div>
                )}

                {scenes.map(scene => {
                    const isActive = scene.id === activeSceneId && isPresenting;
                    return (
                        <div
                            key={scene.id}
                            className={`p-3 rounded-xl border transition-all flex flex-col gap-1.5 ${isActive ? 'bg-orange-500/10 border-orange-500/40' : 'bg-white/5 border-white/5 hover:border-white/15'}`}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <PiFilmSlate size={15} className={isActive ? 'text-orange-400' : 'text-purple-400/80'} />
                                    <span className={`text-sm font-bold truncate ${isActive ? 'text-orange-300' : 'text-white/80'}`}>
                                        {scene.name}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={() => onOpenModal(scene)} className="p-1.5 text-white/30 hover:text-blue-400 rounded transition-colors" title="Edit in Modal">
                                        <PiPencil size={13} />
                                    </button>
                                    <button onClick={() => handleDeleteScene(scene.id)} className="p-1.5 text-white/30 hover:text-red-400 rounded transition-colors" title="Delete">
                                        <PiTrash size={13} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] text-white/30">
                                    {scene.pages.length} page{scene.pages.length !== 1 ? 's' : ''} · {
                                        scene.navMode === 'read_along' ? <span className="text-emerald-400/80">Read-Along</span> :
                                        scene.navMode === 'mobile' ? <span className="text-blue-400/70">Mobile</span> :
                                        <span className="text-white/40">Manual</span>
                                    }
                                    {scene.targetMode === 'speaker_only' && (
                                        <span className="text-yellow-400/80 ml-1 font-semibold">· Speaker Only</span>
                                    )}
                                </span>
                                <button
                                    onClick={() => activateScene(scene, 0)}
                                    className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all ${isActive ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30' : 'bg-purple-500/15 text-purple-300 hover:bg-purple-500/25 border border-purple-500/20'}`}
                                >
                                    <PiBroadcast size={11} />
                                    {isActive ? 'Showing' : 'Present'}
                                </button>
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
    const [presContextMenu, setPresContextMenu] = useState({ visible: false, x: 0, y: 0, presentation: null });
    const [pageContextMenu, setPageContextMenu] = useState({ visible: false, x: 0, y: 0, pageIndex: null });

    // Scene State (Phase 2.6 / 4.4.5)
    const [scenes, setScenes] = useState([]);
    const [activeSceneId, setActiveSceneId] = useState(null);
    const [activePageIndex, setActivePageIndex] = useState(0);
    const [isPresentingScene, setIsPresentingScene] = useState(false);
    const [suggestPrompt, setSuggestPrompt] = useState(null);
    const [sceneModalOpen, setSceneModalOpen] = useState(false);
    const [modalScene, setModalScene] = useState(null);

    const [background, setBackground] = useState({ url: null, type: 'image', x: 50, y: 50, width: 100, height: 100 });
    const [layers, setLayers] = useState([
        { id: 'text-1', type: 'text', content: "Welcome", x: 50, y: 50, style: { fontSize: 5, color: '#ffffff', fontFamily: 'sans', width: 0 } }
    ]);
    const [selectedLayerId, setSelectedLayerId] = useState('text-1');

    // Task 1: these feed into `target` sent to main.js via activate_set_content
    const [targets, setTargets] = useState({ general: true, speaker: true });

    const [isDragging, setIsDragging] = useState(false);
    const [resizeHandle, setResizeHandle] = useState(null);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0, initialVal: 0 });
    const [draggingId, setDraggingId] = useState(null);
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, fileUrl: null, isVideo: false });

    const canvasRef = useRef(null);

    // Initial Scene & Media Fetch
    useEffect(() => {
        refreshMedia();
        if (window.electron?.Scene?.list) {
            window.electron.Scene.list().then(list => {
                setScenes(Array.isArray(list) ? list : []);
            }).catch(() => {});
        }
    }, []);

    // FR-5.37 Auto-advance & FR-5.38 Suggestion prompt listeners
    useEffect(() => {
        const unsubAdvance = window.electron?.Aligner?.onAutoAdvance?.((data) => {
            const { pageIndex } = data || {};
            const current = scenes.find(s => s.id === activeSceneId);
            if (current && typeof pageIndex === 'number') {
                setActivePageIndex(pageIndex);
                pushPageContent(current, pageIndex);
            }
        });

        const unsubSuggest = window.electron?.Aligner?.onPromptSuggest?.((prompt) => {
            setSuggestPrompt(prompt);
        });

        const unsubClear = window.electron?.Aligner?.onPromptClear?.(() => {
            setSuggestPrompt(null);
        });

        return () => {
            unsubAdvance?.();
            unsubSuggest?.();
            unsubClear?.();
        };
    }, [scenes, activeSceneId, targets]);

    // FR-4.31: Voice commands from BroadcastEngine via CustomEvent
    useEffect(() => {
        const handleVoiceCommand = (e) => {
            const { command, sceneName } = e.detail || {};
            if (command === "start_scene" && sceneName) {
                const match = scenes.find(s =>
                    s.name.toLowerCase().includes(sceneName.toLowerCase())
                );
                if (match) activateScene(match, 0);
            }
            if (command === "next_page") handleNextScenePage();
            if (command === "prev_page") handlePrevScenePage();
        };
        window.addEventListener("ocs-scene-command", handleVoiceCommand);
        return () => window.removeEventListener("ocs-scene-command", handleVoiceCommand);
    }, [scenes, activeSceneId, activePageIndex]);

    // Space / Arrow keyboard nav when presenting (FR-5.39 Manual Override)
    useEffect(() => {
        const handleKey = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (!isPresentingScene) return;
            if (e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); handleNextScenePage(); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); handlePrevScenePage(); }
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [isPresentingScene, activeSceneId, activePageIndex, scenes]);

    const pushPageContent = (scene, pageIdx) => {
        if (!scene || !scene.pages[pageIdx]) return;
        const page = scene.pages[pageIdx];

        // Check if scene is configured for Speaker Only or Both Screens
        const isSpeakerOnly = scene.targetMode === 'speaker_only' || (scene.targets && !scene.targets.general && scene.targets.speaker);
        
        const payload = {
            type: 'scene',
            data: {
                sceneId: scene.id,
                sceneName: scene.name,
                pageIndex: pageIdx,
                pageCount: scene.pages.length,
                content: page.content,
                style: scene.style || page.style || {},
            },
        };

        if (isSpeakerOnly) {
            payload.target = ['speaker', 'controller'];
        }

        window.electron?.Presentation?.setContent(payload);
    };

    const activateScene = (scene, pageIdx = 0) => {
        setActiveSceneId(scene.id);
        setActivePageIndex(pageIdx);
        setIsPresentingScene(true);
        setSuggestPrompt(null);
        pushPageContent(scene, pageIdx);

        if (scene.navMode === 'read_along') {
            window.electron?.Aligner?.startScene(scene, pageIdx);
        } else {
            window.electron?.Aligner?.stop();
        }

        // Activate microphone when user starts/presents a scene
        window.dispatchEvent(new CustomEvent('ocs-mic-activate', { detail: { sceneId: scene.id, navMode: scene.navMode } }));
    };

    const handleNextScenePage = useCallback(() => {
        const scene = scenes.find(s => s.id === activeSceneId);
        if (!scene) return;
        const next = Math.min(activePageIndex + 1, scene.pages.length - 1);
        setActivePageIndex(next);
        setSuggestPrompt(null);
        pushPageContent(scene, next);
        if (scene.navMode === 'read_along') {
            window.electron?.Aligner?.setPage(next);
        }
    }, [scenes, activeSceneId, activePageIndex, targets]);

    const handlePrevScenePage = useCallback(() => {
        const scene = scenes.find(s => s.id === activeSceneId);
        if (!scene) return;
        const prev = Math.max(activePageIndex - 1, 0);
        setActivePageIndex(prev);
        setSuggestPrompt(null);
        pushPageContent(scene, prev);
        if (scene.navMode === 'read_along') {
            window.electron?.Aligner?.setPage(prev);
        }
    }, [scenes, activeSceneId, activePageIndex, targets]);

    const handleStopScene = () => {
        setIsPresentingScene(false);
        setActiveSceneId(null);
        setSuggestPrompt(null);
        window.electron?.Aligner?.stop();
        window.electron?.Presentation?.setContent(null);
    };

    const handleOpenNewScene = () => {
        const sc = newScene(`Scene ${scenes.length + 1}`);
        setModalScene(sc);
        setSceneModalOpen(true);
    };

    const handleOpenEditScene = (sc) => {
        setModalScene(sc);
        setSceneModalOpen(true);
    };

    const handleSaveModalScene = async (sc) => {
        const saved = await window.electron?.Scene?.save(sc).catch(() => sc);
        const updated = saved ?? sc;
        setScenes(prev => {
            const idx = prev.findIndex(s => s.id === updated.id);
            if (idx >= 0) {
                const arr = [...prev];
                arr[idx] = updated;
                return arr;
            }
            return [...prev, updated];
        });
        if (activeSceneId === updated.id) {
            pushPageContent(updated, activePageIndex);
            if (updated.navMode === 'read_along') {
                window.electron?.Aligner?.startScene(updated, activePageIndex);
            }
        }
    };

    const handleContextMenu = (e, fileUrl, isVideo) => {
        e.preventDefault();
        setContextMenu({ visible: true, x: e.clientX, y: e.clientY, fileUrl, isVideo });
    };

    const closeContextMenu = () => {
        if (contextMenu.visible) setContextMenu({ ...contextMenu, visible: false });
    };

    useEffect(() => {
        const handleClick = () => {
            closeContextMenu();
            setPresContextMenu(prev => ({ ...prev, visible: false }));
            setPageContextMenu(prev => ({ ...prev, visible: false }));
        };
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, [contextMenu.visible, presContextMenu.visible, pageContextMenu.visible]);

    const handleRemoveMedia = async (fileUrl) => {
        if (window.electron?.Media?.delete) {
            try { await window.electron.Media.delete(fileUrl); } catch (e) { console.error(e); }
        }
        setMediaFiles(prev => prev.filter(url => url !== fileUrl));
        closeContextMenu();
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Backspace' || e.key === 'Delete') {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
                if (selectedLayerId) {
                    if (selectedLayerId === 'bg') {
                        setBackground({ url: null, type: 'image', x: 50, y: 50, width: 100, height: 100 });
                        setSelectedLayerId(null);
                    } else {
                        setLayers(prev => prev.filter(l => l.id !== selectedLayerId));
                        setSelectedLayerId(null);
                    }
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedLayerId]);

    const refreshMedia = async () => {
        if (window.electron?.Media) {
            try { const files = await window.electron.Media.list(); setMediaFiles(files); } catch (e) { console.error(e); }
        }
    };

    const handleImport = async () => {
        if (window.electron?.Media) { await window.electron.Media.import(); refreshMedia(); }
    };

    const handleImportPresentation = async () => {
        if (window.electron?.Media?.importPresentation) {
            const result = await window.electron.Media.importPresentation();
            if (result) {
                setPresentations(prev => [...prev, { id: Date.now(), title: result.filename, fileUrl: result.fileUrl, pages: result.pages || [] }]);
            }
        }
    };

    const handleDeletePresentation = async (presentation) => {
        if (window.electron?.Media?.deletePresentation) await window.electron.Media.deletePresentation(presentation.fileUrl);
        setPresentations(prev => prev.filter(p => p.id !== presentation.id));
        if (selectedPresentation?.id === presentation.id) setSelectedPresentation(null);
        setPresContextMenu({ ...presContextMenu, visible: false });
    };

    const handleShowPresentation = (presentation) => {
        setSelectedPresentation(presentation);
        setPresContextMenu({ ...presContextMenu, visible: false });
    };

    const handlePresentPage = (pageIndex) => {
        if (!selectedPresentation) return;
        if (window.electron?.Presentation) {
            const targetArr = [];
            if (targets.general) targetArr.push('general');
            if (targets.speaker) targetArr.push('speaker');
            const slideImageUrl = selectedPresentation.pages[pageIndex];
            window.electron.Presentation.setContent({
                type: 'slide_index',
                data: { presentationTitle: selectedPresentation.title, slideIndex: pageIndex, fileUrl: selectedPresentation.fileUrl, slideImageUrl },
                target: targetArr
            });
        }
        setPageContextMenu({ ...pageContextMenu, visible: false });
    };

    const addLayer = (type, content) => {
        const newId = `${type}-${Date.now()}`;
        const newLayer = {
            id: newId, type, content, x: 50, y: 50,
            style: type === 'text'
                ? { fontSize: 5, color: '#ffffff', fontFamily: 'sans-serif', fontWeight: 'normal', textTransform: 'none', lineHeight: 1.2, shadow: null }
                : { width: 30, shadow: null }
        };
        setLayers(prev => [...prev, newLayer]);
        setSelectedLayerId(newId);
    };

    const updateLayer = (id, updates) => setLayers(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
    const deleteLayer = (id) => { setLayers(prev => prev.filter(l => l.id !== id)); if (selectedLayerId === id) setSelectedLayerId(null); };

    const setBg = (url) => {
        const isVideo = url.endsWith('.mp4') || url.endsWith('.webm');
        const loadable = isVideo ? document.createElement('video') : new Image();
        loadable.src = url;
        const onLoad = () => {
            const w = isVideo ? loadable.videoWidth : loadable.naturalWidth;
            const h = isVideo ? loadable.videoHeight : loadable.naturalHeight;
            const ratio = w / h;
            const slideRatio = 16 / 9;
            let bw = 100, bh = 100;
            if (ratio > slideRatio) { bh = (slideRatio / ratio) * 100; } else { bw = (ratio / slideRatio) * 100; }
            setBackground({ url, type: isVideo ? 'video' : 'image', x: 50, y: 50, width: bw, height: bh });
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
            else if (target.type === 'image') { w = target.style.width; }
            else { s = target.style.fontSize; }
            setDragStart({ mouseX: e.clientX, mouseY: e.clientY, initialWidth: w, initialHeight: h, initialSize: s });
        } else {
            setResizeHandle(null); setIsDragging(true);
            setDragStart({ mouseX: e.clientX, mouseY: e.clientY, objX: target.x, objY: target.y });
        }
    };

    const handleMouseMove = (e) => {
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
                const newSize = Math.max(1, dragStart.initialSize + deltaX * wMult * 0.05);
                updateLayer(draggingId, { style: { ...layer.style, fontSize: newSize } });
            } else if (draggingId === 'bg') {
                let newWidth = background.width, newHeight = background.height;
                if (wMult !== 0) newWidth = Math.max(10, dragStart.initialWidth + (deltaX / rect.width) * 100 * wMult);
                if (hMult !== 0) newHeight = Math.max(10, dragStart.initialHeight + ((e.clientY - dragStart.mouseY) / rect.height) * 100 * hMult);
                setBackground(prev => ({ ...prev, width: newWidth, height: newHeight }));
            } else {
                const newWidth = Math.max(5, dragStart.initialSize + (deltaX / rect.width) * 100 * wMult);
                updateLayer(draggingId, { style: { ...layer.style, width: newWidth } });
            }
        } else if (isDragging) {
            if (draggingId === 'bg') setBackground(prev => ({ ...prev, x: dragStart.objX + deltaXPct, y: dragStart.objY + deltaYPct }));
            else updateLayer(draggingId, { x: dragStart.objX + deltaXPct, y: dragStart.objY + deltaYPct });
        }
    };

    const handleMouseUp = () => { setIsDragging(false); setResizeHandle(null); setDraggingId(null); };

    const handlePresent = () => {
        if (!window.electron?.Presentation) return;
        const targetArr = [];
        if (targets.general) targetArr.push('general');
        if (targets.speaker) targetArr.push('speaker');
        if (targetArr.length === 0) return;
        window.electron.Presentation.setContent({ type: 'custom_layers', data: { layers }, target: targetArr });
        window.electron.Presentation.setStyle({
            backgroundImage: background.type === 'image' ? background.url : null,
            backgroundVideo: background.type === 'video' ? background.url : null,
            backgroundColor: '#000000',
            backgroundX: background.x, backgroundY: background.y,
            backgroundWidth: background.width, backgroundHeight: background.height,
            target: targetArr
        });
    };

    const toggleTarget = (key) => setTargets(prev => ({ ...prev, [key]: !prev[key] }));
    const selectedLayer = layers.find(l => l.id === selectedLayerId);

    const TABS = [
        { id: 'media', icon: PiImage, label: 'Media' },
        { id: 'text', icon: PiTextT, label: 'Text' },
        { id: 'presentation', icon: PiFolder, label: 'Templates' },
        { id: 'scene', icon: PiFilmSlate, label: 'Scene' },
    ];

    return (
        <div className="h-full w-full bg-[#0d0d0d] flex flex-col overflow-hidden text-light font-sans" onMouseUp={handleMouseUp} onMouseMove={handleMouseMove}>
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
                        {/* Task 1 fix: clicking these now gates which windows receive the broadcast */}
                        <div className="flex gap-2">
                            {['general', 'speaker'].map(t => (
                                <button key={t} onClick={() => toggleTarget(t)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${targets[t] ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-white/5 text-white/30 border border-transparent hover:bg-white/10'}`}>
                                    {targets[t] ? <PiCheckSquare size={14} /> : <PiSquare size={14} />} {t}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 relative flex items-center justify-center bg-black/50 p-2 overflow-hidden">
                        <div ref={canvasRef} onMouseDown={(e) => handleMouseDown(e, 'bg')} className="aspect-video w-full max-h-full bg-black rounded-lg overflow-hidden relative shadow-2xl border border-white/10" style={{ containerType: 'size' }}>
                            {background.url && (
                                <div className="absolute z-0" style={{ left: `${background.x}%`, top: `${background.y}%`, transform: 'translate(-50%,-50%)', width: `${background.width}%`, height: `${background.height}%` }} onMouseDown={(e) => handleMouseDown(e, 'bg')}>
                                    {selectedLayerId === 'bg' && (
                                        <>
                                            <div className="absolute -inset-0.5 border-2 border-yellow-500/50 border-dashed pointer-events-none z-50" />
                                            {['nw','ne','sw','se','ml','mr','mt','mb'].map(h => {
                                                const pos = { nw:'-top-1.5 -left-1.5 cursor-nwse-resize', ne:'-top-1.5 -right-1.5 cursor-nesw-resize', sw:'-bottom-1.5 -left-1.5 cursor-nesw-resize', se:'-bottom-1.5 -right-1.5 cursor-nwse-resize', ml:'top-1/2 -translate-y-1/2 -left-1.5 cursor-ew-resize', mr:'top-1/2 -translate-y-1/2 -right-1.5 cursor-ew-resize', mt:'left-1/2 -translate-x-1/2 -top-1.5 cursor-ns-resize', mb:'left-1/2 -translate-x-1/2 -bottom-1.5 cursor-ns-resize' }[h];
                                                return <div key={h} onMouseDown={(e) => handleMouseDown(e, 'bg', h)} className={`absolute w-3 h-3 bg-yellow-500 border border-white rounded-full z-50 shadow-sm ${pos}`} />;
                                            })}
                                        </>
                                    )}
                                    {background.type === 'video'
                                        ? <video src={background.url} className="w-full h-full object-fill pointer-events-none" autoPlay loop muted />
                                        : <img src={background.url} className="w-full h-full object-fill pointer-events-none" alt="bg" />
                                    }
                                </div>
                            )}
                            {layers.map(layer => (
                                <div key={layer.id} onMouseDown={(e) => handleMouseDown(e, layer.id)} className={`absolute cursor-move group ${selectedLayerId === layer.id ? 'z-50' : 'z-10'}`} style={{ left: `${layer.x}%`, top: `${layer.y}%`, transform: 'translate(-50%,-50%)', width: layer.type === 'image' ? `${layer.style.width || 30}%` : 'auto' }}>
                                    {selectedLayerId === layer.id && (
                                        <>
                                            <div className="absolute -inset-2 border-2 border-blue-500 border-dashed rounded-lg pointer-events-none z-0" />
                                            {['nw','ne','sw','se','ml','mr'].map(h => {
                                                const pos = { nw:'-top-2 -left-2 cursor-nwse-resize', ne:'-top-2 -right-2 cursor-nesw-resize', sw:'-bottom-2 -left-2 cursor-nesw-resize', se:'-bottom-2 -right-2 cursor-nwse-resize', ml:'top-1/2 -translate-y-1/2 -left-2 cursor-ew-resize', mr:'top-1/2 -translate-y-1/2 -right-2 cursor-ew-resize' }[h];
                                                return <div key={h} onMouseDown={(e) => handleMouseDown(e, layer.id, h)} className={`absolute w-3 h-3 bg-blue-500 border border-white rounded-full z-50 shadow-sm ${pos}`} />;
                                            })}
                                        </>
                                    )}
                                    {layer.type === 'text' ? (
                                        <p className="whitespace-pre-wrap text-center px-2 py-1 relative z-10" style={{ fontSize: `${layer.style.fontSize}cqw`, lineHeight: layer.style.lineHeight || 1.2, color: layer.style.color, fontFamily: layer.style.fontFamily === 'serif' ? 'Georgia,serif' : (layer.style.fontFamily === 'mono' ? '"Courier New",monospace' : 'system-ui,sans-serif'), fontWeight: layer.style.fontWeight || 'normal', textTransform: layer.style.textTransform || 'none', textShadow: layer.style.shadow ? `${layer.style.shadow.x||0}px ${layer.style.shadow.y||0}px ${layer.style.shadow.blur||10}px ${layer.style.shadow.color||'rgba(0,0,0,0.6)'}` : 'none' }}>
                                            {layer.content}
                                        </p>
                                    ) : (
                                        <img src={layer.content} className="w-full h-auto rounded-lg relative z-10 pointer-events-none" style={{ boxShadow: layer.style.shadow ? `${layer.style.shadow.x||0}px ${layer.style.shadow.y||0}px ${layer.style.shadow.blur||10}px ${layer.style.shadow.color||'rgba(0,0,0,0.6)'}` : 'none' }} />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="h-14 border-t border-white/5 flex items-center justify-between px-6 bg-[#1a1a1a]">
                        <div className="flex items-center gap-4">
                            <button onClick={clearBg} className="text-red-400/80 hover:text-red-400 text-xs flex items-center gap-2 transition-colors"><PiTrash /> Clear Slide</button>
                            <span className="text-xs text-white/30 border-l border-white/10 pl-4">{layers.length} Layers Active</span>
                        </div>
                        <button onClick={handlePresent} className="bg-red hover:bg-red/90 text-white px-8 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg active:scale-95">
                            <PiBroadcast size={16} /> Present Now
                        </button>
                    </div>
                </div>

                {/* RIGHT: TABS */}
                <div className="flex-1 bg-[#141414] m-2 ml-0 rounded-2xl border border-white/5 flex flex-col overflow-hidden w-full max-w-sm relative">
                    <div className="flex border-b border-white/5 bg-[#1a1a1a] shrink-0">
                        {TABS.map(tab => (
                            <button key={tab.id} onClick={() => { setActiveTab(tab.id); if (tab.id !== 'presentation') setSelectedPresentation(null); }} className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[10px] font-bold uppercase tracking-wider transition-colors ${activeTab === tab.id ? (tab.id === 'scene' ? 'bg-white/5 text-orange-400 border-b-2 border-orange-500' : 'bg-white/5 text-blue-400 border-b-2 border-blue-500') : 'text-white/40 hover:bg-white/5 hover:text-white/70'}`}>
                                <tab.icon size={14} /> {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className={`flex-1 overflow-y-auto content-start ${activeTab !== 'scene' ? 'p-3' : ''}`}>

                        {activeTab === 'media' && (
                            <div className="flex flex-col gap-3">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-[10px] uppercase text-white/40 font-bold tracking-widest">Imported Assets</span>
                                    <button onClick={handleImport} className="text-blue-400 hover:text-blue-300 bg-blue-400/10 p-1.5 rounded transition-colors"><PiPlus size={14} /></button>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    {mediaFiles.map((fileUrl, index) => {
                                        const isVideo = fileUrl.endsWith('.mp4');
                                        return (
                                            <div key={index} className="aspect-square w-full h-[100px] bg-gray-800 rounded-xl relative overflow-hidden border border-white/5 hover:border-white/20 transition-all cursor-pointer" onContextMenu={(e) => handleContextMenu(e, fileUrl, isVideo)} onDoubleClick={() => addLayer(isVideo ? 'video' : 'image', fileUrl)}>
                                                {isVideo ? <video src={fileUrl} className="absolute inset-0 w-full h-full object-cover opacity-70 hover:opacity-100 transition-opacity" muted /> : <img src={fileUrl} className="absolute inset-0 w-full h-full object-cover opacity-70 hover:opacity-100 transition-opacity" alt="thumb" />}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {activeTab === 'text' && (
                            <div className="flex flex-col gap-6">
                                <button onClick={() => addLayer('text', 'New Text Element')} className="w-full flex items-center justify-center gap-2 text-xs font-bold uppercase bg-blue-500 hover:bg-blue-600 text-white p-3 rounded-xl transition-all shadow-lg active:scale-95">
                                    <PiTextT size={16} /> Add New Text
                                </button>
                                {selectedLayer && selectedLayer.type === 'text' ? (
                                    <div className="flex flex-col gap-4 border-t border-white/10 pt-4">
                                        <div className="flex flex-col gap-2">
                                            <label className="text-[10px] uppercase font-bold text-white/30 tracking-wider">Content</label>
                                            <textarea value={selectedLayer.content} onChange={e => updateLayer(selectedLayer.id, { content: e.target.value })} className="bg-black/40 text-sm p-3 rounded-lg border border-white/10 outline-none focus:border-blue-500 h-20 resize-none transition-all" />
                                        </div>
                                        <div className="flex flex-col gap-4">
                                            {/* COLOR PANEL */}
                                            <div className="bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden">
                                                <div className="flex items-center justify-between p-3 border-b border-white/5">
                                                    <span className="text-xs font-bold text-white tracking-wide">Color</span>
                                                    <button className="text-white/40 hover:text-white/80 transition-colors"><PiCaretDownBold /></button>
                                                </div>
                                                <div className="p-3 flex flex-col gap-3">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs text-white/60">Text</span>
                                                        <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-lg p-1 w-32">
                                                            <div className="w-5 h-5 rounded border border-white/20 relative overflow-hidden" style={{ backgroundColor: selectedLayer.style.color || '#ffffff' }}>
                                                                <input type="color" value={selectedLayer.style.color || '#ffffff'} onChange={e => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, color: e.target.value } })} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full scale-[2]" />
                                                            </div>
                                                            <span className="text-[10px] font-mono text-white/80 uppercase">{selectedLayer.style.color || '#ffffff'}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs text-white/60">Bg</span>
                                                        <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-lg p-1 w-32">
                                                            <div className="w-5 h-5 rounded border border-white/20 relative overflow-hidden" style={{ backgroundColor: selectedLayer.style.backgroundColor || '#B009DB' }}>
                                                                <input type="color" value={selectedLayer.style.backgroundColor || '#B009DB'} onChange={e => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, backgroundColor: e.target.value } })} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full scale-[2]" />
                                                            </div>
                                                            <span className="text-[10px] font-mono text-white/80 uppercase">{selectedLayer.style.backgroundColor || '#B009DB'}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs text-white/60">Hover bg</span>
                                                        <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-lg p-1 w-32">
                                                            <div className="w-5 h-5 rounded border border-white/20 relative overflow-hidden" style={{ backgroundColor: selectedLayer.style.hoverBackgroundColor || '#DD63FC' }}>
                                                                <input type="color" value={selectedLayer.style.hoverBackgroundColor || '#DD63FC'} onChange={e => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, hoverBackgroundColor: e.target.value } })} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full scale-[2]" />
                                                            </div>
                                                            <span className="text-[10px] font-mono text-white/80 uppercase">{selectedLayer.style.hoverBackgroundColor || '#DD63FC'}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* BUTTON OPTIONS PANEL */}
                                            <div className="bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden">
                                                <div className="flex items-center justify-between p-3 border-b border-white/5">
                                                    <span className="text-xs font-bold text-white tracking-wide">Button options</span>
                                                    <button className="text-white/40 hover:text-white/80 transition-colors"><PiCaretDownBold /></button>
                                                </div>
                                                <div className="p-3 flex flex-col gap-4">
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="flex flex-col gap-1.5">
                                                            <span className="text-[10px] text-white/50 font-medium">Font</span>
                                                            <select value={selectedLayer.style.fontFamily || 'Inter Tight'} onChange={e => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, fontFamily: e.target.value } })} className="bg-black/40 text-xs p-2 rounded-lg border border-white/10 outline-none focus:border-blue-500 text-white/90 w-full appearance-none">
                                                                <option value="Inter Tight">Inter Tight</option><option value="sans-serif">Sans Serif</option><option value="serif">Serif</option><option value="monospace">Monospace</option>
                                                            </select>
                                                        </div>
                                                        <div className="flex flex-col gap-1.5">
                                                            <span className="text-[10px] text-white/50 font-medium">Weight</span>
                                                            <select value={selectedLayer.style.fontWeight || '500'} onChange={e => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, fontWeight: e.target.value } })} className="bg-black/40 text-xs p-2 rounded-lg border border-white/10 outline-none focus:border-blue-500 text-white/90 w-full appearance-none">
                                                                <option value="400">400 - Regular</option><option value="500">500 - Medium</option><option value="600">600 - SemiBold</option><option value="700">700 - Bold</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="flex flex-col gap-1.5">
                                                            <span className="text-[10px] text-white/50 font-medium">Size</span>
                                                            <div className="relative">
                                                                <input type="number" value={selectedLayer.style.fontSize || 16} onChange={e => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, fontSize: parseFloat(e.target.value) } })} className="bg-black/40 text-xs p-2 pr-6 rounded-lg border border-white/10 outline-none focus:border-blue-500 text-white/90 w-full" />
                                                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-white/30 font-medium pointer-events-none">PX</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col gap-1.5">
                                                            <span className="text-[10px] text-white/50 font-medium">Letter spacing</span>
                                                            <div className="relative">
                                                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-white/40 pointer-events-none">|A|</span>
                                                                <input type="number" value={selectedLayer.style.letterSpacing || -3} onChange={e => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, letterSpacing: parseFloat(e.target.value) } })} className="bg-black/40 text-xs p-2 pl-7 pr-5 rounded-lg border border-white/10 outline-none focus:border-blue-500 text-white/90 w-full" />
                                                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-white/30 font-medium pointer-events-none">%</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col gap-1.5">
                                                        <span className="text-[10px] text-white/50 font-medium">Align</span>
                                                        <div className="flex items-center gap-1 bg-black/40 border border-white/10 p-1 rounded-lg w-full">
                                                            <button onClick={() => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, textAlign: 'left' } })} className={`flex-1 py-1.5 rounded flex items-center justify-center transition-colors ${selectedLayer.style.textAlign === 'left' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/80'}`}>
                                                                <PiTextAlignLeft />
                                                            </button>
                                                            <button onClick={() => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, textAlign: 'center' } })} className={`flex-1 py-1.5 rounded flex items-center justify-center transition-colors ${(!selectedLayer.style.textAlign || selectedLayer.style.textAlign === 'center') ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/80'}`}>
                                                                <PiTextAlignCenter />
                                                            </button>
                                                            <button onClick={() => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, textAlign: 'right' } })} className={`flex-1 py-1.5 rounded flex items-center justify-center transition-colors ${selectedLayer.style.textAlign === 'right' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/80'}`}>
                                                                <PiTextAlignRight />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center text-white/20 text-xs mt-10">Select a text layer on the canvas to format it.</div>
                                )}
                            </div>
                        )}

                        {activeTab === 'presentation' && (
                            <div className="flex flex-col gap-4">
                                {selectedPresentation ? (
                                    <>
                                        <div className="flex items-center gap-2 mb-2">
                                            <button onClick={() => setSelectedPresentation(null)} className="text-blue-400 hover:text-blue-300 text-xs font-bold uppercase p-1">← Back</button>
                                            <span className="text-xs font-bold text-white/60 truncate">{selectedPresentation.title}</span>
                                        </div>
                                        {selectedPresentation.pages.length === 0
                                            ? <div className="text-white/20 text-xs text-center mt-4">No slides detected in this file.</div>
                                            : <div className="grid grid-cols-2 gap-3">
                                                {selectedPresentation.pages.map((pageUrl, pageIdx) => (
                                                    <div key={pageIdx} className="aspect-video bg-[#111] rounded-lg relative overflow-hidden border border-white/10 hover:border-blue-500 cursor-pointer transition-all group" onContextMenu={(e) => { e.preventDefault(); setPageContextMenu({ visible: true, x: e.clientX, y: e.clientY, pageIndex: pageIdx }); }} onClick={() => handlePresentPage(pageIdx)}>
                                                        <img src={pageUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt={`Slide ${pageIdx + 1}`} />
                                                        <div className="absolute bottom-1 right-1 bg-black/60 px-1.5 py-0.5 rounded text-[8px] font-mono text-white/80">{pageIdx + 1}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        }
                                    </>
                                ) : (
                                    <>
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-[10px] uppercase text-white/40 font-bold tracking-widest">Available Presentations</span>
                                            <button onClick={handleImportPresentation} className="text-blue-400 hover:text-blue-300 bg-blue-400/10 p-1.5 rounded transition-colors"><PiPlus size={14} /></button>
                                        </div>
                                        {presentations.map(p => (
                                            <div key={p.id} onClick={() => setSelectedPresentation(p)} onContextMenu={(e) => { e.preventDefault(); setPresContextMenu({ visible: true, x: e.clientX, y: e.clientY, presentation: p }); }} className="p-4 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl cursor-pointer transition-colors flex items-center gap-3">
                                                <PiFolder size={20} className="text-yellow-500/80" />
                                                <div className="flex flex-col overflow-hidden">
                                                    <span className="text-sm font-bold text-white/80 truncate">{p.title}</span>
                                                    <span className="text-[10px] text-white/40">{p.pages.length} Slide{p.pages.length !== 1 ? 's' : ''}</span>
                                                </div>
                                            </div>
                                        ))}
                                        {presentations.length === 0 && <div className="text-white/20 text-xs text-center mt-4">No presentations found. Click + to import.</div>}
                                    </>
                                )}
                            </div>
                        )}

                        {/* SCENE TAB — FR-4.28–FR-4.31 */}
                        {activeTab === 'scene' && (
                            <SceneTab
                                targets={targets}
                                scenes={scenes}
                                setScenes={setScenes}
                                activeSceneId={activeSceneId}
                                setActiveSceneId={setActiveSceneId}
                                activePageIndex={activePageIndex}
                                setActivePageIndex={setActivePageIndex}
                                isPresenting={isPresentingScene}
                                setIsPresenting={setIsPresentingScene}
                                suggestPrompt={suggestPrompt}
                                setSuggestPrompt={setSuggestPrompt}
                                onOpenModal={handleOpenEditScene}
                                pushPageContent={pushPageContent}
                                activateScene={activateScene}
                                handleNextPage={handleNextScenePage}
                                handlePrevPage={handlePrevScenePage}
                                handleStopScene={handleStopScene}
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* BOTTOM: Layer Properties */}
            <div className="h-56 bg-[#141414] m-2 mt-0 rounded-2xl border border-white/5 flex flex-col">
                <div className="h-10 border-b border-white/5 flex items-center justify-between px-4 bg-[#1a1a1a]">
                    <span className="text-xs font-bold uppercase tracking-widest text-white/50 flex items-center gap-2"><PiSliders size={16} /> Layer Properties</span>
                    <button onClick={() => addLayer('text', 'New Text')} className="flex items-center gap-2 text-[10px] font-bold uppercase bg-purple-500/20 text-purple-300 px-3 py-1.5 rounded-lg hover:bg-purple-500/30 border border-purple-500/20 transition-all">
                        <PiTextT size={14} /> Add Text
                    </button>
                </div>
                <div className="flex-1 flex overflow-hidden">
                    <div className="w-64 border-r border-white/5 flex flex-col overflow-y-auto p-2 gap-1 bg-black/20">
                        {layers.map(l => (
                            <div key={l.id} onClick={() => setSelectedLayerId(l.id)} className={`p-3 rounded-xl cursor-pointer flex items-center justify-between text-xs transition-all border ${selectedLayerId === l.id ? 'bg-blue-600/20 border-blue-500/50 text-white' : 'bg-white/5 border-transparent text-white/50 hover:bg-white/10'}`}>
                                <div className="flex items-center gap-3">
                                    {l.type === 'text' ? <PiTextAa size={16} /> : <PiImage size={16} />}
                                    <span className="font-bold">{l.content.length > 15 ? l.content.substring(0, 15) + '...' : (l.type === 'text' ? l.content : 'Image Layer')}</span>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); deleteLayer(l.id); }} className="text-white/30 hover:text-red-400 p-1"><PiTrash size={14} /></button>
                            </div>
                        ))}
                    </div>
                    <div className="flex-1 flex p-6 gap-10 items-start overflow-x-auto">
                        {selectedLayer ? (
                            <div className="flex flex-col gap-6 w-64 shrink-0">
                                <div className="flex flex-col gap-2">
                                    <div className="flex justify-between">
                                        <label className="text-[10px] uppercase font-bold text-white/30 tracking-wider font-mono">Size / Scale</label>
                                        <span className="text-[10px] font-bold text-blue-400">{selectedLayer.type === 'text' ? selectedLayer.style.fontSize : selectedLayer.style.width}</span>
                                    </div>
                                    <input type="range" min="1" max={selectedLayer.type === 'text' ? 20 : 100} step={selectedLayer.type === 'text' ? 0.1 : 1} value={selectedLayer.type === 'text' ? selectedLayer.style.fontSize : selectedLayer.style.width} onChange={(e) => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, ...(selectedLayer.type === 'text' ? { fontSize: Number(e.target.value) } : { width: Number(e.target.value) }) } })} className="w-full accent-blue-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer" />
                                </div>
                            </div>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-white/20 gap-4">
                                <PiShapes size={40} className="opacity-50" />
                                <p className="text-sm font-medium">Select a layer to edit properties</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {contextMenu.visible && (
                <div className="fixed z-[100] bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl py-1 flex flex-col min-w-[160px] text-xs font-medium" style={{ left: contextMenu.x, top: contextMenu.y }}>
                    <button className="px-4 py-2 text-left text-white/80 hover:bg-blue-600/20 hover:text-blue-400 transition-colors" onClick={() => { setBg(contextMenu.fileUrl); closeContextMenu(); }}>Set Background</button>
                    <button className="px-4 py-2 text-left text-white/80 hover:bg-white/10 transition-colors" onClick={() => { addLayer(contextMenu.isVideo ? 'video' : 'image', contextMenu.fileUrl); closeContextMenu(); }}>Add Layer</button>
                    <div className="h-px bg-white/10 my-1" />
                    <button className="px-4 py-2 text-left text-white/80 hover:bg-red-500/20 hover:text-red-400 transition-colors" onClick={() => handleRemoveMedia(contextMenu.fileUrl)}>Remove</button>
                </div>
            )}
            {presContextMenu.visible && (
                <div className="fixed z-[101] bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl py-1 flex flex-col min-w-[150px] text-xs font-medium" style={{ left: presContextMenu.x, top: presContextMenu.y }} onClick={(e) => e.stopPropagation()}>
                    <button className="px-4 py-2 text-left text-white/80 hover:bg-blue-600/20 hover:text-blue-400 transition-colors" onClick={() => handleShowPresentation(presContextMenu.presentation)}>Show Slides</button>
                    <div className="h-px bg-white/10 my-1" />
                    <button className="px-4 py-2 text-left text-white/80 hover:bg-red-500/20 hover:text-red-400 transition-colors" onClick={() => handleDeletePresentation(presContextMenu.presentation)}>Delete</button>
                </div>
            )}
            {pageContextMenu.visible && (
                <div className="fixed z-[101] bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl py-1 flex flex-col min-w-[150px] text-xs font-medium" style={{ left: pageContextMenu.x, top: pageContextMenu.y }} onClick={(e) => e.stopPropagation()}>
                    <button className="px-4 py-2 text-left text-white/80 hover:bg-blue-600/20 hover:text-blue-400 transition-colors" onClick={() => handlePresentPage(pageContextMenu.pageIndex)}>Show</button>
                </div>
            )}

            {/* Scene Editor Modal — Matching Reference Layout */}
            <SceneModal
                isOpen={sceneModalOpen}
                scene={modalScene}
                onClose={() => setSceneModalOpen(false)}
                onSave={handleSaveModalScene}
            />
        </div>
    );
}
