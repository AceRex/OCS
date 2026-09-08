/**
 * OCS Service State Journal — P0-03 Live Execution Recovery
 *
 * Implements an atomic, high-performance SQLite WAL journal that records
 * discrete live service mutations (slide advances, camera cuts, timer changes,
 * agenda transitions) without writing high-frequency ticks to disk.
 *
 * Designed to survive process crashes, power flickers, and unhandled restarts.
 */

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');

class ServiceJournal {
  constructor() {
    this.db = null;
    this.isInitialized = false;
    this.activeSessionId = null;
    this._eventCounter = 0;
    this._snapshotInterval = 50; // Snapshot every 50 events
  }

  /**
   * Initializes the SQLite journal at the specified path.
   * Enables Write-Ahead Logging (WAL) for high concurrency and crash resilience.
   *
   * @param {string} dbDir - Directory to store service_journal.db
   * @returns {Promise<void>}
   */
  init(dbDir) {
    return new Promise((resolve, reject) => {
      try {
        if (!fs.existsSync(dbDir)) {
          fs.mkdirSync(dbDir, { recursive: true });
        }
        const dbPath = path.join(dbDir, 'service_journal.db');
        this.db = new sqlite3.Database(dbPath, (err) => {
          if (err) {
            console.error('[ServiceJournal] Failed to open SQLite journal:', err.message);
            return reject(err);
          }

          // Enable WAL mode and pragmatic performance invariants
          this.db.serialize(() => {
            this.db.run('PRAGMA journal_mode = WAL;');
            this.db.run('PRAGMA synchronous = NORMAL;');
            this.db.run('PRAGMA temp_store = MEMORY;');

            // Schema creation
            this.db.run(`
              CREATE TABLE IF NOT EXISTS service_sessions (
                session_id TEXT PRIMARY KEY,
                started_at INTEGER NOT NULL,
                closed_at INTEGER,
                clean_exit INTEGER DEFAULT 0,
                title TEXT
              );
            `);

            this.db.run(`
              CREATE TABLE IF NOT EXISTS service_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                last_event_id INTEGER DEFAULT 0,
                state_json TEXT NOT NULL
              );
            `);

            this.db.run(`
              CREATE TABLE IF NOT EXISTS service_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                event_type TEXT NOT NULL,
                payload_json TEXT NOT NULL
              );
            `);

            this.db.run(`
              CREATE INDEX IF NOT EXISTS idx_events_session ON service_events(session_id, id);
            `, (err) => {
              if (err) {
                console.error('[ServiceJournal] Schema creation error:', err.message);
                return reject(err);
              }
              this.isInitialized = true;
              console.log('[ServiceJournal] Initialized SQLite WAL journal at:', dbPath);
              resolve();
            });
          });
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Starts a new service session or attaches to an existing one.
   * Marks clean_exit = 0 (dirty until explicitly closed).
   *
   * @param {string} [title] - Human readable title
   * @param {string} [customSessionId] - Optional explicit session ID
   * @returns {Promise<string>} Active session ID
   */
  startSession(title = 'Sunday Service', customSessionId = null) {
    if (!this.isInitialized || !this.db) return Promise.resolve(null);
    const sessionId = customSessionId || `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.activeSessionId = sessionId;
    this._eventCounter = 0;
    this._lastEventId = 0;
    const now = Date.now();

    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO service_sessions (session_id, started_at, clean_exit, title)
        VALUES (?, ?, 0, ?)
        ON CONFLICT(session_id) DO UPDATE SET title = excluded.title;
      `;
      this.db.run(sql, [sessionId, now, title], (err) => {
        if (err) {
          console.error('[ServiceJournal] Failed to start session:', err.message);
          return reject(err);
        }
        resolve(sessionId);
      });
    });
  }

  /**
   * Records a discrete state change event atomically.
   *
   * @param {string} eventType - e.g. 'SLIDE_CHANGED', 'CAM_CUT', 'TIMER_STARTED'
   * @param {object} payload - Event payload data
   * @param {string} [sessionId] - Optional session override
   * @returns {Promise<number>} - Inserted event ID
   */
  recordEvent(eventType, payload, sessionId = null) {
    if (!this.isInitialized || !this.db) return Promise.resolve(-1);
    const sid = sessionId || this.activeSessionId;
    if (!sid) return Promise.resolve(-1);

    const now = Date.now();
    const payloadStr = JSON.stringify(payload || {});

    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO service_events (session_id, timestamp, event_type, payload_json)
        VALUES (?, ?, ?, ?);
      `;
      const self = this;
      this.db.run(sql, [sid, now, eventType, payloadStr], function (err) {
        if (err) {
          console.error(`[ServiceJournal] Failed to record event [${eventType}]:`, err.message);
          return reject(err);
        }
        self._eventCounter++;
        self._lastEventId = this.lastID;
        resolve(this.lastID);
      });
    });
  }

  /**
   * Takes a full snapshot of the reconstructed service state.
   */
  takeSnapshot(state, sessionId = null) {
    if (!this.isInitialized || !this.db) return Promise.resolve(-1);
    const sid = sessionId || this.activeSessionId;
    if (!sid) return Promise.resolve(-1);

    const now = Date.now();
    const stateStr = JSON.stringify(state || {});
    const lastEvId = this._lastEventId || 0;

    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO service_snapshots (session_id, timestamp, last_event_id, state_json)
        VALUES (?, ?, ?, ?);
      `;
      this.db.run(sql, [sid, now, lastEvId, stateStr], function (err) {
        if (err) {
          console.error('[ServiceJournal] Failed to save snapshot:', err.message);
          return reject(err);
        }
        resolve(this.lastID);
      });
    });
  }

  /**
   * Marks a session as cleanly exited upon intentional app shutdown.
   */
  markCleanExit(sessionId = null) {
    if (!this.isInitialized || !this.db) return Promise.resolve();
    const sid = sessionId || this.activeSessionId;
    if (!sid) return Promise.resolve();

    const now = Date.now();
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE service_sessions
        SET closed_at = ?, clean_exit = 1
        WHERE session_id = ?;
      `;
      this.db.run(sql, [now, sid], (err) => {
        if (err) {
          console.error('[ServiceJournal] Failed to mark clean exit:', err.message);
          return reject(err);
        }
        resolve();
      });
    });
  }

  /**
   * Discovers if there is an active session that did NOT exit cleanly (dirty shutdown).
   *
   * @returns {Promise<object|null>} The unclosed session record or null
   */
  getUnclosedSession() {
    if (!this.isInitialized || !this.db) return Promise.resolve(null);

    return new Promise((resolve, reject) => {
      const sql = `
        SELECT session_id, started_at, title
        FROM service_sessions
        WHERE clean_exit = 0
        ORDER BY started_at DESC
        LIMIT 1;
      `;
      this.db.get(sql, [], (err, row) => {
        if (err) {
          console.error('[ServiceJournal] Error checking unclosed session:', err.message);
          return reject(err);
        }
        resolve(row || null);
      });
    });
  }

  /**
   * Retrieves the latest snapshot for a session.
   */
  getLatestSnapshot(sessionId) {
    if (!this.isInitialized || !this.db) return Promise.resolve(null);

    return new Promise((resolve, reject) => {
      const sql = `
        SELECT id, timestamp, last_event_id, state_json
        FROM service_snapshots
        WHERE session_id = ?
        ORDER BY id DESC
        LIMIT 1;
      `;
      this.db.get(sql, [sessionId], (err, row) => {
        if (err) return reject(err);
        if (!row) return resolve(null);
        try {
          resolve({
            id: row.id,
            timestamp: row.timestamp,
            lastEventId: row.last_event_id || 0,
            state: JSON.parse(row.state_json),
          });
        } catch (parseErr) {
          console.error('[ServiceJournal] Corrupted snapshot JSON:', parseErr.message);
          resolve(null);
        }
      });
    });
  }

  /**
   * Retrieves all events for a session occurring after a given event ID.
   */
  getEventsAfterEventId(sessionId, lastEventId = 0) {
    if (!this.isInitialized || !this.db) return Promise.resolve([]);

    return new Promise((resolve, reject) => {
      const sql = lastEventId > 0
        ? `SELECT id, timestamp, event_type, payload_json FROM service_events WHERE session_id = ? AND id > ? ORDER BY id ASC;`
        : `SELECT id, timestamp, event_type, payload_json FROM service_events WHERE session_id = ? ORDER BY id ASC;`;

      const params = lastEventId > 0 ? [sessionId, lastEventId] : [sessionId];

      this.db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        const events = (rows || []).map((r) => {
          let payload = {};
          try {
            payload = JSON.parse(r.payload_json);
          } catch (_) {}
          return {
            id: r.id,
            timestamp: r.timestamp,
            eventType: r.event_type,
            payload,
          };
        });
        resolve(events);
      });
    });
  }

  /**
   * Alias for takeSnapshot
   */
  saveSnapshot(state, sessionId = null) {
    return this.takeSnapshot(state, sessionId);
  }

  /**
   * Checks if there was a dirty shutdown.
   *
   * @returns {Promise<{crashed: boolean, session: object|null}>}
   */
  async checkDirtyShutdown() {
    const unclosed = await this.getUnclosedSession();
    return {
      crashed: Boolean(unclosed),
      session: unclosed
        ? {
            sessionId: unclosed.session_id,
            startedAt: unclosed.started_at,
            title: unclosed.title,
          }
        : null,
    };
  }

  /**
   * Applies an event onto an accumulated state dictionary.
   */
  applyEventToState(baseState, event) {
    const state = JSON.parse(JSON.stringify(baseState || {}));
    const { eventType, payload } = event;

    if (!payload) return state;

    switch (eventType) {
      case 'SLIDE_CHANGE':
        state.presentation = state.presentation || {};
        if (payload.activePresentationId !== undefined) state.presentation.activePresentationId = payload.activePresentationId;
        if (payload.activeSlideIndex !== undefined) state.presentation.activeSlideIndex = payload.activeSlideIndex;
        if (payload.slideTitle !== undefined) state.presentation.slideTitle = payload.slideTitle;
        break;
      case 'CAMERA_CUT':
        state.camera = state.camera || {};
        if (payload.activeSlot !== undefined) state.camera.activeSlot = payload.activeSlot;
        if (payload.transition !== undefined) state.camera.transition = payload.transition;
        break;
      case 'AGENDA_ADVANCE':
      case 'AGENDA_CHANGE':
        state.agenda = state.agenda || {};
        if (payload.currentItemIndex !== undefined) state.agenda.currentItemIndex = payload.currentItemIndex;
        if (payload.completedItems !== undefined) state.agenda.completedItems = payload.completedItems;
        break;
      case 'TIMER_START':
      case 'TIMER_UPDATE':
      case 'TIMER_STOP':
        state.timer = state.timer || {};
        if (payload.durationSec !== undefined) state.timer.durationSec = payload.durationSec;
        if (payload.totalSec !== undefined && payload.durationSec === undefined) state.timer.durationSec = payload.totalSec;
        if (payload.remainingSec !== undefined) state.timer.remainingSec = payload.remainingSec;
        if (payload.type !== undefined) state.timer.type = payload.type;
        if (payload.isRunning !== undefined) state.timer.isRunning = payload.isRunning;
        break;
      case 'AUDIO_UPDATE':
        state.audio = state.audio || {};
        if (payload.masterGain !== undefined) state.audio.masterGain = payload.masterGain;
        if (payload.channelsMuted !== undefined) state.audio.channelsMuted = payload.channelsMuted;
        break;
      case 'STREAM_STATE':
        state.streaming = state.streaming || {};
        if (payload.isStreaming !== undefined) state.streaming.isStreaming = payload.isStreaming;
        if (payload.isRecording !== undefined) state.streaming.isRecording = payload.isRecording;
        if (payload.targetUrl !== undefined) state.streaming.targetUrl = payload.targetUrl;
        break;
      default:
        // Generic property merge if object
        if (typeof payload === 'object') {
          Object.assign(state, payload);
        }
    }
    return state;
  }

  /**
   * Rehydrates the latest service state by loading the latest snapshot
   * and sequentially replaying events recorded after the snapshot.
   */
  async getLastState(sessionId) {
    const snapshotObj = await this.getLatestSnapshot(sessionId);
    let state = snapshotObj && snapshotObj.state ? snapshotObj.state : {};
    const lastEventId = snapshotObj ? (snapshotObj.lastEventId || 0) : 0;
    const events = await this.getEventsAfterEventId(sessionId, lastEventId);

    for (const ev of events) {
      state = this.applyEventToState(state, ev);
    }
    return state;
  }

  /**
   * Closes the SQLite connection cleanly.
   */
  close() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close(() => {
          this.db = null;
          this.isInitialized = false;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

const serviceJournal = new ServiceJournal();
module.exports = { ServiceJournal, serviceJournal };

