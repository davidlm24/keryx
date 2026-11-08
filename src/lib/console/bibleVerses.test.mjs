import test from "node:test";
import assert from "node:assert/strict";
import { rangeLabel, groupVerses, referenceNums, passageOf, chapterOf, chapterOnAir, airVerse, airPassage, slideWithVerse, verseNear, airStyle } from "./bibleVerses.js";

const verses = [1, 2, 3, 4, 5].map((n) => ({ number: n, text: `texto ${n}` }));
const at = { version: "NVI", book: "João", chapter: 3 };

test("ranges read as the reference does", () => {
    assert.equal(rangeLabel([5, 3, 4, 9]), "3-5,9");
    assert.equal(rangeLabel([16]), "16");
    assert.equal(rangeLabel([]), "");
});

test("verses group per slide: by count, or by length", () => {
    assert.deepEqual(groupVerses(verses.slice(0, 3), "2").map((s) => s.label), ["v. 1–2", "v. 3"]);
    assert.equal(groupVerses(verses, "1").length, 5);
    const long = [{ number: 1, text: "a".repeat(200) }, { number: 2, text: "b".repeat(50) }];
    assert.equal(groupVerses(long, "auto").length, 2);
    assert.equal(groupVerses(verses, "auto").length, 1);
});

test("a parsed reference names its verses; a chapter names none", () => {
    assert.deepEqual(referenceNums({ verseStart: 16, verseEnd: 18 }), [16, 17, 18]);
    assert.deepEqual(referenceNums({ verseStart: 16 }), [16]);
    assert.deepEqual(referenceNums({ verseStart: null }), []);
});

test("several verses are that passage, with the version in its reference", () => {
    const p = passageOf({ verses, nums: [2, 3], how: "1", ...at });
    assert.equal(p.reference, "João 3:2-3 · NVI");
    assert.equal(p.verses, "2-3");
    assert.deepEqual(p.slides.map((s) => s.text), ["2 texto 2", "3 texto 3"]);
    assert.equal(passageOf({ verses, nums: [9], ...at }), null);
    assert.equal(passageOf({ verses, nums: [2], ...at, version: null }), null);
});

test("one verse is its whole chapter, starting there", () => {
    const ch = chapterOf({ verses, n: 4, ...at });
    assert.equal(ch.title, "João 3:4");
    assert.equal(ch.index, 3);
    assert.equal(ch.passage.slides.length, 5);
    assert.equal(ch.passage.slides[3].ref, "João 3:4 · NVI");
    assert.deepEqual(ch.ref, { book: "João", chapter: 3, version: "NVI", how: "1", wholeChapter: true });
    assert.equal(chapterOf({ verses, n: 40, ...at }), null);
});

test("the chapter on air is recognised only in the same version", () => {
    const onAir = { ref: { wholeChapter: true, book: "João", chapter: "3", version: "NVI" } };
    assert.equal(chapterOnAir(onAir, at), true);
    assert.equal(chapterOnAir(onAir, { ...at, version: "ARA" }), false);
    assert.equal(chapterOnAir({ ref: { book: "João", chapter: 3, version: "NVI" } }, at), false);
    assert.equal(chapterOnAir(null, at), false);
});

// Rodada P (P2-2): a second edition on screen, joined to each slide by verse number.
const nvi = [1, 2, 3, 5].map((n) => ({ number: n, text: `outra ${n}` }));
const pair = { version: "ACF", verses: nvi };

test("a second edition rides each slide by verse number, with its sigla", () => {
    const s = groupVerses(verses.slice(0, 4), "2", pair);
    assert.deepEqual(s.map((x) => x.pair), [{ text: "1 outra 1 2 outra 2", version: "ACF" }, { text: "3 outra 3", version: "ACF" }], "verse 4 is not in it: left out");
    assert.equal(groupVerses([verses[3]], "1", pair)[0].pair, undefined, "a slide with none of its verses has no pair");
    assert.equal(groupVerses(verses, "1")[0].pair, undefined, "no second edition: as before");
    assert.equal(groupVerses(verses, "1", { version: "ACF", verses: [] })[0].pair, undefined);
});

test("with two editions, auto puts half as much on a slide", () => {
    const mid = [{ number: 1, text: "a".repeat(90) }, { number: 2, text: "b".repeat(60) }];
    assert.equal(groupVerses(mid, "auto").length, 1);
    assert.equal(groupVerses(mid, "auto", { version: "ACF", verses: mid }).length, 2);
});

