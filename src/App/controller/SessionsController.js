import React, { useCallback, useEffect, useState } from 'react';
import { PiFolder, PiTrash, PiDownloadSimple, PiArrowClockwise, PiPencilSimple, PiX } from 'react-icons/pi';
import SessionFolderCard, { formatBytes, formatDate } from './SessionFolderCard';

export default function SessionsController() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [audioSrc, setAudioSrc] = useState(null);
  const [menuId, setMenuId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSpeaker, setEditSpeaker] = useState('');
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

  const openDetail = async (id) => {
    setMenuId(null);
    setBusy(true);
    setAudioSrc(null);
    try {
      const s = await window.electron.Session.get(id);
      setSelected(id);
      setDetail(s);
      setEditTitle(s.title || '');
      setEditSpeaker(s.speakerName || '');
      const url = await window.electron.Session.audioUrl?.(id);
      setAudioSrc(url || null);
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

  const remove = async (id) => {
    if (!window.confirm('Delete this session folder and its files?')) return;
    setBusy(true);
    try {
      await window.electron.Session.delete(id);
      if (selected === id) closeDetail();
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

  return (
    <div className="w-full h-full flex flex-col text-white/90 overflow-hidden relative">
      <div className="flex items-center gap-3 px-1 pb-4 shrink-0">
        <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
          <PiFolder size={22} className="text-violet-300" />
        </div>
        <div>
          <h1 className="text-xl font-black tracking-tight">Sessions</h1>
          <p className="text-[11px] text-white/40">
            Timer-linked MP4 + PDF archives
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="ml-auto text-[10px] font-bold uppercase tracking-widest px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10"
        >
          Refresh
        </button>
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 pt-2 pb-6">
              {sessions.map((s, index) => (
                <div key={s.id} className="relative">
                  <SessionFolderCard
                    title={s.title}
                    speakerName={s.speakerName}
                    index={index}
                    sizeBytes={s.sizeBytes}
                    createdAt={s.createdAt}
                    status={s.status}
                    onOpen={() => openDetail(s.id)}
                    onMenu={() => setMenuId(menuId === s.id ? null : s.id)}
                  />
                  {menuId === s.id && (
                    <div className="absolute right-2 top-12 z-30 min-w-[160px] rounded-2xl bg-[#1a1a1a] border border-white/10 shadow-2xl py-2 text-xs">
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-white/5 text-red-300"
                        onClick={() => remove(s.id)}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
      {detail && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6">
          <div className="w-full max-w-[760px] max-h-[88vh] rounded-3xl border border-white/10 bg-[#121212] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Session Detail</span>
              <button type="button" onClick={closeDetail} className="text-white/40 hover:text-white">
                <PiX size={18} />
              </button>
            </div>
            <div className="grid md:grid-cols-[1.1fr_0.9fr] max-h-[calc(88vh-58px)]">
              <div className="p-5 border-b md:border-b-0 md:border-r border-white/5 overflow-y-auto">
                {audioSrc && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Audio Playback</p>
                      <audio controls className="w-full" src={audioSrc} />
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Media Preview</p>
                      <video controls className="w-full rounded-xl bg-black max-h-[220px]" src={audioSrc} />
                    </div>
                  </div>
                )}
                {!audioSrc && (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center text-sm text-white/35">
                    No playable recording found for this session.
                    {!detail.files?.audio && detail.status === 'audio_failed' ? ' Audio export failed.' : ''}
                  </div>
                )}
              </div>
              <div className="p-5 space-y-4 overflow-y-auto">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/30">Title</label>
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="mt-1 w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-violet-400/50"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/30">Speaker</label>
                  <input
                    value={editSpeaker}
                    onChange={(e) => setEditSpeaker(e.target.value)}
                    className="mt-1 w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-violet-400/50"
                  />
                </div>
                <p className="text-[11px] text-white/40">
                  {formatBytes(detail.sizeBytes)} · {formatDate(detail.createdAt)}
                  {detail.durationSec != null ? ` · ${Math.floor(detail.durationSec / 60)}m ${detail.durationSec % 60}s` : ''}
                </p>
                <p className="text-[10px] uppercase tracking-widest text-white/30">Status: {detail.status}</p>

                <div className="flex flex-col gap-2 pt-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={saveMeta}
                    className="flex items-center justify-center gap-2 rounded-xl bg-violet-600/80 hover:bg-violet-500 px-3 py-2.5 text-xs font-bold"
                  >
                    <PiPencilSimple size={14} /> Save details
                  </button>
                  {detail.status === 'pdf_failed' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => retryPdf(detail.id)}
                      className="flex items-center justify-center gap-2 rounded-xl bg-amber-600/70 hover:bg-amber-500 px-3 py-2.5 text-xs font-bold"
                    >
                      <PiArrowClockwise size={14} /> Retry PDF
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => window.electron.Session.showInFolder(detail.id)}
                    className="flex items-center justify-center gap-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2.5 text-xs font-bold"
                  >
                    <PiDownloadSimple size={14} /> Show in Finder / Explorer
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(detail.id)}
                    className="flex items-center justify-center gap-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/20 text-red-200 px-3 py-2.5 text-xs font-bold"
                  >
                    <PiTrash size={14} /> Delete session
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
