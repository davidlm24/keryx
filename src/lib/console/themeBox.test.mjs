import test from "node:test";
import assert from "node:assert/strict";
import { themeBoxRect, rectToTheme, BOX_H, MIN_WIDTH } from "./themeBox.js";

test("an untouched theme is a centred, full-width box in the middle third", () => {
    const r = themeBoxRect({});
    assert.deepEqual(r, { x: 0, y: 33.3, w: 100, h: 33.3 });
    // And that rectangle writes nothing back.
    assert.deepEqual(rectToTheme(r), { text_align: "", text_position: "", text_max_width: "", text_nudge: "" });
});

test("align and position place the box; width narrows it", () => {
    const r = themeBoxRect({ text_align: "left", text_position: "top", text_max_width: 60 });
    assert.deepEqual(r, { x: 0, y: 0, w: 60, h: 33.3 });
    assert.deepEqual(themeBoxRect({ text_align: "right", text_position: "bottom", text_max_width: 50 }), { x: 50, y: 66.7, w: 50, h: 33.3 });
    // Centre with a width: centred horizontally.
    assert.equal(themeBoxRect({ text_max_width: 60 }).x, 20);
});

test("the nudge moves the box inside the screen", () => {
    assert.equal(themeBoxRect({ text_nudge: 10 }).y, 43.3);
    assert.equal(themeBoxRect({ text_nudge: -10 }).y, 23.3);
    // Clamped: bottom + 20 never leaves the canvas.
    assert.equal(themeBoxRect({ text_position: "bottom", text_nudge: 20 }).y, 66.7);
});

test("round trip: fields -> rect -> the same fields", () => {
    for (const style of [
        { text_align: "left", text_position: "top", text_max_width: 60, text_nudge: "" },
        { text_align: "right", text_position: "bottom", text_max_width: 48, text_nudge: "" },
        { text_align: "", text_position: "", text_max_width: "", text_nudge: "" },
        { text_align: "", text_position: "top", text_max_width: "", text_nudge: 8 },
    ]) {
        assert.deepEqual(rectToTheme(themeBoxRect(style)), style);
    }
});

test("a dragged rectangle snaps to the nearest zone and keeps the leftover as nudge", () => {
    // Near the left-top corner: left / top, no nudge.
    assert.deepEqual(rectToTheme({ x: 2, y: 1, w: 60, h: BOX_H }), { text_align: "left", text_position: "top", text_max_width: 60, text_nudge: 1 });
    // A bit under the middle: middle with a positive nudge.
    const mid = rectToTheme({ x: 20, y: 41.3, w: 60, h: BOX_H });
    assert.equal(mid.text_position, "");
    assert.equal(mid.text_nudge, 8);
    // Width never goes under the minimum nor over the screen.
    assert.equal(rectToTheme({ x: 0, y: 0, w: 10, h: BOX_H }).text_max_width, MIN_WIDTH);
    assert.equal(rectToTheme({ x: 0, y: 33.3, w: 140, h: BOX_H }).text_max_width, "");
});

test("a band stretches edge to edge: the width is locked", () => {
    assert.equal(themeBoxRect({ text_box: "band", text_max_width: 60 }).w, 100);
    assert.equal(rectToTheme({ x: 0, y: 0, w: 60, h: BOX_H }, { box: "band" }).text_max_width, "");
});
