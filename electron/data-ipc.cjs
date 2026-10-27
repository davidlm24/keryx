// Bridges the renderer to the local store and media library.
//   keryx:db            invoke  { entity, op, args } -> { data } | { error }
//   keryx:db-change     event   store change, sent to every window
//   keryx:media-import  invoke  { sourcePath | bytes | size, name } -> { fileName } (electron/mediaImport.cjs)
//   keryx:media-info    invoke  { names } -> { [name]: { exists, size } } files in the media folder
//   keryx:config        sync    { mediaBaseUrl, mediaImportMaxBytes }
//   keryx:displays:*    invoke  list / set / open / close / identify for output windows
//   keryx:package       invoke  { op: export | open | fits | read | take | close } the .keryx package (keryxPackage.cjs)
//   keryx:bible:*       invoke  installed versions, install from the web or a file, one online chapter, the church's own editions (keryx:bible:own)
//   keryx:fonts         invoke  { op: list | read, id } the PC's installed fonts (systemFonts.cjs): the
//                               families with their faces, or one face's file as bytes
//   keryx:system        invoke  { op } backups, export/import, diagnostics, updates
//   keryx:network       invoke  { op, args } screens on the church network
//   keryx:sync          invoke  { op, args } sync between the church's computers (syncControl.cjs)
//   keryx:lyrics        invoke  { op: search | get | recordings, args } lyrics from the web
//   keryx:live:get      invoke  -> live state snapshot (shared/live-state.mjs)
//   keryx:live:call     invoke  { op, args } -> the new snapshot | { error }
//   keryx:live-change   event   the whole snapshot, sent to every window after each change
//   keryx:meter         send    { layer, url, duration } the length of the item an output
//                               plays, relayed to the other windows (the console's seek bar)
//   keryx:audio-level   send    a number 0..1: the level of the PC's sound output, measured by
//                               the console, relayed to the other windows (audio-reactive backgrounds)

const fs = require("node:fs");
const path = require("node:path");
const { BrowserWindow, dialog, ipcMain } = require("electron");
const bible = require("./bible.cjs");
const bibleFormats = require("./bibleFormats.cjs");
const { createSystemFonts } = require("./systemFonts.cjs");
const { importMedia, MAX_IMPORT_BYTES } = require("./mediaImport.cjs");
const { createPackages } = require("./keryxPackage.cjs");

