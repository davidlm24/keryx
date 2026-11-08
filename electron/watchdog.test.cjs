const test = require("node:test");
const assert = require("node:assert/strict");
const { afterDeath, startWatchdog, watch } = require("./watchdog.cjs");

const marker = (over = {}) => ({ pid: 42, startedAt: 0, aliveAt: 1000, outputs: [], restarts: [], ...over });

test("after main is gone: relaunch only when it died, not when it quit", () => {
    assert.equal(afterDeath(null, 42, 5000), "stop", "the marker was removed: a normal quit");
    assert.equal(afterDeath(marker(), 42, 5000), "relaunch");
    assert.equal(afterDeath(marker({ pid: 43 }), 42, 5000), "stop", "another KERYX wrote it: already running");
    assert.equal(afterDeath(marker({ restarts: [4000, 4500, 4900] }), 42, 5000), "stop", "a crash loop");
});

test("the loop waits for the pid to go, then starts KERYX the same way, without node mode", async () => {
    let checks = 0;
    const started = [];
    const verdict = await watch(
        { pid: 42, markerFile: "m", relaunch: { command: "KERYX.exe", args: ["--x"], cwd: "C:/app" } },
        {
            alive: () => ++checks < 3,
            read: () => marker(),
            now: () => 5000,
            sleep: async () => {},
            spawn: (command, args, opts) => { started.push({ command, args, opts }); return { unref() {} }; },
        },
    );
    assert.equal(verdict, "relaunch");
    assert.equal(checks, 3);
    assert.equal(started.length, 1);
    assert.equal(started[0].command, "KERYX.exe");
    assert.deepEqual(started[0].args, ["--x"]);
    assert.equal(started[0].opts.detached, true);
    assert.equal(started[0].opts.env.ELECTRON_RUN_AS_NODE, undefined, "KERYX itself must not start as Node");
});

test("a normal quit starts nothing", async () => {
    let spawned = false;
    const verdict = await watch(
        { pid: 42, markerFile: "m", relaunch: { command: "KERYX.exe" } },
        { alive: () => false, read: () => null, sleep: async () => {}, spawn: () => { spawned = true; } },
    );
    assert.equal(verdict, "stop");
    assert.equal(spawned, false);
});

test("main starts it detached, in node mode, with what to watch", () => {
    const calls = [];
    const child = { on() {}, unref() { this.unrefd = true; } };
    startWatchdog({ spawn: (cmd, args, opts) => { calls.push({ cmd, args, opts }); return child; }, execPath: "KERYX.exe", pid: 9, markerFile: "C:/d/running.json", relaunch: { command: "KERYX.exe", args: [] }, script: "w.cjs" });
    assert.equal(calls[0].cmd, "KERYX.exe");
    assert.equal(calls[0].args[0], "w.cjs");
    assert.deepEqual(JSON.parse(calls[0].args[1]), { pid: 9, markerFile: "C:/d/running.json", relaunch: { command: "KERYX.exe", args: [] } });
    assert.equal(calls[0].opts.env.ELECTRON_RUN_AS_NODE, "1");
    assert.equal(calls[0].opts.detached, true);
    assert.equal(child.unrefd, true, "main does not wait for it");
    assert.equal(startWatchdog({ spawn: () => { throw new Error("no"); }, execPath: "x", pid: 1, markerFile: "m", relaunch: { command: "x" }, log: () => {} }), null, "a failure to start never stops KERYX");
});
