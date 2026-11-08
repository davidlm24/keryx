import test from "node:test";
import assert from "node:assert/strict";
import { wheelZoomStep, WHEEL_STEP } from "./wheelZoom.js";

test("Ctrl+wheel: one notch is one zoom step; up zooms in", () => {
    assert.deepEqual(wheelZoomStep(0, -120), { acc: 0, dir: 1 });
    assert.deepEqual(wheelZoomStep(0, 120), { acc: 0, dir: -1 });
    assert.deepEqual(wheelZoomStep(0, -WHEEL_STEP), { acc: 0, dir: 1 });
});

test("a touchpad's small deltas add up to one step", () => {
    let s = { acc: 0, dir: 0 };
    const dirs = [];
    for (let i = 0; i < 10; i++) { s = wheelZoomStep(s.acc, -15); dirs.push(s.dir); }
    assert.deepEqual(dirs.filter(Boolean), [1], "150 px of pinch: one step");
    assert.equal(wheelZoomStep(40, 30).dir, 0);
    assert.equal(wheelZoomStep(NaN, undefined).dir, 0);
});
