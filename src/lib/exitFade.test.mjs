import { test } from "node:test";
import assert from "node:assert/strict";
import { changeFade, leavingMs, screenExitMs, videoExitMs, leavingAudio, ghostStart, ghostTrack, GHOST_BURST_MS } from "./exitFade.js";
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

// Rodada G5 (owner 2026-10-17): what enters or replaces something else fades
// too, over the screen before it; moving the slide stays the theme's.
test("enter fade: a new item replaces the one on its layer, each layer", () => {
    const one = run([["content.show", song]]);
    const two = applyOp(one, "content.show", { ...song, title: "Outra", fade: 500 }, T0 + 10);
    assert.equal(changeFade(two), 500);
    assert.equal(screenExitMs(one, two), 500, "song → song: the old one fades over the new one");
    assert.equal(screenExitMs(one, applyOp(one, "content.show", { ...song, title: "Outra" }, T0 + 10)), 0, "Corte");
    const pic = applyOp(one, "media.show", { kind: "image", url: "i.jpg", fade: 500 }, T0 + 10);
    assert.equal(screenExitMs(one, pic), 500, "song → picture");
    assert.equal(screenExitMs(pic, applyOp(pic, "media.show", { kind: "image", url: "j.jpg", fade: 300 }, T0 + 20)), 300, "picture → picture");
    const timer = run([["tool.show", { mode: "timer", durationMs: 60000 }]]);
    assert.equal(screenExitMs(timer, applyOp(timer, "tool.show", { mode: "clock", fade: 300 }, T0 + 10)), 300, "a tool replaced");
    assert.equal(screenExitMs(timer, applyOp(timer, "tool.adjust", { deltaMs: 60000 }, T0 + 10)), 0, "the same timer, more time");
    const notice = run([["communication.show", { playlist: [{ title: "A" }, { title: "B" }] }]]);
    const next = applyOp(notice, "communication.advance", { fromIndex: 0, fade: 500 }, T0 + 10);
    assert.equal(screenExitMs(notice, next), 500, "Tocar todos moves on fading");
    const list = run([["media.playlist", { items: [{ kind: "image", url: "a.jpg" }, { kind: "image", url: "b.jpg" }] }]]);
    assert.equal(screenExitMs(list, applyOp(list, "media.advance", { fromIndex: 0, fade: 400 }, T0 + 10)), 400, "a list of pictures moves on fading");
    // Nothing on air: what enters fades in over the papel de parede.
    const empty = run([["background.set", { kind: "color", value: "#123456" }]]);
    assert.equal(screenExitMs(empty, applyOp(empty, "media.show", { kind: "image", url: "i.jpg", fade: 500 }, T0 + 10)), 500);
});

test("enter fade: moving the slide fades nothing — the theme's transition", () => {
    const on = run([["content.show", { ...song, fade: 500 }]]);
    for (const [op, args] of [["content.goTo", { index: 1 }], ["content.next", {}], ["content.update", { title: "Novo" }]]) {
        const moved = applyOp(on, op, args, T0 + 10);
        assert.equal(changeFade(moved), 0, op);
        assert.equal(screenExitMs(on, moved), 0, op);
    }
    // The same song sent again is a new item: it fades.
    assert.equal(screenExitMs(on, applyOp(on, "content.show", { ...song, fade: 500 }, T0 + 10)), 500);
});

test("enter fade: a sound hushed and a fade at once take the longer", () => {
    const media = run([["media.show", CLIP]]);
    const swap = applyOp(media, "media.show", { kind: "video", url: "keryx-media://b.mp4", transition: { mode: "fade", ms: 1000 }, fade: 500 }, T0 + 5);
    assert.equal(screenExitMs(media, swap), 1000, "the sound leaves longer than the picture would");
    const quick = applyOp(media, "media.show", { kind: "video", url: "keryx-media://b.mp4", transition: { mode: "fade", ms: 200 }, fade: 500 }, T0 + 5);
    assert.equal(screenExitMs(media, quick), 500);
    // The video channel: a clip replaced fades as the change says.
    const clip = run([["video.show", CLIP]]);
    assert.equal(videoExitMs(clip, applyOp(clip, "video.show", { kind: "video", url: "keryx-media://b.mp4", fade: 500 }, T0 + 5)), 500);
    assert.equal(videoExitMs(clip, applyOp(clip, "video.show", { kind: "video", url: "keryx-media://b.mp4" }, T0 + 5)), 0);
});

