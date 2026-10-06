// Bridges the renderer to the local store and media library.
//   keryx:db            invoke  { entity, op, args } -> { data } | { error }
//   keryx:db-change     event   store change, sent to every window
//   keryx:media-import  invoke  { sourcePath | bytes, name } -> { fileName }
//   keryx:config        sync    { mediaBaseUrl }
//   keryx:displays:*    invoke  list / set / close / identify for output windows
//   keryx:bible:*       invoke  installed versions, install from the web or a file

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { BrowserWindow, dialog, ipcMain } = require("electron");
const bible = require("./bible.cjs");

function safeExtension(name) {
    const ext = path.extname(String(name || "")).toLowerCase();
    return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : "";
}

function registerDataIpc({ store, outputs, mediaDir, mediaBaseUrl, isTrustedSender, log }) {
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
    ipcMain.handle("keryx:displays:identify", outputsOp(() => { outputs.identify(); return true; }));

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
