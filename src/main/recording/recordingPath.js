const path = require('path');
const fs = require('fs');

/**
 * Generates a deterministic date-partitioned recording path:
 * ~/Movies/OCS Recordings/YYYY/MM/DD/OCS_YYYY-MM-DD_HH-mm-ss.mp4
 *
 * @param {string|null} baseDir - Optional base directory override
 * @param {string|null} customFilename - Optional custom filename
 * @param {Object|null} appRef - Optional Electron app reference
 * @returns {string} Fully resolved absolute recording file path
 */
function getDeterministicRecordingPath(baseDir = null, customFilename = null, appRef = null) {
  const d = new Date();
  const year = String(d.getFullYear());
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  let resolvedBase = baseDir;
  if (!resolvedBase) {
    try {
      let electronApp = appRef;
      if (!electronApp) {
        try {
          const electron = require('electron');
          electronApp = electron.app || (electron.remote ? electron.remote.app : null);
        } catch (_) {}
      }

      if (electronApp && typeof electronApp.getPath === 'function') {
        const videosDir = electronApp.getPath('videos');
        if (videosDir && fs.existsSync(videosDir)) {
          resolvedBase = path.join(videosDir, 'OCS Recordings');
        } else {
          resolvedBase = path.join(electronApp.getPath('userData'), 'recordings');
        }
      }
    } catch (_) {}
  }

  if (!resolvedBase) {
    const os = require('os');
    const homeVideos = path.join(os.homedir(), 'Movies');
    if (fs.existsSync(homeVideos)) {
      resolvedBase = path.join(homeVideos, 'OCS Recordings');
    } else {
      resolvedBase = path.join(os.homedir(), 'Videos');
      if (!fs.existsSync(resolvedBase)) {
        resolvedBase = path.join(os.tmpdir(), 'OCS Recordings');
      } else {
        resolvedBase = path.join(resolvedBase, 'OCS Recordings');
      }
    }
  }

  const dateSubdir = path.join(resolvedBase, year, month, day);
  if (!fs.existsSync(dateSubdir)) {
    fs.mkdirSync(dateSubdir, { recursive: true });
  }

  const filename = customFilename || `OCS_${year}-${month}-${day}_${hours}-${minutes}-${seconds}.mp4`;
  return path.join(dateSubdir, filename);
}

module.exports = {
  getDeterministicRecordingPath,
};
