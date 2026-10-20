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
// Destacar em janela: the console and its detached pages (src/lib/janelaRelay.js).
const janelaListeners = new Set();
ipcRenderer.on("keryx:janela", (_event, msg) => {
    for (const listener of janelaListeners) {
        try { listener(msg); } catch (err) { console.error("[keryx] janela listener failed:", err); }
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

// The console's zoom changed (Ctrl+= / Ctrl+− / Ctrl+0, electron/consoleZoom.cjs).
const zoomListeners = new Set();
ipcRenderer.on("keryx:zoom", (_event, zoom) => {
    for (const listener of zoomListeners) {
        try { listener(zoom); } catch (err) { console.error("[keryx] zoom listener failed:", err); }
    }
});

// Sync between the church's computers: media files rows name that have not
// come down yet (electron/sync.cjs), as keryx-media names.
const syncMissingListeners = new Set();
ipcRenderer.on("keryx:sync:missing", (_event, names) => {
    for (const listener of syncMissingListeners) {
        try { listener(names); } catch (err) { console.error("[keryx] sync listener failed:", err); }
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
    // The PC's installed fonts (electron/systemFonts.cjs), for the Editor de temas.
    fonts: {
        list: () => ipcRenderer.invoke("keryx:fonts", { op: "list" }),
        read: (id) => ipcRenderer.invoke("keryx:fonts", { op: "read", id }),
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
    // Destacar em janela: messages between the console and its detached
    // pages, relayed by main (checked on arrival, src/lib/janelaRelay.js).
    janela: {
        send: (msg) => ipcRenderer.send("keryx:janela", msg),
        onMessage(listener) {
            janelaListeners.add(listener);
            return () => janelaListeners.delete(listener);
        },
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
    // This window's errors into the daily log (src/lib/rendererLog.js; main
    // limits and writes them, electron/rendererLog.cjs).
    log: (entry) => ipcRenderer.send("keryx:log", entry),
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
        onZoom(listener) {
            zoomListeners.add(listener);
            return () => zoomListeners.delete(listener);
        },
    },
    media: {
        // Files picked from disk are copied by path in the main process, so a
        // large video never travels over IPC; anything else is sent as bytes,
        // up to the main process's limit: past it the file is not even read,
        // and the main process answers with the refusal
        // (electron/mediaImport.cjs).
        async importFile(file) {
            let sourcePath = "";
            try {
                sourcePath = webUtils.getPathForFile(file);
            } catch {
                sourcePath = "";
            }
            if (sourcePath) return ipcRenderer.invoke("keryx:media-import", { sourcePath, name: file.name });
            if (file.size > config.mediaImportMaxBytes) return ipcRenderer.invoke("keryx:media-import", { size: file.size, name: file.name });
            const bytes = new Uint8Array(await file.arrayBuffer());
            return ipcRenderer.invoke("keryx:media-import", { bytes, name: file.name });
        },
        info: (names) => ipcRenderer.invoke("keryx:media-info", { names }),
    },
    // Configurações › Sincronização (electron/syncControl.cjs), and the media
    // rows name that have not come down yet.
    sync: {
        call: (op, args) => ipcRenderer.invoke("keryx:sync", { op, args }),
        missing: () => ipcRenderer.invoke("keryx:sync:missing"),
        onMissing(listener) {
            syncMissingListeners.add(listener);
            return () => syncMissingListeners.delete(listener);
        },
    },
});
