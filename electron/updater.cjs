// Updates from GitHub Releases through electron-updater, on the operator's
// terms. By default it checks and tells; it downloads and installs only when
// asked. With "Atualizar automaticamente" (isAuto) a version it finds is
// downloaded right away; installing still waits for the console, which does
// it only while nothing is on air (src/lib/console/updates.js). Every state
// change is pushed (onChange) so the console shows the progress live.
//
// It is off unless the build was made with a `publish` target: electron-builder
// then writes resources/app-update.yml, and only a packaged app with that file
// can update. Otherwise status stays "disabled" and Settings says why.

const fs = require("node:fs");
const path = require("node:path");

// The release notes, as plain text for the popup and the bell. They come as
// the Markdown of the notes file (latest.yml) or as the HTML GitHub renders
// from it (the release feed), or as a list of { version, note }.
const NOTES_MAX = 1200;
function notesText(raw) {
    if (Array.isArray(raw)) return notesText(raw.map((r) => (r && r.note) || "").join("\n\n"));
    let s = String(raw || "");
    if (/<[a-z][\s\S]*>/i.test(s)) {
        s = s
            .replace(/<li[^>]*>/gi, "\n• ")
            .replace(/<\/(p|h[1-6]|ul|ol|li|div)>/gi, "\n")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<[^>]+>/g, "")
            .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    } else {
        s = s
            .replace(/^[ \t]*#{1,6}[ \t]*/gm, "")
            .replace(/^[ \t]*[-*][ \t]+/gm, "• ")
            .replace(/\*\*([^*]+)\*\*/g, "$1")
            .replace(/`([^`]+)`/g, "$1");
    }
    // One line per item: list items sit together, paragraphs keep one blank line.
    s = s.split("\n").map((l) => l.trim()).join("\n").replace(/\n{3,}/g, "\n\n").replace(/\n\n(?=• )/g, "\n").trim();
    if (s === "No content.") return "";
    return s.length > NOTES_MAX ? `${s.slice(0, NOTES_MAX - 1).trimEnd()}…` : s;
}

// After an update, the bell says so once, with what that version brings when
// its notes were saved at download (settings.pendingNotes).
function installedNote({ lastVersion, version, pending }) {
    if (!lastVersion || lastVersion === version) return null;
    const notes = pending && pending.version === version ? pending.notes : "";
    return {
        key: `updated:${version}`,
        kind: "info",
        title: `KERYX atualizado para a versão ${version}`,
        body: notes ? `O que mudou:\n${notes}` : `Antes: ${lastVersion}.`,
    };
}

function createUpdater({ app, log = () => {}, loadUpdater = () => require("electron-updater").autoUpdater, isAuto = () => false, onChange = () => {} }) {
    let state = { status: "disabled", message: "As atualizações automáticas não estão configuradas nesta instalação.", version: null, notes: "", percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 };
    let updater = null;

    const set = (patch) => {
        const before = state;
        state = { ...state, ...patch };
        try { onChange(state, before); } catch (err) { log(`[keryx-updater] onChange: ${err.message}`); }
    };
    const configured = app.isPackaged && fs.existsSync(path.join(process.resourcesPath || "", "app-update.yml"));

    if (configured) {
        try {
            updater = loadUpdater();
            updater.autoDownload = false;
            updater.autoInstallOnAppQuit = false;
            updater.allowPrerelease = false;
            updater.logger = { info: log, warn: log, error: log, debug: () => {} };
            updater.on("checking-for-update", () => set({ status: "checking", message: "Procurando atualizações…" }));
            updater.on("update-available", (info) => {
                set({ status: "available", version: info.version, notes: notesText(info.releaseNotes), message: `A versão ${info.version} está disponível.` });
                if (isAuto()) updater.downloadUpdate().catch(() => { /* error event */ });
            });
            updater.on("update-not-available", () => set({ status: "none", message: "Você está na versão mais recente." }));
            updater.on("download-progress", (p) => set({
                status: "downloading",
                percent: Math.round(p.percent || 0),
                transferred: p.transferred || 0,
                total: p.total || 0,
                bytesPerSecond: p.bytesPerSecond || 0,
                message: `Baixando… ${Math.round(p.percent || 0)}%`,
            }));
            updater.on("update-downloaded", (info) => set({ status: "downloaded", version: info.version, notes: notesText(info.releaseNotes) || state.notes || "", percent: 100, message: `A versão ${info.version} foi baixada e será instalada ao reiniciar.` }));
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
            if (!updater || state.status === "downloading" || state.status === "downloaded") return state;
            try {
                await updater.checkForUpdates();
            } catch { /* the error event already set the state */ }
            return state;
        },
        async download() {
            if (!updater || (state.status !== "available" && state.status !== "error") || !state.version) return state;
            set({ status: "downloading", percent: 0, transferred: 0, total: 0, bytesPerSecond: 0, message: "Baixando… 0%" });
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

module.exports = { createUpdater, notesText, installedNote };
