import { test } from "node:test";
import assert from "node:assert/strict";
import { NOUNS, nameList, serviceName, itemsUsing, setlistLines, themeLines, bulkDeleteQuestion, renumberPlan, deletedSay } from "./bulkDelete.js";
import { focusesCancel } from "./confirm.js";

const services = [{ id: "dom", title: "Domingo", date: "2026-10-20" }, { id: "qua", title: "", date: "2026-10-23" }];
const items = [
    { id: "i1", serviceId: "dom", order: 0, contentId: "s1" },
    { id: "i2", serviceId: "dom", order: 1, contentId: "s2" },
    { id: "i3", serviceId: "qua", order: 0, contentId: "s2" },
    { id: "i4", serviceId: "dom", order: 2, contentId: "" },
];

test("the names: up to five, then e mais n", () => {
    assert.deepEqual(nameList(["a", "b"]), ["a", "b"]);
    assert.deepEqual(nameList(["a", "b", "c", "d", "e"]), ["a", "b", "c", "d", "e"]);
    assert.deepEqual(nameList(["a", "b", "c", "d", "e", "f", "g"]), ["a", "b", "c", "d", "e mais 3"]);
    assert.deepEqual(nameList(["", " x "]), ["Sem nome", "x"]);
});

test("a culto by its name and date, else the date", () => {
    assert.equal(serviceName(services[0]), "Domingo 20/10");
    assert.equal(serviceName(services[1]), "23/10");
    assert.equal(serviceName({ title: "Ceia 20/10", date: "2026-10-20" }), "Ceia 20/10", "the date is not said twice");
    assert.equal(serviceName(null), "outro culto");
});

test("rows a Setlist uses: said once, by culto; their items leave too", () => {
    assert.deepEqual(itemsUsing(["s2"], items).map((i) => i.id), ["i2", "i3"]);
    assert.deepEqual(setlistLines(["s1"], { serviceItems: items, services }), ["Ela está na setlist de Domingo 20/10: o item sai de lá também."]);
    assert.deepEqual(setlistLines(["s1", "s2", "s9"], { serviceItems: items, services }), ["2 estão em 2 setlists: os itens saem de lá também."]);
    assert.deepEqual(setlistLines(["s1"], { serviceItems: items, services }, NOUNS.media), ["Ele está na setlist de Domingo 20/10: o item sai de lá também."]);
    assert.deepEqual(setlistLines(["s9"], { serviceItems: items, services }), [], "unused: no warning");
    assert.deepEqual(itemsUsing([""], items), [], "an item that points at nothing is never matched");
});

test("themes: the default and everything that names them", () => {
    const themes = [{ id: "t1", name: "Azul noturno", is_default: true }, { id: "t2", name: "" }];
    const lines = themeLines(["t1", "t2"], {
        themes,
        songs: [{ theme_id: "t1" }, { part_themes: { refrão: "t2" } }, { theme_id: "x" }],
        services: [{ theme_id: "t2" }],
        templates: [],
        outputPrefs: [{ theme_id: "t1" }],
        user: { bible_theme_id: "t1", text_theme_id: "" },
    });
    assert.deepEqual(lines, ["Azul noturno é o tema padrão.", "2 músicas, 1 culto, 1 saída e 1 tema padrão de um tipo usam algum deles: voltam ao padrão."]);
    assert.deepEqual(themeLines(["t2"], { themes, songs: [{ theme_id: "t2" }] }), ["1 música usa este tema: volta ao padrão."]);
    assert.deepEqual(themeLines(["t2"], { themes, songs: [{ theme_id: "t2" }, { theme_id: "t2" }] }), ["2 músicas usam este tema: voltam ao padrão."]);
    assert.deepEqual(themeLines(["zz"], { themes }), []);
});

test("the question: one asks as a single Excluir always did; several by count; it opens on Cancelar", () => {
    const one = bulkDeleteQuestion({ noun: NOUNS.song, names: ["Hino"], warn: ["w"] });
    assert.equal(one.title, "Excluir a música?");
    assert.equal(one.text, '"Hino" sai do KERYX de vez.');
    assert.deepEqual(one.warn, ["w"]);
    assert.equal(one.ok, "Excluir");
    const many = bulkDeleteQuestion({ noun: NOUNS.media, names: ["a", "b", "c"], text: "Os arquivos continuam na pasta de mídia." });
    assert.equal(many.title, "Excluir 3 arquivos?");
    assert.deepEqual(many.list, ["a", "b", "c"]);
    assert.equal(many.ok, "Excluir 3");
    assert.equal(many.text, "Os arquivos continuam na pasta de mídia.");
    assert.equal(focusesCancel(many), true, "Enter answers no");
    assert.equal(focusesCancel(one), true);
    assert.equal(bulkDeleteQuestion({ noun: NOUNS.theme, names: ["x"] }).title, "Excluir o tema?");
});

test("after taking several out of setlists: each culto numbered again once, only what changes", () => {
    const rest = [
        { id: "a", serviceId: "dom", order: 0 },
        { id: "b", serviceId: "dom", order: 3 },
        { id: "c", serviceId: "dom", order: 5 },
        { id: "d", serviceId: "qua", order: 1 },
    ];
    assert.deepEqual(renumberPlan(rest), [{ id: "b", order: 1 }, { id: "c", order: 2 }, { id: "d", order: 0 }]);
    assert.deepEqual(renumberPlan([]), []);
});

test("the toast after", () => {
    assert.equal(deletedSay(1, NOUNS.song), "Excluída: 1 música.");
    assert.equal(deletedSay(3, NOUNS.song), "3 músicas excluídas.");
    assert.equal(deletedSay(4, NOUNS.media, 1), "4 arquivos excluídos · 1 não pôde ser excluído.");
});
