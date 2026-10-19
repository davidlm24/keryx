import test from "node:test";
import assert from "node:assert/strict";
import { readQuickRef, quickRefLabel, typeQuickRef, quickReference, referenceFrom } from "./quickRef.js";

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

// Types `keys` one at a time into the field, as the component does on each
// insertText; "\b" is a Backspace (never completes).
const typeKeys = (keys, start = null) => {
    let f = start || typeQuickRef(null, "", true);
    for (const k of keys) f = k === "\b" ? typeQuickRef(f, f.text.slice(0, -1), false) : typeQuickRef(f, f.text + k, true);
    return f;
};

test("unique: only one book starts with the letters", () => {
    assert.equal(readQuickRef("joã").unique, true);
    assert.equal(readQuickRef("joa").unique, true, "accents optional");
    // "jo" resolves to João by its short form, yet Josué, Jó, Joel and Jonas
    // still start so: not unique, or Joel and Jonas could never be typed.
    assert.equal(readQuickRef("jo").book.name, "João");
    assert.equal(readQuickRef("jo").unique, false);
    assert.equal(readQuickRef("jó").unique, false);
    assert.equal(readQuickRef("j").unique, false);
    assert.equal(readQuickRef("xyz").unique, false);
    assert.equal(readQuickRef("").unique, false);
    assert.equal(readQuickRef("sl").unique, true, "a short form counts");
    assert.equal(readQuickRef("1co").unique, true);
    assert.equal(readQuickRef("1c").unique, false, "1 Coríntios and 1 Crônicas");
});

test("typing completes the one book left, then the chapter", () => {
    let f = typeKeys("joã");
    assert.deepEqual(f, { text: "João ", typed: "joã" });
    assert.equal(readQuickRef(f.text).step, "capitulo");
    f = typeKeys("3 16", f);
    assert.equal(quickRefLabel(readQuickRef(f.text)), "João 3:16");
    // Joel and Jonas stay reachable through "jo".
    assert.equal(typeKeys("joe").text, "Joel ");
    assert.equal(typeKeys("jon").text, "Jonas ");
    assert.equal(typeKeys("jos").text, "Josué ");
    // Not yet one book: the letters stay as typed.
    assert.deepEqual(typeKeys("jo"), { text: "jo", typed: null });
    assert.equal(typeKeys("1co 13").text, "1 Coríntios 13");
    assert.equal(typeKeys("1 sa").text, "1 Samuel ");
    assert.equal(typeKeys("gn 1").text, "Gênesis 1");
});

test("letters that go on spelling the book are absorbed", () => {
    const f = typeKeys("joão 3 16");
    assert.equal(f.text, "João 3 16");
    assert.equal(quickRefLabel(readQuickRef(f.text)), "João 3:16");
    assert.equal(typeKeys("joao 3").text, "João 3", "without accents too");
    assert.equal(typeKeys("isaias 53").text, "Isaías 53");
    assert.equal(typeKeys("1 corintios 13 4-7").text, "1 Coríntios 13 4-7");
    assert.equal(typeKeys("salmos 23").text, "Salmos 23");
    assert.equal(typeKeys("sl 23").text, "Salmos 23", "the short form spelled on");
    // An insert of several characters at once (an IME, an automated typist):
    // what still spells the book goes, the rest follows the name.
    assert.deepEqual(typeQuickRef({ text: "João ", typed: "joã" }, "João o 3 16", true), { text: "João 3 16", typed: null });
    assert.deepEqual(typeQuickRef({ text: "João ", typed: "joã" }, "João o ", true), { text: "João ", typed: "joão " });
    // Past the name, a letter is typed as usual (and reads as an error).
    assert.equal(typeKeys("joãx").text, "João x");
    assert.equal(readQuickRef("João x").error, "Livro não reconhecido");
});

test("Backspace never completes", () => {
    let f = typeKeys("joel");
    assert.equal(f.text, "Joel ");
    f = typeKeys("\b\b\b", f);
    assert.deepEqual(f, { text: "Jo", typed: null });
    f = typeKeys("n", f);
    assert.equal(f.text, "Jonas ");
    assert.deepEqual(typeQuickRef({ text: "Joã", typed: null }, "Jo", false), { text: "Jo", typed: null });
});

test("an opening letter that is already one book opens on its name", () => {
    // The letter that opened the quick jump counts as typed.
    assert.deepEqual(typeQuickRef(null, "i", true), { text: "Isaías ", typed: "i" });
    assert.deepEqual(typeQuickRef(null, "z", true), { text: "Zacarias ", typed: "z" });
    assert.equal(typeKeys("saías 6", typeQuickRef(null, "i", true)).text, "Isaías 6");
    assert.equal(typeKeys("6", typeQuickRef(null, "z", true)).text, "Zacarias 6");
    // Several books: the letter stays; a digit opens as it is.
    assert.deepEqual(typeQuickRef(null, "j", true), { text: "j", typed: null });
    assert.deepEqual(typeQuickRef(null, "1", true), { text: "1", typed: null });
});

test("the smoke's path: j, then o 3 16", () => {
    // "jo" is not one book, so Space (the component's key) completes it.
    const f = typeKeys("o", typeQuickRef(null, "j", true));
    assert.deepEqual(f, { text: "jo", typed: null });
    const after = typeKeys(" 3 16", { text: "João ", typed: null });
    assert.equal(after.text.replace(/\s+/g, " "), "João 3 16");
});

// One reading for every field that takes a reference by hand (the palette,
// the controle remoto): "Jo 3:16" and the quick jump's "jo 3 16" alike.
test("referenceFrom reads a reference typed either way, a chapter alone included", () => {
    assert.deepEqual(referenceFrom("jo 3 16"), { book: "João", chapter: 3, verseStart: 16, verseEnd: 16 });
    assert.deepEqual(referenceFrom("Jo 3:16"), { book: "João", chapter: 3, verseStart: 16, verseEnd: 16 });
    assert.deepEqual(referenceFrom("  1co 13 4-7 "), { book: "1 Coríntios", chapter: 13, verseStart: 4, verseEnd: 7 });
    assert.deepEqual(referenceFrom("jo 3"), { book: "João", chapter: 3, verseStart: null, verseEnd: null });
    assert.deepEqual(quickReference("salmos 23 1"), { book: "Salmos", chapter: 23, verseStart: 1, verseEnd: 1 });
    assert.equal(referenceFrom("jo 99"), null);
    assert.equal(referenceFrom("jo 3 99"), null);
    assert.equal(referenceFrom(""), null);
    assert.equal(referenceFrom("xyz 3"), null);
});
