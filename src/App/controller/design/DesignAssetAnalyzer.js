/**
 * DesignAssetAnalyzer.js
 * =======================
 * Intelligent, offline-first image inspection and decomposition for flyers,
 * posters, and church graphics (V2).
 * 
 * Capabilities:
 * - Detects visual objects (Logos, Artwork, Headings, Icons, Subjects, Sections).
 * - Distinguishes between "Extract Text" and "Extract Visual (PNG)".
 * - Source-resolution cropping & smart alpha cutout.
 * - Electron native image clipboard integration.
 * - Merge / Split / Custom Marquee selection.
 */

import { removeImageBackgroundLocal } from '../LiveDesignStudioModal';
import { CANONICAL_BOOK_ALIASES } from '../smartBibleMatch';

/**
 * Client-side heuristic fallback for grouping text blocks if python decomposer is absent.
 */
function performClientSideDecomposition(textBlocks, faces = [], elements = [], imgW = 1920, imgH = 1080) {
  const regions = [];
  let regId = 1;

  // 1. Group text blocks horizontally and vertically
  const sorted = [...textBlocks].sort((a, b) => a.y - b.y || a.x - b.x);
  const used = new Set();

  for (let i = 0; i < sorted.length; i++) {
    if (used.has(sorted[i].id)) continue;
    const cluster = [sorted[i]];
    used.add(sorted[i].id);

    for (let j = i + 1; j < sorted.length; j++) {
      if (used.has(sorted[j].id)) continue;
      const ref = cluster[cluster.length - 1];
      const cur = sorted[j];

      const vDist = cur.y - (ref.y + ref.h);
      const hOverlap = Math.min(ref.x + ref.w, cur.x + cur.w) - Math.max(ref.x, cur.x);
      const isSameLine = Math.abs(cur.y - ref.y) < Math.max(14, ref.h * 0.45);
      const hGap = cur.x - (ref.x + ref.w);

      if ((isSameLine && hGap >= -15 && hGap < Math.max(60, ref.h * 2.5)) ||
          (hOverlap > 0 && vDist >= 0 && vDist < Math.max(25, ref.h * 1.2))) {
        cluster.push(cur);
        used.add(cur.id);
      }
    }

    const minX = Math.min(...cluster.map((c) => c.x));
    const minY = Math.min(...cluster.map((c) => c.y));
    const maxR = Math.max(...cluster.map((c) => c.x + c.w));
    const maxB = Math.max(...cluster.map((c) => c.y + c.h));
    const clusterText = cluster.map((c) => c.text).join(' ');
    const avgConf = cluster.reduce((sum, c) => sum + c.conf, 0) / cluster.length;

    const padX = Math.max(8, Math.round((maxR - minX) * 0.05));
    const padY = Math.max(6, Math.round((maxB - minY) * 0.08));
    const gx = Math.max(0, minX - padX);
    const gy = Math.max(0, minY - padY);
    const gw = Math.min(imgW - gx, (maxR - minX) + padX * 2);
    const gh = Math.min(imgH - gy, (maxB - minY) + padY * 2);

    const isTitle = (maxB - minY) > imgH * 0.038 || (avgConf >= 75 && (maxB - minY) > imgH * 0.03);

    regions.push({
      id: `reg_client_${regId++}`,
      type: isTitle ? 'visual_group' : 'text_group',
      label: clusterText.length > 32 ? clusterText.slice(0, 30) + '...' : clusterText,
      text: clusterText,
      x: gx,
      y: gy,
      w: gw,
      h: gh,
      conf: Math.round(avgConf),
      canCutout: true,
      cutoutQuality: isTitle ? 'high' : 'medium',
      normX: (gx / imgW) * 100,
      normY: (gy / imgH) * 100,
      normW: (gw / imgW) * 100,
      normH: (gh / imgH) * 100,
      relatedOcrBlocks: cluster.map((c) => c.id),
    });
  }

  // 2. Add Face / Subject regions
  faces.forEach((f, idx) => {
    const fx = Math.max(0, Number(f.x) || 0);
    const fy = Math.max(0, Number(f.y) || 0);
    const fw = Number(f.w) || 100;
    const fh = Number(f.h) || 100;
    regions.push({
      id: `reg_face_${idx}_${Date.now()}`,
      type: 'subject',
      label: f.label || `Speaker Portrait ${idx + 1}`,
      text: 'Speaker',
      x: fx,
      y: fy,
      w: fw,
      h: fh,
      conf: 95,
      canCutout: true,
      cutoutQuality: 'high',
      normX: (fx / imgW) * 100,
      normY: (fy / imgH) * 100,
      normW: (fw / imgW) * 100,
      normH: (fh / imgH) * 100,
    });
  });

  return regions;
}

