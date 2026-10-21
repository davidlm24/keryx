import test from "node:test";
import assert from "node:assert/strict";
import { fileKey, stillsFrom, setVideoStills, stillOf, subscribeStills } from "./videoStills.js";

test("fileKey: the stored and the served form of a file are the same", () => {
    assert.equal(fileKey("keryx-media://abc.mp4"), "abc.mp4");
    assert.equal(fileKey("http://127.0.0.1:7700/media/abc.mp4"), "abc.mp4");
    assert.equal(fileKey("http://192.168.0.9:7700/media/abc.mp4?v=2#t=1"), "abc.mp4");
    assert.equal(fileKey("https://example.com/loop.mp4"), "https://example.com/loop.mp4", "a link stays itself");
    assert.equal(fileKey(null), "");
});

test("stillsFrom / stillOf: only videos with a still", () => {
    const rows = [
        { type: "video", file_url: "keryx-media://a.mp4", thumbnail_url: "http://127.0.0.1:7700/media/a.jpg" },
        { type: "video", file_url: "keryx-media://b.mp4" },
        { type: "image", file_url: "keryx-media://c.jpg", thumbnail_url: "x" },
    ];
    assert.deepEqual([...stillsFrom(rows).keys()], ["a.mp4"]);
    let told = 0;
    const off = subscribeStills(() => told++);
    setVideoStills(rows);
    setVideoStills([...rows]);
    assert.equal(told, 1, "the same stills tell no one");
    assert.equal(stillOf("http://127.0.0.1:7700/media/a.mp4"), "http://127.0.0.1:7700/media/a.jpg");
    assert.equal(stillOf("http://127.0.0.1:7700/media/b.mp4"), null);
    assert.equal(stillOf(""), null);
    off();
    setVideoStills([]);
    assert.equal(told, 1, "unsubscribed");
});
