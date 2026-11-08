import test from "node:test";
import assert from "node:assert/strict";
import { applyOp, emptyState } from "../../../shared/live-state.mjs";
import {
    endChoice, endActionOf, gapOf, gapLabel, hasSound, endsByItself, itemEnded, nextPlayable, shouldAdvance, newOnAir, END_ACTIONS, END_LABEL, END_ICON, countdownSay,
} from "./autoplay.js";

const T0 = 1_000_000;
const run = (ops, state = emptyState(T0)) => ops.reduce((s, [op, args, now = T0]) => applyOp(s, op, args, now), state);
const onAir = (itemId, at = T0) => ["session.item", { itemId, index: 0 }, at];

test("what an item does at its end: its choice while the switch is on", () => {
    assert.deepEqual(END_ACTIONS, ["next", "loop", "stop"]);
    assert.equal(endChoice({}), "next", "empty = next (the owner's mark: every item goes on)");
    assert.equal(endChoice({ end_action: "", autoAdvance: true }), "next", "the old autoAdvance reads as next");
    assert.equal(endChoice({ end_action: "loop" }), "loop");
    assert.equal(endChoice({ end_action: "nope" }), "next");
    assert.equal(endActionOf({ end_action: "loop" }, { autoplay: true }), "loop");
    assert.equal(endActionOf({}, { autoplay: false }), "stop", "switch off: the Setlist waits");
    assert.equal(endActionOf({}, null), "stop");
    assert.equal(END_LABEL.next, "Ir para o próximo");
    assert.equal(END_ICON.loop, "refresh");
});

test("the pause: the culto's, else the church's, else 5 s", () => {
    assert.equal(gapOf({ autoplay_gap: 3 }, { autoplay_gap: 10 }), 3);
    assert.equal(gapOf({ autoplay_gap: 0 }, { autoplay_gap: 10 }), 0, "Sem pausa is a choice");
    assert.equal(gapOf({ autoplay_gap: null }, { autoplay_gap: 10 }), 10);
    assert.equal(gapOf({}, {}), 5);
    assert.equal(gapOf({ autoplay_gap: 7 }, { autoplay_gap: 4 }), 5, "only 0, 3, 5, 10");
    assert.equal(gapLabel(0), "Sem pausa");
    assert.equal(gapLabel(5), "5 s");
    assert.equal(countdownSay("Abertura", 5), "Próximo em 5 s: Abertura");
});

test("sound and duration: what the menu says and what the projector must hear", () => {
    assert.equal(hasSound({ type: "VIDEO" }), true);
    assert.equal(hasSound({ type: "AUDIO" }), true);
    assert.equal(hasSound({ type: "SONG" }, { audio_url: "keryx-media://pb.mp3" }), true);
    assert.equal(hasSound({ type: "SONG" }, {}), false);
    assert.equal(hasSound({ type: "TEXT" }), false);
    assert.equal(endsByItself({ type: "VIDEO" }), true);
    assert.equal(endsByItself({ type: "TEXT", duration: 0 }), false, "Sem duração");
    assert.equal(endsByItself({ type: "TEXT", duration: 60 }), true);
    assert.equal(endsByItself({ type: "SONG", duration: 0 }, { slides: [{ text: "a", start: 3 }] }), true, "letra automática");
});

test("a video ends when its output says so; Parar and Esc are not an end", () => {
    const item = { id: "i1", type: "VIDEO", contentId: "m1" };
    const live = run([["media.show", { kind: "video", url: "keryx-media://a.mp4", id: "m1" }, T0], onAir("i1")]);
    assert.equal(itemEnded({ live, item, now: T0 + 1000 }), false);
    const ended = applyOp(live, "media.clear", { ended: true }, T0 + 9000);
    assert.equal(itemEnded({ live: ended, item, now: T0 + 9000 }), true);
    assert.equal(itemEnded({ live: applyOp(live, "media.clear", {}, T0 + 9000), item, now: T0 + 9000 }), false, "Parar");
    assert.equal(itemEnded({ live: applyOp(live, "clear", {}, T0 + 9000), item, now: T0 + 9000 }), false, "Esc");
    // An `ended` from before this item went on air is another one's.
    const before = run([["media.show", { kind: "video", url: "keryx-media://a.mp4", id: "m1" }, T0], ["media.clear", { ended: true }, T0 + 1], ["media.show", { kind: "video", url: "keryx-media://a.mp4", id: "m1" }, T0 + 2], onAir("i1", T0 + 2)]);
    assert.equal(itemEnded({ live: before, item, now: T0 + 3 }), false);
    // Another Setlist item on air: not this one's end.
    assert.equal(itemEnded({ live: ended, item: { ...item, id: "i2" }, now: T0 + 9000 }), false);
});

