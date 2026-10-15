// Dragging in a list (owner 2026-10-15, Rodada D: "the items below move to
// make room for the one being dragged"): where the dragged item would land,
// and how far each row slides to open that room. Pure, so node --test pins
// it (dropOrder.test.mjs); useSortable.js draws it.
//
// A slot is an insertion point in the ORIGINAL list: slot i is "before row
// i", slot n is "after the last". `from` is the dragged row's index, or -1
// for something coming from elsewhere (a Biblioteca song onto the Setlist).

// The slot under the pointer: how many rows have their middle above it.
// `mids` are the rows' vertical middles measured when the drag started —
// never the moving rows, or the slot would chase its own animation.
export function overIndex(mids, y) {
    let n = 0;
    for (const m of mids) if (y > m) n += 1;
    return n;
}

// Whether dropping at `over` would leave the list as it is.
export const isNoop = (from, over) => from >= 0 && (over === from || over === from + 1);

// How far row k slides (in px; + is down) while the dragged item hovers
// slot `over`. Coming from elsewhere, every row from the slot on moves down
// by the gap. Reordering, the source row keeps its place in the layout
// (invisible) and the hole travels: rows between the slot and the source
// move down (dragging up) or up (dragging down).
export function shiftFor(k, from, over, gap) {
    if (over == null || over < 0 || k === from) return 0;
    if (from < 0) return k >= over ? gap : 0;
    if (over <= from) return k >= over && k < from ? gap : 0;
    return k > from && k < over ? -gap : 0;
}

// The index the dragged row ends at once dropped on `over`.
export const placeIndex = (from, over) => (from >= 0 && over > from ? over - 1 : over);

// The list with row `from` moved to slot `over` (the same list when it
// would not move).
export function moveTo(list, from, over) {
    if (from < 0 || from >= list.length || isNoop(from, over)) return list;
    const out = list.slice();
    const [it] = out.splice(from, 1);
    out.splice(Math.max(0, Math.min(out.length, placeIndex(from, over))), 0, it);
    return out;
}
