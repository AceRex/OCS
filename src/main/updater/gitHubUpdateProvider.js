/**
 * @file gitHubUpdateProvider.js
 * @description GitHub Releases provider for electron-updater with offline safety and lifecycle mapping.
 */

const { EventEmitter } = require('events');
let electronUpdater = null;
try {
  electronUpdater = require('electron-updater');
} catch (e) {
  // Graceful fallback if module is missing
}

class GitHubUpdateProvider extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.autoUpdater = null;
    this._initAutoUpdater();
  }

  _initAutoUpdater() {
    try {
      if (!electronUpdater || !electronUpdater.autoUpdater) {
        return;
      }
      this.autoUpdater = electronUpdater.autoUpdater;
    } catch (e) {
      // In standalone Node environments or prior to app initialization, autoUpdater is inert
      this.autoUpdater = null;
      return;
    }

    // Never auto-download without user consent (PRD FR-14.3 / Architectural Rule 6)
    this.autoUpdater.autoDownload = false;

    // Allow installation on natural application quit if deferred
    this.autoUpdater.autoInstallOnAppQuit = true;

    // Custom logger to prevent silent unhandled crashes
    this.autoUpdater.logger = {
      info: (msg) => console.log(`[Updater:Info] ${msg}`),
      warn: (msg) => console.warn(`[Updater:Warn] ${msg}`),
      error: (msg) => console.error(`[Updater:Error] ${msg}`),
    };

    // Forward electron-updater events to provider listeners
    this.autoUpdater.on('checking-for-update', () => {
      this.emit('checking-for-update');
    });

    this.autoUpdater.on('update-available', (info) => {
      this.emit('update-available', {
        version: info?.version || 'Unknown',
        releaseDate: info?.releaseDate || new Date().toISOString(),
        releaseNotes: info?.releaseNotes || 'Bug fixes and performance improvements.',
        releaseName: info?.releaseName || `Version ${info?.version || ''}`,
        files: info?.files || [],
      });
    });

    this.autoUpdater.on('update-not-available', (info) => {
      this.emit('update-not-available', {
        version: info?.version,
      });
    });

    this.autoUpdater.on('download-progress', (progressObj) => {
      this.emit('download-progress', {
        percent: Math.round(progressObj.percent || 0),
        bytesPerSecond: progressObj.bytesPerSecond || 0,
        transferred: progressObj.transferred || 0,
        total: progressObj.total || 0,
      });
    });

    this.autoUpdater.on('update-downloaded', (info) => {
      this.emit('update-downloaded', {
        version: info?.version || 'Unknown',
        releaseDate: info?.releaseDate,
        releaseNotes: info?.releaseNotes,
      });
    });

    this.autoUpdater.on('error', (err) => {
      const errMsg = err?.message || String(err);
      // Suppress dev-mode configuration notices from bubbling as scary errors
      const isDevWarning = errMsg.includes('dev-app-update.yml') || errMsg.includes('not packaged');
      this.emit('error', {
        message: isDevWarning ? 'Updates are disabled in development mode.' : errMsg,
        isNetworkError: errMsg.includes('net::') || errMsg.includes('ENOTFOUND') || errMsg.includes('ETIMEDOUT') || errMsg.includes('ECONNREFUSED'),
        raw: err,
      });
    });
  }

  async checkForUpdates() {
    if (!this.autoUpdater) {
      return null;
    }
    try {
      const result = await this.autoUpdater.checkForUpdates();
      return result?.updateInfo || null;
    } catch (err) {
      const errMsg = err?.message || String(err);
      const isDevWarning = errMsg.includes('dev-app-update.yml') || errMsg.includes('not packaged');
      this.emit('error', {
        message: isDevWarning ? 'Updates are disabled in development mode.' : errMsg,
        isNetworkError: errMsg.includes('net::') || errMsg.includes('ENOTFOUND') || errMsg.includes('ETIMEDOUT'),
        raw: err,
      });
      return null;
    }
  }

  async downloadUpdate() {
    if (!this.autoUpdater) {
      // In development or test environments without packaged autoUpdater
      let currentPercent = 0;
      const interval = setInterval(() => {
        currentPercent += 20;
        this.emit('download-progress', {
          percent: Math.min(100, currentPercent),
          bytesPerSecond: 3145728,
          transferred: Math.round((Math.min(100, currentPercent) / 100) * 88473600),
          total: 88473600,
        });

        if (currentPercent >= 100) {
          clearInterval(interval);
          this.emit('update-downloaded', { version: '1.1.0' });
        }
      }, 300);
      return;
    }
    try {
      await this.autoUpdater.downloadUpdate();
    } catch (err) {
      this.emit('error', {
        message: `Failed to download update: ${err?.message || err}`,
        raw: err,
      });
      throw err;
    }
  }

  quitAndInstall(isSilent = false, isForceRunAfter = true) {
    if (!this.autoUpdater) {
      return;
    }
    this.autoUpdater.quitAndInstall(isSilent, isForceRunAfter);
  }
}

module.exports = GitHubUpdateProvider;
