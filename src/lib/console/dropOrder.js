// Dragging in a list (owner 2026-10-15, Rodada D: "the items below move to
// make room for the one being dragged"; Rodada E2, 2026-10-16: a lit slot
// where it lands): where the dragged item would land, how far each row
// slides to open that room and where the slot is drawn. Pure, so node
// --test pins it (dropOrder.test.mjs); useSortable.js draws it.
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
// by the gap. Reordering, the source row is the slot itself and the rows it
// passes over make room: between the slot and the source they move down
// (dragging up) or up (dragging down). The source's own move is slotTop.
export function shiftFor(k, from, over, gap) {
    if (over == null || over < 0 || k === from) return 0;
    if (from < 0) return k >= over ? gap : 0;
    if (over <= from) return k >= over && k < from ? gap : 0;
    return k > from && k < over ? -gap : 0;
}

// The rows as measured when a drag reaches the list (rows differ in height:
// a Setlist section is shorter than an item, Camadas' Sobreposições group
// taller than a layer). `rows` are { top, height } in the list's own
// coordinates, in order. -> { tops, heights, pitch, gap, end, room }:
//   pitch[k] — from row k's top to the next row's (what row k takes up,
//              its margins included); the last one keeps the rows' gap;
//   gap      — the space between two rows;
//   end      — where the slot after the last row starts;
//   room     — the room a row from elsewhere takes: the tallest pitch.
export function measureRows(rows, fallback = 34) {
    const tops = rows.map((r) => r.top);
    const heights = rows.map((r) => r.height);
    const n = rows.length;
    const gap = n > 1 ? Math.max(0, tops[n - 1] - (tops[n - 2] + heights[n - 2])) : 2;
    const pitch = tops.map((t, k) => (k < n - 1 ? tops[k + 1] - t : heights[k] + gap));
    const end = n ? tops[n - 1] + pitch[n - 1] : 0;
    const room = n ? Math.max(...pitch) : fallback;
    return { tops, heights, pitch, gap, end, room };
}

// The room the slot opens: the dragged row's own pitch, or (from elsewhere)
// the room given, else a row of the list's usual size.
export const roomFor = (geo, from, room) => (from >= 0 ? geo.pitch[from] : room ?? geo.room);

// The slot the pointer at y asks for, with `current` the slot drawn now.
// Rows count by where they are DRAWN — their middle, moved by the room they
// make — so a row changes side when the pointer crosses the row as the
// operator sees it, and the pointer resting on the lit slot keeps it.
// Reordering, the canonical "no move" is `from` itself.
export function slotAt(geo, y, from, current, room = roomFor(geo, from)) {
    let c = 0;
    for (let k = 0; k < geo.tops.length; k += 1) {
        if (k === from) continue;
        if (y > geo.tops[k] + geo.heights[k] / 2 + shiftFor(k, from, current, room)) c += 1;
    }
    return from >= 0 && c > from ? c + 1 : c;
}

// Where the slot is drawn (its top, in the list's coordinates) once the rows
// have made room: before row `over`, or after the last; reordering past the
// source, the rows it leaves close up over its pitch.
export function slotTop(geo, from, over) {
    const at = over < geo.tops.length ? geo.tops[over] : geo.end;
    return from >= 0 && over > from ? at - geo.pitch[from] : at;
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

// Subir / Descer without dragging (a row's menu, Alt+↑ / Alt+↓ on a focused
// row; audit C-16): the slot that moves row `from` one place up (dir -1) or
// down (+1) in a list of `n`, or null at the end it cannot pass.
export function stepSlot(from, dir, n) {
    if (from < 0 || from >= n) return null;
    if (dir < 0) return from > 0 ? from - 1 : null;
    return from < n - 1 ? from + 2 : null;
}

// The step a key press on a focused row asks for: Alt+↑ -1, Alt+↓ +1, else 0.
export const stepKey = (e) => (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey ? ({ ArrowUp: -1, ArrowDown: 1 }[e.key] || 0) : 0);
