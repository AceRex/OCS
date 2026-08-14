/**
 * Session folder card — compact glass folder (reference layout).
 * Colors cycle by grid index across four themes — not user-picked.
 */
import React from 'react';
import { PiDotsThreeVerticalBold } from 'react-icons/pi';

const THEMES = [
  {
    // purple
    back: 'linear-gradient(165deg, #B794F6 0%, #7C3AED 48%, #5B21B6 100%)',
    glass: 'linear-gradient(180deg, rgba(196,181,253,0.55) 0%, rgba(124,58,237,0.72) 55%, rgba(91,33,182,0.85) 100%)',
    shadow: '0 12px 28px rgba(91, 33, 182, 0.35)',
    rim: 'rgba(237, 233, 254, 0.55)',
  },
  {
    // navy
    back: 'linear-gradient(165deg, #93C5FD 0%, #3B82F6 42%, #1E3A8A 100%)',
    glass: 'linear-gradient(180deg, rgba(147,197,253,0.50) 0%, rgba(37,99,235,0.72) 55%, rgba(30,58,138,0.88) 100%)',
    shadow: '0 12px 28px rgba(30, 58, 138, 0.38)',
    rim: 'rgba(219, 234, 254, 0.55)',
  },
  {
    // green
    back: 'linear-gradient(165deg, #6EE7B7 0%, #10B981 48%, #047857 100%)',
    glass: 'linear-gradient(180deg, rgba(167,243,208,0.55) 0%, rgba(16,185,129,0.72) 55%, rgba(6,95,70,0.85) 100%)',
    shadow: '0 12px 28px rgba(6, 95, 70, 0.32)',
    rim: 'rgba(236, 253, 245, 0.55)',
  },
  {
    // amber
    back: 'linear-gradient(165deg, #FDE68A 0%, #F59E0B 48%, #D97706 100%)',
    glass: 'linear-gradient(180deg, rgba(253,230,138,0.55) 0%, rgba(245,158,11,0.72) 55%, rgba(180,83,9,0.85) 100%)',
    shadow: '0 12px 28px rgba(180, 83, 9, 0.32)',
    rim: 'rgba(255, 251, 235, 0.55)',
  },
];

function themeForIndex(index) {
  const i = Math.abs(Number(index) || 0) % THEMES.length;
  return THEMES[i];
}

function formatBytes(n) {
  if (!n || n < 1024) return `${n || 0} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch (_) {
    return '';
  }
}

export default function SessionFolderCard({
  title,
  speakerName,
  index = 0,
  sizeBytes = 0,
  createdAt,
  status,
  onOpen,
  onMenu,
}) {
  const theme = themeForIndex(index);
  const isProcessing = status === 'processing' || status === 'recording';
  const statusLabel = status && status !== 'ready'
    ? (status === 'processing' ? 'Processing' : status.replace('_', ' '))
    : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative w-full text-left group focus:outline-none"
      style={{ filter: `drop-shadow(${theme.shadow})` }}
    >
      <div
        className="relative rounded-[22px] overflow-visible"
        style={{ background: theme.back }}
      >
        <div
          className="absolute left-[12%] -top-[12px] h-[20px] w-[34%] rounded-t-[16px] z-0"
          style={{ background: theme.back }}
        />

        <div className="absolute right-[10%] top-[10px] w-[44%] h-[48%] pointer-events-none z-[5]">
          <div
            className="absolute inset-0 bg-white rounded-[10px] shadow-md"
            style={{ transform: 'rotate(-11deg) translateY(6px) translateX(-3px)' }}
          />
          <div
            className="absolute inset-0 bg-white rounded-[10px] shadow"
            style={{ transform: 'rotate(-5deg) translateY(2px) translateX(1px)' }}
          />
          <div
            className="absolute inset-0 bg-white rounded-[10px] shadow-lg"
            style={{ transform: 'rotate(1deg) translateX(5px)' }}
          />
        </div>

        <div
          className="relative z-10 mt-[34px] min-h-[108px] rounded-[22px] overflow-hidden border"
          style={{
            background: theme.glass,
            borderColor: theme.rim,
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -8px 20px rgba(0,0,0,0.1)',
          }}
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-10"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 100%)',
            }}
          />

          <div className="relative z-20 flex flex-col h-full min-h-[108px] px-3.5 pt-3 pb-3">
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0 pr-1">
                <h3 className="text-[15px] font-black text-white tracking-tight leading-tight truncate drop-shadow-sm">
                  {title || 'Session'}
                </h3>
                <p className="text-[11px] text-white/90 mt-1 font-medium truncate leading-snug">
                  {speakerName || 'Speaker'}
                </p>
                {statusLabel && (
                  <span
                    className={`inline-flex items-center gap-1 mt-1 text-[8px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded-full ${
                      isProcessing
                        ? 'bg-[#2F6BFF]/90 text-white shadow-[0_0_10px_rgba(47,107,255,0.55)]'
                        : 'bg-black/20 text-white/90'
                    }`}
                  >
                    {isProcessing && (
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    )}
                    {statusLabel}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMenu?.(e); }}
                className="shrink-0 w-7 h-7 rounded-full border border-white/70 flex items-center justify-center text-white/95 hover:bg-white/15"
                aria-label="Session menu"
              >
                <PiDotsThreeVerticalBold size={14} />
              </button>
            </div>

            <p className="mt-auto pt-3 text-[10px] text-white/80 font-medium tracking-wide leading-snug">
              Last added {formatDate(createdAt)}
              {sizeBytes ? ` · ${formatBytes(sizeBytes)}` : ''}
            </p>
          </div>
        </div>
      </div>
    </button>
  );
}

export { THEMES, themeForIndex, formatBytes, formatDate };
