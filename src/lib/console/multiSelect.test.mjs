import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_SELECTION, clickSelection, stepSelection, leadIndex, selectAll, pruneSelection, pickedOf, selectionCount, SELECT_MANY } from "./multiSelect.js";

const order = ["a", "b", "c", "d", "e"];
const ctrl = { ctrlKey: true };
const shift = { shiftKey: true };

test("in a gallery a plain click picks one; Ctrl toggles; Shift adds the range from the anchor", () => {
    let { sel, handled } = clickSelection(EMPTY_SELECTION, order, "b");
    assert.deepEqual(sel, { ids: ["b"], anchor: "b", lead: "b" });
    assert.equal(handled, false, "a plain click also does the list's own thing (open, prepare)");
    ({ sel, handled } = clickSelection(sel, order, "d", ctrl));
    assert.deepEqual(sel.ids, ["b", "d"]);
    assert.equal(handled, true);
    assert.equal(sel.anchor, "d", "Ctrl moves the anchor");
    ({ sel } = clickSelection(sel, order, "b", ctrl));
    assert.deepEqual(sel.ids, ["d"], "Ctrl again unmarks");
    assert.equal(sel.anchor, "b", "and still moves the anchor (as the Mídia page always did)");
    ({ sel } = clickSelection(sel, order, "a", shift));
    assert.deepEqual(sel.ids, ["d", "a", "b"], "the range is added to what was marked");
    assert.equal(sel.anchor, "b");
    assert.equal(sel.lead, "a");
    assert.deepEqual(clickSelection(sel, order, "e", { metaKey: true }).sel.ids.at(-1), "e", "⌘ counts as Ctrl");
});

test("in a list that goes on air a plain click clears the selection and is not a selection click (M1 = A)", () => {
    const marked = { ids: ["a", "c"], anchor: "c", lead: "c" };
    const { sel, handled } = clickSelection(marked, order, "e", {}, { mode: "air" });
    assert.equal(handled, false, "the list prepares as it always did");
    assert.deepEqual(sel, EMPTY_SELECTION);
    const none = clickSelection(EMPTY_SELECTION, order, "e", {}, { mode: "air" });
    assert.equal(none.sel, EMPTY_SELECTION, "nothing marked: nothing changes");
    assert.equal(clickSelection(marked, order, "e", ctrl, { mode: "air" }).handled, true, "Ctrl never prepares");
    // Shift with no anchor yet (the first mark) marks just that one, without preparing.
    const first = clickSelection(EMPTY_SELECTION, order, "b", shift, { mode: "air" });
    assert.deepEqual([first.sel.ids, first.handled], [["b"], true]);
});

test("with Selecionar vários on, a plain click only marks or unmarks", () => {
    let { sel, handled } = clickSelection(EMPTY_SELECTION, order, "b", {}, { mode: "air", picking: true });
    assert.deepEqual([sel.ids, handled], [["b"], true]);
    ({ sel } = clickSelection(sel, order, "c", {}, { mode: "gallery", picking: true }));
    assert.deepEqual(sel.ids, ["b", "c"]);
    ({ sel } = clickSelection(sel, order, "b", {}, { picking: true }));
    assert.deepEqual(sel.ids, ["c"]);
});

test("a Shift range needs the anchor in what is shown (a search may have hidden it)", () => {
    const sel = { ids: ["x"], anchor: "x", lead: "x" };
    const { sel: next } = clickSelection(sel, order, "c", shift);
    assert.deepEqual(next.ids, ["c"], "in a gallery: just the one clicked, a new anchor");
    assert.equal(next.anchor, "c");
    const air = clickSelection(sel, order, "c", shift, { mode: "air" }).sel;
    assert.deepEqual(air.ids, ["x", "c"], "in a list that goes on air: added, never prepared");
});

test("the arrows: one item, or with Shift the range from the anchor, replacing", () => {
    const sel = { ids: ["b", "e"], anchor: "b", lead: "e" };
    assert.deepEqual(stepSelection(sel, order, 3), { ids: ["d"], anchor: "d", lead: "d" });
    assert.deepEqual(stepSelection(sel, order, 3, { shift: true }), { ids: ["b", "c", "d"], anchor: "b", lead: "d" });
    assert.equal(stepSelection(sel, order, 9), sel, "past the end: unchanged");
    assert.equal(leadIndex(sel, order), 4);
    assert.equal(leadIndex({ ids: ["b", "x"], anchor: null, lead: "x" }, order), 1, "the lead hidden: the last marked shown");
    assert.equal(leadIndex(EMPTY_SELECTION, order), -1);
});

test("Ctrl+A marks what is shown; deleted ids leave the selection", () => {
    assert.deepEqual(selectAll(order), { ids: order, anchor: "a", lead: "e" });
    assert.equal(selectAll([]), EMPTY_SELECTION);
    const sel = { ids: ["a", "c", "e"], anchor: "c", lead: "e" };
    assert.equal(pruneSelection(sel, order), sel, "nothing gone: the same object");
    assert.deepEqual(pruneSelection(sel, new Set(["a", "e"])), { ids: ["a", "e"], anchor: null, lead: "e" });
});

test("a bulk action acts on what is marked AND shown, in the list's order", () => {
    const items = order.map((id) => ({ id }));
    const sel = { ids: ["e", "a", "x"], anchor: null, lead: null };
    assert.deepEqual(pickedOf(sel, items).map((x) => x.id), ["a", "e"]);
    assert.deepEqual(pickedOf(EMPTY_SELECTION, items), []);
    assert.deepEqual(pickedOf({ ids: ["k:b"] }, items, (x) => `k:${x.id}`).map((x) => x.id), ["b"]);
});

test("the bar's count and the button's name", () => {
    assert.equal(selectionCount(1), "1 selecionado");
    assert.equal(selectionCount(3), "3 selecionados");
    assert.equal(selectionCount(1, { feminine: true }), "1 selecionada");
    assert.equal(selectionCount(4, { feminine: true }), "4 selecionadas");
    assert.equal(SELECT_MANY.label, "Selecionar vários", "never Selecionar alone (the old Pôr na prévia)");
});
