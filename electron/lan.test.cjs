const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createStore } = require("./db/store.cjs");
const schema = require("./db/schema.json");
const { createLanServer, lanAddresses, safeNext, remoteCommand, roleAllows, remoteReply, remoteTimeout, remoteReads, createRemoteGate, writeFrame, REMOTE_ACTIONS } = require("./lan.cjs");
const PROTOCOL = require("../shared/remoteProtocol.json");
const { createLive, loadLiveRules } = require("./live.cjs");

async function fixture(config = { pin: "", secret: "s3cret" }, { onRemote = null, heartbeatMs } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "keryx-lan-"));
    const dist = path.join(root, "dist");
    fs.mkdirSync(path.join(dist, "assets"), { recursive: true });
    fs.writeFileSync(path.join(dist, "index.html"), "<!doctype html><html><head><title>KERYX</title></head><body></body></html>");
    fs.writeFileSync(path.join(dist, "assets", "app.js"), "console.log(1)");
    fs.mkdirSync(path.join(dist, "icons"));
    fs.writeFileSync(path.join(dist, "icons", "keryx-512.png"), Buffer.alloc(8));
    fs.writeFileSync(path.join(dist, "remote.webmanifest"), JSON.stringify({
        name: "KERYX · Controle remoto", short_name: "KERYX", start_url: "/Remote", display: "standalone",
        icons: [{ src: "/icons/keryx-512.png", sizes: "512x512", type: "image/png" }],
    }));
    const media = path.join(root, "media");
    fs.mkdirSync(media);
    fs.writeFileSync(path.join(media, "a.png"), Buffer.alloc(1000, 1));
    fs.writeFileSync(path.join(root, "secret.txt"), "nope");
    const store = createStore({ file: ":memory:", schema, log: () => {} });
    const cfg = { ...config };
    const live = createLive({ file: path.join(root, "live.json"), rules: await loadLiveRules(), log: () => {} });
    const lan = createLanServer({ distDir: dist, mediaDir: media, bundledDir: null, store, live, getConfig: () => cfg, onRemote, heartbeatMs });
    return { lan, store, live, cfg };
}

async function started(config, opts) {
    const f = await fixture(config, opts);
    const { port } = await f.lan.start({ port: 0, host: "127.0.0.1" });
    f.base = `http://127.0.0.1:${port}`;
    f.db = (body, headers = { "x-keryx": "1" }) => fetch(`${f.base}/api/db`, {
        method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
    });
    return f;
}

const page = (base, p, headers = {}) => fetch(base + p, { redirect: "manual", headers: { accept: "text/html", ...headers } });

test("serves only screen pages and '/', with the network flag injected", async (t) => {
    const f = await started();
    t.after(() => f.lan.stop());
    for (const p of ["/", "/Projection", "/LyricProjection", "/StageView/", "/PastorView", "/CommunicationProjection", "/VideoProjection", "/StreamView"]) {
        const res = await page(f.base, p);
        assert.equal(res.status, 200, p);
        assert.match(await res.text(), /<head><script>window\.keryxLan=true;<\/script>/, p);
    }
    for (const p of ["/Console", "/Home", "/Settings", "/DeviceView", "/BibleMaterialProjection", "/login"]) {
        const res = await page(f.base, p);
        assert.equal(res.status, 404, `${p} must not be reachable from the network`);
        assert.match(await res.text(), /computador do operador/);
    }
    assert.equal((await page(f.base, "/index.html")).status, 404, "the raw index is not a way around the page list");
});

test("static files: assets yes, nothing outside dist or media", async (t) => {
    const f = await started();
    t.after(() => f.lan.stop());
    assert.equal((await fetch(`${f.base}/assets/app.js`)).status, 200);
    assert.equal((await fetch(`${f.base}/media/a.png`)).status, 200);
    assert.equal((await fetch(`${f.base}/media/missing.png`)).status, 404);
    for (const p of ["/../secret.txt", "/assets/..%2f..%2fsecret.txt", "/media/..%2fsecret.txt", "/media/%2e%2e/secret.txt"]) {
        const res = await fetch(f.base + p);
        assert.notEqual(res.status, 200, p);
    }
    const ranged = await fetch(`${f.base}/media/a.png`, { headers: { Range: "bytes=0-9" } });
    assert.equal(ranged.status, 206);
    assert.equal((await ranged.arrayBuffer()).byteLength, 10);
});

test("the database is read-only from the network", async (t) => {
    const f = await started();
    t.after(() => f.lan.stop());
    const song = f.store.call("Song", "create", [{ title: "A" }]);
    const device = f.store.call("ProjectionDevice", "create", [{ name: "TV" }]);

    const listed = await (await f.db({ entity: "Song", op: "list", args: [] })).json();
    assert.equal(listed.data[0].title, "A");
    const got = await (await f.db({ entity: "Song", op: "get", args: [song.id] })).json();
    assert.equal(got.data.id, song.id);

    for (const [entity, op, args] of [
        ["Song", "create", [{ title: "x" }]],
        ["Song", "update", [song.id, { title: "x" }]],
        ["Song", "delete", [song.id]],
        ["User", "update", ["local", { logo_url: "x" }]],
        ["ProjectionDevice", "update", [device.id, { is_online: true }]],
        ["ProjectionDevice", "delete", [device.id]],
        ["VideoSync", "create", [{ video_url: "x" }]],
        ["VideoSync", "update", ["x", { status: "played" }]],
    ]) {
        const res = await f.db({ entity, op, args });
        assert.equal(res.status, 403, `${entity}.${op}`);
    }
    assert.equal(f.store.call("Song", "get", [song.id]).title, "A");

    const missing = await (await f.db({ entity: "Song", op: "get", args: ["nope"] })).json();
    assert.equal(missing.error.status, 404);
});

