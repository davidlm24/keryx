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
//   - the one exception is the controle remoto (/Remote, a phone): off until
//     the operator turns it on, behind its own code (never optional), it
//     posts commands from a closed list to /api/remote; the console runs
//     them as its own keys would (onRemote), so Travar telas and every other
//     rule hold. Nothing here writes the database or the live state. The
//     commands and their args are shared/remoteProtocol.json's; a phone
//     signed in only with the remote's code reads only what its page uses
//     (the live state, media, the User row, its event stream), and taps
//     too fast get 429
//   - the Equipe (Rodada Q) signs in on the same page with a third code of
//     its own (off by default) and gets the role "team": only the actions
//     the contract marks team: true (chat, song requests, lyrics, the
//     Bíblia and the Setlist to read), checked here, never only hidden on
//     the phone; it never changes the air or the setlist
//   - both are doors of "KERYX no celular" (owner 2026-10-27): one main
//     switch over the two; the phone picks Controle or Equipe and its code
//     is checked against that side only (doorOn, codePage)
//   - every event stream gets a heartbeat ("hb", every 10 s) and is dropped
//     when it stops reading (MAX_BACKLOG)
//
// Pure Node (no Electron), so it is unit tested.

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { MEDIA_PREFIX, BUNDLED_PREFIX, within, sendFile } = require("./server.cjs");

// Pages that work from the live state and the database alone (no
// window.opener to talk to), under the outputs' factory names
// (shared/outputNames.json, the same as Saídas and the Editor de telas).
const NAMES = require("../shared/outputNames.json");
const NETWORK_SCREENS = [
    { path: "/Projection", label: NAMES["/Projection"], hint: "O mesmo que o projetor: letras, Bíblia, mídia e avisos" },
    { path: "/LyricProjection", label: NAMES["/LyricProjection"], hint: "Tablet ou TV com a letra da música" },
    { path: "/StageView", label: NAMES["/StageView"], hint: "Monitor do palco: letra atual, próxima e relógio" },
    { path: "/VideoProjection", label: NAMES["/VideoProjection"], hint: "Recebe os vídeos enviados pelo operador" },
    { path: "/CommunicationProjection", label: NAMES["/CommunicationProjection"], hint: "Contagens regressivas e avisos" },
    { path: "/PastorView", label: NAMES["/PastorView"], hint: "O que está projetado, relógio e tempo do culto" },
    { path: "/StreamView", label: NAMES["/StreamView"], hint: "Legenda para a live: no OBS, Fonte de navegador 1920 × 1080, fundo transparente" },
];
const SCREEN_PATHS = new Set(NETWORK_SCREENS.map((s) => s.path));

// The operator's names for the outputs (OutputPref rows), over the factory
// labels. Best-effort: an empty map on any store error.
function screenLabels(store) {
    try {
        return Object.fromEntries((store.call("OutputPref", "list", []) || [])
            .filter((r) => r && r.screen_path && typeof r.name === "string" && r.name.trim())
            .map((r) => [r.screen_path, r.name.trim().slice(0, 40)]));
    } catch { return {}; }
}

// A screen may only read.
const READ_OPS = new Set(["list", "filter", "get"]);

// The controle remoto: its page, and what a phone may ask the console — the
// contract every side codes against (shared/remoteProtocol.json).
const PROTOCOL = require("../shared/remoteProtocol.json");
const REMOTE_PATH = "/Remote";
const REMOTE_COOKIE = "keryx_remote";
const REMOTE_ACTIONS = new Set(Object.keys(PROTOCOL.actions));
const ID = new RegExp(PROTOCOL.idPattern);
const remoteToken = ({ code, secret }) => crypto.createHmac("sha256", secret).update(`keryx-remote:${code}`).digest("hex");
// The Equipe's own cookie (Rodada Q), signed with its own key: a phone that
// knows only that code is the role "team".
const TEAM_COOKIE = "keryx_team";
const teamToken = ({ code, secret }) => crypto.createHmac("sha256", secret).update(`keryx-team:${code}`).digest("hex");
// The side a phone entered by last (Controle or Equipe): it only picks where
// the sign-in page starts, never what the phone may do.
const SIDE_COOKIE = "keryx_side";
// A door ("remote" = the Controle, "team" = the Equipe) is open with its own
// switch, a code and a key, under the main switch of "KERYX no celular"
// (network.phones, owner 2026-10-27; never set = on, as before it existed).
const doorOn = (config, key) => {
    const door = config[key];
    return config.phones?.enabled !== false && Boolean(door && door.enabled && door.code && door.secret);
};
// How long the console has to answer (the Bíblia reads chapters: longer).
const remoteTimeout = (action) => (PROTOCOL.limits.slowActions.includes(action) ? PROTOCOL.limits.slowTimeoutMs : PROTOCOL.limits.timeoutMs);
// A read is the phone keeping up (state every few seconds): never logged.
const remoteReads = (action) => PROTOCOL.actions[action]?.kind === "R";

