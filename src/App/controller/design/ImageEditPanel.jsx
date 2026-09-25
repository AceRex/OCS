/**
 * ImageEditPanel.jsx
 * ==================
 * Non-destructive pixel-level editing for image layers in OCS Design Lab.
 *
 * Architecture:
 *  - Renders a floating <canvas> overlay on top of the selected layer in the
 *    viewport, at exact pixel resolution matching the on-screen layer rect.
 *  - Maintains an alpha-mask canvas at source resolution (layer.naturalWidth x
 *    layer.naturalHeight, fallback 1920x1080 scaled by aspectRatio).
 *  - All strokes are recorded as lightweight stroke objects (no full bitmap
 *    snapshots) enabling undo/redo without memory pressure.
 *  - Supports canvas zoom, pan, and rotation transformation mapping into the image's
 *    canonical local coordinate space.
 *  - Supports Smart Region Erase ("Hide Region" and "Keep Only Selection") when
 *    smart flyer or decomposition metadata is present on the layer.
 *  - On "Apply", renders the alpha-mask onto the source image at source res
 *    and produces a PNG dataURL stored as layer.editedUrl. The original
 *    url/content is never overwritten — it stays in layer.originalUrl.
 *  - On "Cancel", discards the session; on "Reset", wipes all strokes and
 *    restores full opacity.
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  PiEraser,
  PiPaintBrush,
  PiArrowCounterClockwise,
  PiArrowClockwise,
  PiCheck,
  PiX,
  PiArrowsCounterClockwise,
  PiMinus,
  PiPlus,
  PiSlidersHorizontal,
  PiIntersect,
  PiCrop,
  PiEyeSlash,
} from 'react-icons/pi';

// ── Constants ─────────────────────────────────────────────────────────────────
const MIN_BRUSH = 4;
const MAX_BRUSH = 120;
const DEFAULT_BRUSH = 24;
const CHECKER_SIZE = 10;

// ── Helpers ───────────────────────────────────────────────────────────────────
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function drawCheckerboard(ctx, w, h, size = CHECKER_SIZE) {
  const cols = Math.ceil(w / size);
  const rows = Math.ceil(h / size);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#1e1b2e' : '#2a2540';
      ctx.fillRect(c * size, r * size, size, size);
    }
  }
}

function resolveNaturalSize(layer) {
  if (layer.naturalWidth && layer.naturalHeight) {
    return { nw: layer.naturalWidth, nh: layer.naturalHeight };
  }
  const ar = layer.aspectRatio || 16 / 9;
  const base = 1920;
  return { nw: base, nh: Math.round(base / ar) };
}

function displayToSource(clientX, clientY, rect, nw, nh, rotation = 0) {
  let lx = clientX - rect.left;
  let ly = clientY - rect.top;

  if (rotation && rotation % 360 !== 0) {
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const rad = (-rotation * Math.PI) / 180;
    const dx = lx - cx;
    const dy = ly - cy;
    lx = cx + (dx * Math.cos(rad) - dy * Math.sin(rad));
    ly = cy + (dx * Math.sin(rad) + dy * Math.cos(rad));
  }

  const scaleX = nw / rect.width;
  const scaleY = nh / rect.height;
  return {
    x: clamp(lx * scaleX, 0, nw),
    y: clamp(ly * scaleY, 0, nh),
  };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ImageEditPanel({ layer, canvasLayerRect, onApply, onCancel, initialStrokes = [] }) {
  const [tool, setTool] = useState('erase'); // 'erase' | 'restore'
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH);
  const [brushOpacity, setBrushOpacity] = useState(100);
  const [brushHardness, setBrushHardness] = useState(100); // 0 = soft feather, 100 = hard edge
  const [isApplying, setIsApplying] = useState(false);
  const [strokes, setStrokes] = useState(initialStrokes);
  const [redoStack, setRedoStack] = useState([]);
  const [showRegionsMenu, setShowRegionsMenu] = useState(false);

  const MAX_HISTORY = 30;
  const maskCanvasRef = useRef(null);
  const baseMaskCanvasRef = useRef(null);
  const displayCanvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef(null);
  const lastPosRef = useRef(null);

  const { nw, nh } = resolveNaturalSize(layer);
  const rotation = layer.rotation || 0;
  const availableRegions = layer.detectedRegions || layer.regions || [];

  // ── Init mask canvases ─────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const mc = document.createElement('canvas');
    mc.width = nw;
    mc.height = nh;
    const ctx = mc.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, nw, nh);
    maskCanvasRef.current = mc;

    const bc = document.createElement('canvas');
    bc.width = nw;
    bc.height = nh;
    const bctx = bc.getContext('2d');
    bctx.fillStyle = 'white';
    bctx.fillRect(0, 0, nw, nh);
    baseMaskCanvasRef.current = bc;

    if (initialStrokes.length > 0) {
      if (initialStrokes.length > MAX_HISTORY) {
        const baked = initialStrokes.slice(0, initialStrokes.length - MAX_HISTORY);
        replayStrokes(bc, baked);
        replayStrokes(mc, initialStrokes);
        setStrokes(initialStrokes.slice(-MAX_HISTORY));
      } else {
        replayStrokes(mc, initialStrokes);
      }
    }

    return () => {
      maskCanvasRef.current = null;
      baseMaskCanvasRef.current = null;
      displayCanvasRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nw, nh]);

  // ── Resize display canvas ──────────────────────────────────────────────────
  useLayoutEffect(() => {
    const dc = displayCanvasRef.current;
    if (!dc || !canvasLayerRect) return;
    const dw = Math.round(canvasLayerRect.width);
    const dh = Math.round(canvasLayerRect.height);
    if (dc.width !== dw || dc.height !== dh) { dc.width = dw; dc.height = dh; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasLayerRect]);

  // ── Render display ─────────────────────────────────────────────────────────
  const renderDisplay = useCallback(() => {
    const dc = displayCanvasRef.current;
    const mc = maskCanvasRef.current;
    if (!dc || !mc) return;
    const dctx = dc.getContext('2d');
    const dw = dc.width;
    const dh = dc.height;
    if (!dw || !dh) return;

    drawCheckerboard(dctx, dw, dh);

    const imgSrc = layer.content || layer.url || (layer.filePath ? `file://${layer.filePath}` : null);
    if (!imgSrc) return;

    const img = new window.Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const tmp = document.createElement('canvas');
      tmp.width = dw;
      tmp.height = dh;
      const tctx = tmp.getContext('2d');
      tctx.drawImage(img, 0, 0, dw, dh);

      const mctx = mc.getContext('2d');
      const maskData = mctx.getImageData(0, 0, nw, nh);
      const imgData = tctx.getImageData(0, 0, dw, dh);
      const d = imgData.data;
      const md = maskData.data;
      const scX = nw / dw;
      const scY = nh / dh;

      for (let py = 0; py < dh; py++) {
        for (let px = 0; px < dw; px++) {
          const mx = Math.min(nw - 1, Math.floor(px * scX));
          const my = Math.min(nh - 1, Math.floor(py * scY));
          const mAlpha = md[(my * nw + mx) * 4];
          const i = (py * dw + px) * 4;
          d[i + 3] = Math.round((d[i + 3] * mAlpha) / 255);
        }
      }
      tctx.putImageData(imgData, 0, 0);
      dctx.clearRect(0, 0, dw, dh);
      drawCheckerboard(dctx, dw, dh);
      dctx.drawImage(tmp, 0, 0);
    };
    img.onerror = () => {};
    img.src = imgSrc;
  }, [layer, nw, nh]);

  // ── Re-render on stroke change ─────────────────────────────────────────────
  useEffect(() => {
    const mc = maskCanvasRef.current;
    const bc = baseMaskCanvasRef.current;
    if (!mc) return;
    const ctx = mc.getContext('2d');
    ctx.clearRect(0, 0, nw, nh);
    if (bc) {
      ctx.drawImage(bc, 0, 0);
    } else {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, nw, nh);
    }
    replayStrokes(mc, strokes);
    renderDisplay();
  }, [strokes, nw, nh, renderDisplay]);

  // ── Stroke helpers ─────────────────────────────────────────────────────────
  function replayStrokes(mc, strokeList) {
    const mctx = mc.getContext('2d');
    for (const st of strokeList) {
      if (st.type === 'rect_erase' && st.rect) {
        mctx.save();
        mctx.globalCompositeOperation = 'destination-out';
        mctx.fillRect(st.rect.x, st.rect.y, st.rect.w, st.rect.h);
        mctx.restore();
      } else if (st.type === 'keep_only' && st.rect) {
        mctx.save();
        mctx.globalCompositeOperation = 'destination-out';
        // Erase top
        mctx.fillRect(0, 0, nw, Math.max(0, st.rect.y));
        // Erase bottom
        mctx.fillRect(0, st.rect.y + st.rect.h, nw, Math.max(0, nh - (st.rect.y + st.rect.h)));
        // Erase left
        mctx.fillRect(0, st.rect.y, Math.max(0, st.rect.x), st.rect.h);
        // Erase right
        mctx.fillRect(st.rect.x + st.rect.w, st.rect.y, Math.max(0, nw - (st.rect.x + st.rect.w)), st.rect.h);
        mctx.restore();
      } else {
        applyStroke(mctx, st);
      }
    }
  }

  function applyStroke(mctx, stroke) {
    if (!stroke.points?.length) return;
    mctx.save();
    mctx.globalCompositeOperation = stroke.tool === 'erase' ? 'destination-out' : 'source-over';
    const alpha = (stroke.opacity ?? 100) / 100;
    const color = stroke.tool === 'erase'
      ? `rgba(0,0,0,${alpha})`
      : `rgba(255,255,255,${alpha})`;
    mctx.strokeStyle = color;
    mctx.fillStyle = color;
    mctx.lineWidth = stroke.size;
    mctx.lineCap = 'round';
    mctx.lineJoin = 'round';

    const hardness = stroke.hardness ?? 100;
    if (hardness < 95) {
      const blurAmount = Math.max(1, ((100 - hardness) / 100) * (stroke.size / 2));
      mctx.shadowBlur = blurAmount;
      mctx.shadowColor = color;
    }

    const pts = stroke.points;
    if (pts.length === 1) {
      mctx.beginPath();
      mctx.arc(pts[0].x, pts[0].y, stroke.size / 2, 0, Math.PI * 2);
      mctx.fill();
    } else {
      mctx.beginPath();
      mctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2;
        const my = (pts[i].y + pts[i + 1].y) / 2;
        mctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      mctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      mctx.stroke();
    }
    mctx.restore();
  }

  const pushStroke = useCallback((stroke) => {
    setStrokes((prev) => {
      const next = [...prev, stroke];
      if (next.length > MAX_HISTORY) {
        const discarded = next.slice(0, next.length - MAX_HISTORY);
        const bc = baseMaskCanvasRef.current;
        if (bc) replayStrokes(bc, discarded);
        return next.slice(-MAX_HISTORY);
      }
      return next;
    });
    setRedoStack([]);
  }, [nw, nh]);

  // ── Smart Region Actions ───────────────────────────────────────────────────
  const handleEraseRegion = (region) => {
    if (!region) return;
    const normX = region.normX != null ? (region.normX > 1 ? region.normX / 100 : region.normX) : 0;
    const normY = region.normY != null ? (region.normY > 1 ? region.normY / 100 : region.normY) : 0;
    const normW = region.normW != null ? (region.normW > 1 ? region.normW / 100 : region.normW) : 0.2;
    const normH = region.normH != null ? (region.normH > 1 ? region.normH / 100 : region.normH) : 0.2;

    const stroke = {
      type: 'rect_erase',
      rect: { x: normX * nw, y: normY * nh, w: normW * nw, h: normH * nh },
      label: `Hide ${region.label || region.text || 'Region'}`,
    };
    pushStroke(stroke);
    setShowRegionsMenu(false);
  };

  const handleKeepOnlyRegion = (region) => {
    if (!region) return;
    const normX = region.normX != null ? (region.normX > 1 ? region.normX / 100 : region.normX) : 0;
    const normY = region.normY != null ? (region.normY > 1 ? region.normY / 100 : region.normY) : 0;
    const normW = region.normW != null ? (region.normW > 1 ? region.normW / 100 : region.normW) : 0.2;
    const normH = region.normH != null ? (region.normH > 1 ? region.normH / 100 : region.normH) : 0.2;

    const stroke = {
      type: 'keep_only',
      rect: { x: normX * nw, y: normY * nh, w: normW * nw, h: normH * nh },
      label: `Keep Only ${region.label || region.text || 'Region'}`,
    };
    pushStroke(stroke);
    setShowRegionsMenu(false);
  };

  // ── Pointer events ─────────────────────────────────────────────────────────
  const getPos = useCallback((e) => {
    const dc = displayCanvasRef.current;
    if (!dc) return null;
    const rect = dc.getBoundingClientRect();
    return displayToSource(e.clientX, e.clientY, rect, nw, nh, rotation);
  }, [nw, nh, rotation]);

  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = getPos(e);
    if (!pos) return;
    isDrawingRef.current = true;
    currentStrokeRef.current = {
      tool,
      points: [pos],
      size: brushSize,
      opacity: brushOpacity,
      hardness: brushHardness,
    };
    lastPosRef.current = pos;
    displayCanvasRef.current?.setPointerCapture(e.pointerId);
    const mc = maskCanvasRef.current;
    if (mc) { applyStroke(mc.getContext('2d'), currentStrokeRef.current); renderDisplay(); }
  }, [tool, brushSize, brushOpacity, brushHardness, getPos, renderDisplay]);

  const handlePointerMove = useCallback((e) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    const pos = getPos(e);
    if (!pos) return;
    currentStrokeRef.current.points.push(pos);
    const mc = maskCanvasRef.current;
    const prev = lastPosRef.current;
    if (mc && prev) {
      const mctx = mc.getContext('2d');
      mctx.save();
      mctx.globalCompositeOperation = tool === 'erase' ? 'destination-out' : 'source-over';
      const alpha = brushOpacity / 100;
      const color = tool === 'erase' ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;
      mctx.strokeStyle = color;
      mctx.fillStyle = color;
      mctx.lineWidth = brushSize;
      mctx.lineCap = 'round';
      mctx.lineJoin = 'round';
      if (brushHardness < 95) {
        mctx.shadowBlur = Math.max(1, ((100 - brushHardness) / 100) * (brushSize / 2));
        mctx.shadowColor = color;
      }
      mctx.beginPath();
      mctx.moveTo(prev.x, prev.y);
      mctx.lineTo(pos.x, pos.y);
      mctx.stroke();
      mctx.restore();
      renderDisplay();
    }
    lastPosRef.current = pos;
  }, [tool, brushSize, brushOpacity, brushHardness, getPos, renderDisplay]);

  const handlePointerUp = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const stroke = currentStrokeRef.current;
    if (stroke?.points?.length > 0) {
      pushStroke(stroke);
    }
    currentStrokeRef.current = null;
    lastPosRef.current = null;
  }, [pushStroke]);

  // ── Undo / Redo ────────────────────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    setStrokes((prev) => {
      if (!prev.length) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [...r.slice(-(MAX_HISTORY - 1)), last]);
      return prev.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (!prev.length) return prev;
      const last = prev[prev.length - 1];
      setStrokes((s) => {
        const next = [...s, last];
        if (next.length > MAX_HISTORY) {
          const discarded = next.slice(0, next.length - MAX_HISTORY);
          const bc = baseMaskCanvasRef.current;
          if (bc) replayStrokes(bc, discarded);
          return next.slice(-MAX_HISTORY);
        }
        return next;
      });
      return prev.slice(0, -1);
    });
  }, [nw, nh]);

  // ── Apply ──────────────────────────────────────────────────────────────────
  const handleApply = useCallback(async () => {
    setIsApplying(true);
    try {
      const imgSrc = layer.content || layer.url || (layer.filePath ? `file://${layer.filePath}` : null);
      if (!imgSrc) throw new Error('No source');
      const img = await new Promise((res, rej) => {
        const i = new window.Image();
        i.crossOrigin = 'Anonymous';
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = imgSrc;
      });
      const out = document.createElement('canvas');
      out.width = nw;
      out.height = nh;
      const ctx = out.getContext('2d');
      ctx.drawImage(img, 0, 0, nw, nh);
      const mc = maskCanvasRef.current;
      const maskData = mc.getContext('2d').getImageData(0, 0, nw, nh);
      const imgData = ctx.getImageData(0, 0, nw, nh);
      const d = imgData.data;
      const md = maskData.data;
      for (let i = 0; i < nw * nh; i++) {
        d[i * 4 + 3] = Math.round((d[i * 4 + 3] * md[i * 4]) / 255);
      }
      ctx.putImageData(imgData, 0, 0);
      onApply(out.toDataURL('image/png'), strokes);
    } catch (err) {
      console.error('[ImageEditPanel] Apply failed:', err);
    } finally {
      setIsApplying(false);
    }
  }, [layer, nw, nh, strokes, onApply]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); handleUndo(); }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); handleRedo(); }
      if (e.key === 'e') setTool('erase');
      if (e.key === 'r') setTool('restore');
      if (e.key === '[') setBrushSize((s) => clamp(s - 4, MIN_BRUSH, MAX_BRUSH));
      if (e.key === ']') setBrushSize((s) => clamp(s + 4, MIN_BRUSH, MAX_BRUSH));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [handleUndo, handleRedo]);

  if (!canvasLayerRect) return null;

  // Compute SVG cursor that shows the brush size in display pixels
  const dispScale = canvasLayerRect.width / nw;
  const dispBrush = Math.max(6, Math.round(brushSize * dispScale));
  const half = Math.floor((dispBrush + 4) / 2);
  const cursorSvg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${dispBrush + 4}' height='${dispBrush + 4}'%3E%3Ccircle cx='${half}' cy='${half}' r='${dispBrush / 2}' stroke='%23fff' stroke-width='1.5' fill='${tool === 'erase' ? 'rgba(255%2C80%2C80%2C0.20)' : 'rgba(80%2C255%2C140%2C0.20)'}'/%3E%3C/svg%3E`;

  const hasStrokes = strokes.length > 0;
  const hasRedo = redoStack.length > 0;

  return (
    <>
      {/* Dimmed backdrop overlay for focused editing */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
          backdropFilter: 'blur(1px)',
          zIndex: 9050,
          pointerEvents: 'all',
        }}
        onClick={onCancel}
      />

      {/* Overlay canvas pinned to the layer */}
      <canvas
        ref={displayCanvasRef}
        style={{
          position: 'fixed',
          left: canvasLayerRect.left,
          top: canvasLayerRect.top,
          width: canvasLayerRect.width,
          height: canvasLayerRect.height,
          zIndex: 9100,
          cursor: `url("${cursorSvg}") ${half} ${half}, crosshair`,
          touchAction: 'none',
          userSelect: 'none',
          pointerEvents: 'all',
          boxShadow: '0 0 0 2px rgba(139, 92, 246, 0.8), 0 20px 40px rgba(0,0,0,0.6)',
          borderRadius: 12,
          transform: rotation ? `rotate(${rotation}deg)` : undefined,
          transformOrigin: 'center center',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Floating tool panel */}
      <div
        style={{
          position: 'fixed',
          left: Math.max(16, Math.min(window.innerWidth - 650, canvasLayerRect.left)),
          top: Math.max(68, canvasLayerRect.top - 54),
          zIndex: 9200,
          pointerEvents: 'all',
        }}
        className="flex items-center gap-1 bg-[#13111e]/95 border border-[#8B5CF6]/50 rounded-[12px] px-2 py-1.5 shadow-2xl backdrop-blur-xl select-none text-white"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Erase / Restore toggle */}
        <div className="flex items-center gap-0.5 pr-1.5 border-r border-white/10">
          <button
            type="button"
            title="Erase (E) – clears pixels to transparency"
            onClick={() => setTool('erase')}
            className={`flex items-center gap-1 px-2 py-1 rounded-[12px] text-[10px] font-bold transition-all border ${
              tool === 'erase'
                ? 'bg-red-500/30 text-red-300 border-red-500/40'
                : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10 hover:text-white'
            }`}
          >
            <PiEraser size={12} />
            <span>Erase</span>
          </button>
          <button
            type="button"
            title="Restore (R) – repaints original image pixels back"
            onClick={() => setTool('restore')}
            className={`flex items-center gap-1 px-2 py-1 rounded-[12px] text-[10px] font-bold transition-all border ${
              tool === 'restore'
                ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/40'
                : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10 hover:text-white'
            }`}
          >
            <PiPaintBrush size={12} />
            <span>Restore</span>
          </button>
        </div>

        {/* Brush size */}
        <div className="flex items-center gap-1 px-1.5 border-r border-white/10">
          <button type="button" title="[ smaller" onClick={() => setBrushSize((s) => clamp(s - 4, MIN_BRUSH, MAX_BRUSH))} className="p-0.5 text-white/50 hover:text-white">
            <PiMinus size={11} />
          </button>
          <div className="flex flex-col items-center">
            <span className="text-[8px] text-white/30 leading-none">Size</span>
            <input type="range" min={MIN_BRUSH} max={MAX_BRUSH} value={brushSize} onChange={(e) => setBrushSize(+e.target.value)} className="w-14 accent-purple-500" style={{ height: 12 }} />
          </div>
          <span className="text-[10px] font-mono text-white/70 w-5 text-right">{brushSize}</span>
          <button type="button" title="] larger" onClick={() => setBrushSize((s) => clamp(s + 4, MIN_BRUSH, MAX_BRUSH))} className="p-0.5 text-white/50 hover:text-white">
            <PiPlus size={11} />
          </button>
        </div>

        {/* Hardness / Feather */}
        <div className="flex items-center gap-1 px-1.5 border-r border-white/10">
          <div className="flex flex-col items-center">
            <span className="text-[8px] text-white/30 leading-none">Hardness</span>
            <input type="range" min={0} max={100} value={brushHardness} onChange={(e) => setBrushHardness(+e.target.value)} className="w-12 accent-purple-500" style={{ height: 12 }} title="0% = soft feather, 100% = crisp edge" />
          </div>
          <span className="text-[10px] font-mono text-white/70 w-6 text-right">{brushHardness}%</span>
        </div>

        {/* Opacity */}
        <div className="flex items-center gap-1 px-1.5 border-r border-white/10">
          <div className="flex flex-col items-center">
            <span className="text-[8px] text-white/30 leading-none">Opacity</span>
            <input type="range" min={5} max={100} value={brushOpacity} onChange={(e) => setBrushOpacity(+e.target.value)} className="w-12 accent-purple-500" style={{ height: 12 }} />
          </div>
          <span className="text-[10px] font-mono text-white/70 w-7 text-right">{brushOpacity}%</span>
        </div>

        {/* Smart Regions Dropdown (if available) */}
        {availableRegions.length > 0 && (
          <div className="relative flex items-center px-1 border-r border-white/10">
            <button
              type="button"
              onClick={() => setShowRegionsMenu(!showRegionsMenu)}
              className="flex items-center gap-1 px-2 py-1 rounded-[12px] bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 text-[10px] font-bold border border-purple-500/30 transition-all"
              title="Hide or isolate detected sub-regions"
            >
              <PiIntersect size={12} />
              <span>Smart Regions ({availableRegions.length})</span>
            </button>
            {showRegionsMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 6,
                  zIndex: 9300,
                }}
                className="w-56 bg-[#1a1727] border border-[#8B5CF6]/50 rounded-[12px] p-1.5 shadow-2xl space-y-1 text-xs backdrop-blur-xl"
              >
                <div className="px-1.5 py-1 text-[9px] uppercase tracking-wider text-white/40 font-bold border-b border-white/10">
                  Detected Sub-Regions
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                  {availableRegions.map((reg, idx) => (
                    <div key={idx} className="p-1.5 rounded-[12px] bg-white/[0.03] border border-white/5 space-y-1">
                      <div className="text-[10px] font-semibold text-white truncate">
                        {reg.label || reg.text || `Region ${idx + 1}`}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleEraseRegion(reg)}
                          className="flex-1 py-0.5 px-1 rounded-[12px] bg-red-500/20 hover:bg-red-500/40 text-red-300 text-[9px] font-bold flex items-center justify-center gap-1"
                          title="Hide / erase this region"
                        >
                          <PiEyeSlash size={10} />
                          <span>Hide</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleKeepOnlyRegion(reg)}
                          className="flex-1 py-0.5 px-1 rounded-[12px] bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 text-[9px] font-bold flex items-center justify-center gap-1"
                          title="Keep only this region, mask out rest"
                        >
                          <PiCrop size={10} />
                          <span>Keep Only</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Undo / Redo / Reset */}
        <div className="flex items-center gap-0.5 px-1 border-r border-white/10">
          <button type="button" title="Undo ⌘Z" onClick={handleUndo} disabled={!hasStrokes} className="p-1 rounded-[12px] text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-25 transition-all"><PiArrowCounterClockwise size={13} /></button>
          <button type="button" title="Redo ⌘Y" onClick={handleRedo} disabled={!hasRedo} className="p-1 rounded-[12px] text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-25 transition-all"><PiArrowClockwise size={13} /></button>
          <button type="button" title="Reset all edits" onClick={() => { setStrokes([]); setRedoStack([]); const bc = baseMaskCanvasRef.current; if (bc) { const bctx = bc.getContext('2d'); bctx.fillStyle = 'white'; bctx.fillRect(0, 0, nw, nh); } }} disabled={!hasStrokes} className="p-1 rounded-[12px] text-white/50 hover:text-amber-300 hover:bg-amber-500/10 disabled:opacity-25 transition-all"><PiArrowsCounterClockwise size={13} /></button>
        </div>

        {/* Cancel / Apply */}
        <div className="flex items-center gap-1">
          <button type="button" title="Cancel" onClick={onCancel} className="p-1 rounded-[12px] text-white/50 hover:text-white hover:bg-white/10 transition-all"><PiX size={14} /></button>
          <button
            type="button"
            title="Apply non-destructive edit to layer"
            onClick={handleApply}
            disabled={!hasStrokes || isApplying}
            className="flex items-center gap-1 px-2.5 py-1 rounded-[12px] bg-[#8B5CF6]/80 hover:bg-[#8B5CF6] disabled:opacity-40 text-white text-[10px] font-bold transition-all border border-[#8B5CF6]/50 shadow"
          >
            {isApplying ? <span className="animate-pulse">Applying…</span> : <><PiCheck size={12} /><span>Apply</span></>}
          </button>
        </div>
      </div>
    </>
  );
}