test("/api/db needs the custom header, valid JSON and a sane size", async (t) => {
    const f = await started();
    t.after(() => f.lan.stop());
    assert.equal((await f.db({ entity: "Song", op: "list", args: [] }, {})).status, 403, "no x-keryx header: a cross-site form post");
    const bad = await fetch(`${f.base}/api/db`, { method: "POST", headers: { "x-keryx": "1" }, body: "{not json" });
    assert.equal(bad.status, 400);
    const huge = await fetch(`${f.base}/api/db`, { method: "POST", headers: { "x-keryx": "1" }, body: "x".repeat(2 * 1024 * 1024) }).catch(() => ({ status: 413 }));
    assert.equal(huge.status, 413);
    assert.equal((await fetch(`${f.base}/api/db`)).status, 405);
});

test("a screen says which page it shows; unknown pages are not recorded", async (t) => {
    const f = await started();
    t.after(() => f.lan.stop());
    const a = new AbortController();
    const b = new AbortController();
    await fetch(`${f.base}/api/events?screen=%2FStageView`, { signal: a.signal });
    await fetch(`${f.base}/api/events?screen=%2FConsole`, { signal: b.signal });
    await new Promise((r) => setTimeout(r, 100));
    const seen = f.lan.clients().map((c) => [c.screen, c.label]).sort();
    assert.deepEqual(seen, [["", ""], ["/StageView", "Palco"]]);
    a.abort();
    b.abort();
    await new Promise((r) => setTimeout(r, 100));
});

test("store changes reach /api/events", async (t) => {
    const f = await started();
    t.after(() => f.lan.stop());
    const controller = new AbortController();
    const res = await fetch(`${f.base}/api/events`, { signal: controller.signal });
    assert.equal(res.headers.get("content-type"), "text/event-stream");
    const reader = res.body.getReader();
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(f.lan.clients().length, 1);
    f.store.call("LyricSync", "create", [{ song_title: "Grande", slide_index: 2, timestamp: 1 }]);
    let text = "";
    while (!text.includes("Grande")) text += new TextDecoder().decode((await reader.read()).value);
    const frame = text.split("\n").find((l) => l.startsWith("data: "));
    const change = JSON.parse(frame.slice(6));
    assert.equal(change.entity, "LyricSync");
    assert.equal(change.type, "create");
    assert.equal(change.data.slide_index, 2);
    controller.abort();
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(f.lan.clients().length, 0);
});

test("the live state: readable at /api/live, streamed as 'live' events, never writable", async (t) => {
    const f = await started();
    t.after(() => f.lan.stop());
    f.live.call("content.show", { title: "Hino", slides: ["Santo, santo, santo"], style: { background_image: "keryx-media://fundo.png" } });
    const res = await fetch(`${f.base}/api/live`);
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.rev, 1);
    assert.equal(data.content.slides[0].text, "Santo, santo, santo");
    assert.equal(data.content.style.background_image, "keryx-media://fundo.png", "the screen maps media URLs itself");
    assert.equal(typeof data.serverNow, "number");
    for (const method of ["POST", "PUT", "DELETE"]) {
        const refused = await fetch(`${f.base}/api/live`, { method, headers: { "x-keryx": "1" }, body: method === "DELETE" ? undefined : "{}" });
        assert.equal(refused.status, 405, method);
    }

    const controller = new AbortController();
    const events = await fetch(`${f.base}/api/events`, { signal: controller.signal });
    const reader = events.body.getReader();
    await new Promise((r) => setTimeout(r, 100));
    f.live.call("content.show", { title: "Outro", slides: ["Aleluia"] });
    let text = "";
    while (!text.includes("Aleluia")) text += new TextDecoder().decode((await reader.read()).value);
    const lines = text.split("\n");
    const at = lines.indexOf("event: live");
    assert.ok(at >= 0, "named live event");
    assert.equal(JSON.parse(lines[at + 1].slice(6)).rev, 2);
    controller.abort();
});

