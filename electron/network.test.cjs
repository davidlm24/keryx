const test = require("node:test");
const assert = require("node:assert/strict");
const { createNetwork } = require("./network.cjs");

function net(initial = {}) {
    const saved = { ...initial };
    const settings = { get: (k, d) => (k in saved ? saved[k] : d), set: (k, v) => { saved[k] = v; } };
    const quiet = { info() {}, warn() {}, error() {} };
    const n = createNetwork({ store: null, live: null, settings, distDir: "", mediaDir: "", bundledDir: "", logger: quiet, port: 0 });
    n.saved = saved;
    return n;
}

test("the PIN is shown only on demand, never in info()", async () => {
    const n = net({ network: { pin: "4821", secret: "s" } });
    const info = n.info();
    assert.equal(info.hasPin, true);
    assert.ok(!JSON.stringify(info).includes("4821"), "info() never carries the PIN");
    assert.deepEqual(await n.ops.revealPin(), { pin: "4821" });
    assert.deepEqual(await net({ network: { secret: "s" } }).ops.revealPin(), { pin: "" });
});

test("controle remoto: off by default; on makes a code and a key; a new code or Desconectar todos signs phones out", async () => {
    const n = net({ network: { secret: "s" } });
    assert.deepEqual(n.info().remote, { enabled: false, hasCode: false });
    await n.ops.setRemote(null, true);
    const first = n.saved.network.remote;
    assert.equal(first.enabled, true);
    assert.match(first.code, /^\d{6}$/);
    assert.match(first.secret, /^[0-9a-f]{64}$/);
    assert.deepEqual(n.info().remote, { enabled: true, hasCode: true });
    assert.ok(!JSON.stringify(n.info()).includes(first.code), "info() never carries the code");
    assert.deepEqual(await n.ops.revealRemoteCode(), { code: first.code });
    // Off and on again keeps the same code (the phones sign in again).
    await n.ops.setRemote(null, false);
    await n.ops.setRemote(null, true);
    assert.equal(n.saved.network.remote.code, first.code);
    await n.ops.disconnectRemotes();
    assert.equal(n.saved.network.remote.code, first.code);
    assert.notEqual(n.saved.network.remote.secret, first.secret, "a new key: every phone's cookie stops working");
    await n.ops.newRemoteCode();
    assert.match(n.saved.network.remote.code, /^\d{6}$/);
    assert.equal(n.saved.network.pin, undefined, "the screens' PIN is untouched");
});
