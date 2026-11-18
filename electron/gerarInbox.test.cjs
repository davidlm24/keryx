// node --test electron/gerarInbox.test.cjs   (npm test)
// What the GERAR sends (owner 2026-11-18, wave 2), with the GERAR faked: its
// tables answer by path, its locks and states by request; the console is a
// function that writes and answers. Nothing reaches the real GERAR.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createGerarInbox } = require("./gerarInbox.cjs");

const EV = { id: "ev-1", title: "Culto de domingo", date: "2026-11-23" };
const req = (id, extra = {}) => ({ id, event_id: "ev-1", requester_name: "Ana", title: `Louvor ${id}`, category: "song", status: "new", version: 1, created_at: "2026-11-23T19:00:00Z", events: EV, keryx_request_links: null, ...extra });
const pgError = (pg, status = 409) => Object.assign(new Error(`pg ${pg}`), { pg, status });

function memorySettings(gerar) {
    const data = { gerar };
    return { data, get: (k, d) => (data[k] === undefined ? d : data[k]), set: (k, v) => { data[k] = v; } };
}

// The GERAR. `db`: what the tables hold; `lock(id)`: what inserting a lock does.
function fakeGerar({ requests = [], linked = [], messages = [], lock = () => null, review = () => null, fresh = null } = {}) {
    const calls = [];
    const state = { on: true, receive: true, refused: null };
    const link = {
        status: () => ({ configured: true, state: state.on ? "on" : "needs", device: { id: "dev-1", name: "PC do som" }, receive: state.receive }),
        refused: (reason) => { state.refused = reason; state.on = false; },
        token: async () => "token",
        async rest(method, path, opts = {}) {
            calls.push({ method, path, body: opts.body });
            if (method === "GET" && path.startsWith("event_live_requests?select=id,")) return requests;
            if (method === "GET" && path.startsWith("event_live_requests?select=status,version")) return fresh ? [fresh] : [];
            if (method === "GET" && path.startsWith("keryx_request_links?")) return linked;
            if (method === "GET" && path.startsWith("event_live_messages?")) return messages;
            if (method === "GET" && path.startsWith("events?")) return [EV];
            if (method === "POST" && path === "keryx_request_links") {
                const err = lock(opts.body.request_id);
                if (err) throw err;
                return null;
            }
            if (method === "PATCH") return null;
            throw new Error(`unexpected ${method} ${path}`);
        },
        async rpc(name, args) {
            calls.push({ method: "RPC", path: name, body: args });
            const err = review(args);
            if (err) throw err;
            return {};
        },
    };
    return { link, calls, state };
}

// The console: writes every item and answers with the row's id.
function fakeConsole({ closed = false } = {}) {
    const got = [];
    const deliver = async ({ items }) => {
        got.push(...items);
        if (closed) return { error: "closed" };
        return { results: items.map((it) => ({ key: it.request ? it.request.id : it.message.id, id: `row-${it.request ? it.request.id : it.message.id}` })) };
    };
    return { got, deliver };
}

const manual = () => ({ setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 1, clearInterval: () => {} });

function make(g, cons, settings = memorySettings({ device: { id: "dev-1" }, linkedAt: "2026-11-23T18:00:00Z" })) {
    return { inbox: createGerarInbox({ link: g.link, deliver: cons.deliver, settings, log: () => {}, timers: manual() }), settings };
}