test("with a PIN: pages redirect to the PIN form, APIs say 401, the right PIN sets a cookie", async (t) => {
    const f = await started({ pin: "4321", secret: "s3cret" });
    t.after(() => f.lan.stop());
    const redirect = await page(f.base, "/LyricProjection?ch=1");
    assert.equal(redirect.status, 303);
    assert.equal(redirect.headers.get("location"), "/lan/pin?next=%2FLyricProjection%3Fch%3D1");
    assert.equal((await f.db({ entity: "Song", op: "list", args: [] })).status, 401);
    assert.equal((await fetch(`${f.base}/api/events`)).status, 401);
    assert.equal((await fetch(`${f.base}/api/live`)).status, 401);
    assert.equal((await fetch(`${f.base}/media/a.png`)).status, 401);

    const form = await page(f.base, "/lan/pin?next=%2FStageView");
    assert.match(await form.text(), /name="next" value="\/StageView"/);

    const post = (pin, next = "/StageView") => fetch(`${f.base}/lan/pin`, {
        method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ pin, next }).toString(),
    });
    const wrong = await post("0000");
    assert.equal(wrong.status, 401);
    assert.equal(wrong.headers.get("set-cookie"), null);

    const right = await post("4321");
    assert.equal(right.status, 303);
    assert.equal(right.headers.get("location"), "/StageView");
    const cookie = right.headers.get("set-cookie").split(";")[0];
    assert.match(right.headers.get("set-cookie"), /HttpOnly/);
    assert.equal((await page(f.base, "/StageView", { cookie })).status, 200);
    assert.equal((await f.db({ entity: "Song", op: "list", args: [] }, { "x-keryx": "1", cookie })).status, 200);

    // Changing the PIN signs every screen out.
    f.cfg.pin = "9999";
    assert.equal((await page(f.base, "/StageView", { cookie })).status, 303);

    // An open redirect through "next" is refused.
    const evil = await post("9999", "//evil.example/x");
    assert.equal(evil.headers.get("location"), "/");
});

test("five wrong PINs lock that address out for a while", async (t) => {
    const f = await started({ pin: "1234", secret: "s" });
    t.after(() => f.lan.stop());
    const post = (pin) => fetch(`${f.base}/lan/pin`, {
        method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `pin=${pin}`,
    });
    for (let i = 0; i < 5; i++) assert.equal((await post("0000")).status, 401);
    assert.equal((await post("1234")).status, 429, "even the right PIN waits out the lockout");
});

test("stop closes the event streams and frees the port", async () => {
    const f = await started();
    const res = await fetch(`${f.base}/api/events`);
    const reader = res.body.getReader();
    await new Promise((r) => setTimeout(r, 100));
    f.lan.stop();
    let done = false;
    while (!done) ({ done } = await reader.read().catch(() => ({ done: true })));
    assert.equal(f.lan.running(), false);
});

test("lanAddresses: private IPv4 only, home/church Wi-Fi ranges first", () => {
    const list = lanAddresses({
        "vEthernet (WSL)": [{ family: "IPv4", address: "172.24.0.1", internal: false }],
        "Wi-Fi": [{ family: "IPv4", address: "192.168.1.20", internal: false }, { family: "IPv6", address: "fe80::1", internal: false }],
        Loopback: [{ family: "IPv4", address: "127.0.0.1", internal: true }],
        Public: [{ family: "IPv4", address: "8.8.8.8", internal: false }],
        Corp: [{ family: "IPv4", address: "10.0.0.5", internal: false }],
    });
    assert.deepEqual(list.map((a) => a.address), ["192.168.1.20", "10.0.0.5", "172.24.0.1"]);
});

test("safeNext keeps same-site paths only", () => {
    assert.equal(safeNext("/StageView?x=1"), "/StageView?x=1");
    assert.equal(safeNext("//evil.example"), "/");
    assert.equal(safeNext("/\\evil.example"), "/");
    assert.equal(safeNext("https://evil.example"), "/");
    assert.equal(safeNext(null), "/");
});

test("screens() carries the operator name for an output (OutputPref.name)", async () => {
    const f = await fixture();
    f.store.call("OutputPref", "create", [{ screen_path: "/StageView", name: "  Monitor da banda  " }]);
    f.store.call("OutputPref", "create", [{ screen_path: "/PastorView", name: "" }]);
    const named = f.lan.screens();
    assert.equal(named.find((s) => s.path === "/StageView").label, "Monitor da banda");
    assert.equal(named.find((s) => s.path === "/PastorView").label, "Pastor", "an empty name keeps the factory label");
    const broken = f.lan; const real = f.store.call.bind(f.store);
    f.store.call = () => { throw new Error("db quebrou"); };
    assert.equal(broken.screens().find((s) => s.path === "/StageView").label, "Palco", "a store error falls back to the factory labels");
    f.store.call = real;
});

// The controle remoto: off by default, its own code (never optional), a
// closed list of commands the console runs; no other site can send them.
const REMOTE = { pin: "", secret: "s3cret", remote: { enabled: true, code: "246813", secret: "r3mote" } };
async function remoteSignedIn(f) {
    const res = await fetch(`${f.base}/lan/remote-code`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "code=246813" });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/Remote");
    assert.match(res.headers.get("set-cookie"), /HttpOnly/);
    assert.match(res.headers.get("set-cookie"), /SameSite=Strict/);
    return res.headers.get("set-cookie").split(";")[0];
}
const send = (f, body, headers = {}) => fetch(`${f.base}/api/remote`, { method: "POST", headers: { "content-type": "application/json", "x-keryx": "1", ...headers }, body: JSON.stringify(body) });

