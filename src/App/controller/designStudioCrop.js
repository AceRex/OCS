/**
 * designStudioCrop.js
 * Unified crop and pan bounding calculation for Studio DOM and Canvas 2D Program Compositor.
 */

export function calculateCropMetrics({
  containerWidth,
  containerHeight,
  naturalWidth,
  naturalHeight,
  fitMode = "fill",
  zoom = 1,
  panX = 0,
  panY = 0,
}) {
  const cw = Math.max(1, typeof containerWidth === "number" && !isNaN(containerWidth) ? containerWidth : 1);
  const ch = Math.max(1, typeof containerHeight === "number" && !isNaN(containerHeight) ? containerHeight : 1);
  const nw = Math.max(1, typeof naturalWidth === "number" && !isNaN(naturalWidth) ? naturalWidth : 1);
  const nh = Math.max(1, typeof naturalHeight === "number" && !isNaN(naturalHeight) ? naturalHeight : 1);
  const z = Math.max(1, typeof zoom === "number" && !isNaN(zoom) ? zoom : 1);

  const containerAspect = cw / ch;
  const imageAspect = nw / nh;

  let baseW, baseH;
  if (fitMode === "fit") {
    // contain: scale image so it fits entirely inside frame
    if (imageAspect > containerAspect) {
      baseW = cw;
      baseH = cw / imageAspect;
    } else {
      baseH = ch;
      baseW = ch * imageAspect;
    }
  } else {
    // fill (cover): scale image so it completely covers frame
    if (imageAspect > containerAspect) {
      baseH = ch;
      baseW = ch * imageAspect;
    } else {
      baseW = cw;
      baseH = cw / imageAspect;
    }
  }

  const drawW = baseW * z;
  const drawH = baseH * z;

  // Available overflow beyond the container edges
  const overflowW = Math.max(0, drawW - cw);
  const overflowH = Math.max(0, drawH - ch);

  // Clamped normalized pan: -1 to +1 (from -100% to +100%)
  const clampedPanX = Math.max(-100, Math.min(100, typeof panX === "number" && !isNaN(panX) ? panX : 0)) / 100;
  const clampedPanY = Math.max(-100, Math.min(100, typeof panY === "number" && !isNaN(panY) ? panY : 0)) / 100;

  // If overflow exists on an axis, pan can travel up to half of the overflow in either direction.
  // panX = +100% aligns left edge of image with left edge of frame.
  // panX = -100% aligns right edge of image with right edge of frame.
  // If no overflow exists, pan is 0 (centered).
  const panPxX = overflowW > 0 ? (clampedPanX * overflowW) / 2 : 0;
  const panPxY = overflowH > 0 ? (clampedPanY * overflowH) / 2 : 0;

  // Position relative to top-left of container (0, 0)
  const drawX = (cw - drawW) / 2 + panPxX;
  const drawY = (ch - drawH) / 2 + panPxY;

  return {
    cw,
    ch,
    baseW,
    baseH,
    drawW,
    drawH,
    overflowW,
    overflowH,
    panPxX,
    panPxY,
    drawX,
    drawY,
    css: {
      position: "absolute",
      width: `${(drawW / cw) * 100}%`,
      height: `${(drawH / ch) * 100}%`,
      left: `${(drawX / cw) * 100}%`,
      top: `${(drawY / ch) * 100}%`,
      maxWidth: "none",
      maxHeight: "none",
      objectFit: "fill",
      pointerEvents: "none",
      userSelect: "none",
    },
  };
}
