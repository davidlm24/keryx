import test from "node:test";
import assert from "node:assert/strict";
import { readQuickRef, quickRefLabel } from "./quickRef.js";

const names = (r) => r.candidates.map((c) => c.name);

test("one letter lists the books, no book chosen yet", () => {
    const r = readQuickRef("j");
    assert.equal(r.step, "livro");
    assert.equal(r.book, null);
    for (const n of ["Josué", "Juízes", "Jó", "Jeremias", "Joel", "Jonas", "João", "Judas"]) assert.ok(names(r).includes(n), n);
    assert.ok(!names(r).includes("Gênesis"));
});

test("short forms and accents", () => {
    assert.equal(readQuickRef("jo").book.name, "João", "Jo is João");
    assert.equal(readQuickRef("jó").book.name, "Jó");
    assert.equal(readQuickRef("exo").book.name, "Êxodo", "accent optional");
    assert.equal(readQuickRef("gen").book.name, "Gênesis");
    assert.equal(readQuickRef("1co").book.name, "1 Coríntios");
    assert.equal(readQuickRef("1 sam").book.name, "1 Samuel");
    assert.equal(readQuickRef("sl").book.name, "Salmos");
    assert.equal(readQuickRef("xyz").error, "Livro não reconhecido");
});

test("chapter, then verse, then range", () => {
    let r = readQuickRef("jo 3");
    assert.equal(r.step, "capitulo");
    assert.equal(r.chapter, 3);
    assert.ok(r.valid, "a whole chapter can be opened");
    assert.equal(readQuickRef("jo3").chapter, 3, "no space needed");
    assert.equal(readQuickRef("jo 3 ").step, "versiculo", "a separator moves on");
    assert.equal(readQuickRef("jo 3:").step, "versiculo");
    r = readQuickRef("jo 3 16");
    assert.equal(r.verseStart, 16);
    assert.equal(r.verseEnd, null);
    r = readQuickRef("jo 3:16-18");
    assert.deepEqual([r.verseStart, r.verseEnd], [16, 18]);
    assert.equal(quickRefLabel(r), "João 3:16-18");
    r = readQuickRef("1co 13 4-7");
    assert.equal(quickRefLabel(r), "1 Coríntios 13:4-7");
});

test("out of range is an error, a long range is trimmed", () => {
    assert.match(readQuickRef("sl 151").error, /150 capítulos/);
    assert.equal(readQuickRef("sl 151").valid, false);
    assert.match(readQuickRef("jo 3 99").error, /36 versículos/);
    assert.equal(readQuickRef("jo 3 16-99").verseEnd, 36);
    assert.equal(readQuickRef("jo 3 16-2").verseEnd, 16, "an end before the start is the start");
});
