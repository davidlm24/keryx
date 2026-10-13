import test from "node:test";
import assert from "node:assert/strict";
import { buildOutputsFile, readOutputsFile, prefWrites, cleanAssignment, fileName, FILE_KIND, OUTPUT_KEYS, PREF_PATHS } from "./outputsFile.js";

const themes = [{ id: "t-azul", name: "Culto azul" }, { id: "t-palco", name: "Palco grande" }];
const displays = [
    { id: 11, label: "Notebook", bounds: { width: 1920, height: 1080 }, primary: true },
    { id: 22, label: "EPSON PROJ", bounds: { width: 1280, height: 800 }, primary: false },
];
const outputs = [
    { key: "/Projection", assignment: { target: { id: 22, label: "EPSON PROJ", width: 1280, height: 800 }, openAtLaunch: true } },
    { key: "/StageView", assignment: { target: "window", openAtLaunch: false } },
    { key: "/Bogus", assignment: { target: "auto" } },
];
const prefRows = [
    { id: "r1", screen_path: "/Projection", hidden_kinds: ["alert"], text_scale: 110, theme_id: "t-azul", created_date: "x" },
    { id: "r2", screen_path: "/LyricProjection", name: "TV do hall", icon: "tv", margin_pct: 5, show_logo: false },
];

test("the file carries every output's placement and every page's settings, never ids", () => {
    const f = buildOutputsFile({ outputs, prefRows, themes, displays, appVersion: "0.3.0", now: Date.UTC(2026, 9, 12) });
    assert.equal(f.kind, FILE_KIND);
    assert.equal(f.version, 1);
    assert.equal(f.exportedAt, "2026-10-12T00:00:00.000Z");
    assert.deepEqual(Object.keys(f.assignments), ["/Projection", "/StageView"]); // the unknown one is not written
    assert.deepEqual(f.assignments["/Projection"], { target: { id: 22, label: "EPSON PROJ", width: 1280, height: 800 }, openAtLaunch: true, removed: false });
    assert.deepEqual(Object.keys(f.prefs), PREF_PATHS); // every page, rows or not
    assert.equal(f.prefs["/Projection"].theme_id, "t-azul");
    assert.equal(f.prefs["/Projection"].theme_name, "Culto azul");
    assert.deepEqual(f.prefs["/Projection"].hidden_kinds, ["alert"]);
    assert.equal(f.prefs["/Projection"].text_scale, 110);
    assert.equal(f.prefs["/LyricProjection"].name, "TV do hall");
    assert.equal(f.prefs["/LyricProjection"].show_logo, false);
    assert.equal(f.prefs["/VideoProjection"].text_scale, 100); // no row: the defaults
    assert.ok(!("id" in f.prefs["/Projection"]) && !("created_date" in f.prefs["/Projection"]));
    assert.equal(f.displays.length, 2);
    assert.equal(fileName(Date.UTC(2026, 9, 12)), "keryx-saidas-2026-10-12.json");
});

test("read back on the same computer: everything applies, nothing to note", () => {
    const text = JSON.stringify(buildOutputsFile({ outputs, prefRows, themes, displays }));
    const r = readOutputsFile(text, { themes, displays });
    assert.equal(r.error, undefined);
    assert.deepEqual(r.notes, []);
    assert.equal(r.outputs, 2);
    assert.equal(r.pages, PREF_PATHS.length);
    assert.deepEqual(r.assignments[0], { key: "/Projection", assignment: { target: { id: 22, label: "EPSON PROJ", width: 1280, height: 800 }, openAtLaunch: true, removed: false } });
    const proj = r.prefs.find((p) => p.path === "/Projection").fields;
    assert.equal(proj.theme_id, "t-azul");
    assert.ok(!("theme_name" in proj)); // the name is only for finding the theme
});

test("on another computer: a theme is found by its name; a missing screen or theme is said", () => {
    const text = JSON.stringify(buildOutputsFile({ outputs, prefRows, themes, displays }));
    const otherThemes = [{ id: "outro-id", name: "culto AZUL" }];
    const otherDisplays = [{ id: 5, label: "Notebook", bounds: { width: 1366, height: 768 }, primary: true }];
    const r = readOutputsFile(text, { themes: otherThemes, displays: otherDisplays });
    assert.equal(r.prefs.find((p) => p.path === "/Projection").fields.theme_id, "outro-id");
    assert.equal(r.notes.length, 1);
    assert.match(r.notes[0], /^Projeção: a tela “EPSON PROJ” 1280×800 não está ligada/);
    // No theme with that name here: the output follows the projection's.
    const r2 = readOutputsFile(text, { themes: [], displays });
    assert.equal(r2.prefs.find((p) => p.path === "/Projection").fields.theme_id, "");
    assert.ok(r2.notes.some((n) => /o tema “Culto azul” não existe/.test(n)));
    // A screen found by its name and size (its id changed) is not a note.
    const sameScreen = [{ id: 99, label: "EPSON PROJ", bounds: { width: 1280, height: 800 } }];
    assert.deepEqual(readOutputsFile(text, { themes, displays: sameScreen }).notes, []);
});

