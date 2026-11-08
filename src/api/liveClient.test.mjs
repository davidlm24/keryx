import { test } from "node:test";
import assert from "node:assert/strict";
import { createLiveClient } from "./liveClient.js";

const doc = (rev) => ({ data: { version: 1, rev, serverNow: 0 } });

// A bridge whose first reads fail, as after a reload while main is busy.
function flakyBridge(failures) {
    let reads = 0;
    let listener = null;
    return {
        get reads() { return reads; },
        emit: (d) => listener(d),
        get: async () => (++reads <= failures ? Promise.reject(new Error("ainda iniciando")) : doc(3)),
        call: async () => doc(4),
        onChange: (l) => { listener = l; },
    };
}

// Runs scheduled retries at once, keeping their delays.
function manualTimers() {
    const waits = [];
    return { waits, schedule: (fn, ms) => { waits.push(ms); queueMicrotask(fn); } };
}

const settle = () => new Promise((r) => setTimeout(r, 10));

test("a first read that fails is retried until the document arrives (ARCH-005)", async () => {
    const bridge = flakyBridge(2);
    const timers = manualTimers();
    const client = createLiveClient(bridge, { schedule: timers.schedule, retryDelays: [10, 20, 40] });
    assert.equal(client.current(), null);
    await settle();
    assert.equal(bridge.reads, 3);
    assert.deepEqual(timers.waits, [10, 20], "a growing pause");
    assert.equal(client.current().rev, 3, "the output draws what is on air");
});

test("a change arriving first ends the retries", async () => {
    const bridge = flakyBridge(99);
    const waits = [];
    let pending = null;
    const client = createLiveClient(bridge, { schedule: (fn, ms) => { waits.push(ms); pending = fn; }, retryDelays: [10, 20] });
    client.current();
    await settle();
    bridge.emit({ version: 1, rev: 7 });
    pending();
    await settle();
    assert.equal(client.current().rev, 7);
    assert.equal(bridge.reads, 1, "no read after the document came");
});

test("it gives up after the last pause, quietly for the page", async () => {
    const bridge = flakyBridge(99);
    const timers = manualTimers();
    const errors = [];
    const original = console.error;
    console.error = (...a) => errors.push(a);
    try {
        const client = createLiveClient(bridge, { schedule: timers.schedule, retryDelays: [1, 2] });
        client.current();
        await settle();
        assert.equal(bridge.reads, 3);
        assert.equal(client.current(), null);
        assert.equal(errors.length, 1, "said once in the log");
    } finally {
        console.error = original;
    }
});
