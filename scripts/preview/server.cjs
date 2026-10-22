// The browser preview's backend (dev only): `npm run dev` mounts it in the
// Vite dev server (vite.config.js), so a plain browser — Claude's side panel
// included — runs the full console on sample data. It is the REAL store
// (electron/db/store.cjs) and live engine (electron/live.cjs) on a throwaway
// folder, behind an HTTP API with the shape of the desktop IPC (preload.cjs):
//
//   POST /__keryx/db           { entity, op, args } -> { data } | { error }
//   GET  /__keryx/live         -> { data: snapshot }
//   POST /__keryx/live         { op, args } -> { data: snapshot } | { error }
//   GET  /__keryx/events       Server-Sent Events: store changes (messages),
//                              the live state ("live" events)
//   GET  /__keryx/outputs      the output pages (electron/outputs.cjs)
//   GET  /__keryx/bible        installed Bible versions (rows per version)
//   POST /__keryx/bible-online { code, book, chapter } one chapter from bolls.life (electron/bible.cjs)
//   POST /__keryx/bible-install { version } downloads an edition into the preview's store
//   POST /__keryx/bible-file?version=&name= (bytes) installs an edition of the list from a file
//   POST /__keryx/bible-own-read?name= (bytes) reads a file for an edition of the church's own
//   POST /__keryx/bible-own { op: install|remove, … } installs that reading, or deletes one
//   GET  /__keryx/fonts        this PC's installed fonts (electron/systemFonts.cjs)
//   GET  /__keryx/font?id=     one face's file (a collection's face cut out)
//   POST /__keryx/media?name=  the file's bytes -> { data: { fileName } }
//   POST /__keryx/media-info   { names } -> { data: { [name]: { exists, size } } }
//   POST /__keryx/package-export  { manifest, items, files, name } writes a .keryx
//                              (electron/keryxPackage.cjs) -> { data: { token, … } }
//   GET  /__keryx/package-download?token=  that file, as a download
//   POST /__keryx/package-open?name=  (the .keryx's bytes) reads it -> { data: { id, manifest, items, files } }
//   POST /__keryx/package-fits   { id, entries } whether those files fit -> { data: { ok, need, free } }
//   POST /__keryx/package-take   { id, entry } one of its files into the media folder -> { data: { fileName } }
//   POST /__keryx/package-close  { id }
//   GET  /media/<file>         the preview's media folder; /media/bundled/ is resources/
//   POST /api/remote           the controle remoto's command (the /Remote tab),
//                              checked as electron/lan.cjs checks it, run by
//                              the console tab listening on:
//   GET  /__keryx/remote-events  Server-Sent Events: "remote" commands, to the
//                              console tab that connected last
//   POST /__keryx/remote-result  { id, ok, message, status, code, data }: its answer
//
// Never packaged (electron-builder "files" leaves scripts/ out) and never
// required by the main process. Loopback only; it never touches the real
// data in %APPDATA%\KERYX. Pure Node, so it is unit tested.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { createStore } = require("../../electron/db/store.cjs");
const { createLive, loadLiveRules } = require("../../electron/live.cjs");
const { OUTPUTS } = require("../../electron/outputs.cjs");
const { within, sendFile } = require("../../electron/server.cjs");
const { remoteCommand, remoteReply, remoteTimeout } = require("../../electron/lan.cjs");
const PROTOCOL = require("../../shared/remoteProtocol.json");
const schema = require("../../electron/db/schema.json");
const { seed } = require("./fixtures.cjs");
const bible = require("../../electron/bible.cjs");
const { createSystemFonts } = require("../../electron/systemFonts.cjs");
const { createPackages } = require("../../electron/keryxPackage.cjs");
const { importMedia } = require("../../electron/mediaImport.cjs");

const ROOT = path.join(__dirname, "..", "..");
const PREFIX = "/__keryx/";
const MAX_JSON = 2 * 1024 * 1024;
const MAX_FILE = 200 * 1024 * 1024;
const KEEPALIVE_MS = 20000;
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const HOSTS = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

