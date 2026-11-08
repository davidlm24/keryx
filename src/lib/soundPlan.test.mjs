import { test } from "node:test";
import assert from "node:assert/strict";
import { soundPlan, mediaSoundOf, BELL_MS } from "./soundPlan.js";
import { applyOp, emptyState } from "../../shared/live-state.mjs";

const T0 = 1_000_000;
const run = (ops, state = emptyState(T0)) => ops.reduce((s, [op, args, now = T0]) => applyOp(s, op, args, now), state);
const video = { kind: "video", url: "keryx-media://v.mp4", title: "Abertura" };

test("nothing on air plays nothing", () => {
    assert.deepEqual(soundPlan(emptyState(T0), T0), { media: null, video: null, audio: null, track: null, notice: null, chime: null, bell: null });
    assert.equal(soundPlan(null, T0).media, null);
});

test("the media layer sounds while it is a video on screen", () => {
    const s = run([["media.show", video]]);
    assert.equal(soundPlan(s, T0).media.url, video.url);
    assert.equal(mediaSoundOf(s).url, video.url);
    // A picture has no sound.
    assert.equal(soundPlan(run([["media.show", { kind: "image", url: "keryx-media://a.png" }]]), T0).media, null);
    // Tela preta and the Logo take it off, as they always took the picture.
    assert.equal(soundPlan(applyOp(s, "screen.set", { mode: "black" }, T0), T0).media, null);
    assert.equal(soundPlan(applyOp(s, "screen.set", { mode: "logo" }, T0), T0).media, null);
});

test("the video and audio channels always sound, under Tela preta too", () => {
    const s = run([["video.show", video], ["audio.show", { kind: "audio", url: "keryx-media://a.mp3" }], ["screen.set", { mode: "black" }]]);
    const p = soundPlan(s, T0);
    assert.equal(p.video.url, video.url);
    assert.equal(p.audio.url, "keryx-media://a.mp3");
});

test("a song's own playback plays with its text", () => {
    const s = run([["content.show", { title: "Hino", slides: ["um"], audio: "keryx-media://hino.mp3" }]]);
    assert.deepEqual(soundPlan(s, T0).track, { src: "keryx-media://hino.mp3", key: s.content.startedAt });
    assert.equal(soundPlan(applyOp(s, "screen.set", { mode: "black" }, T0), T0).track, null);
});

test("an aviso's background audio and chime", () => {
    const s = run([["communication.show", { item: { type: "announcement", text: "Bem-vindos", background_audio: "/media/x.mp3", sound_alert: true } }]]);
    const p = soundPlan(s, T0);
    assert.deepEqual(p.notice, { src: "/media/x.mp3", key: s.communication.startedAt });
    assert.equal(p.chime, s.communication.startedAt);
    const quiet = run([["communication.show", { item: { type: "announcement", text: "Oi" } }]]);
    assert.equal(soundPlan(quiet, T0).notice, null);
    assert.equal(soundPlan(quiet, T0).chime, null);
});

test("an activity's discussion time rings once as it runs out", () => {
    const slide = { text: "Converse", activity: { kind: "discussion", minutes: 1 } };
    let s = run([["content.show", { kind: "text", slides: [slide] }]]);
    assert.equal(soundPlan(s, T0).bell, null); // not started
    s = applyOp(s, "content.reveal", {}, T0);
    const end = T0 + 60_000;
    assert.equal(soundPlan(s, end - 1).bell, null);
    assert.equal(soundPlan(s, end).bell, end);
    assert.equal(soundPlan(s, end + BELL_MS + 1).bell, null);
});
