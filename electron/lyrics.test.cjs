const test = require("node:test");
const assert = require("node:assert/strict");
const { createLyrics, parseLetrasSearch, parseLrclibSearch, parseLrclibSong, parseVagalumeSearch, parseVagalumeSong } = require("./lyrics.cjs");

// Shapes taken from the live services (2026-10-07, LRCLIB 2026-10-10), trimmed.
const LETRAS = 'LetrasSug({"response":{"numFound":2,"docs":[{"art":"Kemuel","dns":"coral-kemuel","txt":"Algo Novo ","extra_txt":"(part. Lukas Agustinho)","t":"2","url":"algo-novo-part-lukas-agustinho"},{"art":"Kemuel","dns":"coral-kemuel","txt":"Kemuel","t":"1"},{"art":"Get &amp; Worship","dns":"get-worship","txt":"Algo Novo Vindo","t":"2","url":"algo-novo-vindo"}]}})';
const VAGA_SEARCH = JSON.stringify({ response: { docs: [{ id: "3ade68b8g", title: "Algo Novo", band: "Kemuel", url: "/kemuel/algo-novo.html" }] } });
const VAGA_SONG = JSON.stringify({ type: "exact", art: { name: "Kemuel" }, mus: [{ id: "3ade68b8g", name: "Algo Novo", text: "Vem me visitar hoje aqui\r\nEu quero conhecer mais de Ti\r\n\r\nEspírito, vem" }] });
// LRCLIB lists the same song many times; some uploads have no lyrics.
const LRCLIB = JSON.stringify([
    { id: 101, trackName: "Bondade de Deus", artistName: "Isaías Saad", albumName: "Ao Vivo", instrumental: false, plainLyrics: "Te amo, Deus" },
    { id: 102, trackName: "bondade de deus", artistName: "Isaias Saad", albumName: "", instrumental: false, plainLyrics: "Te amo, Deus" },
    { id: 103, trackName: "Bondade de Deus (Acústico)", artistName: "Isaias Saad", albumName: "Acústico", instrumental: false, plainLyrics: "Te amo" },
    { id: 104, trackName: "Bondade de Deus", artistName: "Outro", albumName: "", instrumental: true, plainLyrics: "" },
    { id: 105, trackName: "Sem letra", artistName: "Alguém", albumName: "", instrumental: false, plainLyrics: "  " },
]);
const LRCLIB_SONG = JSON.stringify({ id: 101, trackName: "Bondade de Deus", artistName: "Isaías Saad", plainLyrics: "Te amo, Deus\r\nTua bondade" });

const settingsWith = (data = {}) => ({ get: (k, f) => (data[k] === undefined ? f : data[k]), set: (k, v) => { data[k] = v; } });
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

test("Vagalume: search and full lyrics", () => {
    const [hit] = parseVagalumeSearch(VAGA_SEARCH);
    assert.deepEqual([hit.id, hit.title, hit.artist, hit.hasLyrics], ["vagalume:3ade68b8g", "Algo Novo", "Kemuel", true]);
    const song = parseVagalumeSong(VAGA_SONG);
    assert.equal(song.lyrics, "Vem me visitar hoje aqui\nEu quero conhecer mais de Ti\n\nEspírito, vem");
    assert.throws(() => parseVagalumeSong(JSON.stringify({ type: "notfound" })), (e) => e.status === 404);
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

test("search merges the sources; one failing never hides the others", async () => {
    const all = createLyrics({ settings: settingsWith({ lyrics: { vagalumeKey: "k" } }), fetchImpl: fakeFetch([["solr.sscdn.co", { body: LETRAS }], ["search.excerpt", { body: VAGA_SEARCH }], ["lrclib.net/api/search", { body: LRCLIB }]]) });
    const r = await all.search("algo novo");
    assert.deepEqual(r.results.map((x) => x.source), ["vagalume", "lrclib", "letras", "lrclib", "letras"], "interleaved: the sources with lyrics first");
    assert.deepEqual(r.errors, []);

    // Without the Vagalume key, LRCLIB still brings full lyrics.
    const lrOnly = createLyrics({ settings: settingsWith(), fetchImpl: fakeFetch([["solr.sscdn.co", { body: LETRAS }], ["lrclib.net/api/search", { body: LRCLIB }]]) });
    const rl = await lrOnly.search("bondade de deus");
    assert.equal(rl.results.filter((x) => x.hasLyrics).length, 2);
    assert.match(rl.errors.join(" "), /sem chave/);

    const noKey = createLyrics({ settings: settingsWith(), fetchImpl: fakeFetch([["solr.sscdn.co", { body: LETRAS }], ["lrclib.net", new Error("ENOTFOUND")]]) });
    const r2 = await noKey.search("algo novo");
    assert.equal(r2.results.length, 2);
    assert.match(r2.errors.join(" "), /sem chave/);
    assert.match(r2.errors.join(" "), /LRCLIB: sem conexão/);

    const down = createLyrics({ settings: settingsWith({ lyrics: { vagalumeKey: "k" } }), fetchImpl: fakeFetch([["solr.sscdn.co", { body: LETRAS }], ["search.excerpt", { status: 503, body: "" }], ["lrclib.net", { status: 500, body: "" }]]) });
    const r3 = await down.search("algo novo");
    assert.equal(r3.results.length, 2);
    assert.match(r3.errors.join(" "), /Vagalume indisponível agora/);
    assert.match(r3.errors.join(" "), /LRCLIB indisponível agora/);

    const offline = createLyrics({ settings: settingsWith(), fetchImpl: fakeFetch([["solr.sscdn.co", new Error("ENOTFOUND")], ["lrclib.net", new Error("ENOTFOUND")]]) });
    const r4 = await offline.search("algo novo");
    assert.equal(r4.results.length, 0);
    assert.match(r4.errors.join(" "), /sem conexão/);

    await assert.rejects(() => all.search("a"), (e) => e.status === 400);
});

test("get: Vagalume and LRCLIB lyrics; letras.mus.br is pasted; the key lives in settings", async () => {
    const data = {};
    const lyrics = createLyrics({ settings: settingsWith(data), fetchImpl: fakeFetch([["search.php", { body: VAGA_SONG }], ["lrclib.net/api/get/101", { body: LRCLIB_SONG }]]) });
    assert.equal((await lyrics.get("lrclib:101")).title, "Bondade de Deus", "no key needed");
    await assert.rejects(() => lyrics.get("vagalume:3ade68b8g"), (e) => e.status === 401);
    assert.deepEqual(lyrics.setKey("  abc "), { hasKey: true });
    assert.equal(data.lyrics.vagalumeKey, "abc");
    assert.equal((await lyrics.get("vagalume:3ade68b8g")).title, "Algo Novo");
    await assert.rejects(() => lyrics.get("letras:coral-kemuel/algo-novo"), /cole aqui/);
});
