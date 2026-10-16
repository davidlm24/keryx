const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createStore } = require("./db/store.cjs");
const schema = require("./db/schema.json");
const {
    BOOK_NAMES, SOURCES, parseBibleJson, installFromJson, installFromSource, fetchOnlineChapter, installedVersions, verseId,
} = require("./bible.cjs");

const BOM = String.fromCharCode(0xfeff);
const fresh = () => createStore({ file: ":memory:", schema, log: () => {} });

// A tiny but well-formed Bible: every book has 2 chapters of 3 verses, and
// João 3 has a real verse 16.
function fakeBible(prefix = "v") {
    return BOOK_NAMES.map((name, b) => ({
        abbrev: `b${b}`,
        name,
        chapters: Array.from({ length: name === "João" ? 3 : 2 }, (_, c) =>
            Array.from({ length: name === "João" && c === 2 ? 16 : 3 }, (_, v) =>
                name === "João" && c === 2 && v === 15
                    ? "Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito"
                    : `${prefix} ${name} ${c + 1}:${v + 1}`)),
    }));
}

test("book names match the UI's book list", async () => {
    const { bibleBooks } = await import(pathToFileURL(path.join(__dirname, "..", "src", "lib", "bibleBooks.js")).href);
    assert.deepEqual(BOOK_NAMES, bibleBooks.map((b) => b.name));
});

test("only the downloadable versions can be installed", async () => {
    const { BIBLE_VERSIONS } = await import(pathToFileURL(path.join(__dirname, "..", "src", "lib", "bibleBooks.js")).href);
    const installable = BIBLE_VERSIONS.filter((v) => v.install).map((v) => [v.id, v.install]);
    assert.deepEqual(Object.entries(SOURCES), installable);
    assert.throws(() => installFromJson(fresh(), "ARA", JSON.stringify(fakeBible())), /não pode ser instalada/);
});

test("parseBibleJson strips the byte-order mark and rejects malformed files", () => {
    const json = JSON.stringify(fakeBible());
    assert.equal(parseBibleJson(BOM + json).length, 66);
    assert.throws(() => parseBibleJson("not json"), /JSON válido/);
    assert.throws(() => parseBibleJson(JSON.stringify(fakeBible().slice(1))), /formato esperado/);
    assert.throws(() => parseBibleJson(JSON.stringify([{ chapters: [[1]] }])), /formato esperado/);
});

test("install stores every verse with canonical ids and testaments", () => {
    const s = fresh();
    const result = installFromJson(s, "ACF", BOM + JSON.stringify(fakeBible()));
    assert.equal(result.verses, 65 * 6 + 3 + 3 + 16);
    assert.deepEqual(installedVersions(s), { ACF: result.verses });

    const verse = s.call("BibleVerse", "get", [verseId("ACF", 42, 3, 16)]);
    assert.equal(verse.id, "ACF-43-003-016");
    assert.equal(verse.book, "João");
    assert.equal(verse.testament, "Novo");
    assert.match(verse.text, /^Porque Deus amou o mundo/);
    assert.equal(s.call("BibleVerse", "get", [verseId("ACF", 0, 1, 1)]).testament, "Antigo");
    assert.equal(s.call("BibleVerse", "get", [verseId("ACF", 38, 1, 1)]).book, "Malaquias");
    assert.equal(s.call("BibleVerse", "get", [verseId("ACF", 39, 1, 1)]).testament, "Novo");
});

test("reinstalling replaces verses instead of duplicating them", () => {
    const s = fresh();
    installFromJson(s, "NVI", JSON.stringify(fakeBible("old")));
    const second = installFromJson(s, "NVI", JSON.stringify(fakeBible("new")));
    assert.deepEqual(installedVersions(s), { NVI: second.verses });
    assert.match(s.call("BibleVerse", "get", [verseId("NVI", 0, 1, 1)]).text, /^new /);
});

