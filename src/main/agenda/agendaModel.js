/**
 * wave.io Agenda Document Schema, Validation, Math & Migration Model
 * 
 * Strict Universal 12px Border Radius & Monotonic Timing compliance.
 */
/**
 * Generates an environment-agnostic unique ID
 */
function generateId(prefix = 'id') {
  const now = Date.now();
  const rand = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${now}_${rand}`;
}

/**
 * Creates a blank, valid agenda document
 */
function createEmptyAgenda(name = 'New Service Agenda') {
  const now = Date.now();
  return {
    id: generateId('agenda'),
    name,
    version: 1,
    createdAt: now,
    updatedAt: now,
    defaultDestination: 'all', // 'all' | 'general' | 'speaker'
    defaultMediaEndBehavior: 'hold', // 'hold' | 'restore' | 'continue'
    sessions: [],
    assets: [],
  };
}

/**
 * Creates a blank, valid session with structured duration and optional person/presenter
 */
function createEmptySession(name = 'New Session', durationSec = 300, person = '') {
  return {
    id: generateId('sess'),
    name,
    person: typeof person === 'string' ? person : '',
    durationSec: Math.max(1, Number(durationSec) || 300),
    notes: '',
    transitionMode: 'manual', // 'auto' | 'manual'
    intervalSec: 0,           // Countdown pause before next session starts (seconds)
    targetDestination: 'all',  // 'all' | 'general' | 'speaker'
    mediaEndBehavior: 'hold',  // 'hold' | 'restore' | 'continue'
    recordSession: false,      // 'Record this session' toggle (default: false)
    timelineItems: [],
  };
}

/**
 * Creates a timeline item (point action or duration-based clip)
 * Supports unified 'media' track containing image, video, audio, and solid color cues.
 */
function createTimelineItem(props = {}) {
  const {
    id,
    track = 'media', // 'media' (unified track, accepts legacy 'visual' | 'audio' | 'background' | 'video')
    actionType = 'range', // 'point' | 'range'
    mediaType,  // 'image' | 'video' | 'audio' | 'color'
    presentationMode, // 'background' | 'foreground' | 'audio'
    laneIndex,
    startSec = 0,
    durationSec = 60,
    sourceInSec = 0,
    sourceOutSec = null,
    assetId = '',
    name = '',
    destination = 'all',
    endBehavior = 'hold',
    color = '#000000',
    stopAtClipBoundary = true,
    stopAtSessionBoundary = true,
    fit = 'cover',
    placement = 'center',
    zoom = 1,
    panX = 0,
    panY = 0,
    volume = 1.0,
    loop = false,
    muted = false,
    footageExceededBehavior = 'loop',
    ...rest
  } = props;

  const isAudioFile = (name && /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(name)) || track === 'audio';
  const isVideoFile = (name && /\.(mp4|mov|webm|mkv|avi)$/i.test(name)) || track === 'video';

  const inferredMediaType = mediaType || (isAudioFile ? 'audio' : isVideoFile ? 'video' : 'image');
  const inferredPresMode = presentationMode || (inferredMediaType === 'audio' ? 'audio' : inferredMediaType === 'video' ? 'foreground' : 'background');
  const inferredLaneIndex = laneIndex !== undefined && laneIndex !== null ? Number(laneIndex) : (inferredMediaType === 'audio' ? 1 : 0);

  return {
    id: id || generateId('cue'),
    track: 'media',
    mediaType: inferredMediaType,
    presentationMode: inferredPresMode,
    laneIndex: inferredLaneIndex,
    actionType: (inferredMediaType === 'color' && !assetId && !rest.url && !rest.localFileUrl) ? 'point' : actionType,
    startSec: Math.max(0, Number(startSec) || 0),
    durationSec: Math.max(1, Number(durationSec) || 1),
    sourceInSec: Math.max(0, Number(sourceInSec) || 0),
    sourceOutSec: sourceOutSec !== null && sourceOutSec !== undefined ? Math.max(0, Number(sourceOutSec)) : null,
    assetId: assetId || '',
    name: name || (inferredMediaType === 'audio' ? 'Play Audio' : inferredMediaType === 'video' ? 'Play Video' : 'Display Image'),
    destination,
    endBehavior,
    color: color || '#000000',
    stopAtClipBoundary: stopAtClipBoundary !== false,
    stopAtSessionBoundary: stopAtSessionBoundary !== false,
    fit,
    placement,
    zoom,
    panX,
    panY,
    volume,
    loop,
    muted,
    footageExceededBehavior,
    ...rest,
  };
}

/**
 * Formats seconds into HH:MM:SS
 */
function formatDuration(totalSeconds) {
  const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * Parses structured time object { hours, minutes, seconds } into total seconds
 */
function toTotalSeconds({ hours = 0, minutes = 0, seconds = 0 }) {
  const h = Math.max(0, parseInt(hours, 10) || 0);
  const m = Math.max(0, parseInt(minutes, 10) || 0);
  const s = Math.max(0, parseInt(seconds, 10) || 0);
  return h * 3600 + m * 60 + s;
}

/**
 * Converts total seconds into structured { hours, minutes, seconds }
 */
function toTimeParts(totalSeconds) {
  const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  return {
    hours: Math.floor(sec / 3600),
    minutes: Math.floor((sec % 3600) / 60),
    seconds: sec % 60,
  };
}

/**
 * Calculates total planned runtime including intervals across all sessions
 */
function calculateAgendaSummary(agenda) {
  if (!agenda || !Array.isArray(agenda.sessions)) {
    return {
      sessionCount: 0,
      totalSessionSec: 0,
      totalIntervalSec: 0,
      totalEventSec: 0,
      mediaCount: 0,
      totalAssetBytes: 0,
    };
  }

  let totalSessionSec = 0;
  let totalIntervalSec = 0;
  let mediaCount = 0;

  agenda.sessions.forEach((sess, idx) => {
    totalSessionSec += Number(sess.durationSec) || 0;
    // Interval applies between sessions (usually all except after the very last session if 0)
    totalIntervalSec += Number(sess.intervalSec) || 0;
    if (Array.isArray(sess.timelineItems)) {
      mediaCount += sess.timelineItems.length;
    }
  });

  const totalAssetBytes = (agenda.assets || []).reduce(
    (sum, a) => sum + (Number(a.size) || 0),
    0
  );

  return {
    sessionCount: agenda.sessions.length,
    totalSessionSec,
    totalIntervalSec,
    totalEventSec: totalSessionSec + totalIntervalSec,
    mediaCount,
    totalAssetBytes,
    formattedTotalTime: formatDuration(totalSessionSec + totalIntervalSec),
  };
}

/**
 * Detects overlapping visual clips or audio clips within a session
 * Rule: At most 1 active visual clip and 1 agenda audio clip at a time.
 */
function detectTimelineConflicts(session) {
  if (!session || !Array.isArray(session.timelineItems)) return [];

  const conflicts = [];
  const tracks = ['visual', 'audio'];

  tracks.forEach((track) => {
    // Include both unified 'visual' and legacy 'video'/'background' items
    const rawItems = session.timelineItems
      .filter((i) => {
        const isVisual = (i.track === 'visual' || i.track === 'video' || i.track === 'background');
        if (track === 'visual') return isVisual && (i.actionType === 'range' || (i.durationSec && i.durationSec > 0));
        return i.track === 'audio' && (i.actionType === 'range' || (i.durationSec && i.durationSec > 0));
      })
      .sort((a, b) => a.startSec - b.startSec);

    // Filter duplicate IDs if any
    const items = [];
    const seen = new Set();
    for (const it of rawItems) {
      if (!seen.has(it.id)) {
        seen.add(it.id);
        items.push(it);
      }
    }

    for (let i = 0; i < items.length - 1; i++) {
      const cur = items[i];
      const curEnd = cur.startSec + (cur.durationSec || 60);
      const next = items[i + 1];

      if (curEnd > next.startSec) {
        const overlapSec = curEnd - next.startSec;
        conflicts.push({
          id: `conflict_${cur.id}_${next.id}`,
          track,
          itemA: cur,
          itemB: next,
          overlapSec,
          description: `Two ${track} clips overlap by ${overlapSec}s ("${cur.name}" and "${next.name}")`,
          resolutions: [
            {
              type: 'trim_prev',
              label: `Trim "${cur.name}" end to ${formatDuration(next.startSec)}`,
            },
            {
              type: 'shift_next',
              label: `Shift "${next.name}" start to ${formatDuration(curEnd)}`,
            },
            {
              type: 'remove_prev',
              label: `Remove "${cur.name}"`,
            },
          ],
        });
      }
    }
  });

  return conflicts;
}

/**
 * Auto-resolves a detected timeline conflict
 */
function resolveTimelineConflict(session, conflictId, resolutionType) {
  if (!session || !Array.isArray(session.timelineItems)) return session;
  const conflicts = detectTimelineConflicts(session);
  const target = conflicts.find((c) => c.id === conflictId);
  if (!target) return session;

  const newItems = [...session.timelineItems];
  const idxA = newItems.findIndex((i) => i.id === target.itemA.id);
  const idxB = newItems.findIndex((i) => i.id === target.itemB.id);

  if (resolutionType === 'trim_prev' && idxA !== -1) {
    const newDur = Math.max(1, target.itemB.startSec - target.itemA.startSec);
    newItems[idxA] = { ...newItems[idxA], durationSec: newDur };
  } else if (resolutionType === 'shift_next' && idxB !== -1) {
    const newStart = target.itemA.startSec + target.itemA.durationSec;
    newItems[idxB] = { ...newItems[idxB], startSec: newStart };
  } else if (resolutionType === 'remove_prev' && idxA !== -1) {
    newItems.splice(idxA, 1);
  }

  return {
    ...session,
    timelineItems: newItems,
  };
}

/**
 * Validates an agenda document structure and asset integrity
 */
function validateAgendaDocument(agenda) {
  const errors = [];
  const warnings = [];

  if (!agenda || typeof agenda !== 'object') {
    return { valid: false, errors: ['Invalid or missing agenda document'], warnings: [] };
  }

  if (!agenda.id || typeof agenda.id !== 'string') errors.push('Agenda must have a valid string ID');
  if (!agenda.name || typeof agenda.name !== 'string') errors.push('Agenda must have a name');
  if (!Array.isArray(agenda.sessions)) errors.push('Agenda must contain a sessions array');

  const assetMap = new Map((agenda.assets || []).map((a) => [a.id, a]));

  (agenda.sessions || []).forEach((sess, sIdx) => {
    if (!sess.id) errors.push(`Session at index ${sIdx} missing ID`);
    if (!sess.name) warnings.push(`Session at index ${sIdx} has no title`);
    if (typeof sess.durationSec !== 'number' || sess.durationSec <= 0) {
      errors.push(`Session "${sess.name || sIdx}" must have durationSec > 0`);
    }

    const conflicts = detectTimelineConflicts(sess);
    if (conflicts.length > 0) {
      warnings.push(
        ...conflicts.map(
          (c) => `Session "${sess.name}": Overlapping ${c.track} clips (${c.overlapSec}s)`
        )
      );
    }

    (sess.timelineItems || []).forEach((cue, cIdx) => {
      if (cue.assetId && !assetMap.has(cue.assetId)) {
        warnings.push(
          `Session "${sess.name}", cue "${cue.name}": Asset ID "${cue.assetId}" not found in agenda asset list`
        );
      }
      if (cue.startSec > sess.durationSec) {
        warnings.push(
          `Session "${sess.name}", cue "${cue.name}": Starts at ${formatDuration(cue.startSec)}, after session duration ${formatDuration(sess.durationSec)}`
        );
      }
    });
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
/**
 * Generates the next sequential agenda name ("Agenda 1", "Agenda 2", etc.)
 * avoiding existing names.
 */
function generateSequentialAgendaName(existingAgendas = []) {
  if (!Array.isArray(existingAgendas) || existingAgendas.length === 0) {
    return 'Agenda 1';
  }

  const usedNumbers = new Set();
  const regex = /^agenda\s+(\d+)$/i;

  for (const doc of existingAgendas) {
    if (doc && typeof doc.name === 'string') {
      const match = doc.name.trim().match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > 0) usedNumbers.add(num);
      }
    }
  }

  let nextNum = 1;
  while (usedNumbers.has(nextNum)) {
    nextNum++;
  }

  return `Agenda ${nextNum}`;
}

/**
 * Migrates legacy Redux agenda items ({ _id, time, agenda, anchor })
 * into a rich AgendaDocument.
 */
function migrateLegacyAgenda(legacyList, defaultName = 'Migrated Service') {
  const agenda = createEmptyAgenda(defaultName);

  if (!Array.isArray(legacyList) || legacyList.length === 0) {
    // Start with ZERO sessions - do not automatically recreate deleted or example sessions
    agenda.sessions = [];
    return agenda;
  }

  agenda.sessions = legacyList.map((item, idx) => {
    const durSec = Math.max(60, Number(item.time) || 300);
    const session = createEmptySession(item.agenda || `Session ${idx + 1}`, durSec, item.anchor || '');
    if (item.anchor) {
      session.notes = `Anchor / Leader: ${item.anchor}`;
    }
    return session;
  });

  agenda.updatedAt = Date.now();
  return agenda;
}

/**
 * Migrates existing agenda documents with separate 'background', 'video', 'audio', or 'visual' tracks
 * into one single unified 'media' track. Preserves all timings, assets, destinations,
 * playback settings, and session presenters.
 */
function migrateToSingleUnifiedTrack(agenda) {
  if (!agenda || !Array.isArray(agenda.sessions)) return agenda;

  const migrated = JSON.parse(JSON.stringify(agenda));
  migrated.sessions.forEach((sess) => {
    if (sess.recordSession === undefined) {
      sess.recordSession = false;
    }
    if (sess.person === undefined) {
      sess.person = sess.speakerName || sess.anchor || '';
    }

    if (Array.isArray(sess.timelineItems)) {
      sess.timelineItems = sess.timelineItems.map((item) => {
        const isAudio = item.track === 'audio' || item.mediaType === 'audio' || (item.name && /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(item.name));
        const isVideo = !isAudio && (item.track === 'video' || item.assetType === 'video' || (item.name && /\.(mp4|mov|webm|mkv|avi)$/i.test(item.name)));
        const mediaType = isAudio ? 'audio' : isVideo ? 'video' : (item.mediaType || 'image');
        const presentationMode = isAudio ? 'audio' : (item.presentationMode || (isVideo ? 'foreground' : 'background'));
        let laneIndex = item.laneIndex !== undefined && item.laneIndex !== null ? Number(item.laneIndex) : (isAudio ? 1 : 0);
        if (isAudio && (item.track === 'audio' || laneIndex === 0)) {
          laneIndex = 1;
        }

        return {
          ...item,
          track: 'media',
          mediaType,
          presentationMode,
          laneIndex,
        };
      });

      // Sort timeline items chronologically
      sess.timelineItems.sort((a, b) => a.startSec - b.startSec);
    }
  });

  migrated.version = Math.max(migrated.version || 1, 3);
  migrated.updatedAt = Date.now();
  return migrated;
}

const migrateToUnifiedVisualTrack = migrateToSingleUnifiedTrack;

module.exports = {
  createEmptyAgenda,
  createEmptySession,
  createTimelineItem,
  formatDuration,
  toTotalSeconds,
  toTimeParts,
  calculateAgendaSummary,
  detectTimelineConflicts,
  resolveTimelineConflict,
  validateAgendaDocument,
  migrateLegacyAgenda,
  migrateToSingleUnifiedTrack,
  migrateToUnifiedVisualTrack,
  generateSequentialAgendaName,
};

