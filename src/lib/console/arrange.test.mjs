import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ORDER, DEFAULT_STACKS, normalizeOrder, normalizeArrangement } from "./arrange.js";

test("a saved order is made safe: unknown and repeated ids go, missing ones come back", () => {
    assert.deepEqual(normalizeOrder(["side", "live"], DEFAULT_ORDER.culto), ["side", "live", "lib", "slides"]);
    assert.deepEqual(normalizeOrder(["lib", "lib", "nope", "live"], DEFAULT_ORDER.culto), ["lib", "live", "slides", "side"]);
    assert.deepEqual(normalizeOrder(null, DEFAULT_ORDER.biblia), DEFAULT_ORDER.biblia);
    assert.deepEqual(normalizeOrder("junk", DEFAULT_ORDER.biblia), DEFAULT_ORDER.biblia);
});

test("an arrangement saved before the order existed gets the defaults", () => {
    assert.deepEqual(normalizeArrangement({}), { order: DEFAULT_ORDER, stacks: DEFAULT_STACKS });
    const a = normalizeArrangement({ order: { biblia: ["air", "reading"] }, stacks: { side: ["roteiro"] } });
    assert.deepEqual(a.order.biblia, ["air", "reading", "picker"]);
    assert.deepEqual(a.order.culto, DEFAULT_ORDER.culto);
    assert.deepEqual(a.stacks.side, ["roteiro", "camadas"], "the Setlist's place is kept, Camadas comes back");
});

test("saves from the two-band console (2026-10-13) get the side column back in silence", () => {
    // #136/#138 saved the culto order without "side", and side: ["camadas"].
    const a = normalizeArrangement({ order: { culto: ["live", "lib", "slides"] }, stacks: { side: ["camadas"], source: ["slides", "lib"] } });
    assert.deepEqual(a.order.culto, ["live", "lib", "slides", "side"], "the side column comes back at the right");
    assert.deepEqual(a.stacks.side, ["camadas", "roteiro"]);
    assert.deepEqual(a.stacks.source, ["slides", "lib"]);
    // From before #136: the order and the stack as they were.
    const b = normalizeArrangement({ order: { culto: ["side", "lib", "slides", "live"] }, stacks: { side: ["roteiro", "camadas"] } });
    assert.deepEqual(b.order.culto, ["side", "lib", "slides", "live"]);
    assert.deepEqual(b.stacks.side, ["roteiro", "camadas"]);
});
