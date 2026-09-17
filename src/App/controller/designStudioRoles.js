/**
 * designStudioRoles.js
 * Definitions, field bindings, validation, sample preview content,
 * and text-fitting rules for lower-third roles (Bible, Announcement, Speaker, Custom).
 */

export const ROLE_TYPES = {
  CUSTOM: "custom",
  BIBLE: "bible",
  ANNOUNCEMENT: "announcement",
  SPEAKER: "speaker",
};

export const ROLE_DEFINITIONS = {
  [ROLE_TYPES.CUSTOM]: {
    id: "custom",
    label: "Custom",
    description: "General overlay without dynamic automated role bindings",
    fields: [],
  },
  [ROLE_TYPES.BIBLE]: {
    id: "bible",
    label: "Bible Lower Third",
    description: "Automated scripture popups with live verse, reference, and version",
    requiredFields: ["verseText", "reference"],
    fields: [
      { id: "verseText", label: "Verse Text", description: "The full scripture text passage", required: true },
      { id: "reference", label: "Scripture Reference", description: "Book, chapter, and verse (e.g., John 3:16)", required: true },
      { id: "version", label: "Translation / Version", description: "Bible version acronym (e.g., KJV, NIV)", required: false },
    ],
  },
  [ROLE_TYPES.ANNOUNCEMENT]: {
    id: "announcement",
    label: "Announcement Lower Third",
    description: "Event notices, welcome banners, and church news",
    requiredFields: ["heading"],
    fields: [
      { id: "heading", label: "Heading", description: "Main title or event name", required: true },
      { id: "message", label: "Message", description: "Details, time, or description", required: false },
      { id: "footer", label: "Optional Footer", description: "Website, date, or contact info", required: false },
    ],
  },
  [ROLE_TYPES.SPEAKER]: {
    id: "speaker",
    label: "Speaker / Name Lower Third",
    description: "Preacher, guest speaker, or minister title card",
    requiredFields: ["name"],
    fields: [
      { id: "name", label: "Speaker Name", description: "Full name of the speaker", required: true },
      { id: "title", label: "Role / Title", description: "Ministry title or role", required: false },
      { id: "organization", label: "Optional Organisation", description: "Church, ministry, or department", required: false },
    ],
  },
};

export const SAMPLE_ROLE_CONTENT = {
  [ROLE_TYPES.BIBLE]: {
    verseText: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
    reference: "John 3:16",
    version: "KJV",
  },
  [ROLE_TYPES.ANNOUNCEMENT]: {
    heading: "Sunday Worship Experience",
    message: "Join us this Sunday at 9:00 AM & 11:30 AM in the Sanctuary or online.",
    footer: "church.org/live • All are welcome",
  },
  [ROLE_TYPES.SPEAKER]: {
    name: "Pastor David O. Brown",
    title: "Senior Pastor",
    organization: "Grace Community Church",
  },
};

export const FIELD_ALIASES = {
  verseText: ["verseText", "verse", "text", "body", "scripture", "passageText"],
  reference: ["reference", "ref", "title", "passage", "bookVerse"],
  version: ["version", "translation"],
  heading: ["heading", "title", "name", "header"],
  message: ["message", "body", "description", "details"],
  footer: ["footer", "subtext", "caption"],
  name: ["name", "speakerName", "speaker", "person"],
  title: ["title", "role", "designation"],
  organization: ["organization", "organisation", "church", "ministry"],
};

export function normalizeFieldId(fieldId) {
  if (!fieldId || typeof fieldId !== "string") return fieldId;
  const lower = fieldId.trim().toLowerCase();
  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.some((a) => a.toLowerCase() === lower)) {
      return canonical;
    }
  }
  return fieldId;
}

/**
 * Validates whether a design template has the required bindings for a given role.
 * Supports calling as validateRoleTemplate(role, layers) or validateRoleTemplate(design).
 */
export function validateRoleTemplate(roleOrDesign, explicitLayers) {
  let role = roleOrDesign;
  let layers = explicitLayers;
  if (roleOrDesign && typeof roleOrDesign === "object") {
    role = roleOrDesign.role;
    layers = roleOrDesign.layers;
  }

  if (!role || role === ROLE_TYPES.CUSTOM) {
    return { valid: true, missingFields: [] };
  }

  const roleDef = ROLE_DEFINITIONS[role];
  if (!roleDef || !Array.isArray(roleDef.requiredFields) || roleDef.requiredFields.length === 0) {
    return { valid: true, missingFields: [] };
  }

  const boundFields = new Set();
  if (Array.isArray(layers)) {
    for (const layer of layers) {
      if (layer && layer.type === "text") {
        if (layer.fieldBinding || layer.roleBinding) {
          const binding = layer.fieldBinding || layer.roleBinding;
          const parts = binding.split(".");
          const rawField = parts.length === 2 ? parts[1] : parts[0];
          boundFields.add(rawField);
          boundFields.add(normalizeFieldId(rawField));
        }
        if (typeof layer.text === "string" && layer.text.includes("{{")) {
          const tokens = layer.text.match(/\{\{([^}]+)\}\}/g);
          if (tokens) {
            for (const token of tokens) {
              const key = token.replace(/\{\{|\}\}/g, "").trim();
              boundFields.add(key);
              boundFields.add(normalizeFieldId(key));
            }
          }
        }
        const nameKey = normalizeFieldId(layer.name);
        if (nameKey) {
          boundFields.add(nameKey);
        }
        const textKey = normalizeFieldId(layer.text);
        if (textKey) {
          boundFields.add(textKey);
        }
      }
    }
  }

  const missingFields = roleDef.requiredFields.filter((f) => !boundFields.has(f));
  if (missingFields.length > 0) {
    const missingLabels = missingFields.map((f) => {
      const match = roleDef.fields.find((df) => df.id === f);
      return match ? match.label : f;
    });
    return {
      valid: false,
      missingFields,
      message: `${roleDef.label} requires layers bound to: ${missingLabels.join(" and ")}.`,
    };
  }

  return { valid: true, missingFields: [] };
}