test("remote: off unless turned on; the page and the API are not there", async (t) => {
    const f = await started({ pin: "", secret: "s" }, { onRemote: async () => ({ ok: true }) });
    t.after(() => f.lan.stop());
    assert.equal((await page(f.base, "/Remote")).status, 404);
    assert.equal((await send(f, { action: "next" })).status, 404);
    assert.equal((await page(f.base, "/lan/remote-code")).status, 404);
});

test("remote: the code is required even when the screens have no PIN", async (t) => {
    const calls = [];
    const f = await started(REMOTE, { onRemote: async (action, args) => { calls.push([action, args]); return { ok: true, message: "Feito." }; } });
    t.after(() => f.lan.stop());
    const redirect = await page(f.base, "/Remote");
    assert.equal(redirect.status, 303);
    assert.equal(redirect.headers.get("location"), "/lan/remote-code");
    assert.equal((await send(f, { action: "next" })).status, 401, "no cookie: no command");
    assert.equal(calls.length, 0);
    // The screens' cookie (no PIN here) is not the remote's.
    const wrong = await fetch(`${f.base}/lan/remote-code`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "code=111111" });
    assert.equal(wrong.status, 401);
    const cookie = await remoteSignedIn(f);
    const remotePage = await page(f.base, "/Remote", { cookie });
    assert.equal(remotePage.status, 200);
    const remoteHtml = await remotePage.text();
    assert.match(remoteHtml, /rel="manifest" href="\/remote\.webmanifest"/);
    assert.match(remoteHtml, /rel="apple-touch-icon" href="\/icons\/keryx-512\.png"/);
    const manifest = await fetch(`${f.base}/remote.webmanifest`, { headers: { cookie } });
    assert.equal(manifest.status, 200);
    assert.match(manifest.headers.get("content-type"), /application\/manifest\+json/);
    assert.equal((await manifest.json()).start_url, "/Remote");
    assert.equal((await fetch(`${f.base}/icons/keryx-512.png`, { headers: { cookie } })).status, 200);
    const ok = await send(f, { action: "next" }, { cookie });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { data: { message: "Feito." } });
    assert.deepEqual(calls, [["next", {}]]);
    // A new code (or Desconectar todos: a new key) signs every phone out.
    f.cfg.remote = { ...f.cfg.remote, code: "135791" };
    assert.equal((await send(f, { action: "next" }, { cookie })).status, 401);
    f.cfg.remote = { ...f.cfg.remote, code: "246813", secret: "other" };
    assert.equal((await send(f, { action: "next" }, { cookie })).status, 401);
});

test("remote: another site cannot send commands with the phone's cookie", async (t) => {
    const calls = [];
    const f = await started(REMOTE, { onRemote: async (a) => { calls.push(a); return { ok: true }; } });
    t.after(() => f.lan.stop());
    const cookie = await remoteSignedIn(f);
    assert.equal((await send(f, { action: "black" }, { cookie, "x-keryx": "" })).status, 403, "no custom header");
    assert.equal((await send(f, { action: "black" }, { cookie, origin: "http://evil.example" })).status, 403, "another origin");
    assert.equal((await send(f, { action: "black" }, { cookie, origin: f.base })).status, 200, "its own origin");
    assert.deepEqual(calls, ["black"]);
});

test("remote: only the listed commands, with checked arguments", async (t) => {
    const calls = [];
    const f = await started(REMOTE, { onRemote: async (a, args) => { calls.push([a, args]); return { ok: true, data: a === "state" ? { items: [] } : undefined }; } });
    t.after(() => f.lan.stop());
    const cookie = await remoteSignedIn(f);
    assert.equal((await send(f, { action: "deleteEverything" }, { cookie })).status, 400);
    assert.equal((await send(f, { action: "sendItem", args: { itemId: "../x" } }, { cookie })).status, 400);
    assert.equal((await send(f, { action: "bibleSend", args: { ref: "x".repeat(41) } }, { cookie })).status, 400);
    assert.equal((await send(f, { action: "sendItem", args: { itemId: "abc-123", extra: 1 } }, { cookie })).status, 200);
    const state = await send(f, { action: "state" }, { cookie });
    assert.deepEqual((await state.json()).data.result, { items: [] });
    assert.deepEqual(calls, [["sendItem", { itemId: "abc-123" }], ["state", {}]], "extra arguments never reach the console");
    assert.throws(() => remoteCommand(null));
    assert.deepEqual(remoteCommand({ action: "bibleFind", args: { ref: "  jo 3 16 " } }), { action: "bibleFind", args: { ref: "jo 3 16" }, v: 1 });
});

test("remote: the console's refusal and its silence reach the phone", async (t) => {
    let mode = "refuse";
    const f = await started(REMOTE, { onRemote: () => (mode === "refuse" ? { ok: false, message: "Telas travadas.", status: 423 } : new Promise(() => {})) });
    t.after(() => f.lan.stop());
    const cookie = await remoteSignedIn(f);
    const refused = await send(f, { action: "next" }, { cookie });
    assert.equal(refused.status, 423);
    assert.equal((await refused.json()).error.message, "Telas travadas.");
    mode = "silent";
    const silent = await send(f, { action: "next" }, { cookie });
    assert.equal(silent.status, 504);
    assert.equal((await silent.json()).error.message, "O console não respondeu.");
});