/**
 * Resolves Bible scripture references from OCR text using OCS canonical aliases.
 */
export function resolveScriptureFromText(textBlocks = [], fullText = "") {
  const combinedText = fullText || textBlocks.map((b) => b.text).join(' ');
  const scriptureRegex = /\b([0-9]?[A-Za-z]+)\.?\s*(\d+)[:\.](\d+(?:-\d+)?)\b/g;
  let match;
  while ((match = scriptureRegex.exec(combinedText)) !== null) {
    const rawBook = match[1].toLowerCase().replace(/\.$/, '');
    const chapter = match[2];
    const verse = match[3];
    const canonical = CANONICAL_BOOK_ALIASES[rawBook];
    if (canonical) {
      return {
        displayText: `${match[1]}. ${chapter}:${verse}`,
        normalizedReference: `${canonical} ${chapter}:${verse}`,
        book: canonical,
        chapter: Number(chapter),
        verse,
      };
    }
  }

  // Also check two consecutive/adjacent blocks: block A is book abbreviation, block B is chapter:verse
  for (let i = 0; i < textBlocks.length - 1; i++) {
    const a = textBlocks[i].text.trim().replace(/[\(\)]/g, '').toLowerCase().replace(/\.$/, '');
    const b = textBlocks[i + 1].text.trim().replace(/[\(\)]/g, '');
    const verseMatch = /^(\d+)[:\.](\d+(?:-\d+)?)$/.exec(b);
    if (verseMatch) {
      const canonical = CANONICAL_BOOK_ALIASES[a];
      if (canonical) {
        return {
          displayText: `${textBlocks[i].text.trim()} ${b}`,
          normalizedReference: `${canonical} ${verseMatch[1]}:${verseMatch[2]}`,
          book: canonical,
          chapter: Number(verseMatch[1]),
          verse: verseMatch[2],
        };
      }
    }
  }
  return null;
}

/**
 * Normalizes raw analysis payload into the shared, unified analysis model.
 * Consumed identically by both AI Design Lab and Main Design Studio.
 */
