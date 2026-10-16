import test from "node:test";
import assert from "node:assert/strict";
import { PAGE_TITLES, isEditorPage, winSize, openStack, push, pop, top, backLabel, replaceTop, stackFromParams, detachSpec, janelaName } from "./nav.js";

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

test("stackFromParams: the detached pages' params (Rodada F5)", () => {
    const q = (s) => new URLSearchParams(s);
    assert.deepEqual(top(stackFromParams(q("config=culto"))).props, { section: "culto" });
    assert.deepEqual(top(stackFromParams(q("config=1"))).props, {}, "1: no section in particular");
    assert.deepEqual(top(stackFromParams(q("planner=s9"))).props, { serviceId: "s9" });
    assert.deepEqual(top(stackFromParams(q("planner=new"))).props, {});
    assert.deepEqual(top(stackFromParams(q("song=s1&sync=1"))).props, { id: "s1", sync: true }, "Sincronizar opens over the Editor de música");
    assert.deepEqual(top(stackFromParams(q("material=m1&class=k1"))).props, { id: "m1", classId: "k1" });
    assert.deepEqual(top(stackFromParams(q("material=new"))).props, { id: null, classId: "" });
    // The old /Editor window's deep links.
    assert.deepEqual(top(stackFromParams(q("theme=new"))).props, { id: "new" });
    assert.deepEqual(top(stackFromParams(q("screen=/StageView"))).props, { path: "/StageView" });
    assert.equal(stackFromParams(q("page=media")), null, "page= alone opens nothing: it only names the window");
});

test("detachSpec: every page of the window can leave for its own, and comes back the same", () => {
    const back = (spec) => stackFromParams(new URLSearchParams(spec.query));
    const cases = [
        [openStack({ page: "config" }), { section: "temas" }, "config", { section: "temas" }],
        [openStack({ page: "planner" }), { serviceId: "s9" }, "planner", { serviceId: "s9" }],
        [openStack({ page: "media", props: { intent: "upload" } }), {}, "media", {}],
        [openStack({ page: "notice", props: { id: "n1" } }), {}, "notice", { id: "n1" }],
        [openStack({ page: "song", props: { id: "s1" } }), {}, "song", { id: "s1" }],
        [openStack({ page: "school" }), {}, "school", {}],
        [openStack({ page: "reports" }), {}, "reports", {}],
        [openStack({ page: "theme", props: { id: "t1" } }), {}, "theme", { id: "t1" }],
        [openStack({ page: "screen", props: { path: "/LyricProjection" } }), {}, "screen", { path: "/LyricProjection" }],
    ];
    for (const [stack, at, page, props] of cases) {
        const spec = detachSpec(stack, at);
        assert.equal(spec.pop, 1, page);
        assert.equal(spec.page, page);
        assert.equal(new URLSearchParams(spec.query).get("page"), page, "the window says which page it is");
        const s = back(spec);
        assert.equal(top(s).page, page);
        assert.deepEqual(top(s).props, props, page);
        assert.equal(backLabel(s), null, "detached, the page is a first level");
    }
    // The Mídia's intent (Enviar arquivos…) already ran in the console.
    assert.equal(new URLSearchParams(detachSpec(openStack({ page: "media", props: { intent: "upload" } })).query).get("media"), "1");
});

test("detachSpec: a level pushed from another leaves alone; Sincronizar takes its editor along", () => {
    // Escola bíblica › Material: only the material leaves; the Escola stays.
    const mat = push(openStack({ page: "school" }), { page: "material", props: { id: "m1", classId: "k1" } }, "Escola bíblica");
    const m = detachSpec(mat);
    assert.equal(m.pop, 1);
    assert.deepEqual(top(stackFromParams(new URLSearchParams(m.query))).props, { id: "m1", classId: "k1" });
    // A new material, unsaved: a new one in the window.
    assert.equal(new URLSearchParams(detachSpec(push(openStack({ page: "school" }), { page: "material", props: { id: null, classId: "" } })).query).get("material"), "new");
    // Planejar › Editor de música: the editor leaves, the planner stays.
    const song = push(openStack({ page: "planner" }), { page: "song", props: { id: "s1" } }, "Planejar o culto");
    assert.deepEqual([detachSpec(song).pop, detachSpec(song).page], [1, "song"]);
    // Sincronizar answers to the editor below (its Aplicar fills that
    // draft): both leave, and the window opens the editor with it on top.
    const sync = push(openStack({ page: "song", props: { id: "s1" } }), { page: "sync", props: { title: "x", onApply: () => {} } }, "Editor de música");
    const d = detachSpec(sync);
    assert.equal(d.pop, 2);
    assert.equal(d.page, "song");
    assert.deepEqual(top(stackFromParams(new URLSearchParams(d.query))).props, { id: "s1", sync: true });
    // A song never saved has no marks to open: no ⧉.
    assert.equal(detachSpec(push(openStack({ page: "song", props: { id: "new" } }), { page: "sync" })), null);
    assert.equal(detachSpec([]), null);
    assert.equal(janelaName("song"), "keryx-janela-song");
});
