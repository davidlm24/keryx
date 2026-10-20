// The open editions from eBible.org and the editions of the church's own
// (owner 2026-10-20, the "Bíblias" mockup).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const yazl = require("yazl");
const { createStore } = require("./db/store.cjs");
const schema = require("./db/schema.json");
const { CODES } = require("./bibleFormats.cjs");
const {
    SOURCES, MIN_NT_VERSES, siglaProblem, createOwnInstaller, ownEditions, installFromSource, installFromFile, installedVersions, verseId,
} = require("./bible.cjs");

const fresh = () => createStore({ file: ":memory:", schema, log: () => {} });
const zipOf = (name, text) => new Promise((resolve) => {
    const zip = new yazl.ZipFile();
    zip.addBuffer(Buffer.from(text), name);
    zip.end();
    const parts = [];
    zip.outputStream.on("data", (c) => parts.push(c)).on("end", () => resolve(Buffer.concat(parts)));
});
// eBible.org's _vpl.txt: "GEN 1:1 text" lines (66 books × perBook, or a range of books).
function fakeVpl({ books = [1, 66], perBook = 310 } = {}) {
    const lines = [];
    for (let b = books[0]; b <= books[1]; b++) {
        for (let n = 1; n <= perBook; n++) {
            const c = Math.ceil(n / 31), v = ((n - 1) % 31) + 1;
            lines.push(`${CODES[b - 1][1]} ${c}:${v} ${b === 43 && c === 3 && v === 16 ? "Porque Deus amou o mundo" : `texto ${b} ${n}`}`);
        }
    }
    lines.push("TOB 1:1 Tobias fica de fora.");
    return lines.join("\n");
}
const vplZip = (id, opts) => zipOf(`${id}_vpl.txt`, fakeVpl(opts));
const answer = (buf) => async () => ({ ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) });

test("the open editions install from eBible.org's _vpl.zip; the BLT is the New Testament only", async () => {
    const s = fresh();
    let seen;
    const zip = await vplZip("porbr2018");
    const r = await installFromSource(s, "BLIVRE", async (url) => { seen = url; return answer(zip)(); });
    assert.equal(seen, "https://ebible.org/Scriptures/porbr2018_vpl.zip");
    assert.equal(r.verses, 66 * 310);
    assert.equal(s.call("BibleVerse", "get", [verseId("BLIVRE", 42, 3, 16)]).text, "Porque Deus amou o mundo");
    const ebible = Object.fromEntries(Object.entries(SOURCES).filter(([, v]) => v.ebible).map(([k, v]) => [k, v.ebible]));
    assert.deepEqual(ebible, { BLIVRE: "porbr2018", NBV: "poronbv", BPM: "porbrbsl", BLT: "porblt" });

    // The BLT: its own minimum, and too few New Testament verses are refused.
    const nt = await vplZip("porblt", { books: [40, 66], perBook: 300 });
    assert.equal((await installFromSource(s, "BLT", answer(nt))).verses, 27 * 300);
    assert.ok(27 * 300 >= MIN_NT_VERSES);
    await assert.rejects(installFromSource(s, "BLT", answer(await vplZip("porblt", { books: [40, 66], perBook: 100 }))), /Novo Testamento inteiro/);
    // A whole edition that came short is refused, never installed half-way.
    await assert.rejects(installFromSource(s, "NBV", answer(await vplZip("poronbv", { perBook: 50 }))), /não parece uma Bíblia inteira/);
    assert.equal(installedVersions(s).NBV, undefined);
});

test("reinstalling from another file leaves none of the old file's verses", async () => {
    const s = fresh();
    await installFromFile(s, "BPM", await vplZip("porbrbsl"), "porbrbsl_vpl.zip");
    await installFromFile(s, "BPM", await vplZip("porbrbsl", { perBook: 305 }), "porbrbsl_vpl.zip");
    assert.equal(installedVersions(s).BPM, 66 * 305);
});

test("siglaProblem: 2–8 letters or digits, none of the list's, none retired, the same in bibleBooks.js", async () => {
    const books = await import(pathToFileURL(path.join(__dirname, "..", "src", "lib", "bibleBooks.js")).href);
    const taken = [...Object.keys(SOURCES), "MINHA"];
    for (const s of ["BKJ", "bkj", " BKJ ", "B", "BKJ 1611", "BKJ-1611", "ABCDEFGHI", "NVI", "nvi", "MINHA", "BKJ1611", "AB12", "", null]) {
        assert.equal(siglaProblem(s, taken), books.siglaProblem(s, taken), String(s));
    }
    assert.equal(siglaProblem("BKJ", taken), null);
    assert.match(siglaProblem("NVI", taken), /Já existe uma edição com a sigla NVI/);
    assert.match(siglaProblem("BKJ1611", taken), /Já existe/);
    assert.match(siglaProblem("B K", taken), /2 a 8 letras ou números/);
});

