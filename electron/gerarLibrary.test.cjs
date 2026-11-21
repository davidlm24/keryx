// node --test electron/gerarLibrary.test.cjs   (npm test)
// The KERYX library in the GERAR (owner 2026-11-18, contract C8), with the
// GERAR faked: the two RPCs of the device record what they get.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createGerarLibrary, libraryItem, libraryIndex, PAGE, RETRY_MS } = require("./gerarLibrary.cjs");

const media = (id, extra = {}) => ({ id, title: `Item ${id}`, type: "video", file_url: `keryx-media://${id}.mp4`, duration: 241.6, category: "Louvor", updated_date: "2026-11-18T10:00:00Z", description: "segredo da igreja", ...extra });

function setup({ rows = [], on = true, receive = true, rpc = () => ({}) } = {}) {
    const data = { gerar: { device: { id: "dev-1" } } };
    const settings = { get: (k, d) => (data[k] === undefined ? d : data[k]), set: (k, v) => { data[k] = v; } };
    const calls = [];
    const state = { refused: null, changed: 0 };
    const link = {
        status: () => ({ configured: true, state: on ? "on" : "offline", device: { id: "dev-1" }, receive }),
        rpc: async (name, args) => { calls.push({ name, args }); const out = rpc(name, args); if (out instanceof Error) throw out; return out; },
        refused: (r) => { state.refused = r; },
        changed: () => { state.changed += 1; },
    };
    const store = { call: (entity, op) => { assert.equal(entity, "Media"); assert.equal(op, "list"); return rows; } };
    const timers = [];
    const lib = createGerarLibrary({ link, store, settings, log: () => {}, timers: { setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: () => {} }, now: () => Date.parse("2026-11-18T12:00:00Z") });
    return { lib, data, calls, state, fire: () => timers.shift()?.fn(), timers };
}

test("only videos, audios and YouTube links go, as text; never a background, a font, a picture or a description", () => {
    assert.deepEqual(libraryItem(media("a")), { media_id: "a", title: "Item a", kind: "video", duration_seconds: 242, category: "Louvor", updated_at: "2026-11-18T10:00:00Z" });
    assert.equal(libraryItem(media("y", { file_url: "https://youtu.be/dQw4w9WgXcQ", duration: 0 })).kind, "youtube");
    assert.equal(libraryItem(media("y", { duration: 0 })).duration_seconds, null);
    assert.equal(libraryItem(media("s", { type: "audio", file_url: "keryx-media://s.mp3", category: "worship" })).category, "Louvor", "an old key reads as the church's name");
    assert.equal(libraryItem(media("x", { category: "Testemunho" })), null, "only Louvor is shared");
    assert.equal(libraryItem(media("b", { category: "background" })), null);
    assert.equal(libraryItem(media("f", { type: "font", category: "font" })), null);
    assert.equal(libraryItem(media("i", { type: "image" })), null);
    assert.equal(libraryItem(media("p", { type: "pdf" })), null);
    assert.equal(libraryItem(media("t", { title: "   " })), null);
    assert.ok(!JSON.stringify(libraryIndex([media("a")])).includes("segredo"), "the description never goes");
    assert.ok(!JSON.stringify(libraryIndex([media("a")])).includes("keryx-media"), "nor the file");
});

test("published in pages of 500, then the whole list of ids that stay", async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => media(`m${String(i).padStart(4, "0")}`));
    const t = setup({ rows });
    assert.equal(await t.lib.publish(), true);
    assert.deepEqual(t.calls.map((c) => [c.name, c.args._items ? c.args._items.length : c.args._keep.length]), [["upsert_keryx_library", PAGE], ["upsert_keryx_library", PAGE], ["upsert_keryx_library", 1], ["prune_keryx_library", 1001]]);
    assert.equal(t.data.gerar.library.count, 1001);
    assert.equal(t.data.gerar.library.at, "2026-11-18T12:00:00.000Z");
    assert.equal(t.state.changed, 1, "Andamento learns the count");
});

test("the same index is not sent again; a change in the Mídia is, 30 s after it stops", async () => {
    const rows = [media("a")];
    const t = setup({ rows });
    await t.lib.publish();
    await t.lib.publish();
    assert.equal(t.calls.length, 2, "one upsert and one prune, once");
    rows.push(media("b"));
    t.lib.schedule();
    await t.fire();
    await new Promise((r) => setImmediate(r));
    assert.equal(t.calls.filter((c) => c.name === "prune_keryx_library").length, 2);
    assert.deepEqual(t.calls.at(-1).args._keep, ["a", "b"]);
});

test("not connected, or Receber off on this computer: nothing is published", async () => {
    for (const opts of [{ on: false }, { receive: false }]) {
        const t = setup({ rows: [media("a")], ...opts });
        assert.equal(await t.lib.publish(), false);
        assert.equal(t.calls.length, 0);
    }
});

test("42501: precisa de você; no internet: nothing kept as published, the next time sends it", async () => {
    const t = setup({ rows: [media("a")], rpc: () => Object.assign(new Error("no"), { pg: "42501", status: 403 }) });
    assert.equal(await t.lib.publish(), false);
    assert.equal(t.state.refused, "revoked");
    let first = true;
    const u = setup({ rows: [media("a")], rpc: () => (first ? (first = false, Object.assign(new Error("fora"), { code: "offline", status: 503 })) : {}) });
    assert.equal(await u.lib.publish(), false);
    assert.equal(u.data.gerar.library, undefined);
    assert.equal(await u.lib.publish(), true);
});

test("the missing C8 RPC retries after five minutes without a Mídia change", async () => {
    let missing = true;
    const t = setup({ rows: [media("a")], rpc: () => (missing ? Object.assign(new Error("missing"), { pg: "PGRST202", status: 404 }) : {}) });
    assert.equal(await t.lib.publish(), false);
    assert.equal(t.timers.length, 1);
    assert.equal(t.timers[0].ms, RETRY_MS);
    missing = false;
    t.fire();
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(t.calls.map((c) => c.name), ["upsert_keryx_library", "upsert_keryx_library", "prune_keryx_library"]);
    assert.equal(t.data.gerar.library.count, 1);
});
