const test = require("node:test");
const assert = require("node:assert/strict");
const { createLyrics, parseLetrasSearch, parseLrclibSearch, parseLrclibSong } = require("./lyrics.cjs");

// Shapes taken from the live services (letras 2026-10-07, LRCLIB 2026-10-10), trimmed.
const LETRAS = 'LetrasSug({"response":{"numFound":2,"docs":[{"art":"Kemuel","dns":"coral-kemuel","txt":"Algo Novo ","extra_txt":"(part. Lukas Agustinho)","t":"2","url":"algo-novo-part-lukas-agustinho"},{"art":"Kemuel","dns":"coral-kemuel","txt":"Kemuel","t":"1"},{"art":"Get &amp; Worship","dns":"get-worship","txt":"Algo Novo Vindo","t":"2","url":"algo-novo-vindo"}]}})';
// LRCLIB lists the same song many times; some uploads have no lyrics.
const LRCLIB = JSON.stringify([
    { id: 101, trackName: "Bondade de Deus", artistName: "Isaías Saad", albumName: "Ao Vivo", instrumental: false, plainLyrics: "Te amo, Deus" },
    { id: 102, trackName: "bondade de deus", artistName: "Isaias Saad", albumName: "", instrumental: false, plainLyrics: "Te amo, Deus" },
    { id: 103, trackName: "Bondade de Deus (Acústico)", artistName: "Isaias Saad", albumName: "Acústico", instrumental: false, plainLyrics: "Te amo" },
    { id: 104, trackName: "Bondade de Deus", artistName: "Outro", albumName: "", instrumental: true, plainLyrics: "" },
    { id: 105, trackName: "Sem letra", artistName: "Alguém", albumName: "", instrumental: false, plainLyrics: "  " },
]);
const LRCLIB_SONG = JSON.stringify({ id: 101, trackName: "Bondade de Deus", artistName: "Isaías Saad", plainLyrics: "Te amo, Deus\r\nTua bondade" });

const fakeFetch = (routes) => async (url) => {
    for (const [match, res] of routes) {
        if (url.includes(match)) {
            if (res instanceof Error) throw res;
            return { ok: res.status ? res.status < 400 : true, status: res.status || 200, text: async () => res.body };
        }
    }
    throw new Error(`unexpected ${url}`);
};

test("letras.mus.br suggestions: songs only, entities decoded, page url built", () => {
    const r = parseLetrasSearch(LETRAS);
    assert.equal(r.length, 2, "artists (t=1) are skipped");
    assert.deepEqual([r[0].title, r[0].artist, r[0].extra], ["Algo Novo", "Kemuel", "(part. Lukas Agustinho)"]);
    assert.equal(r[0].pageUrl, "https://www.letras.mus.br/coral-kemuel/algo-novo-part-lukas-agustinho/");
    assert.equal(r[1].artist, "Get & Worship");
    assert.equal(r[0].hasLyrics, false, "its lyric pages are not fetched");
    assert.throws(() => parseLetrasSearch("<html>blocked</html>"));
});

test("LRCLIB: one result per song (accents and case aside), only with lyrics; full lyrics by id", () => {
    const r = parseLrclibSearch(LRCLIB);
    assert.deepEqual(r.map((x) => x.id), ["lrclib:101", "lrclib:103"], "duplicates, instrumentals and empty uploads left out");
    assert.deepEqual([r[0].title, r[0].artist, r[0].extra, r[0].sourceLabel, r[0].hasLyrics], ["Bondade de Deus", "Isaías Saad", "Ao Vivo", "LRCLIB", true]);
    assert.equal(parseLrclibSong(LRCLIB_SONG).lyrics, "Te amo, Deus\nTua bondade");
    assert.throws(() => parseLrclibSong(JSON.stringify({ id: 1, plainLyrics: "" })), (e) => e.status === 404);
    assert.throws(() => parseLrclibSearch("<html>"));
    assert.throws(() => parseLrclibSearch(JSON.stringify({ message: "x" })));
});

test("search merges the sources, LRCLIB first; one failing never hides the other", async () => {
    const all = createLyrics({ fetchImpl: fakeFetch([["solr.sscdn.co", { body: LETRAS }], ["lrclib.net/api/search", { body: LRCLIB }]]) });
    const r = await all.search("algo novo");
    assert.deepEqual(r.results.map((x) => x.source), ["lrclib", "letras", "lrclib", "letras"], "interleaved, LRCLIB (full lyrics) on top");
    assert.deepEqual(r.errors, []);

    const lrDown = createLyrics({ fetchImpl: fakeFetch([["solr.sscdn.co", { body: LETRAS }], ["lrclib.net", new Error("ENOTFOUND")]]) });
    const r2 = await lrDown.search("algo novo");
    assert.equal(r2.results.length, 2);
    assert.match(r2.errors.join(" "), /LRCLIB: sem conexão/);

    const lrBroken = createLyrics({ fetchImpl: fakeFetch([["solr.sscdn.co", { body: LETRAS }], ["lrclib.net", { status: 500, body: "" }]]) });
    const r3 = await lrBroken.search("algo novo");
    assert.equal(r3.results.length, 2);
    assert.match(r3.errors.join(" "), /LRCLIB indisponível agora/);

    const letrasDown = createLyrics({ fetchImpl: fakeFetch([["solr.sscdn.co", { status: 503, body: "" }], ["lrclib.net/api/search", { body: LRCLIB }]]) });
    const r4 = await letrasDown.search("bondade de deus");
    assert.equal(r4.results.filter((x) => x.hasLyrics).length, 2);
    assert.match(r4.errors.join(" "), /letras.mus.br indisponível agora/);

    const offline = createLyrics({ fetchImpl: fakeFetch([["solr.sscdn.co", new Error("ENOTFOUND")], ["lrclib.net", new Error("ENOTFOUND")]]) });
    const r5 = await offline.search("algo novo");
    assert.equal(r5.results.length, 0);
    assert.match(r5.errors.join(" "), /sem conexão/);

    await assert.rejects(() => all.search("a"), (e) => e.status === 400);
});

test("get: LRCLIB lyrics by id; letras.mus.br is pasted", async () => {
    const lyrics = createLyrics({ fetchImpl: fakeFetch([["lrclib.net/api/get/101", { body: LRCLIB_SONG }]]) });
    assert.equal((await lyrics.get("lrclib:101")).title, "Bondade de Deus");
    await assert.rejects(() => lyrics.get("letras:coral-kemuel/algo-novo"), /cole aqui/);
    await assert.rejects(() => lyrics.get("vagalume:3ade68b8g"), (e) => e.status === 400, "old Vagalume ids are no longer served");
});
