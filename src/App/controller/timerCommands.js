// All desktop timer shortcuts use the same controller actions as the timer page.
export function startTimer(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  window.dispatchEvent(new CustomEvent('ocs-timer-command', {
    detail: { type: 'set-timer', payload: { time: seconds } },
  }));
}

export function stopTimer() {
  window.dispatchEvent(new CustomEvent('ocs-timer-command', {
    detail: { type: 'stop-timer' },
  }));
}
