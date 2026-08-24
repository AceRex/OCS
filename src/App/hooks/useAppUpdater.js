import { useState, useEffect, useCallback } from 'react';

/**
 * React hook connecting to the Electron main updater service via secure IPC bridge.
 */
export function useAppUpdater() {
  const [status, setStatus] = useState('idle');
  const [currentVersion, setCurrentVersion] = useState('1.0.0');
  const [updateInfo, setUpdateInfo] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState({
    percent: 0,
    bytesPerSecond: 0,
    transferred: 0,
    total: 0,
  });
  const [errorMessage, setErrorMessage] = useState(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState(null);

  // Load initial status on mount
  useEffect(() => {
    let isMounted = true;

    if (window.electron?.Updater?.getStatus) {
      window.electron.Updater.getStatus()
        .then((res) => {
          if (!isMounted || !res) return;
          setStatus(res.status || 'idle');
          setCurrentVersion(res.currentVersion || '1.0.0');
          setUpdateInfo(res.updateInfo || null);
          setDownloadProgress(res.downloadProgress || { percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 });
          setErrorMessage(res.errorMessage || null);
          setLastCheckedAt(res.lastCheckedAt || null);
        })
        .catch((err) => {
          console.warn('[useAppUpdater] Failed to fetch initial status:', err);
        });
    }

    // Subscribe to IPC status push events
    const unsubStatus = window.electron?.Updater?.onStatusChange?.((res) => {
      if (!isMounted || !res) return;
      setStatus(res.status || 'idle');
      if (res.currentVersion) setCurrentVersion(res.currentVersion);
      if (res.updateInfo) setUpdateInfo(res.updateInfo);
      if (res.downloadProgress) setDownloadProgress(res.downloadProgress);
      setErrorMessage(res.errorMessage || null);
      if (res.lastCheckedAt) setLastCheckedAt(res.lastCheckedAt);

      // Un-dismiss if a new action occurs (e.g. downloaded or new available version)
      if (res.status === 'available' || res.status === 'downloaded') {
        setIsDismissed(false);
      }
    });

    // Subscribe to real-time download progress events
    const unsubProgress = window.electron?.Updater?.onDownloadProgress?.((progress) => {
      if (!isMounted || !progress) return;
      setStatus('downloading');
      setDownloadProgress(progress);
    });

    // Subscribe to error events
    const unsubError = window.electron?.Updater?.onError?.((err) => {
      if (!isMounted) return;
      setStatus('error');
      setErrorMessage(err?.message || 'Update check encountered a network error.');
    });

    return () => {
      isMounted = false;
      unsubStatus?.();
      unsubProgress?.();
      unsubError?.();
    };
  }, []);

  const checkForUpdates = useCallback(async (isManual = true) => {
    setIsDismissed(false);
    setErrorMessage(null);
    if (!window.electron?.Updater?.checkForUpdates) {
      return { status: 'error', errorMessage: 'Updater is not supported in this environment.' };
    }
    try {
      const res = await window.electron.Updater.checkForUpdates(isManual);
      if (res) {
        setStatus(res.status || 'checking');
        if (res.updateInfo) setUpdateInfo(res.updateInfo);
      }
      return res;
    } catch (err) {
      const msg = err?.message || String(err);
      setStatus('error');
      setErrorMessage(msg);
      return { status: 'error', errorMessage: msg };
    }
  }, []);

  const downloadUpdate = useCallback(async () => {
    setIsDismissed(false);
    setErrorMessage(null);
    if (!window.electron?.Updater?.downloadUpdate) {
      return { success: false, error: 'Updater bridge unavailable' };
    }
    try {
      setStatus('downloading');
      return await window.electron.Updater.downloadUpdate();
    } catch (err) {
      const msg = err?.message || String(err);
      setStatus('error');
      setErrorMessage(msg);
      return { success: false, error: msg };
    }
  }, []);

  const quitAndInstall = useCallback(async (options = {}) => {
    if (!window.electron?.Updater?.quitAndInstall) {
      return { success: false, error: 'Updater bridge unavailable' };
    }
    try {
      return await window.electron.Updater.quitAndInstall(options);
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    }
  }, []);

  const dismissNotification = useCallback(() => {
    setIsDismissed(true);
  }, []);

  const simulateUpdate = useCallback(async (stage = 'available') => {
    setIsDismissed(false);
    setErrorMessage(null);
    if (!window.electron?.Updater?.simulateUpdate) {
      setStatus(stage === 'downloaded' ? 'downloaded' : 'available');
      setUpdateInfo({
        version: '1.1.0',
        releaseDate: new Date().toISOString(),
        releaseNotes: '• Real-time lyrics alignment & auto-advance\n• NDI high-throughput broadcast engine\n• Offline licensing & self-service password recovery\n• Performance optimizations and UI enhancements',
        releaseName: 'OCS v1.1.0 Feature Release',
      });
      return;
    }
    try {
      const res = await window.electron.Updater.simulateUpdate(stage);
      if (res) {
        setStatus(res.status || 'available');
        if (res.updateInfo) setUpdateInfo(res.updateInfo);
      }
      return res;
    } catch (err) {
      console.warn('[useAppUpdater] simulateUpdate error:', err);
    }
  }, []);

  return {
    status,
    currentVersion,
    updateInfo,
    downloadProgress,
    errorMessage,
    isDismissed,
    lastCheckedAt,
    isAvailable: status === 'available',
    isDownloading: status === 'downloading',
    isDownloaded: status === 'downloaded',
    isChecking: status === 'checking',
    isError: status === 'error',
    checkForUpdates,
    downloadUpdate,
    quitAndInstall,
    dismissNotification,
    simulateUpdate,
  };
}

export default useAppUpdater;
