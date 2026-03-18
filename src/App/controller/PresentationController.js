import React, { useState, useEffect, useRef } from "react";
import {
    PiFolder, PiImage, PiVideoCamera, PiShapes, PiTextT,
    PiPlay, PiPause, PiTrash, PiSliders, PiTextAa, PiBroadcast, 
    PiCheckSquare, PiSquare, PiPlus, PiMonitorPlay
} from "react-icons/pi";

export default function PresentationController() {
    const [mediaFiles, setMediaFiles] = useState([]);
    
    const [activeTab, setActiveTab] = useState('media'); // 'media', 'text', 'presentation'
    
    const [presentations, setPresentations] = useState([]);
    const [selectedPresentation, setSelectedPresentation] = useState(null);
    const [presContextMenu, setPresContextMenu] = useState({ visible: false, x: 0, y: 0, presentation: null });
    const [pageContextMenu, setPageContextMenu] = useState({ visible: false, x: 0, y: 0, pageIndex: null });

    // Slide State
    const [background, setBackground] = useState({ url: null, type: 'image', x: 50, y: 50, width: 100, height: 100 }); 
    const [layers, setLayers] = useState([
        { id: 'text-1', type: 'text', content: "Welcome", x: 50, y: 50, style: { fontSize: 5, color: '#ffffff', fontFamily: 'sans', width: 0 } }
    ]);
    const [selectedLayerId, setSelectedLayerId] = useState('text-1');
    
    const [targets, setTargets] = useState({ general: true, speaker: true });
    
    // Interaction State
    const [isDragging, setIsDragging] = useState(false);
    const [resizeHandle, setResizeHandle] = useState(null); // 'se' (southeast) only for now or 'all'
    const [dragStart, setDragStart] = useState({ x: 0, y: 0, initialVal: 0 }); // Mouse Start + Initial Layer Val
    const [draggingId, setDraggingId] = useState(null);
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, fileUrl: null, isVideo: false });
    
    const canvasRef = useRef(null);

    // Initial Load
    useEffect(() => {
        refreshMedia();
    }, []);

    const handleContextMenu = (e, fileUrl, isVideo) => {
        e.preventDefault();
        setContextMenu({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            fileUrl,
            isVideo
        });
    };

    const closeContextMenu = () => {
        if (contextMenu.visible) {
            setContextMenu({ ...contextMenu, visible: false });
        }
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
        if (window.electron && window.electron.Media && window.electron.Media.delete) {
            try {
                await window.electron.Media.delete(fileUrl);
            } catch (e) {
                console.error(e);
            }
        }
        setMediaFiles(prev => prev.filter(url => url !== fileUrl));
        closeContextMenu();
    };


    // Handle Keyboard Delete
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
        if (window.electron && window.electron.Media) {
            try {
                const files = await window.electron.Media.list();
                setMediaFiles(files);
            } catch (e) { console.error(e); }
        }
    };

    const handleImport = async () => {
        if (window.electron && window.electron.Media) {
            await window.electron.Media.import();
            refreshMedia();
        }
    };

    const handleImportPresentation = async () => {
        if (window.electron && window.electron.Media && window.electron.Media.importPresentation) {
            const result = await window.electron.Media.importPresentation();
            if (result) {
                // result.pages contains an array of file:// URLs to the extracted slide images
                setPresentations(prev => [...prev, {
                    id: Date.now(),
                    title: result.filename,
                    fileUrl: result.fileUrl,
                    pages: result.pages || []
                }]);
            }
        }
    };

    const handleDeletePresentation = async (presentation) => {
        if (window.electron && window.electron.Media && window.electron.Media.deletePresentation) {
            await window.electron.Media.deletePresentation(presentation.fileUrl);
        }
        setPresentations(prev => prev.filter(p => p.id !== presentation.id));
        if (selectedPresentation && selectedPresentation.id === presentation.id) {
            setSelectedPresentation(null);
        }
        setPresContextMenu({ ...presContextMenu, visible: false });
    };

    const handleShowPresentation = (presentation) => {
        setSelectedPresentation(presentation);
        setPresContextMenu({ ...presContextMenu, visible: false });
    };

    const handlePresentPage = (pageIndex) => {
        if (!selectedPresentation) return;
        if (window.electron && window.electron.Presentation) {
            const targetArr = [];
            if (targets.general) targetArr.push('general');
            if (targets.speaker) targetArr.push('speaker');
            const slideImageUrl = selectedPresentation.pages[pageIndex];
            window.electron.Presentation.setContent({
                type: 'slide_index',
                data: { 
                    presentationTitle: selectedPresentation.title, 
                    slideIndex: pageIndex, 
                    fileUrl: selectedPresentation.fileUrl,
                    slideImageUrl: slideImageUrl
                },
                target: targetArr
            });
        }
        setPageContextMenu({ ...pageContextMenu, visible: false });
    };


    // --- Layer Management ---
    const addLayer = (type, content) => {
        const newId = `${type}-${Date.now()}`;
        const newLayer = {
            id: newId,
            type,
            content, 
            x: 50, // % Center
            y: 50,
            style: type === 'text' ? { 
                fontSize: 5, 
                color: '#ffffff', 
                fontFamily: 'sans-serif', 
                fontWeight: 'normal', 
                textTransform: 'none', 
                lineHeight: 1.2,
                shadow: null
            } : { width: 30, shadow: null }
        };
        setLayers(prev => [...prev, newLayer]);
        setSelectedLayerId(newId);
    };

    const updateLayer = (id, updates) => {
        setLayers(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
    };

    const deleteLayer = (id) => {
        setLayers(prev => prev.filter(l => l.id !== id));
        if (selectedLayerId === id) setSelectedLayerId(null);
    };

    const setBg = (url) => {
        const isVideo = url.endsWith('.mp4') || url.endsWith('.webm');
        
        if (isVideo) {
            const vid = document.createElement('video');
            vid.src = url;
            vid.onloadedmetadata = () => {
                const ratio = vid.videoWidth / vid.videoHeight;
                const slideRatio = 16/9;
                let w = 100, h = 100;
                
                if (ratio > slideRatio) {
                    h = (slideRatio / ratio) * 100;
                } else {
                    w = (ratio / slideRatio) * 100;
                }
                setBackground({ url, type: 'video', x: 50, y: 50, width: w, height: h });
            };
        } else {
            const img = new Image();
            img.src = url;
            img.onload = () => {
                const ratio = img.naturalWidth / img.naturalHeight;
                const slideRatio = 16/9;
                let w = 100, h = 100;
                if (ratio > slideRatio) {
                   h = (slideRatio / ratio) * 100;
                } else {
                   w = (ratio / slideRatio) * 100;
                }
                setBackground({ url, type: 'image', x: 50, y: 50, width: w, height: h });
            };
        }
    };

    const clearBg = () => setBackground({ url: null, type: 'image', x: 50, y: 50, width: 100, height: 100 });

    // --- Interaction Logic ---
    const handleMouseDown = (e, id, handle = null) => {
        e.stopPropagation();

        let target;
        if (id === 'bg') {
            target = background;
            setSelectedLayerId('bg');
        } else {
            target = layers.find(l => l.id === id);
            setSelectedLayerId(id);
        }
        
        if (!target) return;
        setDraggingId(id);

        if (handle) {
            // Resizing
            setResizeHandle(handle);
            setIsDragging(false);
            
            let w, h, s;
            if (id === 'bg') {
                w = background.width;
                h = background.height;
            } else if (target.type === 'image') {
                w = target.style.width;
            } else {
                s = target.style.fontSize;
            }

            setDragStart({ 
                mouseX: e.clientX, 
                mouseY: e.clientY, 
                initialWidth: w,
                initialHeight: h,
                initialSize: s // For text/image-width-only
            });
        } else {
            // Dragging (Offset based)
            setResizeHandle(null);
            setIsDragging(true);
            setDragStart({
                mouseX: e.clientX,
                mouseY: e.clientY,
                objX: target.x,
                objY: target.y
            });
        }
    };

    const handleMouseMove = (e) => {
        if (!draggingId || !canvasRef.current) return;

        const rect = canvasRef.current.getBoundingClientRect();
        const deltaX = e.clientX - dragStart.mouseX;
        // For drag position
        const deltaXPct = (deltaX / rect.width) * 100;
        const deltaYPct = ((e.clientY - dragStart.mouseY) / rect.height) * 100;

        if (resizeHandle) {
             // RESIZING
             const layer = (draggingId !== 'bg') ? layers.find(l => l.id === draggingId) : null;
             
             // Directional Logic (Center-Anchored)
             const isLeft = resizeHandle.includes('w') || resizeHandle === 'ml';
             const isRight = resizeHandle.includes('e') || resizeHandle === 'mr';
             const isTop = resizeHandle.includes('n') || resizeHandle === 'mt';
             const isBottom = resizeHandle.includes('s') || resizeHandle === 'mb';
             
             const wMult = isLeft ? -1 : (isRight ? 1 : 0);
             const hMult = isTop ? -1 : (isBottom ? 1 : 0);

             if (layer && layer.type === 'text') {
                 // Text Font Size (Use Width/X logic primarily)
                 const deltaChange = deltaX * wMult * 0.05; 
                 const newSize = Math.max(1, dragStart.initialSize + deltaChange);
                 updateLayer(draggingId, { style: { ...layer.style, fontSize: newSize } });
             } else if (draggingId === 'bg') {
                 // BG: Width AND Height
                 let newWidth = background.width;
                 let newHeight = background.height;
                 
                 if (wMult !== 0) {
                     const pxPercentW = (deltaX / rect.width) * 100 * wMult;
                     newWidth = Math.max(10, dragStart.initialWidth + pxPercentW);
                 }
                 if (hMult !== 0) {
                     const pxPercentH = ((e.clientY - dragStart.mouseY) / rect.height) * 100 * hMult;
                     newHeight = Math.max(10, dragStart.initialHeight + pxPercentH);
                 }
                 setBackground(prev => ({ ...prev, width: newWidth, height: newHeight }));

             } else {
                 // Image Layer (Width Only for now based on Width handle logic)
                 const pxPercent = (deltaX / rect.width) * 100 * wMult;
                 const newWidth = Math.max(5, dragStart.initialSize + pxPercent); // using initialWidth from simple setup or initialSize
                 // Note: handleMouseDown laid out 'initialSize' for image layers.
                 
                 updateLayer(draggingId, { style: { ...layer.style, width: newWidth } });
             }

        } else if (isDragging) {
             // DRAGGING (Offset)
             const newX = dragStart.objX + deltaXPct;
             const newY = dragStart.objY + deltaYPct;
             
             if (draggingId === 'bg') setBackground(prev => ({ ...prev, x: newX, y: newY }));
             else updateLayer(draggingId, { x: newX, y: newY });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
        setResizeHandle(null);
        setDraggingId(null);
    };

    // --- Presenting ---
    const handlePresent = () => {
        if (!window.electron || !window.electron.Presentation) return;

        const targetArr = [];
        if (targets.general) targetArr.push('general');
        if (targets.speaker) targetArr.push('speaker');
        if (targetArr.length === 0) return;

        window.electron.Presentation.setContent({
            type: 'custom_layers',
            data: { layers },
            target: targetArr
        });

        window.electron.Presentation.setStyle({
            backgroundImage: background.type === 'image' ? background.url : null,
            backgroundVideo: background.type === 'video' ? background.url : null,
            backgroundColor: '#000000',
            backgroundX: background.x,
            backgroundY: background.y,
            backgroundWidth: background.width,
            backgroundHeight: background.height,
            target: targetArr
        });
    };

    const toggleTarget = (key) => setTargets(prev => ({ ...prev, [key]: !prev[key] }));
    const selectedLayer = layers.find(l => l.id === selectedLayerId);

    

    return (
        <div 
            className="h-full w-full bg-[#0d0d0d] flex flex-col overflow-hidden text-light font-sans select-none"
            onMouseUp={handleMouseUp}
            onMouseMove={handleMouseMove}
        >
            {/* TOP SECTION: Preview & Media */}
            <div className="flex-1 flex min-h-0">
                
                {/* LEFT: PREVIEW AREA (Flex 2) */}
                <div className="flex-[2] bg-[#141414] m-2 rounded-2xl border border-white/5 flex flex-col relative overflow-hidden">
                    {/* Header: Controls */}
                    <div className="h-12 border-b border-white/5 flex items-center justify-between px-4 bg-[#1a1a1a]">
                         <span className="text-xs font-bold uppercase tracking-widest text-white/50 flex items-center gap-2">
                            <PiMonitorPlay size={16}/> Main Preview
                         </span>
                         
                         {/* Target Toggles */}
                         <div className="flex gap-2">
                             {['general', 'speaker'].map(t => (
                                <button 
                                    key={t} 
                                    onClick={() => toggleTarget(t)} 
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${targets[t] ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-white/5 text-white/30 border border-transparent hover:bg-white/10'}`}
                                >
                                    {targets[t] ? <PiCheckSquare size={14} /> : <PiSquare size={14} />} {t}
                                </button>
                             ))}
                         </div>
                    </div>

                    {/* Canvas Container */}
                    <div className="flex-1 relative flex items-center justify-center bg-black/50 p-2 overflow-hidden">
                        <div 
                            ref={canvasRef}
                            onMouseDown={(e) => handleMouseDown(e, 'bg')}
                            className="aspect-video w-full max-h-full bg-black rounded-lg overflow-hidden relative shadow-2xl border border-white/10"
                            style={{ containerType: 'size' }}
                        >
                            {/* Background */}
                            {background.url && (
                                 <div 
                                    className={`absolute group ${selectedLayerId === 'bg' ? 'z-0' : 'z-0'}`}
                                    style={{ 
                                        left: `${background.x}%`, 
                                        top: `${background.y}%`, 
                                        transform: 'translate(-50%, -50%)', 
                                        width: `${background.width}%`,
                                        height: `${background.height}%`
                                    }}
                                    onMouseDown={(e) => handleMouseDown(e, 'bg')}
                                 >
                                    {/* Selection Box for BG */}
                                    {selectedLayerId === 'bg' && (
                                        <>
                                            <div className="absolute -inset-0.5 border-2 border-yellow-500/50 border-dashed pointer-events-none z-50"></div>
                                            {/* 8 Handles: Corners + Mid-Sides */}
                                            {['nw', 'ne', 'sw', 'se', 'ml', 'mr', 'mt', 'mb'].map(h => {
                                                let posClass = '';
                                                let cursorClass = '';
                                                
                                                if (h === 'nw') { posClass = '-top-1.5 -left-1.5'; cursorClass = 'cursor-nwse-resize'; }
                                                if (h === 'ne') { posClass = '-top-1.5 -right-1.5'; cursorClass = 'cursor-nesw-resize'; }
                                                if (h === 'sw') { posClass = '-bottom-1.5 -left-1.5'; cursorClass = 'cursor-nesw-resize'; }
                                                if (h === 'se') { posClass = '-bottom-1.5 -right-1.5'; cursorClass = 'cursor-nwse-resize'; }
                                                if (h === 'ml') { posClass = 'top-1/2 -translate-y-1/2 -left-1.5'; cursorClass = 'cursor-ew-resize'; }
                                                if (h === 'mr') { posClass = 'top-1/2 -translate-y-1/2 -right-1.5'; cursorClass = 'cursor-ew-resize'; }
                                                if (h === 'mt') { posClass = 'left-1/2 -translate-x-1/2 -top-1.5'; cursorClass = 'cursor-ns-resize'; }
                                                if (h === 'mb') { posClass = 'left-1/2 -translate-x-1/2 -bottom-1.5'; cursorClass = 'cursor-ns-resize'; }

                                                return (
                                                    <div 
                                                        key={h}
                                                        onMouseDown={(e) => handleMouseDown(e, 'bg', h)}
                                                        className={`absolute w-3 h-3 bg-yellow-500 border border-white rounded-full z-50 shadow-sm ${posClass} ${cursorClass}`}
                                                    ></div>
                                                );
                                            })}
                                        </>
                                    )}

                                    {background.type === 'video' ? (
                                        <video src={background.url} className="w-full h-full object-fill shadow-2xl pointer-events-none" autoPlay loop muted />
                                    ) : (
                                        <img src={background.url} className="w-full h-full object-fill shadow-2xl pointer-events-none" alt="bg" />
                                    )}
                                 </div>
                            )}

                            {/* Layers */}
                            {layers.map(layer => (
                                <div
                                    key={layer.id}
                                    onMouseDown={(e) => handleMouseDown(e, layer.id)}
                                    className={`absolute cursor-move group ${selectedLayerId === layer.id ? 'z-50' : 'z-10'}`}
                                    style={{
                                        left: `${layer.x}%`,
                                        top: `${layer.y}%`,
                                        transform: 'translate(-50%, -50%)',
                                        width: layer.type === 'image' ? `${layer.style.width || 30}%` : 'auto'
                                    }}
                                >
                                {/* Selection Box (Nodes) */}
                                {selectedLayerId === layer.id && (
                                    <>
                                        <div className="absolute -inset-2 border-2 border-blue-500 border-dashed rounded-lg pointer-events-none z-0"></div>
                                        {/* 6 Handles */}
                                        {['nw', 'ne', 'sw', 'se', 'ml', 'mr'].map(h => {
                                            let posClass = '';
                                            let cursorClass = '';
                                            
                                            // Handle size slightly larger for touch/ease
                                            if (h === 'nw') { posClass = '-top-2 -left-2'; cursorClass = 'cursor-nwse-resize'; }
                                            if (h === 'ne') { posClass = '-top-2 -right-2'; cursorClass = 'cursor-nesw-resize'; }
                                            if (h === 'sw') { posClass = '-bottom-2 -left-2'; cursorClass = 'cursor-nesw-resize'; }
                                            if (h === 'se') { posClass = '-bottom-2 -right-2'; cursorClass = 'cursor-nwse-resize'; }
                                            if (h === 'ml') { posClass = 'top-1/2 -translate-y-1/2 -left-2'; cursorClass = 'cursor-ew-resize'; }
                                            if (h === 'mr') { posClass = 'top-1/2 -translate-y-1/2 -right-2'; cursorClass = 'cursor-ew-resize'; }

                                            return (
                                                <div 
                                                    key={h}
                                                    onMouseDown={(e) => handleMouseDown(e, layer.id, h)}
                                                    className={`absolute w-3 h-3 bg-blue-500 border border-white rounded-full z-50 shadow-sm ${posClass} ${cursorClass}`}
                                                ></div>
                                            );
                                        })}
                                    </>
                                )}
                                    
                                    {layer.type === 'text' ? (
                                        <p 
                                            className="whitespace-pre-wrap text-center px-2 py-1 relative z-10"
                                            style={{ 
                                                fontSize: `${layer.style.fontSize}cqw`, 
                                                lineHeight: layer.style.lineHeight || 1.2,
                                                color: layer.style.color,
                                                fontFamily: layer.style.fontFamily === 'serif' ? 'Georgia, serif' : (layer.style.fontFamily === 'mono' ? '"Courier New", monospace' : 'system-ui, sans-serif'),
                                                fontWeight: layer.style.fontWeight || 'normal',
                                                textTransform: layer.style.textTransform || 'none',
                                                textShadow: layer.style.shadow
                                                    ? `${layer.style.shadow.x||0}px ${layer.style.shadow.y||0}px ${layer.style.shadow.blur||10}px ${layer.style.shadow.color||'rgba(0,0,0,0.6)'}`
                                                    : 'none'
                                            }}
                                        >
                                            {layer.content}
                                        </p>
                                    ) : (
                                        <img 
                                            src={layer.content} 
                                            className="w-full h-auto rounded-lg relative z-10 pointer-events-none" 
                                            style={{
                                                boxShadow: layer.style.shadow
                                                    ? `${layer.style.shadow.x||0}px ${layer.style.shadow.y||0}px ${layer.style.shadow.blur||10}px ${layer.style.shadow.color||'rgba(0,0,0,0.6)'}`
                                                    : 'none'
                                            }}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Bottom Bar: Action */}
                    <div className="h-14 border-t border-white/5 flex items-center justify-between px-6 bg-[#1a1a1a]">
                        <div className="flex items-center gap-4">
                            <button onClick={clearBg} className="text-red-400/80 hover:text-red-400 text-xs flex items-center gap-2 transition-colors"><PiTrash/> Clear Slide</button>
                            <span className="text-xs text-white/30 border-l border-white/10 pl-4">{layers.length} Layers Active</span>
                        </div>
                        <button 
                            onClick={handlePresent}
                            className="bg-red hover:bg-red/90 text-white px-8 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg hover:shadow-red/20 active:scale-95"
                        >
                            <PiBroadcast size={16} /> Present Now
                        </button>
                    </div>
                </div>

                {/* RIGHT: TABS LIBRARY (Flex 1) */}
                <div className="flex-1 bg-[#141414] m-2 ml-0 rounded-2xl border border-white/5 flex flex-col overflow-hidden w-full max-w-sm">
                     {/* TAB HEADER */}
                     <div className="flex border-b border-white/5 bg-[#1a1a1a]">
                         {[ 
                             { id: 'media', icon: PiImage, label: 'Media' },
                             { id: 'text', icon: PiTextT, label: 'Text' },
                             { id: 'presentation', icon: PiFolder, label: 'Templates' },
                         ].map(tab => (
                             <button
                                 key={tab.id}
                                 onClick={() => { setActiveTab(tab.id); if (tab.id !== 'presentation') setSelectedPresentation(null); }}
                                 className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === tab.id ? 'bg-white/5 text-blue-400 border-b-2 border-blue-500' : 'text-white/40 hover:bg-white/5 hover:text-white/70'}`}
                             >
                                 <tab.icon size={16} /> {tab.label}
                             </button>
                         ))}
                     </div>
                     
                     {/* TAB CONTENT */}
                     <div className="flex-1 overflow-y-auto p-3 content-start">
                         
                         {/* MEDIA TAB */}
                         {activeTab === 'media' && (
                             <div className="flex flex-col gap-3">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-[10px] uppercase text-white/40 font-bold tracking-widest">Imported Assets</span>
                                    <button onClick={handleImport} className="text-blue-400 hover:text-blue-300 bg-blue-400/10 p-1.5 rounded transition-colors"><PiPlus size={14}/></button>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    {mediaFiles.map((fileUrl, index) => {
                                        const isVideo = fileUrl.endsWith('.mp4');
                                        return (
                                            <div 
                                                key={index} 
                                                className="aspect-square w-full h-[100px] bg-gray-800 rounded-xl relative overflow-hidden border border-white/5 hover:border-white/20 transition-all cursor-pointer"
                                                onContextMenu={(e) => handleContextMenu(e, fileUrl, isVideo)}
                                                onDoubleClick={() => addLayer(isVideo ? 'video' : 'image', fileUrl)}
                                            >
                                                {isVideo ? (
                                                    <video src={fileUrl} className="absolute inset-0 w-full h-full object-cover opacity-70 hover:opacity-100 transition-opacity" muted />
                                                ) : (
                                                    <img src={fileUrl} className="absolute inset-0 w-full h-full object-cover opacity-70 hover:opacity-100 transition-opacity" alt="thumb"/>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                             </div>
                         )}

                         {/* TEXT TAB */}
                         {activeTab === 'text' && (
                             <div className="flex flex-col gap-6">
                                 <button onClick={() => addLayer('text', 'New Text Element')} className="w-full flex items-center justify-center gap-2 text-xs font-bold uppercase bg-blue-500 hover:bg-blue-600 text-white p-3 rounded-xl transition-all shadow-lg active:scale-95">
                                     <PiTextT size={16}/> Add New Text
                                 </button>
                                 
                                 {selectedLayer && selectedLayer.type === 'text' ? (
                                     <div className="flex flex-col gap-4 border-t border-white/10 pt-4">
                                         {/* Edit Box */}
                                         <div className="flex flex-col gap-2">
                                             <label className="text-[10px] uppercase font-bold text-white/30 tracking-wider">Content</label>
                                             <textarea 
                                                 value={selectedLayer.content} 
                                                 onChange={e => updateLayer(selectedLayer.id, {content:e.target.value})} 
                                                 className="bg-black/40 text-sm p-3 rounded-lg border border-white/10 outline-none focus:border-blue-500 h-20 resize-none transition-all"
                                             />
                                         </div>

                                         <div className="grid grid-cols-2 gap-4">
                                            {/* Font Family */}
                                            <div className="flex flex-col gap-2">
                                                <label className="text-[10px] uppercase font-bold text-white/30 tracking-wider">Font Type</label>
                                                <select 
                                                    value={selectedLayer.style.fontFamily || 'sans-serif'} 
                                                    onChange={e => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, fontFamily: e.target.value }})}
                                                    className="bg-black/40 text-xs p-2 rounded border border-white/10 outline-none focus:border-blue-500 text-white/80"
                                                >
                                                    <option value="sans-serif">Sans Serif</option>
                                                    <option value="serif">Serif</option>
                                                    <option value="monospace">Monospace</option>
                                                    <option value="system-ui">System Default</option>
                                                </select>
                                            </div>
                                            {/* Font Weight */}
                                            <div className="flex flex-col gap-2">
                                                <label className="text-[10px] uppercase font-bold text-white/30 tracking-wider">Weight</label>
                                                <select 
                                                    value={selectedLayer.style.fontWeight || 'normal'} 
                                                    onChange={e => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, fontWeight: e.target.value }})}
                                                    className="bg-black/40 text-xs p-2 rounded border border-white/10 outline-none focus:border-blue-500 text-white/80"
                                                >
                                                    <option value="normal">Normal</option>
                                                    <option value="bold">Bold</option>
                                                    <option value="100">Thin</option>
                                                    <option value="900">Black</option>
                                                </select>
                                            </div>
                                            {/* Text Transform */}
                                            <div className="flex flex-col gap-2">
                                                <label className="text-[10px] uppercase font-bold text-white/30 tracking-wider">Casing</label>
                                                <select 
                                                    value={selectedLayer.style.textTransform || 'none'} 
                                                    onChange={e => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, textTransform: e.target.value }})}
                                                    className="bg-black/40 text-xs p-2 rounded border border-white/10 outline-none focus:border-blue-500 text-white/80"
                                                >
                                                    <option value="none">Normal</option>
                                                    <option value="uppercase">UPPERCASE</option>
                                                    <option value="lowercase">lowercase</option>
                                                    <option value="capitalize">Capitalize</option>
                                                </select>
                                            </div>
                                            {/* Line Height */}
                                            <div className="flex flex-col gap-2">
                                                <label className="text-[10px] uppercase font-bold text-white/30 tracking-wider">Line Height</label>
                                                <select 
                                                    value={selectedLayer.style.lineHeight || 1.2} 
                                                    onChange={e => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, lineHeight: parseFloat(e.target.value) }})}
                                                    className="bg-black/40 text-xs p-2 rounded border border-white/10 outline-none focus:border-blue-500 text-white/80"
                                                >
                                                    <option value={1}>Tight (1.0)</option>
                                                    <option value={1.2}>Normal (1.2)</option>
                                                    <option value={1.5}>Relaxed (1.5)</option>
                                                    <option value={2}>Double (2.0)</option>
                                                </select>
                                            </div>
                                         </div>
                                         
                                         {/* Color */}
                                         <div className="flex flex-col gap-2">
                                             <label className="text-[10px] uppercase font-bold text-white/30 tracking-wider">Color Preset</label>
                                             <div className="flex gap-2 flex-wrap">
                                                 {['#ffffff', '#000000', '#F53C11', '#0AEF76', '#3b82f6', '#F59E0B', '#ec4899', '#8b5cf6', '#14b8a6'].map(c => (
                                                     <button 
                                                         key={c} 
                                                         onClick={() => updateLayer(selectedLayer.id, {style:{...selectedLayer.style, color: c}})} 
                                                         className={`w-6 h-6 rounded-full border transition-transform hover:scale-110 shadow-sm ${selectedLayer.style.color === c ? 'border-white scale-110 ring-2 ring-white/20' : 'border-white/10'}`} 
                                                         style={{backgroundColor: c}} 
                                                     />
                                                 ))}
                                             </div>
                                         </div>

                                         <div className="h-px bg-white/5 my-2"></div>

                                         {/* Drop Shadow Controls */}
                                         <div className="flex flex-col gap-3">
                                            <div className="flex items-center justify-between">
                                                <label className="text-[10px] uppercase font-bold text-white/30 tracking-wider">Drop Shadow</label>
                                                <button 
                                                    onClick={() => updateLayer(selectedLayer.id, {style: { ...selectedLayer.style, shadow: selectedLayer.style.shadow ? null : { blur: 10, x: 0, y: 2, color: 'rgba(0,0,0,0.6)' } }})}
                                                    className={`text-[10px] px-2 py-0.5 rounded transition-colors ${selectedLayer.style.shadow ? 'bg-blue-500/20 text-blue-400' : 'bg-white/10 text-white/40 hover:bg-white/20'}`}
                                                >
                                                    {selectedLayer.style.shadow ? 'Enabled' : 'Disabled'}
                                                </button>
                                            </div>

                                            {selectedLayer.style.shadow && (
                                                <div className="grid grid-cols-2 gap-4 bg-black/20 p-3 rounded-lg border border-white/5">
                                                    <div className="flex flex-col gap-1">
                                                        <label className="text-[9px] uppercase text-white/40">Blur Radius ({selectedLayer.style.shadow.blur}px)</label>
                                                        <input 
                                                            type="range" min="0" max="50" 
                                                            value={selectedLayer.style.shadow.blur || 0}
                                                            onChange={e => updateLayer(selectedLayer.id, {style: { ...selectedLayer.style, shadow: { ...selectedLayer.style.shadow, blur: parseInt(e.target.value) } }})}
                                                            className="accent-blue-500"
                                                        />
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                        <label className="text-[9px] uppercase text-white/40">X Offset ({selectedLayer.style.shadow.x}px)</label>
                                                        <input 
                                                            type="range" min="-50" max="50" 
                                                            value={selectedLayer.style.shadow.x || 0}
                                                            onChange={e => updateLayer(selectedLayer.id, {style: { ...selectedLayer.style, shadow: { ...selectedLayer.style.shadow, x: parseInt(e.target.value) } }})}
                                                            className="accent-blue-500"
                                                        />
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                        <label className="text-[9px] uppercase text-white/40">Y Offset ({selectedLayer.style.shadow.y}px)</label>
                                                        <input 
                                                            type="range" min="-50" max="50" 
                                                            value={selectedLayer.style.shadow.y || 0}
                                                            onChange={e => updateLayer(selectedLayer.id, {style: { ...selectedLayer.style, shadow: { ...selectedLayer.style.shadow, y: parseInt(e.target.value) } }})}
                                                            className="accent-blue-500"
                                                        />
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                        <label className="text-[9px] uppercase text-white/40">Color</label>
                                                        <input 
                                                            type="color"
                                                            value={
                                                                // Convert rgba to hex if possible for color picker, or just handle basic hex strings.
                                                                // For simplicity since color picker requires hex, we'll store hex or intercept here.
                                                                selectedLayer.style.shadow.color && selectedLayer.style.shadow.color.startsWith('#') 
                                                                    ? selectedLayer.style.shadow.color 
                                                                    : '#000000'
                                                            }
                                                            onChange={e => updateLayer(selectedLayer.id, {style: { ...selectedLayer.style, shadow: { ...selectedLayer.style.shadow, color: e.target.value } }})}
                                                            className="w-full h-5 rounded cursor-pointer bg-transparent"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                         </div>
                                     </div>
                                 ) : (
                                     <div className="text-center text-white/20 text-xs mt-10">Select a text layer on the canvas to format it.</div>
                                 )}
                             </div>
                         )}

                         {/* PRESENTATION TAB */}
                         {activeTab === 'presentation' && (
                             <div className="flex flex-col gap-4">
                                {selectedPresentation ? (
                                    <>
                                        <div className="flex items-center gap-2 mb-2">
                                            <button onClick={() => setSelectedPresentation(null)} className="text-blue-400 hover:text-blue-300 text-xs font-bold uppercase p-1">← Back</button>
                                            <span className="text-xs font-bold text-white/60 truncate">{selectedPresentation.title}</span>
                                        </div>
                                        {selectedPresentation.pages.length === 0 ? (
                                            <div className="text-white/20 text-xs text-center mt-4">No slides detected in this file.</div>
                                        ) : (
                                            <div className="grid grid-cols-2 gap-3">
                                                {selectedPresentation.pages.map((pageUrl, pageIdx) => (
                                                    <div 
                                                        key={pageIdx} 
                                                        className="aspect-video bg-[#111] rounded-lg relative overflow-hidden border border-white/10 hover:border-blue-500 cursor-pointer transition-all group"
                                                        onContextMenu={(e) => { e.preventDefault(); setPageContextMenu({ visible: true, x: e.clientX, y: e.clientY, pageIndex: pageIdx }); }}
                                                        onClick={() => handlePresentPage(pageIdx)}
                                                    >
                                                        <img 
                                                            src={pageUrl} 
                                                            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" 
                                                            alt={`Slide ${pageIdx + 1}`}
                                                        />
                                                        <div className="absolute bottom-1 right-1 bg-black/60 px-1.5 py-0.5 rounded text-[8px] font-mono text-white/80">
                                                            {pageIdx + 1}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-[10px] uppercase text-white/40 font-bold tracking-widest">Available Presentations</span>
                                            <button onClick={handleImportPresentation} className="text-blue-400 hover:text-blue-300 bg-blue-400/10 p-1.5 rounded transition-colors"><PiPlus size={14}/></button>
                                        </div>
                                        {presentations.map(p => (
                                            <div 
                                                key={p.id}
                                                onClick={() => setSelectedPresentation(p)}
                                                onContextMenu={(e) => { e.preventDefault(); setPresContextMenu({ visible: true, x: e.clientX, y: e.clientY, presentation: p }); }}
                                                className="p-4 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl cursor-pointer transition-colors flex items-center gap-3"
                                            >
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

                     </div>
                </div>
            </div>

            {/* BOTTOM SECTION: Properties & Timeline */}
            <div className="h-56 bg-[#141414] m-2 mt-0 rounded-2xl border border-white/5 flex flex-col">
                <div className="h-10 border-b border-white/5 flex items-center justify-between px-4 bg-[#1a1a1a]">
                     <span className="text-xs font-bold uppercase tracking-widest text-white/50 flex items-center gap-2">
                         <PiSliders size={16}/> Layer Properties
                     </span>
                     <button onClick={() => addLayer('text', 'New Text')} className="flex items-center gap-2 text-[10px] font-bold uppercase bg-purple-500/20 text-purple-300 px-3 py-1.5 rounded-lg hover:bg-purple-500/30 border border-purple-500/20 transition-all">
                         <PiTextT size={14}/> Add Text
                     </button>
                </div>
                
                <div className="flex-1 flex overflow-hidden">
                     {/* Layer List (Left Sidebar of Bottom) */}
                     <div className="w-64 border-r border-white/5 flex flex-col overflow-y-auto p-2 gap-1 bg-black/20">
                         {layers.map(l => (
                             <div 
                                key={l.id} 
                                onClick={() => setSelectedLayerId(l.id)} 
                                className={`p-3 rounded-xl cursor-pointer flex items-center justify-between text-xs transition-all border ${selectedLayerId === l.id ? 'bg-blue-600/20 border-blue-500/50 text-white' : 'bg-white/5 border-transparent text-white/50 hover:bg-white/10'}`}
                             >
                                 <div className="flex items-center gap-3">
                                     {l.type === 'text' ? <PiTextAa size={16} /> : <PiImage size={16} />} 
                                     <span className="font-bold">{l.content.length > 15 ? l.content.substring(0, 15) + '...' : (l.type === 'text' ? l.content : 'Image Layer')}</span>
                                 </div>
                                 <button onClick={(e) => { e.stopPropagation(); deleteLayer(l.id); }} className="text-white/30 hover:text-red-400 p-1"><PiTrash size={14}/></button>
                             </div>
                         ))}
                     </div>

                     {/* Property Controls (Right) */}
                     <div className="flex-1 flex p-6 gap-10 items-start overflow-x-auto">
                         {selectedLayer ? (
                             <>

                                <div className="flex flex-col gap-6 w-64 shrink-0">
                                    <div className="flex flex-col gap-2">
                                        <div className="flex justify-between">
                                            <label className="text-[10px] uppercase font-bold text-white/30 tracking-wider font-mono">Size / Scale</label>
                                            <span className="text-[10px] font-bold text-blue-400">{selectedLayer.type === 'text' ? selectedLayer.style.fontSize : selectedLayer.style.width}</span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="1" max={selectedLayer.type === 'text' ? 20 : 100} 
                                            step={selectedLayer.type === 'text' ? 0.1 : 1}
                                            value={selectedLayer.type === 'text' ? selectedLayer.style.fontSize : selectedLayer.style.width} 
                                            onChange={(e) => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, ...(selectedLayer.type === 'text' ? {fontSize: Number(e.target.value)} : {width: Number(e.target.value)} ) } })} 
                                            className="w-full accent-blue-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer" 
                                        />
                                    </div>


                                </div>
                             </>
                         ) : (
                             <div className="w-full h-full flex flex-col items-center justify-center text-white/20 gap-4">
                                 <PiShapes size={40} className="opacity-50"/>
                                 <p className="text-sm font-medium">Select a layer to edit properties</p>
                             </div>
                         )}
                     </div>
                </div>
            </div>
            {/* Context Menu */}
            {contextMenu.visible && (
                <div 
                    className="fixed z-[100] bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl py-1 flex flex-col min-w-[160px] text-xs font-medium"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                    <button 
                        className="px-4 py-2 text-left text-white/80 hover:bg-blue-600/20 hover:text-blue-400 transition-colors"
                        onClick={() => { setBg(contextMenu.fileUrl); closeContextMenu(); }}
                    >
                        Set Background
                    </button>
                    <button 
                        className="px-4 py-2 text-left text-white/80 hover:bg-white/10 transition-colors"
                        onClick={() => { addLayer(contextMenu.isVideo ? 'video' : 'image', contextMenu.fileUrl); closeContextMenu(); }}
                    >
                        Add Layer
                    </button>
                    <div className="h-px bg-white/10 my-1"></div>
                    <button 
                        className="px-4 py-2 text-left text-white/80 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                        onClick={() => handleRemoveMedia(contextMenu.fileUrl)}
                    >
                        Remove
                    </button>
                </div>
            )}
            {/* Presentation Context Menu */}
            {presContextMenu.visible && (
                <div 
                    className="fixed z-[101] bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl py-1 flex flex-col min-w-[150px] text-xs font-medium"
                    style={{ left: presContextMenu.x, top: presContextMenu.y }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button 
                        className="px-4 py-2 text-left text-white/80 hover:bg-blue-600/20 hover:text-blue-400 transition-colors"
                        onClick={() => handleShowPresentation(presContextMenu.presentation)}
                    >
                        Show Slides
                    </button>
                    <div className="h-px bg-white/10 my-1"></div>
                    <button 
                        className="px-4 py-2 text-left text-white/80 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                        onClick={() => handleDeletePresentation(presContextMenu.presentation)}
                    >
                        Delete
                    </button>
                </div>
            )}
            {/* Page Context Menu */}
            {pageContextMenu.visible && (
                <div 
                    className="fixed z-[101] bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl py-1 flex flex-col min-w-[150px] text-xs font-medium"
                    style={{ left: pageContextMenu.x, top: pageContextMenu.y }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button 
                        className="px-4 py-2 text-left text-white/80 hover:bg-blue-600/20 hover:text-blue-400 transition-colors"
                        onClick={() => handlePresentPage(pageContextMenu.pageIndex)}
                    >
                        Show
                    </button>
                </div>
            )}
        </div>
    );
}
