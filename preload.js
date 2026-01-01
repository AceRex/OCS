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
    sync: (state) => ipcRenderer.send('bible-sync', state)
  },
  Presentation: {
    setContent: (content) => ipcRenderer.send("activate_set_content", content),
    onSetContent: (callback) => {
      ipcRenderer.on("set-content", (event, response) => {
        callback(response);
      });
    },
    removeSetContentListener: () => {
      ipcRenderer.removeAllListeners("set-content");
    },
    setStyle: (style) => ipcRenderer.send("activate_set_style", style),
    onSetStyle: (callback) => {
      ipcRenderer.on("set-style", (event, response) => {
        callback(response);
      });
    },
    removeSetStyleListener: () => {
      ipcRenderer.removeAllListeners("set-style");
    }
  },
  Media: {
    import: () => ipcRenderer.invoke("media-import"),
    list: () => ipcRenderer.invoke("media-list"),
    delete: (filename) => ipcRenderer.invoke("media-delete", filename)
  },
  Network: {
    getServerInfo: () => ipcRenderer.invoke('get-server-info'),
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
    onMobileAction: (callback) => {
      const listener = (event, val) => callback(val);
      ipcRenderer.on('mobile-action', listener);
      return () => ipcRenderer.removeListener('mobile-action', listener);
    }
  }
});
