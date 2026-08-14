/**
 * Map audio encode sub-progress into the overall session finalize budget (0..32).
 *
 * Writing and encoding use FIXED phase bands so a large WebM write step count
 * cannot starve the encode phase (the "stuck at ~85%" bug).
 *
 * Bands (of 32):
 *   flushing   0–4   (archive)
 *   writing    4–12
 *   encoding  12–28
 *   pdf       28–31  (archive)
 *   done         32
 */
'use strict';

const WRITE_LO = 4;
const WRITE_HI = 12;
const ENCODE_LO = 12;
const ENCODE_HI = 28;
const OVERALL_TOTAL = 32;

/**
 * @param {{ phase: string, phaseRatio?: number, percent?: number, current?: number, total?: number }} p
 * @returns {{ current: number, total: number, percent: number, phase: string }}
 */
function mapAudioProgressToOverall(p) {
  const phase = p?.phase || 'writing';
  let ratio = typeof p.phaseRatio === 'number' ? p.phaseRatio : null;
  if (ratio == null && typeof p.percent === 'number') {
    // Legacy: audio percent is whole-audio 0–100; prefer phaseRatio from sessionAudio
    ratio = Math.max(0, Math.min(1, p.percent / 100));
  }
  if (ratio == null && p.total > 0) {
    ratio = Math.max(0, Math.min(1, (p.current || 0) / p.total));
  }
  if (ratio == null) ratio = 0;
  ratio = Math.max(0, Math.min(1, ratio));

  let lo = WRITE_LO;
  let hi = WRITE_HI;
  let uiPhase = 'writing';
  if (phase === 'encoding') {
    lo = ENCODE_LO;
    hi = ENCODE_HI;
    uiPhase = 'encoding';
  } else if (phase === 'done') {
    return {
      phase: 'writing',
      current: ENCODE_HI,
      total: OVERALL_TOTAL,
      percent: Math.round((ENCODE_HI / OVERALL_TOTAL) * 100),
    };
  } else if (phase === 'writing') {
    lo = WRITE_LO;
    hi = WRITE_HI;
    uiPhase = 'writing';
  }

  const current = lo + Math.round(ratio * (hi - lo));
  return {
    phase: uiPhase,
    current: Math.min(hi, Math.max(lo, current)),
    total: OVERALL_TOTAL,
    percent: Math.round((Math.min(hi, Math.max(lo, current)) / OVERALL_TOTAL) * 100),
  };
}

module.exports = {
  mapAudioProgressToOverall,
  WRITE_LO,
  WRITE_HI,
  ENCODE_LO,
  ENCODE_HI,
  OVERALL_TOTAL,
};
