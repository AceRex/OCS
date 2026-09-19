import React, { useEffect, useRef, useState } from "react";
import { PiVideoCamera, PiX } from "react-icons/pi";
import { transitionEngine } from "./TransitionEngine";
import { renderCustomLowerThirdUI, DEFAULT_LOWER_THIRD_STYLE } from "./LowerThirdGraphic";
import { calculateCropMetrics } from "./designStudioCrop";

const _programImageCache = {};
const _designLayerImageCache = new Map();

// Module-level callback registered by SwitcherProgramCanvas to trigger redraws
// whenever an async image load completes.
let _onImageLoadCallback = null;
export function setImageLoadCallback(cb) { _onImageLoadCallback = cb; }

// Bounded Offscreen Buffer for Frosted Glass Background Blur
let _glassOffscreenCanvas = null;

export function getGlassOffscreenBuffer(bw, bh) {
  if (typeof document === "undefined") return null;
  if (!_glassOffscreenCanvas) {
    _glassOffscreenCanvas = document.createElement("canvas");
  }
  const targetW = Math.max(16, Math.ceil(bw));
  const targetH = Math.max(16, Math.ceil(bh));
  if (_glassOffscreenCanvas.width !== targetW || _glassOffscreenCanvas.height !== targetH) {
    _glassOffscreenCanvas.width = targetW;
    _glassOffscreenCanvas.height = targetH;
  }
  return _glassOffscreenCanvas;
}

export function releaseGlassOffscreenBuffers() {
  if (_glassOffscreenCanvas) {
    _glassOffscreenCanvas.width = 0;
    _glassOffscreenCanvas.height = 0;
    _glassOffscreenCanvas = null;
  }
}

const _glassBenchmarkData = {
  lastCostMs: 0,
  avgCostMs: 0,
  totalFrames: 0,
  totalCostMs: 0,
  activePanels: 0,
  bufferDims: { w: 0, h: 0 },
  lightweightCount: 0,
};

export function getGlassBlurBenchmark() {
  return { ..._glassBenchmarkData };
}

if (typeof window !== "undefined") {
  window.__glassBlurBenchmark = _glassBenchmarkData;
}

export function getShadowRgba(color = "#000000", opacity = 60) {
  const alpha = typeof opacity === "number" ? Math.max(0, Math.min(100, opacity)) / 100 : 0.6;
  if (!color) return `rgba(0,0,0,${alpha})`;
  let c = String(color).trim();
  if (c.startsWith("#")) {
    let hex = c.slice(1);
    if (hex.length === 3) hex = hex.split("").map((x) => x + x).join("");
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16) || 0;
      const g = parseInt(hex.substring(2, 4), 16) || 0;
      const b = parseInt(hex.substring(4, 6), 16) || 0;
      return `rgba(${r},${g},${b},${alpha})`;
    }
  }
  return c;
}

export function getGlassTintRgba(color = "#ffffff", opacity = 0.25) {
  const alpha = typeof opacity === "number" ? Math.max(0, Math.min(1, opacity)) : 0.25;
  return getShadowRgba(color, Math.round(alpha * 100));
}

export function drawSpecularHighlightSweep(ctx, rx, ry, layerW, layerH, progress) {
  // Angled specular highlight sweeping across the panel on entrance
  ctx.save();
  const beamWidth = Math.max(30, layerW * 0.32);
  const startX = rx - beamWidth * 1.5;
  const endX = rx + layerW + beamWidth * 1.5;
  const currentX = startX + (endX - startX) * progress;

  const grad = ctx.createLinearGradient(currentX - beamWidth / 2, ry, currentX + beamWidth / 2, ry + layerH);
  grad.addColorStop(0, "rgba(255, 255, 255, 0)");
  grad.addColorStop(0.5, "rgba(255, 255, 255, 0.4)");
  grad.addColorStop(1, "rgba(255, 255, 255, 0)");

  ctx.fillStyle = grad;
  ctx.fillRect(rx - 10, ry - 10, layerW + 20, layerH + 20);
  ctx.restore();
}

export function formatLayerShadow(layer) {
  if (!layer || !layer.shadowEnabled) return "none";
  const ox = typeof layer.shadowOffsetX === "number" ? layer.shadowOffsetX : 0;
  const oy = typeof layer.shadowOffsetY === "number" ? layer.shadowOffsetY : 4;
  const blur = typeof layer.shadowBlur === "number" ? layer.shadowBlur : 10;
  const rgba = getShadowRgba(layer.shadowColor, layer.shadowOpacity);
  return `${ox}px ${oy}px ${blur}px ${rgba}`;
}

