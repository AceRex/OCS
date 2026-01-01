import React, { useState } from "react";
import {
  PiBroadcast,
  PiEye,
  PiEyeSlash,
  PiCaretDown,
  PiX,
} from "react-icons/pi";
import { MdOutlineConnectedTv, MdOutlineResetTv } from "react-icons/md";
import MobileConnectController from "./MobileConnectController";

export default function Topbar({ onGoLive, previewMode, onSetPreviewMode }) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);

  return (
    <>
      <div className="w-full h-16 bg-primary flex items-center justify-between px-6 shrink-0 relative z-40">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-light tracking-wide">
            OCS{" "}
            <span className="text-xs font-normal opacity-50 ml-2">
              Controller
            </span>
          </h1>
        </div>

        <div className="grid grid-cols-4 items-center gap-4">
          <div className="relative">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all border text-xs ${
                previewMode
                  ? "bg-white text-primary border-white shadow-lg"
                  : "bg-transparent text-light border-white/20 hover:bg-white/10"
              }`}
            >
              {previewMode ? <PiEye size={18} /> : <PiEyeSlash size={18} />}
              {previewMode
                ? `${previewMode === "speaker" ? "Speaker" : "General"} Preview`
                : "Show Preview"}
              <PiCaretDown
                size={14}
                className={`transition-transform ${
                  isDropdownOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {isDropdownOpen && (
              <div className="absolute top-full right-0 mt-2 w-48 bg-[#2d3748] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col">
                <button
                  onClick={() => {
                    onSetPreviewMode("speaker");
                    setIsDropdownOpen(false);
                  }}
                  className={`px-4 py-3 text-left text-xs hover:bg-white/10 transition-colors flex items-center gap-2 ${
                    previewMode === "speaker"
                      ? "text-green-400 font-medium"
                      : "text-light"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-green-500 opacity-80" />
                  Speaker View
                </button>
                <button
                  onClick={() => {
                    onSetPreviewMode("general");
                    setIsDropdownOpen(false);
                  }}
                  className={`px-4 py-3 text-left text-xs hover:bg-white/10 transition-colors flex items-center gap-2 ${
                    previewMode === "general"
                      ? "text-green-400 font-medium"
                      : "text-light"
                  }`}
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
            onClick={() => setIsConnectModalOpen(true)}
            className="flex items-center justify-center text-assent-200 gap-1 bg-assent2-100 hover:bg-light text-primary px-3 py-2 rounded-lg font-medium transition-all text-xs capitalize hover:shadow-lg hover:shadow-blue-500/10"
            title="Connect Remote"
          >
            <div className="flex items-center justify-center rounded-[5px]">
              <MdOutlineConnectedTv size={18}/>
            </div>
            Remote
          </button>
          <button
            onClick={() => {
              electron.Timer.setTimer(null);
              electron.Presentation.setContent(null);
            }}
            className="flex items-center justify-center text-assent2-500 gap-2 bg-assent2-300 hover:bg-red-500/20 text-red-500 px-4 py-2 rounded-lg font-medium transition-all text-xs capitalize hover:shadow-lg hover:shadow-red-500/10"
            title="Reset to Default (OCS Logo)"
          >
            <div className="flex items-center justify-center rounded-[5px]">
              <MdOutlineResetTv size={18}/>
            </div>
            Reset Display
          </button>

          <button
            onClick={onGoLive}
            className="flex items-center justify-center gap-2 bg-red hover:bg-red/90 text-xs capitalize text-white px-6 py-2 rounded-lg font-medium transition-all shadow-lg hover:shadow-red/20 active:scale-95"
          >
            <PiBroadcast size={15} />
            Go Live
          </button>
        </div>
      </div>

      {/* Connect Modal */}
      {isConnectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#1e1e1e] w-[90%] max-w-[70%] h-[80%] rounded-2xl border border-white/10 shadow-2xl overflow-hidden relative flex flex-col animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsConnectModalOpen(false)}
              className="absolute top-4 right-4 p-2 bg-white/5 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-all z-10"
            >
              <PiX size={20} />
            </button>

            <div className="flex-1 overflow-auto">
              <MobileConnectController />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
