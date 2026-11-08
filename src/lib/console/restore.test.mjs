import test from "node:test";
import assert from "node:assert/strict";
import { applyOp, emptyState } from "../../../shared/live-state.mjs";
import { restoreArgs, undoEndOps } from "./restore.js";
import { withTransitions } from "./transitions.js";

const T = 1_000_000;
const run = (state, ops, at = T + 10) => ops.reduce((s, [op, args]) => applyOp(s, op, args, at), state);
const song = (s) => applyOp(s, "content.show", { kind: "lyrics", title: "Canto", slides: [{ text: "um" }, { text: "dois" }, { text: "três" }], style: { font_size: "large" } }, T);

test("Desfazer after Esc puts the song back on the same slide", () => {
    const before = applyOp(song(emptyState(T)), "content.goTo", { index: 2 }, T + 1);
    const after = run(applyOp(before, "clear", {}, T + 2), undoEndOps(before));
    assert.equal(after.content.title, "Canto");
    assert.equal(after.content.index, 2);
    assert.deepEqual(after.content.slides, before.content.slides);
    assert.equal(after.screen, "show");
});

test("a picture over the song comes back over it; the video channel and Tela preta too", () => {
    let before = song(emptyState(T));
    before = applyOp(before, "media.show", { kind: "image", url: "keryx-media://a.png", title: "Foto" }, T + 1);
    before = applyOp(before, "video.show", { kind: "video", url: "keryx-media://v.mp4", title: "Clipe" }, T + 2);
    before = applyOp(before, "screen.set", { mode: "black" }, T + 3);
    const after = run(applyOp(before, "clear", {}, T + 4), undoEndOps(before));
    assert.equal(after.content.title, "Canto");
    assert.equal(after.media.title, "Foto");
    assert.equal(after.video.title, "Clipe");
    assert.equal(after.screen, "black");
});

test("Desfazer brings the music back at the second it stopped (paused stays paused, mix, fade-in, follow)", () => {
    // The music on the audio channel and a muted video on the projector (Tocar
    // junto, or a video the operator turned down to 0).
    let before = applyOp(emptyState(T), "audio.show", { kind: "audio", url: "keryx-media://hino.mp3", title: "Hino", volume: 0.7 }, T);
    before = applyOp(before, "media.show", { kind: "video", url: "keryx-media://v.mp4", title: "Clipe", volume: 0 }, T + 1);
    before = applyOp(before, "video.show", { kind: "video", url: "keryx-media://w.mp4", title: "Telão", volume: 0.4, transition: { mode: "mix" } }, T + 2);
    const ended = applyOp(before, "clear", { fade: 300 }, T + 42_000);
    assert.equal(ended.audio, null, "Esc stops the music (Rodada G3)");
    assert.equal(ended.leaving.length, 1, "fading out with the screens");
    // As the console sends them: with the church's Transições (Suave, 0,2 s).
    const prefs = { media_transition: "fade", media_transition_ms: 500, pause_fade_ms: 200 };
    const ops = undoEndOps(before, ended.updatedAt).map(([op, args]) => [op, withTransitions(op, args, prefs)]);
    const back = run(ended, ops, T + 42_100);
    assert.equal(back.audio?.title, "Hino", "the music is back");
    assert.deepEqual(back.audio.playback, { paused: false, position: 42, at: T + 42_100, volume: 0.7, ramp: { at: T + 42_100, ms: 200, from: 0, to: 1 } }, "at the second Esc stopped it, rising over the pause fade");
    assert.deepEqual(back.leaving, [], "the copy still fading stops leaving: one player, one sound");
    assert.equal(back.media.playback.volume, 0, "nothing hushes anything (mix)");
    assert.equal(back.video.playback.volume, 0.4);
    // Paused music comes back paused, where it was; a list at its item.
    let list = applyOp(emptyState(T), "audio.playlist", { items: [{ url: "keryx-media://a.mp3" }, { url: "keryx-media://b.mp3" }], index: 1 }, T);
    list = applyOp(list, "transport", { layer: "audio", action: "pause" }, T + 30_000);
    const listOps = undoEndOps(list, T + 60_000);
    assert.deepEqual(listOps.map(([op]) => op), ["audio.playlist"], "music alone can be undone");
    const again = run(applyOp(list, "clear", {}, T + 60_000), listOps.map(([op, a]) => [op, withTransitions(op, a, prefs)]), T + 61_000);
    assert.deepEqual([again.audio.url, again.audio.playlistIndex, again.audio.playback.paused, again.audio.playback.position, again.audio.playback.ramp], ["keryx-media://b.mp3", 1, true, 30, undefined]);
    // A song following its playback: the automatic lyrics come back with it.
    const slides = [{ text: "um", start: 0 }, { text: "dois", start: 20 }];
    let synced = applyOp(emptyState(T), "content.show", { kind: "lyrics", title: "Canto", slides, follow: { source: "audio", url: "keryx-media://pb.mp3" } }, T);
    synced = applyOp(synced, "audio.show", { url: "keryx-media://pb.mp3" }, T);
    const [show] = undoEndOps(synced, T + 25_000);
    assert.deepEqual([show[0], show[1].follow.source, show[1].follow.url], ["content.show", "audio", "keryx-media://pb.mp3"]);
    assert.equal(run(applyOp(synced, "clear", {}, T + 25_000), undoEndOps(synced, T + 25_000), T + 25_100).content.follow.source, "audio");
});

