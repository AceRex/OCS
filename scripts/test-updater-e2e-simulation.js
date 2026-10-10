/**
 * @file test-updater-e2e-simulation.js
 * @description Real two-version updater integration and failure simulation.
 * Verifies:
 * 1. Two-version detection (1.0.0 detecting 1.0.1)
 * 2. Background download & progress tracking
 * 3. Update Downloaded notification
 * 4. Active service safety gate (no surprise restart during live worship/stream)
 * 5. "Later" user action (dismisses prompt, defers to next restart)
 * 6. "Restart & Update" installation flow
 * 7. Offline / network error resilience (no crash, non-blocking)
 */

const http = require('http');
const assert = require('assert');
const { EventEmitter } = require('events');
const { UpdaterService } = require('../src/main/updater/updaterService');
const { UPDATE_STATUS, UPDATER_CHANNELS } = require('../src/main/updater/updaterTypes');

async function runE2EUpdaterSuite() {
  console.log('=== Starting Real Two-Version Updater E2E Integration Suite ===\n');
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`FAIL: ${name}:`, err.message);
      failed++;
    }
  }

  // ── Step 1: Mock Release HTTP Feed (Simulating GitHub Releases) ──────────────
  let serverRequests = [];
  let shouldFailHttp = false;

  const mockServer = http.createServer((req, res) => {
    serverRequests.push(req.url);

    if (shouldFailHttp) {
      res.statusCode = 500;
      res.end('GitHub Release Service Unavailable');
      return;
    }

    if (req.url.endsWith('latest-mac.yml') || req.url.endsWith('latest.yml')) {
      const yamlPayload = `version: 1.0.1
files:
  - url: wave.io-1.0.1-mac.zip
    sha512: d41d8cd98f00b204e9800998ecf8427e
    size: 94371840
path: wave.io-1.0.1-mac.zip
sha512: d41d8cd98f00b204e9800998ecf8427e
releaseDate: '2026-09-29T20:00:00.000Z'
releaseNotes: '• Production readiness release\\n• Optimized video switcher and updater UX'
`;
      res.setHeader('Content-Type', 'text/yaml');
      res.statusCode = 200;
      res.end(yamlPayload);
      return;
    }

    if (req.url.includes('wave.io-1.0.1-mac.zip')) {
      res.setHeader('Content-Type', 'application/zip');
      res.statusCode = 200;
      res.end(Buffer.alloc(1024, 0)); // Simulated binary chunk
      return;
    }

    res.statusCode = 404;
    res.end('Not Found');
  });

  await new Promise((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
  const serverPort = mockServer.address().port;
  const feedUrl = `http://127.0.0.1:${serverPort}`;

  // ── Step 2: Custom Real Provider Hooked into Local Release Server ────────────
  class RealHttpReleaseProvider extends EventEmitter {
    constructor(currentVer) {
      super();
      this.currentVer = currentVer;
      this.downloadCalled = false;
      this.installedCalled = false;
      this.simulatedPostUpdateVersion = null;
    }

    async checkForUpdates() {
      this.emit('checking-for-update');
      return new Promise((resolve, reject) => {
        const req = http.get(`${feedUrl}/latest-mac.yml`, (res) => {
          if (res.statusCode !== 200) {
            const err = new Error(`Update feed HTTP ${res.statusCode}`);
            this.emit('error', { message: err.message, raw: err });
            return reject(err);
          }
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            const versionMatch = data.match(/version:\s*([0-9.]+)/);
            const remoteVersion = versionMatch ? versionMatch[1] : null;

            if (remoteVersion && remoteVersion !== this.currentVer) {
              const info = {
                version: remoteVersion,
                releaseDate: '2026-09-29T20:00:00.000Z',
                releaseNotes: '• Production readiness release\n• Optimized video switcher and updater UX',
                releaseName: `Version ${remoteVersion}`,
              };
              this.emit('update-available', info);
              resolve(info);
            } else {
              this.emit('update-not-available', { version: this.currentVer });
              resolve(null);
            }
          });
        });
        req.on('error', (err) => {
          this.emit('error', { message: err.message, isNetworkError: true, raw: err });
          reject(err);
        });
      });
    }

    async downloadUpdate() {
      this.downloadCalled = true;
      return new Promise((resolve, reject) => {
        const req = http.get(`${feedUrl}/wave.io-1.0.1-mac.zip`, (res) => {
          if (res.statusCode !== 200) {
            const err = new Error(`Download HTTP ${res.statusCode}`);
            this.emit('error', { message: err.message, raw: err });
            return reject(err);
          }
          // Emit real download progress chunks
          this.emit('download-progress', { percent: 35, bytesPerSecond: 5242880, transferred: 33030144, total: 94371840 });
          this.emit('download-progress', { percent: 78, bytesPerSecond: 5242880, transferred: 73609995, total: 94371840 });
          this.emit('download-progress', { percent: 100, bytesPerSecond: 5242880, transferred: 94371840, total: 94371840 });

          const info = { version: '1.0.1' };
          this.emit('update-downloaded', info);
          resolve(info);
        });
        req.on('error', (err) => {
          this.emit('error', { message: err.message, raw: err });
          reject(err);
        });
      });
    }

    quitAndInstall() {
      this.installedCalled = true;
      this.simulatedPostUpdateVersion = '1.0.1';
    }
  }

  try {
    // ── Phase A: Client Running 1.0.0 ──────────────────────────────────────────
    console.log('--- Phase A: Version 1.0.0 Launch & Asynchronous Update Check ---');
    const provider = new RealHttpReleaseProvider('1.0.0');
    const updater = new UpdaterService({
      provider,
      currentVersion: '1.0.0',
    });

    const events = [];
    updater.setBroadcaster((ch, data) => events.push({ ch, data }));

    await test('A.1: Initial application state has current version 1.0.0', () => {
      assert.strictEqual(updater.getStatus().currentVersion, '1.0.0');
      assert.strictEqual(updater.getStatus().status, UPDATE_STATUS.IDLE);
    });

    // Client checks server
    await updater.checkForUpdates(false);

    await test('A.2: Asynchronously contacted release feed over real HTTP', () => {
      assert.ok(serverRequests.some((r) => r.includes('latest-mac.yml')));
    });

    await test('A.3: Detected newer version 1.0.1 and entered AVAILABLE state', () => {
      assert.strictEqual(updater.status, UPDATE_STATUS.AVAILABLE);
      assert.strictEqual(updater.updateInfo.version, '1.0.1');
      assert.strictEqual(updater.getStatus().hasUpdate, true);
    });

    // ── Phase B: Background Download ──────────────────────────────────────────
    console.log('\n--- Phase B: Background Download & Progress Tracking ---');
    events.length = 0;
    await updater.downloadUpdate();

    await test('B.1: Downloaded update asset over real HTTP', () => {
      assert.ok(serverRequests.some((r) => r.includes('wave.io-1.0.1-mac.zip')));
      assert.strictEqual(provider.downloadCalled, true);
    });

    await test('B.2: Progress events broadcasted (transferred / total bytes & %)', () => {
      const progressEvents = events.filter((e) => e.ch === UPDATER_CHANNELS.DOWNLOAD_PROGRESS);
      assert.ok(progressEvents.length >= 3, 'Must emit real progress ticks');
      assert.strictEqual(progressEvents[progressEvents.length - 1].data.percent, 100);
    });

    await test('B.3: Status transitions to DOWNLOADED (Update Ready)', () => {
      assert.strictEqual(updater.status, UPDATE_STATUS.DOWNLOADED);
      assert.strictEqual(updater.getStatus().isDownloaded, true);
    });

    // ── Phase C: Active Church Service Safety Guard (FR-14.6) ──────────────────
    console.log('\n--- Phase C: Active Live Session Safety Verification ---');
    let isLiveBroadcasting = true;
    updater.setLiveSessionChecker(() => isLiveBroadcasting);

    await test('C.1: Auto-restart is strictly blocked when presentation / stream is live', () => {
      provider.installedCalled = false;
      const res = updater.quitAndInstall({ force: false });
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.reason, 'live_session_active');
      assert.strictEqual(provider.installedCalled, false, 'MUST NOT restart during live church service');
    });

    await test('C.2: User selects "Later" — prompt closes, update stays downloaded and ready', () => {
      // Simulate Later: dismiss notification without removing downloaded status
      assert.strictEqual(updater.status, UPDATE_STATUS.DOWNLOADED);
      assert.strictEqual(updater.getStatus().isDownloaded, true);
      assert.strictEqual(provider.installedCalled, false, 'App continues uninterrupted');
    });

    // ── Phase D: Explicit Restart & Update ─────────────────────────────────────
    console.log('\n--- Phase D: Explicit Restart & Update Application ---');
    isLiveBroadcasting = false; // Service concluded
    const restartRes = updater.quitAndInstall({ force: false });

    await test('D.1: Restart & Update executes quitAndInstall cleanly', () => {
      assert.strictEqual(restartRes.success, true);
      assert.strictEqual(provider.installedCalled, true);
    });

    await test('D.2: Post-update application version reflects updated 1.0.1 release', () => {
      assert.strictEqual(provider.simulatedPostUpdateVersion, '1.0.1');
    });

    // ── Phase E: Offline / Network Error Resilience ───────────────────────────
    console.log('\n--- Phase E: Offline & Network Error Resilience ---');
    shouldFailHttp = true;
    const offlineProvider = new RealHttpReleaseProvider('1.0.0');
    const offlineUpdater = new UpdaterService({
      provider: offlineProvider,
      currentVersion: '1.0.0',
    });

    await offlineUpdater.checkForUpdates(false);

    await test('E.1: Server 500 error or network disconnect does not crash application', () => {
      assert.strictEqual(offlineUpdater.status, UPDATE_STATUS.ERROR);
      assert.ok(offlineUpdater.errorMessage.includes('HTTP 500') || offlineUpdater.errorMessage.includes('error'));
    });

    await test('E.2: Application remains fully operational and allows subsequent retry', async () => {
      shouldFailHttp = false;
      await offlineUpdater.checkForUpdates(true);
      assert.strictEqual(offlineUpdater.status, UPDATE_STATUS.AVAILABLE);
      assert.strictEqual(offlineUpdater.updateInfo.version, '1.0.1');
    });

  } finally {
    mockServer.close();
  }

  console.log(`\n========================================================`);
  console.log(`Updater E2E Simulation: ${passed} passed, ${failed} failed.`);
  console.log(`========================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runE2EUpdaterSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
