import test from "node:test";
import assert from "node:assert/strict";
import { OVERLAY_LIMIT, isTextOverlay, overlayName, newOverlay, overlayRows, moveOverlayRow } from "./overlays.js";

test("the console caps the overlays at 5 (the live state keeps its own 50)", () => {
    assert.equal(OVERLAY_LIMIT, 5);
});

test("a new overlay is born at the bottom left, a text overlay, enabled", () => {
    const o = newOverlay([]);
    assert.equal(o.type, "text");
    assert.equal(o.enabled, true);
    assert.equal(o.content, "Sobreposição");
    assert.deepEqual([o.x, o.y, o.width], [4, 86, 40]);
    assert.ok(isTextOverlay(o));
});

test("each next one is born a step up, and never past the middle", () => {
    const list = [];
    const ys = [];
    for (let i = 0; i < 7; i += 1) {
        const o = newOverlay(list);
        ys.push(o.y);
        list.push(o);
    }
    assert.deepEqual(ys.slice(0, 3), [86, 79, 72]);
    assert.ok(ys.every((y) => y >= 50));
    // One moved to the top corner frees its step at the bottom.
    const moved = [{ id: "a", y: 4, x: 4 }, { id: "b", y: 86, x: 4 }];
    assert.equal(newOverlay(moved).y, 79);
});

test("the rows show the list reversed: the top row draws on top", () => {
    const a = { id: "a" }, b = { id: "b" };
    assert.deepEqual(overlayRows([a, b]), [b, a]);
    assert.deepEqual(overlayRows(), []);
});

test("moveOverlayRow moves by row gaps and keeps the list reference when nothing moves", () => {
    const a = { id: "a" }, b = { id: "b" }, c = { id: "c" };
    const list = [a, b, c]; // rows: c, b, a
    // The top row (c) to the last gap: rows a, b on top of it -> list [c, a, b].
    assert.deepEqual(moveOverlayRow(list, "c", 3).map((o) => o.id), ["c", "a", "b"]);
    // The bottom row (a) to the first gap -> top row -> end of the list.
    assert.deepEqual(moveOverlayRow(list, "a", 0).map((o) => o.id), ["b", "c", "a"]);
    // Dropping a row on its own place changes nothing, same reference.
    assert.equal(moveOverlayRow(list, "b", 1), list);
    assert.equal(moveOverlayRow(list, "b", 2), list);
    // An id that is not there changes nothing.
    assert.equal(moveOverlayRow(list, "x", 0), list);
});

test("overlayName is the trimmed text", () => {
    assert.equal(overlayName({ content: "  Oração  " }), "Oração");
    assert.equal(overlayName({}), "");
    assert.equal(overlayName(null), "");
});
