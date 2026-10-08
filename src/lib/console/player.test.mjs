import test from "node:test";
import assert from "node:assert/strict";
import { playerLayers, playerLayer, playerOp, clock } from "./player.js";

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

test("clock", () => {
    assert.equal(clock(83), "1:23");
    assert.equal(clock(3725), "1:02:05");
});
