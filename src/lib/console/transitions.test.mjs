import { test } from "node:test";
import assert from "node:assert/strict";
import { withTransitions, clearFade, pauseFade, SOUND_OPS, EXIT_OPS, MEDIA_MS, CLEAR_MS, PAUSE_MS } from "./transitions.js";
import { prefsOf } from "../prefs/schema.js";
import { applyOp, emptyState } from "../../../shared/live-state.mjs";

const T0 = 1_000_000;
const defaults = prefsOf(null);

test("transitions: the defaults are a 0,5 s crossfade, a 0,3 s exit fade (Tela preta and Logo included) and a 0,2 s pause fade", () => {
    assert.deepEqual([defaults.media_transition, defaults.media_transition_ms, defaults.clear_transition, defaults.clear_transition_ms, defaults.screen_transition, defaults.pause_fade_ms], ["fade", 500, "fade", 300, true, 200]);
    assert.deepEqual(withTransitions("video.show", { url: "v.mp4" }, defaults), { url: "v.mp4", transition: { mode: "fade", ms: 500 } });
    assert.deepEqual(withTransitions("clear", {}, defaults), { fade: 300 });
    assert.deepEqual(withTransitions("screen.set", { mode: "black" }, defaults), { mode: "black", fade: 300 });
    for (const op of SOUND_OPS) assert.ok(withTransitions(op, {}, defaults).transition, op);
    for (const op of EXIT_OPS) assert.equal(withTransitions(op, {}, defaults).fade, 300, op);
    assert.ok(EXIT_OPS.includes("text.clear"), "Limpar texto is one change with the exit fade");
    for (const op of ["media.clear", "video.clear", "audio.clear"]) assert.ok(EXIT_OPS.includes(op), `Parar fades with Ao tirar do ar: ${op}`);
    assert.deepEqual(withTransitions("transport", { layer: "audio", action: "pause" }, defaults), { layer: "audio", action: "pause", fade: 200 });
    assert.deepEqual(withTransitions("transport", { layer: "audio", action: "play" }, defaults).fade, 200);
    assert.deepEqual(withTransitions("playlist.goTo", { layer: "audio", index: 1 }, defaults).transition, { mode: "fade", ms: 500 }, "Anterior / Próximo fade the track that stops");
});

test("transitions: each choice of the rows reaches the op", () => {
    assert.deepEqual(withTransitions("audio.show", {}, prefsOf({ media_transition: "cut" })).transition, { mode: "cut" });
    assert.deepEqual(withTransitions("audio.show", {}, prefsOf({ media_transition: "mix" })).transition, { mode: "mix" }, "Tocar junto");
    assert.deepEqual(withTransitions("media.playlist", {}, prefsOf({ media_transition_ms: 2000 })).transition, { mode: "fade", ms: 2000 });
    assert.deepEqual(withTransitions("clear", {}, prefsOf({ clear_transition: "cut" })), {}, "Corte: no fade");
    assert.equal(withTransitions("content.clear", {}, prefsOf({ clear_transition_ms: 1000 })).fade, 1000);
    // Tela preta e Logo off, or Ao tirar da tela on Corte: they cut.
    assert.deepEqual(withTransitions("screen.set", { mode: "logo" }, prefsOf({ screen_transition: false })), { mode: "logo" });
    assert.deepEqual(withTransitions("screen.set", { mode: "logo" }, prefsOf({ clear_transition: "cut" })), { mode: "logo" });
    assert.equal(clearFade(prefsOf({ clear_transition: "cut", clear_transition_ms: 600 })), 0);
    // Ao pausar o som: Corte adds nothing; seek and volume never fade.
    assert.deepEqual(withTransitions("transport", { action: "pause" }, prefsOf({ pause_fade_ms: 0 })), { action: "pause" });
    assert.equal(withTransitions("transport", { action: "play" }, prefsOf({ pause_fade_ms: 400 })).fade, 400);
    assert.equal(withTransitions("transport", { action: "seek", time: 3 }, defaults).fade, undefined);
    assert.equal(withTransitions("transport", { action: "volume", volume: 0.5 }, defaults).fade, undefined);
    assert.deepEqual(PAUSE_MS.map(([v]) => prefsOf({ pause_fade_ms: v }).pause_fade_ms), [0, 200, 400]);
    assert.equal(prefsOf({ pause_fade_ms: 300 }).pause_fade_ms, 200, "a value the row does not offer falls back");
    assert.equal(pauseFade(prefsOf({ pause_fade_ms: null })), 200, "no choice: 0,2 s");
    // A Desfazer asks for the pause fade: its ms, or nothing on Corte.
    assert.deepEqual(withTransitions("audio.show", { url: "a.mp3", fadeIn: true, transition: { mode: "mix" } }, defaults), { url: "a.mp3", fadeIn: 200, transition: { mode: "mix" } });
    assert.deepEqual(withTransitions("audio.show", { url: "a.mp3", fadeIn: true, transition: { mode: "mix" } }, prefsOf({ pause_fade_ms: 0 })), { url: "a.mp3", transition: { mode: "mix" } });
});