test("a chapter reads back in verse order, scoped to its version", () => {
    const s = fresh();
    installFromJson(s, "NVI", JSON.stringify(fakeBible("nvi")));
    installFromJson(s, "AA", JSON.stringify(fakeBible("aa")));
    const chapter = s.call("BibleVerse", "filter", [{ version: "AA", book: "João", chapter: 3 }, "verse"]);
    assert.equal(chapter.length, 16);
    assert.deepEqual(chapter.slice(0, 3).map((v) => v.verse), [1, 2, 3]);
    assert.ok(chapter.every((v) => v.version === "AA"));
});

test("search ignores case and accents and returns canonical order", () => {
    const s = fresh();
    installFromJson(s, "ACF", JSON.stringify(fakeBible()));
    const hits = s.call("BibleVerse", "filter", [{ version: "ACF", text: { $regex: "UNIGENITO" } }, "id", 10]);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].book, "João");
    const genesisFirst = s.call("BibleVerse", "filter", [{ version: "ACF", text: { $regex: "1:1" } }, "id", 3]);
    assert.deepEqual(genesisFirst.map((v) => v.book), ["Gênesis", "Êxodo", "Levítico"]);
});

test("installFromSource reports offline and HTTP failures in Portuguese", async () => {
    const s = fresh();
    const ok = await installFromSource(s, "NVI", async () => ({ ok: true, status: 200, text: async () => JSON.stringify(fakeBible()) }));
    assert.equal(ok.version, "NVI");
    await assert.rejects(installFromSource(s, "NVI", async () => { throw new Error("ENOTFOUND"); }), { status: 503 });
    await assert.rejects(installFromSource(s, "NVI", async () => ({ ok: false, status: 404 })), { status: 502 });
});

test("installFromSource never waits for ever: a site that never answers, or a body that never ends", async () => {
    const s = fresh();
    const never = () => new Promise(() => {});
    await assert.rejects(installFromSource(s, "NVI", never, { timeoutMs: 30 }), (e) => e.status === 504 && /não terminou a tempo/.test(e.message));
    let aborted = false;
    const slowBody = async (_url, { signal }) => {
        signal.addEventListener("abort", () => { aborted = true; });
        return { ok: true, status: 200, text: never };
    };
    await assert.rejects(installFromSource(s, "NVI", slowBody, { timeoutMs: 30 }), { status: 504 });
    assert.ok(aborted, "the real request is stopped too");
});

test("fetchOnlineChapter reads the verses of the site's answer", async () => {
    let seen;
    const fetchImpl = async (url) => {
        seen = url;
        return { ok: true, status: 200, json: async () => ({ verses: [{ number: 1, text: " Bem-aventurado o homem " }, { number: "x", text: "ignorado" }, { number: 2 }] }) };
    };
    const verses = await fetchOnlineChapter({ api: "ara", slug: "salmos", chapter: 1 }, fetchImpl);
    assert.equal(seen, "https://www.abibliadigital.com.br/api/chapters/ara/salmos/1");
    assert.deepEqual(verses, [{ number: 1, text: "Bem-aventurado o homem" }]);
});

test("fetchOnlineChapter: unknown chapter is empty, failures speak pt-BR", async () => {
    const reply = (status, body) => async () => ({ ok: status < 400, status, json: async () => body });
    const args = { api: "ara", slug: "salmos", chapter: 1 };
    assert.deepEqual(await fetchOnlineChapter(args, reply(404, {})), []);
    await assert.rejects(fetchOnlineChapter(args, reply(500, {})), /HTTP 500/);
    await assert.rejects(fetchOnlineChapter(args, async () => ({ ok: true, status: 200, json: async () => { throw new Error("x"); } })), /resposta inválida/);
    await assert.rejects(fetchOnlineChapter(args, async () => { throw new TypeError("fetch failed"); }), /Sem conexão/);
});

test("fetchOnlineChapter refuses parts that could change the URL", async () => {
    const never = async () => { throw new Error("no request expected"); };
    for (const args of [
        { api: "../x", slug: "salmos", chapter: 1 },
        { api: "ara", slug: "salmos/1?x=", chapter: 1 },
        { api: "ara", slug: "salmos", chapter: 0 },
        { api: "ara", slug: "salmos", chapter: "1/2" },
    ]) await assert.rejects(fetchOnlineChapter(args, never), /inválido/);
});
