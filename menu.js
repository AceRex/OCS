exports.createTemplate = (app) => {
  return [
    {
      label: process.platform === "darwin" ? app.getName() : "Menu",
      submenu: [
        {
          label: "Set Time",
          click: () => {
            win.webContents.send("setTimer", true);
          },
          accelerator: "Ctrl+Shift+T",
        },
        {
          type: "separator",
        },
        {
          label: "Exit",
          click: () => {
            app.quit();
          },
        },
      ],
    },

    {
      label: "Help",
      submenu: [
        {
          label: "About",
          click: () => {
            // Add the functionality for the "About" menu item here
          },
        },
      ],
    },
  ];
};
