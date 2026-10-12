import { test } from "node:test";
import assert from "node:assert/strict";
import { setLevel, getLevel, follow } from "./audioLevel.js";

test("follow: jumps up, falls slowly", () => {
    assert.equal(follow(0.2, 0.9), 0.9);
    assert.equal(follow(0.9, 0.2), 0.84);
    assert.equal(follow(0.05, 0), 0);
});

test("the level is kept, clamped, and forgotten after a while", () => {
    setLevel(1.7);
    assert.equal(getLevel(), 1);
    setLevel(0.4);
    assert.equal(getLevel(Date.now() + 500), 0.4);
    assert.equal(getLevel(Date.now() + 5000), 0, "silence when the console stopped sending");
    setLevel("x");
    assert.equal(getLevel(), 0);
});