test("an audio file: its report, else played to its length (the item's or the reported one)", () => {
    const item = { id: "i1", type: "AUDIO", contentId: "a1" };
    const live = run([["audio.show", { url: "keryx-media://a.mp3", id: "a1" }, T0], onAir("i1")]);
    assert.equal(itemEnded({ live, item, now: T0 + 60_000 }), false, "no length known");
    const reported = (layer, url) => (layer === "audio" && url === "keryx-media://a.mp3" ? 30 : null);
    assert.equal(itemEnded({ live, item, now: T0 + 29_000, reported }), false);
    assert.equal(itemEnded({ live, item, now: T0 + 29_800, reported }), true, "a quarter of a second of slack");
    assert.equal(itemEnded({ live: applyOp(live, "audio.ended", { url: "keryx-media://a.mp3" }, T0 + 5), item, now: T0 + 5 }), true);
    const own = run([["audio.show", { url: "keryx-media://a.mp3", id: "a1", duration: 10 }, T0], onAir("i1")]);
    assert.equal(itemEnded({ live: own, item, now: T0 + 10_000 }), true);
    // Paused before the end: not ended.
    const paused = applyOp(own, "transport", { layer: "audio", action: "pause" }, T0 + 2000);
    assert.equal(itemEnded({ live: paused, item, now: T0 + 60_000 }), false);
});

test("a song: its playback's end; without media, its duration while on air", () => {
    const song = { id: "s1", audio_url: "keryx-media://pb.mp3" };
    const item = { id: "i1", type: "SONG", contentId: "s1", duration: 240 };
    const lyrics = ["content.show", { kind: "lyrics", title: "Canção", slides: [{ text: "um" }], ref: { songId: "s1", serviceItemId: "i1" } }, T0];
    const live = run([lyrics, ["audio.show", { url: song.audio_url, duration: 200 }, T0], onAir("i1")]);
    assert.equal(itemEnded({ live, item, song, now: T0 + 199_000 }), false);
    assert.equal(itemEnded({ live, item, song, now: T0 + 200_000 }), true, "the playback, not the item's 4:00");
    const gone = applyOp(live, "audio.clear", {}, T0 + 5);
    assert.equal(itemEnded({ live: gone, item, song, now: T0 + 300_000 }), false, "its music stopped by hand");
    const plain = run([lyrics, onAir("i1")]);
    assert.equal(itemEnded({ live: plain, item, song: {}, now: T0 + 239_000 }), false);
    assert.equal(itemEnded({ live: plain, item, song: {}, now: T0 + 240_000 }), true);
    assert.equal(itemEnded({ live: applyOp(plain, "clear", {}, T0 + 5), item, song: {}, now: T0 + 500_000 }), false, "after Esc it is only the last one sent");
    assert.equal(itemEnded({ live: plain, item: { ...item, duration: 0 }, song: {}, now: T0 + 10e6 }), false, "no duration, never");
});

test("text, Bíblia and a timer: their duration; a picture list past its last picture", () => {
    const text = { id: "t1", type: "TEXT", duration: 60 };
    const live = run([["content.show", { kind: "text", title: "Oração", slides: [{ text: "Oremos" }], ref: { serviceItemId: "t1" } }, T0], onAir("t1")]);
    assert.equal(itemEnded({ live, item: text, now: T0 + 59_999 }), false);
    assert.equal(itemEnded({ live, item: text, now: T0 + 60_000 }), true);
    const timer = { id: "k1", type: "TIMER", duration: 300 };
    const t = run([["tool.show", { mode: "timer", durationMs: 300_000 }, T0], onAir("k1")]);
    assert.equal(itemEnded({ live: t, item: timer, now: T0 + 300_000 }), true);
    const pic = { id: "p1", type: "IMAGE", contentId: "b", duration: 0 };
    const list = run([["media.playlist", { items: [{ kind: "image", url: "keryx-media://a.jpg", id: "a" }, { kind: "image", url: "keryx-media://b.jpg", id: "b" }], index: 1 }, T0], onAir("p1")]);
    assert.equal(itemEnded({ live: applyOp(list, "media.advance", { fromIndex: 1 }, T0 + 5), item: pic, now: T0 + 5 }), true);
});

test("the next one skips sections and disabled items; none after the last", () => {
    const items = [{ id: "a" }, { id: "s", type: "SECTION" }, { id: "b", enabled: false }, { id: "c" }];
    assert.equal(nextPlayable(items, "a").id, "c");
    assert.equal(nextPlayable(items, "c"), null);
    assert.equal(nextPlayable(items, "x"), null);
    assert.equal(nextPlayable(items, "b").id, "c", "from a disabled item sent by hand");
});

test("when it may move on: never locked, never with the projector closed on a sound", () => {
    assert.deepEqual(shouldAdvance({}), { ok: true, why: null });
    assert.deepEqual(shouldAdvance({ locked: true, projectorOpen: false, hasSound: true }), { ok: false, why: "locked" });
    assert.deepEqual(shouldAdvance({ projectorOpen: false, hasSound: true }), { ok: false, why: "projector" });
    assert.deepEqual(shouldAdvance({ projectorOpen: false, hasSound: false }), { ok: true, why: null }, "a text needs no ears");
});

test("a countdown gives way to something new on air, never to what leaves", () => {
    const live = run([["media.show", { kind: "video", url: "keryx-media://a.mp4", id: "m1" }, T0], onAir("i1")]);
    const cleared = applyOp(live, "media.clear", { ended: true }, T0 + 4000);
    assert.equal(newOnAir(cleared, T0 + 4000), false, "the ended video leaving");
    assert.equal(newOnAir(applyOp(cleared, "content.show", { kind: "text", title: "x", slides: [{ text: "x" }] }, T0 + 5000), T0 + 4000), true, "a send by hand");
    assert.equal(newOnAir(applyOp(cleared, "session.item", { itemId: "i2" }, T0 + 5000), T0 + 4000), true);
    assert.equal(newOnAir(null, 0), false);
});
