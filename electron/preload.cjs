const { contextBridge } = require("electron");

// Lets the web app tell it is running inside the desktop shell. The data and
// projection APIs from the architecture plan will be added here.
contextBridge.exposeInMainWorld("keryxDesktop", {
    isDesktop: true,
    platform: process.platform,
    versions: { electron: process.versions.electron, chrome: process.versions.chrome },
});