export function normalizeAnalysisResult(raw, naturalWidth, naturalHeight, sourceImage = null) {
  const imgW = raw?.image_width || naturalWidth || 1920;
  const imgH = raw?.image_height || naturalHeight || 1080;

  // 1. Raw OCR Blocks (preserved for individual word inspection & backwards compatibility)
  const textBlocks = (raw?.ocr_blocks || []).map((b, idx) => ({
    id: `txt_${idx}_${Date.now()}`,
    text: String(b.text || '').trim(),
    x: Number(b.x) || 0,
    y: Number(b.y) || 0,
    w: Number(b.w) || 0,
    h: Number(b.h) || 0,
    conf: Number(b.conf) || 80,
    normX: ((Number(b.x) || 0) / imgW) * 100,
    normY: ((Number(b.y) || 0) / imgH) * 100,
    normW: ((Number(b.w) || 0) / imgW) * 100,
    normH: ((Number(b.h) || 0) / imgH) * 100,
  })).filter((b) => b.text.length > 0 && b.w > 0 && b.h > 0);

  // 2. Visual Regions (Logos, Visual Groups, Icons, Subjects, Text Groups, Sections)
  const rawRegions = raw?.visual_regions || [];
  let visualRegions = [];

  if (Array.isArray(rawRegions) && rawRegions.length > 0) {
    visualRegions = rawRegions.map((r, idx) => {
      const rx = Number(r.x) || 0;
      const ry = Number(r.y) || 0;
      const rw = Number(r.w) || 0;
      const rh = Number(r.h) || 0;
      return {
        id: r.id || `reg_${idx}_${Date.now()}`,
        type: r.type || 'visual_group',
        shape: r.shape || null,
        label: r.label || r.text || `Region ${idx + 1}`,
        text: r.text || '',
        x: rx,
        y: ry,
        w: rw,
        h: rh,
        conf: Number(r.conf) || 85,
        canCutout: r.can_cutout !== false,
        cutoutQuality: r.cutout_quality || 'high',
        isConvertible: r.is_convertible === true,
        borderRadius: r.border_radius ?? 12,
        strokeWidth: r.stroke_width ?? 0,
        relatedOcrBlocks: r.related_ocr_blocks || [],
        parentId: r.parent_id || null,
        childIds: r.child_ids || [],
        normX: (rx / imgW) * 100,
        normY: (ry / imgH) * 100,
        normW: (rw / imgW) * 100,
        normH: (rh / imgH) * 100,
      };
    });
  } else {
    visualRegions = performClientSideDecomposition(textBlocks, raw?.faces, raw?.elements, imgW, imgH);
  }

  // 3. Subjects list
  const subjects = visualRegions.filter((r) => r.type === 'subject');

  // 4. Shapes (geometric / convertible elements)
  const shapes = visualRegions.filter(
    (r) => r.isConvertible || ['rectangle', 'rounded_rect', 'circle', 'pill', 'line'].includes(r.shape)
  );

  // 5. Scripture detection
  const detectedScripture = resolveScriptureFromText(textBlocks, raw?.raw_text || (Array.isArray(raw?.text_extracted) ? raw.text_extracted.join(' ') : ''));

  // 6. Semantic Fields
  const semanticFields = {
    eventName: raw?.event_name || '',
    themeSubtitle: raw?.theme_subtitle || '',
    scripture: raw?.scripture || detectedScripture,
    dates: Array.isArray(raw?.dates_found) && raw.dates_found.length > 0 ? raw.dates_found : (raw?.dates ? [raw.dates] : []),
    times: Array.isArray(raw?.times_found) && raw.times_found.length > 0 ? raw.times_found : (raw?.times ? [raw.times] : []),
    venue: raw?.venue || raw?.event_location || '',
    organizer: raw?.organizer || raw?.organizers || '',
    speakers: Array.isArray(raw?.speakers) ? raw.speakers : (raw?.speakers ? [raw.speakers] : []),
    contact: raw?.contact || '',
    website: raw?.website || '',
  };

  return {
    sourceImage: sourceImage || raw?.source_image || null,
    dimensions: { width: imgW, height: imgH },
    rawOcr: raw?.ocr_blocks || [],
    groupedOcr: textBlocks,
    semanticFields,
    visualRegions,
    subjects,
    shapes,
    generatedAssets: raw?.generated_assets || null,

    // Backwards-compatible properties
    imageWidth: imgW,
    imageHeight: imgH,
    textBlocks,
    palette: raw?.palette_hex || [],
    primaryColor: raw?.primary_color || null,
    accentColor: raw?.accent_color || null,
    dominantFont: raw?.dominant_font_style || null,
    rawAnalysis: raw,
  };
}

/**
 * Loads image dimensions asynchronously.
 */
function getImageDimensions(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    };
    img.onerror = () => {
      resolve({ width: 1920, height: 1080 });
    };
    img.src = src;
  });
}

/**
 * Analyzes an image using the local, offline Python OCR & Vision engine.
 * @param {string} imageSource - file path, file:// URL, or dataUrl
 * @returns {Promise<Object>} normalized inspection result
 */