export function renderLiveDesignShape(layer) {
  if (!layer) return null;
  const shape = layer.shape || "rounded-rect";
  const isLine = shape === "line";
  const isArrow = shape === "arrow";
  const isLineOrArrow = isLine || isArrow;
  const sw = typeof layer.strokeWidth === "number" ? layer.strokeWidth : (isLineOrArrow ? 3 : 2);
  const strokeColor = sw > 0 && layer.stroke && layer.stroke !== "transparent" ? layer.stroke : "none";
  const strokeW = sw > 0 ? sw : 0;
  const fillColor = isLineOrArrow ? "transparent" : (layer.fill || "#581c87");
  const shadowFilter = layer.shadowEnabled ? `drop-shadow(${formatLayerShadow(layer)})` : "none";
  const shadowBox = layer.shadowEnabled ? formatLayerShadow(layer) : "none";

  if (shape === "rectangle" || shape === "square") {
    return (
      <div
        data-studio-shape-content="true"
        style={{
          width: "100%",
          height: `${(layer.height || 12) * 4}px`,
          backgroundColor: fillColor,
          border: strokeW > 0 && strokeColor !== "none" ? `${strokeW}px solid ${strokeColor}` : "none",
          borderRadius: "0px",
          boxShadow: shadowBox,
        }}
      />
    );
  }

  if (shape === "rounded-rect") {
    const radius = typeof layer.borderRadius === "number" ? layer.borderRadius : 12;
    return (
      <div
        data-studio-shape-content="true"
        style={{
          width: "100%",
          height: `${(layer.height || 12) * 4}px`,
          backgroundColor: fillColor,
          border: strokeW > 0 && strokeColor !== "none" ? `${strokeW}px solid ${strokeColor}` : "none",
          borderRadius: `${radius}px`,
          boxShadow: shadowBox,
        }}
      />
    );
  }

  if (shape === "line") {
    const isVertical = (layer.height || 0) > (layer.width || 0);
    return (
      <div data-studio-shape-content="true" style={{ width: "100%", height: `${Math.max(12, (layer.height || 4) * 4)}px`, filter: shadowFilter }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
          {strokeW > 0 && strokeColor !== "none" && (
            isVertical ? (
              <line x1="50" y1="0" x2="50" y2="100" stroke={strokeColor} strokeWidth={strokeW} vectorEffect="non-scaling-stroke" />
            ) : (
              <line x1="0" y1="50" x2="100" y2="50" stroke={strokeColor} strokeWidth={strokeW} vectorEffect="non-scaling-stroke" />
            )
          )}
        </svg>
      </div>
    );
  }

  if (shape === "arrow") {
    return (
      <div data-studio-shape-content="true" style={{ width: "100%", height: `${Math.max(16, (layer.height || 8) * 4)}px`, filter: shadowFilter }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
          {strokeW > 0 && strokeColor !== "none" && (
            <>
              <line x1="0" y1="50" x2="80" y2="50" stroke={strokeColor} strokeWidth={strokeW} vectorEffect="non-scaling-stroke" />
              <polygon points="76,28 100,50 76,72" fill={strokeColor} stroke={strokeColor} strokeWidth={Math.max(1, Math.round(strokeW / 2))} strokeLinejoin="round" />
            </>
          )}
        </svg>
      </div>
    );
  }

  let svgBody = null;
  if (shape === "circle" || shape === "ellipse") {
    svgBody = <ellipse cx="50" cy="50" rx="49" ry="49" fill={fillColor} stroke={strokeColor} strokeWidth={strokeW} vectorEffect="non-scaling-stroke" />;
  } else if (shape === "triangle") {
    svgBody = <polygon points="50,2 98,98 2,98" fill={fillColor} stroke={strokeColor} strokeWidth={strokeW} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
  } else if (shape === "diamond") {
    svgBody = <polygon points="50,2 98,50 50,98 2,50" fill={fillColor} stroke={strokeColor} strokeWidth={strokeW} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
  } else if (shape === "pentagon") {
    svgBody = <polygon points="50,2 97.55,36.5 79.39,94 20.61,94 2.45,36.5" fill={fillColor} stroke={strokeColor} strokeWidth={strokeW} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
  } else if (shape === "hexagon") {
    svgBody = <polygon points="50,2 96,26.5 96,73.5 50,98 4,73.5 4,26.5" fill={fillColor} stroke={strokeColor} strokeWidth={strokeW} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
  } else if (shape === "star") {
    svgBody = <polygon points="50,2 61.8,36.5 98,36.5 68.7,57.8 79.9,93.5 50,71.8 20.1,93.5 31.3,57.8 2,36.5 38.2,36.5" fill={fillColor} stroke={strokeColor} strokeWidth={strokeW} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
  }

  return (
    <div data-studio-shape-content="true" style={{ width: "100%", height: `${(layer.height || 12) * 4}px`, filter: shadowFilter }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
        {svgBody}
      </svg>
    </div>
  );
}

export function getEaseProgress(progress, easing = "ease-out") {
  const p = Math.max(0, Math.min(1, progress));
  if (easing === "linear") return p;
  if (easing === "ease-in") return p * p;
  if (easing === "ease-in-out") return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  return 1 - (1 - p) * (1 - p); // ease-out
}

export function calculateTransitionOffset(status, startTime, now, transition, w, h) {
  if (status === "live") {
    return { x: 0, y: 0, alpha: 1, wipeProgress: 1, scale: 1, sweepProgress: null };
  }

  if (status === "entering") {
    const entrance = transition?.entrance || { type: "fade", duration: 500, easing: "ease-out" };
    const type = entrance.type || "fade";
    if (type === "none" || type === "cut") {
      return { x: 0, y: 0, alpha: 1, wipeProgress: 1, scale: 1, sweepProgress: null };
    }
    const dur = Math.max(50, entrance.duration || entrance.durationMs || 500);
    const elapsed = now - startTime;
    if (elapsed >= dur) {
      return { x: 0, y: 0, alpha: 1, wipeProgress: 1, scale: 1, sweepProgress: null };
    }
    const rawProgress = Math.min(1, Math.max(0, elapsed / dur));
    const p = getEaseProgress(rawProgress, entrance.easing);
    const sweepProgress = (entrance.sweepHighlight || transition?.sweepHighlight) ? p : null;

    if (type === "fade") {
      return { x: 0, y: 0, alpha: p, wipeProgress: 1, scale: 1, sweepProgress };
    } else if (type === "slide-left") {
      return { x: -(1 - p) * w, y: 0, alpha: 1, wipeProgress: 1, scale: 1, sweepProgress };
    } else if (type === "slide-right") {
      return { x: (1 - p) * w, y: 0, alpha: 1, wipeProgress: 1, scale: 1, sweepProgress };
    } else if (type === "slide-top") {
      return { x: 0, y: -(1 - p) * h, alpha: 1, wipeProgress: 1, scale: 1, sweepProgress };
    } else if (type === "slide-bottom") {
      return { x: 0, y: (1 - p) * h, alpha: 1, wipeProgress: 1, scale: 1, sweepProgress };
    } else if (type === "slide-fade-left") {
      const offset = Math.min(80, (w || 1280) * 0.07);
      return { x: -(1 - p) * offset, y: 0, alpha: p, wipeProgress: 1, scale: 1, sweepProgress };
    } else if (type === "slide-fade-right") {
      const offset = Math.min(80, (w || 1280) * 0.07);
      return { x: (1 - p) * offset, y: 0, alpha: p, wipeProgress: 1, scale: 1, sweepProgress };
    } else if (type === "slide-fade-top") {
      const offset = Math.min(60, (h || 720) * 0.07);
      return { x: 0, y: -(1 - p) * offset, alpha: p, wipeProgress: 1, scale: 1, sweepProgress };
    } else if (type === "slide-fade-bottom") {
      const offset = Math.min(60, (h || 720) * 0.07);
      return { x: 0, y: (1 - p) * offset, alpha: p, wipeProgress: 1, scale: 1, sweepProgress };
    } else if (type === "scale-fade") {
      return { x: 0, y: 0, alpha: p, wipeProgress: 1, scale: 0.92 + 0.08 * p, sweepProgress };
    } else if (type === "wipe") {
      return { x: 0, y: 0, alpha: 1, wipeProgress: p, scale: 1, sweepProgress };
    }
    return { x: 0, y: 0, alpha: 1, wipeProgress: 1, scale: 1, sweepProgress };
  }

  if (status === "exiting") {
    const exit = transition?.exit || { type: "fade", duration: 400, easing: "ease-in" };
    const type = exit.type || "fade";
    if (type === "none" || type === "cut") {
      return { x: 0, y: 0, alpha: 0, wipeProgress: 0, scale: 1, sweepProgress: null };
    }
    const dur = Math.max(50, exit.duration || exit.durationMs || 400);
    const elapsed = now - startTime;
    const rawProgress = Math.min(1, Math.max(0, elapsed / dur));
    const q = getEaseProgress(rawProgress, exit.easing);

    if (type === "fade") {
      return { x: 0, y: 0, alpha: Math.max(0, 1 - q), wipeProgress: 1, scale: 1, sweepProgress: null };
    } else if (type === "slide-left") {
      return { x: -q * w, y: 0, alpha: elapsed >= dur ? 0 : 1, wipeProgress: 1, scale: 1, sweepProgress: null };
    } else if (type === "slide-right") {
      return { x: q * w, y: 0, alpha: elapsed >= dur ? 0 : 1, wipeProgress: 1, scale: 1, sweepProgress: null };
    } else if (type === "slide-top") {
      return { x: 0, y: -q * h, alpha: elapsed >= dur ? 0 : 1, wipeProgress: 1, scale: 1, sweepProgress: null };
    } else if (type === "slide-bottom") {
      return { x: 0, y: q * h, alpha: elapsed >= dur ? 0 : 1, wipeProgress: 1, scale: 1, sweepProgress: null };
    } else if (type === "slide-fade-left") {
      const offset = Math.min(80, (w || 1280) * 0.07);
      return { x: -q * offset, y: 0, alpha: Math.max(0, 1 - q), wipeProgress: 1, scale: 1, sweepProgress: null };
    } else if (type === "slide-fade-right") {
      const offset = Math.min(80, (w || 1280) * 0.07);
      return { x: q * offset, y: 0, alpha: Math.max(0, 1 - q), wipeProgress: 1, scale: 1, sweepProgress: null };
    } else if (type === "slide-fade-top") {
      const offset = Math.min(60, (h || 720) * 0.07);
      return { x: 0, y: -q * offset, alpha: Math.max(0, 1 - q), wipeProgress: 1, scale: 1, sweepProgress: null };
    } else if (type === "slide-fade-bottom") {
      const offset = Math.min(60, (h || 720) * 0.07);
      return { x: 0, y: q * offset, alpha: Math.max(0, 1 - q), wipeProgress: 1, scale: 1, sweepProgress: null };
    } else if (type === "scale-fade") {
      return { x: 0, y: 0, alpha: Math.max(0, 1 - q), wipeProgress: 1, scale: 1.0 - 0.08 * q, sweepProgress: null };
    } else if (type === "wipe") {
      return { x: 0, y: 0, alpha: elapsed >= dur ? 0 : 1, wipeProgress: Math.max(0, 1 - q), scale: 1, sweepProgress: null };
    }
    return { x: 0, y: 0, alpha: Math.max(0, 1 - q), wipeProgress: 1, scale: 1, sweepProgress: null };
  }

  if (status === "delaying" || status === "hidden") {
    return { x: 0, y: 0, alpha: 0, wipeProgress: 0, scale: 1, sweepProgress: null };
  }

  return { x: 0, y: 0, alpha: 1, wipeProgress: 1, scale: 1, sweepProgress: null };
}

export function buildShapePath(ctx, shape, rx, ry, layerW, layerH, customRadius = 0, h = 720, customPath = null) {
  if (customPath && Array.isArray(customPath) && customPath.length >= 3) {
    ctx.moveTo(rx + (customPath[0].x / 100) * layerW, ry + (customPath[0].y / 100) * layerH);
    for (let i = 1; i < customPath.length; i++) {
      const p = customPath[i];
      if (p.cp1 && p.cp2) {
        ctx.bezierCurveTo(
          rx + (p.cp1.x / 100) * layerW,
          ry + (p.cp1.y / 100) * layerH,
          rx + (p.cp2.x / 100) * layerW,
          ry + (p.cp2.y / 100) * layerH,
          rx + (p.x / 100) * layerW,
          ry + (p.y / 100) * layerH
        );
      } else {
        ctx.lineTo(rx + (p.x / 100) * layerW, ry + (p.y / 100) * layerH);
      }
    }
    const first = customPath[0];
    if (first.closingCp1 && first.closingCp2) {
      ctx.bezierCurveTo(
        rx + (first.closingCp1.x / 100) * layerW,
        ry + (first.closingCp1.y / 100) * layerH,
        rx + (first.closingCp2.x / 100) * layerW,
        ry + (first.closingCp2.y / 100) * layerH,
        rx + (first.x / 100) * layerW,
        ry + (first.y / 100) * layerH
      );
    }
    ctx.closePath();
    return;
  }

  if (shape === "circle") {
    const radius = Math.min(layerW, layerH) / 2;
    ctx.arc(rx + layerW / 2, ry + layerH / 2, radius, 0, Math.PI * 2);
  } else if (shape === "ellipse") {
    if (typeof ctx.ellipse === "function") {
      ctx.ellipse(rx + layerW / 2, ry + layerH / 2, layerW / 2, layerH / 2, 0, 0, Math.PI * 2);
    } else {
      ctx.save();
      ctx.translate(rx + layerW / 2, ry + layerH / 2);
      ctx.scale(1, layerH / (layerW || 1));
      ctx.arc(0, 0, layerW / 2, 0, Math.PI * 2);
      ctx.restore();
    }
  } else if (shape === "line") {
    if (layerH > layerW) {
      ctx.moveTo(rx + layerW / 2, ry);
      ctx.lineTo(rx + layerW / 2, ry + layerH);
    } else {
      ctx.moveTo(rx, ry + layerH / 2);
      ctx.lineTo(rx + layerW, ry + layerH / 2);
    }
  } else if (shape === "arrow") {
    const cy = ry + layerH / 2;
    const arrowHeadX = rx + layerW * 0.8;
    const arrowEndX = rx + layerW;
    const arrowTopY = ry + layerH * 0.28;
    const arrowBotY = ry + layerH * 0.72;
    ctx.moveTo(rx, cy);
    ctx.lineTo(arrowHeadX, cy);
    ctx.moveTo(arrowHeadX, arrowTopY);
    ctx.lineTo(arrowEndX, cy);
    ctx.lineTo(arrowHeadX, arrowBotY);
    ctx.closePath();
  } else if (shape === "parallelogram") {
    const skew = Math.min(layerW * 0.15, layerH * 0.6);
    ctx.moveTo(rx + skew, ry);
    ctx.lineTo(rx + layerW, ry);
    ctx.lineTo(rx + layerW - skew, ry + layerH);
    ctx.lineTo(rx, ry + layerH);
    ctx.closePath();
  } else if (shape === "bracket-left") {
    const armW = Math.min(layerW * 0.4, 30);
    ctx.moveTo(rx + armW, ry);
    ctx.lineTo(rx, ry);
    ctx.lineTo(rx, ry + layerH);
    ctx.lineTo(rx + armW, ry + layerH);
  } else if (shape === "bracket-right") {
    const armW = Math.min(layerW * 0.4, 30);
    ctx.moveTo(rx + layerW - armW, ry);
    ctx.lineTo(rx + layerW, ry);
    ctx.lineTo(rx + layerW, ry + layerH);
    ctx.lineTo(rx + layerW - armW, ry + layerH);
  } else if (shape === "triangle") {
    ctx.moveTo(rx + layerW * 0.5, ry + layerH * 0.02);
    ctx.lineTo(rx + layerW * 0.98, ry + layerH * 0.98);
    ctx.lineTo(rx + layerW * 0.02, ry + layerH * 0.98);
    ctx.closePath();
  } else if (shape === "diamond") {
    ctx.moveTo(rx + layerW * 0.5, ry + layerH * 0.02);
    ctx.lineTo(rx + layerW * 0.98, ry + layerH * 0.5);
    ctx.lineTo(rx + layerW * 0.5, ry + layerH * 0.98);
    ctx.lineTo(rx + layerW * 0.02, ry + layerH * 0.5);
    ctx.closePath();
  } else if (shape === "pentagon") {
    const pPts = [[0.5, 0.02], [0.9755, 0.365], [0.7939, 0.94], [0.2061, 0.94], [0.0245, 0.365]];
    ctx.moveTo(rx + layerW * pPts[0][0], ry + layerH * pPts[0][1]);
    for (let i = 1; i < pPts.length; i++) {
      ctx.lineTo(rx + layerW * pPts[i][0], ry + layerH * pPts[i][1]);
    }
    ctx.closePath();
  } else if (shape === "hexagon") {
    const hPts = [[0.5, 0.02], [0.96, 0.265], [0.96, 0.735], [0.5, 0.98], [0.04, 0.735], [0.04, 0.265]];
    ctx.moveTo(rx + layerW * hPts[0][0], ry + layerH * hPts[0][1]);
    for (let i = 1; i < hPts.length; i++) {
      ctx.lineTo(rx + layerW * hPts[i][0], ry + layerH * hPts[i][1]);
    }
    ctx.closePath();
  } else if (shape === "star") {
    const sPts = [[0.5, 0.02], [0.618, 0.365], [0.98, 0.365], [0.687, 0.578], [0.799, 0.935], [0.5, 0.718], [0.201, 0.935], [0.313, 0.578], [0.02, 0.365], [0.382, 0.365]];
    ctx.moveTo(rx + layerW * sPts[0][0], ry + layerH * sPts[0][1]);
    for (let i = 1; i < sPts.length; i++) {
      ctx.lineTo(rx + layerW * sPts[i][0], ry + layerH * sPts[i][1]);
    }
    ctx.closePath();
  } else {
    // rectangle, square, rounded-rect
    let radArr = [0, 0, 0, 0];
    const maxR = Math.min(layerW, layerH) / 2;
    if (Array.isArray(customRadius)) {
      radArr = customRadius.map((r) => Math.max(0, Math.min(maxR, Math.round(Number(r || 0) * (h / 720)))));
    } else {
      const rad = Math.max(0, Math.min(maxR, Math.round((Number(customRadius) || (shape === "rounded-rect" ? 12 : 0)) * (h / 720))));
      radArr = [rad, rad, rad, rad];
    }
    if (radArr.some((r) => r > 0) && typeof ctx.roundRect === "function") {
      ctx.roundRect(rx, ry, layerW, layerH, radArr);
    } else {
      ctx.rect(rx, ry, layerW, layerH);
    }
  }
}

export function createCanvasGradient(ctx, fillType, gradient, rx, ry, layerW, layerH) {
  if (!gradient || !Array.isArray(gradient.stops) || gradient.stops.length === 0) return null;
  const isRadial = fillType === "radial-gradient" || gradient.type === "radial";
  if (isRadial) {
    const cx = rx + layerW * ((gradient.radialCenter?.x ?? 50) / 100);
    const cy = ry + layerH * ((gradient.radialCenter?.y ?? 50) / 100);
    const r = Math.max(layerW, layerH) / 2;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, r));
    for (const stop of gradient.stops) {
      const pos = Math.max(0, Math.min(1, (stop.position ?? 0) / 100));
      g.addColorStop(pos, getShadowRgba(stop.color, Math.round((stop.opacity ?? 1) * 100)));
    }
    return g;
  } else {
    // Linear gradient
    const angleDeg = typeof gradient.angle === "number" ? gradient.angle : 90;
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const cx = rx + layerW / 2;
    const cy = ry + layerH / 2;
    const halfLen = Math.sqrt(layerW * layerW + layerH * layerH) / 2;
    const x0 = cx - dx * halfLen;
    const y0 = cy - dy * halfLen;
    const x1 = cx + dx * halfLen;
    const y1 = cy + dy * halfLen;
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const stop of gradient.stops) {
      const pos = Math.max(0, Math.min(1, (stop.position ?? 0) / 100));
      g.addColorStop(pos, getShadowRgba(stop.color, Math.round((stop.opacity ?? 1) * 100)));
    }
    return g;
  }
}