test("an edition of the church's own: read, then installed only with the church's word, a sigla of its own", async () => {
    const s = fresh();
    const own = createOwnInstaller(s, { newToken: () => "t1" });
    const read = await own.read(await vplZip("bkj"), "C:\\Bíblias\\bkj1611_vpl.zip");
    assert.equal(read.token, "t1");
    assert.equal(read.file, "bkj1611_vpl.zip");
    assert.equal(read.format, "Texto por versículo (VPL)");
    assert.equal(read.books, 66);
    assert.equal(read.verses, 66 * 310);
    assert.equal(read.testament, "all");
    assert.deepEqual(read.samples.map((x) => x.ref), ["Gênesis 1:1", "João 3:16"]);
    assert.equal(read.samples[1].text, "Porque Deus amou o mundo");

    assert.throws(() => own.install({ token: "t1", sigla: "BKJ", name: "Bíblia King James Fiel 1611" }), /direito de usar/);
    assert.throws(() => own.install({ token: "t1", sigla: "ARA", name: "x", rights: true }), /sigla ARA/);
    assert.throws(() => own.install({ token: "t1", sigla: "BKJ", name: "  ", rights: true }), /Dê um nome/);
    assert.throws(() => own.install({ token: "outro", sigla: "BKJ", name: "x", rights: true }), { status: 409 });
    const done = own.install({ token: "t1", sigla: "bkj", name: "Bíblia King James Fiel 1611", rights: true });
    assert.deepEqual(done, { version: "BKJ", verses: 66 * 310, name: "Bíblia King James Fiel 1611" });
    assert.equal(installedVersions(s).BKJ, 66 * 310);
    const [row] = ownEditions(s);
    assert.equal(row.sigla, "BKJ");
    assert.equal(row.format, "Texto por versículo (VPL)");
    assert.equal(row.file_name, "bkj1611_vpl.zip");
    assert.equal(row.testament, "all");
    assert.equal(row.rights_confirmed, true);
    // The reading is spent: a second install asks for the file again.
    assert.throws(() => own.install({ token: "t1", sigla: "BKJ2", name: "x", rights: true }), { status: 409 });

    // A second own edition never takes the first one's sigla.
    await own.read(await vplZip("x"), "outra.zip");
    assert.throws(() => own.install({ token: "t1", sigla: "BKJ", name: "x", rights: true }), /sigla BKJ/);

    // Trocar o arquivo…: the same sigla, the new file's verses only.
    await own.read(await vplZip("nt", { books: [40, 66], perBook: 300 }), "bkj_nt.zip");
    assert.throws(() => own.install({ token: "t1", sigla: "BKJX", name: "x", rights: true, replace: "BKJ" }), /não muda/);
    own.install({ token: "t1", sigla: "BKJ", name: "BKJ (NT)", rights: true, replace: "BKJ" });
    assert.equal(installedVersions(s).BKJ, 27 * 300);
    assert.equal(ownEditions(s).length, 1);
    assert.equal(ownEditions(s)[0].testament, "nt");
    assert.equal(ownEditions(s)[0].name, "BKJ (NT)");

    // Excluir…: its verses and its row; an edition of the list is not the church's.
    assert.throws(() => own.remove("NVI"), { status: 404 });
    assert.deepEqual(own.remove("bkj"), { version: "BKJ", verses: 27 * 300 });
    assert.equal(installedVersions(s).BKJ, undefined);
    assert.equal(ownEditions(s).length, 0);
});

test("an own file that is not a Bible, or too short, is refused before anything is asked", async () => {
    const own = createOwnInstaller(fresh());
    await assert.rejects(own.read(Buffer.from("%PDF-1.4"), "bkj.pdf"), /não PDF nem Word/);
    await assert.rejects(own.read(Buffer.from("x"), "bkj.bblx"), /e-Sword/);
    await assert.rejects(own.read(await vplZip("x", { perBook: 20 }), "curta.zip"), /não parece uma Bíblia inteira/);
    // The New Testament alone is a reading of its own (the dialog warns).
    const nt = await own.read(await vplZip("x", { books: [40, 66], perBook: 300 }), "nt.zip");
    assert.equal(nt.testament, "nt");
    assert.deepEqual(nt.samples.map((x) => x.ref), ["Mateus 1:1", "João 3:16"]);
});

test("the store drops a computer's own rows at once, never a synced entity's", () => {
    const s = fresh();
    s.importRows("BibleVerse", [{ id: "X-01-001-001", version: "X", book: "Gênesis", chapter: 1, verse: 1, text: "a" }, { id: "Y-01-001-001", version: "Y", book: "Gênesis", chapter: 1, verse: 1, text: "b" }]);
    assert.equal(s.dropRows("BibleVerse", "version", "X"), 1);
    assert.deepEqual(installedVersions(s), { Y: 1 });
    assert.throws(() => s.dropRows("Song", "title", "x"), /sincronizada/);
    assert.throws(() => s.dropRows("BibleVerse", "nada", "x"), /não existe/);
});