function registerDataIpc({ store, outputs, system, network, sync, live, lyrics, mediaDir, mediaBaseUrl, isTrustedSender, log }) {
    const reject = { error: { message: "Origem não autorizada.", status: 403 } };

    ipcMain.handle("keryx:db", (event, payload) => {
        if (!isTrustedSender(event)) return reject;
        const { entity, op, args } = payload || {};
        try {
            return { data: store.call(entity, op, args) };
        } catch (err) {
            if (err && err.status) return { error: { message: err.message, status: err.status } };
            log(`[keryx-db] ${entity}.${op}: ${err && err.stack}`);
            return { error: { message: `Erro na base de dados local: ${err && err.message}`, status: 500 } };
        }
    });

    // Size, free space and the partial file: electron/mediaImport.cjs.
    ipcMain.handle("keryx:media-import", async (event, payload) => {
        if (!isTrustedSender(event)) return reject;
        const { sourcePath, bytes, name, size } = payload || {};
        try {
            return await importMedia({ mediaDir, sourcePath, bytes, name, size }, { log });
        } catch (err) {
            log(`[keryx-media] import failed: ${err && err.stack}`);
            return { error: { message: `Não foi possível salvar o arquivo: ${err && err.message}`, status: 500 } };
        }
    });

    // Which media files are still there (a Media row whose file was moved or
    // lost shows "Arquivo não encontrado") and how big they are.
    ipcMain.handle("keryx:media-info", async (event, payload) => {
        if (!isTrustedSender(event)) return reject;
        const names = Array.isArray(payload?.names) ? payload.names.slice(0, 2000) : [];
        const out = {};
        await Promise.all(names.map(async (name) => {
            const base = path.basename(String(name || ""));
            if (!base || base !== name) { out[name] = { exists: false, size: 0 }; return; }
            try {
                const stat = await fs.promises.stat(path.join(mediaDir, base));
                out[name] = { exists: stat.isFile(), size: stat.size };
            } catch {
                out[name] = { exists: false, size: 0 };
            }
        }));
        return { data: out };
    });

    const outputsOp = (fn) => (event, payload) => {
        if (!isTrustedSender(event)) return reject;
        try {
            return { data: fn(payload || {}) };
        } catch (err) {
            return { error: { message: err.message, status: 400 } };
        }
    };
    ipcMain.handle("keryx:displays:list", outputsOp(() => outputs.list()));
    ipcMain.handle("keryx:displays:set", outputsOp(({ key, assignment }) => outputs.setAssignment(key, assignment)));
    ipcMain.handle("keryx:displays:close", outputsOp(({ key }) => { outputs.close(key); return outputs.list(); }));
    ipcMain.handle("keryx:displays:open", outputsOp(({ key }) => outputs.open(key)));
    ipcMain.handle("keryx:displays:identify", outputsOp(() => { outputs.identify(); return true; }));
    // Exportar / Importar ajustes das saídas (src/lib/outputsFile.js): the main
    // process only saves the file the console built and reads one back; the
    // console checks it and applies it through displays.set and OutputPref.
    const MAX_OUTPUTS_FILE = 1024 * 1024;
    const fileOp = (fn) => async (event, payload) => {
        if (!isTrustedSender(event)) return reject;
        try {
            return { data: await fn(event, payload || {}) };
        } catch (err) {
            log(`[keryx-outputs-file] ${err && err.stack}`);
            return { error: { message: err.message || "Não foi possível usar o arquivo.", status: err.status || 500 } };
        }
    };
    ipcMain.handle("keryx:displays:export-file", fileOp(async (event, { json, name }) => {
        if (typeof json !== "string" || json.length > MAX_OUTPUTS_FILE) throw Object.assign(new Error("Ajustes das saídas grandes demais para exportar."), { status: 413 });
        const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
            title: "Exportar ajustes das saídas",
            defaultPath: typeof name === "string" && /^[\w.-]{1,80}\.json$/.test(name) ? name : "keryx-saidas.json",
            filters: [{ name: "Ajustes das saídas do KERYX (JSON)", extensions: ["json"] }],
        });
        if (canceled || !filePath) return null;
        await fs.promises.writeFile(filePath, json, "utf8");
        return { file: filePath };
    }));
    ipcMain.handle("keryx:displays:import-file", fileOp(async (event) => {
        const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
            title: "Importar ajustes das saídas",
            filters: [{ name: "Ajustes das saídas do KERYX (JSON)", extensions: ["json"] }],
            properties: ["openFile"],
        });
        if (canceled || !filePaths[0]) return null;
        const { size } = await fs.promises.stat(filePaths[0]);
        if (size > MAX_OUTPUTS_FILE) throw Object.assign(new Error("Este arquivo é grande demais para ser um arquivo de saídas do KERYX."), { status: 413 });
        return { text: await fs.promises.readFile(filePaths[0], "utf8"), name: path.basename(filePaths[0]) };
    }));

    // The KERYX package (electron/keryxPackage.cjs; src/lib/keryxPackage.js
    // decides the rows): export writes the selection's rows and files where
    // the operator chooses; open reads one (picked here, or a file the page
    // was given, by its path): its manifest and rows only; fits says whether
    // the files the operator's choice needs fit on the disk; read gives a range
    // of one file's bytes (a video's codec, checked before the copy); take unpacks one
    // and copies it into the media folder (a new name, as any import); close
    // forgets it. The rows themselves are written by the page, through the
    // store.
    const packages = createPackages({ root: path.join(path.dirname(mediaDir), "pacotes"), mediaDir, importMedia, log });
    const MAX_PACKAGE_JSON = 64 * 1024 * 1024;
    const PACKAGE_FILES = [{ name: "Pacote do KERYX", extensions: ["keryx"] }];
    ipcMain.handle("keryx:package", fileOp(async (event, { op, ...args }) => {
        if (op === "export") {
            const items = JSON.stringify(args.items || {});
            if (items.length > MAX_PACKAGE_JSON) throw Object.assign(new Error("Itens demais para um pacote só. Exporte em partes."), { status: 413 });
            const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
                title: "Exportar pacote do KERYX",
                defaultPath: typeof args.name === "string" && /^[\w.-]{1,90}\.keryx$/.test(args.name) ? args.name : "keryx.keryx",
                filters: PACKAGE_FILES,
            });
            if (canceled || !filePath) return null;
            return packages.write({ target: filePath, manifest: args.manifest, items: JSON.parse(items), files: args.files });
        }
        if (op === "open") {
            let file = typeof args.sourcePath === "string" ? args.sourcePath : "";
            if (file && (!path.isAbsolute(file) || !/\.keryx$/i.test(file))) throw Object.assign(new Error("Este arquivo não é um pacote do KERYX."), { status: 400 });
            if (!file) {
                const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { title: "Abrir pacote do KERYX", filters: PACKAGE_FILES, properties: ["openFile"] });
                if (canceled || !filePaths[0]) return null;
                file = filePaths[0];
            }
            return { ...(await packages.open(file)), name: path.basename(file) };
        }
        if (op === "fits") return packages.fits(args.id, Array.isArray(args.entries) ? args.entries.slice(0, 20000) : []);
        if (op === "read") return packages.read(args.id, args.entry, args.offset, args.length);
        if (op === "take") return packages.take(args.id, args.entry);
        if (op === "close") return packages.close(args.id);
        throw Object.assign(new Error("Operação de pacote desconhecida."), { status: 400 });
    }));

    const bibleOp = (fn) => async (event, payload) => {
        if (!isTrustedSender(event)) return reject;
        try {
            return { data: await fn(event, payload || {}) };
        } catch (err) {
            if (!err.status) log(`[keryx-bible] ${err && err.stack}`);
            return { error: { message: err.message, status: err.status || 500 } };
        }
    };
    // The PC's fonts for the Editor de temas' "Do computador…" (owner
    // 2026-10-20, as Holyrics lists them): read here, from the font folders,
    // so no Chromium permission is involved. A face's file goes back as
    // bytes, and the page copies it into the library like any upload.
    const systemFonts = createSystemFonts();
    ipcMain.handle("keryx:fonts", bibleOp(async (_e, { op, id }) => {
        if (op === "list") return systemFonts.list();
        if (op === "read") return new Uint8Array(await systemFonts.read(id));
        throw Object.assign(new Error("Operação de fontes desconhecida."), { status: 400 });
    }));
    ipcMain.handle("keryx:bible:status", bibleOp(() => bible.installedVersions(store)));
    ipcMain.handle("keryx:bible:online-chapter", bibleOp((_e, args) => bible.fetchOnlineChapter(args)));
    ipcMain.handle("keryx:bible:install", bibleOp((_e, { version }) => bible.installFromSource(store, version)));
    // The Bible files the readers know (electron/bibleFormats.cjs); PDF and
    // Word are listed so choosing one says what to do instead.
    const BIBLE_FILES = [
        { name: "Bíblia (USFM, VPL, OSIS, Zefania, MySword, JSON ou zip)", extensions: ["usfm", "sfm", "txt", "xml", "osis", "mybible", "json", "zip"] },
        { name: "Todos os arquivos", extensions: ["*"] },
    ];
    const pickBible = async (event, title) => {
        const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { title, filters: BIBLE_FILES, properties: ["openFile"] });
        if (canceled || !filePaths[0]) return null;
        const { size } = await fs.promises.stat(filePaths[0]);
        if (size > bibleFormats.MAX_FILE_BYTES) throw Object.assign(new Error("O arquivo da Bíblia é grande demais."), { status: 413 });
        return { bytes: await fs.promises.readFile(filePaths[0]), name: path.basename(filePaths[0]) };
    };
    ipcMain.handle("keryx:bible:install-file", bibleOp(async (event, { version }) => {
        const file = await pickBible(event, `Escolha o arquivo da ${version}`);
        return file ? bible.installFromFile(store, version, file.bytes, file.name) : null;
    }));
    // Instalar uma edição própria…: read the file the church picks (what the
    // dialog shows), then install it with its sigla and name, or delete one.
    const own = bible.createOwnInstaller(store);
    ipcMain.handle("keryx:bible:own", bibleOp(async (event, { op, ...args }) => {
        if (op === "read") {
            const file = await pickBible(event, "Escolha o arquivo da edição");
            return file ? own.inspect(file.bytes, file.name) : null;
        }
        if (op === "install") return own.install(args);
        if (op === "remove") return own.remove(args.sigla);
        throw Object.assign(new Error("Operação de Bíblia desconhecida."), { status: 400 });
    }));

    ipcMain.handle("keryx:system", async (event, payload) => {
        if (!isTrustedSender(event)) return reject;
        const op = payload && payload.op;
        if (!Object.prototype.hasOwnProperty.call(system.ops, op)) return { error: { message: `Operação desconhecida: ${op}.`, status: 400 } };
        try {
            return { data: await system.ops[op](event, (payload && payload.args) || {}) };
        } catch (err) {
            log(`[keryx-system] ${op}: ${err && err.stack}`);
            return { error: { message: err.message || "Falha na operação.", status: err.status || 500 } };
        }
    });

    // Lyrics from the web (electron/lyrics.cjs): search, get.
    ipcMain.handle("keryx:lyrics", async (event, payload) => {
        if (!isTrustedSender(event)) return reject;
        const { op, args } = payload || {};
        if (!lyrics || !["search", "get", "recordings"].includes(op)) return { error: { message: `Operação desconhecida: ${op}.`, status: 400 } };
        try {
            return { data: await lyrics[op](args) };
        } catch (err) {
            if (!err.status) log(`[keryx-lyrics] ${op}: ${err && err.stack}`);
            return { error: { message: err.message || "Falha na busca de letras.", status: err.status || 500 } };
        }
    });

    ipcMain.handle("keryx:network", async (event, payload) => {
        if (!isTrustedSender(event)) return reject;
        const { op, args } = payload || {};
        if (!Object.prototype.hasOwnProperty.call(network.ops, op)) return { error: { message: `Operação desconhecida: ${op}.`, status: 400 } };
        try {
            return { data: await network.ops[op](event, args) };
        } catch (err) {
            if (!err.status) log(`[keryx-network] ${op}: ${err && err.stack}`);
            return { error: { message: err.message || "Falha na operação.", status: err.status || 500 } };
        }
    });

    ipcMain.handle("keryx:sync", async (event, payload) => {
        if (!isTrustedSender(event)) return reject;
        const { op, args } = payload || {};
        if (!sync || !Object.prototype.hasOwnProperty.call(sync.ops, op)) return { error: { message: `Operação desconhecida: ${op}.`, status: 400 } };
        try {
            return { data: await sync.ops[op](event, args || {}) };
        } catch (err) {
            if (!err.status) log(`[keryx-sync] ${op}: ${err && err.stack}`);
            // code: googleAuth's ("canceled", "denied", "timeout", …), so the
            // page tells a Cancelar from a failure.
            return { error: { message: err.message || "Falha na sincronização.", status: err.status || 500, ...(typeof err.code === "string" ? { code: err.code } : {}) } };
        }
    });

    // Outputs are app windows too: they may report "this video ended".
    ipcMain.handle("keryx:live:get", (event) => (isTrustedSender(event) ? { data: live.get() } : reject));
    ipcMain.handle("keryx:live:call", (event, payload) => {
        if (!isTrustedSender(event)) return reject;
        const { op, args } = payload || {};
        try {
            return { data: live.call(op, args) };
        } catch (err) {
            if (err && err.status) return { error: { message: err.message, status: err.status } };
            log(`[keryx-live] ${op}: ${err && err.stack}`);
            return { error: { message: `Falha na projeção: ${err && err.message}`, status: 500 } };
        }
    });
    // Same timing as db changes: after the caller's reply.
    live.onChange((snapshot) => {
        setImmediate(() => {
            for (const win of BrowserWindow.getAllWindows()) {
                if (!win.isDestroyed()) win.webContents.send("keryx:live-change", snapshot);
            }
        });
    });

    // An output reports how long the item it plays is (for the console's
    // seek bar), once a second. Not part of the live state: nothing is
    // stored, and a window that is not listening simply drops it. Levels are
    // not relayed: the console measures the system output itself.
    ipcMain.on("keryx:meter", (event, payload) => {
        if (!isTrustedSender(event) || !payload || !["media", "video", "audio"].includes(payload.layer)) return;
        if (!Number.isFinite(payload.duration) || payload.duration <= 0) return;
        const clean = {
            layer: payload.layer,
            duration: payload.duration,
            url: typeof payload.url === "string" ? payload.url.slice(0, 2000) : "",
        };
        for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed() && win.webContents !== event.sender) win.webContents.send("keryx:meter", clean);
        }
    });

    // The console measures the system output (its level meters) and, while a
    // generated background follows the sound (shared/generators.mjs
    // gen.audio), sends the level ~20 times a second; the outputs on this
    // computer get it here. Never stored, never on the network.
    ipcMain.on("keryx:audio-level", (event, level) => {
        if (!isTrustedSender(event) || typeof level !== "number" || !Number.isFinite(level)) return;
        const clean = Math.min(1, Math.max(0, level));
        for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed() && win.webContents !== event.sender) win.webContents.send("keryx:audio-level", clean);
        }
    });

    ipcMain.on("keryx:config", (event) => {
        event.returnValue = { mediaBaseUrl, mediaImportMaxBytes: MAX_IMPORT_BYTES };
    });

    // Every window hears every change, including the one that made it:
    // projection pages subscribe to the rows the operator page writes. Sent
    // after the write's reply, as realtime did over the network, so a page
    // never sees the echo of its own write before its await returns.
    return store.onChange((change) => {
        setImmediate(() => {
            for (const win of BrowserWindow.getAllWindows()) {
                if (!win.isDestroyed()) win.webContents.send("keryx:db-change", change);
            }
        });
    });
}

module.exports = { registerDataIpc };
