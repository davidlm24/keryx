// Screens on the church network: tablets, smart TVs and stage monitors open
// http://<this-computer>:7701 in a browser. This server is separate from the
// loopback one (127.0.0.1:7700, the full app) and deliberately small:
//
//   - it serves the app only for the screen pages (NETWORK_SCREENS) and "/";
//     the operator pages are never reachable from the network
//   - /api/db is read-only: screens never write
//   - an optional PIN, remembered by a cookie, rate-limited per address
//   - /api/events (Server-Sent Events) pushes every store change, and the
//     whole live state as "live" events, which is what keeps screens in step;
//     EventSource reconnects by itself
//   - /api/live is the live state (electron/live.cjs), read-only from here
//
// Pure Node (no Electron), so it is unit tested.

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { MEDIA_PREFIX, BUNDLED_PREFIX, within, sendFile } = require("./server.cjs");

// Pages that work from the live state and the database alone (no
// window.opener to talk to).
const NETWORK_SCREENS = [
    { path: "/Projection", label: "Projeção principal", hint: "O mesmo que o projetor: letras, Bíblia, mídia e avisos" },
    { path: "/LyricProjection", label: "Letras", hint: "Tablet ou TV com a letra da música" },
    { path: "/StageView", label: "Palco", hint: "Monitor do palco: letra atual, próxima e relógio" },
    { path: "/VideoProjection", label: "Vídeo", hint: "Recebe os vídeos enviados pelo operador" },
    { path: "/CommunicationProjection", label: "Avisos", hint: "Contagens regressivas e avisos" },
    { path: "/PastorView", label: "Tela do pastor", hint: "O que está projetado, relógio e tempo do culto" },
    { path: "/StreamView", label: "Transmissão", hint: "Legenda para a live: no OBS, Fonte de navegador 1920 × 1080, fundo transparente" },
];
const SCREEN_PATHS = new Set(NETWORK_SCREENS.map((s) => s.path));

// A screen may only read.
const READ_OPS = new Set(["list", "filter", "get"]);

const COOKIE = "keryx_lan";
const MAX_BODY = 1024 * 1024;
const MAX_CLIENTS = 50;
const KEEPALIVE_MS = 20000;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60000;

const authToken = ({ pin, secret }) => crypto.createHmac("sha256", secret).update(`keryx-lan:${pin}`).digest("hex");

function parseCookies(header) {
    const out = {};
    for (const part of String(header || "").split(";")) {
        const i = part.indexOf("=");
        if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    }
    return out;
}

