const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createStore } = require("./db/store.cjs");
const schema = require("./db/schema.json");
const yazl = require("yazl");
const {
    BOOK_NAMES, SOURCES, parseBibleJson, installFromJson, installFromFile, installFromSource, fetchOnlineChapter, installedVersions, verseId, cleanVerse,
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

// A bolls.life edition: [{ book, chapter, verse, text }], enough verses to
// pass for a whole Bible (66 books × 310), with the source's markup in John 3:16.
function fakeBolls(code = "ARA", { perBook = 310 } = {}) {
    const out = [];
    for (let book = 1; book <= 66; book++) {
        for (let verse = 1; verse <= perBook; verse++) {
            const chapter = Math.ceil(verse / 31);
            const v = ((verse - 1) % 31) + 1;
            const text = book === 43 && chapter === 3 && v === 16
                ? "Porque Deus amou o mundo<sup>ⓢ</sup> de tal maneira que deu o seu <i>Filho</i> unigênito"
                : `${code} ${book} ${chapter}:${v}`;
            out.push({ pk: out.length, translation: code, book, chapter, verse: v, text });
        }
    }
    // A deuterocanonical book (past 66) is left out.
    out.push({ pk: -1, translation: code, book: 67, chapter: 1, verse: 1, text: "Tobias" });
    return out;
}
const zipOf = (name, text) => new Promise((resolve) => {
    const zip = new yazl.ZipFile();
    zip.addBuffer(Buffer.from(text), name);
    zip.end();
    const parts = [];
    zip.outputStream.on("data", (c) => parts.push(c)).on("end", () => resolve(Buffer.concat(parts)));
});

test("every edition the UI offers installs, from the source bible.cjs knows", async () => {
    const { BIBLE_VERSIONS } = await import(pathToFileURL(path.join(__dirname, "..", "src", "lib", "bibleBooks.js")).href);
    assert.deepEqual(Object.keys(SOURCES), BIBLE_VERSIONS.map((v) => v.id));
    assert.ok(BIBLE_VERSIONS.every((v) => v.install));
    // An edition read online from bolls.life installs from bolls.life under the same code (ACF installs from github).
    for (const v of BIBLE_VERSIONS.filter((x) => x.online && SOURCES[x.id].bolls)) assert.equal(SOURCES[v.id].bolls, v.online, v.id);
    assert.throws(() => installFromJson(fresh(), "BKJ1611", JSON.stringify(fakeBible())), /não pode ser instalada/);
});

test("cleanVerse: the source's markup goes, footnote marks with their content, entities decoded", () => {
    assert.equal(cleanVerse("sabemos que o senhor é Mestre vindo da parte de Deus,<sup>ⓢ</sup> porque ninguém"), "sabemos que o senhor é Mestre vindo da parte de Deus, porque ninguém");
    assert.equal(cleanVerse("E disse: <i>Faça-se a luz</i>."), "E disse: Faça-se a luz.");
    assert.equal(cleanVerse("No princípio<S>7225</S> criou Deus<br/>os céus"), "No princípio criou Deus os céus");
    assert.equal(cleanVerse("&quot;Eu sou&quot; &amp; o &#8220;caminho&#8221;&nbsp;"), "\"Eu sou\" & o “caminho”");
    assert.equal(cleanVerse("  só   texto  "), "só texto");
    assert.equal(cleanVerse(null), "");
});

test("a bolls.life edition installs from its JSON, its zip, or the download", async () => {
    const s = fresh();
    const json = JSON.stringify(fakeBolls("ARA"));
    const r = installFromJson(s, "ARA", json);
    assert.equal(r.verses, 66 * 310);
    const jo = s.call("BibleVerse", "get", [verseId("ARA", 42, 3, 16)]);
    assert.equal(jo.book, "João");
    assert.equal(jo.testament, "Novo");
    assert.equal(jo.text, "Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito");
    assert.equal(s.call("BibleVerse", "filter", [{ version: "ARA", book: "Gênesis", chapter: 1 }]).length, 31);

    // The zip picked on disk ("Do arquivo…").
    const t = fresh();
    const fromZip = await installFromFile(t, "NAA", await zipOf("NAA.json", JSON.stringify(fakeBolls("NAA"))));
    assert.equal(fromZip.verses, 66 * 310);
    // The github JSON still installs from a file too.
    assert.equal((await installFromFile(t, "NVI", Buffer.from(JSON.stringify(fakeBible())))).version, "NVI");

    // The download: bolls.life's zip.
    let seen;
    const u = fresh();
    const zip = await zipOf("ARC09.json", JSON.stringify(fakeBolls("ARC09")));
    const ok = await installFromSource(u, "ARC", async (url) => { seen = url; return { ok: true, status: 200, arrayBuffer: async () => zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.length) }; });
    assert.equal(seen, "https://bolls.life/static/translations/ARC09.zip");
    assert.equal(ok.verses, 66 * 310);
    assert.deepEqual(installedVersions(u), { ARC: 66 * 310 });
});