test("a passage and a chapter carry the second edition; the same edition twice is one", () => {
    const p = passageOf({ verses, nums: [2, 3], how: "1", ...at, pair });
    assert.deepEqual(p.slides.map((s) => s.pair?.text), ["2 outra 2", "3 outra 3"]);
    assert.equal(p.reference, "João 3:2-3 · NVI", "the reference stays the first edition's");
    assert.equal(passageOf({ verses, nums: [2, 3], how: "1", ...at, pair: { version: "NVI", verses: nvi } }).slides[0].pair, undefined);
    const ch = chapterOf({ verses, n: 2, ...at, pair });
    assert.equal(ch.id, "chapter:João:3:NVI+ACF");
    assert.equal(ch.ref.version2, "ACF");
    assert.deepEqual(ch.passage.slides[4].pair, { text: "5 outra 5", version: "ACF" });
    assert.equal(ch.passage.slides[3].pair, undefined);
    assert.equal(chapterOf({ verses, n: 2, ...at, pair: { version: "NVI", verses: nvi } }).ref.version2, undefined);
});

test("the chapter on air is the same only with the same second edition", () => {
    const one = { ref: { wholeChapter: true, book: "João", chapter: 3, version: "NVI" } };
    const two = { ref: { ...one.ref, version2: "ACF" } };
    assert.equal(chapterOnAir(one, { ...at, version2: "" }), true);
    assert.equal(chapterOnAir(one, { ...at, version2: "ACF" }), false, "a second edition asked for: sent again");
    assert.equal(chapterOnAir(two, { ...at, version2: "ACF" }), true);
    assert.equal(chapterOnAir(two, at), false, "the second edition taken away: sent again");
    assert.equal(chapterOnAir(one, { ...at, version2: "NVI" }), true, "the same edition twice is one");
});

// The bar's fix (owner 2026-10-22): 1/2/3 group the chapter too, and the
// bar's changes reach what is on air at once.
const ten = Array.from({ length: 10 }, (_, i) => ({ number: i + 1, text: `texto ${i + 1}` }));

test("a chapter is grouped as asked, the verse chosen at the start of the slide shown", () => {
    const ch = chapterOf({ verses: ten, n: 4, how: "2", ...at });
    assert.deepEqual(ch.passage.slides.map((s) => s.label), ["v. 1–2", "v. 3", "v. 4–5", "v. 6–7", "v. 8–9", "v. 10"]);
    assert.equal(ch.index, 2, "verse 4's slide is the one shown");
    assert.equal(ch.passage.slides[2].ref, "João 3:4-5 · NVI", "each slide's reference names its verses");
    assert.equal(ch.ref.how, "2");
    assert.deepEqual(chapterOf({ verses: ten, n: 1, how: "3", ...at }).passage.slides.map((s) => s.label), ["v. 1–3", "v. 4–6", "v. 7–9", "v. 10"]);
    assert.equal(chapterOf({ verses: ten, n: 1, how: "auto", ...at }).passage.slides.length, 1, "auto: as groupVerses decides");
    assert.equal(chapterOf({ verses: ten, n: 1, how: "x", ...at }).ref.how, "1", "anything else is one a slide");
});

test("the chapter on air is sent again when its grouping or the church's display changed", () => {
    const onAir = { ref: { wholeChapter: true, book: "João", chapter: 3, version: "NVI", how: "2" }, style: {} };
    assert.equal(chapterOnAir(onAir, { ...at, how: "2" }), true);
    assert.equal(chapterOnAir(onAir, { ...at, how: "1" }), false);
    assert.equal(chapterOnAir({ ref: { ...onAir.ref, how: undefined } }, { ...at, how: "1" }), true, "sent before: one a slide");
    const look = { ref_line: null, pair: null };
    assert.equal(chapterOnAir(onAir, { ...at, how: "2", look }), true);
    assert.equal(chapterOnAir(onAir, { ...at, how: "2", look: { ...look, ref_line: "none" } }), false, "Ref. turned off");
    assert.equal(chapterOnAir({ ...onAir, style: { ref_line: "none" } }, { ...at, how: "2", look }), false, "Ref. turned on");
    const two = { ref: { ...onAir.ref, version2: "ACF" }, style: {} };
    assert.equal(chapterOnAir(two, { ...at, version2: "ACF", how: "2", look }), true);
    assert.equal(chapterOnAir(two, { ...at, version2: "ACF", how: "2", look: { ...look, pair: "stack" } }), false, "Empilhadas");
    assert.equal(chapterOnAir(onAir, { ...at, how: "2", look: { ...look, pair: "stack" } }), true, "one edition: its place does not matter");
});