// What a bad argument is called on the phone.
const argProblem = (key) => (/^(itemId|id|presetId)$/.test(key) ? "Item inválido."
    : /^(ref|book|chapter|verseStart|verseEnd|version)$/.test(key) ? "Referência inválida." : "Comando inválido.");

// One argument against its schema: the value to keep, undefined when
// absent, or an Error. str is trimmed (empty = absent).
function argValue(schema, value) {
    if (value === undefined || value === null) return undefined;
    switch (schema.type) {
        case "str": {
            if (typeof value !== "string") return null;
            const t = value.trim();
            if (!t) return undefined;
            return t.length > schema.max ? null : t;
        }
        case "int": return Number.isInteger(value) && value >= schema.min && value <= schema.max ? value : null;
        case "bool": return typeof value === "boolean" ? value : null;
        case "id": return typeof value === "string" && ID.test(value) ? value : null;
        case "enum": return schema.values.includes(value) ? value : null;
        default: return null;
    }
}

// What a role may run (Rodada Q, the contract's notes.roles): the Equipe
// only the actions marked team: true, with teamArgs' values and the args
// teamNeeds asks for (the library's media only with kind video or audio,
// S15); the Controle everything but the Equipe's chat (cap requests).
// -> true | false.
function roleAllows(action, args = {}, role = "control") {
    const spec = Object.hasOwn(PROTOCOL.actions, action) ? PROTOCOL.actions[action] : null;
    if (!spec) return false;
    if (role !== "team") return spec.cap !== "requests";
    if (spec.team !== true) return false;
    for (const [key, values] of Object.entries(spec.teamArgs || {})) {
        if (args[key] !== undefined && !values.includes(args[key])) return false;
    }
    for (const need of spec.teamNeeds || []) {
        const applies = Object.entries(need.when).every(([key, value]) => args[key] === value);
        if (applies && need.give.some((key) => args[key] === undefined)) return false;
    }
    return true;
}
const forbidden = () => Object.assign(new Error(PROTOCOL.messages.forbidden), { status: 403, code: "forbidden" });

// A phone's command, checked against the contract: { action, args, v } with
// only the args that action takes (unknown keys dropped), or an Error with a
// status. No v = a version 1 page. role: the code that signed the phone in
// ("control" | "team"); what that role may not run is 403. Pure (tested).
function remoteCommand(body, role = "control") {
    const fail = (message) => Object.assign(new Error(message), { status: 400 });
    if (!body || typeof body !== "object" || Array.isArray(body)) throw fail("Comando inválido.");
    const { action } = body;
    if (typeof action !== "string" || !REMOTE_ACTIONS.has(action)) throw fail("Comando desconhecido.");
    if (!roleAllows(action, {}, role)) throw forbidden();
    const v = body.v === undefined ? 1 : body.v;
    if (!Number.isInteger(v) || v < 1 || v > 99) throw fail("Comando inválido.");
    const given = body.args === undefined || body.args === null ? {} : body.args;
    if (typeof given !== "object" || Array.isArray(given)) throw fail("Comando inválido.");
    const spec = PROTOCOL.actions[action];
    const args = {};
    for (const [key, schema] of Object.entries(spec.args)) {
        const value = argValue(schema, given[key]);
        if (value === null) throw fail(argProblem(key));
        if (value !== undefined) args[key] = value;
    }
    // oneOf: exactly one group given; its required keys there.
    const grouped = new Set((spec.oneOf || []).flat());
    if (spec.oneOf) {
        const chosen = spec.oneOf.filter((group) => group.some((key) => key in args));
        if (chosen.length !== 1) throw fail(argProblem(spec.oneOf[0][0]));
        for (const key of chosen[0]) if (spec.args[key].required && !(key in args)) throw fail(argProblem(key));
    }
    for (const [key, schema] of Object.entries(spec.args)) {
        if (schema.required && !grouped.has(key) && !(key in args)) throw fail(argProblem(key));
    }
    if (!roleAllows(action, args, role)) throw forbidden();
    return { action, args, v };
}

