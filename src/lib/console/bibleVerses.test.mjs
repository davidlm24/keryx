import test from "node:test";
import assert from "node:assert/strict";
import { rangeLabel, groupVerses, referenceNums, passageOf, chapterOf, chapterOnAir } from "./bibleVerses.js";

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
    assert.deepEqual(ch.ref, { book: "João", chapter: 3, version: "NVI", wholeChapter: true });
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
