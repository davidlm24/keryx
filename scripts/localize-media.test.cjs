const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createStore, PROFILE_ID } = require("../electron/db/store.cjs");
const schema = require("../electron/db/schema.json");
const { localizeMedia } = require("./localize-media.cjs");

const LOGO = "https://media.base44.com/images/public/app/logo.jpg";
const GONE = "https://media.base44.com/files/gone.mp4";
const UNSPLASH = "https://images.unsplash.com/photo-123?w=1920&q=80";

function setup() {
    const store = createStore({ file: ":memory:", schema, log: () => {} });
    const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), "keryx-media-"));
    const song = store.call("Song", "create", [{
        title: "A",
        background_image: UNSPLASH,
        slides: [{ text: "x", background: LOGO }, { text: "y" }],
    }]);
    const media = store.call("Media", "create", [{ title: "V", type: "video", file_url: GONE }]);
    store.call("User", "update", [PROFILE_ID, { logo_url: LOGO }]);
    const plain = store.call("Song", "create", [{ title: "B", background_image: "#000000" }]);
    return { store, mediaDir, song, media, plain };
}

const fakeFetch = async (url) => (url === LOGO
    ? { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }
    : { ok: false, status: 404 });

test("downloads Base44 files once, maps known URLs, rewrites nested JSON", async () => {
    const { store, mediaDir, song, media, plain } = setup();
    let fetched = 0;
    const result = await localizeMedia({
        store,
        entities: ["Song", "Media", "User", "BibleVerse"],
        mediaDir,
        mapUrl: (url) => (url === UNSPLASH ? "keryx-media://bundled/backgrounds/123.webp" : null),
        fetchImpl: async (url) => { fetched++; return fakeFetch(url); },
    });

    assert.equal(result.downloaded, 1, "the logo, once, though two rows use it");
    assert.equal(result.mapped, 1);
    assert.deepEqual(result.failed.map((f) => f.url), [GONE]);
    assert.equal(fetched, 2);
    assert.equal(result.rowsUpdated, 2, "song and profile");

    const s = store.call("Song", "get", [song.id]);
    assert.equal(s.background_image, "keryx-media://bundled/backgrounds/123.webp");
    assert.match(s.slides[0].background, /^keryx-media:\/\/[0-9a-f-]{36}\.jpg$/);
    assert.deepEqual(s.slides[1], { text: "y" });
    const file = s.slides[0].background.replace("keryx-media://", "");
    assert.deepEqual([...fs.readFileSync(path.join(mediaDir, file))], [1, 2, 3]);

    assert.equal(store.call("User", "get", [PROFILE_ID]).logo_url, s.slides[0].background);
    assert.equal(store.call("Media", "get", [media.id]).file_url, GONE, "a failed download stays as it was");
    assert.equal(store.call("Song", "get", [plain.id]).background_image, "#000000");
});

test("nothing to localize changes nothing", async () => {
    const store = createStore({ file: ":memory:", schema, log: () => {} });
    store.call("Song", "create", [{ title: "A", background_image: "#123456" }]);
    const result = await localizeMedia({ store, entities: ["Song"], mediaDir: fs.mkdtempSync(path.join(os.tmpdir(), "keryx-media-")), fetchImpl: fakeFetch });
    assert.deepEqual(result, { downloaded: 0, mapped: 0, failed: [], rowsUpdated: 0 });
});
