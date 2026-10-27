import test from "node:test";
import assert from "node:assert/strict";
import { pendingSet, pendingUrls, createPendingMedia } from "./pendingMedia.js";

const BASE = "http://127.0.0.1:7700/media/";

test("pendingSet: the stored and the loadable url of each name", () => {
    const set = pendingSet(["a.mp4", "", null, "b.jpg"], BASE);
    assert.deepEqual([...set].sort(), [`${BASE}a.mp4`, `${BASE}b.jpg`, "keryx-media://a.mp4", "keryx-media://b.jpg"]);
    assert.equal(pendingSet(null, BASE).size, 0);
});

test("pendingUrls: found anywhere in a stage, once, posters left out", () => {
    const pending = pendingSet(["clip.mp4", "fundo.jpg", "poster.jpg"], BASE);
    const stage = {
        kind: "video",
        args: { url: `${BASE}clip.mp4`, poster: `${BASE}poster.jpg`, fundo: { kind: "image", value: `${BASE}fundo.jpg` } },
        video: `${BASE}clip.mp4`,
        slides: [{ text: "ok", image_url: `${BASE}outra.jpg` }],
    };
    assert.deepEqual(pendingUrls(stage, pending, { skip: ["poster"] }).sort(), [`${BASE}clip.mp4`, `${BASE}fundo.jpg`]);
    assert.deepEqual(pendingUrls(stage, new Set()), []);
    assert.deepEqual(pendingUrls({ x: "keryx-media://clip.mp4" }, pending), ["keryx-media://clip.mp4"]);
});

test("createPendingMedia: asks once, then follows the pushes", async () => {
    let push = null;
    let asked = 0;
    const store = createPendingMedia({
        missing: async () => { asked += 1; return { data: ["a.mp4"] }; },
        onMissing: (cb) => { push = cb; return () => {}; },
    }, BASE);
    assert.equal(store.current().size, 0);
    let calls = 0;
    const off = store.subscribe(() => { calls += 1; });
    store.subscribe(() => {});
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(asked, 1);
    assert.ok(store.current().has(`${BASE}a.mp4`));
    const before = store.current();
    push([]);
    assert.notEqual(store.current(), before, "a new set on every change");
    assert.equal(store.current().size, 0);
    assert.equal(calls, 2);
    off();
    assert.equal(createPendingMedia(null, BASE).current().size, 0);
});
