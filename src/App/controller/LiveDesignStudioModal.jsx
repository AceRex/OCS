import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  PiTelevision,
  PiTextT,
  PiSquare,
  PiCircle,
  PiMinus,
  PiImage,
  PiPlus,
  PiTrash,
  PiCopy,
  PiArrowUp,
  PiArrowDown,
  PiArrowsClockwise,
  PiEye,
  PiEyeSlash,
  PiCheck,
  PiX,
  PiFloppyDisk,
  PiStack,
  PiTextAlignLeft,
  PiTextAlignCenter,
  PiTextAlignRight,
  PiTextB,
  PiArrowCounterClockwise,
  PiArrowClockwise,
  PiCaretDown,
  PiCaretRight,
  PiAlignLeft,
  PiAlignCenterHorizontal,
  PiAlignRight,
  PiAlignTop,
  PiAlignCenterVertical,
  PiAlignBottom,
  PiArrowLineUp,
  PiArrowLineDown,
  PiLock,
  PiLockOpen,
  PiSlidersHorizontal,
  PiBroadcast,
  PiSparkle,
  PiCrop,
  PiPlay,
  PiMagnifyingGlassPlus,
  PiMagnifyingGlassMinus,
  PiLink,
  PiLinkBreak,
  PiIntersect,
  PiHandPalm,
  PiCursor,
} from "react-icons/pi";
import ActionButton from "../components/feedback/ActionButton";
import { calculateCropMetrics } from "./designStudioCrop";
import {
  ROLE_TYPES,
  ROLE_DEFINITIONS,
  validateRoleTemplate,
} from "./designStudioRoles";

const MAX_UNDO_STACK = 30;

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

export function formatLayerShadow(layer) {
  if (!layer || !layer.shadowEnabled) return "none";
  const ox = typeof layer.shadowOffsetX === "number" ? layer.shadowOffsetX : 0;
  const oy = typeof layer.shadowOffsetY === "number" ? layer.shadowOffsetY : 4;
  const blur = typeof layer.shadowBlur === "number" ? layer.shadowBlur : 10;
  const rgba = getShadowRgba(layer.shadowColor, layer.shadowOpacity);
  return `${ox}px ${oy}px ${blur}px ${rgba}`;
}

export function formatGradientCss(gradient) {
  if (!gradient || !Array.isArray(gradient.stops) || gradient.stops.length < 2) return null;
  const stopsStr = gradient.stops
    .map((s) => `${getShadowRgba(s.color, Math.round((s.opacity ?? 1) * 100))} ${s.position}%`)
    .join(", ");
  if (gradient.type === "radial") {
    const cx = gradient.radialCenter?.x ?? 50;
    const cy = gradient.radialCenter?.y ?? 50;
    return `radial-gradient(circle at ${cx}% ${cy}%, ${stopsStr})`;
  }
  const angle = gradient.angle ?? 90;
  return `linear-gradient(${angle}deg, ${stopsStr})`;
}

export function getContainerShapeStyle(shape = "none", borderRadius = 12) {
  if (shape === "circle") {
    return { borderRadius: "50%", overflow: "hidden" };
  }
  if (shape === "rounded_rectangle" || shape === "rounded-rect") {
    const radStr = Array.isArray(borderRadius)
      ? `${borderRadius[0]}px ${borderRadius[1]}px ${borderRadius[2]}px ${borderRadius[3]}px`
      : `${borderRadius ?? 12}px`;
    return { borderRadius: radStr, overflow: "hidden" };
  }
  if (shape === "diamond") {
    return { clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)", overflow: "hidden" };
  }
  if (shape === "triangle") {
    return { clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)", overflow: "hidden" };
  }
  if (shape === "hexagon") {
    return { clipPath: "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)", overflow: "hidden" };
  }
  if (shape === "star") {
    return { clipPath: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)", overflow: "hidden" };
  }
  if (shape === "parallelogram") {
    return { clipPath: "polygon(15% 0%, 100% 0%, 85% 100%, 0% 100%)", overflow: "hidden" };
  }
  return { borderRadius: "0px", overflow: "hidden" };
}

export const GRADIENT_PRESETS = [
  {
    id: "sunset_neon",
    name: "Sunset Neon",
    gradient: {
      type: "linear",
      angle: 90,
      stops: [
        { position: 0, color: "#2e0854", opacity: 1 },
        { position: 30, color: "#c0137f", opacity: 1 },
        { position: 60, color: "#e53935", opacity: 1 },
        { position: 85, color: "#fb8c00", opacity: 1 },
        { position: 100, color: "#fdd835", opacity: 1 },
      ],
    },
  },
  {
    id: "oceanic_cyan",
    name: "Oceanic Cyan",
    gradient: {
      type: "linear",
      angle: 105,
      stops: [
        { position: 0, color: "#09203f", opacity: 1 },
        { position: 50, color: "#537895", opacity: 1 },
        { position: 100, color: "#00f2fe", opacity: 1 },
      ],
    },
  },
  {
    id: "crimson_velvet",
    name: "Crimson Velvet",
    gradient: {
      type: "linear",
      angle: 90,
      stops: [
        { position: 0, color: "#4a0e17", opacity: 1 },
        { position: 50, color: "#b71c1c", opacity: 1 },
        { position: 100, color: "#ff5252", opacity: 1 },
      ],
    },
  },
  {
    id: "emerald_glow",
    name: "Emerald Glow",
    gradient: {
      type: "linear",
      angle: 90,
      stops: [
        { position: 0, color: "#064e3b", opacity: 1 },
        { position: 50, color: "#059669", opacity: 1 },
        { position: 100, color: "#34d399", opacity: 1 },
      ],
    },
  },
  {
    id: "royal_amethyst",
    name: "Royal Amethyst",
    gradient: {
      type: "linear",
      angle: 90,
      stops: [
        { position: 0, color: "#3b0764", opacity: 1 },
        { position: 50, color: "#7c3aed", opacity: 1 },
        { position: 100, color: "#c084fc", opacity: 1 },
      ],
    },
  },
  {
    id: "golden_hour",
    name: "Golden Hour",
    gradient: {
      type: "linear",
      angle: 90,
      stops: [
        { position: 0, color: "#78350f", opacity: 1 },
        { position: 50, color: "#d97706", opacity: 1 },
        { position: 100, color: "#fde047", opacity: 1 },
      ],
    },
  },
];

export const CONTAINER_SHAPES = [
  { id: "none", label: "Square" },
  { id: "rounded_rectangle", label: "12px Rounded" },
  { id: "circle", label: "Circle" },
  { id: "diamond", label: "Diamond" },
  { id: "triangle", label: "Triangle" },
  { id: "hexagon", label: "Hexagon" },
  { id: "star", label: "Star" },
  { id: "parallelogram", label: "Angled" },
];

