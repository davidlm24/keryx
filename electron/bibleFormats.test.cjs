const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const yazl = require("yazl");
const { DatabaseSync } = require("node:sqlite");
const { readBible, bookOf, CODES, PT_NAMES, REFUSE } = require("./bibleFormats.cjs");
const { BOOK_NAMES } = require("./bible.cjs");

const FIX = path.join(__dirname, "fixtures", "bibles");
const fixture = (name) => fs.readFileSync(path.join(FIX, name));
const at = (verses, b, c, v) => verses.find((x) => x.b === b && x.c === c && x.v === v)?.text;
const zipOf = (files) => new Promise((resolve) => {
    const zip = new yazl.ZipFile();
    for (const [name, text] of Object.entries(files)) zip.addBuffer(Buffer.from(text), name);
    zip.end();
    const parts = [];
    zip.outputStream.on("data", (c) => parts.push(c)).on("end", () => resolve(Buffer.concat(parts)));
});

test("the book table has the 66 books, in the order bible.cjs names them", () => {
    assert.equal(CODES.length, 66);
    assert.deepEqual(PT_NAMES, BOOK_NAMES);
    // Every code of every scheme lands on its own book, never on another's.
    CODES.forEach((codes, i) => codes.forEach((code) => assert.equal(bookOf(code), i + 1, code)));
    for (const [code, n] of [["JHN", 43], ["JOH", 43], ["John", 43], ["João", 43], ["joao", 43], ["JUD", 65], ["JDG", 7], ["PHP", 50], ["PHI", 50], ["SNG", 22], ["SOL", 22], ["1 Samuel", 9], ["1Sam", 9], ["Ps", 19]]) assert.equal(bookOf(code), n, code);
    for (const deutero of ["TOB", "JDT", "1MA", "SIR", "WIS", "BAR", "ESG", "DAG", "PSX", "Tob"]) assert.equal(bookOf(deutero), null, deutero);
});

test("USFM: books by \\id, verses by \\c/\\v, footnotes and cross references out, words of \\w kept", async () => {
    const r = await readBible(fixture("sample.usfm"), "sample.usfm");
    assert.equal(r.format, "USFM");
    assert.equal(at(r.verses, 1, 1, 1), "No princípio criou Deus os céus e a terra.");
    assert.equal(at(r.verses, 1, 1, 2), "E a terra era sem forma e vazia; e o Espírito de Deus se movia sobre a face das águas.");
    assert.equal(at(r.verses, 1, 2, 1), "Assim os céus, a terra e todo o seu exército foram acabados.");
    assert.equal(at(r.verses, 43, 3, 16), "Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito,");
    assert.equal(at(r.verses, 43, 3, 17), "Porque Deus enviou o seu Filho ao mundo.");
    // No heading, title or deuterocanonical book leaks in.
    assert.ok(r.verses.every((v) => v.b <= 66 && !/criação|Gênesis|Tobias|strong|nota/.test(v.text)));
    assert.equal(r.verses.length, 5);
    // Zipped, a book a file (as eBible.org and the Bible societies ship it).
    const text = fixture("sample.usfm").toString("utf8");
    const [gen, jhn] = text.split(/(?=^\\id JHN)/m);
    const z = await readBible(await zipOf({ "01GENpor.SFM": gen, "44JHNpor.SFM": jhn, "leia-me.htm": "<html></html>" }), "biblia_usfm.zip");
    assert.equal(z.format, "USFM");
    assert.equal(z.verses.length, 5);
});

test("VPL: a verse a line, any code or name, unknown books and lines left out", async () => {
    const r = await readBible(fixture("sample_vpl.txt"), "sample_vpl.txt");
    assert.equal(r.format, "Texto por versículo (VPL)");
    assert.deepEqual(r.verses.map((v) => [v.b, v.c, v.v]), [[1, 1, 1], [1, 1, 2], [43, 3, 16], [9, 3, 4]]);
    assert.equal(at(r.verses, 9, 3, 4), "E o Senhor chamou Samuel.");
    // eBible.org's zip: the _vpl.txt among its about page, SQL and XML.
    const z = await readBible(await zipOf({ "x_about.htm": "<html/>", "x_vpl.sql": "INSERT", "x_vpl.txt": fixture("sample_vpl.txt").toString() }), "x_vpl.zip");
    assert.equal(z.verses.length, 4);
    // eBible's _vpl.xml says the same.
    const xml = await readBible(Buffer.from('﻿<?xml version="1.0"?><verseFile><v b="GEN" c="1" v="1">No princípio. </v><v b="JHN" c="3" v="16">Porque Deus amou. </v></verseFile>'), "x_vpl.xml");
    assert.deepEqual(xml.verses, [{ b: 1, c: 1, v: 1, text: "No princípio." }, { b: 43, c: 3, v: 16, text: "Porque Deus amou." }]);
});

test("OSIS: container verses and milestones, notes and titles out, its language read", async () => {
    const r = await readBible(fixture("sample.osis.xml"), "biblia.xml");
    assert.equal(r.format, "OSIS XML");
    assert.equal(r.language, "Português");
    assert.equal(at(r.verses, 1, 1, 1), "No princípio criou Deus os céus e a terra.");
    assert.equal(at(r.verses, 43, 3, 16), "Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito.");
    assert.equal(at(r.verses, 43, 3, 17), "Porque Deus enviou o seu Filho ao mundo.");
    assert.equal(r.verses.length, 4);
});

