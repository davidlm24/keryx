import test from "node:test";
import assert from "node:assert/strict";
import { bibleBooks, findBook, parseReference, formatReference, editionPlan, readByPlan } from "./bibleBooks.js";

const ref = (book, chapter, verseStart = null, verseEnd = verseStart) => ({ book, chapter, verseStart, verseEnd });

test("the book table has 66 books and every chapter has verses", () => {
    assert.equal(bibleBooks.length, 66);
    for (const b of bibleBooks) {
        assert.equal(b.verses.length, b.chapters, b.name);
        assert.ok(b.verses.every((n) => n > 0), b.name);
    }
    assert.equal(bibleBooks.find((b) => b.name === "Levítico").verses[22], 44, "Lv 23 has 44 verses");
});

test("findBook: names, short forms, accents optional, unique prefixes", () => {
    assert.equal(findBook("João").name, "João");
    assert.equal(findBook("joao").name, "João");
    assert.equal(findBook("Jo").name, "João", "Jo is João");
    assert.equal(findBook("Jó").name, "Jó", "Jó is Jó");
    assert.equal(findBook("1co").name, "1 Coríntios");
    assert.equal(findBook("1 Co").name, "1 Coríntios");
    assert.equal(findBook("1 coríntios").name, "1 Coríntios");
    assert.equal(findBook("gen").name, "Gênesis");
    assert.equal(findBook("salmo").name, "Salmos");
    assert.equal(findBook("Cantares").name, "Cânticos");
    assert.equal(findBook("fil"), null, "Filipenses or Filemom: ambiguous");
    assert.equal(findBook("xyz"), null);
    assert.equal(findBook(""), null);
});

test("parseReference: verses, ranges, whole chapters, separators", () => {
    assert.deepEqual(parseReference("João 3:16"), ref("João", 3, 16));
    assert.deepEqual(parseReference("jo 3.16-18"), ref("João", 3, 16, 18));
    assert.deepEqual(parseReference("Jo3:16"), ref("João", 3, 16));
    assert.deepEqual(parseReference("1Co 13:4-7"), ref("1 Coríntios", 13, 4, 7));
    assert.deepEqual(parseReference("Sl 23"), ref("Salmos", 23));
    assert.deepEqual(parseReference("Sl 119:105"), ref("Salmos", 119, 105));
    assert.deepEqual(parseReference("Lv 23:44"), ref("Levítico", 23, 44));
    assert.deepEqual(parseReference("Rm 8:28–30"), ref("Romanos", 8, 28, 30), "en dash");
});

test("parseReference: out-of-range input is rejected, a long range is trimmed", () => {
    assert.equal(parseReference("Apocalipse 23"), null);
    assert.equal(parseReference("João 3:99"), null);
    assert.equal(parseReference("João 3:5-2"), null);
    assert.equal(parseReference("Filemom 1:30"), null);
    assert.equal(parseReference("João"), null);
    assert.equal(parseReference(""), null);
    assert.deepEqual(parseReference("João 3:35-99"), ref("João", 3, 35, 36));
});

test("formatReference", () => {
    assert.equal(formatReference(ref("João", 3, 16)), "João 3:16");
    assert.equal(formatReference(ref("João", 3, 16, 18)), "João 3:16-18");
    assert.equal(formatReference(ref("Salmos", 23)), "Salmos 23");
});

test("editions: installed here, else online with the installed one as fallback", () => {
    // ARA with NVI installed: ARA from the internet, NVI when it fails.
    assert.deepEqual(editionPlan("ARA", ["NVI"]), { use: "ARA", online: true, fallback: "NVI" });
    // The chosen edition installed: read here, no fallback needed.
    assert.deepEqual(editionPlan("NVI", ["NVI", "ACF"]), { use: "NVI", online: false, fallback: null });
    // NVI chosen but only ACF installed: NVI online, ACF if it fails.
    assert.deepEqual(editionPlan("NVI", ["ACF"]), { use: "NVI", online: true, fallback: "ACF" });
    // Nothing installed: online, and nothing to fall back to.
    assert.deepEqual(editionPlan("ARA", []), { use: "ARA", online: true, fallback: null });
    // AA exists only as an install: not installed, the installed one is used.
    assert.deepEqual(editionPlan("AA", ["NVI"]), { use: "NVI", online: false, fallback: null });
    assert.deepEqual(editionPlan("AA", []), { use: "AA", online: true, fallback: null });
});

test("a chapter that cannot be fetched comes from the installed edition, and says which failed", async () => {
    const offline = async (edition) => { if (edition === "ARA") throw new Error("sem internet"); return { verses: [{ number: 16, text: "NVI" }], source: "local" }; };
    const r = await readByPlan(editionPlan("ARA", ["NVI"]), offline);
    assert.deepEqual([r.version, r.fellBack, r.source], ["NVI", "ARA", "local"]);
    // Online works: ARA itself, nothing fell back.
    const ok = await readByPlan(editionPlan("ARA", ["NVI"]), async () => ({ verses: [], source: "online" }));
    assert.deepEqual([ok.version, ok.fellBack], ["ARA", null]);
    // Nothing to fall back to: the error stands.
    await assert.rejects(readByPlan(editionPlan("ARA", []), offline), /sem internet/);
});
