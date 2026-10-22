import { test } from "node:test";
import assert from "node:assert/strict";
import { NOUNS, nameList, serviceName, itemsUsing, setlistLines, themeLines, bulkDeleteQuestion, renumberPlan, deletedSay, backgroundQuestion, backgroundSay, backgroundAction, backgroundRemoval, prefsAfterDelete } from "./bulkDelete.js";
import { focusesCancel } from "./confirm.js";
import { backgroundList } from "./backgroundPrefs.js";

const bundled = [{ id: "a", url: "u/a", category: "Natureza" }, { id: "b", url: "u/b", category: "Abstrato" }, { id: "c", url: "u/c", category: "Natureza" }];

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

test("Tirar dos fundos for several: one question that says where each origin goes", () => {
    const b = (name) => ({ name });
    const q = backgroundQuestion({ exclude: [b("Céu"), b("Mar")], delete: [b("Cruz")], untrack: [b("Igreja")], skipped: [b("Campo")] });
    assert.equal(q.title, "Excluir 4 fundos?", "a file deleted for good: Excluir");
    assert.deepEqual(q.list, ["Céu", "Mar", "Cruz", "Igreja"]);
    assert.equal(q.ok, "Excluir 4");
    assert.deepEqual(q.warn, ["1 foi enviado para a biblioteca e é excluído de vez."]);
    assert.equal(q.text, "2 vêm com o KERYX e vão para Excluídos: Restaurar traz de volta. 1 é da Mídia e sai só dos fundos: a Mídia continua com ele. 1 já está em Excluídos.");
    assert.equal(focusesCancel(q), true, "a file deleted for good: it opens on Cancelar");
    const soft = backgroundQuestion({ exclude: [b("Céu")] });
    assert.equal(soft.title, "Tirar o fundo?");
    assert.equal(soft.ok, "Tirar");
    assert.deepEqual(soft.warn, []);
    assert.equal(focusesCancel(soft), false, "Excluídos gives it back: it opens on Tirar");
    assert.equal(backgroundQuestion({ skipped: [b("Campo")] }), null, "nothing can go further");
    assert.equal(backgroundQuestion({ exclude: [b("Céu")], untrack: [b("Igreja")] }).title, "Tirar 2 fundos?", "nothing deleted for good: Tirar");
});

test("the marked backgrounds' action: Excluir with the trash when a file goes for good (owner 2026-10-22)", () => {
    assert.deepEqual(backgroundAction({ exclude: [{}], delete: [{}] }), { label: "Excluir…", icon: "trash", verb: "Excluir" });
    assert.deepEqual(backgroundAction({ exclude: [{}], untrack: [{}], delete: [] }), { label: "Tirar dos fundos…", icon: "x", verb: "Tirar" });
    assert.deepEqual(backgroundAction(), { label: "Tirar dos fundos…", icon: "x", verb: "Tirar" });
});

test("the toast after Tirar dos fundos", () => {
    assert.equal(backgroundSay({ exclude: 2, delete: 1, untrack: 1 }), "4 fundos saíram da biblioteca · 2 em Excluídos · 1 excluído · 1 só fora dos fundos.");
    assert.equal(backgroundSay({ exclude: 1 }), "1 fundo saiu da biblioteca · 1 em Excluídos.");
    assert.equal(backgroundSay({ delete: 2, failed: 1 }), "2 fundos saíram da biblioteca · 2 excluídos · 1 não pôde sair.");
});

test("taking several out of a setlist: Tirar, and it opens on the action", async () => {
    const { takeOutManyQuestion } = await import("./bulkDelete.js");
    const q = takeOutManyQuestion(["Hino", "Oração", "Aviso"]);
    assert.equal(q.title, "Tirar 3 itens da setlist?");
    assert.deepEqual(q.list, ["Hino", "Oração", "Aviso"]);
    assert.equal(q.text, "Eles saem da setlist deste culto e continuam no KERYX.");
    assert.equal(q.ok, "Tirar 3");
    assert.equal(focusesCancel(q), false, "nothing leaves the KERYX: Enter takes them out, as with one");
});

test("several backgrounds out at once: each origin its way, one plan (owner 2026-10-21, M3)", () => {
    const list = backgroundList({
        bundled,
        images: [
            { id: "m1", url: "http://h/media/own.png" }, { id: "m3", url: "http://h/media/twice.png" },
            { id: "m2", url: "http://h/media/midia.png", origin: "media" },
        ],
        prefs: [
            { id: "p-b", source: "bundled:b", hidden: true }, { id: "p-own", source: "http://h/media/own.png", category: "Cruz" },
            { id: "p-twice", source: "http://h/media/twice.png" }, { id: "p-midia", source: "http://h/media/midia.png" },
        ],
    });
    const by = (s) => list.find((b) => b.source === s);
    const plan = backgroundRemoval(["bundled:a", "bundled:b", "http://h/media/own.png", "http://h/media/twice.png", "http://h/media/midia.png"].map(by));
    assert.deepEqual(plan.exclude.map((b) => b.source), ["bundled:a"], "a factory photo goes to Excluídos");
    assert.deepEqual(plan.skipped.map((b) => b.source), ["bundled:b"], "already excluded: nowhere further");
    assert.deepEqual(plan.delete.map((b) => b.mediaId), ["m1", "m3"], "the files sent here are deleted");
    assert.deepEqual(plan.untrack.map((b) => b.source), ["http://h/media/midia.png"], "a Mídia picture only leaves the backgrounds");
    assert.deepEqual(backgroundRemoval([]), { exclude: [], delete: [], untrack: [], skipped: [] });

    const media = [
        { id: "m1", file_url: "http://h/media/own.png" }, { id: "m3", file_url: "http://h/media/twice.png" },
        { id: "m4", file_url: "http://h/media/twice.png" },
    ];
    assert.deepEqual(prefsAfterDelete(plan.delete, media), ["p-own"], "another copy of twice.png stays a background: its settings stay");
    assert.deepEqual(prefsAfterDelete([by("http://h/media/twice.png")], media.slice(0, 2)), ["p-twice"], "the last copy: its settings go too");
    assert.deepEqual(prefsAfterDelete([], media), [], "a file whose delete failed keeps its look and category");
    const copy = { ...by("http://h/media/twice.png"), mediaId: "m4" };
    assert.deepEqual(prefsAfterDelete([by("http://h/media/twice.png"), copy], media), ["p-twice"], "both copies gone: once");
});
