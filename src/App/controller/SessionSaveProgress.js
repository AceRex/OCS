/**
 * Circular save-progress ring — shown while session audio is encoding.
 * Matches the reference: large percent + current/total fraction.
 */
import React from 'react';

export default function SessionSaveProgress({
  percent = 0,
  current = 0,
  total = 0,
  title = null,
  visible = false,
  phase = null,
  error = null,
  onDismiss = null,
}) {
  if (!visible) return null;

  const failed = phase === 'error' || !!error;
  const pct = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const size = 88;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  const strokeColor = failed ? '#EF4444' : '#2F6BFF';

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] flex flex-col items-center gap-2"
      role="status"
      aria-live="polite"
      aria-label={failed ? 'Session save failed' : `Saving session audio ${pct} percent`}
    >
      <div
        className="relative flex items-center justify-center rounded-full bg-white shadow-[0_12px_40px_rgba(0,0,0,0.28)]"
        style={{ width: size + 28, height: size + 28 }}
      >
        <svg width={size} height={size} className="block -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#E8E8ED"
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
              transition: 'stroke-dashoffset 0.35s ease-out',
              filter: failed
                ? 'drop-shadow(0 0 6px rgba(239,68,68,0.45))'
                : 'drop-shadow(0 0 6px rgba(47,107,255,0.45))',
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
          {failed ? (
            <span className="text-[11px] font-black uppercase tracking-wider text-red-500">Fail</span>
          ) : (
            <div className="flex items-start leading-none">
              <span className="text-[28px] font-black text-[#111] tracking-tight tabular-nums">
                {pct}
              </span>
              <span className="text-[12px] font-semibold text-[#111]/70 mt-1.5 ml-0.5">%</span>
            </div>
          )}
          {total > 0 && !failed && (
            <span className="text-[11px] font-medium text-[#8E8E93] mt-0.5 tabular-nums">
              {current}/{total}
            </span>
          )}
        </div>
      </div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-white/70 bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm max-w-[280px] truncate text-center">
        {failed
          ? `Save failed${error ? ` · ${error}` : ''}`
          : title
            ? `Processing · ${title}`
            : 'Processing'}
      </p>
      {failed && typeof onDismiss === 'function' && (
        <button
          type="button"
          onClick={onDismiss}
          className="pointer-events-auto text-[10px] font-black uppercase tracking-widest text-white bg-red-500/80 hover:bg-red-500 px-3 py-1.5 rounded-full"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
