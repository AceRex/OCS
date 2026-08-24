/**
 * @file updaterIpc.js
 * @description IPC channels and window broadcasting for OCS Desktop Auto-Updater.
 */

const { ipcMain, BrowserWindow } = require('electron');
const { UPDATER_CHANNELS } = require('./updaterTypes');
const { updaterService } = require('./updaterService');

function broadcastToAllWindows(channel, data) {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }
}

function registerUpdaterIpc(options = {}) {
  // Bind window broadcasting to the updaterService singleton
  updaterService.setBroadcaster((channel, data) => {
    broadcastToAllWindows(channel, data);
  });

  // Check if live session is active from main process state
  if (typeof options.liveSessionChecker === 'function') {
    updaterService.setLiveSessionChecker(options.liveSessionChecker);
  }

  // Register IPC Handlers
  ipcMain.handle(UPDATER_CHANNELS.CHECK, async (_event, isManual) => {
    return updaterService.checkForUpdates(Boolean(isManual));
  });

  ipcMain.handle(UPDATER_CHANNELS.DOWNLOAD, async () => {
    return updaterService.downloadUpdate();
  });

  ipcMain.handle(UPDATER_CHANNELS.INSTALL, async (_event, options) => {
    return updaterService.quitAndInstall(options || {});
  });

  ipcMain.handle(UPDATER_CHANNELS.GET_STATUS, () => {
    return updaterService.getStatus();
  });

  ipcMain.handle('updater:simulate-update', (_event, stage) => {
    return updaterService.simulateUpdate(stage);
  });

  return {
    broadcastToAllWindows,
    updaterService,
  };
}

module.exports = {
  registerUpdaterIpc,
  broadcastToAllWindows,
};
