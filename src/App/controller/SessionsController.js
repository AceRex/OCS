import React, { useCallback, useEffect, useState } from 'react';
import {
  PiFolder,
  PiTrash,
  PiDownloadSimple,
  PiArrowClockwise,
  PiPencilSimple,
  PiX,
  PiFilePdf,
  PiFileText,
  PiVideo,
  PiMusicNote,
  PiCheckSquare,
  PiSquare,
  PiFloppyDisk,
  PiArrowSquareOut,
  PiCheck,
  PiScissors,
  PiEraser,
  PiClock,
} from 'react-icons/pi';
import SessionFolderCard, { formatBytes, formatDate } from './SessionFolderCard';
import FileTypeBadge from './FileTypeBadge';
import pdfPngIcon from '../../../assets/text_line_pdf.png';
import mp3PngIcon from '../../../assets/text_line_mp3.png';
import mp4PngIcon from '../../../assets/text_line_mp4.png';

export default function SessionsController() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [audioSrc, setAudioSrc] = useState(null);
  const [menuId, setMenuId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSpeaker, setEditSpeaker] = useState('');
  const [editTranscript, setEditTranscript] = useState('');
  const [rawWithStamps, setRawWithStamps] = useState('');
  const [timestampsEnabled, setTimestampsEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState('transcript'); // 'transcript' | 'media' | 'files'
  const [pdfSavedMsg, setPdfSavedMsg] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!window.electron?.Session?.list) {
      setError('Session API unavailable');
      setLoading(false);
      return;
    }
    try {
      const list = await window.electron.Session.list();
      setSessions(list || []);
      setError(null);
    } catch (e) {
      setError(e.message || 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const unsubFinal = window.electron?.Session?.onFinalized?.(() => refresh());
    const unsubUpdated = window.electron?.Session?.onUpdated?.(() => refresh());
    return () => {
      if (typeof unsubFinal === 'function') unsubFinal();
      if (typeof unsubUpdated === 'function') unsubUpdated();
    };
  }, [refresh]);

  const isAllSelected = sessions.length > 0 && selectedIds.size === sessions.length;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sessions.map((s) => s.id)));
    }
  };

  const toggleSelectOne = (id, e) => {
    if (e) e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!window.confirm(`Delete ${count} selected session folder${count > 1 ? 's' : ''} and all associated files?`)) {
      return;
    }
    setBusy(true);
    try {
      if (window.electron?.Session?.deleteMany) {
        await window.electron.Session.deleteMany(Array.from(selectedIds));
      } else {
        for (const id of selectedIds) {
          await window.electron.Session.delete(id);
        }
      }
      if (selected && selectedIds.has(selected)) closeDetail();
      setSelectedIds(new Set());
      await refresh();
    } catch (e) {
      setError(e.message || 'Failed to delete selected sessions');
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (id) => {
    setMenuId(null);
    setBusy(true);
    setAudioSrc(null);
    setPdfSavedMsg(null);
    try {
      const s = await window.electron.Session.get(id);
      setSelected(id);
      setDetail(s);
      setEditTitle(s.title || '');
      setEditSpeaker(s.speakerName || '');
      const txt = s.transcriptText || '';
      setEditTranscript(txt);
      setRawWithStamps(txt);
      const hasStamps = /^\s*\[?\d{1,2}:\d{2}/m.test(txt);
      setTimestampsEnabled(hasStamps);
      const url = await window.electron.Session.audioUrl?.(id);
      setAudioSrc(url || null);
      setActiveTab(s.transcriptText ? 'transcript' : (url ? 'media' : 'files'));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const closeDetail = () => {
    setSelected(null);
    setDetail(null);
    setAudioSrc(null);
    setPdfSavedMsg(null);
  };

  const saveMeta = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await window.electron.Session.update(selected, {
        title: editTitle,
        speakerName: editSpeaker,
      });
      await refresh();
      await openDetail(selected);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveTranscriptAndPdf = async () => {
    if (!selected) return;
    setBusy(true);
    setPdfSavedMsg(null);
    try {
      if (window.electron?.Session?.updateTranscript) {
        const updated = await window.electron.Session.updateTranscript(selected, editTranscript);
        if (updated) {
          setDetail(updated);
          setEditTranscript(updated.transcriptText || '');
        }
      }
      await refresh();
      setPdfSavedMsg('PDF transcript regenerated & saved successfully!');
      setTimeout(() => setPdfSavedMsg(null), 3500);
    } catch (e) {
      setError(e.message || 'Failed to update transcript / PDF');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this session folder and its files?')) return;
    setBusy(true);
    try {
      await window.electron.Session.delete(id);
      if (selected === id) closeDetail();
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      setMenuId(null);
    }
  };

  const retryPdf = async (id) => {
    setBusy(true);
    try {
      await window.electron.Session.retryPdf(id);
      await refresh();
      if (selected === id) await openDetail(id);
    } catch (e) {
      setError(e.message || 'PDF retry failed');
    } finally {
      setBusy(false);
    }
  };

  const openFileInFolder = (filename) => {
    if (!selected) return;
    if (window.electron?.Session?.openFile) {
      window.electron.Session.openFile(selected, filename);
    } else {
      window.electron?.Session?.showInFolder?.(selected);
    }
  };

  const toggleTimestamps = () => {
    if (timestampsEnabled) {
      // User wants to remove/hide timestamps
      setRawWithStamps(editTranscript);
      const cleaned = editTranscript
        .split('\n')
        .map((line) => line.replace(/^\s*\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*[-|:]?\s*/, '').trimEnd())
        .join('\n');
      setEditTranscript(cleaned);
      setTimestampsEnabled(false);
    } else {
      // User wants to restore timestamps
      if (rawWithStamps && /^\s*\[?\d{1,2}:\d{2}/m.test(rawWithStamps)) {
        const origLines = rawWithStamps.split('\n');
        const curLines = editTranscript.split('\n');
        if (origLines.length === curLines.length) {
          const restored = curLines.map((curLine, idx) => {
            const m = origLines[idx]?.match(/^(\s*\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*[-|:]?\s*)/);
            const prefix = m ? m[1] : '';
            return `${prefix}${curLine.trim()}`;
          }).join('\n');
          setEditTranscript(restored);
        } else {
          setEditTranscript(rawWithStamps);
        }
      }
      setTimestampsEnabled(true);
    }
  };

  const transcriptLinesCount = editTranscript.split('\n').filter(Boolean).length;
  const transcriptWordsCount = editTranscript.trim() ? editTranscript.trim().split(/\s+/).length : 0;

  return (
    <div className="w-full h-full flex flex-col text-white/90 overflow-hidden relative">
      {/* Header with Select All & Actions */}
      <div className="flex items-center gap-3 px-1 pb-4 shrink-0 flex-wrap">
        <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center shadow-inner">
          <PiFolder size={22} className="text-violet-300" />
        </div>
        <div>
          <h1 className="text-xl font-black tracking-tight">Sessions</h1>
          <p className="text-[11px] text-white/40">
            Timer-linked MP4 + PDF archives
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {sessions.length > 0 && (
            <button
              type="button"
              onClick={toggleSelectAll}
              className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-2 rounded-xl border transition-all ${
                isAllSelected
                  ? 'bg-violet-600/30 border-violet-500/50 text-violet-200'
                  : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/70'
              }`}
            >
              {isAllSelected ? <PiCheckSquare size={16} className="text-violet-400" /> : <PiSquare size={16} />}
              {isAllSelected ? 'Deselect All' : 'Select All'}
            </button>
          )}

          {selectedIds.size > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={deleteSelected}
              className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-200 shadow-sm transition-all"
            >
              <PiTrash size={15} />
              Delete Selected ({selectedIds.size})
            </button>
          )}

          <button
            type="button"
            onClick={refresh}
            className="text-[10px] font-bold uppercase tracking-widest px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-200 text-xs">
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0">
        <div className="h-full overflow-y-auto pr-1">
          {loading ? (
            <p className="text-white/40 text-sm p-6">Loading sessions…</p>
          ) : sessions.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
              <PiFolder size={36} className="mx-auto text-white/20 mb-3" />
              <p className="text-sm text-white/50 font-medium">No session folders yet</p>
              <p className="text-[11px] text-white/30 mt-2 max-w-sm mx-auto">
                Start a timer to begin recording. When it completes, session.mp4 and transcript.pdf appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 pt-2 pb-6">
              {sessions.map((s, index) => (
                <SessionFolderCard
                  key={s.id}
                  title={s.title}
                  speakerName={s.speakerName}
                  index={index}
                  sizeBytes={s.sizeBytes}
                  createdAt={s.createdAt}
                  status={s.status}
                  selected={selectedIds.has(s.id)}
                  onToggleSelect={(e) => toggleSelectOne(s.id, e)}
                  onOpen={() => openDetail(s.id)}
                  onDelete={() => remove(s.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Session Detail & Editable PDF Modal */}
      {detail && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="w-full max-w-[940px] max-h-[92vh] flex flex-col rounded-3xl border border-white/15 bg-[#141416] shadow-2xl overflow-hidden">
            {/* Modal Top Bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
              <div className="flex items-center gap-2.5">
                <img src={pdfPngIcon} alt="PDF" className="w-7 h-7 object-contain drop-shadow-sm shrink-0" />
                <div>
                  <h2 className="text-sm font-bold text-white tracking-tight leading-none">
                    {detail.title || 'Session Archive'}
                  </h2>
                  <p className="text-[10px] text-white/40 mt-1">
                    {detail.speakerName ? `${detail.speakerName} · ` : ''}{formatDate(detail.createdAt)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 text-white/60 hover:text-white flex items-center justify-center transition-colors"
                aria-label="Close modal"
              >
                <PiX size={18} />
              </button>
            </div>

            {/* Modal Body: Left Tabbed Content, Right Meta Details */}
            <div className="grid md:grid-cols-[1.35fr_0.85fr] flex-1 min-h-0 overflow-hidden">
              {/* Left Pane with Tabs: Transcript/PDF, Media, Folder Files */}
              <div className="flex flex-col border-b md:border-b-0 md:border-r border-white/10 min-h-0 bg-black/20">
                {/* Tabs Header */}
                <div className="flex items-center gap-1.5 px-4 pt-3 pb-2 border-b border-white/5 bg-white/[0.01]">
                  <button
                    type="button"
                    onClick={() => setActiveTab('transcript')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      activeTab === 'transcript'
                        ? 'bg-violet-600 text-white shadow-sm shadow-violet-900/40'
                        : 'bg-white/5 hover:bg-white/10 text-white/60 hover:text-white'
                    }`}
                  >
                    <PiFileText size={15} />
                    PDF Transcript
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('files')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      activeTab === 'files'
                        ? 'bg-violet-600 text-white shadow-sm shadow-violet-900/40'
                        : 'bg-white/5 hover:bg-white/10 text-white/60 hover:text-white'
                    }`}
                  >
                    <PiFolder size={15} />
                    Folder Preview ({(detail.folderFiles || []).filter(f => f.name !== 'meta.json' && !f.name.startsWith('transcript.raw') && !f.name.startsWith('.')).length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('media')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      activeTab === 'media'
                        ? 'bg-violet-600 text-white shadow-sm shadow-violet-900/40'
                        : 'bg-white/5 hover:bg-white/10 text-white/60 hover:text-white'
                    }`}
                  >
                    <PiVideo size={15} />
                    Media
                  </button>
                </div>

                {/* Tab 1: Editable PDF Transcript */}
                {activeTab === 'transcript' && (
                  <div className="flex-1 flex flex-col p-4 min-h-0 overflow-hidden">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-[11px] text-white/40 font-medium">
                        <span>{transcriptWordsCount} words</span>
                        <span>·</span>
                        <span>{transcriptLinesCount} lines</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={toggleTimestamps}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all shadow-sm ${
                            timestampsEnabled
                              ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 text-amber-200 hover:text-amber-100'
                              : 'bg-white/10 hover:bg-white/15 border-white/20 text-white/70 hover:text-white'
                          }`}
                          title={timestampsEnabled ? 'Click to remove timestamps from transcript' : 'Click to restore timestamps to transcript'}
                        >
                          <PiClock size={13} className={timestampsEnabled ? 'text-amber-400' : 'text-white/40'} />
                          <span>{timestampsEnabled ? 'Timestamps: ON' : 'Timestamps: OFF'}</span>
                        </button>
                        {detail.paths?.pdf && (
                          <button
                            type="button"
                            onClick={() => openFileInFolder('transcript.pdf')}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-bold text-white/80 transition-colors"
                          >
                            <PiArrowSquareOut size={13} /> Open PDF
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={saveTranscriptAndPdf}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-bold shadow-md shadow-violet-950/50 transition-all"
                        >
                          <PiFloppyDisk size={14} /> Save & Rebuild PDF
                        </button>
                      </div>
                    </div>

                    {pdfSavedMsg && (
                      <div className="mb-2 px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs flex items-center gap-2 animate-in fade-in duration-150">
                        <PiCheck size={16} className="text-emerald-400 shrink-0" />
                        <span>{pdfSavedMsg}</span>
                      </div>
                    )}

                    <div className="flex-1 min-h-[260px] relative rounded-2xl border border-white/10 bg-black/40 overflow-hidden flex flex-col">
                      <textarea
                        value={editTranscript}
                        onChange={(e) => setEditTranscript(e.target.value)}
                        placeholder="Session transcript text... Type or paste text here to update the transcript and regenerate the PDF."
                        className="w-full h-full p-3.5 bg-transparent text-xs font-mono leading-relaxed text-white/90 placeholder-white/20 outline-none resize-none overflow-y-auto"
                        spellCheck={false}
                      />
                    </div>
                    <p className="text-[10px] text-white/30 mt-2">
                      💡 Tip: Edit timestamps and preacher notes directly above. Click "Save & Rebuild PDF" to regenerate <span className="text-violet-300 font-mono">transcript.pdf</span>.
                    </p>
                  </div>
                )}

                {/* Tab 2: Folder Files Preview */}
                {activeTab === 'files' && (
                  <div className="flex-1 p-4 overflow-y-auto space-y-2">
                    <div className="flex items-center justify-between pb-2 border-b border-white/5">
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Files in session folder</span>
                      <button
                        type="button"
                        onClick={() => window.electron?.Session?.showInFolder?.(detail.id)}
                        className="text-[10px] font-bold text-violet-400 hover:text-violet-300 flex items-center gap-1"
                      >
                        <PiDownloadSimple size={13} /> Open in Finder / Explorer
                      </button>
                    </div>

                    {(() => {
                      const visibleFiles = (detail.folderFiles || []).filter(
                        (f) => f.name !== 'meta.json' && !f.name.startsWith('transcript.raw') && !f.name.startsWith('.')
                      );

                      if (visibleFiles.length === 0) {
                        return (
                          <div className="p-8 text-center text-xs text-white/30 rounded-2xl border border-dashed border-white/10">
                            No folder file listings available.
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-1.5 pt-1">
                          {visibleFiles.map((file) => {
                            const isPdf = file.name.toLowerCase().endsWith('.pdf');
                            const isAudio = /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name);
                            const isVideo = /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(file.name);

                            return (
                              <div
                                key={file.name}
                                className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 transition-colors"
                              >
                                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                  {isPdf ? (
                                    <img src={pdfPngIcon} alt="PDF" className="w-6 h-6 object-contain shrink-0 drop-shadow-sm" />
                                  ) : isAudio ? (
                                    <img src={mp3PngIcon} alt="MP3" className="w-6 h-6 object-contain shrink-0 drop-shadow-sm" />
                                  ) : isVideo ? (
                                    <img src={mp4PngIcon} alt="MP4" className="w-6 h-6 object-contain shrink-0 drop-shadow-sm" />
                                  ) : (
                                    <FileTypeBadge filename={file.name} size="xs" />
                                  )}
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-white/90 truncate">{file.name}</p>
                                    <p className="text-[10px] text-white/40">{file.sizeLabel || formatBytes(file.sizeBytes)}</p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => openFileInFolder(file.name)}
                                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-[10px] font-bold text-white/80 shrink-0 flex items-center gap-1"
                                >
                                  <PiArrowSquareOut size={12} /> Open
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Tab 3: Media Preview */}
                {activeTab === 'media' && (
                  <div className="flex-1 p-4 overflow-y-auto space-y-4">
                    {audioSrc ? (
                      <div className="space-y-4">
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2">Media Video</p>
                          <video controls className="w-full rounded-2xl bg-black max-h-[240px] border border-white/10" src={audioSrc} />
                        </div>
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2">Audio Playback</p>
                          <audio controls className="w-full" src={audioSrc} />
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center text-sm text-white/35">
                        No playable recording found for this session.
                        {!detail.files?.audio && detail.status === 'audio_failed' ? ' Audio export failed.' : ''}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right Sidebar: Meta fields & Management Actions */}
              <div className="p-5 space-y-4 overflow-y-auto bg-black/40 flex flex-col justify-between">
                <div className="space-y-4">
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-white/40">Title</label>
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="mt-1 w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-violet-400/50 text-white"
                      placeholder="Session Title..."
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-white/40">Speaker</label>
                    <input
                      value={editSpeaker}
                      onChange={(e) => setEditSpeaker(e.target.value)}
                      className="mt-1 w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-violet-400/50 text-white"
                      placeholder="Speaker Name..."
                    />
                  </div>

                  <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 space-y-1.5 text-[11px] text-white/50">
                    <p className="flex justify-between">
                      <span>Folder Size:</span>
                      <span className="text-white/80 font-mono">{formatBytes(detail.sizeBytes)}</span>
                    </p>
                    <p className="flex justify-between">
                      <span>Created:</span>
                      <span className="text-white/80">{formatDate(detail.createdAt)}</span>
                    </p>
                    {detail.durationSec != null && (
                      <p className="flex justify-between">
                        <span>Duration:</span>
                        <span className="text-white/80 font-mono">{Math.floor(detail.durationSec / 60)}m {detail.durationSec % 60}s</span>
                      </p>
                    )}
                    <p className="flex justify-between">
                      <span>Status:</span>
                      <span className="uppercase text-[10px] font-bold text-violet-400">{detail.status}</span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={saveMeta}
                    className="flex items-center justify-center gap-2 rounded-xl bg-violet-600/80 hover:bg-violet-500 px-3 py-2.5 text-xs font-bold text-white transition-all shadow-md shadow-violet-950/40"
                  >
                    <PiPencilSimple size={15} /> Save Title & Speaker
                  </button>

                  {detail.status === 'pdf_failed' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => retryPdf(detail.id)}
                      className="flex items-center justify-center gap-2 rounded-xl bg-amber-600/70 hover:bg-amber-500 px-3 py-2.5 text-xs font-bold text-white transition-all"
                    >
                      <PiArrowClockwise size={15} /> Retry PDF Generation
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => window.electron?.Session?.showInFolder?.(detail.id)}
                    className="flex items-center justify-center gap-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2.5 text-xs font-bold text-white/80 transition-colors"
                  >
                    <PiDownloadSimple size={15} /> Show in Finder / Explorer
                  </button>

                  <button
                    type="button"
                    onClick={() => remove(detail.id)}
                    className="flex items-center justify-center gap-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/20 text-red-200 px-3 py-2.5 text-xs font-bold transition-colors"
                  >
                    <PiTrash size={15} /> Delete Session
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

