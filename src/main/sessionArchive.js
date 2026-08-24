/**
 * Session Archive — FR-5.10–5.28
 * Deliverables: transcript.pdf + session.mp4 (or session.webm if ffmpeg unavailable)
 * meta.json is app index only.
 */
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { EventEmitter } = require('events');
const { timerLifecycle } = require('./timerLifecycle');
const { finalizeAudio } = require('./sessionAudio');
const { mapAudioProgressToOverall } = require('./sessionProgressMap');
const { cleanupTranscript, formatRawTranscript } = require('./transcriptCleanup');
const { ollamaChat } = require('./aiHelpers');
const appSettings = require('./appSettings');

const COLORS = ['purple', 'yellow', 'green', 'navy'];
const PDF_NAME = 'transcript.pdf';
const JSONL_NAME = 'transcript.jsonl';
const RAW_TXT_NAME = 'transcript.raw.txt';

function colorFromCategory(title = '', category = '') {
  const t = `${category} ${title}`.toLowerCase();
  if (/worship|music|song|praise|sing/.test(t)) return 'yellow';
  if (/offer|announce|short|break|welcome/.test(t)) return 'green';
  if (/sermon|teach|message|preach|word|bible/.test(t)) return 'purple';
  return 'navy';
}

function uuid() {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function formatBytes(n) {
  if (!n || n < 1024) return `${n || 0} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Multi-page Helvetica text PDF. */
function buildSimplePdf({ title, speakerName, dateStr, durationStr, lines, cleanupNote }) {
  const esc = (s) => String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, '?');

  const pages = [];
  let y = 0;
  let current = [];

  const newPage = () => {
    current = [];
    y = 780;
    current.push('BT');
    pages.push(current);
  };

  const write = (text, size = 11) => {
    if (!pages.length || y < 48) {
      if (current.length) current.push('ET');
      newPage();
    }
    current.push(`/F1 ${size} Tf`);
    current.push(`1 0 0 1 48 ${y} Tm (${esc(text)}) Tj`);
    y -= size + 6;
  };

  newPage();
  write(title || 'Session', 18);
  write(`Speaker: ${speakerName || 'Speaker'}`, 11);
  write(`Date: ${dateStr}    Duration: ${durationStr}`, 10);
  if (cleanupNote) {
    write(String(cleanupNote), 9);
  }
  write('----------------------------------------', 10);
  y -= 4;

  for (const line of lines) {
    const stamp = (line.stamp || '').trim();
    const text = (line.text || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    // Wrap long lines across multiple PDF rows
    const full = stamp ? `${stamp}  ${text}` : text;
    const max = 95;
    for (let i = 0; i < full.length; i += max) {
      write(full.slice(i, i + max), 10);
    }
  }

  if (current.length) current.push('ET');

  const pageStreams = pages.map((p) => p.join('\n'));
  const objs = [];
  // 1: Catalog, 2: Pages, then page objs, content objs, font
  const pageCount = pageStreams.length;
  const fontObjNum = 3 + pageCount * 2;

  objs.push({ id: 1, body: '<< /Type /Catalog /Pages 2 0 R >>' });
  const kids = [];
  for (let i = 0; i < pageCount; i++) {
    kids.push(`${3 + i * 2} 0 R`);
  }
  objs.push({ id: 2, body: `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pageCount} >>` });

  for (let i = 0; i < pageCount; i++) {
    const pageId = 3 + i * 2;
    const contentId = pageId + 1;
    const stream = pageStreams[i];
    const streamLen = Buffer.byteLength(stream, 'utf8');
    objs.push({
      id: pageId,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> >>`,
    });
    objs.push({
      id: contentId,
      body: `<< /Length ${streamLen} >>stream\n${stream}\nendstream`,
    });
  }
  objs.push({ id: fontObjNum, body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>' });

  let pdf = '%PDF-1.4\n';
  const offsets = { 0: 0 };
  for (const o of objs) {
    offsets[o.id] = Buffer.byteLength(pdf, 'utf8');
    pdf += `${o.id} 0 obj${o.body}endobj\n`;
  }
  const xrefPos = Buffer.byteLength(pdf, 'utf8');
  const maxId = fontObjNum;
  pdf += `xref\n0 ${maxId + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= maxId; i++) {
    const off = offsets[i] || 0;
    pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

async function cleanupTemps(dir, keepAudioName) {
  const remove = ['audio.webm', '_transcript.jsonl', '_tmp'];
  for (const name of await fsp.readdir(dir).catch(() => [])) {
    if (
      name === keepAudioName ||
      name === PDF_NAME ||
      name === 'meta.json' ||
      name === JSONL_NAME ||
      name === RAW_TXT_NAME
    ) continue;
    if (name.startsWith('_tmp') || remove.includes(name)) {
      await fsp.unlink(path.join(dir, name)).catch(() => {});
    }
  }
}

class SessionArchiveService extends EventEmitter {
  constructor(userDataPath) {
    super();
    this.root = path.join(userDataPath, 'sessions');
    this.active = null;
    this._finalizing = null;
    this._bound = false;
    this._progress = null;
  }

  async init() {
    await fsp.mkdir(this.root, { recursive: true });
    if (!this._bound) {
      timerLifecycle.on('event', (e) => {
        this.onTimerEvent(e).catch((err) => console.error('[SessionArchive]', err));
      });
      this._bound = true;
    }
  }

  async onTimerEvent(e) {
    switch (e.type) {
      case 'timer:started':
        await this.startSession(e);
        break;
      case 'timer:paused':
      case 'timer:resumed':
        this.emit('status', this.getStatus());
        break;
      case 'timer:completed':
      case 'timer:stopped':
        await this.finalizeSession({ incomplete: false, elapsedSec: e.elapsedSec });
        break;
      case 'timer:reset':
      case 'timer:cancelled':
        await this.finalizeSession({ incomplete: true, elapsedSec: e.elapsedSec });
        break;
      default:
        break;
    }
  }

  getStatus() {
    const fin = this._finalizing;
    return {
      recording: !!this.active,
      processing: !!fin,
      sessionId: this.active?.id || fin?.id || null,
      title: this.active?.meta?.title || fin?.meta?.title || null,
      startedAt: this.active?.startedAt || null,
      progress: this._progress,
    };
  }

  _emitProgress(partial) {
    const fin = this._finalizing;
    this._progress = {
      sessionId: fin?.id || null,
      title: fin?.meta?.title || null,
      phase: 'processing',
      percent: 0,
      current: 0,
      total: 1,
      ...partial,
    };
    this.emit('progress', this._progress);
    this.emit('status', this.getStatus());
  }

  async startSession(e) {
    if (this.active) {
      await this.finalizeSession({
        incomplete: true,
        elapsedSec: Math.floor((Date.now() - this.active.startedAt) / 1000),
      });
    }
    const id = uuid();
    const dir = path.join(this.root, id);
    await fsp.mkdir(dir, { recursive: true });
    const title = e.title || 'Session';
    const speakerName = e.speakerName || 'Speaker';
    const color = COLORS.includes(e.color) ? e.color : colorFromCategory(title, e.category);
    const meta = {
      id,
      title,
      speakerName,
      color,
      status: 'recording',
      createdAt: new Date().toISOString(),
      completedAt: null,
      durationSec: 0,
      timerId: e.timerId || null,
      recordAudio: e.recordAudio !== false,
      files: {
        audio: null,
        video: null,
        pdf: null,
        transcriptRaw: null,
      },
      scriptureRefs: [],
      sizeBytes: 0,
    };
    await fsp.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
    await fsp.writeFile(path.join(dir, JSONL_NAME), '');
    this.active = {
      id,
      dir,
      jsonlPath: path.join(dir, JSONL_NAME),
      meta,
      startedAt: Date.now(),
      plannedDurationSec: e.durationSec || 0,
      recordAudio: e.recordAudio !== false,
      audioChunks: [],
      audioMime: 'audio/webm',
      transcriptLines: [],
    };
    this._finalizing = null;
    console.log('[SessionArchive] started', id, title);
    this.emit('status', this.getStatus());
    return meta;
  }

  /**
   * Record a scripture reference displayed during the active session (Tier 2 bias).
   */
  recordScriptureRef(ref) {
    const target = this.active;
    if (!target || !ref) return;
    const s = String(ref).trim();
    if (!s) return;
    if (!Array.isArray(target.meta.scriptureRefs)) target.meta.scriptureRefs = [];
    if (!target.meta.scriptureRefs.includes(s)) {
      target.meta.scriptureRefs.push(s);
      if (target.meta.scriptureRefs.length > 80) {
        target.meta.scriptureRefs = target.meta.scriptureRefs.slice(-80);
      }
    }
  }

  appendTranscriptLine(line) {
    const target = this.active;
    if (!target) return;
    const text = (line && line.text) || '';
    if (!text.trim()) return;
    if (/^(Init|Connect|Native|Auto-start|Listening|\[ERROR\]|PASS B)/i.test(text)) return;
    if (!line.isFinal) return;
    const row = {
      stamp: line.stamp || '00:00',
      text: text.trim(),
      isFinal: true,
      at: Date.now(),
    };
    target.transcriptLines.push(row);
    // Persist immediately so a long session / crash does not lose the transcript
    try {
      fs.appendFileSync(target.jsonlPath, `${JSON.stringify(row)}\n`, 'utf8');
    } catch (err) {
      console.error('[SessionArchive] transcript append failed', err.message);
    }
  }

  setAudioMime(mime) {
    if (this.active && mime) this.active.audioMime = mime;
    if (this._finalizing && mime) this._finalizing.audioMime = mime;
  }

  pushAudioChunk(buf) {
    const target = this.active || this._finalizing;
    if (!target || !buf || target.recordAudio === false) return;
    const chunk = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    if (!chunk.length) return;
    if (!target.audioChunks) target.audioChunks = [];
    target.audioChunks.push(chunk);
  }

  async _recomputeSize(dir, meta) {
    let total = 0;
    const names = [
      meta.files?.audio,
      meta.files?.video,
      meta.files?.pdf,
    ].filter(Boolean);
    const uniq = [...new Set(names)];
    for (const name of uniq) {
      try {
        const st = await fsp.stat(path.join(dir, name));
        total += st.size;
      } catch (_) {}
    }
    meta.sizeBytes = total;
    return total;
  }

  async _loadTranscriptLines(session) {
    const mem = session.transcriptLines || [];
    if (mem.length) return mem;
    try {
      const raw = await fsp.readFile(session.jsonlPath || path.join(session.dir, JSONL_NAME), 'utf8');
      return raw
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          try { return JSON.parse(l); } catch (_) { return null; }
        })
        .filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  async _writePdf(session, lines, incomplete, audioOk, cleanupNote = null) {
    const dur = session.meta.durationSec;
    const durationStr = `${String(Math.floor(dur / 60)).padStart(2, '0')}:${String(dur % 60).padStart(2, '0')}`;
    const pdfBuf = buildSimplePdf({
      title: session.meta.title,
      speakerName: session.meta.speakerName,
      dateStr: new Date(session.meta.createdAt).toLocaleString(),
      durationStr,
      lines,
      cleanupNote,
    });
    await fsp.writeFile(path.join(session.dir, PDF_NAME), pdfBuf);
    session.meta.files.pdf = PDF_NAME;
    if (incomplete) session.meta.status = 'incomplete';
    else if (!audioOk) session.meta.status = 'audio_failed';
    else session.meta.status = 'ready';
  }

  async _prepareTranscriptForPdf(session, lines) {
    // Always persist raw transcript separately (never overwritten by cleanup)
    const rawPath = path.join(session.dir, RAW_TXT_NAME);
    await fsp.writeFile(rawPath, formatRawTranscript(lines), 'utf8');
    session.meta.files.transcriptRaw = RAW_TXT_NAME;

    const enabled = !!appSettings.get('sessionTranscriptCleanup');
    if (!enabled) {
      session.meta.transcriptCleanup = { status: 'skipped', chunksAccepted: 0, chunksRejected: 0, note: null };
      return { lines, cleanupNote: null };
    }

    this._emitProgress({ phase: 'transcript_cleanup', current: 29, total: 32, percent: 92 });
    const cleaned = await cleanupTranscript(lines, {
      enabled: true,
      scriptureRefs: session.meta.scriptureRefs || [],
      ollamaChat,
    });
    session.meta.transcriptCleanup = {
      status: cleaned.status,
      chunksAccepted: cleaned.chunksAccepted,
      chunksRejected: cleaned.chunksRejected,
      note: cleaned.note,
      error: cleaned.error || null,
    };
    return {
      lines: cleaned.lines || lines,
      cleanupNote: cleaned.note || null,
    };
  }

  async finalizeSession(opts = {}) {
    if (!this.active) return null;
    const session = this.active;
    const { incomplete = false, elapsedSec } = opts;
    this.active = null;

    // If recording was disabled (Tier 1 plan or disabled in Agenda Planner):
    if (session.recordAudio === false || (session.audioChunks || []).length === 0) {
      console.log('[SessionArchive] Audio recording skipped for session (Tier 1 plan or disabled in Agenda Planner)');
      session.meta.status = incomplete ? 'incomplete' : 'ready';
      session.meta.durationSec = elapsedSec || Math.floor((Date.now() - session.startedAt) / 1000);
      session.meta.completedAt = new Date().toISOString();
      session.audioChunks = [];
      await cleanupTemps(session.dir, null).catch(() => {});
      await fsp.writeFile(path.join(session.dir, 'meta.json'), JSON.stringify(session.meta, null, 2));
      this._finalizing = null;
      this.emit('session-finalized', session.meta);
      this.emit('status', this.getStatus());
      return session.meta;
    }

    this._finalizing = session;
    this._progress = {
      sessionId: session.id,
      title: session.meta?.title || null,
      phase: 'flushing',
      percent: 0,
      current: 0,
      total: 32,
    };
    this.emit('status', this.getStatus());
    this.emit('progress', this._progress);

    let finalizeError = null;
    try {
      session.meta.status = 'processing';
      session.meta.durationSec = elapsedSec || Math.floor((Date.now() - session.startedAt) / 1000);
      session.meta.completedAt = new Date().toISOString();
      await fsp.writeFile(path.join(session.dir, 'meta.json'), JSON.stringify(session.meta, null, 2));
      // Let Sessions UI pick up the processing folder immediately
      this.emit('session-updated', session.meta);

      // Flush steps while MediaRecorder drains final timeslices
      const flushTotal = 4;
      const flushMs = 3200;
      const flushTick = Math.floor(flushMs / flushTotal);
      for (let i = 1; i <= flushTotal; i += 1) {
        await new Promise((r) => setTimeout(r, flushTick));
        this._emitProgress({
          phase: 'flushing',
          current: i,
          total: 32,
          percent: Math.round((i / 32) * 100),
        });
      }

      let audioOk = false;
      try {
        const introPath = appSettings.get('sessionIntroPath') || null;
        const outroPath = appSettings.get('sessionOutroPath') || null;
        const autoMergeBumpers = appSettings.get('sessionAutoMergeBumpers') !== false;

        const result = await finalizeAudio({
          chunks: session.audioChunks || [],
          mime: session.audioMime || 'audio/webm',
          dir: session.dir,
          durationSec: session.meta.durationSec || 0,
          introPath,
          outroPath,
          autoMergeBumpers,
          onProgress: (p) => {
            const mapped = mapAudioProgressToOverall(p);
            this._emitProgress({
              phase: mapped.phase,
              current: mapped.current,
              total: mapped.total,
              percent: mapped.percent,
            });
          },
        });
        session.meta.files.audio = result.audioFile;
        session.meta.files.video = result.format === 'mp4' ? result.audioFile : null;
        if (result.finalDurationSec) {
          session.meta.durationSec = result.finalDurationSec;
        }
        audioOk = true;
        console.log('[SessionArchive] audio saved', result.audioFile, formatBytes(result.bytes));
      } catch (err) {
        console.error('[SessionArchive] audio export failed', err);
        audioOk = false;
        session.meta.status = incomplete ? 'incomplete' : 'audio_failed';
        finalizeError = err.message || String(err);
        this._emitProgress({
          phase: 'error',
          current: 28,
          total: 32,
          percent: 87,
          error: finalizeError,
        });
      } finally {
        session.audioChunks = [];
      }

      this._emitProgress({ phase: 'pdf', current: 29, total: 32, percent: 91 });
      const lines = await this._loadTranscriptLines(session);
      try {
        const prepared = await this._prepareTranscriptForPdf(session, lines);
        await this._writePdf(session, prepared.lines, incomplete, audioOk, prepared.cleanupNote);
        await fsp.unlink(path.join(session.dir, JSONL_NAME)).catch(() => {});
        this._emitProgress({ phase: 'pdf', current: 31, total: 32, percent: 97 });
      } catch (err) {
        console.error('[SessionArchive] PDF failed', err);
        session.meta.status = 'pdf_failed';
        session.meta.files.pdf = null;
        finalizeError = finalizeError || err.message || String(err);
      }

      await cleanupTemps(session.dir, session.meta.files.audio);
      await this._recomputeSize(session.dir, session.meta);
      if (session.meta.status === 'processing') {
        session.meta.status = incomplete ? 'incomplete' : 'ready';
      }
      await fsp.writeFile(path.join(session.dir, 'meta.json'), JSON.stringify(session.meta, null, 2));

      if (finalizeError && (session.meta.status === 'audio_failed' || session.meta.status === 'pdf_failed')) {
        this._emitProgress({
          phase: 'error',
          current: 32,
          total: 32,
          percent: 100,
          error: finalizeError,
        });
      } else {
        this._emitProgress({ phase: 'done', current: 32, total: 32, percent: 100 });
      }
      console.log('[SessionArchive] finalized', session.id, session.meta.status, formatBytes(session.meta.sizeBytes), `${lines.length} lines`);
      return session.meta;
    } catch (err) {
      console.error('[SessionArchive] finalize crashed', err);
      finalizeError = err.message || String(err);
      try {
        session.meta.status = 'audio_failed';
        await fsp.writeFile(path.join(session.dir, 'meta.json'), JSON.stringify(session.meta, null, 2));
      } catch (_) {}
      this._emitProgress({
        phase: 'error',
        current: 32,
        total: 32,
        percent: 100,
        error: finalizeError,
      });
      return session.meta;
    } finally {
      this._finalizing = null;
      // Keep last progress briefly for UI 100%/error; cleared by main on finalized
      this.emit('status', this.getStatus());
      this.emit('session-finalized', {
        ...session.meta,
        error: finalizeError || null,
      });
      this._progress = null;
    }
  }

  async listSessions() {
    await fsp.mkdir(this.root, { recursive: true });
    const names = await fsp.readdir(this.root);
    const out = [];
    for (const name of names) {
      const metaPath = path.join(this.root, name, 'meta.json');
      try {
        const meta = JSON.parse(await fsp.readFile(metaPath, 'utf8'));
        await this._recomputeSize(path.join(this.root, name), meta);
        out.push(meta);
      } catch (_) {}
    }
    out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return out;
  }

  async _resolveMediaPath(dir, meta) {
    const candidates = [
      meta.files?.audio,
      meta.files?.video,
      'session.mp4',
      'session.webm',
      'audio.webm',
    ].filter(Boolean);
    for (const name of candidates) {
      const p = path.join(dir, name);
      try {
        await fsp.access(p);
        return p;
      } catch (_) {}
    }
    return path.join(dir, meta.files?.audio || 'session.webm');
  }

  async getSession(id) {
    const dir = path.join(this.root, id);
    const metaPath = path.join(dir, 'meta.json');
    const meta = JSON.parse(await fsp.readFile(metaPath, 'utf8'));
    const mediaPath = await this._resolveMediaPath(dir, meta);
    const pdfFile = meta.files?.pdf || PDF_NAME;
    await this._recomputeSize(dir, meta);

    let transcriptText = '';
    const rawTxtPath = path.join(dir, RAW_TXT_NAME);
    try {
      transcriptText = await fsp.readFile(rawTxtPath, 'utf8');
    } catch (_) {
      try {
        const jsonlRaw = await fsp.readFile(path.join(dir, JSONL_NAME), 'utf8');
        const lines = jsonlRaw.split('\n').filter(Boolean).map((l) => {
          try { return JSON.parse(l); } catch (_) { return null; }
        }).filter(Boolean);
        transcriptText = formatRawTranscript(lines);
      } catch (_) {}
    }

    const folderFiles = [];
    try {
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isFile()) {
          const st = await fsp.stat(path.join(dir, ent.name));
          folderFiles.push({
            name: ent.name,
            sizeBytes: st.size,
            sizeLabel: formatBytes(st.size),
            updatedAt: st.mtime.toISOString(),
          });
        }
      }
      folderFiles.sort((a, b) => a.name.localeCompare(b.name));
    } catch (_) {}

    return {
      ...meta,
      transcriptText,
      folderFiles,
      paths: {
        dir,
        video: mediaPath,
        audio: mediaPath,
        pdf: meta.files?.pdf ? path.join(dir, pdfFile) : null,
      },
      sizeLabel: formatBytes(meta.sizeBytes),
    };
  }

  async updateTranscript(id, text) {
    const dir = path.join(this.root, id);
    const metaPath = path.join(dir, 'meta.json');
    const meta = JSON.parse(await fsp.readFile(metaPath, 'utf8'));

    const rawTxtPath = path.join(dir, RAW_TXT_NAME);
    await fsp.writeFile(rawTxtPath, String(text || ''), 'utf8');
    meta.files = meta.files || {};
    meta.files.transcriptRaw = RAW_TXT_NAME;

    const lines = String(text || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const m = l.match(/^(\[\d+:\d+(?::\d+)?\]|\d+:\d+(?::\d+)?)\s*(.*)$/);
        return m ? { stamp: m[1], text: m[2] } : { stamp: '', text: l };
      });

    const dur = meta.durationSec || 0;
    const durationStr = `${String(Math.floor(dur / 60)).padStart(2, '0')}:${String(dur % 60).padStart(2, '0')}`;
    const pdfBuf = buildSimplePdf({
      title: meta.title,
      speakerName: meta.speakerName,
      dateStr: new Date(meta.createdAt).toLocaleString(),
      durationStr,
      lines,
      cleanupNote: meta.transcriptCleanup?.note || null,
    });

    await fsp.writeFile(path.join(dir, PDF_NAME), pdfBuf);
    meta.files.pdf = PDF_NAME;
    if (meta.status === 'pdf_failed') {
      meta.status = 'ready';
    }
    await this._recomputeSize(dir, meta);
    await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2));
    this.emit('session-updated', meta);
    return this.getSession(id);
  }

  async updateSession(id, patch) {
    const dir = path.join(this.root, id);
    const metaPath = path.join(dir, 'meta.json');
    const meta = JSON.parse(await fsp.readFile(metaPath, 'utf8'));
    if (patch.title != null) meta.title = String(patch.title);
    if (patch.speakerName != null) meta.speakerName = String(patch.speakerName);
    if (patch.color && COLORS.includes(patch.color)) meta.color = patch.color;
    await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2));
    return meta;
  }

  async deleteSession(id) {
    if (this.active && this.active.id === id) {
      this.active = null;
      this.emit('status', this.getStatus());
    }
    await fsp.rm(path.join(this.root, id), { recursive: true, force: true });
    return { ok: true };
  }

  async retryPdf(id) {
    const dir = path.join(this.root, id);
    const metaPath = path.join(dir, 'meta.json');
    const meta = JSON.parse(await fsp.readFile(metaPath, 'utf8'));
    meta.status = 'processing';
    await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2));
    try {
      let lines = [];
      for (const name of [JSONL_NAME, '_transcript.jsonl']) {
        try {
          const raw = await fsp.readFile(path.join(dir, name), 'utf8');
          lines = raw.split('\n').filter(Boolean).map((l) => {
            try { return JSON.parse(l); } catch (_) { return null; }
          }).filter(Boolean);
          if (lines.length) break;
        } catch (_) {}
      }
      if (!lines.length) throw new Error('No transcript available for PDF retry');
      const sessionLike = { dir, meta };
      const prepared = await this._prepareTranscriptForPdf(sessionLike, lines);
      const dur = meta.durationSec || 0;
      const durationStr = `${String(Math.floor(dur / 60)).padStart(2, '0')}:${String(dur % 60).padStart(2, '0')}`;
      const pdfBuf = buildSimplePdf({
        title: meta.title,
        speakerName: meta.speakerName,
        dateStr: new Date(meta.createdAt).toLocaleString(),
        durationStr,
        lines: prepared.lines,
        cleanupNote: prepared.cleanupNote,
      });
      await fsp.writeFile(path.join(dir, PDF_NAME), pdfBuf);
      meta.files.pdf = PDF_NAME;
      meta.status = 'ready';
      await fsp.unlink(path.join(dir, JSONL_NAME)).catch(() => {});
      await fsp.unlink(path.join(dir, '_transcript.jsonl')).catch(() => {});
    } catch (err) {
      meta.status = 'pdf_failed';
      throw err;
    }
    await this._recomputeSize(dir, meta);
    await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2));
    return meta;
  }
}

module.exports = {
  SessionArchiveService,
  colorFromCategory,
  formatBytes,
  COLORS,
  buildSimplePdf,
  PDF_NAME,
};
