import React, { useState, useEffect, useRef, useCallback } from "react";
import ActionButton from "../components/feedback/ActionButton";

const MAX_UNDO_STACK = 30;

function createEmptyDesign(name = "New Overlay Design") {
  return {
    id: `design_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    name,
    target: "both", // 'both' | 'stream' | 'sanctuary'
    layers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export default function DesignStudioController() {
  const electron = typeof window !== "undefined" ? window.electron : null;
  const designApi = electron?.DesignStudio;

  // Designs list & active design
  const [designs, setDesigns] = useState([]);
  const [currentDesign, setCurrentDesign] = useState(() => createEmptyDesign());
  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null); // { type: 'error' | 'success' | 'info', text: string }

  // Live output state
  const [liveState, setLiveState] = useState({ isLive: false, designId: null, target: "both" });

  // Preview modal
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Undo / Redo stacks
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // Canvas interaction refs
  const canvasRef = useRef(null);
  const dragInteractionRef = useRef(null); // { mode: 'move' | 'resize', handle, startX, startY, origLayer }

  // Clear status after timeout
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  // Load designs and initial live state on mount
  useEffect(() => {
    loadDesignsList();

    if (designApi?.getLiveState) {
      designApi.getLiveState().then((state) => {
        if (state) setLiveState(state);
      });
    }

    if (designApi?.onLiveStateChange) {
      const unsub = designApi.onLiveStateChange((state) => {
        if (state) setLiveState(state);
      });
      return () => {
        if (typeof unsub === "function") unsub();
      };
    }
  }, []);

  const loadDesignsList = async () => {
    if (!designApi?.listDesigns) return;
    try {
      setIsLoading(true);
      const res = await designApi.listDesigns();
      if (res?.ok && Array.isArray(res.designs)) {
        setDesigns(res.designs);
        if (res.designs.length > 0 && (!currentDesign?.id || currentDesign.layers.length === 0)) {
          setCurrentDesign(res.designs[0]);
          setSelectedLayerId(res.designs[0].layers[0]?.id || null);
          setHasUnsavedChanges(false);
          setUndoStack([]);
          setRedoStack([]);
        }
      }
    } catch (err) {
      setStatusMessage({ type: "error", text: `Failed to load designs: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  // Push history snapshot before mutating layers
  const pushUndoSnapshot = useCallback(() => {
    setUndoStack((prev) => {
      const snapshot = JSON.parse(JSON.stringify(currentDesign));
      const next = [...prev, snapshot];
      if (next.length > MAX_UNDO_STACK) next.shift();
      return next;
    });
    setRedoStack([]);
    setHasUnsavedChanges(true);
  }, [currentDesign]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    const newUndo = undoStack.slice(0, -1);
    const currentSnapshot = JSON.parse(JSON.stringify(currentDesign));

    setRedoStack((prev) => [...prev, currentSnapshot]);
    setUndoStack(newUndo);
    setCurrentDesign(previous);
    setHasUnsavedChanges(true);
  }, [undoStack, currentDesign]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    const newRedo = redoStack.slice(0, -1);
    const currentSnapshot = JSON.parse(JSON.stringify(currentDesign));

    setUndoStack((prev) => [...prev, currentSnapshot]);
    setRedoStack(newRedo);
    setCurrentDesign(next);
    setHasUnsavedChanges(true);
  }, [redoStack, currentDesign]);

  // Keyboard shortcut listener for undo/redo
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger when user is typing in an input
      if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, handleRedo]);

  // ─── Design CRUD ────────────────────────────────────────────────────────────

  const handleCreateNewDesign = () => {
    if (hasUnsavedChanges) {
      if (!window.confirm("You have unsaved changes. Discard and create new design?")) {
        return;
      }
    }
    const newDesign = createEmptyDesign(`Overlay ${designs.length + 1}`);
    setCurrentDesign(newDesign);
    setSelectedLayerId(null);
    setUndoStack([]);
    setRedoStack([]);
    setHasUnsavedChanges(true);
  };

  const handleSelectDesign = (id) => {
    if (id === currentDesign.id) return;
    if (hasUnsavedChanges) {
      if (!window.confirm("You have unsaved changes. Discard and switch design?")) {
        return;
      }
    }
    const found = designs.find((d) => d.id === id);
    if (found) {
      setCurrentDesign(JSON.parse(JSON.stringify(found)));
      setSelectedLayerId(found.layers[0]?.id || null);
      setUndoStack([]);
      setRedoStack([]);
      setHasUnsavedChanges(false);
    }
  };

  const handleSaveDesign = async () => {
    if (!designApi?.saveDesign) return;
    try {
      setIsLoading(true);
      const res = await designApi.saveDesign(currentDesign);
      if (res?.ok && res.design) {
        setHasUnsavedChanges(false);
        setStatusMessage({ type: "success", text: "Design saved successfully." });
        setDesigns((prev) => {
          const idx = prev.findIndex((d) => d.id === res.design.id);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = res.design;
            return copy;
          }
          return [...prev, res.design];
        });
      } else {
        setStatusMessage({ type: "error", text: res?.error || "Failed to save design." });
      }
    } catch (err) {
      setStatusMessage({ type: "error", text: `Save error: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteDesign = async () => {
    if (!currentDesign?.id) return;
    if (!window.confirm(`Are you sure you want to delete "${currentDesign.name}"?`)) return;

    try {
      setIsLoading(true);
      const res = await designApi.deleteDesign(currentDesign.id);
      if (res?.ok) {
        setStatusMessage({ type: "info", text: "Design deleted." });
        const remaining = designs.filter((d) => d.id !== currentDesign.id);
        setDesigns(remaining);
        if (remaining.length > 0) {
          setCurrentDesign(remaining[0]);
          setSelectedLayerId(remaining[0].layers[0]?.id || null);
        } else {
          setCurrentDesign(createEmptyDesign());
          setSelectedLayerId(null);
        }
        setHasUnsavedChanges(false);
        setUndoStack([]);
        setRedoStack([]);
      } else {
        setStatusMessage({ type: "error", text: res?.error || "Failed to delete design." });
      }
    } catch (err) {
      setStatusMessage({ type: "error", text: `Delete error: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Image Import & Layer Management ────────────────────────────────────────

  const handleImportImage = async (replaceLayerId = null) => {
    if (!designApi?.importImage) return;
    try {
      setIsLoading(true);
      const res = await designApi.importImage();
      if (res?.canceled) return;

      if (!res?.ok || !res?.asset) {
        setStatusMessage({
          type: "error",
          text: res?.error || "Unsupported or unreadable image file. Please use PNG, JPEG, or WebP.",
        });
        return;
      }

      pushUndoSnapshot();
      const asset = res.asset;

      if (replaceLayerId) {
        // Replace existing layer asset, keeping position/size
        setCurrentDesign((prev) => ({
          ...prev,
          layers: prev.layers.map((l) =>
            l.id === replaceLayerId
              ? {
                  ...l,
                  assetId: asset.assetId,
                  filePath: asset.filePath,
                  url: asset.url,
                  name: asset.originalName,
                  aspectRatio: asset.aspectRatio,
                  isMissing: false,
                }
              : l
          ),
        }));
        setStatusMessage({ type: "success", text: `Replaced image with ${asset.originalName}.` });
      } else {
        // Add new layer
        const defaultWidth = 35;
        const newLayer = {
          id: `layer_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          name: asset.originalName || "Overlay Image",
          assetId: asset.assetId,
          filePath: asset.filePath,
          url: asset.url,
          type: "image",
          x: 50,
          y: 80, // Default to lower third position
          width: defaultWidth,
          opacity: 1,
          visible: true,
          zIndex: (currentDesign.layers.length + 1) * 10,
          aspectRatio: asset.aspectRatio || 1.777,
          aspectLocked: true,
          isMissing: false,
        };

        setCurrentDesign((prev) => ({
          ...prev,
          layers: [...prev.layers, newLayer],
        }));
        setSelectedLayerId(newLayer.id);
        setStatusMessage({ type: "success", text: `Imported ${asset.originalName}.` });
      }
    } catch (err) {
      setStatusMessage({ type: "error", text: `Import error: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const selectedLayer = currentDesign.layers.find((l) => l.id === selectedLayerId) || null;

  const updateSelectedLayer = (updates) => {
    if (!selectedLayerId) return;
    pushUndoSnapshot();
    setCurrentDesign((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => (l.id === selectedLayerId ? { ...l, ...updates } : l)),
    }));
  };

  const handleDeleteLayer = (layerId) => {
    pushUndoSnapshot();
    setCurrentDesign((prev) => ({
      ...prev,
      layers: prev.layers.filter((l) => l.id !== layerId),
    }));
    if (selectedLayerId === layerId) {
      setSelectedLayerId(null);
    }
  };

  // ─── Layer Ordering (Z-Index) ───────────────────────────────────────────────

  const handleBringForward = (layerId) => {
    const idx = currentDesign.layers.findIndex((l) => l.id === layerId);
    if (idx === -1 || idx === currentDesign.layers.length - 1) return;
    pushUndoSnapshot();
    const newLayers = [...currentDesign.layers];
    const temp = newLayers[idx];
    newLayers[idx] = newLayers[idx + 1];
    newLayers[idx + 1] = temp;
    reindexZ(newLayers);
  };

  const handleSendBackward = (layerId) => {
    const idx = currentDesign.layers.findIndex((l) => l.id === layerId);
    if (idx <= 0) return;
    pushUndoSnapshot();
    const newLayers = [...currentDesign.layers];
    const temp = newLayers[idx];
    newLayers[idx] = newLayers[idx - 1];
    newLayers[idx - 1] = temp;
    reindexZ(newLayers);
  };

  const reindexZ = (layers) => {
    const reindexed = layers.map((l, i) => ({ ...l, zIndex: (i + 1) * 10 }));
    setCurrentDesign((prev) => ({ ...prev, layers: reindexed }));
  };

  // ─── Preset Alignments ──────────────────────────────────────────────────────

  const applyPreset = (preset) => {
    if (!selectedLayer) return;
    switch (preset) {
      case "lower-third":
        updateSelectedLayer({ x: 50, y: 82, width: 45 });
        break;
      case "top-banner":
        updateSelectedLayer({ x: 50, y: 15, width: 60 });
        break;
      case "center":
        updateSelectedLayer({ x: 50, y: 50, width: 40 });
        break;
      case "bottom-left":
        updateSelectedLayer({ x: 25, y: 82, width: 35 });
        break;
      case "bottom-right":
        updateSelectedLayer({ x: 75, y: 82, width: 35 });
        break;
      default:
        break;
    }
  };

  // ─── Canvas Mouse / Drag Handlers ───────────────────────────────────────────

  const handleMouseDownOnLayer = (e, layer) => {
    e.stopPropagation();
    setSelectedLayerId(layer.id);

    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();

    dragInteractionRef.current = {
      mode: "move",
      layerId: layer.id,
      startX: e.clientX,
      startY: e.clientY,
      canvasWidth: rect.width,
      canvasHeight: rect.height,
      origX: layer.x,
      origY: layer.y,
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseDownOnResize = (e, layer, handle) => {
    e.stopPropagation();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();

    dragInteractionRef.current = {
      mode: "resize",
      layerId: layer.id,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      canvasWidth: rect.width,
      canvasHeight: rect.height,
      origWidth: layer.width,
      origX: layer.x,
      origY: layer.y,
      aspectRatio: layer.aspectRatio || 1.777,
      aspectLocked: layer.aspectLocked !== false,
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseMove = useCallback((e) => {
    const interaction = dragInteractionRef.current;
    if (!interaction) return;

    if (interaction.mode === "move") {
      const deltaXPct = ((e.clientX - interaction.startX) / interaction.canvasWidth) * 100;
      const deltaYPct = ((e.clientY - interaction.startY) / interaction.canvasHeight) * 100;

      const newX = Math.max(0, Math.min(100, Math.round(interaction.origX + deltaXPct)));
      const newY = Math.max(0, Math.min(100, Math.round(interaction.origY + deltaYPct)));

      setCurrentDesign((prev) => ({
        ...prev,
        layers: prev.layers.map((l) =>
          l.id === interaction.layerId ? { ...l, x: newX, y: newY } : l
        ),
      }));
    } else if (interaction.mode === "resize") {
      const deltaXPct = ((e.clientX - interaction.startX) / interaction.canvasWidth) * 100;
      // Depending on handle, adjust width
      const multiplier = interaction.handle.includes("right") ? 1 : -1;
      let newWidth = Math.max(5, Math.min(100, Math.round(interaction.origWidth + deltaXPct * multiplier * 2)));

      setCurrentDesign((prev) => ({
        ...prev,
        layers: prev.layers.map((l) =>
          l.id === interaction.layerId ? { ...l, width: newWidth } : l
        ),
      }));
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    if (dragInteractionRef.current) {
      pushUndoSnapshot();
      dragInteractionRef.current = null;
    }
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
  }, [pushUndoSnapshot, handleMouseMove]);

  // ─── Present & Hide (Output Control) ────────────────────────────────────────

  const handlePresent = async () => {
    if (!designApi?.present) return;
    try {
      setIsLoading(true);
      const res = await designApi.present(currentDesign, currentDesign.target || "both");
      if (res?.ok) {
        setStatusMessage({
          type: "success",
          text: `Presented overlay to ${
            currentDesign.target === "both"
              ? "Stream + Sanctuary"
              : currentDesign.target === "stream"
              ? "Live Stream"
              : "Sanctuary Screens"
          }.`,
        });
      } else {
        setStatusMessage({ type: "error", text: res?.error || "Failed to present overlay." });
      }
    } catch (err) {
      setStatusMessage({ type: "error", text: `Present error: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const handleHide = async () => {
    if (!designApi?.hide) return;
    try {
      setIsLoading(true);
      const res = await designApi.hide();
      if (res?.ok) {
        setStatusMessage({ type: "info", text: "Overlay hidden from outputs." });
      } else {
        setStatusMessage({ type: "error", text: res?.error || "Failed to hide overlay." });
      }
    } catch (err) {
      setStatusMessage({ type: "error", text: `Hide error: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const isCurrentDesignLive = liveState.isLive && liveState.designId === currentDesign.id;

  return (
    <div className="flex flex-col h-full w-full bg-[#0d0c13] text-white select-none overflow-hidden">
      {/* ── Top Bar / Workflow Bar ─────────────────────────────────────────── */}
      <div className="h-16 border-b border-white/10 px-6 flex items-center justify-between bg-[#12111a]/80 backdrop-blur-md shrink-0">
        {/* Left: Design Selector & CRUD */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider">
              Active Design
            </span>
            <div className="flex items-center gap-2">
              <select
                value={currentDesign.id}
                onChange={(e) => handleSelectDesign(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-[12px] px-3 py-1 text-sm font-medium text-white focus:outline-none focus:border-[#00A8FF]/60"
              >
                {designs.map((d) => (
                  <option key={d.id} value={d.id} className="bg-[#1a1924] text-white">
                    {d.name}
                  </option>
                ))}
                {designs.length === 0 && (
                  <option value={currentDesign.id} className="bg-[#1a1924] text-white">
                    {currentDesign.name}
                  </option>
                )}
              </select>
              <input
                type="text"
                value={currentDesign.name}
                onChange={(e) => {
                  pushUndoSnapshot();
                  setCurrentDesign((prev) => ({ ...prev, name: e.target.value }));
                }}
                placeholder="Design Name"
                className="bg-white/5 border border-white/10 rounded-[12px] px-3 py-1 text-sm text-white focus:outline-none focus:border-[#00A8FF]/60 w-48"
              />
            </div>
          </div>

          <ActionButton
            onClick={handleCreateNewDesign}
            className="bg-white/5 border border-white/10 hover:bg-white/10 text-white text-xs font-semibold px-3 py-2 rounded-[12px] transition-all"
          >
            New Design
          </ActionButton>

          <ActionButton
            onClick={handleSaveDesign}
            className={`border text-xs font-semibold px-4 py-2 rounded-[12px] transition-all ${
              hasUnsavedChanges
                ? "bg-[#00A8FF] hover:bg-[#00A8FF] border-[#00A8FF]/50 text-white shadow-lg shadow-[#00A8FF]/20"
                : "bg-white/5 border-white/10 hover:bg-white/10 text-white/70"
            }`}
          >
            {hasUnsavedChanges ? "Save Changes *" : "Saved"}
          </ActionButton>

          {designs.some((d) => d.id === currentDesign.id) && (
            <ActionButton
              onClick={handleDeleteDesign}
              className="bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 text-xs font-semibold px-3 py-2 rounded-[12px] transition-all"
            >
              Delete
            </ActionButton>
          )}
        </div>

        {/* Center: Undo / Redo & Status Alerts */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white/5 border border-white/10 rounded-[12px] p-0.5">
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className="px-3 py-1 text-xs font-semibold text-white/80 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed rounded-[12px] hover:bg-white/5 transition-all"
              title="Undo (Ctrl+Z)"
            >
              Undo
            </button>
            <div className="w-px h-4 bg-white/10" />
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="px-3 py-1 text-xs font-semibold text-white/80 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed rounded-[12px] hover:bg-white/5 transition-all"
              title="Redo (Ctrl+Y)"
            >
              Redo
            </button>
          </div>

          {statusMessage && (
            <div
              className={`px-3 py-1 rounded-[12px] text-xs font-semibold border transition-all ${
                statusMessage.type === "error"
                  ? "bg-red-500/20 border-red-500/40 text-red-300"
                  : statusMessage.type === "success"
                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                  : "bg-[#00A8FF]/20 border-[#00A8FF]/40 text-[#00A8FF]"
              }`}
            >
              {statusMessage.text}
            </div>
          )}
        </div>

        {/* Right: Output Target & Present/Hide Controls */}
        <div className="flex items-center gap-3">
          {/* Plain Text Live State Indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-[12px] border border-white/10 bg-white/5">
            <span
              className={`w-2 h-2 rounded-full ${
                liveState.isLive ? "bg-emerald-400 animate-pulse" : "bg-white/20"
              }`}
            />
            <span className="text-xs font-semibold">
              {liveState.isLive
                ? `LIVE: ${
                    liveState.target === "both"
                      ? "Stream + Sanctuary"
                      : liveState.target === "stream"
                      ? "Stream Only"
                      : "Sanctuary Only"
                  }`
                : "Live: Offline"}
            </span>
          </div>

          {/* Output Destination Selector */}
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider">
              Destination
            </span>
            <select
              value={currentDesign.target || "both"}
              onChange={(e) => {
                pushUndoSnapshot();
                setCurrentDesign((prev) => ({ ...prev, target: e.target.value }));
              }}
              className="bg-white/5 border border-white/10 rounded-[12px] px-2.5 py-1 text-xs font-medium text-white focus:outline-none focus:border-[#00A8FF]/60"
            >
              <option value="both" className="bg-[#1a1924]">
                All Outputs (Stream + Sanctuary)
              </option>
              <option value="stream" className="bg-[#1a1924]">
                Live Stream Only
              </option>
              <option value="sanctuary" className="bg-[#1a1924]">
                Sanctuary Screens Only
              </option>
            </select>
          </div>

          {/* Workflow Buttons: Preview -> Present -> Hide */}
          <ActionButton
            onClick={() => setIsPreviewOpen(true)}
            className="bg-white/5 border border-white/10 hover:bg-white/10 text-white text-xs font-semibold px-3 py-2 rounded-[12px] transition-all"
          >
            Preview
          </ActionButton>

          <ActionButton
            onClick={handlePresent}
            disabled={currentDesign.layers.length === 0}
            className="bg-emerald-600 hover:bg-emerald-500 border border-emerald-400 text-white text-xs font-bold px-4 py-2 rounded-[12px] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/20"
          >
            {isCurrentDesignLive ? "Update Live Output" : "Present to Output"}
          </ActionButton>

          <ActionButton
            onClick={handleHide}
            disabled={!liveState.isLive}
            className="bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 text-xs font-bold px-4 py-2 rounded-[12px] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Hide Overlay
          </ActionButton>
        </div>
      </div>

      {/* ── Main Work Area (Canvas + Properties Panel) ──────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Canvas Area ─────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#0a0910] relative overflow-hidden">
          {/* Aspect Ratio 16:9 Canvas Frame */}
          <div
            ref={canvasRef}
            onClick={() => setSelectedLayerId(null)}
            className="relative w-full max-w-5xl aspect-video bg-[#12111a] border-2 border-white/10 rounded-[12px] shadow-2xl overflow-hidden cursor-default"
            style={{
              backgroundImage:
                "linear-gradient(45deg, #181724 25%, transparent 25%), linear-gradient(-45deg, #181724 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #181724 75%), linear-gradient(-45deg, transparent 75%, #181724 75%)",
              backgroundSize: "24px 24px",
              backgroundPosition: "0 0, 0 12px, 12px -12px, -12px 0px",
            }}
          >
            {/* Empty State when no layers */}
            {currentDesign.layers.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 bg-black/40 backdrop-blur-sm">
                <div className="text-base font-bold text-white mb-2">No Graphic Layers</div>
                <p className="text-xs text-white/50 max-w-sm mb-6 leading-relaxed">
                  Import a transparent PNG, JPEG, or WebP graphic to begin composing your church
                  lower third or overlay.
                </p>
                <ActionButton
                  onClick={() => handleImportImage()}
                  className="bg-[#00A8FF] hover:bg-[#00A8FF] border border-[#00A8FF]/50 text-white text-xs font-bold px-5 py-2.5 rounded-[12px] transition-all shadow-lg shadow-[#00A8FF]/20"
                >
                  Import Overlay Image
                </ActionButton>
              </div>
            )}

            {/* Rendered Layers */}
            {currentDesign.layers.map((layer) => {
              if (!layer.visible) return null;
              const isSelected = selectedLayerId === layer.id;

              return (
                <div
                  key={layer.id}
                  onMouseDown={(e) => handleMouseDownOnLayer(e, layer)}
                  className={`absolute transition-none cursor-move ${
                    isSelected ? "ring-2 ring-[#00A8FF]/30 ring-offset-2 ring-offset-transparent" : ""
                  }`}
                  style={{
                    left: `${layer.x}%`,
                    top: `${layer.y}%`,
                    transform: "translate(-50%, -50%)",
                    width: `${layer.width}%`,
                    opacity: layer.opacity,
                    zIndex: layer.zIndex,
                    borderRadius: "12px",
                  }}
                >
                  {layer.isMissing ? (
                    <div className="w-full aspect-video bg-red-950/80 border border-red-500/50 rounded-[12px] flex flex-col items-center justify-center p-3 text-center text-red-300">
                      <span className="text-xs font-bold">Image Missing</span>
                      <span className="text-[10px] text-red-400 mt-1">Asset file not found</span>
                    </div>
                  ) : (
                    <img
                      src={layer.url || layer.filePath}
                      alt={layer.name}
                      className="w-full h-auto object-contain select-none pointer-events-none rounded-[12px]"
                      draggable={false}
                    />
                  )}

                  {/* Selection Border and Resize Handles */}
                  {isSelected && (
                    <>
                      <div className="absolute -inset-1 border border-[#00A8FF]/80 rounded-[12px] pointer-events-none" />

                      {/* Resize Corner Handles */}
                      <div
                        onMouseDown={(e) => handleMouseDownOnResize(e, layer, "bottom-right")}
                        className="absolute -bottom-2 -right-2 w-4 h-4 bg-[#00A8FF] border border-white rounded-full cursor-se-resize shadow-md"
                        title="Drag to resize (aspect ratio locked)"
                      />
                      <div
                        onMouseDown={(e) => handleMouseDownOnResize(e, layer, "bottom-left")}
                        className="absolute -bottom-2 -left-2 w-4 h-4 bg-[#00A8FF] border border-white rounded-full cursor-sw-resize shadow-md"
                        title="Drag to resize (aspect ratio locked)"
                      />
                      <div
                        onMouseDown={(e) => handleMouseDownOnResize(e, layer, "top-right")}
                        className="absolute -top-2 -right-2 w-4 h-4 bg-[#00A8FF] border border-white rounded-full cursor-ne-resize shadow-md"
                        title="Drag to resize (aspect ratio locked)"
                      />
                      <div
                        onMouseDown={(e) => handleMouseDownOnResize(e, layer, "top-left")}
                        className="absolute -top-2 -left-2 w-4 h-4 bg-[#00A8FF] border border-white rounded-full cursor-nw-resize shadow-md"
                        title="Drag to resize (aspect ratio locked)"
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Quick Guidance Helper */}
          <div className="mt-4 text-[11px] text-white/40 flex items-center gap-4">
            <span>Canvas: 16:9 Broadcast Program Preview</span>
            <span>•</span>
            <span>Click layer to select</span>
            <span>•</span>
            <span>Drag body to move</span>
            <span>•</span>
            <span>Drag corner handles to resize</span>
          </div>
        </div>

        {/* ── Right Panel: Layers & Properties ─────────────────────────────── */}
        <div className="w-80 border-l border-white/10 bg-[#12111a]/95 flex flex-col h-full shrink-0 overflow-y-auto">
          {/* Layer List Header */}
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-white/70">
              Layers ({currentDesign.layers.length})
            </span>
            <ActionButton
              onClick={() => handleImportImage()}
              className="bg-[#00A8FF] hover:bg-[#00A8FF] border border-[#00A8FF]/50 text-white text-xs font-semibold px-3 py-1.5 rounded-[12px] transition-all"
            >
              + Import Image
            </ActionButton>
          </div>

          {/* Layer Stack */}
          <div className="p-3 space-y-2 border-b border-white/10 max-h-48 overflow-y-auto">
            {currentDesign.layers.length === 0 ? (
              <div className="text-center py-4 text-xs text-white/30">No layers added</div>
            ) : (
              [...currentDesign.layers].reverse().map((layer) => {
                const isSelected = selectedLayerId === layer.id;
                return (
                  <div
                    key={layer.id}
                    onClick={() => setSelectedLayerId(layer.id)}
                    className={`p-2.5 rounded-[12px] border transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? "bg-[#00A8FF]/10 border-[#00A8FF]/50 text-white"
                        : "bg-white/5 border-white/5 hover:bg-white/10 text-white/70"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      {layer.isMissing ? (
                        <div className="w-8 h-8 rounded-[12px] bg-red-950 border border-red-500/40 flex items-center justify-center text-[10px] text-red-400 shrink-0">
                          !
                        </div>
                      ) : (
                        <img
                          src={layer.url || layer.filePath}
                          alt=""
                          className="w-8 h-8 object-cover rounded-[12px] bg-black/40 border border-white/10 shrink-0"
                        />
                      )}
                      <div className="flex flex-col truncate">
                        <span className="text-xs font-medium truncate">{layer.name}</span>
                        <span className="text-[10px] text-white/40">
                          {Math.round(layer.width)}% w • {Math.round(layer.opacity * 100)}% op
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateSelectedLayer({ visible: !layer.visible });
                        }}
                        className={`text-[10px] px-2 py-1 rounded-[12px] border ${
                          layer.visible
                            ? "bg-white/5 border-white/10 text-white/70 hover:text-white"
                            : "bg-white/5 border-white/10 text-white/30 hover:text-white/60"
                        }`}
                        title={layer.visible ? "Hide Layer" : "Show Layer"}
                      >
                        {layer.visible ? "Show" : "Hide"}
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteLayer(layer.id);
                        }}
                        className="text-[10px] px-2 py-1 rounded-[12px] border border-red-500/20 text-red-400 hover:bg-red-500/20"
                        title="Delete Layer"
                      >
                        Del
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Properties Panel for Selected Layer */}
          {selectedLayer ? (
            <div className="p-4 space-y-4 flex-1 overflow-y-auto">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-white/70">
                  Layer Properties
                </span>
                <span className="text-[10px] text-[#00A8FF] font-medium">Selected</span>
              </div>

              {/* Layer Name */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-white/60">Layer Label</label>
                <input
                  type="text"
                  value={selectedLayer.name}
                  onChange={(e) => updateSelectedLayer({ name: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-[12px] px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#00A8FF]/60"
                />
              </div>

              {/* Preset Alignments */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-white/60">Presets</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => applyPreset("lower-third")}
                    className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-[12px] text-[11px] font-medium text-white/80"
                  >
                    Lower Third
                  </button>
                  <button
                    onClick={() => applyPreset("top-banner")}
                    className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-[12px] text-[11px] font-medium text-white/80"
                  >
                    Top Banner
                  </button>
                  <button
                    onClick={() => applyPreset("bottom-left")}
                    className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-[12px] text-[11px] font-medium text-white/80"
                  >
                    Bottom Left
                  </button>
                  <button
                    onClick={() => applyPreset("bottom-right")}
                    className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-[12px] text-[11px] font-medium text-white/80"
                  >
                    Bottom Right
                  </button>
                </div>
              </div>

              {/* Position & Size */}
              <div className="space-y-3 pt-2 border-t border-white/10">
                <span className="text-[11px] font-semibold text-white/60 block">
                  Transform & Scale
                </span>

                {/* X Position */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-white/40">Horizontal Position (X)</span>
                    <span className="text-white/80 font-mono">{Math.round(selectedLayer.x)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={selectedLayer.x}
                    onChange={(e) => updateSelectedLayer({ x: Number(e.target.value) })}
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                </div>

                {/* Y Position */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-white/40">Vertical Position (Y)</span>
                    <span className="text-white/80 font-mono">{Math.round(selectedLayer.y)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={selectedLayer.y}
                    onChange={(e) => updateSelectedLayer({ y: Number(e.target.value) })}
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                </div>

                {/* Width */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-white/40">Width Scale</span>
                    <span className="text-white/80 font-mono">{Math.round(selectedLayer.width)}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    value={selectedLayer.width}
                    onChange={(e) => updateSelectedLayer({ width: Number(e.target.value) })}
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                </div>

                {/* Aspect Ratio Lock Toggle */}
                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={selectedLayer.aspectLocked !== false}
                    onChange={(e) => updateSelectedLayer({ aspectLocked: e.target.checked })}
                    className="rounded-[12px] accent-blue-500"
                  />
                  <span className="text-xs text-white/70">Lock Aspect Ratio (Recommended)</span>
                </label>
              </div>

              {/* Opacity */}
              <div className="space-y-1 pt-2 border-t border-white/10">
                <div className="flex justify-between text-[11px]">
                  <span className="text-white/40">Opacity</span>
                  <span className="text-white/80 font-mono">
                    {Math.round(selectedLayer.opacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={selectedLayer.opacity}
                  onChange={(e) => updateSelectedLayer({ opacity: Number(e.target.value) })}
                  className="w-full accent-blue-500 cursor-pointer"
                />
              </div>

              {/* Layer Ordering Controls */}
              <div className="space-y-1.5 pt-2 border-t border-white/10">
                <span className="text-[11px] font-semibold text-white/60 block">Order</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleBringForward(selectedLayer.id)}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-[12px] text-xs font-medium text-white/80"
                  >
                    Bring Forward
                  </button>
                  <button
                    onClick={() => handleSendBackward(selectedLayer.id)}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-[12px] text-xs font-medium text-white/80"
                  >
                    Send Backward
                  </button>
                </div>
              </div>

              {/* Layer Replacement / Removal */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                <button
                  onClick={() => handleImportImage(selectedLayer.id)}
                  className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-[12px] text-xs font-semibold text-white/80 transition-all"
                >
                  Replace Image File
                </button>
                <button
                  onClick={() => handleDeleteLayer(selectedLayer.id)}
                  className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-[12px] text-xs font-semibold text-red-300 transition-all"
                >
                  Delete Layer
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-white/30">
              <span className="text-xs">No layer selected</span>
              <span className="text-[11px] mt-1">
                Click a layer on the canvas or in the list above to edit its position, scale, and
                opacity.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Preview Modal ──────────────────────────────────────────────────── */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
          <div className="w-full max-w-4xl bg-[#12111a] border border-white/10 rounded-[12px] shadow-2xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Full Screen Output Preview</h3>
                <p className="text-xs text-white/40">
                  Target:{" "}
                  {currentDesign.target === "both"
                    ? "Live Stream + Sanctuary Screens"
                    : currentDesign.target === "stream"
                    ? "Live Stream Only"
                    : "Sanctuary Screens Only"}
                </p>
              </div>
              <button
                onClick={() => setIsPreviewOpen(false)}
                className="text-xs px-3 py-1.5 rounded-[12px] bg-white/5 hover:bg-white/10 border border-white/10 text-white/80"
              >
                Close Preview
              </button>
            </div>

            {/* Modal 16:9 Canvas Preview */}
            <div className="p-6 bg-black flex items-center justify-center">
              <div
                className="relative w-full aspect-video bg-[#1a1924] rounded-[12px] overflow-hidden"
                style={{
                  backgroundImage:
                    "linear-gradient(45deg, #222131 25%, transparent 25%), linear-gradient(-45deg, #222131 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #222131 75%), linear-gradient(-45deg, transparent 75%, #222131 75%)",
                  backgroundSize: "24px 24px",
                  backgroundPosition: "0 0, 0 12px, 12px -12px, -12px 0px",
                }}
              >
                {currentDesign.layers
                  .filter((l) => l.visible && !l.isMissing)
                  .map((layer) => (
                    <div
                      key={layer.id}
                      className="absolute pointer-events-none"
                      style={{
                        left: `${layer.x}%`,
                        top: `${layer.y}%`,
                        transform: "translate(-50%, -50%)",
                        width: `${layer.width}%`,
                        opacity: layer.opacity,
                        zIndex: layer.zIndex,
                      }}
                    >
                      <img
                        src={layer.url || layer.filePath}
                        alt=""
                        className="w-full h-auto object-contain rounded-[12px]"
                      />
                    </div>
                  ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between bg-white/5">
              <span className="text-xs text-white/50">
                {currentDesign.layers.filter((l) => l.visible).length} visible layer(s) ready to
                broadcast
              </span>
              <div className="flex gap-3">
                <ActionButton
                  onClick={() => setIsPreviewOpen(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-[12px] text-xs font-semibold text-white/80"
                >
                  Back to Editor
                </ActionButton>
                <ActionButton
                  onClick={() => {
                    handlePresent();
                    setIsPreviewOpen(false);
                  }}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 border border-emerald-400 rounded-[12px] text-xs font-bold text-white shadow-lg shadow-emerald-600/20"
                >
                  Present to Output Now
                </ActionButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
