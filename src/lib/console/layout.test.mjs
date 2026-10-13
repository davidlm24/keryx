import test from "node:test";
import assert from "node:assert/strict";
import { tierFor, MODULES, TIER_WIDE, TIER_MEDIUM, DENSITIES, DEFAULT_LAYOUT, LIMITS, densityOf, loadLayout, restoreArrangement, restoreEnv, clampSize, sideCol } from "./layout.js";
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

test("the Bíblia's two side columns are resizable, with limits", () => {
    assert.deepEqual(LIMITS.bibleSelW, [240, 520]);
    assert.deepEqual(LIMITS.bibleAirW, [300, 560]);
    assert.equal(DEFAULT_LAYOUT.bibleSelW, 300);
    assert.equal(DEFAULT_LAYOUT.bibleAirW, 400);
});

test("Restaurar posições: order, stacks and sizes back; shown modules and density kept", () => {
    const mine = { ...DEFAULT_LAYOUT, hidden: { tl: true }, density: "compact", libW: 400, camadasH: 500, bibleAirW: 500, order: { ...DEFAULT_ORDER, culto: ["live", "lib", "slides", "side"] } };
    const back = restoreArrangement(mine);
    assert.deepEqual(back.order, DEFAULT_ORDER);
    assert.equal(back.libW, DEFAULT_LAYOUT.libW);
    assert.equal(back.camadasH, DEFAULT_LAYOUT.camadasH);
    assert.equal(back.bibleAirW, DEFAULT_LAYOUT.bibleAirW);
    assert.deepEqual(back.hidden, { tl: true });
    assert.equal(back.density, "compact");
});

test("density: Confortável or Compacta, anything else falls back to the default", () => {
    assert.deepEqual(DENSITIES.map(([k]) => k), ["comfortable", "compact"]);
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

test("Camadas is a module in Ver (the Setlist never hides); the right column is rightW wide, Camadas camadasH tall", () => {
    assert.deepEqual(MODULES.map(([key]) => key), ["lib", "slides", "camadas"]);
    assert.deepEqual(LIMITS.rightW, [280, 520]);
    assert.deepEqual(LIMITS.camadasH, [120, 640]);
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

test("the Slides never get narrower than a slide's line: 300 px, the splitter's limit", () => {
    assert.deepEqual(LIMITS.slidesW, [300, 520]);
    assert.ok(DEFAULT_LAYOUT.slidesW >= LIMITS.slidesW[0]);
    assert.equal(clampSize("slidesW", 120), 300, "the splitter dragged below the minimum stops there");
    assert.equal(clampSize("slidesW", 410), 410);
    assert.equal(sideCol("slidesW", 250).minWidth, 300, "an old save below the minimum still renders at it");
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
