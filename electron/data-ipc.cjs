// Bridges the renderer to the local store and media library.
//   keryx:db            invoke  { entity, op, args } -> { data } | { error }
//   keryx:db-change     event   store change, sent to every window
//   keryx:media-import  invoke  { sourcePath | bytes, name } -> { fileName }
//   keryx:media-info    invoke  { names } -> { [name]: { exists, size } } files in the media folder
//   keryx:config        sync    { mediaBaseUrl }
//   keryx:displays:*    invoke  list / set / open / close / identify for output windows
//   keryx:bible:*       invoke  installed versions, install from the web or a file, one online chapter
//   keryx:system        invoke  { op } backups, export/import, diagnostics, updates
//   keryx:network       invoke  { op, args } screens on the church network
//   keryx:lyrics        invoke  { op: search | get, args } lyrics from the web
//   keryx:live:get      invoke  -> live state snapshot (shared/live-state.mjs)
//   keryx:live:call     invoke  { op, args } -> the new snapshot | { error }
//   keryx:live-change   event   the whole snapshot, sent to every window after each change
//   keryx:meter         send    { layer, url, duration } the length of the item an output
//                               plays, relayed to the other windows (the console's seek bar)

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { BrowserWindow, dialog, ipcMain } = require("electron");
const bible = require("./bible.cjs");

function safeExtension(name) {
    const ext = path.extname(String(name || "")).toLowerCase();
    return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : "";
}

function registerDataIpc({ store, outputs, system, network, live, lyrics, mediaDir, mediaBaseUrl, isTrustedSender, log }) {
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

    ipcMain.handle("keryx:media-import", async (event, payload) => {
        if (!isTrustedSender(event)) return reject;
        const { sourcePath, bytes, name } = payload || {};
        try {
            const fileName = crypto.randomUUID() + safeExtension(name || sourcePath);
            const target = path.join(mediaDir, fileName);
            if (sourcePath) {
                const stat = await fs.promises.stat(sourcePath);
                if (!stat.isFile()) throw new Error("não é um arquivo");
                await fs.promises.copyFile(sourcePath, target);
            } else if (bytes) {
                await fs.promises.writeFile(target, Buffer.from(bytes));
            } else {
                return { error: { message: "Nenhum arquivo fornecido.", status: 400 } };
            }
            return { data: { fileName } };
        } catch (err) {
            log(`[keryx-media] import failed: ${err && err.message}`);
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

    const bibleOp = (fn) => async (event, payload) => {
        if (!isTrustedSender(event)) return reject;
        try {
            return { data: await fn(event, payload || {}) };
        } catch (err) {
            if (!err.status) log(`[keryx-bible] ${err && err.stack}`);
            return { error: { message: err.message, status: err.status || 500 } };
        }
    };
    ipcMain.handle("keryx:bible:status", bibleOp(() => bible.installedVersions(store)));
    ipcMain.handle("keryx:bible:online-chapter", bibleOp((_e, args) => bible.fetchOnlineChapter(args)));
    ipcMain.handle("keryx:bible:install", bibleOp((_e, { version }) => bible.installFromSource(store, version)));
    ipcMain.handle("keryx:bible:install-file", bibleOp(async (event, { version }) => {
        const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
            title: `Escolha o arquivo JSON da ${version}`,
            filters: [{ name: "Bíblia (JSON)", extensions: ["json"] }],
            properties: ["openFile"],
        });
        if (canceled || !filePaths[0]) return null;
        return bible.installFromJson(store, version, await fs.promises.readFile(filePaths[0], "utf8"));
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
        if (!lyrics || !["search", "get"].includes(op)) return { error: { message: `Operação desconhecida: ${op}.`, status: 400 } };
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

    ipcMain.on("keryx:config", (event) => {
        event.returnValue = { mediaBaseUrl };
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
