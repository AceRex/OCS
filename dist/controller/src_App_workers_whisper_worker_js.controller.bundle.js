/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "./src/App/workers/whisper.worker.js"
/*!*******************************************!*\
  !*** ./src/App/workers/whisper.worker.js ***!
  \*******************************************/
(__unused_webpack_module, __unused_webpack_exports, __webpack_require__) {

"use strict";
eval("{\n\nvar _transformers = __webpack_require__(/*! @xenova/transformers */ \"./node_modules/@xenova/transformers/src/transformers.js\");\nfunction asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }\nfunction _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, \"next\", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, \"throw\", n); } _next(void 0); }); }; }\n// Skip local model checks since we are in a web worker environment\n_transformers.env.allowLocalModels = false;\nvar transcriber = null;\nfunction initTranscriber() {\n  return _initTranscriber.apply(this, arguments);\n} // Always peak-normalize so Whisper receives a consistent ~0.9 peak signal\nfunction _initTranscriber() {\n  _initTranscriber = _asyncToGenerator(function* () {\n    if (transcriber === null) {\n      // whisper-base.en gives far better accuracy on proper nouns (Bible books)\n      // while still being fast enough for real-time use\n      transcriber = yield (0, _transformers.pipeline)('automatic-speech-recognition', 'Xenova/whisper-base.en', {\n        quantized: true,\n        progress_callback: p => {\n          if (p.status === 'progress') {\n            self.postMessage({\n              status: 'progress',\n              progress: p.progress\n            });\n          }\n        }\n      });\n    }\n    return transcriber;\n  });\n  return _initTranscriber.apply(this, arguments);\n}\nfunction normalizeAudio(audio) {\n  var max = 0;\n  for (var i = 0; i < audio.length; ++i) {\n    max = Math.max(max, Math.abs(audio[i]));\n  }\n  if (max > 0.01) {\n    // Only normalize non-silent audio\n    var gain = 0.9 / max;\n    for (var _i = 0; _i < audio.length; ++_i) {\n      // Clamp to [-1, 1] to avoid distortion after gain\n      audio[_i] = Math.max(-1, Math.min(1, audio[_i] * gain));\n    }\n  }\n  return audio;\n}\nself.onmessage = /*#__PURE__*/function () {\n  var _ref = _asyncToGenerator(function* (event) {\n    var message = event.data;\n    if (message.type === 'init') {\n      try {\n        yield initTranscriber();\n        self.postMessage({\n          status: 'ready'\n        });\n      } catch (e) {\n        self.postMessage({\n          status: 'error',\n          error: e.message\n        });\n      }\n    } else if (message.type === 'probe') {\n      // Lightweight keyword scan while user is still speaking.\n      // Runs in ~100-150ms on 2s audio — intentionally minimal prompt.\n      try {\n        var tc = transcriber; // Don't block on init; if not ready, skip.\n        if (!tc) {\n          self.postMessage({\n            status: 'probe_result',\n            hasKeyword: false,\n            text: ''\n          });\n          return;\n        }\n        var probeAudio = normalizeAudio(message.audio);\n        var result = yield tc(probeAudio, {\n          language: 'english',\n          task: 'transcribe',\n          return_timestamps: false,\n          initial_prompt: 'Media. Meeting. Video. Meter.'\n        });\n        var text = (result.text || '').toLowerCase();\n        var TRIGGERS = ['media', 'meeting', 'meter', 'medium', 'video', 'median', 'me the', 'need a', 'meet a'];\n        var hasKeyword = TRIGGERS.some(kw => text.includes(kw));\n        self.postMessage({\n          status: 'probe_result',\n          hasKeyword,\n          text: result.text || ''\n        });\n      } catch (e) {\n        // Probe failure is silent — falls back to normal VAD detection\n        self.postMessage({\n          status: 'probe_result',\n          hasKeyword: false,\n          text: ''\n        });\n      }\n    } else if (message.type === 'transcribe') {\n      try {\n        var _transcriber = yield initTranscriber();\n\n        // Normalize audio before inference to help Whisper hear better\n        var max = 0;\n        for (var i = 0; i < message.audio.length; i++) {\n          max = Math.max(max, Math.abs(message.audio[i]));\n        }\n        var durationSec = message.audio.length / 16000;\n\n        // Log diagnostics to hidden console\n        console.log(\"[WORKER] Transcribing: vol=\".concat(max.toFixed(4), \", dur=\").concat(durationSec.toFixed(1), \"s\"));\n        var normalizedAudio = normalizeAudio(message.audio);\n\n        // Build an initial_prompt to heavily bias the decoder toward:\n        // - The \"Media\" trigger keyword\n        // - Common Bible book names and navigation words\n        // This dramatically improves recognition of proper nouns.\n        var biblePrompt = message.prompt ? \"Media. \".concat(message.prompt) : 'Media. Genesis Exodus Leviticus Numbers Deuteronomy Joshua Judges Ruth Samuel Kings Chronicles Ezra Nehemiah Esther Job Psalms Proverbs Ecclesiastes Isaiah Jeremiah Ezekiel Daniel Hosea Amos Obadiah Jonah Micah Nahum Habakkuk Zephaniah Haggai Zechariah Malachi Matthew Mark Luke John Romans Corinthians Galatians Ephesians Philippians Colossians Thessalonians Timothy Titus Philemon Hebrews James Peter Revelation. Chapter verse highlight next previous.';\n        var _result = yield _transcriber(normalizedAudio, {\n          chunk_length_s: 30,\n          stride_length_s: 5,\n          language: 'english',\n          task: 'transcribe',\n          return_timestamps: false,\n          // initial_prompt biases the decoder without forcing specific tokens\n          initial_prompt: biblePrompt\n        });\n        self.postMessage({\n          status: 'result',\n          text: _result.text,\n          debug: {\n            vol: max,\n            duration: durationSec\n          }\n        });\n      } catch (error) {\n        self.postMessage({\n          status: 'error',\n          error: error.message\n        });\n      }\n    }\n  });\n  return function (_x) {\n    return _ref.apply(this, arguments);\n  };\n}();\n\n//# sourceURL=webpack://ocs/./src/App/workers/whisper.worker.js?\n}");

/***/ },

