const { ipcRenderer, contextBridge } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  Timer: {
    setTimer(value,callback) {
      ipcRenderer.send("activate-set-timer", value);
      ipcRenderer.on("set-timer", (event, response) => {
        callback(response);
      });
    },
  },
});