test("a bolls.life file that is not a whole Bible, or not a zip, is refused", async () => {
    assert.throws(() => installFromJson(fresh(), "ARA", JSON.stringify(fakeBolls("ARA", { perBook: 20 }))), /não parece uma Bíblia inteira/);
    await assert.rejects(installFromFile(fresh(), "ARA", Buffer.from("PK broken zip")), /zip válido/);
    await assert.rejects(installFromFile(fresh(), "ARA", await zipOf("leia-me.txt", "x")), /não reconheceu este arquivo/);
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

test("fetchOnlineChapter reads bolls.life's chapter, without its markup", async () => {
    let seen;
    const fetchImpl = async (url) => {
        seen = url;
        return { ok: true, status: 200, json: async () => [{ pk: 1, verse: 1, text: " Bem-aventurado o homem<sup>a</sup> " }, { verse: "x", text: "ignorado" }, { verse: 2 }, { verse: 3, text: "<sup>b</sup>" }] };
    };
    const verses = await fetchOnlineChapter({ code: "ARA", book: 19, chapter: 1 }, fetchImpl);
    assert.equal(seen, "https://bolls.life/get-text/ARA/19/1/");
    assert.deepEqual(verses, [{ number: 1, text: "Bem-aventurado o homem" }]);
});

test("fetchOnlineChapter: unknown chapter is empty, failures speak pt-BR", async () => {
    const reply = (status, body) => async () => ({ ok: status < 400, status, json: async () => body });
    const args = { code: "ARA", book: 19, chapter: 1 };
    assert.deepEqual(await fetchOnlineChapter(args, reply(404, {})), []);
    assert.deepEqual(await fetchOnlineChapter(args, reply(200, { detail: "Not found" })), []);
    await assert.rejects(fetchOnlineChapter(args, reply(503, {})), /HTTP 503/);
    await assert.rejects(fetchOnlineChapter(args, async () => ({ ok: true, status: 200, json: async () => { throw new Error("x"); } })), /resposta inválida/);
    await assert.rejects(fetchOnlineChapter(args, async () => { throw new TypeError("fetch failed"); }), /Sem conexão/);
});

test("fetchOnlineChapter refuses parts that could change the URL", async () => {
    const never = async () => { throw new Error("no request expected"); };
    for (const args of [
        { code: "../x", book: 19, chapter: 1 },
        { code: "ara", book: 19, chapter: 1 },
        { code: "ARA", book: "19/1?x=", chapter: 1 },
        { code: "ARA", book: 67, chapter: 1 },
        { code: "ARA", book: 19, chapter: 0 },
        { code: "ARA", book: 19, chapter: "1/2" },
    ]) await assert.rejects(fetchOnlineChapter(args, never), /inválido/);
});
