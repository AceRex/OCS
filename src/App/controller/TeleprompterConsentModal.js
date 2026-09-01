import React from "react";
import { PiShieldCheck, PiVideoCamera, PiX, PiLockKey } from "react-icons/pi";

/**
 * TeleprompterConsentModal
 *
 * Mandatory Video & Audio Recording Consent Gate per PRD Section 5.5 / Section 8.
 * Informs the operator that camera video + microphone audio are being recorded
 * and stored strictly on the local device in Session Folders.
 */
export default function TeleprompterConsentModal({
  isOpen,
  onClose,
  onConfirmConsent,
  cameraSource = "Laptop Camera",
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150 font-outfit">
      <div className="bg-[#111018] border border-purple-500/30 rounded-3xl w-full max-w-md p-6 flex flex-col gap-5 shadow-2xl relative text-white">
        
        {/* Header Icon */}
        <div className="flex items-center justify-between">
          <div className="w-12 h-12 rounded-2xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
            <PiVideoCamera size={26} />
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white flex items-center justify-center transition-colors"
          >
            <PiX size={16} />
          </button>
        </div>

        {/* Title & Privacy Body */}
        <div>
          <h3 className="text-lg font-bold text-white tracking-wide">
            Video Recording Consent
          </h3>
          <p className="text-xs text-white/60 mt-1.5 leading-relaxed">
            You are about to start a teleprompter recording with video capture enabled from your <span className="text-purple-300 font-semibold">{cameraSource}</span>.
          </p>
        </div>

        {/* Privacy Invariant Highlights */}
        <div className="bg-[#191724] border border-white/5 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-start gap-2.5">
            <PiShieldCheck size={18} className="text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs text-white/80">
              <span className="font-bold text-white block">100% Local Storage</span>
              Video and audio recordings are saved directly to your local computer in Session Folders and are never uploaded to cloud servers.
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <PiLockKey size={18} className="text-purple-400 shrink-0 mt-0.5" />
            <div className="text-xs text-white/80">
              <span className="font-bold text-white block">Archive Integration</span>
              The video will be indexed with word-level speech transcripts in your Sessions tab for review and export.
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-bold transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirmConsent();
              onClose();
            }}
            className="flex-1 py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-600/30 transition-all active:scale-98"
          >
            I Consent & Start
          </button>
        </div>

      </div>
    </div>
  );
}
