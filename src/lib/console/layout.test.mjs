import test from "node:test";
import assert from "node:assert/strict";
import { tierFor, MODULES, TIER_WIDE, TIER_MEDIUM, DENSITIES, DEFAULT_LAYOUT, densityOf, shownDensity, panelHead, loadLayout, restoreEnv, switchTier, normalizeFolded, toggleFolded, foldedList } from "./layout.js";
import { DEFAULT_ORDER, DEFAULT_STACKS } from "./arrange.js";
import { DEFAULT_TILES } from "./multiview.js";
import { DEFAULT_TABS } from "./panelTabs.js";

// localStorage stand-in for loadLayout.
const withStore = (saved, fn) => {
    const prev = globalThis.localStorage;
    globalThis.localStorage = { getItem: () => (saved == null ? null : JSON.stringify(saved)), setItem() {} };
    try { return fn(); } finally { globalThis.localStorage = prev; }
};

test("the column order is part of the layout; an old save gets the default order", () => {
    assert.deepEqual(DEFAULT_LAYOUT.order, DEFAULT_ORDER);
    assert.deepEqual(DEFAULT_LAYOUT.stacks, DEFAULT_STACKS);
    const old = withStore({ libW: 300, hidden: { tl: true } }, () => loadLayout("x"));
    assert.equal(old.libW, 300);
    assert.deepEqual(old.order, DEFAULT_ORDER);
    assert.deepEqual(old.stacks, DEFAULT_STACKS);
    const odd = withStore({ order: { culto: ["side", "side", "live", "zz"] } }, () => loadLayout("x"));
    assert.deepEqual(odd.order.culto, ["side", "live", "lib", "slides"]);
    assert.deepEqual(odd.order.biblia, DEFAULT_ORDER.biblia);
});

test("the Bíblia's two side columns have their default widths (the first dock reads them)", () => {
    assert.equal(DEFAULT_LAYOUT.bibleSelW, 300);
    assert.equal(DEFAULT_LAYOUT.bibleAirW, 400);
});

test("Restaurar posições: order, stacks and sizes back; shown modules and density kept", () => {
    const mine = { ...DEFAULT_LAYOUT, hidden: { tl: true }, density: "compact", libW: 400, camadasH: 500, order: { ...DEFAULT_ORDER, culto: ["live", "lib", "slides", "side"] } };
    const back = restoreEnv(mine, "culto");
    assert.deepEqual(back.order, DEFAULT_ORDER);
    assert.equal(back.libW, DEFAULT_LAYOUT.libW);
    assert.equal(back.camadasH, DEFAULT_LAYOUT.camadasH);
    assert.deepEqual(back.hidden, { tl: true });
    assert.equal(back.density, "compact");
});

test("density: Automática, Confortável or Compacta, anything else falls back to the default", () => {
    assert.deepEqual(DENSITIES.map(([k]) => k), ["auto", "comfortable", "compact"]);
    assert.equal(DEFAULT_LAYOUT.density, "auto");
    // Automática: Compacta on a short grid (a notebook), Confortável otherwise; a choice wins.
    assert.equal(shownDensity({ density: "auto" }, 700), "compact");
    assert.equal(shownDensity({ density: "auto" }, 990), "comfortable");
    assert.equal(shownDensity({ density: "comfortable" }, 700), "comfortable");
    assert.equal(shownDensity({ density: "compact" }, 990), "compact");
    assert.deepEqual([panelHead("compact"), panelHead("comfortable")], [32, 36]);
    assert.equal(densityOf({ density: "compact" }), "compact");
    assert.equal(densityOf({ density: "comfortable" }), "comfortable");
    assert.equal(densityOf({}), DEFAULT_LAYOUT.density); // a layout saved before densities existed
    assert.equal(densityOf({ density: "huge" }), DEFAULT_LAYOUT.density);
    assert.equal(densityOf(null), DEFAULT_LAYOUT.density);
});

test("tiers follow the console grid's width", () => {
    assert.equal(tierFor(1920), "wide");
    assert.equal(tierFor(TIER_WIDE), "wide");
    assert.equal(tierFor(TIER_WIDE - 1), "medium");
    assert.equal(tierFor(TIER_MEDIUM), "medium");
    assert.equal(tierFor(TIER_MEDIUM - 1), "narrow");
    assert.equal(tierFor(948), "narrow"); // the 960 px Electron minimum, minus the padding
});