/***/ "?0740"
/*!***********************!*\
  !*** sharp (ignored) ***!
  \***********************/
() {

eval("{/* (ignored) */\n\n//# sourceURL=webpack://ocs/sharp_(ignored)?\n}");

/***/ },

/***/ "?0a40"
/*!********************!*\
  !*** fs (ignored) ***!
  \********************/
() {

eval("{/* (ignored) */\n\n//# sourceURL=webpack://ocs/fs_(ignored)?\n}");

/***/ },

/***/ "?0a9a"
/*!********************!*\
  !*** fs (ignored) ***!
  \********************/
() {

eval("{/* (ignored) */\n\n//# sourceURL=webpack://ocs/fs_(ignored)?\n}");

/***/ },

/***/ "?2ca1"
/*!**********************************!*\
  !*** onnxruntime-node (ignored) ***!
  \**********************************/
() {

eval("{/* (ignored) */\n\n//# sourceURL=webpack://ocs/onnxruntime-node_(ignored)?\n}");

/***/ },

/***/ "?61c2"
/*!**********************!*\
  !*** path (ignored) ***!
  \**********************/
() {

eval("{/* (ignored) */\n\n//# sourceURL=webpack://ocs/path_(ignored)?\n}");

/***/ },

/***/ "?73ea"
/*!**********************!*\
  !*** path (ignored) ***!
  \**********************/
() {

eval("{/* (ignored) */\n\n//# sourceURL=webpack://ocs/path_(ignored)?\n}");

/***/ },

/***/ "?845f"
/*!*********************!*\
  !*** url (ignored) ***!
  \*********************/
