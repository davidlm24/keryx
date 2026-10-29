import test from "node:test";
import assert from "node:assert/strict";
import { themeBoxRect, rectToTheme, BOX_H, MIN_WIDTH, SAFE } from "./themeBox.js";

test("the safe area is screen.css's padding: 8 % each side, 7cqw above and below", () => {
    assert.deepEqual(SAFE, { x: 8, y: 12.4, w: 84, h: 75.1 });
});

test("an untouched theme is a centred, full-width box in the middle third of the safe area", () => {
    const r = themeBoxRect({});
    assert.deepEqual(r, { x: 8, y: 37.5, w: 84, h: 25 });
    // And that rectangle writes nothing back.
    assert.deepEqual(rectToTheme(r), { text_align: "", text_position: "", text_max_width: "", text_nudge: "" });
});

test("align and position place the box; the width is a % of the safe area, as on screen", () => {
    assert.deepEqual(themeBoxRect({ text_align: "left", text_position: "top", text_max_width: 60 }), { x: 8, y: 12.4, w: 50.4, h: 25 });
    assert.deepEqual(themeBoxRect({ text_align: "right", text_position: "bottom", text_max_width: 50 }), { x: 50, y: 62.5, w: 42, h: 25 });
    // Centre with a width: centred horizontally.
    assert.equal(themeBoxRect({ text_max_width: 60 }).x, 24.8);
});

test("the nudge moves the box, never out of the safe area", () => {
    assert.equal(themeBoxRect({ text_nudge: 10 }).y, 47.5);
    assert.equal(themeBoxRect({ text_nudge: -10 }).y, 27.5);
    assert.equal(themeBoxRect({ text_position: "bottom", text_nudge: 20 }).y, 62.5, "bottom + 20 stays at the area's foot");
    assert.equal(themeBoxRect({ text_position: "top", text_nudge: -20 }).y, 12.4);
});

test("round trip: fields -> rect -> the same fields", () => {
    for (const style of [
        { text_align: "left", text_position: "top", text_max_width: 60, text_nudge: "" },
        { text_align: "right", text_position: "bottom", text_max_width: 48, text_nudge: "" },
        { text_align: "", text_position: "", text_max_width: "", text_nudge: "" },
        { text_align: "", text_position: "top", text_max_width: "", text_nudge: 8 },
        { text_align: "", text_position: "", text_max_width: 70, text_nudge: -6 },
    ]) {
        assert.deepEqual(rectToTheme(themeBoxRect(style)), style);
    }
});

test("a dragged rectangle snaps to the nearest zone and keeps the leftover as nudge", () => {
    // Near the left-top corner: left / top, a small nudge.
    assert.deepEqual(rectToTheme({ x: 9, y: 13.4, w: 50.4, h: BOX_H }), { text_align: "left", text_position: "top", text_max_width: 60, text_nudge: 1 });
    // A bit under the middle: middle with a positive nudge.
    const mid = rectToTheme({ x: 24.8, y: 45.5, w: 50.4, h: BOX_H });
    assert.equal(mid.text_position, "");
    assert.equal(mid.text_nudge, 8);
    // Width never goes under the minimum nor over the safe area.
    assert.equal(rectToTheme({ x: 8, y: 12.4, w: 10, h: BOX_H }).text_max_width, MIN_WIDTH);
    assert.equal(rectToTheme({ x: 0, y: 37.5, w: 140, h: BOX_H }).text_max_width, "");
    // Dragged past the screen's edge: back inside the safe area.
    assert.equal(rectToTheme({ x: -20, y: -10, w: 50.4, h: BOX_H }).text_align, "left");
});

test("a band stretches edge to edge: the width is locked", () => {
    assert.equal(themeBoxRect({ text_box: "band", text_max_width: 60 }).w, 100);
    assert.equal(themeBoxRect({ text_box: "band" }).x, 0);
    assert.equal(rectToTheme({ x: 0, y: 12.4, w: 60, h: BOX_H }, { box: "band" }).text_max_width, "");
});
