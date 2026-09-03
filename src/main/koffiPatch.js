/**
 * koffiPatch.js
 *
 * Ensures koffi.opaque is safely idempotent across reloads, multiple requires,
 * and background workers. Without this, calling require('vosk-koffi') multiple
 * times throws: [ERROR] Duplicate type name 'VoskModel'
 */

try {
  const koffi = require('koffi');
  if (koffi && typeof koffi.opaque === 'function' && !koffi.__idempotentPatched) {
    const origOpaque = koffi.opaque;
    koffi.opaque = function (name) {
      try {
        return koffi.resolve(name);
      } catch (_) {
        return origOpaque.call(this, name);
      }
    };
    koffi.__idempotentPatched = true;
  }
} catch (_) {
  // koffi not present or optional in this context
}

module.exports = {};