test("the default Electron window (1440) is wide, not compact", () => {
    // 1440 minus the scrollbar-free frame and the 6 px padding on each side.
    assert.equal(tierFor(1440 - 12), "wide");
});

test("Camadas and No ar are modules in Ver (the Setlist never hides); the right column is rightW wide, Camadas camadasH tall", () => {
    assert.deepEqual(MODULES.map(([key]) => key), ["lib", "slides", "abas", "camadas", "temas", "onair"]);
    assert.ok(DEFAULT_LAYOUT.camadasH < 400, "the Setlist gets most of the column");
    const old = withStore({ libW: 300 }, () => loadLayout("x")); // a save from the two-band console
    assert.equal(old.camadasH, DEFAULT_LAYOUT.camadasH);
});

test("the tab rows are part of the layout; an old or broken save gets the defaults", () => {
    assert.deepEqual(DEFAULT_LAYOUT.tabs, DEFAULT_TABS);
    assert.deepEqual(withStore({ libW: 300 }, () => loadLayout("x")).tabs, DEFAULT_TABS);
    const mine = withStore({ tabs: { panel: ["historico", "notas", "zz"], lib: [] } }, () => loadLayout("x"));
    assert.deepEqual(mine.tabs, { panel: ["notas", "historico"], lib: DEFAULT_TABS.lib });
});

test("the multiview is off by default; a saved one keeps its outputs, cleaned", () => {
    assert.equal(DEFAULT_LAYOUT.multiview, false);
    assert.deepEqual(DEFAULT_LAYOUT.mvTiles, DEFAULT_TILES);
    const old = withStore({ libW: 300 }, () => loadLayout("x"));
    assert.equal(old.multiview, false);
    assert.deepEqual(old.mvTiles, DEFAULT_TILES);
    const mine = withStore({ multiview: true, mvTiles: ["/PastorView", "/PastorView", "/Nope"] }, () => loadLayout("x"));
    assert.equal(mine.multiview, true);
    assert.deepEqual(mine.mvTiles, ["/PastorView", "/Projection", "/LyricProjection", "/StageView"]);
    assert.equal(withStore({ multiview: "yes" }, () => loadLayout("x")).multiview, false);
});

test("restoring one environment leaves the other's arrangement as it is", () => {
    const custom = { ...DEFAULT_LAYOUT, dock: { tree: null, hidden: [] }, dockPreset: "c1", libW: 400, bibleDock: { env: "biblia", tree: null, hidden: [] }, bibleDockPreset: "b1", bibleSelW: 350,
        order: { culto: ["live", "lib", "slides", "side"], biblia: ["air", "reading", "picker"] }, stacks: { ...DEFAULT_STACKS, side: ["roteiro", "camadas"], picker: ["verses", "books", "chapters"] } };
    const culto = restoreEnv(custom, "culto");
    assert.equal(culto.dock, null);
    assert.equal(culto.dockPreset, null);
    assert.equal(culto.libW, DEFAULT_LAYOUT.libW);
    assert.deepEqual(culto.order.culto, DEFAULT_ORDER.culto);
    assert.deepEqual(culto.stacks.side, DEFAULT_STACKS.side);
    assert.equal(culto.trayFromChurch, false, "Padrão brings every module back, whatever the church once hid");
    assert.equal(culto.bibleDockPreset, "b1", "the Bíblia's untouched");
    assert.equal(culto.bibleSelW, 350);
    assert.deepEqual(culto.order.biblia, ["air", "reading", "picker"]);
    assert.deepEqual(culto.stacks.picker, ["verses", "books", "chapters"]);
    const biblia = restoreEnv(custom, "biblia");
    assert.equal(biblia.bibleDock, null);
    assert.equal(biblia.bibleDockPreset, null);
    assert.deepEqual(biblia.order.biblia, DEFAULT_ORDER.biblia);
    assert.deepEqual(biblia.stacks.picker, DEFAULT_STACKS.picker);
    assert.equal(biblia.dockPreset, "c1", "the culto's untouched");
    assert.equal(biblia.libW, 400);
});