// The preview's own folder under the system temp dir: wiped on every start.
const defaultDataDir = () => path.join(os.tmpdir(), "keryx-preview");
function freshDir(dir) {
    const resolved = path.resolve(dir);
    // Only ever a folder named keryx-preview*: nothing else is deleted here.
    if (!/^keryx-preview/.test(path.basename(resolved))) throw new Error(`pasta de prévia inesperada: ${resolved}`);
    try {
        fs.rmSync(resolved, { recursive: true, force: true });
    } catch (err) {
        // Windows: another preview still has its database open. Use a folder
        // of this process's own instead of failing.
        if (err.code !== "EPERM" && err.code !== "EBUSY") throw err;
        return freshDir(`${resolved}-${process.pid}`);
    }
    fs.mkdirSync(path.join(resolved, "media"), { recursive: true });
    return resolved;
}

const safeExtension = (name) => {
    const ext = path.extname(String(name || "")).toLowerCase();
    return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : "";
};

function readBody(req, max) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on("data", (c) => {
            size += c.length;
            if (size > max) { reject(Object.assign(new Error("Arquivo grande demais."), { status: 413 })); req.destroy(); return; }
            chunks.push(c);
        });
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
    });
}

const json = (res, status, body) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
};
const failure = (err) => ({ error: { message: err && err.message ? err.message : "Erro na prévia.", status: (err && err.status) || 500 } });

