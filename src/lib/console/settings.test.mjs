import { test } from "node:test";
import assert from "node:assert/strict";
import { SECTIONS, APPEARANCE_TABS, resolveSection, sectionOf } from "./settings.js";

test("settings: every section has an id, an icon and a name, none repeated", () => {
    assert.equal(new Set(SECTIONS.map((s) => s.id)).size, SECTIONS.length);
    assert.equal(new Set(SECTIONS.map((s) => s.name)).size, SECTIONS.length);
    for (const s of SECTIONS) assert.ok(s.id && s.icon && s.name, s.id);
    // The smoke finds a nav row by its name: no name contains another.
    for (const a of SECTIONS) for (const b of SECTIONS) if (a !== b) assert.ok(!a.name.includes(b.name), `${a.name} / ${b.name}`);
});

test("settings: the ids of older versions still open their place", () => {
    assert.deepEqual(resolveSection("dados"), { id: "backup", tab: null });
    assert.deepEqual(resolveSection("biblias"), { id: "biblia", tab: null });
    assert.deepEqual(resolveSection("temas"), { id: "aparencia", tab: "temas" });
    assert.deepEqual(resolveSection("aparencia"), { id: "aparencia", tab: "geral" });
    assert.deepEqual(resolveSection("telas"), { id: "telas", tab: null });
    assert.deepEqual(resolveSection("rede"), { id: "rede", tab: null });
    assert.deepEqual(resolveSection("igreja"), { id: "igreja", tab: null });
});

test("settings: a tab can be named, an unknown one is Geral", () => {
    assert.deepEqual(resolveSection("aparencia/fundos"), { id: "aparencia", tab: "fundos" });
    assert.deepEqual(resolveSection("aparencia/nope"), { id: "aparencia", tab: "geral" });
    assert.deepEqual(resolveSection("culto/x"), { id: "culto", tab: null });
});

test("settings: unknown or empty ids open Telas e saídas", () => {
    for (const raw of ["", null, undefined, "nada", "1"]) assert.deepEqual(resolveSection(raw), { id: "telas", tab: null });
    assert.equal(sectionOf("nada").id, "telas");
    // Every alias lands on a real section and tab.
    for (const raw of ["dados", "biblias", "temas", "fundos", "letras"]) {
        const r = resolveSection(raw);
        assert.ok(SECTIONS.some((s) => s.id === r.id), raw);
        if (r.tab) assert.ok(APPEARANCE_TABS.some(([k]) => k === r.tab), raw);
    }
});
