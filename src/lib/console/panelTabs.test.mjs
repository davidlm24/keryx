import test from "node:test";
import assert from "node:assert/strict";
import { PANEL_TABS, DEFAULT_TABS, normalizeRow, normalizeTabs, toggleTab, showTab, tabsMenu, shownTabs, activeTab } from "./panelTabs.js";

test("the panel beside the Prévia and the Biblioteca: what each offers and shows by default", () => {
    assert.deepEqual(PANEL_TABS.panel.map((t) => t.id), ["notas", "aviso", "timers", "ferramentas", "historico"]);
    assert.deepEqual(DEFAULT_TABS.panel, ["notas", "aviso", "timers"]);
    assert.deepEqual(DEFAULT_TABS.lib, ["letras", "imagens", "videos", "avisos"]);
});

test("a saved row is made safe: known ids, the list's order, never empty", () => {
    assert.deepEqual(normalizeRow("panel", ["historico", "notas", "notas", "nope"]), ["notas", "historico"]);
    assert.deepEqual(normalizeRow("panel", []), DEFAULT_TABS.panel, "zero tabs is the defaults");
    assert.deepEqual(normalizeRow("panel", "junk"), DEFAULT_TABS.panel);
    assert.deepEqual(normalizeRow("lib", ["setlist", "zz"]), DEFAULT_TABS.lib, "only unknown ids: the defaults");
    assert.deepEqual(normalizeTabs(undefined), DEFAULT_TABS, "a layout saved before the tabs existed");
    assert.deepEqual(normalizeTabs({ lib: ["avisos", "letras"] }), { panel: DEFAULT_TABS.panel, lib: ["letras", "avisos"] });
});

test("the (+): unchecking hides a tab, checking puts it back in its place, the last one stays", () => {
    assert.deepEqual(toggleTab("panel", DEFAULT_TABS.panel, "aviso"), ["notas", "timers"]);
    assert.deepEqual(toggleTab("panel", ["notas", "timers"], "historico"), ["notas", "timers", "historico"]);
    assert.deepEqual(toggleTab("panel", ["timers", "historico"], "aviso"), ["aviso", "timers", "historico"]);
    assert.deepEqual(toggleTab("lib", ["videos"], "videos"), ["videos"], "at least one always checked");
    assert.deepEqual(toggleTab("lib", ["videos"], "nope"), ["videos"]);
    const menu = tabsMenu("lib", ["videos"]);
    assert.deepEqual(menu.map((t) => t.checked), [false, false, true, false]);
    assert.equal(menu.find((t) => t.id === "videos").last, true, "the last one says it cannot go");
});

test("the tabs on screen, and the one in front", () => {
    assert.deepEqual(shownTabs("panel", ["historico", "notas"]).map((t) => t.name), ["Notas", "Esteve no ar"]);
    assert.equal(activeTab("panel", ["notas", "historico"], "historico"), "historico");
    assert.equal(activeTab("panel", ["notas", "historico"], "aviso"), "notas", "a hidden tab hands over to the first");
    assert.deepEqual(showTab("lib", ["letras"], "avisos"), ["letras", "avisos"]);
});
