const { app, shell } = require("electron");

exports.createTemplate = (electronApp, actions = {}) => {
  const isMac = process.platform === "darwin";
  const appInstance = electronApp || app;
  const appName =
    appInstance?.name || (appInstance?.getName ? appInstance.getName() : "OCS");

  const template = [
    // App Menu (macOS only)
    ...(isMac
      ? [
          {
            label: appName,
            submenu: [
              { role: "about" },
              { type: "separator" },
              {
                label: "Sanctuary Shortcuts Guide...",
                accelerator: "CmdOrCtrl+/",
                click: () => actions?.openShortcuts?.(),
              },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),

    // File Menu
    {
      label: "File",
      submenu: [
        {
          label: "Sanctuary Shortcuts Guide",
          accelerator: "CmdOrCtrl+/",
          click: () => actions?.openShortcuts?.(),
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },

    // Edit Menu — Required for native Copy, Paste, Cut, Select All, Undo, Redo
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        ...(isMac
          ? [
              { role: "pasteAndMatchStyle" },
              { role: "delete" },
              { role: "selectAll" },
              { type: "separator" },
              {
                label: "Speech",
                submenu: [{ role: "startSpeaking" }, { role: "stopSpeaking" }],
              },
            ]
          : [
              { role: "delete" },
              { type: "separator" },
              { role: "selectAll" },
            ]),
      ],
    },

    // Sanctuary / Presentation Controls Menu (Active Native Accelerators)
    {
      label: "Sanctuary Controls",
      submenu: [
        {
          label: "Instant Blackout",
          accelerator: isMac ? "Cmd+Shift+B" : "F10",
          click: () => actions?.toggleBlackout?.(),
        },
        {
          label: "Logo Mute",
          accelerator: isMac ? "Cmd+Shift+L" : "F11",
          click: () => actions?.toggleLogo?.(),
        },
        {
          label: "Clear Active Content",
          accelerator: "Esc",
          click: () => actions?.clearContent?.(),
        },
        { type: "separator" },
        {
          label: "Take Live / Screen On",
          accelerator: "CmdOrCtrl+Enter",
          click: () => actions?.takeLive?.(),
        },
        {
          label: "Previous Verse / Slide",
          accelerator: "Left",
          click: () => actions?.prevItem?.(),
        },
        {
          label: "Next Verse / Slide",
          accelerator: "Right",
          click: () => actions?.nextItem?.(),
        },
        { type: "separator" },
        {
          label: "Quick Bible Search",
          accelerator: "CmdOrCtrl+K",
          click: () => actions?.quickSearch?.(),
        },
      ],
    },

    // View Menu
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },

    // Window Menu
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [
              { type: "separator" },
              { role: "front" },
              { type: "separator" },
              { role: "window" },
            ]
          : [{ role: "close" }]),
      ],
    },

    // Help Menu
    {
      role: "help",
      submenu: [
        {
          label: "OCS Documentation & Setup Guide",
          click: async () => {
            await shell.openExternal("https://waveiosoftware.netlify.app/docs");
          },
        },
        {
          label: "Keyboard Shortcuts Guide...",
          accelerator: "CmdOrCtrl+Shift+/",
          click: () => actions?.openShortcuts?.(),
        },
      ],
    },
  ];

  return template;
};
