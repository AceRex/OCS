import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  PiCalendarCheck,
  PiClock,
  PiPlus,
  PiTrash,
  PiCopy,
  PiArrowUp,
  PiArrowDown,
  PiPlay,
  PiPause,
  PiStop,
  PiSkipForward,
  PiImage,
  PiVideo,
  PiSpeakerHigh,
  PiCheck,
  PiX,
  PiWarning,
  PiPencil,
  PiShieldCheck,
  PiArrowCounterClockwise,
  PiArrowClockwise,
  PiMagnifyingGlassPlus,
  PiMagnifyingGlassMinus,
  PiFolderOpen,
  PiUploadSimple,
  PiMusicNotes,
  PiPalette,
  PiArrowsClockwise,
  PiDotsThreeVertical,
  PiPencilSimple,
  PiCursorText,
} from "react-icons/pi";
import { utilAction } from "../../Redux/state.jsx";
import DurationInput from "./DurationInput.jsx";
import {
  formatDuration,
  toTimeParts,
  toTotalSeconds,
  calculateAgendaSummary,
  detectTimelineConflicts,
  resolveTimelineConflict,
  createEmptyAgenda,
  createEmptySession,
  createTimelineItem,
  validateAgendaDocument,
  generateSequentialAgendaName,
} from "../../main/agenda/agendaModel";

const electron = typeof window !== "undefined" ? window.electron : {};

