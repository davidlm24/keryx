import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BIBLES, setupAsks, setupRows, joinSiglas, chosenWords, finishedWords, setupLine, defaultAfterSetup } from "./bibleSetup.js";
import { BIBLE_VERSIONS } from "../bibleBooks.js";
import { editionList } from "../bibleEditions.js";

const none = { asked: null, wanted: [], done: [], pending: [], failed: {}, finished: false, installing: null, installed: {} };

test("the dialog asks by itself only on a computer never asked with no edition installed", () => {
    assert.equal(setupAsks(null), false);
    assert.equal(setupAsks(none), true);
    assert.equal(setupAsks({ ...none, asked: "2026-10-27T12:00:00Z" }), false);
    assert.equal(setupAsks({ ...none, installed: { ARA: 31000 } }), false);
    assert.equal(setupAsks(none, { ARA: 31000 }), false);
    assert.equal(setupAsks({ ...none, installed: { ARA: 0 } }), true);
});

test("the rows: the most used first and ticked, then the other publishers', then the open ones; never the church's own", () => {
    const own = [{ id: "r1", sigla: "BKJ", name: "King James 1611", testament: "all" }];
    const rows = setupRows(editionList(own), none);
    assert.deepEqual(rows.slice(0, 4).map((r) => r.id), DEFAULT_BIBLES);
    assert.deepEqual(rows.slice(0, 4).map((r) => r.ticked), [true, true, true, true]);
    const rest = rows.slice(4);
    assert.ok(rest.every((r) => !r.ticked));
    const publishers = rest.filter((r) => r.chip?.tone === "cr").map((r) => r.id);
    const open = rest.filter((r) => r.chip?.tone !== "cr").map((r) => r.id);
    assert.deepEqual(publishers, ["ACF", "AA", "NAA", "KJA"]);
    assert.deepEqual(open, ["BLIVRE", "NBV", "BPM", "BLT"]);
    assert.ok(!rows.some((r) => r.id === "BKJ"));
    assert.equal(rows.find((r) => r.id === "BLT").nt, true);
    assert.equal(rows[0].title, "NVI · Nova Versão Internacional");
    assert.deepEqual(rows[0].chip, { text: "Biblica", tone: "cr" });
    assert.equal(rows.length, BIBLE_VERSIONS.length);
});

test("the rows follow an earlier answer: installed ticked and held, waiting ticked, the rest as ticked by the church", () => {
    const st = { ...none, asked: "x", wanted: ["ARA", "NAA"], pending: ["NAA"], installed: { ARA: 31000 } };
    const rows = setupRows(BIBLE_VERSIONS, st);
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    assert.equal(by.ARA.installed, 31000);
    assert.equal(by.ARA.ticked, true);
    assert.equal(by.NAA.ticked, true);
    assert.equal(by.NAA.pending, true);
    assert.equal(by.NVI.ticked, false);
    // After Agora não (nothing wanted) the most used are ticked again.
    assert.equal(setupRows(BIBLE_VERSIONS, { ...none, asked: "x" }).find((r) => r.id === "NVI").ticked, true);
});

test("the words", () => {
    assert.equal(joinSiglas(["NVI"]), "NVI");
    assert.equal(joinSiglas(["NVI", "ARA", "ARC", "NTLH"]), "NVI, ARA, ARC e NTLH");
    assert.equal(chosenWords(0), "Nenhuma Bíblia para baixar.");
    assert.equal(chosenWords(4), "Baixando 4 Bíblias em segundo plano. Dá para usar o KERYX enquanto isso.");
    assert.equal(chosenWords(1, false), "Sem internet agora: o KERYX baixa a Bíblia quando houver.");
    assert.equal(chosenWords(4, false), "Sem internet agora: o KERYX baixa as 4 Bíblias quando houver.");
    assert.equal(finishedWords({ done: ["NVI", "ARA"], failed: {} }), "2 Bíblias instaladas: NVI e ARA.");
    assert.equal(finishedWords({ done: ["NVI"], failed: {} }), "Bíblia instalada: NVI.");
    assert.equal(finishedWords({ done: ["NVI"], failed: { ARA: "HTTP 500" } }), "NVI instalada; a ARA não baixou: HTTP 500 Veja em Configurações › Bíblia e músicas.");
    assert.equal(finishedWords({ done: [], failed: { ARA: "x", ARC: "y" } }), "ARA e ARC não baixaram. Veja em Configurações › Bíblia e músicas.");
    assert.equal(finishedWords({ done: [], failed: {} }), "");
});

test("the line in Bíblias instaladas: downloading, waiting, given up, or nothing", () => {
    assert.equal(setupLine(none), null);
    const base = { ...none, asked: "x", wanted: DEFAULT_BIBLES };
    assert.deepEqual(setupLine({ ...base, installing: "ARA", done: ["NVI"], pending: ["ARA", "ARC", "NTLH"] }), { text: "Baixando a ARA… (2 de 4)", tone: "info", retry: false });
    assert.deepEqual(setupLine({ ...base, done: ["NVI"], pending: ["ARA", "ARC", "NTLH"] }), { text: "ARA, ARC e NTLH ainda vão baixar · o KERYX tenta de novo sozinho", tone: "info", retry: true });
    assert.deepEqual(setupLine({ ...base, done: ["NVI", "ARA", "ARC"], pending: ["NTLH"] }, false), { text: "Sem internet: NTLH baixa quando houver", tone: "info", retry: false });
    assert.deepEqual(setupLine({ ...base, done: ["NVI", "ARA", "ARC"], pending: [], failed: { NTLH: "HTTP 500" }, finished: true }), { text: "A NTLH não baixou: HTTP 500", tone: "warn", retry: true });
    assert.equal(setupLine({ ...base, done: DEFAULT_BIBLES, pending: [], finished: true }), null);
});

test("the version in use after the answer", () => {
    assert.equal(defaultAfterSetup("NVI", ["NVI", "ARA"]), null);
    assert.equal(defaultAfterSetup("NVI", ["ARA", "ARC"]), "ARA");
    assert.equal(defaultAfterSetup("NVI", ["ARA"], { NVI: 31000 }), null);
    assert.equal(defaultAfterSetup("NVI", []), null);
    assert.equal(defaultAfterSetup("", ["ARA"]), "ARA");
});
