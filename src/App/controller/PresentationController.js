import React, { useState, useEffect } from "react";
import { PiTextT, PiPaintBucket, PiMonitorPlay } from "react-icons/pi";

export default function PresentationController() {
    const [styles, setStyles] = useState({
        bgType: "color", // 'color' | 'image' | 'video'
        bgColor: "#000000",
        bgMedia: null,
        textColor: "#ffffff",
        fontFamily: "Inter",
        fontSize: "5rem",
        textAlign: "center",
    });

    const [isListening, setIsListening] = useState("");

    const updateStyle = (key, value) => {
        const newStyles = { ...styles, [key]: value };
        setStyles(newStyles);
        electron.Presentation.setStyle(newStyles);
    };

    const handleMediaUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            updateStyle("bgMedia", url);
        }
    };

    const clearContent = () => {
        electron.Presentation.setContent(null);
    }

    const handleSpeech = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.error("Speech Recognition API not supported in this browser.");
            setIsListening("Speech API not supported");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            console.log("Speech recognition started");
            setIsListening("Listening...");
        };

        recognition.onresult = (event) => {
            const transcript = Array.from(event.results)
                .map(result => result[0].transcript)
                .join('');

            console.log(transcript);
            setIsListening(transcript);
        };

        recognition.onerror = (event) => {
            console.error("Speech recognition error", event.error);
            setIsListening(`Error: ${event.error}`);
        };

        recognition.onend = () => {
            console.log("Speech recognition ended");
            // Optional: restart if you want it to be "always on" but be careful of loops
            // recognition.start();
        };

        try {
            recognition.start();
        } catch (error) {
            console.error("Failed to start recognition:", error);
        }
    }

    return (
        <div className="flex flex-col gap-6 p-4 text-light h-full overflow-y-auto">
            {/* Header */}
            <h2 className="text-xl font-bold text-ash uppercase tracking-widest flex items-center gap-2">
                <PiMonitorPlay className="mb-1" /> Presentation
            </h2>

            <button onClick={handleSpeech}>Start Speech</button>

            <p>{isListening}</p>

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
                            value={styles.bgColor}
                            onChange={(e) => updateStyle("bgColor", e.target.value)}
                            className="w-8 h-8 rounded cursor-pointer bg-transparent border-none"
                        />
                        <span className="text-xs font-mono">{styles.bgColor}</span>
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
                {/* Background Media */}
                <div className="bg-ash/10 p-4 rounded-xl flex flex-col gap-2">
                    <label className="text-xs font-bold text-ash">Background Image/Video</label>
                    <input
                        type="file"
                        accept="image/*,video/*"
                        onChange={handleMediaUpload}
                        className="text-xs text-light file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
                    />
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

            {/* Clear Button */}
            <button
                onClick={clearContent}
                className="mt-auto bg-red-500/10 hover:bg-red-500/20 text-red-500 p-3 rounded-xl font-bold transition-all border border-red-500/50"
            >
                Clear Presentation
            </button>
        </div>
    );
}
