import { test } from "node:test";
import assert from "node:assert/strict";
import { withTransitions, clearFade, pauseFade, enterFade, kindMode, SOUND_OPS, EXIT_OPS, ENTER_OPS, MEDIA_MS, CLEAR_MS, PAUSE_MS, ENTER_MS, KIND_MODES, IMAGE_SECONDS } from "./transitions.js";
import { TRANSITION_TYPE_IDS } from "../contentKinds.js";
import { prefsOf } from "../prefs/schema.js";
import { applyOp, emptyState } from "../../../shared/live-state.mjs";

const T0 = 1_000_000;
const defaults = prefsOf(null);

test("transitions: the defaults are a 0,5 s crossfade, a 0,3 s exit fade (Tela preta and Logo included) and a 0,2 s pause fade", () => {
    assert.deepEqual([defaults.media_transition, defaults.media_transition_ms, defaults.clear_transition, defaults.clear_transition_ms, defaults.screen_transition, defaults.pause_fade_ms], ["fade", 500, "fade", 300, true, 200]);
    assert.deepEqual(withTransitions("video.show", { url: "v.mp4" }, defaults), { url: "v.mp4", transition: { mode: "fade", ms: 500 }, fade: 500 });
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
    assert.equal(withTransitions("content.show", {}, defaults).transition, undefined, "a song never hushes");
    assert.equal(withTransitions("clear", a, null), a);
    assert.deepEqual(withTransitions("video.show", { transition: { mode: "cut" } }, defaults).transition, { mode: "cut" });
    assert.equal(withTransitions("clear", { fade: 1000 }, defaults).fade, 1000);
});

