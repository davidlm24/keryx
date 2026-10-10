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
