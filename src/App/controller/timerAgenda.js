/** Build execution sessions from the visible timer list, preserving cues by ID. */
function buildTimerAgenda(items, loadedAgenda, intervalSec = 0) {
  return {
    ...(loadedAgenda || {}),
    id: loadedAgenda?.id || 'manual-timer-list',
    name: loadedAgenda?.name || 'Timer sessions',
    assets: loadedAgenda?.assets || [],
    sessions: items.map((item) => {
      const session = loadedAgenda?.sessions?.find((s) => s.id === item._id);
      return {
        ...(session || {}),
        id: item._id,
        name: item.agenda || 'Session',
        person: item.anchor || session?.person || '',
        durationSec: Number(item.time) || 0,
        timelineItems: session?.timelineItems || [],
        transitionMode: session?.transitionMode || 'auto',
        intervalSec: session?.intervalSec ?? intervalSec,
      };
    }),
  };
}

module.exports = { buildTimerAgenda };
