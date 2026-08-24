import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { AuthProvider } from "../context/AuthContext";
import Sidebar from "./Sidebar";
import TimerController from "./TimerController";
import BibleController from "./BibleController";
import PresentationController from "./PresentationController";
import DesignLabController from "./DesignLabController";
import SettingsController from "./SettingsController";
import NdiController from "./NdiController";
import BroadcastEngine from "./BroadcastEngine";
import SessionsController from "./SessionsController";
import SessionSaveProgress from "./SessionSaveProgress";

import Dashboard from "./Dashboard";
import PreviewModal from "./PreviewModal";

import MobileConnectController from "./MobileConnectController";

/** Floating pill banner — "NEXT TIMER STARTS IN …" */
function NextTimerBanner() {
  const delayCountdown = useSelector((state) => state.util.delayCountdown);
  const isDelayRunning = useSelector((state) => state.util.isDelayRunning);
  const pendingItem = useSelector((state) => state.util.nextItemToStart);

  if (!isDelayRunning || delayCountdown <= 0) return null;

  const minutes = Math.floor(delayCountdown / 60);
  const seconds = delayCountdown % 60;

  let label;
  if (minutes > 0 && seconds > 0) {
    label = `${minutes} Minute${minutes !== 1 ? "s" : ""} ${seconds}s`;
  } else if (minutes > 0) {
    label = `${minutes} Minute${minutes !== 1 ? "s" : ""}`;
  } else {
    label = `${seconds} Second${seconds !== 1 ? "s" : ""}`;
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 18,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "#0d0d0d",
        border: "1.5px solid rgba(255,255,255,0.08)",
        borderRadius: 999,
        padding: "10px 22px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
        backdropFilter: "blur(12px)",
        minWidth: 280,
        justifyContent: "space-between",
      }}
    >
      {/* Power icon */}
      <span style={{ fontSize: 18, color: "#FCD34D", lineHeight: 1 }}>⏻</span>

      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: "rgba(255,255,255,0.45)",
            textTransform: "uppercase",
          }}
        >
          Next Timer Starts In
        </span>
        {pendingItem?.agenda && (
          <span
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.55)",
              fontWeight: 500,
              maxWidth: 160,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {pendingItem.agenda}
          </span>
        )}
      </div>

      {/* Countdown */}
      <span
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: "#f59e0b",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "0.02em",
        }}
      >
        {label}
      </span>
    </div>
  );
}

