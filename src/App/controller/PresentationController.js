import React, { useState, useEffect, useRef } from "react";
import {
    PiFolder, PiImage, PiVideoCamera, PiShapes, PiTextT,
    PiPlay, PiPause, PiTrash, PiSliders, PiTextAa, PiBroadcast, 
    PiCheckSquare, PiSquare, PiPlus, PiMonitorPlay
} from "react-icons/pi";

export default function PresentationController() {
    const [mediaFiles, setMediaFiles] = useState([]);
    
    // Slide State
    const [background, setBackground] = useState({ url: null, type: 'image' }); 
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
        setBackground({ url, type: isVideo ? 'video' : 'image' });
    };

    const clearBg = () => setBackground({ url: null, type: 'image' });

    // --- Interaction Logic ---
    const handleMouseDown = (e, id, handle = null) => {
        e.stopPropagation();
        const layer = layers.find(l => l.id === id);
        setSelectedLayerId(id);
        setDraggingId(id);

        if (handle) {
            // Resizing
            setResizeHandle(handle);
            setIsDragging(false);
            setDragStart({ 
                x: e.clientX, 
                y: e.clientY, 
                initialSize: layer.type === 'text' ? layer.style.fontSize : layer.style.width 
            });
        } else {
            // Dragging
            setResizeHandle(null);
            setIsDragging(true);
             // Logic to offset from center if needed, but simple overwrite is fine for now
        }
    };

    const handleMouseMove = (e) => {
        if (!draggingId || !canvasRef.current) return;

        if (resizeHandle) {
             // RESIZING
             const layer = layers.find(l => l.id === draggingId);
             const deltaX = e.clientX - dragStart.x;
             const deltaY = e.clientY - dragStart.y; // Optional: use diagonal logic

             if (layer.type === 'text') {
                 // Text: Scale font based on X movement
                 // Sensitivity: 1px = 0.1vw roughly
                 const newSize = Math.max(1, dragStart.initialSize + (deltaX * 0.05));
                 updateLayer(draggingId, { style: { ...layer.style, fontSize: newSize } });
             } else {
                 // Image: Scale width %
                 // Calc % of container width
                 const rect = canvasRef.current.getBoundingClientRect();
                 const pxPercent = (deltaX / rect.width) * 100;
                 const newWidth = Math.max(5, dragStart.initialSize + pxPercent);
                 updateLayer(draggingId, { style: { ...layer.style, width: newWidth } });
             }

        } else if (isDragging) {
             // DRAGGING
             const rect = canvasRef.current.getBoundingClientRect();
             const x = ((e.clientX - rect.left) / rect.width) * 100;
             const y = ((e.clientY - rect.top) / rect.height) * 100;
             
             updateLayer(draggingId, { x, y });
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
            target: targetArr
        });
    };

    const toggleTarget = (key) => setTargets(prev => ({ ...prev, [key]: !prev[key] }));
    const selectedLayer = layers.find(l => l.id === selectedLayerId);

    return (
        <div 
            className="h-full w-full bg-[#0d0d0d] p-4 flex flex-col gap-4 text-light font-sans overflow-hidden"
            onMouseUp={handleMouseUp}
            onMouseMove={handleMouseMove}
        >
            {/* Top Workspace */}
            <div className="flex-1 flex gap-4 min-h-0">
                
                {/* 1. Left Sidebar: Media */}
                <div className="w-80 bg-[#141414] rounded-3xl p-5 flex flex-col gap-4 border border-white/5">
                    <button 
                        onClick={handleImport}
                        className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-3 rounded-xl border border-white/5 transition-all w-full justify-center text-sm font-bold"
                    >
                        <PiFolder size={18} /> Import Media
                    </button>

                    <div className="flex-1 grid grid-cols-2 gap-3 overflow-y-auto content-start pr-1">
                        {mediaFiles.map((fileUrl, index) => {
                            const fileName = fileUrl.split('/').pop();
                            const isVideo = fileUrl.endsWith('.mp4');
                            return (
                                <div key={index} className="aspect-square bg-gray-800 rounded-2xl relative group overflow-hidden border border-white/5 hover:border-white/20">
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
                    
                    <button 
                        onClick={() => addLayer('text', 'New Text')}
                        className="flex items-center gap-2 bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 px-4 py-3 rounded-xl border border-purple-500/20 transition-all w-full justify-center text-sm font-bold"
                    >
                        <PiTextT size={18} /> Add Text Layer
                    </button>
                </div>

                {/* 2. Center: Canvas */}
                <div className="flex-1 bg-[#141414] rounded-3xl p-6 relative flex flex-col border border-white/5 select-none">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-white/40">Preview</h3>
                        <button onClick={clearBg} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"><PiTrash /> Clear BG</button>
                    </div>

                    <div 
                        ref={canvasRef}
                        className="flex-1 min-h-[300px] bg-black/40 rounded-2xl overflow-hidden relative shadow-2xl border border-white/5"
                    >
                        {/* Background */}
                        {background.url && (
                            background.type === 'video' ? 
                            <video src={background.url} className="absolute inset-0 w-full h-full object-cover opacity-80 pointer-events-none" autoPlay loop muted /> :
                            <img src={background.url} className="absolute inset-0 w-full h-full object-cover opacity-80 pointer-events-none" alt="bg" />
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
                                        {/* Resize Handles */}
                                        {/* Bottom Right */}
                                        <div 
                                            onMouseDown={(e) => handleMouseDown(e, layer.id, 'se')}
                                            className="absolute -bottom-3 -right-3 w-4 h-4 bg-blue-500 border-2 border-white rounded-full cursor-nwse-resize z-50 shadow-sm"
                                        ></div>
                                    </>
                                )}
                                
                                {layer.type === 'text' ? (
                                    <p 
                                        className="font-bold leading-tight whitespace-pre-wrap text-center px-2 py-1 relative z-10"
                                        style={{ 
                                            fontSize: `${Math.max(10, layer.style.fontSize * 5)}px`, // Preview Scale estimation. View uses vw.
                                            // 5vw roughly = 50-80px? Let's use *5 for pixel approximation in this container
                                            // Wait, View uses 'vw'. To mimic that here, we should perhaps use % of container width or just px if we store font size as 'scale' unit.
                                            // Storing 'fontSize' as a generic scaler (e.g. 5.0).
                                            // In Preview, 5.0 -> 25px? 
                                            
                                            // Better: Use container query or rem. 
                                            // Let's rely on 'fontSize' being passed as rem or similar.
                                            // If view uses 'vw', then in Preview which is small, 'vw' (viewport width) is huge relative to container.
                                            // We need to scale it down.
                                            // If preview is 1/3 screen approx.
                                            fontSize: `${layer.style.fontSize * 0.4}vw`, // Scale down for preview
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

                {/* 3. Right: Properties */}
                <div className="w-80 bg-[#141414] rounded-3xl p-6 flex flex-col gap-6 border border-white/5">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-white/90">Properties</h3>
                    </div>

                    {selectedLayer ? (
                        <>
                            <div className="bg-black/20 p-4 rounded-2xl gap-3 flex flex-col">
                                <div className="flex justify-between items-center text-xs font-bold text-white/40">
                                    <span>Layer: {selectedLayer.type}</span>
                                    <button onClick={() => deleteLayer(selectedLayer.id)} className="text-red-400 hover:text-white"><PiTrash size={16}/></button>
                                </div>
                            </div>

                            {selectedLayer.type === 'text' && (
                                <div className="bg-black/20 p-4 rounded-2xl gap-3 flex flex-col">
                                    <label className="text-xs font-bold text-white/40">Content</label>
                                    <textarea
                                        value={selectedLayer.content}
                                        onChange={(e) => updateLayer(selectedLayer.id, { content: e.target.value })}
                                        className="bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-blue-500/50 resize-none"
                                        rows={4}
                                    />
                                    
                                    <label className="text-xs font-bold text-white/40 mt-2">Scale</label>
                                    <input 
                                        type="range" 
                                        min="1" max="20" step="0.1"
                                        value={selectedLayer.style.fontSize} 
                                        onChange={(e) => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, fontSize: Number(e.target.value) } })}
                                        className="w-full accent-blue-500"
                                    />
                                    
                                    <label className="text-xs font-bold text-white/40 mt-2">Color</label>
                                    <div className="flex gap-2 flex-wrap">
                                        {['#ffffff', '#000000', '#F53C11', '#0AEF76', '#3b82f6', '#eab308'].map(c => (
                                            <button 
                                                key={c}
                                                onClick={() => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, color: c } })}
                                                className={`w-6 h-6 rounded-full border ${selectedLayer.style.color === c ? 'border-white scale-110' : 'border-white/10'}`}
                                                style={{ backgroundColor: c }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {selectedLayer.type === 'image' && (
                                <div className="bg-black/20 p-4 rounded-2xl gap-3 flex flex-col">
                                    <label className="text-xs font-bold text-white/40">Width (%)</label>
                                    <input 
                                        type="range" 
                                        min="10" max="100" 
                                        value={selectedLayer.style.width} 
                                        onChange={(e) => updateLayer(selectedLayer.id, { style: { ...selectedLayer.style, width: Number(e.target.value) } })}
                                        className="w-full accent-blue-500"
                                    />
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-white/20 text-sm">
                            Select a layer to edit
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom: Present */}
            <div className="h-24 bg-[#141414] rounded-3xl p-6 flex items-center justify-between border border-white/5 shrink-0">
                <div className="flex items-center gap-4 text-xs font-bold text-white/40">
                    <span className="bg-white/5 px-3 py-1 rounded-full">{layers.length} Layers</span>
                    <span>{background.url ? 'BG Active' : 'No BG'}</span>
                </div>

                <div className="flex items-center gap-6">
                     <div className="flex gap-4 p-2 bg-black/20 rounded-xl">
                        {['general', 'speaker'].map(t => (
                            <button 
                                key={t}
                                onClick={() => toggleTarget(t)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${targets[t] ? 'bg-green-500/20 text-green-400' : 'text-white/40'}`}
                            >
                                {targets[t] ? <PiCheckSquare size={16}/> : <PiSquare size={16}/>} {t}
                            </button>
                        ))}
                    </div>

                    <button 
                        onClick={handlePresent}
                        className="flex items-center gap-3 bg-red hover:bg-red/90 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg hover:shadow-red/20 active:scale-95 uppercase tracking-wide"
                    >
                        <PiBroadcast size={20} />
                        Present
                    </button>
                </div>
            </div>
        </div>
    );
}
