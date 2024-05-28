const { ipcRenderer, contextBridge } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  Timer: {
    setTimer() {
      ipcRenderer.on("setTimer", (value) => {
        dispatch(utilAction.setTimeState(value));
      });
    },
  },
});
