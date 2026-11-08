"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { normalizeSoundOut, registerSoundOut } = require("./soundOut.cjs");

test("sound out: a device id and its label; anything else is Windows' default", () => {
    assert.deepEqual(normalizeSoundOut({ id: "abc123", label: " Alto-falantes (Realtek) " }), { id: "abc123", label: "Alto-falantes (Realtek)" });
    for (const v of [null, undefined, "x", {}, { id: 3 }, { id: "" }, { id: "default", label: "Padrão" }, { id: "communications" }]) {
        assert.deepEqual(normalizeSoundOut(v), { id: "", label: "" });
    }
    assert.equal(normalizeSoundOut({ id: "a".repeat(400) }).id.length, 256);
});

function harness({ engine = null } = {}) {
    let handler = null;
    const store = {};
    const sent = [];
    const ipcMain = { handle: (ch, fn) => { assert.equal(ch, "keryx:sound"); handler = fn; } };
    const settings = { get: (k, d) => store[k] ?? d, set: (k, v) => { store[k] = v; } };
    registerSoundOut({ ipcMain, settings, isTrusted: (e) => e.trusted, broadcast: (ch, v) => sent.push([ch, v]), engine: () => engine });
    return { call: (payload, trusted = true) => handler({ trusted }, payload), store, sent };
}

test("sound out: set keeps it per computer and tells every window; untrusted pages are refused", () => {
    const h = harness();
    assert.deepEqual(h.call({ op: "get" }).data, { id: "", label: "" });
    assert.deepEqual(h.call({ op: "set", choice: { id: "dev1", label: "HDMI" } }).data, { id: "dev1", label: "HDMI" });
    assert.deepEqual(h.store.soundOut, { id: "dev1", label: "HDMI" });
    assert.deepEqual(h.sent, [["keryx:sound", { id: "dev1", label: "HDMI" }]]);
    assert.deepEqual(h.call({ op: "get" }).data, { id: "dev1", label: "HDMI" });
    assert.equal(h.call({ op: "get" }, false).error.status, 403);
    assert.equal(h.call({ op: "nope" }).error.status, 400);
});

test("sound out: the test bell rings in the sound engine", () => {
    const rung = [];
    const h = harness({ engine: { webContents: { send: (ch) => rung.push(ch) } } });
    assert.equal(h.call({ op: "test" }).data, true);
    assert.deepEqual(rung, ["keryx:sound-test"]);
    assert.equal(harness().call({ op: "test" }).error.status, 503);
});