export function generateThumbnailSvg(layers = []) {
  if (!Array.isArray(layers) || layers.length === 0) {
    return `<svg viewBox="0 76 100 22" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="76" width="100" height="22" fill="#08070e"/><text x="50" y="88" fill="rgba(255,255,255,0.2)" font-size="3" text-anchor="middle" font-family="Inter, sans-serif">No Content</text></svg>`;
  }
  let innerHtml = `<rect x="0" y="76" width="100" height="22" fill="#08070e"/>`;
  innerHtml += `<line x1="4" y1="77" x2="96" y2="77" stroke="rgba(255,255,255,0.04)" stroke-width="0.3" stroke-dasharray="1,1"/>`;
  innerHtml += `<line x1="4" y1="97" x2="96" y2="97" stroke="rgba(255,255,255,0.04)" stroke-width="0.3" stroke-dasharray="1,1"/>`;

  for (const l of layers) {
    if (l.visible === false) continue;
    if (l.type === "shape") {
      const w = l.width || 20;
      const h = l.height || 6;
      const rx = l.x - w / 2;
      const ry = l.y - h / 2;
      const fill = l.fill || "#581c87";
      const stroke = (l.strokeWidth > 0 && l.stroke) ? l.stroke : "none";
      const sw = l.strokeWidth > 0 ? 0.35 : 0;
      if (l.shape === "line") {
        innerHtml += `<line x1="${rx}" y1="${l.y}" x2="${rx + w}" y2="${l.y}" stroke="${stroke !== 'none' ? stroke : '#ffffff'}" stroke-width="${Math.max(0.4, (l.strokeWidth || 1) * 0.25)}"/>`;
      } else if (l.shape === "parallelogram") {
        const skew = Math.min(w * 0.15, 1.4);
        innerHtml += `<polygon points="${rx + skew},${ry} ${rx + w},${ry} ${rx + w - skew},${ry + h} ${rx},${ry + h}" fill="${fill}"/>`;
      } else if (l.shape === "diamond") {
        innerHtml += `<polygon points="${l.x},${ry} ${rx + w},${l.y} ${l.x},${ry + h} ${rx},${l.y}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      } else if (l.shape === "circle" || l.shape === "ellipse") {
        innerHtml += `<ellipse cx="${l.x}" cy="${l.y}" rx="${w / 2}" ry="${h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      } else {
        innerHtml += `<rect x="${rx}" y="${ry}" width="${w}" height="${h}" rx="${l.borderRadius ? 0.8 : 0}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      }
    } else if (l.type === "image") {
      const w = l.width || 6;
      const h = l.height || 10;
      const rx = l.x - w / 2;
      const ry = l.y - h / 2;
      const mask = l.frameShape || l.mask;
      if (mask === "circle") {
        innerHtml += `<circle cx="${l.x}" cy="${l.y}" r="${Math.min(w, h) / 2}" fill="#1f242d" stroke="${l.stroke || '#ffffff'}" stroke-width="0.4"/>`;
        innerHtml += `<circle cx="${l.x}" cy="${l.y - 1}" r="${Math.min(w, h) * 0.22}" fill="#64748b"/>`;
      } else if (mask === "diamond") {
        innerHtml += `<polygon points="${l.x},${ry} ${rx + w},${l.y} ${l.x},${ry + h} ${rx},${l.y}" fill="#1f242d" stroke="${l.stroke || '#ffffff'}" stroke-width="0.4"/>`;
        innerHtml += `<circle cx="${l.x}" cy="${l.y - 0.8}" r="${Math.min(w, h) * 0.2}" fill="#64748b"/>`;
      } else {
        innerHtml += `<rect x="${rx}" y="${ry}" width="${w}" height="${h}" fill="#1f242d" stroke="${l.stroke || '#dc2626'}" stroke-width="0.4" rx="${l.borderRadius ? 0.8 : 0}"/>`;
        innerHtml += `<circle cx="${l.x}" cy="${l.y - 1}" r="${Math.min(w, h) * 0.22}" fill="#64748b"/>`;
      }
    } else if (l.type === "text" && l.text) {
      const isCenter = l.textAlign === "center";
      const tx = isCenter ? l.x : l.x - (l.width || 30) / 2;
      const fs = Math.max(1.5, Math.min(3.2, (l.fontSize || 16) * 0.11));
      const textVal = String(l.textTransform === "uppercase" ? l.text.toUpperCase() : l.text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      innerHtml += `<text x="${tx}" y="${l.y + fs * 0.35}" fill="${l.color || '#ffffff'}" font-size="${fs}" font-weight="${l.fontWeight || 'bold'}" font-family="Inter, sans-serif" text-anchor="${isCenter ? 'middle' : 'start'}">${textVal}</text>`;
    }
  }

  return `<svg viewBox="0 76 100 22" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${innerHtml}</svg>`;
}

export async function removeImageBackgroundLocal(imageSource, onProgress = () => {}, abortSignal = null) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      try {
        if (abortSignal?.aborted) return reject(new Error("Canceled"));
        onProgress(20);
        const canvas = document.createElement("canvas");
        const maxDim = 1200;
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (w > maxDim || h > maxDim) {
          const scale = maxDim / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        onProgress(40);

        if (abortSignal?.aborted) return reject(new Error("Canceled"));

        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        const cornerSamples = [
          [0, 0],
          [w - 1, 0],
          [0, h - 1],
          [w - 1, h - 1],
          [Math.floor(w / 2), 0],
          [0, Math.floor(h / 2)],
          [w - 1, Math.floor(h / 2)],
        ];

        const bgColors = [];
        for (const [cx, cy] of cornerSamples) {
          const idx = (cy * w + cx) * 4;
          bgColors.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2], a: data[idx + 3] });
        }

        const visited = new Uint8Array(w * h);
        const queue = [];

        function colorDist(r1, g1, b1, r2, g2, b2) {
          return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
        }

        const tolerance = 42;
        const feather = 18;

        for (let x = 0; x < w; x++) {
          queue.push(x, 0);
          queue.push(x, h - 1);
          visited[x] = 1;
          visited[(h - 1) * w + x] = 1;
        }
        for (let y = 1; y < h - 1; y++) {
          queue.push(0, y);
          queue.push(w - 1, y);
          visited[y * w] = 1;
          visited[y * w + (w - 1)] = 1;
        }

        let head = 0;
        while (head < queue.length) {
          const qx = queue[head++];
          const qy = queue[head++];
          const pIdx = (qy * w + qx) * 4;
          const pr = data[pIdx];
          const pg = data[pIdx + 1];
          const pb = data[pIdx + 2];

          let isBg = false;
          let minDist = 999;
          for (const bg of bgColors) {
            const d = colorDist(pr, pg, pb, bg.r, bg.g, bg.b);
            if (d < minDist) minDist = d;
            if (d <= tolerance) {
              isBg = true;
              break;
            }
          }

          if (isBg) {
            data[pIdx + 3] = 0;
            const neighbors = [
              [qx + 1, qy],
              [qx - 1, qy],
              [qx, qy + 1],
              [qx, qy - 1],
            ];
            for (const [nx, ny] of neighbors) {
              if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                const nIndex = ny * w + nx;
                if (!visited[nIndex]) {
                  visited[nIndex] = 1;
                  queue.push(nx, ny);
                }
              }
            }
          } else if (minDist <= tolerance + feather) {
            const alphaFactor = (minDist - tolerance) / feather;
            data[pIdx + 3] = Math.round(data[pIdx + 3] * alphaFactor);
          }
        }

        if (abortSignal?.aborted) return reject(new Error("Canceled"));
        onProgress(85);

        ctx.putImageData(imgData, 0, 0);
        onProgress(100);
        const dataUrl = canvas.toDataURL("image/png");
        resolve(dataUrl);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("Failed to load image for background removal"));
    img.src = imageSource;
  });
}

function TemplateThumbnailPreview({ tmpl }) {
  return (
    <svg viewBox="0 76 100 22" preserveAspectRatio="xMidYMid meet" className="w-full h-full select-none pointer-events-none">
      <rect x="0" y="76" width="100" height="22" fill="#08070e" />
      <line x1="4" y1="77" x2="96" y2="77" stroke="rgba(255,255,255,0.04)" strokeWidth="0.3" strokeDasharray="1,1" />
      <line x1="4" y1="97" x2="96" y2="97" stroke="rgba(255,255,255,0.04)" strokeWidth="0.3" strokeDasharray="1,1" />
      {tmpl.layers.map((l, idx) => {
        if (l.type === "shape") {
          const w = l.width || 20;
          const h = l.height || 6;
          const rx = l.x - w / 2;
          const ry = l.y - h / 2;
          if (l.shape === "line") {
            return (
              <line
                key={idx}
                x1={rx}
                y1={l.y}
                x2={rx + w}
                y2={l.y}
                stroke={l.stroke || "#ffffff"}
                strokeWidth={Math.max(0.4, (l.strokeWidth || 1) * 0.25)}
              />
            );
          }
          if (l.shape === "bracket-left") {
            return (
              <polyline
                key={idx}
                points={`${rx + 1},${ry} ${rx},${ry} ${rx},${ry + h} ${rx + 1},${ry + h}`}
                fill="none"
                stroke={l.stroke || "#dc2626"}
                strokeWidth={0.6}
              />
            );
          }
          if (l.shape === "bracket-right") {
            return (
              <polyline
                key={idx}
                points={`${rx + w - 1},${ry} ${rx + w},${ry} ${rx + w},${ry + h} ${rx + w - 1},${ry + h}`}
                fill="none"
                stroke={l.stroke || "#dc2626"}
                strokeWidth={0.6}
              />
            );
          }
          if (l.shape === "parallelogram") {
            const skew = Math.min(w * 0.15, 1.4);
            return (
              <polygon
                key={idx}
                points={`${rx + skew},${ry} ${rx + w},${ry} ${rx + w - skew},${ry + h} ${rx},${ry + h}`}
                fill={l.fill || "#dc2626"}
              />
            );
          }
          const isGlass = l.fillType === "glass";
          const rectFill = isGlass
            ? getShadowRgba(l.glassTint || "#ffffff", Math.round((l.glassOpacity ?? 0.25) * 100))
            : (l.fill || "transparent");
          const rectStroke = isGlass
            ? (l.stroke || "rgba(255, 255, 255, 0.35)")
            : (l.strokeWidth > 0 && l.stroke ? l.stroke : "none");
          const rectStrokeW = isGlass
            ? Math.max(0.25, (l.strokeWidth ?? 1) * 0.3)
            : (l.strokeWidth > 0 ? 0.35 : 0);

          return (
            <rect
              key={idx}
              x={rx}
              y={ry}
              width={w}
              height={h}
              fill={rectFill}
              stroke={rectStroke}
              strokeWidth={rectStrokeW}
              rx={l.borderRadius ? 0.8 : 0}
            />
          );
        }
        if (l.type === "image") {
          const w = l.width || 6;
          const h = l.height || 10;
          const rx = l.x - w / 2;
          const ry = l.y - h / 2;
          if (l.mask === "circle") {
            return (
              <g key={idx}>
                <circle cx={l.x} cy={l.y} r={Math.min(w, h) / 2} fill="#1f242d" stroke={l.stroke || "#ffffff"} strokeWidth={0.4} />
                <circle cx={l.x} cy={l.y - 1} r={Math.min(w, h) * 0.22} fill="#64748b" />
              </g>
            );
          }
          if (l.mask === "diamond") {
            return (
              <g key={idx}>
                <polygon
                  points={`${l.x},${ry} ${rx + w},${l.y} ${l.x},${ry + h} ${rx},${l.y}`}
                  fill="#1f242d"
                  stroke={l.stroke || "#ffffff"}
                  strokeWidth={0.4}
                />
                <circle cx={l.x} cy={l.y - 0.8} r={Math.min(w, h) * 0.2} fill="#64748b" />
              </g>
            );
          }
          return (
            <g key={idx}>
              <rect x={rx} y={ry} width={w} height={h} fill="#1f242d" stroke={l.stroke || "#dc2626"} strokeWidth={0.4} rx={l.borderRadius ? 0.8 : 0} />
              <circle cx={l.x} cy={l.y - 1} r={Math.min(w, h) * 0.22} fill="#64748b" />
            </g>
          );
        }
        if (l.type === "text" && l.text) {
          const isCenter = l.textAlign === "center";
          const tx = isCenter ? l.x : l.x - (l.width || 30) / 2;
          const fs = Math.max(1.5, Math.min(3.2, (l.fontSize || 16) * 0.11));
          return (
            <text
              key={idx}
              x={tx}
              y={l.y + fs * 0.35}
              fill={l.color || "#ffffff"}
              fontSize={fs}
              fontWeight={l.fontWeight || "bold"}
              fontFamily="Inter, sans-serif"
              textAnchor={isCenter ? "middle" : "start"}
            >
              {l.textTransform === "uppercase" ? l.text.toUpperCase() : l.text}
            </text>
          );
        }
        return null;
      })}
    </svg>
  );
}

// Default editable Lower Third and Announcement Templates
const TEMPLATES = [
  {
    id: "tmpl_lt_01_minimal_accent",
    name: "Minimal Vertical Accent",
    category: "Minimal",
    layers: [
      {
        id: "l_accent",
        type: "shape",
        name: "Vertical Accent Line",
        shape: "rectangle",
        x: 14.5,
        y: 88,
        width: 0.4,
        height: 8.5,
        rotation: 0,
        fill: "#dc2626",
        stroke: "transparent",
        strokeWidth: 0,
        borderRadius: 0,
        opacity: 1,
        visible: true,
        zIndex: 10,
      },
      {
        id: "l_name",
        type: "text",
        name: "Speaker Name",
        text: "PASTOR JOHN DOE",
        fontFamily: "Inter, sans-serif",
        fontSize: 24,
        fontWeight: "800",
        color: "#ffffff",
        textAlign: "left",
        textTransform: "uppercase",
        x: 31,
        y: 86,
        width: 32,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 20,
      },
      {
        id: "l_sub",
        type: "text",
        name: "Role / Subtitle",
        text: "Lead Pastor • Grace Community Church",
        fontFamily: "Inter, sans-serif",
        fontSize: 13,
        fontWeight: "500",
        color: "#9ca3af",
        textAlign: "left",
        textTransform: "none",
        x: 31,
        y: 90.5,
        width: 32,
        rotation: 0,
        opacity: 0.95,
        visible: true,
        zIndex: 25,
      },
    ],
  },
  {
    id: "tmpl_lt_02_subtitle_tag",
    name: "Name with Colored Tag",
    category: "Modern",
    layers: [
      {
        id: "l_name",
        type: "text",
        name: "Speaker Name",
        text: "PASTOR JOHN DOE",
        fontFamily: "Inter, sans-serif",
        fontSize: 24,
        fontWeight: "800",
        color: "#ffffff",
        textAlign: "left",
        textTransform: "uppercase",
        x: 27,
        y: 85,
        width: 32,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 20,
      },
      {
        id: "l_tag_bg",
        type: "shape",
        name: "Subtitle Tag Bar",
        shape: "rectangle",
        x: 20,
        y: 89.5,
        width: 18,
        height: 4.5,
        rotation: 0,
        fill: "#dc2626",
        stroke: "transparent",
        strokeWidth: 0,
        borderRadius: 0,
        opacity: 1,
        visible: true,
        zIndex: 10,
      },
      {
        id: "l_tag_text",
        type: "text",
        name: "Tag Text",
        text: "GUEST SPEAKER",
        fontFamily: "Inter, sans-serif",
        fontSize: 11,
        fontWeight: "700",
        color: "#ffffff",
        textAlign: "center",
        textTransform: "uppercase",
        x: 20,
        y: 89.5,
        width: 17,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 25,
      },
    ],
  },
  {
    id: "tmpl_lt_03_outlined_nameplate",
    name: "Outlined Nameplate",
    category: "Classic",
    layers: [
      {
        id: "l_frame",
        type: "shape",
        name: "Outlined Frame",
        shape: "rectangle",
        x: 26,
        y: 87.5,
        width: 32,
        height: 11,
        rotation: 0,
        fill: "rgba(18, 18, 22, 0.88)",
        stroke: "#dc2626",
        strokeWidth: 2,
        borderRadius: 0,
        opacity: 0.96,
        visible: true,
        zIndex: 10,
      },
      {
        id: "l_name",
        type: "text",
        name: "Speaker Name",
        text: "PASTOR JOHN DOE",
        fontFamily: "Inter, sans-serif",
        fontSize: 22,
        fontWeight: "800",
        color: "#ffffff",
        textAlign: "center",
        textTransform: "uppercase",
        x: 26,
        y: 85.5,
        width: 28,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 20,
      },
      {
        id: "l_sub",
        type: "text",
        name: "Role / Subtitle",
        text: "Senior Pastor • Sunday Service",
        fontFamily: "Inter, sans-serif",
        fontSize: 12,
        fontWeight: "600",
        color: "#e2e8f0",
        textAlign: "center",
        textTransform: "none",
        x: 26,
        y: 89.8,
        width: 28,
        rotation: 0,
        opacity: 0.9,
        visible: true,
        zIndex: 25,
      },
    ],
  },
  {
    id: "tmpl_lt_04_solid_bar_separate_sub",
    name: "Solid Bar with Separate Subtitle",
    category: "Solid",
    layers: [
      {
        id: "l_bar_main",
        type: "shape",
        name: "Solid Name Bar",
        shape: "rectangle",
        x: 25,
        y: 85,
        width: 30,
        height: 6.5,
        rotation: 0,
        fill: "#dc2626",
        stroke: "transparent",
        strokeWidth: 0,
        borderRadius: 0,
        opacity: 1,
        visible: true,
        zIndex: 10,
      },
      {
        id: "l_name",
        type: "text",
        name: "Speaker Name",
        text: "PASTOR JOHN DOE",
        fontFamily: "Inter, sans-serif",
        fontSize: 22,
        fontWeight: "800",
        color: "#ffffff",
        textAlign: "left",
        textTransform: "uppercase",
        x: 25,
        y: 85,
        width: 28,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 20,
      },
      {
        id: "l_bar_sub",
        type: "shape",
        name: "Subtitle Bar",
        shape: "rectangle",
        x: 22,
        y: 90.5,
        width: 24,
        height: 4.8,
        rotation: 0,
        fill: "rgba(24, 24, 27, 0.95)",
        stroke: "transparent",
        strokeWidth: 0,
        borderRadius: 0,
        opacity: 0.96,
        visible: true,
        zIndex: 15,
      },
      {
        id: "l_sub",
        type: "text",
        name: "Role / Subtitle",
        text: "Lead Pastor • Grace Church",
        fontFamily: "Inter, sans-serif",
        fontSize: 12,
        fontWeight: "600",
        color: "#ffffff",
        textAlign: "left",
        textTransform: "none",
        x: 22,
        y: 90.5,
        width: 22,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 25,
      },
    ],
  },
  {
    id: "tmpl_lt_05_two_stacked_bars",
    name: "Two Stacked Contrasting Bars",
    category: "Stacked",
    layers: [
      {
        id: "l_bar_top",
        type: "shape",
        name: "Top White Bar",
        shape: "rectangle",
        x: 26,
        y: 84.5,
        width: 32,
        height: 6.5,
        rotation: 0,
        fill: "#ffffff",
        stroke: "transparent",
        strokeWidth: 0,
        borderRadius: 0,
        opacity: 1,
        visible: true,
        zIndex: 10,
      },
      {
        id: "l_name",
        type: "text",
        name: "Speaker Name",
        text: "PASTOR JOHN DOE",
        fontFamily: "Inter, sans-serif",
        fontSize: 22,
        fontWeight: "800",
        color: "#18181b",
        textAlign: "left",
        textTransform: "uppercase",
        x: 26,
        y: 84.5,
        width: 30,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 20,
      },
      {
        id: "l_bar_bottom",
        type: "shape",
        name: "Bottom Red Bar",
        shape: "rectangle",
        x: 28,
        y: 90,
        width: 36,
        height: 5,
        rotation: 0,
        fill: "#dc2626",
        stroke: "transparent",
        strokeWidth: 0,
        borderRadius: 0,
        opacity: 1,
        visible: true,
        zIndex: 15,
      },
      {
        id: "l_sub",
        type: "text",
        name: "Role / Subtitle",
        text: "SENIOR PASTOR • KINGDOM SERVICE",
        fontFamily: "Inter, sans-serif",
        fontSize: 12,
        fontWeight: "700",
        color: "#ffffff",
        textAlign: "left",
        textTransform: "uppercase",
        x: 28,
        y: 90,
        width: 34,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 25,
      },
    ],
  },
  {
    id: "tmpl_lt_06_between_rules",
    name: "Name Between Horizontal Rules",
    category: "Rules",
    layers: [
      {
        id: "l_rule_top",
        type: "shape",
        name: "Top Red Rule",
        shape: "line",
        x: 26,
        y: 82.5,
        width: 32,
        height: 1,
        rotation: 0,
        fill: "transparent",
        stroke: "#dc2626",
        strokeWidth: 2,
        borderRadius: 0,
        opacity: 1,
        visible: true,
        zIndex: 10,
      },
      {
        id: "l_name",
        type: "text",
        name: "Speaker Name",
        text: "PASTOR JOHN DOE",
        fontFamily: "Inter, sans-serif",
        fontSize: 24,
        fontWeight: "800",
        color: "#ffffff",
        textAlign: "left",
        textTransform: "uppercase",
        x: 26,
        y: 86.5,
        width: 32,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 20,
      },
      {
        id: "l_rule_bottom",
        type: "shape",
        name: "Bottom White Rule",
        shape: "line",
        x: 26,
        y: 90.5,
        width: 32,
        height: 1,
        rotation: 0,
        fill: "transparent",
        stroke: "#ffffff",
        strokeWidth: 1.5,
        borderRadius: 0,
        opacity: 0.9,
        visible: true,
        zIndex: 15,
      },
      {
        id: "l_sub",
        type: "text",
        name: "Role / Subtitle",
        text: "Lead Pastor • Sunday Morning Service",
        fontFamily: "Inter, sans-serif",
        fontSize: 12,
        fontWeight: "600",
        color: "#9ca3af",
        textAlign: "left",
        textTransform: "none",
        x: 26,
        y: 93,
        width: 32,
        rotation: 0,
        opacity: 0.95,
        visible: true,
        zIndex: 25,
      },
    ],
  },
  {
    id: "tmpl_lt_07_open_bracket",
    name: "Open Bracket Frame",
    category: "Brackets",
    layers: [
      {
        id: "l_bracket_l",
        type: "shape",
        name: "Left Red Bracket",
        shape: "bracket-left",
        x: 10,
        y: 87.5,
        width: 2,
        height: 11,
        rotation: 0,
        fill: "transparent",
        stroke: "#dc2626",
        strokeWidth: 3,
        borderRadius: 0,
        opacity: 1,
        visible: true,
        zIndex: 10,
      },
      {
        id: "l_bracket_r",
        type: "shape",
        name: "Right Red Bracket",
        shape: "bracket-right",
        x: 42,
        y: 87.5,
        width: 2,
        height: 11,
        rotation: 0,
        fill: "transparent",
        stroke: "#dc2626",
        strokeWidth: 3,
        borderRadius: 0,
        opacity: 1,
        visible: true,
        zIndex: 10,
      },
      {
        id: "l_name",
        type: "text",
        name: "Speaker Name",
        text: "PASTOR JOHN DOE",
        fontFamily: "Inter, sans-serif",
        fontSize: 22,
        fontWeight: "800",
        color: "#ffffff",
        textAlign: "center",
        textTransform: "uppercase",
        x: 26,
        y: 85.5,
        width: 28,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 20,
      },
      {
        id: "l_sub",
        type: "text",
        name: "Role / Subtitle",
        text: "Lead Pastor • Grace Church",
        fontFamily: "Inter, sans-serif",
        fontSize: 12,
        fontWeight: "600",
        color: "#cbd5e1",
        textAlign: "center",
        textTransform: "none",
        x: 26,
        y: 89.8,
        width: 28,
        rotation: 0,
        opacity: 0.9,
        visible: true,
        zIndex: 25,
      },
    ],
  },
  {
    id: "tmpl_lt_08_angled_ribbon",
    name: "Angled Slanted Ribbon",
    category: "Angled",
    layers: [
      {
        id: "l_ribbon_main",
        type: "shape",
        name: "Angled Red Ribbon",
        shape: "parallelogram",
        x: 25,
        y: 84.5,
        width: 30,
        height: 6.5,
        rotation: 0,
        fill: "#dc2626",
        stroke: "transparent",
        strokeWidth: 0,
        borderRadius: 0,
        opacity: 1,
        visible: true,
        zIndex: 10,
      },
      {
        id: "l_name",
        type: "text",
        name: "Speaker Name",
        text: "PASTOR JOHN DOE",
        fontFamily: "Inter, sans-serif",
        fontSize: 22,
        fontWeight: "800",
        color: "#ffffff",
        textAlign: "left",
        textTransform: "uppercase",
        x: 25,
        y: 84.5,
        width: 26,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 20,
      },
      {
        id: "l_ribbon_sub",
        type: "shape",
        name: "Offset Subtitle Ribbon",
        shape: "parallelogram",
        x: 27,
        y: 90,
        width: 26,
        height: 5,
        rotation: 0,
        fill: "rgba(24, 24, 27, 0.95)",
        stroke: "transparent",
        strokeWidth: 0,
        borderRadius: 0,
        opacity: 0.96,
        visible: true,
        zIndex: 15,
      },
      {
        id: "l_sub",
        type: "text",
        name: "Role / Subtitle",
        text: "GUEST SPEAKER • WORSHIP NIGHT",
        fontFamily: "Inter, sans-serif",
        fontSize: 11,
        fontWeight: "700",
        color: "#ffffff",
        textAlign: "left",
        textTransform: "uppercase",
        x: 27,
        y: 90,
        width: 23,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 25,
      },
    ],
  },
  {
    id: "tmpl_lt_09_split_color_name",
    name: "Split-Color First & Last Name",
    category: "Typography",
    layers: [
      {
        id: "l_bg",
        type: "shape",
        name: "Dark Charcoal Plate",
        shape: "rectangle",
        x: 26,
        y: 87.5,
        width: 32,
        height: 11,
        rotation: 0,
        fill: "rgba(18, 18, 22, 0.95)",
        stroke: "rgba(255, 255, 255, 0.12)",
        strokeWidth: 1,
        borderRadius: 0,
        opacity: 0.96,
        visible: true,
        zIndex: 10,
      },
      {
        id: "l_first",
        type: "text",
        name: "First Name",
        text: "JOHN",
        fontFamily: "Inter, sans-serif",
        fontSize: 24,
        fontWeight: "900",
        color: "#dc2626",
        textAlign: "left",
        textTransform: "uppercase",
        x: 17,
        y: 85.5,
        width: 12,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 20,
      },
      {
        id: "l_last",
        type: "text",
        name: "Last Name",
        text: "DOE",
        fontFamily: "Inter, sans-serif",
        fontSize: 24,
        fontWeight: "900",
        color: "#ffffff",
        textAlign: "left",
        textTransform: "uppercase",
        x: 29,
        y: 85.5,
        width: 18,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 20,
      },
      {
        id: "l_sub",
        type: "text",
        name: "Role / Subtitle",
        text: "Lead Pastor • Sunday Service",
        fontFamily: "Inter, sans-serif",
        fontSize: 12,
        fontWeight: "500",
        color: "#9ca3af",
        textAlign: "left",
        textTransform: "none",
        x: 26,
        y: 89.8,
        width: 28,
        rotation: 0,
        opacity: 0.9,
        visible: true,
        zIndex: 25,
      },
    ],
  },
  {
    id: "tmpl_lt_10_stacked_two_line_role",
    name: "Stacked Two-Line Name & Role",
    category: "Typography",
    layers: [
      {
        id: "l_tag_bg",
        type: "shape",
        name: "Role Tag Pill",
        shape: "rectangle",
        x: 14,
        y: 82,
        width: 8,
        height: 3.5,
        rotation: 0,
        fill: "#dc2626",
        stroke: "transparent",
        strokeWidth: 0,
        borderRadius: 0,
        opacity: 1,
        visible: true,
        zIndex: 10,
      },
      {
        id: "l_tag_text",
        type: "text",
        name: "Role Tag",
        text: "SPEAKER",
        fontFamily: "Inter, sans-serif",
        fontSize: 10,
        fontWeight: "800",
        color: "#ffffff",
        textAlign: "center",
        textTransform: "uppercase",
        x: 14,
        y: 82,
        width: 8,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 20,
      },
      {
        id: "l_line1",
        type: "text",
        name: "Prefix / First Line",
        text: "PASTOR",
        fontFamily: "Inter, sans-serif",
        fontSize: 20,
        fontWeight: "700",
        color: "#dc2626",
        textAlign: "left",
        textTransform: "uppercase",
        x: 23,
        y: 86.5,
        width: 26,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 25,
      },
      {
        id: "l_line2",
        type: "text",
        name: "Name / Second Line",
        text: "JOHN DOE",
        fontFamily: "Inter, sans-serif",
        fontSize: 26,
        fontWeight: "900",
        color: "#ffffff",
        textAlign: "left",
        textTransform: "uppercase",
        x: 23,
        y: 91.5,
        width: 26,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 25,
      },
    ],
  },
  {
    id: "tmpl_lt_11_square_portrait",
    name: "Square Portrait with Nameplate",
    category: "Portrait",
    layers: [
      {
        id: "l_portrait",
        type: "image",
        name: "Portrait Avatar",
        isPlaceholder: true,
        mask: "square",
        x: 14,
        y: 87.5,
        width: 6,
        height: 10.6,
        rotation: 0,
        stroke: "#dc2626",
        strokeWidth: 2,
        borderRadius: 0,
        opacity: 1,
        visible: true,
        zIndex: 20,
      },
      {
        id: "l_plate",
        type: "shape",
        name: "Nameplate Bar",
        shape: "rectangle",
        x: 31,
        y: 87.5,
        width: 28,
        height: 10.6,
        rotation: 0,
        fill: "rgba(18, 18, 22, 0.95)",
        stroke: "#dc2626",
        strokeWidth: 1.5,
        borderRadius: 0,
        opacity: 0.96,
        visible: true,
        zIndex: 10,
      },
      {
        id: "l_name",
        type: "text",
        name: "Speaker Name",
        text: "PASTOR JOHN DOE",
        fontFamily: "Inter, sans-serif",
        fontSize: 22,
        fontWeight: "800",
        color: "#ffffff",
        textAlign: "left",
        textTransform: "uppercase",
        x: 31,
        y: 85.5,
        width: 25,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 25,
      },
      {
        id: "l_sub",
        type: "text",
        name: "Role / Subtitle",
        text: "Lead Pastor • Grace Church",
        fontFamily: "Inter, sans-serif",
        fontSize: 12,
        fontWeight: "500",
        color: "#9ca3af",
        textAlign: "left",
        textTransform: "none",
        x: 31,
        y: 89.8,
        width: 25,
        rotation: 0,
        opacity: 0.9,
        visible: true,
        zIndex: 25,
      },
    ],
  },
  {
    id: "tmpl_lt_12_diamond_portrait_angled",
    name: "Diamond Portrait & Angled Ribbon",
    category: "Portrait",
    layers: [
      {
        id: "l_portrait_dia",
        type: "image",
        name: "Diamond Portrait",
        isPlaceholder: true,
        mask: "diamond",
        x: 13,
        y: 87.5,
        width: 6.5,
        height: 11.5,
        rotation: 0,
        stroke: "#ffffff",
        strokeWidth: 2,
        borderRadius: 0,
        opacity: 1,
        visible: true,
        zIndex: 20,
      },
      {
        id: "l_ribbon",
        type: "shape",
        name: "Angled Ribbon",
        shape: "parallelogram",
        x: 30,
        y: 87.5,
        width: 28,
        height: 9,
        rotation: 0,
        fill: "#dc2626",
        stroke: "transparent",
        strokeWidth: 0,
        borderRadius: 0,
        opacity: 1,
        visible: true,
        zIndex: 10,
      },
      {
        id: "l_name",
        type: "text",
        name: "Speaker Name",
        text: "DR. SARAH JENKINS",
        fontFamily: "Inter, sans-serif",
        fontSize: 20,
        fontWeight: "800",
        color: "#ffffff",
        textAlign: "left",
        textTransform: "uppercase",
        x: 30,
        y: 85.8,
        width: 24,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 25,
      },
      {
        id: "l_sub",
        type: "text",
        name: "Role / Subtitle",
        text: "Guest Minister • Kingdom Faith",
        fontFamily: "Inter, sans-serif",
        fontSize: 11,
        fontWeight: "600",
        color: "#fecaca",
        textAlign: "left",
        textTransform: "none",
        x: 30,
        y: 89.5,
        width: 24,
        rotation: 0,
        opacity: 0.95,
        visible: true,
        zIndex: 25,
      },
    ],
  },
  {
    id: "tmpl_lt_13_framed_portrait_nameplate",
    name: "Framed Portrait Nameplate",
    category: "Portrait",
    layers: [
      {
        id: "l_frame",
        type: "shape",
        name: "Framed Container",
        shape: "rectangle",
        x: 27,
        y: 87.5,
        width: 36,
        height: 12,
        rotation: 0,
        fill: "rgba(18, 18, 22, 0.92)",
        stroke: "#dc2626",
        strokeWidth: 2,
        borderRadius: 0,
        opacity: 0.96,
        visible: true,
        zIndex: 10,
      },
      {
        id: "l_portrait_circ",
        type: "image",
        name: "Integrated Portrait",
        isPlaceholder: true,
        mask: "circle",
        x: 13.5,
        y: 87.5,
        width: 5.5,
        height: 9.8,
        rotation: 0,
        stroke: "#ffffff",
        strokeWidth: 2,
        borderRadius: 0,
        opacity: 1,
        visible: true,
        zIndex: 20,
      },
      {
        id: "l_name",
        type: "text",
        name: "Speaker Name",
        text: "PASTOR JOHN DOE",
        fontFamily: "Inter, sans-serif",
        fontSize: 22,
        fontWeight: "800",
        color: "#ffffff",
        textAlign: "left",
        textTransform: "uppercase",
        x: 31,
        y: 85.5,
        width: 25,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 25,
      },
      {
        id: "l_sub",
        type: "text",
        name: "Role / Subtitle",
        text: "Senior Pastor • Sunday Morning",
        fontFamily: "Inter, sans-serif",
        fontSize: 12,
        fontWeight: "500",
        color: "#cbd5e1",
        textAlign: "left",
        textTransform: "none",
        x: 31,
        y: 89.8,
        width: 25,
        rotation: 0,
        opacity: 0.9,
        visible: true,
        zIndex: 25,
      },
    ],
  },
  {
    id: "tmpl_lt_14_condensed_role_above",
    name: "Role Above Condensed Name",
    category: "Condensed",
    layers: [
      {
        id: "l_role",
        type: "text",
        name: "Role Above",
        text: "SENIOR LEAD PASTOR",
        fontFamily: "Inter, sans-serif",
        fontSize: 11,
        fontWeight: "800",
        color: "#dc2626",
        textAlign: "left",
        textTransform: "uppercase",
        x: 26,
        y: 82.5,
        width: 30,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 20,
      },
      {
        id: "l_rule",
        type: "shape",
        name: "Accent Divider Rule",
        shape: "line",
        x: 26,
        y: 84.8,
        width: 30,
        height: 1,
        rotation: 0,
        fill: "transparent",
        stroke: "#dc2626",
        strokeWidth: 1.5,
        borderRadius: 0,
        opacity: 1,
        visible: true,
        zIndex: 10,
      },
      {
        id: "l_name",
        type: "text",
        name: "Speaker Name",
        text: "PASTOR JOHN DOE",
        fontFamily: "Inter, sans-serif",
        fontSize: 28,
        fontWeight: "900",
        color: "#ffffff",
        textAlign: "left",
        textTransform: "uppercase",
        x: 26,
        y: 88.5,
        width: 30,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 25,
      },
      {
        id: "l_sub",
        type: "text",
        name: "Church / Subtitle",
        text: "GRACE COMMUNITY CHURCH",
        fontFamily: "Inter, sans-serif",
        fontSize: 12,
        fontWeight: "600",
        color: "#9ca3af",
        textAlign: "left",
        textTransform: "uppercase",
        x: 26,
        y: 92.5,
        width: 30,
        rotation: 0,
        opacity: 0.95,
        visible: true,
        zIndex: 25,
      },
    ],
  },
  {
    id: "tmpl_speaker_classic",
    name: "Speaker Lower Third (Classic)",
    category: "Classic",
    layers: [
      {
        id: "l_bg",
        type: "shape",
        name: "Container Bar",
        shape: "rounded-rect",
        x: 32,
        y: 88,
        width: 48,
        height: 12,
        rotation: 0,
        fill: "rgba(15, 13, 27, 0.95)",
        stroke: "#a855f7",
        strokeWidth: 2,
        borderRadius: 12,
        opacity: 0.96,
        visible: true,
        zIndex: 10,
        groupId: "grp_speaker_classic",
      },
      {
        id: "l_divider",
        type: "shape",
        name: "Accent Divider",
        shape: "line",
        x: 12,
        y: 88,
        width: 1,
        height: 8,
        rotation: 0,
        fill: "transparent",
        stroke: "#f59e0b",
        strokeWidth: 3,
        borderRadius: 12,
        opacity: 1,
        visible: true,
        zIndex: 15,
        groupId: "grp_speaker_classic",
      },
      {
        id: "l_title",
        type: "text",
        name: "Speaker Name",
        text: "Pastor John Doe",
        fontFamily: "Inter, sans-serif",
        fontSize: 24,
        fontWeight: "bold",
        color: "#ffffff",
        textAlign: "left",
        textTransform: "none",
        x: 33,
        y: 86,
        width: 38,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 20,
        groupId: "grp_speaker_classic",
      },
      {
        id: "l_sub",
        type: "text",
        name: "Role / Subtitle",
        text: "Senior Pastor • Sunday Service",
        fontFamily: "Inter, sans-serif",
        fontSize: 14,
        fontWeight: "normal",
        color: "#cbd5e1",
        textAlign: "left",
        textTransform: "none",
        x: 33,
        y: 91,
        width: 38,
        rotation: 0,
        opacity: 0.9,
        visible: true,
        zIndex: 25,
        groupId: "grp_speaker_classic",
      },
    ],
  },
  {
    id: "tmpl_speaker_modern",
    name: "Speaker Lower Third (Sapphire)",
    category: "Speaker",
    layers: [
      {
        id: "l_bg_mod",
        type: "shape",
        name: "Sapphire Bar",
        shape: "rounded-rect",
        x: 30,
        y: 88,
        width: 44,
        height: 12,
        rotation: 0,
        fill: "rgba(12, 20, 36, 0.95)",
        stroke: "#38bdf8",
        strokeWidth: 2,
        borderRadius: 12,
        opacity: 0.96,
        visible: true,
        zIndex: 10,
        groupId: "grp_speaker_modern",
      },
      {
        id: "l_title_mod",
        type: "text",
        name: "Speaker Name",
        text: "Dr. Sarah Jenkins",
        fontFamily: "Inter, sans-serif",
        fontSize: 22,
        fontWeight: "bold",
        color: "#38bdf8",
        textAlign: "left",
        textTransform: "none",
        x: 30,
        y: 86,
        width: 36,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 20,
        groupId: "grp_speaker_modern",
      },
      {
        id: "l_sub_mod",
        type: "text",
        name: "Role / Topic",
        text: "Guest Minister • Kingdom Faith",
        fontFamily: "Inter, sans-serif",
        fontSize: 14,
        fontWeight: "normal",
        color: "#bae6fd",
        textAlign: "left",
        textTransform: "none",
        x: 30,
        y: 91,
        width: 36,
        rotation: 0,
        opacity: 0.85,
        visible: true,
        zIndex: 25,
        groupId: "grp_speaker_modern",
      },
    ],
  },
  {
    id: "tmpl_announcement_crawl",
    name: "Announcement Bottom Crawl",
    category: "Banner",
    layers: [
      {
        id: "l_bar_ann",
        type: "shape",
        name: "Bottom Bar",
        shape: "rounded-rect",
        x: 50,
        y: 92,
        width: 94,
        height: 10,
        rotation: 0,
        fill: "rgba(9, 8, 18, 0.96)",
        stroke: "#a855f7",
        strokeWidth: 1.5,
        borderRadius: 12,
        opacity: 0.98,
        visible: true,
        zIndex: 10,
        groupId: "grp_announcement",
      },
      {
        id: "l_tag_ann",
        type: "shape",
        name: "Tag Pill",
        shape: "rounded-rect",
        x: 9,
        y: 92,
        width: 9,
        height: 6,
        rotation: 0,
        fill: "#a855f7",
        stroke: "transparent",
        strokeWidth: 0,
        borderRadius: 12,
        opacity: 1,
        visible: true,
        zIndex: 15,
        groupId: "grp_announcement",
      },
      {
        id: "l_tag_txt",
        type: "text",
        name: "Tag Text",
        text: "UPDATE",
        fontFamily: "Inter, sans-serif",
        fontSize: 12,
        fontWeight: "bold",
        color: "#ffffff",
        textAlign: "center",
        textTransform: "uppercase",
        x: 9,
        y: 92,
        width: 8,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 20,
        groupId: "grp_announcement",
      },
      {
        id: "l_msg_ann",
        type: "text",
        name: "Message Text",
        text: "Join us this Wednesday at 7 PM for Midweek Bible Study & Prayer Service.",
        fontFamily: "Inter, sans-serif",
        fontSize: 15,
        fontWeight: "600",
        color: "#ffffff",
        textAlign: "left",
        textTransform: "none",
        x: 53,
        y: 92,
        width: 76,
        rotation: 0,
        opacity: 0.95,
        visible: true,
        zIndex: 20,
        groupId: "grp_announcement",
      },
    ],
  },
  {
    id: "tmpl_scripture_card",
    name: "Scripture Quote Card",
    category: "Scripture",
    layers: [
      {
        id: "l_scrip_bg",
        type: "shape",
        name: "Scripture Box",
        shape: "rounded-rect",
        x: 50,
        y: 84,
        width: 88,
        height: 16,
        rotation: 0,
        fill: "rgba(12, 10, 20, 0.96)",
        stroke: "#f59e0b",
        strokeWidth: 2,
        borderRadius: 12,
        opacity: 0.98,
        visible: true,
        zIndex: 10,
        groupId: "grp_scripture_card",
      },
      {
        id: "l_scrip_ref",
        type: "text",
        name: "Scripture Reference",
        text: "John 3:16 (KJV)",
        fontFamily: "Inter, sans-serif",
        fontSize: 17,
        fontWeight: "bold",
        color: "#f59e0b",
        textAlign: "left",
        textTransform: "none",
        x: 50,
        y: 79,
        width: 82,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 20,
        groupId: "grp_scripture_card",
      },
      {
        id: "l_scrip_body",
        type: "text",
        name: "Verse Text",
        text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
        fontFamily: "Inter, sans-serif",
        fontSize: 13,
        fontWeight: "normal",
        color: "#ffffff",
        textAlign: "left",
        textTransform: "none",
        x: 50,
        y: 86,
        width: 82,
        rotation: 0,
        opacity: 0.95,
        visible: true,
        zIndex: 20,
        groupId: "grp_scripture_card",
      },
    ],
  },
  {
    id: "tmpl_lt_neon_ribbon",
    name: "Neon Angled Ribbon",
    category: "Gradient",
    layers: [
      {
        id: "l_neon_base",
        type: "shape",
        name: "Angled Neon Base",
        shape: "parallelogram",
        x: 34,
        y: 87,
        width: 44,
        height: 8.5,
        rotation: 0,
        fill: "#c0137f",
        fillType: "linear-gradient",
        gradient: {
          type: "linear",
          angle: 90,
          stops: [
            { position: 0, color: "#2e0854", opacity: 1 },
            { position: 30, color: "#c0137f", opacity: 1 },
            { position: 60, color: "#e53935", opacity: 1 },
            { position: 85, color: "#fb8c00", opacity: 1 },
            { position: 100, color: "#fdd835", opacity: 1 },
          ],
        },
        stroke: "transparent",
        strokeWidth: 0,
        borderRadius: 0,
        opacity: 0.96,
        visible: true,
        zIndex: 10,
        groupId: "grp_neon_ribbon",
      },
      {
        id: "l_neon_sub_tag",
        type: "shape",
        name: "Subtitle Tag",
        shape: "parallelogram",
        x: 23,
        y: 92.2,
        width: 18,
        height: 4.2,
        rotation: 0,
        fill: "#110b1a",
        fillType: "solid",
        stroke: "#fb8c00",
        strokeWidth: 1,
        borderRadius: 0,
        opacity: 1,
        visible: true,
        zIndex: 15,
        groupId: "grp_neon_ribbon",
      },
      {
        id: "l_neon_name",
        type: "text",
        name: "Speaker Name",
        text: "MICHAEL T. REYNOLDS",
        fontFamily: "Inter, sans-serif",
        fontSize: 21,
        fontWeight: "900",
        color: "#ffffff",
        textAlign: "left",
        textTransform: "uppercase",
        x: 35,
        y: 86.8,
        width: 38,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 20,
        groupId: "grp_neon_ribbon",
      },
      {
        id: "l_neon_sub",
        type: "text",
        name: "Role Subtitle",
        text: "KEYNOTE SPEAKER",
        fontFamily: "Inter, sans-serif",
        fontSize: 11,
        fontWeight: "800",
        color: "#fb8c00",
        textAlign: "left",
        textTransform: "uppercase",
        x: 23.5,
        y: 92.2,
        width: 17,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 25,
        groupId: "grp_neon_ribbon",
      },
    ],
  },
  {
    id: "tmpl_lt_oceanic_split",
    name: "Oceanic Split Tag",
    category: "Gradient",
    layers: [
      {
        id: "l_oceanic_plate",
        type: "shape",
        name: "Cyan Gradient Plate",
        shape: "rounded-rect",
        x: 32,
        y: 88,
        width: 40,
        height: 8.5,
        rotation: 0,
        fill: "#09203f",
        fillType: "linear-gradient",
        gradient: {
          type: "linear",
          angle: 105,
          stops: [
            { position: 0, color: "#09203f", opacity: 1 },
            { position: 50, color: "#537895", opacity: 1 },
            { position: 100, color: "#00f2fe", opacity: 1 },
          ],
        },
        stroke: "#00f2fe",
        strokeWidth: 1,
        borderRadius: 12,
        opacity: 0.95,
        visible: true,
        zIndex: 10,
        groupId: "grp_oceanic_split",
      },
      {
        id: "l_oceanic_name",
        type: "text",
        name: "Speaker Name",
        text: "DR. ELIZABETH VANCE",
        fontFamily: "Inter, sans-serif",
        fontSize: 20,
        fontWeight: "800",
        color: "#ffffff",
        textAlign: "left",
        textTransform: "uppercase",
        x: 32,
        y: 86.2,
        width: 36,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 20,
        groupId: "grp_oceanic_split",
      },
      {
        id: "l_oceanic_title",
        type: "text",
        name: "Role Subtitle",
        text: "LEAD ARCHITECT / AUTHOR",
        fontFamily: "Inter, sans-serif",
        fontSize: 12,
        fontWeight: "600",
        color: "#38bdf8",
        textAlign: "left",
        textTransform: "uppercase",
        x: 32,
        y: 90.2,
        width: 36,
        rotation: 0,
        opacity: 0.95,
        visible: true,
        zIndex: 20,
        groupId: "grp_oceanic_split",
      },
    ],
  },
  {
    id: "tmpl_lt_crimson_sunset",
    name: "Crimson Velvet Banner",
    category: "Gradient",
    layers: [
      {
        id: "l_crimson_banner",
        type: "shape",
        name: "Velvet Crimson Bar",
        shape: "rounded-rect",
        x: 50,
        y: 87.5,
        width: 76,
        height: 7.5,
        rotation: 0,
        fill: "#4a0e17",
        fillType: "linear-gradient",
        gradient: {
          type: "linear",
          angle: 90,
          stops: [
            { position: 0, color: "#4a0e17", opacity: 0.95 },
            { position: 50, color: "#b71c1c", opacity: 0.95 },
            { position: 100, color: "#ff5252", opacity: 0.95 },
          ],
        },
        stroke: "#f59e0b",
        strokeWidth: 1,
        borderRadius: 12,
        opacity: 0.98,
        visible: true,
        zIndex: 10,
        groupId: "grp_crimson_sunset",
      },
      {
        id: "l_crimson_text",
        type: "text",
        name: "Speaker & Topic",
        text: "SENIOR PASTOR SARAH JENKINS — THE PATH FORWARD",
        fontFamily: "Inter, sans-serif",
        fontSize: 18,
        fontWeight: "800",
        color: "#ffffff",
        textAlign: "center",
        textTransform: "uppercase",
        x: 50,
        y: 87.5,
        width: 74,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 20,
        groupId: "grp_crimson_sunset",
      },
    ],
  },
  {
    id: "tmpl_lt_amethyst_portrait",
    name: "Royal Amethyst Portrait",
    category: "Gradient",
    layers: [
      {
        id: "l_amethyst_bg",
        type: "shape",
        name: "Amethyst Gradient Card",
        shape: "rounded-rect",
        x: 35,
        y: 87,
        width: 44,
        height: 10,
        rotation: 0,
        fill: "#3b0764",
        fillType: "linear-gradient",
        gradient: {
          type: "linear",
          angle: 90,
          stops: [
            { position: 0, color: "#3b0764", opacity: 0.96 },
            { position: 50, color: "#7c3aed", opacity: 0.96 },
            { position: 100, color: "#c084fc", opacity: 0.96 },
          ],
        },
        stroke: "#c084fc",
        strokeWidth: 1,
        borderRadius: 12,
        opacity: 0.96,
        visible: true,
        zIndex: 10,
        groupId: "grp_amethyst_portrait",
      },
      {
        id: "l_amethyst_pic",
        type: "image",
        name: "Speaker Portrait",
        x: 18,
        y: 87,
        width: 7,
        height: 10,
        rotation: 0,
        frameShape: "diamond",
        mask: "diamond",
        frameCrop: { fitMode: "fill", zoom: 1, panX: 0, panY: 0 },
        stroke: "#ffffff",
        strokeWidth: 2,
        borderRadius: 0,
        opacity: 1,
        visible: true,
        zIndex: 20,
        groupId: "grp_amethyst_portrait",
      },
      {
        id: "l_amethyst_name",
        type: "text",
        name: "Speaker Name",
        text: "REV. MARCUS STERLING",
        fontFamily: "Inter, sans-serif",
        fontSize: 19,
        fontWeight: "800",
        color: "#ffffff",
        textAlign: "left",
        textTransform: "uppercase",
        x: 36,
        y: 85.5,
        width: 30,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 20,
        groupId: "grp_amethyst_portrait",
      },
      {
        id: "l_amethyst_sub",
        type: "text",
        name: "Affiliation Subtitle",
        text: "GUEST SPEAKER / WORLD OUTREACH",
        fontFamily: "Inter, sans-serif",
        fontSize: 11,
        fontWeight: "600",
        color: "#fbcfe8",
        textAlign: "left",
        textTransform: "uppercase",
        x: 36,
        y: 89.5,
        width: 30,
        rotation: 0,
        opacity: 0.9,
        visible: true,
        zIndex: 20,
        groupId: "grp_amethyst_portrait",
      },
    ],
  },
  {
    id: "tmpl_lt_glass_speaker",
    name: "Frosted Glass Speaker Panel",
    category: "Glassmorphism",
    layers: [
      {
        id: "l_glass_speaker_bg",
        type: "shape",
        name: "Frosted Glass Card",
        shape: "rounded-rect",
        x: 32,
        y: 87,
        width: 44,
        height: 10.5,
        rotation: 0,
        fillType: "glass",
        fill: "transparent",
        glassTint: "#ffffff",
        glassOpacity: 0.18,
        backgroundBlur: 16,
        lightweightGlass: false,
        sweepHighlight: true,
        stroke: "rgba(255, 255, 255, 0.28)",
        strokeWidth: 1,
        borderRadius: 12,
        shadowEnabled: true,
        shadowColor: "#000000",
        shadowOpacity: 40,
        shadowBlur: 16,
        shadowOffsetX: 0,
        shadowOffsetY: 6,
        opacity: 1,
        visible: true,
        zIndex: 10,
        groupId: "grp_glass_speaker",
      },
      {
        id: "l_glass_speaker_name",
        type: "text",
        name: "Speaker Name",
        text: "PASTOR ELEANOR VANCE",
        fontFamily: "Inter, sans-serif",
        fontSize: 22,
        fontWeight: "800",
        color: "#ffffff",
        textAlign: "left",
        textTransform: "uppercase",
        x: 32,
        y: 85.5,
        width: 40,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 20,
        groupId: "grp_glass_speaker",
      },
      {
        id: "l_glass_speaker_role",
        type: "text",
        name: "Title & Ministry",
        text: "Senior Pastor • Living Word Fellowship",
        fontFamily: "Inter, sans-serif",
        fontSize: 13,
        fontWeight: "500",
        color: "#e2e8f0",
        textAlign: "left",
        textTransform: "none",
        x: 32,
        y: 89.5,
        width: 40,
        rotation: 0,
        opacity: 0.95,
        visible: true,
        zIndex: 25,
        groupId: "grp_glass_speaker",
      },
    ],
  },
  {
    id: "tmpl_lt_glass_accent",
    name: "Glass Panel with Edge Accent",
    category: "Glassmorphism",
    layers: [
      {
        id: "l_glass_accent_bg",
        type: "shape",
        name: "Glass Accent Card",
        shape: "rounded-rect",
        x: 32,
        y: 87,
        width: 44,
        height: 10.5,
        rotation: 0,
        fillType: "glass",
        fill: "transparent",
        glassTint: "#0f172a",
        glassOpacity: 0.35,
        backgroundBlur: 18,
        lightweightGlass: false,
        sweepHighlight: true,
        stroke: "rgba(255, 255, 255, 0.2)",
        strokeWidth: 1,
        borderRadius: 12,
        shadowEnabled: true,
        shadowColor: "#000000",
        shadowOpacity: 45,
        shadowBlur: 14,
        shadowOffsetY: 4,
        opacity: 1,
        visible: true,
        zIndex: 10,
        groupId: "grp_glass_accent",
      },
      {
        id: "l_glass_accent_bar",
        type: "shape",
        name: "Sky Blue Edge Bar",
        shape: "rounded-rect",
        x: 10.8,
        y: 87,
        width: 0.7,
        height: 9,
        rotation: 0,
        fill: "#38bdf8",
        fillType: "solid",
        stroke: "transparent",
        strokeWidth: 0,
        borderRadius: 12,
        opacity: 1,
        visible: true,
        zIndex: 15,
        groupId: "grp_glass_accent",
      },
      {
        id: "l_glass_accent_name",
        type: "text",
        name: "Keynote Name",
        text: "DR. ARIS THORNE",
        fontFamily: "Inter, sans-serif",
        fontSize: 21,
        fontWeight: "800",
        color: "#ffffff",
        textAlign: "left",
        textTransform: "uppercase",
        x: 33,
        y: 85.5,
        width: 38,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 20,
        groupId: "grp_glass_accent",
      },
      {
        id: "l_glass_accent_sub",
        type: "text",
        name: "Keynote Topic",
        text: "Keynote Speaker • Kingdom Innovation Summit",
        fontFamily: "Inter, sans-serif",
        fontSize: 13,
        fontWeight: "600",
        color: "#7dd3fc",
        textAlign: "left",
        textTransform: "none",
        x: 33,
        y: 89.5,
        width: 38,
        rotation: 0,
        opacity: 0.95,
        visible: true,
        zIndex: 25,
        groupId: "grp_glass_accent",
      },
    ],
  },
  {
    id: "tmpl_lt_glass_portrait",
    name: "Glass Portrait Card",
    category: "Glassmorphism",
    layers: [
      {
        id: "l_glass_port_bg",
        type: "shape",
        name: "Glass Base Card",
        shape: "rounded-rect",
        x: 34,
        y: 87,
        width: 44,
        height: 11,
        rotation: 0,
        fillType: "glass",
        fill: "transparent",
        glassTint: "#ffffff",
        glassOpacity: 0.2,
        backgroundBlur: 20,
        lightweightGlass: false,
        sweepHighlight: true,
        stroke: "rgba(255, 255, 255, 0.3)",
        strokeWidth: 1,
        borderRadius: 12,
        shadowEnabled: true,
        shadowColor: "#000000",
        shadowOpacity: 35,
        shadowBlur: 16,
        shadowOffsetY: 5,
        opacity: 1,
        visible: true,
        zIndex: 10,
        groupId: "grp_glass_portrait",
      },
      {
        id: "l_glass_port_img",
        type: "image",
        name: "Circular Portrait",
        x: 17,
        y: 87,
        width: 7.5,
        height: 10,
        rotation: 0,
        frameShape: "circle",
        mask: "circle",
        frameCrop: { fitMode: "fill", zoom: 1, panX: 0, panY: 0 },
        stroke: "#ffffff",
        strokeWidth: 2,
        borderRadius: 9999,
        opacity: 1,
        visible: true,
        zIndex: 20,
        groupId: "grp_glass_portrait",
      },
      {
        id: "l_glass_port_name",
        type: "text",
        name: "Leader Name",
        text: "MINISTER MAYA LIN",
        fontFamily: "Inter, sans-serif",
        fontSize: 20,
        fontWeight: "800",
        color: "#ffffff",
        textAlign: "left",
        textTransform: "uppercase",
        x: 35,
        y: 85.5,
        width: 32,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 25,
        groupId: "grp_glass_portrait",
      },
      {
        id: "l_glass_port_sub",
        type: "text",
        name: "Department / Role",
        text: "Worship Director & Creative Arts",
        fontFamily: "Inter, sans-serif",
        fontSize: 12,
        fontWeight: "600",
        color: "#cbd5e1",
        textAlign: "left",
        textTransform: "none",
        x: 35,
        y: 89.5,
        width: 32,
        rotation: 0,
        opacity: 0.9,
        visible: true,
        zIndex: 25,
        groupId: "grp_glass_portrait",
      },
    ],
  },
  {
    id: "tmpl_lt_glass_announcement",
    name: "Wide Glass Announcement Panel",
    category: "Glassmorphism",
    layers: [
      {
        id: "l_glass_anno_bg",
        type: "shape",
        name: "Wide Frosted Panel",
        shape: "rounded-rect",
        x: 50,
        y: 88,
        width: 82,
        height: 11.5,
        rotation: 0,
        fillType: "glass",
        fill: "transparent",
        glassTint: "#18181b",
        glassOpacity: 0.4,
        backgroundBlur: 22,
        lightweightGlass: false,
        sweepHighlight: true,
        stroke: "rgba(255, 255, 255, 0.22)",
        strokeWidth: 1,
        borderRadius: 12,
        shadowEnabled: true,
        shadowColor: "#000000",
        shadowOpacity: 50,
        shadowBlur: 20,
        shadowOffsetY: 6,
        opacity: 1,
        visible: true,
        zIndex: 10,
        groupId: "grp_glass_announcement",
      },
      {
        id: "l_glass_anno_badge",
        type: "shape",
        name: "Notice Pill Tag",
        shape: "rounded-rect",
        x: 16.5,
        y: 85.5,
        width: 10.5,
        height: 4,
        rotation: 0,
        fill: "#f59e0b",
        fillType: "solid",
        stroke: "transparent",
        strokeWidth: 0,
        borderRadius: 12,
        opacity: 1,
        visible: true,
        zIndex: 15,
        groupId: "grp_glass_announcement",
      },
      {
        id: "l_glass_anno_tagtext",
        type: "text",
        name: "Pill Tag Text",
        text: "SPECIAL NOTICE",
        fontFamily: "Inter, sans-serif",
        fontSize: 10,
        fontWeight: "900",
        color: "#000000",
        textAlign: "center",
        textTransform: "uppercase",
        x: 16.5,
        y: 85.5,
        width: 10,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 20,
        groupId: "grp_glass_announcement",
      },
      {
        id: "l_glass_anno_head",
        type: "text",
        name: "Headline",
        text: "Annual Leadership Summit starts this Friday at 7:00 PM",
        fontFamily: "Inter, sans-serif",
        fontSize: 18,
        fontWeight: "700",
        color: "#ffffff",
        textAlign: "left",
        textTransform: "none",
        x: 52,
        y: 85.5,
        width: 58,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 20,
        groupId: "grp_glass_announcement",
      },
      {
        id: "l_glass_anno_sub",
        type: "text",
        name: "Details Subtext",
        text: "Register online or at the information desk in the main foyer • Childcare provided",
        fontFamily: "Inter, sans-serif",
        fontSize: 12,
        fontWeight: "500",
        color: "#d4d4d8",
        textAlign: "left",
        textTransform: "none",
        x: 50,
        y: 90.5,
        width: 78,
        rotation: 0,
        opacity: 0.9,
        visible: true,
        zIndex: 25,
        groupId: "grp_glass_announcement",
      },
    ],
  },
  {
    id: "tmpl_lt_glass_compact",
    name: "Compact Glass Label",
    category: "Glassmorphism",
    layers: [
      {
        id: "l_glass_comp_bg",
        type: "shape",
        name: "Compact Glass Badge",
        shape: "rounded-rect",
        x: 20,
        y: 90,
        width: 22,
        height: 6.5,
        rotation: 0,
        fillType: "glass",
        fill: "transparent",
        glassTint: "#ffffff",
        glassOpacity: 0.22,
        backgroundBlur: 14,
        lightweightGlass: false,
        sweepHighlight: true,
        stroke: "rgba(255, 255, 255, 0.35)",
        strokeWidth: 1,
        borderRadius: 12,
        shadowEnabled: true,
        shadowColor: "#000000",
        shadowOpacity: 35,
        shadowBlur: 12,
        shadowOffsetY: 3,
        opacity: 1,
        visible: true,
        zIndex: 10,
        groupId: "grp_glass_compact",
      },
      {
        id: "l_glass_comp_text",
        type: "text",
        name: "Badge Text",
        text: "LIVE FROM SANCTUARY",
        fontFamily: "Inter, sans-serif",
        fontSize: 12,
        fontWeight: "800",
        color: "#ffffff",
        textAlign: "center",
        textTransform: "uppercase",
        x: 20,
        y: 90,
        width: 21,
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 20,
        groupId: "grp_glass_compact",
      },
    ],
  },
];

const SHAPE_PICKER_ITEMS = [
  {
    id: "rectangle",
    label: "Rectangle",
    tooltip: "Rectangle - standard box container",
    icon: (
      <svg className="w-6 h-5" viewBox="0 0 24 20" fill="none">
        <rect x="2" y="3" width="20" height="14" fill="rgba(59, 130, 246, 0.2)" stroke="#60a5fa" strokeWidth="2" />
      </svg>
    ),
  },
  {
    id: "rounded-rect",
    label: "12px Rounded",
    tooltip: "Rounded Rectangle - editable corner radius",
    icon: (
      <svg className="w-6 h-5" viewBox="0 0 24 20" fill="none">
        <rect x="2" y="3" width="20" height="14" rx="4" fill="rgba(168, 85, 247, 0.2)" stroke="#c084fc" strokeWidth="2" />
      </svg>
    ),
  },
  {
    id: "square",
    label: "Square",
    tooltip: "Square - equal width and height (aspect locked)",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none">
        <rect x="2" y="2" width="16" height="16" fill="rgba(14, 165, 233, 0.2)" stroke="#38bdf8" strokeWidth="2" />
      </svg>
    ),
  },
  {
    id: "circle",
    label: "Circle",
    tooltip: "Circle - perfect circle (aspect locked)",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="8" fill="rgba(245, 158, 11, 0.2)" stroke="#fbbf24" strokeWidth="2" />
      </svg>
    ),
  },
  {
    id: "ellipse",
    label: "Ellipse",
    tooltip: "Ellipse - oval container",
    icon: (
      <svg className="w-6 h-5" viewBox="0 0 24 20" fill="none">
        <ellipse cx="12" cy="10" rx="10" ry="7" fill="rgba(234, 88, 12, 0.2)" stroke="#fb923c" strokeWidth="2" />
      </svg>
    ),
  },
  {
    id: "triangle",
    label: "Triangle",
    tooltip: "Triangle - equilateral polygon (aspect locked)",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none">
        <polygon points="10,2 18,18 2,18" fill="rgba(16, 185, 129, 0.2)" stroke="#34d399" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "diamond",
    label: "Diamond",
    tooltip: "Diamond - rhombus container (aspect locked)",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none">
        <polygon points="10,2 18,10 10,18 2,10" fill="rgba(236, 72, 153, 0.2)" stroke="#f472b6" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "pentagon",
    label: "Pentagon",
    tooltip: "Pentagon - 5-sided regular polygon (aspect locked)",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none">
        <polygon points="10,2 19,8.5 15.5,18 4.5,18 1,8.5" fill="rgba(99, 102, 241, 0.2)" stroke="#818cf8" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "hexagon",
    label: "Hexagon",
    tooltip: "Hexagon - 6-sided regular polygon (aspect locked)",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none">
        <polygon points="10,2 18,6.5 18,14.5 10,19 2,14.5 2,6.5" fill="rgba(20, 184, 166, 0.2)" stroke="#2dd4bf" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "star",
    label: "Star",
    tooltip: "Star - 5-point star (aspect locked)",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none">
        <polygon points="10,2 12.4,7.3 18.2,7.3 13.5,10.7 15.3,16.2 10,12.8 4.7,16.2 6.5,10.7 1.8,7.3 7.6,7.3" fill="rgba(250, 204, 21, 0.2)" stroke="#facc15" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "line",
    label: "Divider Line",
    tooltip: "Divider Line - horizontal stroke line",
    icon: (
      <svg className="w-6 h-5" viewBox="0 0 24 20" fill="none">
        <line x1="2" y1="10" x2="22" y2="10" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "arrow",
    label: "Arrow",
    tooltip: "Arrow - directional stroke with arrowhead",
    icon: (
      <svg className="w-6 h-5" viewBox="0 0 24 20" fill="none">
        <line x1="2" y1="10" x2="16" y2="10" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
        <polygon points="14,6 22,10 14,14" fill="#f59e0b" />
      </svg>
    ),
  },
];

export function getDefaultShapeNodes(shape = "rectangle") {
  if (shape === "triangle") {
    return [{ x: 50, y: 2 }, { x: 98, y: 98 }, { x: 2, y: 98 }];
  }
  if (shape === "diamond") {
    return [{ x: 50, y: 2 }, { x: 98, y: 50 }, { x: 50, y: 98 }, { x: 2, y: 50 }];
  }
  if (shape === "parallelogram") {
    return [{ x: 15, y: 2 }, { x: 98, y: 2 }, { x: 85, y: 98 }, { x: 2, y: 98 }];
  }
  if (shape === "pentagon") {
    return [{ x: 50, y: 2 }, { x: 97.55, y: 36.5 }, { x: 79.39, y: 94 }, { x: 20.61, y: 94 }, { x: 2.45, y: 36.5 }];
  }
  if (shape === "hexagon") {
    return [{ x: 50, y: 2 }, { x: 96, y: 26.5 }, { x: 96, y: 73.5 }, { x: 50, y: 98 }, { x: 4, y: 73.5 }, { x: 4, y: 26.5 }];
  }
  if (shape === "star") {
    return [{ x: 50, y: 2 }, { x: 61.8, y: 36.5 }, { x: 98, y: 36.5 }, { x: 68.7, y: 57.8 }, { x: 79.9, y: 93.5 }, { x: 50, y: 71.8 }, { x: 20.1, y: 93.5 }, { x: 31.3, y: 57.8 }, { x: 2, y: 36.5 }, { x: 38.2, y: 36.5 }];
  }
  return [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
}

export function generateSvgPathFromNodes(nodes) {
  if (!nodes || nodes.length < 2) return "";
  let d = `M ${nodes[0].x} ${nodes[0].y}`;
  for (let i = 1; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.cp1 && node.cp2) {
      d += ` C ${node.cp1.x} ${node.cp1.y}, ${node.cp2.x} ${node.cp2.y}, ${node.x} ${node.y}`;
    } else {
      d += ` L ${node.x} ${node.y}`;
    }
  }
  const first = nodes[0];
  if (first.closingCp1 && first.closingCp2) {
    d += ` C ${first.closingCp1.x} ${first.closingCp1.y}, ${first.closingCp2.x} ${first.closingCp2.y}, ${nodes[0].x} ${nodes[0].y} Z`;
  } else {
    d += " Z";
  }
  return d;
}

function renderVectorShape(layer, sw) {
  const shape = layer.shape || "rounded-rect";
  const isLine = shape === "line";
  const isArrow = shape === "arrow";
  const isBracket = shape === "bracket-left" || shape === "bracket-right";
  const isLineOrArrow = isLine || isArrow || isBracket;
  const strokeColor = sw > 0 && layer.stroke && layer.stroke !== "transparent" ? layer.stroke : "none";
  const strokeW = sw > 0 ? sw : 0;
  const fillColor = isLineOrArrow ? "transparent" : (layer.fill || "#581c87");
  const shadowFilter = layer.shadowEnabled ? `drop-shadow(${formatLayerShadow(layer)})` : "none";
  const shadowBox = layer.shadowEnabled ? formatLayerShadow(layer) : "none";

  const hasGradient = !isLineOrArrow &&
    (layer.fillType === "linear-gradient" || layer.fillType === "radial-gradient" || Boolean(layer.gradient)) &&
    Array.isArray(layer.gradient?.stops) && layer.gradient.stops.length >= 2;

  const gradientCss = hasGradient ? formatGradientCss(layer.gradient) : null;
  const isGlass = !isLineOrArrow && layer.fillType === "glass";
  let glassBackground = null;
  let glassBackdrop = "none";
  if (isGlass) {
    const tint = layer.glassTint || "#ffffff";
    const opacity = typeof layer.glassOpacity === "number" ? layer.glassOpacity : 0.25;
    const rgba = getShadowRgba(tint, Math.round(opacity * 100));
    glassBackground = layer.lightweightGlass
      ? `linear-gradient(135deg, ${getShadowRgba(tint, Math.round(Math.min(1, opacity + 0.12) * 100))}, ${rgba})`
      : rgba;
    const blurPx = !layer.lightweightGlass && typeof layer.backgroundBlur === "number" ? layer.backgroundBlur : (layer.lightweightGlass ? 0 : 16);
    if (blurPx > 0) {
      glassBackdrop = `blur(${blurPx}px)`;
    }
  }

  const bgFill = isGlass ? glassBackground : (gradientCss || fillColor);
  const gradId = `studio_grad_${layer.id || Math.random().toString(36).substr(2, 6)}`;
  const clipId = `studio_clip_${layer.id || Math.random().toString(36).substr(2, 6)}`;
  const svgFill = isGlass ? glassBackground : (gradientCss ? `url(#${gradId})` : fillColor);

  const hasCustomPath = Array.isArray(layer.customPath) && layer.customPath.length >= 3;

  if (!hasCustomPath && (shape === "rectangle" || shape === "square" || shape === "rounded-rect")) {
    const radiusCss = Array.isArray(layer.borderRadius)
      ? `${layer.borderRadius[0]}px ${layer.borderRadius[1]}px ${layer.borderRadius[2]}px ${layer.borderRadius[3]}px`
      : `${typeof layer.borderRadius === "number" ? layer.borderRadius : (shape === "rounded-rect" ? 12 : 0)}px`;

    return (
      <div
        data-studio-shape-content="true"
        style={{
          width: "100%",
          height: "100%",
          background: bgFill,
          backdropFilter: isGlass ? glassBackdrop : undefined,
          WebkitBackdropFilter: isGlass ? glassBackdrop : undefined,
          border: strokeW > 0 && strokeColor !== "none" ? `${strokeW}px solid ${strokeColor}` : (isGlass ? "1px solid rgba(255, 255, 255, 0.25)" : "none"),
          borderRadius: radiusCss,
          boxShadow: shadowBox,
          pointerEvents: "auto",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Clipped Mask Image */}
        {layer.maskImage && layer.maskImage.url && (
          <img
            src={layer.maskImage.url}
            alt="Masked Asset"
            className="w-full h-full pointer-events-none select-none"
            style={{
              objectFit: layer.maskImage.fitMode === "fit" ? "contain" : "cover",
              transform: `translate(${layer.maskImage.panX || 0}%, ${layer.maskImage.panY || 0}%) scale(${layer.maskImage.zoom || 1})`,
              transformOrigin: "center center",
            }}
          />
        )}
        {isGlass && layer.sweepHighlight && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%)",
            }}
          />
        )}
      </div>
    );
  }

  if (shape === "line") {
    const isVertical = (layer.height || 0) > (layer.width || 0);
    return (
      <div
        data-studio-shape-content="true"
        style={{
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          filter: shadowFilter,
        }}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible" style={{ pointerEvents: "none" }}>
          {isVertical ? (
            <>
              <line x1="50" y1="0" x2="50" y2="100" stroke="transparent" strokeWidth={Math.max(16, strokeW + 10)} style={{ pointerEvents: "stroke", cursor: "move" }} />
              {strokeW > 0 && strokeColor !== "none" && (
                <line x1="50" y1="0" x2="50" y2="100" stroke={strokeColor} strokeWidth={strokeW} vectorEffect="non-scaling-stroke" style={{ pointerEvents: "stroke", cursor: "move" }} />
              )}
            </>
          ) : (
            <>
              <line x1="0" y1="50" x2="100" y2="50" stroke="transparent" strokeWidth={Math.max(16, strokeW + 10)} style={{ pointerEvents: "stroke", cursor: "move" }} />
              {strokeW > 0 && strokeColor !== "none" && (
                <line x1="0" y1="50" x2="100" y2="50" stroke={strokeColor} strokeWidth={strokeW} vectorEffect="non-scaling-stroke" style={{ pointerEvents: "stroke", cursor: "move" }} />
              )}
            </>
          )}
        </svg>
      </div>
    );
  }

  if (shape === "arrow") {
    return (
      <div
        data-studio-shape-content="true"
        style={{
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          filter: shadowFilter,
        }}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible" style={{ pointerEvents: "none" }}>
          <line x1="0" y1="50" x2="100" y2="50" stroke="transparent" strokeWidth={Math.max(20, strokeW + 12)} style={{ pointerEvents: "stroke", cursor: "move" }} />
          {strokeW > 0 && strokeColor !== "none" && (
            <>
              <line x1="0" y1="50" x2="80" y2="50" stroke={strokeColor} strokeWidth={strokeW} vectorEffect="non-scaling-stroke" style={{ pointerEvents: "stroke", cursor: "move" }} />
              <polygon points="76,28 100,50 76,72" fill={strokeColor} stroke={strokeColor} strokeWidth={Math.max(1, Math.round(strokeW / 2))} strokeLinejoin="round" style={{ pointerEvents: "auto", cursor: "move" }} />
            </>
          )}
        </svg>
      </div>
    );
  }

  if (shape === "bracket-left") {
    return (
      <div data-studio-shape-content="true" style={{ width: "100%", height: "100%", pointerEvents: "none", filter: shadowFilter }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible" style={{ pointerEvents: "none" }}>
          <polyline points="35,2 4,2 4,98 35,98" fill="none" stroke="transparent" strokeWidth={Math.max(16, strokeW + 12)} style={{ pointerEvents: "stroke", cursor: "move" }} />
          {strokeW > 0 && strokeColor !== "none" && (
            <polyline points="35,2 4,2 4,98 35,98" fill="none" stroke={strokeColor} strokeWidth={strokeW} strokeLinecap="square" strokeLinejoin="miter" vectorEffect="non-scaling-stroke" style={{ pointerEvents: "stroke", cursor: "move" }} />
          )}
        </svg>
      </div>
    );
  }

  if (shape === "bracket-right") {
    return (
      <div data-studio-shape-content="true" style={{ width: "100%", height: "100%", pointerEvents: "none", filter: shadowFilter }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible" style={{ pointerEvents: "none" }}>
          <polyline points="65,2 96,2 96,98 65,98" fill="none" stroke="transparent" strokeWidth={Math.max(16, strokeW + 12)} style={{ pointerEvents: "stroke", cursor: "move" }} />
          {strokeW > 0 && strokeColor !== "none" && (
            <polyline points="65,2 96,2 96,98 65,98" fill="none" stroke={strokeColor} strokeWidth={strokeW} strokeLinecap="square" strokeLinejoin="miter" vectorEffect="non-scaling-stroke" style={{ pointerEvents: "stroke", cursor: "move" }} />
          )}
        </svg>
      </div>
    );
  }

  let svgShapeNode = null;
  if (hasCustomPath) {
    svgShapeNode = (
      <path
        d={generateSvgPathFromNodes(layer.customPath)}
        fill={svgFill}
        stroke={strokeColor}
        strokeWidth={strokeW}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        style={{ pointerEvents: "auto", cursor: "move" }}
      />
    );
  } else if (shape === "circle" || shape === "ellipse") {
    svgShapeNode = (
      <ellipse
        cx="50"
        cy="50"
        rx="49"
        ry="49"
        fill={svgFill}
        stroke={strokeColor}
        strokeWidth={strokeW}
        vectorEffect="non-scaling-stroke"
        style={{ pointerEvents: "auto", cursor: "move" }}
      />
    );
  } else if (shape === "parallelogram") {
    svgShapeNode = (
      <polygon
        points="12,2 98,2 88,98 2,98"
        fill={svgFill}
        stroke={strokeColor}
        strokeWidth={strokeW}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        style={{ pointerEvents: "auto", cursor: "move" }}
      />
    );
  } else if (shape === "triangle") {
    svgShapeNode = (
      <polygon
        points="50,2 98,98 2,98"
        fill={svgFill}
        stroke={strokeColor}
        strokeWidth={strokeW}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        style={{ pointerEvents: "auto", cursor: "move" }}
      />
    );
  } else if (shape === "diamond") {
    svgShapeNode = (
      <polygon
        points="50,2 98,50 50,98 2,50"
        fill={svgFill}
        stroke={strokeColor}
        strokeWidth={strokeW}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        style={{ pointerEvents: "auto", cursor: "move" }}
      />
    );
  } else if (shape === "pentagon") {
    svgShapeNode = (
      <polygon
        points="50,2 97.55,36.5 79.39,94 20.61,94 2.45,36.5"
        fill={svgFill}
        stroke={strokeColor}
        strokeWidth={strokeW}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        style={{ pointerEvents: "auto", cursor: "move" }}
      />
    );
  } else if (shape === "hexagon") {
    svgShapeNode = (
      <polygon
        points="50,2 96,26.5 96,73.5 50,98 4,73.5 4,26.5"
        fill={svgFill}
        stroke={strokeColor}
        strokeWidth={strokeW}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        style={{ pointerEvents: "auto", cursor: "move" }}
      />
    );
  } else if (shape === "star") {
    svgShapeNode = (
      <polygon
        points="50,2 61.8,36.5 98,36.5 68.7,57.8 79.9,93.5 50,71.8 20.1,93.5 31.3,57.8 2,36.5 38.2,36.5"
        fill={svgFill}
        stroke={strokeColor}
        strokeWidth={strokeW}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        style={{ pointerEvents: "auto", cursor: "move" }}
      />
    );
  } else {
    svgShapeNode = (
      <rect
        x="2"
        y="2"
        width="96"
        height="96"
        rx={typeof layer.borderRadius === "number" ? layer.borderRadius : 0}
        fill={svgFill}
        stroke={strokeColor}
        strokeWidth={strokeW}
        vectorEffect="non-scaling-stroke"
        style={{ pointerEvents: "auto", cursor: "move" }}
      />
    );
  }

  const angleRad = (((layer.gradient?.angle ?? 90) - 90) * Math.PI) / 180;
  const x1 = Math.round(50 - 50 * Math.cos(angleRad));
  const y1 = Math.round(50 - 50 * Math.sin(angleRad));
  const x2 = Math.round(50 + 50 * Math.cos(angleRad));
  const y2 = Math.round(50 + 50 * Math.sin(angleRad));

  return (
    <div
      data-studio-shape-content="true"
      style={{
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        filter: shadowFilter,
      }}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible" style={{ pointerEvents: "none" }}>
        <defs>
          {gradientCss && layer.gradient && (
            (layer.gradient.type === "radial" || layer.fillType === "radial-gradient") ? (
              <radialGradient id={gradId} cx={`${layer.gradient.radialCenter?.x ?? 50}%`} cy={`${layer.gradient.radialCenter?.y ?? 50}%`} r="50%">
                {(layer.gradient.stops || []).map((s, idx) => (
                  <stop key={idx} offset={`${s.position}%`} stopColor={s.color} stopOpacity={s.opacity ?? 1} />
                ))}
              </radialGradient>
            ) : (
              <linearGradient id={gradId} x1={`${x1}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y2}%`}>
                {(layer.gradient.stops || []).map((s, idx) => (
                  <stop key={idx} offset={`${s.position}%`} stopColor={s.color} stopOpacity={s.opacity ?? 1} />
                ))}
              </linearGradient>
            )
          )}
          {layer.maskImage && layer.maskImage.url && (
            <clipPath id={clipId}>
              {svgShapeNode}
            </clipPath>
          )}
        </defs>

        {/* Base shape or clipped image container */}
        {layer.maskImage && layer.maskImage.url ? (
          <g clipPath={`url(#${clipId})`}>
            {svgShapeNode}
            <image
              href={layer.maskImage.url}
              x={`${(layer.maskImage.panX || 0)}%`}
              y={`${(layer.maskImage.panY || 0)}%`}
              width="100%"
              height="100%"
              preserveAspectRatio={layer.maskImage.fitMode === "fit" ? "xMidYMid meet" : "xMidYMid slice"}
              style={{
                transform: `scale(${layer.maskImage.zoom || 1})`,
                transformOrigin: "center center",
                pointerEvents: "none",
              }}
            />
          </g>
        ) : (
          svgShapeNode
        )}
      </svg>
    </div>
  );
}


function createEmptyDesign(name = "New Overlay Design") {
  return {
    id: `design_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    name,
    target: "stream",
    layers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export default function LiveDesignStudioModal({
  isOpen,
  onClose,
  cameraStreams,
  effectiveProgramSourceId,
  getSourceName,
  liveBroadcastConfig,
  onUpdateBroadcastConfig,
  showFeedback: externalShowFeedback,
}) {
  const electron = typeof window !== "undefined" ? window.electron : null;
  const designApi = electron?.DesignStudio;

  // In-modal Toast State for immediate actionable feedback to operator
  const [modalToast, setModalToast] = useState(null); // { message, isSuccess }
  const toastTimeoutRef = useRef(null);

  const showFeedback = useCallback((message, isSuccess = true) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setModalToast({ message, isSuccess });
    toastTimeoutRef.current = setTimeout(() => {
      setModalToast(null);
    }, 3500);
    if (typeof externalShowFeedback === "function") {
      externalShowFeedback(message, isSuccess);
    }
  }, [externalShowFeedback]);

  // Designs list & active design
  const [designs, setDesigns] = useState([]);
  const [currentDesign, setCurrentDesign] = useState(() => {
    try {
      const saved = localStorage.getItem("ocs_live_studio_active_design");
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return createEmptyDesign("Main Live Overlay");
  });

  const [selectedLayerIds, setSelectedLayerIds] = useState([]);
  const selectedLayerIdsRef = useRef(selectedLayerIds);
  selectedLayerIdsRef.current = selectedLayerIds;
  const selectedLayerId = selectedLayerIds[selectedLayerIds.length - 1] || null;
  const setSelectedLayerId = useCallback((id) => {
    let next;
    if (!id) next = [];
    else if (Array.isArray(id)) next = id;
    else next = [id];
    selectedLayerIdsRef.current = next;
    setSelectedLayerIds(next);
  }, []);

  const [editingTextLayerId, setEditingTextLayerId] = useState(null);
  const [activeToolTab, setActiveToolTab] = useState("templates"); // 'templates' | 'text' | 'shapes' | 'images' | 'layers'
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState("All");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [moveGroupWithSelected, setMoveGroupWithSelected] = useState(false);
  const [showAdvancedInspector, setShowAdvancedInspector] = useState(false);
  const [roleAssignments, setRoleAssignments] = useState({ bible: null, announcement: null, speaker: null });

  // Background removal state
  const [bgRemovalProcessing, setBgRemovalProcessing] = useState(false);
  const [bgRemovalProgress, setBgRemovalProgress] = useState(0);
  const bgRemovalAbortRef = useRef(null);

  // Gradient stop inspector state
  const [activeGradStopIndex, setActiveGradStopIndex] = useState(0);

  // Transition preview trigger state
  const [previewAnimationActive, setPreviewAnimationActive] = useState(false);

  // Undo / Redo Stacks
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // Viewport Zoom & Pan State (Editor view only — isolated from saved design and broadcast)
  const viewportRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [activeTool, setActiveTool] = useState("select"); // "select" | "hand"
  const [isPanning, setIsPanning] = useState(false);
  const [showRulers, setShowRulers] = useState(true);
  const [cursorCanvasPos, setCursorCanvasPos] = useState({ x: null, y: null });
  const [rulerMetrics, setRulerMetrics] = useState({ canvasRect: null, viewportRect: null });
  const panStartRef = useRef({ startX: 0, startY: 0, origPan: { x: 0, y: 0 } });

  // Shape curves & clipping mask state
  const [editingShapeLayerId, setEditingShapeLayerId] = useState(null);
  const [activeCurveNodeIdx, setActiveCurveNodeIdx] = useState(null);
  const [editingCropLayerId, setEditingCropLayerId] = useState(null); // ID of shape with mask or image whose crop/pan is being edited
  const [editingCropTarget, setEditingCropTarget] = useState("image"); // "image" | "frame"
  const [cornersLinked, setCornersLinked] = useState(true);
  const maskFileInputRef = useRef(null);
  const maskTargetLayerIdRef = useRef(null);

  // Canvas interaction refs & animation frame throttling
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const animFrameRef = useRef(null);
  const pendingMouseCoordsRef = useRef(null);
  const fileInputRef = useRef(null);
  const previewVideoRef = useRef(null);
  const currentDesignRef = useRef(currentDesign);
  currentDesignRef.current = currentDesign;

  // Nudge coalescing ref & timer for held arrow keys
  const isNudgingRef = useRef(false);
  const nudgeTimerRef = useRef(null);

  // Alignment guide indicator
  const [snapGuide, setSnapGuide] = useState({ x: false, y: false });

  // Existing saved controls tracking for explicit updates
  const [existingControls, setExistingControls] = useState([]);
  const [selectedUpdateControlId, setSelectedUpdateControlId] = useState("");

  const refreshExistingControls = useCallback(async () => {
    try {
      if (designApi?.listLiveControls) {
        const res = await designApi.listLiveControls();
        if (res && Array.isArray(res.liveControls)) {
          setExistingControls(res.liveControls);
          if (res.liveControls.length > 0) {
            setSelectedUpdateControlId((prev) => prev && res.liveControls.some((c) => c.id === prev) ? prev : res.liveControls[0].id);
          }
        }
      } else {
        const stored = JSON.parse(localStorage.getItem("ocs_live_controls") || "[]");
        setExistingControls(stored);
        if (stored.length > 0) {
          setSelectedUpdateControlId((prev) => prev && stored.some((c) => c.id === prev) ? prev : stored[0].id);
        }
      }
    } catch (_) {}
  }, [designApi]);

  useEffect(() => {
    if (isOpen) {
      refreshExistingControls();
    }
  }, [isOpen, refreshExistingControls]);

  // Storage synchronization without blocking pointer events
  const saveTimeoutRef = useRef(null);
  const syncToLocalStorage = useCallback((design) => {
    try {
      localStorage.setItem("ocs_live_studio_active_design", JSON.stringify(design));
      localStorage.setItem("ocs_live_studio_layers", JSON.stringify(design.layers));
    } catch (_) {}
  }, []);

  const debouncedSyncToLocalStorage = useCallback((design) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      syncToLocalStorage(design);
    }, 600);
  }, [syncToLocalStorage]);

  useEffect(() => {
    debouncedSyncToLocalStorage(currentDesign);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [currentDesign, debouncedSyncToLocalStorage]);

  // Stable preview video pipeline — set srcObject only when stream actually changes
  useEffect(() => {
    if (!isOpen) return;
    const videoEl = previewVideoRef.current;
    if (!videoEl) return;
    const stream = cameraStreams?.get ? cameraStreams.get(effectiveProgramSourceId) : null;
    if (stream) {
      if (videoEl.srcObject !== stream) {
        videoEl.srcObject = stream;
        videoEl.play().catch(() => {});
      }
    } else {
      if (videoEl.srcObject) {
        videoEl.srcObject = null;
      }
    }
  }, [isOpen, cameraStreams, effectiveProgramSourceId]);

  // Clean up animation frames and timers when modal closes
  useEffect(() => {
    if (!isOpen) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      if (nudgeTimerRef.current) {
        clearTimeout(nudgeTimerRef.current);
        nudgeTimerRef.current = null;
      }
      pendingMouseCoordsRef.current = null;
      dragRef.current = null;
      isNudgingRef.current = false;
    }
  }, [isOpen]);

  // Load saved designs from DesignStudio service on mount
  useEffect(() => {
    if (isOpen && designApi?.listDesigns) {
      designApi.listDesigns().then((res) => {
        if (res?.ok && Array.isArray(res.designs)) {
          setDesigns(res.designs);
        }
      }).catch((err) => console.warn("Could not list designs:", err));
    }
  }, [isOpen, designApi]);

  // Load role assignments on mount and subscribe to updates
  const refreshRoleAssignments = useCallback(async () => {
    try {
      if (designApi?.getRoleAssignments) {
        const res = await designApi.getRoleAssignments();
        if (res?.ok && res.roleAssignments) {
          setRoleAssignments(res.roleAssignments);
        }
      }
    } catch (err) {
      console.warn("Could not load role assignments:", err);
    }
  }, [designApi]);

  useEffect(() => {
    if (isOpen) {
      refreshRoleAssignments();
      if (designApi?.onRoleAssignmentsChanged) {
        const unsub = designApi.onRoleAssignmentsChanged((updated) => {
          if (updated) setRoleAssignments(updated);
        });
        return () => {
          if (typeof unsub === "function") unsub();
        };
      }
    }
  }, [isOpen, refreshRoleAssignments, designApi]);

  const handleSetRoleDefault = useCallback(async (role, templateId) => {
    try {
      if (!role || role === "custom") {
        showFeedback("Please select a specific role (e.g. Bible Lower-Third) before setting default", false);
        return;
      }

      // Check validation first
      const val = validateRoleTemplate(currentDesign);
      if (!val.valid) {
        showFeedback(`Cannot set default: ${val.message || ("Missing " + val.missingFields.join(", "))}`, false);
        return;
      }

      // Automatically save the current valid design before assigning it!
      let savedDesign = currentDesign;
      if (designApi?.saveDesign) {
        const saveRes = await designApi.saveDesign({
          ...currentDesign,
          role,
        });
        if (saveRes?.ok && saveRes.design) {
          savedDesign = saveRes.design;
          setCurrentDesign(savedDesign);
          setHasUnsavedChanges(false);
          setDesigns((prev) => {
            const idx = prev.findIndex((d) => d.id === savedDesign.id);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = savedDesign;
              return copy;
            }
            return [...prev, savedDesign];
          });
        }
      }

      if (designApi?.setRoleAssignment) {
        const res = await designApi.setRoleAssignment(role, savedDesign.id);
        if (res?.ok && res.roleAssignments) {
          setRoleAssignments(res.roleAssignments);
          showFeedback(`Saved and set "${savedDesign.name}" as default ${role} template`, true);
        }
      }
    } catch (err) {
      showFeedback(`Failed to set default: ${err.message}`, false);
    }
  }, [currentDesign, designApi, showFeedback]);

  // Push history snapshot before mutating layers
  const pushUndoSnapshot = useCallback(() => {
    setUndoStack((prev) => {
      const snapshot = {
        design: JSON.parse(JSON.stringify(currentDesignRef.current)),
        selectedLayerIds,
        selectedLayerId,
      };
      const next = [...prev, snapshot];
      if (next.length > MAX_UNDO_STACK) next.shift();
      return next;
    });
    setRedoStack([]);
    setHasUnsavedChanges(true);
  }, [selectedLayerIds, selectedLayerId]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    const newUndo = undoStack.slice(0, -1);
    const currentSnapshot = {
      design: JSON.parse(JSON.stringify(currentDesign)),
      selectedLayerIds,
      selectedLayerId,
    };

    setRedoStack((prev) => [...prev, currentSnapshot]);
    setUndoStack(newUndo);

    const prevDesign = previous.design || previous;
    const prevSelIds = previous.selectedLayerIds || (previous.selectedLayerId ? [previous.selectedLayerId] : []);
    setCurrentDesign(prevDesign);
    selectedLayerIdsRef.current = prevSelIds;
    setSelectedLayerIds(prevSelIds);
    setHasUnsavedChanges(true);
  }, [undoStack, currentDesign, selectedLayerIds, selectedLayerId]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    const newRedo = redoStack.slice(0, -1);
    const currentSnapshot = {
      design: JSON.parse(JSON.stringify(currentDesign)),
      selectedLayerIds,
      selectedLayerId,
    };

    setUndoStack((prev) => [...prev, currentSnapshot]);
    setRedoStack(newRedo);

    const nextDesign = next.design || next;
    const nextSelIds = next.selectedLayerIds || (next.selectedLayerId ? [next.selectedLayerId] : []);
    setCurrentDesign(nextDesign);
    selectedLayerIdsRef.current = nextSelIds;
    setSelectedLayerIds(nextSelIds);
    setHasUnsavedChanges(true);
  }, [redoStack, currentDesign, selectedLayerIds, selectedLayerId]);

  // Keyboard movement & deletion listeners
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      // Do not intercept keystrokes while the user is typing in a text box, number input, textarea, or editable text area
      const target = e.target;
      const isEditable = target && (
        target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.getAttribute?.("contenteditable") === "true" ||
        target.closest?.("[contenteditable='true']")
      );
      if (isEditable || editingTextLayerId) return;

      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        setIsSpacePressed(true);
        return;
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key.toLowerCase() === "h") {
          e.preventDefault();
          setActiveTool((prev) => (prev === "hand" ? "select" : "hand"));
          return;
        }
        if (e.key.toLowerCase() === "v") {
          e.preventDefault();
          setActiveTool("select");
          return;
        }
      }

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
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (selectedLayerIds.length > 0) {
          handleDuplicateSelected();
        }
      } else if (e.key === "Escape") {
        if (editingCropLayerId) {
          e.preventDefault();
          setEditingCropLayerId(null);
          setEditingCropTarget("image");
          showFeedback("Exited crop editing", true);
          return;
        }
        if (editingShapeLayerId) {
          e.preventDefault();
          setEditingShapeLayerId(null);
          return;
        }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedLayerIds.length > 0) {
          e.preventDefault();
          handleDeleteSelected();
        }
      } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        if (selectedLayerIds.length > 0) {
          // Prevent arrow-key page scrolling when handling canvas movement
          e.preventDefault();
          const mult = e.shiftKey ? 2 : 0.4;
          const dx = e.key === "ArrowLeft" ? -mult : e.key === "ArrowRight" ? mult : 0;
          const dy = e.key === "ArrowUp" ? -mult : e.key === "ArrowDown" ? mult : 0;

          // Coalesce a held arrow key into one undo operation
          if (!isNudgingRef.current) {
            pushUndoSnapshot();
            isNudgingRef.current = true;
          }
          if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
          nudgeTimerRef.current = setTimeout(() => {
            isNudgingRef.current = false;
          }, 450);

          // An individually selected child moves independently; multiple selected elements move together preserving spacing
          const targetIds = new Set(selectedLayerIds);
          setCurrentDesign((prev) => ({
            ...prev,
            layers: prev.layers.map((l) => {
              if (targetIds.has(l.id)) {
                return {
                  ...l,
                  x: Math.max(0, Math.min(100, Number((l.x + dx).toFixed(4)))),
                  y: Math.max(0, Math.min(100, Number((l.y + dy).toFixed(4)))),
                };
              }
              return l;
            }),
          }));
          setHasUnsavedChanges(true);
        }
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === "Space" || e.key === " ") {
        setIsSpacePressed(false);
        setIsPanning(false);
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        isNudgingRef.current = false;
        if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
      isNudgingRef.current = false;
    };
  }, [isOpen, selectedLayerIds, editingTextLayerId, handleUndo, handleRedo, pushUndoSnapshot]);

  const updateRulerMetrics = useCallback(() => {
    if (canvasRef.current && viewportRef.current) {
      setRulerMetrics({
        canvasRect: canvasRef.current.getBoundingClientRect(),
        viewportRect: viewportRef.current.getBoundingClientRect(),
      });
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updateRulerMetrics();
    const handleResize = () => updateRulerMetrics();
    window.addEventListener("resize", handleResize);
    const id = requestAnimationFrame(updateRulerMetrics);
    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(id);
    };
  }, [isOpen, zoom, panOffset, updateRulerMetrics]);

  // ─── Layer Mutators ─────────────────────────────────────────────────────────

  const updateLayer = (layerId, patch) => {
    pushUndoSnapshot();
    setCurrentDesign((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => (l.id === layerId ? { ...l, ...patch } : l)),
    }));
  };

  const updateLayerDraft = (layerId, patch) => {
    setCurrentDesign((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => (l.id === layerId ? { ...l, ...patch } : l)),
    }));
    setHasUnsavedChanges(true);
  };

  const selectedLayer = currentDesign.layers.find((l) => l.id === selectedLayerId) || null;

  const handleDeleteSelected = () => {
    if (selectedLayerIds.length === 0) return;
    pushUndoSnapshot();
    const idsToDelete = new Set(selectedLayerIds);
    setCurrentDesign((prev) => ({
      ...prev,
      layers: prev.layers.filter((l) => !idsToDelete.has(l.id)),
    }));
    setSelectedLayerIds([]);
    showFeedback(idsToDelete.size > 1 ? `Deleted ${idsToDelete.size} layers` : "Layer removed from preview", true);
  };

  const handleDuplicateSelected = () => {
    if (selectedLayerIds.length === 0) return;
    pushUndoSnapshot();
    const newLayers = [];
    const newSelectedIds = [];
    currentDesign.layers.forEach((l) => {
      if (selectedLayerIds.includes(l.id)) {
        const cloned = {
          ...JSON.parse(JSON.stringify(l)),
          id: `layer_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          name: `${l.name} (Copy)`,
          x: Math.min(92, (l.x || 50) + 2),
          y: Math.min(92, (l.y || 50) + 2),
          zIndex: (currentDesign.layers.length + newLayers.length + 1) * 10,
        };
        newLayers.push(cloned);
        newSelectedIds.push(cloned.id);
      }
    });
    setCurrentDesign((prev) => ({
      ...prev,
      layers: [...prev.layers, ...newLayers],
    }));
    setSelectedLayerIds(newSelectedIds);
    showFeedback(`Duplicated ${newLayers.length} element(s)`, true);
  };

  const handleAlignSelected = (alignmentType) => {
    if (selectedLayerIds.length < 2) return;
    pushUndoSnapshot();

    const eligibleLayers = currentDesign.layers.filter(
      (l) => selectedLayerIds.includes(l.id) && l.visible !== false
    );
    if (eligibleLayers.length < 2) return;

    // Group selected layers by groupId if multiple selected layers share the same group
    // If only one child of a group is selected, it aligns as an individual target
    const groupCount = {};
    eligibleLayers.forEach((l) => {
      if (l.groupId) groupCount[l.groupId] = (groupCount[l.groupId] || 0) + 1;
    });

    const units = [];
    const processedGroupIds = new Set();

    eligibleLayers.forEach((l) => {
      if (l.groupId && groupCount[l.groupId] > 1) {
        if (!processedGroupIds.has(l.groupId)) {
          processedGroupIds.add(l.groupId);
          const groupLayers = eligibleLayers.filter((gl) => gl.groupId === l.groupId);
          units.push({
            isGroup: true,
            layers: groupLayers,
          });
        }
      } else {
        units.push({
          isGroup: false,
          layers: [l],
        });
      }
    });

    // Compute bounding box for each unit
    let allMinL = Infinity;
    let allMaxR = -Infinity;
    let allMinT = Infinity;
    let allMaxB = -Infinity;

    units.forEach((unit) => {
      let uMinL = Infinity;
      let uMaxR = -Infinity;
      let uMinT = Infinity;
      let uMaxB = -Infinity;

      unit.layers.forEach((l) => {
        const w = typeof l.width === "number" ? l.width : 20;
        const h = typeof l.height === "number" ? l.height : (l.type === "image" ? ((w * (16 / 9)) / (l.aspectRatio || 1.777778)) : (l.type === "text" ? 6 : 12));
        const lLeft = (l.x ?? 50) - w / 2;
        const lRight = (l.x ?? 50) + w / 2;
        const lTop = (l.y ?? 50) - h / 2;
        const lBottom = (l.y ?? 50) + h / 2;
        if (lLeft < uMinL) uMinL = lLeft;
        if (lRight > uMaxR) uMaxR = lRight;
        if (lTop < uMinT) uMinT = lTop;
        if (lBottom > uMaxB) uMaxB = lBottom;
      });

      unit.bounds = {
        minL: uMinL,
        maxR: uMaxR,
        minT: uMinT,
        maxB: uMaxB,
        w: uMaxR - uMinL,
        h: uMaxB - uMinT,
        cx: (uMinL + uMaxR) / 2,
        cy: (uMinT + uMaxB) / 2,
      };

      if (uMinL < allMinL) allMinL = uMinL;
      if (uMaxR > allMaxR) allMaxR = uMaxR;
      if (uMinT < allMinT) allMinT = uMinT;
      if (uMaxB > allMaxB) allMaxB = uMaxB;
    });

    const allCenterX = (allMinL + allMaxR) / 2;
    const allCenterY = (allMinT + allMaxB) / 2;

    const updatedMap = {};
    units.forEach((unit) => {
      let shiftX = 0;
      let shiftY = 0;

      switch (alignmentType) {
        case "left":
          shiftX = allMinL - unit.bounds.minL;
          break;
        case "center-h":
          shiftX = allCenterX - unit.bounds.cx;
          break;
        case "right":
          shiftX = allMaxR - unit.bounds.maxR;
          break;
        case "top":
          shiftY = allMinT - unit.bounds.minT;
          break;
        case "center-v":
          shiftY = allCenterY - unit.bounds.cy;
          break;
        case "bottom":
          shiftY = allMaxB - unit.bounds.maxB;
          break;
        default:
          break;
      }

      unit.layers.forEach((l) => {
        updatedMap[l.id] = {
          x: Number(Math.max(2, Math.min(98, l.x + shiftX)).toFixed(4)),
          y: Number(Math.max(2, Math.min(98, l.y + shiftY)).toFixed(4)),
        };
      });
    });

    setCurrentDesign((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => (updatedMap[l.id] ? { ...l, ...updatedMap[l.id] } : l)),
    }));
    setHasUnsavedChanges(true);
    showFeedback(`Aligned ${eligibleLayers.length} elements (${alignmentType})`, true);
  };

  const handleDeleteLayer = (layerId) => {
    pushUndoSnapshot();
    setCurrentDesign((prev) => ({
      ...prev,
      layers: prev.layers.filter((l) => l.id !== layerId),
    }));
    setSelectedLayerIds((prev) => prev.filter((id) => id !== layerId));
    showFeedback("Layer removed from preview", true);
  };

  const handleDuplicateLayer = (layerId) => {
    const src = currentDesign.layers.find((l) => l.id === layerId);
    if (!src) return;
    pushUndoSnapshot();
    const cloned = {
      ...JSON.parse(JSON.stringify(src)),
      id: `layer_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: `${src.name} (Copy)`,
      x: Math.min(90, (src.x || 50) + 4),
      y: Math.min(90, (src.y || 50) + 4),
      zIndex: (currentDesign.layers.length + 1) * 10,
    };
    setCurrentDesign((prev) => ({
      ...prev,
      layers: [...prev.layers, cloned],
    }));
    setSelectedLayerId(cloned.id);
    showFeedback(`Duplicated ${src.name}`, true);
  };

  // ─── Layer Ordering ─────────────────────────────────────────────────────────

  const handleBringForward = (layerId) => {
    const idx = currentDesign.layers.findIndex((l) => l.id === layerId);
    if (idx === -1 || idx === currentDesign.layers.length - 1) return;
    pushUndoSnapshot();
    const arr = [...currentDesign.layers];
    const item = arr.splice(idx, 1)[0];
    arr.splice(idx + 1, 0, item);
    reindexLayers(arr);
  };

  const handleSendBackward = (layerId) => {
    const idx = currentDesign.layers.findIndex((l) => l.id === layerId);
    if (idx <= 0) return;
    pushUndoSnapshot();
    const arr = [...currentDesign.layers];
    const item = arr.splice(idx, 1)[0];
    arr.splice(idx - 1, 0, item);
    reindexLayers(arr);
  };

  const handleBringToFront = (layerId) => {
    const idx = currentDesign.layers.findIndex((l) => l.id === layerId);
    if (idx === -1 || idx === currentDesign.layers.length - 1) return;
    pushUndoSnapshot();
    const arr = [...currentDesign.layers];
    const item = arr.splice(idx, 1)[0];
    arr.push(item);
    reindexLayers(arr);
  };

  const handleSendToBack = (layerId) => {
    const idx = currentDesign.layers.findIndex((l) => l.id === layerId);
    if (idx <= 0) return;
    pushUndoSnapshot();
    const arr = [...currentDesign.layers];
    const item = arr.splice(idx, 1)[0];
    arr.unshift(item);
    reindexLayers(arr);
  };

  const reindexLayers = (arr) => {
    const reindexed = arr.map((l, i) => ({ ...l, zIndex: (i + 1) * 10 }));
    setCurrentDesign((prev) => ({ ...prev, layers: reindexed }));
  };

  // ─── Grouping & Ungrouping ──────────────────────────────────────────────────

  const handleToggleGroup = (layerId) => {
    const l = currentDesign.layers.find((layer) => layer.id === layerId);
    if (!l) return;
    pushUndoSnapshot();
    if (l.groupId) {
      // Ungroup
      setCurrentDesign((prev) => ({
        ...prev,
        layers: prev.layers.map((layer) => (layer.groupId === l.groupId ? { ...layer, groupId: null } : layer)),
      }));
      showFeedback("Layers ungrouped", true);
    } else {
      // Group with next layer or make a group
      const newGroupId = `grp_${Date.now()}`;
      setCurrentDesign((prev) => ({
        ...prev,
        layers: prev.layers.map((layer) => (layer.id === layerId ? { ...layer, groupId: newGroupId } : layer)),
      }));
      showFeedback("Created group for layer", true);
    }
  };

  // ─── Alignment Presets ──────────────────────────────────────────────────────

  const applyAlignmentPreset = (preset) => {
    if (!selectedLayer) return;
    switch (preset) {
      case "tl":
        updateLayer(selectedLayer.id, { x: 15, y: 15 });
        break;
      case "tr":
        updateLayer(selectedLayer.id, { x: 85, y: 15 });
        break;
      case "bl":
        updateLayer(selectedLayer.id, { x: 25, y: 88 });
        break;
      case "br":
        updateLayer(selectedLayer.id, { x: 80, y: 88 });
        break;
      case "center":
        updateLayer(selectedLayer.id, { x: 50, y: 50 });
        break;
      case "lower-third":
        updateLayer(selectedLayer.id, { x: 50, y: 88 });
        break;
      default:
        break;
    }
  };

  // ─── Adding New Items ───────────────────────────────────────────────────────

  const handleAddTemplate = (tmpl) => {
    pushUndoSnapshot();
    const newGroupId = `grp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const clonedLayers = tmpl.layers.map((l, i) => ({
      ...JSON.parse(JSON.stringify(l)),
      id: `layer_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 4)}`,
      groupId: newGroupId,
      zIndex: (currentDesign.layers.length + i + 1) * 10,
    }));
    setCurrentDesign((prev) => ({
      ...prev,
      layers: [...prev.layers, ...clonedLayers],
    }));
    const newIds = clonedLayers.map((l) => l.id);
    selectedLayerIdsRef.current = newIds;
    setSelectedLayerIds(newIds);
    setEditingTextLayerId(null);
    setHasUnsavedChanges(true);
    showFeedback(`Applied "${tmpl.name}" template to draft`, true);
  };

  const handleAddText = (type = "heading") => {
    pushUndoSnapshot();
    const isHeading = type === "heading";
    const isSub = type === "sub";
    const newLayer = {
      id: `layer_txt_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      type: "text",
      name: isHeading ? "Heading Text" : isSub ? "Subtitle Text" : "Body Text",
      text: isHeading ? "Main Heading" : isSub ? "Speaker Subtitle" : "Announcement body text",
      fontFamily: "Inter, sans-serif",
      fontSize: isHeading ? 28 : isSub ? 18 : 14,
      fontWeight: isHeading ? "bold" : isSub ? "600" : "normal",
      color: "#ffffff",
      textAlign: "left",
      textTransform: "none",
      x: 50,
      y: isHeading ? 75 : isSub ? 82 : 88,
      width: 40,
      rotation: 0,
      opacity: 1,
      visible: true,
      zIndex: (currentDesign.layers.length + 1) * 10,
    };
    setCurrentDesign((prev) => ({ ...prev, layers: [...prev.layers, newLayer] }));
    setSelectedLayerId(newLayer.id);
    showFeedback("Text box added to canvas", true);
  };

  const handleAddShape = (shape = "rounded-rect") => {
    pushUndoSnapshot();
    const isLine = shape === "line";
    const isArrow = shape === "arrow";
    const isLineOrArrow = isLine || isArrow;
    const isRegular = ["square", "circle", "triangle", "diamond", "pentagon", "hexagon", "star"].includes(shape);

    let defaultName = "Shape";
    let defaultWidth = 35;
    let defaultHeight = 20;
    let defaultRadius = 0;

    switch (shape) {
      case "rectangle":
        defaultName = "Rectangle";
        defaultWidth = 45;
        defaultHeight = 25;
        defaultRadius = 0;
        break;
      case "rounded-rect":
        defaultName = "Rounded Rect";
        defaultWidth = 45;
        defaultHeight = 25;
        defaultRadius = 12;
        break;
      case "square":
        defaultName = "Square";
        defaultWidth = 18;
        defaultHeight = 32;
        defaultRadius = 0;
        break;
      case "circle":
        defaultName = "Circle";
        defaultWidth = 18;
        defaultHeight = 32;
        defaultRadius = 9999;
        break;
      case "ellipse":
        defaultName = "Ellipse";
        defaultWidth = 35;
        defaultHeight = 22;
        defaultRadius = 9999;
        break;
      case "triangle":
        defaultName = "Triangle";
        defaultWidth = 18;
        defaultHeight = 32;
        break;
      case "diamond":
        defaultName = "Diamond";
        defaultWidth = 18;
        defaultHeight = 32;
        break;
      case "pentagon":
        defaultName = "Pentagon";
        defaultWidth = 18;
        defaultHeight = 32;
        break;
      case "hexagon":
        defaultName = "Hexagon";
        defaultWidth = 18;
        defaultHeight = 32;
        break;
      case "star":
        defaultName = "Star";
        defaultWidth = 20;
        defaultHeight = 35.5;
        break;
      case "line":
        defaultName = "Divider Line";
        defaultWidth = 30;
        defaultHeight = 1;
        break;
      case "arrow":
        defaultName = "Arrow";
        defaultWidth = 30;
        defaultHeight = 6;
        break;
      default:
        defaultName = "Shape";
        defaultWidth = 35;
        defaultHeight = 20;
    }

    const newLayer = {
      id: `layer_shp_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      type: "shape",
      name: defaultName,
      shape,
      fill: isLineOrArrow ? "transparent" : "#581c87",
      stroke: isLineOrArrow ? "#f59e0b" : "#a855f7",
      strokeWidth: isLineOrArrow ? 3 : 2,
      borderRadius: defaultRadius,
      aspectLocked: isRegular,
      x: 50,
      y: 85,
      width: defaultWidth,
      height: defaultHeight,
      rotation: 0,
      opacity: 0.95,
      visible: true,
      zIndex: (currentDesign.layers.length + 1) * 10,
    };
    setCurrentDesign((prev) => ({ ...prev, layers: [...prev.layers, newLayer] }));
    setSelectedLayerId(newLayer.id);
    showFeedback(`Added ${newLayer.name} to canvas`, true);
  };

  const handleImportImage = async (replaceLayerId = null) => {
    try {
      let fileUrl = null;
      let fileName = "Overlay Image";
      let res = null;

      if (designApi?.importImage) {
        res = await designApi.importImage();
        if (res?.canceled) return;
        if (res?.ok && res.asset) {
          fileUrl = res.asset.url || (res.asset.filePath ? `file://${res.asset.filePath}` : null);
          fileName = res.asset.originalName || "Overlay Image";
        } else if (res?.error) {
          showFeedback(res.error, false);
          return;
        }
      } else if (electron?.Media?.import) {
        res = await electron.Media.import();
        if (res?.files && res.files.length > 0) {
          fileUrl = res.files[0].url || res.files[0].path;
          fileName = res.files[0].name || "Overlay Image";
        }
      } else {
        // Web / browser fallback: trigger hidden file input
        if (fileInputRef.current) {
          fileInputRef.current.dataset.replaceLayerId = replaceLayerId || "";
          fileInputRef.current.click();
          return;
        }
      }

      if (!fileUrl) {
        if (fileInputRef.current) {
          fileInputRef.current.dataset.replaceLayerId = replaceLayerId || "";
          fileInputRef.current.click();
        }
        return;
      }

      pushUndoSnapshot();

      if (replaceLayerId) {
        setCurrentDesign((prev) => ({
          ...prev,
          layers: prev.layers.map((l) =>
            l.id === replaceLayerId
              ? {
                  ...l,
                  content: fileUrl,
                  url: fileUrl,
                  name: fileName,
                  filePath: res?.asset?.filePath || l.filePath || null,
                  assetId: res?.asset?.assetId || l.assetId || null,
                  aspectRatio: res?.asset?.aspectRatio || l.aspectRatio || 1.777,
                }
              : l
          ),
        }));
        showFeedback(`Replaced image with "${fileName}"`, true);
      } else {
        const aspect = res?.asset?.aspectRatio || 1.777;
        const newLayer = {
          id: `layer_img_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          type: "image",
          name: fileName,
          content: fileUrl,
          url: fileUrl,
          filePath: res?.asset?.filePath || null,
          assetId: res?.asset?.assetId || null,
          x: 50,
          y: 75,
          width: 30,
          height: parseFloat(((30 * (16 / 9)) / aspect).toFixed(2)),
          rotation: 0,
          opacity: 1,
          visible: true,
          aspectRatio: aspect,
          aspectLocked: true,
          zIndex: (currentDesign.layers.length + 1) * 10,
        };
        setCurrentDesign((prev) => ({ ...prev, layers: [...prev.layers, newLayer] }));
        setSelectedLayerId(newLayer.id);
        showFeedback(`Added "${fileName}" to canvas`, true);
      }
    } catch (err) {
      showFeedback(`Import failed: ${err.message}`, false);
    }
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const replaceLayerId = e.target.dataset.replaceLayerId || null;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const img = new Image();
      img.onload = () => {
        const aspect = img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1.777;
        const calcHeight = parseFloat(((30 * (16 / 9)) / aspect).toFixed(2));
        if (replaceLayerId) {
          const targetL = currentDesign.layers.find((l) => l.id === replaceLayerId);
          const w = targetL?.width || 30;
          updateLayer(replaceLayerId, {
            content: dataUrl,
            url: dataUrl,
            name: file.name,
            aspectRatio: aspect,
            height: parseFloat(((w * (16 / 9)) / aspect).toFixed(2)),
          });
          showFeedback(`Replaced image with "${file.name}"`, true);
        } else {
          pushUndoSnapshot();
          const newLayer = {
            id: `layer_img_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            type: "image",
            name: file.name,
            content: dataUrl,
            url: dataUrl,
            x: 50,
            y: 75,
            width: 30,
            height: calcHeight,
            rotation: 0,
            opacity: 1,
            visible: true,
            aspectRatio: aspect,
            aspectLocked: true,
            zIndex: (currentDesign.layers.length + 1) * 10,
          };
          setCurrentDesign((prev) => ({ ...prev, layers: [...prev.layers, newLayer] }));
          setSelectedLayerId(newLayer.id);
          showFeedback(`Added "${file.name}" to canvas`, true);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) {
      showFeedback("Dropped file is not an image (PNG, JPG, or WebP expected)", false);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const img = new Image();
      img.onload = () => {
        const aspect = img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1.777;
        pushUndoSnapshot();
        const newLayer = {
          id: `layer_img_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          type: "image",
          name: file.name,
          content: dataUrl,
          url: dataUrl,
          x: 50,
          y: 75,
          width: 30,
          height: parseFloat(((30 * (16 / 9)) / aspect).toFixed(2)),
          rotation: 0,
          opacity: 1,
          visible: true,
          aspectRatio: aspect,
          aspectLocked: true,
          zIndex: (currentDesign.layers.length + 1) * 10,
        };
        setCurrentDesign((prev) => ({ ...prev, layers: [...prev.layers, newLayer] }));
        setSelectedLayerId(newLayer.id);
        showFeedback(`Added "${file.name}" from drop`, true);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // ─── Local Background Removal Handlers ─────────────────────────────────────
  const handleRemoveBackground = async (layer) => {
    if (!layer || (!layer.content && !layer.url && !layer.filePath)) {
      showFeedback("No image available to process", false);
      return;
    }
    const imgSrc = layer.content || layer.url || (layer.filePath ? `file://${layer.filePath}` : null);
    if (!imgSrc) return;

    setBgRemovalProcessing(true);
    setBgRemovalProgress(10);
    const abortCtrl = new AbortController();
    bgRemovalAbortRef.current = abortCtrl;

    try {
      const processedDataUrl = await removeImageBackgroundLocal(
        imgSrc,
        (prog) => setBgRemovalProgress(prog),
        abortCtrl.signal
      );

      pushUndoSnapshot();

      let finalUrl = processedDataUrl;
      let finalFilePath = null;
      if (designApi?.saveProcessedAsset) {
        try {
          const res = await designApi.saveProcessedAsset({
            dataUrl: processedDataUrl,
            filename: `${(layer.name || "image").replace(/[^a-zA-Z0-9_-]/g, "_")}_nobg.png`,
            mimeType: "image/png",
          });
          if (res?.ok && res.asset) {
            finalUrl = res.asset.url || (res.asset.filePath ? `file://${res.asset.filePath}` : processedDataUrl);
            finalFilePath = res.asset.filePath;
          }
        } catch (e) {
          console.warn("Could not save processed asset via IPC, falling back to dataUrl", e);
        }
      }

      updateLayer(layer.id, {
        originalContent: layer.originalContent || layer.content || layer.url,
        originalUrl: layer.originalUrl || layer.url || layer.content,
        originalFilePath: layer.originalFilePath || layer.filePath || null,
        originalAssetId: layer.originalAssetId || layer.assetId || null,
        content: finalUrl,
        url: finalUrl,
        filePath: finalFilePath || layer.filePath,
        hasBgRemoved: true,
      });

      showFeedback("Background removed successfully (local cut)!", true);
    } catch (err) {
      if (err.message !== "Canceled") {
        showFeedback(`Background removal failed: ${err.message}`, false);
      } else {
        showFeedback("Background removal canceled", false);
      }
    } finally {
      setBgRemovalProcessing(false);
      setBgRemovalProgress(0);
      bgRemovalAbortRef.current = null;
    }
  };

  const handleCancelBgRemoval = () => {
    if (bgRemovalAbortRef.current) {
      bgRemovalAbortRef.current.abort();
    }
    setBgRemovalProcessing(false);
    setBgRemovalProgress(0);
  };

  const handleRestoreOriginalImage = (layer) => {
    if (!layer || !layer.hasBgRemoved) return;
    pushUndoSnapshot();
    updateLayer(layer.id, {
      content: layer.originalContent || layer.originalUrl,
      url: layer.originalUrl || layer.originalContent,
      filePath: layer.originalFilePath || null,
      assetId: layer.originalAssetId || null,
      hasBgRemoved: false,
    });
    showFeedback("Restored original image", true);
  };

  // ─── Add to Live Controls Rack ─────────────────────────────────────────────
  const handleAddToLiveControls = async (targetLayers = null) => {
    try {
      const layersToSave = targetLayers || currentDesign.layers;
      if (!layersToSave || layersToSave.length === 0) {
        showFeedback("No layers to add to Live Controls", false);
        return;
      }
      const clonedLayers = JSON.parse(JSON.stringify(layersToSave));
      const thumbSvg = generateThumbnailSvg(clonedLayers);
      const isSingle = targetLayers && targetLayers.length === 1;
      const name = isSingle
        ? (targetLayers[0].name || "Layer Overlay")
        : (currentDesign.name || "Live Overlay");

      const chosenLayerWithTrans = (targetLayers || currentDesign.layers)?.find(
        (l) => l.transition?.entrance?.type && l.transition.entrance.type !== "none"
      );
      const defaultTransition = {
        entrance: { type: "fade", duration: 500, easing: "ease-out" },
        exit: { type: "fade", duration: 400, easing: "ease-in" },
      };
      const rawTrans =
        (targetLayers && targetLayers.length === 1 && targetLayers[0].transition) ||
        currentDesign.transition ||
        chosenLayerWithTrans?.transition ||
        defaultTransition;

      const entType = rawTrans?.entrance?.type || "fade";
      const entDur = rawTrans?.entrance?.duration || rawTrans?.entrance?.durationMs || 500;
      const exType = rawTrans?.exit?.type || "fade";
      const exDur = rawTrans?.exit?.duration || rawTrans?.exit?.durationMs || 400;

      const resolvedTransition = {
        entrance: {
          type: entType,
          duration: entDur,
          durationMs: entDur,
          easing: rawTrans?.entrance?.easing || "ease-out",
        },
        exit: {
          type: exType,
          duration: exDur,
          durationMs: exDur,
          easing: rawTrans?.exit?.easing || "ease-in",
        },
      };

      const payload = {
        name,
        label: name,
        type: isSingle ? "element" : (targetLayers ? "group" : "design"),
        targetType: isSingle ? "element" : (targetLayers ? "group" : "design"),
        layers: clonedLayers,
        snapshotLayers: clonedLayers,
        thumbnailSvg: thumbSvg,
        transition: resolvedTransition,
        status: "hidden",
        timing: {
          delaySeconds: 0,
          autoRemoveSeconds: 0,
          delaySec: 0,
          autoRemoveSec: 0,
          scheduledDate: "",
          scheduledTime: "",
          scheduleArmed: false,
        },
      };

      if (designApi?.saveLiveControl) {
        const saved = await designApi.saveLiveControl(payload);
        await refreshExistingControls();
        showFeedback(`Added "${saved.label || saved.name || name}" to Live Controls (Hidden)`, true);
      } else {
        const stored = JSON.parse(localStorage.getItem("ocs_live_controls") || "[]");
        payload.id = `ctrl_${Date.now()}`;
        stored.push(payload);
        localStorage.setItem("ocs_live_controls", JSON.stringify(stored));
        await refreshExistingControls();
        showFeedback(`Added "${name}" to Live Controls (Hidden)`, true);
      }
    } catch (err) {
      showFeedback(`Failed to add to Live Controls: ${err.message}`, false);
    }
  };

  const handleUpdateSavedControl = async (targetId = null) => {
    const controlId = targetId || selectedUpdateControlId;
    if (!controlId) {
      showFeedback("Select a saved control to update", false);
      return;
    }
    try {
      let list = [];
      if (designApi?.listLiveControls) {
        const res = await designApi.listLiveControls();
        list = res?.liveControls || [];
      } else {
        list = JSON.parse(localStorage.getItem("ocs_live_controls") || "[]");
      }
      const targetCtrl = list.find((c) => c.id === controlId);
      if (!targetCtrl) {
        showFeedback("Control not found", false);
        return;
      }

      const clonedLayers = JSON.parse(JSON.stringify(currentDesign.layers));
      const thumbSvg = generateThumbnailSvg(clonedLayers);
      const chosenLayerWithTrans = clonedLayers.find((l) => l.transition?.entrance?.type && l.transition.entrance.type !== "none");
      const chosenTrans = currentDesign.transition || chosenLayerWithTrans?.transition || targetCtrl.transition;

      const updated = {
        ...targetCtrl,
        snapshotLayers: clonedLayers,
        layers: clonedLayers,
        thumbnailSvg: thumbSvg,
        transition: chosenTrans || targetCtrl.transition,
      };

      if (designApi?.saveLiveControl) {
        await designApi.saveLiveControl(updated);
      } else {
        const idx = list.findIndex((c) => c.id === controlId);
        if (idx >= 0) list[idx] = updated;
        localStorage.setItem("ocs_live_controls", JSON.stringify(list));
      }
      await refreshExistingControls();
      showFeedback(`Committed update to "${targetCtrl.label || targetCtrl.name}" (snapshot refreshed)`, true);
    } catch (err) {
      showFeedback(`Update failed: ${err.message}`, false);
    }
  };

  // ─── Trigger In-Studio Animation Preview ────────────────────────────────────
  const handleTriggerAnimationPreview = (layer) => {
    setPreviewAnimationActive(false);
    setTimeout(() => {
      setPreviewAnimationActive(true);
      const dur = layer?.transition?.entrance?.durationMs || 400;
      setTimeout(() => {
        setPreviewAnimationActive(false);
      }, dur + 400);
    }, 40);
  };

  // ─── Canvas Drag & Resize Handlers ──────────────────────────────────────────

  const handleDoubleClickText = (e, layer) => {
    e.stopPropagation();
    pushUndoSnapshot();
    setSelectedLayerId(layer.id);
    setEditingTextLayerId(layer.id);
  };

  const handleDoubleClickChild = (e, layer) => {
    e.stopPropagation();
    if (layer.type === "text") {
      handleDoubleClickText(e, layer);
    } else if (layer.type === "shape" && layer.maskImage?.url) {
      pushUndoSnapshot();
      selectedLayerIdsRef.current = [layer.id];
      setSelectedLayerIds([layer.id]);
      setSelectedLayerId(layer.id);
      setEditingCropLayerId(layer.id);
      setEditingCropTarget("image");
      showFeedback(`Editing image inside ${layer.name}. Drag canvas to pan image, scroll wheel or slider to zoom.`, true);
    } else if (layer.type === "image") {
      pushUndoSnapshot();
      selectedLayerIdsRef.current = [layer.id];
      setSelectedLayerIds([layer.id]);
      setSelectedLayerId(layer.id);
      setEditingCropLayerId(layer.id);
      setEditingCropTarget("image");
      showFeedback(`Editing crop for ${layer.name}. Drag canvas to pan, scroll wheel or slider to zoom.`, true);
    } else {
      pushUndoSnapshot();
      selectedLayerIdsRef.current = [layer.id];
      setSelectedLayerIds([layer.id]);
      setSelectedLayerId(layer.id);
    }
  };

  const handleClickLayer = useCallback((e, layer) => {
    if (isSpacePressed || activeTool === "hand") return;
    e.stopPropagation();
    if (editingTextLayerId === layer.id) return;

    const isShift = e.shiftKey;
    const currentSelected = selectedLayerIdsRef.current || selectedLayerIds;
    let nextSelectedIds;

    if (isShift) {
      if (currentSelected.includes(layer.id)) {
        nextSelectedIds = currentSelected.filter((id) => id !== layer.id);
      } else {
        nextSelectedIds = [...currentSelected, layer.id];
      }
    } else {
      nextSelectedIds = [layer.id];
    }
    selectedLayerIdsRef.current = nextSelectedIds;
    setSelectedLayerIds(nextSelectedIds);
    setSelectedLayerId(layer.id);
  }, [activeTool, editingTextLayerId, isSpacePressed, selectedLayerIds, setSelectedLayerId]);

  const handleMouseDownOnLayer = (e, layer) => {
    if (isSpacePressed || activeTool === "hand" || e.button === 1) {
      return;
    }
    e.stopPropagation();
    if (editingTextLayerId === layer.id) return;
    if (editingTextLayerId) setEditingTextLayerId(null);

    const isShift = e.shiftKey;
    const currentSelected = selectedLayerIdsRef.current || selectedLayerIds;
    let nextSelectedIds;

    if (isShift) {
      if (currentSelected.includes(layer.id)) {
        // Shift-click an already selected element removes it from the selection
        nextSelectedIds = currentSelected.filter((id) => id !== layer.id);
      } else {
        // Shift-click adds another element to the selection
        nextSelectedIds = [...currentSelected, layer.id];
      }
    } else {
      if (!currentSelected.includes(layer.id)) {
        nextSelectedIds = [layer.id];
      } else {
        nextSelectedIds = currentSelected;
      }
    }
    selectedLayerIdsRef.current = nextSelectedIds;
    setSelectedLayerIds(nextSelectedIds);
    if (!nextSelectedIds.includes(layer.id)) {
      return;
    }

    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();

    // Check if actively editing image crop inside this layer
    if (editingCropLayerId === layer.id && editingCropTarget === "image") {
      const isShapeMask = layer.type === "shape" && Boolean(layer.maskImage?.url);
      const curPanX = isShapeMask ? (layer.maskImage?.panX || 0) : (layer.frameCrop?.panX || 0);
      const curPanY = isShapeMask ? (layer.maskImage?.panY || 0) : (layer.frameCrop?.panY || 0);
      const curZoom = isShapeMask ? (layer.maskImage?.zoom || 1) : (layer.frameCrop?.zoom || 1);
      const curFit = isShapeMask ? (layer.maskImage?.fitMode || "fill") : (layer.frameCrop?.fitMode || "fill");

      dragRef.current = {
        mode: "panCropImage",
        layerId: layer.id,
        isShapeMask,
        startX: e.clientX,
        startY: e.clientY,
        canvasW: rect.width,
        canvasH: rect.height,
        layerW: layer.width,
        layerH: typeof layer.height === "number" ? layer.height : 15,
        origPanX: curPanX,
        origPanY: curPanY,
        origZoom: curZoom,
        origFit: curFit,
        origSnapshot: {
          design: JSON.parse(JSON.stringify(currentDesignRef.current)),
          selectedLayerIds: nextSelectedIds,
          selectedLayerId: layer.id,
        },
        hasMoved: false,
      };

      window.removeEventListener("mousemove", handleCanvasMouseMove);
      window.removeEventListener("mouseup", handleCanvasMouseUp);
      window.addEventListener("mousemove", handleCanvasMouseMove);
      window.addEventListener("mouseup", handleCanvasMouseUp);
      return;
    }

    const layers = currentDesignRef.current?.layers || currentDesign.layers;
    const origGroupCoords = {};
    if (layer.groupId) {
      layers.forEach((l) => {
        if (l.groupId === layer.groupId) {
          origGroupCoords[l.id] = { x: l.x, y: l.y };
        }
      });
    }

    const origMultiCoords = {};
    layers.forEach((l) => {
      if (nextSelectedIds.includes(l.id)) {
        origMultiCoords[l.id] = { x: l.x, y: l.y };
      }
    });

    dragRef.current = {
      mode: "move",
      layerId: layer.id,
      selectedIds: nextSelectedIds,
      origMultiCoords,
      groupId: layer.groupId,
      origGroupCoords,
      startX: e.clientX,
      startY: e.clientY,
      canvasW: rect.width,
      canvasH: rect.height,
      origX: layer.x,
      origY: layer.y,
      origSnapshot: {
        design: JSON.parse(JSON.stringify(currentDesignRef.current)),
        selectedLayerIds: nextSelectedIds,
        selectedLayerId: layer.id,
      },
      hasMoved: false,
      isShiftClick: isShift,
      moveEntireGroup: e.altKey || false,
    };

    window.removeEventListener("mousemove", handleCanvasMouseMove);
    window.removeEventListener("mouseup", handleCanvasMouseUp);
    window.addEventListener("mousemove", handleCanvasMouseMove);
    window.addEventListener("mouseup", handleCanvasMouseUp);
  };

  const handleMouseDownOnHandle = (e, layer, handle) => {
    e.stopPropagation();
    if (e.shiftKey) {
      handleMouseDownOnLayer(e, layer);
      return;
    }
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();

    dragRef.current = {
      mode: handle === "rot" ? "rotate" : "resize",
      layerId: layer.id,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      canvasW: rect.width,
      canvasH: rect.height,
      origWidth: layer.width,
      origHeight: layer.height || 12,
      origX: layer.x,
      origY: layer.y,
      origRotation: layer.rotation || 0,
      aspectLocked: Boolean(layer.aspectLocked),
      origSnapshot: {
        design: JSON.parse(JSON.stringify(currentDesignRef.current)),
        selectedLayerIds: [layer.id],
        selectedLayerId: layer.id,
      },
      hasMoved: false,
    };

    window.removeEventListener("mousemove", handleCanvasMouseMove);
    window.removeEventListener("mouseup", handleCanvasMouseUp);
    window.addEventListener("mousemove", handleCanvasMouseMove);
    window.addEventListener("mouseup", handleCanvasMouseUp);
  };

  const processDragFrame = useCallback(() => {
    animFrameRef.current = null;
    const drag = dragRef.current;
    const coords = pendingMouseCoordsRef.current;
    if (!drag || !coords) return;

    const { clientX, clientY } = coords;

    if (drag.mode === "panCropImage") {
      const dist = Math.hypot(clientX - drag.startX, clientY - drag.startY);
      if (!drag.hasMoved && dist < 2) return;
      drag.hasMoved = true;

      const deltaScreenX = clientX - drag.startX;
      const deltaScreenY = clientY - drag.startY;

      const layerScreenW = Math.max(20, (drag.layerW / 100) * drag.canvasW);
      const layerScreenH = Math.max(20, (drag.layerH / 100) * drag.canvasH);

      const deltaPanX = ((deltaScreenX / layerScreenW) * 100) * 1.5;
      const deltaPanY = ((deltaScreenY / layerScreenH) * 100) * 1.5;

      const newPanX = Math.max(-100, Math.min(100, Math.round(drag.origPanX + deltaPanX)));
      const newPanY = Math.max(-100, Math.min(100, Math.round(drag.origPanY + deltaPanY)));

      setCurrentDesign((prev) => ({
        ...prev,
        layers: prev.layers.map((l) => {
          if (l.id !== drag.layerId) return l;
          if (drag.isShapeMask) {
            return {
              ...l,
              maskImage: {
                ...(l.maskImage || {}),
                panX: newPanX,
                panY: newPanY,
              },
            };
          }
          return {
            ...l,
            frameCrop: {
              ...(l.frameCrop || {}),
              panX: newPanX,
              panY: newPanY,
            },
          };
        }),
      }));
      return;
    }

    if (drag.mode === "move") {
      const dist = Math.hypot(clientX - drag.startX, clientY - drag.startY);
      if (!drag.hasMoved && dist < 4) return;
      drag.hasMoved = true;

      const deltaXPct = ((clientX - drag.startX) / drag.canvasW) * 100;
      const deltaYPct = ((clientY - drag.startY) / drag.canvasH) * 100;

      let newX = Math.max(2, Math.min(98, Number((drag.origX + deltaXPct).toFixed(2))));
      let newY = Math.max(2, Math.min(98, Number((drag.origY + deltaYPct).toFixed(2))));

      // Snap to Center alignment guides (gentle 0.8% threshold)
      const snapX = Math.abs(newX - 50) < 0.8;
      const snapY = Math.abs(newY - 50) < 0.8;
      if (snapX) newX = 50;
      if (snapY) newY = 50;
      setSnapGuide({ x: snapX, y: snapY });

      if (drag.selectedIds && drag.selectedIds.length > 1 && drag.origMultiCoords) {
        // Multi-selection dragging: move all selected elements together, strictly preserving spacing
        const targetIds = new Set(drag.selectedIds);
        setCurrentDesign((prev) => ({
          ...prev,
          layers: prev.layers.map((l) => {
            if (targetIds.has(l.id) && drag.origMultiCoords[l.id]) {
              const orig = drag.origMultiCoords[l.id];
              return {
                ...l,
                x: Number((orig.x + deltaXPct).toFixed(2)),
                y: Number((orig.y + deltaYPct).toFixed(2)),
              };
            }
            return l;
          }),
        }));
      } else {
        const shouldMoveEntireGroup = (drag.moveEntireGroup || moveGroupWithSelected) && drag.groupId && drag.origGroupCoords;

        if (shouldMoveEntireGroup) {
          setCurrentDesign((prev) => ({
            ...prev,
            layers: prev.layers.map((l) => {
              if (l.groupId === drag.groupId && drag.origGroupCoords[l.id]) {
                const orig = drag.origGroupCoords[l.id];
                return {
                  ...l,
                  x: Math.max(2, Math.min(98, Number((orig.x + deltaXPct).toFixed(2)))),
                  y: Math.max(2, Math.min(98, Number((orig.y + deltaYPct).toFixed(2)))),
                };
              }
              return l;
            }),
          }));
        } else {
          // Individual child element movement!
          setCurrentDesign((prev) => ({
            ...prev,
            layers: prev.layers.map((l) => (l.id === drag.layerId ? { ...l, x: newX, y: newY } : l)),
          }));
        }
      }
    } else if (drag.mode === "resize") {
      const dist = Math.hypot(clientX - drag.startX, clientY - drag.startY);
      if (!drag.hasMoved && dist < 3) return;
      drag.hasMoved = true;

      const deltaXPct = ((clientX - drag.startX) / drag.canvasW) * 100;
      const deltaYPct = ((clientY - drag.startY) / drag.canvasH) * 100;

      const handle = drag.handle;
      let newW = drag.origWidth;
      let newH = drag.origHeight || 12;
      let newX = drag.origX;
      let newY = drag.origY;

      const isCorner = ["nw", "ne", "sw", "se"].includes(handle);

      if (drag.aspectLocked && isCorner) {
        // Physical aspect ratio in screen pixels
        const ratio = (drag.origWidth * drag.canvasW) / ((drag.origHeight || 12) * drag.canvasH);

        let scale = 1;
        if (handle === "se") {
          const sx = (drag.origWidth + deltaXPct) / drag.origWidth;
          const sy = ((drag.origHeight || 12) + deltaYPct) / (drag.origHeight || 12);
          scale = Math.max(0.05, Math.abs(deltaXPct) > Math.abs(deltaYPct) ? sx : sy);
          newW = Math.max(3, Math.min(100, Number((drag.origWidth * scale).toFixed(2))));
          newH = Math.max(2, Math.min(100, Number(((newW * drag.canvasW) / (ratio * drag.canvasH)).toFixed(2))));
          newX = Number((drag.origX - drag.origWidth / 2 + newW / 2).toFixed(2));
          newY = Number((drag.origY - (drag.origHeight || 12) / 2 + newH / 2).toFixed(2));
        } else if (handle === "sw") {
          const sx = (drag.origWidth - deltaXPct) / drag.origWidth;
          const sy = ((drag.origHeight || 12) + deltaYPct) / (drag.origHeight || 12);
          scale = Math.max(0.05, Math.abs(deltaXPct) > Math.abs(deltaYPct) ? sx : sy);
          newW = Math.max(3, Math.min(100, Number((drag.origWidth * scale).toFixed(2))));
          newH = Math.max(2, Math.min(100, Number(((newW * drag.canvasW) / (ratio * drag.canvasH)).toFixed(2))));
          newX = Number((drag.origX + drag.origWidth / 2 - newW / 2).toFixed(2));
          newY = Number((drag.origY - (drag.origHeight || 12) / 2 + newH / 2).toFixed(2));
        } else if (handle === "ne") {
          const sx = (drag.origWidth + deltaXPct) / drag.origWidth;
          const sy = ((drag.origHeight || 12) - deltaYPct) / (drag.origHeight || 12);
          scale = Math.max(0.05, Math.abs(deltaXPct) > Math.abs(deltaYPct) ? sx : sy);
          newW = Math.max(3, Math.min(100, Number((drag.origWidth * scale).toFixed(2))));
          newH = Math.max(2, Math.min(100, Number(((newW * drag.canvasW) / (ratio * drag.canvasH)).toFixed(2))));
          newX = Number((drag.origX - drag.origWidth / 2 + newW / 2).toFixed(2));
          newY = Number((drag.origY + (drag.origHeight || 12) / 2 - newH / 2).toFixed(2));
        } else if (handle === "nw") {
          const sx = (drag.origWidth - deltaXPct) / drag.origWidth;
          const sy = ((drag.origHeight || 12) - deltaYPct) / (drag.origHeight || 12);
          scale = Math.max(0.05, Math.abs(deltaXPct) > Math.abs(deltaYPct) ? sx : sy);
          newW = Math.max(3, Math.min(100, Number((drag.origWidth * scale).toFixed(2))));
          newH = Math.max(2, Math.min(100, Number(((newW * drag.canvasW) / (ratio * drag.canvasH)).toFixed(2))));
          newX = Number((drag.origX + drag.origWidth / 2 - newW / 2).toFixed(2));
          newY = Number((drag.origY + (drag.origHeight || 12) / 2 - newH / 2).toFixed(2));
        }
      } else {
        // Freeform resize
        if (handle.includes("e") || handle === "mr") {
          newW = Math.max(3, Math.min(100, Number((drag.origWidth + deltaXPct).toFixed(2))));
          newX = Number((drag.origX + (newW - drag.origWidth) / 2).toFixed(2));
        } else if (handle.includes("w") || handle === "ml") {
          newW = Math.max(3, Math.min(100, Number((drag.origWidth - deltaXPct).toFixed(2))));
          newX = Number((drag.origX - (newW - drag.origWidth) / 2).toFixed(2));
        }

        if (handle.includes("s") || handle === "mb") {
          newH = Math.max(2, Math.min(100, Number(((drag.origHeight || 12) + deltaYPct).toFixed(2))));
          newY = Number((drag.origY + (newH - (drag.origHeight || 12)) / 2).toFixed(2));
        } else if (handle.includes("n") || handle === "mt") {
          newH = Math.max(2, Math.min(100, Number(((drag.origHeight || 12) - deltaYPct).toFixed(2))));
          newY = Number((drag.origY - (newH - (drag.origHeight || 12)) / 2).toFixed(2));
        }
      }

      setCurrentDesign((prev) => ({
        ...prev,
        layers: prev.layers.map((l) => {
          if (l.id !== drag.layerId) return l;
          const patch = { width: newW, x: newX };
          if (l.type === "shape") {
            if (drag.aspectLocked && isCorner) {
              patch.height = newH;
              patch.y = newY;
            } else if (handle.includes("n") || handle.includes("s") || handle === "mt" || handle === "mb") {
              patch.height = newH;
              patch.y = newY;
            }
          }
          return { ...l, ...patch };
        }),
      }));
    } else if (drag.mode === "rotate") {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const centerX = rect.left + (rect.width * drag.origX) / 100;
      const centerY = rect.top + (rect.height * drag.origY) / 100;
      const radians = Math.atan2(clientY - centerY, clientX - centerX);
      let degrees = Math.round((radians * (180 / Math.PI)) + 90);
      if (degrees < 0) degrees += 360;
      if (Math.abs(degrees) < 4 || Math.abs(degrees - 360) < 4) degrees = 0;
      if (Math.abs(degrees - 90) < 3) degrees = 90;
      if (Math.abs(degrees - 180) < 3) degrees = 180;
      if (Math.abs(degrees - 270) < 3) degrees = 270;

      drag.hasMoved = true;
      setCurrentDesign((prev) => ({
        ...prev,
        layers: prev.layers.map((l) => (l.id === drag.layerId ? { ...l, rotation: degrees } : l)),
      }));
    } else if (drag.mode === "corner-radius") {
      const dist = Math.hypot(clientX - drag.startX, clientY - drag.startY);
      if (!drag.hasMoved && dist < 2) return;
      drag.hasMoved = true;

      // Inward movement increases radius, outward movement decreases radius (0 restores sharp corners)
      const deltaScreen = (() => {
        if (drag.cornerIndex === 0) return (clientX - drag.startX) + (clientY - drag.startY);
        if (drag.cornerIndex === 1) return -(clientX - drag.startX) + (clientY - drag.startY);
        if (drag.cornerIndex === 2) return -(clientX - drag.startX) - (clientY - drag.startY);
        return (clientX - drag.startX) - (clientY - drag.startY);
      })() * 0.4;

      const baseVal = drag.origRadii[drag.cornerIndex] || 0;
      const newRad = Math.max(0, Math.min(99, Math.round(baseVal + (deltaScreen / (zoom || 1)))));

      setCurrentDesign((prev) => ({
        ...prev,
        layers: prev.layers.map((l) => {
          if (l.id !== drag.layerId) return l;
          if (drag.cornersLinked) {
            return { ...l, borderRadius: newRad };
          } else {
            const nextRadii = Array.isArray(l.borderRadius) ? [...l.borderRadius] : [baseVal, baseVal, baseVal, baseVal];
            nextRadii[drag.cornerIndex] = newRad;
            return { ...l, borderRadius: nextRadii };
          }
        }),
      }));
    } else if (drag.mode === "curve-node") {
      drag.hasMoved = true;
      const layerScreenW = (drag.layerW / 100) * drag.canvasW;
      const layerScreenH = (drag.layerH / 100) * drag.canvasH;
      const deltaNodeX = ((clientX - drag.startX) / (layerScreenW || 1)) * 100;
      const deltaNodeY = ((clientY - drag.startY) / (layerScreenH || 1)) * 100;

      const nextNodes = JSON.parse(JSON.stringify(drag.origNodes));
      const idx = drag.nodeIndex;
      if (drag.pointType === "vertex") {
        nextNodes[idx].x = Math.max(0, Math.min(100, Number((drag.origNodes[idx].x + deltaNodeX).toFixed(1))));
        nextNodes[idx].y = Math.max(0, Math.min(100, Number((drag.origNodes[idx].y + deltaNodeY).toFixed(1))));
      } else if (drag.pointType === "cp1") {
        const origCp = drag.origNodes[idx].cp1 || { x: drag.origNodes[idx].x, y: drag.origNodes[idx].y };
        nextNodes[idx].cp1 = {
          x: Math.max(0, Math.min(100, Number((origCp.x + deltaNodeX).toFixed(1)))),
          y: Math.max(0, Math.min(100, Number((origCp.y + deltaNodeY).toFixed(1)))),
        };
      } else if (drag.pointType === "cp2") {
        const origCp = drag.origNodes[idx].cp2 || { x: drag.origNodes[idx].x, y: drag.origNodes[idx].y };
        nextNodes[idx].cp2 = {
          x: Math.max(0, Math.min(100, Number((origCp.x + deltaNodeX).toFixed(1)))),
          y: Math.max(0, Math.min(100, Number((origCp.y + deltaNodeY).toFixed(1)))),
        };
      } else if (drag.pointType === "midpoint") {
        const prevIdx = idx === 0 ? nextNodes.length - 1 : idx - 1;
        const prev = drag.origNodes[prevIdx];
        const cur = drag.origNodes[idx];
        const midX = (prev.x + cur.x) / 2 + deltaNodeX;
        const midY = (prev.y + cur.y) / 2 + deltaNodeY;
        nextNodes[idx].cp1 = {
          x: Math.max(0, Math.min(100, Number(((prev.x + midX) / 2).toFixed(1)))),
          y: Math.max(0, Math.min(100, Number(((prev.y + midY) / 2).toFixed(1)))),
        };
        nextNodes[idx].cp2 = {
          x: Math.max(0, Math.min(100, Number(((cur.x + midX) / 2).toFixed(1)))),
          y: Math.max(0, Math.min(100, Number(((cur.y + midY) / 2).toFixed(1)))),
        };
      }

      setCurrentDesign((prev) => ({
        ...prev,
        layers: prev.layers.map((l) => (l.id === drag.layerId ? { ...l, customPath: nextNodes } : l)),
      }));
    }
  }, [moveGroupWithSelected, zoom]);

  const handleCanvasMouseMove = useCallback((e) => {
    if (!dragRef.current) return;
    pendingMouseCoordsRef.current = { clientX: e.clientX, clientY: e.clientY };
    if (!animFrameRef.current) {
      animFrameRef.current = requestAnimationFrame(processDragFrame);
    }
  }, [processDragFrame]);

  const handleCanvasMouseUp = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (pendingMouseCoordsRef.current) {
      processDragFrame();
      pendingMouseCoordsRef.current = null;
    }

    const drag = dragRef.current;
    if (drag) {
      if (drag.hasMoved && drag.origSnapshot) {
        setUndoStack((prev) => {
          const next = [...prev, drag.origSnapshot];
          if (next.length > MAX_UNDO_STACK) next.shift();
          return next;
        });
        setRedoStack([]);
        setHasUnsavedChanges(true);
        // Persist active design immediately when interaction completes
        syncToLocalStorage(currentDesignRef.current);
      } else if (!drag.hasMoved && !drag.isShiftClick && drag.selectedIds && drag.selectedIds.length > 1) {
        // Plain click on an item that was part of multi-selection: select only that item
        selectedLayerIdsRef.current = [drag.layerId];
        setSelectedLayerIds([drag.layerId]);
      }
      dragRef.current = null;
    }
    setSnapGuide({ x: false, y: false });
    window.removeEventListener("mousemove", handleCanvasMouseMove);
    window.removeEventListener("mouseup", handleCanvasMouseUp);
  }, [handleCanvasMouseMove, processDragFrame, syncToLocalStorage]);

  const handleMouseDownOnCornerHandle = (e, layer, cornerIndex) => {
    e.stopPropagation();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const curR = layer.borderRadius;
    let initialRadii = [0, 0, 0, 0];
    if (Array.isArray(curR)) {
      initialRadii = [...curR];
    } else {
      const val = typeof curR === "number" ? curR : (layer.shape === "rounded-rect" ? 12 : 0);
      initialRadii = [val, val, val, val];
    }

    dragRef.current = {
      mode: "corner-radius",
      layerId: layer.id,
      cornerIndex,
      startX: e.clientX,
      startY: e.clientY,
      canvasW: rect.width,
      canvasH: rect.height,
      origRadii: initialRadii,
      cornersLinked,
      origSnapshot: {
        design: JSON.parse(JSON.stringify(currentDesignRef.current)),
        selectedLayerIds: [layer.id],
        selectedLayerId: layer.id,
      },
      hasMoved: false,
    };

    window.removeEventListener("mousemove", handleCanvasMouseMove);
    window.removeEventListener("mouseup", handleCanvasMouseUp);
    window.addEventListener("mousemove", handleCanvasMouseMove);
    window.addEventListener("mouseup", handleCanvasMouseUp);
  };

  const handleMouseDownOnCurveNode = (e, layer, nodeIndex, pointType = "vertex") => {
    e.stopPropagation();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const nodes = layer.customPath ? JSON.parse(JSON.stringify(layer.customPath)) : getDefaultShapeNodes(layer.shape);

    setActiveCurveNodeIdx(nodeIndex);

    dragRef.current = {
      mode: "curve-node",
      layerId: layer.id,
      nodeIndex,
      pointType,
      startX: e.clientX,
      startY: e.clientY,
      canvasW: rect.width,
      canvasH: rect.height,
      origNodes: nodes,
      layerW: layer.width,
      layerH: layer.height || 12,
      origSnapshot: {
        design: JSON.parse(JSON.stringify(currentDesignRef.current)),
        selectedLayerIds: [layer.id],
        selectedLayerId: layer.id,
      },
      hasMoved: false,
    };

    window.removeEventListener("mousemove", handleCanvasMouseMove);
    window.removeEventListener("mouseup", handleCanvasMouseUp);
    window.addEventListener("mousemove", handleCanvasMouseMove);
    window.addEventListener("mouseup", handleCanvasMouseUp);
  };

  const handlePlaceImageInsideShape = (shapeLayerId) => {
    maskTargetLayerIdRef.current = shapeLayerId;
    if (maskFileInputRef.current) {
      maskFileInputRef.current.value = "";
      maskFileInputRef.current.click();
    }
  };

  const handleMaskFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const targetId = maskTargetLayerIdRef.current;
    if (!targetId) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result;
      if (dataUrl) {
        pushUndoSnapshot();
        updateLayer(targetId, {
          maskImage: {
            url: dataUrl,
            fitMode: "fill",
            zoom: 1,
            panX: 0,
            panY: 0,
          },
        });
        showFeedback("Image placed inside clipping mask", true);
      }
    };
    reader.readAsDataURL(file);
  };

  const canCreateClippingMask = () => {
    if (selectedLayerIds.length !== 2) return false;
    const l1 = currentDesign.layers.find((l) => l.id === selectedLayerIds[0]);
    const l2 = currentDesign.layers.find((l) => l.id === selectedLayerIds[1]);
    if (!l1 || !l2) return false;
    return (l1.type === "shape" && l2.type === "image") || (l2.type === "shape" && l1.type === "image");
  };

  const handleCreateClippingMask = () => {
    if (!canCreateClippingMask()) return;
    const l1 = currentDesign.layers.find((l) => l.id === selectedLayerIds[0]);
    const l2 = currentDesign.layers.find((l) => l.id === selectedLayerIds[1]);
    const shapeLayer = l1.type === "shape" ? l1 : l2;
    const imageLayer = l1.type === "image" ? l1 : l2;
    const imgUrl = imageLayer.content || imageLayer.url || imageLayer.filePath;

    pushUndoSnapshot();
    const maskImage = {
      url: imgUrl,
      assetId: imageLayer.assetId || null,
      filePath: imageLayer.filePath || null,
      originalAssetId: imageLayer.originalAssetId || imageLayer.assetId || null,
      originalFilePath: imageLayer.originalFilePath || imageLayer.filePath || null,
      originalUrl: imageLayer.originalUrl || imageLayer.url || null,
      name: imageLayer.name || "Masked Image",
      aspectRatio: imageLayer.aspectRatio || 1.777,
      fitMode: imageLayer.frameCrop?.fitMode || "fill",
      zoom: imageLayer.frameCrop?.zoom || 1,
      panX: imageLayer.frameCrop?.panX || 0,
      panY: imageLayer.frameCrop?.panY || 0,
    };

    setCurrentDesign((prev) => ({
      ...prev,
      layers: prev.layers
        .filter((l) => l.id !== imageLayer.id)
        .map((l) => {
          if (l.id === shapeLayer.id) {
            return {
              ...l,
              maskImage,
            };
          }
          return l;
        }),
    }));
    setSelectedLayerIds([shapeLayer.id]);
    setSelectedLayerId(shapeLayer.id);
    showFeedback("Created shape clipping mask. Double-click or click Edit Image to pan and crop.", true);
  };

  const handleReleaseClippingMask = (shapeLayerId) => {
    const shapeLayer = currentDesign.layers.find((l) => l.id === shapeLayerId);
    if (!shapeLayer || !shapeLayer.maskImage?.url) return;
    pushUndoSnapshot();
    const mImg = shapeLayer.maskImage;
    const imgUrl = mImg.url;
    const newImageLayer = {
      id: `layer_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      type: "image",
      name: mImg.name || `${shapeLayer.name || "Shape"} (Extracted Image)`,
      url: imgUrl,
      content: imgUrl,
      assetId: mImg.assetId || null,
      filePath: mImg.filePath || null,
      originalAssetId: mImg.originalAssetId || null,
      originalFilePath: mImg.originalFilePath || null,
      originalUrl: mImg.originalUrl || null,
      aspectRatio: mImg.aspectRatio || 1.777,
      frameCrop: {
        fitMode: mImg.fitMode || "fill",
        zoom: mImg.zoom || 1,
        panX: mImg.panX || 0,
        panY: mImg.panY || 0,
      },
      x: shapeLayer.x,
      y: shapeLayer.y,
      width: shapeLayer.width,
      height: shapeLayer.height,
      zIndex: (shapeLayer.zIndex || 10) + 1,
    };
    setCurrentDesign((prev) => ({
      ...prev,
      layers: [
        ...prev.layers.map((l) => (l.id === shapeLayerId ? { ...l, maskImage: null } : l)),
        newImageLayer,
      ],
    }));
    if (editingCropLayerId === shapeLayerId) {
      setEditingCropLayerId(null);
      setEditingCropTarget("image");
    }
    setSelectedLayerIds([newImageLayer.id]);
    setSelectedLayerId(newImageLayer.id);
    showFeedback("Released clipping mask", true);
  };

  const handleResetMaskCrop = (shapeLayerId) => {
    pushUndoSnapshot();
    const layer = currentDesign.layers.find((l) => l.id === shapeLayerId);
    if (!layer) return;
    if (layer.type === "shape" && layer.maskImage) {
      updateLayer(shapeLayerId, {
        maskImage: {
          ...layer.maskImage,
          fitMode: "fill",
          zoom: 1,
          panX: 0,
          panY: 0,
        },
      });
    } else if (layer.type === "image") {
      updateLayer(shapeLayerId, {
        frameCrop: {
          fitMode: "fill",
          zoom: 1,
          panX: 0,
          panY: 0,
        },
      });
    }
    showFeedback("Reset image crop to default", true);
  };

  const handleStraightenSegment = (shapeLayerId, nodeIdx) => {
    pushUndoSnapshot();
    setCurrentDesign((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => {
        if (l.id !== shapeLayerId || !Array.isArray(l.customPath)) return l;
        const nextNodes = JSON.parse(JSON.stringify(l.customPath));
        const idx = nodeIdx != null ? nodeIdx : (activeCurveNodeIdx ?? 1);
        if (nextNodes[idx]) {
          delete nextNodes[idx].cp1;
          delete nextNodes[idx].cp2;
        }
        return { ...l, customPath: nextNodes };
      }),
    }));
    showFeedback("Segment straightened", true);
  };

  const handleResetShapeCurves = (shapeLayerId) => {
    pushUndoSnapshot();
    const l = currentDesign.layers.find((ly) => ly.id === shapeLayerId);
    if (!l) return;
    const defaultNodes = getDefaultShapeNodes(l.shape);
    setCurrentDesign((prev) => ({
      ...prev,
      layers: prev.layers.map((ly) => (ly.id === shapeLayerId ? { ...ly, customPath: defaultNodes } : ly)),
    }));
    showFeedback("Shape geometry reset", true);
  };

  const handleZoomIn = () => setZoom((z) => Math.min(4.0, Number((z + 0.25).toFixed(2))));
  const handleZoomOut = () => setZoom((z) => Math.max(0.25, Number((z - 0.25).toFixed(2))));
  const handleResetZoom = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };
  const handleFitZoom = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleViewportMouseDown = (e) => {
    if (isSpacePressed || activeTool === "hand" || e.button === 1) {
      e.preventDefault();
      setIsPanning(true);
      try {
        if (e.pointerId != null && e.currentTarget?.setPointerCapture) {
          e.currentTarget.setPointerCapture(e.pointerId);
        }
      } catch (_) {}
      panStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origPan: { ...panOffset },
        pointerId: e.pointerId,
      };
      const handlePanMouseMove = (me) => {
        const dx = me.clientX - panStartRef.current.startX;
        const dy = me.clientY - panStartRef.current.startY;
        setPanOffset({
          x: panStartRef.current.origPan.x + dx,
          y: panStartRef.current.origPan.y + dy,
        });
      };
      const handlePanMouseUp = () => {
        setIsPanning(false);
        try {
          if (panStartRef.current?.pointerId != null && viewportRef.current?.releasePointerCapture) {
            viewportRef.current.releasePointerCapture(panStartRef.current.pointerId);
          }
        } catch (_) {}
        window.removeEventListener("mousemove", handlePanMouseMove);
        window.removeEventListener("mouseup", handlePanMouseUp);
        window.removeEventListener("pointermove", handlePanMouseMove);
        window.removeEventListener("pointerup", handlePanMouseUp);
      };
      window.addEventListener("mousemove", handlePanMouseMove);
      window.addEventListener("mouseup", handlePanMouseUp);
      window.addEventListener("pointermove", handlePanMouseMove);
      window.addEventListener("pointerup", handlePanMouseUp);
    }
  };

  const handleViewportMouseMove = (e) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const cX = Math.round(Math.max(0, Math.min(1280, ((e.clientX - rect.left) / rect.width) * 1280)));
    const cY = Math.round(Math.max(0, Math.min(720, ((e.clientY - rect.top) / rect.height) * 720)));
    setCursorCanvasPos({ x: cX, y: cY });
  };

  const handleCanvasWheel = (e) => {
    if (editingCropLayerId && editingCropTarget === "image") {
      try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
      const targetLayer = currentDesign.layers.find((l) => l.id === editingCropLayerId);
      if (targetLayer) {
        const isShapeMask = targetLayer.type === "shape" && Boolean(targetLayer.maskImage?.url);
        const curZoom = isShapeMask ? (targetLayer.maskImage?.zoom || 1) : (targetLayer.frameCrop?.zoom || 1);
        const delta = e.deltaY < 0 ? 0.05 : -0.05;
        const nextZoom = Math.max(1, Math.min(5, Number((curZoom + delta).toFixed(2))));
        if (isShapeMask) {
          updateLayerDraft(editingCropLayerId, {
            maskImage: { ...(targetLayer.maskImage || {}), zoom: nextZoom },
          });
        } else {
          updateLayerDraft(editingCropLayerId, {
            frameCrop: { ...(targetLayer.frameCrop || {}), zoom: nextZoom },
          });
        }
      }
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      try { e.preventDefault(); } catch (_) {}
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      setZoom((z) => Math.max(0.25, Math.min(4.0, Number((z + delta).toFixed(2)))));
    } else if (e.shiftKey) {
      try { e.preventDefault(); } catch (_) {}
      const dx = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      setPanOffset((p) => ({ ...p, x: p.x - dx }));
    } else {
      try { e.preventDefault(); } catch (_) {}
      setPanOffset((p) => ({
        x: p.x - e.deltaX,
        y: p.y - e.deltaY,
      }));
    }
  };

  // ─── Design Save & CRUD ─────────────────────────────────────────────────────

  const handleSaveDesign = async () => {
    if (designApi?.saveDesign) {
      try {
        const res = await designApi.saveDesign(currentDesign);
        if (res?.ok && res.design) {
          setHasUnsavedChanges(false);
          setDesigns((prev) => {
            const idx = prev.findIndex((d) => d.id === res.design.id);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = res.design;
              return copy;
            }
            return [...prev, res.design];
          });
          showFeedback("Design saved successfully", true);
        }
      } catch (err) {
        showFeedback(`Save failed: ${err.message}`, false);
      }
    } else {
      localStorage.setItem("ocs_live_studio_active_design", JSON.stringify(currentDesign));
      setHasUnsavedChanges(false);
      showFeedback("Design saved locally", true);
    }
  };

  const handleSelectDesign = (id) => {
    const found = designs.find((d) => d.id === id);
    if (found) {
      pushUndoSnapshot();
      setCurrentDesign(JSON.parse(JSON.stringify(found)));
      setSelectedLayerId(found.layers[0]?.id || null);
      showFeedback(`Loaded "${found.name}" into preview`, true);
    }
  };

  const handleCreateNewDesign = () => {
    pushUndoSnapshot();
    const newD = createEmptyDesign(`Overlay ${designs.length + 1}`);
    setCurrentDesign(newD);
    setSelectedLayerId(null);
    setSelectedLayerIds([]);
    showFeedback("Created new blank design draft", true);
  };

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      data-studio-modal="true"
      className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex flex-col select-none animate-in fade-in duration-150"
      onMouseUp={handleCanvasMouseUp}
    >
      <div className="w-full h-full bg-[#0d0b14] flex flex-col overflow-hidden text-white font-sans relative">
        {/* Floating In-Modal Actionable Feedback Banner */}
        {modalToast && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[10000] px-4 py-2 rounded-[12px] bg-[#1a1528] border border-purple-500/40 shadow-2xl flex items-center gap-2.5 text-xs animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-none">
            <div className={`w-2 h-2 rounded-full ${modalToast.isSuccess ? "bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]" : "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.6)]"}`} />
            <span className={modalToast.isSuccess ? "text-white font-medium" : "text-red-200 font-medium"}>
              {modalToast.message}
            </span>
          </div>
        )}

        {/* In-Studio Animation Preview Keyframes */}
        <style>{`
          @keyframes studioAnimFade {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes studioAnimSlideFadeLeft {
            from { opacity: 0; transform: translate(calc(-50% - 40px), -50%); }
            to { opacity: 1; transform: translate(-50%, -50%); }
          }
          @keyframes studioAnimSlideFadeRight {
            from { opacity: 0; transform: translate(calc(-50% + 40px), -50%); }
            to { opacity: 1; transform: translate(-50%, -50%); }
          }
          @keyframes studioAnimSlideFadeTop {
            from { opacity: 0; transform: translate(-50%, calc(-50% - 30px)); }
            to { opacity: 1; transform: translate(-50%, -50%); }
          }
          @keyframes studioAnimSlideFadeBottom {
            from { opacity: 0; transform: translate(-50%, calc(-50% + 30px)); }
            to { opacity: 1; transform: translate(-50%, -50%); }
          }
          @keyframes studioAnimScaleFade {
            from { opacity: 0; transform: translate(-50%, -50%) scale(0.92); }
            to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          }
          @keyframes studioAnimSlideLeft {
            from { transform: translate(calc(-50% - 320px), -50%); }
            to { transform: translate(-50%, -50%); }
          }
          @keyframes studioAnimSlideRight {
            from { transform: translate(calc(-50% + 320px), -50%); }
            to { transform: translate(-50%, -50%); }
          }
          @keyframes studioAnimSlideTop {
            from { transform: translate(-50%, calc(-50% - 200px)); }
            to { transform: translate(-50%, -50%); }
          }
          @keyframes studioAnimSlideBottom {
            from { transform: translate(-50%, calc(-50% + 200px)); }
            to { transform: translate(-50%, -50%); }
          }
          @keyframes studioAnimWipe {
            from { clip-path: inset(0 100% 0 0); }
            to { clip-path: inset(0 0 0 0); }
          }
        `}</style>

        {/* ── Top Bar: Workflow & Presentation Controls ──────────────────────── */}
        <div className="h-14 border-b border-white/10 px-5 flex items-center justify-between bg-[#12101e] shrink-0">
          {/* Left: Design Selector & Status */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-[12px] bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
              <PiTelevision size={18} />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-white">
                  Live Design Studio
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <input
                  type="text"
                  value={currentDesign.name}
                  onChange={(e) => {
                    pushUndoSnapshot();
                    setCurrentDesign((prev) => ({ ...prev, name: e.target.value }));
                  }}
                  className="bg-white/5 border border-white/10 rounded-[12px] px-2.5 py-0.5 text-[11px] text-white w-48 focus:outline-none focus:border-purple-500"
                  placeholder="Design Title"
                  aria-label="Design Title"
                />
              </div>
            </div>

            <ActionButton
              onClick={handleCreateNewDesign}
              className="px-2.5 py-1.5 rounded-[12px] bg-white/5 hover:bg-white/10 text-white/70 text-[11px] font-bold border border-white/10 transition-all"
            >
              New
            </ActionButton>

            <ActionButton
              onClick={handleSaveDesign}
              className={`px-3 py-1.5 rounded-[12px] text-[11px] font-bold border transition-all flex items-center gap-1.5 ${
                hasUnsavedChanges
                  ? "bg-purple-600 hover:bg-purple-500 border-purple-400 text-white shadow-md shadow-purple-950/40"
                  : "bg-white/5 hover:bg-white/10 border-white/10 text-white/70"
              }`}
            >
              <PiFloppyDisk size={13} />
              <span>{hasUnsavedChanges ? "Save *" : "Saved"}</span>
            </ActionButton>

            <div className="w-px h-5 bg-white/10 mx-1" />

            {/* Role Assignment & Preview Controls */}
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-[12px] px-2.5 py-1">
              <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Role:</span>
              <select
                value={currentDesign.role || "custom"}
                onChange={(e) => {
                  pushUndoSnapshot();
                  setCurrentDesign((prev) => ({ ...prev, role: e.target.value }));
                  setHasUnsavedChanges(true);
                }}
                className="bg-black/40 text-white text-[11px] font-medium px-2 py-0.5 rounded-[12px] border border-white/10 focus:outline-none focus:border-purple-500"
                aria-label="Use As Role"
              >
                <option value="custom" className="bg-neutral-900 text-white">Custom / None</option>
                <option value="bible" className="bg-neutral-900 text-white">Bible Lower-Third</option>
                <option value="announcement" className="bg-neutral-900 text-white">Announcement</option>
                <option value="speaker" className="bg-neutral-900 text-white">Speaker / Name</option>
              </select>

              {currentDesign.role && currentDesign.role !== "custom" && (() => {
                const assignedId = roleAssignments[currentDesign.role];
                const assignedDesign = designs.find((d) => d.id === assignedId);
                const assignedName = assignedDesign ? assignedDesign.name : (assignedId === currentDesign.id ? currentDesign.name : "None");
                return (
                  <span
                    className="text-[10px] text-white/50 border border-white/10 px-2 py-0.5 rounded-[12px] bg-white/5 truncate max-w-[150px]"
                    title={`Assigned Default for ${currentDesign.role}: "${assignedName}"`}
                  >
                    Default: <strong className="text-white/80 font-bold">{assignedName}</strong>
                  </span>
                );
              })()}

              {currentDesign.role && currentDesign.role !== "custom" && (
                <button
                  type="button"
                  onClick={() => handleSetRoleDefault(currentDesign.role, currentDesign.id)}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-[12px] border transition-all ${
                    roleAssignments[currentDesign.role] === currentDesign.id
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                      : "bg-white/5 text-white/70 hover:text-white border-white/10 hover:bg-white/10"
                  }`}
                  title={roleAssignments[currentDesign.role] === currentDesign.id ? "Currently set as default template for this role" : "Save and set this template as the default for this role"}
                >
                  {roleAssignments[currentDesign.role] === currentDesign.id ? "✓ Default" : "Set as Default"}
                </button>
              )}

              {currentDesign.role === "bible" && (() => {
                const val = validateRoleTemplate(currentDesign);
                if (!val.valid) {
                  return (
                    <span className="text-[10px] text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-[12px]" title={`Missing required fields: ${val.missingFields.join(", ")}`}>
                      ⚠️ Needs: {val.missingFields.join(", ")}
                    </span>
                  );
                }
                return (
                  <span className="text-[10px] text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-[12px]">
                    ✓ Valid
                  </span>
                );
              })()}
            </div>
          </div>

          {/* Center: Undo / Redo */}
          <div className="flex items-center bg-white/5 border border-white/10 rounded-[12px] p-0.5">
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className="px-2.5 py-1 text-xs font-bold text-white/80 hover:text-white disabled:opacity-20 rounded-[12px] hover:bg-white/5 transition-all flex items-center gap-1"
              title="Undo (Cmd+Z)"
            >
              <PiArrowCounterClockwise size={13} />
              <span>Undo</span>
            </button>
            <div className="w-px h-3.5 bg-white/10" />
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="px-2.5 py-1 text-xs font-bold text-white/80 hover:text-white disabled:opacity-20 rounded-[12px] hover:bg-white/5 transition-all flex items-center gap-1"
              title="Redo (Cmd+Y)"
            >
              <PiArrowClockwise size={13} />
              <span>Redo</span>
            </button>
          </div>

          {/* Right: Studio Actions & Controls */}
          <div className="flex items-center gap-2">

            <ActionButton
              onClick={() => handleAddToLiveControls()}
              disabled={currentDesign.layers.length === 0}
              className="px-3.5 py-1.5 rounded-[12px] bg-indigo-600 hover:bg-indigo-500 disabled:opacity-35 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
              title="Save current overlay design as a Live Switcher control tile"
              aria-label="Add to Live Controls"
            >
              <PiBroadcast size={14} />
              <span>Add to Live Controls</span>
            </ActionButton>

            {existingControls.length > 0 && (
              <div className="flex items-center gap-1 bg-black/40 border border-white/10 p-0.5 rounded-[12px]">
                {existingControls.length > 1 && (
                  <select
                    value={selectedUpdateControlId}
                    onChange={(e) => setSelectedUpdateControlId(e.target.value)}
                    className="bg-transparent text-white text-[11px] px-1.5 py-1 focus:outline-none max-w-[120px] truncate"
                    aria-label="Select Control to Update"
                  >
                    {existingControls.map((c) => (
                      <option key={c.id} value={c.id} className="bg-neutral-900 text-white">
                        {c.label || c.name}
                      </option>
                    ))}
                  </select>
                )}
                <ActionButton
                  onClick={() => handleUpdateSavedControl()}
                  disabled={currentDesign.layers.length === 0}
                  className="px-3 py-1.5 rounded-[12px] bg-amber-600 hover:bg-amber-500 disabled:opacity-35 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
                  title="Commit changes to selected saved control snapshot"
                  aria-label="Update Saved Control"
                >
                  <PiFloppyDisk size={14} />
                  <span>Update Saved Control</span>
                </ActionButton>
              </div>
            )}

            <ActionButton
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-[12px] bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-md active:scale-95 flex items-center gap-1"
              aria-label="Done editing"
            >
              <span>Done</span>
            </ActionButton>
            <ActionButton
              onClick={onClose}
              className="p-1.5 rounded-[12px] bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all"
              title="Close Design Studio"
              aria-label="Close Design Studio"
            >
              <PiX size={16} />
            </ActionButton>
          </div>
        </div>

        {/* ── Main Work Area: Left Tools Shelf + Center Video Canvas + Right Inspector ─ */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* ── Left Shelf: Tools & Templates ─────────────────────────────────── */}
          <div className="w-72 bg-[#100e1b] border-r border-white/10 flex flex-col shrink-0 overflow-hidden">
            {/* Tool Category Tabs */}
            <div className="grid grid-cols-4 p-1 gap-1 border-b border-white/10 bg-white/[0.01]">
              {[
                { id: "templates", label: "Templates", icon: PiTelevision },
                { id: "text", label: "Text", icon: PiTextT },
                { id: "shapes", label: "Shapes", icon: PiSquare },
                { id: "images", label: "Media", icon: PiImage },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  data-studio-tool-tab={id}
                  onClick={() => setActiveToolTab(id)}
                  className={`py-2 flex flex-col items-center gap-1 text-[10px] font-bold rounded-[12px] transition-all ${
                    activeToolTab === id
                      ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                      : "text-white/40 hover:text-white/80 hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <Icon size={15} />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {/* Tool Shelf Body */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
              {/* TAB: Templates */}
              {activeToolTab === "templates" && (
                <div className="space-y-2">
                  <div className="pb-1">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-white/40 block">
                      Lower Third Templates
                    </span>
                    <p className="text-[10px] text-white/40">1-click editable church overlays</p>
                  </div>

                  {/* Category Filter Pills */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
                    {["All", "Glassmorphism", "Minimal", "Modern", "Gradient"].map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setTemplateCategoryFilter(cat)}
                        className={`px-2 py-0.5 rounded-[12px] text-[9px] font-bold transition-all shrink-0 border ${
                          templateCategoryFilter === cat
                            ? "bg-purple-600 border-purple-400 text-white shadow-sm"
                            : "bg-black/30 border-white/10 text-white/50 hover:text-white hover:border-white/20"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {TEMPLATES.filter((t) => templateCategoryFilter === "All" || t.category === templateCategoryFilter).map((tmpl) => (
                    <div
                      key={tmpl.id}
                      onClick={() => handleAddTemplate(tmpl)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleAddTemplate(tmpl);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className="p-2.5 rounded-[12px] bg-white/[0.02] border border-white/10 hover:border-purple-500/50 hover:bg-white/[0.05] cursor-pointer transition-all group space-y-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500"
                      title={`Insert ${tmpl.name}`}
                      aria-label={`Insert ${tmpl.name}`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-white group-hover:text-purple-300 transition-colors truncate">
                          {tmpl.name}
                        </span>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-[12px] bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0">
                          {tmpl.category}
                        </span>
                      </div>
                      <div className="h-14 w-full rounded-[12px] overflow-hidden border border-white/10 bg-[#08070e] flex items-center justify-center group-hover:border-purple-500/40 transition-colors">
                        <TemplateThumbnailPreview tmpl={tmpl} />
                      </div>
                      <p className="text-[10px] text-white/40 leading-snug truncate">
                        {tmpl.layers.map((l) => l.name).join(" • ")}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* TAB: Text Tools */}
              {activeToolTab === "text" && (
                <div className="space-y-2.5">
                  <div className="pb-1">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-white/40 block">
                      Add Text Elements
                    </span>
                    <p className="text-[10px] text-white/40">Click to insert on the video screen</p>
                  </div>

                  <ActionButton
                    onClick={() => handleAddText("heading")}
                    className="w-full p-3 rounded-[12px] bg-white/[0.03] border border-white/10 hover:border-purple-500/50 hover:bg-white/[0.06] text-left transition-all flex flex-col"
                  >
                    <span className="text-sm font-bold text-white">Add a Heading</span>
                    <span className="text-[10px] text-white/40">Bold title for speaker or topic</span>
                  </ActionButton>

                  <ActionButton
                    onClick={() => handleAddText("sub")}
                    className="w-full p-3 rounded-[12px] bg-white/[0.03] border border-white/10 hover:border-purple-500/50 hover:bg-white/[0.06] text-left transition-all flex flex-col"
                  >
                    <span className="text-xs font-semibold text-white/90">Add a Subtitle</span>
                    <span className="text-[10px] text-white/40">Role, title, or reference</span>
                  </ActionButton>

                  <ActionButton
                    onClick={() => handleAddText("body")}
                    className="w-full p-3 rounded-[12px] bg-white/[0.03] border border-white/10 hover:border-purple-500/50 hover:bg-white/[0.06] text-left transition-all flex flex-col"
                  >
                    <span className="text-xs text-white/70">Add Body Text</span>
                    <span className="text-[10px] text-white/40">Announcement or scripture verse text</span>
                  </ActionButton>
                </div>
              )}

              {/* TAB: Shapes */}
              {activeToolTab === "shapes" && (
                <div className="space-y-2.5">
                  <div className="pb-1">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-white/40 block">
                      Geometric Shapes
                    </span>
                    <p className="text-[10px] text-white/40">Compact visual picker · Vector paths</p>
                  </div>

                  <div data-studio-shape-picker="true" className="grid grid-cols-3 gap-1.5 max-h-[calc(100vh-280px)] overflow-y-auto pr-0.5">
                    {SHAPE_PICKER_ITEMS.map((item) => (
                      <ActionButton
                        key={item.id}
                        data-studio-shape-item={item.id}
                        onClick={() => handleAddShape(item.id)}
                        title={item.tooltip}
                        aria-label={item.tooltip}
                        className="p-2 rounded-[12px] bg-white/[0.03] border border-white/10 hover:border-purple-500/50 hover:bg-white/[0.06] flex flex-col items-center justify-center gap-1.5 transition-all text-center group"
                      >
                        <div className="w-7 h-6 flex items-center justify-center pointer-events-none">
                          {item.icon}
                        </div>
                        <span className="text-[10px] font-semibold text-white/90 truncate w-full group-hover:text-white">
                          {item.label}
                        </span>
                      </ActionButton>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB: Images */}
              {activeToolTab === "images" && (
                <div className="space-y-3">
                  <div className="pb-1">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-white/40 block">
                      Local Image Overlays
                    </span>
                    <p className="text-[10px] text-white/40">Import transparent PNGs, JPEGs, or WebP</p>
                  </div>

                  <ActionButton
                    onClick={() => handleImportImage()}
                    className="w-full py-2.5 rounded-[12px] bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md"
                  >
                    <PiPlus size={14} />
                    <span>Upload Local Image</span>
                  </ActionButton>

                  <div className="p-3 rounded-[12px] bg-white/[0.02] border border-white/5 text-[11px] text-white/50 leading-relaxed">
                    Transparent PNGs are automatically supported for church logos, speaker headshots, and custom frames.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Center Column: 16:9 Broadcast Canvas with Video Preview Beneath ── */}
          <div className="flex-1 min-w-0 flex flex-col p-2 bg-[#08070d] relative overflow-hidden">
            {/* Hidden native file input fallback */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileInputChange}
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
            />
            {/* Hidden native file input for clipping mask image placement */}
            <input
              type="file"
              ref={maskFileInputRef}
              onChange={handleMaskFileInputChange}
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
            />

            {/* Top Viewport Header & Zoom Toolbar */}
            <div className="w-full h-9 flex items-center justify-between px-2 bg-[#12101f] border border-white/10 rounded-[12px] mb-2 shrink-0 select-none">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowRulers((s) => !s)}
                  className={`px-2 py-1 rounded-[12px] text-[10px] font-bold border transition-all ${
                    showRulers
                      ? "bg-purple-600/40 border-purple-400 text-white"
                      : "bg-black/30 border-white/10 text-white/50 hover:text-white"
                  }`}
                  title="Toggle Output Pixel Rulers (0-1280, 0-720)"
                >
                  Rulers: {showRulers ? "ON" : "OFF"}
                </button>

                {/* Tool Selection: Select vs Hand Tool */}
                <div className="flex items-center gap-0.5 bg-black/40 p-0.5 rounded-[12px] border border-white/10">
                  <button
                    type="button"
                    onClick={() => setActiveTool("select")}
                    className={`px-2 py-1 rounded-[12px] text-[10px] font-bold flex items-center gap-1 transition-all ${
                      activeTool === "select"
                        ? "bg-purple-600 text-white shadow"
                        : "text-white/50 hover:text-white"
                    }`}
                    title="Select Tool (V) - Select and transform canvas layers"
                  >
                    <PiCursor size={12} />
                    <span>Select</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTool("hand")}
                    className={`px-2 py-1 rounded-[12px] text-[10px] font-bold flex items-center gap-1 transition-all ${
                      activeTool === "hand"
                        ? "bg-purple-600 text-white shadow"
                        : "text-white/50 hover:text-white"
                    }`}
                    title="Hand / Pan Tool (H / Space) - Click and drag anywhere to pan canvas"
                  >
                    <PiHandPalm size={12} />
                    <span>Hand</span>
                  </button>
                </div>

                {/* Multi-selection Clipping Mask Trigger */}
                {canCreateClippingMask() && (
                  <button
                    type="button"
                    onClick={handleCreateClippingMask}
                    className="px-2.5 py-1 rounded-[12px] bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-[10px] font-bold shadow flex items-center gap-1.5 transition-all animate-pulse"
                    title="Combine selected shape and image into a clipping mask"
                  >
                    <PiIntersect size={13} />
                    <span>Create Clipping Mask</span>
                  </button>
                )}
              </div>

              {/* Center zoom controls bar */}
              <div className="flex items-center gap-1.5 bg-black/40 px-2 py-0.5 rounded-[12px] border border-white/10 text-xs">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  disabled={zoom <= 0.25}
                  className="p-1 rounded-[12px] text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30"
                  title="Zoom Out (Ctrl + Scroll)"
                >
                  <PiMinus size={12} />
                </button>

                <div className="flex items-center gap-0.5">
                  <input
                    type="text"
                    value={`${Math.round(zoom * 100)}%`}
                    onChange={(e) => {
                      const val = parseInt(e.target.value.replace("%", ""), 10);
                      if (!isNaN(val)) {
                        setZoom(Math.max(0.25, Math.min(4.0, Number((val / 100).toFixed(2)))));
                      }
                    }}
                    className="w-11 bg-transparent text-center font-mono text-[11px] text-white focus:outline-none focus:bg-white/10 rounded-[12px]"
                    aria-label="Editor Zoom Percentage"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleZoomIn}
                  disabled={zoom >= 4.0}
                  className="p-1 rounded-[12px] text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30"
                  title="Zoom In (Ctrl + Scroll)"
                >
                  <PiPlus size={12} />
                </button>

                <div className="h-3 w-[1px] bg-white/15 mx-1" />

                <button
                  type="button"
                  onClick={handleResetZoom}
                  className={`px-1.5 py-0.5 rounded-[12px] text-[10px] font-semibold transition-all ${
                    zoom === 1 ? "bg-purple-600 text-white" : "text-white/50 hover:text-white"
                  }`}
                  title="Reset Zoom to 100%"
                >
                  100%
                </button>

                <button
                  type="button"
                  onClick={handleFitZoom}
                  className="px-1.5 py-0.5 rounded-[12px] text-[10px] font-semibold text-white/50 hover:text-white"
                  title="Fit to Viewport"
                >
                  Fit
                </button>
              </div>

              {/* Right helpers & pan status */}
              <div className="flex items-center gap-2 text-[10px] text-white/40">
                <span className={isSpacePressed || activeTool === "hand" ? "text-purple-300 font-bold" : ""}>
                  {isSpacePressed || activeTool === "hand" ? "🖐 Drag to Pan" : "Space / H to Pan"}
                </span>
                {cursorCanvasPos.x != null && (
                  <span className="font-mono text-purple-300 bg-black/40 px-1.5 py-0.5 rounded-[12px] border border-white/5">
                    X: {cursorCanvasPos.x} Y: {cursorCanvasPos.y}
                  </span>
                )}
              </div>
            </div>

            {/* Viewport and Rulers Layout Container */}
            <div
              ref={viewportRef}
              onMouseDown={handleViewportMouseDown}
              onMouseMove={handleViewportMouseMove}
              onMouseLeave={() => setCursorCanvasPos({ x: null, y: null })}
              onWheel={handleCanvasWheel}
              className={`flex-1 w-full min-h-0 relative flex flex-col overflow-hidden bg-[#06050b] rounded-[12px] border border-white/10 ${
                isSpacePressed || activeTool === "hand"
                  ? (isPanning ? "cursor-grabbing" : "cursor-grab")
                  : ""
              }`}
            >
              {/* Top Ruler Bar */}
              {showRulers && (
                <div className="w-full h-5 flex shrink-0 bg-[#0c0a17] border-b border-white/10 z-20">
                  <div className="w-5 h-5 shrink-0 bg-[#120f24] border-r border-white/10 flex items-center justify-center text-[7px] font-mono text-white/40">
                    px
                  </div>
                  <div className="flex-1 h-5 relative overflow-hidden">
                    {(() => {
                      const cRect = rulerMetrics.canvasRect;
                      const vRect = rulerMetrics.viewportRect;
                      if (!cRect || !vRect) return null;
                      const ticks = [];
                      for (let x = 0; x <= 1280; x += 40) {
                        const screenX = cRect.left + (x / 1280) * cRect.width - (vRect.left + 20);
                        if (screenX >= -20 && screenX <= vRect.width) {
                          const isMajor = x % 100 === 0 || x === 0 || x === 1280;
                          ticks.push({ x, screenX, isMajor });
                        }
                      }
                      const cursorScreenX = cursorCanvasPos.x != null
                        ? cRect.left + (cursorCanvasPos.x / 1280) * cRect.width - (vRect.left + 20)
                        : null;

                      return (
                        <>
                          {ticks.map(({ x, screenX, isMajor }) => (
                            <div key={x} className="absolute top-0 flex flex-col items-center pointer-events-none" style={{ left: `${screenX}px` }}>
                              <div className={`w-[1px] ${isMajor ? "bg-white/40 h-2.5" : "bg-white/15 h-1.5"}`} />
                              {isMajor && (
                                <span className="text-[7px] font-mono text-white/40 leading-none mt-0.5 -translate-x-1/2 select-none">
                                  {x}
                                </span>
                              )}
                            </div>
                          ))}
                          {cursorScreenX != null && (
                            <div className="absolute inset-y-0 w-[1px] bg-purple-400 z-10 pointer-events-none shadow" style={{ left: `${cursorScreenX}px` }} />
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Main Viewport Row: Left Ruler + Canvas Pan Workspace */}
              <div className="flex-1 w-full min-h-0 flex relative overflow-hidden">
                {/* Left Ruler Bar */}
                {showRulers && (
                  <div className="w-5 h-full shrink-0 bg-[#0c0a17] border-r border-white/10 relative overflow-hidden z-20">
                    {(() => {
                      const cRect = rulerMetrics.canvasRect;
                      const vRect = rulerMetrics.viewportRect;
                      if (!cRect || !vRect) return null;
                      const ticks = [];
                      for (let y = 0; y <= 720; y += 40) {
                        const screenY = cRect.top + (y / 720) * cRect.height - (vRect.top + (showRulers ? 20 : 0));
                        if (screenY >= -20 && screenY <= vRect.height) {
                          const isMajor = y % 100 === 0 || y === 0 || y === 720;
                          ticks.push({ y, screenY, isMajor });
                        }
                      }
                      const cursorScreenY = cursorCanvasPos.y != null
                        ? cRect.top + (cursorCanvasPos.y / 720) * cRect.height - (vRect.top + (showRulers ? 20 : 0))
                        : null;

                      return (
                        <>
                          {ticks.map(({ y, screenY, isMajor }) => (
                            <div key={y} className="absolute left-0 flex items-center pointer-events-none" style={{ top: `${screenY}px` }}>
                              <div className={`h-[1px] ${isMajor ? "bg-white/40 w-2.5" : "bg-white/15 w-1.5"}`} />
                              {isMajor && (
                                <span className="text-[7px] font-mono text-white/40 leading-none ml-0.5 -translate-y-1/2 select-none">
                                  {y}
                                </span>
                              )}
                            </div>
                          ))}
                          {cursorScreenY != null && (
                            <div className="absolute inset-x-0 h-[1px] bg-purple-400 z-10 pointer-events-none shadow" style={{ top: `${cursorScreenY}px` }} />
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* Canvas Workspace with Pan & Zoom Transform */}
                <div className="flex-1 h-full relative overflow-hidden flex items-center justify-center p-4">
                  <div
                    ref={canvasRef}
                    onMouseDown={(e) => {
                      if (isSpacePressed || activeTool === "hand") return;
                      const isBg = e.target === canvasRef.current ||
                        e.target.getAttribute("data-studio-canvas") === "true" ||
                        e.target.getAttribute("data-canvas-bg") === "true";
                      if (isBg) {
                        setSelectedLayerId(null);
                        setSelectedLayerIds([]);
                        setEditingTextLayerId(null);
                        setEditingShapeLayerId(null);
                      }
                    }}
                    onClick={(e) => {
                      if (isSpacePressed || activeTool === "hand") return;
                      const isBg = e.target === canvasRef.current ||
                        e.target.getAttribute("data-studio-canvas") === "true" ||
                        e.target.getAttribute("data-canvas-bg") === "true";
                      if (isBg) {
                        setSelectedLayerId(null);
                        setSelectedLayerIds([]);
                        setEditingTextLayerId(null);
                        setEditingShapeLayerId(null);
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "copy";
                    }}
                    onDrop={handleFileDrop}
                    className="w-full aspect-video bg-black rounded-[12px] border border-white/15 relative overflow-hidden shadow-2xl select-none max-w-5xl"
                    data-studio-canvas="true"
                    style={{
                      containerType: "size",
                      transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
                      transformOrigin: "center center",
                      transition: isPanning ? "none" : "transform 0.08s ease-out",
                    }}
                  >
                    {/* 1. Live Program Video Running Beneath Overlays */}
                    <div data-canvas-bg="true" className="absolute inset-0 z-0 bg-[#07060c] flex items-center justify-center overflow-hidden pointer-events-auto">
                      {cameraStreams && cameraStreams.get(effectiveProgramSourceId) ? (
                        <video
                          ref={previewVideoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover pointer-events-none opacity-100"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#131024] via-[#0b0a14] to-black p-6 text-center pointer-events-none">
                          <div className="w-12 h-12 rounded-[12px] bg-white/[0.04] border border-white/10 flex items-center justify-center text-white/30 mb-2">
                            <PiTelevision size={24} />
                          </div>
                          <p className="text-xs font-bold text-white/70 uppercase tracking-wider">
                            Program Feed ({getSourceName ? getSourceName(effectiveProgramSourceId) : "Live Screen"})
                          </p>
                          <p className="text-[10px] text-white/30 mt-1 max-w-sm">
                            Overlay design elements are rendered transparently over this program video in real time.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* 2. Alignment Snap Guides */}
                    {snapGuide.x && (
                      <div className="absolute inset-y-0 left-1/2 w-0.5 bg-purple-400 z-50 pointer-events-none shadow-sm" />
                    )}
                    {snapGuide.y && (
                      <div className="absolute inset-x-0 top-1/2 h-0.5 bg-purple-400 z-50 pointer-events-none shadow-sm" />
                    )}

                    {/* 3. Design Layers Canvas Elements */}
                    {currentDesign.layers.map((layer) => {
                      if (layer.visible === false) return null;
                      const isSelected = selectedLayerIds.includes(layer.id);
                      const isInlineEditing = editingTextLayerId === layer.id;
                      const baseZ = layer.zIndex || (layer.type === "shape" ? 10 : 20);
                      const zIndex = isInlineEditing ? 150 : (isSelected ? baseZ + 2 : baseZ);
                      const rotation = layer.rotation || 0;
                      const sw = typeof layer.strokeWidth === "number" ? layer.strokeWidth : (layer.shape === "line" ? 3 : 2);

                      const isPreviewingThis = previewAnimationActive && (isSelected || (layer.groupId && selectedLayer?.groupId === layer.groupId));
                      const ent = layer.transition?.entrance || { type: "fade", durationMs: 350 };
                      const animDur = `${ent.durationMs || 350}ms`;
                      let animName = undefined;
                      if (isPreviewingThis && ent.type && ent.type !== "none") {
                        if (ent.type === "fade") animName = "studioAnimFade";
                        else if (ent.type === "slide-fade-left") animName = "studioAnimSlideFadeLeft";
                        else if (ent.type === "slide-fade-right") animName = "studioAnimSlideFadeRight";
                        else if (ent.type === "scale") animName = "studioAnimScale";
                        else if (ent.type === "fly-up") animName = "studioAnimFlyUp";
                        else if (ent.type === "fly-down") animName = "studioAnimFlyDown";
                        else if (ent.type === "reveal-left") animName = "studioAnimRevealLeft";
                        else if (ent.type === "reveal-right") animName = "studioAnimRevealRight";
                      }

                      return (
                        <div
                          key={layer.id}
                          data-studio-layer-id={layer.id}
                          onClick={(e) => {
                            if (isSpacePressed || activeTool === "hand") return;
                            handleClickLayer(e, layer);
                          }}
                          onMouseDown={(e) => {
                            if (isSpacePressed || activeTool === "hand" || e.button === 1) return;
                            handleMouseDownOnLayer(e, layer);
                          }}
                          onDoubleClick={(e) => {
                            handleDoubleClickChild(e, layer);
                          }}
                          className={`absolute select-none group ${layer.type === "text" ? "cursor-text" : "cursor-move"}`}
                          style={{
                            left: `${layer.x}%`,
                            top: `${layer.y}%`,
                            transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                            width: `${layer.width}%`,
                            height: `${
                              typeof layer.height === "number"
                                ? layer.height
                                : layer.type === "image"
                                  ? ((layer.width || 30) * (16 / 9)) / (layer.aspectRatio || 1.777778)
                                  : layer.type === "text"
                                    ? 6
                                    : (layer.shape === "line" ? 2 : layer.shape === "arrow" ? 6 : 12)
                            }%`,
                            opacity: typeof layer.opacity === "number" ? layer.opacity : 1,
                            zIndex,
                            pointerEvents: isInlineEditing ? "none" : "auto",
                            animation: animName ? `${animName} ${animDur} ease-out forwards` : undefined,
                          }}
                        >
                          {/* Transform & Rotate Handles when selected and NOT inline editing */}
                          {isSelected && !isInlineEditing && (
                            <>
                              {/* When in image crop editing mode, show emerald crop outline and floating toolbar */}
                              {editingCropLayerId === layer.id && editingCropTarget === "image" ? (
                                <>
                                  <div className="absolute -inset-1 border-2 border-emerald-400 border-dashed rounded-[12px] pointer-events-none z-50 animate-pulse" />
                                  <div
                                    className="absolute -top-11 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 bg-neutral-900/95 border border-emerald-500/50 rounded-[12px] px-2.5 py-1 text-[11px] shadow-2xl backdrop-blur-md pointer-events-auto shrink-0 select-none whitespace-nowrap"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <span className="text-emerald-300 font-bold flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                      Crop Image
                                    </span>
                                    <span className="text-white/30">|</span>
                                    <button
                                      type="button"
                                      onClick={() => setEditingCropTarget("frame")}
                                      className="text-white/80 hover:text-white px-1.5 py-0.5 rounded-[12px] bg-white/10 hover:bg-white/20 font-medium text-[10px]"
                                      title="Switch to editing container frame"
                                    >
                                      Edit Frame
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleResetMaskCrop(layer.id)}
                                      className="text-white/80 hover:text-white px-1.5 py-0.5 rounded-[12px] bg-white/10 hover:bg-white/20 font-medium text-[10px]"
                                      title="Reset image pan & zoom"
                                    >
                                      Reset
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingCropLayerId(null);
                                        setEditingCropTarget("image");
                                      }}
                                      className="text-emerald-300 hover:text-emerald-200 px-2 py-0.5 rounded-[12px] bg-emerald-500/20 font-bold border border-emerald-500/40 text-[10px]"
                                      title="Finish crop editing (Esc)"
                                    >
                                      Done
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="absolute -inset-1 border-2 border-purple-500 border-dashed rounded-[12px] pointer-events-none z-50" />
                                  {editingCropLayerId === layer.id && editingCropTarget === "frame" && (
                                    <div
                                      className="absolute -top-11 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 bg-neutral-900/95 border border-purple-500/50 rounded-[12px] px-2.5 py-1 text-[11px] shadow-2xl backdrop-blur-md pointer-events-auto shrink-0 select-none whitespace-nowrap"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <span className="text-purple-300 font-bold flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                                        Editing Frame
                                      </span>
                                      <span className="text-white/30">|</span>
                                      <button
                                        type="button"
                                        onClick={() => setEditingCropTarget("image")}
                                        className="text-white/80 hover:text-white px-1.5 py-0.5 rounded-[12px] bg-white/10 hover:bg-white/20 font-medium text-[10px]"
                                        title="Switch to editing image crop"
                                      >
                                        Edit Image
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingCropLayerId(null);
                                          setEditingCropTarget("image");
                                        }}
                                        className="text-purple-300 hover:text-purple-200 px-2 py-0.5 rounded-[12px] bg-purple-500/20 font-bold border border-purple-500/40 text-[10px]"
                                        title="Finish editing (Esc)"
                                      >
                                        Done
                                      </button>
                                    </div>
                                  )}
                              {/* Handles only shown on active item */}
                              {selectedLayerId === layer.id && (
                                <>
                                  {(layer.shape === "line"
                                    ? (layer.height || 0) > (layer.width || 0)
                                      ? [
                                          { id: "mt", pos: "left-1/2 -translate-x-1/2 -top-2 cursor-ns-resize" },
                                          { id: "mb", pos: "left-1/2 -translate-x-1/2 -bottom-2 cursor-ns-resize" },
                                        ]
                                      : [
                                          { id: "ml", pos: "top-1/2 -translate-y-1/2 -left-2 cursor-ew-resize" },
                                          { id: "mr", pos: "top-1/2 -translate-y-1/2 -right-2 cursor-ew-resize" },
                                        ]
                                    : [
                                        { id: "nw", pos: "-top-2 -left-2 cursor-nwse-resize" },
                                        { id: "ne", pos: "-top-2 -right-2 cursor-nesw-resize" },
                                        { id: "sw", pos: "-bottom-2 -left-2 cursor-nesw-resize" },
                                        { id: "se", pos: "-bottom-2 -right-2 cursor-nwse-resize" },
                                        { id: "ml", pos: "top-1/2 -translate-y-1/2 -left-2 cursor-ew-resize" },
                                        { id: "mr", pos: "top-1/2 -translate-y-1/2 -right-2 cursor-ew-resize" },
                                        { id: "mt", pos: "left-1/2 -translate-x-1/2 -top-2 cursor-ns-resize" },
                                        { id: "mb", pos: "left-1/2 -translate-x-1/2 -bottom-2 cursor-ns-resize" },
                                      ]
                                  ).map(({ id: h, pos }) => (
                                    <div
                                      key={h}
                                      onClick={(e) => e.stopPropagation()}
                                      onMouseDown={(e) => handleMouseDownOnHandle(e, layer, h)}
                                      className={`absolute w-3.5 h-3.5 bg-purple-500 border-2 border-white rounded-full z-50 shadow-md ${pos}`}
                                      style={{ pointerEvents: "auto", transform: `scale(${1 / (zoom || 1)})` }}
                                    />
                                  ))}

                                  {/* Top Rotation Handle (hidden for divider lines) */}
                                  {layer.shape !== "line" && (
                                    <div
                                      onClick={(e) => e.stopPropagation()}
                                      onMouseDown={(e) => handleMouseDownOnHandle(e, layer, "rot")}
                                      className="absolute -top-6 left-1/2 -translate-x-1/2 w-4 h-4 bg-purple-600 border-2 border-white rounded-full cursor-grab z-50 shadow-md flex items-center justify-center text-[8px] text-white"
                                      style={{ pointerEvents: "auto", transform: `scale(${1 / (zoom || 1)})` }}
                                      title="Drag to rotate"
                                    >
                                      ↻
                                    </div>
                                  )}

                                  {/* Corner Rounding Handles for Rectangular Shapes */}
                                  {editingShapeLayerId !== layer.id &&
                                    layer.type === "shape" &&
                                    (layer.shape === "rounded-rect" || layer.shape === "rectangle" || layer.shape === "square") && (
                                    <>
                                      {[
                                        { id: "tl", pos: "top-2 left-2", idx: 0 },
                                        { id: "tr", pos: "top-2 right-2", idx: 1 },
                                        { id: "br", pos: "bottom-2 right-2", idx: 2 },
                                        { id: "bl", pos: "bottom-2 left-2", idx: 3 },
                                      ].map((ch) => (
                                        <div
                                          key={ch.id}
                                          onClick={(e) => e.stopPropagation()}
                                          onMouseDown={(e) => handleMouseDownOnCornerHandle(e, layer, ch.idx)}
                                          className={`absolute w-2.5 h-2.5 rounded-full bg-white border border-purple-600 shadow z-50 flex items-center justify-center cursor-pointer pointer-events-auto ${ch.pos}`}
                                          style={{ transform: `scale(${1 / (zoom || 1)})` }}
                                          title="Drag inward to round corner, drag outward to 0 for sharp corner"
                                        >
                                          <div className="w-1 h-1 rounded-full bg-purple-600" />
                                        </div>
                                      ))}
                                    </>
                                  )}
                                </>
                              )}
                            </>
                          )}
                        </>
                      )}

                          {/* Bézier Curve Node & Handle Overlay */}
                          {editingShapeLayerId === layer.id && layer.type === "shape" && (
                            <div className="absolute inset-0 pointer-events-none z-50">
                              {(() => {
                                const nodes = layer.customPath || getDefaultShapeNodes(layer.shape);
                                return (
                                  <>
                                    {/* Connector lines for Bézier handles */}
                                    <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none">
                                      {nodes.map((node, i) => {
                                        const prevIdx = i === 0 ? nodes.length - 1 : i - 1;
                                        const prev = nodes[prevIdx];
                                        return (
                                          <g key={i}>
                                            {node.cp1 && (
                                              <line
                                                x1={`${prev.x}%`}
                                                y1={`${prev.y}%`}
                                                x2={`${node.cp1.x}%`}
                                                y2={`${node.cp1.y}%`}
                                                stroke="#ec4899"
                                                strokeWidth="1"
                                                strokeDasharray="2,2"
                                              />
                                            )}
                                            {node.cp2 && (
                                              <line
                                                x1={`${node.x}%`}
                                                y1={`${node.y}%`}
                                                x2={`${node.cp2.x}%`}
                                                y2={`${node.cp2.y}%`}
                                                stroke="#a855f7"
                                                strokeWidth="1"
                                                strokeDasharray="2,2"
                                              />
                                            )}
                                          </g>
                                        );
                                      })}
                                    </svg>

                                    {/* Node vertex handles and Bézier control handles */}
                                    {nodes.map((node, i) => {
                                      const isNodeActive = activeCurveNodeIdx === i;
                                      return (
                                        <React.Fragment key={i}>
                                          {/* Vertex Handle */}
                                          <div
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setActiveCurveNodeIdx(i);
                                            }}
                                            onMouseDown={(e) => handleMouseDownOnCurveNode(e, layer, i, "vertex")}
                                            className={`absolute w-3 h-3 rounded-full border-2 border-white shadow-lg cursor-grab pointer-events-auto ${
                                              isNodeActive ? "bg-purple-500 ring-2 ring-purple-300" : "bg-blue-600"
                                            }`}
                                            style={{
                                              left: `${node.x}%`,
                                              top: `${node.y}%`,
                                              transform: `translate(-50%, -50%) scale(${1 / (zoom || 1)})`,
                                            }}
                                            title={`Node ${i + 1} - Drag to move vertex`}
                                          />

                                          {/* Control Point 1 (cp1) */}
                                          {node.cp1 && (
                                            <div
                                              onClick={(e) => e.stopPropagation()}
                                              onMouseDown={(e) => handleMouseDownOnCurveNode(e, layer, i, "cp1")}
                                              className="absolute w-2.5 h-2.5 rounded-full bg-pink-500 border border-white shadow cursor-grab pointer-events-auto"
                                              style={{
                                                left: `${node.cp1.x}%`,
                                                top: `${node.cp1.y}%`,
                                                transform: `translate(-50%, -50%) scale(${1 / (zoom || 1)})`,
                                              }}
                                              title="Control Handle 1"
                                            />
                                          )}

                                          {/* Control Point 2 (cp2) */}
                                          {node.cp2 && (
                                            <div
                                              onClick={(e) => e.stopPropagation()}
                                              onMouseDown={(e) => handleMouseDownOnCurveNode(e, layer, i, "cp2")}
                                              className="absolute w-2.5 h-2.5 rounded-full bg-purple-400 border border-white shadow cursor-grab pointer-events-auto"
                                              style={{
                                                left: `${node.cp2.x}%`,
                                                top: `${node.cp2.y}%`,
                                                transform: `translate(-50%, -50%) scale(${1 / (zoom || 1)})`,
                                              }}
                                              title="Control Handle 2"
                                            />
                                          )}

                                          {/* Straight segment midpoint curve handle */}
                                          {!node.cp1 && !node.cp2 && (
                                            (() => {
                                              const prevIdx = i === 0 ? nodes.length - 1 : i - 1;
                                              const prev = nodes[prevIdx];
                                              const midX = (prev.x + node.x) / 2;
                                              const midY = (prev.y + node.y) / 2;
                                              return (
                                                <div
                                                  onClick={(e) => e.stopPropagation()}
                                                  onMouseDown={(e) => handleMouseDownOnCurveNode(e, layer, i, "midpoint")}
                                                  className="absolute w-2 h-2 rounded-full bg-amber-400 border border-white opacity-80 hover:opacity-100 shadow cursor-crosshair pointer-events-auto"
                                                  style={{
                                                    left: `${midX}%`,
                                                    top: `${midY}%`,
                                                    transform: `translate(-50%, -50%) scale(${1 / (zoom || 1)})`,
                                                  }}
                                                  title="Drag to curve this straight edge"
                                                />
                                              );
                                            })()
                                          )}
                                        </React.Fragment>
                                      );
                                    })}
                                  </>
                                );
                              })()}
                            </div>
                          )}

                          {/* Content Rendering: Image / Shape / Text */}
                          {layer.type === "image" ? (
                            layer.content || layer.url || layer.filePath ? (
                              <div
                                onClick={(e) => handleClickLayer(e, layer)}
                                onMouseDown={(e) => handleMouseDownOnLayer(e, layer)}
                                onDoubleClick={(e) => handleDoubleClickChild(e, layer)}
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  position: "relative",
                                  overflow: "hidden",
                                  boxShadow: layer.shadowEnabled ? formatLayerShadow(layer) : "none",
                                  border: sw > 0 && layer.stroke && layer.stroke !== "transparent" ? `${sw}px solid ${layer.stroke}` : "none",
                                  ...getContainerShapeStyle(layer.frameShape || layer.mask, layer.borderRadius),
                                  pointerEvents: "auto",
                                }}
                              >
                                {(() => {
                                  const cropMetrics = calculateCropMetrics({
                                    containerWidth: 1000,
                                    containerHeight: 1000 / (layer.aspectRatio || (16 / 9)),
                                    naturalWidth: 1000,
                                    naturalHeight: 1000 / (layer.aspectRatio || (16 / 9)),
                                    fitMode: layer.frameCrop?.fitMode || "fill",
                                    zoom: layer.frameCrop?.zoom || 1,
                                    panX: layer.frameCrop?.panX || 0,
                                    panY: layer.frameCrop?.panY || 0,
                                  });
                                  return (
                                    <img
                                      src={layer.content || layer.url || layer.filePath}
                                      alt={layer.name || "Layer"}
                                      className="pointer-events-none select-none"
                                      draggable={false}
                                      style={cropMetrics.css}
                                    />
                                  );
                                })()}
                              </div>
                            ) : (
                              <div
                                onClick={(e) => handleClickLayer(e, layer)}
                                onMouseDown={(e) => handleMouseDownOnLayer(e, layer)}
                                onDoubleClick={(e) => handleDoubleClickChild(e, layer)}
                                className="w-full h-full relative overflow-hidden flex items-center justify-center select-none cursor-pointer"
                                style={{
                                  backgroundColor: "#18181b",
                                  border: sw > 0 && layer.stroke && layer.stroke !== "transparent" ? `${sw}px solid ${layer.stroke}` : "1px solid rgba(255,255,255,0.15)",
                                  boxShadow: layer.shadowEnabled ? formatLayerShadow(layer) : "none",
                                  ...getContainerShapeStyle(layer.frameShape || layer.mask, layer.borderRadius),
                                  pointerEvents: "auto",
                                }}
                              >
                                <div className="text-center p-2 text-white/30 text-[10px]">
                                  Empty Image Container
                                </div>
                              </div>
                            )
                          ) : layer.type === "shape" ? (
                            renderVectorShape(layer, sw)
                          ) : layer.type === "text" ? (
                            isInlineEditing ? (
                              <textarea
                                value={layer.text || ""}
                                autoFocus
                                onFocus={(e) => {
                                  const val = e.target.value;
                                  e.target.setSelectionRange(val.length, val.length);
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                onDoubleClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => {
                                  e.stopPropagation();
                                  if (e.key === "Escape") {
                                    setEditingTextLayerId(null);
                                  } else if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    setEditingTextLayerId(null);
                                  }
                                }}
                                onChange={(e) => {
                                  const newText = e.target.value;
                                  setCurrentDesign((prev) => ({
                                    ...prev,
                                    layers: prev.layers.map((l) => (l.id === layer.id ? { ...l, text: newText } : l)),
                                  }));
                                  setHasUnsavedChanges(true);
                                }}
                                onBlur={() => {
                                  setEditingTextLayerId(null);
                                }}
                                className="w-full bg-black/80 border border-purple-400 rounded-[12px] px-2 py-1 outline-none resize-none shadow-2xl text-white select-text"
                                style={{
                                  fontFamily: layer.fontFamily || "Inter, sans-serif",
                                  fontSize: `calc(${(layer.fontSize || 22)} * 100cqh / 720)`,
                                  fontWeight: layer.fontWeight || "bold",
                                  color: layer.color || "#ffffff",
                                  textAlign: layer.textAlign || "left",
                                  textTransform: layer.textTransform || "none",
                                  lineHeight: 1.25,
                                  minHeight: "2em",
                                }}
                              />
                            ) : (
                              <div
                                data-studio-text-content="true"
                                onClick={(e) => handleClickLayer(e, layer)}
                                onMouseDown={(e) => handleMouseDownOnLayer(e, layer)}
                                onDoubleClick={(e) => handleDoubleClickText(e, layer)}
                                style={{
                                  width: "100%",
                                  fontFamily: layer.fontFamily || "Inter, sans-serif",
                                  fontSize: `calc(${(layer.fontSize || 22)} * 100cqh / 720)`,
                                  fontWeight: layer.fontWeight || "bold",
                                  color: layer.color || "#ffffff",
                                  textAlign: layer.textAlign || "left",
                                  textTransform: layer.textTransform || "none",
                                  lineHeight: 1.25,
                                  whiteSpace: "pre-wrap",
                                  cursor: "text",
                                  pointerEvents: "auto",
                                  textShadow: layer.shadowEnabled ? formatLayerShadow(layer) : "none",
                                  position: "relative",
                                }}
                                title="Double-click to edit text directly on canvas"
                              >
                                {layer.fieldBinding && (
                                  <span className="absolute -top-3 left-0 text-[8px] font-mono px-1 py-0.2 bg-purple-900/80 text-purple-200 rounded-[12px] border border-purple-500/30 pointer-events-none select-none">
                                    [{layer.fieldBinding}]
                                  </span>
                                )}
                                {layer.text || "Heading Text"}
                              </div>
                            )
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Canvas Quick Helper Bar */}
            <div className="w-full mt-2 flex items-center justify-between text-[11px] text-white/40 px-1 shrink-0 select-none">
              <span>Click element to select · Drag to move · Drag corners to resize · Rotate top handle · Space+drag to pan</span>
              <span>16:9 Broadcast Canvas ({Math.round(zoom * 100)}% zoom)</span>
            </div>
          </div>

          {/* ── Right Column: Inspector & Layers Stack ───────────────────────── */}
          <div className="w-80 bg-[#100e1b] border-l border-white/10 flex flex-col shrink-0 overflow-hidden">
            {/* Inspector Header */}
            <div className="p-3 border-b border-white/10 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-white">
                {selectedLayer ? "Layer Inspector" : "Layers & Elements"}
              </span>
              <span className="text-[10px] font-mono text-white/40">
                {currentDesign.layers.length} items
              </span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
              {/* Selected Layer Properties */}
              {selectedLayerIds.length > 1 ? (
                /* Multi-Selection Inspector Card */
                <div className="space-y-3">
                  <div className="p-3 bg-[#151221] rounded-[12px] border border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">
                        {selectedLayerIds.length} Elements Selected
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={handleDuplicateSelected}
                          className="p-1.5 rounded-[12px] bg-white/5 hover:bg-white/15 text-white/80 hover:text-white"
                          title="Duplicate Selected (Cmd+D)"
                          aria-label="Duplicate Selected"
                        >
                          <PiCopy size={13} />
                        </button>
                        <button
                          onClick={handleDeleteSelected}
                          className="p-1.5 rounded-[12px] bg-red-500/15 hover:bg-red-500/25 text-red-300"
                          title="Delete Selected (Delete / Backspace)"
                          aria-label="Delete Selected"
                        >
                          <PiTrash size={13} />
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        const newGroupId = `grp_${Date.now()}`;
                        pushUndoSnapshot();
                        setCurrentDesign((prev) => ({
                          ...prev,
                          layers: prev.layers.map((l) => (selectedLayerIds.includes(l.id) ? { ...l, groupId: newGroupId } : l)),
                        }));
                        showFeedback(`Grouped ${selectedLayerIds.length} elements`, true);
                      }}
                      className="w-full py-1.5 rounded-[12px] bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/30 text-purple-200 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                    >
                      <PiStack size={13} />
                      <span>Group Elements</span>
                    </button>
                  </div>

                  {/* Alignment Toolbar for Multi-Selection */}
                  <div className="p-3 bg-[#151221] rounded-[12px] border border-white/10 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 block">Align Selection</span>
                    <div className="grid grid-cols-6 gap-1">
                      <button
                        onClick={() => handleAlignSelected("left")}
                        className="p-1.5 rounded-[12px] bg-white/5 hover:bg-white/15 text-white/70 hover:text-white flex items-center justify-center transition-all"
                        title="Align Left"
                        aria-label="Align Left"
                      >
                        <PiAlignLeft size={13} />
                      </button>
                      <button
                        onClick={() => handleAlignSelected("center-h")}
                        className="p-1.5 rounded-[12px] bg-white/5 hover:bg-white/15 text-white/70 hover:text-white flex items-center justify-center transition-all"
                        title="Align Center Horizontal"
                        aria-label="Align Center Horizontal"
                      >
                        <PiAlignCenterHorizontal size={13} />
                      </button>
                      <button
                        onClick={() => handleAlignSelected("right")}
                        className="p-1.5 rounded-[12px] bg-white/5 hover:bg-white/15 text-white/70 hover:text-white flex items-center justify-center transition-all"
                        title="Align Right"
                        aria-label="Align Right"
                      >
                        <PiAlignRight size={13} />
                      </button>
                      <button
                        onClick={() => handleAlignSelected("top")}
                        className="p-1.5 rounded-[12px] bg-white/5 hover:bg-white/15 text-white/70 hover:text-white flex items-center justify-center transition-all"
                        title="Align Top"
                        aria-label="Align Top"
                      >
                        <PiAlignTop size={13} />
                      </button>
                      <button
                        onClick={() => handleAlignSelected("center-v")}
                        className="p-1.5 rounded-[12px] bg-white/5 hover:bg-white/15 text-white/70 hover:text-white flex items-center justify-center transition-all"
                        title="Align Center Vertical"
                        aria-label="Align Center Vertical"
                      >
                        <PiAlignCenterVertical size={13} />
                      </button>
                      <button
                        onClick={() => handleAlignSelected("bottom")}
                        className="p-1.5 rounded-[12px] bg-white/5 hover:bg-white/15 text-white/70 hover:text-white flex items-center justify-center transition-all"
                        title="Align Bottom"
                        aria-label="Align Bottom"
                      >
                        <PiAlignBottom size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ) : selectedLayer ? (
                <div className="space-y-3">
                  {/* 1. Element Identity Card */}
                  <div className="p-3 bg-[#151221] rounded-[12px] border border-white/10 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={selectedLayer.name || ""}
                        onChange={(e) => updateLayerDraft(selectedLayer.id, { name: e.target.value })}
                        onBlur={() => pushUndoSnapshot()}
                        className="flex-1 min-w-0 bg-black/40 border border-white/15 px-2.5 py-1 text-xs font-bold text-white rounded-[12px] focus:outline-none focus:border-purple-500 truncate"
                        placeholder="Element Name"
                        aria-label="Element Name"
                      />
                      <span className="px-2 py-0.5 rounded-[12px] bg-purple-500/20 border border-purple-500/30 text-purple-300 text-[10px] font-bold uppercase shrink-0">
                        {selectedLayer.type}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-white/5">
                      <span className="text-[10px] text-white/40 font-mono">
                        {selectedLayer.groupId ? "Grouped element" : "Single element"}
                      </span>

                      <div className="flex items-center gap-1">
                        {selectedLayer.groupId && (
                          <>
                            <button
                              onClick={() => {
                                pushUndoSnapshot();
                                setCurrentDesign((prev) => ({
                                  ...prev,
                                  layers: prev.layers.map((l) => (l.id === selectedLayer.id ? { ...l, groupId: null } : l)),
                                }));
                                showFeedback("Ungrouped element", true);
                              }}
                              className="p-1.5 rounded-[12px] bg-white/5 hover:bg-white/15 text-purple-300"
                              title="Ungroup Element"
                              aria-label="Ungroup Element"
                            >
                              <PiMinus size={13} />
                            </button>
                            <button
                              onClick={() => {
                                const grpIds = currentDesign.layers.filter((l) => l.groupId === selectedLayer.groupId).map((l) => l.id);
                                setSelectedLayerIds(grpIds);
                              }}
                              className="p-1.5 rounded-[12px] bg-white/5 hover:bg-white/15 text-purple-300"
                              title="Select Whole Group"
                              aria-label="Select Whole Group"
                            >
                              <PiStack size={13} />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleDuplicateLayer(selectedLayer.id)}
                          className="p-1.5 rounded-[12px] bg-white/5 hover:bg-white/15 text-white/70 hover:text-white"
                          title="Duplicate (Cmd+D)"
                          aria-label="Duplicate"
                        >
                          <PiCopy size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteLayer(selectedLayer.id)}
                          className="p-1.5 rounded-[12px] bg-red-500/15 hover:bg-red-500/25 text-red-300"
                          title="Delete (Delete / Backspace)"
                          aria-label="Delete"
                        >
                          <PiTrash size={13} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 2. Dimensions & Rotation */}
                  <div className="p-3 bg-[#151221] rounded-[12px] border border-white/10 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 block">Dimensions</span>
                      {selectedLayer.type === "shape" && selectedLayer.shape !== "line" && (
                        <button
                          data-studio-aspect-lock="true"
                          onClick={() => updateLayer(selectedLayer.id, { aspectLocked: !selectedLayer.aspectLocked })}
                          className={`px-2 py-0.5 rounded-[12px] text-[10px] font-bold flex items-center gap-1 transition-all ${
                            selectedLayer.aspectLocked
                              ? "bg-purple-600/30 text-purple-300 border border-purple-500/40"
                              : "bg-white/5 text-white/40 hover:text-white border border-white/10"
                          }`}
                          title={selectedLayer.aspectLocked ? "Aspect ratio locked: proportions preserved during resize (Click to unlock)" : "Aspect ratio unlocked: freeform width/height resize (Click to lock)"}
                        >
                          {selectedLayer.aspectLocked ? <PiLock size={11} /> : <PiLockOpen size={11} />}
                          <span>{selectedLayer.aspectLocked ? "Locked" : "Unlocked"}</span>
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center gap-1.5 bg-black/40 border border-white/15 px-2 py-1 rounded-[12px]">
                        <span className="text-[10px] font-bold text-white/40">W</span>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={Math.round(selectedLayer.width || 30)}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val)) updateLayer(selectedLayer.id, { width: Math.max(1, Math.min(100, val)) });
                          }}
                          className="w-full bg-transparent text-xs text-white focus:outline-none"
                          aria-label="Width percentage"
                        />
                        <span className="text-[10px] text-white/40">%</span>
                      </div>

                      <div className="flex items-center gap-1.5 bg-black/40 border border-white/15 px-2 py-1 rounded-[12px]">
                        <span className="text-[10px] font-bold text-white/40">H</span>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          disabled={selectedLayer.type !== "shape" || selectedLayer.shape === "line"}
                          value={Math.round(selectedLayer.height || (selectedLayer.shape === "line" ? 1 : 12))}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val)) updateLayer(selectedLayer.id, { height: Math.max(1, Math.min(100, val)) });
                          }}
                          className="w-full bg-transparent text-xs text-white focus:outline-none disabled:opacity-25"
                          aria-label="Height percentage"
                        />
                        <span className="text-[10px] text-white/40">%</span>
                      </div>

                      <div className="flex items-center gap-1.5 bg-black/40 border border-white/15 px-2 py-1 rounded-[12px]">
                        <span className="text-[10px] font-bold text-white/40">R</span>
                        <input
                          type="number"
                          min="-180"
                          max="360"
                          value={Math.round(selectedLayer.rotation || 0)}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val)) updateLayer(selectedLayer.id, { rotation: val });
                          }}
                          className="w-full bg-transparent text-xs text-white focus:outline-none"
                          aria-label="Rotation in degrees"
                        />
                        <span className="text-[10px] text-white/40">°</span>
                      </div>

                      <div className="flex items-center gap-1.5 bg-black/40 border border-white/15 px-2 py-1 rounded-[12px]">
                        <span className="text-[10px] font-bold text-white/40">O</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={Math.round((typeof selectedLayer.opacity === "number" ? selectedLayer.opacity : 1) * 100)}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val)) updateLayer(selectedLayer.id, { opacity: Math.max(0, Math.min(100, val)) / 100 });
                          }}
                          className="w-full bg-transparent text-xs text-white focus:outline-none"
                          aria-label="Opacity percentage"
                        />
                        <span className="text-[10px] text-white/40">%</span>
                      </div>

                      {/* Corner Radius for Rounded Rectangle */}
                      {selectedLayer.shape === "rounded-rect" && (
                        <div className="col-span-2 flex items-center gap-1.5 bg-black/40 border border-white/15 px-2 py-1 rounded-[12px]">
                          <span className="text-[10px] font-bold text-white/40">Corner Radius</span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={typeof selectedLayer.borderRadius === "number" ? selectedLayer.borderRadius : 12}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val)) updateLayer(selectedLayer.id, { borderRadius: Math.max(0, val) });
                            }}
                            className="w-full bg-transparent text-xs text-white focus:outline-none"
                            aria-label="Corner radius in pixels"
                          />
                          <span className="text-[10px] text-white/40">px</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 3. Alignment & Arrange Toolbars */}
                  <div className="p-3 bg-[#151221] rounded-[12px] border border-white/10 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 block">Align & Arrange</span>
                      {selectedLayerIds.length < 2 && (
                        <span className="text-[9px] text-white/30">Select 2+ to align</span>
                      )}
                    </div>
                    {/* 6-Button Alignment Toolbar */}
                    <div className="grid grid-cols-6 gap-1">
                      <button
                        disabled={selectedLayerIds.length < 2}
                        onClick={() => handleAlignSelected("left")}
                        className="p-1.5 rounded-[12px] bg-white/5 hover:bg-white/15 text-white/70 hover:text-white flex items-center justify-center transition-all disabled:opacity-20 disabled:cursor-not-allowed disabled:pointer-events-none"
                        title={selectedLayerIds.length < 2 ? "Select at least 2 items to align" : "Align Left"}
                        aria-label="Align Left"
                      >
                        <PiAlignLeft size={13} />
                      </button>
                      <button
                        disabled={selectedLayerIds.length < 2}
                        onClick={() => handleAlignSelected("center-h")}
                        className="p-1.5 rounded-[12px] bg-white/5 hover:bg-white/15 text-white/70 hover:text-white flex items-center justify-center transition-all disabled:opacity-20 disabled:cursor-not-allowed disabled:pointer-events-none"
                        title={selectedLayerIds.length < 2 ? "Select at least 2 items to align" : "Align Center Horizontal"}
                        aria-label="Align Center Horizontal"
                      >
                        <PiAlignCenterHorizontal size={13} />
                      </button>
                      <button
                        disabled={selectedLayerIds.length < 2}
                        onClick={() => handleAlignSelected("right")}
                        className="p-1.5 rounded-[12px] bg-white/5 hover:bg-white/15 text-white/70 hover:text-white flex items-center justify-center transition-all disabled:opacity-20 disabled:cursor-not-allowed disabled:pointer-events-none"
                        title={selectedLayerIds.length < 2 ? "Select at least 2 items to align" : "Align Right"}
                        aria-label="Align Right"
                      >
                        <PiAlignRight size={13} />
                      </button>
                      <button
                        disabled={selectedLayerIds.length < 2}
                        onClick={() => handleAlignSelected("top")}
                        className="p-1.5 rounded-[12px] bg-white/5 hover:bg-white/15 text-white/70 hover:text-white flex items-center justify-center transition-all disabled:opacity-20 disabled:cursor-not-allowed disabled:pointer-events-none"
                        title={selectedLayerIds.length < 2 ? "Select at least 2 items to align" : "Align Top"}
                        aria-label="Align Top"
                      >
                        <PiAlignTop size={13} />
                      </button>
                      <button
                        disabled={selectedLayerIds.length < 2}
                        onClick={() => handleAlignSelected("center-v")}
                        className="p-1.5 rounded-[12px] bg-white/5 hover:bg-white/15 text-white/70 hover:text-white flex items-center justify-center transition-all disabled:opacity-20 disabled:cursor-not-allowed disabled:pointer-events-none"
                        title={selectedLayerIds.length < 2 ? "Select at least 2 items to align" : "Align Center Vertical"}
                        aria-label="Align Center Vertical"
                      >
                        <PiAlignCenterVertical size={13} />
                      </button>
                      <button
                        disabled={selectedLayerIds.length < 2}
                        onClick={() => handleAlignSelected("bottom")}
                        className="p-1.5 rounded-[12px] bg-white/5 hover:bg-white/15 text-white/70 hover:text-white flex items-center justify-center transition-all disabled:opacity-20 disabled:cursor-not-allowed disabled:pointer-events-none"
                        title={selectedLayerIds.length < 2 ? "Select at least 2 items to align" : "Align Bottom"}
                        aria-label="Align Bottom"
                      >
                        <PiAlignBottom size={13} />
                      </button>
                    </div>

                    {/* 4-Button Layer Ordering Toolbar */}
                    <div className="grid grid-cols-4 gap-1 pt-1 border-t border-white/5">
                      <button
                        onClick={() => handleBringToFront(selectedLayer.id)}
                        className="p-1.5 rounded-[12px] bg-white/5 hover:bg-white/15 text-white/70 hover:text-white flex items-center justify-center transition-all"
                        title="Bring to Front"
                        aria-label="Bring to Front"
                      >
                        <PiArrowLineUp size={13} />
                      </button>
                      <button
                        onClick={() => handleBringForward(selectedLayer.id)}
                        className="p-1.5 rounded-[12px] bg-white/5 hover:bg-white/15 text-white/70 hover:text-white flex items-center justify-center transition-all"
                        title="Bring Forward"
                        aria-label="Bring Forward"
                      >
                        <PiArrowUp size={13} />
                      </button>
                      <button
                        onClick={() => handleSendBackward(selectedLayer.id)}
                        className="p-1.5 rounded-[12px] bg-white/5 hover:bg-white/15 text-white/70 hover:text-white flex items-center justify-center transition-all"
                        title="Send Backward"
                        aria-label="Send Backward"
                      >
                        <PiArrowDown size={13} />
                      </button>
                      <button
                        onClick={() => handleSendToBack(selectedLayer.id)}
                        className="p-1.5 rounded-[12px] bg-white/5 hover:bg-white/15 text-white/70 hover:text-white flex items-center justify-center transition-all"
                        title="Send to Back"
                        aria-label="Send to Back"
                      >
                        <PiArrowLineDown size={13} />
                      </button>
                    </div>
                  </div>

                  {/* 4. Type-Specific Property Cards */}
                  {selectedLayer.type === "text" && (
                    <div className="p-3 bg-[#151221] rounded-[12px] border border-white/10 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 block">Text Layer</span>
                        {selectedLayer.fieldBinding && (
                          <span className="text-[9px] font-mono text-purple-300 bg-purple-500/20 border border-purple-500/30 px-1.5 py-0.5 rounded-[12px]">
                            Bound: {selectedLayer.fieldBinding}
                          </span>
                        )}
                      </div>

                      {/* Role-Specific Field Binding */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-white/40">Content Source</span>
                        <select
                          value={selectedLayer.fieldBinding || ""}
                          onChange={(e) => {
                            const val = e.target.value || null;
                            pushUndoSnapshot();
                            updateLayer(selectedLayer.id, { fieldBinding: val });
                          }}
                          className="w-full px-2 py-1.5 rounded-[12px] bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-purple-500"
                          aria-label="Content Source Field Binding"
                        >
                          <option value="">Static Text (Custom)</option>
                          {currentDesign.role === "bible" && (
                            <>
                              <option value="verseText">Scripture Passage (verseText)</option>
                              <option value="reference">Reference / Citation (reference)</option>
                              <option value="version">Bible Version (version)</option>
                            </>
                          )}
                          {currentDesign.role === "announcement" && (
                            <>
                              <option value="heading">Heading / Title (heading)</option>
                              <option value="message">Message Body (message)</option>
                              <option value="footer">Footer Info (footer)</option>
                            </>
                          )}
                          {currentDesign.role === "speaker" && (
                            <>
                              <option value="name">Speaker Name (name)</option>
                              <option value="title">Title / Role (title)</option>
                              <option value="organization">Organisation / Ministry (organization)</option>
                            </>
                          )}
                          {(currentDesign.role === "custom" || !currentDesign.role) && (
                            <>
                              <option value="verseText">Bible: Verse Text</option>
                              <option value="reference">Bible: Reference</option>
                              <option value="heading">Announcement: Heading</option>
                              <option value="name">Speaker: Name</option>
                            </>
                          )}
                        </select>
                      </div>

                      <div>
                        <textarea
                          rows={2}
                          value={selectedLayer.text || ""}
                          onFocus={() => pushUndoSnapshot()}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCurrentDesign((prev) => ({
                              ...prev,
                              layers: prev.layers.map((l) => (l.id === selectedLayer.id ? { ...l, text: val } : l)),
                            }));
                            setHasUnsavedChanges(true);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-[12px] bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-purple-500 resize-none"
                          placeholder={selectedLayer.fieldBinding ? `Default template fallback text for ${selectedLayer.fieldBinding}...` : "Enter text..."}
                          aria-label="Text content"
                        />
                      </div>

                      {/* Text Fitting & Scaling */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center gap-1.5 bg-black/40 border border-white/15 px-2 py-1 rounded-[12px]">
                          <span className="text-[10px] font-bold text-white/40">Min Font</span>
                          <input
                            type="number"
                            min="6"
                            max="72"
                            value={selectedLayer.minFontSize || 12}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10);
                              if (!isNaN(v)) updateLayer(selectedLayer.id, { minFontSize: v });
                            }}
                            className="w-full bg-transparent text-xs text-white focus:outline-none"
                            aria-label="Minimum font size"
                          />
                          <span className="text-[10px] text-white/40">px</span>
                        </div>

                        <label className="flex items-center gap-2 px-2 py-1 bg-black/40 border border-white/15 rounded-[12px] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedLayer.wrap !== false}
                            onChange={(e) => updateLayer(selectedLayer.id, { wrap: e.target.checked })}
                            className="rounded accent-purple-500"
                          />
                          <span className="text-[10px] font-bold text-white/70">Auto Wrap</span>
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={selectedLayer.fontFamily || "Inter, sans-serif"}
                          onChange={(e) => updateLayer(selectedLayer.id, { fontFamily: e.target.value })}
                          className="w-full px-2 py-1.5 rounded-[12px] bg-black/40 border border-white/15 text-xs text-white focus:outline-none focus:border-purple-500"
                          aria-label="Font Family"
                        >
                          <option value="Inter, sans-serif">Inter (Modern)</option>
                          <option value="Roboto, sans-serif">Roboto</option>
                          <option value="Georgia, serif">Georgia (Serif)</option>
                          <option value="Impact, sans-serif">Impact (Bold)</option>
                          <option value="monospace">Monospace</option>
                        </select>

                        <div className="flex items-center gap-1.5 bg-black/40 border border-white/15 px-2 py-1 rounded-[12px]">
                          <span className="text-[10px] font-bold text-white/40">Size</span>
                          <input
                            type="number"
                            min="8"
                            max="144"
                            value={selectedLayer.fontSize || 22}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10);
                              if (!isNaN(v)) updateLayer(selectedLayer.id, { fontSize: v });
                            }}
                            className="w-full bg-transparent text-xs text-white focus:outline-none"
                            aria-label="Font size in pixels"
                          />
                          <span className="text-[10px] text-white/40">px</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-white/5">
                        <div className="flex items-center gap-1.5 bg-black/40 border border-white/15 p-1 rounded-[12px]">
                          <input
                            type="color"
                            value={selectedLayer.color || "#ffffff"}
                            onFocus={() => pushUndoSnapshot()}
                            onChange={(e) => updateLayer(selectedLayer.id, { color: e.target.value })}
                            className="w-6 h-6 rounded-[12px] bg-transparent cursor-pointer border-0 p-0"
                            aria-label="Text Color"
                            title="Text Color"
                          />
                          <span className="text-[10px] font-mono text-white/70 uppercase truncate">
                            {selectedLayer.color || "#FFF"}
                          </span>
                        </div>

                        <button
                          onClick={() => updateLayer(selectedLayer.id, { fontWeight: selectedLayer.fontWeight === "bold" ? "normal" : "bold" })}
                          className={`py-1 rounded-[12px] text-xs font-bold border transition-all flex items-center justify-center ${
                            selectedLayer.fontWeight === "bold" ? "bg-purple-600/40 border-purple-500 text-purple-200" : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10"
                          }`}
                          title="Toggle Bold"
                          aria-label="Toggle Bold"
                        >
                          <PiTextB size={13} />
                        </button>

                        <div className="grid grid-cols-3 gap-0.5 bg-black/40 border border-white/15 p-0.5 rounded-[12px]">
                          {["left", "center", "right"].map((al) => (
                            <button
                              key={al}
                              onClick={() => updateLayer(selectedLayer.id, { textAlign: al })}
                              className={`py-1 rounded-[12px] text-[10px] flex items-center justify-center transition-all ${
                                (selectedLayer.textAlign || "left") === al ? "bg-purple-600 text-white" : "text-white/40 hover:text-white"
                              }`}
                              title={`Align ${al}`}
                              aria-label={`Align ${al}`}
                            >
                              {al === "left" ? <PiTextAlignLeft size={11} /> : al === "center" ? <PiTextAlignCenter size={11} /> : <PiTextAlignRight size={11} />}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedLayer.type === "shape" && (
                    <>
                      {/* Fill Card - hidden for lines and arrows */}
                      {selectedLayer.shape !== "line" && selectedLayer.shape !== "arrow" && (
                        <div className="p-3 bg-[#151221] rounded-[12px] border border-white/10 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">Fill Style</span>
                            <div className="flex bg-black/40 p-0.5 rounded-[12px] border border-white/10 text-[10px]">
                              {["solid", "linear-gradient", "radial-gradient", "glass"].map((type) => (
                                <button
                                  key={type}
                                  type="button"
                                  onClick={() => {
                                    pushUndoSnapshot();
                                    if (type === "solid") {
                                      updateLayer(selectedLayer.id, { fillType: "solid" });
                                    } else if (type === "glass") {
                                      updateLayer(selectedLayer.id, {
                                        fillType: "glass",
                                        glassTint: selectedLayer.glassTint || "#ffffff",
                                        glassOpacity: typeof selectedLayer.glassOpacity === "number" ? selectedLayer.glassOpacity : 0.25,
                                        backgroundBlur: typeof selectedLayer.backgroundBlur === "number" ? selectedLayer.backgroundBlur : 16,
                                        lightweightGlass: Boolean(selectedLayer.lightweightGlass),
                                        sweepHighlight: Boolean(selectedLayer.sweepHighlight),
                                      });
                                    } else {
                                      const defaultGrad = selectedLayer.gradient || {
                                        type: type === "radial-gradient" ? "radial" : "linear",
                                        angle: 90,
                                        radialCenter: { x: 50, y: 50 },
                                        stops: [
                                          { position: 0, color: "#2e0854", opacity: 1 },
                                          { position: 30, color: "#c0137f", opacity: 1 },
                                          { position: 60, color: "#e53935", opacity: 1 },
                                          { position: 85, color: "#fb8c00", opacity: 1 },
                                          { position: 100, color: "#fdd835", opacity: 1 },
                                        ],
                                      };
                                      updateLayer(selectedLayer.id, {
                                        fillType: type,
                                        gradient: { ...defaultGrad, type: type === "radial-gradient" ? "radial" : "linear" },
                                      });
                                    }
                                  }}
                                  className={`px-2 py-0.5 rounded-[12px] font-semibold capitalize transition-all ${
                                    (selectedLayer.fillType || "solid") === type
                                      ? "bg-purple-600 text-white shadow"
                                      : "text-white/40 hover:text-white/80"
                                  }`}
                                >
                                  {type === "solid" ? "Solid" : type === "linear-gradient" ? "Linear" : type === "radial-gradient" ? "Radial" : "Glass"}
                                </button>
                              ))}
                            </div>
                          </div>

                          {(!selectedLayer.fillType || selectedLayer.fillType === "solid") && (
                            <div className="flex items-center gap-2 bg-black/40 border border-white/15 p-1.5 rounded-[12px]">
                              <input
                                type="color"
                                value={selectedLayer.fill && selectedLayer.fill !== "transparent" ? selectedLayer.fill : "#581c87"}
                                onFocus={() => pushUndoSnapshot()}
                                onChange={(e) => updateLayer(selectedLayer.id, { fill: e.target.value })}
                                className="w-7 h-7 rounded-[12px] bg-transparent cursor-pointer border-0 p-0"
                                aria-label="Fill Color"
                                title="Fill Color"
                              />
                              <input
                                type="text"
                                value={selectedLayer.fill || "#581c87"}
                                onChange={(e) => updateLayer(selectedLayer.id, { fill: e.target.value })}
                                className="w-full bg-transparent text-xs font-mono text-white/90 focus:outline-none"
                                aria-label="Fill Color Hex"
                              />
                            </div>
                          )}

                          {(selectedLayer.fillType === "linear-gradient" || selectedLayer.fillType === "radial-gradient") && (
                            <div className="space-y-2.5 pt-1">
                              {/* Gradient Presets */}
                              <div>
                                <span className="text-[9px] text-white/40 uppercase font-bold tracking-wider block mb-1">Presets</span>
                                <div className="grid grid-cols-3 gap-1">
                                  {GRADIENT_PRESETS.map((p) => (
                                    <button
                                      key={p.id}
                                      type="button"
                                      onClick={() => {
                                        pushUndoSnapshot();
                                        updateLayer(selectedLayer.id, {
                                          gradient: {
                                            ...selectedLayer.gradient,
                                            ...p.gradient,
                                            type: selectedLayer.fillType === "radial-gradient" ? "radial" : "linear",
                                          },
                                        });
                                      }}
                                      className="p-1 rounded-[12px] border border-white/15 hover:border-white/40 text-[9px] font-bold text-white text-center shadow transition-all truncate"
                                      style={{ background: formatGradientCss(p.gradient) }}
                                      title={p.name}
                                    >
                                      <span className="bg-black/60 px-1 py-0.5 rounded-[6px] block truncate">{p.name}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Interactive Gradient Stop Bar */}
                              <div>
                                <div className="flex items-center justify-between text-[9px] text-white/40 uppercase font-bold tracking-wider mb-1">
                                  <span>Stop Track (click to add)</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const stops = selectedLayer.gradient?.stops || [];
                                      if (stops.length < 2) return;
                                      pushUndoSnapshot();
                                      const rev = stops.map((s) => ({ ...s, position: 100 - s.position })).sort((a, b) => a.position - b.position);
                                      updateLayer(selectedLayer.id, {
                                        gradient: { ...selectedLayer.gradient, stops: rev },
                                      });
                                    }}
                                    className="text-purple-300 hover:text-purple-200 capitalize font-medium"
                                  >
                                    Reverse Stops
                                  </button>
                                </div>
                                <div
                                  className="relative h-6 rounded-[12px] border border-white/20 cursor-crosshair overflow-visible shadow-inner"
                                  style={{ background: formatGradientCss(selectedLayer.gradient) || "#333" }}
                                  onClick={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const clickX = e.clientX - rect.left;
                                    const pos = Math.max(0, Math.min(100, Math.round((clickX / rect.width) * 100)));
                                    const stops = selectedLayer.gradient?.stops || [];
                                    pushUndoSnapshot();
                                    const newStops = [...stops, { position: pos, color: "#ffffff", opacity: 1 }].sort((a, b) => a.position - b.position);
                                    updateLayer(selectedLayer.id, {
                                      gradient: { ...selectedLayer.gradient, stops: newStops },
                                    });
                                    setActiveGradStopIndex(newStops.findIndex((s) => s.position === pos));
                                  }}
                                >
                                  {(selectedLayer.gradient?.stops || []).map((s, idx) => {
                                    const isActive = activeGradStopIndex === idx;
                                    return (
                                      <div
                                        key={idx}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveGradStopIndex(idx);
                                        }}
                                        className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 cursor-pointer shadow-md transition-transform ${
                                          isActive ? "border-white scale-125 z-20 shadow-purple-500/80 ring-2 ring-purple-500" : "border-black/80 hover:scale-110 z-10"
                                        }`}
                                        style={{ left: `${s.position}%`, backgroundColor: s.color }}
                                        title={`Stop ${idx + 1}: ${s.position}%`}
                                      />
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Active Stop Controls */}
                              {selectedLayer.gradient?.stops?.[activeGradStopIndex] && (
                                <div className="p-2 bg-black/40 rounded-[12px] border border-white/10 space-y-2">
                                  <div className="flex items-center justify-between text-[10px] font-bold text-white/50 uppercase">
                                    <span>Stop {activeGradStopIndex + 1} Settings</span>
                                    {selectedLayer.gradient.stops.length > 2 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          pushUndoSnapshot();
                                          const newStops = selectedLayer.gradient.stops.filter((_, i) => i !== activeGradStopIndex);
                                          updateLayer(selectedLayer.id, {
                                            gradient: { ...selectedLayer.gradient, stops: newStops },
                                          });
                                          setActiveGradStopIndex(Math.max(0, activeGradStopIndex - 1));
                                        }}
                                        className="text-red-400 hover:text-red-300 font-bold capitalize text-[10px]"
                                      >
                                        Delete Stop
                                      </button>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-3 gap-1.5">
                                    {/* Color */}
                                    <div className="flex items-center gap-1 bg-black/50 border border-white/15 p-1 rounded-[12px]">
                                      <input
                                        type="color"
                                        value={selectedLayer.gradient.stops[activeGradStopIndex].color || "#ffffff"}
                                        onFocus={() => pushUndoSnapshot()}
                                        onChange={(e) => {
                                          const newStops = [...selectedLayer.gradient.stops];
                                          newStops[activeGradStopIndex] = { ...newStops[activeGradStopIndex], color: e.target.value };
                                          updateLayerDraft(selectedLayer.id, {
                                            gradient: { ...selectedLayer.gradient, stops: newStops },
                                          });
                                        }}
                                        className="w-5 h-5 rounded-[12px] bg-transparent cursor-pointer border-0 p-0"
                                      />
                                      <span className="text-[9px] font-mono text-white/70 uppercase truncate">
                                        {selectedLayer.gradient.stops[activeGradStopIndex].color}
                                      </span>
                                    </div>

                                    {/* Opacity */}
                                    <div className="flex items-center gap-1 bg-black/50 border border-white/15 px-1.5 py-1 rounded-[12px]">
                                      <span className="text-[9px] font-bold text-white/40">Alpha</span>
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={Math.round((selectedLayer.gradient.stops[activeGradStopIndex].opacity ?? 1) * 100)}
                                        onChange={(e) => {
                                          const val = parseInt(e.target.value, 10);
                                          if (!isNaN(val)) {
                                            const newStops = [...selectedLayer.gradient.stops];
                                            newStops[activeGradStopIndex] = { ...newStops[activeGradStopIndex], opacity: Math.max(0, Math.min(100, val)) / 100 };
                                            updateLayerDraft(selectedLayer.id, {
                                              gradient: { ...selectedLayer.gradient, stops: newStops },
                                            });
                                          }
                                        }}
                                        className="w-full bg-transparent text-[10px] text-white text-right focus:outline-none"
                                      />
                                      <span className="text-[9px] text-white/40">%</span>
                                    </div>

                                    {/* Position */}
                                    <div className="flex items-center gap-1 bg-black/50 border border-white/15 px-1.5 py-1 rounded-[12px]">
                                      <span className="text-[9px] font-bold text-white/40">Pos</span>
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={selectedLayer.gradient.stops[activeGradStopIndex].position}
                                        onChange={(e) => {
                                          const val = parseInt(e.target.value, 10);
                                          if (!isNaN(val)) {
                                            const newStops = [...selectedLayer.gradient.stops];
                                            newStops[activeGradStopIndex] = { ...newStops[activeGradStopIndex], position: Math.max(0, Math.min(100, val)) };
                                            updateLayerDraft(selectedLayer.id, {
                                              gradient: { ...selectedLayer.gradient, stops: newStops.sort((a, b) => a.position - b.position) },
                                            });
                                          }
                                        }}
                                        className="w-full bg-transparent text-[10px] text-white text-right focus:outline-none"
                                      />
                                      <span className="text-[9px] text-white/40">%</span>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Direction / Center */}
                              {selectedLayer.fillType === "linear-gradient" ? (
                                <div className="flex items-center justify-between bg-black/40 border border-white/10 px-2 py-1.5 rounded-[12px]">
                                  <span className="text-[10px] font-bold text-white/50">Linear Angle</span>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="range"
                                      min="0"
                                      max="360"
                                      value={selectedLayer.gradient?.angle ?? 90}
                                      onChange={(e) => {
                                        const angle = parseInt(e.target.value, 10);
                                        updateLayerDraft(selectedLayer.id, {
                                          gradient: { ...selectedLayer.gradient, angle },
                                        });
                                      }}
                                      className="w-20 accent-purple-500 cursor-pointer"
                                    />
                                    <span className="text-[10px] font-mono text-white/80 w-8 text-right">
                                      {selectedLayer.gradient?.angle ?? 90}°
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="grid grid-cols-2 gap-2 bg-black/40 border border-white/10 p-2 rounded-[12px]">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-bold text-white/40">Center X</span>
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      value={selectedLayer.gradient?.radialCenter?.x ?? 50}
                                      onChange={(e) => {
                                        const x = parseInt(e.target.value, 10);
                                        if (!isNaN(x)) {
                                          updateLayerDraft(selectedLayer.id, {
                                            gradient: {
                                              ...selectedLayer.gradient,
                                              radialCenter: { ...(selectedLayer.gradient?.radialCenter || { y: 50 }), x },
                                            },
                                          });
                                        }
                                      }}
                                      className="w-12 bg-black/50 border border-white/15 px-1 py-0.5 rounded text-[10px] text-white text-right focus:outline-none"
                                    />
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-bold text-white/40">Center Y</span>
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      value={selectedLayer.gradient?.radialCenter?.y ?? 50}
                                      onChange={(e) => {
                                        const y = parseInt(e.target.value, 10);
                                        if (!isNaN(y)) {
                                          updateLayerDraft(selectedLayer.id, {
                                            gradient: {
                                              ...selectedLayer.gradient,
                                              radialCenter: { ...(selectedLayer.gradient?.radialCenter || { x: 50 }), y },
                                            },
                                          });
                                        }
                                      }}
                                      className="w-12 bg-black/50 border border-white/15 px-1 py-0.5 rounded text-[10px] text-white text-right focus:outline-none"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {selectedLayer.fillType === "glass" && (
                            <div className="space-y-3 pt-1 border-t border-white/10">
                              {/* Glass Tint */}
                              <div>
                                <span className="text-[9px] text-white/40 uppercase font-bold tracking-wider block mb-1">
                                  Glass Tint Color
                                </span>
                                <div className="flex items-center gap-2 bg-black/40 border border-white/15 p-1.5 rounded-[12px]">
                                  <input
                                    type="color"
                                    value={selectedLayer.glassTint || "#ffffff"}
                                    onFocus={() => pushUndoSnapshot()}
                                    onChange={(e) => updateLayer(selectedLayer.id, { glassTint: e.target.value })}
                                    className="w-7 h-7 rounded-[12px] bg-transparent cursor-pointer border-0 p-0"
                                    aria-label="Glass Tint Color"
                                    title="Glass Tint Color"
                                  />
                                  <input
                                    type="text"
                                    value={selectedLayer.glassTint || "#ffffff"}
                                    onChange={(e) => updateLayer(selectedLayer.id, { glassTint: e.target.value })}
                                    className="w-full bg-transparent text-xs font-mono text-white/90 focus:outline-none"
                                    aria-label="Glass Tint Hex"
                                  />
                                </div>
                              </div>

                              {/* Transparency / Opacity Slider (preserves 0) */}
                              <div>
                                <div className="flex items-center justify-between text-[10px] mb-1">
                                  <span className="text-white/40 font-bold uppercase tracking-wider text-[9px]">Transparency / Opacity</span>
                                  <span className="font-mono text-purple-300 font-bold">
                                    {Math.round((typeof selectedLayer.glassOpacity === "number" ? selectedLayer.glassOpacity : 0.25) * 100)}%
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={Math.round((typeof selectedLayer.glassOpacity === "number" ? selectedLayer.glassOpacity : 0.25) * 100)}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value, 10);
                                      if (!isNaN(val)) {
                                        updateLayerDraft(selectedLayer.id, { glassOpacity: Math.max(0, Math.min(100, val)) / 100 });
                                      }
                                    }}
                                    className="w-full h-1.5 bg-black/50 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                    aria-label="Glass Opacity Slider"
                                  />
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={Math.round((typeof selectedLayer.glassOpacity === "number" ? selectedLayer.glassOpacity : 0.25) * 100)}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value, 10);
                                      if (!isNaN(val)) {
                                        updateLayer(selectedLayer.id, { glassOpacity: Math.max(0, Math.min(100, val)) / 100 });
                                      }
                                    }}
                                    className="w-14 bg-black/50 border border-white/15 px-1 py-0.5 rounded-[12px] text-[10px] text-white text-right focus:outline-none"
                                  />
                                </div>
                              </div>

                              {/* Background Blur Slider (preserves 0) */}
                              <div>
                                <div className="flex items-center justify-between text-[10px] mb-1">
                                  <span className="text-white/40 font-bold uppercase tracking-wider text-[9px]">Background Blur</span>
                                  <span className="font-mono text-purple-300 font-bold">
                                    {selectedLayer.lightweightGlass ? "Disabled (Lightweight)" : `${typeof selectedLayer.backgroundBlur === "number" ? selectedLayer.backgroundBlur : 16}px`}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="range"
                                    min="0"
                                    max="40"
                                    disabled={Boolean(selectedLayer.lightweightGlass)}
                                    value={typeof selectedLayer.backgroundBlur === "number" ? selectedLayer.backgroundBlur : 16}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value, 10);
                                      if (!isNaN(val)) {
                                        updateLayerDraft(selectedLayer.id, { backgroundBlur: Math.max(0, Math.min(100, val)) });
                                      }
                                    }}
                                    className={`w-full h-1.5 bg-black/50 rounded-lg appearance-none cursor-pointer accent-purple-500 ${selectedLayer.lightweightGlass ? "opacity-30 cursor-not-allowed" : ""}`}
                                    aria-label="Background Blur Slider"
                                  />
                                  <input
                                    type="number"
                                    min="0"
                                    max="40"
                                    disabled={Boolean(selectedLayer.lightweightGlass)}
                                    value={typeof selectedLayer.backgroundBlur === "number" ? selectedLayer.backgroundBlur : 16}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value, 10);
                                      if (!isNaN(val)) {
                                        updateLayer(selectedLayer.id, { backgroundBlur: Math.max(0, Math.min(100, val)) });
                                      }
                                    }}
                                    className={`w-14 bg-black/50 border border-white/15 px-1 py-0.5 rounded-[12px] text-[10px] text-white text-right focus:outline-none ${selectedLayer.lightweightGlass ? "opacity-30" : ""}`}
                                  />
                                </div>
                              </div>

                              {/* Lightweight Mode Toggle */}
                              <label className="flex items-center justify-between p-2 rounded-[12px] bg-black/30 border border-white/5 cursor-pointer hover:bg-black/50 transition-all">
                                <div className="space-y-0.5">
                                  <span className="text-xs font-bold text-white block">Lightweight Glass Mode</span>
                                  <span className="text-[10px] text-white/40 block">Tint + gradient + shadow (zero video blur overhead)</span>
                                </div>
                                <input
                                  type="checkbox"
                                  checked={Boolean(selectedLayer.lightweightGlass)}
                                  onChange={(e) => {
                                    pushUndoSnapshot();
                                    updateLayer(selectedLayer.id, { lightweightGlass: e.target.checked });
                                  }}
                                  className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 bg-black/50 border-white/20"
                                />
                              </label>

                              {/* Specular Highlight Sweep Toggle */}
                              <label className="flex items-center justify-between p-2 rounded-[12px] bg-black/30 border border-white/5 cursor-pointer hover:bg-black/50 transition-all">
                                <div className="space-y-0.5">
                                  <span className="text-xs font-bold text-white block">Highlight Sweep on Entrance</span>
                                  <span className="text-[10px] text-white/40 block">Specular reflection beam glides across panel</span>
                                </div>
                                <input
                                  type="checkbox"
                                  checked={Boolean(selectedLayer.sweepHighlight)}
                                  onChange={(e) => {
                                    pushUndoSnapshot();
                                    updateLayer(selectedLayer.id, { sweepHighlight: e.target.checked });
                                  }}
                                  className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 bg-black/50 border-white/20"
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Border / Stroke Card */}
                      <div className="p-3 bg-[#151221] rounded-[12px] border border-white/10 space-y-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 block">
                          {selectedLayer.shape === "line" || selectedLayer.shape === "arrow" ? "Stroke / Line" : "Border"}
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex items-center gap-1.5 bg-black/40 border border-white/15 px-2 py-1 rounded-[12px]">
                            <span className="text-[10px] font-bold text-white/40">Width</span>
                            <input
                              type="number"
                              min="0"
                              max="30"
                              value={typeof selectedLayer.strokeWidth === "number" ? selectedLayer.strokeWidth : (selectedLayer.shape === "line" || selectedLayer.shape === "arrow" ? 3 : 2)}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val)) updateLayer(selectedLayer.id, { strokeWidth: Math.max(0, val) });
                              }}
                              className="w-full bg-transparent text-xs text-white focus:outline-none"
                              aria-label="Border width in pixels"
                            />
                            <span className="text-[10px] text-white/40">px</span>
                          </div>

                          <div className="flex items-center gap-1.5 bg-black/40 border border-white/15 p-1 rounded-[12px]">
                            <input
                              type="color"
                              value={selectedLayer.stroke && selectedLayer.stroke !== "transparent" && selectedLayer.stroke.startsWith("#") ? selectedLayer.stroke : "#ffffff"}
                              onFocus={() => pushUndoSnapshot()}
                              onChange={(e) => updateLayer(selectedLayer.id, { stroke: e.target.value })}
                              className="w-6 h-6 rounded-[12px] bg-transparent cursor-pointer border-0 p-0"
                              aria-label="Border Color"
                              title="Border Color"
                            />
                            <span className="text-[10px] font-mono text-white/70 uppercase truncate">
                              {selectedLayer.stroke || (selectedLayer.shape === "line" || selectedLayer.shape === "arrow" ? "#f59e0b" : "#a855f7")}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Corner Rounding Card (for rectangular shapes) */}
                      {(selectedLayer.shape === "rounded-rect" || selectedLayer.shape === "rectangle" || selectedLayer.shape === "square") && (
                        <div className="p-3 bg-[#151221] rounded-[12px] border border-white/10 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">Corner Radius</span>
                            <button
                              type="button"
                              onClick={() => setCornersLinked((l) => !l)}
                              className={`p-1 rounded-[12px] text-[10px] flex items-center gap-1 border transition-all ${
                                cornersLinked
                                  ? "bg-purple-600/30 border-purple-500/40 text-purple-200"
                                  : "bg-black/40 border-white/10 text-white/40 hover:text-white"
                              }`}
                              title={cornersLinked ? "Corners Linked (click to unlink)" : "Independent Corners (click to link)"}
                            >
                              {cornersLinked ? <PiLink size={12} /> : <PiLinkBreak size={12} />}
                              <span>{cornersLinked ? "Linked" : "Independent"}</span>
                            </button>
                          </div>

                          {cornersLinked ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <input
                                  type="range"
                                  min="0"
                                  max="99"
                                  value={
                                    Array.isArray(selectedLayer.borderRadius)
                                      ? selectedLayer.borderRadius[0] || 0
                                      : (typeof selectedLayer.borderRadius === "number" ? selectedLayer.borderRadius : (selectedLayer.shape === "rounded-rect" ? 12 : 0))
                                  }
                                  onChange={(e) => {
                                    const val = Math.max(0, Math.min(99, parseInt(e.target.value, 10) || 0));
                                    updateLayer(selectedLayer.id, { borderRadius: val });
                                  }}
                                  className="w-full h-1.5 bg-black/50 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                />
                                <div className="flex items-center gap-1 bg-black/40 border border-white/15 px-1.5 py-0.5 rounded-[8px] shrink-0">
                                  <input
                                    type="number"
                                    min="0"
                                    max="99"
                                    value={
                                      Array.isArray(selectedLayer.borderRadius)
                                        ? selectedLayer.borderRadius[0] || 0
                                        : (typeof selectedLayer.borderRadius === "number" ? selectedLayer.borderRadius : (selectedLayer.shape === "rounded-rect" ? 12 : 0))
                                    }
                                    onChange={(e) => {
                                      const val = Math.max(0, Math.min(99, parseInt(e.target.value, 10) || 0));
                                      updateLayer(selectedLayer.id, { borderRadius: val });
                                    }}
                                    className="w-8 bg-transparent text-[11px] font-mono text-white text-right focus:outline-none"
                                    aria-label="Corner radius in pixels"
                                  />
                                  <span className="text-[9px] text-white/40">px</span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-1.5 pt-1">
                              {[
                                { label: "Top-Left", idx: 0 },
                                { label: "Top-Right", idx: 1 },
                                { label: "Bottom-Right", idx: 2 },
                                { label: "Bottom-Left", idx: 3 },
                              ].map(({ label, idx }) => {
                                const radii = Array.isArray(selectedLayer.borderRadius)
                                  ? [...selectedLayer.borderRadius]
                                  : [
                                      typeof selectedLayer.borderRadius === "number" ? selectedLayer.borderRadius : 12,
                                      typeof selectedLayer.borderRadius === "number" ? selectedLayer.borderRadius : 12,
                                      typeof selectedLayer.borderRadius === "number" ? selectedLayer.borderRadius : 12,
                                      typeof selectedLayer.borderRadius === "number" ? selectedLayer.borderRadius : 12,
                                    ];
                                const curVal = radii[idx] || 0;
                                return (
                                  <div key={label} className="flex items-center justify-between bg-black/40 border border-white/10 px-2 py-1 rounded-[12px]">
                                    <span className="text-[9px] text-white/40">{label}</span>
                                    <div className="flex items-center gap-0.5">
                                      <input
                                        type="number"
                                        min="0"
                                        max="99"
                                        value={curVal}
                                        onChange={(e) => {
                                          const next = [...radii];
                                          next[idx] = Math.max(0, Math.min(99, parseInt(e.target.value, 10) || 0));
                                          updateLayer(selectedLayer.id, { borderRadius: next });
                                        }}
                                        className="w-7 bg-transparent text-[10px] font-mono text-white text-right focus:outline-none"
                                        aria-label={`${label} radius`}
                                      />
                                      <span className="text-[8px] text-white/40">px</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          <div className="flex items-center gap-1.5 pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                pushUndoSnapshot();
                                updateLayer(selectedLayer.id, { borderRadius: 0 });
                              }}
                              className="px-2 py-0.5 rounded-[12px] bg-black/30 hover:bg-black/50 border border-white/10 text-[9px] text-white/60 hover:text-white"
                            >
                              0px (Sharp)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                pushUndoSnapshot();
                                updateLayer(selectedLayer.id, { borderRadius: 12 });
                              }}
                              className="px-2 py-0.5 rounded-[12px] bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-[9px] text-purple-200"
                            >
                              12px (Mandate)
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Clipping Mask Card on Shape Layer */}
                      <div className="p-3 bg-[#151221] rounded-[12px] border border-white/10 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                            Clipping Mask
                          </span>
                          {selectedLayer.maskImage?.url && (
                            <span className="text-[9px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded-[12px]">
                              Active Mask
                            </span>
                          )}
                        </div>

                        {!selectedLayer.maskImage?.url ? (
                          <button
                            type="button"
                            onClick={() => handlePlaceImageInsideShape(selectedLayer.id)}
                            className="w-full py-2 rounded-[12px] bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm"
                          >
                            <PiImage size={14} />
                            <span>Place Image Inside</span>
                          </button>
                        ) : (
                          <div className="space-y-2.5">
                            {/* Mask thumbnail preview & actions */}
                            <div className="flex items-center gap-2 bg-black/40 p-2 rounded-[12px] border border-white/10">
                              <div className="w-10 h-10 rounded-[12px] bg-[#1a1728] overflow-hidden border border-white/15 shrink-0 flex items-center justify-center">
                                <img
                                  src={selectedLayer.maskImage.url}
                                  alt="Mask Thumbnail"
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="text-[11px] font-semibold text-white truncate block">
                                  {selectedLayer.maskImage?.name || "Clipped Image Asset"}
                                </span>
                                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCropLayerId(selectedLayer.id);
                                      setEditingCropTarget("image");
                                      showFeedback(`Editing image inside ${selectedLayer.name}. Drag canvas to pan image.`, true);
                                    }}
                                    className={`text-[9px] font-bold px-2 py-0.5 rounded-[8px] transition-all border ${
                                      editingCropLayerId === selectedLayer.id && editingCropTarget === "image"
                                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm"
                                        : "bg-purple-600/30 text-purple-200 border-purple-500/40 hover:bg-purple-600/50"
                                    }`}
                                  >
                                    {editingCropLayerId === selectedLayer.id && editingCropTarget === "image" ? "✓ Editing Image" : "Edit Image"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCropLayerId(selectedLayer.id);
                                      setEditingCropTarget("frame");
                                    }}
                                    className={`text-[9px] font-bold px-2 py-0.5 rounded-[8px] transition-all border ${
                                      editingCropLayerId === selectedLayer.id && editingCropTarget === "frame"
                                        ? "bg-purple-500/20 text-purple-200 border-purple-500/40"
                                        : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10"
                                    }`}
                                  >
                                    Edit Frame
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handlePlaceImageInsideShape(selectedLayer.id)}
                                    className="text-[9px] text-white/70 hover:text-white px-1.5 py-0.5 rounded-[8px] bg-white/5 hover:bg-white/10 font-medium"
                                  >
                                    Replace
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleResetMaskCrop(selectedLayer.id)}
                                    className="text-[9px] text-white/70 hover:text-white px-1.5 py-0.5 rounded-[8px] bg-white/5 hover:bg-white/10 font-medium"
                                  >
                                    Reset Crop
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleReleaseClippingMask(selectedLayer.id)}
                                    className="text-[9px] text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded-[8px] bg-red-500/10 hover:bg-red-500/20 font-medium border border-red-500/20"
                                  >
                                    Release
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Fit vs Fill */}
                            <div>
                              <span className="text-[9px] text-white/40 block mb-1">Scale / Crop Mode</span>
                              <div className="grid grid-cols-2 gap-1.5 bg-black/40 p-1 rounded-[12px] border border-white/10">
                                {["fill", "fit"].map((mode) => {
                                  const isCur = (selectedLayer.maskImage?.fitMode || "fill") === mode;
                                  return (
                                    <button
                                      key={mode}
                                      type="button"
                                      onClick={() => {
                                        pushUndoSnapshot();
                                        updateLayer(selectedLayer.id, {
                                          maskImage: {
                                            ...(selectedLayer.maskImage || {}),
                                            fitMode: mode,
                                          },
                                        });
                                      }}
                                      className={`py-1 text-[10px] font-bold rounded-[8px] capitalize transition-all ${
                                        isCur
                                          ? "bg-purple-600 text-white shadow"
                                          : "text-white/40 hover:text-white"
                                      }`}
                                    >
                                      {mode === "fill" ? "Fill Shape" : "Fit inside"}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Zoom Slider */}
                            <div>
                              <div className="flex items-center justify-between text-[9px] mb-1">
                                <span className="text-white/40">Crop Zoom</span>
                                <span className="font-mono text-purple-300">
                                  {Math.round((selectedLayer.maskImage?.zoom || 1) * 100)}%
                                </span>
                              </div>
                              <input
                                type="range"
                                min="100"
                                max="300"
                                value={Math.round((selectedLayer.maskImage?.zoom || 1) * 100)}
                                onChange={(e) => {
                                  const val = Math.max(1, (parseInt(e.target.value, 10) || 100) / 100);
                                  updateLayerDraft(selectedLayer.id, {
                                    maskImage: {
                                      ...(selectedLayer.maskImage || {}),
                                      zoom: val,
                                    },
                                  });
                                }}
                                className="w-full h-1.5 bg-black/50 rounded-lg appearance-none cursor-pointer accent-purple-500"
                              />
                            </div>

                            {/* Pan X and Pan Y sliders */}
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <div className="flex items-center justify-between text-[9px] mb-1">
                                  <span className="text-white/40">Pan X</span>
                                  <span className="font-mono text-purple-300">{selectedLayer.maskImage?.panX || 0}%</span>
                                </div>
                                <input
                                  type="range"
                                  min="-100"
                                  max="100"
                                  value={selectedLayer.maskImage?.panX || 0}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value, 10) || 0;
                                    updateLayerDraft(selectedLayer.id, {
                                      maskImage: {
                                        ...(selectedLayer.maskImage || {}),
                                        panX: val,
                                      },
                                    });
                                  }}
                                  className="w-full h-1.5 bg-black/50 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                />
                              </div>

                              <div>
                                <div className="flex items-center justify-between text-[9px] mb-1">
                                  <span className="text-white/40">Pan Y</span>
                                  <span className="font-mono text-purple-300">{selectedLayer.maskImage?.panY || 0}%</span>
                                </div>
                                <input
                                  type="range"
                                  min="-100"
                                  max="100"
                                  value={selectedLayer.maskImage?.panY || 0}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value, 10) || 0;
                                    updateLayerDraft(selectedLayer.id, {
                                      maskImage: {
                                        ...(selectedLayer.maskImage || {}),
                                        panY: val,
                                      },
                                    });
                                  }}
                                  className="w-full h-1.5 bg-black/50 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                />
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                pushUndoSnapshot();
                                updateLayer(selectedLayer.id, {
                                  maskImage: {
                                    ...(selectedLayer.maskImage || {}),
                                    zoom: 1,
                                    panX: 0,
                                    panY: 0,
                                  },
                                });
                              }}
                              className="w-full py-1 text-[10px] text-white/50 hover:text-white bg-black/30 hover:bg-black/50 rounded-[8px] border border-white/10"
                            >
                              Reset Crop & Placement
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Editable Shape Curves (Bézier) Card */}
                      {selectedLayer.shape !== "line" && selectedLayer.shape !== "arrow" && selectedLayer.shape !== "bracket-left" && selectedLayer.shape !== "bracket-right" && (
                        <div className="p-3 bg-[#151221] rounded-[12px] border border-white/10 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                              Shape Curves & Edges
                            </span>
                            {editingShapeLayerId === selectedLayer.id && (
                              <span className="text-[9px] font-bold text-purple-300 bg-purple-500/20 border border-purple-500/30 px-1.5 py-0.5 rounded-[6px]">
                                Editing Curves
                              </span>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              if (editingShapeLayerId === selectedLayer.id) {
                                setEditingShapeLayerId(null);
                              } else {
                                if (!selectedLayer.customPath) {
                                  pushUndoSnapshot();
                                  updateLayer(selectedLayer.id, {
                                    customPath: getDefaultShapeNodes(selectedLayer.shape),
                                  });
                                }
                                setEditingShapeLayerId(selectedLayer.id);
                              }
                            }}
                            className={`w-full py-2 rounded-[12px] text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${
                              editingShapeLayerId === selectedLayer.id
                                ? "bg-purple-600 border-purple-400 text-white shadow-md"
                                : "bg-purple-600/20 hover:bg-purple-600/40 border-purple-500/30 text-purple-200"
                            }`}
                          >
                            <span>{editingShapeLayerId === selectedLayer.id ? "Done Editing Curves" : "Edit Shape (Bézier Curves)"}</span>
                          </button>

                          {editingShapeLayerId === selectedLayer.id && (
                            <div className="space-y-2 pt-1">
                              <p className="text-[10px] text-white/50 leading-tight">
                                Drag vertex nodes, Bézier handles, or edge midpoints on the canvas to curve contours.
                              </p>
                              <div className="grid grid-cols-2 gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleStraightenSegment(selectedLayer.id, activeCurveNodeIdx)}
                                  className="py-1 px-2 rounded-[8px] bg-black/40 hover:bg-black/60 border border-white/10 text-[10px] text-white/80"
                                >
                                  Straighten Segment
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleResetShapeCurves(selectedLayer.id)}
                                  className="py-1 px-2 rounded-[8px] bg-black/40 hover:bg-black/60 border border-white/10 text-[10px] text-red-300"
                                >
                                  Reset Shape
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {selectedLayer.type === "image" && (
                    <div className="p-3 bg-[#151221] rounded-[12px] border border-white/10 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 block">Container & Image</span>
                        <button
                          type="button"
                          onClick={() => handleImportImage(selectedLayer.id)}
                          className="px-2 py-0.5 rounded-[12px] bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 text-[10px] font-bold border border-purple-500/40 flex items-center gap-1 transition-all"
                        >
                          <PiArrowsClockwise size={11} />
                          <span>Replace Image Asset</span>
                        </button>
                      </div>

                      {/* Container Frame Shape Picker */}
                      <div>
                        <span className="text-[10px] text-white/50 block mb-1">Container Shape</span>
                        <div className="grid grid-cols-4 gap-1">
                          {CONTAINER_SHAPES.map((cs) => {
                            const isCur = (selectedLayer.frameShape || selectedLayer.mask || "none") === cs.id;
                            return (
                              <button
                                key={cs.id}
                                type="button"
                                onClick={() => {
                                  pushUndoSnapshot();
                                  updateLayer(selectedLayer.id, {
                                    frameShape: cs.id,
                                    mask: cs.id === "circle" ? "circle" : cs.id === "diamond" ? "diamond" : "square",
                                    borderRadius: cs.id === "rounded_rectangle" ? 12 : cs.id === "circle" ? 9999 : 0,
                                  });
                                }}
                                className={`py-1 px-1.5 text-[10px] font-semibold rounded-[12px] border transition-all text-center truncate ${
                                  isCur
                                    ? "bg-purple-600/50 border-purple-400 text-white shadow-sm"
                                    : "bg-black/30 border-white/10 text-white/60 hover:text-white"
                                }`}
                              >
                                {cs.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Fit Mode Toggle */}
                      <div>
                        <span className="text-[10px] text-white/50 block mb-1">Scale / Fit Mode</span>
                        <div className="grid grid-cols-2 gap-1.5 bg-black/40 p-1 rounded-[12px] border border-white/10">
                          {["fill", "fit"].map((mode) => {
                            const isCur = (selectedLayer.frameCrop?.fitMode || "fill") === mode;
                            return (
                              <button
                                key={mode}
                                type="button"
                                onClick={() => {
                                  pushUndoSnapshot();
                                  updateLayer(selectedLayer.id, {
                                    frameCrop: { ...(selectedLayer.frameCrop || {}), fitMode: mode },
                                  });
                                }}
                                className={`py-1 text-[11px] font-bold rounded-[12px] capitalize transition-all ${
                                  isCur
                                    ? "bg-purple-600 text-white shadow"
                                    : "text-white/40 hover:text-white"
                                }`}
                              >
                                {mode === "fill" ? "Fill Frame" : "Fit in Frame"}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Crop Zoom & Pan Controls */}
                      <div className="space-y-2 bg-black/30 p-2 rounded-[12px] border border-white/5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-white/50 uppercase">Crop Zoom & Pan</span>
                          <button
                            type="button"
                            onClick={() => {
                              pushUndoSnapshot();
                              updateLayer(selectedLayer.id, {
                                frameCrop: { fitMode: "fill", zoom: 1, panX: 0, panY: 0 },
                              });
                            }}
                            className="text-[9px] text-purple-300 hover:text-purple-200 font-bold"
                          >
                            Reset Crop
                          </button>
                        </div>

                        {/* Zoom */}
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-white/40">Zoom</span>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="1"
                              max="3"
                              step="0.05"
                              value={selectedLayer.frameCrop?.zoom ?? 1}
                              onChange={(e) => {
                                const zoom = parseFloat(e.target.value);
                                updateLayerDraft(selectedLayer.id, {
                                  frameCrop: { ...(selectedLayer.frameCrop || {}), zoom },
                                });
                              }}
                              className="w-24 accent-purple-500 cursor-pointer"
                            />
                            <span className="text-[10px] font-mono text-white/80 w-8 text-right">
                              {(selectedLayer.frameCrop?.zoom ?? 1).toFixed(2)}x
                            </span>
                          </div>
                        </div>

                        {/* Pan X */}
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-white/40">Pan X</span>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="-100"
                              max="100"
                              step="1"
                              value={selectedLayer.frameCrop?.panX ?? 0}
                              onChange={(e) => {
                                const panX = parseInt(e.target.value, 10);
                                updateLayerDraft(selectedLayer.id, {
                                  frameCrop: { ...(selectedLayer.frameCrop || {}), panX },
                                });
                              }}
                              className="w-24 accent-purple-500 cursor-pointer"
                            />
                            <span className="text-[10px] font-mono text-white/80 w-8 text-right">
                              {selectedLayer.frameCrop?.panX ?? 0}%
                            </span>
                          </div>
                        </div>

                        {/* Pan Y */}
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-white/40">Pan Y</span>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="-100"
                              max="100"
                              step="1"
                              value={selectedLayer.frameCrop?.panY ?? 0}
                              onChange={(e) => {
                                const panY = parseInt(e.target.value, 10);
                                updateLayerDraft(selectedLayer.id, {
                                  frameCrop: { ...(selectedLayer.frameCrop || {}), panY },
                                });
                              }}
                              className="w-24 accent-purple-500 cursor-pointer"
                            />
                            <span className="text-[10px] font-mono text-white/80 w-8 text-right">
                              {selectedLayer.frameCrop?.panY ?? 0}%
                            </span>
                          </div>
                        </div>

                        <div className="pt-1 flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => {
                              pushUndoSnapshot();
                              updateLayer(selectedLayer.id, { frameShape: "none" });
                            }}
                            className="text-[9px] text-white/50 hover:text-white"
                          >
                            Detach from Frame
                          </button>
                        </div>
                      </div>

                      {/* Local Background Removal Action Card */}
                      <div className="bg-purple-950/20 border border-purple-500/20 p-2.5 rounded-[12px] space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300">
                            Background Removal
                          </span>
                          <span className="text-[9px] text-purple-400/60 font-semibold">100% Offline Local</span>
                        </div>

                        {bgRemovalProcessing ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[10px] text-purple-200">
                              <span>Segmenting background...</span>
                              <span className="font-mono">{bgRemovalProgress}%</span>
                            </div>
                            <div className="h-1.5 bg-black/60 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-purple-500 transition-all duration-150"
                                style={{ width: `${bgRemovalProgress}%` }}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={handleCancelBgRemoval}
                              className="w-full py-1 text-[10px] font-bold text-red-300 bg-red-500/20 hover:bg-red-500/30 rounded-[8px] transition-all"
                            >
                              Cancel Removal
                            </button>
                          </div>
                        ) : selectedLayer.hasBgRemoved ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-bold">
                              <span>✓ Background Cut Active</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRestoreOriginalImage(selectedLayer)}
                              className="w-full py-1.5 rounded-[12px] bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-all"
                            >
                              Restore Original Image
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRemoveBackground(selectedLayer)}
                            className="w-full py-2 rounded-[12px] bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md flex items-center justify-center gap-1.5 transition-all"
                          >
                            <PiSparkle size={14} />
                            <span>Remove Background</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 4. Dedicated Shadow Card for Shapes, Text, and Images */}
                  <div className="p-3 bg-[#151221] rounded-[12px] border border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">Shadow</span>
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          aria-label="Enable layer shadow"
                          checked={Boolean(selectedLayer.shadowEnabled)}
                          onChange={(e) => updateLayer(selectedLayer.id, { shadowEnabled: e.target.checked })}
                          className="rounded text-purple-600 focus:ring-0 cursor-pointer"
                        />
                        <span className="text-[10px] text-white/70 font-semibold">Enable</span>
                      </label>
                    </div>

                    {selectedLayer.shadowEnabled && (
                      <div className="space-y-2 pt-1 border-t border-white/5">
                        {/* Row 1: Color & Opacity */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex items-center gap-1.5 bg-black/40 border border-white/15 p-1 rounded-[12px]">
                            <input
                              type="color"
                              value={selectedLayer.shadowColor || "#000000"}
                              onFocus={() => pushUndoSnapshot()}
                              onChange={(e) => updateLayer(selectedLayer.id, { shadowColor: e.target.value })}
                              className="w-6 h-6 rounded-[12px] bg-transparent cursor-pointer border-0 p-0"
                              aria-label="Shadow Color"
                              title="Shadow Color"
                            />
                            <span className="text-[10px] font-mono text-white/70 uppercase truncate">
                              {selectedLayer.shadowColor || "#000000"}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 bg-black/40 border border-white/15 px-2 py-1 rounded-[12px]">
                            <span className="text-[10px] font-bold text-white/40">Opacity</span>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={typeof selectedLayer.shadowOpacity === "number" ? selectedLayer.shadowOpacity : 60}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val)) updateLayer(selectedLayer.id, { shadowOpacity: Math.max(0, Math.min(100, val)) });
                              }}
                              className="w-full bg-transparent text-xs text-white focus:outline-none"
                              aria-label="Shadow Opacity"
                            />
                            <span className="text-[10px] text-white/40">%</span>
                          </div>
                        </div>

                        {/* Row 2: Blur, Offset X, Offset Y */}
                        <div className="grid grid-cols-3 gap-1.5">
                          <div className="flex items-center gap-1 bg-black/40 border border-white/15 px-1.5 py-1 rounded-[12px]">
                            <span className="text-[9px] font-bold text-white/40">Blur</span>
                            <input
                              type="number"
                              min="0"
                              max="60"
                              value={typeof selectedLayer.shadowBlur === "number" ? selectedLayer.shadowBlur : 10}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val)) updateLayer(selectedLayer.id, { shadowBlur: Math.max(0, val) });
                              }}
                              className="w-full bg-transparent text-xs text-white focus:outline-none text-right"
                              aria-label="Shadow Blur"
                            />
                            <span className="text-[9px] text-white/40">px</span>
                          </div>

                          <div className="flex items-center gap-1 bg-black/40 border border-white/15 px-1.5 py-1 rounded-[12px]">
                            <span className="text-[9px] font-bold text-white/40">X</span>
                            <input
                              type="number"
                              min="-50"
                              max="50"
                              value={typeof selectedLayer.shadowOffsetX === "number" ? selectedLayer.shadowOffsetX : 0}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val)) updateLayer(selectedLayer.id, { shadowOffsetX: val });
                              }}
                              className="w-full bg-transparent text-xs text-white focus:outline-none text-right"
                              aria-label="Shadow Offset X"
                            />
                            <span className="text-[9px] text-white/40">px</span>
                          </div>

                          <div className="flex items-center gap-1 bg-black/40 border border-white/15 px-1.5 py-1 rounded-[12px]">
                            <span className="text-[9px] font-bold text-white/40">Y</span>
                            <input
                              type="number"
                              min="-50"
                              max="50"
                              value={typeof selectedLayer.shadowOffsetY === "number" ? selectedLayer.shadowOffsetY : 4}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val)) updateLayer(selectedLayer.id, { shadowOffsetY: val });
                              }}
                              className="w-full bg-transparent text-xs text-white focus:outline-none text-right"
                              aria-label="Shadow Offset Y"
                            />
                            <span className="text-[9px] text-white/40">px</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Transitions & Motion Card */}
                  <div className="p-3 bg-[#151221] rounded-[12px] border border-white/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">Transitions & Motion</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            pushUndoSnapshot();
                            const t = selectedLayer.transition;
                            if (!t) return;
                            setCurrentDesign((prev) => ({
                              ...prev,
                              transition: t,
                              layers: prev.layers.map((l) => ({ ...l, transition: t })),
                            }));
                            showFeedback("Applied transition to entire lower third", true);
                          }}
                          className="px-2 py-0.5 rounded-[12px] bg-white/5 hover:bg-white/10 text-white/70 text-[10px] font-bold border border-white/10 flex items-center gap-1 transition-all"
                          title="Apply transition settings to all layers in this design"
                        >
                          <span>Apply to All</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTriggerAnimationPreview(selectedLayer)}
                          className="px-2 py-0.5 rounded-[12px] bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 text-[10px] font-bold border border-purple-500/40 flex items-center gap-1 transition-all"
                        >
                          <PiPlay size={10} />
                          <span>Preview</span>
                        </button>
                      </div>
                    </div>

                    {/* Entrance */}
                    <div className="space-y-1.5 bg-black/30 p-2 rounded-[12px] border border-white/5">
                      <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider block">Entrance Transition</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <label className="text-[9px] text-white/40 block mb-0.5">Type</label>
                          <select
                            value={selectedLayer.transition?.entrance?.type || "none"}
                            onChange={(e) => {
                              pushUndoSnapshot();
                              const updatedTrans = {
                                ...(selectedLayer.transition || {}),
                                entrance: {
                                  durationMs: 300,
                                  easing: "ease-out",
                                  ...(selectedLayer.transition?.entrance || {}),
                                  type: e.target.value,
                                },
                              };
                              updateLayer(selectedLayer.id, { transition: updatedTrans });
                              setCurrentDesign((prev) => ({
                                ...prev,
                                transition: {
                                  ...(prev.transition || {}),
                                  entrance: updatedTrans.entrance,
                                  exit: updatedTrans.exit || prev.transition?.exit || { type: "fade", durationMs: 300, easing: "ease-in" },
                                },
                              }));
                            }}
                            className="w-full bg-black/50 border border-white/15 px-2 py-1 rounded-[12px] text-[10px] text-white focus:outline-none"
                          >
                            <option value="none">None (Cut)</option>
                            <option value="fade">Fade</option>
                            <option value="slide-fade-left">Short Slide + Fade Left</option>
                            <option value="slide-fade-right">Short Slide + Fade Right</option>
                            <option value="slide-fade-top">Short Slide + Fade Top</option>
                            <option value="slide-fade-bottom">Short Slide + Fade Bottom</option>
                            <option value="scale-fade">Scale + Fade (Subtle Zoom)</option>
                            <option value="slide-left">Full Slide from Left</option>
                            <option value="slide-right">Full Slide from Right</option>
                            <option value="slide-top">Full Slide from Top</option>
                            <option value="slide-bottom">Full Slide from Bottom</option>
                            <option value="wipe">Wipe / Reveal</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[9px] text-white/40 block mb-0.5">Duration</label>
                          <div className="flex items-center bg-black/50 border border-white/15 px-2 py-1 rounded-[12px]">
                            <input
                              type="number"
                              min="100"
                              max="3000"
                              step="50"
                              value={selectedLayer.transition?.entrance?.durationMs ?? 300}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val)) {
                                  const updatedTrans = {
                                    ...(selectedLayer.transition || {}),
                                    entrance: {
                                      type: "fade",
                                      easing: "ease-out",
                                      ...(selectedLayer.transition?.entrance || {}),
                                      durationMs: Math.max(50, Math.min(5000, val)),
                                    },
                                  };
                                  updateLayer(selectedLayer.id, { transition: updatedTrans });
                                  setCurrentDesign((prev) => ({
                                    ...prev,
                                    transition: {
                                      ...(prev.transition || {}),
                                      entrance: updatedTrans.entrance,
                                    },
                                  }));
                                }
                              }}
                              className="w-full bg-transparent text-[10px] text-white focus:outline-none"
                            />
                            <span className="text-[9px] text-white/40">ms</span>
                          </div>
                        </div>
                        <div className="col-span-2 pt-0.5">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(selectedLayer.transition?.entrance?.sweepHighlight || selectedLayer.sweepHighlight)}
                              onChange={(e) => {
                                pushUndoSnapshot();
                                const isChecked = e.target.checked;
                                const updatedTrans = {
                                  ...(selectedLayer.transition || {}),
                                  entrance: {
                                    ...(selectedLayer.transition?.entrance || {}),
                                    sweepHighlight: isChecked,
                                  },
                                };
                                updateLayer(selectedLayer.id, {
                                  sweepHighlight: isChecked,
                                  transition: updatedTrans,
                                });
                                setCurrentDesign((prev) => ({
                                  ...prev,
                                  transition: {
                                    ...(prev.transition || {}),
                                    entrance: updatedTrans.entrance,
                                  },
                                }));
                              }}
                              className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500 bg-black/50 border-white/20"
                            />
                            <span className="text-[9px] text-white/70 font-medium">Specular Highlight Sweep on Entrance</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Exit */}
                    <div className="space-y-1.5 bg-black/30 p-2 rounded-[12px] border border-white/5">
                      <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider block">Exit Transition</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <label className="text-[9px] text-white/40 block mb-0.5">Type</label>
                          <select
                            value={selectedLayer.transition?.exit?.type || "none"}
                            onChange={(e) => {
                              pushUndoSnapshot();
                              const updatedTrans = {
                                ...(selectedLayer.transition || {}),
                                exit: {
                                  durationMs: 300,
                                  easing: "ease-in",
                                  ...(selectedLayer.transition?.exit || {}),
                                  type: e.target.value,
                                },
                              };
                              updateLayer(selectedLayer.id, { transition: updatedTrans });
                              setCurrentDesign((prev) => ({
                                ...prev,
                                transition: {
                                  ...(prev.transition || {}),
                                  exit: updatedTrans.exit,
                                },
                              }));
                            }}
                            className="w-full bg-black/50 border border-white/15 px-2 py-1 rounded-[12px] text-[10px] text-white focus:outline-none"
                          >
                            <option value="none">None (Cut)</option>
                            <option value="fade">Fade</option>
                            <option value="slide-fade-left">Short Slide + Fade Left</option>
                            <option value="slide-fade-right">Short Slide + Fade Right</option>
                            <option value="slide-fade-top">Short Slide + Fade Top</option>
                            <option value="slide-fade-bottom">Short Slide + Fade Bottom</option>
                            <option value="scale-fade">Scale + Fade (Subtle Zoom)</option>
                            <option value="slide-left">Full Slide to Left</option>
                            <option value="slide-right">Full Slide to Right</option>
                            <option value="slide-top">Full Slide to Top</option>
                            <option value="slide-bottom">Full Slide to Bottom</option>
                            <option value="wipe">Wipe / Collapse</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[9px] text-white/40 block mb-0.5">Duration</label>
                          <div className="flex items-center bg-black/50 border border-white/15 px-2 py-1 rounded-[12px]">
                            <input
                              type="number"
                              min="100"
                              max="3000"
                              step="50"
                              value={selectedLayer.transition?.exit?.durationMs ?? 300}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val)) {
                                  const updatedTrans = {
                                    ...(selectedLayer.transition || {}),
                                    exit: {
                                      type: "fade",
                                      easing: "ease-in",
                                      ...(selectedLayer.transition?.exit || {}),
                                      durationMs: Math.max(50, Math.min(5000, val)),
                                    },
                                  };
                                  updateLayer(selectedLayer.id, { transition: updatedTrans });
                                  setCurrentDesign((prev) => ({
                                    ...prev,
                                    transition: {
                                      ...(prev.transition || {}),
                                      exit: updatedTrans.exit,
                                    },
                                  }));
                                }
                              }}
                              className="w-full bg-transparent text-[10px] text-white focus:outline-none"
                            />
                            <span className="text-[9px] text-white/40">ms</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Quick Add Selected to Live Controls Rack */}
                    <button
                      type="button"
                      onClick={() => {
                        const selectedLayers = currentDesign.layers.filter((l) => selectedLayerIds.includes(l.id));
                        handleAddToLiveControls(selectedLayers);
                      }}
                      className="w-full py-1.5 rounded-[12px] bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 text-[11px] font-bold transition-all flex items-center justify-center gap-1.5"
                    >
                      <PiBroadcast size={13} />
                      <span>Add Selection to Live Controls</span>
                    </button>
                  </div>

                  {/* 5. Advanced Properties (Expandable Card) */}
                  <div className="p-3 bg-[#151221] rounded-[12px] border border-white/10 space-y-2">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedInspector((prev) => !prev)}
                      className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-white/50 hover:text-white rounded-[12px] p-1"
                      aria-expanded={showAdvancedInspector}
                    >
                      <span>Advanced Properties</span>
                      {showAdvancedInspector ? <PiCaretDown size={12} /> : <PiCaretRight size={12} />}
                    </button>

                    {showAdvancedInspector && (
                      <div className="pt-2 border-t border-white/5 space-y-2.5 text-xs">
                        {/* Group Membership */}
                        {selectedLayer.groupId && (
                          <div className="pt-1 flex items-center justify-between">
                            <span className="text-[10px] text-white/50">In Group</span>
                            <button
                              type="button"
                              onClick={() => setSelectedLayerId(selectedLayer.groupId)}
                              className="px-2 py-1 rounded-[12px] bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold transition-all"
                              aria-label="Select Entire Group"
                              title="Select Entire Group"
                            >
                              Select Parent Group
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-[12px] bg-white/[0.02] border border-white/5 text-center text-xs text-white/40">
                  Select any layer on the canvas to inspect and edit its properties.
                </div>
              )}

              {/* ── Layer Order Stack ────────────────────────────────────────── */}
              <div className="pt-3 border-t border-white/10 space-y-2">
                <div className="flex items-center justify-between pb-1">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-white/40">
                    Layers Stack
                  </span>
                  <span className="text-[10px] text-white/40">Top to bottom</span>
                </div>

                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-0.5">
                  {[...currentDesign.layers].reverse().map((layer, reverseIdx) => {
                    const idx = currentDesign.layers.length - 1 - reverseIdx;
                    const isSelected = selectedLayerIds.includes(layer.id);

                    return (
                      <React.Fragment key={layer.id}>
                        <div
                          onClick={(e) => {
                            const currentSelected = selectedLayerIdsRef.current || selectedLayerIds;
                            let next;
                            if (e.shiftKey) {
                              if (currentSelected.includes(layer.id)) {
                                next = currentSelected.filter((id) => id !== layer.id);
                              } else {
                                next = [...currentSelected, layer.id];
                              }
                            } else {
                              next = [layer.id];
                            }
                            selectedLayerIdsRef.current = next;
                            setSelectedLayerIds(next);
                            setSelectedLayerId(layer.id);
                            if (editingCropLayerId && editingCropLayerId !== layer.id) {
                              setEditingCropLayerId(null);
                              setEditingCropTarget("image");
                            }
                          }}
                          className={`p-2 rounded-[12px] border transition-all flex items-center justify-between cursor-pointer text-xs ${
                            isSelected
                              ? "bg-purple-600/30 border-purple-500 text-purple-200"
                              : "bg-white/[0.02] border-white/5 text-white/70 hover:bg-white/[0.05]"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 pr-2">
                            <span className="text-white/40 text-[10px] font-mono w-4 shrink-0">
                              #{idx + 1}
                            </span>
                            <span className="truncate font-semibold text-xs">
                              {layer.name}
                            </span>
                            {layer.maskImage?.url && (
                              <span className="text-[9px] font-bold text-purple-300 bg-purple-500/20 border border-purple-500/30 px-1.5 py-0.2 rounded-[8px] shrink-0">
                                Mask
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <ActionButton
                              disabled={idx === currentDesign.layers.length - 1}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleBringForward(layer.id);
                              }}
                              className="p-1 rounded-[12px] text-white/40 hover:text-white disabled:opacity-20"
                              title="Bring Forward"
                            >
                              <PiArrowUp size={11} />
                            </ActionButton>
                            <ActionButton
                              disabled={idx === 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSendBackward(layer.id);
                              }}
                              className="p-1 rounded-[12px] text-white/40 hover:text-white disabled:opacity-20"
                              title="Send Backward"
                            >
                              <PiArrowDown size={11} />
                            </ActionButton>
                            <ActionButton
                              onClick={(e) => {
                                e.stopPropagation();
                                updateLayer(layer.id, { visible: !layer.visible });
                              }}
                              className="p-1 rounded-[12px] text-white/40 hover:text-white"
                              title={layer.visible ? "Hide Layer" : "Show Layer"}
                            >
                              {layer.visible ? <PiEye size={12} /> : <PiEyeSlash size={12} className="text-white/20" />}
                            </ActionButton>
                            <ActionButton
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteLayer(layer.id);
                              }}
                              className="p-1 rounded-[12px] text-white/40 hover:text-red-400"
                              title="Delete Layer"
                            >
                              <PiTrash size={12} />
                            </ActionButton>
                          </div>
                        </div>

                        {/* Nested Masked Image Sub-Row in Layers Panel */}
                        {layer.maskImage && layer.maskImage.url && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              selectedLayerIdsRef.current = [layer.id];
                              setSelectedLayerIds([layer.id]);
                              setSelectedLayerId(layer.id);
                              setEditingCropLayerId(layer.id);
                              setEditingCropTarget("image");
                              showFeedback(`Editing image inside ${layer.name}. Drag canvas to pan image.`, true);
                            }}
                            className={`ml-5 -mt-0.5 mb-1 p-1.5 rounded-[12px] border transition-all flex items-center justify-between cursor-pointer text-xs ${
                              selectedLayerId === layer.id && editingCropLayerId === layer.id && editingCropTarget === "image"
                                ? "bg-emerald-600/30 border-emerald-500/60 text-emerald-100 shadow-sm"
                                : "bg-white/[0.015] border-white/5 text-white/60 hover:bg-white/[0.04]"
                            }`}
                            title="Click to select and edit image content inside this mask"
                          >
                            <div className="flex items-center gap-1.5 min-w-0 pr-1">
                              <span className="text-emerald-400 text-xs">↳ 🖼</span>
                              <span className="truncate text-[11px] font-medium">
                                {layer.maskImage.name || "Masked Image"}
                              </span>
                            </div>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-[8px] font-bold border shrink-0 ${
                              selectedLayerId === layer.id && editingCropLayerId === layer.id && editingCropTarget === "image"
                                ? "bg-emerald-500/30 text-emerald-200 border-emerald-500/50"
                                : "bg-white/5 text-white/50 border-white/10"
                            }`}>
                              {selectedLayerId === layer.id && editingCropLayerId === layer.id && editingCropTarget === "image"
                                ? "Editing Image"
                                : "Edit Image"}
                            </span>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