test("transitions: the eye's picture follows Ao tirar da tela, and never hushes", () => {
    assert.deepEqual(withTransitions("media.toAudio", {}, defaults), { fade: 300 });
    // Mostrar o vídeo puts a video on the screen: it enters (Rodada G5).
    assert.deepEqual(withTransitions("audio.toMedia", {}, defaults), { fade: 500 });
    assert.deepEqual(withTransitions("audio.toMedia", {}, prefsOf({ enter_transition: "cut" })), {});
    assert.equal(withTransitions("media.toAudio", {}, prefsOf({ clear_transition_ms: 1000 })).fade, 1000);
    assert.deepEqual(withTransitions("media.toAudio", {}, prefsOf({ clear_transition: "cut" })), {}, "Corte");
    const s = applyOp(emptyState(T0), "media.show", { kind: "video", url: "v.mp4" }, T0);
    const moved = applyOp(s, "media.toAudio", withTransitions("media.toAudio", {}, defaults), T0 + 1);
    assert.deepEqual([moved.fade, moved.leaving], [{ ms: 300, at: T0 + 1 }, []]);
    assert.deepEqual(applyOp(moved, "audio.toMedia", withTransitions("audio.toMedia", {}, defaults), T0 + 2).fade, { ms: 500, at: T0 + 2 });
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

// Ao entrar ou trocar (Rodada G5): Suave 0,5 s by default, the timer Corte,
// each kind as Por tipo de conteúdo says; the sender's own fade wins.
test("transitions: what enters takes the fade of its kind", () => {
    assert.deepEqual(ENTER_MS.map(([v]) => prefsOf({ enter_transition_ms: v }).enter_transition_ms), [300, 500, 1000]);
    assert.deepEqual(KIND_MODES.map(([v]) => v), ["", "cut", "fade"]);
    const fades = (op, args, prefs = defaults) => withTransitions(op, args, prefs).fade;
    assert.equal(fades("content.show", { kind: "lyrics" }), 500, "song → song");
    assert.equal(fades("content.show", {}), 500, "a content with no kind is a song");
    assert.equal(fades("content.show", { kind: "bible" }), 500);
    assert.equal(fades("content.show", { kind: "presentation" }), 500, "a PDF enters fading; its pages are goTo");
    assert.equal(fades("media.show", { kind: "image" }), 500);
    assert.equal(fades("media.show", { kind: "youtube" }), 500, "YouTube enters fading (it leaves cut, exitFade.js)");
    assert.equal(fades("video.show", { kind: "video" }), 500);
    assert.equal(fades("communication.show", { item: {} }), 500);
    assert.equal(fades("communication.advance", { fromIndex: 0 }), 500);
    assert.equal(fades("tool.show", { mode: "timer" }), undefined, "the timer cuts: the count does not wait");
    for (const op of ["content.goTo", "content.next", "content.prev", "content.reveal", "content.update", "playlist.goTo", "background.set"]) assert.equal(fades(op, {}), undefined, op);
    for (const op of ENTER_OPS) assert.ok(!EXIT_OPS.includes(op), op);
    // The map: a list by the item it starts with.
    const list = (kinds, index = 0) => ({ items: kinds.map((kind, i) => ({ kind, url: `${i}`, duration: 8 })), index });
    assert.equal(fades("media.playlist", list(["video", "image"]), prefsOf({ enter_transition_kinds: { image: "cut" } })), 500, "starts with a video");
    assert.equal(fades("media.playlist", list(["video", "image"], 1), prefsOf({ enter_transition_kinds: { image: "cut" } })), undefined, "starts with a picture");
    assert.equal(fades("media.playlist", { items: [] }), undefined);
});

test("transitions: the row, the kinds and the sender", () => {
    const cut = prefsOf({ enter_transition: "cut" });
    assert.equal(withTransitions("content.show", {}, cut).fade, undefined, "Corte");
    assert.equal(withTransitions("media.show", { kind: "image" }, prefsOf({ enter_transition_ms: 1000 })).fade, 1000);
    // A kind's own choice wins over the row, both ways; Padrão follows it.
    const kinds = prefsOf({ enter_transition: "cut", enter_transition_kinds: { bible: "fade", tool: "fade" } });
    assert.equal(withTransitions("content.show", { kind: "bible" }, kinds).fade, 500);
    assert.equal(withTransitions("content.show", { kind: "lyrics" }, kinds).fade, undefined);
    assert.equal(withTransitions("tool.show", { mode: "clock" }, kinds).fade, 500, "the timer, on Suave by choice");
    assert.equal(withTransitions("content.show", { kind: "lyrics" }, prefsOf({ enter_transition_kinds: { lyrics: "cut" } })).fade, undefined);
    assert.deepEqual(TRANSITION_TYPE_IDS.map((k) => kindMode(defaults, k)), ["fade", "fade", "fade", "fade", "fade", "fade", "fade", "cut"]);
    // The sender's fade wins (an output that knows better, a Desfazer, a test).
    assert.equal(withTransitions("content.show", { fade: 1000 }, defaults).fade, 1000);
    assert.equal(withTransitions("content.show", { fade: 0 }, defaults).fade, 0, "a cut asked for");
    assert.equal(withTransitions("content.show", {}, null).fade, undefined, "no prefs: nothing added");
});

test("transitions: a picture of a short list fades a quarter of its time at most", () => {
    assert.equal(enterFade(defaults, "image", { duration: 1, playlist: [{}, {}] }), 250);
    assert.equal(enterFade(defaults, "image", { duration: 10, playlist: [{}, {}] }), 500);
    assert.equal(enterFade(prefsOf({ enter_transition_ms: 1000 }), "image", { playlist: [{}, {}] }), Math.min(1000, IMAGE_SECONDS * 250));
    assert.equal(enterFade(defaults, "image", { duration: 1 }), 500, "a picture alone stays as long as the operator wants");
    assert.equal(withTransitions("media.playlist", { items: [{ kind: "image", url: "a", duration: 2 }, { kind: "image", url: "b" }] }, defaults).fade, 500);
    assert.equal(withTransitions("media.playlist", { items: [{ kind: "image", url: "a", duration: 1 }, { kind: "image", url: "b" }] }, defaults).fade, 250);
    assert.equal(enterFade(defaults, "alert"), 0, "the Aviso rápido has each screen's own entrance");
    assert.equal(enterFade(null, "lyrics"), 0);
});

test("transitions: song → song in the live state, through the console's args", () => {
    const one = applyOp(emptyState(T0), "content.show", withTransitions("content.show", { title: "A", slides: ["a"] }, defaults), T0);
    const two = applyOp(one, "content.show", withTransitions("content.show", { title: "B", slides: ["b"] }, defaults), T0 + 10);
    assert.deepEqual(two.fade, { ms: 500, at: T0 + 10 });
    const step = applyOp(two, "content.goTo", withTransitions("content.goTo", { index: 0 }, defaults), T0 + 20);
    assert.equal(step.fade.at, T0 + 10, "a step adds no fade");
});
