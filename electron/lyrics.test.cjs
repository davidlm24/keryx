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
    assert.match(r4.errors.join(" "), /letras.mus.br está ocupado agora/, "a 503 is a busy server");

    const offline = createLyrics({ fetchImpl: fakeFetch([["solr.sscdn.co", new Error("ENOTFOUND")], ["lrclib.net", new Error("ENOTFOUND")]]) });
    const r5 = await offline.search("algo novo");
    assert.equal(r5.results.length, 0);
    assert.match(r5.errors.join(" "), /sem conexão/);

    await assert.rejects(() => all.search("a"), (e) => e.status === 400);
});

test("a source that never answers ends in time; the other's results still show", async () => {
    const letras = fakeFetch([["solr.sscdn.co", { body: LETRAS }]]);
    const fetchImpl = (url, opts) => (url.includes("lrclib.net") ? new Promise(() => {}) : letras(url, opts));
    const r = await createLyrics({ fetchImpl, timeoutMs: 30 }).search("algo novo");
    assert.equal(r.results.length, 2);
    assert.match(r.errors.join(" "), /LRCLIB não respondeu a tempo/);
});

test("get: LRCLIB lyrics by id; letras.mus.br is pasted", async () => {
    const lyrics = createLyrics({ fetchImpl: fakeFetch([["lrclib.net/api/get/101", { body: LRCLIB_SONG }]]) });
    assert.equal((await lyrics.get("lrclib:101")).title, "Bondade de Deus");
    await assert.rejects(() => lyrics.get("letras:coral-kemuel/algo-novo"), /cole aqui/);
    await assert.rejects(() => lyrics.get("vagalume:3ade68b8g"), (e) => e.status === 400, "old Vagalume ids are no longer served");
});

test("título – artista searches LRCLIB by title and artist; timed uploads are kept and say so (Rodada P12)", async () => {
    const { splitQuery, lrclibSearchUrl } = require("./lyrics.cjs");
    assert.deepEqual(splitQuery("Bondade de Deus – Isaías Saad"), { track: "Bondade de Deus", artist: "Isaías Saad" });
    assert.deepEqual(splitQuery("Bondade de Deus - Isaías Saad"), { track: "Bondade de Deus", artist: "Isaías Saad" });
    assert.deepEqual(splitQuery("Algo novo — Kemuel"), { track: "Algo novo", artist: "Kemuel" });
    assert.equal(splitQuery("bondade de deus"), null, "free text stays free");
    assert.equal(splitQuery("Graça-maior"), null, "a hyphen inside a word is no separator");
    assert.equal(splitQuery("x – y"), null);
    assert.equal(lrclibSearchUrl("Bondade de Deus – Isaías Saad"), "https://lrclib.net/api/search?track_name=Bondade%20de%20Deus&artist_name=Isa%C3%ADas%20Saad");
    assert.equal(lrclibSearchUrl("bondade"), "https://lrclib.net/api/search?q=bondade");
    // The same song twice: the upload with timed lines wins, in the first one's place.
    const r = parseLrclibSearch(JSON.stringify([
        { id: 1, trackName: "Bondade de Deus", artistName: "Isaías Saad", plainLyrics: "Te amo" },
        { id: 2, trackName: "Outra", artistName: "X", plainLyrics: "a" },
        { id: 3, trackName: "Bondade de Deus", artistName: "Isaías Saad", plainLyrics: "Te amo", syncedLyrics: "[00:12.00]Te amo" },
    ]));
    assert.deepEqual(r.map((x) => [x.id, x.timed]), [["lrclib:3", true], ["lrclib:2", false]]);
    const song = parseLrclibSong(JSON.stringify({ trackName: "B", artistName: "I", plainLyrics: "Te amo", syncedLyrics: "[00:12.00]Te amo\r\n", duration: 245.6 }));
    assert.deepEqual(song, { title: "B", artist: "I", lyrics: "Te amo", synced: "[00:12.00]Te amo", duration: 246 });
    assert.equal(parseLrclibSong(LRCLIB_SONG).synced, undefined);
    // The search asks LRCLIB by title and artist, letras.mus.br with both words.
    const asked = [];
    const svc = createLyrics({ fetchImpl: async (url) => { asked.push(url); return { ok: true, status: 200, text: async () => (url.includes("lrclib") ? "[]" : LETRAS) }; } });
    await svc.search("Algo novo – Kemuel");
    assert.ok(asked.some((u) => u.includes("track_name=Algo%20novo&artist_name=Kemuel")));
    assert.ok(asked.some((u) => u.includes("q=Algo%20novo%20Kemuel")));
});

test("recordings (Buscar marcas): every take with its length and times; busy answers are tried again", async () => {
    const { parseLrclibRecordings } = require("./lyrics.cjs");
    const body = JSON.stringify([
        { id: 1, trackName: "Bondade De Deus", artistName: "Pedras Vivas", albumName: "Bondade De Deus", duration: 296.0, instrumental: false, plainLyrics: "Te amo, Deus", syncedLyrics: "" },
        { id: 2, trackName: "Bondade de Deus", artistName: "Pedras Vivas", albumName: "", duration: 295.6, instrumental: false, plainLyrics: "Te amo, Deus", syncedLyrics: "[00:13.35] Te amo, Deus\r\n" },
        { id: 3, trackName: "Bondade de Deus (Ao Vivo)", artistName: "Pedras Vivas", albumName: "Ao Vivo", duration: 321, instrumental: false, plainLyrics: "Te amo, Deus", syncedLyrics: "[00:20.00] Te amo, Deus" },
        { id: 4, trackName: "Bondade de Deus", artistName: "Pedras Vivas", duration: 296, instrumental: true, plainLyrics: "" },
    ]);
    const r = parseLrclibRecordings(body);
    assert.deepEqual(r.map((x) => x.id), ["lrclib:2", "lrclib:3"], "the same take folded, the timed upload kept; a live take is another recording");
    assert.deepEqual([r[0].duration, r[0].synced, r[0].album], [296, "[00:13.35] Te amo, Deus", ""]);

    // Busy twice, then the answer.
    let calls = 0;
    const asked = [];
    const busy = createLyrics({ retryMs: 1, fetchImpl: async (url) => { asked.push(url); calls++; return calls < 3 ? { ok: false, status: 503, text: async () => "" } : { ok: true, status: 200, text: async () => body }; } });
    const got = await busy.recordings({ title: "Bondade de Deus", artist: "Pedras Vivas" });
    assert.equal(got.results.length, 2);
    assert.equal(calls, 3);
    assert.ok(asked[0].includes("track_name=Bondade%20de%20Deus&artist_name=Pedras%20Vivas"));

    // Busy every time: says so (status 503), after three tries.
    calls = 0;
    const always = createLyrics({ retryMs: 1, fetchImpl: async () => { calls++; return { ok: false, status: 503, text: async () => "" }; } });
    await assert.rejects(() => always.recordings({ title: "Bondade de Deus" }), (e) => e.status === 503 && /ocupado/.test(e.message));
    assert.equal(calls, 3);

    // Nothing by that artist: the title alone.
    const urls = [];
    const fallback = createLyrics({ fetchImpl: async (url) => { urls.push(url); return { ok: true, status: 200, text: async () => (url.includes("artist_name") ? "[]" : body) }; } });
    assert.equal((await fallback.recordings("Bondade de Deus – Outro")).results.length, 2);
    assert.equal(urls.length, 2);
    assert.ok(!urls[1].includes("artist_name"));
    await assert.rejects(() => fallback.recordings({ title: "a" }), (e) => e.status === 400);
});
