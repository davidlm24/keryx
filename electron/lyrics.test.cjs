const test = require("node:test");
const assert = require("node:assert/strict");
const { createLyrics, parseLetrasSearch, parseVagalumeSearch, parseVagalumeSong } = require("./lyrics.cjs");

// Shapes taken from the live services (2026-10-07), trimmed.
const LETRAS = 'LetrasSug({"response":{"numFound":2,"docs":[{"art":"Kemuel","dns":"coral-kemuel","txt":"Algo Novo ","extra_txt":"(part. Lukas Agustinho)","t":"2","url":"algo-novo-part-lukas-agustinho"},{"art":"Kemuel","dns":"coral-kemuel","txt":"Kemuel","t":"1"},{"art":"Get &amp; Worship","dns":"get-worship","txt":"Algo Novo Vindo","t":"2","url":"algo-novo-vindo"}]}})';
const VAGA_SEARCH = JSON.stringify({ response: { docs: [{ id: "3ade68b8g", title: "Algo Novo", band: "Kemuel", url: "/kemuel/algo-novo.html" }] } });
const VAGA_SONG = JSON.stringify({ type: "exact", art: { name: "Kemuel" }, mus: [{ id: "3ade68b8g", name: "Algo Novo", text: "Vem me visitar hoje aqui\r\nEu quero conhecer mais de Ti\r\n\r\nEspírito, vem" }] });

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

test("search merges both sources; one failing never hides the other", async () => {
    const both = createLyrics({ settings: settingsWith({ lyrics: { vagalumeKey: "k" } }), fetchImpl: fakeFetch([["solr.sscdn.co", { body: LETRAS }], ["search.excerpt", { body: VAGA_SEARCH }]]) });
    const r = await both.search("algo novo");
    assert.deepEqual(r.results.map((x) => x.source), ["vagalume", "letras", "letras"], "interleaved, Vagalume first");
    assert.deepEqual(r.errors, []);

    const noKey = createLyrics({ settings: settingsWith(), fetchImpl: fakeFetch([["solr.sscdn.co", { body: LETRAS }]]) });
    const r2 = await noKey.search("algo novo");
    assert.equal(r2.results.length, 2);
    assert.match(r2.errors[0], /sem chave/);

    const vagaDown = createLyrics({ settings: settingsWith({ lyrics: { vagalumeKey: "k" } }), fetchImpl: fakeFetch([["solr.sscdn.co", { body: LETRAS }], ["search.excerpt", { status: 503, body: "" }]]) });
    const r3 = await vagaDown.search("algo novo");
    assert.equal(r3.results.length, 2);
    assert.match(r3.errors[0], /Vagalume indisponível agora \(HTTP 503\)/);

    const offline = createLyrics({ settings: settingsWith(), fetchImpl: fakeFetch([["solr.sscdn.co", new Error("ENOTFOUND")]]) });
    const r4 = await offline.search("algo novo");
    assert.equal(r4.results.length, 0);
    assert.match(r4.errors.join(" "), /sem conexão/);

    await assert.rejects(() => both.search("a"), (e) => e.status === 400);
});

test("get: Vagalume lyrics; letras.mus.br is pasted; the key lives in settings", async () => {
    const data = {};
    const lyrics = createLyrics({ settings: settingsWith(data), fetchImpl: fakeFetch([["search.php", { body: VAGA_SONG }]]) });
    await assert.rejects(() => lyrics.get("vagalume:3ade68b8g"), (e) => e.status === 401);
    assert.deepEqual(lyrics.setKey("  abc "), { hasKey: true });
    assert.equal(data.lyrics.vagalumeKey, "abc");
    assert.equal((await lyrics.get("vagalume:3ade68b8g")).title, "Algo Novo");
    await assert.rejects(() => lyrics.get("letras:coral-kemuel/algo-novo"), /cole aqui/);
});