test("an aviso or a tool over the song comes back over it", () => {
    const aviso = applyOp(song(emptyState(T)), "communication.show", { item: { type: "text", title: "Aviso", text: "Culto às 19h" } }, T + 1);
    assert.deepEqual(undoEndOps(aviso).map(([op]) => op), ["content.show", "communication.show"]);
    assert.equal(run(applyOp(aviso, "clear", {}, T + 2), undoEndOps(aviso)).communication.item.title, "Aviso");
    // (A tool and an aviso replace each other: never both on air.)
    const timer = applyOp(song(emptyState(T)), "tool.show", { mode: "timer", durationMs: 300000 }, T + 1);
    const back = run(applyOp(timer, "clear", {}, T + 2), undoEndOps(timer));
    assert.equal(back.tool.mode, "timer");
    assert.equal(back.content.title, "Canto");
});

test("nothing was on air: nothing to undo (not even Tela preta)", () => {
    assert.deepEqual(undoEndOps(null), []);
    assert.deepEqual(undoEndOps(applyOp(emptyState(T), "screen.set", { mode: "black" }, T)), []);
});

test("a history entry still restores as before (Voltar ao anterior)", () => {
    const s = applyOp(song(emptyState(T)), "content.clear", {}, T + 1);
    const [op, args] = restoreArgs(s.history[0]);
    assert.equal(op, "content.show");
    assert.equal(args.title, "Canto");
    assert.throws(() => restoreArgs({ layer: "nada", data: {} }));
});

test("Desfazer after Esc also puts back the Fundo the item was over (Esc put the Fundo padrão)", () => {
    let before = applyOp(emptyState(T), "background.default", { background: { kind: "color", value: "#101010" } }, T);
    before = applyOp(before, "background.set", { kind: "generator", value: "aurora", title: "Aurora" }, T);
    before = applyOp(before, "content.show", { kind: "lyrics", title: "Canto", slides: [{ text: "a" }] }, T + 1);
    const ended = applyOp(before, "clear", {}, T + 2);
    assert.equal(ended.background.value, "#101010");
    const ops = undoEndOps(before);
    assert.equal(ops[0][0], "background.set");
    const back = ops.reduce((s, [op, args]) => applyOp(s, op, args, T + 3), ended);
    assert.equal(back.background.value, "aurora");
    assert.equal(back.content.title, "Canto");
});
