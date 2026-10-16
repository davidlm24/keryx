const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createStore } = require("./db/store.cjs");
const schema = require("./db/schema.json");
const { createLanServer, lanAddresses, safeNext, remoteCommand } = require("./lan.cjs");
const { createLive, loadLiveRules } = require("./live.cjs");

async function fixture(config = { pin: "", secret: "s3cret" }, { onRemote = null } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "keryx-lan-"));
    const dist = path.join(root, "dist");
    fs.mkdirSync(path.join(dist, "assets"), { recursive: true });
    fs.writeFileSync(path.join(dist, "index.html"), "<!doctype html><html><head><title>KERYX</title></head><body></body></html>");
    fs.writeFileSync(path.join(dist, "assets", "app.js"), "console.log(1)");
    const media = path.join(root, "media");
    fs.mkdirSync(media);
    fs.writeFileSync(path.join(media, "a.png"), Buffer.alloc(1000, 1));
    fs.writeFileSync(path.join(root, "secret.txt"), "nope");
    const store = createStore({ file: ":memory:", schema, log: () => {} });
    const cfg = { ...config };
    const live = createLive({ file: path.join(root, "live.json"), rules: await loadLiveRules(), log: () => {} });
    const lan = createLanServer({ distDir: dist, mediaDir: media, bundledDir: null, store, live, getConfig: () => cfg, onRemote });
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
    assert.equal((await page(f.base, "/Remote", { cookie })).status, 200);
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
    assert.deepEqual(remoteCommand({ action: "bibleFind", args: { ref: "  jo 3 16 " } }), { action: "bibleFind", args: { ref: "jo 3 16" } });
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
