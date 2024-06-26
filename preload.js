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
});
