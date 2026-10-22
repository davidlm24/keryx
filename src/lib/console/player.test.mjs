import test from "node:test";
import assert from "node:assert/strict";
import { playerLayers, playerLayer, playerOp, videoSwap, clock } from "./player.js";

const pb = (o = {}) => ({ paused: false, position: 0, at: 0, volume: 1, ...o });
const doc = {
    video: { kind: "youtube", url: "y", playback: pb(), shownAt: 10 },
    media: { kind: "image", url: "i", playback: pb(), shownAt: 30 },
    audio: { kind: "audio", url: "a", playback: pb({ paused: true }), shownAt: 20, playlist: [{ url: "a0" }, { url: "a" }, { url: "a2" }], playlistIndex: 1 },
};

test("which layers the player can control", () => {
    assert.deepEqual(playerLayers(doc), ["video", "audio"], "an image on the projector has no sound");
    assert.equal(playerLayer(doc), "audio", "the one that started last");
    assert.equal(playerLayer(doc, "video"), "video", "the operator's pick while it plays");
    assert.equal(playerLayer({ ...doc, video: null }, "video"), "audio", "a pick that stopped falls back");
    assert.equal(playerLayer(null), null);
    assert.equal(playerLayer({ media: { kind: "video", playback: pb(), shownAt: 1 } }), "media");
});

test("player buttons", () => {
    assert.deepEqual(playerOp(doc, "audio", "toggle"), ["transport", { layer: "audio", action: "play" }]);
    assert.deepEqual(playerOp(doc, "video", "toggle"), ["transport", { layer: "video", action: "pause" }]);
    assert.deepEqual(playerOp(doc, "video", "back", { pos: 4 }), ["transport", { layer: "video", action: "seek", time: 0 }], "never before the start");
    assert.deepEqual(playerOp(doc, "video", "forward", { pos: 55, duration: 60 }), ["transport", { layer: "video", action: "seek", time: 60 }], "never past the end");
    assert.deepEqual(playerOp(doc, "audio", "prev"), ["playlist.goTo", { layer: "audio", index: 0 }]);
    assert.deepEqual(playerOp(doc, "audio", "next"), ["playlist.goTo", { layer: "audio", index: 2 }]);
    assert.deepEqual(playerOp(doc, "video", "prev"), ["transport", { layer: "video", action: "seek", time: 0 }], "a single item: back to the start");
    assert.equal(playerOp(doc, "video", "next"), null);
    assert.equal(playerOp({ audio: { ...doc.audio, playlistIndex: 2 } }, "audio", "next"), null, "the end of the list");
    assert.deepEqual(playerOp(doc, "audio", "volume", { volume: 1.7 }), ["transport", { layer: "audio", action: "volume", volume: 1 }]);
    assert.deepEqual(playerOp(doc, "audio", "stop"), ["audio.clear", {}]);
    assert.equal(playerOp(doc, null, "toggle"), null);
});

test("the video/sound button: a video leaves the projector with its sound kept, and comes back", () => {
    const onProjector = { media: { kind: "video", url: "v", playback: pb(), shownAt: 1 } };
    assert.equal(videoSwap(onProjector, "media").action, "audioOnly");
    assert.deepEqual(playerOp(onProjector, "media", "audioOnly"), ["media.toAudio", {}]);
    assert.equal(playerOp(onProjector, "media", "showVideo"), null);
    const asSound = { audio: { kind: "video", url: "v", playback: pb(), shownAt: 2 } };
    assert.equal(videoSwap(asSound, "audio").action, "showVideo");
    assert.deepEqual(playerOp(asSound, "audio", "showVideo"), ["audio.toMedia", {}]);
    assert.equal(videoSwap(doc, "audio"), null, "music has no picture");
    assert.equal(videoSwap(doc, "video"), null, "the video screens keep their own");
    assert.equal(videoSwap({ media: { kind: "audio", url: "a", playback: pb() } }, "media"), null);
    const yt = { media: { kind: "youtube", url: "y", playback: pb() } };
    assert.equal(videoSwap(yt, "media").disabled, true, "YouTube cannot play hidden");
    assert.equal(playerOp(yt, "media", "audioOnly"), null);
    assert.equal(videoSwap(null, "media"), null);
});

test("the progress bar under the pointer (Rodada F1)", async () => {
    const { seekAt, SEEK_KEY_SECONDS } = await import("./player.js");
    const box = { left: 100, width: 200 };
    assert.equal(seekAt(200, box, 60), 30, "the middle");
    assert.equal(seekAt(150, box, 60), 15);
    assert.equal(seekAt(40, box, 60), 0, "left of the bar: the start");
    assert.equal(seekAt(900, box, 60), 60, "right of it: the end, never past");
    assert.equal(seekAt(200, box, null), 0, "no length: nowhere to go");
    assert.equal(seekAt(200, { left: 0, width: 0 }, 60), 0, "a bar not laid out yet");
    assert.equal(SEEK_KEY_SECONDS, 5);
    const onProjector = { media: { kind: "video", url: "v", playback: pb({ position: 58 }), shownAt: 1 } };
    assert.deepEqual(playerOp(onProjector, "media", "seek", { pos: 58 + SEEK_KEY_SECONDS, duration: 60 }), ["transport", { layer: "media", action: "seek", time: 60 }], "a step past the end stops at the end");
});

