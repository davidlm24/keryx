// Bridges the renderer to the local store and media library.
//   keryx:db            invoke  { entity, op, args } -> { data } | { error }
//   keryx:db-change     event   store change, sent to every window
//   keryx:media-import  invoke  { sourcePath | bytes, name } -> { fileName }
//   keryx:config        sync    { mediaBaseUrl }

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { BrowserWindow, ipcMain } = require("electron");

function safeExtension(name) {
    const ext = path.extname(String(name || "")).toLowerCase();
    return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : "";
}

function registerDataIpc({ store, mediaDir, mediaBaseUrl, isTrustedSender, log }) {
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
