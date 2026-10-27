const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRunMarker, readMarker, recoveryPlan, shouldRelaunch, RECOVER_WITHIN_MS, RESTART_WINDOW_MS } = require("./runMarker.cjs");

const tempFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "keryx-run-")), "running.json");
const noTimer = { setInterval: () => null, clearInterval: () => {} };
const MIN = 60_000;

test("a normal quit leaves nothing to recover", () => {
    const file = tempFile();
    const first = createRunMarker({ file, now: () => 1000, pid: 7, log: () => {}, ...noTimer });
    assert.equal(first.plan, null, "no marker: the last run ended normally (or there was none)");
    first.start(() => ["/Projection"]);
    assert.equal(readMarker(file).pid, 7);
    first.clear();
    assert.equal(fs.existsSync(file), false);
    first.touch();
    assert.equal(fs.existsSync(file), false, "nothing is written after a quit");
    assert.equal(createRunMarker({ file, now: () => 2000, log: () => {}, ...noTimer }).plan, null);
});

test("a marker left minutes ago is a crash: lit, and the open outputs come back", () => {
    const file = tempFile();
    let clock = 10 * MIN;
    const run = createRunMarker({ file, now: () => clock, log: () => {}, ...noTimer });
    let open = ["/Projection"];
    run.start(() => open);
    open = ["/Projection", "/StageView"];
    clock += MIN;
    run.touch();
    // ...and KERYX dies without clear().
    clock += 2 * MIN;
    const next = createRunMarker({ file, now: () => clock, log: () => {}, ...noTimer });
    assert.equal(next.plan.lit, true);
    assert.equal(next.plan.diedAt, 11 * MIN, "the last sign of life");
    assert.deepEqual(next.plan.outputs, ["/Projection", "/StageView"]);
    assert.deepEqual(next.plan.restarts, [clock], "this start is counted");
    next.start(() => []);
    assert.deepEqual(readMarker(file).restarts, [clock], "and the count is kept for the watchdog");
});

test("an old marker (the PC was off) does not light the screens or reopen outputs", () => {
    const prev = { pid: 1, startedAt: 0, aliveAt: 0, outputs: ["/Projection"], restarts: [] };
    const plan = recoveryPlan(prev, RECOVER_WITHIN_MS + 1);
    assert.equal(plan.lit, false);
    assert.deepEqual(plan.outputs, []);
    assert.equal(recoveryPlan(prev, RECOVER_WITHIN_MS).lit, true, "the limit itself still counts");
    assert.equal(recoveryPlan({ ...prev, aliveAt: 5000 }, 1000).lit, false, "a clock that went back is not trusted");
});

test("a garbled marker reads as none", () => {
    const file = tempFile();
    fs.writeFileSync(file, "{nope");
    assert.equal(readMarker(file), null);
    fs.writeFileSync(file, JSON.stringify({ pid: 3 }));
    assert.equal(readMarker(file), null, "no aliveAt");
    fs.writeFileSync(file, JSON.stringify({ aliveAt: 5, outputs: ["/Projection", 3, "x"], restarts: [1, "2"] }));
    assert.deepEqual(readMarker(file), { pid: null, startedAt: 5, aliveAt: 5, outputs: ["/Projection"], restarts: [1] });
});

test("the watchdog brings KERYX back at most 3 times in 5 minutes", () => {
    const now = 100 * MIN;
    const m = (restarts) => ({ pid: 1, startedAt: 0, aliveAt: now, outputs: [], restarts });
    assert.equal(shouldRelaunch(null, now), false, "no marker: KERYX quit normally");
    assert.equal(shouldRelaunch(m([]), now), true);
    assert.equal(shouldRelaunch(m([now - MIN, now - 2 * MIN]), now), true);
    assert.equal(shouldRelaunch(m([now - MIN, now - 2 * MIN, now - 3 * MIN]), now), false, "a crash loop stops");
    assert.equal(shouldRelaunch(m([now - RESTART_WINDOW_MS - 1, now - MIN, now - 2 * MIN]), now), true, "old restarts expire");
    // Restarts older than the window are dropped when counted again.
    assert.deepEqual(recoveryPlan(m([now - RESTART_WINDOW_MS - 1, now - MIN]), now).restarts, [now - MIN, now]);
});
