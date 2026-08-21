/**
 * DisabledContainer — Permission-gating overlay component.
 *
 * Wraps any feature or panel that requires desktop authentication / licensing.
 * When the operator is not authenticated (or the feature requires a specific
 * tier they don't have), this component renders a glassmorphic lock card with
 * a direct "Log In via Browser" call-to-action instead of the real feature UI.
 *
 * Usage:
 *   <DisabledContainer featureName="NDI Broadcast Streaming" description="...">
 *     <NdiPanel />
 *   </DisabledContainer>
 *
 * Props:
 *   - featureName  (string)   — Human-readable feature label
 *   - description  (string)   — One-liner on what authentication unlocks
 *   - isGated      (boolean)  — Override; defaults to `!isAuthenticated` from useAuth
 *   - mode         ('overlay'|'replace'|'card')  — Layout mode; default 'replace'
 *   - actionText   (string)   — CTA button label; default "Log In via Browser"
 *   - children                — The feature UI to render when unlocked
 */
import React from 'react';
import { useAuth } from '../context/AuthContext';
import { PiLockKey, PiArrowSquareOut, PiSpinner } from 'react-icons/pi';

export default function DisabledContainer({
  children,
  featureName = 'This Feature',
  description = 'Sign in with your organization account to unlock this feature.',
  isGated,
  mode = 'replace',
  actionText = 'Log In via Browser',
}) {
  const { isAuthenticated, waitingForBrowser, login, cancelLogin } = useAuth();

  // Allow explicit prop override; default to global auth state
  const gated = isGated !== undefined ? isGated : !isAuthenticated;

  if (!gated) return <>{children}</>;

  const card = (
    <div
      className={`
        ${mode === 'overlay' ? 'absolute inset-0 z-20' : 'w-full h-full'}
        flex items-center justify-center p-6
      `}
      style={{
        background:
          mode === 'overlay'
            ? 'rgba(10, 7, 20, 0.82)'
            : 'transparent',
        backdropFilter: mode === 'overlay' ? 'blur(10px)' : undefined,
      }}
    >
      <div
        className="relative max-w-sm w-full rounded-3xl border border-white/10 p-7 flex flex-col items-center gap-5 text-center shadow-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, #12102a 0%, #0e0c22 60%, #11102b 100%)',
          boxShadow: '0 0 60px rgba(124, 58, 237, 0.12), 0 20px 40px rgba(0,0,0,0.55)',
        }}
      >
        {/* Ambient purple glow orb */}
        <div
          className="absolute -top-10 left-1/2 -translate-x-1/2 w-52 h-52 rounded-full pointer-events-none"
          style={{
            background:
              'radial-gradient(circle, rgba(124, 58, 237, 0.22) 0%, transparent 70%)',
            filter: 'blur(20px)',
          }}
        />

        {/* Lock Icon */}
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center relative z-10 flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, rgba(124,58,237,0.3) 0%, rgba(6,182,212,0.15) 100%)',
            border: '1px solid rgba(168, 85, 247, 0.3)',
          }}
        >
          <PiLockKey size={26} className="text-purple-300" />
        </div>

        {/* Text */}
        <div className="space-y-2 relative z-10">
          <h3 className="text-base font-black text-white tracking-tight">{featureName}</h3>
          <p className="text-xs text-white/45 leading-relaxed">{description}</p>
        </div>

        {/* CTA */}
        <div className="w-full relative z-10 space-y-2">
          {waitingForBrowser ? (
            <>
              <div className="flex items-center justify-center gap-2.5 w-full py-3.5 rounded-2xl border border-purple-500/30 bg-purple-500/10">
                <PiSpinner size={16} className="text-purple-400 animate-spin" />
                <span className="text-purple-300 text-sm font-semibold">
                  Complete login in your browser...
                </span>
              </div>
              <button
                onClick={cancelLogin}
                className="text-xs text-white/30 hover:text-white/60 transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={login}
                className="flex items-center justify-center gap-2.5 w-full py-3.5 rounded-2xl font-bold text-sm text-white transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
                style={{
                  background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
                  boxShadow: '0 6px 20px rgba(124, 58, 237, 0.35)',
                }}
              >
                <PiArrowSquareOut size={16} />
                {actionText}
              </button>
              <button
                onClick={() => simulateLogin()}
                className="w-full py-2 rounded-xl text-xs font-semibold text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors"
                title="Instant activation without remote auth server"
              >
                ⚡ Quick Demo / Dev Activate
              </button>
            </>
          )}
        </div>

        {/* Subtle note */}
        <p className="text-[10px] text-white/20 relative z-10 leading-relaxed">
          Opens your system default browser securely.<br />No credentials stored in the app.
        </p>
      </div>
    </div>
  );

  if (mode === 'overlay') {
    return (
      <div className="relative w-full h-full">
        {children}
        {card}
      </div>
    );
  }

  return card;
}
