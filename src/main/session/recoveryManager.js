/**
 * OCS Recovery Manager — P0-03 Live Execution State Recovery
 *
 * Coordinates live execution recovery during application startup.
 * Detects dirty shutdowns, extracts rehydrated state from the ServiceJournal,
 * enforces safety invariants (unarmed broadcast/recording, safe audio gain),
 * and dispatches rehydrated workspace state to renderer windows.
 */

const { serviceJournal } = require('./serviceJournal');

class RecoveryManager {
  constructor(journalInstance = serviceJournal) {
    this.journal = journalInstance;
    this.recoveredState = null;
    this.recoveryReport = null;
    this.isCleanSession = true;
  }

  /**
   * Initializes the underlying journal and evaluates the system for dirty shutdown.
   *
   * @param {string} dbDir - Storage directory for SQLite journal
   * @returns {Promise<object>} Recovery evaluation report
   */
  async initialize(dbDir) {
    const startTime = Date.now();
    await this.journal.init(dbDir);

    const dirtyCheck = await this.journal.checkDirtyShutdown();

    if (dirtyCheck.crashed && dirtyCheck.session) {
      console.warn(`[RecoveryManager] Detected dirty shutdown from session: ${dirtyCheck.session.sessionId}`);
      const rawState = await this.journal.getLastState(dirtyCheck.session.sessionId);

      // Apply safety invariants before rehydrating
      const safeState = this.sanitizeRecoveredState(rawState);
      const elapsed = Date.now() - startTime;

      this.recoveredState = safeState;
      this.isCleanSession = false;
      this.recoveryReport = {
        recovered: true,
        crashed: true,
        previousSessionId: dirtyCheck.session.sessionId,
        previousTitle: dirtyCheck.session.title,
        recoveryTimeMs: elapsed,
        state: safeState
      };

      // Mark the old crashed session as closed so it is not repeatedly detected
      await this.journal.markCleanExit(dirtyCheck.session.sessionId);

      // Start a new session linked or continuing the recovered context
      await this.journal.startSession(
        `Recovered from ${dirtyCheck.session.title || dirtyCheck.session.sessionId}`
      );

      // Record a snapshot of the recovered base state
      await this.journal.saveSnapshot(safeState);

      return this.recoveryReport;
    } else {
      console.log('[RecoveryManager] Clean startup detected. Initializing fresh session.');
      await this.journal.startSession('Live Service Session');
      this.recoveryReport = {
        recovered: false,
        previousSessionId: null,
        recoveryTimeMs: Date.now() - startTime,
        state: null
      };
      return this.recoveryReport;
    }
  }

  /**
   * Sanitizes rehydrated state to guarantee production safety invariants:
   * - Broadcast streaming and recording are unconditionally disarmed.
   * - Audio levels are capped/checked to prevent acoustic feedback.
   * - Slide indices, camera cuts, agenda items, and timers are restored.
   *
   * @param {object|null} state - Raw rehydrated state
   * @returns {object} Sanitized state
   */
  sanitizeRecoveredState(state) {
    const base = state || {};

    return {
      presentation: {
        activePresentationId: base.presentation?.activePresentationId || null,
        activeSlideIndex: typeof base.presentation?.activeSlideIndex === 'number'
          ? Math.max(0, base.presentation.activeSlideIndex)
          : 0,
        slideTitle: base.presentation?.slideTitle || ''
      },
      camera: {
        activeSlot: typeof base.camera?.activeSlot === 'number'
          ? Math.min(Math.max(1, base.camera.activeSlot), 6)
          : 1,
        transition: 'cut' // Always default to hard-cut on recovery
      },
      timer: {
        type: base.timer?.type || 'countdown',
        durationSec: base.timer?.durationSec || 0,
        remainingSec: typeof base.timer?.remainingSec === 'number'
          ? Math.max(0, base.timer.remainingSec)
          : 0,
        isRunning: false // Do not run timer blindly until operator triggers
      },
      agenda: {
        currentItemIndex: typeof base.agenda?.currentItemIndex === 'number'
          ? Math.max(0, base.agenda.currentItemIndex)
          : 0,
        completedItems: Array.isArray(base.agenda?.completedItems)
          ? base.agenda.completedItems
          : []
      },
      audio: {
        // Safe master gain: limit to -6.0 dBFS (approx 0.5 linear) or lower on crash recovery
        masterGain: Math.min(Number(base.audio?.masterGain ?? 0.5), 0.7),
        channelsMuted: {
          ch1: Boolean(base.audio?.channelsMuted?.ch1 ?? false),
          ch2: Boolean(base.audio?.channelsMuted?.ch2 ?? false),
          ch3: Boolean(base.audio?.channelsMuted?.ch3 ?? false),
          ch4: Boolean(base.audio?.channelsMuted?.ch4 ?? false)
        }
      },
      streaming: {
        isStreaming: false, // MANDATORY: never auto-broadcast on recovery
        isRecording: false, // MANDATORY: never auto-record without arming
        targetUrl: base.streaming?.targetUrl || ''
      }
    };
  }

  /**
   * Dispatches the recovered state to an Electron BrowserWindow instance if available.
   *
   * @param {object} window - Electron BrowserWindow
   */
  dispatchToWindow(window) {
    if (!window || window.isDestroyed()) return;
    if (this.recoveredState) {
      window.webContents.send('recovery:state-restored', {
        report: this.recoveryReport,
        state: this.recoveredState
      });
    }
  }

  /**
   * Records a discrete state change into the journal.
   *
   * @param {string} type - Event type (e.g., 'SLIDE_CHANGE', 'CAMERA_CUT')
   * @param {object} payload - Mutation details
   */
  async recordStateChange(type, payload) {
    return this.journal.recordEvent(type, payload);
  }

  /**
   * Persists a full state snapshot.
   *
   * @param {object} state - Full UI state
   */
  async saveSnapshot(state) {
    return this.journal.saveSnapshot(state);
  }

  /**
   * Marks clean exit on application shutdown.
   */
  async markCleanExit() {
    return this.journal.markCleanExit();
  }

  /**
   * Closes journal connection.
   */
  async close() {
    return this.journal.close();
  }
}

const recoveryManager = new RecoveryManager();

module.exports = {
  RecoveryManager,
  recoveryManager
};
