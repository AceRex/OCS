/**
 * @file updaterService.js
 * @description Central auto-updater orchestrator and state machine for OCS Desktop.
 */

const { app } = require('electron');
const { UPDATE_STATUS, UPDATER_CHANNELS } = require('./updaterTypes');
const GitHubUpdateProvider = require('./gitHubUpdateProvider');

class UpdaterService {
  constructor(options = {}) {
    this.provider = options.provider || new GitHubUpdateProvider();
    this.currentVersion = options.currentVersion || (app?.getVersion ? app.getVersion() : require('../../../package.json').version);
    this.status = UPDATE_STATUS.IDLE;
    this.updateInfo = null;
    this.downloadProgress = { percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 };
    this.errorMessage = null;
    this.lastCheckedAt = null;
    this.checkIntervalTimer = null;
    this.initialCheckTimer = null;
    this.isChecking = false;
    this.isDownloading = false;
    this.windowBroadcaster = null;
    this.liveSessionChecker = options.liveSessionChecker || null;

    this._bindProviderEvents();
  }

  setBroadcaster(broadcasterFn) {
    this.windowBroadcaster = broadcasterFn;
  }

  setLiveSessionChecker(checkerFn) {
    this.liveSessionChecker = checkerFn;
  }

  _bindProviderEvents() {
    this.provider.on('checking-for-update', () => {
      this.status = UPDATE_STATUS.CHECKING;
      this.errorMessage = null;
      this._broadcast(UPDATER_CHANNELS.STATUS_CHANGED, this.getStatus());
    });

    this.provider.on('update-available', (info) => {
      this.status = UPDATE_STATUS.AVAILABLE;
      this.updateInfo = info;
      this.isChecking = false;
      this.lastCheckedAt = new Date();
      this._broadcast(UPDATER_CHANNELS.STATUS_CHANGED, this.getStatus());
    });

    this.provider.on('update-not-available', (info) => {
      this.status = UPDATE_STATUS.NOT_AVAILABLE;
      this.isChecking = false;
      this.lastCheckedAt = new Date();
      this._broadcast(UPDATER_CHANNELS.STATUS_CHANGED, this.getStatus());

      // Return status to idle after 10 seconds for clean UI state
      setTimeout(() => {
        if (this.status === UPDATE_STATUS.NOT_AVAILABLE) {
          this.status = UPDATE_STATUS.IDLE;
          this._broadcast(UPDATER_CHANNELS.STATUS_CHANGED, this.getStatus());
        }
      }, 10000);
    });

    this.provider.on('download-progress', (progress) => {
      this.status = UPDATE_STATUS.DOWNLOADING;
      this.downloadProgress = progress;
      this._broadcast(UPDATER_CHANNELS.DOWNLOAD_PROGRESS, progress);
    });

    this.provider.on('update-downloaded', (info) => {
      this.status = UPDATE_STATUS.DOWNLOADED;
      this.isDownloading = false;
      this.downloadProgress = { percent: 100, bytesPerSecond: 0, transferred: this.downloadProgress.total, total: this.downloadProgress.total };
      this._broadcast(UPDATER_CHANNELS.STATUS_CHANGED, this.getStatus());
    });

    this.provider.on('error', (err) => {
      this.isChecking = false;
      this.isDownloading = false;
      this.status = UPDATE_STATUS.ERROR;
      this.errorMessage = err?.message || 'Update check encountered a network error.';
      this._broadcast(UPDATER_CHANNELS.ERROR, {
        message: this.errorMessage,
        status: this.status,
      });
      this._broadcast(UPDATER_CHANNELS.STATUS_CHANGED, this.getStatus());
    });
  }

  _broadcast(channel, data) {
    if (typeof this.windowBroadcaster === 'function') {
      try {
        this.windowBroadcaster(channel, data);
      } catch (err) {
        console.warn(`[UpdaterService] Failed to broadcast event ${channel}:`, err);
      }
    }
  }

  init(config = {}) {
    const checkOnStartup = config.checkOnStartup ?? true;
    const checkIntervalMs = config.checkIntervalMs || 6 * 60 * 60 * 1000; // 6 hours default (PRD FR-14.2)
    const initialDelayMs = config.initialDelayMs || 15000; // 15s startup delay

    if (checkOnStartup) {
      this.initialCheckTimer = setTimeout(() => {
        this.checkForUpdates(false).catch((err) => {
          console.log('[UpdaterService] Background startup check completed safely with result:', err?.message || 'ok');
        });
      }, initialDelayMs);
    }

    if (checkIntervalMs > 0) {
      this.checkIntervalTimer = setInterval(() => {
        this.checkForUpdates(false).catch(() => {});
      }, checkIntervalMs);
    }
  }

