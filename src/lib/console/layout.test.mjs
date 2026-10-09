import test from "node:test";
import assert from "node:assert/strict";
import { tierFor, MODULES, TIER_WIDE, TIER_MEDIUM, DENSITIES, DEFAULT_LAYOUT, densityOf } from "./layout.js";

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

test("Camadas is a drawer, not a module in Ver", () => {
    assert.ok(!MODULES.some(([key]) => key === "camadas"));
    assert.deepEqual(MODULES.map(([key]) => key), ["lib", "slides", "roteiro", "tl"]);
});
