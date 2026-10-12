import test from "node:test";
import assert from "node:assert/strict";
import { tierFor, MODULES, TIER_WIDE, TIER_MEDIUM, DENSITIES, DEFAULT_LAYOUT, LIMITS, densityOf, loadLayout, restoreArrangement } from "./layout.js";
import { DEFAULT_ORDER, DEFAULT_STACKS } from "./arrange.js";
import { DEFAULT_TILES } from "./multiview.js";

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
    const mine = { ...DEFAULT_LAYOUT, hidden: { tl: true }, density: "compact", libW: 400, bibleAirW: 500, order: { ...DEFAULT_ORDER, culto: ["live", "lib", "slides", "side"] } };
    const back = restoreArrangement(mine);
    assert.deepEqual(back.order, DEFAULT_ORDER);
    assert.equal(back.libW, DEFAULT_LAYOUT.libW);
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

test("Camadas is a module in Ver again, above the Setlist", () => {
    assert.deepEqual(MODULES.map(([key]) => key), ["lib", "slides", "camadas", "roteiro"]);
    assert.deepEqual(LIMITS.camadasH, [120, 600]);
    assert.equal(DEFAULT_LAYOUT.camadasH, 300);
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