export async function analyzeImageSource(imageSource) {
  if (!imageSource) {
    throw new Error('No image source provided for inspection');
  }

  const { width: natW, height: natH } = await getImageDimensions(imageSource);

  // Call offline native engine via IPC if running in Electron
  if (window.electron?.Design?.analyzePoster) {
    try {
      const raw = await window.electron.Design.analyzePoster(imageSource);
      if (raw && !raw.error) {
        return normalizeAnalysisResult(raw, natW, natH, imageSource);
      }
      if (raw?.error) {
        console.warn('[DesignAssetAnalyzer] Engine reported error, using fallback:', raw.error);
      }
    } catch (err) {
      console.warn('[DesignAssetAnalyzer] IPC call failed, using fallback:', err);
    }
  }

  // Graceful fallback if engine is unreachable
  return normalizeAnalysisResult({
    image_width: natW,
    image_height: natH,
    ocr_blocks: [],
    faces: [],
    elements: [],
    visual_regions: [],
  }, natW, natH, imageSource);
}

/**
 * Crops a bounding region from an image into a new PNG DataURL at exact source resolution.
 * Coordinates (x, y, w, h) must be in the image's source coordinate space (or percentage if isNormalized).
 */
export async function cropRegionToDataUrl(imageSource, region, isNormalized = false) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const fullW = img.naturalWidth || img.width;
        const fullH = img.naturalHeight || img.height;

        let rx = region.x;
        let ry = region.y;
        let rw = region.w;
        let rh = region.h;

        if (isNormalized) {
          rx = (region.normX / 100) * fullW;
          ry = (region.normY / 100) * fullH;
          rw = (region.normW / 100) * fullW;
          rh = (region.normH / 100) * fullH;
        }

        // Clamp crop bounds to original image
        rx = Math.max(0, Math.min(fullW, rx));
        ry = Math.max(0, Math.min(fullH, ry));
        rw = Math.max(10, Math.min(fullW - rx, rw));
        rh = Math.max(10, Math.min(fullH - ry, rh));

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(rw);
        canvas.height = Math.round(rh);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, rx, ry, rw, rh, 0, 0, canvas.width, canvas.height);

        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = reject;
    img.src = imageSource;
  });
}

/**
 * Performs smart edge-preserving alpha cutout of a visual region at source resolution.
 * Removes surrounding backdrop while keeping text, glows, shadows, and interior artwork intact.
 */