test("clock", () => {
    assert.equal(clock(83), "1:23");
    assert.equal(clock(3725), "1:02:05");
});

test("letra automática: the chip, its click, the ticks (Rodada D4)", async () => {
    const { followsItem, followTicks, clockLength } = await import("./player.js");
    const { followLabel, followAction } = await import("./followWords.js");
    const audio = { source: "audio", url: "/a.mp3", paused: false, offset: 0, clock: null };
    assert.equal(followsItem(audio, { url: "/a.mp3" }), true);
    assert.equal(followsItem(audio, { url: "/b.mp3" }), false);
    assert.equal(followsItem({ source: "clock" }, { url: "/a.mp3" }), false);
    assert.equal(followLabel(audio), "Letra segue o playback");
    assert.equal(followLabel({ ...audio, source: "video" }), "Letra segue o vídeo");
    assert.equal(followLabel({ ...audio, paused: true }), "Letra parada · clique para retomar");
    const waiting = { source: "clock", paused: true, offset: 0, clock: null };
    assert.equal(followLabel(waiting), "Letra automática · esperando Iniciar");
    assert.equal(followAction(waiting), "start");
    assert.equal(followAction({ ...waiting, paused: false, clock: { paused: false, position: 0, at: 0 } }), "pause");
    assert.equal(followAction({ ...audio, paused: true }), "resume");
    assert.equal(followAction(null), null);
    const slides = [{ text: "a" }, { text: "b", start: 10, label: "Verso" }, { text: "c", start: 50 }];
    assert.deepEqual(followTicks(slides, audio, 100), [{ i: 1, pct: 10, label: "2 · Verso · 0:10", t: 10, name: "Verso" }, { i: 2, pct: 50, label: "3 · 0:50", t: 50, name: "Slide 3" }]);
    // Re-synced 20 s ahead: the marks come in 20 s earlier on the media's bar.
    assert.deepEqual(followTicks(slides, { ...audio, offset: 20 }, 100).map((t) => t.pct), [30]);
    assert.deepEqual(followTicks(slides, audio, 0), []);
    assert.equal(clockLength(slides, { length: 210 }), 210);
    assert.equal(clockLength(slides, {}), 65);
    assert.equal(clockLength([{ text: "x" }], {}), null);
});

test("letra por tempo (Rodada P7): the chip says it, Iniciar starts it; a song sends its starts", async () => {
    const { clockFollow, followsItem } = await import("./player.js");
    const { followLabel, followAction } = await import("./followWords.js");
    const { followStart } = await import("./lyricSync.js");
    const { songFollow, songContent } = await import("./content.js");
    const waiting = { source: "time", each: 8, paused: true, offset: 0, clock: null };
    assert.equal(clockFollow(waiting), true);
    assert.equal(clockFollow({ source: "video", url: "/v.mp4" }), false);
    assert.equal(followsItem(waiting, { url: "/a.mp3" }), false);
    assert.equal(followLabel(waiting), "Letra por tempo · esperando Iniciar");
    assert.equal(followStart(waiting).label, "Iniciar letra por tempo");
    assert.equal(followStart({ source: "clock" }).label, "Iniciar letra automática");
    assert.equal(followAction(waiting), "start");
    const running = { ...waiting, paused: false, clock: { paused: false, position: 0, at: 0 } };
    assert.equal(followLabel({ ...running, each: 7.5 }), "Por tempo · 7,5 s por slide");
    assert.equal(followAction(running), "pause");
    // The song: Por tempo whatever its media and marks; Não never follows.
    const song = { title: "Banda", lyrics: "a\n\nb\n\nc", audio_url: "/a.mp3", follow_mode: "time", slide_seconds: 6, slides: [{ text: "a", start: 40 }, { text: "b", duration: 10 }, { text: "c" }] };
    assert.deepEqual(songFollow(song, song.slides), { source: "time", each: 6, length: 22 });
    assert.deepEqual(songContent(song).slides.map((s) => s.start), [0, 6, 16]);
    assert.equal(songFollow({ ...song, follow_mode: "off" }, song.slides), null);
    assert.equal(songContent({ ...song, follow_mode: "off" }).follow, undefined);
    // Pelas marcas (or "" with marks): as before, the unmarked slides filled.
    const marked = { ...song, follow_mode: "", audio_url: "", duration: 60, slides: [{ text: "a", start: 0 }, { text: "b" }, { text: "c", start: 20 }] };
    assert.deepEqual(songFollow(marked, marked.slides), { source: "clock", length: 60 });
    assert.deepEqual(songContent(marked).slides.map((s) => s.start), [0, 10, 20]);
});
