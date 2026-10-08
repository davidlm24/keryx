// Updates from GitHub Releases through electron-updater, on the operator's
// terms: it checks, it tells, it downloads and installs only when asked
// (never on its own, never mid-service).
//
// It is off unless the build was made with a `publish` target: electron-builder
// then writes resources/app-update.yml, and only a packaged app with that file
// can update. Otherwise status stays "disabled" and Settings says why.

const fs = require("node:fs");
const path = require("node:path");

function createUpdater({ app, log = () => {}, loadUpdater = () => require("electron-updater").autoUpdater }) {
    let state = { status: "disabled", message: "As atualizações automáticas não estão configuradas nesta instalação.", version: null, percent: 0 };
    let updater = null;

    const set = (patch) => { state = { ...state, ...patch }; };
    const configured = app.isPackaged && fs.existsSync(path.join(process.resourcesPath || "", "app-update.yml"));

    if (configured) {
        try {
            updater = loadUpdater();
            updater.autoDownload = false;
            updater.autoInstallOnAppQuit = false;
            updater.allowPrerelease = false;
            updater.logger = { info: log, warn: log, error: log, debug: () => {} };
            updater.on("checking-for-update", () => set({ status: "checking", message: "Procurando atualizações…" }));
            updater.on("update-available", (info) => set({ status: "available", version: info.version, message: `A versão ${info.version} está disponível.` }));
            updater.on("update-not-available", () => set({ status: "none", message: "Você está na versão mais recente." }));
            updater.on("download-progress", (p) => set({ status: "downloading", percent: Math.round(p.percent || 0), message: `Baixando… ${Math.round(p.percent || 0)}%` }));
            updater.on("update-downloaded", (info) => set({ status: "downloaded", version: info.version, percent: 100, message: `A versão ${info.version} foi baixada e será instalada ao reiniciar.` }));
            updater.on("error", (err) => set({ status: "error", message: `Não foi possível verificar atualizações: ${err && err.message ? err.message.split("\n")[0] : err}` }));
            set({ status: "idle", message: "Nenhuma verificação feita ainda." });
        } catch (err) {
            log(`[keryx-updater] ${err.message}`);
            updater = null;
        }
    }

    return {
        state: () => state,
        enabled: () => Boolean(updater),
        async check() {
            if (!updater) return state;
            try {
                await updater.checkForUpdates();
            } catch { /* the error event already set the state */ }
            return state;
        },
        async download() {
            if (!updater || state.status !== "available") return state;
            try {
                await updater.downloadUpdate();
            } catch { /* error event */ }
            return state;
        },
        // Quit, update in the background and open KERYX again: no installer
        // window (isSilent). The install is per user, so there is no admin prompt.
        installAndRestart() {
            if (updater && state.status === "downloaded") updater.quitAndInstall(true, true);
        },
    };
}

module.exports = { createUpdater };
