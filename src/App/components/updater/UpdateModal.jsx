import React, { useState } from 'react';
import {
  PiSparkle,
  PiDownloadSimple,
  PiArrowClockwise,
  PiCheckCircle,
  PiX,
  PiWarning,
  PiArrowRight,
  PiSpinner,
} from 'react-icons/pi';
import { useAppUpdater } from '../../hooks/useAppUpdater';

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function UpdateModal() {
  const {
    status,
    currentVersion,
    updateInfo,
    downloadProgress,
    errorMessage,
    isDismissed,
    isAvailable,
    isDownloading,
    isDownloaded,
    isError,
    downloadUpdate,
    quitAndInstall,
    dismissNotification,
    checkForUpdates,
  } = useAppUpdater();

  const [confirmLiveRestart, setConfirmLiveRestart] = useState(false);
  const [installing, setInstalling] = useState(false);

  // If dismissed or idle / not-available, do not render floating notification
  if (isDismissed || status === 'idle' || status === 'not-available') {
    return null;
  }

  const handleInstallClick = async (force = false) => {
    setInstalling(true);
    const res = await quitAndInstall({ force });
    setInstalling(false);

    if (res && !res.success && res.reason === 'live_session_active') {
      setConfirmLiveRestart(true);
    }
  };

  const latestVersion = updateInfo?.version || 'New Version';
  const releaseNotes = updateInfo?.releaseNotes;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] max-w-md w-full animate-fade-in font-outfit"
         style={{ fontFamily: "'Outfit', 'Space Grotesk', sans-serif" }}>
      
      {/* ─── 1. UPDATE AVAILABLE STATE ─── */}
      {isAvailable && (
        <div className="bg-[#130E22]/95 border border-[#3E3159] p-5 rounded-3xl shadow-2xl shadow-purple-950/80 backdrop-blur-xl space-y-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#A788FA] to-[#6366F1] flex items-center justify-center text-[#0B0814] shadow-lg shadow-purple-500/30">
                <PiSparkle size={20} className="animate-pulse" />
              </div>
              <div>
                <h4 className="text-sm font-black uppercase tracking-wider text-white">OCS Update Available</h4>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-[#A788FA] font-bold">v{latestVersion}</span>
                  <span className="text-[10px] text-[#8882A4]">Current: v{currentVersion}</span>
                </div>
              </div>
            </div>
            <button
              onClick={dismissNotification}
              className="text-[#8882A4] hover:text-white p-1 rounded-xl hover:bg-white/5 transition-colors"
              title="Dismiss"
            >
              <PiX size={18} />
            </button>
          </div>

          {/* Release Notes Preview */}
          {releaseNotes && (
            <div className="bg-[#1E1735]/80 border border-[#2E2448] p-3 rounded-2xl text-xs text-[#C8C2DC] max-h-28 overflow-y-auto leading-relaxed no-scrollbar">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#8882A4] block mb-1">What's New:</span>
              <div className="whitespace-pre-line text-[11px]">
                {typeof releaseNotes === 'string' ? releaseNotes : 'New features, stability improvements, and performance updates.'}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={dismissNotification}
              className="flex-1 px-4 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-[#8882A4] hover:text-white transition-colors"
            >
              Later
            </button>
            <button
              type="button"
              onClick={() => downloadUpdate()}
              className="flex-1 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#A788FA] to-[#818cf8] hover:from-[#9570f5] hover:to-[#6366f1] text-[#0B0814] text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-purple-500/25 flex items-center justify-center gap-1.5"
            >
              <PiDownloadSimple size={16} />
              <span>Download</span>
            </button>
          </div>
        </div>
      )}

      {/* ─── 2. DOWNLOADING STATE ─── */}
      {isDownloading && (
        <div className="bg-[#130E22]/95 border border-[#3E3159] p-5 rounded-3xl shadow-2xl shadow-purple-950/80 backdrop-blur-xl space-y-3.5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-[#A788FA] flex items-center justify-center">
                <PiArrowClockwise size={18} className="animate-spin" />
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-white">Downloading OCS v{latestVersion}</h4>
                <p className="text-[10px] text-[#8882A4]">You can continue using OCS normally</p>
              </div>
            </div>
            <button
              onClick={dismissNotification}
              className="text-[#8882A4] hover:text-white p-1 rounded-xl hover:bg-white/5"
              title="Hide progress"
            >
              <PiX size={16} />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="w-full h-2.5 rounded-full bg-[#1E1735] overflow-hidden p-0.5 border border-[#2E2448]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#A788FA] via-[#818cf8] to-[#38BDF8] transition-all duration-300 shadow-sm"
                style={{ width: `${Math.min(100, Math.max(0, downloadProgress.percent || 0))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-[#8882A4] font-bold">
              <span>{downloadProgress.percent}%</span>
              <span>
                {formatBytes(downloadProgress.transferred)} / {formatBytes(downloadProgress.total)}
                {downloadProgress.bytesPerSecond > 0 && ` (${formatBytes(downloadProgress.bytesPerSecond)}/s)`}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ─── 3. UPDATE READY STATE ─── */}
      {isDownloaded && !confirmLiveRestart && (
        <div className="bg-[#130E22]/95 border border-emerald-500/30 p-5 rounded-3xl shadow-2xl shadow-emerald-950/80 backdrop-blur-xl space-y-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <PiCheckCircle size={22} className="animate-bounce" />
              </div>
              <div>
                <h4 className="text-sm font-black uppercase tracking-wider text-white">Update Ready to Install</h4>
                <p className="text-xs text-emerald-300/90 font-medium mt-0.5">
                  OCS v{latestVersion} is downloaded and verified.
                </p>
              </div>
            </div>
            <button
              onClick={dismissNotification}
              className="text-[#8882A4] hover:text-white p-1 rounded-xl hover:bg-white/5"
            >
              <PiX size={18} />
            </button>
          </div>

          <p className="text-[11px] text-[#8882A4] leading-relaxed">
            Restart OCS now to apply the new version, or continue working and install on next launch.
          </p>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={dismissNotification}
              className="flex-1 px-4 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-[#8882A4] hover:text-white transition-colors"
            >
              Later
            </button>
            <button
              type="button"
              disabled={installing}
              onClick={() => handleInstallClick(false)}
              className="flex-1 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-[#0B0814] text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-1.5"
            >
              {installing ? (
                <>
                  <PiSpinner size={16} className="animate-spin" />
                  <span>Restarting...</span>
                </>
              ) : (
                <>
                  <span>Restart & Update</span>
                  <PiArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ─── 3b. LIVE SESSION SAFETY CONFIRMATION (PRD FR-14.6) ─── */}
      {isDownloaded && confirmLiveRestart && (
        <div className="bg-[#1A101C]/95 border border-amber-500/40 p-5 rounded-3xl shadow-2xl shadow-amber-950/80 backdrop-blur-xl space-y-4 text-white">
          <div className="flex items-center gap-3 text-amber-400">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 flex items-center justify-center">
              <PiWarning size={22} />
            </div>
            <div>
              <h4 className="text-sm font-black uppercase tracking-wider text-white">Live Session Active</h4>
              <p className="text-xs text-amber-300/90 font-medium">Service or presentation is currently running</p>
            </div>
          </div>

          <p className="text-xs text-[#C8C2DC] leading-relaxed">
            Restarting OCS now will interrupt projection screens and active outputs. Would you like to restart anyway or wait until the service concludes?
          </p>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setConfirmLiveRestart(false);
                dismissNotification();
              }}
              className="flex-1 px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white transition-colors"
            >
              Wait Until After
            </button>
            <button
              type="button"
              onClick={() => handleInstallClick(true)}
              className="flex-1 px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black uppercase tracking-wider transition-colors shadow-lg shadow-amber-500/30"
            >
              Restart Anyway
            </button>
          </div>
        </div>
      )}

      {/* ─── 4. ERROR STATE ─── */}
      {isError && errorMessage && (
        <div className="bg-[#1D1018]/95 border border-rose-500/30 p-4 rounded-3xl shadow-2xl shadow-rose-950/60 backdrop-blur-xl space-y-3 text-white">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 text-rose-400">
              <PiWarning size={18} />
              <h4 className="text-xs font-black uppercase tracking-wider text-white">Update Notice</h4>
            </div>
            <button onClick={dismissNotification} className="text-[#8882A4] hover:text-white p-1">
              <PiX size={16} />
            </button>
          </div>
          <p className="text-[11px] text-[#C8C2DC] leading-relaxed">
            {errorMessage}
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => checkForUpdates(true)}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white transition-colors"
            >
              Retry Check
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