async function createPreviewServer({ dataDir = defaultDataDir(), bundledDir = path.join(ROOT, "resources"), log = () => {} } = {}) {
    const dir = freshDir(dataDir);
    const mediaDir = path.join(dir, "media");
    const store = createStore({ file: path.join(dir, "keryx.db"), schema, log });
    const systemFonts = createSystemFonts();
    const ownBible = bible.createOwnInstaller(store);
    const live =createLive({ file: path.join(dir, "live.json"), rules: await loadLiveRules(), log });
    seed(store);
    const packages = createPackages({ root: path.join(dir, "pacotes"), mediaDir, importMedia, log });
    const exported = new Map();

    const clients = new Set();
    const broadcast = (frame) => { for (const res of clients) res.write(frame); };
    const offStore = store.onChange((change) => broadcast(`data: ${JSON.stringify(change)}\n\n`));
    const offLive = live.onChange((snap) => broadcast(`event: live\ndata: ${JSON.stringify(snap)}\n\n`));
    const ping = setInterval(() => broadcast(": ping\n\n"), KEEPALIVE_MS);
    ping.unref?.();

    // The controle remoto's mock: the console tab that listens last runs the
    // phone's commands (only one, so two console tabs never both run one).
    const consoles = [];
    const pending = new Map();
    let seq = 0;
    async function handleRemote(req, res) {
        let command;
        try {
            command = remoteCommand(JSON.parse((await readBody(req, PROTOCOL.limits.bodyBytes)).toString("utf8") || "{}"));
        } catch (err) {
            return json(res, err.status || 400, { error: { message: err.status && err.status !== 413 ? err.message : "Pedido inválido.", status: err.status || 400 } });
        }
        const target = consoles[consoles.length - 1];
        if (!target) return json(res, 503, { error: { message: PROTOCOL.messages.consoleClosed, status: 503, code: "busy" } });
        const id = ++seq;
        let timer;
        const answer = await new Promise((resolve) => {
            pending.set(id, resolve);
            timer = setTimeout(() => resolve({ ok: false, message: "O console não respondeu.", status: 504 }), remoteTimeout(command.action));
            target.write(`event: remote\ndata: ${JSON.stringify({ id, ...command })}\n\n`);
        });
        clearTimeout(timer);
        pending.delete(id);
        const { status, body } = remoteReply(answer);
        return json(res, status, body);
    }

    // Connect-style middleware: answers its own paths, passes the rest on.
    async function middleware(req, res, next) {
        const url = new URL(req.url, "http://localhost");
        const own = url.pathname.startsWith(PREFIX) || url.pathname.startsWith("/media/") || url.pathname === "/api/remote";
        if (!own) return next();
        // This machine only, by address and by name (no DNS rebinding).
        if (!LOOPBACK.has(req.socket.remoteAddress) || !HOSTS.test(String(req.headers.host || ""))) return json(res, 403, { error: { message: "A prévia só atende este computador.", status: 403 } });
        // Writes need the custom header: a page on another site cannot send it.
        if (req.method === "POST" && req.headers["x-keryx"] !== "1") return json(res, 403, { error: { message: "Pedido não autorizado.", status: 403 } });
        try {
            if (url.pathname.startsWith("/media/")) return serveMedia(req, res, url.pathname);
            if (url.pathname === "/api/remote") return req.method === "POST" ? handleRemote(req, res) : json(res, 405, { error: { message: "Só POST.", status: 405 } });
            const route = url.pathname.slice(PREFIX.length);
            if (route === "db" && req.method === "POST") {
                const { entity, op, args } = JSON.parse((await readBody(req, MAX_JSON)).toString("utf8") || "{}");
                try { return json(res, 200, { data: store.call(entity, op, args) }); } catch (err) { return json(res, 200, failure(err)); }
            }
            if (route === "live" && req.method === "GET") return json(res, 200, { data: live.get() });
            if (route === "live" && req.method === "POST") {
                const { op, args } = JSON.parse((await readBody(req, MAX_JSON)).toString("utf8") || "{}");
                try { return json(res, 200, { data: live.call(op, args) }); } catch (err) { return json(res, 200, failure(err)); }
            }
            if (route === "events" && req.method === "GET") {
                res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
                res.write("retry: 2000\n\n");
                clients.add(res);
                req.on("close", () => clients.delete(res));
                return undefined;
            }
            if (route === "remote-events" && req.method === "GET") {
                res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
                res.write("retry: 2000\n\n");
                consoles.push(res);
                req.on("close", () => { const i = consoles.indexOf(res); if (i >= 0) consoles.splice(i, 1); });
                return undefined;
            }
            if (route === "remote-result" && req.method === "POST") {
                const answer = JSON.parse((await readBody(req, MAX_JSON)).toString("utf8") || "{}");
                const done = pending.get(answer.id);
                if (done) { pending.delete(answer.id); done(answer); }
                return json(res, 200, { data: Boolean(done) });
            }
            if (route === "outputs" && req.method === "GET") return json(res, 200, { data: OUTPUTS.map(({ key, label, windowName }) => ({ key, label, windowName })) });
            if (route === "bible" && req.method === "GET") return json(res, 200, { data: store.countBy("BibleVerse", "version") });
            // This PC's fonts, as the desktop's main process lists them.
            if (route === "fonts" && req.method === "GET") return json(res, 200, { data: await systemFonts.list() });
            if (route === "font" && req.method === "GET") {
                const bytes = await systemFonts.read(url.searchParams.get("id"));
                res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": bytes.length, "Cache-Control": "no-store" });
                return res.end(bytes);
            }
            // The Bíblia's online chapters and Instalar, as the desktop's main process does them.
            if (route === "bible-online" && req.method === "POST") {
                const args = JSON.parse((await readBody(req, MAX_JSON)).toString("utf8") || "{}");
                try { return json(res, 200, { data: await bible.fetchOnlineChapter(args) }); } catch (err) { return json(res, 200, failure(err)); }
            }
            if (route === "bible-install" && req.method === "POST") {
                const { version } = JSON.parse((await readBody(req, MAX_JSON)).toString("utf8") || "{}");
                try { return json(res, 200, { data: await bible.installFromSource(store, version) }); } catch (err) { return json(res, 200, failure(err)); }
            }
            // "Do arquivo…" and Instalar uma edição própria… (the bytes the
            // browser picked), as the desktop's main process does them.
            if (route === "bible-file" && req.method === "POST") {
                const bytes = await readBody(req, MAX_FILE);
                try { return json(res, 200, { data: await bible.installFromFile(store, url.searchParams.get("version"), bytes, url.searchParams.get("name") || "") }); } catch (err) { return json(res, 200, failure(err)); }
            }
            if (route === "bible-own-read" && req.method === "POST") {
                const bytes = await readBody(req, MAX_FILE);
                try { return json(res, 200, { data: await ownBible.inspect(bytes, url.searchParams.get("name") || "") }); } catch (err) { return json(res, 200, failure(err)); }
            }
            if (route === "bible-own" && req.method === "POST") {
                const { op, ...args } = JSON.parse((await readBody(req, MAX_JSON)).toString("utf8") || "{}");
                try { return json(res, 200, { data: op === "remove" ? ownBible.remove(args.sigla) : ownBible.install(args) }); } catch (err) { return json(res, 200, failure(err)); }
            }
            if (route === "media" && req.method === "POST") {
                const bytes = await readBody(req, MAX_FILE);
                const fileName = crypto.randomUUID() + safeExtension(url.searchParams.get("name"));
                fs.writeFileSync(path.join(mediaDir, fileName), bytes);
                return json(res, 200, { data: { fileName } });
            }
            if (route === "package-export" && req.method === "POST") {
                const { manifest, items, files, name } = JSON.parse((await readBody(req, 64 * 1024 * 1024)).toString("utf8") || "{}");
                const token = crypto.randomUUID();
                fs.mkdirSync(path.join(dir, "exports"), { recursive: true });
                const target = path.join(dir, "exports", `${token}.keryx`);
                try {
                    const out = await packages.write({ target, manifest, items, files });
                    exported.set(token, { file: target, name: /^[\w.-]{1,90}\.keryx$/.test(String(name || "")) ? name : "keryx.keryx" });
                    return json(res, 200, { data: { ...out, token, file: exported.get(token).name } });
                } catch (err) { return json(res, 200, failure(err)); }
            }
            if (route === "package-download" && req.method === "GET") {
                const got = exported.get(url.searchParams.get("token"));
                if (!got) return json(res, 404, { error: { message: "Pacote não encontrado.", status: 404 } });
                res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${got.name}"`, "Cache-Control": "no-store" });
                return fs.createReadStream(got.file).pipe(res);
            }
            if (route === "package-open" && req.method === "POST") {
                const bytes = await readBody(req, MAX_FILE);
                const incoming = path.join(dir, `incoming-${crypto.randomUUID()}.keryx`);
                fs.writeFileSync(incoming, bytes);
                // The upload is the package's own copy: removed on close (or a failed open).
                try { return json(res, 200, { data: { ...(await packages.open(incoming, { owned: true })), name: path.basename(String(url.searchParams.get("name") || "pacote.keryx")) } }); } catch (err) { return json(res, 200, failure(err)); }
            }
            if (route === "package-fits" && req.method === "POST") {
                const { id, entries } = JSON.parse((await readBody(req, MAX_JSON)).toString("utf8") || "{}");
                try { return json(res, 200, { data: packages.fits(id, Array.isArray(entries) ? entries : []) }); } catch (err) { return json(res, 200, failure(err)); }
            }
            if (route === "package-take" && req.method === "POST") {
                const { id, entry } = JSON.parse((await readBody(req, MAX_JSON)).toString("utf8") || "{}");
                try { return json(res, 200, { data: await packages.take(id, entry) }); } catch (err) { return json(res, 200, failure(err)); }
            }
            if (route === "package-close" && req.method === "POST") {
                const { id } = JSON.parse((await readBody(req, MAX_JSON)).toString("utf8") || "{}");
                return json(res, 200, { data: packages.close(id) });
            }
            if (route === "media-info" && req.method === "POST") {
                const { names = [] } = JSON.parse((await readBody(req, MAX_JSON)).toString("utf8") || "{}");
                const out = {};
                for (const name of names.slice(0, 2000)) {
                    const base = path.basename(String(name || ""));
                    let stat = null;
                    try { if (base === name) stat = fs.statSync(path.join(mediaDir, base)); } catch { stat = null; }
                    out[name] = { exists: Boolean(stat && stat.isFile()), size: stat ? stat.size : 0 };
                }
                return json(res, 200, { data: out });
            }
            return json(res, 404, { error: { message: "Rota da prévia desconhecida.", status: 404 } });
        } catch (err) {
            return json(res, err.status || 400, failure(err));
        }
    }

    function serveMedia(req, res, encoded) {
        let pathname;
        try { pathname = decodeURIComponent(encoded); } catch { return res.writeHead(400).end(); }
        const bundled = pathname.startsWith("/media/bundled/");
        const file = bundled ? within(bundledDir, pathname.slice("/media/bundled".length)) : within(mediaDir, pathname.slice("/media".length));
        if (!file) return res.writeHead(403).end();
        let stat;
        try { stat = fs.statSync(file); } catch { return res.writeHead(404).end(); }
        if (!stat.isFile()) return res.writeHead(404).end();
        return sendFile(req, res, file, stat, { "Cache-Control": "no-store" });
    }

    return {
        middleware,
        store,
        live,
        dataDir: dir,
        close() {
            clearInterval(ping);
            offStore();
            offLive();
            for (const res of clients) res.end();
            clients.clear();
            for (const res of consoles.splice(0)) res.end();
            live.flush();
            store.close();
        },
    };
}

module.exports = { createPreviewServer, defaultDataDir };
