import React, { useState } from "react";
import { PiMonitorPlay, PiMicrophone } from "react-icons/pi";

export default function PresentationController() {
    const [isListening, setIsListening] = useState("");

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

            // console.log(transcript);
            setIsListening(transcript);
            // Optionally send to view?
            // electron.Presentation.setContent(transcript);
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

            <div className="flex flex-col gap-4 items-center justify-center p-10 bg-ash/10 rounded-2xl">
                <PiMicrophone size={48} className="text-ash opacity-50" />
                <button
                    onClick={handleSpeech}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-full font-bold transition-all shadow-lg"
                >
                    Start Speech Recognition
                </button>
                <div className="w-full p-4 bg-black/20 rounded-xl min-h-[100px] text-center text-sm">
                    {isListening || "Microphone inactive..."}
                </div>
            </div>

            <button
                onClick={clearContent}
                className="mt-auto bg-red-500/10 hover:bg-red-500/20 text-red-500 p-3 rounded-xl font-bold transition-all border border-red-500/50"
            >
                Clear Content
            </button>
        </div>
    );
}