/** Global Emergency Sanctuary Hotkeys Bar */
function EmergencyControlsBar({ onOpenShortcuts }) {
  const [canvasState, setCanvasState] = useState({
    chrome: { blackout: false, logo: false },
    contentSlot: { type: "none", data: null }
  });

  const isMac = typeof navigator !== "undefined" && (navigator.userAgent.includes("Mac") || navigator.platform?.includes("Mac"));

  useEffect(() => {
    const unsub = window.electron?.Canvas?.onCanvasSync?.((state) => {
      if (state) setCanvasState(state);
    }) || window.api?.Canvas?.onCanvasSync?.((state) => {
      if (state) setCanvasState(state);
    });
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  const isBlackout = !!canvasState?.chrome?.blackout;
  const isLogo = !!canvasState?.chrome?.logo;
  const hasContent = canvasState?.contentSlot?.type !== "none" && canvasState?.contentSlot?.data != null;

  const handleToggleBlackout = () => {
    if (window.api?.Canvas?.toggleBlackout) window.api.Canvas.toggleBlackout();
    else if (window.electron?.Canvas?.toggleBlackout) window.electron.Canvas.toggleBlackout();
  };

  const handleToggleLogo = () => {
    if (window.api?.Canvas?.toggleLogo) window.api.Canvas.toggleLogo();
    else if (window.electron?.Canvas?.toggleLogo) window.electron.Canvas.toggleLogo();
  };

  const handleClearContent = () => {
    if (window.api?.Canvas?.clearContent) window.api.Canvas.clearContent();
    else if (window.electron?.Canvas?.clearContent) window.electron.Canvas.clearContent();
  };

  return (
    <div className="flex items-center gap-2 bg-black/60 border border-white/10 rounded-xl px-3 py-1.5 backdrop-blur-md shadow-lg">
      {/* Blackout Pill */}
      <button
        type="button"
        onClick={handleToggleBlackout}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
          isBlackout
            ? "bg-red-600 text-white shadow-[0_0_12px_rgba(239,68,68,0.6)] animate-pulse"
            : "bg-white/5 hover:bg-red-500/20 text-white/80 hover:text-red-300 border border-white/10"
        }`}
        title={`Instant Blackout (${isMac ? "⌘+⇧+B / fn+F10" : "F10 / Ctrl+⇧+B"})`}
      >
        <span className="w-2 h-2 rounded-full bg-red-400" />
        <span>{isBlackout ? "BLACKOUT ON" : "Blackout"}</span>
        <kbd className="text-[9px] opacity-90 font-mono px-1.5 py-0.5 rounded bg-black/50 border border-white/20">
          {isMac ? "⌘⇧B" : "F10"}
        </kbd>
      </button>

      {/* Logo Mute Pill */}
      <button
        type="button"
        onClick={handleToggleLogo}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
          isLogo
            ? "bg-purple-600 text-white shadow-[0_0_12px_rgba(168,85,247,0.6)]"
            : "bg-white/5 hover:bg-purple-500/20 text-white/80 hover:text-purple-300 border border-white/10"
        }`}
        title={`Logo Mute (${isMac ? "⌘+⇧+L / fn+F11" : "F11 / Ctrl+⇧+L"})`}
      >
        <span className="w-2 h-2 rounded-full bg-purple-400" />
        <span>{isLogo ? "LOGO ON" : "Logo"}</span>
        <kbd className="text-[9px] opacity-90 font-mono px-1.5 py-0.5 rounded bg-black/50 border border-white/20">
          {isMac ? "⌘⇧L" : "F11"}
        </kbd>
      </button>

      {/* Clear Content Pill */}
      <button
        type="button"
        onClick={handleClearContent}
        disabled={!hasContent}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
          hasContent
            ? "bg-white/5 hover:bg-amber-500/20 text-white/80 hover:text-amber-300 border border-white/10 cursor-pointer"
            : "opacity-40 cursor-not-allowed bg-transparent text-white/40 border border-white/5"
        }`}
        title="Clear Active Scripture / Lyrics (ESC)"
      >
        <span>Clear</span>
        <kbd className="text-[9px] opacity-90 font-mono px-1.5 py-0.5 rounded bg-black/50 border border-white/20">
          ESC
        </kbd>
      </button>

      {/* Shortcuts Guide Button */}
      <button
        type="button"
        onClick={onOpenShortcuts}
        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-white/70 hover:text-white transition-colors border border-white/10 text-xs font-semibold cursor-pointer"
        title="Keyboard Shortcuts Reference"
      >
        <span>⌨</span>
        <span className="text-[10px]">Shortcuts</span>
      </button>
    </div>
  );
}

/** Sanctuary Keyboard Shortcuts Cheat-Sheet Modal */
function ShortcutsModal({ isOpen, onClose }) {
  if (!isOpen) return null;
  const isMac = typeof navigator !== "undefined" && (navigator.userAgent.includes("Mac") || navigator.platform?.includes("Mac"));

  const shortcuts = [
    {
      action: "Instant Blackout",
      mac: "⌘ + Shift + B  (or fn + F10)",
      win: "F10  (or Ctrl + Shift + B)",
      desc: "Instantly cuts both sanctuary displays to black without losing current scripture or slide state."
    },
    {
      action: "Logo Mute",
      mac: "⌘ + Shift + L  (or fn + F11)",
      win: "F11  (or Ctrl + Shift + L)",
      desc: "Toggles the church logo / branding splash layer over the active presentation."
    },
    {
      action: "Clear Active Content",
      mac: "ESC  (or ⌘ + .)",
      win: "ESC  (or Ctrl + .)",
      desc: "Clears current verse or lyrics back to background video motion loop."
    },
    {
      action: "Next Verse / Slide",
      mac: "→  or  PageDown",
      win: "→  or  PageDown",
      desc: "Advances to next verse in passage or next presentation slide."
    },
    {
      action: "Previous Verse / Slide",
      mac: "←  or  PageUp",
      win: "←  or  PageUp",
      desc: "Navigates back to previous verse or previous presentation slide."
    }
  ];

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
      <div className="bg-[#120f20] border border-white/15 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">⌨</span>
            <div>
              <h3 className="text-sm font-bold text-white">Emergency Sanctuary Shortcuts</h3>
              <p className="text-[10px] text-white/50">Active globally across all desktop windows</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white text-xs font-bold px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
          >
            ✕ Close
          </button>
        </div>

        <div className="space-y-2">
          {shortcuts.map((s, idx) => (
            <div key={idx} className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">{s.action}</span>
                <span className="text-[11px] font-mono font-bold text-purple-300 bg-purple-950/60 border border-purple-500/30 px-2 py-0.5 rounded">
                  {isMac ? s.mac : s.win}
                </span>
              </div>
              <p className="text-[10px] text-white/50">{s.desc}</p>
            </div>
          ))}
        </div>

        <div className="p-3 bg-purple-950/40 border border-purple-500/20 rounded-xl text-[10px] text-purple-200 leading-relaxed text-center">
          {isMac
            ? "💡 On macOS keyboards, use the ⌘ (Command) shortcuts or hold the fn key when pressing F10 / F11."
            : "💡 Function keys F10 and F11 are active system-wide across all views."}
        </div>
      </div>
    </div>
  );
}

import IncomingAssetModal from "./IncomingAssetModal";
import MobileVoiceNotification from "./MobileVoiceNotification";

import GuestExpiredGate from "../components/GuestExpiredGate";

function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [previewMode, setPreviewMode] = useState(null); // 'speaker', 'general', or null
  const [saveProgress, setSaveProgress] = useState(null);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);

  useEffect(() => {
    if (!window.electron?.Session) return undefined;
    const unsubProgress = window.electron.Session.onProgress?.((p) => {
      if (p == null) {
        return;
      }
      setSaveProgress(p);
    });
    const unsubStatus = window.electron.Session.onStatus?.((s) => {
      if (s?.processing && s.progress) setSaveProgress(s.progress);
    });
    const unsubFinal = window.electron.Session.onFinalized?.((meta) => {
      const failed =
        meta?.status === "audio_failed" ||
        meta?.status === "pdf_failed" ||
        !!meta?.error;
      setSaveProgress((prev) => ({
        ...(prev || {}),
        percent: 100,
        current: prev?.total || 32,
        total: prev?.total || 32,
        phase: failed ? "error" : "done",
        error: meta?.error || (failed ? meta?.status : null),
        title: meta?.title || prev?.title || null,
      }));
      if (!failed) {
        setTimeout(() => setSaveProgress(null), 900);
      }
    });
    return () => {
      if (typeof unsubProgress === "function") unsubProgress();
      if (typeof unsubStatus === "function") unsubStatus();
      if (typeof unsubFinal === "function") unsubFinal();
    };
  }, []);

  return (
    <section className="w-screen h-screen flex flex-row bg-[#08080c] p-3 gap-3 overflow-hidden text-white selection:bg-purple-500/30 font-outfit">
      {/* Background Ambient Radial Pattern */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03] z-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 2px 2px, white 1px, transparent 0)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Global floating delay banner — persists across all tabs */}
      <NextTimerBanner />

      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="flex-1 h-full bg-[#100e18]/40 border border-white/10 rounded-2xl overflow-hidden relative z-10 flex flex-col shadow-2xl">
        {/* Top Floating Emergency Shortcuts Strip */}
        <div className="absolute top-3 right-3 z-30 pointer-events-auto">
          <EmergencyControlsBar onOpenShortcuts={() => setShortcutsModalOpen(true)} />
        </div>

        <div className="flex-1 overflow-hidden relative w-full h-full">
          <div
            className={`w-full h-full ${activeTab === "dashboard" ? "block" : "hidden"}`}
          >
            <BroadcastEngine />
          </div>
          <div
            className={`w-full h-full p-4 overflow-hidden ${activeTab !== "dashboard" ? "block" : "hidden"}`}
          >
            <div
              className={`w-full h-full ${activeTab === "timer" ? "block" : "hidden"}`}
            >
              <TimerController />
            </div>
            <div
              className={`w-full h-full ${activeTab === "sessions" ? "block" : "hidden"}`}
            >
              <SessionsController />
            </div>
            <div
              className={`w-full h-full ${activeTab === "bible" ? "block" : "hidden"}`}
            >
              <BibleController />
            </div>
            <div
              className={`w-full h-full ${activeTab === "presentation" ? "block" : "hidden"}`}
            >
              <PresentationController />
            </div>
            <div
              className={`w-full h-full ${activeTab === "mobile" ? "block" : "hidden"}`}
            >
              <MobileConnectController />
            </div>
            <div
              className={`w-full h-full ${activeTab === "design" ? "block" : "hidden"}`}
            >
              <DesignLabController />
            </div>
            <div
              className={`w-full h-full ${activeTab === "settings" ? "block" : "hidden"}`}
            >
              <SettingsController />
            </div>
            <div
              className={`w-full h-full ${activeTab === "ndi" || activeTab === "stream" ? "block" : "hidden"}`}
            >
              <NdiController />
            </div>
            <div
              className={`w-full h-full ${activeTab === "apps" ? "block" : "hidden"}`}
            >
              <Dashboard onNavigate={setActiveTab} />
            </div>
          </div>
        </div>

        {/* Global 1-Hour Guest Session Expiration Lock Gate */}
        {activeTab !== "settings" && (
          <GuestExpiredGate onOpenSettings={() => setActiveTab("settings")} />
        )}

        <PreviewModal
          isOpen={!!previewMode}
          mode={previewMode}
          onClose={() => setPreviewMode(null)}
        />

        <ShortcutsModal
          isOpen={shortcutsModalOpen}
          onClose={() => setShortcutsModalOpen(false)}
        />
      </main>

      <SessionSaveProgress
        visible={!!saveProgress}
        percent={saveProgress?.percent ?? 0}
        current={saveProgress?.current ?? 0}
        total={saveProgress?.total ?? 0}
        title={saveProgress?.title || null}
        phase={saveProgress?.phase || null}
        error={saveProgress?.error || null}
        onDismiss={() => setSaveProgress(null)}
      />

      <IncomingAssetModal />
      <MobileVoiceNotification />
    </section>
  );
}

import { ErrorBoundary } from "../../ErrorBoundary";

function WrappedApp() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default WrappedApp;
