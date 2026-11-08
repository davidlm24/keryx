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
    const rows = ({ panel, lib }) => ({ panel, lib });
    assert.deepEqual(rows(normalizeTabs(undefined)), DEFAULT_TABS, "a layout saved before the tabs existed");
    assert.deepEqual(rows(normalizeTabs({ lib: ["avisos", "letras"] })), { panel: DEFAULT_TABS.panel, lib: ["letras", "avisos"] });
    // A row's own list stays as saved; the console shows a tab on purpose
    // with showTab, in its place.
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

test("a tab checked by default appears once on a list saved before it existed, and stays hidden once hidden", () => {
    // Saved before Pedidos and Chat (no `seen`): both come, in their places.
    const old = normalizeTabs({ panel: ["notas", "historico"], lib: ["letras"] });
    assert.deepEqual(old.panel, ["notas", "pedidos", "chat", "historico"]);
    assert.deepEqual(old.lib, ["letras"], "the Biblioteca had every tab already: nothing comes back");
    assert.deepEqual(old.seen, { panel: PANEL_TABS.panel.map((t) => t.id), lib: PANEL_TABS.lib.map((t) => t.id) });
    // The operator hides Chat afterwards: the save carries `seen`, so it stays out.
    const hidden = { ...old, panel: toggleTab("panel", old.panel, "chat") };
    assert.deepEqual(normalizeTabs(hidden).panel, ["notas", "pedidos", "historico"]);
    // A tab off by default never comes by itself.
    assert.ok(!normalizeTabs({ panel: ["notas"] }).panel.includes("ferramentas"));
    // A broken seen is read as an old save.
    assert.deepEqual(normalizeTabs({ panel: ["notas"], seen: { panel: "x" } }).panel, ["notas", "pedidos", "chat"]);
});
