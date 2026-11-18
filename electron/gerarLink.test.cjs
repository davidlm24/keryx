// node --test electron/gerarLink.test.cjs   (npm test)
// The GERAR on this computer (owner 2026-11-18), with the GERAR faked: its
// Edge Function keryx-link, GoTrue's token endpoint and PostgREST's
// touch_keryx_device are one function standing in for fetch. Nothing here
// reaches the real GERAR.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createGerarLink, normalizeCode, tokenExpiry, refusedRefresh, TOUCH_MS, RETRY_MS } = require("./gerarLink.cjs");
const { gerarConfig } = require("./gerarConfig.cjs");
const { sealWith } = require("./syncControl.cjs");

const CONFIG = { configured: true, url: "https://gerar.example", anonKey: "anon-de-teste-publica-0123456789", linkUrl: "https://gerar.example/functions/v1/keryx-link" };

function memorySettings() {
    const data = {};
    return { data, get: (k, d) => (data[k] === undefined ? d : data[k]), set: (k, v) => { if (v === null) delete data[k]; else data[k] = v; } };
}
const protection = (available = true) => sealWith({
    isEncryptionAvailable: () => available,
    encryptString: (t) => Buffer.from(`sealed|${t}`).reverse(),
    decryptString: (b) => Buffer.from(b).reverse().toString().slice("sealed|".length),
});
const jwt = (exp) => ["e30", Buffer.from(JSON.stringify({ exp })).toString("base64url"), "x"].join(".");

// Timers we run by hand.
function manualTimers() {
    let id = 0;
    const pending = new Map();
    return {
        pending,
        setTimeout: (fn, ms) => { id += 1; pending.set(id, { fn, ms }); return id; },
        clearTimeout: (t) => { pending.delete(t); },
        // The next scheduled beat (the abort timers of requests are cleared).
        next: () => [...pending.values()].find((p) => p.ms !== 20000),
        fire: async () => {
            const entry = [...pending.entries()].find(([, p]) => p.ms !== 20000);
            if (!entry) return false;
            pending.delete(entry[0]);
            await entry[1].fn();
            return true;
        },
    };
}

// The GERAR: `answers` per endpoint, each a list consumed in order (the
// last one repeats); `calls` records what was asked.
function fakeGerar(answers) {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
        const body = init.body ? JSON.parse(init.body) : null;
        const kind = url.endsWith("/keryx-link") ? "link" : url.includes("/auth/v1/token") ? "refresh" : url.includes("/rpc/") ? url.split("/rpc/")[1] : "other";
        calls.push({ kind, url, headers: init.headers || {}, body });
        const list = answers[kind] || [];
        const a = list.length > 1 ? list.shift() : list[0];
        if (!a) throw new Error(`unexpected ${kind}`);
        if (a === "network") throw new TypeError("fetch failed");
        return { status: a.status, json: async () => a.body };
    };
    return { calls, fetchImpl };
}

const LINKED = (exp = 2e9) => ({ status: 200, body: { ok: true, device_id: "dev-1", device_name: "PC do som", access_token: jwt(exp), refresh_token: "r1" } });

function make(answers, opts = {}) {
    const settings = opts.settings || memorySettings();
    const protect = opts.protect || protection();
    const g = fakeGerar(answers);
    const timers = manualTimers();
    const bell = [];
    const gone = [];
    let clock = opts.now || 1_700_000_000_000;
    const link = createGerarLink({
        settings, protect, config: opts.config || CONFIG, fetchImpl: g.fetchImpl, timers,
        notify: (n) => bell.push(n), dismiss: (k) => gone.push(k), log: () => {},
        now: () => clock,
    });
    return { link, settings, protect, g, timers, bell, gone, tick: (ms) => { clock += ms; } };
}

test("the code is the GERAR's: 6 of its letters and digits, the dash optional", () => {
    assert.equal(normalizeCode("k7m4qx"), "K7M-4QX");
    assert.equal(normalizeCode(" K7M-4QX "), "K7M-4QX");
    assert.equal(normalizeCode("K7M 4QX"), "K7M-4QX");
    assert.equal(normalizeCode("K7M-4Q"), null);
    assert.equal(normalizeCode("I0O-1QX"), null, "no I, O, 0 or 1: the GERAR never makes them");
    assert.equal(normalizeCode(123456), null);
    assert.equal(tokenExpiry(jwt(1800000000)), 1800000000000);
    assert.equal(tokenExpiry("not a jwt"), 0);
});