test("remote: a signed-in phone reads the live state even with a screens PIN; five wrong codes lock out", async (t) => {
    const f = await started({ ...REMOTE, pin: "4321" }, { onRemote: async () => ({ ok: true }) });
    t.after(() => f.lan.stop());
    const cookie = await remoteSignedIn(f);
    assert.equal((await fetch(`${f.base}/api/live`, { headers: { cookie } })).status, 200);
    assert.equal((await fetch(`${f.base}/api/live`)).status, 401, "without either code: no");
    const post = (code) => fetch(`${f.base}/lan/remote-code`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `code=${code}` });
    for (let i = 0; i < 5; i++) assert.equal((await post("000000")).status, 401);
    assert.equal((await post("246813")).status, 429);
});

// -- Protocol v2 (shared/remoteProtocol.json; Rodada G6 PR1) -----------------

test("remote: every action of the contract, and only those", () => {
    assert.deepEqual([...REMOTE_ACTIONS].sort(), Object.keys(PROTOCOL.actions).sort());
    assert.equal(remoteTimeout("next"), 3000);
    assert.equal(remoteTimeout("bibleSend"), 8000);
    assert.equal(remoteReads("state"), true);
    assert.equal(remoteReads("library"), true);
    assert.equal(remoteReads("black"), false);
});

test("remote: args checked by type, unknown keys dropped, v passed on", () => {
    const ok = (body) => remoteCommand(body);
    const bad = (body) => assert.throws(() => remoteCommand(body), (err) => err.status === 400, JSON.stringify(body));
    // enum, int, bool, id, str (trimmed; empty = absent)
    assert.deepEqual(ok({ v: 2, action: "library", args: { tab: "songs", q: "  graça ", skip: 0, limit: 50, fav: true, junk: 1 } }),
        { action: "library", args: { tab: "songs", q: "graça", skip: 0, limit: 50, fav: true }, v: 2 });
    assert.deepEqual(ok({ v: 2, action: "library", args: { tab: "media", q: "   " } }).args, { tab: "media" });
    bad({ v: 2, action: "library", args: {} });
    bad({ v: 2, action: "library", args: { tab: "everything" } });
    bad({ v: 2, action: "library", args: { tab: "songs", limit: 51 } });
    bad({ v: 2, action: "library", args: { tab: "songs", skip: 1.5 } });
    bad({ v: 2, action: "library", args: { tab: "songs", fav: "yes" } });
    bad({ v: 2, action: "library", args: { tab: "songs", q: "x".repeat(41) } });
    bad({ v: 2, action: "goto", args: { index: 2000 } });
    bad({ v: 2, action: "goto", args: { index: "3" } });
    assert.deepEqual(ok({ v: 2, action: "goto", args: { index: 3 } }).args, { index: 3 });
    bad({ v: 2, action: "sendMedia", args: { kind: "song", id: "a b" } });
    assert.deepEqual(ok({ v: 2, action: "timerAdjust", args: { deltaMs: -60000 } }).args, { deltaMs: -60000 });
    bad({ v: 2, action: "timerAdjust", args: { deltaMs: -300000 } });
    bad({ v: 2, action: "lock", args: {} });
    // black/logo: on omitted toggles (version 1 pages)
    assert.deepEqual(ok({ action: "black" }), { action: "black", args: {}, v: 1 });
    assert.deepEqual(ok({ v: 2, action: "black", args: { on: false } }).args, { on: false });
    // oneOf: a reference XOR a book and chapter; a message XOR a preset
    assert.deepEqual(ok({ v: 2, action: "bibleSend", args: { book: "João", chapter: 3, verseStart: 16, version: "NVI" } }).args, { book: "João", chapter: 3, verseStart: 16, version: "NVI" });
    bad({ v: 2, action: "bibleSend", args: { book: "João" } });
    bad({ v: 2, action: "bibleSend", args: { ref: "jo 3 16", book: "João", chapter: 3 } });
    bad({ v: 2, action: "bibleSend", args: { version: "NVI" } });
    bad({ v: 2, action: "bibleSend", args: { book: "João", chapter: 151 } });
    assert.deepEqual(ok({ v: 2, action: "alert", args: { presetId: "p1" } }).args, { presetId: "p1" });
    bad({ v: 2, action: "alert", args: { message: "Oi", presetId: "p1" } });
    bad({ v: 2, action: "alert", args: {} });
    // the envelope
    bad({ v: 2, action: "next", args: [] });
    bad({ v: "2", action: "next" });
    bad({ v: 2, action: "reveal" });
});

test("remote: refusals carry their code; an unknown code never reaches the phone", () => {
    assert.deepEqual(remoteReply({ ok: false, status: 423, code: "locked", message: "Telas travadas." }),
        { status: 423, body: { error: { message: "Telas travadas.", status: 423, code: "locked" } } });
    assert.deepEqual(remoteReply({ ok: false, message: "Não.", code: "whatever" }), { status: 409, body: { error: { message: "Não.", status: 409 } } });
    assert.deepEqual(remoteReply({ ok: true, message: "x".repeat(300), data: { a: 1 } }).body.data, { message: "x".repeat(200), result: { a: 1 } });
});

