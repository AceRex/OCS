'use strict';

// Preserve the existing 60 Hz speed while making playback independent of refresh rate.
function scrollDistance(speed, elapsedMs) {
  const multiplier = Number.isFinite(speed) ? Math.max(0, Math.min(4, speed)) : 1.5;
  return multiplier * 48 * Math.max(0, Math.min(100, Number(elapsedMs) || 0)) / 1000;
}

function ignoresPlaybackShortcut(event) {
  if (event.key === 'Escape') return false;
  return event.repeat || event.altKey || event.ctrlKey || event.metaKey ||
    !!event.target?.closest?.('input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="textbox"]');
}

function createTranscriptGate(windowMs = 120) {
  let previous = null;
  return (payload, now = Date.now()) => {
    const text = typeof payload === 'string' ? payload : payload?.text || payload?.partial || payload?.transcript;
    if (typeof text !== 'string' || !text.trim()) return null;
    const normalized = text.trim().replace(/\s+/g, ' ');
    const id = typeof payload === 'object' ? payload.utteranceId ?? payload.uttId ?? '' : '';
    if (previous && previous.text === normalized && previous.id === id && now - previous.time >= 0 && now - previous.time < windowMs) return null;
    previous = { text: normalized, id, time: now };
    return typeof payload === 'object' ? { ...payload, text: normalized } : { text: normalized };
  };
}

module.exports = { scrollDistance, ignoresPlaybackShortcut, createTranscriptGate };