export default function AgendaController() {
  const dispatch = useDispatch();
  const loadedAgenda = useSelector((state) => state.util?.loadedAgenda);

  // Agenda Document Library
  const [agendas, setAgendas] = useState([]);
  const [selectedAgendaId, setSelectedAgendaId] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [selectedItemId, setSelectedItemId] = useState(null);

  // Agenda & Session Inline Renaming State
  const [renamingAgendaId, setRenamingAgendaId] = useState(null);
  const [renamingAgendaText, setRenamingAgendaText] = useState("");
  const [renamingSessionId, setRenamingSessionId] = useState(null);
  const [renamingSessionText, setRenamingSessionText] = useState("");
  const agendaRenameInputRef = useRef(null);
  const sessionRenameInputRef = useRef(null);

  // Undo / Redo History
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [deletedSessionUndo, setDeletedSessionUndo] = useState(null);

  // Timeline UI & Drag State
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);

  // Responsive Load State Machine
  const [isAgendaLoading, setIsAgendaLoading] = useState(false);
  const [loadStatus, setLoadStatus] = useState(null); // { status: 'success'|'error', agendaName, sessionCount, firstSession, message }

  // Media Library Chooser Modal
  const [mediaChooserTrack, setMediaChooserTrack] = useState(null); // 'visual' | 'audio' | 'background' | 'video' | null
  const [mediaChooserHint, setMediaChooserHint] = useState(null); // 'image' | 'video' | null
  const [libraryMediaFiles, setLibraryMediaFiles] = useState([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);

  // Dragging & Resizing Interactions
  const timelineContainerRef = useRef(null);
  const [dragState, setDragState] = useState(null);
  // dragState: { type: 'move'|'resize_left'|'resize_right', cueId, initialStartSec, initialDurationSec, initialSourceInSec, startPointerX, trackWidthPx, currentStartSec, currentDurationSec }

  // Track-Item Context Menu & Rename State
  const [cueContextMenu, setCueContextMenu] = useState(null); // { x, y, cue }
  const [renamingCue, setRenamingCue] = useState(null); // { cueId, name }
  const [deletedCueUndo, setDeletedCueUndo] = useState(null); // { cue, sessionId, timeoutId }

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === "Escape") {
        setCueContextMenu(null);
        setRenamingCue(null);
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  // Live Execution State from Main Process
  const [engineState, setEngineState] = useState({
    status: "idle",
    sessionIndex: 0,
    sessionElapsedSec: 0,
    sessionDurationSec: 0,
    intervalRemainingSec: 0,
    automationArmed: true,
    operatorOverridden: false,
    nextAction: null,
    nextActionInSec: null,
  });

  // Load Agendas from Desktop Main Process
  const loadAgendaList = useCallback(async () => {
    if (!electron?.Agenda?.list) return;
    try {
      const list = await electron.Agenda.list();
      setAgendas(list || []);
      if (list && list.length > 0 && !selectedAgendaId) {
        setSelectedAgendaId(list[0].id);
      }
    } catch (err) {
      console.warn("[AgendaController] Failed to list agendas:", err.message);
    }
  }, [selectedAgendaId]);

  useEffect(() => {
    loadAgendaList();

    const unsubExec = electron?.Agenda?.onExecutionState?.((state) => {
      if (state) setEngineState(state);
    });

    const unsubProg = electron?.Agenda?.onTransferProgress?.(() => {
      loadAgendaList();
    });

    return () => {
      if (typeof unsubExec === "function") unsubExec();
      if (typeof unsubProg === "function") unsubProg();
    };
  }, [loadAgendaList]);

  // Active Agenda & Session Objects
  const currentAgenda = useMemo(() => {
    return agendas.find((a) => a.id === selectedAgendaId) || agendas[0] || null;
  }, [agendas, selectedAgendaId]);

  useEffect(() => {
    if (currentAgenda && currentAgenda.sessions?.length > 0) {
      if (!selectedSessionId || !currentAgenda.sessions.some((s) => s.id === selectedSessionId)) {
        setSelectedSessionId(currentAgenda.sessions[0].id);
      }
    } else {
      setSelectedSessionId(null);
    }
  }, [currentAgenda, selectedSessionId]);

  const currentSession = useMemo(() => {
    if (!currentAgenda || !currentAgenda.sessions) return null;
    return currentAgenda.sessions.find((s) => s.id === selectedSessionId) || null;
  }, [currentAgenda, selectedSessionId]);

  const currentItem = useMemo(() => {
    if (!currentSession || !currentSession.timelineItems) return null;
    return currentSession.timelineItems.find((i) => i.id === selectedItemId) || null;
  }, [currentSession, selectedItemId]);

  // Undo / Redo Stack
  const pushUndo = useCallback((doc) => {
    if (!doc) return;
    setHistory((prev) => {
      const next = prev.slice(0, historyIndex + 1);
      return [...next, JSON.parse(JSON.stringify(doc))].slice(-30);
    });
    setHistoryIndex((prev) => Math.min(29, prev + 1));
  }, [historyIndex]);

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevDoc = history[historyIndex - 1];
      setHistoryIndex((i) => i - 1);
      setAgendas((prev) => prev.map((a) => (a.id === prevDoc.id ? prevDoc : a)));
      electron?.Agenda?.save?.(prevDoc);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextDoc = history[historyIndex + 1];
      setHistoryIndex((i) => i + 1);
      setAgendas((prev) => prev.map((a) => (a.id === nextDoc.id ? nextDoc : a)));
      electron?.Agenda?.save?.(nextDoc);
    }
  };

  // Mutator Helper
  const mutateCurrentAgenda = useCallback(
    (updater) => {
      if (!currentAgenda) return;
      pushUndo(currentAgenda);
      const updated = updater(JSON.parse(JSON.stringify(currentAgenda)));
      updated.updatedAt = Date.now();
      setAgendas((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      electron?.Agenda?.save?.(updated);
    },
    [currentAgenda, pushUndo]
  );

  // ─── 1. Agenda Creation & Naming ──────────────────────────────────────────
  const handleCreateAgenda = async () => {
    const nextName = generateSequentialAgendaName(agendas);
    const newDoc = createEmptyAgenda(nextName);
    newDoc.sessions = []; // Strictly ZERO sessions initially

    await electron?.Agenda?.save?.(newDoc);
    setAgendas((prev) => [newDoc, ...prev]);
    setSelectedAgendaId(newDoc.id);
    setSelectedSessionId(null);
    setSelectedItemId(null);

    // Immediately trigger inline renaming and focus text
    setRenamingAgendaId(newDoc.id);
    setRenamingAgendaText(newDoc.name);
  };

  useEffect(() => {
    if (renamingAgendaId && agendaRenameInputRef.current) {
      agendaRenameInputRef.current.focus();
      agendaRenameInputRef.current.select();
    }
  }, [renamingAgendaId]);

  const commitAgendaRename = () => {
    if (!renamingAgendaId) return;
    const trimmed = renamingAgendaText.trim();
    if (trimmed) {
      mutateCurrentAgenda((agenda) => {
        agenda.name = trimmed;
        return agenda;
      });
    }
    setRenamingAgendaId(null);
  };

  const handleDuplicateAgenda = async (id) => {
    if (!electron?.Agenda?.duplicate) return;
    const copy = await electron.Agenda.duplicate(id);
    if (copy) {
      setAgendas((prev) => [copy, ...prev]);
      setSelectedAgendaId(copy.id);
    }
  };

  const handleDeleteAgenda = async (id) => {
    if (agendas.length <= 1) return;
    if (window.confirm("Are you sure you want to delete this agenda?")) {
      await electron?.Agenda?.delete?.(id);
      setAgendas((prev) => prev.filter((a) => a.id !== id));
      if (selectedAgendaId === id) {
        const remaining = agendas.filter((a) => a.id !== id);
        setSelectedAgendaId(remaining[0]?.id || null);
      }
    }
  };

  // ─── 2. Session Management & Inline Renaming ──────────────────────────────
  const handleAddSession = () => {
    mutateCurrentAgenda((agenda) => {
      if (!Array.isArray(agenda.sessions)) agenda.sessions = [];
      const newSess = createEmptySession(`Session ${agenda.sessions.length + 1}`, 600);
      agenda.sessions.push(newSess);
      setSelectedSessionId(newSess.id);
      return agenda;
    });
  };

  const handleStartSessionRename = (session, e) => {
    e.stopPropagation();
    setRenamingSessionId(session.id);
    setRenamingSessionText(session.name);
  };

  useEffect(() => {
    if (renamingSessionId && sessionRenameInputRef.current) {
      sessionRenameInputRef.current.focus();
      sessionRenameInputRef.current.select();
    }
  }, [renamingSessionId]);

  const commitSessionRename = (sessionId) => {
    if (!sessionId) return;
    const trimmed = renamingSessionText.trim();
    if (trimmed) {
      handleUpdateSession(sessionId, { name: trimmed });
    }
    setRenamingSessionId(null);
  };

  const handleUpdateSession = (sessionId, updates) => {
    mutateCurrentAgenda((agenda) => {
      const idx = agenda.sessions.findIndex((s) => s.id === sessionId);
      if (idx !== -1) {
        agenda.sessions[idx] = { ...agenda.sessions[idx], ...updates };
      }
      return agenda;
    });
  };

  const handleMoveSession = (idx, direction) => {
    mutateCurrentAgenda((agenda) => {
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= agenda.sessions.length) return agenda;
      const [moved] = agenda.sessions.splice(idx, 1);
      agenda.sessions.splice(targetIdx, 0, moved);
      return agenda;
    });
  };

  const handleDeleteSession = (sessionId) => {
    if (!currentAgenda) return;
    const sessToDelete = currentAgenda.sessions.find((s) => s.id === sessionId);
    if (!sessToDelete) return;
    const sessIndex = currentAgenda.sessions.findIndex((s) => s.id === sessionId);

    // Save for Undo Toast
    setDeletedSessionUndo({
      session: JSON.parse(JSON.stringify(sessToDelete)),
      index: sessIndex,
      agendaId: currentAgenda.id,
    });

    mutateCurrentAgenda((agenda) => {
      agenda.sessions = agenda.sessions.filter((s) => s.id !== sessionId);
      return agenda;
    });

    if (selectedSessionId === sessionId) {
      const remaining = currentAgenda.sessions.filter((s) => s.id !== sessionId);
      setSelectedSessionId(remaining[0]?.id || null);
    }
  };

  const handleUndoDeleteSession = () => {
    if (!deletedSessionUndo || !currentAgenda) return;
    const { session, index } = deletedSessionUndo;
    mutateCurrentAgenda((agenda) => {
      if (!Array.isArray(agenda.sessions)) agenda.sessions = [];
      agenda.sessions.splice(index, 0, session);
      return agenda;
    });
    setSelectedSessionId(session.id);
    setDeletedSessionUndo(null);
  };

  // ─── 4. Real Media Import & Media Library ─────────────────────────────────
  const handleOpenMediaChooser = async (track, mediaTypeHint = null) => {
    setMediaChooserTrack(track);
    setMediaChooserHint(mediaTypeHint);
    setIsLoadingLibrary(true);
    try {
      if (electron?.Media?.list) {
        const list = await electron.Media.list();
        setLibraryMediaFiles(list || []);
      }
    } catch (err) {
      console.warn("Failed to load library media:", err);
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  const handleImportFromComputer = async (track, mediaTypeHint = null) => {
    if (!electron?.Agenda?.importFile || !currentSession) return;
    setMediaChooserTrack(null);
    setMediaChooserHint(null);
    try {
      const res = await electron.Agenda.importFile(track === "audio" ? "audio" : "visual");
      if (res.canceled || !res.asset) return;

      const asset = res.asset;
      attachAssetAsCue(asset, track, mediaTypeHint);
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  };

  const handleSelectExistingMedia = async (fileUrl, track, mediaTypeHint = null) => {
    if (!currentSession) return;
    setMediaChooserTrack(null);
    setMediaChooserHint(null);

    let probedDuration = 0;
    try {
      if (electron?.Agenda?.probeFile) {
        const probe = await electron.Agenda.probeFile(fileUrl);
        probedDuration = Math.round(probe?.duration || 0);
      }
    } catch (_) {}

    const filename = decodeURIComponent(fileUrl.split("/").pop() || "media_asset");
    const isAudio = track === "audio" || /\.(mp3|wav|aac|m4a|ogg|flac)$/i.test(filename);
    const isVideo = !isAudio && (mediaTypeHint === "video" || track === "video" || /\.(mp4|mov|webm|mkv|avi)$/i.test(filename));
    const durationSec = probedDuration || (isVideo ? 60 : isAudio ? 180 : 60);

    const asset = {
      id: `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      originalName: filename,
      name: filename,
      size: 0,
      hash: "",
      type: isAudio ? "audio" : (isVideo ? "video" : "image"),
      durationSec,
      localFileUrl: fileUrl,
      path: fileUrl.replace("file://", ""),
    };

    attachAssetAsCue(asset, track, mediaTypeHint);
  };

  const attachAssetAsCue = (asset, track, mediaTypeHint = null) => {
    mutateCurrentAgenda((agenda) => {
      // 1. Add to agenda asset registry if not already present
      if (!Array.isArray(agenda.assets)) agenda.assets = [];
      const exists = agenda.assets.find((a) => a.localFileUrl === asset.localFileUrl);
      const effectiveAssetId = exists ? exists.id : asset.id;
      if (!exists) {
        agenda.assets.push(asset);
      }

      // 2. Create Cue on the target session and track
      const s = agenda.sessions.find((sess) => sess.id === currentSession.id);
      if (s) {
        if (!Array.isArray(s.timelineItems)) s.timelineItems = [];

        const isAudio = track === "audio" || asset.type === "audio";
        const isVideo = !isAudio && (asset.type === "video" || mediaTypeHint === "video" || track === "video" || (asset.name && /\.(mp4|mov|webm|mkv|avi)$/i.test(asset.name)));

        // Find available start offset after last cue on this visual or audio track
        const trackItems = s.timelineItems.filter((i) =>
          isAudio
            ? i.track === "audio"
            : (i.track === "visual" || i.track === "background" || i.track === "video" || i.track === "image")
        );
        const lastEnd = trackItems.reduce(
          (max, i) => Math.max(max, i.startSec + (i.durationSec || 0)),
          0
        );
        const startSec = Math.min(Math.max(0, s.durationSec - 30), lastEnd);

        const newCue = createTimelineItem({
          track: isAudio ? "audio" : "visual",
          mediaType: isAudio ? "audio" : (isVideo ? "video" : "image"),
          presentationMode: isVideo ? "foreground" : "background",
          actionType: "range",
          startSec,
          durationSec: Math.min(s.durationSec - startSec, asset.durationSec || 60),
          sourceInSec: 0,
          sourceOutSec: asset.durationSec || null,
          assetId: effectiveAssetId,
          name: asset.originalName || asset.name,
          color: isAudio ? "#D97706" : (isVideo ? "#2563EB" : "#7C3AED"),
          url: asset.localFileUrl || asset.fileUrl,
          localFileUrl: asset.localFileUrl || asset.fileUrl,
          fileUrl: asset.localFileUrl || asset.fileUrl,
          assetType: asset.type,
        });

        s.timelineItems.push(newCue);
        setSelectedItemId(newCue.id);
        setIsInspectorOpen(true);
      }
      return agenda;
    });
  };

  const handleUpdateCue = (cueId, updates) => {
    mutateCurrentAgenda((agenda) => {
      const s = agenda.sessions.find((sess) => sess.id === currentSession?.id);
      if (s && s.timelineItems) {
        const cIdx = s.timelineItems.findIndex((c) => c.id === cueId);
        if (cIdx !== -1) {
          s.timelineItems[cIdx] = { ...s.timelineItems[cIdx], ...updates };
        }
      }
      return agenda;
    });
  };

  const handleDeleteCue = (cueId) => {
    mutateCurrentAgenda((agenda) => {
      const s = agenda.sessions.find((sess) => sess.id === currentSession?.id);
      if (s && s.timelineItems) {
        s.timelineItems = s.timelineItems.filter((c) => c.id !== cueId);
        if (selectedItemId === cueId) setSelectedItemId(null);
      }
      return agenda;
    });
  };

  const handleDeleteCueWithUndo = (cue) => {
    handleDeleteCue(cue.id);
    if (deletedCueUndo?.timeoutId) {
      clearTimeout(deletedCueUndo.timeoutId);
    }
    const timeoutId = setTimeout(() => {
      setDeletedCueUndo(null);
    }, 6000);
    setDeletedCueUndo({
      cue,
      sessionId: currentSession?.id,
      timeoutId,
    });
  };

  const handleUndoDeleteCue = () => {
    if (!deletedCueUndo) return;
    const { cue, sessionId, timeoutId } = deletedCueUndo;
    if (timeoutId) clearTimeout(timeoutId);
    mutateCurrentAgenda((agenda) => {
      const s = agenda.sessions.find((sess) => sess.id === sessionId);
      if (s) {
        if (!Array.isArray(s.timelineItems)) s.timelineItems = [];
        if (!s.timelineItems.find((i) => i.id === cue.id)) {
          s.timelineItems.push(cue);
        }
      }
      return agenda;
    });
    setSelectedItemId(cue.id);
    setDeletedCueUndo(null);
  };

  const openCueContextMenu = (e, cue) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 180;
    const menuHeight = 150;
    const x = Math.min(window.innerWidth - menuWidth - 12, Math.max(12, e.clientX || 0));
    const y = Math.min(window.innerHeight - menuHeight - 12, Math.max(12, e.clientY || 0));
    setCueContextMenu({ x, y, cue });
  };

  // ─── 5. Timeline Dragging & Resizing with Pointer Capture ─────────────────
  const handlePointerDownCue = (e, item, actionType) => {
    if (e.button !== 0) return; // Ignore right-clicks so they don't capture drag
    e.stopPropagation();
    e.preventDefault();

    const trackLane = e.currentTarget.closest(".track-lane") || e.currentTarget.parentElement;
    const trackRect = trackLane ? trackLane.getBoundingClientRect() : null;
    const trackWidth =
      trackRect && trackRect.width > 50
        ? trackRect.width
        : timelineContainerRef.current
        ? timelineContainerRef.current.clientWidth * timelineZoom
        : 1000;

    setDragState({
      type: actionType, // 'move' | 'resize_left' | 'resize_right'
      cueId: item.id,
      track: item.track,
      initialStartSec: item.startSec,
      initialDurationSec: item.durationSec || 60,
      initialSourceInSec: item.sourceInSec || 0,
      startPointerX: e.clientX,
      trackWidthPx: trackWidth,
      sessionDuration: currentSession?.durationSec || 600,
      currentStartSec: item.startSec,
      currentDurationSec: item.durationSec || 60,
    });
    setSelectedItemId(item.id);
  };

  useEffect(() => {
    if (!dragState) return;

    const handleWindowPointerMove = (e) => {
      const deltaX = e.clientX - dragState.startPointerX;
      const deltaSec = Math.round((deltaX / dragState.trackWidthPx) * dragState.sessionDuration);

      // Edge auto-scroll
      if (timelineContainerRef.current) {
        const rect = timelineContainerRef.current.getBoundingClientRect();
        if (e.clientX < rect.left + 40) {
          timelineContainerRef.current.scrollLeft -= 15;
        } else if (e.clientX > rect.right - 40) {
          timelineContainerRef.current.scrollLeft += 15;
        }
      }

      if (dragState.type === "move") {
        const maxStart = Math.max(0, dragState.sessionDuration - dragState.initialDurationSec);
        const nextStart = Math.max(0, Math.min(maxStart, dragState.initialStartSec + deltaSec));
        setDragState((prev) => (prev ? { ...prev, currentStartSec: nextStart } : null));
      } else if (dragState.type === "resize_right") {
        const maxDuration = dragState.sessionDuration - dragState.initialStartSec;
        const nextDuration = Math.max(1, Math.min(maxDuration, dragState.initialDurationSec + deltaSec));
        setDragState((prev) => (prev ? { ...prev, currentDurationSec: nextDuration } : null));
      } else if (dragState.type === "resize_left") {
        const maxStart = dragState.initialStartSec + dragState.initialDurationSec - 1;
        const nextStart = Math.max(0, Math.min(maxStart, dragState.initialStartSec + deltaSec));
        const nextDuration = dragState.initialStartSec + dragState.initialDurationSec - nextStart;
        setDragState((prev) =>
          prev
            ? {
                ...prev,
                currentStartSec: nextStart,
                currentDurationSec: nextDuration,
              }
            : null
        );
      }
    };

    const handleWindowPointerUp = () => {
      const { cueId, type, currentStartSec, currentDurationSec, initialStartSec } = dragState;

      // Commit single undo step
      mutateCurrentAgenda((agenda) => {
        const s = agenda.sessions.find((sess) => sess.id === currentSession?.id);
        if (s && s.timelineItems) {
          const c = s.timelineItems.find((item) => item.id === cueId);
          if (c) {
            if (type === "move") {
              c.startSec = currentStartSec;
            } else if (type === "resize_right") {
              c.durationSec = currentDurationSec;
            } else if (type === "resize_left") {
              const shift = currentStartSec - initialStartSec;
              c.startSec = currentStartSec;
              c.durationSec = currentDurationSec;
              if (c.track !== "background") {
                c.sourceInSec = Math.max(0, (c.sourceInSec || 0) + shift);
              }
            }
          }
        }
        return agenda;
      });

      setDragState(null);
    };

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
    };
  }, [dragState, currentSession?.id]);

  // ─── 6. Load Agenda Pipeline (Zero Live Display Changes) ──────────────────
  const handleLoadAgenda = async (doc) => {
    if (!doc || !electron?.Agenda?.load) return;

    if (engineState.status === "running" || engineState.status === "interval") {
      setReplaceConfirmOpen(true);
      return;
    }

    setIsAgendaLoading(true);
    try {
      const res = await electron.Agenda.load(doc);
      if (res.ok) {
        dispatch(utilAction.setLoadedAgenda(doc));
        const firstSess = res.readiness?.firstSession || (doc.sessions && doc.sessions[0] ? {
          name: doc.sessions[0].name || 'Session 1',
          durationSec: doc.sessions[0].durationSec || 0,
          person: doc.sessions[0].person || '',
        } : null);
        setLoadStatus({
          status: 'success',
          agendaName: doc.name,
          sessionCount: doc.sessions?.length || 0,
          firstSession: firstSess,
        });
      } else {
        const errMsg = (res.errors || [res.error]).join(", ");
        setLoadStatus({
          status: 'error',
          message: errMsg,
        });
      }
    } catch (err) {
      setLoadStatus({
        status: 'error',
        message: err.message,
      });
    } finally {
      setIsAgendaLoading(false);
    }
  };

  const sessionSummary = useMemo(() => {
    return calculateAgendaSummary(currentAgenda);
  }, [currentAgenda]);

  const conflicts = useMemo(() => {
    return detectTimelineConflicts(currentSession);
  }, [currentSession]);

  const hasUnappliedDraftChanges = useMemo(() => {
    if (!loadedAgenda || !currentAgenda) return false;
    if (loadedAgenda.id !== currentAgenda.id) return false;
    return JSON.stringify(loadedAgenda.sessions) !== JSON.stringify(currentAgenda.sessions);
  }, [loadedAgenda, currentAgenda]);

  const sessionDuration = currentSession?.durationSec || 600;

  return (
    <div className="w-full h-full flex flex-col bg-[#0B0814] text-white select-none overflow-hidden font-sans">
      {/* ── Top Header & Execution Bar ──────────────────────────────────────── */}
      <header className="h-14 border-b border-white/10 px-5 flex items-center justify-between bg-[#120D22]/90 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-[#7C3AED]/20 border border-[#7C3AED]/40 rounded-[12px] text-[#A788FA]">
            <PiCalendarCheck size={20} />
          </div>

          {/* Agenda Switcher / Sequential Name Inline Editor */}
          <div className="flex items-center gap-2">
            {renamingAgendaId === currentAgenda?.id ? (
              <input
                ref={agendaRenameInputRef}
                type="text"
                value={renamingAgendaText}
                onChange={(e) => setRenamingAgendaText(e.target.value)}
                onBlur={commitAgendaRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitAgendaRename();
                  if (e.key === "Escape") setRenamingAgendaId(null);
                }}
                className="bg-black/40 border border-[#7C3AED] rounded-[12px] px-3 py-1 text-sm font-bold text-white focus:outline-none"
              />
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (currentAgenda) {
                      setRenamingAgendaId(currentAgenda.id);
                      setRenamingAgendaText(currentAgenda.name);
                    }
                  }}
                  className="flex items-center gap-2 hover:bg-white/5 px-2.5 py-1 rounded-[12px] border border-transparent hover:border-white/10 cursor-pointer"
                  title="Click to rename agenda"
                >
                  <span className="text-sm font-black text-white uppercase tracking-wide">
                    {currentAgenda?.name || "No Agenda"}
                  </span>
                  <PiPencil size={12} className="text-white/40" />
                </button>

                {/* Agenda Select Dropdown */}
                {agendas.length > 1 && (
                  <select
                    value={selectedAgendaId || ""}
                    onChange={(e) => {
                      setSelectedAgendaId(e.target.value);
                      setSelectedSessionId(null);
                      setSelectedItemId(null);
                    }}
                    className="bg-white/5 border border-white/10 rounded-[12px] px-2 py-1 text-xs text-white/70 focus:outline-none"
                  >
                    {agendas.map((a) => (
                      <option key={a.id} value={a.id} className="bg-[#120D22] text-white">
                        {a.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <button
              onClick={handleCreateAgenda}
              className="flex items-center gap-1.5 px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-[12px] text-xs font-semibold text-[#A788FA] transition-colors cursor-pointer"
              title="Create New Sequential Agenda"
            >
              <PiPlus size={13} />
              <span>New Agenda</span>
            </button>
          </div>
        </div>

        {/* Live Engine Status & Load Actions */}
        <div className="flex items-center gap-3">
          {engineState.status !== "idle" && (
            <div className="flex items-center gap-3 px-3 py-1.5 bg-white/5 border border-white/10 rounded-[12px]">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    engineState.status === "running"
                      ? "bg-emerald-400 animate-pulse"
                      : engineState.status === "paused"
                      ? "bg-amber-400"
                      : "bg-blue-400"
                  }`}
                />
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  {engineState.status}
                </span>
              </div>
              <span className="text-xs font-mono text-[#A788FA]">
                {formatDuration(engineState.sessionElapsedSec)} / {formatDuration(engineState.sessionDurationSec)}
              </span>

              {/* Execution Controls */}
              <div className="flex items-center gap-1">
                {engineState.status === "running" ? (
                  <button
                    onClick={() => electron?.Agenda?.controlExecution?.({ command: "pause" })}
                    className="p-1.5 bg-white/10 hover:bg-white/20 rounded-[12px] text-white cursor-pointer"
                    title="Pause Execution"
                  >
                    <PiPause size={14} />
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      if (hasUnappliedDraftChanges || !loadedAgenda || loadedAgenda.id !== currentAgenda?.id) {
                        await handleLoadAgenda(currentAgenda);
                      }
                      if (engineState.status === "paused") {
                        electron?.Agenda?.controlExecution?.({ command: "resume" });
                      } else {
                        const sIdx = currentAgenda?.sessions ? currentAgenda.sessions.findIndex((s) => s.id === currentSession?.id) : 0;
                        electron?.Agenda?.controlExecution?.({
                          command: "start",
                          payload: { sessionIndex: Math.max(0, sIdx), agenda: currentAgenda },
                        });
                      }
                    }}
                    className="p-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-[12px] text-white cursor-pointer"
                    title={engineState.status === "paused" ? "Resume Execution" : "Start Session Execution"}
                  >
                    <PiPlay size={14} />
                  </button>
                )}
                <button
                  onClick={() => electron?.Agenda?.controlExecution?.({ command: "stop" })}
                  className="p-1.5 bg-red-600/30 hover:bg-red-600 rounded-[12px] text-white cursor-pointer"
                  title="Stop Execution"
                >
                  <PiStop size={14} />
                </button>
                <button
                  onClick={() => electron?.Agenda?.controlExecution?.({ command: "next" })}
                  className="p-1.5 bg-white/10 hover:bg-white/20 rounded-[12px] text-white cursor-pointer"
                  title="Next Session"
                >
                  <PiSkipForward size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Undo / Redo */}
          <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-[12px] p-0.5">
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="p-1.5 hover:bg-white/10 rounded-[12px] text-white/70 hover:text-white disabled:opacity-20 cursor-pointer"
              title="Undo"
            >
              <PiArrowCounterClockwise size={14} />
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="p-1.5 hover:bg-white/10 rounded-[12px] text-white/70 hover:text-white disabled:opacity-20 cursor-pointer"
              title="Redo"
            >
              <PiArrowClockwise size={14} />
            </button>
          </div>

          {/* Load Agenda Button (Strict Zero Live Output Push) */}
          <button
            onClick={() => handleLoadAgenda(currentAgenda)}
            disabled={!currentAgenda || currentAgenda.sessions?.length === 0 || isAgendaLoading}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#7C3AED] to-[#6D28D9] hover:brightness-110 disabled:opacity-40 rounded-[12px] text-white text-xs font-bold uppercase tracking-wider shadow-lg shadow-[#7C3AED]/30 transition-all cursor-pointer"
            title="Load agenda into Timer and media decks without changing live audience output"
          >
            {isAgendaLoading ? (
              <>
                <PiArrowsClockwise size={16} className="animate-spin" />
                <span>Loading...</span>
              </>
            ) : (
              <>
                <PiShieldCheck size={16} />
                <span>Load Agenda</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* ── Responsive Loaded State Card ────────────────────────────────────── */}
      {loadStatus?.status === 'success' && (
        <div className="bg-emerald-950/60 border-b border-emerald-500/40 px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-emerald-200 shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 font-bold text-emerald-300">
              <PiCheck size={16} className="text-emerald-400" />
              <span>Loaded — Ready to start</span>
            </div>
            <span className="text-white/30">•</span>
            <span>Agenda: <strong className="text-white">{loadStatus.agendaName}</strong> ({loadStatus.sessionCount} sessions)</span>
            {loadStatus.firstSession && (
              <>
                <span className="text-white/30">•</span>
                <span>First Session: <strong className="text-white">{loadStatus.firstSession.name}</strong> ({formatDuration(loadStatus.firstSession.durationSec)})</span>
                {loadStatus.firstSession.person ? (
                  <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-400/30 rounded-[12px] text-emerald-200 font-semibold">
                    👤 {loadStatus.firstSession.person}
                  </span>
                ) : null}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent('switch-controller-tab', { detail: 'timer' }));
              }}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 rounded-[12px] text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow transition-all"
              title="Open Timer tab on controller"
            >
              <PiClock size={14} />
              <span>Open Timer</span>
            </button>
            <button
              onClick={() => setLoadStatus(null)}
              className="p-1 hover:bg-white/10 rounded-[12px] text-white/50 hover:text-white cursor-pointer"
              title="Dismiss"
            >
              <PiX size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Load Error Actionable Alert ───────────────────────────────────────── */}
      {loadStatus?.status === 'error' && (
        <div className="bg-red-950/70 border-b border-red-500/40 px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-red-200 shrink-0">
          <div className="flex items-center gap-2">
            <PiWarning size={16} className="text-red-400 shrink-0" />
            <span>Load Failed: {loadStatus.message}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleLoadAgenda(currentAgenda)}
              className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded-[12px] text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <PiArrowClockwise size={13} />
              <span>Retry</span>
            </button>
            <button
              onClick={() => setLoadStatus(null)}
              className="p-1 hover:bg-white/10 rounded-[12px] text-white/50 hover:text-white cursor-pointer"
            >
              <PiX size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Merged Manual Recording Notice ───────────────────────────────────── */}
      {engineState?.recordingState?.status === 'merged_manual' && (
        <div className="bg-amber-950/60 border-b border-amber-500/40 px-5 py-2 flex items-center gap-2 text-xs text-amber-200 shrink-0">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
          <span className="font-bold">Existing recording active — no separate session file.</span>
          <span className="text-white/60">Manual recording continues undisturbed.</span>
        </div>
      )}

      {/* ── Unapplied Draft Edits Alert Banner ─────────────────────────────────── */}
      {hasUnappliedDraftChanges && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-5 py-2 flex items-center justify-between text-xs text-amber-200 shrink-0">
          <div className="flex items-center gap-2">
            <PiWarning size={16} className="text-amber-400 shrink-0" />
            <span>
              Draft schedule has unapplied edits. Loaded snapshot running on controller will not reflect these changes until updated.
            </span>
          </div>
          <button
            onClick={() => handleLoadAgenda(currentAgenda)}
            className="px-3 py-1 bg-amber-500/25 hover:bg-amber-500/40 border border-amber-400/40 rounded-[12px] text-amber-100 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <PiArrowClockwise size={13} />
            <span>Update Loaded Agenda</span>
          </button>
        </div>
      )}

      {/* ── Main 3-Panel Workspace Layout ────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── PANEL 1: Session List (Left Panel, 260px) ────────────────────────── */}
        <aside className="w-64 border-r border-white/10 bg-[#0F0B1C]/90 p-4 flex flex-col gap-3 shrink-0 overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-white/50">
              Sessions ({currentAgenda?.sessions?.length || 0})
            </span>
            <button
              onClick={handleAddSession}
              disabled={!currentAgenda}
              className="flex items-center gap-1 px-2.5 py-1 bg-[#7C3AED]/20 hover:bg-[#7C3AED]/30 border border-[#7C3AED]/40 rounded-[12px] text-xs font-bold text-[#A788FA] cursor-pointer"
              title="Add Session"
            >
              <PiPlus size={13} />
              <span>Add</span>
            </button>
          </div>

          {/* Sessions List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {(!currentAgenda?.sessions || currentAgenda.sessions.length === 0) ? (
              <div className="p-4 rounded-[12px] border border-dashed border-white/10 text-center text-xs text-white/40 space-y-2 mt-4">
                <p>No sessions in this agenda yet.</p>
                <button
                  onClick={handleAddSession}
                  className="px-3 py-1.5 bg-[#7C3AED]/20 hover:bg-[#7C3AED]/30 border border-[#7C3AED]/40 rounded-[12px] text-xs font-bold text-[#A788FA] cursor-pointer"
                >
                  + Add First Session
                </button>
              </div>
            ) : (
              currentAgenda.sessions.map((session, idx) => {
                const isSelected = session.id === currentSession?.id;
                return (
                  <div
                    key={session.id}
                    onClick={() => {
                      setSelectedSessionId(session.id);
                      setSelectedItemId(null);
                    }}
                    className={`p-2.5 rounded-[12px] border transition-all cursor-pointer group flex flex-col gap-1.5 ${
                      isSelected
                        ? "bg-[#7C3AED]/20 border-[#7C3AED] shadow-md shadow-[#7C3AED]/10"
                        : "bg-white/5 border-white/5 hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-[10px] font-bold text-white/30 font-mono">
                          #{idx + 1}
                        </span>
                        {renamingSessionId === session.id ? (
                          <input
                            ref={sessionRenameInputRef}
                            type="text"
                            value={renamingSessionText}
                            onChange={(e) => setRenamingSessionText(e.target.value)}
                            onBlur={() => commitSessionRename(session.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitSessionRename(session.id);
                              if (e.key === "Escape") setRenamingSessionId(null);
                            }}
                            className="w-full bg-black/50 border border-[#7C3AED] rounded-[12px] px-2 py-0.5 text-xs text-white focus:outline-none"
                          />
                        ) : (
                          <span
                            onDoubleClick={(e) => handleStartSessionRename(session, e)}
                            className="text-xs font-bold text-white truncate"
                            title="Double-click to rename"
                          >
                            {session.name}
                          </span>
                        )}
                      </div>

                      {/* Reorder & Delete Controls */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleStartSessionRename(session, e)}
                          className="p-1 hover:text-[#A788FA]"
                          title="Rename"
                        >
                          <PiPencil size={11} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveSession(idx, -1);
                          }}
                          disabled={idx === 0}
                          className="p-1 hover:text-white disabled:opacity-20"
                          title="Move Up"
                        >
                          <PiArrowUp size={11} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveSession(idx, 1);
                          }}
                          disabled={idx === currentAgenda.sessions.length - 1}
                          className="p-1 hover:text-white disabled:opacity-20"
                          title="Move Down"
                        >
                          <PiArrowDown size={11} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSession(session.id);
                          }}
                          className="p-1 hover:text-red-400"
                          title="Delete Session"
                        >
                          <PiTrash size={11} />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-white/40">
                      <span className="font-mono text-[#A788FA]">
                        {formatDuration(session.durationSec)}
                      </span>
                      {session.person ? (
                        <span className="text-purple-300 font-semibold truncate max-w-[90px]" title={session.person}>
                          👤 {session.person}
                        </span>
                      ) : null}
                      <span>
                        {session.timelineItems?.length || 0} cues
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Total Event Summary */}
          <div className="bg-[#17112B] p-3 rounded-[12px] border border-white/10 shrink-0">
            <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider block mb-1">
              Event Total Runtime
            </span>
            <div className="text-xl font-black text-white tracking-tight">
              {sessionSummary.formattedTotalTime}
            </div>
            <div className="text-[10px] text-white/50 mt-1">
              {sessionSummary.sessionCount} Sessions • {sessionSummary.mediaCount} Media Cues
            </div>
          </div>
        </aside>

        {/* ── PANEL 2: Main Session Settings & Timeline (Center Panel) ─────────── */}
        <main className="flex-1 flex flex-col overflow-hidden bg-[#0B0814] relative">
          {/* Active Session Settings Header */}
          {currentSession ? (
            <div className="p-4 border-b border-white/10 bg-[#120D22]/40 shrink-0 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-6">
                {/* Duration Input */}
                <DurationInput
                  label="Session Duration"
                  value={currentSession.durationSec}
                  onChange={(newSec) => handleUpdateSession(currentSession.id, { durationSec: newSec })}
                />

                {/* Person Taking This Session */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold text-white/50 tracking-wider">
                    Person Taking Session
                  </span>
                  <div className="flex items-center bg-[#120D22]/80 border border-white/10 rounded-[12px] px-3 py-1.5 focus-within:border-[#7C3AED] transition-colors">
                    <input
                      type="text"
                      placeholder="e.g. Pastor John, Speaker..."
                      value={currentSession.person || ""}
                      onChange={(e) => handleUpdateSession(currentSession.id, { person: e.target.value })}
                      className="bg-transparent text-xs text-white placeholder:text-white/30 focus:outline-none w-44"
                    />
                  </div>
                </div>

                {/* Transition Behavior Segmented Toggle */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold text-white/50 tracking-wider">
                    After Session
                  </span>
                  <div className="flex items-center bg-[#120D22]/80 border border-white/10 rounded-[12px] p-1">
                    <button
                      type="button"
                      onClick={() => handleUpdateSession(currentSession.id, { transitionMode: "auto" })}
                      className={`px-3 py-1 rounded-[12px] text-xs font-semibold transition-colors cursor-pointer ${
                        currentSession.transitionMode === "auto"
                          ? "bg-[#7C3AED] text-white"
                          : "text-white/50 hover:text-white"
                      }`}
                    >
                      Start Next Automatically
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateSession(currentSession.id, { transitionMode: "manual" })}
                      className={`px-3 py-1 rounded-[12px] text-xs font-semibold transition-colors cursor-pointer ${
                        currentSession.transitionMode !== "auto"
                          ? "bg-[#7C3AED] text-white"
                          : "text-white/50 hover:text-white"
                      }`}
                    >
                      Wait for Operator
                    </button>
                  </div>
                </div>

                {/* Gap Before Next (Only if auto) */}
                {currentSession.transitionMode === "auto" && (
                  <DurationInput
                    label="Gap Before Next"
                    value={currentSession.intervalSec || 0}
                    onChange={(newSec) => handleUpdateSession(currentSession.id, { intervalSec: newSec })}
                  />
                )}

                {/* Session Playout Recording Toggle */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold text-white/50 tracking-wider">
                    Playout Recording
                  </span>
                  <label className="flex items-center gap-2 px-3 py-1.5 bg-[#120D22]/80 border border-white/10 rounded-[12px] cursor-pointer hover:border-white/20 transition-all select-none">
                    <input
                      type="checkbox"
                      checked={!!currentSession.recordSession}
                      onChange={(e) => handleUpdateSession(currentSession.id, { recordSession: e.target.checked })}
                      className="rounded accent-red-500 cursor-pointer w-3.5 h-3.5"
                    />
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${currentSession.recordSession ? "bg-red-500 animate-pulse" : "bg-white/20"}`} />
                      <span className={`text-xs font-semibold ${currentSession.recordSession ? "text-red-300" : "text-white/60"}`}>
                        Record this session
                      </span>
                    </div>
                  </label>
                </div>

                {/* Active Session Recording Status */}
                {engineState?.recordingState && engineState.recordingState.status !== 'idle' && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-red-950/40 border border-red-500/30 rounded-[12px] text-xs self-end">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                    <span className="text-red-300 font-bold">
                      {engineState.recordingState.status === 'recording'
                        ? 'Recording Active'
                        : engineState.recordingState.status === 'merged_manual'
                        ? 'In Manual Rec'
                        : engineState.recordingState.status === 'failed'
                        ? `Rec Failed: ${engineState.recordingState.error}`
                        : 'Recording'}
                    </span>
                    {engineState.recordingState.outputPath && (
                      <button
                        type="button"
                        onClick={() => electron?.Recorder?.revealFile?.(engineState.recordingState.outputPath)}
                        className="text-[10px] underline text-white/60 hover:text-white ml-1 cursor-pointer"
                        title="Show recorded file in system file manager"
                      >
                        Show in Folder
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Track Media Action Buttons & Zoom */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleOpenMediaChooser("visual", "image")}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 rounded-[12px] border border-purple-500/40 text-purple-200 text-xs font-semibold cursor-pointer"
                  >
                    <PiImage size={14} />
                    <span>+ Add Image</span>
                  </button>
                  <button
                    onClick={() => handleOpenMediaChooser("visual", "video")}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 rounded-[12px] border border-blue-500/40 text-blue-200 text-xs font-semibold cursor-pointer"
                  >
                    <PiVideo size={14} />
                    <span>+ Add Video</span>
                  </button>
                  <button
                    onClick={() => handleOpenMediaChooser("audio")}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 rounded-[12px] border border-amber-500/40 text-amber-200 text-xs font-semibold cursor-pointer"
                  >
                    <PiSpeakerHigh size={14} />
                    <span>+ Add Audio</span>
                  </button>
                </div>

                {/* Zoom Controls */}
                <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-[12px] p-0.5 ml-2">
                  <button
                    onClick={() => setTimelineZoom((z) => Math.max(1, z - 0.5))}
                    disabled={timelineZoom <= 1}
                    className="p-1 hover:bg-white/10 rounded-[12px] text-white/50 hover:text-white disabled:opacity-20 cursor-pointer"
                    title="Zoom Out"
                  >
                    <PiMagnifyingGlassMinus size={13} />
                  </button>
                  <span className="text-[10px] font-mono text-white/50 px-1">{timelineZoom}x</span>
                  <button
                    onClick={() => setTimelineZoom((z) => Math.min(3, z + 0.5))}
                    disabled={timelineZoom >= 3}
                    className="p-1 hover:bg-white/10 rounded-[12px] text-white/50 hover:text-white disabled:opacity-20 cursor-pointer"
                    title="Zoom In"
                  >
                    <PiMagnifyingGlassPlus size={13} />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 border-b border-white/10 bg-[#120D22]/40 text-xs text-white/40">
              No session selected. Select or create a session to start editing.
            </div>
          )}

          {/* Timeline Conflict Warning */}
          {conflicts.length > 0 && (
            <div className="px-5 py-2 bg-amber-500/10 border-b border-amber-500/30 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <PiWarning size={16} className="text-amber-400" />
                <span className="text-xs font-semibold text-amber-300">
                  {conflicts[0].description}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {conflicts[0].resolutions.map((res, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      mutateCurrentAgenda((agenda) => {
                        const s = agenda.sessions.find((sess) => sess.id === currentSession.id);
                        if (s) {
                          const resolved = resolveTimelineConflict(s, conflicts[0].id, res.type);
                          const sIdx = agenda.sessions.findIndex((sess) => sess.id === currentSession.id);
                          agenda.sessions[sIdx] = resolved;
                        }
                        return agenda;
                      });
                    }}
                    className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 rounded-[12px] border border-amber-500/40 text-amber-200 text-xs font-bold cursor-pointer"
                  >
                    {res.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Timeline Multi-Track Canvas */}
          <div
            ref={timelineContainerRef}
            className="flex-1 overflow-y-auto overflow-x-auto p-5 relative"
          >
            {/* Live Dragging HUD */}
            {dragState && (
              <div className="sticky top-0 z-40 mb-3 flex items-center justify-center pointer-events-none">
                <div className="px-4 py-1.5 rounded-[12px] bg-black/90 border border-[#7C3AED] shadow-2xl backdrop-blur-md flex items-center gap-3 text-xs font-mono">
                  <span className="text-white/60">
                    Start: <strong className="text-white">{formatDuration(dragState.currentStartSec)}</strong>
                  </span>
                  <span className="text-white/30">|</span>
                  <span className="text-white/60">
                    End: <strong className="text-white">{formatDuration(dragState.currentStartSec + dragState.currentDurationSec)}</strong>
                  </span>
                  <span className="text-white/30">|</span>
                  <span className="text-[#A788FA]">
                    Duration: <strong>{formatDuration(dragState.currentDurationSec)}</strong>
                  </span>
                </div>
              </div>
            )}

            {currentSession ? (
              <div
                style={{ width: `${Math.max(100, 100 * timelineZoom)}%` }}
                className="min-w-full space-y-4 pb-8"
              >
                {/* Time Ruler */}
                <div className="h-6 border-b border-white/10 flex items-center justify-between text-[10px] font-mono text-white/40 px-1">
                  <span>00:00:00</span>
                  <span>{formatDuration(sessionDuration * 0.25)}</span>
                  <span>{formatDuration(sessionDuration * 0.5)}</span>
                  <span>{formatDuration(sessionDuration * 0.75)}</span>
                  <span>{formatDuration(sessionDuration)}</span>
                </div>

                {/* Unified Cue Track (Images, Videos, & Audio) */}
                <div className="bg-[#140F26]/70 border border-purple-500/30 rounded-[12px] p-3 min-h-[140px] relative shadow-inner">
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2 text-purple-300 text-[10px] font-bold uppercase tracking-wider">
                      <div className="flex items-center gap-1.5">
                        <PiImage size={14} className="text-purple-400" />
                        <span className="text-white/30">•</span>
                        <PiVideo size={14} className="text-blue-400" />
                        <span className="text-white/30">•</span>
                        <PiMusicNotes size={14} className="text-amber-400" />
                        <span className="text-white/30">•</span>
                        <PiPalette size={14} className="text-pink-400" />
                      </div>
                      <span>Unified Cue Track</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[9px] text-white/40 font-mono">
                        {(currentSession.timelineItems || []).length} cues ({(currentSession.timelineItems || []).filter((i) => i.track !== "audio" && i.mediaType !== "audio").length} visual, {(currentSession.timelineItems || []).filter((i) => i.track === "audio" || i.mediaType === "audio").length} audio)
                      </span>
                    </div>
                  </div>

                  {/* Stacked Sub-Lanes */}
                  <div className="space-y-2">
                    {/* Visual Sub-Lane (Foreground & Background) */}
                    <div>
                      <div className="flex items-center justify-between mb-1 px-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-purple-300/60">
                          Visual Playout (Images & Videos)
                        </span>
                      </div>
                      <div className="track-lane relative h-12 bg-black/40 rounded-[12px] overflow-hidden border border-white/5">
                        {(currentSession.timelineItems || [])
                          .filter((i) => i.track !== "audio" && i.mediaType !== "audio")
                          .map((item) => {
                            const isDragging = dragState?.cueId === item.id;
                            const start = isDragging ? dragState.currentStartSec : item.startSec;
                            const duration = isDragging ? dragState.currentDurationSec : (item.durationSec || 60);

                            const leftPct = (start / sessionDuration) * 100;
                            const widthPct = Math.max(1, (duration / sessionDuration) * 100);
                            const isSelected = item.id === selectedItemId;

                            const isVideo = item.mediaType === "video" || item.track === "video" || (item.name && /\.(mp4|mov|webm|mkv|avi)$/i.test(item.name));
                            const isForeground = item.presentationMode === "foreground" || (!item.presentationMode && item.track === "video");

                            return (
                              <div
                                key={item.id}
                                onPointerDown={(e) => handlePointerDownCue(e, item, "move")}
                                onContextMenu={(e) => openCueContextMenu(e, item)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedItemId(item.id);
                                  setIsInspectorOpen(true);
                                }}
                                style={{
                                  left: `${Math.min(99, leftPct)}%`,
                                  width: `${Math.min(100 - leftPct, widthPct)}%`,
                                }}
                                className={`absolute top-1 bottom-1 rounded-[12px] border px-1 flex items-center justify-between cursor-grab active:cursor-grabbing transition-all select-none ${
                                  isSelected
                                    ? isVideo
                                      ? "bg-blue-600 border-white shadow-lg shadow-blue-500/40 z-10"
                                      : "bg-purple-600 border-white shadow-lg shadow-purple-500/40 z-10"
                                    : isVideo
                                    ? "bg-blue-900/70 border-blue-500/40 hover:border-blue-300"
                                    : "bg-purple-900/70 border-purple-500/40 hover:border-purple-300"
                                }`}
                              >
                                {/* Left Resize Handle */}
                                <div
                                  onPointerDown={(e) => handlePointerDownCue(e, item, "resize_left")}
                                  className="absolute left-0 top-0 bottom-0 w-3 hover:bg-white/40 cursor-ew-resize rounded-l-[12px] flex items-center justify-center z-20 group"
                                  title="Drag left edge to adjust start boundary"
                                >
                                  <div className="w-[3px] h-3.5 bg-white/30 rounded-full group-hover:bg-white transition-colors" />
                                </div>

                                {/* Media Type Icon & Layer Badge */}
                                <div className="flex items-center gap-1.5 ml-2 shrink-0">
                                  {isVideo ? (
                                    <PiVideo size={13} className="text-blue-300 shrink-0" />
                                  ) : (
                                    <PiImage size={13} className="text-purple-300 shrink-0" />
                                  )}
                                  <span className={`px-1 py-0.2 rounded text-[8px] font-mono uppercase font-bold tracking-wider ${
                                    isForeground ? "bg-blue-500/30 text-blue-200 border border-blue-400/30" : "bg-purple-500/30 text-purple-200 border border-purple-400/30"
                                  }`}>
                                    {isForeground ? "FG" : "BG"}
                                  </span>
                                </div>

                                {(() => {
                                  const cueRt = engineState?.cues?.find((c) => c.id === item.id);
                                  if (cueRt?.executionStatus === 'failed') {
                                    return (
                                      <span
                                        className="px-1.5 py-0.5 rounded bg-red-500/80 text-white text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm ml-1"
                                        title={`Failed: ${cueRt.failureReason || 'Playback error'}`}
                                      >
                                        <PiWarning size={11} /> Failed
                                      </span>
                                    );
                                  }
                                  if (cueRt?.executionStatus === 'active') {
                                    return (
                                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-1 shrink-0" title="Live Active on Output" />
                                    );
                                  }
                                  return null;
                                })()}

                                <span className="text-[11px] font-bold text-white truncate pointer-events-none px-2 flex-1">
                                  {item.name}
                                </span>
                                <span className="text-[9px] font-mono text-white/70 pointer-events-none pr-1 shrink-0">
                                  {formatDuration(duration)}
                                </span>

                                {/* Three-dot context menu button */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openCueContextMenu(e, item);
                                  }}
                                  className="p-1 hover:bg-white/20 rounded-[12px] text-white/70 hover:text-white mr-2 z-20 cursor-pointer"
                                  title="Cue options"
                                >
                                  <PiDotsThreeVertical size={13} />
                                </button>

                                {/* Right Resize Handle */}
                                <div
                                  onPointerDown={(e) => handlePointerDownCue(e, item, "resize_right")}
                                  className="absolute right-0 top-0 bottom-0 w-3 hover:bg-white/40 cursor-ew-resize rounded-r-[12px] flex items-center justify-center z-20 group"
                                  title="Drag right edge to extend/shorten duration"
                                >
                                  <div className="w-[3px] h-3.5 bg-white/30 rounded-full group-hover:bg-white transition-colors" />
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>

                    {/* Audio Sub-Lane (Voice & Music) */}
                    <div>
                      <div className="flex items-center justify-between mb-1 px-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-amber-300/60">
                          Audio Playout (Sound & Voice)
                        </span>
                      </div>
                      <div className="track-lane relative h-11 bg-black/30 rounded-[12px] overflow-hidden border border-amber-500/20">
                        {(currentSession.timelineItems || [])
                          .filter((i) => i.track === "audio" || i.mediaType === "audio")
                          .map((item) => {
                            const isDragging = dragState?.cueId === item.id;
                            const start = isDragging ? dragState.currentStartSec : item.startSec;
                            const duration = isDragging ? dragState.currentDurationSec : (item.durationSec || 60);

                            const leftPct = (start / sessionDuration) * 100;
                            const widthPct = Math.max(1, (duration / sessionDuration) * 100);
                            const isSelected = item.id === selectedItemId;

                            return (
                              <div
                                key={item.id}
                                onPointerDown={(e) => handlePointerDownCue(e, item, "move")}
                                onContextMenu={(e) => openCueContextMenu(e, item)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedItemId(item.id);
                                  setIsInspectorOpen(true);
                                }}
                                style={{
                                  left: `${Math.min(99, leftPct)}%`,
                                  width: `${Math.min(100 - leftPct, widthPct)}%`,
                                }}
                                className={`absolute top-1 bottom-1 rounded-[12px] border px-1 flex items-center justify-between cursor-grab active:cursor-grabbing transition-all select-none ${
                                  isSelected
                                    ? "bg-amber-600 border-white shadow-lg shadow-amber-500/40 z-10"
                                    : "bg-amber-900/60 border-amber-500/40 hover:border-amber-300"
                                }`}
                              >
                                {/* Left Resize Handle */}
                                <div
                                  onPointerDown={(e) => handlePointerDownCue(e, item, "resize_left")}
                                  className="absolute left-0 top-0 bottom-0 w-3 hover:bg-white/40 cursor-ew-resize rounded-l-[12px] flex items-center justify-center z-20 group"
                                  title="Drag left edge to adjust start boundary"
                                >
                                  <div className="w-[3px] h-3.5 bg-white/30 rounded-full group-hover:bg-white transition-colors" />
                                </div>

                                <div className="flex items-center gap-1.5 ml-2 shrink-0">
                                  <PiMusicNotes size={13} className="text-amber-300 shrink-0" />
                                  <span className="px-1 py-0.2 rounded text-[8px] font-mono uppercase font-bold tracking-wider bg-amber-500/30 text-amber-200 border border-amber-400/30">
                                    AUDIO
                                  </span>
                                </div>

                                {(() => {
                                  const cueRt = engineState?.cues?.find((c) => c.id === item.id);
                                  if (cueRt?.executionStatus === 'failed') {
                                    return (
                                      <span
                                        className="px-1.5 py-0.5 rounded bg-red-500/80 text-white text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm"
                                        title={`Failed: ${cueRt.failureReason || 'Playback error'}`}
                                      >
                                        <PiWarning size={11} /> Failed
                                      </span>
                                    );
                                  }
                                  if (cueRt?.executionStatus === 'active') {
                                    return (
                                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Live Active on Output" />
                                    );
                                  }
                                  return null;
                                })()}
                                <span className="text-[11px] font-bold text-white truncate pointer-events-none px-2 flex-1">
                                  {item.name}
                                </span>
                                <span className="text-[9px] font-mono text-amber-200 pointer-events-none pr-1">
                                  {formatDuration(duration)}
                                </span>

                                {/* Three-dot context menu button */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openCueContextMenu(e, item);
                                  }}
                                  className="p-1 hover:bg-white/20 rounded-[12px] text-white/70 hover:text-white mr-2.5 z-20 cursor-pointer"
                                  title="Cue options"
                                >
                                  <PiDotsThreeVertical size={13} />
                                </button>

                                {/* Right Resize Handle */}
                                <div
                                  onPointerDown={(e) => handlePointerDownCue(e, item, "resize_right")}
                                  className="absolute right-0 top-0 bottom-0 w-3 hover:bg-white/40 cursor-ew-resize rounded-r-[12px] flex items-center justify-center z-20 group"
                                  title="Drag right edge to extend/shorten duration"
                                >
                                  <div className="w-[3px] h-3.5 bg-white/30 rounded-full group-hover:bg-white transition-colors" />
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-white/40 text-sm">
                <PiCalendarCheck size={40} className="mb-2 opacity-30" />
                <p>Select or create a session to open the multi-track timeline</p>
              </div>
            )}

            {/* Drag Tooltip */}
            {dragState && (
              <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-[#17112B] border border-[#7C3AED] rounded-[12px] px-4 py-2 text-xs font-mono text-white shadow-2xl z-50 flex items-center gap-4 pointer-events-none">
                <span>Start: <strong>{formatDuration(dragState.currentStartSec)}</strong></span>
                <span>End: <strong>{formatDuration(dragState.currentStartSec + dragState.currentDurationSec)}</strong></span>
                <span>Duration: <strong>{formatDuration(dragState.currentDurationSec)}</strong></span>
              </div>
            )}
          </div>

          {/* Undo Delete Toast */}
          {deletedSessionUndo && (
            <div className="absolute bottom-5 left-5 bg-[#17112B] border border-[#7C3AED] rounded-[12px] p-3 shadow-2xl flex items-center gap-3 z-30">
              <span className="text-xs text-white">
                Session "{deletedSessionUndo.session.name}" removed.
              </span>
              <button
                onClick={handleUndoDeleteSession}
                className="px-3 py-1 bg-[#7C3AED] hover:bg-[#6D28D9] rounded-[12px] text-xs font-bold text-white cursor-pointer"
              >
                Undo
              </button>
              <button
                onClick={() => setDeletedSessionUndo(null)}
                className="p-1 hover:bg-white/10 rounded-[12px] text-white/40"
              >
                <PiX size={12} />
              </button>
            </div>
          )}
        </main>

        {/* ── PANEL 3: Cue Inspector (Right Panel, 340px) ──────────────────────── */}
        {isInspectorOpen && currentItem && (
          <aside className="w-80 min-w-[320px] max-w-[360px] border-l border-white/10 bg-[#0F0B1C] p-5 flex flex-col gap-4 overflow-y-auto shrink-0 z-20">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <span className="text-xs font-bold uppercase tracking-wider text-white">
                Cue Inspector
              </span>
              <button
                onClick={() => setIsInspectorOpen(false)}
                className="p-1 hover:bg-white/10 rounded-[12px] text-white/50 hover:text-white"
              >
                <PiX size={14} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Cue Title */}
              <div>
                <label className="text-[10px] uppercase font-bold text-white/40 block mb-1">
                  Cue Title
                </label>
                <input
                  type="text"
                  value={currentItem.name}
                  onChange={(e) => handleUpdateCue(currentItem.id, { name: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-[12px] px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-[#7C3AED]"
                />
              </div>

              {/* Timing Controls (Start and End as Authoritative Scheduling Controls) */}
              <div className="p-3 bg-white/5 rounded-[12px] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-[#A788FA] tracking-wider">
                    Timing & Boundaries
                  </span>
                  <span className="text-[10px] font-mono text-white/50">
                    Duration: {formatDuration(currentItem.durationSec || 60)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <DurationInput
                    label="Start Time"
                    value={currentItem.startSec}
                    onChange={(sec) => {
                      const currentEnd = currentItem.startSec + (currentItem.durationSec || 60);
                      const clampedStart = Math.max(0, Math.min(currentEnd - 1, sec));
                      const newDur = Math.max(1, currentEnd - clampedStart);
                      handleUpdateCue(currentItem.id, { startSec: clampedStart, durationSec: newDur });
                    }}
                  />
                  <DurationInput
                    label="End Time"
                    value={currentItem.startSec + (currentItem.durationSec || 60)}
                    onChange={(newEnd) => {
                      const clampedEnd = Math.max(currentItem.startSec + 1, Math.min(sessionDuration, newEnd));
                      const newDur = clampedEnd - currentItem.startSec;
                      handleUpdateCue(currentItem.id, { durationSec: newDur });
                    }}
                  />
                </div>
              </div>

              {/* Presentation Target Layer: Background vs Foreground Overlay */}
              {currentItem.track !== "audio" && (
                <div>
                  <label className="text-[10px] uppercase font-bold text-white/40 block mb-1">
                    Presentation Layer
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        handleUpdateCue(currentItem.id, {
                          presentationMode: "background",
                          color: "#7C3AED",
                        });
                      }}
                      className={`py-2 px-3 rounded-[12px] border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        (currentItem.presentationMode === "background" || (!currentItem.presentationMode && currentItem.track === "background") || (!currentItem.presentationMode && currentItem.mediaType !== "video" && currentItem.track !== "video"))
                          ? "bg-[#7C3AED] border-white text-white shadow-md shadow-purple-500/30"
                          : "bg-white/5 border-white/10 text-white/60 hover:text-white"
                      }`}
                    >
                      <PiImage size={14} />
                      <span>Background</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleUpdateCue(currentItem.id, {
                          presentationMode: "foreground",
                          color: "#2563EB",
                        });
                      }}
                      className={`py-2 px-3 rounded-[12px] border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        (currentItem.presentationMode === "foreground" || (!currentItem.presentationMode && currentItem.track === "video") || (!currentItem.presentationMode && currentItem.mediaType === "video"))
                          ? "bg-[#2563EB] border-white text-white shadow-md shadow-blue-500/30"
                          : "bg-white/5 border-white/10 text-white/60 hover:text-white"
                      }`}
                    >
                      <PiVideo size={14} />
                      <span>Foreground Overlay</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Video Footage Limit & Behavior */}
              {(currentItem.mediaType === "video" || currentItem.track === "video" || (currentItem.name && /\.(mp4|mov|webm|mkv|avi)$/i.test(currentItem.name))) && (() => {
                const asset = (currentAgenda?.assets || []).find((a) => a.id === currentItem.assetId);
                const available = asset?.durationSec || 0;
                const sourceIn = currentItem.sourceInSec || 0;
                const sourceOut = currentItem.sourceOutSec || available;
                const trimmed = Math.max(1, (sourceOut || available) - sourceIn);
                const exceeds = available > 0 && (currentItem.durationSec || 0) > trimmed;

                return (
                  <div className="space-y-2">
                    {exceeds && (
                      <div className="p-2.5 rounded-[12px] bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] flex items-start gap-2">
                        <PiWarning size={16} className="shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">Scheduled range exceeds footage</p>
                          <p className="text-[10px] text-amber-200/70 mt-0.5">
                            Window is {formatDuration(currentItem.durationSec)}, available footage is {formatDuration(trimmed)}.
                          </p>
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="text-[10px] uppercase font-bold text-white/40 block mb-1">
                        If Window Exceeds Footage
                      </label>
                      <select
                        value={currentItem.footageExceededBehavior || "loop"}
                        onChange={(e) => handleUpdateCue(currentItem.id, { footageExceededBehavior: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-[12px] px-3 py-2 text-xs text-white focus:outline-none"
                      >
                        <option value="loop" className="bg-[#120D22]">Loop footage</option>
                        <option value="hold" className="bg-[#120D22]">Hold last frame</option>
                      </select>
                    </div>
                  </div>
                );
              })()}

              {/* Background End Behavior */}
              {(currentItem.presentationMode === "background" || (!currentItem.presentationMode && currentItem.track === "background") || (!currentItem.presentationMode && currentItem.track !== "audio" && currentItem.mediaType !== "video" && currentItem.track !== "video")) && (
                <div>
                  <label className="text-[10px] uppercase font-bold text-white/40 block mb-1">
                    End Behavior
                  </label>
                  <select
                    value={currentItem.endBehavior || "hold"}
                    onChange={(e) => handleUpdateCue(currentItem.id, { endBehavior: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-[12px] px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    <option value="hold" className="bg-[#120D22]">Hold until next background</option>
                    <option value="restore" className="bg-[#120D22]">Restore previous background</option>
                  </select>
                </div>
              )}

              {/* Destination Routing */}
              <div>
                <label className="text-[10px] uppercase font-bold text-white/40 block mb-1">
                  Destination Routing
                </label>
                <select
                  value={currentItem.destination || "all"}
                  onChange={(e) => handleUpdateCue(currentItem.id, { destination: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-[12px] px-3 py-2 text-xs text-white focus:outline-none"
                >
                  <option value="all" className="bg-[#120D22]">All Screens</option>
                  <option value="general" className="bg-[#120D22]">General View (Main Output)</option>
                  <option value="speaker" className="bg-[#120D22]">Speaker View (Confidence Monitor)</option>
                </select>
              </div>

              {/* Source Trimming (Video & Audio) */}
              {(currentItem.track === "audio" || currentItem.mediaType === "video" || currentItem.track === "video" || (currentItem.name && /\.(mp4|mov|webm|mkv|avi)$/i.test(currentItem.name))) && (
                <div className="p-3 bg-white/5 rounded-[12px] border border-white/10 space-y-3">
                  <span className="text-[10px] uppercase font-bold text-[#A788FA] tracking-wider block">
                    Source Trimming (Non-Destructive)
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] uppercase font-bold text-white/40 block mb-1">
                        Source In (s)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={currentItem.sourceInSec || 0}
                        onChange={(e) =>
                          handleUpdateCue(currentItem.id, {
                            sourceInSec: Math.max(0, parseInt(e.target.value, 10) || 0),
                          })
                        }
                        className="w-full bg-black/40 border border-white/10 rounded-[12px] px-2 py-1 text-xs font-mono text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] uppercase font-bold text-white/40 block mb-1">
                        Source Out (s)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={currentItem.sourceOutSec || ""}
                        placeholder="End of clip"
                        onChange={(e) =>
                          handleUpdateCue(currentItem.id, {
                            sourceOutSec: e.target.value ? parseInt(e.target.value, 10) : null,
                          })
                        }
                        className="w-full bg-black/40 border border-white/10 rounded-[12px] px-2 py-1 text-xs font-mono text-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Delete Cue Button */}
              <button
                onClick={() => handleDeleteCue(currentItem.id)}
                className="w-full py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 rounded-[12px] text-red-300 text-xs font-bold transition-colors cursor-pointer mt-4"
              >
                Delete Cue
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* ── Media Chooser Dialog ─────────────────────────────────────────────── */}
      {mediaChooserTrack && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <div className="w-full max-w-xl bg-[#120D22] border border-white/15 rounded-[12px] p-6 shadow-2xl flex flex-col gap-4 max-h-[80vh]">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                {mediaChooserHint === "video" || mediaChooserTrack === "video" ? (
                  <PiVideo size={20} className="text-blue-400" />
                ) : mediaChooserTrack === "audio" ? (
                  <PiSpeakerHigh size={20} className="text-amber-400" />
                ) : (
                  <PiImage size={20} className="text-purple-400" />
                )}
                <h3 className="text-sm font-bold uppercase text-white">
                  Add {mediaChooserHint ? (mediaChooserHint === "video" ? "Video" : "Image") : (mediaChooserTrack === "audio" ? "Audio" : "Visual")} Cue
                </h3>
              </div>
              <button
                onClick={() => {
                  setMediaChooserTrack(null);
                  setMediaChooserHint(null);
                }}
                className="p-1 hover:bg-white/10 rounded-[12px] text-white/50 hover:text-white"
              >
                <PiX size={16} />
              </button>
            </div>

            {/* Upload Option */}
            <div className="p-4 bg-white/5 border border-dashed border-white/20 rounded-[12px] text-center flex flex-col items-center gap-2">
              <PiUploadSimple size={24} className="text-[#A788FA]" />
              <p className="text-xs text-white/70">
                Select a file from your computer to import into the agenda library
              </p>
              <button
                onClick={() => handleImportFromComputer(mediaChooserTrack, mediaChooserHint)}
                className="px-4 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] rounded-[12px] text-xs font-bold text-white shadow-md cursor-pointer"
              >
                Browse Computer...
              </button>
            </div>

            {/* Existing Media Library Grid */}
            <div className="flex-1 overflow-y-auto space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-white/50 block">
                Or Select From Library
              </span>
              {isLoadingLibrary ? (
                <div className="p-6 text-center text-xs text-white/40">Loading media library...</div>
              ) : libraryMediaFiles.length === 0 ? (
                <div className="p-6 text-center text-xs text-white/40">No media in library yet.</div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {libraryMediaFiles.map((fileUrl, i) => {
                    const filename = decodeURIComponent(fileUrl.split("/").pop() || `Media ${i + 1}`);
                    return (
                      <div
                        key={i}
                        onClick={() => handleSelectExistingMedia(fileUrl, mediaChooserTrack, mediaChooserHint)}
                        className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#7C3AED] rounded-[12px] cursor-pointer flex items-center gap-2.5 transition-colors"
                      >
                        <PiFolderOpen size={16} className="text-[#A788FA] shrink-0" />
                        <span className="text-xs text-white truncate font-medium">{filename}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Replace Running Service Confirm Modal ────────────────────────────── */}
      {replaceConfirmOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <div className="w-full max-w-md bg-[#120D22] border border-amber-500/40 rounded-[12px] p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-500/20 border border-amber-500/40 rounded-[12px] text-amber-400">
                <PiWarning size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Replace Running Agenda?</h3>
                <p className="text-xs text-white/50">
                  A service is currently executing. Replacing it will stop the active timer.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-2">
              <button
                onClick={() => setReplaceConfirmOpen(false)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-[12px] text-xs font-bold text-white"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setReplaceConfirmOpen(false);
                  await electron?.Agenda?.controlExecution?.({ command: "stop" });
                  handleLoadAgenda(currentAgenda);
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-[12px] text-xs font-bold text-white"
              >
                Stop & Load New
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cue Context Menu ────────────────────────────────────────────────── */}
      {cueContextMenu && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setCueContextMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setCueContextMenu(null);
          }}
        >
          <div
            style={{ top: cueContextMenu.y, left: cueContextMenu.x }}
            onClick={(e) => e.stopPropagation()}
            className="absolute w-44 bg-[#120D22] border border-white/10 rounded-[12px] p-1.5 shadow-2xl backdrop-blur-md flex flex-col gap-0.5 text-xs z-50 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/40 truncate border-b border-white/5 mb-1">
              {cueContextMenu.cue?.name || "Cue Actions"}
            </div>
            <button
              onClick={() => {
                setSelectedItemId(cueContextMenu.cue.id);
                setIsInspectorOpen(true);
                setCueContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[12px] text-white/80 hover:text-white hover:bg-white/10 transition-colors text-left cursor-pointer"
            >
              <PiPencilSimple size={14} className="text-[#A788FA]" />
              <span>Edit Cue</span>
            </button>
            <button
              onClick={() => {
                setRenamingCue({
                  cueId: cueContextMenu.cue.id,
                  name: cueContextMenu.cue.name || "",
                });
                setCueContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[12px] text-white/80 hover:text-white hover:bg-white/10 transition-colors text-left cursor-pointer"
            >
              <PiCursorText size={14} className="text-blue-400" />
              <span>Rename Cue</span>
            </button>
            <div className="my-0.5 border-t border-white/5" />
            <button
              onClick={() => {
                handleDeleteCueWithUndo(cueContextMenu.cue);
                setCueContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[12px] text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors text-left cursor-pointer"
            >
              <PiTrash size={14} />
              <span>Delete Cue</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Cue Inline Rename Dialog ─────────────────────────────────────────── */}
      {renamingCue && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <div className="w-full max-w-sm bg-[#120D22] border border-white/10 rounded-[12px] p-5 shadow-2xl flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-bold text-white">Rename Timeline Cue</h3>
              <p className="text-xs text-white/50">
                Update the display name of this cue without modifying the original asset.
              </p>
            </div>
            <input
              type="text"
              autoFocus
              value={renamingCue.name}
              onChange={(e) => setRenamingCue({ ...renamingCue, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && renamingCue.name.trim()) {
                  handleUpdateCue(renamingCue.cueId, { name: renamingCue.name.trim() });
                  setRenamingCue(null);
                } else if (e.key === "Escape") {
                  setRenamingCue(null);
                }
              }}
              className="w-full bg-white/5 border border-white/10 rounded-[12px] px-3 py-2 text-xs text-white font-semibold focus:outline-none focus:border-[#7C3AED]"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setRenamingCue(null)}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-[12px] text-xs font-bold text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (renamingCue.name.trim()) {
                    handleUpdateCue(renamingCue.cueId, { name: renamingCue.name.trim() });
                  }
                  setRenamingCue(null);
                }}
                className="px-4 py-1.5 bg-[#7C3AED] hover:bg-[#6D28D9] rounded-[12px] text-xs font-bold text-white shadow-lg shadow-[#7C3AED]/20 cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Deleted Cue Undo Toast ───────────────────────────────────────────── */}
      {deletedCueUndo && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-[#1A1333] border border-white/15 rounded-[12px] px-4 py-3 shadow-2xl text-xs text-white animate-in slide-in-from-bottom-5">
          <span>Cue <strong>&ldquo;{deletedCueUndo.cue?.name}&rdquo;</strong> deleted.</span>
          <button
            onClick={handleUndoDeleteCue}
            className="px-3 py-1 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold rounded-[12px] shadow-sm transition-colors cursor-pointer"
          >
            Undo
          </button>
          <button
            onClick={() => {
              if (deletedCueUndo.timeoutId) clearTimeout(deletedCueUndo.timeoutId);
              setDeletedCueUndo(null);
            }}
            className="p-1 text-white/50 hover:text-white rounded-[12px] cursor-pointer"
          >
            <PiX size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