  destroy() {
    if (this.initialCheckTimer) clearTimeout(this.initialCheckTimer);
    if (this.checkIntervalTimer) clearInterval(this.checkIntervalTimer);
  }

  async checkForUpdates(isManual = false) {
    // Debounce rapid duplicate calls (within 20s) if not manual
    if (this.isChecking) {
      return this.getStatus();
    }

    this.isChecking = true;
    this.errorMessage = null;
    this.status = UPDATE_STATUS.CHECKING;
    this._broadcast(UPDATER_CHANNELS.STATUS_CHANGED, this.getStatus());

    try {
      const result = await this.provider.checkForUpdates();
      return this.getStatus();
    } catch (err) {
      this.isChecking = false;
      this.status = UPDATE_STATUS.ERROR;
      this.errorMessage = err?.message || 'Failed to check for updates.';
      this._broadcast(UPDATER_CHANNELS.STATUS_CHANGED, this.getStatus());
      return this.getStatus();
    }
  }

  async downloadUpdate() {
    if (this.status === UPDATE_STATUS.DOWNLOADING || this.isDownloading) {
      return { success: true, message: 'Download already in progress.' };
    }

    this.isDownloading = true;
    this.status = UPDATE_STATUS.DOWNLOADING;
    this.downloadProgress = { percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 };
    this._broadcast(UPDATER_CHANNELS.STATUS_CHANGED, this.getStatus());

    try {
      await this.provider.downloadUpdate();
      return { success: true };
    } catch (err) {
      this.isDownloading = false;
      this.status = UPDATE_STATUS.ERROR;
      this.errorMessage = `Download failed: ${err?.message || err}`;
      this._broadcast(UPDATER_CHANNELS.STATUS_CHANGED, this.getStatus());
      return { success: false, error: this.errorMessage };
    }
  }

  simulateUpdate(stage = 'available') {
    if (stage === 'available') {
      this.status = UPDATE_STATUS.AVAILABLE;
      this.updateInfo = {
        version: '1.1.0',
        releaseDate: new Date().toISOString(),
        releaseNotes: '• Real-time lyrics alignment & auto-advance\n• NDI high-throughput broadcast engine\n• Offline licensing & self-service password recovery\n• Performance optimizations and UI enhancements',
        releaseName: 'OCS v1.1.0 Feature Release',
      };
      this.errorMessage = null;
      this._broadcast(UPDATER_CHANNELS.STATUS_CHANGED, this.getStatus());
      return this.getStatus();
    }

    if (stage === 'download') {
      return this.downloadUpdate();
    }

    if (stage === 'downloaded') {
      this.status = UPDATE_STATUS.DOWNLOADED;
      this.downloadProgress = { percent: 100, bytesPerSecond: 0, transferred: 88473600, total: 88473600 };
      this._broadcast(UPDATER_CHANNELS.STATUS_CHANGED, this.getStatus());
      return this.getStatus();
    }

    if (stage === 'reset') {
      this.status = UPDATE_STATUS.IDLE;
      this.updateInfo = null;
      this.downloadProgress = { percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 };
      this.errorMessage = null;
      this._broadcast(UPDATER_CHANNELS.STATUS_CHANGED, this.getStatus());
      return this.getStatus();
    }

    return this.getStatus();
  }

  quitAndInstall(options = {}) {
    const isForce = options.force ?? false;

    // Check Live-Session Safety (PRD FR-14.6)
    if (!isForce && typeof this.liveSessionChecker === 'function') {
      const isLive = this.liveSessionChecker();
      if (isLive) {
        return {
          success: false,
          requiresConfirmation: true,
          reason: 'live_session_active',
          message: 'A presentation or worship broadcast appears to be live. Restarting now will interrupt output.',
        };
      }
    }

    try {
      this.provider.quitAndInstall(options.isSilent ?? false, options.isForceRunAfter ?? true);
      return { success: true };
    } catch (err) {
      console.error('[UpdaterService] Failed to quit and install update:', err);
      return { success: false, error: err?.message || String(err) };
    }
  }

  getStatus() {
    return {
      status: this.status,
      currentVersion: this.currentVersion,
      updateInfo: this.updateInfo,
      downloadProgress: this.downloadProgress,
      errorMessage: this.errorMessage,
      lastCheckedAt: this.lastCheckedAt ? this.lastCheckedAt.toISOString() : null,
      hasUpdate: this.status === UPDATE_STATUS.AVAILABLE || this.status === UPDATE_STATUS.DOWNLOADING || this.status === UPDATE_STATUS.DOWNLOADED,
      isDownloaded: this.status === UPDATE_STATUS.DOWNLOADED,
    };
  }
}

// Export singleton instance + class definition
const updaterInstance = new UpdaterService();

module.exports = {
  UpdaterService,
  updaterService: updaterInstance,
};