export function renderGlassPanelBackgroundBlur(ctx, layer, shape, rx, ry, layerW, layerH, cx, cy, w, h, animOffset = {}) {
  const isLightweight = Boolean(layer.lightweightGlass) || layer.backgroundBlur === 0;
  const blurPx = typeof layer.backgroundBlur === "number" ? layer.backgroundBlur : 16;
  const tint = layer.glassTint || "#ffffff";
  const opacity = typeof layer.glassOpacity === "number" ? Math.max(0, Math.min(1, layer.glassOpacity)) : 0.25;

  // 1. Draw subtle base fill to cast outer shadow (if enabled)
  ctx.beginPath();
  buildShapePath(ctx, shape, rx, ry, layerW, layerH, layer.borderRadius, h);
  if (layer.shadowEnabled) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.01)";
    ctx.fill();
  }

  // Turn off shadow for inner blur & tint so it doesn't bleed inside
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // 2. Perform live background blur if NOT lightweight
  if (!isLightweight && blurPx > 0 && ctx.canvas && w > 0 && h > 0) {
    const t0 = performance.now();
    const pad = Math.ceil(blurPx * 1.5);
    const layerLeft = cx - layerW / 2;
    const layerTop = cy - layerH / 2;
    const srcX = Math.max(0, Math.floor(layerLeft - pad));
    const srcY = Math.max(0, Math.floor(layerTop - pad));
    const srcRight = Math.min(w, Math.ceil(layerLeft + layerW + pad));
    const srcBottom = Math.min(h, Math.ceil(layerTop + layerH + pad));
    const srcW = Math.max(1, srcRight - srcX);
    const srcH = Math.max(1, srcBottom - srcY);

    const offCanvas = getGlassOffscreenBuffer(srcW, srcH);
    if (offCanvas) {
      try {
        const offCtx = offCanvas.getContext("2d");
        offCtx.clearRect(0, 0, srcW, srcH);
        offCtx.drawImage(ctx.canvas, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

        ctx.save();
        ctx.beginPath();
        buildShapePath(ctx, shape, rx, ry, layerW, layerH, layer.borderRadius, h);
        ctx.clip();

        const prevFilter = ctx.filter;
        try {
          ctx.filter = `blur(${blurPx}px)`;
          ctx.drawImage(offCanvas, srcX - cx, srcY - cy, srcW, srcH);
        } catch (e) {
          // ignore filter error
        } finally {
          ctx.filter = prevFilter || "none";
        }
        ctx.restore();

        const cost = performance.now() - t0;
        _glassBenchmarkData.lastCostMs = cost;
        _glassBenchmarkData.totalFrames++;
        _glassBenchmarkData.totalCostMs += cost;
        _glassBenchmarkData.avgCostMs = _glassBenchmarkData.totalCostMs / _glassBenchmarkData.totalFrames;
        _glassBenchmarkData.bufferDims = { w: srcW, h: srcH };
        _glassBenchmarkData.activePanels++;
      } catch (err) {
        // fallback gracefully
      }
    }
  } else {
    _glassBenchmarkData.lightweightCount++;
  }

  // 3. Composite translucent glass tint + subtle gradient
  ctx.save();
  ctx.beginPath();
  buildShapePath(ctx, shape, rx, ry, layerW, layerH, layer.borderRadius, h);
  ctx.clip();

  const tintGrad = ctx.createLinearGradient(rx, ry, rx + layerW, ry + layerH);
  const alphaHigh = Math.min(1, opacity + 0.08);
  const alphaLow = Math.max(0, opacity - 0.05);
  tintGrad.addColorStop(0, getGlassTintRgba(tint, alphaHigh));
  tintGrad.addColorStop(1, getGlassTintRgba(tint, alphaLow));
  ctx.fillStyle = tintGrad;
  ctx.fill();

  // 4. Entrance specular sweep (if active)
  const sweep = animOffset.sweepProgress;
  const wantsSweep = layer.sweepHighlight || (typeof sweep === "number");
  if (wantsSweep && typeof sweep === "number" && sweep >= 0 && sweep <= 1) {
    drawSpecularHighlightSweep(ctx, rx, ry, layerW, layerH, sweep);
  }

  ctx.restore();

  // 5. Crisp glass border (preserves 0 border width)
  const sw = typeof layer.strokeWidth === "number" ? layer.strokeWidth : 1;
  if (sw > 0 && layer.stroke && layer.stroke !== "transparent") {
    ctx.beginPath();
    buildShapePath(ctx, shape, rx, ry, layerW, layerH, layer.borderRadius, h);
    ctx.strokeStyle = layer.stroke;
    ctx.lineWidth = Math.max(1, Math.round(sw * (h / 720)));
    ctx.stroke();
  } else if (sw > 0 && layer.strokeWidth === undefined) {
    ctx.beginPath();
    buildShapePath(ctx, shape, rx, ry, layerW, layerH, layer.borderRadius, h);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = Math.max(1, Math.round(1 * (h / 720)));
    ctx.stroke();
  }
}

