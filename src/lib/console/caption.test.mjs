import { test } from "node:test";
import assert from "node:assert/strict";
import { airSince, airFor } from "./caption.js";

const song = { content: { title: "Hino", slides: [{ text: "a" }], index: 0, startedAt: 10_000 } };

test("how long the item has been on air", () => {
    assert.equal(airFor(song, 10_000 + 222_000), "3:42");
    assert.equal(airFor(song, 10_000), "0:00");
    assert.equal(airFor(song, 10_000 + 3_725_000), "1:02:05", "past the hour: h:mm:ss");
    assert.equal(airFor(song, 5_000), "0:00", "never negative");
});

test("a new item restarts the count; moving slides does not", () => {
    // content.startedAt is set when the item goes on air, not on slide changes.
    assert.equal(airSince({ content: { ...song.content, index: 3 } }), 10_000);
    assert.equal(airSince({ content: { ...song.content, startedAt: 99_000 } }), 99_000);
});

test("other layers count from when they went on air; nothing to count says nothing", () => {
    assert.equal(airSince({ media: { title: "Clipe", shownAt: 7_000 } }), 7_000);
    assert.equal(airSince({ communication: { item: { title: "Aviso" }, startedAt: 8_000 } }), 8_000);
    assert.equal(airSince({ video: { title: "V", shownAt: 4_000 }, content: song.content }), 4_000, "the video channel covers it");
    for (const doc of [null, {}, { screen: "black", content: song.content.content }, { screen: "logo" }, { tool: { mode: "timer", startedAt: 1 } }]) {
        assert.equal(airSince(doc), null);
        assert.equal(airFor(doc, 50_000), "");
    }
});
