/**
 * pptxInheritance.js — Resolves OpenXML shape placeholder position and background inheritance (FR-4.2)
 *
 * Implements standard 3-level OOXML inheritance: slide -> slideLayout -> slideMaster.
 * When an author creates a slide without manually resizing/moving a placeholder,
 * PowerPoint omits <a:xfrm> and relies on the renderer to inherit position geometry.
 */

const path = require('path');
const JSZip = require('jszip');

/**
 * Extract all placeholder definitions (<p:ph>) and their transforms (<a:xfrm>) from an XML string.
 */
function extractPlaceholdersFromXml(xml) {
  const results = [];
  if (!xml) return results;
  const spMatches = xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) || [];
  for (const sp of spMatches) {
    const phMatch = sp.match(/<p:ph([^>]*)\/>/) || sp.match(/<p:ph([^>]*)>[\s\S]*?<\/p:ph>/);
    if (!phMatch) continue;

    const phAttrs = phMatch[1] || "";
    const typeMatch = phAttrs.match(/\btype="([^"]+)"/);
    const idxMatch = phAttrs.match(/\bidx="([^"]+)"/);
    const phType = typeMatch ? typeMatch[1] : null;
    const phIdx = idxMatch ? idxMatch[1] : null;

    const xfrmMatch = sp.match(/<a:xfrm>[\s\S]*?<\/a:xfrm>/);
    const xfrm = xfrmMatch ? xfrmMatch[0] : null;

    results.push({ phType, phIdx, xfrm });
  }
  return results;
}

/**
 * Match a target placeholder (type, idx) through layout and master placeholders per OOXML rules.
 */
function findMatchingXfrm(targetType, targetIdx, layoutPlaceholders = [], masterPlaceholders = []) {
  // 1. Layout exact match (type AND idx)
  if (targetType && targetIdx != null) {
    const m = layoutPlaceholders.find(p => p.phType === targetType && p.phIdx === targetIdx && p.xfrm);
    if (m) return m.xfrm;
  }
  // 2. Layout match by idx
  if (targetIdx != null) {
    const m = layoutPlaceholders.find(p => p.phIdx === targetIdx && p.xfrm);
    if (m) return m.xfrm;
  }
  // 3. Layout match by type
  if (targetType) {
    const m = layoutPlaceholders.find(p => p.phType === targetType && p.xfrm);
    if (m) return m.xfrm;
  }

  // 4. Master exact match (type AND idx)
  if (targetType && targetIdx != null) {
    const m = masterPlaceholders.find(p => p.phType === targetType && p.phIdx === targetIdx && p.xfrm);
    if (m) return m.xfrm;
  }
  // 5. Master match by idx
  if (targetIdx != null) {
    const m = masterPlaceholders.find(p => p.phIdx === targetIdx && p.xfrm);
    if (m) return m.xfrm;
  }
  // 6. Master match by type
  if (targetType) {
    const m = masterPlaceholders.find(p => p.phType === targetType && p.xfrm);
    if (m) return m.xfrm;
  }
  // 7. Fallback: if target has no type and idx="1" (standard body placeholder), match master type="body"
  if (!targetType && (targetIdx === "1" || targetIdx === 1)) {
    const m = masterPlaceholders.find(p => (p.phType === "body" || !p.phType) && p.xfrm);
    if (m) return m.xfrm;
  }

  return null;
}

/**
 * Parse relationship target from a .rels XML string.
 */
function extractRelTarget(relsXml, relTypePattern) {
  if (!relsXml) return null;
  const match = relsXml.match(new RegExp(`Type="[^"]*${relTypePattern}"[^>]*Target="([^"]+)"`)) ||
                relsXml.match(new RegExp(`Target="([^"]+)"[^>]*Type="[^"]*${relTypePattern}"`));
  return match ? match[1] : null;
}

/**
 * Normalize background XML: pptx-glimpse parseBackground only reads <p:bgPr>,
 * so if the master/layout uses <p:bgRef> with a color scheme or sRGB,
 * normalize it to a valid <p:bgPr> solidFill.
 */
function normalizeBackgroundXml(bgXml) {
  if (!bgXml) return null;
  if (bgXml.includes("<p:bgPr>")) return bgXml;
  const schemeMatch = bgXml.match(/<a:schemeClr\s+val="([^"]+)"/);
  if (schemeMatch) {
    return `<p:bg><p:bgPr><a:solidFill><a:schemeClr val="${schemeMatch[1]}"/></a:solidFill></p:bgPr></p:bg>`;
  }
  const srgbMatch = bgXml.match(/<a:srgbClr\s+val="([^"]+)"/);
  if (srgbMatch) {
    return `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${srgbMatch[1]}"/></a:solidFill></p:bgPr></p:bg>`;
  }
  return bgXml;
}

/**
 * Pre-process a PPTX buffer to resolve placeholder position inheritance (<a:xfrm>)
 * and slide background inheritance (<p:bg>) before handing off to the rasterizer.
 *
 * @param {Buffer} buffer - Raw PPTX file buffer
 * @returns {Promise<Buffer>} - Patched PPTX buffer with resolved transforms
 */
