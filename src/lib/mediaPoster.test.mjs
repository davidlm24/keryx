import test from "node:test";
import assert from "node:assert/strict";
import { needsPoster, posterTime, posterSize, tileUrl } from "./mediaPoster.js";

const file = { type: "video", file_url: "http://127.0.0.1:7700/media/v.mp4" };

test("needsPoster: a video file on this computer with no still yet", () => {
    assert.equal(needsPoster(file), true);
    assert.equal(needsPoster({ ...file, thumbnail_url: "http://127.0.0.1:7700/media/p.jpg" }), false, "already has one");
    assert.equal(needsPoster({ ...file, missing: true }), false, "the file is not found");
    assert.equal(needsPoster({ ...file, file_url: "https://youtu.be/abc" }), false, "YouTube");
    assert.equal(needsPoster({ ...file, file_url: "https://www.youtube.com/watch?v=abc" }), false, "YouTube");
    assert.equal(needsPoster({ ...file, file_url: "" }), false, "no file");
    assert.equal(needsPoster({ ...file, type: "audio" }), false);
    assert.equal(needsPoster(null), false);
});

test("needsPoster: a photo gets a small copy too (owner 2026-10-23); a GIF and an SVG keep the file", () => {
    const photo = { type: "image", file_url: "http://127.0.0.1:7700/media/foto.jpg" };
    assert.equal(needsPoster(photo), true);
    assert.equal(needsPoster({ ...photo, thumbnail_url: "http://127.0.0.1:7700/media/p.webp" }), false);
    assert.equal(needsPoster({ ...photo, file_url: "http://127.0.0.1:7700/media/anima.gif" }), false, "a GIF moves");
    assert.equal(needsPoster({ ...photo, file_url: "http://127.0.0.1:7700/media/logo.SVG" }), false, "an SVG has any size");
    assert.equal(needsPoster({ ...photo, type: "gif" }), false);
    assert.equal(needsPoster({ ...photo, file_url: "https://images.unsplash.com/photo-1?w=1920" }), false, "another site's picture: left alone");
    assert.equal(needsPoster({ ...photo, file_url: "keryx-media://foto.jpg" }), false, "not resolved to this computer");
});

test("tileUrl: the small copy once it is here, else the file", () => {
    const photo = { file_url: "http://h/media/foto.jpg" };
    assert.equal(tileUrl(photo), "http://h/media/foto.jpg");
    assert.equal(tileUrl({ ...photo, thumbnail_url: "http://h/media/t.webp" }), "http://h/media/t.webp");
    assert.equal(tileUrl({ ...photo, thumbnail_url: "http://h/media/t.webp", posterSyncing: true }), "http://h/media/foto.jpg", "the copy still coming from another computer");
    assert.equal(tileUrl(null), "");
});

test("posterTime: a tenth in, between 1 s and 5 s; short clips from their middle", () => {
    assert.equal(posterTime(30), 3);
    assert.equal(posterTime(5), 1);
    assert.equal(posterTime(600), 5);
    assert.equal(posterTime(1), 0.5);
    assert.equal(posterTime(0), 0);
    assert.equal(posterTime(NaN), 0);
    assert.equal(posterTime(Infinity), 0, "a stream has no length: its start");
});

test("posterSize: the video's shape, at most 480 px", () => {
    assert.deepEqual(posterSize(1920, 1080), { width: 480, height: 270 });
    assert.deepEqual(posterSize(1080, 1920), { width: 270, height: 480 });
    assert.deepEqual(posterSize(320, 240), { width: 320, height: 240 }, "never enlarged");
    assert.deepEqual(posterSize(0, 0), { width: 480, height: 270 }, "unknown: 16:9");
});