/**
 * Resolves a template's layers by substituting bound fields with concrete content.
 */
export function resolveTemplateLayers(templateOrLayers, role, content, sampleFallback = false) {
  const layers = Array.isArray(templateOrLayers) ? templateOrLayers : (templateOrLayers?.layers || []);
  const actualRole = (typeof role === "string" ? role : templateOrLayers?.role) || "custom";
  const actualContent = (typeof role === "object" && !Array.isArray(role) && !content) ? role : content;
  const sourceContent = actualContent || (sampleFallback ? SAMPLE_ROLE_CONTENT[actualRole] : {}) || {};

  const getFieldValue = (fieldKey) => {
    if (!fieldKey) return undefined;
    const canonical = normalizeFieldId(fieldKey);
    let val = sourceContent[fieldKey];
    if (val === undefined && canonical) {
      val = sourceContent[canonical];
    }
    if (val === undefined && FIELD_ALIASES[canonical]) {
      for (const alias of FIELD_ALIASES[canonical]) {
        if (sourceContent[alias] !== undefined) {
          val = sourceContent[alias];
          break;
        }
      }
    }
    if (val === undefined && sampleFallback && SAMPLE_ROLE_CONTENT[actualRole]) {
      val = SAMPLE_ROLE_CONTENT[actualRole][canonical] || SAMPLE_ROLE_CONTENT[actualRole][fieldKey];
    }
    return typeof val === "string" ? val : undefined;
  };

  return layers.map((layer) => {
    if (!layer) return layer;
    if (layer.maskImage) {
      layer = {
        ...layer,
        maskImage: {
          ...layer.maskImage,
          frameCrop: layer.maskImage.frameCrop ? { ...layer.maskImage.frameCrop } : undefined,
        },
      };
    }
    if (layer.type !== "text") {
      return { ...layer };
    }

    // 1. Explicit fieldBinding or roleBinding
    let targetField = layer.fieldBinding || layer.roleBinding;
    if (targetField) {
      const parts = targetField.split(".");
      const rawFieldId = parts.length === 2 ? parts[1] : parts[0];
      const val = getFieldValue(rawFieldId);
      if (val !== undefined && val.trim().length > 0) {
        return {
          ...layer,
          text: val,
          resolvedField: normalizeFieldId(rawFieldId),
          resolvedRole: actualRole,
        };
      }
    }

    // 2. Mustache replacement in layer.text
    if (typeof layer.text === "string" && layer.text.includes("{{")) {
      let updatedText = layer.text;
      const tokens = layer.text.match(/\{\{([^}]+)\}\}/g);
      if (tokens) {
        for (const token of tokens) {
          const key = token.replace(/\{\{|\}\}/g, "").trim();
          const val = getFieldValue(key);
          if (val !== undefined) {
            updatedText = updatedText.replace(token, val);
          }
        }
        return {
          ...layer,
          text: updatedText,
          resolvedField: "mustache",
          resolvedRole: actualRole,
        };
      }
    }

    // 3. Inferred binding by layer name or text
    const inferredKey = normalizeFieldId(layer.name) || normalizeFieldId(layer.text);
    if (inferredKey && ["verseText", "reference", "version", "heading", "message", "name", "title"].includes(inferredKey)) {
      const val = getFieldValue(inferredKey);
      if (val !== undefined && val.trim().length > 0) {
        return {
          ...layer,
          text: val,
          resolvedField: inferredKey,
          resolvedRole: actualRole,
        };
      }
    }

    return { ...layer };
  });
}

/**
 * Text-fit calculator for wrapping text within a bounding box and scaling font size down to minFontSize.
 */
export function fitTextToBoundingBox({
  text = "",
  boxWidthPx,
  boxHeightPx,
  initialFontSize = 24,
  minFontSize = 12,
  lineHeight = 1.3,
  measureTextFn,
}) {
  const words = (text || "").split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return { fontSize: initialFontSize, lines: [], pages: [[]] };
  }

  let currentFontSize = Math.max(minFontSize, initialFontSize);
  let bestLines = [];

  while (currentFontSize >= minFontSize) {
    const lines = [];
    let currentLine = "";

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      const width = measureTextFn(candidate, currentFontSize);
      if (width <= boxWidthPx) {
        currentLine = candidate;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);

    const totalHeight = lines.length * currentFontSize * lineHeight;
    if (totalHeight <= boxHeightPx || currentFontSize <= minFontSize) {
      bestLines = lines;
      break;
    }
    currentFontSize -= 1;
  }

  // Calculate pages if lines exceed available height even at minFontSize
  const maxLinesPerPage = Math.max(1, Math.floor(boxHeightPx / (currentFontSize * lineHeight)));
  const pages = [];
  for (let i = 0; i < bestLines.length; i += maxLinesPerPage) {
    pages.push(bestLines.slice(i, i + maxLinesPerPage));
  }

  return {
    fontSize: currentFontSize,
    lines: bestLines,
    pages,
    currentPageLines: pages[0] || [],
  };
}
