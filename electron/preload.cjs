const { contextBridge, ipcRenderer, webUtils } = require("electron");

// Desktop API for the web app. src/api/backends/desktop.js is the only
// consumer; pages keep using keryx.entities.* as before.

const config = ipcRenderer.sendSync("keryx:config");

const changeListeners = new Set();
ipcRenderer.on("keryx:db-change", (_event, change) => {
    for (const listener of changeListeners) {
        try {
            listener(change);
        } catch (err) {
            console.error("[keryx] change listener failed:", err);
        }
    }
});

contextBridge.exposeInMainWorld("keryxDesktop", {
    isDesktop: true,
    platform: process.platform,
    versions: { electron: process.versions.electron, chrome: process.versions.chrome },
    mediaBaseUrl: config.mediaBaseUrl,
    db: {
        call: (entity, op, args) => ipcRenderer.invoke("keryx:db", { entity, op, args }),
        onChange(listener) {
            changeListeners.add(listener);
            return () => changeListeners.delete(listener);
        },
    },
    displays: {
        list: () => ipcRenderer.invoke("keryx:displays:list"),
        set: (key, assignment) => ipcRenderer.invoke("keryx:displays:set", { key, assignment }),
        close: (key) => ipcRenderer.invoke("keryx:displays:close", { key }),
        identify: () => ipcRenderer.invoke("keryx:displays:identify"),
    },
    media: {
        // Files picked from disk are copied by path in the main process, so a
        // large video never travels over IPC; anything else is sent as bytes.
        async importFile(file) {
            let sourcePath = "";
            try {
                sourcePath = webUtils.getPathForFile(file);
            } catch {
                sourcePath = "";
            }
            if (sourcePath) return ipcRenderer.invoke("keryx:media-import", { sourcePath, name: file.name });
            const bytes = new Uint8Array(await file.arrayBuffer());
            return ipcRenderer.invoke("keryx:media-import", { bytes, name: file.name });
        },
    },
});