test("remote: a burst of 10, then 8 a second; 4 waiting per phone, 8 in all", () => {
    let now = 1000;
    const gate = createRemoteGate(() => now);
    const turns = [];
    for (let i = 0; i < 4; i++) turns.push(gate.take("a"));
    assert.ok(turns.every((x) => x.ok));
    const fifth = gate.take("a");
    assert.deepEqual([fifth.ok, fifth.status, fifth.code], [false, 429, "rate"], "4 waiting on the console");
    for (const x of turns) x.done();
    for (let i = 0; i < 5; i++) gate.take("a").done();
    assert.equal(gate.take("a").ok, true, "the 10th");
    assert.equal(gate.take("a").status, 429, "past the burst");
    now += 125;
    assert.equal(gate.take("a").ok, true, "one more after 1/8 s");
    // 8 waiting in all, from any phones (a's last two still wait)
    const many = ["b", "b", "b", "b", "c", "c"].map((ip) => gate.take(ip));
    assert.ok(many.every((x) => x.ok));
    assert.equal(gate.waiting(), 8);
    const busy = gate.take("d");
    assert.deepEqual([busy.status, busy.code], [503, "busy"]);
});

test("remote: too many taps from one phone answer 429; codes and v reach the console", async (t) => {
    const seen = [];
    const f = await started(REMOTE, { onRemote: async (a, args, meta) => { seen.push([a, meta.v]); return a === "next" ? { ok: false, status: 423, code: "locked", message: "Telas travadas." } : { ok: true }; } });
    t.after(() => f.lan.stop());
    const cookie = await remoteSignedIn(f);
    const locked = await send(f, { v: 2, action: "next" }, { cookie });
    assert.equal(locked.status, 423);
    assert.equal((await locked.json()).error.code, "locked");
    assert.deepEqual(seen, [["next", 2]]);
    // All at once: the bucket refills 8 a second, so a sequential loop that is
    // slow under a busy machine could stay below the limit; 30 taps in flight
    // together cannot (10 in the burst, 4 waiting at most).
    const burst = await Promise.all(Array.from({ length: 30 }, () => send(f, { action: "state" }, { cookie })));
    const limited = burst.find((res) => res.status === 429);
    assert.ok(limited, "the burst ran out");
    assert.equal(limited.headers.get("retry-after"), "1");
    assert.equal((await limited.json()).error.code, "rate");
});

// Reads an event stream until match(text) (or ms pass).
async function framesUntil(res, match, ms = 2000) {
    const reader = res.body.getReader();
    let text = "";
    const until = Date.now() + ms;
    while (!match(text) && Date.now() < until) {
        const next = await Promise.race([reader.read(), new Promise((r) => setTimeout(() => r({ value: null }), Math.max(0, until - Date.now())))]);
        if (next.value) text += new TextDecoder().decode(next.value);
        if (next.done) break;
    }
    return text;
}

test("remote: a phone with only the remote's code reads only what its page uses", async (t) => {
    const f = await started({ ...REMOTE, pin: "4321" }, { onRemote: async () => ({ ok: true }), heartbeatMs: 100 });
    t.after(() => f.lan.stop());
    const cookie = await remoteSignedIn(f);
    f.store.call("Song", "create", [{ title: "Hino", lyrics: "x" }]);
    const db = (body, c = cookie) => f.db(body, { "x-keryx": "1", cookie: c });
    assert.equal((await db({ entity: "User", op: "get", args: ["me"] })).status, 200, "the church's profile");
    assert.equal((await db({ entity: "Song", op: "list", args: [] })).status, 403, "not the songs");
    assert.equal((await db({ entity: "User", op: "list", args: [] })).status, 403, "not a list");
    assert.equal((await fetch(`${f.base}/api/screens`, { headers: { cookie } })).status, 401);
    assert.equal((await fetch(`${f.base}/api/live`, { headers: { cookie } })).status, 200);
    assert.equal((await fetch(`${f.base}/media/a.png`, { headers: { cookie } })).status, 200);
    // Its event stream: the live state, the heartbeat and the profile only.
    const controller = new AbortController();
    t.after(() => controller.abort());
    const events = await fetch(`${f.base}/api/events?screen=%2FRemote`, { headers: { cookie }, signal: controller.signal });
    await new Promise((r) => setTimeout(r, 50));
    f.store.call("Song", "create", [{ title: "Segredo", lyrics: "x" }]);
    f.store.call("User", "create", [{ church_name: "Igreja do Teste" }]);
    f.live.call("screen.set", { mode: "black" });
    const text = await framesUntil(events, (x) => x.includes("Igreja do Teste") && x.includes("event: live") && x.includes("event: hb"));
    assert.match(text, /Igreja do Teste/);
    assert.match(text, /event: live/);
    assert.match(text, /event: hb\ndata: \{"t":\d+\}/);
    assert.doesNotMatch(text, /Segredo/);
    // With the PIN too, everything as before.
    const pin = await fetch(`${f.base}/lan/pin`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "pin=4321" });
    const both = `${cookie}; ${pin.headers.get("set-cookie").split(";")[0]}`;
    assert.equal((await db({ entity: "Song", op: "list", args: [] }, both)).status, 200);
    assert.equal((await fetch(`${f.base}/api/screens`, { headers: { cookie: both } })).status, 200);
});