() {

eval("{/* (ignored) */\n\n//# sourceURL=webpack://ocs/url_(ignored)?\n}");

/***/ }

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Check if module exists (development only)
/******/ 		if (__webpack_modules__[moduleId] === undefined) {
/******/ 			var e = new Error("Cannot find module '" + moduleId + "'");
/******/ 			e.code = 'MODULE_NOT_FOUND';
/******/ 			throw e;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = __webpack_modules__;
/******/ 	
/******/ 	// the startup function
/******/ 	__webpack_require__.x = () => {
/******/ 		// Load entry module and return exports
/******/ 		// This entry module depends on other loaded chunks and execution need to be delayed
/******/ 		var __webpack_exports__ = __webpack_require__.O(undefined, ["vendors-node_modules_xenova_transformers_src_models_js-node_modules_xenova_transformers_src_t-98979f"], () => (__webpack_require__("./src/App/workers/whisper.worker.js")))
/******/ 		__webpack_exports__ = __webpack_require__.O(__webpack_exports__);
/******/ 		return __webpack_exports__;
/******/ 	};
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/chunk loaded */
/******/ 	(() => {
/******/ 		var deferred = [];
/******/ 		__webpack_require__.O = (result, chunkIds, fn, priority) => {
/******/ 			if(chunkIds) {
/******/ 				priority = priority || 0;
/******/ 				for(var i = deferred.length; i > 0 && deferred[i - 1][2] > priority; i--) deferred[i] = deferred[i - 1];
/******/ 				deferred[i] = [chunkIds, fn, priority];
/******/ 				return;
/******/ 			}
/******/ 			var notFulfilled = Infinity;
/******/ 			for (var i = 0; i < deferred.length; i++) {
/******/ 				var [chunkIds, fn, priority] = deferred[i];
/******/ 				var fulfilled = true;
/******/ 				for (var j = 0; j < chunkIds.length; j++) {
/******/ 					if ((priority & 1 === 0 || notFulfilled >= priority) && Object.keys(__webpack_require__.O).every((key) => (__webpack_require__.O[key](chunkIds[j])))) {
/******/ 						chunkIds.splice(j--, 1);
/******/ 					} else {
/******/ 						fulfilled = false;
/******/ 						if(priority < notFulfilled) notFulfilled = priority;
/******/ 					}
/******/ 				}
/******/ 				if(fulfilled) {
/******/ 					deferred.splice(i--, 1)
/******/ 					var r = fn();
/******/ 					if (r !== undefined) result = r;
/******/ 				}
/******/ 			}
/******/ 			return result;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/create fake namespace object */
/******/ 	(() => {
/******/ 		var getProto = Object.getPrototypeOf ? (obj) => (Object.getPrototypeOf(obj)) : (obj) => (obj.__proto__);
/******/ 		var leafPrototypes;
/******/ 		// create a fake namespace object
/******/ 		// mode & 1: value is a module id, require it
/******/ 		// mode & 2: merge all properties of value into the ns
/******/ 		// mode & 4: return value when already ns object
/******/ 		// mode & 16: return value when it's Promise-like
/******/ 		// mode & 8|1: behave like require
/******/ 		__webpack_require__.t = function(value, mode) {
/******/ 			if(mode & 1) value = this(value);
/******/ 			if(mode & 8) return value;
/******/ 			if(typeof value === 'object' && value) {
/******/ 				if((mode & 4) && value.__esModule) return value;
/******/ 				if((mode & 16) && typeof value.then === 'function') return value;
/******/ 			}
/******/ 			var ns = Object.create(null);
/******/ 			__webpack_require__.r(ns);
/******/ 			var def = {};
/******/ 			leafPrototypes = leafPrototypes || [null, getProto({}), getProto([]), getProto(getProto)];
/******/ 			for(var current = mode & 2 && value; (typeof current == 'object' || typeof current == 'function') && !~leafPrototypes.indexOf(current); current = getProto(current)) {
/******/ 				Object.getOwnPropertyNames(current).forEach((key) => (def[key] = () => (value[key])));
/******/ 			}
/******/ 			def['default'] = () => (value);
/******/ 			__webpack_require__.d(ns, def);
/******/ 			return ns;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/ensure chunk */
/******/ 	(() => {
/******/ 		__webpack_require__.f = {};
/******/ 		// This file contains only the entry chunk.
/******/ 		// The chunk loading function for additional chunks
/******/ 		__webpack_require__.e = (chunkId) => {
/******/ 			return Promise.all(Object.keys(__webpack_require__.f).reduce((promises, key) => {
/******/ 				__webpack_require__.f[key](chunkId, promises);
/******/ 				return promises;
/******/ 			}, []));
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/get javascript chunk filename */
/******/ 	(() => {
/******/ 		// This function allow to reference async chunks and chunks that the entrypoint depends on
/******/ 		__webpack_require__.u = (chunkId) => {
/******/ 			// return url for filenames based on template
/******/ 			return "" + chunkId + ".controller.bundle.js";
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/global */
/******/ 	(() => {
/******/ 		__webpack_require__.g = (function() {
/******/ 			if (typeof globalThis === 'object') return globalThis;
/******/ 			try {
/******/ 				return this || new Function('return this')();
/******/ 			} catch (e) {
/******/ 				if (typeof window === 'object') return window;
/******/ 			}
/******/ 		})();
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/publicPath */
/******/ 	(() => {
/******/ 		var scriptUrl;
/******/ 		if (__webpack_require__.g.importScripts) scriptUrl = __webpack_require__.g.location + "";
/******/ 		var document = __webpack_require__.g.document;
/******/ 		if (!scriptUrl && document) {
/******/ 			if (document.currentScript && document.currentScript.tagName.toUpperCase() === 'SCRIPT')
/******/ 				scriptUrl = document.currentScript.src;
/******/ 			if (!scriptUrl) {
/******/ 				var scripts = document.getElementsByTagName("script");
/******/ 				if(scripts.length) {
/******/ 					var i = scripts.length - 1;
/******/ 					while (i > -1 && (!scriptUrl || !/^http(s?):/.test(scriptUrl))) scriptUrl = scripts[i--].src;
/******/ 				}
/******/ 			}
/******/ 		}
/******/ 		// When supporting browsers where an automatic publicPath is not supported you must specify an output.publicPath manually via configuration
/******/ 		// or pass an empty string ("") and set the __webpack_public_path__ variable from your code to use your own logic.
/******/ 		if (!scriptUrl) throw new Error("Automatic publicPath is not supported in this browser");
/******/ 		scriptUrl = scriptUrl.replace(/^blob:/, "").replace(/#.*$/, "").replace(/\?.*$/, "").replace(/\/[^\/]+$/, "/");
/******/ 		__webpack_require__.p = scriptUrl;
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/importScripts chunk loading */
/******/ 	(() => {
/******/ 		// no baseURI
/******/ 		
/******/ 		// object to store loaded chunks
/******/ 		// "1" means "already loaded"
/******/ 		var installedChunks = {
/******/ 			"src_App_workers_whisper_worker_js": 1
/******/ 		};
/******/ 		
/******/ 		// importScripts chunk loading
/******/ 		var installChunk = (data) => {
/******/ 			var [chunkIds, moreModules, runtime] = data;
/******/ 			for(var moduleId in moreModules) {
/******/ 				if(__webpack_require__.o(moreModules, moduleId)) {
/******/ 					__webpack_require__.m[moduleId] = moreModules[moduleId];
/******/ 				}
/******/ 			}
/******/ 			if(runtime) runtime(__webpack_require__);
/******/ 			while(chunkIds.length)
/******/ 				installedChunks[chunkIds.pop()] = 1;
/******/ 			parentChunkLoadingFunction(data);
/******/ 		};
/******/ 		__webpack_require__.f.i = (chunkId, promises) => {
/******/ 			// "1" is the signal for "already loaded"
/******/ 			if(!installedChunks[chunkId]) {
/******/ 				if(true) { // all chunks have JS
/******/ 					importScripts(__webpack_require__.p + __webpack_require__.u(chunkId));
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 		
/******/ 		var chunkLoadingGlobal = self["webpackChunkocs"] = self["webpackChunkocs"] || [];
/******/ 		var parentChunkLoadingFunction = chunkLoadingGlobal.push.bind(chunkLoadingGlobal);
/******/ 		chunkLoadingGlobal.push = installChunk;
/******/ 		
/******/ 		// no HMR
/******/ 		
/******/ 		// no HMR manifest
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/startup chunk dependencies */
/******/ 	(() => {
/******/ 		var next = __webpack_require__.x;
/******/ 		__webpack_require__.x = () => {
/******/ 			return __webpack_require__.e("vendors-node_modules_xenova_transformers_src_models_js-node_modules_xenova_transformers_src_t-98979f").then(next);
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// run startup
/******/ 	var __webpack_exports__ = __webpack_require__.x();
/******/ 	
/******/ })()
;