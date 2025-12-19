import React, { useState, useEffect } from "react";
import { PiTextT, PiPaintBucket, PiGear } from "react-icons/pi";

export default function SettingsController() {
    const [styles, setStyles] = useState({
        bgType: "color", // 'color' | 'image' | 'video'
        backgroundColor: "#000000",
        textColor: "#ffffff",
        fontFamily: "Inter",
        fontSize: "5rem",
        textAlign: "center",
        backgroundImage: null,
        backgroundVideo: null
    });

    const [mediaFiles, setMediaFiles] = useState([]);

    useEffect(() => {
        const loadMedia = async () => {
            const files = await electron.Media.list();
            if (files) setMediaFiles(files);
        };
        loadMedia();
    }, []);

    const updateStyle = (key, value) => {
        const newStyles = { ...styles, [key]: value };
        setStyles(newStyles);
        electron.Presentation.setStyle(newStyles);
    };

    return (
        <div className="flex flex-col gap-6 p-4 text-light h-full overflow-y-auto">
            {/* Header */}
            <h2 className="text-xl font-bold text-ash uppercase tracking-widest flex items-center gap-2">
                <PiGear className="mb-1" /> Settings
            </h2>

            {/* Style Controls */}
            <div className="grid grid-cols-2 gap-4">
                {/* Background Color */}
                <div className="bg-ash/10 p-4 rounded-xl flex flex-col gap-2">
                    <label className="text-xs font-bold text-ash flex items-center gap-2">
                        <PiPaintBucket /> Background Color
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            type="color"
                            value={styles.backgroundColor}
                            onChange={(e) => updateStyle("backgroundColor", e.target.value)}
                            className="w-8 h-8 rounded cursor-pointer bg-transparent border-none"
                        />
                        <span className="text-xs font-mono">{styles.backgroundColor}</span>
                    </div>
                </div>

                {/* Text Color */}
                <div className="bg-ash/10 p-4 rounded-xl flex flex-col gap-2">
                    <label className="text-xs font-bold text-ash flex items-center gap-2">
                        <PiTextT /> Text Color
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            type="color"
                            value={styles.textColor}
                            onChange={(e) => updateStyle("textColor", e.target.value)}
                            className="w-8 h-8 rounded cursor-pointer bg-transparent border-none"
                        />
                        <span className="text-xs font-mono">{styles.textColor}</span>
                    </div>
                </div>
            </div>

            {/* Media & Font Settings */}
            <div className="space-y-4">
                {/* Local Media Library */}
                <div className="bg-ash/10 p-4 rounded-xl flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-ash">Media Library</label>
                        <button
                            onClick={async () => {
                                const newFile = await electron.Media.import();
                                if (newFile) {
                                    setMediaFiles(prev => [...prev, newFile]);
                                }
                            }}
                            className="text-[10px] bg-blue-600 px-3 py-1 text-white rounded-full font-bold hover:bg-blue-500 transition-colors"
                        >
                            + Import Media
                        </button>
                    </div>

                    {/* Local Library Grid */}
                    <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto pr-1">
                        {mediaFiles.map((url, i) => {
                            const isVideo = url.toLowerCase().endsWith('.mp4') || url.toLowerCase().endsWith('.webm');
                            return (
                                <div key={i} className="relative group aspect-video rounded-md overflow-hidden border border-white/10 hover:border-blue-500 transition-all">
                                    <button
                                        onClick={() => {
                                            const newStyles = {
                                                ...styles,
                                                backgroundImage: isVideo ? null : url,
                                                backgroundVideo: isVideo ? url : null
                                            };
                                            setStyles(newStyles);
                                            electron.Presentation.setStyle(newStyles);
                                        }}
                                        className="w-full h-full"
                                    >
                                        {isVideo ? (
                                            <video src={url} className="w-full h-full object-cover" />
                                        ) : (
                                            <img src={url} className="w-full h-full object-cover" alt="local" />
                                        )}
                                    </button>

                                    {/* Delete Button */}
                                    <button
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            const success = await electron.Media.delete(url);
                                            if (success) {
                                                setMediaFiles(prev => prev.filter(f => f !== url));
                                            }
                                        }}
                                        className="absolute top-1 right-1 bg-red-600 text-white w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-red-700 font-bold leading-none text-xs pb-0.5"
                                        title="Delete"
                                    >
                                        ×
                                    </button>

                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 pointer-events-none flex items-center justify-center transition-opacity">
                                        <span className="text-[10px] text-white font-bold">USE</span>
                                    </div>
                                </div>
                            );
                        })}
                        {mediaFiles.length === 0 && (
                            <div className="col-span-4 text-center py-4 text-ash text-xs italic opacity-50">
                                No local media. Import to save.
                            </div>
                        )}
                    </div>

                    <div className="w-full h-[1px] bg-white/5 my-2" />

                    <label className="text-xs font-bold text-ash">Web Samples</label>
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=500&auto=format&fit=crop",
                            "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?q=80&w=500&auto=format&fit=crop",
                            "https://images.unsplash.com/photo-1519681393798-38e43269d496?q=80&w=500&auto=format&fit=crop",
                            "https://images.unsplash.com/photo-1438232992991-995b7058bbb3?q=80&w=500&auto=format&fit=crop"
                        ].map((url, i) => (
                            <button
                                key={i}
                                onClick={() => {
                                    const newStyles = {
                                        ...styles,
                                        backgroundImage: url,
                                        backgroundVideo: null
                                    };
                                    setStyles(newStyles);
                                    electron.Presentation.setStyle(newStyles);
                                }}
                                className="aspect-video w-full rounded-md overflow-hidden border border-white/10 hover:border-blue-500 transition-all relative group"
                            >
                                <img src={url} className="w-full h-full object-cover" alt="sample" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <span className="text-[10px] text-white font-bold">USE</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Font Family */}
                <div className="bg-ash/10 p-4 rounded-xl flex flex-col gap-2">
                    <label className="text-xs font-bold text-ash">Font Family</label>
                    <select
                        value={styles.fontFamily}
                        onChange={(e) => updateStyle('fontFamily', e.target.value)}
                        className="bg-primary text-light p-2 rounded text-sm border border-white/10 outline-none"
                    >
                        <option value="Inter">Inter (Default)</option>
                        <option value="Times New Roman">Times New Roman</option>
                        <option value="Courier New">Courier New</option>
                        <option value="Arial">Arial</option>
                        <option value="Georgia">Georgia</option>
                    </select>
                </div>
            </div>
        </div>
    );
}