test("enter fade: a YouTube player leaving cuts (a cold iframe in the ghost)", () => {
    const yt = run([["media.show", { kind: "youtube", url: "https://youtu.be/x" }]]);
    assert.equal(screenExitMs(yt, applyOp(yt, "content.show", { ...song, fade: 500 }, T0 + 5)), 0);
    assert.equal(screenExitMs(yt, applyOp(yt, "clear", { fade: 300 }, T0 + 5)), 0, "Esc too");
    const clip = run([["video.show", { kind: "youtube", url: "https://youtu.be/x" }]]);
    assert.equal(videoExitMs(clip, applyOp(clip, "clear", { fade: 300 }, T0 + 5)), 0);
    // Coming in, YouTube fades in over what was there.
    const on = run([["content.show", song]]);
    assert.equal(screenExitMs(on, applyOp(on, "media.show", { kind: "youtube", url: "https://youtu.be/x", fade: 500 }, T0 + 5)), 500);
});

test("ghostTrack: one ghost per change, kept through changes that fade nothing", () => {
    const a = run([["content.show", song]]);
    const b = applyOp(a, "content.show", { ...song, title: "B", fade: 500 }, T0 + 1000);
    let t = ghostStart(a, a.rev);
    t = ghostTrack(t, b, b.rev, screenExitMs, 5000);
    assert.equal(t.ghost.from, a);
    assert.deepEqual([t.ghost.ms, t.ghost.at, t.ghost.until], [500, 5000, 5500]);
    assert.equal(ghostTrack(t, b, b.rev, screenExitMs, 5100), t, "the same rev: nothing new");
    // A slide moved while it fades (later than a burst): the ghost goes on.
    const c = applyOp(b, "content.goTo", { index: 1 }, T0 + 1300);
    const t2 = ghostTrack(t, c, c.rev, screenExitMs, 5300);
    assert.equal(t2.ghost, t.ghost);
    assert.equal(t2.prev, c);
    assert.equal(ghostTrack(ghostStart(a, a.rev), b, b.rev, screenExitMs, 5000, false).ghost, null, "disabled: a cut");
});

test("ghostTrack: a burst of changes fades once, from the screen before it", () => {
    // The console sends a song with its own background: the Fundo, then the text.
    const a = run([["background.set", { kind: "color", value: "#111111" }], ["content.show", song]]);
    const bg = applyOp(a, "background.set", { kind: "color", value: "#222222" }, T0 + 1000);
    const text = applyOp(bg, "content.show", { ...song, title: "B", fade: 500 }, T0 + 1020);
    let t = ghostStart(a, a.rev);
    t = ghostTrack(t, bg, bg.rev, screenExitMs, 5000);
    assert.equal(t.ghost, null, "the Fundo alone carries no fade");
    t = ghostTrack(t, text, text.rev, screenExitMs, 5040);
    assert.equal(t.ghost.from, a, "the old Fundo fades out with the old text, never cut first");
    assert.equal(t.ghost.ms, 500);
    // The Setlist's place right after: the same ghost, untouched.
    const place = applyOp(text, "session.item", { itemId: "x" }, T0 + 1060);
    const t2 = ghostTrack(t, place, place.rev, screenExitMs, 5080);
    assert.equal(t2.ghost, t.ghost);
    // Past the burst, the next change starts from the screen drawn then.
    const later = applyOp(place, "content.show", { ...song, title: "C", fade: 300 }, T0 + 3000);
    const t3 = ghostTrack(t2, later, later.rev, screenExitMs, 5040 + GHOST_BURST_MS + 500);
    assert.equal(t3.ghost.from, place);
    assert.equal(t3.ghost.ms, 300);
    // Out of a burst, the Fundo alone does not borrow an old base.
    const slow = ghostTrack(ghostTrack(ghostStart(a, a.rev), bg, bg.rev, screenExitMs, 5000), text, text.rev, screenExitMs, 5000 + GHOST_BURST_MS);
    assert.equal(slow.ghost.from, bg);
});
