const { ipcRenderer, contextBridge } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  Timer: {
    setTimer(value) {
      ipcRenderer.send("activate_set_timer", value);
    },
    onSetTimer(callback) {
      ipcRenderer.on("set-timer", (event, response) => {
        callback(response);
      });
    },
    removeSetTimerListener() {
      ipcRenderer.removeAllListeners("set-timer");
    },
  },
  Bible: {
    getBooks: () => ipcRenderer.invoke('bible-get-books'),
    getChapter: (version, bookId, chapter) => ipcRenderer.invoke('bible-get-chapter', { version, bookId, chapter }),
    sync: (state) => ipcRenderer.send('bible-sync', state),
    /** Pass 3 — keyword content search (Smart Bible Matcher) */
    searchVerses: (query, version, limit) => ipcRenderer.invoke('bible-search-verses', { query, version: version || 'kjv', limit: limit || 5 }),
  },
  openExternal: (url) => ipcRenderer.invoke('open-external-url', url),
  Voice: {
    /** @deprecated use Asr.getStatus — kept for older debug UI */
    getSidecarStatus: () => ipcRenderer.invoke('voice-sidecar-status'),
  },
  /** Preferred ASR API (whisper.cpp default / vosk fallback) */
  Asr: {
    getStatus: () => ipcRenderer.invoke('asr-status'),
    init: (opts) => ipcRenderer.invoke('asr-init', opts || {}),
    start: () => ipcRenderer.invoke('asr-start'),
    stop: () => ipcRenderer.invoke('asr-stop'),
    sendAudio: (pcm) => {
      if (!pcm) return;
      let buf;
      try {
        if (Buffer.isBuffer(pcm)) buf = pcm;
        else if (pcm instanceof ArrayBuffer) buf = Buffer.from(pcm);
        else if (ArrayBuffer.isView(pcm)) buf = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
        else buf = Buffer.from(pcm);
      } catch (err) {
        console.error('[Asr] sendAudio encode failed', err);
        return;
      }
      if (buf.length > 0) ipcRenderer.send('asr-audio', buf);
    },
    setConfidence: (value) => ipcRenderer.invoke('asr-set-confidence', value),
    onTranscript: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('asr-transcript', listener);
      return () => ipcRenderer.removeListener('asr-transcript', listener);
    },
    onStatus: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('asr-status', listener);
      return () => ipcRenderer.removeListener('asr-status', listener);
    },
    /** FR-3.68 — Subscribe to engine-switch events (debug bar calibration warning). */
    onEngineChanged: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('asr-engine-changed', listener);
      return () => ipcRenderer.removeListener('asr-engine-changed', listener);
    },
    /** FR-3.68 — Subscribe to engine-calibrated (calibration window closed). */
    onEngineCalibrated: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('asr-engine-calibrated', listener);
      return () => ipcRenderer.removeListener('asr-engine-calibrated', listener);
    },
  },
  /** @deprecated use electron.Asr — shim for BroadcastEngine during migration */
  Vosk: {
    getStatus: () => ipcRenderer.invoke('vosk-status'),
    init: () => ipcRenderer.invoke('vosk-init'),
    start: () => ipcRenderer.invoke('vosk-start'),
    stop: () => ipcRenderer.invoke('vosk-stop'),
    /** Send Int16 PCM mono @ 16kHz — copy into a Node Buffer in preload for reliable IPC */
    sendAudio: (pcm) => {
      if (!pcm) return;
      let buf;
      try {
        if (Buffer.isBuffer(pcm)) buf = pcm;
        else if (pcm instanceof ArrayBuffer) buf = Buffer.from(pcm);
        else if (ArrayBuffer.isView(pcm)) buf = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
        else buf = Buffer.from(pcm);
      } catch (err) {
        console.error('[Vosk] sendAudio encode failed', err);
        return;
      }
      if (buf.length > 0) ipcRenderer.send('vosk-audio', buf);
    },
    setConfidence: (value) => ipcRenderer.invoke('vosk-set-confidence', value),
    onTranscript: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('vosk-transcript', listener);
      return () => ipcRenderer.removeListener('vosk-transcript', listener);
    },
    onStatus: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('vosk-status', listener);
      return () => ipcRenderer.removeListener('vosk-status', listener);
    },
  },
  Presentation: {
    list: () => ipcRenderer.invoke('presentation-list'),
    save: (deck) => ipcRenderer.invoke('presentation-save', deck),
    delete: (deckId) => ipcRenderer.invoke('presentation-delete', deckId),
    import: () => ipcRenderer.invoke("presentation-import"),
    importPresentation: () => ipcRenderer.invoke('media-import-presentation'),
    importMedia: () => ipcRenderer.invoke('media-import'),
    getMedia: () => ipcRenderer.invoke('media-list'),
    list: () => ipcRenderer.invoke("presentation-list"),
    deletePresentation: (fileUrl) => ipcRenderer.invoke("presentation-delete", fileUrl),
    onImportProgress: (callback) => {
      const listener = (_event, data) => callback(data);
      ipcRenderer.on('presentation-import-progress', listener);
      return () => ipcRenderer.removeListener('presentation-import-progress', listener);
    },
    onDecksUpdated: (callback) => {
      const listener = (_e, val) => callback(val);
      ipcRenderer.on('presentation-decks-updated', listener);
      return () => ipcRenderer.removeListener('presentation-decks-updated', listener);
    },
    setContent: (content) => {
      try {
        const summary = content == null
          ? 'null (black)'
          : `${content.type || '?'} ${content.data?.title || ''}`.trim();
        console.log('[Presentation] setContent →', summary);
      } catch (_) {}
      ipcRenderer.send("activate_set_content", content);
    },
    onSetContent: (callback) => {
      const listener = (_event, response) => {
        try {
          const summary = response == null
            ? 'null (black)'
            : `${response.type || '?'} ${response.data?.title || ''}`.trim();
          console.log('[Presentation] onSetContent ←', summary);
        } catch (_) {}
        callback(response);
      };
      ipcRenderer.on("set-content", listener);
      // Return disposer so callers do not wipe other listeners via removeAllListeners
      return () => ipcRenderer.removeListener("set-content", listener);
    },
    removeSetContentListener: () => {
      // Deprecated: prefer disposer from onSetContent. Kept for older call sites.
      ipcRenderer.removeAllListeners("set-content");
    },
    setStyle: (style) => ipcRenderer.send("activate_set_style", style),
    onSetStyle: (callback) => {
      const listener = (_event, response) => callback(response);
      ipcRenderer.on("set-style", listener);
      return () => ipcRenderer.removeListener("set-style", listener);
    },
    removeSetStyleListener: () => {
      ipcRenderer.removeAllListeners("set-style");
    }
  },
  Canvas: {
    syncState: (canvasState) => ipcRenderer.send("canvas-sync-state", canvasState),
    setBackground: (bg) => ipcRenderer.send("canvas-set-background", bg),
    setPinnedLayers: (layers) => ipcRenderer.send("canvas-set-pinned-layers", layers),
    setChrome: (chrome) => ipcRenderer.send("canvas-set-chrome", chrome),
    onCanvasSync: (callback) => {
      const listener = (event, val) => callback(val);
      ipcRenderer.on("canvas-state-update", listener);
      return () => ipcRenderer.removeListener("canvas-state-update", listener);
    },
    removeListeners: () => {
      ipcRenderer.removeAllListeners("canvas-state-update");
    }
  },
  Scene: {
    list: () => ipcRenderer.invoke('scene-list'),
    save: (scene) => ipcRenderer.invoke('scene-save', scene),
    delete: (sceneId) => ipcRenderer.invoke('scene-delete', sceneId),
    onSceneImported: (callback) => {
      const listener = (_e, val) => callback(val);
      ipcRenderer.on('scene-imported', listener);
      return () => ipcRenderer.removeListener('scene-imported', listener);
    },
    onSceneListUpdated: (callback) => {
      const listener = (_e, val) => callback(val);
      ipcRenderer.on('scene-list-updated', listener);
      return () => ipcRenderer.removeListener('scene-list-updated', listener);
    },
  },
  Aligner: {
    startScene: (scene, pageIndex = 0, sequenceIndex = 0) => ipcRenderer.send('scene-read-along-start', { scene, pageIndex, sequenceIndex }),
    setPage: (pageIndex, sequenceIndex) => ipcRenderer.send('scene-read-along-set-page', pageIndex, sequenceIndex),
    stop: () => ipcRenderer.send('scene-read-along-stop'),
    manualAdvance: () => ipcRenderer.send('scene-read-along-manual-advance'),
    manualPrev: () => ipcRenderer.send('scene-read-along-manual-prev'),
    onAlignmentUpdate: (callback) => {
      const listener = (_e, val) => callback(val);
      ipcRenderer.on('alignment:update', listener);
      return () => ipcRenderer.removeListener('alignment:update', listener);
    },
    onAutoAdvance: (callback) => {
      const listener = (_e, val) => callback(val);
      ipcRenderer.on('scene-auto-advance', listener);
      return () => ipcRenderer.removeListener('scene-auto-advance', listener);
    },
    onAdvance: (callback) => {
      const listener = (_e, val) => callback(val);
      ipcRenderer.on('scene-auto-advance', listener);
      return () => ipcRenderer.removeListener('scene-auto-advance', listener);
    },
    onPromptSuggest: (callback) => {
      const listener = (_e, val) => callback(val);
      ipcRenderer.on('scene-prompt-suggest', listener);
      return () => ipcRenderer.removeListener('scene-prompt-suggest', listener);
    },
    onSuggestPrompt: (callback) => {
      const listener = (_e, val) => callback(val);
      ipcRenderer.on('scene-prompt-suggest', listener);
      return () => ipcRenderer.removeListener('scene-prompt-suggest', listener);
    },
    onPromptClear: (callback) => {
      const listener = (_e, val) => callback(val);
      ipcRenderer.on('scene-prompt-clear', listener);
      return () => ipcRenderer.removeListener('scene-prompt-clear', listener);
    },
    onClearSuggestion: (callback) => {
      const listener = (_e, val) => callback(val);
      ipcRenderer.on('scene-prompt-clear', listener);
      return () => ipcRenderer.removeListener('scene-prompt-clear', listener);
    },
  },
  Media: {
    import: () => ipcRenderer.invoke("media-import"),
    importPresentation: () => ipcRenderer.invoke("media-import-presentation"),
    list: () => ipcRenderer.invoke("media-list"),
    delete: (filename) => ipcRenderer.invoke("media-delete", filename),
    deletePresentation: (fileUrl) => ipcRenderer.invoke("presentation-delete", fileUrl),
    onMediaUpdated: (callback) => {
      const listener = (_e, val) => callback(val);
      ipcRenderer.on('media-list-updated', listener);
      ipcRenderer.on('media-imported', listener);
      return () => {
        ipcRenderer.removeListener('media-list-updated', listener);
        ipcRenderer.removeListener('media-imported', listener);
      };
    },
  },
  Network: {
    getServerInfo: () => ipcRenderer.invoke('get-server-info'),
    rotatePairing: () => ipcRenderer.invoke('pairing-rotate'),
    disconnectDevice: (deviceId) => ipcRenderer.send('mobile-disconnect-device', deviceId),
    onMobileConnected: (callback) => {
      const listener = (event, val) => callback(val);
      ipcRenderer.on('mobile-connected', listener);
      return () => ipcRenderer.removeListener('mobile-connected', listener);
    },
    onMobileDisconnected: (callback) => {
      const listener = (event, val) => callback(val);
      ipcRenderer.on('mobile-disconnected', listener);
      return () => ipcRenderer.removeListener('mobile-disconnected', listener);
    },
    onMobileUnpairedAttempt: (callback) => {
      const listener = (event, val) => callback(val);
      ipcRenderer.on('mobile-unpaired-attempt', listener);
      return () => ipcRenderer.removeListener('mobile-unpaired-attempt', listener);
    },
    renameDevice: (deviceId, name) => ipcRenderer.invoke('mobile-device-rename', { deviceId, name }),
    onDevicesUpdated: (callback) => {
      const listener = (event, val) => callback(val);
      ipcRenderer.on('mobile-devices-updated', listener);
      return () => ipcRenderer.removeListener('mobile-devices-updated', listener);
    },
    onAssetRequest: (callback) => {
      const listener = (event, val) => callback(val);
      ipcRenderer.on('mobile-asset-request', listener);
      return () => ipcRenderer.removeListener('mobile-asset-request', listener);
    },
    respondAsset: (payload) => ipcRenderer.invoke('mobile-asset-respond', payload),
    onMobileAction: (callback) => {
      const listener = (event, val) => callback(val);
      ipcRenderer.on('mobile-action', listener);
      return () => ipcRenderer.removeListener('mobile-action', listener);
    }
  },
  Design: {
    analyzePoster: (imagePath) => ipcRenderer.invoke("design-analyze", imagePath),
    generateAsset: (prompt) => ipcRenderer.invoke("design-generate", prompt)
  },
  AI: {
    /** Returns { ok, vosk, piper, ollama: { running, models, model } } */
    status: () => ipcRenderer.invoke('ai-status'),
    /**
     * Ask Ollama a question.
     * @param {string} prompt
     * @param {string} [system] - optional system prompt override
     * @param {string} [model]  - optional model name (e.g. 'llama3.2')
     * @returns {{ ok, response, latency, model } | { ok: false, error }}
     */
    chat: (prompt, system, model) => ipcRenderer.invoke('ai-chat', { prompt, system, model }),
    /**
     * Synthesize text to speech via Piper TTS.
     * @param {string} text
     * @param {string} [voice] - e.g. 'en_US-amy-medium'
     * @returns {{ ok, audio: base64WAV } | { ok: false, error }}
     */
    speak: (text, voice) => ipcRenderer.invoke('ai-speak', { text, voice }),
  },
  /** Recording Intro & Outro Bumpers */
  Bumper: {
    get: () => ipcRenderer.invoke('bumper-get'),
    upload: (type) => ipcRenderer.invoke('bumper-upload', { type }),
    remove: (type) => ipcRenderer.invoke('bumper-remove', { type }),
    setAutoMerge: (enabled) => ipcRenderer.invoke('bumper-set-auto-merge', enabled),
  },
  /** Session Folders archive (FR-5.9–5.28) */
  Session: {
    emitTimerLifecycle: (event) => ipcRenderer.send('timer-lifecycle', event),
    list: () => ipcRenderer.invoke('session-list'),
    get: (id) => ipcRenderer.invoke('session-get', id),
    update: (id, patch) => ipcRenderer.invoke('session-update', { id, patch }),
    delete: (id) => ipcRenderer.invoke('session-delete', id),
    deleteMany: (ids) => ipcRenderer.invoke('session-delete-many', ids),
    updateTranscript: (id, text) => ipcRenderer.invoke('session-update-transcript', { id, text }),
    openFile: (id, filename) => ipcRenderer.invoke('session-open-file', { id, filename }),
    retryPdf: (id) => ipcRenderer.invoke('session-retry-pdf', id),
    status: () => ipcRenderer.invoke('session-status'),
    showInFolder: (id) => ipcRenderer.invoke('session-show-in-folder', id),
    audioUrl: (id) => ipcRenderer.invoke('session-audio-url', id),
    pushTranscriptLine: (line) => ipcRenderer.send('session-transcript-line', line),
    setAudioMime: (mime) => ipcRenderer.send('session-audio-mime', mime),
    pushAudioChunk: (chunk) => {
      if (!chunk) return;
      let buf;
      try {
        if (Buffer.isBuffer(chunk)) buf = chunk;
        else if (chunk instanceof ArrayBuffer) buf = Buffer.from(chunk);
        else if (ArrayBuffer.isView(chunk)) buf = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
        else buf = Buffer.from(chunk);
      } catch (_) { return; }
      if (buf.length) ipcRenderer.send('session-audio-chunk', buf);
    },
    onStatus: (callback) => {
      const listener = (_e, payload) => callback(payload);
      ipcRenderer.on('session-archive-status', listener);
      return () => ipcRenderer.removeListener('session-archive-status', listener);
    },
    onProgress: (callback) => {
      const listener = (_e, payload) => callback(payload);
      ipcRenderer.on('session-archive-progress', listener);
      return () => ipcRenderer.removeListener('session-archive-progress', listener);
    },
    onUpdated: (callback) => {
      const listener = (_e, payload) => callback(payload);
      ipcRenderer.on('session-updated', listener);
      return () => ipcRenderer.removeListener('session-updated', listener);
    },
    onFinalized: (callback) => {
      const listener = (_e, payload) => callback(payload);
      ipcRenderer.on('session-finalized', listener);
      return () => ipcRenderer.removeListener('session-finalized', listener);
    },
  },
  /** Display sleep prevention (FR-13) */
  Sleep: {
    getStatus: () => ipcRenderer.invoke('sleep-get-status'),
    setMode: (mode) => ipcRenderer.invoke('sleep-set-mode', mode),
    probe: () => ipcRenderer.invoke('sleep-probe'),
    onStatus: (callback) => {
      const listener = (_e, payload) => callback(payload);
      ipcRenderer.on('sleep-prevention-status', listener);
      return () => ipcRenderer.removeListener('sleep-prevention-status', listener);
    },
  },
  Settings: {
    get: () => ipcRenderer.invoke('settings-get'),
    set: (patch) => ipcRenderer.invoke('settings-set', patch),
  },
  Ndi: {
    getStatus: () => ipcRenderer.invoke('ndi:get-status'),
    setConfig: (config) => ipcRenderer.invoke('ndi:set-config', config),
    discoverSources: () => ipcRenderer.invoke('ndi:discover-sources'),
    restartStream: () => ipcRenderer.invoke('ndi:restart-stream'),
    onStatusUpdate: (callback) => {
      const listener = (_e, payload) => callback(payload);
      ipcRenderer.on('ndi-status-update', listener);
      return () => ipcRenderer.removeListener('ndi-status-update', listener);
    },
  },
  Auth: {
    getStatus: () => ipcRenderer.invoke('auth:get-status'),
    openBrowserLogin: () => ipcRenderer.invoke('auth:open-browser-login'),
    simulateCallback: (url) => ipcRenderer.invoke('auth:simulate-callback', url),
    logout: () => ipcRenderer.invoke('auth:logout'),
    onAuthStatus: (callback) => {
      const listener = (_e, payload) => callback(payload);
      ipcRenderer.on('auth-status', listener);
      return () => ipcRenderer.removeListener('auth-status', listener);
    },
    onAuthError: (callback) => {
      const listener = (_e, payload) => callback(payload);
      ipcRenderer.on('auth-error', listener);
      return () => ipcRenderer.removeListener('auth-error', listener);
    },
  },
});
