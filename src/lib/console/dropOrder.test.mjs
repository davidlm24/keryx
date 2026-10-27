import test from "node:test";
import assert from "node:assert/strict";
import { overIndex, isNoop, shiftFor, placeIndex, moveTo, measureRows, roomFor, slotAt, slotTop, stepSlot, stepKey, moveManyTo, isGroupNoop, groupRoom, groupIdxs } from "./dropOrder.js";

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

// A Setlist with sections (24 px) and items (40 px), 2 px apart:
// s0 0, i1 26, i2 68, i3 110, s4 152, i5 178.
const mixed = () => measureRows([{ top: 0, height: 24 }, { top: 26, height: 40 }, { top: 68, height: 40 }, { top: 110, height: 40 }, { top: 152, height: 24 }, { top: 178, height: 40 }]);

test("measureRows: each row's pitch, the gap, the end and the room", () => {
    const g = mixed();
    assert.deepEqual(g.pitch, [26, 42, 42, 42, 26, 42]);
    assert.equal(g.gap, 2);
    assert.equal(g.end, 220, "the last row keeps the rows' gap");
    assert.equal(g.room, 42, "a row from elsewhere: the tallest pitch");
    const empty = measureRows([]);
    assert.equal(empty.end, 0);
    assert.equal(empty.room, 34, "no rows: the usual row");
    assert.equal(roomFor(g, 4), 26, "reordering: the dragged row's own pitch");
    assert.equal(roomFor(g, -1), 42);
    assert.equal(roomFor(g, -1, 30), 30, "from elsewhere, a room given wins");
});

test("slotTop: the lit slot lands where the row will be once dropped", () => {
    const g = mixed();
    // From elsewhere: before row 2, or after the last.
    assert.equal(slotTop(g, -1, 2), 68);
    assert.equal(slotTop(g, -1, 6), 220);
    // The section (row 4) dragged up to slot 1: right under s0.
    assert.equal(slotTop(g, 4, 1), 26);
    // Item 1 dragged down before the section: where it sits after the move
    // (s0, i2, i3, i1, …: 0, 26, 68, 110).
    assert.equal(slotTop(g, 1, 4), 110);
    assert.equal(slotTop(g, 1, 6), 178, "to the end: the last place");
    // Over its own place, either slot: where it is.
    assert.equal(slotTop(g, 1, 1), 26);
    assert.equal(slotTop(g, 1, 2), 26);
    // The rows it passes make exactly its room, so nothing overlaps.
    const shifted = [2, 3].map((k) => g.tops[k] + shiftFor(k, 1, 4, roomFor(g, 1)));
    assert.deepEqual(shifted, [26, 68]);
    assert.equal(shifted[1] + g.heights[3] + g.gap, slotTop(g, 1, 4));
});

test("slotAt: rows count where they are drawn, so the lit slot holds under the pointer", () => {
    const g = mixed();
    // From elsewhere, nothing drawn yet: the original middles (12, 46, 88…).
    assert.equal(slotAt(g, 50, -1, null), 2);
    assert.equal(slotAt(g, 5, -1, null), 0);
    assert.equal(slotAt(g, 999, -1, null), 6);
    // Slot 2 drawn (68..108): the pointer on it keeps it.
    assert.equal(slotAt(g, 100, -1, 2), 2);
    assert.equal(slotAt(g, 60, -1, 2), 2);
    assert.equal(slotAt(g, 40, -1, 2), 1, "above i1's middle: before it");
    // Slot 1 drawn (26..66, i1 moved down to 68): resting on it holds,
    // crossing i1 where it is now moves on.
    assert.equal(slotAt(g, 60, -1, 1), 1);
    assert.equal(slotAt(g, 87, -1, 1), 1, "i1 is drawn at 68..108, its middle 88");
    assert.equal(slotAt(g, 89, -1, 1), 2);
});

test("slotAt: reordering, the source is left out and 'no move' is its own index", () => {
    const g = mixed();
    // Item 1 dragged down past i2's middle (88): after i2.
    assert.equal(slotAt(g, 95, 1, null), 3);
    // Drawn so (i2 moved up to 26..66, middle 46): below that middle stays.
    assert.equal(slotAt(g, 60, 1, 3), 3);
    assert.equal(slotAt(g, 40, 1, 3), 1, "back above i2: its own place");
    assert.equal(slotAt(g, 30, 1, null), 1);
    // The section dragged to the top.
    assert.equal(slotAt(g, 3, 4, null), 0);
    assert.equal(slotAt(g, 999, 4, null), 6);
});

