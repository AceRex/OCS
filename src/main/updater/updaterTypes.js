/**
 * @file updaterTypes.js
 * @description Type constants and event definitions for the OCS desktop auto-update system.
 */

const UPDATE_STATUS = {
  IDLE: 'idle',
  CHECKING: 'checking',
  AVAILABLE: 'available',
  NOT_AVAILABLE: 'not-available',
  DOWNLOADING: 'downloading',
  DOWNLOADED: 'downloaded',
  ERROR: 'error',
};

const UPDATER_CHANNELS = {
  CHECK: 'updater:check',
  DOWNLOAD: 'updater:download',
  INSTALL: 'updater:install',
  GET_STATUS: 'updater:get-status',
  STATUS_CHANGED: 'updater:status-changed',
  DOWNLOAD_PROGRESS: 'updater:download-progress',
  ERROR: 'updater:error',
};

module.exports = {
  UPDATE_STATUS,
  UPDATER_CHANNELS,
};
