import React, { useState } from "react";
import { PiSparkle, PiImage, PiTextT, PiPaintBrush, PiUploadSimple, PiCheckCircle, PiGear } from "react-icons/pi";

export default function DesignLabController() {
    const [poster, setPoster] = useState(null);
    const [analysis, setAnalysis] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedAsset, setGeneratedAsset] = useState(null);

    const handleUpload = async () => {
        const file = await electron.Media.import();
        if (file) {
            setPoster(file);
            analyzePoster(file);
        }
    };

    const analyzePoster = async (imagePath) => {
        setIsAnalyzing(true);
        setAnalysis(null);
        try {
            const result = await electron.Design.analyzePoster(imagePath);
            if (result.error) {
                console.error("Design Lab Error:", result.error, result.details);
                alert(`AI Analysis failed: ${result.error}\n\nDetails: ${result.details || 'No details available'}`);
            } else {
                setAnalysis(result);
            }
        } finally {
            setIsAnalyzing(false);
        }
    };

    const generateAsset = async (suggestion) => {
        // Since the local engine generates all variants at once, 
        // we don't need a separate generation step for now.
        // But we'll keep the UI state for feedback.
        setIsGenerating(true);
        setTimeout(() => {
            setIsGenerating(false);
            alert("Asset optimized for presentation!");
        }, 1000);
    };

    const handleApplyAsset = (path, type) => {
        const fileUrl = `file://${path}`;
        if (type === 'background') {
            electron.Presentation.setStyle({
                backgroundImage: fileUrl,
                backgroundColor: '#000000',
                backgroundVideo: null,
                target: ['general']
            });
        } else {
            // Apply lower third as a style overlay
            electron.Presentation.setStyle({
                lowerThirdImage: fileUrl,
                target: ['general']
            });
            console.log(`Applying lower third: ${fileUrl}`);
        }
    };

    return (
        <div className="flex flex-col gap-6 p-6 text-light h-full overflow-y-auto bg-primary/20">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-bold text-ash uppercase tracking-widest flex items-center gap-2">
                        <PiSparkle className="text-blue-400" /> AI Design Lab
                    </h2>
                    {poster && (
                        <button 
                            onClick={() => electron.Presentation.setStyle({ backgroundImage: null, lowerThirdImage: null, target: ['general'] })}
                            className="bg-red/10 text-red-400 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider hover:bg-red/20 transition-all border border-red-500/20"
                        >
                            Clear Screen
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-ash bg-white/5 px-3 py-1 rounded-full border border-white/10">
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                    Local AI Design Engine Active
                </div>
            </div>

            {!poster ? (
                <div 
                    onClick={handleUpload}
                    className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-2xl hover:border-blue-500/50 hover:bg-blue-500/5 cursor-pointer transition-all p-12 group"
                >
                    <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <PiUploadSimple size={40} className="text-blue-400" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2">Upload Event Poster</h3>
                    <p className="text-ash text-sm text-center max-w-xs">
                        Drag and drop your poster here, or click to browse. We'll analyze it to create matching graphics.
                    </p>
                </div>
            ) : (
                <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* Analysis Summary */}
                    <div className="grid grid-cols-3 gap-6">
                        <div className="col-span-1">
                            <label className="text-xs font-bold text-ash mb-2 block uppercase tracking-tighter">Original Poster</label>
                            <div className="aspect-[3/4] bg-black rounded-xl overflow-hidden border border-white/10 shadow-2xl">
                                <img src={poster} className="w-full h-full object-contain" alt="Poster" />
                            </div>
                            <button 
                                onClick={handleUpload}
                                className="w-full mt-4 py-2 text-xs font-bold text-ash hover:text-white transition-colors"
                            >
                                Change Image
                            </button>
                        </div>

                        <div className="col-span-2 flex flex-col gap-4">
                            <label className="text-xs font-bold text-ash mb-1 block uppercase tracking-tighter">AI Perception</label>
                            {isAnalyzing ? (
                                <div className="flex-1 bg-ash/5 rounded-xl border border-white/5 flex flex-col items-center justify-center gap-4 p-8">
                                    <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                                    <p className="text-sm text-ash animate-pulse italic">Reading poster details & theme...</p>
                                </div>
                            ) : analysis ? (
                                <div className="flex-1 bg-ash/5 rounded-xl border border-white/5 p-6 space-y-6">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] text-ash font-bold uppercase tracking-widest">Detected Event</label>
                                        <h3 className="text-2xl font-black text-white leading-tight uppercase tracking-tighter">
                                            {analysis.event_name || "Ambient Design"}
                                        </h3>
                                        <div className="flex flex-wrap items-center gap-2 mt-1">
                                            {Array.isArray(analysis.dates_found) && analysis.dates_found.length > 0 ? (
                                                analysis.dates_found.map((date, i) => (
                                                    <span key={i} className="text-xs text-blue-400 font-medium bg-blue-500/10 px-2 py-0.5 rounded-full">{date}</span>
                                                ))
                                            ) : (
                                                <span className="text-xs text-ash/50 italic">No dates detected</span>
                                            )}
                                            {Array.isArray(analysis.times_found) && analysis.times_found.length > 0 && (
                                                <span className="text-white/20">|</span>
                                            )}
                                            {Array.isArray(analysis.times_found) && analysis.times_found.map((time, i) => (
                                                <span key={i} className="text-xs text-purple-400 font-medium">{time}</span>
                                            ))}
                                            <span className="text-white/20">•</span>
                                            <span className="text-xs text-ash capitalize">{analysis.theme} • {analysis.mood}</span>
                                        </div>
                                    </div>

                                    <div className="flex gap-3">
                                        {analysis.palette_hex?.map((color, i) => (
                                            <div key={`${color}-${i}`} className="w-6 h-6 rounded-lg border border-white/10 shadow-lg" style={{ backgroundColor: color }}></div>
                                        ))}
                                    </div>

                                    <div className="pt-4 border-t border-white/5">
                                        <label className="text-[10px] text-ash font-bold uppercase tracking-widest block mb-2">Poster Keywords</label>
                                        <div className="flex flex-wrap gap-2">
                                            {Array.isArray(analysis.text_extracted) && analysis.text_extracted.slice(0, 8).map((line, i) => (
                                                <span key={i} className="text-[9px] bg-white/5 px-2 py-1 rounded text-ash/80 border border-white/5">
                                                    {line}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>

                    {/* Generated Assets Section */}
                    {analysis && analysis.generated_files && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <PiPaintBrush className="text-blue-400" /> Generated Local Assets
                            </h3>

                            <div className="grid grid-cols-2 gap-6">
                                {/* Backgrounds */}
                                <div className="space-y-4">
                                    <label className="text-[10px] text-ash font-bold uppercase tracking-widest">Background Variants</label>
                                    <div className="grid grid-cols-1 gap-4">
                                        {analysis.generated_files.backgrounds?.map((path, i) => (
                                            <div key={i} className="bg-white/5 border border-white/10 rounded-xl overflow-hidden group hover:border-blue-500/50 transition-all">
                                                <div className="aspect-video bg-black/40 relative">
                                                    <img src={`file://${path}`} className="w-full h-full object-cover" alt={`BG ${i+1}`} />
                                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                                                        <button className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"><PiImage size={24} /></button>
                                                        <button 
                                                            onClick={() => handleApplyAsset(path, 'background')}
                                                            className="p-2 bg-blue-600 rounded-full hover:bg-blue-500 transition-colors"
                                                        >
                                                            <PiCheckCircle size={24} />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="p-3 flex justify-between items-center">
                                                    <span className="text-xs font-medium text-ash">Variation {i+1}</span>
                                                    <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-ash">1920x1080</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Lower Thirds */}
                                <div className="space-y-4">
                                    <label className="text-[10px] text-ash font-bold uppercase tracking-widest">Lower Third Overlays</label>
                                    <div className="grid grid-cols-1 gap-4">
                                        {analysis.generated_files.lower_thirds?.map((path, i) => (
                                            <div key={i} className="bg-white/5 border border-white/10 rounded-xl overflow-hidden group hover:border-blue-500/50 transition-all">
                                                <div className="h-24 bg-black/40 relative">
                                                    <img src={`file://${path}`} className="w-full h-full object-cover" alt={`LT ${i+1}`} />
                                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                                                        <button 
                                                            onClick={() => handleApplyAsset(path, 'lower_third')}
                                                            className="p-2 bg-purple-600 rounded-full hover:bg-purple-500 transition-colors"
                                                        >
                                                            <PiCheckCircle size={24} />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="p-3 flex justify-between items-center">
                                                    <span className="text-xs font-medium text-ash">Overlay {i+1}</span>
                                                    <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-ash">Lower Third</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