test("bad files are refused with a reason; odd values inside are cleaned", () => {
    assert.match(readOutputsFile("não é json").error, /não é JSON/);
    assert.match(readOutputsFile(JSON.stringify({ kind: "outra-coisa" })).error, /não é um arquivo de saídas/);
    assert.match(readOutputsFile(JSON.stringify({ kind: FILE_KIND, version: 9 })).error, /mais novo/);
    assert.match(readOutputsFile(JSON.stringify({ kind: FILE_KIND, version: 1, assignments: {}, prefs: {} })).error, /nenhuma saída/);
    const odd = readOutputsFile(JSON.stringify({ kind: FILE_KIND, version: 1,
        assignments: { "/Projection": { target: "lua", openAtLaunch: "sim" }, "/StageView": { target: "auto", openAtLaunch: true }, "/Hack": { target: "auto" } },
        prefs: { "/Projection": { text_scale: 999, hidden_kinds: ["lyrics", "nope"], content: "cifra", icon: "<script>", options: [1] }, "/Hack": { name: "x" } } }), { themes, displays });
    assert.deepEqual(odd.assignments, [{ key: "/StageView", assignment: { target: "auto", openAtLaunch: true, removed: false } }]);
    const f = odd.prefs[0].fields;
    assert.equal(odd.prefs.length, 1);
    assert.equal(f.text_scale, 140);
    assert.deepEqual(f.hidden_kinds, ["lyrics"]);
    assert.equal(f.content, "");
    assert.equal(f.icon, "");
    assert.deepEqual(f.options, {});
});

test("a placement is only one the app writes", () => {
    assert.deepEqual(cleanAssignment({ target: "window", openAtLaunch: true }), { target: "window", openAtLaunch: true, removed: false });
    assert.deepEqual(cleanAssignment({ target: { id: "7", label: "TV", width: "1920", height: 1080 } }), { target: { id: 7, label: "TV", width: 1920, height: 1080 }, openAtLaunch: false, removed: false });
    assert.equal(cleanAssignment({ target: "lua" }), null);
    assert.equal(cleanAssignment(null), null);
    assert.equal(OUTPUT_KEYS.length, 6);
});

test("a removed output travels in the file and is said on import", () => {
    const outs = [...outputs.slice(0, 2), { key: "/CommunicationProjection", assignment: { target: "auto", openAtLaunch: false, removed: true } }];
    const f = buildOutputsFile({ outputs: outs, prefRows, themes, displays });
    assert.equal(f.assignments["/CommunicationProjection"].removed, true);
    const r = readOutputsFile(JSON.stringify(f), { themes, displays });
    assert.equal(r.assignments.find((a) => a.key === "/CommunicationProjection").assignment.removed, true);
    assert.ok(r.notes.some((n) => /Avisos: removida neste arquivo/.test(n)), r.notes.join(" | "));
    // A file from an older KERYX (no removed field) means every output present.
    assert.equal(cleanAssignment({ target: "auto" }).removed, false);
});

test("applying updates the page's row or creates one, never deletes", () => {
    const prefs = [{ path: "/Projection", fields: { name: "A" } }, { path: "/StreamView", fields: { name: "B" } }];
    assert.deepEqual(prefWrites(prefs, prefRows), [
        { op: "update", id: "r1", data: { name: "A" } },
        { op: "create", data: { screen_path: "/StreamView", name: "B" } },
    ]);
});

test("the file knows the same outputs as the main process (electron/outputs.cjs)", async () => {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const { OUTPUTS } = require("../../electron/outputs.cjs");
    assert.deepEqual([...OUTPUTS.map((o) => o.key)].sort(), [...OUTPUT_KEYS].sort());
});

test("the design travels whole; an old file still matches its layout by name", () => {
    const el = { id: "e1", type: "clock", x: 1, y: 1, w: 20, h: 10 };
    const layouts = [{ id: "L1", name: "Palco banda", category: "palco", elements: [el] }];
    const rows = [
        { id: "r2", screen_path: "/Projection", design: { elements: [el], background: {} } },
        { id: "r3", screen_path: "/StageView", layout_id: "L1" },
    ];
    const f = buildOutputsFile({ outputs, prefRows: rows, themes, layouts, displays });
    assert.equal(f.prefs["/Projection"].design.elements[0].id, "e1", "the screen's own design is in the file");
    assert.equal(f.prefs["/StageView"].design.elements[0].id, "e1", "an old layout_id exports as the design it named");
    assert.equal(f.prefs["/StageView"].layout_name, "Palco banda", "the old fields ride along for old apps");
    const text = JSON.stringify(f);
    // On another computer with no layouts at all, the design still lands.
    const other = readOutputsFile(text, { themes, layouts: [], displays });
    assert.equal(other.prefs.find((p) => p.path === "/Projection").fields.design.elements[0].id, "e1");
    assert.equal(other.prefs.find((p) => p.path === "/StageView").fields.design.elements[0].id, "e1");
    assert.ok(!other.notes.some((n) => /desenho/.test(n)));
    // An OLD file (no design): the layout matches by name, else it is said.
    const old = JSON.parse(text);
    delete old.prefs["/StageView"].design;
    const named = readOutputsFile(JSON.stringify(old), { themes, layouts: [{ id: "X9", name: "palco BANDA", elements: [el] }], displays });
    assert.equal(named.prefs.find((p) => p.path === "/StageView").fields.design.elements[0].id, "e1", "matched by name, embedded as design");
    const none = readOutputsFile(JSON.stringify(old), { themes, layouts: [], displays });
    assert.equal(none.prefs.find((p) => p.path === "/StageView").fields.design, null);
    assert.ok(none.notes.some((n) => /Palco: o desenho “Palco banda”/.test(n)));
});