test("event streams: a client that stopped reading is dropped", () => {
    let destroyed = false;
    const written = [];
    const slow = { res: { writableLength: 300 * 1024, destroy: () => { destroyed = true; }, write: (x) => written.push(x) } };
    assert.equal(writeFrame(slow, "data: x\n\n"), false);
    assert.equal(destroyed, true);
    assert.deepEqual(written, []);
    const fine = { res: { writableLength: 10, destroy: () => assert.fail("kept"), write: (x) => written.push(x) } };
    assert.equal(writeFrame(fine, "data: y\n\n"), true);
    assert.deepEqual(written, ["data: y\n\n"]);
});

test("remote: the phone's page is a home-screen app; the screens' pages are not", async (t) => {
    const f = await started(REMOTE, { onRemote: async () => ({ ok: true }) });
    t.after(() => f.lan.stop());
    const cookie = await remoteSignedIn(f);
    const remote = await (await page(f.base, "/Remote", { cookie })).text();
    assert.match(remote, /<meta name="theme-color" content="#0d0d0c">/);
    assert.match(remote, /apple-mobile-web-app-capable/);
    assert.match(remote, /window\.keryxLan=true/);
    assert.doesNotMatch(await (await page(f.base, "/Projection")).text(), /theme-color/);
});

// -- The Equipe (Rodada Q): a third code, the role "team" --------------------

const TEAM = { ...REMOTE, team: { enabled: true, code: "975310", secret: "t3am" } };
async function teamSignedIn(f) {
    const res = await fetch(`${f.base}/lan/remote-code`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "code=975310" });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/Remote");
    const set = res.headers.get("set-cookie");
    assert.match(set, /keryx_team=[0-9a-f]{64}; Path=\/; Max-Age=31536000; HttpOnly; SameSite=Strict/);
    assert.match(set, /keryx_remote=; Path=\/; Max-Age=0/, "the Controle's cookie goes");
    return set.split(";")[0];
}

test("equipe: what a role may run is checked by the server", () => {
    // The Equipe: only team: true, and the library's songs only.
    for (const action of ["next", "prev", "goto", "black", "logo", "clear", "off", "end", "undo", "sendNext", "sendItem", "sendMedia", "bibleSend", "player", "play", "follow", "layer", "alert", "alertClear", "tool", "timerAdjust", "lock", "setlist.autoplay", "setlist.add"]) {
        assert.throws(() => remoteCommand({ v: 2, action, args: {} }, "team"), (err) => err.status === 403 && err.code === "forbidden", action);
    }
    assert.throws(() => remoteCommand({ v: 2, action: "sendMedia", args: { kind: "song", id: "s1" } }, "team"), (err) => err.status === 403);
    assert.throws(() => remoteCommand({ v: 2, action: "library", args: { tab: "media" } }, "team"), (err) => err.status === 403);
    assert.deepEqual(remoteCommand({ v: 2, action: "library", args: { tab: "songs", q: "graça" } }, "team").args, { tab: "songs", q: "graça" });
    assert.deepEqual(remoteCommand({ v: 2, action: "chat.send", args: { from: " Ana ", text: "Oi" } }, "team").args, { from: "Ana", text: "Oi" });
    assert.deepEqual(remoteCommand({ v: 2, action: "request.send", args: { from: "Lucas", song: "Raridade", singer: "Ana", songId: "s1", junk: 1 } }, "team").args, { from: "Lucas", song: "Raridade", singer: "Ana", songId: "s1" });
    for (const action of ["state", "bibleFind", "requests", "songText"]) assert.equal(roleAllows(action, {}, "team"), true, action);
    // The Controle: everything but the Equipe's chat.
    for (const action of ["chat.send", "request.send", "requests", "songText"]) {
        assert.throws(() => remoteCommand({ v: 2, action, args: {} }), (err) => err.status === 403, action);
    }
    assert.equal(roleAllows("setlist.add", {}, "control"), true);
    assert.equal(roleAllows("toString", {}, "team"), false);
    // The checks of the args still hold: a too long text, a chapter alone.
    assert.throws(() => remoteCommand({ v: 2, action: "chat.send", args: { from: "Ana", text: "x".repeat(281) } }, "team"), (err) => err.status === 400);
    assert.throws(() => remoteCommand({ v: 2, action: "chat.send", args: { text: "Oi" } }, "team"), (err) => err.status === 400);
    assert.throws(() => remoteCommand({ v: 2, action: "setlist.add", args: { book: "João", chapter: 3 } }), (err) => err.status === 400, "a passage needs its verses");
    assert.throws(() => remoteCommand({ v: 2, action: "setlist.add", args: { kind: "song", id: "s1", book: "João" } }), (err) => err.status === 400);
    assert.deepEqual(remoteCommand({ v: 2, action: "setlist.add", args: { book: "João", chapter: 3, verseStart: 16 } }).args, { book: "João", chapter: 3, verseStart: 16 });
    assert.deepEqual(remoteCommand({ v: 2, action: "setlist.add", args: { kind: "media", id: "m1" } }).args, { kind: "media", id: "m1" });
});