async function resolvePptxInheritance(buffer) {
  try {
    const zip = await JSZip.loadAsync(buffer);

    // Step 1: Index all Slide Masters
    const masterFiles = Object.keys(zip.files).filter(k => k.match(/^ppt\/slideMasters\/slideMaster\d+\.xml$/));
    const masterMap = {};
    for (const mf of masterFiles) {
      const xml = await zip.file(mf).async("string");
      const placeholders = extractPlaceholdersFromXml(xml);
      const bgMatch = xml.match(/<p:bg>[\s\S]*?<\/p:bg>/);
      masterMap[mf] = {
        placeholders,
        bgXml: normalizeBackgroundXml(bgMatch ? bgMatch[0] : null)
      };
    }

    // Step 2: Index all Slide Layouts and their rels to Masters
    const layoutFiles = Object.keys(zip.files).filter(k => k.match(/^ppt\/slideLayouts\/slideLayout\d+\.xml$/));
    const layoutMap = {};
    for (const lf of layoutFiles) {
      const xml = await zip.file(lf).async("string");
      const placeholders = extractPlaceholdersFromXml(xml);
      const bgMatch = xml.match(/<p:bg>[\s\S]*?<\/p:bg>/);

      let masterFilename = null;
      const relsFile = lf.replace("slideLayouts/", "slideLayouts/_rels/") + ".rels";
      if (zip.file(relsFile)) {
        const relsXml = await zip.file(relsFile).async("string");
        const target = extractRelTarget(relsXml, "\\/slideMaster");
        if (target) {
          masterFilename = path.posix.normalize(path.posix.join(path.posix.dirname(lf), target));
        }
      }

      layoutMap[lf] = {
        placeholders,
        bgXml: normalizeBackgroundXml(bgMatch ? bgMatch[0] : null),
        masterFilename
      };
    }

    // Step 3: Resolve each Slide
    const slideFiles = Object.keys(zip.files).filter(k => k.match(/^ppt\/slides\/slide\d+\.xml$/));
    let modifiedAny = false;

    for (const sf of slideFiles) {
      let slideXml = await zip.file(sf).async("string");
      const relsFile = sf.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";
      let layoutFilename = null;
      if (zip.file(relsFile)) {
        const relsXml = await zip.file(relsFile).async("string");
        const target = extractRelTarget(relsXml, "\\/slideLayout");
        if (target) {
          layoutFilename = path.posix.normalize(path.posix.join(path.posix.dirname(sf), target));
        }
      }

      const layoutInfo = layoutFilename ? layoutMap[layoutFilename] : null;
      const masterInfo = (layoutInfo && layoutInfo.masterFilename) ? masterMap[layoutInfo.masterFilename] : null;
      const masterPlaceholders = masterInfo ? masterInfo.placeholders : [];
      const layoutPlaceholders = layoutInfo ? layoutInfo.placeholders : [];

      let slideModified = false;

      // 3A: Resolve placeholder transforms in shapes
      slideXml = slideXml.replace(/<p:sp>([\s\S]*?)<\/p:sp>/g, (fullSp, spContent) => {
        const phMatch = spContent.match(/<p:ph([^>]*)\/>/) || spContent.match(/<p:ph([^>]*)>[\s\S]*?<\/p:ph>/);
        if (!phMatch) return fullSp;

        const phAttrs = phMatch[1] || "";
        const typeMatch = phAttrs.match(/\btype="([^"]+)"/);
        const idxMatch = phAttrs.match(/\bidx="([^"]+)"/);
        const phType = typeMatch ? typeMatch[1] : null;
        const phIdx = idxMatch ? idxMatch[1] : null;

        // If explicit <a:xfrm> is already present, preserve it
        if (spContent.includes("<a:xfrm>")) return fullSp;

        const resolvedXfrm = findMatchingXfrm(phType, phIdx, layoutPlaceholders, masterPlaceholders);
        if (!resolvedXfrm) return fullSp;

        slideModified = true;
        if (spContent.includes("<p:spPr/>")) {
          return `<p:sp>${spContent.replace("<p:spPr/>", `<p:spPr>${resolvedXfrm}</p:spPr>`)}</p:sp>`;
        } else if (spContent.includes("<p:spPr></p:spPr>")) {
          return `<p:sp>${spContent.replace("<p:spPr></p:spPr>", `<p:spPr>${resolvedXfrm}</p:spPr>`)}</p:sp>`;
        } else if (spContent.includes("<p:spPr>")) {
          return `<p:sp>${spContent.replace("<p:spPr>", `<p:spPr>${resolvedXfrm}`)}</p:sp>`;
        } else if (spContent.includes("<p:spPr ")) {
          return `<p:sp>${spContent.replace(/(<p:spPr[^>]*>)/, `$1${resolvedXfrm}`)}</p:sp>`;
        }
        return `<p:sp>${spContent}<p:spPr>${resolvedXfrm}</p:spPr></p:sp>`;
      });

      // 3B: Resolve background if slide has no direct background
      if (!slideXml.includes("<p:bg>") && !slideXml.includes("<p:bg ")) {
        const inheritedBg = layoutInfo?.bgXml || masterInfo?.bgXml;
        if (inheritedBg && slideXml.includes("<p:cSld>")) {
          slideXml = slideXml.replace("<p:cSld>", `<p:cSld>${inheritedBg}`);
          slideModified = true;
        } else if (inheritedBg && slideXml.includes("<p:cSld ")) {
          slideXml = slideXml.replace(/(<p:cSld[^>]*>)/, `$1${inheritedBg}`);
          slideModified = true;
        }
      }

      if (slideModified) {
        zip.file(sf, slideXml);
        modifiedAny = true;
      }
    }

    if (!modifiedAny) return buffer;
    return await zip.generateAsync({ type: "nodebuffer" });
  } catch (err) {
    console.warn("[PPTX] Placeholder inheritance resolution skipped due to error:", err.message);
    return buffer; // Fail gracefully to original buffer per NFR-13
  }
}

module.exports = {
  resolvePptxInheritance,
  extractPlaceholdersFromXml,
  findMatchingXfrm
};
