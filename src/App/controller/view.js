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
import TeleprompterController from "./TeleprompterController";

import Dashboard from "./Dashboard";
import PreviewModal from "./PreviewModal";
import UpdateModal from "../components/updater/UpdateModal";

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

import IncomingAssetModal from "./IncomingAssetModal";
import MobileVoiceNotification from "./MobileVoiceNotification";

import GuestExpiredGate from "../components/GuestExpiredGate";

function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [previewMode, setPreviewMode] = useState(null); // 'speaker', 'general', or null
  const [saveProgress, setSaveProgress] = useState(null);

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

  useEffect(() => {
    const unsub = window.electron?.Menu?.onAction?.((action) => {
      if (action === "quick_search") {
        setActiveTab("bible");
      }
    });
    return () => unsub?.();
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
              className={`w-full h-full ${activeTab === "teleprompter" ? "block" : "hidden"}`}
            >
              <TeleprompterController />
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
      <UpdateModal />
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
