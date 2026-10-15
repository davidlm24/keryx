import test from "node:test";
import assert from "node:assert/strict";
import { overIndex, isNoop, shiftFor, placeIndex, moveTo } from "./dropOrder.js";

test("overIndex: the slot is how many row middles are above the pointer", () => {
    const mids = [16, 48, 80];
    assert.equal(overIndex(mids, 0), 0);
    assert.equal(overIndex(mids, 20), 1);
    assert.equal(overIndex(mids, 79), 2);
    assert.equal(overIndex(mids, 200), 3, "past the last: the tail slot");
    assert.equal(overIndex([], 10), 0);
});

test("shiftFor: from elsewhere, everything from the slot on moves down", () => {
    const s = (k) => shiftFor(k, -1, 2, 32);
    assert.deepEqual([0, 1, 2, 3].map(s), [0, 0, 32, 32]);
    assert.deepEqual([0, 1].map((k) => shiftFor(k, -1, null, 32)), [0, 0], "no slot: nothing moves");
});

test("shiftFor: reordering moves only the rows the hole travels over", () => {
    // Row 3 dragged up to slot 1: rows 1 and 2 slide down; 0, 3 (source), 4 stay.
    assert.deepEqual([0, 1, 2, 3, 4].map((k) => shiftFor(k, 3, 1, 32)), [0, 32, 32, 0, 0]);
    // Row 1 dragged down to slot 4: rows 2 and 3 slide up.
    assert.deepEqual([0, 1, 2, 3, 4].map((k) => shiftFor(k, 1, 4, 32)), [0, 0, -32, -32, 0]);
    // Over its own place: nothing moves.
    assert.deepEqual([0, 1, 2].map((k) => shiftFor(k, 1, 1, 32)), [0, 0, 0]);
    assert.deepEqual([0, 1, 2].map((k) => shiftFor(k, 1, 2, 32)), [0, 0, 0]);
});

test("placeIndex, isNoop and moveTo agree", () => {
    const l = ["a", "b", "c", "d"];
    assert.deepEqual(moveTo(l, 3, 0), ["d", "a", "b", "c"]);
    assert.deepEqual(moveTo(l, 0, 4), ["b", "c", "d", "a"], "the tail slot: last");
    assert.deepEqual(moveTo(l, 0, 2), ["b", "a", "c", "d"]);
    assert.equal(moveTo(l, 1, 1), l);
    assert.equal(moveTo(l, 1, 2), l);
    assert.ok(isNoop(1, 2) && !isNoop(-1, 2) && !isNoop(1, 3));
    assert.equal(placeIndex(0, 2), 1);
    assert.equal(placeIndex(3, 0), 0);
    assert.equal(placeIndex(-1, 2), 2, "from elsewhere: the slot itself");
});