test("the config is public values only: the GERAR's URL and a key of role anon, never the service role", () => {
    const own = gerarConfig({});
    assert.equal(own.configured, true, "the GERAR's public values are written in");
    assert.match(own.url, /^https:\/\/[a-z0-9]+\.supabase\.co$/);
    const role = JSON.parse(Buffer.from(own.anonKey.split(".")[1], "base64url").toString()).role;
    assert.equal(role, "anon", "never a service_role key in the app");
    assert.equal(gerarConfig({ KERYX_GERAR_URL: "https://x", KERYX_GERAR_ANON_KEY: "short" }).configured, false, "an override too short is off");
    const c = gerarConfig({ KERYX_GERAR_URL: "https://abc.supabase.co/", KERYX_GERAR_ANON_KEY: "eyJ-anon-key-publica-0123456789" });
    assert.equal(c.configured, true);
    assert.equal(c.url, "https://abc.supabase.co");
    assert.equal(c.linkUrl, "https://abc.supabase.co/functions/v1/keryx-link");
    assert.equal(gerarConfig({ KERYX_GERAR_URL: "http://abc.supabase.co", KERYX_GERAR_ANON_KEY: "eyJ-anon-key-publica-0123456789" }).configured, false, "https only");
});

test("connecting: the code goes to keryx-link, only the refresh token is kept, sealed; on at once (D5 = A)", async () => {
    const t = make({ link: [LINKED()] });
    const s = await t.link.ops.link({ code: "k7m4qx" });
    assert.equal(s.state, "on");
    assert.deepEqual(s.device, { id: "dev-1", name: "PC do som" });
    assert.equal(s.receive, true);
    const call = t.g.calls[0];
    assert.equal(call.kind, "link");
    assert.deepEqual(call.body, { code: "K7M-4QX" });
    assert.equal(call.headers.apikey, CONFIG.anonKey);
    const saved = t.settings.data.gerar;
    assert.ok(saved.refresh.startsWith("safe:"), "sealed");
    assert.ok(!JSON.stringify(saved).includes("r1"), "never the plain refresh token");
    assert.ok(!JSON.stringify(saved).includes("access"), "never the access token");
    assert.equal(t.protect.open(saved.refresh), "r1");
    assert.equal(t.timers.next().ms, TOUCH_MS, "the heartbeat is scheduled");
});

test("a refused code, the rate limit and no internet each say so, and nothing is kept", async () => {
    for (const [answer, code, words] of [
        [{ status: 401, body: { ok: false, code: "invalid_or_expired" } }, "invalid", /inválido ou vencido/],
        [{ status: 429, body: { ok: false, code: "invalid_or_rate_limited" } }, "rate", /Muitas tentativas/],
        ["network", "offline", /Sem internet/],
    ]) {
        const t = make({ link: [answer] });
        await assert.rejects(t.link.ops.link({ code: "K7M-4QX" }), (err) => err.code === code && words.test(err.message));
        assert.equal(t.link.status().state, "off");
        assert.equal(t.settings.data.gerar, undefined);
    }
    const t = make({ link: [LINKED()] });
    await assert.rejects(t.link.ops.link({ code: "abc" }), (err) => err.code === "invalid");
    assert.equal(t.g.calls.length, 0, "a code of the wrong shape never leaves the computer");
});

test("no protection on this computer: the session is never kept in the clear", async () => {
    const t = make({ link: [LINKED()] }, { protect: protection(false) });
    await assert.rejects(t.link.ops.link({ code: "K7M-4QX" }), (err) => err.code === "unsafe");
    assert.equal(t.g.calls.length, 0);
});

test("unconfigured KERYX: Conectar refuses before any request", async () => {
    const t = make({}, { config: { configured: false, url: "", anonKey: "", linkUrl: "" } });
    assert.equal(t.link.status().configured, false);
    await assert.rejects(t.link.ops.link({ code: "K7M-4QX" }), (err) => err.code === "unconfigured");
});

test("the heartbeat touches as the device; an expired access token is renewed first and the new refresh token sealed", async () => {
    const t = make({
        link: [LINKED(1_700_000_100)],
        refresh: [{ status: 200, body: { access_token: jwt(2e9), refresh_token: "r2", expires_in: 3600 } }],
        touch_keryx_device: [{ status: 200, body: "2026-11-18T19:00:00Z" }],
    });
    await t.link.ops.link({ code: "K7M-4QX" });
    t.tick(200_000);
    await t.timers.fire();
    const kinds = t.g.calls.map((c) => c.kind);
    assert.deepEqual(kinds, ["link", "refresh", "touch_keryx_device"]);
    assert.deepEqual(t.g.calls[1].body, { refresh_token: "r1" });
    assert.equal(t.g.calls[2].headers.Authorization, `Bearer ${jwt(2e9)}`);
    assert.equal(t.protect.open(t.settings.data.gerar.refresh), "r2", "the rotated token replaces the old one");
    assert.equal(t.link.status().lastSeen, "2026-11-18T19:00:00Z");
    assert.equal(t.link.status().state, "on");
});

