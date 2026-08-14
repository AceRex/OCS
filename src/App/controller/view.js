import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import Sidebar from "./Sidebar";
import TimerController from "./TimerController";
import BibleController from "./BibleController";
import PresentationController from "./PresentationController";
import DesignLabController from "./DesignLabController";
import SettingsController from "./SettingsController";
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

function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [previewMode, setPreviewMode] = useState(null); // 'speaker', 'general', or null
  const [saveProgress, setSaveProgress] = useState(null);

  useEffect(() => {
    if (!window.electron?.Session) return undefined;
    const unsubProgress = window.electron.Session.onProgress?.((p) => {
      if (p == null) {
        // Don't clear immediately — finalized handler shows 100% then dismisses
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
    <section className="w-[100vw] h-[100vh] flex flex-row bg-black overflow-hidden selection:bg-blue-500/30">
      {/* Background Grid Pattern */}
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

      <main className="flex-1 h-full flex flex-col overflow-hidden relative z-10">
        <div className="flex-1 overflow-hidden relative">
          <div
            className={`absolute inset-0 ${activeTab === "dashboard" ? "block" : "hidden"}`}
          >
            <BroadcastEngine />
          </div>
          <div
            className={`absolute inset-0 p-4 ${activeTab !== "dashboard" ? "block" : "hidden"}`}
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
              className={`w-full h-full ${activeTab === "apps" ? "block" : "hidden"}`}
            >
              <Dashboard onNavigate={setActiveTab} />
            </div>
          </div>
        </div>

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
    </section>
  );
}

import { ErrorBoundary } from "../../ErrorBoundary";

function WrappedApp() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

export default WrappedApp;
