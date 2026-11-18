// node --test electron/gerarOutbox.test.cjs   (npm test)
// What goes back to the GERAR (owner 2026-11-18, wave 3), with the GERAR
// faked: the request's version, the status RPC and the chat RPC.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createGerarOutbox } = require("./gerarOutbox.cjs");

const pgError = (pg, status = 409) => Object.assign(new Error(`pg ${pg}`), { pg, status });

function setup({ requests = {}, statusRpc = () => null, chatRpc = () => ({ id: "gm-1" }), on = true } = {}) {
    const data = { gerar: { device: { id: "dev-1" } } };
    const settings = { get: (k, d) => (data[k] === undefined ? d : data[k]), set: (k, v) => { data[k] = v; } };
    const calls = [];
    const updates = [];
    const state = { on, refused: null };
    const link = {
        status: () => ({ configured: true, state: state.on ? "on" : "offline", device: { id: "dev-1" } }),
        refused: (r) => { state.refused = r; state.on = false; },
        async rest(method, path) {
            calls.push(`${method} ${path.split("?")[0]}`);
            const id = /id=eq\.([^&]+)/.exec(path)[1];
            return requests[id] ? [requests[id]] : [];
        },
        async rpc(name, args) {
            calls.push(`RPC ${name}`);
            const out = name === "set_event_live_request_status" ? statusRpc(args) : chatRpc(args);
            if (out instanceof Error) throw out;
            return out;
        },
    };
    const store = { call: (entity, op, args) => updates.push([entity, op, ...args]) };
    let scheduled = 0;
    const outbox = createGerarOutbox({ link, settings, store, log: () => {}, timers: { setTimeout: () => { scheduled += 1; return 1; }, clearTimeout: () => {} } });
    return { outbox, data, calls, updates, state, scheduledCount: () => scheduled };
}

test("Atendido goes up with the version read just before; the queue empties", async () => {
    const t = setup({ requests: { r1: { id: "r1", status: "in_review", version: 4 } } });
    let args = null;
    t.outbox.add({ type: "status", requestId: "r1", status: "completed", note: null });
    await t.outbox.flush();
    assert.deepEqual(t.calls, ["GET event_live_requests", "RPC set_event_live_request_status"]);
    void args;
    assert.equal(t.outbox.pending(), 0);
});

test("already in that state there, or gone: nothing to send", async () => {
    const t = setup({ requests: { r1: { id: "r1", status: "completed", version: 4 } } });
    t.outbox.add({ type: "status", requestId: "r1", status: "completed" });
    t.outbox.add({ type: "status", requestId: "gone", status: "cancelled", note: "Excluído na mesa" });
    await t.outbox.flush();
    assert.ok(!t.calls.includes("RPC set_event_live_request_status"));
    assert.equal(t.outbox.pending(), 0);
});

test("40001: the version read again and one more try", async () => {
    let n = 0;
    const requests = { r1: { id: "r1", status: "in_review", version: 4 } };
    const t = setup({ requests, statusRpc: (a) => (n++ === 0 ? pgError("40001") : (assert.equal(a._expected_version, 5), null)) });
    t.outbox.add({ type: "status", requestId: "r1", status: "completed" });
    requests.r1 = { id: "r1", status: "preparing", version: 5 };
    await t.outbox.flush();
    assert.equal(t.calls.filter((c) => c.startsWith("RPC")).length, 2);
    assert.equal(t.outbox.pending(), 0);
});

test("the operator's reply goes up and the row keeps the GERAR's id (enviada ao GERAR)", async () => {
    const t = setup();
    t.outbox.add({ type: "chat", eventId: "ev-1", clientMessageId: "c-1", text: "Subindo agora", rowId: "row-9" });
    await t.outbox.flush();
    assert.deepEqual(t.calls, ["RPC send_event_live_message"]);
    assert.deepEqual(t.updates, [["ServiceMessage", "update", "row-9", { external_id: "gm-1" }]]);
});

test("unreachable: kept, in order, tried again later; back online it goes", async () => {
    const t = setup({ chatRpc: () => Object.assign(new Error("fora"), { code: "offline", status: 503 }) });
    t.outbox.add({ type: "chat", eventId: "ev-1", clientMessageId: "c-1", text: "um" });
    t.outbox.add({ type: "chat", eventId: "ev-1", clientMessageId: "c-2", text: "dois" });
    await t.outbox.flush();
    assert.equal(t.outbox.pending(), 2);
    assert.ok(t.scheduledCount() >= 1);
    assert.equal(t.calls.length, 1, "stops at the first unreachable one, the order kept");
});

test("not connected now: nothing is sent, the queue waits; 42501: precisa de você", async () => {
    const t = setup({ on: false });
    t.outbox.add({ type: "status", requestId: "r1", status: "completed" });
    await t.outbox.flush();
    assert.equal(t.calls.length, 0);
    assert.equal(t.outbox.pending(), 1);
    const u = setup({ requests: { r1: { id: "r1", status: "in_review", version: 1 } }, statusRpc: () => pgError("42501", 403) });
    u.outbox.add({ type: "status", requestId: "r1", status: "completed" });
    await u.outbox.flush();
    assert.equal(u.state.refused, "revoked");
    assert.equal(u.outbox.pending(), 1, "kept for after a new code");
});

test("a refusal of another kind drops that entry; a bad entry is never kept; no device, nothing kept", async () => {
    const t = setup({ chatRpc: () => pgError("23514", 400) });
    t.outbox.add({ type: "chat", eventId: "ev-1", clientMessageId: "c-1", text: "x" });
    await t.outbox.flush();
    assert.equal(t.outbox.pending(), 0);
    assert.deepEqual(t.outbox.add({ type: "status", requestId: "r1", status: "new" }), { queued: false });
    assert.deepEqual(t.outbox.add({ type: "chat", eventId: "ev-1", clientMessageId: "c", text: "  " }), { queued: false });
    t.data.gerar = {};
    assert.deepEqual(t.outbox.add({ type: "status", requestId: "r1", status: "completed" }), { queued: false });
});
