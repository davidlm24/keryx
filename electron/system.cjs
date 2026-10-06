// What the "Sistema" section of Settings can do: backups, export/import, the
// diagnostic bundle, updates. Electron-facing glue over backup.cjs,
// archive.cjs, logger.cjs and updater.cjs.

const fs = require("node:fs");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const yazl = require("yazl");
const backup = require("./backup.cjs");
const archive = require("./archive.cjs");

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

function createSystem({ app, dialog, shell, BrowserWindow, store, dataDir, mediaDir, settings, outputs, updater, logger, screen }) {
    const defaultBackupDir = path.join(dataDir, "backups");
    const configuredDir = () => (settings.get(SETTINGS_KEY, {}) || {}).dir || "";
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

    function backupNow(reason) {
        const { dir } = backupDir();
        try {
            const result = backup.runBackup({ store, dir });
            logger.info(`[keryx-backup] ${reason}: ${result.file}${result.removed.length ? ` (removidos ${result.removed.length} antigos)` : ""}`);
            return result;
        } catch (err) {
            logger.error(`[keryx-backup] ${reason} falhou: ${err.stack || err.message}`);
            throw err;
        }
    }

    function info() {
        const { dir, fallback } = backupDir();
        const list = backup.listBackups(dir);
        return {
            version: app.getVersion(),
            packaged: app.isPackaged,
            dataDir,
            dataBytes: dirSize(dataDir),
            backup: {
                dir,
                custom: Boolean(configuredDir()),
                fallback,
                keep: backup.KEEP,
                count: list.length,
                last: list[0] ? { name: list[0].name, modified: list[0].modified, size: list[0].size } : null,
            },
            pendingImport: archive.hasPendingImport(dataDir),
            update: updater.state(),
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

    async function chooseBackupDir(event) {
        const { canceled, filePaths } = await dialog.showOpenDialog(parentWindow(event), {
            title: "Pasta para os backups automáticos",
            properties: ["openDirectory", "createDirectory"],
        });
        if (canceled || !filePaths[0]) return info();
        settings.set(SETTINGS_KEY, { dir: filePaths[0] });
        backupNow("pasta alterada");
        return info();
    }

    function resetBackupDir() {
        settings.set(SETTINGS_KEY, {});
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
        info,
        ops: {
            info: async () => info(),
            backupNow: async () => { backupNow("manual"); return info(); },
            chooseBackupDir: async (event) => chooseBackupDir(event),
            resetBackupDir: async () => resetBackupDir(),
            openBackupDir: async () => { await shell.openPath(backupDir().dir); return null; },
            openDataDir: async () => { await shell.openPath(dataDir); return null; },
            exportAll: async (event) => exportAll(event),
            importAll: async (event) => importAll(event),
            diagnostics: async (event) => diagnostics(event),
            updateCheck: async () => { await updater.check(); return info(); },
            updateDownload: async () => { await updater.download(); return info(); },
            updateInstall: async () => { updater.installAndRestart(); return info(); },
        },
    };
}

module.exports = { createSystem };
