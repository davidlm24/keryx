import test from "node:test";
import assert from "node:assert/strict";
import { OVERLAY_LIMIT, overlayName, newOverlay, overlayRows, overlayPlace, placeAt, OVERLAY_ROWS, OVERLAY_COLS } from "./overlays.js";

test("the console caps the overlays at 5 (the live state keeps its own 50)", () => {
    assert.equal(OVERLAY_LIMIT, 5);
});

test("a new overlay is born OFF the air, with no text, at the bottom left", () => {
    // Owner 2026-10-28 (K3 = A): the congregation never sees a placeholder.
    const o = newOverlay([]);
    assert.equal(o.type, "text");
    assert.equal(o.enabled, false);
    assert.equal(o.content, "");
    assert.deepEqual([o.x, o.y, o.width], [4, 86, 40]);
    assert.deepEqual(overlayPlace(o), { row: "baixo", col: "esq" });
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
    // One at the bottom centre is not in the bottom left's way.
    assert.equal(newOverlay([{ id: "c", ...placeAt("baixo", "centro") }]).y, 86);
});

test("the six places: each one reads back as itself", () => {
    // Before 2026-10-28 "Baixo centro" wrote x 30 and read back as Baixo esq.
    for (const [row] of OVERLAY_ROWS) {
        for (const [col] of OVERLAY_COLS) {
            assert.deepEqual(overlayPlace(placeAt(row, col)), { row, col }, `${row} ${col}`);
        }
    }
    // A centred box: 40 % wide from x 30 is centred on 50.
    assert.equal(placeAt("baixo", "centro").x + 40 / 2, 50);
    // Any older x/y lands on the nearest place.
    assert.deepEqual(overlayPlace({ x: 30, y: 86 }), { row: "baixo", col: "centro" });
    assert.deepEqual(overlayPlace({ x: 60, y: 10 }), { row: "alto", col: "dir" });
    assert.deepEqual(overlayPlace({}), { row: "baixo", col: "esq" });
});

test("the rows show the list reversed: the top row draws on top", () => {
    const a = { id: "a" }, b = { id: "b" };
    assert.deepEqual(overlayRows([a, b]), [b, a]);
    assert.deepEqual(overlayRows(), []);
});

test("overlayName is the trimmed text", () => {
    assert.equal(overlayName({ content: "  Oração  " }), "Oração");
    assert.equal(overlayName({}), "");
    assert.equal(overlayName(null), "");
});
