/**
 * FR-6.12 — Pairing code rate limiter.
 *
 * Limits 6-digit pairing code verification attempts per source IP to prevent
 * brute-force enumeration of the 6-digit code space (1,000,000 combinations).
 *
 * Policy (per PRD FR-6.12):
 *   - 5 failed attempts within a 60-second window → IP locked for 5 minutes
 *   - Lockouts are logged to the console (debug bar subscribes via IPC)
 *   - Successful auth immediately resets the IP's counter
 *   - In-memory only — resets on app restart (acceptable for local LAN use)
 *
 * Usage:
 *   const { PairingRateLimiter } = require('./rateLimiter');
 *   const limiter = new PairingRateLimiter();
 *
 *   // In socket.on('pair'):
 *   const check = limiter.check(socket.handshake.address);
 *   if (!check.allowed) {
 *     socket.emit('pair-result', { ok: false, error: check.reason, retryAfterMs: check.retryAfterMs });
 *     return;
 *   }
 *   if (authFailed) limiter.recordFailure(ip);
 *   else limiter.recordSuccess(ip);
 */
'use strict';

const MAX_ATTEMPTS = 5;          // failures before lockout
const WINDOW_MS = 60_000;        // sliding window (1 minute)
const LOCKOUT_MS = 5 * 60_000;  // lockout duration (5 minutes)

class PairingRateLimiter {
  constructor() {
    /**
     * @type {Map<string, { attempts: number[], lockedUntil: number }>}
     * Key: normalised IP string
     */
    this._state = new Map();
  }

  _normaliseIp(raw) {
    if (!raw) return 'unknown';
    // Strip IPv6 prefix from mapped IPv4 ("::ffff:192.168.1.1" → "192.168.1.1")
    return String(raw).replace(/^::ffff:/, '').trim();
  }

  _getEntry(ip) {
    if (!this._state.has(ip)) {
      this._state.set(ip, { attempts: [], lockedUntil: 0 });
    }
    return this._state.get(ip);
  }

  /**
   * Check whether a pairing attempt from this IP is allowed.
   *
   * @param {string} rawIp
   * @returns {{ allowed: boolean, reason?: string, retryAfterMs?: number }}
   */
  check(rawIp) {
    const ip = this._normaliseIp(rawIp);
    const entry = this._getEntry(ip);
    const now = Date.now();

    // Currently locked out?
    if (entry.lockedUntil > now) {
      const retryAfterMs = entry.lockedUntil - now;
      console.warn(`[Pairing] rate-limit: ${ip} locked for ${Math.ceil(retryAfterMs / 1000)}s more`);
      return {
        allowed: false,
        reason: 'too_many_attempts',
        retryAfterMs,
      };
    }

    // Prune stale attempts outside sliding window
    entry.attempts = entry.attempts.filter((t) => now - t < WINDOW_MS);

    if (entry.attempts.length >= MAX_ATTEMPTS) {
      // Exceeded window limit → lock
      entry.lockedUntil = now + LOCKOUT_MS;
      entry.attempts = [];
      console.warn(`[Pairing] rate-limit: ${ip} locked for ${LOCKOUT_MS / 1000}s (FR-6.12)`);
      return {
        allowed: false,
        reason: 'too_many_attempts',
        retryAfterMs: LOCKOUT_MS,
      };
    }

    return { allowed: true };
  }

  /**
   * Record a failed auth attempt from this IP.
   * @param {string} rawIp
   */
  recordFailure(rawIp) {
    const ip = this._normaliseIp(rawIp);
    const entry = this._getEntry(ip);
    entry.attempts.push(Date.now());
    console.log(`[Pairing] rate-limit: ${ip} failure #${entry.attempts.length}/${MAX_ATTEMPTS}`);
  }

  /**
   * Record a successful auth — resets the failure counter for this IP.
   * @param {string} rawIp
   */
  recordSuccess(rawIp) {
    const ip = this._normaliseIp(rawIp);
    const entry = this._getEntry(ip);
    entry.attempts = [];
    entry.lockedUntil = 0;
  }

  /**
   * Check if an IP is currently locked (without incrementing attempt counter).
   * @param {string} rawIp
   * @returns {boolean}
   */
  isLocked(rawIp) {
    const ip = this._normaliseIp(rawIp);
    const entry = this._state.get(ip);
    if (!entry) return false;
    return entry.lockedUntil > Date.now();
  }

  /**
   * Administratively clear a lockout (e.g. operator action from debug UI).
   * @param {string} rawIp
   */
  clear(rawIp) {
    const ip = this._normaliseIp(rawIp);
    this._state.delete(ip);
  }
}

module.exports = { PairingRateLimiter, MAX_ATTEMPTS, WINDOW_MS, LOCKOUT_MS };
