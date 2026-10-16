// Moving a selection with the keyboard in a list or a grid of cards (the
// Mídia; audit C-72, 2026-10-16), and the keys a focused row answers
// (Delete, F2) in the window's pages. Pure, tested in gridNav.test.mjs.

// The index the selection moves to for an arrow key (Home / End too) in
// `count` items laid out `cols` to a row (1 = a list); `at` -1 = nothing
// selected yet (the first arrow picks the first item, End the last).
// A list answers only ↑ / ↓; it stops at the ends, never wraps.
// -> the new index, or null when the key does not move it.
export function gridStep(at, key, count, cols = 1) {
    if (!count) return null;
    const c = Math.max(1, Math.floor(cols) || 1);
    const last = count - 1;
    if (key === "Home") return 0;
    if (key === "End") return last;
    const d = { ArrowDown: c, ArrowUp: -c, ArrowRight: c > 1 ? 1 : 0, ArrowLeft: c > 1 ? -1 : 0 }[key];
    if (!d) return null;
    if (at < 0) return d > 0 ? 0 : last;
    const next = at + d;
    if (next < 0) return at;
    // Down from a column the last row lacks: the last card.
    if (next > last) return d === c && c > 1 && Math.floor(at / c) < Math.floor(last / c) ? last : at;
    return next;
}

// How many cards share the first row: the tops of the cells, in order.
export const columnsOf = (tops) => {
    if (!tops.length) return 1;
    let n = 0;
    while (n < tops.length && Math.abs(tops[n] - tops[0]) < 2) n += 1;
    return n;
};

// What a key on a focused row asks for, as in Windows Explorer: Delete
// "delete" (the page asks first), F2 "rename"; never with a modifier, and
// never Backspace (it goes back in a field, C-11).
export function rowKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return null;
    return e.key === "Delete" ? "delete" : e.key === "F2" ? "rename" : null;
}
