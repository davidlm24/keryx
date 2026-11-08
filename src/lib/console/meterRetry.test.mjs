import test from "node:test";
import assert from "node:assert/strict";
import { retryDelay, wokeUp, RETRY_MS, WAKE_GAP_MS } from "./meterRetry.js";

test("the meters try again on a backoff that ends at a minute", () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5, 50].map(retryDelay), [2000, 5000, 15000, 30000, 60000, 60000, 60000]);
    assert.equal(retryDelay(-1), RETRY_MS[0]);
    assert.equal(retryDelay(undefined), RETRY_MS[0]);
});

test("a gap in the ticks means the PC slept", () => {
    assert.equal(wokeUp(0, 5000), false);
    assert.equal(wokeUp(0, WAKE_GAP_MS), false);
    assert.equal(wokeUp(0, WAKE_GAP_MS + 1), true);
});
