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

const liveListeners = new Set();
ipcRenderer.on("keryx:live-change", (_event, snapshot) => {
    for (const listener of liveListeners) {
        try {
            listener(snapshot);
        } catch (err) {
            console.error("[keryx] live listener failed:", err);
        }
    }
});

// Updates and the bell, pushed by the main process (electron/updater.cjs,
// electron/notifications.cjs).
// Controle remoto: commands from a phone, for the console to run and answer.
const remoteListeners = new Set();
ipcRenderer.on("keryx:remote", (_event, command) => {
    for (const listener of remoteListeners) {
        try { listener(command); } catch (err) { console.error("[keryx] remote listener failed:", err); }
    }
});
const updateListeners = new Set();
ipcRenderer.on("keryx:update", (_event, state) => {
    for (const listener of updateListeners) {
        try { listener(state); } catch (err) { console.error("[keryx] update listener failed:", err); }
    }
});
const notificationListeners = new Set();
ipcRenderer.on("keryx:notifications", (_event, list) => {
    for (const listener of notificationListeners) {
        try { listener(list); } catch (err) { console.error("[keryx] notifications listener failed:", err); }
    }
});

const levelListeners = new Set();
ipcRenderer.on("keryx:audio-level", (_event, level) => {
    for (const listener of levelListeners) {
        try {
            listener(level);
        } catch (err) {
            console.error("[keryx] audio level listener failed:", err);
        }
    }
});

const meterListeners = new Set();
ipcRenderer.on("keryx:meter", (_event, level) => {
    for (const listener of meterListeners) {
        try {
            listener(level);
        } catch (err) {
            console.error("[keryx] meter listener failed:", err);
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
        open: (key) => ipcRenderer.invoke("keryx:displays:open", { key }),
        close: (key) => ipcRenderer.invoke("keryx:displays:close", { key }),
        identify: () => ipcRenderer.invoke("keryx:displays:identify"),
        // Exportar / Importar ajustes das saídas: save the file the console built, read one back.
        exportFile: (json, name) => ipcRenderer.invoke("keryx:displays:export-file", { json, name }),
        importFile: () => ipcRenderer.invoke("keryx:displays:import-file"),
    },
    bible: {
        status: () => ipcRenderer.invoke("keryx:bible:status"),
        onlineChapter: (api, slug, chapter) => ipcRenderer.invoke("keryx:bible:online-chapter", { api, slug, chapter }),
        install: (version) => ipcRenderer.invoke("keryx:bible:install", { version }),
        installFromFile: (version) => ipcRenderer.invoke("keryx:bible:install-file", { version }),
    },
    // What every output shows right now; pages use keryx.live, not this.
    live: {
        get: () => ipcRenderer.invoke("keryx:live:get"),
        call: (op, args) => ipcRenderer.invoke("keryx:live:call", { op, args }),
        onChange(listener) {
            liveListeners.add(listener);
            return () => liveListeners.delete(listener);
        },
    },
    network: {
        call: (op, args) => ipcRenderer.invoke("keryx:network", { op, args }),
    },
    remote: {
        onCommand(listener) {
            remoteListeners.add(listener);
            return () => remoteListeners.delete(listener);
        },
        reply: (id, answer) => ipcRenderer.send("keryx:remote:result", { id, ...answer }),
    },
    // Lyrics from the web (LRCLIB + letras.mus.br search), main process.
    lyrics: {
        call: (op, args) => ipcRenderer.invoke("keryx:lyrics", { op, args }),
    },
    // Audio levels: outputs report where the sound plays, the console listens.
    meters: {
        report: (level) => ipcRenderer.send("keryx:meter", level),
        onLevel(listener) {
            meterListeners.add(listener);
            return () => meterListeners.delete(listener);
        },
        // The system output's level (0..1): the console sends, the outputs listen.
        sendLevel: (level) => ipcRenderer.send("keryx:audio-level", level),
        onSystemLevel(listener) {
            levelListeners.add(listener);
            return () => levelListeners.delete(listener);
        },
    },
    system: {
        call: (op, args) => ipcRenderer.invoke("keryx:system", { op, args }),
        onUpdate(listener) {
            updateListeners.add(listener);
            return () => updateListeners.delete(listener);
        },
        onNotifications(listener) {
            notificationListeners.add(listener);
            return () => notificationListeners.delete(listener);
        },
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
        info: (names) => ipcRenderer.invoke("keryx:media-info", { names }),
    },
});
