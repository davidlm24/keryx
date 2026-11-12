import test from "node:test";
import assert from "node:assert/strict";
import { applyOp, emptyState } from "../../../shared/live-state.mjs";
import { endDue, endLayer, endArgs, endLength, endBefore } from "./songEnd.js";
import { songEnd, songContent, withManualIntro, END_FADE } from "./content.js";

const T0 = 1_000_000;
const S = 1000;
const run = (ops, state = emptyState(T0)) => ops.reduce((s, [op, args, now = T0]) => applyOp(s, op, args, now), state);
const URL = "keryx-media://pb.mp3";
const lyrics = (extra = {}) => ["content.show", { title: "Canção", slides: [{ text: "um" }], ends: { url: URL, at: 30, fade: 4 }, ...extra }];

test("the end is due when the song's media reaches its mark, playing", () => {
    const s = run([["audio.show", { url: URL, kind: "video" }], lyrics()]);
    assert.equal(endLayer(s), "audio");
    assert.equal(endDue(s, T0 + 29 * S), false);
    assert.equal(endDue(s, T0 + 30 * S), true);
    assert.deepEqual(endArgs(s), { ended: true, soundFade: 4000 });
    // Paused past the mark: not yet.
    const paused = applyOp(s, "transport", { layer: "audio", action: "pause" }, T0 + 31 * S);
    assert.equal(endDue(paused, T0 + 40 * S), false);
    // Another file playing, or none: never.
    assert.equal(endDue(run([["audio.show", { url: "keryx-media://outro.mp3" }], lyrics()]), T0 + 60 * S), false);
    assert.equal(endDue(run([lyrics()]), T0 + 60 * S), false);
    // No Fim: never.
    assert.equal(endDue(run([["audio.show", { url: URL }], lyrics({ ends: null })]), T0 + 60 * S), false);
    // A clip on the video channel ends the same way.
    assert.equal(endDue(run([["video.show", { kind: "video", url: URL }], lyrics()]), T0 + 31 * S), true);
});

test("songEnd: only a computer file with a mark; the fade 3 s by default, 0–10", () => {
    assert.deepEqual(songEnd({ audio_url: URL, end_at: 200 }), { url: URL, at: 200, fade: END_FADE });
    assert.deepEqual(songEnd({ audio_url: URL, end_at: 200, end_fade: 0 }), { url: URL, at: 200, fade: 0 });
    assert.equal(songEnd({ audio_url: URL, end_at: 200, end_fade: 30 }).fade, 10);
    assert.equal(songEnd({ audio_url: URL }), null);
    assert.equal(songEnd({ audio_url: URL, end_at: null }), null);
    assert.equal(songEnd({ end_at: 200 }), null);
    assert.equal(songEnd({ audio_url: "https://youtu.be/dQw4w9WgXcQ", end_at: 200 }), null);
});

test("songContent: the end, the follow's length and the beginning", () => {
    const song = { id: "s1", title: "Canção", lyrics: "um\n\ndois", audio_url: URL, end_at: 100, end_fade: 2, slides: [{ text: "um", start: 5 }, { text: "dois", start: 50 }] };
    const c = songContent(song);
    assert.deepEqual(c.ends, { url: URL, at: 100, fade: 2 });
    assert.equal(c.follow.length, 102, "as long as its end and its fade");
    assert.equal(c.introMode, "blank", "a synced song: only the background by default");
    assert.equal(songContent({ ...song, intro_mode: "title" }).introMode, "title");
    // No marks: no follow, so the church's beginning (stamped at send).
    const hand = songContent({ ...song, slides: [{ text: "um" }, { text: "dois" }], end_at: null });
    assert.equal(hand.introMode, undefined);
    assert.equal(hand.ends, undefined);
    const op = ["content.show", { ...hand, kind: "lyrics" }];
    assert.equal(withManualIntro(op[0], op[1], "title").introMode, "title");
    assert.equal(withManualIntro(op[0], op[1], ""), op[1], "the church's default: the first slide");
    assert.equal(withManualIntro("media.show", op[1], "title"), op[1]);
    assert.equal(withManualIntro(op[0], { ...op[1], ref: {} }, "title").introMode, undefined, "only a song");
    assert.equal(withManualIntro(op[0], c, "title"), c, "a synced song keeps its own");
});

test("endLength: the player's bar ends at the Fim of the song playing (owner 2026-11-12)", () => {
    const live = run([lyrics(), ["audio.show", { url: URL, title: "pb" }]]);
    assert.equal(endLength(live, live.audio), 30);
    assert.equal(endLength(live, { url: "keryx-media://outro.mp3" }), null, "another file: its own length");
    assert.equal(endLength(run([lyrics({ ends: undefined })]), live.audio), null, "no Fim");
    assert.equal(endLength(null, live.audio), null);
});

test("songContent carries the Fim the console forwards on save and on Desfazer (owner 2026-11-12)", () => {
    const song = { title: "Hino", audio_url: URL, lyrics: "um\n\ndois", slides: [{ text: "um", start: 5 }, { text: "dois", start: 12 }], end_at: "42.5", end_fade: 2 };
    const c = songContent(song, {}, []);
    assert.deepEqual(c.ends, { url: URL, at: 42.5, fade: 2 }, "a text end_at from the store reads as its number");
});

test("endBefore: the watcher arms only while the song is before its Fim (owner 2026-11-12)", () => {
    const live = run([lyrics(), ["audio.show", { url: URL, title: "pb" }]]);
    assert.equal(endBefore(live, T0 + 10 * S), true, "10 s in, the Fim at 30");
    assert.equal(endBefore(live, T0 + 31 * S), false, "past it");
    // Put back past the Fim (Desfazer of that end): never before it, so the watcher never arms.
    const late = run([lyrics(), ["audio.show", { url: URL, title: "pb", position: 31 }]]);
    assert.equal(endBefore(late, T0), false);
    assert.equal(endDue(late, T0), true, "due, but the watcher needs the crossing");
    assert.equal(endBefore(run([lyrics()]), T0), false, "nothing playing");
});

test("endGain: full before the Fim, down over the fade, silent after (owner 2026-11-12)", async () => {
    const { endGain } = await import("./songEnd.js");
    assert.equal(endGain(10, 30, 4), 1);
    assert.equal(endGain(30, 30, 4), 1);
    assert.equal(endGain(32, 30, 4), 0.5);
    assert.equal(endGain(34, 30, 4), 0);
    assert.equal(endGain(40, 30, 4), 0);
    assert.equal(endGain(30, 30, 0), 0, "no fade: silent at the Fim");
    assert.equal(endGain(29.99, 30, 0), 1);
});
