import React, { useState } from 'react';
import { PiBroadcast, PiEye, PiEyeSlash, PiCaretDown } from "react-icons/pi";

export default function Topbar({ onGoLive, previewMode, onSetPreviewMode }) {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

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

                <div className="relative">
                    <button
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-2xl font-bold transition-all border text-sm ${previewMode
                            ? 'bg-white text-primary border-white shadow-lg'
                            : 'bg-transparent text-light border-white/20 hover:bg-white/10'
                            }`}
                    >
                        {previewMode ? <PiEye size={18} /> : <PiEyeSlash size={18} />}
                        {previewMode ? `${previewMode === 'speaker' ? 'Speaker' : 'General'} Preview` : 'Show Preview'}
                        <PiCaretDown size={14} className={`transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isDropdownOpen && (
                        <div className="absolute top-full right-0 mt-2 w-48 bg-[#2d3748] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col">
                            <button
                                onClick={() => {
                                    onSetPreviewMode('speaker');
                                    setIsDropdownOpen(false);
                                }}
                                className={`px-4 py-3 text-left hover:bg-white/10 transition-colors flex items-center gap-2 ${previewMode === 'speaker' ? 'text-green-400 font-bold' : 'text-light'}`}
                            >
                                <span className="w-2 h-2 rounded-full bg-green-500 opacity-80" />
                                Speaker View
                            </button>
                            <button
                                onClick={() => {
                                    onSetPreviewMode('general');
                                    setIsDropdownOpen(false);
                                }}
                                className={`px-4 py-3 text-left hover:bg-white/10 transition-colors flex items-center gap-2 ${previewMode === 'general' ? 'text-green-400 font-bold' : 'text-light'}`}
                            >
                                <span className="w-2 h-2 rounded-full bg-blue-500 opacity-80" />
                                General View
                            </button>
                            {previewMode && (
                                <button
                                    onClick={() => {
                                        onSetPreviewMode(null);
                                        setIsDropdownOpen(false);
                                    }}
                                    className="px-4 py-3 text-left hover:bg-red-500/20 text-red-400 transition-colors border-t border-white/10 flex items-center gap-2"
                                >
                                    <PiEyeSlash size={14} />
                                    Hide Preview
                                </button>
                            )}
                        </div>
                    )}
                </div>

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
