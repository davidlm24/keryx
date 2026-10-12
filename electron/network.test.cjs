const test = require("node:test");
const assert = require("node:assert/strict");
const { createNetwork } = require("./network.cjs");

function net(initial = {}) {
    const saved = { ...initial };
    const settings = { get: (k, d) => (k in saved ? saved[k] : d), set: (k, v) => { saved[k] = v; } };
    const quiet = { info() {}, warn() {}, error() {} };
    return createNetwork({ store: null, live: null, settings, distDir: "", mediaDir: "", bundledDir: "", logger: quiet, port: 0 });
}

test("the PIN is shown only on demand, never in info()", async () => {
    const n = net({ network: { pin: "4821", secret: "s" } });
    const info = n.info();
    assert.equal(info.hasPin, true);
    assert.ok(!JSON.stringify(info).includes("4821"), "info() never carries the PIN");
    assert.deepEqual(await n.ops.revealPin(), { pin: "4821" });
    assert.deepEqual(await net({ network: { secret: "s" } }).ops.revealPin(), { pin: "" });
});
