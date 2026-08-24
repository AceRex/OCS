import React from 'react';
import { useAuth } from '../context/AuthContext';
import { PiLockKey, PiArrowSquareOut, PiSpinner, PiShieldWarning, PiCheckCircle } from 'react-icons/pi';

export default function GuestExpiredGate({ onOpenSettings }) {
  const {
    isAuthenticated,
    guestExpired,
    waitingForBrowser,
    login,
    cancelLogin,
  } = useAuth();

  if (isAuthenticated || !guestExpired) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/85 backdrop-blur-md animate-fadeIn"
      style={{
        background: 'radial-gradient(circle at 50% 40%, rgba(30, 10, 45, 0.95) 0%, rgba(8, 6, 15, 0.98) 100%)',
      }}
    >
      <div
        className="relative max-w-lg w-full rounded-3xl border border-rose-500/30 p-8 flex flex-col items-center gap-6 text-center shadow-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, #180d22 0%, #0e0a18 60%, #150d24 100%)',
          boxShadow: '0 0 80px rgba(225, 29, 72, 0.18), 0 25px 50px rgba(0,0,0,0.8)',
        }}
      >
        {/* Ambient Glow Orb */}
        <div
          className="absolute -top-16 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(225, 29, 72, 0.25) 0%, transparent 70%)',
            filter: 'blur(30px)',
          }}
        />

        {/* Lock Icon Badge */}
        <div className="relative z-10 w-20 h-20 rounded-3xl bg-gradient-to-tr from-rose-600 to-purple-600 flex items-center justify-center text-white shadow-xl shadow-rose-600/30 border border-rose-400/30">
          <PiLockKey size={40} className="text-white animate-bounce" />
        </div>

        {/* Header Content */}
        <div className="relative z-10 space-y-2">
          <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-rose-500/20 text-rose-300 border border-rose-500/40 inline-flex items-center gap-1.5">
            <PiShieldWarning size={13} />
            1-Hour Guest Session Expired
          </span>
          <h2 className="text-2xl font-black text-white tracking-wide">
            Workstation Features Locked
          </h2>
          <p className="text-xs text-white/60 leading-relaxed max-w-md mx-auto">
            Your 1-hour unauthenticated guest evaluation window has concluded.
            Sign in with your OCS account to unlock presentation, lyrics, broadcast streaming, and your full <strong className="text-purple-300">60-Day Free Trial</strong>.
          </p>
        </div>

        {/* Features list reminder */}
        <div className="relative z-10 w-full p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 text-left grid grid-cols-2 gap-2 text-[11px] text-white/70">
          <div className="flex items-center gap-2">
            <PiCheckCircle className="text-emerald-400 flex-shrink-0" size={14} />
            <span>Full Presentation & AI</span>
          </div>
          <div className="flex items-center gap-2">
            <PiCheckCircle className="text-emerald-400 flex-shrink-0" size={14} />
            <span>NDI & Broadcast Video</span>
          </div>
          <div className="flex items-center gap-2">
            <PiCheckCircle className="text-emerald-400 flex-shrink-0" size={14} />
            <span>Smart Scripture Sync</span>
          </div>
          <div className="flex items-center gap-2">
            <PiCheckCircle className="text-emerald-400 flex-shrink-0" size={14} />
            <span>60 Days Free Access</span>
          </div>
        </div>

        {/* Actions */}
        <div className="relative z-10 w-full space-y-3 pt-2">
          {waitingForBrowser ? (
            <div className="flex items-center justify-center gap-3 py-3.5 px-6 rounded-2xl bg-purple-500/15 border border-purple-500/30 text-purple-200">
              <PiSpinner size={20} className="animate-spin text-purple-400" />
              <span className="text-xs font-bold">Waiting for browser sign-in...</span>
              <button
                onClick={cancelLogin}
                className="text-xs text-white/50 hover:text-white underline ml-2"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={login}
              className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl font-black text-sm text-white uppercase tracking-wider transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 shadow-xl shadow-purple-900/40"
              style={{
                background: 'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)',
              }}
            >
              <PiArrowSquareOut size={18} />
              Log In to Unlock Workstation
            </button>
          )}

          {typeof onOpenSettings === 'function' && (
            <button
              onClick={onOpenSettings}
              className="text-xs text-white/40 hover:text-white/80 transition-colors py-1"
            >
              View License & Settings
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