// The console's answer as the phone gets it: { data: { message, result? } }
// or { error: { message, status, code? } } (also the preview's mock).
function remoteReply(answer) {
    const message = (m, fallback) => (typeof m === "string" && m ? m : fallback).slice(0, PROTOCOL.limits.message);
    if (!answer || !answer.ok) {
        const status = Number(answer?.status) || 409;
        const code = PROTOCOL.codes[answer?.code] ? answer.code : undefined;
        return { status, body: { error: { message: message(answer?.message, "Não foi possível."), status, ...(code ? { code } : {}) } } };
    }
    return { status: 200, body: { data: { message: message(answer.message, ""), ...(answer.data !== undefined ? { result: answer.data } : {}) } } };
}

// Phones that tap too fast (a pocket, a stuck finger, a loop): a token
// bucket per address (burst 10, 8 a second) and at most 4 commands waiting
// on the console per address, 8 in all. Pure but for the clock (tested).
const RATE = { burst: 10, perSecond: 8, perIp: 4, total: 8 };
// The Equipe's messages (chat.send, request.send) have a bucket of their
// own per address on top: 3 in a row, then one every 2 s.
const MESSAGE_RATE = { burst: 3, perSecond: 0.5 };
const MESSAGE_ACTIONS = new Set(["chat.send", "request.send"]);
function createRemoteGate(now = () => Date.now()) {
    const buckets = new Map(); // ip -> { tokens, at }
    const messages = new Map(); // ip -> { tokens, at }
    const waiting = new Map(); // ip -> count
    let total = 0;
    return {
        // { ok: true, done } to go ahead (done() once answered), else
        // { ok: false, status, code, message }.
        take(ip) {
            const t = now();
            const b = buckets.get(ip) || { tokens: RATE.burst, at: t };
            b.tokens = Math.min(RATE.burst, b.tokens + ((t - b.at) / 1000) * RATE.perSecond);
            b.at = t;
            buckets.set(ip, b);
            if (buckets.size > 256) for (const [k, x] of buckets) if (t - x.at > 60000) buckets.delete(k);
            if (b.tokens < 1 || (waiting.get(ip) || 0) >= RATE.perIp) return { ok: false, status: 429, code: "rate", message: PROTOCOL.messages.rate };
            if (total >= RATE.total) return { ok: false, status: 503, code: "busy", message: PROTOCOL.messages.busy };
            b.tokens -= 1;
            waiting.set(ip, (waiting.get(ip) || 0) + 1);
            total += 1;
            let done = false;
            return {
                ok: true,
                done() {
                    if (done) return;
                    done = true;
                    total -= 1;
                    const n = (waiting.get(ip) || 1) - 1;
                    if (n) waiting.set(ip, n); else waiting.delete(ip);
                },
            };
        },
        // A message (chat.send, request.send) from this address: taken from
        // its own bucket, or { ok: false, … 429 }. Any other action: ok.
        message(ip, action) {
            if (!MESSAGE_ACTIONS.has(action)) return { ok: true };
            const t = now();
            const b = messages.get(ip) || { tokens: MESSAGE_RATE.burst, at: t };
            b.tokens = Math.min(MESSAGE_RATE.burst, b.tokens + ((t - b.at) / 1000) * MESSAGE_RATE.perSecond);
            b.at = t;
            messages.set(ip, b);
            if (messages.size > 256) for (const [k, x] of messages) if (t - x.at > 60000) messages.delete(k);
            if (b.tokens < 1) return { ok: false, status: 429, code: "rate", message: PROTOCOL.messages.rate };
            b.tokens -= 1;
            return { ok: true };
        },
        waiting: () => total,
    };
}

// The /Remote page as a phone app: its colour, home-screen icon and full
// screen on iPhone. The LAN is plain HTTP, so this deliberately does not
// register a service worker or claim that the page can be installed as a PWA.
const REMOTE_META = '<meta name="theme-color" content="#0d0d0c"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="KERYX"><link rel="manifest" href="/remote.webmanifest"><link rel="apple-touch-icon" href="/icons/keryx-512.png">';

