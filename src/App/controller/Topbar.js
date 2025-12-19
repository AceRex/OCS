import React from 'react';
import { PiBroadcast, PiEye, PiEyeSlash } from "react-icons/pi";

export default function Topbar({ onGoLive, isPreviewOpen, onTogglePreview }) {
    return (
        <div className="w-full h-16 bg-primary flex items-center justify-between px-6 shrink-0">
            <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-light tracking-wide">OCS <span className="text-xs font-normal opacity-50 ml-2">Controller</span></h1>
            </div>

            <div className="flex items-center gap-4">
                <button
                    onClick={() => {
                        electron.Timer.setTimer(null);
                        electron.Presentation.setContent(null);
                    }}
                    className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 px-4 py-2 rounded-2xl font-bold transition-all border border-red-500/20 text-xs uppercase tracking-wide hover:shadow-lg hover:shadow-red-500/10"
                    title="Reset to Default (OCS Logo)"
                >
                    Reset Display
                </button>

                <button
                    onClick={onTogglePreview}
                    className={`flex items-center gap-2 px-4 py-2 rounded-2xl font-bold transition-all border text-sm ${isPreviewOpen
                        ? 'bg-white text-primary border-white shadow-lg'
                        : 'bg-transparent text-light border-white/20 hover:bg-white/10'
                        }`}
                >
                    {isPreviewOpen ? <PiEyeSlash size={18} /> : <PiEye size={18} />}
                    {isPreviewOpen ? 'Hide Preview' : 'Show Preview'}
                </button>

                <button
                    onClick={onGoLive}
                    className="flex items-center gap-2 bg-red hover:bg-red/90 text-white px-6 py-2 rounded-2xl font-bold transition-all shadow-lg hover:shadow-red/20 active:scale-95"
                >
                    <PiBroadcast size={20} />
                    GO LIVE
                </button>
            </div>
        </div>
    );
}
