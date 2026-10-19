import { test } from "node:test";
import assert from "node:assert/strict";
import { changeFade, leavingMs, screenExitMs, videoExitMs, leavingAudio } from "./exitFade.js";
import { applyOp, emptyState } from "../../shared/live-state.mjs";

const T0 = 1_000_000;
const run = (ops, state = emptyState(T0)) => ops.reduce((s, [op, args, now = T0]) => applyOp(s, op, args, now), state);
const song = { title: "Grande é o Senhor", slides: ["um", "dois"] };
const CLIP = { kind: "video", url: "keryx-media://clipe.mp4" };
const FADE = { mode: "fade", ms: 500 };

test("exit fade: Esc with a fade fades the screen out; without one it cuts", () => {
    const on = run([["content.show", song]]);
    const esc = applyOp(on, "clear", { fade: 300 }, T0 + 10);
    assert.equal(changeFade(esc), 300);
    assert.equal(screenExitMs(on, esc), 300);
    assert.equal(screenExitMs(on, applyOp(on, "clear", {}, T0 + 10)), 0, "a cut");
    // The fade belongs to its change: the next one does not replay it.
    const next = applyOp(esc, "content.show", song, T0 + 20);
    assert.equal(changeFade(next), 0);
    assert.equal(screenExitMs(esc, next), 0);
    // Nothing changed on screen: nothing to fade.
    const empty = run([]);
    assert.equal(screenExitMs(empty, applyOp(empty, "clear", { fade: 300 }, T0 + 1)), 0);
    // Nothing on air, but Esc puts the papel de parede back on the Fundo: it fades in.
    const wall = run([["background.default", { background: { kind: "color", value: "#123456" } }], ["background.set", { kind: "color", value: "#000000" }]]);
    assert.equal(screenExitMs(wall, applyOp(wall, "clear", { fade: 600 }, T0 + 1)), 600);
});

test("exit fade: Tela preta and Logo in and out", () => {
    const on = run([["content.show", song]]);
    const black = applyOp(on, "screen.set", { mode: "black", fade: 300 }, T0 + 1);
    assert.equal(screenExitMs(on, black), 300, "the content fades to black");
    assert.equal(screenExitMs(black, applyOp(black, "screen.set", { mode: "show", fade: 300 }, T0 + 2)), 300, "the black fades off");
    assert.equal(screenExitMs(black, applyOp(black, "screen.set", { mode: "logo" }, T0 + 2)), 0, "the switch off: a cut");
});

test("exit fade: a video a new sound stopped fades out on the projector and on the video channel", () => {
    const media = run([["media.show", CLIP]]);
    const hushed = applyOp(media, "audio.show", { url: "a.mp3", transition: FADE }, T0 + 5);
    assert.equal(leavingMs(hushed, "media", media.media), 500);
    assert.equal(screenExitMs(media, hushed), 500);
    assert.equal(screenExitMs(media, applyOp(media, "audio.show", { url: "a.mp3", transition: { mode: "cut" } }, T0 + 5)), 0);
    // A video after a video: the old one fades out over the new one.
    const swap = applyOp(media, "media.show", { kind: "video", url: "keryx-media://b.mp4", transition: FADE }, T0 + 5);
    assert.equal(screenExitMs(media, swap), 500);
    // A picture over a video: the video goes as it always did.
    assert.equal(screenExitMs(media, applyOp(media, "media.show", { kind: "image", url: "i.jpg", transition: FADE }, T0 + 5)), 0);

    const clip = run([["video.show", CLIP]]);
    assert.equal(videoExitMs(clip, applyOp(clip, "audio.show", { url: "a.mp3", transition: FADE }, T0 + 5)), 500);
    assert.equal(videoExitMs(clip, applyOp(clip, "clear", { fade: 300 }, T0 + 5)), 300, "Esc fades the clip too");
    assert.equal(videoExitMs(clip, applyOp(clip, "video.clear", {}, T0 + 5)), 0);
    assert.equal(videoExitMs(clip, applyOp(clip, "transport", { layer: "video", action: "pause" }, T0 + 5)), 0, "the same clip");
});

test("exit fade: the eye — Tirar o vídeo fades the picture out, Mostrar o vídeo fades it in, the end of a video too", () => {
    const media = run([["content.show", song], ["media.show", CLIP]]);
    const off = applyOp(media, "media.toAudio", { fade: 300 }, T0 + 5);
    assert.equal(screenExitMs(media, off), 300, "the video fades out over the lyrics under it");
    assert.equal(leavingMs(off, "media", media.media), 0, "nothing hushed: the sound goes on");
    assert.equal(screenExitMs(media, applyOp(media, "media.toAudio", {}, T0 + 5)), 0, "Corte");
    const on = applyOp(off, "audio.toMedia", { fade: 300 }, T0 + 10);
    assert.equal(screenExitMs(off, on), 300, "the screen it covers fades out over the video");
    // Nothing under it: the papel de parede (or the idle look) shows through.
    const alone = run([["media.show", CLIP]]);
    assert.equal(screenExitMs(alone, applyOp(alone, "media.toAudio", { fade: 600 }, T0 + 5)), 600);
    assert.equal(screenExitMs(alone, applyOp(alone, "media.clear", { fade: 600 }, T0 + 5)), 600, "a video that ends by itself");
    assert.equal(videoExitMs(alone, applyOp(alone, "media.toAudio", { fade: 600 }, T0 + 5)), 0, "the video channel is not the eye's");
});

test("exit fade: the audio channel's sound on its way out", () => {
    const s = run([["audio.show", { url: "a.mp3" }], ["video.show", { ...CLIP, transition: FADE }, T0 + 100]]);
    assert.deepEqual(leavingAudio(s, T0 + 200).map((e) => e.item.url), ["a.mp3"]);
    assert.deepEqual(leavingAudio(s, T0 + 600), [], "silent by then");
    assert.deepEqual(leavingAudio(null, T0), []);
});

// Rodada G3 (owner 2026-10-17): Esc and Parar take the player's music with
// the picture, on the same fade.
test("exit fade: Esc and Parar take the music out on the screens' fade", () => {
    const music = run([["content.show", song], ["audio.show", { url: "a.mp3" }]]);
    const esc = applyOp(music, "clear", { fade: 300 }, T0 + 1000);
    assert.equal(screenExitMs(music, esc), 300, "the picture fades");
    assert.deepEqual(leavingAudio(esc, T0 + 1200).map((e) => [e.item.url, e.until]), [["a.mp3", T0 + 1300]], "the music with it");
    assert.deepEqual(leavingAudio(applyOp(music, "clear", {}, T0 + 1000), T0 + 1000), [], "Corte: it stops at once");
    assert.deepEqual(leavingAudio(applyOp(music, "audio.clear", { fade: 600 }, T0 + 1000), T0 + 1500).length, 1, "Parar on the audio channel");
    // Parar on the projector's video and on the video channel fades the picture.
    const media = run([["content.show", song], ["media.show", CLIP]]);
    assert.equal(screenExitMs(media, applyOp(media, "media.clear", { fade: 300 }, T0 + 1)), 300);
    assert.equal(screenExitMs(media, applyOp(media, "media.clear", {}, T0 + 1)), 0);
    const clip = run([["video.show", CLIP]]);
    assert.equal(videoExitMs(clip, applyOp(clip, "video.clear", { fade: 600 }, T0 + 1)), 600);
});
