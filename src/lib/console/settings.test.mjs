import { test } from "node:test";
import assert from "node:assert/strict";
import { SECTIONS, resolveSection, sectionOf } from "./settings.js";

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
    assert.deepEqual(resolveSection("temas"), { id: "temas", tab: null }, "Temas is a section of its own now");
    assert.deepEqual(resolveSection("aparencia/temas"), { id: "temas", tab: null }, "the old Aparência › Temas");
    assert.deepEqual(resolveSection("fundos"), { id: "temas", tab: null }, "the backgrounds' library button lives in Temas e fundos");
    assert.deepEqual(resolveSection("aparencia"), { id: "culto", tab: null }, "Aparência dissolved: its wallpaper and Tela ociosa live in Culto");
    assert.deepEqual(resolveSection("telas"), { id: "telas", tab: null });
    assert.deepEqual(resolveSection("rede"), { id: "rede", tab: null });
    assert.deepEqual(resolveSection("igreja"), { id: "igreja", tab: null });
});

test("settings: an old link to a tab of Telas e saídas (it has none since the thumbnails) opens the section", () => {
    assert.deepEqual(resolveSection("telas/layouts"), { id: "telas", tab: null });
    assert.deepEqual(resolveSection("telas/StageView"), { id: "telas", tab: null });
    assert.deepEqual(resolveSection("telas/../x"), { id: "telas", tab: null });
    assert.deepEqual(resolveSection("aparencia/fundos"), { id: "culto", tab: null });
    assert.deepEqual(resolveSection("culto/x"), { id: "culto", tab: null });
});

test("settings: unknown or empty ids open Telas e saídas", () => {
    for (const raw of ["", null, undefined, "nada", "1"]) assert.deepEqual(resolveSection(raw), { id: "telas", tab: null });
    assert.equal(sectionOf("nada").id, "telas");
    // Every alias lands on a real section and tab.
    for (const raw of ["dados", "biblias", "temas", "fundos", "letras", "aparencia"]) {
        const r = resolveSection(raw);
        assert.ok(SECTIONS.some((s) => s.id === r.id), raw);
    }
});
