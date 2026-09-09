/**
 * OCS Production Recording Index
 *
 * Maintains a persistent JSON index of all program MP4 recording sessions.
 * Stored at: {userData}/recordings/index.json
 *
 * This is intentionally SEPARATE from the Whisper/transcription sessionArchive.
 * Program recordings are production artifacts belonging to a "Production Session"
 * model, not the NLP/transcription model.
 *
 * Features:
 * - Atomic writes (write to .tmp, rename) — survives crash during write
 * - ffprobe validation of completed recordings via ffmpeg -i stderr
 * - Explicit status: recording | completed | failed | incomplete | missing | corrupted
 * - Restart persistence — survives full app restart
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');

const INDEX_FILE = 'index.json';
const TMP_SUFFIX = '.tmp';
const SCHEMA_VERSION = 1;

class RecordingIndex {
  /**
   * @param {string} recordingsDir - Absolute path to recordings directory
   * @param {string|null} ffmpegPath - Path to ffmpeg binary for media probing
   */
  constructor(recordingsDir, ffmpegPath = null) {
    this.recordingsDir = recordingsDir;
    this.ffmpegPath = ffmpegPath;
    this._indexPath = path.join(recordingsDir, INDEX_FILE);
    this._cache = null;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Creates and persists a new production recording session entry.
   * Called at recording START so a partial entry exists even if the app crashes.
   */
  createEntry(opts = {}) {
    const id = opts.id || crypto.randomUUID();
    const now = opts.startedAt || Date.now();
    const entry = {
      id,
      type: 'recording',
      title: opts.title || `Recording — ${new Date(now).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
      outputPath: opts.outputPath || null,
      filename: opts.outputPath ? path.basename(opts.outputPath) : null,
      startedAt: now,
      endedAt: null,
      durationSec: null,
      bytesWritten: null,
      framesRecorded: null,
      status: 'recording',
      probeOk: false,
      codec: null,
      container: null,
      width: opts.width || null,
      height: opts.height || null,
      fps: opts.fps || null,
      error: null,
      createdAt: now,
      updatedAt: now,
    };

    const data = this._load();
    // Remove any lingering 'recording' entries (crash leftovers)
    data.entries = data.entries.map(e =>
      e.status === 'recording' ? { ...e, status: 'incomplete', error: 'Interrupted by new session', updatedAt: Date.now() } : e
    );
    data.entries.unshift(entry);
    this._save(data);
    return entry;
  }

  /**
   * Partial patch update. Merges patch onto existing entry.
   */
  updateEntry(id, patch) {
    const data = this._load();
    const idx = data.entries.findIndex(e => e.id === id);
    if (idx < 0) return null;
    data.entries[idx] = { ...data.entries[idx], ...patch, id, updatedAt: Date.now() };
    this._save(data);
    return data.entries[idx];
  }

  /**
   * Finalizes a recording entry after programRecorder.stop() resolves.
   * Runs media validation via ffmpeg -i and sets explicit status.
   */
  finalizeEntry(id, result = {}) {
    const { outputPath, durationSec, bytesWritten, framesRecorded } = result;
    const now = Date.now();

    let status = 'completed';
    let probeOk = false;
    let codec = null;
    let container = null;
    let probedDuration = null;
    let probedBytes = null;
    let error = null;

    if (!outputPath || !fs.existsSync(outputPath)) {
      status = 'missing';
      error = `Output file not found: ${outputPath}`;
    } else {
      probedBytes = (() => { try { return fs.statSync(outputPath).size; } catch (_) { return 0; } })();

      if (probedBytes < 512) {
        status = 'incomplete';
        error = `File too small (${probedBytes} bytes) — likely no frames written`;
      } else {
        const probe = this._probeMp4(outputPath);
        probeOk  = probe.ok;
        codec    = probe.codec;
        container = probe.container;
        probedDuration = probe.durationSec;

        if (!probeOk) {
          status = 'corrupted';
          error  = probe.error || 'Media file could not be validated';
        } else if (probedDuration !== null && probedDuration < 0.5) {
          status = 'incomplete';
          error  = `Recording duration too short: ${probedDuration.toFixed(2)}s`;
        }
      }
    }

    return this.updateEntry(id, {
      endedAt:        now,
      durationSec:    probedDuration ?? (typeof durationSec === 'number' ? durationSec : null),
      bytesWritten:   probedBytes  ?? bytesWritten ?? null,
      framesRecorded: framesRecorded ?? null,
      status,
      probeOk,
      codec,
      container,
      error,
    });
  }

  /**
   * Returns all entries newest-first. Reconciles missing-file entries.
   */
  listEntries() {
    const data = this._load();
    let dirty = false;
    for (const entry of data.entries) {
      if (entry.status === 'completed' && entry.outputPath && !fs.existsSync(entry.outputPath)) {
        entry.status    = 'missing';
        entry.updatedAt = Date.now();
        dirty = true;
      }
    }
    if (dirty) this._save(data);
    return data.entries;
  }

  getEntry(id) {
    return this._load().entries.find(e => e.id === id) || null;
  }

  deleteEntry(id, deleteFile = false) {
    const data = this._load();
    const entry = data.entries.find(e => e.id === id);
    if (entry && deleteFile && entry.outputPath && fs.existsSync(entry.outputPath)) {
      try { fs.unlinkSync(entry.outputPath); } catch (_) {}
    }
    data.entries = data.entries.filter(e => e.id !== id);
    this._save(data);
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  _load() {
    if (this._cache) return JSON.parse(JSON.stringify(this._cache));
    try {
      if (fs.existsSync(this._indexPath)) {
        const parsed = JSON.parse(fs.readFileSync(this._indexPath, 'utf8'));
        this._cache = parsed;
        return JSON.parse(JSON.stringify(parsed));
      }
    } catch (_) {
      console.error('[RecordingIndex] Index corrupted or unreadable — starting fresh');
    }
    return { schemaVersion: SCHEMA_VERSION, entries: [] };
  }

  _save(data) {
    this._cache = JSON.parse(JSON.stringify(data));
    try {
      if (!fs.existsSync(this.recordingsDir)) {
        fs.mkdirSync(this.recordingsDir, { recursive: true });
      }
      const tmpPath = this._indexPath + TMP_SUFFIX;
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmpPath, this._indexPath); // atomic on POSIX
    } catch (err) {
      console.error('[RecordingIndex] Save failed:', err.message);
    }
  }

  /** Extracts media metadata via ffmpeg -i stderr (no ffprobe binary needed). */
  _probeMp4(filePath) {
    if (!this.ffmpegPath) {
      return { ok: true, codec: null, container: 'mp4', durationSec: null, error: null };
    }
    try {
      const res = spawnSync(this.ffmpegPath, ['-i', filePath], {
        encoding: 'utf8',
        timeout:  5000,
        stdio:    ['ignore', 'ignore', 'pipe'],
      });
      const s = res.stderr || '';

      const durMatch = s.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      let durationSec = null;
      if (durMatch) {
        durationSec = parseInt(durMatch[1], 10) * 3600
                    + parseInt(durMatch[2], 10) * 60
                    + parseFloat(durMatch[3]);
      }
      const codecMatch     = s.match(/Video:\s*(\w+)/);
      const containerMatch = s.match(/Input #0,\s*([^,]+),/);

      const ok = durMatch !== null;
      return {
        ok,
        codec:     codecMatch     ? codecMatch[1]     : null,
        container: containerMatch ? containerMatch[1].trim() : 'mp4',
        durationSec,
        error: ok ? null : 'Could not extract duration from ffmpeg output',
      };
    } catch (err) {
      return { ok: false, codec: null, container: null, durationSec: null, error: err.message };
    }
  }
}

module.exports = { RecordingIndex };
