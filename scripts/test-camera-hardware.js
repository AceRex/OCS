/**
 * test-camera-hardware.js
 *
 * Direct test of macOS Electron camera hardware access and constraints.
 */
const { app, BrowserWindow, systemPreferences, session } = require('electron');

app.whenReady().then(async () => {
  console.log('--- SYSTEM MEDIA ACCESS STATUS ---');
  console.log('Camera status:', systemPreferences.getMediaAccessStatus ? systemPreferences.getMediaAccessStatus('camera') : 'N/A');
  console.log('Mic status:', systemPreferences.getMediaAccessStatus ? systemPreferences.getMediaAccessStatus('microphone') : 'N/A');

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    console.log('[PermissionRequest]', permission, details);
    callback(true);
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission, origin, details) => {
    console.log('[PermissionCheck]', permission, origin, details);
    return true;
  });

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: require('path').join(__dirname, '..', 'preload.js'),
    },
  });

  await win.loadFile(require('path').join(__dirname, '..', 'controller.html'));

  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const report = { devices: [], attempts: [] };
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        report.devices = devs.map(d => ({ kind: d.kind, label: d.label, deviceId: d.deviceId }));
      } catch (e) {
        report.enumerateError = e.message;
      }

      // Test 1: Old Test Camera constraint (1080p @ 60fps)
      try {
        const s1 = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } }
        });
        report.attempts.push({ name: 'old-test-camera-60fps', success: true, tracks: s1.getVideoTracks().map(t => t.getSettings()) });
        s1.getTracks().forEach(t => t.stop());
      } catch (e) {
        report.attempts.push({ name: 'old-test-camera-60fps', success: false, errorName: e.name, errorMessage: e.message });
      }

      // Test 2: Old Desktop Camera constraint (facingMode: "user")
      try {
        const s2 = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 }, frameRate: { ideal: 30, max: 60 }, facingMode: 'user' }
        });
        report.attempts.push({ name: 'old-desktop-facingMode-user', success: true, tracks: s2.getVideoTracks().map(t => t.getSettings()) });
        s2.getTracks().forEach(t => t.stop());
      } catch (e) {
        report.attempts.push({ name: 'old-desktop-facingMode-user', success: false, errorName: e.name, errorMessage: e.message });
      }

      // Test 3: New Standard 720p 30fps constraint (no facingMode)
      try {
        const s3 = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
        });
        report.attempts.push({ name: 'new-standard-720p', success: true, tracks: s3.getVideoTracks().map(t => t.getSettings()) });
        s3.getTracks().forEach(t => t.stop());
      } catch (e) {
        report.attempts.push({ name: 'new-standard-720p', success: false, errorName: e.name, errorMessage: e.message });
      }

      // Test 4: Unconstrained video: true
      try {
        const s4 = await navigator.mediaDevices.getUserMedia({ video: true });
        report.attempts.push({ name: 'unconstrained-video-true', success: true, tracks: s4.getVideoTracks().map(t => t.getSettings()) });
        s4.getTracks().forEach(t => t.stop());
      } catch (e) {
        report.attempts.push({ name: 'unconstrained-video-true', success: false, errorName: e.name, errorMessage: e.message });
      }

      return report;
    })()
  `);

  console.log('--- CAMERA HARDWARE & CONSTRAINT TEST REPORT ---');
  console.log(JSON.stringify(result, null, 2));

  app.quit();
});