test("Zefania: books by number, notes out, styles keep their words, past 66 left out", async () => {
    const r = await readBible(fixture("sample.zefania.xml"), "biblia.xml");
    assert.equal(r.format, "Zefania XML");
    assert.equal(r.language, "Português");
    assert.equal(r.title, "Bíblia Zefania de Exemplo");
    assert.equal(at(r.verses, 1, 1, 2), "E a terra era sem forma e vazia.");
    assert.equal(at(r.verses, 43, 3, 16), "Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito.");
    assert.equal(r.verses.length, 3);
});

test("MySword: the Bible table, GBF tags out, Details read", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "keryx-mysword-"));
    const file = path.join(dir, "bkj.bbl.mybible");
    const db = new DatabaseSync(file);
    db.exec("CREATE TABLE Details (Title TEXT, Abbreviation TEXT, Language TEXT); CREATE TABLE Bible (Book INT, Chapter INT, Verse INT, Scripture TEXT)");
    db.prepare("INSERT INTO Details VALUES (?, ?, ?)").run("Bíblia de Exemplo 1611", "BKJ", "por");
    const ins = db.prepare("INSERT INTO Bible VALUES (?, ?, ?, ?)");
    ins.run(1, 1, 1, "<TS>A criação<Ts>No princípio<WH7225> criou Deus<WH430> os céus e a terra.<CM>");
    ins.run(43, 3, 16, "Porque Deus amou o mundo<RF>Nota de rodapé<Rf> de tal maneira que deu o seu <FI>Filho<Fi> unigênito.");
    ins.run(67, 1, 1, "Tobias");
    db.close();
    const r = await readBible(fs.readFileSync(file), "bkj.bbl.mybible");
    fs.rmSync(dir, { recursive: true, force: true });
    assert.equal(r.format, "MySword");
    assert.equal(r.language, "Português");
    assert.equal(r.abbrev, "BKJ");
    assert.equal(at(r.verses, 1, 1, 1), "No princípio criou Deus os céus e a terra.");
    assert.equal(at(r.verses, 43, 3, 16), "Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito.");
    assert.equal(r.verses.length, 2);
    // Another SQLite file is not a Bible.
    const other = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "keryx-sqlite-")), "x.db");
    const o = new DatabaseSync(other); o.exec("CREATE TABLE notes (x TEXT)"); o.close();
    await assert.rejects(readBible(fs.readFileSync(other), "x.db"), /não é uma Bíblia do MySword/);
});

test("the JSON shapes KERYX always took still read (thiagobodruk, bolls.life)", async () => {
    const books = Array.from({ length: 66 }, (_, b) => ({ chapters: [[`livro ${b + 1}`]] }));
    const r = await readBible(Buffer.from("﻿" + JSON.stringify(books)), "nvi.json");
    assert.equal(r.format, "JSON (thiagobodruk)");
    assert.equal(r.verses.length, 66);
    const bolls = await readBible(await zipOf({ "ARA.json": JSON.stringify([{ book: 43, chapter: 3, verse: 16, text: "Porque Deus<sup>a</sup> amou" }, { book: 70, chapter: 1, verse: 1, text: "x" }]) }), "ARA.zip");
    assert.equal(bolls.format, "JSON (bolls.life)");
    assert.deepEqual(bolls.verses, [{ b: 43, c: 3, v: 16, text: "Porque Deus amou" }]);
});

test("PDF, Word and e-Sword are refused with what to do; an unknown file too", async () => {
    await assert.rejects(readBible(Buffer.from("%PDF-1.7 ..."), "bkj.pdf"), (e) => e.message === REFUSE.pdf);
    await assert.rejects(readBible(Buffer.from("x"), "bkj.docx"), (e) => e.message === REFUSE.pdf);
    await assert.rejects(readBible(await zipOf({ "word/document.xml": "<w/>" }), "sem-extensao"), (e) => e.message === REFUSE.pdf);
    await assert.rejects(readBible(Buffer.from("SQLite format 3\0"), "kjv.bblx"), (e) => e.message === REFUSE.esword && /cifrados/.test(e.message));
    await assert.rejects(readBible(Buffer.from("apenas um texto qualquer"), "notas.txt"), (e) => e.message === REFUSE.unknown);
    await assert.rejects(readBible(Buffer.from("<html><body>x</body></html>"), "pagina.xml"), (e) => e.message === REFUSE.unknown);
});

test("an old file in Windows-1252 reads its accents; a file says nothing of its language: guessed", async () => {
    const latin = Buffer.from("GEN 1:1 No princípio criou Deus os céus e a terra.\n", "latin1");
    const r = await readBible(latin, "antiga.txt");
    assert.equal(r.verses[0].text, "No princípio criou Deus os céus e a terra.");
    const lines = Array.from({ length: 60 }, (_, i) => `GEN 1:${i + 1} E disse Deus que a luz de Deus não se apague para o povo e o mundo.`).join("\n");
    assert.equal((await readBible(Buffer.from(lines), "x.txt")).language, "Português");
    assert.equal((await readBible(fixture("sample_vpl.txt"), "x.txt")).language, null);
});