export async function smartCutoutRegionToDataUrl(imageSource, region, isNormalized = false) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const fullW = img.naturalWidth || img.width;
        const fullH = img.naturalHeight || img.height;

        let rx = region.x;
        let ry = region.y;
        let rw = region.w;
        let rh = region.h;

        if (isNormalized) {
          rx = (region.normX / 100) * fullW;
          ry = (region.normY / 100) * fullH;
          rw = (region.normW / 100) * fullW;
          rh = (region.normH / 100) * fullH;
        }

        rx = Math.max(0, Math.min(fullW, rx));
        ry = Math.max(0, Math.min(fullH, ry));
        rw = Math.max(10, Math.min(fullW - rx, rw));
        rh = Math.max(10, Math.min(fullH - ry, rh));

        const canvas = document.createElement('canvas');
        const w = Math.round(rw);
        const h = Math.round(rh);
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, rx, ry, rw, rh, 0, 0, w, h);

        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        // Sample border pixels to establish background reference
        const borderSamples = [];
        const step = Math.max(1, Math.floor(Math.min(w, h) / 30));

        for (let x = 0; x < w; x += step) {
          const topIdx = (0 * w + x) * 4;
          const botIdx = ((h - 1) * w + x) * 4;
          borderSamples.push([data[topIdx], data[topIdx + 1], data[topIdx + 2]]);
          borderSamples.push([data[botIdx], data[botIdx + 1], data[botIdx + 2]]);
        }
        for (let y = 0; y < h; y += step) {
          const leftIdx = (y * w + 0) * 4;
          const rightIdx = (y * w + (w - 1)) * 4;
          borderSamples.push([data[leftIdx], data[leftIdx + 1], data[leftIdx + 2]]);
          borderSamples.push([data[rightIdx], data[rightIdx + 1], data[rightIdx + 2]]);
        }

        // Calculate median background color
        borderSamples.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
        const mid = Math.floor(borderSamples.length / 2);
        const bgR = borderSamples[mid][0];
        const bgG = borderSamples[mid][1];
        const bgB = borderSamples[mid][2];

        // Edge-connected Flood Fill / Color Distance Alpha Mask
        const visited = new Uint8Array(w * h);
        const queue = [];

        function colorDist(r, g, b, targetR, targetG, targetB) {
          return Math.sqrt((r - targetR) ** 2 + (g - targetG) ** 2 + (b - targetB) ** 2);
        }

        const tolerance = 42;
        const feather = 20;

        // Seed flood-fill from border pixels matching background
        for (let x = 0; x < w; x++) {
          const idxTop = x * 4;
          if (colorDist(data[idxTop], data[idxTop + 1], data[idxTop + 2], bgR, bgG, bgB) < tolerance + feather) {
            queue.push(x, 0);
            visited[x] = 1;
          }
          const idxBot = ((h - 1) * w + x) * 4;
          if (colorDist(data[idxBot], data[idxBot + 1], data[idxBot + 2], bgR, bgG, bgB) < tolerance + feather) {
            queue.push(x, h - 1);
            visited[(h - 1) * w + x] = 1;
          }
        }
        for (let y = 1; y < h - 1; y++) {
          const idxLeft = (y * w) * 4;
          if (colorDist(data[idxLeft], data[idxLeft + 1], data[idxLeft + 2], bgR, bgG, bgB) < tolerance + feather) {
            queue.push(0, y);
            visited[y * w] = 1;
          }
          const idxRight = (y * w + (w - 1)) * 4;
          if (colorDist(data[idxRight], data[idxRight + 1], data[idxRight + 2], bgR, bgG, bgB) < tolerance + feather) {
            queue.push(w - 1, y);
            visited[y * w + (w - 1)] = 1;
          }
        }

        let qHead = 0;
        while (qHead < queue.length) {
          const qx = queue[qHead++];
          const qy = queue[qHead++];

          const neighbors = [
            [qx - 1, qy],
            [qx + 1, qy],
            [qx, qy - 1],
            [qx, qy + 1],
          ];

          for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              const nPos = ny * w + nx;
              if (!visited[nPos]) {
                const nIdx = nPos * 4;
                const dist = colorDist(data[nIdx], data[nIdx + 1], data[nIdx + 2], bgR, bgG, bgB);
                if (dist < tolerance) {
                  visited[nPos] = 1;
                  queue.push(nx, ny);
                } else if (dist < tolerance + feather) {
                  visited[nPos] = 2; // soft feather boundary
                }
              }
            }
          }
        }

        // Apply alpha channel based on flood fill result
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const pPos = y * w + x;
            const pIdx = pPos * 4;
            const v = visited[pPos];
            if (v === 1) {
              data[pIdx + 3] = 0; // Fully transparent outer background
            } else if (v === 2) {
              const dist = colorDist(data[pIdx], data[pIdx + 1], data[pIdx + 2], bgR, bgG, bgB);
              const alphaFactor = Math.max(0, Math.min(1, (dist - tolerance) / feather));
              data[pIdx + 3] = Math.round(data[pIdx + 3] * alphaFactor);
            }
          }
        }

        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = reject;
    img.src = imageSource;
  });
}

/**
 * Crops a subject bounding box and strips its background into transparent alpha.
 */
export async function extractSubjectWithCutout(imageSource, region, onProgress = () => {}, abortSignal = null) {
  onProgress(15);
  const croppedDataUrl = await cropRegionToDataUrl(imageSource, region, false);
  if (abortSignal?.aborted) throw new Error('Canceled');

  onProgress(30);
  const cutoutDataUrl = await removeImageBackgroundLocal(
    croppedDataUrl,
    (pct) => onProgress(30 + Math.round(pct * 0.65)),
    abortSignal
  );

  onProgress(100);
  return cutoutDataUrl;
}

