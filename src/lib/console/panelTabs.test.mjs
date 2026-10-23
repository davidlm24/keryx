import test from "node:test";
import assert from "node:assert/strict";
import { PANEL_TABS, DEFAULT_TABS, normalizeRow, normalizeTabs, toggleTab, showTab, tabsMenu, shownTabs, activeTab, libMediaKinds } from "./panelTabs.js";

test("the panel beside the Prévia and the Biblioteca: what each offers and shows by default", () => {
    assert.deepEqual(PANEL_TABS.panel.map((t) => t.id), ["notas", "aviso", "timers", "pedidos", "chat", "ferramentas", "historico"]);
    assert.deepEqual(DEFAULT_TABS.panel, ["notas", "aviso", "timers", "pedidos", "chat"]);
    assert.deepEqual(DEFAULT_TABS.lib, ["letras", "imagens", "videos", "avisos"]);
    assert.deepEqual(PANEL_TABS.lib.map((t) => t.id), ["letras", "imagens", "videos", "avisos", "audios", "apresentacoes"], "Áudios and Apresentações in the (+), off at first");
});

test("Áudios and Apresentações take their files out of Vídeos and Imagens only while shown", () => {
    const base = DEFAULT_TABS.lib;
    assert.deepEqual(libMediaKinds("videos", base), ["video", "audio"], "hidden: Vídeos keeps the audio");
    assert.deepEqual(libMediaKinds("imagens", base), ["image", "gif", "pdf", "powerpoint"]);
    assert.deepEqual(libMediaKinds("videos", [...base, "audios"]), ["video"]);
    assert.deepEqual(libMediaKinds("audios", [...base, "audios"]), ["audio"]);
    assert.deepEqual(libMediaKinds("imagens", [...base, "apresentacoes"]), ["image", "gif"]);
    assert.deepEqual(libMediaKinds("apresentacoes", [...base, "apresentacoes"]), ["pdf", "powerpoint"]);
    assert.equal(libMediaKinds("letras", base), null, "not a media tab");
});

test("a saved row is made safe: known ids, the list's order, never empty", () => {
    assert.deepEqual(normalizeRow("panel", ["historico", "notas", "notas", "nope"]), ["notas", "historico"]);
    assert.deepEqual(normalizeRow("panel", []), DEFAULT_TABS.panel, "zero tabs is the defaults");
    assert.deepEqual(normalizeRow("panel", "junk"), DEFAULT_TABS.panel);
    assert.deepEqual(normalizeRow("lib", ["setlist", "zz"]), DEFAULT_TABS.lib, "only unknown ids: the defaults");
    assert.deepEqual(normalizeTabs(undefined), DEFAULT_TABS, "a layout saved before the tabs existed");
    assert.deepEqual(normalizeTabs({ lib: ["avisos", "letras"] }), { panel: DEFAULT_TABS.panel, lib: ["letras", "avisos"] });
    // A list saved before Pedidos (Rodada Q) keeps it out until a message
    // arrives: then the console shows it (showTab), in its place.
    assert.deepEqual(normalizeRow("panel", ["notas", "aviso", "timers"]), ["notas", "aviso", "timers"]);
    assert.deepEqual(showTab("panel", ["notas", "aviso", "timers", "historico"], "pedidos"), ["notas", "aviso", "timers", "pedidos", "historico"]);
});

test("the (+): unchecking hides a tab, checking puts it back in its place, the last one stays", () => {
    assert.deepEqual(toggleTab("panel", DEFAULT_TABS.panel, "aviso"), ["notas", "timers", "pedidos", "chat"]);
    assert.deepEqual(toggleTab("panel", ["notas", "timers"], "historico"), ["notas", "timers", "historico"]);
    assert.deepEqual(toggleTab("panel", ["timers", "historico"], "aviso"), ["aviso", "timers", "historico"]);
    assert.deepEqual(toggleTab("lib", ["videos"], "videos"), ["videos"], "at least one always checked");
    assert.deepEqual(toggleTab("lib", ["videos"], "nope"), ["videos"]);
    const menu = tabsMenu("lib", ["videos"]);
    assert.deepEqual(menu.map((t) => t.checked), [false, false, true, false, false, false], "Áudios and Apresentações listed, unchecked");
    assert.equal(menu.find((t) => t.id === "videos").last, true, "the last one says it cannot go");
});

test("the tabs on screen, and the one in front", () => {
    assert.deepEqual(shownTabs("panel", ["historico", "notas"]).map((t) => t.name), ["Notas", "Esteve no ar"]);
    assert.equal(activeTab("panel", ["notas", "historico"], "historico"), "historico");
    assert.equal(activeTab("panel", ["notas", "historico"], "aviso"), "notas", "a hidden tab hands over to the first");
    assert.deepEqual(showTab("lib", ["letras"], "avisos"), ["letras", "avisos"]);
});