export function drawDesignStudioLayer(ctx, layer, w, h, animOffset = { x: 0, y: 0, alpha: 1, wipeProgress: 1 }) {
  if (!layer || layer.visible === false) return;
  const xPct = typeof layer.x === "number" ? layer.x : 50;
  const yPct = typeof layer.y === "number" ? layer.y : 80;
  const wPct = typeof layer.width === "number" ? layer.width : (layer.style?.width || 35);
  const opacity = typeof layer.opacity === "number" ? layer.opacity : (layer.style?.opacity ?? 1);
  const rotation = (typeof layer.rotation === "number" ? layer.rotation : 0) * (Math.PI / 180);

  const cx = (w * xPct) / 100 + (animOffset.x || 0);
  const cy = (h * yPct) / 100 + (animOffset.y || 0);
  const layerW = (w * wPct) / 100;
  const totalAlpha = Math.max(0, Math.min(1, opacity * (animOffset.alpha ?? 1)));
  if (totalAlpha <= 0) return;

  let hPct = typeof layer.height === "number" ? layer.height : null;
  if (hPct === null) {
    if (layer.type === "image") {
      const imgAspect = layer.aspectRatio || 1.777778;
      hPct = (wPct * (w / h)) / imgAspect;
    } else if (layer.type === "shape") {
      hPct = layer.shape === "line" ? 2 : layer.shape === "arrow" ? 6 : 12;
    } else if (layer.type === "text") {
      hPct = 6;
    } else {
      hPct = 12;
    }
  }
  const layerH = (h * hPct) / 100;

  ctx.save();
  ctx.globalAlpha = totalAlpha;
  ctx.translate(cx, cy);
  if (rotation !== 0) ctx.rotate(rotation);
  if (typeof animOffset.scale === "number" && animOffset.scale !== 1) {
    ctx.scale(animOffset.scale, animOffset.scale);
  }

  if (animOffset.wipeProgress !== undefined && animOffset.wipeProgress < 1) {
    ctx.beginPath();
    ctx.rect(-layerW / 2, -layerH / 2, layerW * Math.max(0, animOffset.wipeProgress), layerH);
    ctx.clip();
  }

  if (layer.type === "image") {
    const src = layer.content || layer.url || layer.filePath;
    const frameShape = layer.frameShape && layer.frameShape !== "none"
      ? layer.frameShape
      : (layer.mask === "circle" ? "circle" : layer.mask === "diamond" ? "diamond" : "rectangle");
    const rx = -layerW / 2;
    const ry = -layerH / 2;

    let img = src ? _designLayerImageCache.get(src) : null;
    if (src && !img) {
      img = new Image();
      img.onload = () => { if (_onImageLoadCallback) _onImageLoadCallback(); };
      img.onerror = () => { console.warn("[DesignLayer] Image failed to load:", src); };
      img.src = src;
      _designLayerImageCache.set(src, img);
    }

    ctx.beginPath();
    buildShapePath(ctx, frameShape, rx, ry, layerW, layerH, layer.borderRadius, h);

    if (img && img.complete && img.naturalWidth > 0) {
      ctx.save();
      ctx.clip();

      const crop = layer.frameCrop || { fitMode: "fill", zoom: 1, panX: 0, panY: 0 };
      const fitMode = crop.fitMode === "fit" ? "fit" : "fill";
      const zoom = typeof crop.zoom === "number" && crop.zoom >= 1 ? crop.zoom : 1;
      const panX = typeof crop.panX === "number" ? crop.panX : 0;
      const panY = typeof crop.panY === "number" ? crop.panY : 0;

      const metrics = calculateCropMetrics({
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        containerWidth: layerW,
        containerHeight: layerH,
        fitMode,
        zoom,
        panX,
        panY,
      });

      const drawX = rx + metrics.drawX;
      const drawY = ry + metrics.drawY;

      ctx.drawImage(img, drawX, drawY, metrics.drawW, metrics.drawH);
      ctx.restore();
    } else {
      // Draw clean neutral placeholder avatar
      ctx.save();
      ctx.clip();
      ctx.fillStyle = "#1f242d";
      ctx.fillRect(rx, ry, layerW, layerH);
      ctx.fillStyle = "#64748b";
      // Head
      ctx.beginPath();
      const headR = Math.min(layerW, layerH) * 0.22;
      ctx.arc(0, ry + layerH * 0.38, headR, 0, Math.PI * 2);
      ctx.fill();
      // Shoulders
      ctx.beginPath();
      const shoulderTop = ry + layerH * 0.58;
      ctx.moveTo(rx + layerW * 0.18, ry + layerH * 0.96);
      ctx.bezierCurveTo(rx + layerW * 0.22, shoulderTop, -layerW * 0.15, shoulderTop, 0, shoulderTop);
      ctx.bezierCurveTo(layerW * 0.15, shoulderTop, rx + layerW * 0.78, shoulderTop, rx + layerW * 0.82, ry + layerH * 0.96);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    const sw = typeof layer.strokeWidth === "number" ? layer.strokeWidth : 0;
    if (sw > 0 && layer.stroke && layer.stroke !== "transparent") {
      ctx.beginPath();
      buildShapePath(ctx, frameShape, rx, ry, layerW, layerH, layer.borderRadius, h);
      ctx.strokeStyle = layer.stroke;
      ctx.lineWidth = Math.max(1, Math.round(sw * (h / 720)));
      ctx.stroke();
    }
  } else if (layer.type === "shape") {
    const hPct = typeof layer.height === "number" ? layer.height : 12;
    const layerH = (h * hPct) / 100;
    const rx = -layerW / 2;
    const ry = -layerH / 2;

    if (layer.shadowEnabled) {
      const scale = h / 720;
      ctx.shadowColor = getShadowRgba(layer.shadowColor, layer.shadowOpacity);
      ctx.shadowBlur = Math.round((typeof layer.shadowBlur === "number" ? layer.shadowBlur : 10) * scale);
      ctx.shadowOffsetX = Math.round((typeof layer.shadowOffsetX === "number" ? layer.shadowOffsetX : 0) * scale);
      ctx.shadowOffsetY = Math.round((typeof layer.shadowOffsetY === "number" ? layer.shadowOffsetY : 4) * scale);
    } else {
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }

    const shape = layer.shape || "rounded-rect";
    const isLine = shape === "line";
    const isArrow = shape === "arrow";
    const isBracket = shape === "bracket-left" || shape === "bracket-right";
    const isLineOrArrow = isLine || isArrow || isBracket;

    if (!isLineOrArrow && layer.fillType === "glass") {
      const hasMaskImg = Boolean(layer.maskImage?.url);
      const isBackdropTarget = layer.glassTarget === "backdrop";

      if (hasMaskImg && !isBackdropTarget) {
        // IMAGE GLASS: Apply blur, glass tint, and specular highlights directly to the clipped image within the mask!
        const mSrc = layer.maskImage.url;
        let mImg = _designLayerImageCache.get(mSrc);
        if (mSrc && !mImg) {
          mImg = new Image();
          mImg.onload = () => { if (_onImageLoadCallback) _onImageLoadCallback(); };
          mImg.onerror = () => { console.warn("[DesignLayer] Mask image failed to load:", mSrc); };
          mImg.src = mSrc;
          _designLayerImageCache.set(mSrc, mImg);
        }

        ctx.save();
        ctx.beginPath();
        buildShapePath(ctx, shape, rx, ry, layerW, layerH, layer.borderRadius, h, layer.customPath);
        ctx.clip();

        // 1. Draw outer shadow or subtle backing
        if (layer.shadowEnabled) {
          ctx.fillStyle = "rgba(0, 0, 0, 0.01)";
          ctx.fill();
        }

        // 2. Draw blurred image
        if (mImg && mImg.complete && mImg.naturalWidth > 0) {
          const mCrop = layer.maskImage.frameCrop || layer.maskImage;
          const mFit = mCrop.fitMode || layer.maskImage.fitMode || "fill";
          const mZoom = typeof mCrop.zoom === "number" ? mCrop.zoom : (typeof layer.maskImage.zoom === "number" ? layer.maskImage.zoom : 1);
          const mPanX = typeof mCrop.panX === "number" ? mCrop.panX : (typeof layer.maskImage.panX === "number" ? layer.maskImage.panX : 0);
          const mPanY = typeof mCrop.panY === "number" ? mCrop.panY : (typeof layer.maskImage.panY === "number" ? layer.maskImage.panY : 0);
          const mRot = typeof mCrop.rotation === "number" ? mCrop.rotation : (typeof layer.maskImage.rotation === "number" ? layer.maskImage.rotation : 0);

          const metrics = calculateCropMetrics({
            containerWidth: layerW,
            containerHeight: layerH,
            naturalWidth: mImg.naturalWidth,
            naturalHeight: mImg.naturalHeight,
            fitMode: mFit,
            zoom: mZoom,
            panX: mPanX,
            panY: mPanY,
          });

          const blurPx = typeof layer.backgroundBlur === "number" ? layer.backgroundBlur : 16;
          const prevFilter = ctx.filter;
          if (blurPx > 0) {
            try {
              ctx.filter = `blur(${Math.round(blurPx * (h / 720))}px)`;
            } catch (_) {}
          }

          if (mRot) {
            const imgCenterX = rx + metrics.drawX + metrics.drawW / 2;
            const imgCenterY = ry + metrics.drawY + metrics.drawH / 2;
            ctx.save();
            ctx.translate(imgCenterX, imgCenterY);
            ctx.rotate((mRot * Math.PI) / 180);
            ctx.drawImage(mImg, -metrics.drawW / 2, -metrics.drawH / 2, metrics.drawW, metrics.drawH);
            ctx.restore();
          } else {
            ctx.drawImage(mImg, rx + metrics.drawX, ry + metrics.drawY, metrics.drawW, metrics.drawH);
          }
          ctx.filter = prevFilter || "none";
        }

        // 3. Glass tint gradient overlay
        const tint = layer.glassTint || "#ffffff";
        const opacity = typeof layer.glassOpacity === "number" ? Math.max(0, Math.min(1, layer.glassOpacity)) : 0.25;
        const tintGrad = ctx.createLinearGradient(rx, ry, rx + layerW, ry + layerH);
        tintGrad.addColorStop(0, getGlassTintRgba(tint, Math.min(1, opacity + 0.1)));
        tintGrad.addColorStop(1, getGlassTintRgba(tint, Math.max(0, opacity - 0.05)));
        ctx.fillStyle = tintGrad;
        ctx.fill();

        // 4. Specular sweep highlight if enabled
        if (layer.sweepHighlight) {
          drawSpecularHighlightSweep(ctx, rx, ry, layerW, layerH, animOffset.sweepProgress ?? 0.5);
        }
        ctx.restore();

        // 5. Crisp border
        const sw = typeof layer.strokeWidth === "number" ? layer.strokeWidth : 1;
        if (sw > 0 && layer.stroke && layer.stroke !== "transparent") {
          ctx.beginPath();
          buildShapePath(ctx, shape, rx, ry, layerW, layerH, layer.borderRadius, h, layer.customPath);
          ctx.strokeStyle = layer.stroke;
          ctx.lineWidth = Math.max(1, Math.round(sw * (h / 720)));
          ctx.stroke();
        }
      } else {
        // BACKDROP GLASS: Frost the live program background underneath the shape
        renderGlassPanelBackgroundBlur(ctx, layer, shape, rx, ry, layerW, layerH, cx, cy, w, h, animOffset);

        if (hasMaskImg) {
          const mSrc = layer.maskImage.url;
          let mImg = _designLayerImageCache.get(mSrc);
          if (mSrc && !mImg) {
            mImg = new Image();
            mImg.onload = () => { if (_onImageLoadCallback) _onImageLoadCallback(); };
            mImg.onerror = () => { console.warn("[DesignLayer] Mask image failed to load:", mSrc); };
            mImg.src = mSrc;
            _designLayerImageCache.set(mSrc, mImg);
          }

          if (mImg && mImg.complete && mImg.naturalWidth > 0) {
            ctx.save();
            ctx.beginPath();
            buildShapePath(ctx, shape, rx, ry, layerW, layerH, layer.borderRadius, h, layer.customPath);
            ctx.clip();

            const mCrop = layer.maskImage.frameCrop || layer.maskImage;
            const mFit = mCrop.fitMode || layer.maskImage.fitMode || "fill";
            const mZoom = typeof mCrop.zoom === "number" ? mCrop.zoom : (typeof layer.maskImage.zoom === "number" ? layer.maskImage.zoom : 1);
            const mPanX = typeof mCrop.panX === "number" ? mCrop.panX : (typeof layer.maskImage.panX === "number" ? layer.maskImage.panX : 0);
            const mPanY = typeof mCrop.panY === "number" ? mCrop.panY : (typeof layer.maskImage.panY === "number" ? layer.maskImage.panY : 0);
            const mRot = typeof mCrop.rotation === "number" ? mCrop.rotation : (typeof layer.maskImage.rotation === "number" ? layer.maskImage.rotation : 0);

            const metrics = calculateCropMetrics({
              containerWidth: layerW,
              containerHeight: layerH,
              naturalWidth: mImg.naturalWidth,
              naturalHeight: mImg.naturalHeight,
              fitMode: mFit,
              zoom: mZoom,
              panX: mPanX,
              panY: mPanY,
            });

            // Translucent image blending so the frosted background shines through
            const imgAlpha = typeof layer.maskImage.opacity === "number" ? layer.maskImage.opacity : 0.7;
            ctx.globalAlpha = imgAlpha * (layer.opacity ?? 1);

            if (mRot) {
              const imgCenterX = rx + metrics.drawX + metrics.drawW / 2;
              const imgCenterY = ry + metrics.drawY + metrics.drawH / 2;
              ctx.save();
              ctx.translate(imgCenterX, imgCenterY);
              ctx.rotate((mRot * Math.PI) / 180);
              ctx.drawImage(mImg, -metrics.drawW / 2, -metrics.drawH / 2, metrics.drawW, metrics.drawH);
              ctx.restore();
            } else {
              ctx.drawImage(mImg, rx + metrics.drawX, ry + metrics.drawY, metrics.drawW, metrics.drawH);
            }
            ctx.restore();
          }
        }
      }
    } else {
      ctx.beginPath();
      buildShapePath(ctx, shape, rx, ry, layerW, layerH, layer.borderRadius, h, layer.customPath);

      if (!isLineOrArrow) {
        if (layer.fillType === "linear-gradient" || layer.fillType === "radial-gradient" || layer.gradient) {
          const grad = createCanvasGradient(ctx, layer.fillType, layer.gradient, rx, ry, layerW, layerH);
          if (grad) {
            ctx.fillStyle = grad;
            ctx.fill();
          } else if (layer.fill && layer.fill !== "transparent") {
            ctx.fillStyle = layer.fill;
            ctx.fill();
          }
        } else if (layer.fill && layer.fill !== "transparent") {
          ctx.fillStyle = layer.fill;
          ctx.fill();
        }

        // Shape-based clipping mask image rendering
        if (layer.maskImage && layer.maskImage.url) {
          const mSrc = layer.maskImage.url;
          let mImg = _designLayerImageCache.get(mSrc);
          if (mSrc && !mImg) {
            mImg = new Image();
            mImg.onload = () => { if (_onImageLoadCallback) _onImageLoadCallback(); };
            mImg.onerror = () => { console.warn("[DesignLayer] Mask image failed to load:", mSrc); };
            mImg.src = mSrc;
            _designLayerImageCache.set(mSrc, mImg);
          }

          if (mImg && mImg.complete && mImg.naturalWidth > 0) {
            ctx.save();
            ctx.beginPath();
            buildShapePath(ctx, shape, rx, ry, layerW, layerH, layer.borderRadius, h, layer.customPath);
            ctx.clip();

            const mCrop = layer.maskImage.frameCrop || layer.maskImage;
            const mFit = mCrop.fitMode || layer.maskImage.fitMode || "fill";
            const mZoom = typeof mCrop.zoom === "number" ? mCrop.zoom : (typeof layer.maskImage.zoom === "number" ? layer.maskImage.zoom : 1);
            const mPanX = typeof mCrop.panX === "number" ? mCrop.panX : (typeof layer.maskImage.panX === "number" ? layer.maskImage.panX : 0);
            const mPanY = typeof mCrop.panY === "number" ? mCrop.panY : (typeof layer.maskImage.panY === "number" ? layer.maskImage.panY : 0);
            const mRot = typeof mCrop.rotation === "number" ? mCrop.rotation : (typeof layer.maskImage.rotation === "number" ? layer.maskImage.rotation : 0);

            const metrics = calculateCropMetrics({
              containerWidth: layerW,
              containerHeight: layerH,
              naturalWidth: mImg.naturalWidth,
              naturalHeight: mImg.naturalHeight,
              fitMode: mFit,
              zoom: mZoom,
              panX: mPanX,
              panY: mPanY,
            });

            if (mRot) {
              const imgCenterX = rx + metrics.drawX + metrics.drawW / 2;
              const imgCenterY = ry + metrics.drawY + metrics.drawH / 2;
              ctx.save();
              ctx.translate(imgCenterX, imgCenterY);
              ctx.rotate((mRot * Math.PI) / 180);
              ctx.drawImage(mImg, -metrics.drawW / 2, -metrics.drawH / 2, metrics.drawW, metrics.drawH);
              ctx.restore();
            } else {
              ctx.drawImage(mImg, rx + metrics.drawX, ry + metrics.drawY, metrics.drawW, metrics.drawH);
            }
            ctx.restore();
          }
        }
      }

      const sw = typeof layer.strokeWidth === "number" ? layer.strokeWidth : (isLineOrArrow ? 3 : 2);
      if (sw > 0 && layer.stroke && layer.stroke !== "transparent") {
        ctx.beginPath();
        buildShapePath(ctx, shape, rx, ry, layerW, layerH, layer.borderRadius, h, layer.customPath);
        ctx.strokeStyle = layer.stroke;
        ctx.lineWidth = Math.max(1, Math.round(sw * (h / 720)));
        if (shape === "arrow") {
          ctx.fillStyle = layer.stroke;
          ctx.fill();
        }
        ctx.stroke();
      }
    }
  } else if (layer.type === "text" && layer.text) {
    const text = layer.textTransform === "uppercase" ? layer.text.toUpperCase() : layer.text;
    const baseFontSize = Math.round((layer.fontSize || 22) * (h / 720));
    const minFontSize = Math.round((layer.minFontSize || 12) * (h / 720));
    const fontFamily = layer.fontFamily || "Inter, sans-serif";
    const fontWeight = layer.fontWeight || "bold";
    const shouldWrap = layer.wrap !== false;
    const lineSpacing = typeof layer.lineSpacing === "number" ? layer.lineSpacing : 1.25;
    const padPx = Math.round((typeof layer.padding === "number" ? layer.padding : 0) * (h / 720));

    if (layer.shadowEnabled) {
      const scale = h / 720;
      ctx.shadowColor = getShadowRgba(layer.shadowColor, layer.shadowOpacity);
      ctx.shadowBlur = Math.round((typeof layer.shadowBlur === "number" ? layer.shadowBlur : 10) * scale);
      ctx.shadowOffsetX = Math.round((typeof layer.shadowOffsetX === "number" ? layer.shadowOffsetX : 0) * scale);
      ctx.shadowOffsetY = Math.round((typeof layer.shadowOffsetY === "number" ? layer.shadowOffsetY : 4) * scale);
    } else {
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }

    ctx.fillStyle = layer.color || "#ffffff";
    ctx.textAlign = layer.textAlign || "left";
    ctx.textBaseline = "middle";

    const innerW = Math.max(1, layerW - padPx * 2);
    const innerH = Math.max(1, layerH - padPx * 2);

    let tx = 0;
    if (layer.textAlign === "left") tx = -innerW / 2;
    else if (layer.textAlign === "right") tx = innerW / 2;

    const maxW = innerW > 0 ? innerW : 9999;
    const maxH = innerH > 0 ? innerH : 9999;

    const breakTextIntoLines = (fs) => {
      ctx.font = `${fontWeight} ${fs}px ${fontFamily}`;
      const lines = [];
      const rawLines = String(text).split("\n");
      for (const rawLine of rawLines) {
        if (!shouldWrap || maxW <= 0) {
          lines.push(rawLine);
          continue;
        }
        const words = rawLine.split(" ");
        if (words.length <= 1) {
          lines.push(rawLine);
        } else {
          let currentLine = words[0];
          for (let wIdx = 1; wIdx < words.length; wIdx++) {
            const testLine = currentLine + " " + words[wIdx];
            if (ctx.measureText(testLine).width > maxW) {
              lines.push(currentLine);
              currentLine = words[wIdx];
            } else {
              currentLine = testLine;
            }
          }
          lines.push(currentLine);
        }
      }
      return lines;
    };

    let effectiveFontSize = baseFontSize;
    let allLines = breakTextIntoLines(effectiveFontSize);

    // Auto-fit: step font size down toward minFontSize until text fits the box height
    if (layer.autoFit !== false && layerH > 0 && allLines.length * (effectiveFontSize * lineSpacing) > maxH) {
      while (effectiveFontSize > minFontSize) {
        effectiveFontSize = Math.max(minFontSize, effectiveFontSize - 1);
        allLines = breakTextIntoLines(effectiveFontSize);
        if (allLines.length * (effectiveFontSize * lineSpacing) <= maxH) {
          break;
        }
      }
    }

    const lineHeight = effectiveFontSize * lineSpacing;
    const linesPerPage = Math.max(1, Math.floor(maxH / lineHeight));

    // Pagination: split allLines into pages; render the current page only
    // ctrl.currentPage is passed via the animOffset or layer directly (default 0)
    const currentPage = typeof layer._currentPage === "number" ? layer._currentPage : 0;
    const totalPages = Math.ceil(allLines.length / linesPerPage);
    const pageStart = currentPage * linesPerPage;
    const renderLines = allLines.slice(pageStart, pageStart + linesPerPage);

    // Vertical alignment within the text box
    const totalTextH = renderLines.length * lineHeight;
    let baselineY;
    const vertAlign = layer.verticalAlign || "top";
    if (vertAlign === "middle") {
      baselineY = -totalTextH / 2 + lineHeight / 2;
    } else if (vertAlign === "bottom") {
      baselineY = innerH / 2 - totalTextH + lineHeight / 2;
    } else {
      // top
      baselineY = -innerH / 2 + lineHeight / 2;
    }

    ctx.font = `${fontWeight} ${effectiveFontSize}px ${fontFamily}`;
    // Clip to the text box bounds to prevent overflow leaking beyond the layer
    if (padPx > 0 || (layerW > 0 && layerH > 0)) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(-layerW / 2, -layerH / 2, layerW, layerH);
      ctx.clip();
    }
    renderLines.forEach((line, i) => {
      ctx.fillText(line, tx, baselineY + i * lineHeight);
    });
    if (padPx > 0 || (layerW > 0 && layerH > 0)) {
      ctx.restore();
    }

    // Expose pagination metadata on the layer for operator UI (read-only annotation)
    if (totalPages > 1) {
      layer._totalPages = totalPages;
      layer._currentPage = currentPage;
    } else {
      delete layer._totalPages;
      delete layer._currentPage;
    }
  }

  // Reset canvas shadow state between layers so shadows never leak
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  ctx.restore();
}

