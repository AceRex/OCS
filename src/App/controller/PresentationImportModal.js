import React from 'react';
import { PiCheckCircle, PiWarningCircle, PiDownloadSimple, PiX, PiFilePpt, PiTextT, PiArrowSquareOut } from 'react-icons/pi';

/**
 * Import Progress & Font Advisory Modals for Presentation Pipeline (FR-4.2, FR-4.34, FR-4.37)
 */
export function PresentationImportProgressModal({
  progress = null,
  onDismiss = () => {}
}) {
  if (!progress) return null;

  const { stage, percent = 0, current = 0, total = 0, message, error } = progress;
  const isFailed = stage === 'error' || !!error;
  const isDone = stage === 'done';
  const pct = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));

  const size = 88;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  const strokeColor = isFailed ? '#EF4444' : isDone ? '#10B981' : '#A855F7';

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="PowerPoint Import Progress"
    >
      <div className="bg-[#18181b] border border-white/10 rounded-2xl shadow-2xl p-6 max-w-sm w-full flex flex-col items-center gap-4 text-center relative">
        {isFailed && (
          <button
            onClick={onDismiss}
            className="absolute top-3 right-3 text-white/40 hover:text-white p-1 rounded-lg transition-colors"
            aria-label="Close"
          >
            <PiX size={18} />
          </button>
        )}

        {/* Circular Progress Indicator */}
        <div
          className="relative flex items-center justify-center rounded-full bg-[#27272a] shadow-inner"
          style={{ width: size + 24, height: size + 24 }}
        >
          <svg width={size} height={size} className="block -rotate-90">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="#3f3f46"
              strokeWidth={stroke}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={strokeColor}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={offset}
              style={{
                transition: 'stroke-dashoffset 0.3s ease-out',
                filter: isFailed
                  ? 'drop-shadow(0 0 6px rgba(239,68,68,0.45))'
                  : 'drop-shadow(0 0 6px rgba(168,85,247,0.45))',
              }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {isFailed ? (
              <span className="text-[11px] font-black uppercase tracking-wider text-red-400">Failed</span>
            ) : isDone ? (
              <PiCheckCircle size={28} className="text-emerald-400" />
            ) : (
              <div className="flex items-baseline leading-none">
                <span className="text-[26px] font-black text-white tracking-tight tabular-nums">
                  {pct}
                </span>
                <span className="text-[12px] font-semibold text-white/60 ml-0.5">%</span>
              </div>
            )}
            {total > 0 && !isFailed && !isDone && (
              <span className="text-[10px] font-medium text-white/50 mt-0.5 tabular-nums">
                {current}/{total}
              </span>
            )}
          </div>
        </div>

        {/* Status Text */}
        <div className="flex flex-col gap-1 w-full">
          <h3 className="text-sm font-bold text-white flex items-center justify-center gap-1.5">
            <PiFilePpt size={16} className="text-purple-400" />
            {isFailed ? 'Import Error' : isDone ? 'Conversion Finished' : 'Importing PowerPoint'}
          </h3>
          <p className="text-xs text-white/60 line-clamp-2 px-2">
            {message || (isFailed ? error : 'Converting presentation slides to high-res graphics...')}
          </p>
        </div>

        {isFailed && (
          <button
            type="button"
            onClick={onDismiss}
            className="w-full mt-2 py-2 px-4 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 text-xs font-bold uppercase tracking-wider transition-all"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Font Advisory and Inspection Drawer/Modal (FR-4.37)
 */
export function PresentationFontAdvisoryModal({
  deck = null,
  onClose = () => {}
}) {
  if (!deck) return null;

  const fontAnalysis = deck.fontAnalysis || { fonts: [], advisories: [] };
  const fonts = fontAnalysis.fonts || [];
  const advisories = fontAnalysis.advisories || [];

  const handleOpenUrl = (url) => {
    if (url && window.electron?.openExternal) {
      window.electron.openExternal(url);
    } else if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Presentation Font Analysis"
    >
      <div className="bg-[#18181b] border border-white/10 rounded-2xl shadow-2xl p-6 max-w-lg w-full flex flex-col gap-4 text-left max-h-[85vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400">
              <PiTextT size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Font Analysis & Advisory</h3>
              <p className="text-[11px] text-white/50 truncate max-w-xs">{deck.name || deck.filename}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            aria-label="Close"
          >
            <PiX size={18} />
          </button>
        </div>

        {/* Content List */}
        <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3">
          {advisories.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex items-start gap-2.5">
              <PiWarningCircle size={18} className="shrink-0 text-amber-400 mt-0.5" />
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-amber-300">Missing Font Substitution</span>
                <p className="text-[11px] text-amber-200/80 leading-relaxed">
                  Some fonts in this presentation were not found locally. Standard clean fallbacks (e.g. Arial) were applied so slides render without missing glyphs. You can install missing Google Fonts below for exact styling.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
              Detected Fonts ({fonts.length})
            </span>
            {fonts.length === 0 ? (
              <p className="text-xs text-white/40 py-2">No external fonts detected in presentation.</p>
            ) : (
              fonts.map((f, idx) => {
                const isEmbedded = f.status === 'embedded';
                const isBundled = f.status === 'bundled';
                const isSystem = f.status === 'system';
                const isFallback = f.status === 'fallback_substituted';

                return (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between gap-3"
                  >
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-white/90">{f.fontName}</span>
                      <span className="text-[10px] text-white/40">
                        {isEmbedded
                          ? 'Embedded in presentation'
                          : isBundled
                          ? 'Application standard bundled'
                          : isSystem
                          ? 'Installed on host OS'
                          : 'Standard fallback applied'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isEmbedded && (
                        <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          Embedded
                        </span>
                      )}
                      {isBundled && (
                        <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
                          Bundled
                        </span>
                      )}
                      {isSystem && (
                        <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-white/10 text-white/60">
                          System
                        </span>
                      )}
                      {isFallback && (
                        <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Fallback
                        </span>
                      )}

                      {f.googleFontsUrl && (
                        <button
                          type="button"
                          onClick={() => handleOpenUrl(f.googleFontsUrl)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 text-[10px] font-bold uppercase tracking-wider transition-all"
                          title="Open Google Fonts"
                        >
                          <PiDownloadSimple size={12} /> Google Font <PiArrowSquareOut size={10} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-white/10 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-purple-600/20 active:scale-95"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
}
