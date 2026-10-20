import test from "node:test";
import assert from "node:assert/strict";
import { bibleGroups, licenceChip, editionMeta, ownSiglaGuess, ownSizeLabel } from "./bibleRows.js";
import { BIBLE_VERSIONS, editionList } from "../bibleBooks.js";

const BKJ = { id: "own-1", sigla: "BKJ", name: "Bíblia King James Fiel 1611", format: "MySword", file_name: "bkj1611.bbl.mybible", testament: "all" };

test("three groups: the church's own, the open ones, the publishers'; an empty group is left out", () => {
    const none = bibleGroups(editionList([]), { NVI: 31105 });
    assert.deepEqual(none.map((g) => g.id), ["open", "publisher"]);
    assert.deepEqual(none[1].rows.map((r) => r.edition.id), ["NVI", "ACF", "AA", "ARA", "ARC", "NAA", "NTLH", "KJA"]);
    assert.deepEqual(none[0].rows.map((r) => r.edition.id), ["BLIVRE", "NBV", "BPM", "BLT"]);
    const all = bibleGroups(editionList([BKJ]), { BKJ: 31102, BLIVRE: 31102 });
    assert.deepEqual(all.map((g) => [g.id, g.title]), [["own", "Da igreja"], ["open", "Abertas"], ["publisher", "Com direitos da editora"]]);
    assert.equal(all[0].rows[0].title, "BKJ · Bíblia King James Fiel 1611");
    assert.equal(all[0].rows[0].meta, "Instalada neste computador · 31.102 versículos · de bkj1611.bbl.mybible");
    assert.equal(all[1].rows.find((r) => r.edition.id === "BLT").nt, true);
});

test("the licence chip: whose it is, or its licence", () => {
    const by = (id) => BIBLE_VERSIONS.find((v) => v.id === id);
    assert.deepEqual(licenceChip(by("NVI")), { text: "Biblica", tone: "cr" });
    assert.deepEqual(licenceChip(by("ARA")), { text: "SBB", tone: "cr" });
    assert.deepEqual(licenceChip(by("BLIVRE")), { text: "CC BY 4.0", tone: "open" });
    assert.deepEqual(licenceChip(by("BPM")), { text: "Domínio público", tone: "pd" });
    assert.deepEqual(licenceChip(editionList([BKJ]).at(-1)), { text: "Da igreja", tone: "own" });
    // Every edition of the list has its chip.
    assert.ok(BIBLE_VERSIONS.every((v) => licenceChip(v)?.text));
});

test("the meta line keeps the list's words", () => {
    const by = (id) => BIBLE_VERSIONS.find((v) => v.id === id);
    assert.equal(editionMeta(by("NVI"), 31105), "Instalada neste computador · 31.105 versículos");
    assert.equal(editionMeta(by("ARA"), 0), "Pela internet · baixe para usar sem rede");
    assert.equal(editionMeta(by("NVI"), 0), "Não instalada · baixe para usar");
    assert.equal(editionMeta(by("NBV"), 0), "Não instalada · baixe para usar");
});

test("the dialog's sigla: the file's own, else its name, never one taken or retired", () => {
    const taken = BIBLE_VERSIONS.map((v) => v.id);
    assert.equal(ownSiglaGuess({ abbrev: "bkj", file: "x.bbl.mybible" }, taken), "BKJ");
    // BKJ1611 is the retired name of the KJA: the digits go.
    assert.equal(ownSiglaGuess({ file: "bkj1611.bbl.mybible" }, taken), "BKJ");
    assert.equal(ownSiglaGuess({ file: "minha_biblia.xml" }, taken), "MINHABIB");
    // Every guess taken (a copy of the NVI): none, the church types one.
    assert.equal(ownSiglaGuess({ abbrev: "NVI", file: "nvi.xml", title: "Nova Versão Internacional" }, taken), "");
    assert.equal(ownSiglaGuess({ file: "a.xml" }, taken), "");
    assert.equal(ownSiglaGuess({ file: "x.xml", title: "Bíblia King James Fiel 1611" }, taken), "BKJF");
});

test("the file's size in pt-BR", () => {
    assert.equal(ownSizeLabel(4.1 * 1024 * 1024), "4,1 MB");
    assert.equal(ownSizeLabel(820 * 1024), "820 kB");
    assert.equal(ownSizeLabel(10), "1 kB");
});
