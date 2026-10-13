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
    const a = normalizeArrangement({ order: { biblia: ["air", "reading"] }, stacks: { side: ["roteiro"] } }); // roteiro: the Setlist card from before 2026-10-13
    assert.deepEqual(a.order.biblia, ["air", "reading", "picker"]);
    assert.deepEqual(a.order.culto, DEFAULT_ORDER.culto);
    assert.deepEqual(a.stacks.side, ["camadas"], "a card that no longer exists is dropped in silence");
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

test("wide: four columns in the saved order; the side column is Camadas", () => {
    assert.deepEqual(ids(cultoColumns({ tier: "wide" })), ["lib", "slides", "live", "side"]);
    assert.deepEqual(cultoColumns({ tier: "wide" })[3].cards, ["camadas"]);
    const swapped = cultoColumns({ tier: "wide", order: ["side", "live", "slides", "lib"], stacks: { side: ["roteiro", "camadas"] } });
    assert.deepEqual(ids(swapped), ["side", "live", "slides", "lib"]);
    assert.deepEqual(swapped[0].cards, ["camadas"], "the old Setlist card id is dropped");
});

test("hidden modules drop their column; the side column goes when Camadas is hidden", () => {
    assert.deepEqual(ids(cultoColumns({ tier: "wide", hidden: { lib: true } })), ["slides", "live", "side"]);
    assert.deepEqual(ids(cultoColumns({ tier: "wide", hidden: { camadas: true } })), ["lib", "slides", "live"]);
});

test("medium: no Camadas/Setlist column, the rest keeps the order", () => {
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

test("moving a column writes it back into the full order; ids off screen stay put", () => {
    const wide = cultoColumns({ tier: "wide" });
    assert.deepEqual(moveColumn(DEFAULT_ORDER.culto, wide, "side", 0), ["side", "lib", "slides", "live"]);
    // Medium: the side column is not on screen; it keeps its slot at the end.
    const medium = cultoColumns({ tier: "medium" });
    assert.deepEqual(moveColumn(DEFAULT_ORDER.culto, medium, "live", 0), ["live", "lib", "slides", "side"]);
    // Narrow: the source column carries Biblioteca and Slides together.
    const narrow = cultoColumns({ tier: "narrow" });
    assert.deepEqual(moveColumn(DEFAULT_ORDER.culto, narrow, "source", 1), ["live", "lib", "slides", "side"]);
    // Nothing moved: the same order back.
    assert.equal(moveColumn(DEFAULT_ORDER.culto, wide, "lib", 0), DEFAULT_ORDER.culto);
});

test("splitters sit on the side of each fixed column that faces the flexible one", () => {
    // Today's console, unchanged: the first splitter grows the column before it.
    assert.deepEqual(shape(withSplits(cultoColumns({ tier: "wide" }))), ["lib", "|libW+", "slides", "|slidesW+", "live", "|rightW-", "side"]);
    // The Programa first: every column is to its right.
    assert.deepEqual(shape(withSplits(cultoColumns({ tier: "wide", order: ["live", "lib", "slides", "side"] }))), ["live", "|libW-", "lib", "|slidesW-", "slides", "|rightW-", "side"]);
    // The Programa last.
    assert.deepEqual(shape(withSplits(cultoColumns({ tier: "wide", order: ["side", "lib", "slides", "live"] }))), ["side", "|rightW+", "lib", "|libW+", "slides", "|slidesW+", "live"]);
    // One fixed column, one splitter.
    for (const order of [["live", "side", "lib", "slides"], ["lib", "live", "slides", "side"]]) {
        const items = withSplits(cultoColumns({ tier: "wide", order }));
        const keys = items.filter((x) => x.type === "split").map((x) => x.key);
        assert.deepEqual([...keys].sort(), ["libW", "rightW", "slidesW"]);
    }
    // The Bíblia, default and with the text on the left.
    assert.deepEqual(shape(withSplits(bibleColumns())), ["picker", "|bibleSelW+", "reading", "|bibleAirW-", "air"]);
    assert.deepEqual(shape(withSplits(bibleColumns({ order: ["reading", "picker", "air"] }))), ["reading", "|bibleSelW-", "picker", "|bibleAirW-", "air"]);
    // A lone column: no splitter.
    assert.deepEqual(shape(withSplits(cultoColumns({ tier: "narrow", hidden: { lib: true, slides: true } }))), ["live"]);
});

test("the splitter between Camadas and the Setlist follows Camadas", () => {
    assert.deepEqual(stackSplit(["camadas", "roteiro"], "camadas"), { sign: 1 });
    assert.deepEqual(stackSplit(["roteiro", "camadas"], "camadas"), { sign: -1 });
    assert.equal(stackSplit(["roteiro"], "camadas"), null);
    assert.equal(stackSplit(["camadas", "roteiro"], "camadas", { camadas: true }), null);
});
