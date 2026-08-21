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

  const value = {
    auth,
    loading,
    error,
    waitingForBrowser,
    login,
    logout,
    simulateLogin,
    cancelLogin,
    isAuthenticated: auth.authenticated === true,
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
      auth: { authenticated: false, state: 'logged_out' },
      loading: false,
      error: null,
      waitingForBrowser: false,
      login: () => {},
      logout: () => {},
      simulateLogin: () => {},
      cancelLogin: () => {},
      isAuthenticated: false,
      isGracePeriod: false,
      isLoading: false,
    };
  }
  return ctx;
}

export default AuthContext;
