const test = require("node:test");
const assert = require("node:assert/strict");
const { createCheckSchedule, REGULAR_MS, RETRY_MS, RESUME_MS } = require("./updateSchedule.cjs");

// A fake clock: setTimer records the delay, and fire() runs the pending callback.
function fixture(statuses) {
    const timers = [];
    const calls = { check: 0 };
    let status = "idle";
    const updater = {
        state: () => ({ status }),
        async check() {
            calls.check += 1;
            status = statuses.length ? statuses.shift() : "none";
            return { status };
        },
    };
    const setTimer = (fn, ms) => { const t = { fn, ms, cleared: false, unref() {} }; timers.push(t); return t; };
    const clearTimer = (t) => { if (t) t.cleared = true; };
    const schedule = createCheckSchedule({ updater, firstMs: 8000, setTimer, clearTimer });
    const pending = () => timers.filter((t) => !t.cleared).at(-1);
    const fire = async () => { const t = pending(); t.cleared = true; await t.fn(); };
    return { schedule, timers, calls, pending, fire, setStatus: (s) => { status = s; } };
}

test("first check shortly after launch, then every few hours", async () => {
    const f = fixture(["none", "none"]);
    f.schedule.start();
    assert.equal(f.pending().ms, 8000);
    await f.fire();
    assert.equal(f.calls.check, 1);
    assert.equal(f.pending().ms, REGULAR_MS);
    await f.fire();
    assert.equal(f.pending().ms, REGULAR_MS);
});

test("a failed check (no network yet) is tried again soon, longer each time, then a steady pace", async () => {
    const f = fixture(["error", "error", "error", "error", "error", "available"]);
    f.schedule.start();
    const delays = [];
    for (let i = 0; i < 5; i++) {
        await f.fire();
        delays.push(f.pending().ms);
    }
    assert.deepEqual(delays, [RETRY_MS[0], RETRY_MS[1], RETRY_MS[2], RETRY_MS[3], RETRY_MS[3]]);
    await f.fire();
    assert.equal(f.pending().ms, REGULAR_MS, "found: back to the regular pace");
    f.setStatus("idle");
});

test("success resets the backoff", async () => {
    const f = fixture(["error", "none", "error"]);
    f.schedule.start();
    await f.fire();
    await f.fire();
    assert.equal(f.pending().ms, REGULAR_MS);
    await f.fire();
    assert.equal(f.pending().ms, RETRY_MS[0], "the next failure starts the backoff over");
});

test("waking the PC looks again soon, except with a download under way or done", async () => {
    const f = fixture(["none"]);
    f.schedule.start();
    await f.fire();
    f.schedule.resume();
    assert.equal(f.pending().ms, RESUME_MS);
    f.setStatus("downloading");
    f.schedule.resume();
    assert.equal(f.pending().ms, RESUME_MS, "unchanged: nothing new armed");
    assert.equal(f.timers.filter((t) => !t.cleared).length, 1);
    f.setStatus("downloaded");
    f.schedule.resume();
    assert.equal(f.timers.filter((t) => !t.cleared).length, 1);
});

test("a check that throws counts as a failure, and stop ends it", async () => {
    const timers = [];
    const updater = { state: () => ({ status: "idle" }), check: async () => { throw new Error("boom"); } };
    const schedule = createCheckSchedule({
        updater,
        firstMs: 1,
        setTimer: (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; },
        clearTimer: (t) => { if (t) t.cleared = true; },
    });
    schedule.start();
    await timers.at(-1).fn();
    assert.equal(timers.at(-1).ms, RETRY_MS[0]);
    schedule.stop();
    assert.equal(timers.at(-1).cleared, true);
    schedule.resume();
    assert.equal(timers.filter((t) => !t.cleared).length, 0, "stopped: nothing armed again");
});