// An event stream that stopped reading (a phone asleep on a bad Wi-Fi):
// past this much waiting to be sent it is dropped; EventSource comes back.
const MAX_BACKLOG = 256 * 1024;
function writeFrame(client, frame) {
    if (client.res.writableLength > MAX_BACKLOG) {
        client.res.destroy();
        return false;
    }
    client.res.write(frame);
    return true;
}

const COOKIE = "keryx_lan";
const MAX_BODY = 1024 * 1024;
const MAX_CLIENTS = 50;
const HEARTBEAT_MS = 10000;
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

// The two pages the server writes itself (PIN, not available), in the design
// system's colours (docs/design-system/tokens.css: bg-0, bg-1/2, line-strong,
// fg-1/2, brand + on-brand for the one action, warn-fg for the error).
const page = (title, body, css = "") => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${title}</title><style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0d0d0c;color:#f4f1ea;font:16px system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px;box-sizing:border-box}
main{width:min(100%,360px);text-align:center;background:#171715;border-radius:14px;padding:28px 24px;box-shadow:0 0 0 1px #35342f}h1{font-size:22px;margin:0 0 8px;font-weight:600;letter-spacing:.02em}p{color:#bbb6ac;margin:0 0 20px;line-height:1.45}
input{width:100%;box-sizing:border-box;padding:14px;font-size:28px;text-align:center;letter-spacing:.4em;border-radius:8px;border:0;box-shadow:inset 0 0 0 1px #4a4840;background:#20201d;color:inherit;outline:none}input:focus{box-shadow:inset 0 0 0 2px #c19959}
button{width:100%;margin-top:12px;padding:14px;font-size:17px;border:0;border-radius:8px;background:#c19959;color:#20180c;font-weight:600;cursor:pointer}button:hover{background:#d0a968}button:active{background:#a47d43}
.err{color:#ffc24d;background:#f5a5241a;border-radius:8px;padding:10px 12px;margin:14px 0 0}${css}</style></head><body><main>${body}</main></body></html>`;

const pinPage = (next, error) => page("KERYX", `<h1>KERYX</h1><p>Digite o PIN desta tela</p>
<form method="post" action="/lan/pin"><input type="hidden" name="next" value="${next.replace(/[&"<>]/g, "")}">
<input name="pin" inputmode="numeric" autocomplete="off" autofocus aria-label="PIN"><button type="submit">Entrar</button></form>${error ? `<p class="err">${error}</p>` : ""}`);

// The phone's sign-in, "KERYX no celular" (owner 2026-10-27, A · uma tela):
// Controle | Equipe over the code field, only the doors that are on, and the
// code is checked against the side chosen alone (handleRemoteCode). The
// choice only narrows: the role still comes from the code. No script: the
// radios come first, and CSS shows the field, its label and the line under
// the switch for the one checked (nothing checked = no field yet).
const DOORS = [
    { role: "control", name: "Controle", what: "Muda o que está no ar: slides, Tela preta, Logo e a setlist.", code: "Código do controle" },
    { role: "team", name: "Equipe", what: "Pedidos, chat e letras. Só lê: nunca mexe no ar.", code: "Código da equipe" },
];
const DOOR_ROLES = new Set(DOORS.map((d) => d.role));
const doorCss = (doors) => `.r{position:absolute;width:1px;height:1px;margin:0;padding:0;opacity:0}
.seg{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:4px;padding:4px;margin:0 0 12px;border-radius:10px;background:#20201d;box-shadow:inset 0 0 0 1px #35342f}
.seg label{display:block;padding:11px 0;border-radius:7px;color:#bbb6ac;cursor:pointer}
.what,.code,.code .l{display:none}.what{margin:0 0 16px}.code>label{display:block;text-align:left;font-size:14px;color:#bbb6ac;margin:0 0 6px}
${doors.map(({ role }) => `#r-${role}:checked~.seg [for=r-${role}]{background:#2f2e2a;color:#f4f1ea;font-weight:600;box-shadow:inset 0 0 0 1px #c19959}
#r-${role}:focus-visible~.seg [for=r-${role}]{outline:2px solid #c19959;outline-offset:2px}
#r-${role}:checked~.w-${role},#r-${role}:checked~.code{display:block}#r-${role}:checked~.code .l-${role}{display:inline}`).join("\n")}`;
// on: { control, team } (which doors are on); role: the side to start on.
const codePage = ({ on = {}, role = null, error = "" } = {}) => {
    const doors = DOORS.filter((d) => on[d.role]);
    const start = doors.length === 1 ? doors[0].role : doors.some((d) => d.role === role) ? role : null;
    return page("KERYX", `<h1>KERYX no celular</h1>${doors.length > 1 ? "<p>Como você vai usar?</p>" : ""}
<form method="post" action="/lan/remote-code">
${doors.map((d, i) => `<input class="r" type="radio" name="role" value="${d.role}" id="r-${d.role}"${d.role === start ? " checked" : ""}${i ? "" : " required"}>`).join("")}
<div class="seg">${doors.map((d) => `<label for="r-${d.role}">${d.name}</label>`).join("")}</div>
${doors.map((d) => `<p class="what w-${d.role}">${d.what}</p>`).join("")}
<div class="code"><label for="code">${doors.map((d) => `<span class="l l-${d.role}">${d.code}</span>`).join("")}</label>
<input id="code" name="code" inputmode="numeric" autocomplete="off"${start ? " autofocus" : ""}><button type="submit">Entrar</button></div></form>${error ? `<p class="err">${error}</p>` : ""}`, doorCss(doors));
};

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

function createLanServer({ distDir, mediaDir, bundledDir, store, live = null, getConfig, onRemote = null, log = () => {}, heartbeatMs = HEARTBEAT_MS }) {
    // NETWORK_SCREENS with the operator's names on them (NetworkHome, Rede).
    const screensOf = () => { const names = screenLabels(store); return NETWORK_SCREENS.map((sc) => ({ ...sc, label: names[sc.path] || sc.label })); };
    const dist = path.resolve(distDir);
    const media = path.resolve(mediaDir);
    const bundled = bundledDir ? path.resolve(bundledDir) : null;
    const clients = new Set();
    const attempts = new Map(); // ip -> { count, until }
    const gate = createRemoteGate();
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
    // The controle remoto's own sign-in: on, with a code, and the cookie
    // that code made (a new code or Desconectar todos signs every phone out).
    const remoteOn = () => doorOn(getConfig(), "remote");
    const isRemote = (req) => remoteOn() && safeEqual(parseCookies(req.headers.cookie)[REMOTE_COOKIE] || "", remoteToken(getConfig().remote));
    // The Equipe's (Rodada Q): the same, with its own code, key and cookie.
    const teamOn = () => doorOn(getConfig(), "team");
    const isTeam = (req) => teamOn() && safeEqual(parseCookies(req.headers.cookie)[TEAM_COOKIE] || "", teamToken(getConfig().team));
    const phonesOn = () => remoteOn() || teamOn();
    // The phone's role: the Controle's code wins (signing in with one code
    // clears the other's cookie), else the Equipe's, else none.
    const roleOf = (req) => (isRemote(req) ? "control" : isTeam(req) ? "team" : null);
    // Signed in only as a phone (no PIN cookie while the screens have a
    // PIN): it reads only what its page uses — the live state, the media,
    // the church's profile (User), and its own event stream.
    const remoteOnly = (req) => !isAuthed(req) && Boolean(roleOf(req));

    // Wrong codes (the PIN's and the remote's): five, then a minute out.
    const tooMany = (key) => (attempts.get(key)?.until || 0) > Date.now();
    const missed = (key) => {
        const state = attempts.get(key) || { count: 0, until: 0 };
        state.count += 1;
        if (state.count >= MAX_ATTEMPTS) { state.count = 0; state.until = Date.now() + LOCKOUT_MS; }
        attempts.set(key, state);
    };

    async function handleRemoteCode(req, res) {
        if (!phonesOn()) return html(res, 404, notFoundPage);
        const on = { control: remoteOn(), team: teamOn() };
        const side = (value) => (DOOR_ROLES.has(value) ? value : null);
        // The side to start on: ?role= (a link that switches), else the one
        // this phone entered by last (a preference, never a permission).
        const cookies = parseCookies(req.headers.cookie);
        if (req.method === "GET") return html(res, 200, codePage({ on, role: side(new URL(req.url, "http://x").searchParams.get("role")) || side(cookies[SIDE_COOKIE]) }));
        if (req.method !== "POST") return res.writeHead(405).end();
        const key = `remote:${req.socket.remoteAddress}`;
        const form = new URLSearchParams(await readBody(req, 2048));
        // The side the phone chose: its code is checked against that one
        // alone, so the other's code typed there is a wrong code. No side (a
        // page of before) = either, as before. The role is still the code's.
        const chosen = side(form.get("role"));
        if (tooMany(key)) return html(res, 429, codePage({ on, role: chosen, error: "Muitas tentativas. Aguarde um minuto." }));
        const { remote, team } = getConfig();
        const given = form.get("code") || "";
        // Signing in with one code clears the other's cookie.
        const cookie = (name, value) => `${name}=${value}; Path=/; Max-Age=${value ? 31536000 : 0}; HttpOnly; SameSite=Strict`;
        const enter = (role, name, token, other) => {
            attempts.delete(key);
            return res.writeHead(303, { Location: REMOTE_PATH, "Set-Cookie": [cookie(name, token), cookie(other, ""), cookie(SIDE_COOKIE, role)] }).end();
        };
        if (chosen !== "team" && on.control && safeEqual(given, remote.code)) return enter("control", REMOTE_COOKIE, remoteToken(remote), TEAM_COOKIE);
        if (chosen !== "control" && on.team && safeEqual(given, team.code)) return enter("team", TEAM_COOKIE, teamToken(team), REMOTE_COOKIE);
        missed(key);
        return html(res, 401, codePage({ on, role: chosen, error: "Código incorreto." }));
    }

    // A command from the phone: the custom header and the same origin (no
    // other site can post it with the cookie), a checked command, and the
    // console's answer — or "não respondeu" after a few seconds.
    async function handleRemote(req, res) {
        if (!phonesOn()) return json(res, 404, { error: { message: "Controle remoto desligado.", status: 404 } });
        if (req.method !== "POST") return res.writeHead(405).end();
        const role = roleOf(req);
        if (!role) return json(res, 401, { error: { message: "Código do controle remoto necessário.", status: 401 } });
        const origin = req.headers.origin;
        if (req.headers["x-keryx"] !== "1" || (origin && origin !== `http://${req.headers.host}`)) return json(res, 403, { error: { message: "Pedido não autorizado.", status: 403 } });
        const ip = req.socket.remoteAddress;
        const turn = gate.take(ip);
        if (!turn.ok) {
            const { status, body } = remoteReply(turn);
            return json(res, status, body, status === 429 ? { "Retry-After": "1" } : {});
        }
        try {
            let command;
            try {
                command = remoteCommand(JSON.parse(await readBody(req, PROTOCOL.limits.bodyBytes)), role);
            } catch (err) {
                return json(res, err.status || 400, { error: { message: err.status ? err.message : "Pedido inválido.", status: err.status || 400, ...(err.code ? { code: err.code } : {}) } });
            }
            const message = gate.message(ip, command.action);
            if (!message.ok) {
                const { status, body } = remoteReply(message);
                return json(res, status, body, { "Retry-After": "2" });
            }
            if (!onRemote) return json(res, 503, { error: { message: PROTOCOL.messages.consoleClosed, status: 503, code: "busy" } });
            let timer;
            const answer = await Promise.race([
                Promise.resolve().then(() => onRemote(command.action, command.args, { ip, v: command.v, role })),
                // 504: the outcome is unknown (the phone says so, never retries).
                new Promise((resolve) => { timer = setTimeout(() => resolve({ ok: false, message: "O console não respondeu.", status: 504 }), remoteTimeout(command.action)); }),
            ]).catch((err) => ({ ok: false, message: err?.message || "O console não conseguiu.", status: 500 }));
            clearTimeout(timer);
            const { status, body } = remoteReply(answer);
            return json(res, status, body);
        } finally {
            turn.done();
        }
    }

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
        const role = roleOf(req);
        const screen = SCREEN_PATHS.has(asked) || (asked === REMOTE_PATH && role) ? asked : "";
        const client = { res, ip: req.socket.remoteAddress, agent: String(req.headers["user-agent"] || "").slice(0, 120), since: new Date().toISOString(), screen, role: screen === REMOTE_PATH ? role : null, remoteOnly: remoteOnly(req) };
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
        if (remoteOnly(req) && !(entity === "User" && op === "get")) return json(res, 403, { error: { message: "O controle remoto não lê isso.", status: 403 } });
        try {
            return json(res, 200, { data: store.call(entity, op, args) });
        } catch (err) {
            if (err && err.status) return json(res, 200, { error: { message: err.message, status: err.status } });
            log(`[keryx-lan] ${entity}.${op}: ${err && err.stack}`);
            return json(res, 200, { error: { message: "Erro na base de dados local.", status: 500 } });
        }
    }

    function serveIndex(req, res, { remote = false } = {}) {
        let body;
        try {
            body = fs.readFileSync(path.join(dist, "index.html"), "utf8");
        } catch {
            return html(res, 500, page("KERYX", "<h1>Aplicativo não encontrado</h1>"));
        }
        // Tells the app to talk to this server instead of picking the cloud backend.
        body = body.replace("<head>", `<head><script>window.keryxLan=true;</script>${remote ? REMOTE_META : ""}`);
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
        if (pathname === "/lan/remote-code") return handleRemoteCode(req, res);
        if (pathname === "/api/remote") return handleRemote(req, res);
        // The remote's page: only while it is on, only with its code.
        const routeNow = pathname.replace(/\/+$/, "");
        if (routeNow === REMOTE_PATH && req.method === "GET") {
            if (!phonesOn()) return html(res, 404, notFoundPage);
            if (!roleOf(req)) return res.writeHead(303, { Location: "/lan/remote-code" }).end();
            return serveIndex(req, res, { remote: true });
        }

        // A signed-in phone also reads what the screens read (the live
        // state, the Setlist's rows), PIN or not.
        if (!isAuthed(req) && !roleOf(req)) {
            const wantsPage = req.method === "GET" && String(req.headers.accept || "").includes("text/html");
            if (wantsPage) return res.writeHead(303, { Location: `/lan/pin?next=${encodeURIComponent(req.url)}` }).end();
            return json(res, 401, { error: { message: "PIN necessário.", status: 401 } });
        }

        if (pathname === "/api/events" && req.method === "GET") return handleEvents(req, res, url);
        if (pathname === "/api/db") return handleDb(req, res);
        if (pathname === "/api/screens" && req.method === "GET") {
            if (remoteOnly(req)) return json(res, 401, { error: { message: "PIN necessário.", status: 401 } });
            return json(res, 200, screensOf());
        }
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
        screens: screensOf,
        start({ port, host = "0.0.0.0" }) {
            if (server) return Promise.resolve({ port: server.address().port });
            server = http.createServer((req, res) => {
                handler(req, res).catch((err) => {
                    log(`[keryx-lan] ${req.method} ${req.url}: ${err && err.stack}`);
                    if (!res.headersSent) res.writeHead(500).end();
                    else res.destroy();
                });
            });
            // Every frame through writeFrame: a stream that stopped reading is dropped.
            const broadcast = (frame, to = () => true) => {
                for (const client of [...clients]) if (to(client) && !writeFrame(client, frame)) clients.delete(client);
            };
            unsubscribe = store.onChange((change) => {
                // A phone signed in only by its code hears only the profile;
                // the Equipe's, its messages too (Rodada Q).
                broadcast(`data: ${JSON.stringify(change)}\n\n`, (client) => !client.remoteOnly || change.entity === "User" || (client.role === "team" && change.entity === "ServiceMessage"));
            });
            if (live) {
                unsubscribeLive = live.onChange((snapshot) => broadcast(`event: live\ndata: ${JSON.stringify(snapshot)}\n\n`));
            }
            // The heartbeat (a named event): pages tell a quiet service from a
            // dead link by it (network.js lastEventAt; the remote is stale
            // after 25 s without any frame).
            keepalive = setInterval(() => broadcast(`event: hb\ndata: {"t":${Date.now()}}\n\n`), heartbeatMs);
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
        clients: () => { const names = screenLabels(store); return [...clients].map(({ ip, agent, since, screen, role }) => ({ ip: ip.replace(/^::ffff:/, ""), agent, since, screen, ...(role ? { role } : {}), label: screen === REMOTE_PATH ? (role === "team" ? "Equipe" : "Controle") : names[screen] || NETWORK_SCREENS.find((s) => s.path === screen)?.label || "" })); },
        // Desconectar todos: the phones' event streams close now (their
        // cookie stops working with the new key the caller saves). role:
        // only the Controle's ("control") or only the Equipe's ("team").
        dropRemotes(role = "control") { for (const client of [...clients]) if (client.screen === REMOTE_PATH && (client.role || "control") === role) { client.res.end(); clients.delete(client); } },
    };
}

module.exports = { createLanServer, lanAddresses, NETWORK_SCREENS, authToken, safeNext, remoteCommand, roleAllows, teamToken, doorOn, codePage, remoteReply, remoteTimeout, remoteReads, createRemoteGate, writeFrame, remoteToken, REMOTE_PATH, REMOTE_ACTIONS };