/**
 * SwitcherProgramCanvas
 *
 * Renders the high-resolution program output stream and animated transitions.
 * - Hardware-accelerated continuous video when WebRTC `stream` is present (30-60 FPS)
 * - Canvas-driven transition compositing (Cut, Fade, Wipe) using TransitionEngine
 * - Fallback to high-res program frame channel and preview frames
 * - Broadcast overlays & scaling engine (Logo, Speaker Lower Thirds, Bible Auto-Trigger, Ticker)
 * - Universal 12px border radius
 */
export default function SwitcherProgramCanvas({
  programSourceId,
  programSourceName,
  previewSourceId,
  previewSourceName,
  stream,
  cameraStreams,
  activeTransition: externalTransition,
  mixProgress = null,
  transitionSetting,
  isSharingActive = false,
  isMirrored = false,
  broadcastConfig,
  isBroadcastActive = false, // true when streaming or recording — triggers continuous 30fps frame push
  isStreamingActive = false,
  isRecordingActive = false,
  outputWidth = 1280,
  outputHeight = 720,
}) {
  const isDirtyRef = useRef(true);
  const broadcastConfigRef = useRef(broadcastConfig);
  const prevBroadcastConfigRef = useRef(broadcastConfig);
  const lastOverlaySigRef = useRef("");
  if (prevBroadcastConfigRef.current !== broadcastConfig) {
    prevBroadcastConfigRef.current = broadcastConfig;
    broadcastConfigRef.current = broadcastConfig;
    isDirtyRef.current = true;
  }
  useEffect(() => {
    broadcastConfigRef.current = broadcastConfig;
    isDirtyRef.current = true;
  }, [broadcastConfig]);

  // Register image-load callback so async texture loads immediately trigger a redraw
  useEffect(() => {
    setImageLoadCallback(() => { isDirtyRef.current = true; });
    return () => { setImageLoadCallback(null); };
  }, []);

  const isStreamingActiveRef = useRef(isStreamingActive);
  useEffect(() => {
    isStreamingActiveRef.current = isStreamingActive;
  }, [isStreamingActive]);

  const isRecordingActiveRef = useRef(isRecordingActive);
  useEffect(() => {
    isRecordingActiveRef.current = isRecordingActive;
  }, [isRecordingActive]);

  const bConfig = broadcastConfig || {
    scale: 1.0,
    fitMode: "cover",
    logo: { enabled: false },
    lowerThird: { enabled: false },
    bibleLowerThird: { enabled: false, isShowing: false },
    ticker: { enabled: false },
  };

  const hasActiveOverlays = Boolean(
    (Array.isArray(bConfig.activeStudioControls) && bConfig.activeStudioControls.some((c) => c && c.status && c.status !== "hidden")) ||
    (Array.isArray(bConfig.layers) && bConfig.layers.length > 0) ||
    bConfig.lowerThird?.enabled ||
    Boolean(bConfig.bibleLowerThird?.enabled && bConfig.bibleLowerThird?.isShowing) ||
    bConfig.ticker?.enabled
  );

  // Prevent duplicate design rendering when General Screen is the active program source
  // AND General Screen already has the design overlay pinned/burnt into its video feed
  const isGeneralSource = programSourceId === "general" || (typeof programSourceName === "string" && programSourceName.toLowerCase().includes("general"));
  const shouldSkipDesignLayers = isGeneralSource && Boolean(bConfig.hasSanctuaryOverlay);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const latestImgRef = useRef(null);
  const lastRenderedBitmapRef = useRef(null);
  const animRef = useRef(null);
  const statsRef = useRef({ fps: 0, frameCount: 0, lastFpsTime: performance.now(), lastFrame: 0 });
  const [hudStats, setHudStats] = useState({ fps: 0, isAlive: false });
  const [hasFrame, setHasFrame] = useState(false);
  const latestEffectRef = useRef(null);
  const [currentEffect, setCurrentEffect] = useState(null);
  const lastSentFrameTimeRef = useRef(0);

  // Active transition state (supports both internal listener and prop)
  const [activeTransition, setActiveTransition] = useState(null);
  const activeTransRef = useRef(null);

  // Offscreen videos for WebRTC stream compositing during transitions
  const outgoingVideoRef = useRef(null);
  const incomingVideoRef = useRef(null);

  useEffect(() => {
    if (externalTransition !== undefined) {
      activeTransRef.current = externalTransition;
      setActiveTransition(externalTransition);
    }
  }, [externalTransition]);

  // Transition listeners
  useEffect(() => {
    let unsubStart = null;
    let unsubComplete = null;

    if (window.electron?.Switcher?.onTransitionStart) {
      unsubStart = window.electron.Switcher.onTransitionStart((trans) => {
        activeTransRef.current = trans;
        setActiveTransition(trans);
      });
    }

    if (window.electron?.Switcher?.onTransitionComplete) {
      unsubComplete = window.electron.Switcher.onTransitionComplete(() => {
        activeTransRef.current = null;
        setActiveTransition(null);
        isDirtyRef.current = true;
      });
    }

    return () => {
      if (unsubStart) unsubStart();
      if (unsubComplete) unsubComplete();
    };
  }, []);

  // Bind WebRTC continuous stream to main <video>
  useEffect(() => {
    if (videoRef.current) {
      if (stream) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
        setHasFrame(true);
        setHudStats({ fps: 30, isAlive: true });
      } else {
        videoRef.current.srcObject = null;
      }
    }
  }, [stream]);

  // Bind outgoing & incoming streams to hidden transition videos
  useEffect(() => {
    const fromId = activeTransition?.fromId || programSourceId;
    const toId = activeTransition?.toId || previewSourceId;
    if (cameraStreams) {
      const fromStream = cameraStreams.get(fromId);
      const toStream = cameraStreams.get(toId);

      if (outgoingVideoRef.current) {
        outgoingVideoRef.current.srcObject = fromStream || null;
        if (fromStream) outgoingVideoRef.current.play().catch(() => {});
      }
      if (incomingVideoRef.current) {
        incomingVideoRef.current.srcObject = toStream || null;
        if (toStream) incomingVideoRef.current.play().catch(() => {});
      }
    }
  }, [activeTransition, programSourceId, previewSourceId, cameraStreams]);

  // Draw graphic overlays directly onto canvas context for shared sanctuary and confidence outputs
  const drawCanvasOverlays = (ctx, w, h, cfg) => {
    if (!ctx || !cfg) return;

    // Prevent duplicate design rendering when General Screen is the active program source
    // AND General Screen already has the design overlay pinned/burnt into its video feed
    const isGeneralSource = programSourceId === "general" || (typeof programSourceName === "string" && programSourceName.toLowerCase().includes("general"));
    const hasSanctuaryOverlay = Boolean(cfg.hasSanctuaryOverlay);
    const shouldSkipDesignLayers = isGeneralSource && hasSanctuaryOverlay;

    // 0. Custom Design Studio Layers (Images, Shapes, Text)
    // Supports both direct studio layers (cfg.layers) and published Live Control tiles (cfg.activeStudioControls)
    if (!shouldSkipDesignLayers) {
      const now = Date.now();
      const renderedLayerIds = new Set();
      _glassBenchmarkData.activePanels = 0;

      // Check if any active studio controls are provided
      const activeControls = Array.isArray(cfg.activeStudioControls)
        ? cfg.activeStudioControls.filter((c) => c && c.status && c.status !== "hidden")
        : [];

      if (activeControls.length > 0) {
        console.log("[drawCanvasOverlays] activeControls count:", activeControls.length, "ids:", activeControls.map(c => `${c.id}:${c.status}`));
        for (const ctrl of activeControls) {
          const layers = Array.isArray(ctrl.snapshotLayers) && ctrl.snapshotLayers.length > 0
            ? ctrl.snapshotLayers
            : (Array.isArray(ctrl.layers) ? ctrl.layers : []);
          if (layers.length === 0) continue;
          const status = ctrl.status || "live";

          // Calculate transition offsets for this control
          const transition = ctrl.transition || { entrance: { type: "fade", duration: 500, easing: "ease-out" }, exit: { type: "fade", duration: 400, easing: "ease-in" } };
          const ctrlOffset = calculateTransitionOffset(status, ctrl.animStartTime || now, now, transition, w, h);

          for (const layer of layers) {
            if (!layer || layer.visible === false) continue;
            // Prevent duplicate layer rendering if referenced by both individual and group controls
            if (renderedLayerIds.has(layer.id)) continue;
            renderedLayerIds.add(layer.id);

            // Check if layer has an explicit transition override
            let animOffset = ctrlOffset;
            const hasLayerEnt = Boolean(layer.transition?.entrance?.type);
            const hasLayerEx = Boolean(layer.transition?.exit?.type);
            if (status !== "live" && (hasLayerEnt || hasLayerEx)) {
              const layerTrans = {
                entrance: { ...(transition.entrance || {}), ...(layer.transition?.entrance || {}) },
                exit: { ...(transition.exit || {}), ...(layer.transition?.exit || {}) },
              };
              animOffset = calculateTransitionOffset(status, ctrl.animStartTime || now, now, layerTrans, w, h);
            }

            try {
              drawDesignStudioLayer(ctx, layer, w, h, animOffset);
            } catch (layerErr) {
              console.error("[SwitcherProgramCanvas] Layer draw error:", layer.id, layerErr);
            }
          }
        }
      } else if (Array.isArray(cfg.layers) && cfg.layers.length > 0) {
        // Direct studio program layers only when no active studio controls are on air
        const studioTrans = cfg.transition || { entrance: { type: "fade", duration: 300 } };
        const studioStatus = cfg.status || "live";
        const studioStartTime = cfg.animStartTime || now;
        for (const layer of cfg.layers) {
          if (!layer || layer.visible === false) continue;
          if (renderedLayerIds.has(layer.id)) continue;
          renderedLayerIds.add(layer.id);

          const animOffset = studioStatus === "live"
            ? { x: 0, y: 0, alpha: 1, wipeProgress: 1 }
            : calculateTransitionOffset(studioStatus, studioStartTime, now, layer.transition || studioTrans, w, h);

          drawDesignStudioLayer(ctx, layer, w, h, animOffset);
        }
      }

      if (_glassBenchmarkData.activePanels === 0) {
        releaseGlassOffscreenBuffers();
      }
    }

    // 1. Watermark Logo
    if (cfg.logo?.enabled) {
      ctx.save();
      ctx.globalAlpha = cfg.logo.opacity || 0.9;
      const size = Math.round((cfg.logo.size || 72) * (w / 1280));
      const pad = 24;
      let lx = w - size - pad;
      let ly = pad;
      if (cfg.logo.position === "top-left") { lx = pad; ly = pad; }
      else if (cfg.logo.position === "bottom-right") { lx = w - size - pad; ly = h - size - pad - 30; }
      else if (cfg.logo.position === "bottom-left") { lx = pad; ly = h - size - pad - 30; }

      ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(lx, ly, size, size * 0.7, 12);
      else ctx.rect(lx, ly, size, size * 0.7);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "#FDE047";
      ctx.font = `bold ${Math.round(size * 0.38)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = cfg.logo.preset === "cross" ? "✝" : cfg.logo.preset === "dove" ? "🕊" : "wave.io";
      ctx.fillText(label, lx + size / 2, ly + size * 0.35);
      ctx.restore();
    }

    // 2. Bible Scripture Lower Third (High Priority Broadcast Graphic)
    // Suppress legacy lower third if a custom Bible role template is currently active in activeStudioControls
    const hasActiveBibleRoleControl = Array.isArray(cfg.activeStudioControls) && cfg.activeStudioControls.some(
      (c) => (c.role === "bible" || c.id === "role_playback_bible" || c.id?.startsWith("role_playback_bible")) && (c.status !== "hidden")
    );
    if (!hasActiveBibleRoleControl && cfg.bibleLowerThird?.enabled && cfg.bibleLowerThird?.isShowing) {
      ctx.save();
      const style = cfg.bibleLowerThird.style || cfg.presentationStyle || {};
      const widthPct = typeof cfg.bibleLowerThird.width === "number" ? cfg.bibleLowerThird.width : 90;
      const xPct = typeof cfg.bibleLowerThird.x === "number" ? cfg.bibleLowerThird.x : 50;
      const yPct = typeof cfg.bibleLowerThird.y === "number" ? cfg.bibleLowerThird.y : 85;

      const bw = Math.round((w * widthPct) / 100);
      const bh = Math.round(92 * (h / 720));
      const bx = Math.round((w * xPct) / 100 - bw / 2);
      const by = Math.round((h * yPct) / 100 - bh / 2);

      const bgColor = style.backgroundColor || style.bg || "rgba(10, 10, 16, 0.95)";
      const textColor = style.textColor || "#FFFFFF";
      const borderColor = style.borderColor || style.accentColor || "rgba(245, 158, 11, 0.6)";
      const labelColor = style.labelColor || style.accentColor || "#FDE047";
      const fontFamily = style.fontFamily || "Outfit, Inter, sans-serif";

      // Shadow
      ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
      ctx.shadowBlur = Math.round(12 * (h / 720));
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = Math.round(4 * (h / 720));

      ctx.fillStyle = bgColor;
      ctx.beginPath();
      const radius = Math.round(12 * (h / 720));
      if (typeof ctx.roundRect === "function") ctx.roundRect(bx, by, bw, bh, radius);
      else ctx.rect(bx, by, bw, bh);
      ctx.fill();

      // Reset shadow for stroke & text
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;

      ctx.strokeStyle = borderColor;
      ctx.lineWidth = Math.max(1, Math.round(2 * (h / 720)));
      ctx.stroke();

      // Header Tag: Reference & Translation
      ctx.fillStyle = labelColor;
      ctx.font = `bold ${Math.round(15 * (h / 720))}px ${fontFamily}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const headerY = by + Math.round(22 * (h / 720));
      const padX = Math.round(20 * (w / 1280));
      ctx.fillText(`📖 ${cfg.bibleLowerThird.currentRef || 'Scripture'} (${cfg.bibleLowerThird.version || 'KJV'})`, bx + padX, headerY);

      // Scripture Body Text
      ctx.fillStyle = textColor;
      ctx.font = `${Math.round(13.5 * (h / 720))}px ${fontFamily}`;
      const maxTextW = bw - padX * 2 - Math.round(40 * (w / 1280));
      const rawBody = `"${cfg.bibleLowerThird.currentText || ''}"`;

      // Word wrapping up to 2 lines
      const words = rawBody.split(" ");
      let line1 = "";
      let line2 = "";
      let line1Filled = false;
      for (const word of words) {
        if (!line1Filled) {
          const test = line1 ? `${line1} ${word}` : word;
          if (ctx.measureText(test).width > maxTextW) {
            line1Filled = true;
            line2 = word;
          } else {
            line1 = test;
          }
        } else {
          const test = line2 ? `${line2} ${word}` : word;
          if (ctx.measureText(test + "...").width > maxTextW) {
            line2 = `${line2}...`;
            break;
          } else {
            line2 = test;
          }
        }
      }

      ctx.fillText(line1, bx + padX, by + Math.round(48 * (h / 720)));
      if (line2) {
        ctx.fillText(line2, bx + padX, by + Math.round(68 * (h / 720)));
      }

      ctx.restore();
    } else if (cfg.lowerThird?.enabled) {
      // 3. Speaker Lower Third (Custom Shapes, Badges, and Sizing)
      ctx.save();
      const lt = cfg.lowerThird;
      const ltStyle = lt.style || DEFAULT_LOWER_THIRD_STYLE;
      const ltWidthPercent = (typeof lt.width === "number" && lt.width > 0) ? lt.width : 36;
      const sw = Math.round(w * (ltWidthPercent / 100));
      const sh = Math.round(68 * (h / 720));
      const anchorX = typeof lt.x === "number" ? lt.x : 22;
      const anchorY = typeof lt.y === "number" ? lt.y : 88;
      const sx = Math.max(16, Math.min(w - sw - 16, Math.round((w * (anchorX / 100)) - (sw / 2))));
      const sy = Math.max(16, Math.min(h - sh - 16, Math.round((h * (anchorY / 100)) - (sh / 2))));

      ctx.globalAlpha = ltStyle.opacity ?? 0.95;

      // Background Gradient
      const grad = ctx.createLinearGradient(sx, sy, sx + sw, sy + sh);
      grad.addColorStop(0, ltStyle.primaryColor || "#581c87");
      grad.addColorStop(1, ltStyle.secondaryColor || "#3b0764");
      ctx.fillStyle = grad;

      ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(sx, sy, sw, sh, 12);
      else ctx.rect(sx, sy, sw, sh);
      ctx.fill();

      ctx.strokeStyle = ltStyle.accentColor || "#a855f7";
      ctx.lineWidth = 2;
      ctx.stroke();

      let textStartX = sx + 16;

      // Draw Badge (Circle, Triangle, Rectangle)
      if (ltStyle.badgeShape && ltStyle.badgeShape !== "none") {
        const bSize = Math.round(34 * (h / 720));
        const bx = sx + 12;
        const by = sy + (sh - bSize) / 2;

        ctx.save();
        if (ltStyle.badgeShape === "circle") {
          ctx.beginPath();
          ctx.arc(bx + bSize / 2, by + bSize / 2, bSize / 2, 0, Math.PI * 2);
          ctx.fillStyle = (ltStyle.accentColor || "#a855f7") + "40";
          ctx.fill();
          ctx.strokeStyle = ltStyle.accentColor || "#a855f7";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else if (ltStyle.badgeShape === "triangle") {
          ctx.beginPath();
          ctx.moveTo(bx + bSize / 2, by);
          ctx.lineTo(bx + bSize, by + bSize);
          ctx.lineTo(bx, by + bSize);
          ctx.closePath();
          ctx.fillStyle = ltStyle.accentColor || "#a855f7";
          ctx.fill();
        } else {
          // Rectangle badge (Universal 12px)
          ctx.beginPath();
          if (typeof ctx.roundRect === "function") ctx.roundRect(bx, by, bSize, bSize, 12);
          else ctx.rect(bx, by, bSize, bSize);
          ctx.fillStyle = (ltStyle.accentColor || "#a855f7") + "40";
          ctx.fill();
          ctx.strokeStyle = ltStyle.accentColor || "#a855f7";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Badge icon symbol
        ctx.fillStyle = "#FFFFFF";
        ctx.font = `bold ${Math.round(14 * (h / 720))}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const iconChar = ltStyle.badgeIcon === "cross" ? "✝" :
                         ltStyle.badgeIcon === "dove" ? "🕊" :
                         ltStyle.badgeIcon === "mic" ? "🎙" :
                         ltStyle.badgeIcon === "star" ? "⭐" :
                         ltStyle.badgeIcon === "bible" ? "📖" : "👤";
        ctx.fillText(iconChar, bx + bSize / 2, by + bSize / 2);
        ctx.restore();

        textStartX = bx + bSize + 14;
      }

      // Slanted Accent Divider
      if (ltStyle.showAccentSlash && ltStyle.shape !== "minimal-bar") {
        ctx.save();
        ctx.fillStyle = ltStyle.accentColor || "#a855f7";
        ctx.beginPath();
        const slashW = 5;
        const slashH = Math.round(sh * 0.65);
        const slashX = textStartX - 6;
        const slashY = sy + (sh - slashH) / 2;
        ctx.moveTo(slashX + 4, slashY);
        ctx.lineTo(slashX + 4 + slashW, slashY);
        ctx.lineTo(slashX, slashY + slashH);
        ctx.lineTo(slashX - slashW, slashY + slashH);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        textStartX += 8;
      }

      // Title
      const titleText = (lt.title || "Speaker");
      const displayTitle = ltStyle.uppercaseTitle ? titleText.toUpperCase() : titleText;
      const fontScale = ltStyle.fontSize === "small" ? 14 : ltStyle.fontSize === "large" ? 20 : 17;
      ctx.fillStyle = ltStyle.textColor || "#FFFFFF";
      ctx.font = `bold ${Math.round(fontScale * (h / 720))}px sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(displayTitle, textStartX, sy + 12);

      // Subtitle
      if (lt.subtitle) {
        ctx.fillStyle = ltStyle.subtitleColor || "rgba(255, 255, 255, 0.75)";
        const subFontScale = ltStyle.fontSize === "small" ? 11 : 13;
        ctx.font = `${Math.round(subFontScale * (h / 720))}px sans-serif`;
        ctx.fillText(lt.subtitle, textStartX, sy + 38);
      }
      ctx.restore();
    }

    // 4. Live Announcement Ticker Banner
    if (cfg.ticker?.enabled && cfg.ticker.text) {
      ctx.save();
      const th = Math.round(32 * (h / 720));
      const ty = h - th;
      ctx.fillStyle = "rgba(15, 23, 42, 0.96)";
      ctx.fillRect(0, ty, w, th);
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      ctx.fillRect(0, ty, w, 1);

      ctx.fillStyle = "#DC2626";
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(8, ty + 4, 52, th - 8, 12);
      else ctx.rect(8, ty + 4, 52, th - 8);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `bold ${Math.round(11 * (h / 720))}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("LIVE", 34, ty + th / 2);

      ctx.fillStyle = "#FFFFFF";
      ctx.font = `600 ${Math.round(13 * (h / 720))}px sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(cfg.ticker.text, 70, ty + th / 2);
      ctx.restore();
    }
  };

  // Helper to emit live composited frame to shared outputs (displays, recorder, broadcast)
  const maybeEmitLiveOutputFrame = (canvas) => {
    if (!canvas) return;
    const now = performance.now();
    if (now - lastSentFrameTimeRef.current < 33) return; // Cap at ~30 FPS
    lastSentFrameTimeRef.current = now;
    try {
      const ctx = canvas.getContext("2d");

      // 1. Shared JPEG dataUrl for local/remote display mirrors
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      if (window.electron?.Switcher?.sendLiveOutputFrame) {
        window.electron.Switcher.sendLiveOutputFrame({
          data: dataUrl,
          effect: latestEffectRef.current,
        });
      }

      // 2. High-performance raw RGBA extraction for Program Recorder & Broadcast Supervisor
      // If either native recorder or native broadcast supervisor is active, deliver raw pixel buffer
      const hasRecorder = isRecordingActiveRef.current && typeof window.electron?.Recorder?.pushVideoFrame === "function";
      const hasBroadcast = isStreamingActiveRef.current && typeof window.electron?.Broadcast?.pushVideoFrame === "function";

      if (hasRecorder || hasBroadcast) {
        const cw = outputWidth || canvas.width || 1280;
        const ch = outputHeight || canvas.height || 720;
        const imgData = ctx.getImageData(0, 0, cw, ch);
        if (imgData && imgData.data) {
          // IMPORTANT: ArrayBuffer.transfer() is destructive — the first receiver
          // neuterates the buffer, making it zero-length for subsequent consumers.
          // We must create independent copies so each IPC send gets its own buffer.
          const frameMeta = { captureTimestamp: Date.now() };
          if (hasRecorder && hasBroadcast) {
            // Two consumers: copy once, slice into two independent ArrayBuffers
            const shared = imgData.data.buffer;
            const recBuf = shared.slice(0);   // independent copy for recorder
            const bcastBuf = shared.slice(0); // independent copy for broadcast
            window.electron.Recorder.pushVideoFrame(recBuf);
            window.electron.Broadcast.pushVideoFrame(bcastBuf, frameMeta);
          } else if (hasRecorder) {
            window.electron.Recorder.pushVideoFrame(imgData.data.buffer);
          } else {
            window.electron.Broadcast.pushVideoFrame(imgData.data.buffer, frameMeta);
          }
        }
      }
    } catch (_) {}
  };

  // Frame buffer & transition render loop
  useEffect(() => {
    const renderLoop = () => {
      try {
        const trans = activeTransRef.current;
        const isManualMixing = mixProgress !== null && mixProgress !== undefined && mixProgress > 0 && mixProgress < 1;

        const currentCfg = broadcastConfigRef.current || {};
        const currentSig = JSON.stringify({
          controls: currentCfg.activeStudioControls?.map((c) => `${c.id}:${c.status}:${c.animStartTime}`),
          layersCount: currentCfg.layers?.length || 0,
          lowerThird: currentCfg.lowerThird?.enabled,
          logo: currentCfg.logo?.enabled,
          bible: currentCfg.bibleLowerThird?.isShowing,
        });
        if (currentSig !== lastOverlaySigRef.current) {
          console.log("[RenderLoop] Overlay signature changed:", lastOverlaySigRef.current, "->", currentSig);
          lastOverlaySigRef.current = currentSig;
          isDirtyRef.current = true;
        }

        if (isManualMixing && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (ctx) {
          let fromSource = outgoingVideoRef.current?.readyState >= 2
            ? outgoingVideoRef.current
            : _programImageCache[programSourceId || "default"];
          let toSource = incomingVideoRef.current?.readyState >= 2
            ? incomingVideoRef.current
            : _programImageCache[previewSourceId || "default"];

          const targetW = outputWidth || 1280;
          const targetH = outputHeight || 720;
          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
          }

          transitionEngine.render(ctx, fromSource, toSource, mixProgress, targetW, targetH, {
            type: transitionSetting?.type || "fade",
            direction: transitionSetting?.direction || "left-to-right",
          });
          drawCanvasOverlays(ctx, canvas.width, canvas.height, broadcastConfigRef.current);
          maybeEmitLiveOutputFrame(canvas);
        }
      } else if (trans && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (ctx) {
          const now = Date.now();
          const progress = Math.min(1, Math.max(0, (now - trans.startTime) / trans.duration));

          // Resolve outgoing source (Video element -> Image cache)
          let fromSource = null;
          if (outgoingVideoRef.current && outgoingVideoRef.current.readyState >= 2) {
            fromSource = outgoingVideoRef.current;
          } else {
            fromSource = _programImageCache[trans.fromId || "default"];
          }

          // Resolve incoming source (Video element -> Image cache)
          let toSource = null;
          if (incomingVideoRef.current && incomingVideoRef.current.readyState >= 2) {
            toSource = incomingVideoRef.current;
          } else {
            toSource = _programImageCache[trans.toId || programSourceId || "default"];
          }

          const targetW = outputWidth || 1280;
          const targetH = outputHeight || 720;
          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
          }

          transitionEngine.render(ctx, fromSource, toSource, progress, targetW, targetH, {
            type: trans.type,
            direction: trans.direction,
          });
          drawCanvasOverlays(ctx, canvas.width, canvas.height, broadcastConfigRef.current);
          maybeEmitLiveOutputFrame(canvas);

          if (progress >= 1) {
            activeTransRef.current = null;
            setActiveTransition(null);
            isDirtyRef.current = true;
          }
        }
      } else if (stream && videoRef.current && videoRef.current.readyState >= 2 && canvasRef.current) {
        // Continuous WebRTC stream playing: copy frame to canvas.
        // Always render to canvas so preview and broadcast receive continuous frames.
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (ctx) {
          const targetW = outputWidth || 1280;
          const targetH = outputHeight || 720;
          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
          }
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          if (isMirrored) {
            ctx.save();
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            ctx.restore();
          } else {
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          }
          drawCanvasOverlays(ctx, canvas.width, canvas.height, broadcastConfigRef.current);
          maybeEmitLiveOutputFrame(canvas);
        }
      } else if (!stream && canvasRef.current) {
        // Static frame path (slides, Bible, presentations).
        // When broadcast is active, emit frames continuously at ~30fps to maintain RTMP cadence.
        const bitmap = lastRenderedBitmapRef.current;
        const img = latestImgRef.current;
        const source = bitmap || img;
        if (source) {
          const w = source.width || source.naturalWidth;
          const h = source.height || source.naturalHeight;
          const currentCfg = broadcastConfigRef.current || {};
          const hasActiveTransitions = Array.isArray(currentCfg.activeStudioControls) &&
            currentCfg.activeStudioControls.some((c) => c && (c.status === "entering" || c.status === "exiting"));
          if (w > 0 && h > 0 && (isDirtyRef.current || isBroadcastActive || hasActiveTransitions)) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d", { alpha: false });
            if (ctx) {
              const targetW = outputWidth || 1280;
              const targetH = outputHeight || 720;
              if (canvas.width !== targetW || canvas.height !== targetH) {
                canvas.width = targetW;
                canvas.height = targetH;
              }
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = "high";
              const eff = latestEffectRef.current;
              if (eff && eff.filter && eff.filter !== "none") {
                ctx.filter = eff.filter;
              } else {
                ctx.filter = "none";
              }
              if (isMirrored) {
                ctx.save();
                ctx.translate(canvas.width, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
                ctx.restore();
              } else {
                ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
              }
              if (eff && eff.overlayColor && eff.overlayColor !== "transparent") {
                ctx.save();
                ctx.filter = "none";
                ctx.fillStyle = eff.overlayColor;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.restore();
              }
              drawCanvasOverlays(ctx, canvas.width, canvas.height, broadcastConfigRef.current);
              maybeEmitLiveOutputFrame(canvas);
              isDirtyRef.current = false;
            }
          }
        } else if (canvasRef.current) {
          // STANDBY BROADCAST SLATE / IDLE SLATE with Overlays:
          // Runs whenever broadcast is active OR when overlays are active OR when dirty
          const hasActiveOverlays = (Array.isArray(currentCfg.activeStudioControls) && currentCfg.activeStudioControls.some((c) => c && c.status && c.status !== "hidden")) ||
            (Array.isArray(currentCfg.layers) && currentCfg.layers.length > 0) ||
            Boolean(currentCfg.lowerThird?.enabled) ||
            Boolean(currentCfg.logo?.enabled);
          const hasActiveTransitions = Array.isArray(currentCfg.activeStudioControls) &&
            currentCfg.activeStudioControls.some((c) => c && (c.status === "entering" || c.status === "exiting"));

          if (isBroadcastActive || hasActiveOverlays || isDirtyRef.current || hasActiveTransitions) {
            console.log("[Canvas Loop] Drawing slate. hasOverlays:", hasActiveOverlays, "isDirty:", isDirtyRef.current, "transitions:", hasActiveTransitions, "controls:", currentCfg.activeStudioControls?.length);
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d", { alpha: false });
            if (ctx) {
              const targetW = outputWidth || 1280;
              const targetH = outputHeight || 720;
              if (canvas.width !== targetW || canvas.height !== targetH) {
                canvas.width = targetW;
                canvas.height = targetH;
              }
              ctx.setTransform(1, 0, 0, 1, 0, 0);
              ctx.globalAlpha = 1;
              ctx.filter = "none";
              ctx.shadowColor = "transparent";
              ctx.shadowBlur = 0;
              ctx.shadowOffsetX = 0;
              ctx.shadowOffsetY = 0;

              // Crisp dark slate
              ctx.fillStyle = "#09090b";
              ctx.fillRect(0, 0, canvas.width, canvas.height);

              // Subtle purple gradient backdrop
              const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
              grad.addColorStop(0, "rgba(147, 51, 234, 0.15)");
              grad.addColorStop(1, "rgba(79, 70, 229, 0.08)");
              ctx.fillStyle = grad;
              ctx.fillRect(0, 0, canvas.width, canvas.height);

              // Standby title & instruction (drawn only when no custom studio controls cover it)
              const hasActiveControls = Array.isArray(currentCfg.activeStudioControls) &&
                currentCfg.activeStudioControls.some((c) => c && c.status && c.status !== "hidden");
              if (!hasActiveControls) {
                ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
                ctx.font = `bold ${Math.round(28 * (targetH / 720))}px system-ui, -apple-system, sans-serif`;
                ctx.textAlign = "center";
                ctx.fillText("WAVE.IO BROADCAST READY", canvas.width / 2, canvas.height / 2 - Math.round(12 * (targetH / 720)));

                ctx.font = `${Math.round(14 * (targetH / 720))}px system-ui, -apple-system, sans-serif`;
                ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
                ctx.fillText("Standby — Select Camera or Slide in Live Switcher", canvas.width / 2, canvas.height / 2 + Math.round(24 * (targetH / 720)));
                ctx.textAlign = "start";
              }

              drawCanvasOverlays(ctx, canvas.width, canvas.height, broadcastConfigRef.current);
              maybeEmitLiveOutputFrame(canvas);
              if (!hasActiveTransitions && !isBroadcastActive) {
                isDirtyRef.current = false;
              }
            }
          }
        }
      }
      } catch (loopErr) {
        console.error("[SwitcherProgramCanvas] renderLoop error:", loopErr);
      } finally {
        animRef.current = requestAnimationFrame(renderLoop);
      }
    };
    animRef.current = requestAnimationFrame(renderLoop);

    const statsInterval = setInterval(() => {
      const now = performance.now();
      const deltaSec = (now - statsRef.current.lastFpsTime) / 1000;
      const fps = deltaSec > 0 ? Math.round(statsRef.current.frameCount / deltaSec) : 0;
      statsRef.current.fps = fps;
      statsRef.current.frameCount = 0;
      statsRef.current.lastFpsTime = now;
      const isAlive = Date.now() - statsRef.current.lastFrame < 4000;
      setHudStats({ fps: isAlive ? fps : 0, isAlive });
      if (!isAlive && !stream && !isTransitioning) {
        setHasFrame(false);
      }
    }, 500);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      clearInterval(statsInterval);
    };
  }, [stream, programSourceId, previewSourceId, mixProgress, transitionSetting, isSharingActive, isBroadcastActive, isStreamingActive, isRecordingActive]);

  // Frame subscribers
  useEffect(() => {
    let isDecoding = false;
    let pendingFrame = null;
    let lastDecodedTimestamp = 0;

    const processNext = async () => {
      if (isDecoding || !pendingFrame) return;
      isDecoding = true;
      const { fromId, src, isProg, timestamp } = pendingFrame;
      pendingFrame = null;

      try {
        if (typeof window.createImageBitmap === "function" && typeof window.fetch === "function") {
          const res = await fetch(src);
          const blob = await res.blob();
          const bitmap = await createImageBitmap(blob);

          _programImageCache[fromId || "default"] = bitmap;
          if (isProg || fromId === programSourceId) {
            if (timestamp && timestamp < lastDecodedTimestamp) {
              bitmap.close();
            } else {
              const old = lastRenderedBitmapRef.current;
              lastRenderedBitmapRef.current = bitmap;
              lastDecodedTimestamp = timestamp || Date.now();
              isDirtyRef.current = true;
              setHasFrame(true);
              if (old && old !== bitmap && typeof old.close === "function") {
                old.close();
              }
            }
          }
        } else {
          await new Promise((resolve) => {
            const nextImg = new Image();
            nextImg.onload = () => {
              _programImageCache[fromId || "default"] = nextImg;
              if (isProg || fromId === programSourceId) {
                latestImgRef.current = nextImg;
                isDirtyRef.current = true;
                setHasFrame(true);
              }
              resolve();
            };
            nextImg.onerror = resolve;
            nextImg.src = src;
          });
        }
      } catch (_) {
        try {
          await new Promise((resolve) => {
            const nextImg = new Image();
            nextImg.onload = () => {
              _programImageCache[fromId || "default"] = nextImg;
              if (isProg || fromId === programSourceId) {
                latestImgRef.current = nextImg;
                isDirtyRef.current = true;
                setHasFrame(true);
              }
              resolve();
            };
            nextImg.onerror = resolve;
            nextImg.src = src;
          });
        } catch (__) {}
      } finally {
        isDecoding = false;
        if (pendingFrame) processNext();
      }
    };

    const handleFrame = (fromId, data, isProg, timestamp, effect) => {
      if (!data) return;
      const src = data.startsWith("data:") ? data : `data:image/jpeg;base64,${data}`;
      pendingFrame = { fromId, src, isProg, timestamp: timestamp || Date.now() };
      processNext();

      if (isProg || fromId === programSourceId) {
        if (effect) {
          latestEffectRef.current = effect;
          setCurrentEffect(effect);
        }
        statsRef.current.lastFrame = Date.now();
        statsRef.current.frameCount++;
      }
    };

    let cleanupProgram = null;
    if (window.electron?.Switcher?.onProgramFrame) {
      cleanupProgram = window.electron.Switcher.onProgramFrame((payload) => {
        handleFrame(payload?.fromId || programSourceId, payload?.data || payload?.frame, true, payload?.timestamp, payload?.effect);
      });
    }

    let cleanupFallback = null;
    if (window.electron?.Switcher?.onCameraFrame) {
      cleanupFallback = window.electron.Switcher.onCameraFrame((payload) => {
        handleFrame(payload?.fromId, payload?.data || payload?.frame, payload?.fromId === programSourceId, payload?.timestamp, payload?.effect);
      });
    }

    let cleanupMirror = null;
    if (window.electron?.Switcher?.onDisplayMirrorFrame) {
      cleanupMirror = window.electron.Switcher.onDisplayMirrorFrame((payload) => {
        if (!payload?.data) return;
        const key = payload.destination;
        const isCurrentProgram = ((!programSourceId || programSourceId === "general") && key === "general") ||
          (programSourceId === "speaker" && key === "speaker");

        handleFrame(key || "general", payload.data, isCurrentProgram, payload?.timestamp, payload?.effect);
      });
    }

    return () => {
      if (cleanupProgram) cleanupProgram();
      if (cleanupFallback) cleanupFallback();
      if (cleanupMirror) cleanupMirror();
      if (lastRenderedBitmapRef.current && typeof lastRenderedBitmapRef.current.close === "function") {
        lastRenderedBitmapRef.current.close();
        lastRenderedBitmapRef.current = null;
      }
      if (!stream) setHasFrame(false);
    };
  }, [programSourceId, stream]);

  const isManualMixing = mixProgress !== null && mixProgress !== undefined && mixProgress > 0 && mixProgress < 1;
  const isTransitioning = !!activeTransition || isManualMixing;
  const isGeneralProgram = !programSourceId || programSourceId === "general";

  return (
    <div className="relative w-full overflow-hidden rounded-[12px] bg-black border border-white/10 shadow-2xl" style={{ aspectRatio: "16/9" }}>
      {/* Hidden offscreen videos for WebRTC stream transition compositing */}
      <video ref={outgoingVideoRef} autoPlay playsInline muted style={{ display: "none" }} />
      <video ref={incomingVideoRef} autoPlay playsInline muted style={{ display: "none" }} />

      {/* Tally border */}
      <div className={`absolute inset-0 rounded-[12px] ring-2 transition-colors duration-150 pointer-events-none z-10 ${
        isTransitioning ? "ring-amber-500/80 animate-pulse" : "ring-red-500/60"
      }`} />

      {/* Scaled Frame Container */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="relative overflow-hidden transition-all duration-300 pointer-events-auto"
          style={{
            width: `${(bConfig.scale || 1.0) * 100}%`,
            height: `${(bConfig.scale || 1.0) * 100}%`,
            borderRadius: bConfig.scale < 1.0 ? "12px" : "0px",
            boxShadow: bConfig.scale < 1.0 ? "0 0 25px rgba(0,0,0,0.8)" : "none",
            border: bConfig.scale < 1.0 ? "1.5px solid rgba(168, 85, 247, 0.5)" : "none",
          }}
        >
          {/* Offscreen video element for WebRTC camera stream decoding */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ display: "none" }}
          />

          {/* Master Program Output Canvas — ALWAYS mounted for continuous composite playout */}
          <canvas
            ref={canvasRef}
            style={{
              transform: isMirrored ? "scaleX(-1) translateZ(0)" : "translateZ(0)",
              filter: currentEffect?.filter && currentEffect.filter !== "none" ? currentEffect.filter : "none",
            }}
            className="w-full h-full object-cover opacity-100"
          />

          {currentEffect?.overlayColor && currentEffect.overlayColor !== "transparent" && (
            <div
              className="absolute inset-0 pointer-events-none z-[5]"
              style={{ backgroundColor: currentEffect.overlayColor }}
            />
          )}
        </div>
      </div>

      {/* ── Interactive Overlays (Operator Controls) ─────────────────────── */}
      {!bConfig.activeStudioControls?.some(c => (c.role === "bible" || c.id === "role_playback_bible" || c.id?.startsWith("role_playback_bible")) && c.status !== "hidden") &&
        bConfig.bibleLowerThird?.enabled && bConfig.bibleLowerThird?.isShowing && (
        <div
          className="absolute z-25 pointer-events-none"
          style={{
            left: `${bConfig.bibleLowerThird.x ?? 50}%`,
            top: `${bConfig.bibleLowerThird.y ?? 85}%`,
            transform: "translate(-50%, -50%)",
            width: `${bConfig.bibleLowerThird.width ?? 90}%`,
            height: "92px",
          }}
        >
          <div className="w-full h-full relative">
            <button
              onClick={() => {
                if (window.electron?.Switcher?.updateBroadcastConfig) {
                  window.electron.Switcher.updateBroadcastConfig({
                    bibleLowerThird: { ...bConfig.bibleLowerThird, isShowing: false },
                  });
                }
              }}
              className="absolute top-2 right-2 pointer-events-auto p-1.5 rounded-[12px] bg-black/60 hover:bg-black/80 border border-white/20 text-white/80 hover:text-white transition-all text-xs shadow-lg"
              title="Dismiss scripture overlay"
            >
              <PiX size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Active Studio Bible Control Operator Dismiss Button */}
      {bConfig.activeStudioControls?.some(c => (c.role === "bible" || c.id === "role_playback_bible" || c.id?.startsWith("role_playback_bible")) && c.status !== "hidden") && (
        <div className="absolute bottom-4 right-4 z-30 pointer-events-auto">
          <button
            onClick={() => {
              if (window.electron?.Presentation?.setContent) {
                window.electron.Presentation.setContent(null);
              }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[12px] bg-black/70 hover:bg-black/90 border border-white/20 text-white/90 hover:text-white transition-all text-xs font-semibold shadow-lg backdrop-blur-md"
            title="Dismiss scripture lower third"
          >
            <PiX size={13} />
            <span>Dismiss Bible</span>
          </button>
        </div>
      )}

      {/* Overlaid HUD */}
      {(isTransitioning || hasFrame || stream) && (
        <>
          <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10">
            <div className={`text-white text-[10px] font-bold px-2 py-0.5 rounded-[12px] flex items-center gap-1.5 shadow-md ${
              isManualMixing ? "bg-amber-600/90" : isTransitioning ? "bg-amber-600/85" : "bg-red-600/85"
            }`}>
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              {isManualMixing ? `T-BAR: ${Math.round(mixProgress * 100)}%` : isTransitioning ? "TRANSITION" : "LIVE OUTPUT"}
            </div>
            {isMirrored && (
              <div className="bg-[#8B5CF6]/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-[12px] shadow-sm">
                MIRRORED
              </div>
            )}
            {isManualMixing && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-300 bg-black/60 px-1.5 py-0.5 rounded-[12px] border border-amber-500/30">
                {transitionSetting?.type?.toUpperCase() || "FADE"} ({Math.round(mixProgress * 100)}%)
              </span>
            )}
            {!isManualMixing && isTransitioning && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-300 bg-black/60 px-1.5 py-0.5 rounded-[12px] border border-amber-500/30">
                {activeTransition?.type} ({activeTransition?.duration}ms)
              </span>
            )}
            {bConfig.scale < 1.0 && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-[#8B5CF6] bg-black/60 px-1.5 py-0.5 rounded-[12px] border border-[#8B5CF6]/30">
                {Math.round(bConfig.scale * 100)}% INSET
              </span>
            )}
          </div>
          <div className="absolute top-2.5 right-2.5 bg-black/60 text-white/50 text-[9px] font-mono px-1.5 py-0.5 rounded-[12px] border border-white/10 z-10">
            {isTransitioning ? "Compositing" : stream ? "30 fps HD" : `${hudStats.fps || 30} fps`}
          </div>
          <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-end justify-between z-10">
            <span className="bg-black/60 backdrop-blur-sm text-white/80 text-[10px] font-medium px-2 py-0.5 rounded-[12px] border border-white/10 truncate max-w-[70%]">
              {isManualMixing
                ? `${programSourceName || "Program"} ➔ ${previewSourceName || "Preview"}`
                : (programSourceName || "Live Output")}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