test("equipe: off by default; its code signs in as the team, which never touches the air", async (t) => {
    const calls = [];
    const f = await started(TEAM, { onRemote: async (a, args, meta) => { calls.push([a, meta.role]); return { ok: true }; } });
    t.after(() => f.lan.stop());
    const cookie = await teamSignedIn(f);
    assert.equal((await page(f.base, "/Remote", { cookie })).status, 200);
    for (const [action, args] of [["next", {}], ["black", { on: true }], ["setlist.add", { kind: "song", id: "s1" }], ["sendMedia", { kind: "song", id: "s1" }]]) {
        const res = await send(f, { v: 2, action, args }, { cookie });
        assert.equal(res.status, 403, action);
        assert.equal((await res.json()).error.code, "forbidden");
    }
    assert.equal((await send(f, { v: 2, action: "state" }, { cookie })).status, 200);
    assert.equal((await send(f, { v: 2, action: "chat.send", args: { from: "Ana", text: "Oi" } }, { cookie })).status, 200);
    assert.deepEqual(calls, [["state", "team"], ["chat.send", "team"]], "only what the team may run reaches the console, with its role");
    // The Controle's code cannot chat.
    const control = await remoteSignedIn(f);
    const chat = await send(f, { v: 2, action: "chat.send", args: { from: "Ana", text: "Oi" } }, { cookie: control });
    assert.equal(chat.status, 403);
    assert.equal((await send(f, { v: 2, action: "next" }, { cookie: control })).status, 200);
    assert.deepEqual(calls.at(-1), ["next", "control"]);
    // Turned off: the team's cookie stops working; the Controle's goes on.
    f.cfg.team = { ...f.cfg.team, enabled: false };
    assert.equal((await send(f, { v: 2, action: "state" }, { cookie })).status, 401);
    assert.equal((await send(f, { v: 2, action: "state" }, { cookie: control })).status, 200);
    // Only the Equipe on: the page and the API answer it, the Controle's cookie does not.
    f.cfg.team = { ...f.cfg.team, enabled: true };
    f.cfg.remote = { ...f.cfg.remote, enabled: false };
    assert.equal((await send(f, { v: 2, action: "state" }, { cookie })).status, 200);
    assert.equal((await send(f, { v: 2, action: "next" }, { cookie: control })).status, 401);
    // A new key signs the team's phones out.
    f.cfg.team = { ...f.cfg.team, secret: "other" };
    assert.equal((await send(f, { v: 2, action: "state" }, { cookie })).status, 401);
});

test("equipe: with the screens' PIN it reads only its page's data, and hears its messages", async (t) => {
    const f = await started({ ...TEAM, pin: "4321" }, { onRemote: async () => ({ ok: true }), heartbeatMs: 100 });
    t.after(() => f.lan.stop());
    const cookie = await teamSignedIn(f);
    const db = (body) => f.db(body, { "x-keryx": "1", cookie });
    assert.equal((await db({ entity: "User", op: "get", args: ["me"] })).status, 200);
    assert.equal((await db({ entity: "Song", op: "list", args: [] })).status, 403);
    assert.equal((await db({ entity: "ServiceMessage", op: "list", args: [] })).status, 403, "the messages come through requests");
    assert.equal((await fetch(`${f.base}/api/screens`, { headers: { cookie } })).status, 401);
    assert.equal((await fetch(`${f.base}/api/live`, { headers: { cookie } })).status, 200);
    const controller = new AbortController();
    t.after(() => controller.abort());
    const events = await fetch(`${f.base}/api/events?screen=%2FRemote`, { headers: { cookie }, signal: controller.signal });
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(f.lan.clients().map((c) => [c.screen, c.role, c.label]), [["/Remote", "team", "Equipe"]]);
    f.store.call("Song", "create", [{ title: "Segredo", lyrics: "x" }]);
    f.store.call("ServiceMessage", "create", [{ serviceId: "svc", kind: "chat", sender: "Ana", text: "Chegando", sentAt: "2026-10-23T22:00:00.000Z" }]);
    const text = await framesUntil(events, (x) => x.includes("Chegando") && x.includes("event: hb"));
    assert.match(text, /Chegando/);
    assert.doesNotMatch(text, /Segredo/);
    // Desconectar todos of the Controle leaves the Equipe's phones.
    f.lan.dropRemotes("control");
    assert.equal(f.lan.clients().length, 1);
    f.lan.dropRemotes("team");
    assert.equal(f.lan.clients().length, 0);
});

test("equipe: messages have a bucket of their own, 3 in a row then one every 2 s", () => {
    let now = 0;
    const gate = createRemoteGate(() => now);
    for (let i = 0; i < 3; i++) assert.equal(gate.message("a", "chat.send").ok, true);
    const refused = gate.message("a", "request.send");
    assert.deepEqual([refused.ok, refused.status, refused.code], [false, 429, "rate"]);
    assert.equal(gate.message("b", "chat.send").ok, true, "per address");
    assert.equal(gate.message("a", "state").ok, true, "only the messages");
    now += 1000;
    assert.equal(gate.message("a", "chat.send").ok, false);
    now += 1000;
    assert.equal(gate.message("a", "chat.send").ok, true);
    assert.equal(gate.message("a", "chat.send").ok, false);
});