test("a new request: locked with this device, handed to the console, its id written back, in_review in the GERAR", async () => {
    const g = fakeGerar({ requests: [req("r1")] });
    const cons = fakeConsole();
    const { inbox } = make(g, cons);
    await inbox.pass();
    const steps = g.calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.path}`);
    assert.deepEqual(steps, ["POST keryx_request_links", "PATCH keryx_request_links?request_id=eq.r1", "RPC set_event_live_request_status"]);
    assert.deepEqual(g.calls.find((c) => c.method === "POST").body, { request_id: "r1", device_id: "dev-1" });
    assert.deepEqual(g.calls.find((c) => c.method === "PATCH").body, { keryx_message_id: "row-r1" });
    assert.deepEqual(g.calls.find((c) => c.method === "RPC").body, { _request_id: "r1", _status: "in_review", _expected_version: 1, _note: null });
    assert.equal(cons.got.length, 1);
    assert.equal(cons.got[0].type, "request");
    assert.deepEqual(cons.got[0].request.events, EV, "the culto rides with it");
});

test("another computer took it (23505): nothing comes here, and it is not tried again", async () => {
    const g = fakeGerar({ requests: [req("r1")], lock: () => pgError("23505") });
    const cons = fakeConsole();
    const { inbox } = make(g, cons);
    await inbox.pass();
    await inbox.pass();
    assert.equal(cons.got.length, 0);
    assert.equal(g.calls.filter((c) => c.method === "POST").length, 1, "one try");
});

test("a lock of this computer without its row (KERYX closed in between) is finished, without locking again", async () => {
    const g = fakeGerar({ requests: [req("r2", { keryx_request_links: { device_id: "dev-1", keryx_message_id: null } }), req("r3", { keryx_request_links: { device_id: "dev-1", keryx_message_id: "x" } })] });
    const cons = fakeConsole();
    const { inbox } = make(g, cons);
    await inbox.pass();
    assert.equal(g.calls.filter((c) => c.method === "POST").length, 0);
    assert.deepEqual(cons.got.map((i) => i.request.id), ["r2"], "the finished one is left alone");
    assert.ok(g.calls.some((c) => c.method === "PATCH" && c.path.endsWith("eq.r2")));
});

test("the console closed: locked, nothing written back; the next pass finishes it", async () => {
    const g = fakeGerar({ requests: [req("r4")] });
    const cons = fakeConsole({ closed: true });
    const { inbox } = make(g, cons);
    await inbox.pass();
    assert.equal(g.calls.filter((c) => c.method === "PATCH" || c.method === "RPC").length, 0);
});

test("40001 (the version changed): read it and try once more; a request already past new is left as is", async () => {
    let n = 0;
    const g = fakeGerar({ requests: [req("r5"), req("r6", { status: "preparing" })], review: () => (n++ === 0 ? pgError("40001") : null), fresh: { status: "new", version: 3 } });
    const cons = fakeConsole();
    const { inbox } = make(g, cons);
    await inbox.pass();
    const rpcs = g.calls.filter((c) => c.method === "RPC");
    assert.equal(rpcs.length, 2, "r5 twice, r6 never");
    assert.equal(rpcs[1].body._expected_version, 3);
});

test("a 42501 on a read: precisa de você, and the inbox stops", async () => {
    const g = fakeGerar();
    g.link.rest = async () => { throw pgError("42501", 403); };
    const cons = fakeConsole();
    const { inbox } = make(g, cons);
    inbox.start();
    await inbox.pass();
    assert.equal(g.state.refused, "revoked");
    assert.equal(inbox.running(), false);
});

test("the chat: only the team's, handed with its culto, and the cursor moves to the newest", async () => {
    const messages = [
        { id: "m1", event_id: "ev-1", side: "team", sender_name: "Ana", text: "oi", created_at: "2026-11-23T19:01:00Z" },
        { id: "m2", event_id: "ev-1", side: "desk", sender_name: "PC do som", text: "ok", created_at: "2026-11-23T19:02:00Z" },
        { id: "m3", event_id: "ev-1", side: "team", sender_name: "Rui", text: "som?", created_at: "2026-11-23T19:03:00Z" },
    ];
    const g = fakeGerar({ messages });
    const cons = fakeConsole();
    const { inbox, settings } = make(g, cons);
    await inbox.pass();
    assert.deepEqual(cons.got.map((i) => i.message.id), ["m1", "m3"]);
    assert.equal(settings.data.gerar.msgCursor, "2026-11-23T19:03:00Z");
    const query = g.calls.filter((c) => c.path.startsWith("event_live_messages?")).pop().path;
    assert.match(query, /created_at=gt\.2026-11-23T18%3A00%3A00Z/, "from the connection, the first time");
    await inbox.pass();
    assert.match(g.calls.filter((c) => c.path.startsWith("event_live_messages?")).pop().path, /gt\.2026-11-23T19%3A03%3A00Z/);
});

test("what this computer brought keeps the GERAR's state (status items)", async () => {
    const g = fakeGerar({ linked: [{ request_id: "r7", event_live_requests: req("r7", { status: "cancelled" }) }] });
    const cons = fakeConsole();
    const { inbox } = make(g, cons);
    await inbox.pass();
    assert.deepEqual(cons.got.map((i) => [i.type, i.request.status]), [["status", "cancelled"]]);
});

test("Receber off (or not connected): nothing is asked", async () => {
    const g = fakeGerar({ requests: [req("r8")] });
    g.state.receive = false;
    const cons = fakeConsole();
    const { inbox } = make(g, cons);
    inbox.follow();
    await inbox.pass();
    assert.equal(g.calls.length, 0);
    assert.equal(inbox.running(), false);
});

test("Realtime: a message and a request come at once, a change updates the state, a closed new one is ignored", async () => {
    const g = fakeGerar();
    const cons = fakeConsole();
    let handler = null;
    const realtime = { subscribe: async (fn) => { handler = fn; return { unsubscribe() {} }; } };
    const settings = memorySettings({ device: { id: "dev-1" }, linkedAt: "2026-11-23T18:00:00Z" });
    const inbox = createGerarInbox({ link: g.link, deliver: cons.deliver, settings, realtime, log: () => {}, timers: manual() });
    inbox.start();
    await new Promise((r) => setImmediate(r));
    handler({ table: "event_live_messages", eventType: "INSERT", new: { id: "m9", event_id: "ev-1", side: "team", sender_name: "Ana", text: "oi", created_at: "2026-11-23T19:10:00Z" } });
    handler({ table: "event_live_requests", eventType: "INSERT", new: { ...req("r9"), events: undefined } });
    handler({ table: "event_live_requests", eventType: "INSERT", new: req("r10", { status: "cancelled" }) });
    handler({ table: "event_live_requests", eventType: "UPDATE", new: req("r9", { status: "completed" }) });
    await new Promise((r) => setTimeout(r, 10));
    const kinds = cons.got.map((i) => `${i.type}:${(i.request || i.message).id}`);
    assert.ok(kinds.includes("message:m9"));
    assert.ok(kinds.includes("request:r9"));
    assert.ok(kinds.includes("status:r9"));
    assert.ok(!kinds.some((k) => k.endsWith("r10")));
    assert.deepEqual(cons.got.find((i) => i.type === "request").request.events, EV, "the culto read when Realtime did not bring it");
    inbox.stop();
});

test("what this computer brought queues its files (wave 4)", async () => {
    const g = fakeGerar({ requests: [req("r11")] });
    const cons = fakeConsole();
    const queued = [];
    let ran = 0;
    const files = { queue: (id) => queued.push(id), run: async () => { ran += 1; } };
    const settings = memorySettings({ device: { id: "dev-1" }, linkedAt: "2026-11-23T18:00:00Z" });
    const inbox = createGerarInbox({ link: g.link, deliver: cons.deliver, settings, files, log: () => {}, timers: manual() });
    await inbox.pass();
    assert.deepEqual(queued, ["r11"]);
    assert.ok(ran >= 1);
});
