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

test("equipe: off by default; its own code and key, never the remote's code; each signs out only its phones", async () => {
    const n = net({ network: { secret: "s" } });
    assert.deepEqual(n.info().team, { enabled: false, hasCode: false });
    await n.ops.setRemote(null, true);
    await n.ops.setTeam(null, true);
    const { remote, team } = n.saved.network;
    assert.match(team.code, /^\d{6}$/);
    assert.notEqual(team.code, remote.code, "the code decides the role");
    assert.notEqual(team.secret, remote.secret);
    assert.deepEqual(n.info().team, { enabled: true, hasCode: true });
    assert.ok(!JSON.stringify(n.info()).includes(team.code), "info() never carries the code");
    assert.deepEqual(await n.ops.revealTeamCode(), { code: team.code });
    await n.ops.newTeamCode();
    assert.notEqual(n.saved.network.team.secret, team.secret);
    assert.notEqual(n.saved.network.team.code, n.saved.network.remote.code);
    assert.deepEqual(n.saved.network.remote, remote, "the Controle's code and key stay");
    await n.ops.disconnectTeam();
    assert.deepEqual(n.saved.network.remote, remote);
    await n.ops.setTeam(null, false);
    assert.equal(n.saved.network.team.enabled, false);
    assert.equal(n.saved.network.remote.enabled, true);
});