test("transitions: other ops, no prefs and the sender's own choice are left alone", () => {
    const a = { index: 2 };
    assert.equal(withTransitions("content.goTo", a, defaults), a);
    assert.equal(withTransitions("media.toAudio", {}, defaults).transition, undefined, "the player's swap never hushes");
    assert.equal(withTransitions("content.show", {}, defaults).transition, undefined);
    assert.equal(withTransitions("clear", a, null), a);
    assert.deepEqual(withTransitions("video.show", { transition: { mode: "cut" } }, defaults).transition, { mode: "cut" });
    assert.equal(withTransitions("clear", { fade: 1000 }, defaults).fade, 1000);
});

test("transitions: the eye's picture follows Ao tirar da tela, and never hushes", () => {
    assert.deepEqual(withTransitions("media.toAudio", {}, defaults), { fade: 300 });
    assert.deepEqual(withTransitions("audio.toMedia", {}, defaults), { fade: 300 });
    assert.equal(withTransitions("media.toAudio", {}, prefsOf({ clear_transition_ms: 1000 })).fade, 1000);
    assert.deepEqual(withTransitions("media.toAudio", {}, prefsOf({ clear_transition: "cut" })), {}, "Corte");
    const s = applyOp(emptyState(T0), "media.show", { kind: "video", url: "v.mp4" }, T0);
    const moved = applyOp(s, "media.toAudio", withTransitions("media.toAudio", {}, defaults), T0 + 1);
    assert.deepEqual([moved.fade, moved.leaving], [{ ms: 300, at: T0 + 1 }, []]);
    assert.deepEqual(applyOp(moved, "audio.toMedia", withTransitions("audio.toMedia", {}, defaults), T0 + 2).fade, { ms: 300, at: T0 + 2 });
});

test("transitions: what the console adds is what the live state takes", () => {
    let s = applyOp(emptyState(T0), "audio.show", withTransitions("audio.show", { url: "a.mp3" }, defaults), T0);
    s = applyOp(s, "video.show", withTransitions("video.show", { kind: "video", url: "v.mp4" }, defaults), T0 + 1);
    assert.equal(s.audio, null);
    assert.equal(s.leaving[0].until, T0 + 501);
    assert.deepEqual(applyOp(s, "clear", withTransitions("clear", {}, defaults), T0 + 2).fade, { ms: 300, at: T0 + 2 });
    const music = applyOp(emptyState(T0), "audio.show", withTransitions("audio.show", { url: "a.mp3" }, defaults), T0);
    assert.equal(applyOp(music, "transport", withTransitions("transport", { layer: "audio", action: "pause" }, defaults), T0 + 1000).audio.playback.ramp.ms, 200, "Pausar fades 0,2 s");
    assert.equal(applyOp(music, "clear", withTransitions("clear", {}, defaults), T0 + 1000).leaving[0].until, T0 + 1300, "Esc takes the music with the screens' fade");
    // The rows offer only what the prefs keep.
    assert.deepEqual(MEDIA_MS.map(([v]) => prefsOf({ media_transition_ms: v }).media_transition_ms), [500, 1000, 2000]);
    assert.deepEqual(CLEAR_MS.map(([v]) => prefsOf({ clear_transition_ms: v }).clear_transition_ms), [300, 600, 1000]);
    assert.equal(prefsOf({ media_transition_ms: 750 }).media_transition_ms, 500, "a value the row does not offer falls back");
});
