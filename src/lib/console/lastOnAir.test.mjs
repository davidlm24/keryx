import test from "node:test";
import assert from "node:assert/strict";
import { airKey, lastFromEnd, lastStays, columnSource } from "./lastOnAir.js";

const song = { kind: "lyrics", title: "Santo", ref: { songId: "s1" }, slides: [{ text: "a" }, { text: "b" }, { text: "c" }], index: 1, startedAt: 100 };

test("Esc keeps the song that was on air, at the slide it stopped on", () => {
    const after = { content: null, updatedAt: 200 };
    const last = lastFromEnd({ content: song }, after);
    assert.equal(last.id, "song:s1");
    assert.equal(last.title, "Santo");
    assert.equal(last.stopped, 1);
    assert.equal(last.index, 1);
    assert.equal(last.op, "content.show");
    assert.deepEqual(last.args.slides, song.slides);
    assert.equal(last.key, airKey(after));
});

test("the item's own Fundo goes with it, so sending it again brings its theme's background back", () => {
    const theme = { kind: "image", value: "keryx-media://campo.jpg", title: "Campo" };
    const wall = { kind: "image", value: "keryx-media://nebulosa.jpg", title: "Nebulosa" };
    const last = lastFromEnd({ content: song, background: theme, defaultBackground: wall }, { content: null, background: wall });
    assert.deepEqual(last.args.fundo, theme);
    // Over the papel de parede itself, or with no Fundo: nothing to bring.
    assert.equal(lastFromEnd({ content: song, background: wall, defaultBackground: wall }, { content: null }).args.fundo, undefined);
    assert.equal(lastFromEnd({ content: song }, { content: null }).args.fundo, undefined);
});

test("nothing is kept without slides on air, or when the text stayed", () => {
    assert.equal(lastFromEnd({ media: { kind: "video", shownAt: 5 } }, { content: null }), null);
    assert.equal(lastFromEnd({ content: { ...song, slides: [] } }, {}), null);
    assert.equal(lastFromEnd(null, {}), null);
    assert.equal(lastFromEnd({ content: song }, { content: song }), null);
});

test("an item without a known ref gets an id of its own", () => {
    const last = lastFromEnd({ content: { ...song, ref: {} } }, { updatedAt: 9 });
    assert.equal(last.id, "last:9");
});

test("the kept item goes when something new is on air or the Prévia holds an item", () => {
    const after = { content: null, media: { shownAt: 50 } };
    const last = lastFromEnd({ content: song, media: { shownAt: 50 } }, after);
    assert.equal(lastStays(last, after, false), true);
    // Tela preta, a volume: the same items, still kept.
    assert.equal(lastStays(last, { ...after, screen: "black" }, false), true);
    assert.equal(lastStays(last, after, true), false);
    assert.equal(lastStays(last, { content: { ...song, startedAt: 300 }, media: { shownAt: 50 } }, false), false);
    assert.equal(lastStays(last, { tool: { startedAt: 7 }, media: { shownAt: 50 } }, false), false);
    assert.equal(lastStays(null, after, false), false);
});

test("the column: the Prévia, else the air, else the item kept", () => {
    const last = { slides: [{}] };
    assert.equal(columnSource({ hand: true, air: song, last }), "prev");
    assert.equal(columnSource({ hand: false, air: song, last }), "air");
    assert.equal(columnSource({ hand: false, air: null, last }), "last");
    assert.equal(columnSource({ hand: false, air: null, last: null }), null);
});

test("a 'slide no ar' in the Prévia goes stale with its item (audit 2026-11-26, UX-001)", async () => {
    const { airSlideStale } = await import("./lastOnAir.js");
    const air = { kind: "lyrics", title: "Romper", slides: [{ text: "a" }, { text: "b" }, { text: "c" }, { text: "d" }], index: 0, startedAt: 100 };
    const pick = { kind: "lyrics", id: "song:1", slides: air.slides, index: 3, op: "content.goTo", airSlide: true, airAt: 100 };
    assert.equal(airSlideStale(pick, air), false, "still the same song, another slide");
    assert.equal(airSlideStale(pick, { ...air, startedAt: 200, index: 0 }), true, "another item went on air (the Setlist's footer, the Autoplay, the phone)");
    assert.equal(airSlideStale(pick, null), true, "nothing on air");
    assert.equal(airSlideStale(pick, { ...air, index: 3 }), true, "the air is on that slide now: its job is done");
    assert.equal(airSlideStale({ id: "song:2", slides: [] }, air), false, "an item of its own is never stale");
});