test("42501 from touch_keryx_device (disconnected in the GERAR): precisa de você, the bell once, and no loop", async () => {
    const t = make({
        link: [LINKED()],
        touch_keryx_device: [{ status: 403, body: { code: "42501", message: "Dispositivo KERYX não autorizado" } }],
    });
    await t.link.ops.link({ code: "K7M-4QX" });
    await t.timers.fire();
    const s = t.link.status();
    assert.equal(s.state, "needs");
    assert.equal(s.needs.reason, "revoked");
    assert.equal(t.bell.length, 1);
    assert.equal(t.bell[0].action, "settings:conexoes");
    assert.equal(t.timers.next(), undefined, "nothing scheduled: no loop");
    const asked = t.g.calls.length;
    await t.link.resume();
    await t.link.start();
    assert.equal(t.g.calls.length, asked, "waking up or a restart asks nothing");
    assert.equal(t.bell.length, 1, "the bell says it once");
});

test("invalid_grant (the session ended): precisa de você too, kept across a restart", async () => {
    const t = make({
        link: [LINKED(1_700_000_010)],
        refresh: [{ status: 400, body: { error: "invalid_grant", error_description: "Invalid Refresh Token: Refresh Token Not Found" } }],
    });
    await t.link.ops.link({ code: "K7M-4QX" });
    t.tick(60_000);
    await t.timers.fire();
    assert.equal(t.link.status().state, "needs");
    assert.equal(t.link.status().needs.reason, "session");
    // A new start on the same settings: still needs, asks nothing.
    const again = make({}, { settings: t.settings, protect: t.protect });
    assert.equal(again.link.status().state, "needs");
    await again.link.start();
    assert.equal(again.g.calls.length, 0);
    assert.equal(refusedRefresh(400, { error_code: "refresh_token_already_used" }), true);
    assert.equal(refusedRefresh(500, { error: "invalid_grant" }), false, "a server error is not a refusal");
});

test("the GERAR unreachable: offline, tried again on the backoff, and back on when it answers", async () => {
    const t = make({
        link: [LINKED()],
        touch_keryx_device: ["network", { status: 500, body: { message: "boom" } }, { status: 200, body: "2026-11-18T19:05:00Z" }],
    });
    await t.link.ops.link({ code: "K7M-4QX" });
    await t.timers.fire();
    assert.equal(t.link.status().state, "offline");
    assert.equal(t.timers.next().ms, RETRY_MS[0]);
    await t.timers.fire();
    assert.equal(t.link.status().state, "offline");
    assert.equal(t.timers.next().ms, RETRY_MS[1], "the wait grows");
    await t.timers.fire();
    assert.equal(t.link.status().state, "on");
    assert.equal(t.timers.next().ms, TOUCH_MS);
    assert.equal(t.bell.length, 0, "being offline is not precisa de você");
});

test("a new code after precisa de você connects again and clears the bell", async () => {
    const t = make({
        link: [LINKED(), { status: 200, body: { ok: true, device_id: "dev-2", device_name: "PC do som", access_token: jwt(2e9), refresh_token: "r9" } }],
        touch_keryx_device: [{ status: 403, body: { code: "42501" } }],
    });
    await t.link.ops.link({ code: "K7M-4QX" });
    await t.timers.fire();
    assert.equal(t.link.status().state, "needs");
    const s = await t.link.ops.link({ code: "ABC-DEF" });
    assert.equal(s.state, "on");
    assert.equal(s.device.id, "dev-2");
    assert.equal(s.needs, null);
    assert.ok(t.gone.includes("gerar"));
    assert.equal(t.settings.data.gerar.needs, undefined);
});

test("Desconectar forgets here; Receber can be turned off", async () => {
    const t = make({ link: [LINKED()] });
    await t.link.ops.link({ code: "K7M-4QX" });
    assert.equal(t.link.ops.setReceive({ on: false }).receive, false);
    const s = t.link.ops.forget();
    assert.equal(s.state, "off");
    assert.equal(s.device, null);
    assert.equal(t.settings.data.gerar, undefined);
    assert.equal(t.timers.next(), undefined);
    assert.throws(() => t.link.ops.setReceive({ on: true }), /Conecte/);
});

test("a new code keeps what waits to go back (the outbox); the count is in the status", async () => {
    const t = make({ link: [LINKED(), { status: 200, body: { ok: true, device_id: "dev-2", device_name: "PC do som", access_token: jwt(2e9), refresh_token: "r9" } }] });
    await t.link.ops.link({ code: "K7M-4QX" });
    t.settings.data.gerar.outbox = [{ type: "chat", eventId: "ev", clientMessageId: "c", text: "oi" }];
    t.link.setPending(() => t.settings.data.gerar.outbox.length);
    assert.equal(t.link.status().pending, 1);
    await t.link.ops.link({ code: "ABC-DEF" });
    assert.equal(t.settings.data.gerar.outbox.length, 1);
    assert.equal(t.settings.data.gerar.device.id, "dev-2");
});
