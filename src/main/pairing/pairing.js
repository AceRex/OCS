/**
 * Mobile pairing tokens (FR-6.10 / Phase 0).
 * Short-lived credential generated per app launch — embedded in QR + shown as 6-digit code.
 */
const crypto = require('crypto');

const PAIRED_SOCKETS = new Set(); // socket ids that have successfully paired this session

function generatePairing() {
  // 6-digit numeric code for manual entry (FR-6.2 / FR-6.10)
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  // Opaque token for QR payload (harder to guess than the code alone)
  const token = crypto.randomBytes(16).toString('hex');
  return {
    code,
    token,
    createdAt: Date.now(),
  };
}

/**
 * Build the QR payload string. Mobile app parses:
 *   ocs://pair?ip=...&port=4000&token=...&code=...&api=...
 */
function buildPairPayload({ ip, port, token, code, api = "https://ocs-backend-git-main-acerexs-projects.vercel.app/api" }) {
  return `ocs://pair?ip=${encodeURIComponent(ip)}&port=${port}&token=${encodeURIComponent(token)}&code=${encodeURIComponent(code)}&api=${encodeURIComponent(api)}`;
}

function clearPaired() {
  PAIRED_SOCKETS.clear();
}

function markPaired(socketId) {
  PAIRED_SOCKETS.add(socketId);
}

function unmarkPaired(socketId) {
  PAIRED_SOCKETS.delete(socketId);
}

function isPaired(socketId) {
  return PAIRED_SOCKETS.has(socketId);
}

/**
 * Validate an auth attempt against the current session pairing.
 * Accepts either the opaque token OR the 6-digit code.
 */
function validateCredential(pairing, credential) {
  if (!pairing || !credential) return false;
  const c = String(credential).trim();
  return c === pairing.token || c === pairing.code;
}

module.exports = {
  generatePairing,
  buildPairPayload,
  clearPaired,
  markPaired,
  unmarkPaired,
  isPaired,
  validateCredential,
};