test("what is on air: the verse its slide starts with, and what can be rebuilt", () => {
    const ch = chapterOf({ verses: ten, n: 4, how: "2", ...at });
    const content = { kind: "bible", ref: { reference: "João 3 · NVI", passageId: null, ...ch.ref }, slides: ch.passage.slides, index: 2 };
    assert.equal(airVerse(content), 4);
    assert.deepEqual(airPassage(content), { book: "João", chapter: 3, nums: null, verse: 4 });
    assert.deepEqual(airPassage({ ...content, index: 3 }).verse, 6);
    const range = { kind: "bible", ref: { book: "João", chapter: 3, version: "NVI", how: "1", nums: [2, 3] }, slides: [{ text: "2 a" }, { text: "3 b" }], index: 1 };
    assert.deepEqual(airPassage(range), { book: "João", chapter: 3, nums: [2, 3], verse: 3 });
    assert.equal(airPassage({ kind: "bible", ref: { reference: "João 3:16 · NVI", passageId: "p1" }, slides: [{ text: "16 a" }], index: 0 }), null, "a Setlist passage keeps its slides");
    assert.equal(airPassage({ kind: "lyrics", ref: ch.ref, slides: [], index: 0 }), null);
});

test("regrouped, the verse on air stays on screen", () => {
    const by3 = chapterOf({ verses: ten, n: 1, how: "3", ...at }).passage.slides;
    assert.equal(slideWithVerse(by3, 5), 1);
    assert.equal(slideWithVerse(by3, 10), 3);
    assert.equal(slideWithVerse([{ text: "1 a" }, { text: "4 b" }], 2), 1, "missing: the first slide past it");
    assert.equal(slideWithVerse([{ text: "1 a" }], 9), 0);
    assert.equal(verseNear(ten, 4), 4);
    assert.equal(verseNear(ten.filter((v) => v.number !== 4), 4), 5);
    assert.equal(verseNear(ten, 40), 10);
});

test("the style on air takes the reference line and the second edition's place", () => {
    const style = { font_size: "large", ref_line: "plain", pair: "stack" };
    assert.deepEqual(airStyle(style, { ref_line: "none", pair: null }, true), { font_size: "large", ref_line: "none" });
    assert.deepEqual(airStyle(style, { ref_line: null, pair: "stack" }, true), { font_size: "large", pair: "stack" });
    assert.deepEqual(airStyle(style, { ref_line: null, pair: "stack" }, false), { font_size: "large" }, "one edition: no place");
});

test("fit: Auto groups by the theme's measure, not a fixed count", () => {
    const vs = [1, 2, 3, 4, 5, 6].map((n) => ({ number: n, text: "x".repeat(70) }));
    assert.equal(groupVerses(vs, "auto").length, 2, "220: three verses a slide");
    assert.equal(groupVerses(vs, "auto", null, { limit: 100 }).length, 6, "a big theme: one a slide");
    assert.equal(groupVerses(vs, "auto", null, { limit: 500 }).length, 1, "a small theme: all in one");
});

test("fit.split: a slide longer than the theme holds is cut into pieces (1/2)", () => {
    const long = "E até nomeou profetas para fazerem em Jerusalém a seguinte proclamação a seu respeito: “Há um rei em Judá!” Ora, essa informação será levada ao rei. Por isso, é bom que venha depressa e esclareçamos este assunto!";
    const vs = [{ number: 7, text: long }];
    assert.equal(groupVerses(vs, "1", null, { limit: 100 }).length, 1, "Diminuir a letra: one slide, the screen shrinks it");
    const cut = groupVerses(vs, "1", null, { limit: 100, split: true });
    assert.ok(cut.length >= 2, "Dividir: pieces");
    assert.ok(cut.every((s) => s.text.length <= 100));
    assert.equal(cut[0].label, `v. 7 (1/${cut.length})`);
    assert.ok(cut[0].text.startsWith("7 "), "the verse mark on the first piece");
    assert.equal(cut.map((s) => s.text).join(" "), `7 ${long}`, "nothing lost");
    // Never with a second edition: the two would split apart.
    const pair = { version: "ARA", verses: [{ number: 7, text: "outra" }] };
    assert.equal(groupVerses(vs, "1", pair, { limit: 100, split: true }).length, 1);
});

test("fit in a chapter: the verse chosen still starts the slide shown; a new measure is sent again", () => {
    const vs = [1, 2, 3, 4].map((n) => ({ number: n, text: "palavra ".repeat(19).trim() }));
    const ch = chapterOf({ verses: vs, n: 3, how: "1", version: "NVI", book: "Neemias", chapter: 6, fit: { limit: 90, split: true } });
    assert.ok(ch.passage.slides[ch.index].text.startsWith("3 "), "the slide shown starts with verse 3");
    assert.equal(ch.ref.limit, 90);
    const onAir = { ref: ch.ref, style: {} };
    assert.equal(chapterOnAir(onAir, { book: "Neemias", chapter: 6, version: "NVI", how: "1", fit: { limit: 90, split: true } }), true);
    assert.equal(chapterOnAir(onAir, { book: "Neemias", chapter: 6, version: "NVI", how: "1", fit: { limit: 200, split: true } }), false, "another theme: sent again");
    assert.equal(chapterOnAir(onAir, { book: "Neemias", chapter: 6, version: "NVI", how: "1", fit: { limit: 90, split: false } }), false);
});
