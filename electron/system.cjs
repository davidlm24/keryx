// What the "Sistema" section of Settings can do: backups, export/import, the
// diagnostic bundle, updates. Electron-facing glue over backup.cjs,
// archive.cjs, logger.cjs and updater.cjs.

const fs = require("node:fs");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const yazl = require("yazl");
const backup = require("./backup.cjs");
const archive = require("./archive.cjs");
const closeGuard = require("./closeGuard.cjs");

const SETTINGS_KEY = "backup";

function dirSize(dir) {
    let total = 0;
    try {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            total += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
        }
    } catch { /* unreadable: report what was counted */ }
    return total;
}

// The data folder's size, for Configurações (which asks every few seconds):
// walking the folder blocks the main process, so it is measured at most
// once a minute.
const SIZE_TTL_MS = 60000;
function cachedSize(measure = dirSize, ttl = SIZE_TTL_MS) {
    const memo = new Map();
    return (dir, now = Date.now()) => {
        const hit = memo.get(dir);
        if (hit && now - hit.at < ttl) return hit.bytes;
        const bytes = measure(dir);
        memo.set(dir, { at: now, bytes });
        return bytes;
    };
}

const UPDATES_KEY = "updates";

function createSystem({ app, dialog, shell, BrowserWindow, store, dataDir, mediaDir, settings, outputs, updater, logger, screen, notifications = null }) {
    const dataSize = cachedSize();
    const autoUpdates = () => Boolean((settings.get(UPDATES_KEY, {}) || {}).auto);
    const updateState = () => ({ ...updater.state(), auto: autoUpdates() });
    const notify = (n) => { try { notifications?.add(n); } catch (err) { logger.warn(`[keryx-notifications] ${err.message}`); } };
    const defaultBackupDir = path.join(dataDir, "backups");
    const prefs = () => backup.backupPrefs(settings.get(SETTINGS_KEY, {}) || {});
    // Every write keeps the other backup settings (the folder, on/off, keep).
    const setPrefs = (patch) => {
        const next = { ...(settings.get(SETTINGS_KEY, {}) || {}), ...patch };
        for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
        settings.set(SETTINGS_KEY, next);
    };
    const configuredDir = () => prefs().dir;
    const parentWindow = (event) => (event ? BrowserWindow.fromWebContents(event.sender) : BrowserWindow.getFocusedWindow()) || undefined;
    const message = (event, options) => dialog.showMessageBox(parentWindow(event), { noLink: true, ...options });

    // The chosen folder when it is usable (a USB stick may be unplugged), else
    // the default one, so a backup is never silently skipped.
    function backupDir() {
        const chosen = configuredDir();
        if (chosen) {
            try {
                fs.mkdirSync(chosen, { recursive: true });
                fs.accessSync(chosen, fs.constants.W_OK);
                return { dir: chosen, fallback: false };
            } catch (err) {
                logger.warn(`[keryx-backup] pasta ${chosen} indisponível (${err.message}); usando a pasta padrão`);
                return { dir: defaultBackupDir, fallback: true };
            }
        }
        return { dir: defaultBackupDir, fallback: false };
    }

    // The media folder is mirrored only into a folder the church chose (a USB
    // stick, another disk, a Google Drive folder): a copy on the same disk as
    // the data would double the space and protect nothing. It runs in the
    // background (the first copy of the videos can take minutes) and never on
    // close, which cannot wait; files added since are copied the next time.
    let media = { running: false, last: null, error: "" };
    let mediaJob = null;
    let statsCache = null;
    function backupMedia(reason) {
        const { dir, fallback } = backupDir();
        if (!configuredDir() || fallback) return null;
        if (mediaJob) return mediaJob;
        media = { ...media, running: true, error: "" };
        mediaJob = backup.mirrorMedia({ mediaDir, dir }).then((r) => {
            media = { running: false, last: { at: new Date().toISOString(), copied: r.copied, bytes: r.bytes }, error: r.failed.length ? `${r.failed.length} arquivo(s) não copiado(s)` : "" };
            logger.info(`[keryx-backup] mídia (${reason}): ${r.copied} de ${r.files} copiados, ${r.bytes} bytes, em ${dir}`);
            for (const fail of r.failed.slice(0, 5)) logger.warn(`[keryx-backup] mídia: ${fail.name}: ${fail.error}`);
            if (r.failed.length) notify({ key: "backup-media", kind: "warn", title: "Algumas mídias não foram para o backup", body: `${r.failed.length} arquivo(s) não copiado(s) para ${dir}. Veja se o pen drive ou o disco tem espaço.`, action: "settings:backup" });
        }, (err) => {
            media = { running: false, last: media.last, error: err.message };
            notify({ key: "backup-media", kind: "warn", title: "As mídias não foram para o backup", body: err.message, action: "settings:backup" });
            logger.error(`[keryx-backup] mídia (${reason}) falhou: ${err.stack || err.message}`);
        }).finally(() => { mediaJob = null; statsCache = null; });
        return mediaJob;
    }
    function mediaInfo(dir, fallback) {
        if (!configuredDir() || fallback) return { enabled: false };
        if (!statsCache || statsCache.dir !== dir) statsCache = { dir, ...backup.mirrorStats(dir) };
        return { enabled: true, running: media.running, last: media.last, error: media.error, files: statsCache.files, bytes: statsCache.bytes };
    }

    // Automatic backups (opening and closing the KERYX) can be turned off;
    // the manual one and a new folder's first always run.
    const AUTOMATIC = ["ao abrir", "ao fechar"];
    function backupNow(reason) {
        if (AUTOMATIC.includes(reason) && !prefs().enabled) {
            logger.info(`[keryx-backup] ${reason}: backup automático desligado`);
            return null;
        }
        const { dir, fallback } = backupDir();
        if (fallback) notify({ key: "backup-fallback", kind: "warn", title: "Backup salvo na pasta padrão", body: `A pasta escolhida (${configuredDir()}) não estava disponível, então o backup foi para ${dir}. Conecte o pen drive ou escolha outra pasta.`, action: "settings:backup" });
        try {
            const result = backup.runBackup({ store, dir, keep: prefs().keep });
            logger.info(`[keryx-backup] ${reason}: ${result.file}${result.removed.length ? ` (removidos ${result.removed.length} antigos)` : ""}`);
            if (reason !== "ao fechar") backupMedia(reason);
            return result;
        } catch (err) {
            logger.error(`[keryx-backup] ${reason} falhou: ${err.stack || err.message}`);
            throw err;
        }
    }

    // Iniciar com o Windows: the system's own setting (Task Manager can turn
    // it off), only for the installed app (a dev run would register electron.exe).
    function machineInfo() {
        const login = app.isPackaged && app.getLoginItemSettings ? app.getLoginItemSettings({ path: process.execPath }) : null;
        return {
            ...closeGuard.machinePrefs(settings.get(closeGuard.MACHINE_KEY, {})),
            login: { available: Boolean(login), on: Boolean(login?.openAtLogin), blocked: Boolean(login?.openAtLogin && login.executableWillLaunchAtLogin === false) },
        };
    }

    function info() {
        const { dir, fallback } = backupDir();
        const list = backup.listBackups(dir);
        return {
            version: app.getVersion(),
            packaged: app.isPackaged,
            dataDir,
            dataBytes: dataSize(dataDir),
            backup: {
                dir,
                custom: Boolean(configuredDir()),
                fallback,
                keep: prefs().keep,
                enabled: prefs().enabled,
                count: list.length,
                last: list[0] ? { name: list[0].name, modified: list[0].modified, size: list[0].size } : null,
                media: mediaInfo(dir, fallback),
            },
            pendingImport: archive.hasPendingImport(dataDir),
            update: updateState(),
        };
    }

    async function exportAll(event) {
        const stamp = new Date().toISOString().slice(0, 10);
        const { canceled, filePath } = await dialog.showSaveDialog(parentWindow(event), {
            title: "Exportar tudo do KERYX",
            defaultPath: `keryx-exportacao-${stamp}.zip`,
            filters: [{ name: "Exportação do KERYX (zip)", extensions: ["zip"] }],
        });
        if (canceled || !filePath) return null;
        const result = await archive.exportAll({ store, mediaDir, target: filePath, appVersion: app.getVersion() });
        logger.info(`[keryx-export] ${result.file} (${result.media} arquivos de mídia, ${result.bytes} bytes)`);
        return result;
    }

    async function importAll(event) {
        const { canceled, filePaths } = await dialog.showOpenDialog(parentWindow(event), {
            title: "Importar uma exportação do KERYX",
            filters: [{ name: "Exportação do KERYX (zip)", extensions: ["zip"] }],
            properties: ["openFile"],
        });
        if (canceled || !filePaths[0]) return null;

        // Validate and unpack first, so a bad file is reported before anything is decided.
        const staged = await archive.stageImport({ zipFile: filePaths[0], dataDir });
        const answer = await message(event, {
            type: "warning",
            title: "Importar dados",
            message: "Importar substitui todos os dados atuais pelos do arquivo.",
            detail: `O arquivo tem ${staged.media} arquivo(s) de mídia (exportado em ${String(staged.manifest.exportedAt || "").slice(0, 10) || "data desconhecida"}).\n\n` +
                "Os dados de hoje não são apagados: ficam salvos numa pasta “before-import-…” dentro da pasta de dados. " +
                "O KERYX vai reiniciar agora.",
            buttons: ["Importar e reiniciar", "Cancelar"],
            defaultId: 1,
            cancelId: 1,
        });
        if (answer.response !== 0) {
            archive.discardPendingImport(dataDir);
            return { cancelled: true };
        }
        logger.info(`[keryx-import] ${filePaths[0]} preparado; reiniciando para aplicar`);
        app.relaunch();
        app.exit(0);
        return { restarting: true };
    }

    // The daily backups in the backup folder, newest first, for "Restaurar".
    function backupList() {
        const { dir } = backupDir();
        return {
            dir,
            backups: backup.listBackups(dir).map(({ name, day, size, modified }) => ({ name, day, size, modified })),
            mirror: backup.mirrorStats(dir),
        };
    }

    // "Restaurar um backup": staged like an import (archive.stageRestore), then
    // asked once more, then a restart applies it before the database opens.
    // Today's data is moved to before-import-<time>/, never deleted.
    async function restoreBackup(event, name) {
        const { dir } = backupDir();
        const found = backup.listBackups(dir).find((b) => b.name === name);
        if (!found) throw new Error("Esse backup não está mais na pasta de backup.");
        const mirrorDir = path.join(dir, "media");
        const staged = await archive.stageRestore({ dataDir, dbFile: found.file, mediaDir, mirrorDir: fs.existsSync(mirrorDir) ? mirrorDir : null });
        const day = found.day.split("-").reverse().join("/");
        const answer = await message(event, {
            type: "warning",
            title: "Restaurar backup",
            message: `Restaurar o backup de ${day} substitui os dados atuais.`,
            detail: `Músicas, setlists, avisos, anotações e configurações das telas voltam a como estavam em ${day}.` +
                (staged.fromBackup ? ` ${staged.fromBackup} arquivo(s) de mídia apagados desde então voltam da cópia no backup.` : "") +
                "\n\nOs dados de hoje não são apagados: ficam numa pasta “before-import-…” dentro da pasta de dados. O KERYX vai reiniciar agora.",
            buttons: ["Restaurar e reiniciar", "Cancelar"],
            defaultId: 1,
            cancelId: 1,
        });
        if (answer.response !== 0) {
            archive.discardPendingImport(dataDir);
            return { cancelled: true };
        }
        logger.info(`[keryx-restore] ${found.file} preparado (${staged.media} mídias, ${staged.fromBackup} do backup); reiniciando para aplicar`);
        app.relaunch();
        app.exit(0);
        return { restarting: true };
    }

    async function chooseBackupDir(event) {
        const { canceled, filePaths } = await dialog.showOpenDialog(parentWindow(event), {
            title: "Pasta para os backups automáticos",
            properties: ["openDirectory", "createDirectory"],
        });
        // Closing the picker changes nothing (and says nothing).
        if (canceled || !filePaths[0]) return { ...info(), canceled: true };
        setPrefs({ dir: filePaths[0] });
        backupNow("pasta alterada");
        return info();
    }

    function resetBackupDir() {
        setPrefs({ dir: undefined });
        return info();
    }

    function gatherDiagnostics() {
        const displays = screen.getAllDisplays().map((d) => ({ id: d.id, label: d.label, bounds: d.bounds, scaleFactor: d.scaleFactor, primary: d.id === screen.getPrimaryDisplay().id }));
        let bibles = {};
        try {
            bibles = require("./bible.cjs").installedVersions(store);
        } catch { /* not fatal */ }
        return {
            generatedAt: new Date().toISOString(),
            app: { name: app.getName(), version: app.getVersion(), packaged: app.isPackaged },
            versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
            system: { platform: process.platform, arch: process.arch },
            displays,
            outputs: outputs.list().outputs.map(({ key, assignment, placement, open }) => ({ key, assignment, placement, open })),
            data: { dataDir, bytes: dirSize(dataDir), bibles, backups: info().backup },
            update: updater.state(),
        };
    }

    async function diagnostics(event) {
        const stamp = new Date().toISOString().slice(0, 10);
        const { canceled, filePath } = await dialog.showSaveDialog(parentWindow(event), {
            title: "Salvar diagnóstico",
            defaultPath: `keryx-diagnostico-${stamp}.zip`,
            filters: [{ name: "Diagnóstico (zip)", extensions: ["zip"] }],
        });
        if (canceled || !filePath) return null;
        const zip = new yazl.ZipFile();
        zip.addBuffer(Buffer.from(JSON.stringify(gatherDiagnostics(), null, 2)), "sistema.json");
        for (const file of logger.recentFiles(3)) zip.addFile(file, `logs/${path.basename(file)}`);
        zip.end();
        await pipeline(zip.outputStream, fs.createWriteStream(filePath));
        return { file: filePath };
    }

    return {
        backupNow,
        backupMedia,
        notifications,
        info,
        ops: {
            info: async () => info(),
            backupNow: async () => { backupNow("manual"); return info(); },
            // Configurações › Console: this computer's choices.
            machineGet: async () => machineInfo(),
            machineSet: async (_event, { confirmClose } = {}) => {
                const cur = settings.get(closeGuard.MACHINE_KEY, {}) || {};
                if (confirmClose !== undefined) settings.set(closeGuard.MACHINE_KEY, { ...cur, confirmClose: Boolean(confirmClose) });
                return machineInfo();
            },
            loginSet: async (_event, { on } = {}) => {
                if (!app.isPackaged) throw Object.assign(new Error("Só no KERYX instalado."), { status: 400 });
                app.setLoginItemSettings(loginItemArgs(Boolean(on), process.execPath));
                return machineInfo();
            },
            backupSet: async (_event, { enabled, keep } = {}) => {
                const patch = {};
                if (enabled !== undefined) patch.enabled = Boolean(enabled);
                if (keep !== undefined) patch.keep = backup.normalizeKeep(keep);
                setPrefs(patch);
                return info();
            },
            chooseBackupDir: async (event) => chooseBackupDir(event),
            resetBackupDir: async () => resetBackupDir(),
            openBackupDir: async () => { await shell.openPath(backupDir().dir); return null; },
            openDataDir: async () => { await shell.openPath(dataDir); return null; },
            exportAll: async (event) => exportAll(event),
            importAll: async (event) => importAll(event),
            backupList: async () => backupList(),
            restoreBackup: async (event, { name }) => restoreBackup(event, name),
            diagnostics: async (event) => diagnostics(event),
            updateCheck: async () => { await updater.check(); return info(); },
            updateState: async () => updateState(),
            updateSetAuto: async (_event, { on }) => {
                settings.set(UPDATES_KEY, { ...(settings.get(UPDATES_KEY, {}) || {}), auto: Boolean(on) });
                if (on && updater.state().status === "available") updater.download();
                else if (on && updater.enabled() && ["idle", "none", "error"].includes(updater.state().status)) updater.check();
                return updateState();
            },
            notifications: async () => notifications?.list() || [],
            notificationsRead: async () => notifications?.markAllRead() || [],
            notificationDismiss: async (_event, { id }) => notifications?.dismiss(id) || [],
            notificationsClear: async () => notifications?.clear() || [],
            updateDownload: async () => { updater.download(); return info(); },
            updateInstall: async () => { updater.installAndRestart(); return info(); },
        },
    };
}

// The arguments for app.setLoginItemSettings.
const loginItemArgs = (on, exe) => ({ openAtLogin: Boolean(on), path: exe });

module.exports = { createSystem, cachedSize, loginItemArgs };
