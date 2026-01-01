import React, { useState, useEffect, useRef } from "react";
import {
    PiFolder, PiImage, PiVideoCamera, PiShapes, PiTextT,
    PiPlay, PiPause, PiTrash, PiSliders, PiTextAa, PiBroadcast, 
    PiCheckSquare, PiSquare, PiPlus, PiMonitorPlay
} from "react-icons/pi";

export default function PresentationController() {
    const [mediaFiles, setMediaFiles] = useState([]);
    
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
    
    const canvasRef = useRef(null);

    // Initial Load
    useEffect(() => {
        refreshMedia();
    }, []);

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

    // --- Layer Management ---
    const addLayer = (type, content) => {
        const newId = `${type}-${Date.now()}`;
        const newLayer = {
            id: newId,
            type,
            content, 
            x: 50, // % Center
            y: 50,
            style: type === 'text' ? { fontSize: 5, color: '#ffffff' } : { width: 30 }
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
                    <div className="flex-1 relative flex items-center justify-center bg-black/50 p-6 overflow-hidden">
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
                                                    className={`absolute w-3.5 h-3.5 bg-blue-500 border border-white rounded-full z-50 shadow-sm ${posClass} ${cursorClass}`}
                                                ></div>
                                            );
                                        })}
                                    </>
                                )}
                                    
                                    {layer.type === 'text' ? (
                                        <p 
                                            className="font-bold whitespace-pre-wrap text-center px-2 py-1 relative z-10"
                                            style={{ 
                                                fontSize: `${layer.style.fontSize}cqw`, 
                                                lineHeight: 1.2,
                                                color: layer.style.color,
                                                textShadow: '0 2px 10px rgba(0,0,0,0.5)'
                                            }}
                                        >
                                            {layer.content}
                                        </p>
                                    ) : (
                                        <img src={layer.content} className="w-full h-auto rounded-lg shadow-xl relative z-10 pointer-events-none" />
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

                {/* RIGHT: MEDIA LIBRARY (Flex 1) */}
                <div className="flex-1 bg-[#141414] m-2 ml-0 rounded-2xl border border-white/5 flex flex-col overflow-hidden w-full max-w-sm">
                     <div className="h-12 border-b border-white/5 flex items-center justify-between px-4 bg-[#1a1a1a]">
                         <span className="text-xs font-bold uppercase tracking-widest text-white/50 flex items-center gap-2">
                             <PiFolder size={16}/> Media Library
                         </span>
                         <button onClick={handleImport} className="text-blue-400 hover:text-blue-300 bg-blue-400/10 p-2 rounded-lg transition-colors"><PiPlus size={16}/></button>
                     </div>
                     
                     <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-3 content-start">
                         {mediaFiles.map((fileUrl, index) => {
                                const isVideo = fileUrl.endsWith('.mp4');
                                return (
                                    <div key={index} className="aspect-square bg-gray-800 rounded-xl relative group overflow-hidden border border-white/5 hover:border-white/20 transition-all">
                                         {isVideo ? (
                                            <video src={fileUrl} className="absolute inset-0 w-full h-full object-cover opacity-60" muted />
                                         ) : (
                                            <img src={fileUrl} className="absolute inset-0 w-full h-full object-cover opacity-60" alt="thumb"/>
                                         )}
                                         
                                         <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center gap-2 p-2">
                                             <button 
                                                onClick={() => setBg(fileUrl)}
                                                className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-[10px] font-bold uppercase tracking-wide"
                                             >
                                                Set BG
                                             </button>
                                             <button 
                                                onClick={() => addLayer(isVideo ? 'video' : 'image', fileUrl)}
                                                className="w-full py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-[10px] font-bold uppercase tracking-wide"
                                             >
                                                Add Layer
                                             </button>
                                         </div>
                                    </div>
                                );
                            })}
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
                                {selectedLayer.type === 'text' && (
                                    <div className="flex flex-col gap-3 w-80 shrink-0">
                                        <label className="text-[10px] uppercase font-bold text-white/30 tracking-wider">Content</label>
                                        <textarea 
                                            value={selectedLayer.content} 
                                            onChange={e => updateLayer(selectedLayer.id, {content:e.target.value})} 
                                            className="bg-black/40 text-sm p-4 rounded-xl border border-white/10 outline-none focus:border-blue-500 h-24 resize-none leading-relaxed transition-all"
                                            placeholder="Enter text here..."
                                        />
                                    </div>
                                )}
                                
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

                                    {selectedLayer.type === 'text' && (
                                        <div className="flex flex-col gap-2">
                                            <label className="text-[10px] uppercase font-bold text-white/30 tracking-wider font-mono">Color</label>
                                            <div className="flex gap-3">
                                                {['#ffffff', '#000000', '#F53C11', '#0AEF76', '#3b82f6', '#F59E0B'].map(c => (
                                                    <button 
                                                        key={c} 
                                                        onClick={() => updateLayer(selectedLayer.id, {style:{...selectedLayer.style, color: c}})} 
                                                        className={`w-8 h-8 rounded-full border transition-transform hover:scale-110 shadow-sm ${selectedLayer.style.color === c ? 'border-white scale-110 shadow-lg ring-2 ring-white/20' : 'border-white/10'}`} 
                                                        style={{backgroundColor: c}} 
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}
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
        </div>
    );
}
