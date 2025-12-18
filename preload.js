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
    getChapter: (version, bookId, chapter) => ipcRenderer.invoke('bible-get-chapter', { version, bookId, chapter })
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
    }
  }
});
