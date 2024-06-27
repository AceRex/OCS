exports.createTemplate = (app) => {
  return [
    {
      label: process.platform === "darwin" ? app.getName() : "Menu",
      submenu: [
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
