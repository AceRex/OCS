/**
 * @file test-updater-pipeline.js
 * @description Comprehensive automated unit and integration tests for OCS Desktop Auto-Updater.
 */

const { EventEmitter } = require('events');
const assert = require('assert');
const { UPDATE_STATUS, UPDATER_CHANNELS } = require('../src/main/updater/updaterTypes');
const { UpdaterService } = require('../src/main/updater/updaterService');

class MockUpdateProvider extends EventEmitter {
  constructor() {
    super();
    this.installedCalled = false;
    this.downloadCalled = false;
    this.shouldErrorOnCheck = false;
    this.shouldErrorOnDownload = false;
    this.availableVersion = '1.1.0';
  }

  async checkForUpdates() {
    this.emit('checking-for-update');
    await new Promise((r) => setTimeout(r, 20));

    if (this.shouldErrorOnCheck) {
      const err = new Error('net::ERR_INTERNET_DISCONNECTED at https://github.com');
      this.emit('error', { message: err.message, isNetworkError: true, raw: err });
      throw err;
    }

    if (this.availableVersion) {
      const info = {
        version: this.availableVersion,
        releaseDate: '2026-08-24T20:00:00.000Z',
        releaseNotes: '• Real-time lyrics alignment\n• NDI high-throughput engine\n• Offline licensing',
        releaseName: `OCS v${this.availableVersion}`,
      };
      this.emit('update-available', info);
      return info;
    } else {
      this.emit('update-not-available', { version: '1.0.0' });
      return null;
    }
  }

  async downloadUpdate() {
    this.downloadCalled = true;
    if (this.shouldErrorOnDownload) {
      const err = new Error('Download interrupted');
      this.emit('error', { message: err.message, raw: err });
      throw err;
    }

    // Emit simulated progress
    this.emit('download-progress', { percent: 25, bytesPerSecond: 1048576, transferred: 25000000, total: 100000000 });
    this.emit('download-progress', { percent: 75, bytesPerSecond: 2097152, transferred: 75000000, total: 100000000 });
    this.emit('download-progress', { percent: 100, bytesPerSecond: 1048576, transferred: 100000000, total: 100000000 });

    const info = { version: this.availableVersion };
    this.emit('update-downloaded', info);
  }

  quitAndInstall(isSilent, isForceRunAfter) {
    this.installedCalled = true;
  }
}

