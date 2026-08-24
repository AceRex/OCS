/**
 * AuthContext — Provides global auth state across the Controller UI.
 *
 * All components that need to know whether the operator is authenticated
 * (or in grace-period-offline mode) should use the `useAuth()` hook from
 * this module rather than calling the electron IPC APIs directly.
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState({
    authenticated: false,
    state: 'loading',       // 'loading' | 'logged_out' | 'active' | 'grace_period' | 'expired'
    email: null,
    orgName: null,
    licenseTier: null,
    hoursRemaining: null,
    lastValidatedAt: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [waitingForBrowser, setWaitingForBrowser] = useState(false);

  // Load auth status on mount and subscribe to real-time updates
  useEffect(() => {
    let unsub = null;

    async function fetchStatus() {
      try {
        if (window.electron?.Auth?.getStatus) {
          const status = await window.electron.Auth.getStatus();
          setAuth(status || { authenticated: false, state: 'logged_out' });
        }
      } catch (err) {
        console.warn('[Auth] getStatus failed:', err.message);
        setAuth({ authenticated: false, state: 'logged_out' });
      } finally {
        setLoading(false);
      }
    }

    fetchStatus();

    // Subscribe to live auth-status pushes from main process (after deep-link callback)
    if (window.electron?.Auth?.onAuthStatus) {
      unsub = window.electron.Auth.onAuthStatus((status) => {
        setAuth(status);
        setLoading(false);
        setWaitingForBrowser(false);
        setError(null);
      });
    }

    // Subscribe to auth errors
    let unsubErr = null;
    if (window.electron?.Auth?.onAuthError) {
      unsubErr = window.electron.Auth.onAuthError((errMsg) => {
        setError(errMsg);
        setWaitingForBrowser(false);
      });
    }

    return () => {
      if (typeof unsub === 'function') unsub();
      if (typeof unsubErr === 'function') unsubErr();
    };
  }, []);

  const login = useCallback(async () => {
    setError(null);
    setWaitingForBrowser(true);
    try {
      if (window.electron?.Auth?.openBrowserLogin) {
        await window.electron.Auth.openBrowserLogin();
      }
    } catch (err) {
      setError(err.message || 'Failed to open browser for login.');
      setWaitingForBrowser(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setLoading(true);
    try {
      if (window.electron?.Auth?.logout) {
        await window.electron.Auth.logout();
      }
      setAuth({ authenticated: false, state: 'logged_out' });
    } catch (err) {
      setError(err.message || 'Logout failed.');
    } finally {
      setLoading(false);
    }
  }, []);

  const cancelLogin = useCallback(() => {
    setWaitingForBrowser(false);
    setError(null);
  }, []);

  const simulateLogin = useCallback(async (customUrl) => {
    setError(null);
    try {
      if (window.electron?.Auth?.simulateCallback) {
        await window.electron.Auth.simulateCallback(customUrl);
      }
    } catch (err) {
      setError(err.message || 'Simulated login failed.');
    }
  }, []);

  // Real-time live countdown ticker for unauthenticated guest session (Wall-Clock sync)
  useEffect(() => {
    if (auth.authenticated) return undefined;

    const syncTime = () => {
      const now = Date.now();
      const started = auth.guestStartedAt || now;
      const durationMs = (auth.guestDurationMinutes || 60) * 60 * 1000;
      const remainingMs = Math.max(0, (started + durationMs) - now);
      const remainingSeconds = Math.floor(remainingMs / 1000);
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      const isExpired = remainingMs <= 0;

      setAuth((prev) => {
        if (prev.authenticated) return prev;
        if (
          prev.guestRemainingSeconds === remainingSeconds &&
          prev.guestExpired === isExpired
        ) {
          return prev;
        }
        return {
          ...prev,
          isGuest: true,
          guestExpired: isExpired,
          state: isExpired ? 'expired' : prev.state,
          guestRemainingSeconds: remainingSeconds,
          guestRemainingMinutes: remainingMinutes,
        };
      });
    };

    // Run immediately and start interval
    syncTime();
    const timer = setInterval(syncTime, 1000);

    // Synchronize immediately whenever operator switches back from another application
    window.addEventListener('focus', syncTime);
    document.addEventListener('visibilitychange', syncTime);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', syncTime);
      document.removeEventListener('visibilitychange', syncTime);
    };
  }, [auth.authenticated, auth.guestStartedAt, auth.guestDurationMinutes]);

  const hasPermission = useCallback((permissionKey) => {
    if (!permissionKey) return true;
    const features = Array.isArray(auth?.features) ? auth.features : [];
    if (features.length > 0) {
      return features.includes(permissionKey);
    }
    const tier = (auth?.licenseTier || auth?.subscriptionPlan || (auth?.isGuest ? 'guest' : 'trial')).toLowerCase();
    if (['premium', 'large', 'enterprise'].includes(tier)) {
      return true;
    }
    if (tier === 'standard') {
      return [
        'timer.basic',
        'timer.interval',
        'timer.change_view',
        'session.recording',
        'session.bumper',
        'broadcast.basic',
        'presentation.basic',
        'pdf.view',
        'pdf.edit',
        'slides.use',
        'scene.basic',
        'song.basic',
      ].includes(permissionKey);
    }
    if (['mini', 'trial', 'free', 'guest'].includes(tier)) {
      return [
        'timer.basic',
        'broadcast.basic',
        'presentation.basic',
        'pdf.view',
        'scene.basic',
        'song.basic',
      ].includes(permissionKey);
    }
    return false;
  }, [auth?.features, auth?.licenseTier, auth?.subscriptionPlan, auth?.isGuest]);

  const silentReload = useCallback(async () => {
    try {
      if (window.electron?.Auth?.silentReload) {
        const updated = await window.electron.Auth.silentReload();
        if (updated) {
          setAuth(updated);
        }
        return updated;
      }
    } catch (_) {}
  }, []);

  // Periodic silent reload of days left (Works 100% offline + online background sync)
  useEffect(() => {
    silentReload();
    const interval = setInterval(silentReload, 60000);
    window.addEventListener('focus', silentReload);
    document.addEventListener('visibilitychange', silentReload);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', silentReload);
      document.removeEventListener('visibilitychange', silentReload);
    };
  }, [silentReload]);

  const value = {
    auth,
    loading,
    error,
    waitingForBrowser,
    login,
    logout,
    silentReload,
    simulateLogin,
    cancelLogin,
    hasPermission,
    isAuthenticated: auth.authenticated && !auth.isGuest,
    isGuest: !auth.authenticated || !!auth.isGuest,
    guestExpired: !!auth.guestExpired,
    guestRemainingMinutes: auth.guestRemainingMinutes ?? 60,
    guestRemainingSeconds: auth.guestRemainingSeconds ?? 3600,
    isGracePeriod: auth.state === 'grace_period',
    isLoading: auth.state === 'loading' || loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Gracefully degrade when rendered outside AuthProvider (e.g. legacy tests)
    return {
      auth: { authenticated: false, state: 'logged_out', isGuest: true, guestExpired: false },
      loading: false,
      error: null,
      waitingForBrowser: false,
      login: () => {},
      logout: () => {},
      simulateLogin: () => {},
      cancelLogin: () => {},
      hasPermission: (key) => key === 'timer.basic' || key === 'broadcast.basic',
      isAuthenticated: false,
      isGuest: true,
      guestExpired: false,
      guestRemainingMinutes: 60,
      guestRemainingSeconds: 3600,
      isGracePeriod: false,
      isLoading: false,
    };
  }
  return ctx;
}

export default AuthContext;
