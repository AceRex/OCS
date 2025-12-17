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
// exports.createTemplate = (app, windows) => {
//   return [
//     // APP MENU (macOS)
//     {
//       label: process.platform === "darwin" ? app.getName() : "Menu",
//       submenu: [
//         { role: "about" },
//         { type: "separator" },
//         {
//           label: "Preferences",
//           accelerator: "CmdOrCtrl+,",
//           click: () => {
//             windows.controller.webContents.send("open:settings");
//           },
//         },
//         { type: "separator" },
//         { role: "quit" },
//       ],
//     },

//     // FILE
//     {
//       label: "File",
//       submenu: [
//         {
//           label: "New Timer",
//           accelerator: "CmdOrCtrl+N",
//           click: () => {
//             windows.controller.webContents.send("timer:new");
//           },
//         },
//         {
//           label: "Clear Timer Queue",
//           click: () => {
//             windows.controller.webContents.send("timer:clearQueue");
//           },
//         },
//         { type: "separator" },
//         {
//           label: "Exit",
//           role: "quit",
//         },
//       ],
//     },

//     // VIEW
//     {
//       label: "View",
//       submenu: [
//         { role: "reload" },
//         { role: "forceReload" },
//         { role: "toggleDevTools" },
//         { type: "separator" },
//         { role: "resetZoom" },
//         { role: "zoomIn" },
//         { role: "zoomOut" },
//         { type: "separator" },
//         {
//           label: "Toggle Fullscreen Preview",
//           accelerator: "CmdOrCtrl+F",
//           click: () => {
//             windows.view.setFullScreen(!windows.view.isFullScreen());
//           },
//         },
//       ],
//     },

//     // PRESENTATION
//     {
//       label: "Presentation",
//       submenu: [
//         {
//           label: "Show Timer",
//           accelerator: "CmdOrCtrl+1",
//           click: () => {
//             windows.controller.webContents.send("presentation:showTimer");
//           },
//         },
//         {
//           label: "Show Bible",
//           accelerator: "CmdOrCtrl+2",
//           click: () => {
//             windows.controller.webContents.send("presentation:showBible");
//           },
//         },
//         {
//           label: "Show Lyrics",
//           accelerator: "CmdOrCtrl+3",
//           click: () => {
//             windows.controller.webContents.send("presentation:showLyrics");
//           },
//         },
//         { type: "separator" },
//         {
//           label: "Clear Screen",
//           accelerator: "CmdOrCtrl+0",
//           click: () => {
//             windows.controller.webContents.send("presentation:clear");
//           },
//         },
//       ],
//     },

//     // LIVE
//     {
//       label: "Live",
//       submenu: [
//         {
//           label: "Go Live",
//           accelerator: "CmdOrCtrl+L",
//           click: () => {
//             windows.controller.webContents.send("live:start");
//           },
//         },
//         {
//           label: "Stop Live",
//           click: () => {
//             windows.controller.webContents.send("live:stop");
//           },
//         },
//         { type: "separator" },
//         {
//           label: "Mute All Audio",
//           accelerator: "CmdOrCtrl+M",
//           click: () => {
//             windows.controller.webContents.send("audio:muteAll");
//           },
//         },
//       ],
//     },

//     // DEVICES
//     {
//       label: "Devices",
//       submenu: [
//         {
//           label: "Connected Devices",
//           click: () => {
//             windows.controller.webContents.send("devices:open");
//           },
//         },
//         {
//           label: "Refresh Devices",
//           click: () => {
//             windows.controller.webContents.send("devices:refresh");
//           },
//         },
//       ],
//     },

//     // WINDOW
//     {
//       label: "Window",
//       submenu: [
//         { role: "minimize" },
//         { role: "close" },
//         { type: "separator" },
//         {
//           label: "Controller Window",
//           click: () => {
//             windows.controller.show();
//           },
//         },
//         {
//           label: "Preview Window",
//           click: () => {
//             windows.view.show();
//           },
//         },
//       ],
//     },

//     // HELP
//     {
//       label: "Help",
//       submenu: [
//         {
//           label: "Documentation",
//           click: () => {
//             require("electron").shell.openExternal(
//               "https://your-docs-url.com"
//             );
//           },
//         },
//         {
//           label: "Report Issue",
//           click: () => {
//             require("electron").shell.openExternal(
//               "https://github.com/your-repo/issues"
//             );
//           },
//         },
//         { type: "separator" },
//         {
//           label: "About",
//           role: "about",
//         },
//       ],
//     },
//   ];
// };