test("stepSlot: Subir / Descer move one place, never past the ends (C-16)", () => {
    const list = ["a", "b", "c", "d"];
    assert.deepEqual(moveTo(list, 2, stepSlot(2, -1, 4)), ["a", "c", "b", "d"]);
    assert.deepEqual(moveTo(list, 1, stepSlot(1, 1, 4)), ["a", "c", "b", "d"]);
    assert.deepEqual(moveTo(list, 0, stepSlot(0, 1, 4)), ["b", "a", "c", "d"]);
    assert.deepEqual(moveTo(list, 3, stepSlot(3, -1, 4)), ["a", "b", "d", "c"]);
    assert.equal(stepSlot(0, -1, 4), null);
    assert.equal(stepSlot(3, 1, 4), null);
    assert.equal(stepSlot(-1, 1, 4), null);
});

test("stepKey: only Alt+↑ / Alt+↓ move a row", () => {
    assert.equal(stepKey({ key: "ArrowUp", altKey: true }), -1);
    assert.equal(stepKey({ key: "ArrowDown", altKey: true }), 1);
    assert.equal(stepKey({ key: "ArrowDown" }), 0);
    assert.equal(stepKey({ key: "ArrowDown", altKey: true, ctrlKey: true }), 0);
    assert.equal(stepKey({ key: "ArrowLeft", altKey: true }), 0);
});

test("moveManyTo: the marked rows move together, in the list's order", () => {
    const l = ["a", "b", "c", "d", "e", "f"];
    assert.deepEqual(moveManyTo(l, [4, 1], 0), ["b", "e", "a", "c", "d", "f"], "to the top, in list order");
    assert.deepEqual(moveManyTo(l, [0, 2], 6), ["b", "d", "e", "f", "a", "c"], "the tail slot: last");
    assert.deepEqual(moveManyTo(l, [0, 2], 4), ["b", "d", "a", "c", "e", "f"], "before e: rows before the slot leave room");
    assert.deepEqual(moveManyTo(l, [1, 5], 3), ["a", "c", "b", "f", "d", "e"], "into the middle, from both sides");
    assert.equal(moveManyTo(l, [1, 2], 1), l, "a block over its own place");
    assert.equal(moveManyTo(l, [1, 2], 3), l);
    assert.notEqual(moveManyTo(l, [1, 3], 2), l, "a gap closes up: it moves");
    assert.equal(moveManyTo(l, [], 2), l);
    assert.equal(moveManyTo(l, [9, -1], 2), l, "strays ignored");
    assert.deepEqual(moveManyTo(l, [3, 3], 0), ["d", "a", "b", "c", "e", "f"], "repeats count once");
});

test("moveManyTo with one row is moveTo", () => {
    const l = ["a", "b", "c", "d"];
    for (let from = 0; from < l.length; from += 1) {
        for (let over = 0; over <= l.length; over += 1) assert.deepEqual(moveManyTo(l, [from], over), moveTo(l, from, over), `${from} → ${over}`);
    }
});

test("isGroupNoop and groupRoom", () => {
    assert.ok(isGroupNoop(5, [1, 2], 1) && isGroupNoop(5, [1, 2], 2) && isGroupNoop(5, [1, 2], 3));
    assert.ok(!isGroupNoop(5, [1, 2], 0) && !isGroupNoop(5, [1, 2], 4) && !isGroupNoop(5, [1, 3], 2));
    assert.ok(isGroupNoop(5, [], 2));
    assert.deepEqual(groupIdxs([3, 1, 3, 7], 5), [1, 3]);
    const geo = measureRows([{ top: 0, height: 30 }, { top: 32, height: 20 }, { top: 54, height: 30 }]);
    assert.equal(groupRoom(geo, [0, 2]), 32 + 32, "the slot is as tall as the group, gaps included");
    assert.equal(groupRoom(geo, [1]), 22);
    // The slot under the pointer counts the rows as drawn with the group's room.
    const room = groupRoom(geo, [0, 2]);
    assert.equal(slotAt(geo, 10, -1, null, room), 0);
    assert.equal(slotAt(geo, 45, -1, null, room), 2);
    assert.equal(slotAt(geo, 200, -1, 3, room), 3);
});
