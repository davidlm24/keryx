import test from "node:test";
import assert from "node:assert/strict";
import { fileKey, filesFrom, setVideoFiles, stillOf, codecOf, subscribeFiles } from "./videoFiles.js";

test("fileKey: the stored and the served form of a file are the same", () => {
    assert.equal(fileKey("keryx-media://abc.mp4"), "abc.mp4");
    assert.equal(fileKey("http://127.0.0.1:7700/media/abc.mp4"), "abc.mp4");
    assert.equal(fileKey("http://192.168.0.9:7700/media/abc.mp4?v=2#t=1"), "abc.mp4");
    assert.equal(fileKey("https://example.com/loop.mp4"), "https://example.com/loop.mp4", "a link stays itself");
    assert.equal(fileKey(null), "");
});

test("filesFrom / stillOf / codecOf: the videos' stills and codecs, by file", () => {
    const rows = [
        { type: "video", file_url: "keryx-media://a.mp4", thumbnail_url: "http://127.0.0.1:7700/media/a.jpg" },
        { type: "video", file_url: "keryx-media://b.mp4", video_codec: "hvc1", video_bit_depth: 10, video_chroma: "420" },
        { type: "video", file_url: "keryx-media://c.mp4" },
        { type: "image", file_url: "keryx-media://d.jpg", thumbnail_url: "x" },
    ];
    assert.deepEqual([...filesFrom(rows).keys()], ["a.mp4", "b.mp4"], "only videos with something to say");
    let told = 0;
    const off = subscribeFiles(() => told++);
    setVideoFiles(rows);
    setVideoFiles(rows.map((r) => ({ ...r })));
    assert.equal(told, 1, "the same files tell no one");
    assert.equal(stillOf("http://127.0.0.1:7700/media/a.mp4"), "http://127.0.0.1:7700/media/a.jpg");
    assert.equal(stillOf("http://127.0.0.1:7700/media/b.mp4"), null);
    assert.deepEqual(codecOf("http://127.0.0.1:7700/media/b.mp4"), { codec: "hvc1", bitDepth: 10, chroma: "420" });
    assert.equal(codecOf("http://127.0.0.1:7700/media/c.mp4"), null);
    assert.equal(stillOf(""), null);
    setVideoFiles([{ ...rows[1], video_codec: "avc1" }]);
    assert.equal(told, 2, "a codec read later tells");
    off();
    setVideoFiles([]);
    assert.equal(told, 2, "unsubscribed");
});
