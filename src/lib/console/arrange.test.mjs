import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ORDER, DEFAULT_STACKS, normalizeOrder, normalizeArrangement, moveTo, moveBy, cultoColumns, bibleColumns, moveColumn, withSplits, stackSplit } from "./arrange.js";

const ids = (cols) => cols.map((c) => c.id);
const shape = (items) => items.map((x) => (x.type === "col" ? x.col.id : `|${x.key}${x.sign < 0 ? "-" : "+"}`));

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

test("moving: to a position, by one step, clamped at the ends", () => {
    const list = ["a", "b", "c", "d"];
    assert.deepEqual(moveTo(list, "a", 2), ["b", "c", "a", "d"]);
    assert.deepEqual(moveTo(list, "d", 0), ["d", "a", "b", "c"]);
    assert.deepEqual(moveTo(list, "b", 99), ["a", "c", "d", "b"]);
    assert.equal(moveTo(list, "b", 1), list); // nothing moved: the same list
    assert.equal(moveTo(list, "zz", 0), list);
    assert.deepEqual(moveBy(list, "c", -1), ["a", "c", "b", "d"]);
    assert.equal(moveBy(list, "a", -1), list);
});

test("wide: four columns in the saved order, Camadas over the Setlist on the right", () => {
    const def = cultoColumns({ tier: "wide" });
    assert.deepEqual(ids(def), ["lib", "slides", "live", "side"]);
    assert.deepEqual(def[3].cards, ["camadas", "roteiro"]);
    assert.equal(def[3].widthKey, "rightW");
    const swapped = cultoColumns({ tier: "wide", order: ["side", "live", "slides", "lib"] });
    assert.deepEqual(ids(swapped), ["side", "live", "slides", "lib"]);
    assert.deepEqual(cultoColumns({ tier: "wide", stacks: { side: ["roteiro", "camadas"] } })[3].cards, ["roteiro", "camadas"]);
});

test("hidden modules drop their column; hiding Camadas leaves the Setlist alone, full height", () => {
    assert.deepEqual(ids(cultoColumns({ tier: "wide", hidden: { lib: true } })), ["slides", "live", "side"]);
    const noLayers = cultoColumns({ tier: "wide", hidden: { camadas: true } });
    assert.deepEqual(ids(noLayers), ["lib", "slides", "live", "side"]);
    assert.deepEqual(noLayers[3].cards, ["roteiro"]);
    assert.deepEqual(cultoColumns({ tier: "wide", hidden: { roteiro: true } })[3].cards, ["camadas", "roteiro"], "the Setlist is never hidden");
});

test("medium keeps the order without a side column", () => {
    assert.deepEqual(ids(cultoColumns({ tier: "medium" })), ["lib", "slides", "live"]);
    assert.deepEqual(ids(cultoColumns({ tier: "medium", order: ["live", "side", "slides", "lib"] })), ["live", "slides", "lib"]);
});

test("narrow: Biblioteca and Slides in one column, where the first of them is", () => {
    const def = cultoColumns({ tier: "narrow" });
    assert.deepEqual(ids(def), ["source", "live"]);
    assert.deepEqual(def[0].cards, ["lib", "slides"]);
    assert.deepEqual(def[0].members, ["lib", "slides"]);
    assert.deepEqual(ids(cultoColumns({ tier: "narrow", order: ["live", "lib", "side", "slides"] })), ["live", "source"]);
    assert.deepEqual(cultoColumns({ tier: "narrow", stacks: { source: ["slides", "lib"] } })[0].cards, ["slides", "lib"]);
    assert.deepEqual(ids(cultoColumns({ tier: "narrow", hidden: { lib: true, slides: true } })), ["live"]);
    assert.deepEqual(cultoColumns({ tier: "narrow", hidden: { lib: true } })[0].cards, ["slides"]);
});

test("Bíblia: three columns, the picker stacks Livros, Capítulos, Versículos", () => {
    const cols = bibleColumns();
    assert.deepEqual(ids(cols), ["picker", "reading", "air"]);
    assert.deepEqual(cols[0].cards, ["books", "chapters", "verses"]);
    assert.equal(cols[1].flex, true);
    assert.deepEqual(ids(bibleColumns({ order: ["reading", "picker", "air"] })), ["reading", "picker", "air"]);
});

test("moving a column writes it back into the full order", () => {
    const wide = cultoColumns({ tier: "wide" });
    assert.deepEqual(moveColumn(DEFAULT_ORDER.culto, wide, "live", 0), ["live", "lib", "slides", "side"]);
    assert.deepEqual(moveColumn(DEFAULT_ORDER.culto, wide, "side", 0), ["side", "lib", "slides", "live"]);
    // Narrow: the source column carries Biblioteca and Slides together; the
    // side column, not on screen, keeps its place.
    const narrow = cultoColumns({ tier: "narrow" });
    assert.deepEqual(moveColumn(DEFAULT_ORDER.culto, narrow, "source", 1), ["live", "lib", "slides", "side"]);
    // Nothing moved: the same order back.
    assert.equal(moveColumn(DEFAULT_ORDER.culto, wide, "lib", 0), DEFAULT_ORDER.culto);
});

test("splitters sit on the side of each fixed column that faces the flexible one", () => {
    // The console: each splitter grows the fixed column before the Programa.
    assert.deepEqual(shape(withSplits(cultoColumns({ tier: "wide" }))), ["lib", "|libW+", "slides", "|slidesW+", "live", "|rightW-", "side"]);
    assert.deepEqual(shape(withSplits(cultoColumns({ tier: "medium" }))), ["lib", "|libW+", "slides", "|slidesW+", "live"]);
    // The Programa first: every column is to its right.
    assert.deepEqual(shape(withSplits(cultoColumns({ tier: "wide", order: ["live", "lib", "slides", "side"] }))), ["live", "|libW-", "lib", "|slidesW-", "slides", "|rightW-", "side"]);
    // The Bíblia, default and with the text on the left.
    assert.deepEqual(shape(withSplits(bibleColumns())), ["picker", "|bibleSelW+", "reading", "|bibleAirW-", "air"]);
    assert.deepEqual(shape(withSplits(bibleColumns({ order: ["reading", "picker", "air"] }))), ["reading", "|bibleSelW-", "picker", "|bibleAirW-", "air"]);
    // A lone column: no splitter.
    assert.deepEqual(shape(withSplits(cultoColumns({ tier: "narrow", hidden: { lib: true, slides: true } }))), ["live"]);
});

test("the height splitter between Camadas and the Setlist", () => {
    assert.deepEqual(stackSplit(["camadas", "roteiro"], "camadas"), { sign: 1 });
    assert.deepEqual(stackSplit(["roteiro", "camadas"], "camadas"), { sign: -1 });
    assert.equal(stackSplit(["roteiro"], "camadas"), null, "Camadas hidden: the Setlist alone");
    assert.equal(stackSplit(["camadas", "roteiro"], "camadas", { camadas: true }), null, "Camadas collapsed: the Setlist takes the column");
});
