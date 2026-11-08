import test from "node:test";
import assert from "node:assert/strict";
import { clampWin, dragRect, clampCol, normalizeWin, readWin, writeWin, withCol, withSize, WIN_MIN, WIN_KEY } from "./winLayout.js";

test("the window's size: never under 760 × 480, never past the screen", () => {
    assert.deepEqual(clampWin({ w: 500, h: 300 }), WIN_MIN);
    assert.deepEqual(clampWin({ w: 2000, h: 1200 }, 1366, 700), { w: 1366, h: 700 });
    assert.deepEqual(clampWin({ w: 1000.4, h: 600.6 }, 1366, 700), { w: 1000, h: 601 });
    // A box smaller than the minimum: the box wins.
    assert.deepEqual(clampWin({ w: 900, h: 600 }, 700, 400), { w: 700, h: 400 });
    assert.equal(clampWin(null), null);
    assert.equal(clampWin({ w: "x", h: 5 }), null);
});

test("dragging an edge or a corner moves only that side", () => {
    const r = { x: 100, y: 50, w: 1000, h: 600 };
    assert.deepEqual(dragRect(r, "e", 40, 0, 1400, 900), { x: 100, y: 50, w: 1040, h: 600 });
    assert.deepEqual(dragRect(r, "w", -40, 0, 1400, 900), { x: 60, y: 50, w: 1040, h: 600 });
    assert.deepEqual(dragRect(r, "n", 0, -30, 1400, 900), { x: 100, y: 20, w: 1000, h: 630 });
    assert.deepEqual(dragRect(r, "se", 50, 50, 1400, 900), { x: 100, y: 50, w: 1050, h: 650 });
    // Past the box: stops at its edge; under the minimum: stops there, the far side still.
    assert.deepEqual(dragRect(r, "nw", -500, -500, 1400, 900), { x: 0, y: 0, w: 1100, h: 650 });
    assert.deepEqual(dragRect(r, "w", 900, 0, 1400, 900), { x: 340, y: 50, w: 760, h: 600 });
    assert.deepEqual(dragRect(r, "s", 0, 900, 1400, 900), { x: 100, y: 50, w: 1000, h: 850 });
});

test("a column between its minimum and maximum", () => {
    assert.equal(clampCol(100, 280, 600), 280);
    assert.equal(clampCol(900, 280, 600), 600);
    assert.equal(clampCol(412.6, 280, 600), 413);
    assert.equal(clampCol(NaN, 280, 600), 280);
});

test("the saved state is made safe and survives a round trip", () => {
    assert.deepEqual(normalizeWin(null), { sizes: {}, cols: {} });
    assert.deepEqual(normalizeWin({ sizes: { standard: { w: 10, h: 10 }, other: { w: 900, h: 900 } }, cols: { "song.l": 340.2, bad: "x", neg: -4 } }),
        { sizes: { standard: WIN_MIN }, cols: { "song.l": 340 } });
    const mem = new Map();
    const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    let s = readWin(store);
    s = withSize(s, "editor", { w: 1500, h: 900 });
    s = withCol(s, "song.l", 360);
    writeWin(s, store);
    assert.deepEqual(readWin(store), { sizes: { editor: { w: 1500, h: 900 } }, cols: { "song.l": 360 } });
    assert.deepEqual(withSize(withCol(s, "song.l", null), "editor", null), { sizes: {}, cols: {} });
    // A broken save reads as nothing kept; a store that throws is ignored.
    mem.set(WIN_KEY, "{oops");
    assert.deepEqual(readWin(store), { sizes: {}, cols: {} });
    assert.doesNotThrow(() => writeWin(s, { setItem: () => { throw new Error("quota"); } }));
});
