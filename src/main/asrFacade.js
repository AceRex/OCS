/**
 * BACKWARD-COMPAT SHIM — Phase 0 reorganisation.
 * main.js now imports from src/main/asr/asrFacade.js.
 * This shim re-exports everything so any older require() of this path keeps working.
 */
'use strict';
module.exports = require('./asr/asrFacade');