const safeEqual = (a, b) => {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// "/x" and "/x?y" only: never "//host" or "/\host" (an open redirect).
const safeNext = (value) => (typeof value === "string" && /^\/(?![/\\])/.test(value) ? value : "/");

// Private IPv4 addresses of this computer, most likely Wi-Fi/LAN first.
function lanAddresses(interfaces = os.networkInterfaces()) {
    const rank = (ip) => (ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : 2);
    const found = [];
    for (const [name, addrs] of Object.entries(interfaces)) {
        for (const a of addrs || []) {
            if (a.family !== "IPv4" || a.internal) continue;
            if (!(a.address.startsWith("192.168.") || a.address.startsWith("10.") || /^172\.(1[6-9]|2\d|3[01])\./.test(a.address))) continue;
            found.push({ name, address: a.address });
        }
    }
    return found.sort((x, y) => rank(x.address) - rank(y.address));
}

const page = (title, body) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#1a1714;color:#e6ebe0;font:16px system-ui,sans-serif}
main{width:min(92vw,360px);text-align:center}h1{font-size:22px;margin:0 0 8px}p{color:#a39b8b;margin:0 0 20px}
input{width:100%;box-sizing:border-box;padding:14px;font-size:28px;text-align:center;letter-spacing:.4em;border-radius:10px;border:1px solid #3b362f;background:#26211c;color:inherit}
button{width:100%;margin-top:12px;padding:14px;font-size:17px;border:0;border-radius:10px;background:#7d8470;color:#1a1714;font-weight:600}
.err{color:#e57373;margin-top:12px}</style></head><body><main>${body}</main></body></html>`;

const pinPage = (next, error) => page("KERYX", `<h1>KERYX</h1><p>Digite o PIN desta tela</p>
<form method="post" action="/lan/pin"><input type="hidden" name="next" value="${next.replace(/[&"<>]/g, "")}">
<input name="pin" inputmode="numeric" autocomplete="off" autofocus aria-label="PIN"><button type="submit">Entrar</button></form>${error ? `<p class="err">${error}</p>` : ""}`);

const notFoundPage = page("KERYX", `<h1>Página não disponível</h1><p>Esta tela só mostra as saídas do KERYX. Os painéis de controle ficam no computador do operador.</p><button onclick="location.href='/'">Voltar ao início</button>`);

function readBody(req, limit = MAX_BODY) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on("data", (chunk) => {
            size += chunk.length;
            if (size > limit) {
                reject(Object.assign(new Error("Pedido grande demais."), { status: 413 }));
                req.destroy();
            } else chunks.push(chunk);
        });
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
    });
}

function createLanServer({ distDir, mediaDir, bundledDir, store, live = null, getConfig, log = () => {} }) {
    const dist = path.resolve(distDir);
    const media = path.resolve(mediaDir);
    const bundled = bundledDir ? path.resolve(bundledDir) : null;
    const clients = new Set();
    const attempts = new Map(); // ip -> { count, until }
    let server = null;
    let keepalive = null;
    let unsubscribe = null;
    let unsubscribeLive = null;

    const json = (res, status, body, headers = {}) => {
        const data = Buffer.from(JSON.stringify(body));
        res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": data.length, "Cache-Control": "no-store", ...headers });
        res.end(data);
    };
    const html = (res, status, body, headers = {}) => {
        const data = Buffer.from(body);
        res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Content-Length": data.length, "Cache-Control": "no-store", ...headers });
        res.end(data);
    };

    const isAuthed = (req) => {
        const config = getConfig();
        if (!config.pin) return true;
        return safeEqual(parseCookies(req.headers.cookie)[COOKIE] || "", authToken(config));
    };

    async function handlePin(req, res, url) {
        const ip = req.socket.remoteAddress;
        const next = safeNext(url.searchParams.get("next"));
        if (req.method === "GET") return html(res, 200, pinPage(next, ""));
        if (req.method !== "POST") return res.writeHead(405).end();

        const state = attempts.get(ip) || { count: 0, until: 0 };
        if (state.until > Date.now()) return html(res, 429, pinPage(next, "Muitas tentativas. Aguarde um minuto."));

        const form = new URLSearchParams(await readBody(req, 2048));
        const config = getConfig();
        if (!config.pin || safeEqual(form.get("pin") || "", config.pin)) {
            attempts.delete(ip);
            const cookie = config.pin ? { "Set-Cookie": `${COOKIE}=${authToken(config)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax` } : {};
            return res.writeHead(303, { Location: safeNext(form.get("next")), ...cookie }).end();
        }
        state.count += 1;
        if (state.count >= MAX_ATTEMPTS) {
            state.count = 0;
            state.until = Date.now() + LOCKOUT_MS;
        }
        attempts.set(ip, state);
        return html(res, 401, pinPage(next, "PIN incorreto."));
    }

    // Each screen says which page it shows (?screen=/StageView): the
    // console lists the screens connected right now from this.
    function handleEvents(req, res, url) {
        if (clients.size >= MAX_CLIENTS) return json(res, 503, { error: { message: "Telas demais ligadas." } });
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
        res.write("retry: 3000\n\n");
        const asked = url ? String(url.searchParams.get("screen") || "").replace(/\/+$/, "") : "";
        const screen = SCREEN_PATHS.has(asked) ? asked : "";
        const client = { res, ip: req.socket.remoteAddress, agent: String(req.headers["user-agent"] || "").slice(0, 120), since: new Date().toISOString(), screen };
        clients.add(client);
        req.on("close", () => clients.delete(client));
    }

    async function handleDb(req, res) {
        if (req.method !== "POST") return res.writeHead(405).end();
        // A custom header makes this a non-simple request, so a page on another
        // site cannot post here with the cookie.
        if (req.headers["x-keryx"] !== "1") return json(res, 403, { error: { message: "Pedido não autorizado.", status: 403 } });
        let payload;
        try {
            payload = JSON.parse(await readBody(req));
        } catch (err) {
            return json(res, err.status || 400, { error: { message: err.status === 413 ? err.message : "Pedido inválido.", status: err.status || 400 } });
        }
        const { entity, op, args } = payload || {};
        const allowed = READ_OPS.has(op);
        if (!allowed) return json(res, 403, { error: { message: "Esta tela só pode ler os dados.", status: 403 } });
        try {
            return json(res, 200, { data: store.call(entity, op, args) });
        } catch (err) {
            if (err && err.status) return json(res, 200, { error: { message: err.message, status: err.status } });
            log(`[keryx-lan] ${entity}.${op}: ${err && err.stack}`);
            return json(res, 200, { error: { message: "Erro na base de dados local.", status: 500 } });
        }
    }

    function serveIndex(req, res) {
        let body;
        try {
            body = fs.readFileSync(path.join(dist, "index.html"), "utf8");
        } catch {
            return html(res, 500, page("KERYX", "<h1>Aplicativo não encontrado</h1>"));
        }
        // Tells the app to talk to this server instead of picking the cloud backend.
        body = body.replace("<head>", "<head><script>window.keryxLan=true;</script>");
        return html(res, 200, body, { "Cache-Control": "no-cache" });
    }

    function serveFile(req, res, file, headers) {
        fs.stat(file, (err, stat) => {
            if (err || !stat.isFile()) return res.writeHead(404).end();
            return sendFile(req, res, file, stat, headers);
        });
    }

    async function handler(req, res) {
        let url;
        try {
            url = new URL(req.url, "http://lan");
        } catch {
            return res.writeHead(400).end();
        }
        let pathname;
        try {
            pathname = decodeURIComponent(url.pathname);
        } catch {
            return res.writeHead(400).end();
        }

        if (pathname === "/lan/pin") return handlePin(req, res, url);

        if (!isAuthed(req)) {
            const wantsPage = req.method === "GET" && String(req.headers.accept || "").includes("text/html");
            if (wantsPage) return res.writeHead(303, { Location: `/lan/pin?next=${encodeURIComponent(req.url)}` }).end();
            return json(res, 401, { error: { message: "PIN necessário.", status: 401 } });
        }

        if (pathname === "/api/events" && req.method === "GET") return handleEvents(req, res, url);
        if (pathname === "/api/db") return handleDb(req, res);
        if (pathname === "/api/screens" && req.method === "GET") return json(res, 200, NETWORK_SCREENS);
        if (pathname === "/api/live") {
            // Screens only watch; the operator changes the live state on the KERYX computer.
            if (req.method !== "GET") return json(res, 405, { error: { message: "Esta tela só pode ler os dados.", status: 405 } }, { Allow: "GET" });
            if (!live) return json(res, 503, { error: { message: "Projeção indisponível.", status: 503 } });
            return json(res, 200, { data: live.get() });
        }

        if (req.method !== "GET" && req.method !== "HEAD") return res.writeHead(405, { Allow: "GET, HEAD" }).end();

        if (pathname.startsWith(MEDIA_PREFIX)) {
            const file = bundled && pathname.startsWith(BUNDLED_PREFIX)
                ? within(bundled, pathname.slice(BUNDLED_PREFIX.length - 1))
                : within(media, pathname.slice(MEDIA_PREFIX.length - 1));
            if (!file) return res.writeHead(403).end();
            return serveFile(req, res, file, { "Cache-Control": "public, max-age=31536000, immutable" });
        }

        if (path.extname(pathname)) {
            // Built assets (js, css, fonts, icons) only: never anything outside dist/.
            const file = within(dist, pathname);
            if (!file || path.basename(file) === "index.html") return res.writeHead(404).end();
            return serveFile(req, res, file, { "Cache-Control": pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache" });
        }

        const route = pathname.replace(/\/+$/, "") || "/";
        if (route === "/" || SCREEN_PATHS.has(route)) return serveIndex(req, res);
        return html(res, 404, notFoundPage);
    }

    return {
        NETWORK_SCREENS,
        start({ port, host = "0.0.0.0" }) {
            if (server) return Promise.resolve({ port: server.address().port });
            server = http.createServer((req, res) => {
                handler(req, res).catch((err) => {
                    log(`[keryx-lan] ${req.method} ${req.url}: ${err && err.stack}`);
                    if (!res.headersSent) res.writeHead(500).end();
                    else res.destroy();
                });
            });
            unsubscribe = store.onChange((change) => {
                const frame = `data: ${JSON.stringify(change)}\n\n`;
                for (const client of clients) client.res.write(frame);
            });
            if (live) {
                unsubscribeLive = live.onChange((snapshot) => {
                    const frame = `event: live\ndata: ${JSON.stringify(snapshot)}\n\n`;
                    for (const client of clients) client.res.write(frame);
                });
            }
            keepalive = setInterval(() => {
                for (const client of clients) client.res.write(": ping\n\n");
            }, KEEPALIVE_MS);
            keepalive.unref();
            return new Promise((resolve, reject) => {
                server.once("error", (err) => {
                    this.stop();
                    reject(err);
                });
                server.listen(port, host, () => resolve({ port: server.address().port }));
            });
        },
        stop() {
            if (keepalive) clearInterval(keepalive);
            if (unsubscribe) unsubscribe();
            if (unsubscribeLive) unsubscribeLive();
            keepalive = null;
            unsubscribe = null;
            unsubscribeLive = null;
            for (const client of clients) client.res.end();
            clients.clear();
            if (server) {
                server.closeAllConnections();
                server.close();
            }
            server = null;
        },
        running: () => Boolean(server && server.listening),
        port: () => (server && server.listening ? server.address().port : null),
        clients: () => [...clients].map(({ ip, agent, since, screen }) => ({ ip: ip.replace(/^::ffff:/, ""), agent, since, screen, label: NETWORK_SCREENS.find((s) => s.path === screen)?.label || "" })),
    };
}

module.exports = { createLanServer, lanAddresses, NETWORK_SCREENS, authToken, safeNext };
