import test from "node:test";
import assert from "node:assert/strict";
import { quantise, frameKey, slideNameAt, tipLeft, containBox, makeLru, FRAME_W, FRAME_H } from "./seekPreview.js";
import { followTicks } from "./player.js";

test("one frame per second of the file", () => {
    assert.equal(quantise(12.9), 12);
    assert.equal(quantise(12), 12);
    assert.equal(quantise(0.4), 0);
    assert.equal(quantise(-3), 0);
    assert.equal(quantise(NaN), 0);
    assert.equal(quantise(7.5, 5), 5);
    assert.equal(frameKey("/media/a.mp4", 12), "/media/a.mp4#12");
    assert.notEqual(frameKey("/media/a.mp4", 12), frameKey("/media/b.mp4", 12));
    assert.deepEqual([FRAME_W, FRAME_H], [160, 90], "n2_tamanho: 160 × 90");
});

test("the slide under the pointer: the last mark at or before it", () => {
    const slides = [{ text: "a" }, { text: "b", start: 10, label: "Verso" }, { text: "c", start: 50, label: "Refrão" }, { text: "d", start: 80 }];
    const ticks = followTicks(slides, { source: "audio", offset: 0 }, 100);
    assert.equal(slideNameAt(ticks, 5), null, "before the first mark");
    assert.equal(slideNameAt(ticks, 10), "Verso");
    assert.equal(slideNameAt(ticks, 49.9), "Verso");
    assert.equal(slideNameAt(ticks, 50), "Refrão");
    assert.equal(slideNameAt(ticks, 99), "Slide 4", "a slide with no part name");
    assert.equal(slideNameAt([], 30), null);
    assert.equal(slideNameAt(null, 30), null);
    // Ticks in any order still answer by time.
    assert.equal(slideNameAt([{ t: 50, name: "B" }, { t: 10, name: "A" }], 30), "A");
});

test("the tip stays inside the bar", () => {
    assert.equal(tipLeft(150, 400, 80), 150);
    assert.equal(tipLeft(10, 400, 80), 80, "at the left edge");
    assert.equal(tipLeft(395, 400, 80), 320, "at the right edge");
    assert.equal(tipLeft(50, 120, 80), 60, "a bar narrower than the tip: centred");
    assert.equal(tipLeft(50, 0, 80), 0);
});

test("the frame is contained in 160 × 90", () => {
    assert.deepEqual(containBox(1920, 1080), { x: 0, y: 0, w: 160, h: 90 });
    assert.deepEqual(containBox(1080, 1920), { x: 55, y: 0, w: 51, h: 90 }, "a phone video: bars at the sides");
    assert.deepEqual(containBox(1000, 250), { x: 0, y: 25, w: 160, h: 40 });
    assert.deepEqual(containBox(0, 0), { x: 0, y: 0, w: 160, h: 90 });
});

test("the frames cache keeps the last ones used and lets the rest go", () => {
    const dropped = [];
    const lru = makeLru(3, (v) => dropped.push(v));
    lru.set("a", 1); lru.set("b", 2); lru.set("c", 3);
    assert.equal(lru.get("a"), 1, "a used again");
    lru.set("d", 4);
    assert.deepEqual(dropped, [2], "b was the least recently used");
    assert.equal(lru.has("b"), false);
    assert.equal(lru.size, 3);
    lru.set("a", 5);
    assert.deepEqual(dropped, [2, 1], "a replaced: its old frame goes");
    assert.equal(lru.get("zz"), undefined);
    lru.clear();
    assert.equal(lru.size, 0);
    assert.deepEqual(dropped.sort(), [1, 2, 3, 4, 5]);
});
