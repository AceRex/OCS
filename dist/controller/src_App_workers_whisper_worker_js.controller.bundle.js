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
eval("{\n\nvar _transformers = __webpack_require__(/*! @xenova/transformers */ \"./node_modules/@xenova/transformers/src/transformers.js\");\nfunction asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }\nfunction _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, \"next\", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, \"throw\", n); } _next(void 0); }); }; }\nfunction ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }\nfunction _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }\nfunction _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }\nfunction _toPropertyKey(t) { var i = _toPrimitive(t, \"string\"); return \"symbol\" == typeof i ? i : i + \"\"; }\nfunction _toPrimitive(t, r) { if (\"object\" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || \"default\"); if (\"object\" != typeof i) return i; throw new TypeError(\"@@toPrimitive must return a primitive value.\"); } return (\"string\" === r ? String : Number)(t); } /**\n * OCS Whisper Worker v3 — Optimized Binary Bridge + Python Reference Matching\n *\n * Primary engine: Python faster-whisper sidecar on http://127.0.0.1:5421\n * Fallback engine: @xenova/transformers (WASM) — only used if sidecar is unreachable.\n *\n * Optimizations:\n * 1. Uses raw binary (Float32Array buffer) for audio transfer to Python (no JSON overhead).\n * 2. Integrates Python-based Bible reference matching for instant triggers.\n */\n// ── Config ──────────────────────────────────────────────────────────────────\nvar SIDECAR_URL = 'http://127.0.0.1:5421';\nvar SIDECAR_HEALTH_TIMEOUT_MS = 2000;\nvar SIDECAR_TRANSCRIBE_TIMEOUT_MS = 10000;\nvar PROBE_TIMEOUT_MS = 4000;\nvar OCS_TRIGGER_WORDS = [\"ocs\", \"o.c.s\", \"o c s\", \"oasis\", \"obvious\", \"osiris\", \"ocean\", \"media\", \"meeting\", \"meter\", \"medium\", \"video\"];\n\n// ── State ────────────────────────────────────────────────────────────────────\nvar activeEngine = null; // 'python' | 'wasm' | null\nvar wasmTranscriber = null; // @xenova pipeline (lazy)\nvar sidecarHealthy = false;\n\n// ── Utility: fetch with timeout ───────────────────────────────────────────────\nfunction fetchWithTimeout(url, options, timeoutMs) {\n  var controller = new AbortController();\n  var timer = setTimeout(() => controller.abort(), timeoutMs);\n  return fetch(url, _objectSpread(_objectSpread({}, options), {}, {\n    signal: controller.signal\n  })).finally(() => clearTimeout(timer));\n}\n\n// ── Python sidecar health check ───────────────────────────────────────────────\nfunction checkSidecarHealth() {\n  return _checkSidecarHealth.apply(this, arguments);\n} // ── WASM engine initialization ───────────────────────────────────────────────\nfunction _checkSidecarHealth() {\n  _checkSidecarHealth = _asyncToGenerator(function* () {\n    try {\n      var res = yield fetchWithTimeout(\"\".concat(SIDECAR_URL, \"/health\"), {\n        method: 'GET'\n      }, SIDECAR_HEALTH_TIMEOUT_MS);\n      if (res.ok) {\n        sidecarHealthy = true;\n        return true;\n      }\n    } catch (_) {}\n    sidecarHealthy = false;\n    return false;\n  });\n  return _checkSidecarHealth.apply(this, arguments);\n}\nfunction initWasm() {\n  return _initWasm.apply(this, arguments);\n} // ── Main message handler ─────────────────────────────────────────────────────\nfunction _initWasm() {\n  _initWasm = _asyncToGenerator(function* () {\n    if (wasmTranscriber) return;\n    _transformers.env.allowLocalModels = false;\n    wasmTranscriber = yield (0, _transformers.pipeline)('automatic-speech-recognition', 'Xenova/whisper-tiny.en');\n  });\n  return _initWasm.apply(this, arguments);\n}\nself.onmessage = /*#__PURE__*/function () {\n  var _ref = _asyncToGenerator(function* (event) {\n    var message = event.data;\n    if (message.type === 'init') {\n      var healthy = yield checkSidecarHealth();\n      if (healthy) {\n        activeEngine = 'python';\n        self.postMessage({\n          status: 'ready',\n          engine: 'python'\n        });\n      } else {\n        console.warn(\"[WORKER] Python sidecar not found. Loading WASM fallback...\");\n        yield initWasm();\n        activeEngine = 'wasm';\n        self.postMessage({\n          status: 'ready',\n          engine: 'wasm'\n        });\n      }\n      return;\n    }\n    if (message.type === 'probe') {\n      var audio = message.audio;\n      try {\n        if (activeEngine === 'python') {\n          var formData = new FormData();\n          formData.append('audio', new Blob([audio.buffer], {\n            type: 'application/octet-stream'\n          }));\n          var res = yield fetchWithTimeout(\"\".concat(SIDECAR_URL, \"/probe\"), {\n            method: 'POST',\n            body: formData\n          }, PROBE_TIMEOUT_MS);\n          if (res.ok) {\n            var data = yield res.json();\n            self.postMessage({\n              status: 'probe_result',\n              hasKeyword: data.hasKeyword,\n              text: data.text,\n              bible_match: data.bible_match,\n              engine: 'python'\n            });\n            return;\n          }\n        }\n\n        // WASM Fallback for probe\n        if (!wasmTranscriber) yield initWasm();\n        var result = yield wasmTranscriber(audio, {\n          chunk_length_s: 30,\n          stride_length_s: 5\n        });\n        var text = result.text.toLowerCase();\n        var hasKeyword = OCS_TRIGGER_WORDS.some(kw => text.includes(kw));\n        self.postMessage({\n          status: 'probe_result',\n          hasKeyword,\n          text,\n          engine: 'wasm'\n        });\n      } catch (e) {\n        self.postMessage({\n          status: 'probe_result',\n          hasKeyword: false,\n          text: '',\n          engine: activeEngine\n        });\n      }\n      return;\n    }\n    if (message.type === 'transcribe') {\n      var _audio = message.audio;\n      var prompt = message.prompt || '';\n      try {\n        if (activeEngine === 'python') {\n          var _formData = new FormData();\n          _formData.append('audio', new Blob([_audio.buffer], {\n            type: 'application/octet-stream'\n          }));\n          _formData.append('prompt', prompt);\n          var _res = yield fetchWithTimeout(\"\".concat(SIDECAR_URL, \"/transcribe\"), {\n            method: 'POST',\n            body: _formData\n          }, SIDECAR_TRANSCRIBE_TIMEOUT_MS);\n          if (_res.ok) {\n            var _data = yield _res.json();\n            self.postMessage({\n              status: 'result',\n              text: _data.text,\n              confidence: _data.confidence,\n              avg_logprob: _data.avg_logprob,\n              bible_match: _data.bible_match,\n              engine: 'python',\n              debug: {\n                latency: _data.latency_sec\n              }\n            });\n            return;\n          }\n        }\n\n        // WASM Fallback for transcription\n        if (!wasmTranscriber) yield initWasm();\n        var _result = yield wasmTranscriber(_audio, {\n          chunk_length_s: 30,\n          stride_length_s: 5\n        });\n        self.postMessage({\n          status: 'result',\n          text: _result.text,\n          confidence: 0.8,\n          avg_logprob: -0.5,\n          engine: 'wasm',\n          debug: {\n            wasm: true\n          }\n        });\n      } catch (e) {\n        self.postMessage({\n          status: 'error',\n          error: e.message\n        });\n      }\n    }\n  });\n  return function (_x) {\n    return _ref.apply(this, arguments);\n  };\n}();\n\n//# sourceURL=webpack://ocs/./src/App/workers/whisper.worker.js?\n}");

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