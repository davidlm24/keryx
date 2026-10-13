import test from "node:test";
import assert from "node:assert/strict";
import { normalizePresets, nameProblem, addPreset, updatePreset, renamePreset, removePreset, presetOf, presetChanged, cleanName, MAX_PRESETS } from "./dockPresets.js";
import { defaultDock, moveModules, setActive } from "./dock.js";

const dock = defaultDock();
const moved = moveModules(dock, ["camadas"], { kind: "group", path: [0], zone: "left" });

test("a saved list is made safe: an id, a name that is not Padrão, a dock; no repeats", () => {
    const list = normalizePresets([
        { id: "a", name: "  Culto   de domingo ", dock },
        { id: "a", name: "Outro", dock },
        { id: "b", name: "culto de DOMINGO", dock },
        { id: "c", name: "padrão", dock },
        { id: "d", name: "", dock },
        { id: "e", name: "Ensaio" },
        null,
        { id: "f", name: "Ensaio", dock: { tree: "junk" } },
    ]);
    assert.deepEqual(list.map((p) => [p.id, p.name]), [["a", "Culto de domingo"], ["f", "Ensaio"]]);
    assert.ok(list[1].dock.tree, "a broken dock is made whole");
    assert.deepEqual(normalizePresets("junk"), []);
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, name: `D${i}`, dock }));
    assert.equal(normalizePresets(many).length, MAX_PRESETS);
});

test("names: required, never Padrão, never twice, a limited list", () => {
    const list = [{ id: "a", name: "Culto", dock }];
    assert.equal(nameProblem(list, "  "), "Dê um nome à disposição.");
    assert.match(nameProblem(list, "PADRÃO"), /de fábrica/);
    assert.match(nameProblem(list, "culto"), /Já existe/);
    assert.equal(nameProblem(list, "culto", "a"), null, "renaming keeps its own name");
    assert.equal(nameProblem(list, "Ensaio"), null);
    const full = Array.from({ length: MAX_PRESETS }, (_, i) => ({ id: `p${i}`, name: `D${i}`, dock }));
    assert.match(nameProblem(full, "Mais uma"), /Cabem/);
    assert.equal(cleanName("  a   b  "), "a b");
});

test("add, update, rename, remove", () => {
    const { list, id } = addPreset([], "Ensaio", moved, "x1");
    assert.equal(id, "x1");
    assert.deepEqual(list.map((p) => p.name), ["Ensaio"]);
    assert.deepEqual(addPreset(list, "ensaio", dock, "x2"), { list, id: null }, "a taken name adds nothing");
    const upd = updatePreset(list, "x1", dock);
    assert.deepEqual(upd[0].dock, dock);
    assert.equal(renamePreset(upd, "x1", "Ensaio geral")[0].name, "Ensaio geral");
    assert.equal(renamePreset(upd, "x1", "Padrão"), upd, "a bad name renames nothing");
    assert.deepEqual(removePreset(upd, "x1"), []);
    assert.equal(presetOf(upd, "x1").name, "Ensaio");
    assert.equal(presetOf(upd, null), null);
    assert.equal(presetOf(upd, "nope"), null);
});

test("changed: the dock differs from its preset; the tab in front does not count", () => {
    const p = { id: "a", name: "Culto", dock: moved };
    assert.equal(presetChanged(p, moved), false);
    assert.equal(presetChanged(p, dock), true);
    const tabs = moveModules(dock, ["slides"], { kind: "group", path: [0], zone: "center" });
    const q = { id: "b", name: "Abas", dock: tabs };
    assert.equal(presetChanged(q, setActive(tabs, [0], "lib")), false);
    assert.equal(presetChanged(null, dock), false, "Padrão: nothing to compare");
});