test("one culto arrangement per width tier: the big monitor's never squeezes the notebook", () => {
    const big = { tree: { tabs: ["programa"], active: "programa" }, hidden: [] };
    const small = { tree: { tabs: ["previa"], active: "previa" }, hidden: [] };
    // A save from before the tiers: its dock is the wide tier's.
    const old = { ...DEFAULT_LAYOUT, dock: big, dockPreset: "p1" };
    const onNotebook = switchTier(old, "medium");
    assert.equal(onNotebook.dock, null, "the medium tier starts as the console's own");
    assert.equal(onNotebook.dockPreset, null);
    assert.equal(onNotebook.dockTier, "medium");
    assert.deepEqual(onNotebook.tierDocks.wide, { dock: big, dockPreset: "p1" });
    // Arranged on the notebook, then back on the big monitor, then the notebook again.
    const back = switchTier({ ...onNotebook, dock: small }, "wide");
    assert.deepEqual([back.dock, back.dockPreset, back.dockTier], [big, "p1", "wide"]);
    const again = switchTier(back, "medium");
    assert.deepEqual(again.dock, small);
    // The same tier: nothing changes (the same object once it is marked).
    assert.equal(switchTier(again, "medium"), again);
    // A fresh console just takes the tier it opens on.
    const fresh = switchTier(DEFAULT_LAYOUT, "narrow");
    assert.deepEqual([fresh.dock, fresh.dockTier, fresh.tierDocks], [null, "narrow", {}]);
    // Saved and loaded: the tiers' docks come back, cleaned.
    withStore({ ...again, tierDocks: { ...again.tierDocks, bogus: { dock: big } } }, () => {
        const l = loadLayout("");
        assert.equal(l.dockTier, "medium");
        assert.deepEqual(Object.keys(l.tierDocks).sort(), ["medium", "wide"], "the bogus tier is dropped");
        assert.equal(l.tierDocks.wide.dockPreset, "p1");
    });
});

test("folded panels (Rodada F4): per computer, cleaned, the No ar strip's old minimize migrated", () => {
    assert.deepEqual(DEFAULT_LAYOUT.folded, {});
    // An old save minimized the No ar strip: it is the strip's fold now, and onairMin is gone.
    const old = withStore({ libW: 300, onairMin: true }, () => loadLayout("x"));
    assert.deepEqual(old.folded, { onair: true });
    assert.equal("onairMin" in old, false);
    assert.deepEqual(withStore({ onairMin: false }, () => loadLayout("x")).folded, {});
    // Only modules that fold, only true: the Programa, the Prévia, the player
    // and the Bíblia's panels never (a Texto folded before 2026-10-16 opens); unknown ids go.
    const mine = withStore({ folded: { lib: true, camadas: true, reading: true, programa: true, previa: true, player: true, zz: true, slides: "yes", setlist: false } }, () => loadLayout("x"));
    assert.deepEqual(mine.folded, { lib: true, camadas: true });
    assert.deepEqual(normalizeFolded(["lib"]), {});
    assert.deepEqual(normalizeFolded(null, true), { onair: true });
    // The chevron: folded and back; a module that never folds stays as it is.
    const f = toggleFolded({}, "camadas");
    assert.deepEqual(f, { camadas: true });
    assert.deepEqual(toggleFolded(f, "camadas"), {});
    assert.deepEqual(toggleFolded(f, "programa"), f);
    assert.deepEqual(foldedList({ lib: true, books: true, x: false }), ["lib", "books"]);
    // Restaurar posições opens the panels of the environment on screen, not the other's.
    const both = { ...DEFAULT_LAYOUT, folded: { lib: true, setlist: true, books: true, reading: true } };
    assert.deepEqual(restoreEnv(both, "culto").folded, { books: true, reading: true });
    assert.deepEqual(restoreEnv(both, "biblia").folded, { lib: true, setlist: true });
});

test("the songs' second line (Rodada G1): the artist off, the key and length on, until saved otherwise", () => {
    assert.equal(DEFAULT_LAYOUT.libShowKey, true);
    assert.equal(DEFAULT_LAYOUT.libShowLength, true);
    const old = withStore({ libW: 300 }, () => loadLayout("x"));
    assert.equal(old.libShowKey, true);
    assert.equal(old.libShowLength, true);
    const off = withStore({ libShowKey: false, libShowLength: false }, () => loadLayout("x"));
    assert.equal(off.libShowKey, false);
    assert.equal(off.libShowLength, false);
    assert.equal(DEFAULT_LAYOUT.libShowArtist, false);
    assert.equal(withStore(null, () => loadLayout("x")).libShowArtist, false);
    assert.equal(withStore({ libW: 300 }, () => loadLayout("x")).libShowArtist, false, "a save from before the option");
    assert.equal(withStore({ libShowArtist: true }, () => loadLayout("x")).libShowArtist, true);
    assert.equal(withStore({ libShowArtist: "yes" }, () => loadLayout("x")).libShowArtist, false);
});
