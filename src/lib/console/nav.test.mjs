import test from "node:test";
import assert from "node:assert/strict";
import { PAGE_TITLES, isEditorPage, winSize, openStack, push, pop, top, backLabel, replaceTop, stackFromParams } from "./nav.js";

test("openStack: one level, no Voltar", () => {
    const s = openStack({ page: "media" });
    assert.equal(s.length, 1);
    assert.equal(top(s).page, "media");
    assert.equal(backLabel(s), null);
    assert.equal(winSize(s), "standard");
});

test("push: the Voltar chip carries where it came from", () => {
    // Configurações › Temas → Editor de temas: the chip says the section.
    let s = openStack({ page: "config" });
    s = push(s, { page: "theme", props: { id: "new" } }, "Temas");
    assert.equal(s.length, 2);
    assert.equal(backLabel(s), "Temas");
    assert.equal(winSize(s), "editor", "an editor on top grows the window");
    // Editor da tela › Ajustes › Editar tema… → three levels.
    s = pop(s);
    s = push(s, { page: "screen", props: { path: "/StageView" } }, "Telas e saídas");
    s = push(s, { page: "theme", props: { id: "t1" } });
    assert.equal(backLabel(s), PAGE_TITLES.screen, "no label given: the page below names the chip");
    assert.equal(s.length, 3);
});

test("pop: one level up, back to the page below", () => {
    let s = openStack({ page: "config" });
    s = push(s, { page: "screen", props: { path: "/Projection" } }, "Telas e saídas");
    const below = top(pop(s));
    assert.equal(below.page, "config");
    assert.equal(winSize(pop(s)), "standard", "leaving the editor shrinks the window");
    assert.equal(pop(openStack({ page: "media" })).length, 0, "the first level pops to empty: the caller closes");
});

test("replaceTop: other props; keep retitles without remounting", () => {
    let s = openStack({ page: "notice", props: { id: "new" } });
    const was = top(s).key;
    // The first save of a new aviso re-points the entry at the row: same key.
    s = replaceTop(s, { id: "n1" }, { keep: true });
    assert.equal(top(s).key, was);
    assert.equal(top(s).props.id, "n1");
    // Trocar de tema remounts: a new key.
    s = replaceTop(s, { id: "n2" });
    assert.notEqual(top(s).key, was);
    // The Voltar label survives a replace.
    let d = push(openStack({ page: "config" }), { page: "theme", props: { id: "a" } }, "Temas");
    d = replaceTop(d, { id: "b" });
    assert.equal(backLabel(d), "Temas");
});

test("keys are distinct, so hidden pages keep their state apart", () => {
    let s = openStack({ page: "config" });
    s = push(s, { page: "theme", props: { id: "new" } }, "Temas");
    assert.notEqual(s[0].key, s[1].key);
});

test("every page has a title; only the editors (and Sincronizar) take the big window", () => {
    for (const page of Object.keys(PAGE_TITLES)) assert.ok(PAGE_TITLES[page].length > 2);
    assert.deepEqual(Object.keys(PAGE_TITLES).filter(isEditorPage), ["sync", "theme", "screen"]);
    // Pushed from the song editor, the window grows to the Editor size.
    assert.equal(winSize(push(openStack({ page: "song", props: { id: "s1" } }), { page: "sync" })), "editor");
    assert.throws(() => openStack({ page: "visual" }), /unknown window page/);
});

test("stackFromParams: the old desktop routes still open their page", () => {
    const q = (s) => new URLSearchParams(s);
    assert.equal(stackFromParams(q("")), null);
    assert.equal(top(stackFromParams(q("config=telas"))).page, "config");
    assert.deepEqual(top(stackFromParams(q("song=new"))).props, { id: "new" });
    assert.equal(top(stackFromParams(q("planner=1"))).page, "planner");
    assert.deepEqual(top(stackFromParams(q("notice=abc"))).props, { id: "abc" });
    assert.equal(top(stackFromParams(q("school=1"))).page, "school");
    assert.equal(top(stackFromParams(q("reports=1"))).page, "reports");
    assert.equal(top(stackFromParams(q("media=1"))).page, "media");
    assert.equal(backLabel(stackFromParams(q("media=1"))), null);
});