async function runUpdaterTests() {
  console.log('=== Starting OCS Desktop Auto-Updater Test Suite (PRD FR-14.1–FR-14.8) ===\n');
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ ${name}:`, err.message);
      failed++;
    }
  }

  // --- Test 1: Initial State & Status Structure ---
  const mockProvider = new MockUpdateProvider();
  const service = new UpdaterService({
    provider: mockProvider,
    currentVersion: '1.0.0',
  });

  const broadcasts = [];
  service.setBroadcaster((channel, data) => {
    broadcasts.push({ channel, data });
  });

  test('1.1: Initial status is idle', () => {
    assert.strictEqual(service.status, UPDATE_STATUS.IDLE);
    const s = service.getStatus();
    assert.strictEqual(s.currentVersion, '1.0.0');
    assert.strictEqual(s.hasUpdate, false);
    assert.strictEqual(s.isDownloaded, false);
  });

  // --- Test 2: Check for Update (Available Scenario) ---
  await service.checkForUpdates(true);

  test('2.1: Status transitions to available on new release', () => {
    assert.strictEqual(service.status, UPDATE_STATUS.AVAILABLE);
    assert.strictEqual(service.updateInfo.version, '1.1.0');
    assert.strictEqual(service.getStatus().hasUpdate, true);
  });

  test('2.2: Broadcasted status change events via IPC bridge', () => {
    const statusEvents = broadcasts.filter((b) => b.channel === UPDATER_CHANNELS.STATUS_CHANGED);
    assert.ok(statusEvents.length >= 2, 'Must emit checking and available status events');
    const lastEvent = statusEvents[statusEvents.length - 1];
    assert.strictEqual(lastEvent.data.status, UPDATE_STATUS.AVAILABLE);
    assert.strictEqual(lastEvent.data.updateInfo.version, '1.1.0');
  });

  // --- Test 3: Download Update Flow ---
  broadcasts.length = 0;
  const dlResult = await service.downloadUpdate();

  test('3.1: downloadUpdate initiates and completes with downloaded status', () => {
    assert.strictEqual(dlResult.success, true);
    assert.strictEqual(mockProvider.downloadCalled, true);
    assert.strictEqual(service.status, UPDATE_STATUS.DOWNLOADED);
    assert.strictEqual(service.getStatus().isDownloaded, true);
  });

  test('3.2: Download progress events emitted to renderer', () => {
    const progressEvents = broadcasts.filter((b) => b.channel === UPDATER_CHANNELS.DOWNLOAD_PROGRESS);
    assert.ok(progressEvents.length >= 3, 'Must emit 25%, 75%, 100% progress events');
    assert.strictEqual(progressEvents[progressEvents.length - 1].data.percent, 100);
  });

  // --- Test 4: Live-Session Safety Guard (PRD FR-14.6) ---
  let isLiveActive = true;
  service.setLiveSessionChecker(() => isLiveActive);

  test('4.1: Installation blocked when live session is active (force=false)', () => {
    mockProvider.installedCalled = false;
    const installRes = service.quitAndInstall({ force: false });
    assert.strictEqual(installRes.success, false);
    assert.strictEqual(installRes.reason, 'live_session_active');
    assert.strictEqual(mockProvider.installedCalled, false, 'Must NOT call quitAndInstall during active broadcast');
  });

  test('4.2: Installation proceeds when force=true or session inactive', () => {
    mockProvider.installedCalled = false;
    const forceRes = service.quitAndInstall({ force: true });
    assert.strictEqual(forceRes.success, true);
    assert.strictEqual(mockProvider.installedCalled, true);

    isLiveActive = false;
    mockProvider.installedCalled = false;
    const safeRes = service.quitAndInstall({ force: false });
    assert.strictEqual(safeRes.success, true);
    assert.strictEqual(mockProvider.installedCalled, true);
  });

  // --- Test 5: No Update Available Scenario ---
  const mockUpToDate = new MockUpdateProvider();
  mockUpToDate.availableVersion = null; // Up to date
  const serviceUpToDate = new UpdaterService({
    provider: mockUpToDate,
    currentVersion: '1.0.0',
  });

  await serviceUpToDate.checkForUpdates(true);

  test('5.1: Status transitions to not-available when version matches', () => {
    assert.strictEqual(serviceUpToDate.status, UPDATE_STATUS.NOT_AVAILABLE);
    assert.strictEqual(serviceUpToDate.getStatus().hasUpdate, false);
  });

  // --- Test 6: Offline & Network Error Handling ---
  const mockOffline = new MockUpdateProvider();
  mockOffline.shouldErrorOnCheck = true;
  const serviceOffline = new UpdaterService({
    provider: mockOffline,
    currentVersion: '1.0.0',
  });

  await serviceOffline.checkForUpdates(true);

  test('6.1: Network failure sets error status without crashing', () => {
    assert.strictEqual(serviceOffline.status, UPDATE_STATUS.ERROR);
    assert.ok(serviceOffline.errorMessage.includes('INTERNET_DISCONNECTED') || serviceOffline.errorMessage.includes('network'));
  });

  test('6.2: App remains usable and allows subsequent retry', async () => {
    mockOffline.shouldErrorOnCheck = false;
    mockOffline.availableVersion = '1.2.0';
    await serviceOffline.checkForUpdates(true);
    assert.strictEqual(serviceOffline.status, UPDATE_STATUS.AVAILABLE);
    assert.strictEqual(serviceOffline.updateInfo.version, '1.2.0');
  });

  // --- Test 7: Semantic Versioning Tag Validation ---
  test('7.1: Semantic versioning regex validation', () => {
    const semverRegex = /^v?([0-9]+)\.([0-9]+)\.([0-9]+)(?:-[0-9A-Za-z.-]+)?$/;
    assert.ok(semverRegex.test('v1.0.0'));
    assert.ok(semverRegex.test('v2.1.0'));
    assert.ok(semverRegex.test('1.0.0'));
    assert.strictEqual(semverRegex.test('invalid-version'), false);
  });

  console.log(`\n========================================================`);
  console.log(`OCS Auto-Updater Test Results: ${passed} passed, ${failed} failed.`);
  console.log(`========================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runUpdaterTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
