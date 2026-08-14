/**
 * Timer lifecycle EventEmitter — FR-5.9
 * Timer UI / Redux must emit events here (via IPC); Session Archive and future
 * features subscribe without hardcoding into TimerController.
 */
const { EventEmitter } = require('events');

const timerLifecycle = new EventEmitter();
timerLifecycle.setMaxListeners(20);

/** @typedef {'timer:started'|'timer:paused'|'timer:resumed'|'timer:completed'|'timer:stopped'|'timer:reset'|'timer:cancelled'} TimerLifecycleType */

/**
 * @param {{ type: TimerLifecycleType, timerId?: string|null, title?: string, durationSec?: number, elapsedSec?: number, category?: string, speakerName?: string }} event
 */
function emitTimerLifecycle(event) {
  if (!event || !event.type) return;
  const payload = {
    ...event,
    at: Date.now(),
  };
  console.log('[TimerLifecycle]', payload.type, payload.title || payload.timerId || '');
  timerLifecycle.emit('event', payload);
  timerLifecycle.emit(payload.type, payload);
}

module.exports = { timerLifecycle, emitTimerLifecycle };
