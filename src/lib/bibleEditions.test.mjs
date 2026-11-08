import test from "node:test";
import assert from "node:assert/strict";
import { editionList, editionOption, versionGroups, installableEditions } from "./bibleEditions.js";

// Rodada P (P3 = A): the version select in groups, the (+) with only what is missing.
const own = { id: "x1", sigla: "BKJ", name: "King James 1611 (arquivo da igreja)", testament: "all" };
const all = editionList([own]);
const ids = (g) => g.items.map((v) => v.id);

test("an option says the sigla and the full name", () => {
    assert.equal(editionOption(all.find((v) => v.id === "ACF")), "ACF · Almeida Corrigida Fiel");
    assert.equal(editionOption({ id: "XYZ", name: "XYZ" }), "XYZ");
    assert.equal(editionOption({ id: "XYZ" }), "XYZ");
});

test("the list is in groups: installed, from the internet, the church's own", () => {
    const g = versionGroups(all, ["ACF", "NVI", "BKJ"], "ACF");
    assert.deepEqual(g.map((x) => x.label), ["Instaladas", "Ler pela internet", "Da igreja"]);
    assert.deepEqual(ids(g[0]), ["NVI", "ACF"], "the list's order");
    assert.ok(ids(g[1]).includes("ARA") && !ids(g[1]).includes("ACF"), "an installed one is not listed again");
    assert.ok(!ids(g[1]).includes("AA") && !ids(g[1]).includes("NBV"), "no online reading: only through the (+)");
    assert.deepEqual(ids(g[2]), ["BKJ"]);
});

test("the edition chosen is always in the list, even when it cannot be read here", () => {
    const g = versionGroups(all, [], "NVI");
    assert.equal(g[0].label, "Ler pela internet", "nothing installed: no empty group");
    assert.deepEqual(g.at(-1), { id: "wanted", label: "Não instalada", items: [all.find((v) => v.id === "NVI")] });
    assert.deepEqual(ids(versionGroups(all, [], "ZZZ").at(-1)), ["ZZZ"], "an edition gone from the list too");
    assert.ok(!versionGroups(all, ["NVI"], "NVI").some((x) => x.id === "wanted"));
});

test("the (+) offers only the editions not installed here", () => {
    const list = installableEditions(all, ["ACF", "NVI", "BKJ"]).map((v) => v.id);
    assert.ok(!list.includes("ACF") && !list.includes("NVI"), "note 5: no Instalar for one installed");
    assert.ok(list.includes("ARA") && list.includes("BLT"));
    assert.ok(!list.includes("BKJ"), "the church's own come from their file");
    assert.equal(installableEditions(all, all.map((v) => v.id)).length, 0);
});