/**
 * Copies a PNG DataURL to the system clipboard (Electron native or Web Clipboard).
 */
export async function copyImageToClipboard(dataUrl) {
  if (!dataUrl) return false;

  // 1. Electron native clipboard
  if (window.electron?.Clipboard?.writeImage) {
    try {
      const res = await window.electron.Clipboard.writeImage(dataUrl);
      if (res) return true;
    } catch (_) {}
  }
  if (window.electron?.clipboard?.writeImage) {
    try {
      const res = await window.electron.clipboard.writeImage(dataUrl);
      if (res) return true;
    } catch (_) {}
  }

  // 2. Web browser Clipboard API
  if (typeof navigator !== 'undefined' && navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      return true;
    } catch (err) {
      console.warn('[DesignAssetAnalyzer] Browser clipboard write failed:', err);
    }
  }

  return false;
}

/**
 * Merges multiple selected visual regions into a single unified composite region.
 */
export function mergeSelectedRegions(regions, imgW = 1920, imgH = 1080) {
  if (!regions || regions.length === 0) return null;
  if (regions.length === 1) return regions[0];

  const minX = Math.min(...regions.map((r) => r.x));
  const minY = Math.min(...regions.map((r) => r.y));
  const maxR = Math.max(...regions.map((r) => r.x + r.w));
  const maxB = Math.max(...regions.map((r) => r.y + r.h));
  const combinedText = regions.map((r) => r.text || r.label).filter(Boolean).join(' ');

  return {
    id: `merged_${Date.now()}`,
    type: 'visual_group',
    label: `Merged: ${combinedText.slice(0, 24)}`,
    text: combinedText,
    x: minX,
    y: minY,
    w: maxR - minX,
    h: maxB - minY,
    conf: 95,
    canCutout: true,
    cutoutQuality: 'high',
    normX: (minX / imgW) * 100,
    normY: (minY / imgH) * 100,
    normW: ((maxR - minX) / imgW) * 100,
    normH: ((maxB - minY) / imgH) * 100,
    childIds: regions.map((r) => r.id),
  };
}

/**
 * Creates a custom region from a manual user marquee drag selection.
 */
export function createCustomMarqueeRegion(normX, normY, normW, normH, imgW = 1920, imgH = 1080) {
  const x = Math.round((normX / 100) * imgW);
  const y = Math.round((normY / 100) * imgH);
  const w = Math.round((normW / 100) * imgW);
  const h = Math.round((normH / 100) * imgH);

  return {
    id: `custom_marquee_${Date.now()}`,
    type: 'visual_group',
    label: 'Custom Marquee Selection',
    text: 'Custom Selection',
    x,
    y,
    w,
    h,
    conf: 100,
    canCutout: true,
    cutoutQuality: 'high',
    normX,
    normY,
    normW,
    normH,
  };
}

/**
 * Finds the smallest meaningful child region matching a given normalized point (px, py).
 * Priority order: child -> text/object/icon -> artwork/subject -> visual_group -> container/section
 * Breaks ties by smallest area.
 */
export function findSmallestChildRegion(regions, px, py) {
  if (!Array.isArray(regions) || regions.length === 0) return null;
  const matches = regions.filter((r) => {
    const rx = r.normX != null ? r.normX : 0;
    const ry = r.normY != null ? r.normY : 0;
    const rw = r.normW != null ? r.normW : 0;
    const rh = r.normH != null ? r.normH : 0;
    return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
  });
  if (!matches.length) return null;

  const typeWeight = {
    icon: 1,
    graphic_shape: 1,
    text_group: 2,
    logo: 3,
    subject: 4,
    visual_group: 5,
    section: 6,
  };

  matches.sort((a, b) => {
    const wA = typeWeight[a.type] || 5;
    const wB = typeWeight[b.type] || 5;
    if (wA !== wB) return wA - wB;
    const areaA = (a.normW || 0) * (a.normH || 0);
    const areaB = (b.normW || 0) * (b.normH || 0);
    return areaA - areaB;
  });

  return matches[0];
}

