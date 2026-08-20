import React, { useEffect, useState } from "react";
import { PiMicrophone, PiCheck, PiSparkle, PiX } from "react-icons/pi";

export default function MobileVoiceNotification() {
  const [notification, setNotification] = useState(null);
  const [activeWirelessMic, setActiveWirelessMic] = useState(null);

  useEffect(() => {
    const AsrApi = window.electron?.Asr || window.electron?.Vosk;
    if (!AsrApi?.onTranscript) return;

    const unsubTranscript = AsrApi.onTranscript((payload) => {
      if (payload?.source === "secondary" && payload?.text) {
        setNotification({
          status: "completed",
          deviceName: payload.deviceName || "Mobile Companion",
          text: payload.text,
          time: Date.now(),
        });
        setTimeout(() => {
          setNotification((prev) => (prev && Date.now() - prev.time >= 4000 ? null : prev));
        }, 4500);
      }
    });

    return () => {
      unsubTranscript?.();
    };
  }, []);

  if (!notification) return null;

  return (
    <div className="fixed top-6 right-6 z-50 animate-bounce-in max-w-sm w-full">
      <div className="bg-[#18181b]/95 border border-blue-500/40 backdrop-blur-xl rounded-2xl p-4 shadow-2xl shadow-blue-500/20 flex items-start gap-3.5">
        <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 flex-shrink-0 animate-pulse">
          <PiMicrophone size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1">
              <PiSparkle size={13} /> Remote Voice Command
            </span>
            <button
              onClick={() => setNotification(null)}
              className="text-white/40 hover:text-white p-0.5"
            >
              <PiX size={14} />
            </button>
          </div>
          <div className="text-white font-bold text-sm mt-0.5 truncate">
            {notification.deviceName}
          </div>
          <div className="text-white/80 text-xs mt-1 font-medium bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
            <PiCheck size={14} className="text-green-400 flex-shrink-0" />
            <span className="truncate italic">"{notification.text}"</span>
          </div>
        </div>
      </div>
    </div>
  );
}
