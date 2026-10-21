// Selecting several items in a list or a gallery (owner 2026-10-21, the
// "Seleção múltipla" mockup, marks M1–M7). One model for every list: the
// Mídia page's, which had it first.
//
// A selection is { ids, anchor, lead }: what is marked, in the order it was
// marked; where a Shift range starts; where the arrows move from. `order` is
// the ids as the list shows them now (after its search and filters).
//
// The click (M1 = A):
//   Shift + click   marks from the anchor to here (added to what is marked)
//   Ctrl + click    marks or unmarks this one; it becomes the anchor
//   "Selecionar vários" on: a plain click marks or unmarks
//   a plain click   in a gallery, this one alone; in a list that goes on air
//                   (the Biblioteca, the Setlist) it clears the selection and
//                   the list does what it always did (Pôr na prévia)
// Esc clears a selection before anything else on the console (keys.js
// ESC_ORDER "selection"); Ctrl+A marks what the list shows; Delete asks to
// delete what is marked.

export const EMPTY_SELECTION = Object.freeze({ ids: [], anchor: null, lead: null });

const only = (id) => ({ ids: [id], anchor: id, lead: id });

// What a click does to the selection. `mode`: "gallery" (a plain click picks
// one) or "air" (a plain click clears; the caller then prepares as before).
// -> { sel, handled }: handled = the click was a selection click (the list
//    must not prepare, send or open anything).
export function clickSelection(sel, order, id, e = {}, { mode = "gallery", picking = false } = {}) {
    const ctrl = Boolean(e.ctrlKey || e.metaKey);
    if (e.shiftKey && sel.anchor !== null && order.includes(sel.anchor) && order.includes(id)) {
        const a = order.indexOf(sel.anchor);
        const b = order.indexOf(id);
        const range = order.slice(Math.min(a, b), Math.max(a, b) + 1);
        return { sel: { ids: [...new Set([...sel.ids, ...range])], anchor: sel.anchor, lead: id }, handled: true };
    }
    if (ctrl || picking || (e.shiftKey && mode === "air")) {
        const ids = sel.ids.includes(id) ? sel.ids.filter((x) => x !== id) : [...sel.ids, id];
        return { sel: { ids, anchor: id, lead: id }, handled: true };
    }
    if (mode === "air") return { sel: sel.ids.length ? EMPTY_SELECTION : sel, handled: false };
    return { sel: only(id), handled: false };
}

// The arrows (and Home/End) moved to `to` (an index in `order`): one item,
// or with Shift the range from the anchor, which replaces what was marked.
export function stepSelection(sel, order, to, { shift = false } = {}) {
    const id = order[to];
    if (id === undefined) return sel;
    if (shift && sel.anchor !== null && order.includes(sel.anchor)) {
        const a = order.indexOf(sel.anchor);
        return { ids: order.slice(Math.min(a, to), Math.max(a, to) + 1), anchor: sel.anchor, lead: id };
    }
    return only(id);
}

// Where the arrows start: the lead if it is still marked and shown, else the
// last one marked that is shown (-1: none).
export function leadIndex(sel, order) {
    if (sel.lead !== null && sel.ids.includes(sel.lead) && order.includes(sel.lead)) return order.indexOf(sel.lead);
    for (let i = sel.ids.length - 1; i >= 0; i--) if (order.includes(sel.ids[i])) return order.indexOf(sel.ids[i]);
    return -1;
}

// Ctrl+A: what the list shows.
export function selectAll(order) {
    if (!order.length) return EMPTY_SELECTION;
    return { ids: [...order], anchor: order[0], lead: order[order.length - 1] };
}

// Some ids are no longer there (deleted, here or on another computer): they
// leave the selection. The same object when nothing changed (React state).
export function pruneSelection(sel, existing) {
    const has = existing instanceof Set ? (id) => existing.has(id) : (id) => existing.includes(id);
    const ids = sel.ids.filter(has);
    if (ids.length === sel.ids.length) return sel;
    return { ids, anchor: has(sel.anchor) ? sel.anchor : null, lead: has(sel.lead) ? sel.lead : null };
}

// The marked items that the list shows, in the list's order (what a bulk
// action acts on: a search that hides one never deletes it).
export function pickedOf(sel, items, keyOf = (x) => x.id) {
    if (!sel.ids.length) return [];
    const marked = new Set(sel.ids);
    return items.filter((x) => marked.has(keyOf(x)));
}

// "3 selecionadas", "1 selecionado": the bar's count, by the noun's gender.
export function selectionCount(n, { feminine = false } = {}) {
    const word = feminine ? (n === 1 ? "selecionada" : "selecionadas") : (n === 1 ? "selecionado" : "selecionados");
    return `${n} ${word}`;
}

// The header button that turns the mode on (M2 = A): never "Selecionar"
// alone, which was the old name of Pôr na prévia.
export const SELECT_MANY = Object.freeze({ label: "Selecionar vários", icon: "listChecks" });
