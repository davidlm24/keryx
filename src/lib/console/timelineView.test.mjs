import test from "node:test";
import assert from "node:assert/strict";
import { spanOf, clampFrom, fracOf, timeOf, followView, zoomTo, stepAfter, spanWord, ticks, DEFAULT_SPAN } from "./timelineView.js";
import { peaks, columns } from "./waveform.js";

test("the window: never past the song, never before 0", () => {
    assert.equal(spanOf(30, 250), 30);
    assert.equal(spanOf(Infinity, 250), 250);
    assert.equal(spanOf(30, 20), 20, "a short song is whole");
    assert.equal(spanOf(Infinity, null), DEFAULT_SPAN);
    assert.equal(clampFrom(-5, 30, 250), 0);
    assert.equal(clampFrom(240, 30, 250), 220);
    assert.equal(fracOf(200, 180, 40), 0.5);
    assert.equal(timeOf(0.25, 180, 40), 190);
});

test("playing, the window turns a page at 85 % and brings the time to 15 %", () => {
    assert.equal(followView(0, 30, 20, 250), 0);
    assert.equal(followView(0, 30, 26, 250), 26 - 4.5);
    assert.equal(followView(100, 30, 50, 250), 50 - 4.5, "the time went back before it");
    assert.equal(followView(200, 30, 249, 250), 220, "kept inside the song");
});

test("zoom keeps the anchor where it is; steps up to the whole song", () => {
    // 3:10 in the middle of 3:00–3:20, zoomed to 10 s: 3:05–3:15.
    assert.equal(zoomTo(180, 20, 10, 190, 250), 185);
    assert.equal(stepAfter(30, -1, 250), 20);
    assert.equal(stepAfter(30, 1, 250), 60);
    assert.equal(stepAfter(120, 1, 250), Infinity);
    assert.equal(stepAfter(10, -1, 250), 5, "5 s on screen: the Fim tuned by ear (2026-11-12)");
    assert.equal(stepAfter(5, -1, 250), 5, "the closest stays");
    assert.equal(stepAfter(30, 1, 50), Infinity, "past the song: the whole of it");
    assert.equal(spanWord(30, 250), "30 s");
    assert.equal(spanWord(120, 250), "2 min");
    assert.equal(spanWord(Infinity, 250), "Inteira");
    assert.equal(spanWord(60, 50), "Inteira");
});

test("the ruler: labels every 5 s on 30 s, a tick every second", () => {
    const t = ticks(180, 30);
    assert.equal(t.filter((x) => x.major).map((x) => x.label).join(" "), "3:00 3:05 3:10 3:15 3:20 3:25 3:30");
    assert.equal(t.length, 31);
    assert.ok(ticks(0, 250).filter((x) => x.major).every((x) => x.t % 30 === 0));
    assert.equal(ticks(10.3, 10)[0].t, 10.5);
});

test("the wave: the loudest of each bucket, normalised; one height a column", () => {
    const ch = new Float32Array(1000);
    for (let i = 0; i < 500; i++) ch[i] = 0.5 * (i % 2 ? 1 : -1);
    const p = peaks([ch], 10);
    assert.equal(p.length, 10);
    assert.equal(p[0], 1, "the loudest is 1");
    assert.equal(p[9], 0, "silence");
    assert.equal(peaks([new Float32Array(0)], 4).length, 4);
    // A 10 s song, the window 0–5 s on 5 columns: the loud first half.
    const c = columns(p, 10, 0, 5, 5);
    assert.deepEqual([...c], [1, 1, 1, 1, 1]);
    assert.equal(columns(p, 10, 5, 5, 5)[4], 0);
    assert.equal(columns(p, 10, 8, 10, 10)[9], 0, "past the file");
    assert.equal(columns(null, 10, 0, 5, 5).length, 5);
});
