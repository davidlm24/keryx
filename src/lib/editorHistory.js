// Desfazer / Refazer in the screen and theme editors (audit C-33): a stack
// of the editor's whole `draft`, plain JS so node --test checks it.
//
// A history is { past, future, group, at }: `past` the drafts before each
// step (oldest first), `future` the ones undone (next redo last). Every
// change records the draft it replaced; a change in the same `group` as
// the last one (one drag, a run of nudges, the typing in one field) folds
// into that step instead — within `window` ms of it when a window is given.
// Undo and redo never fold: they end the group.

export const HISTORY_LIMIT = 100;

export const emptyHistory = () => ({ past: [], future: [], group: null, at: 0 });

// before: the draft the change replaced. -> the new history.
export function record(h, before, { group = null, at = 0, window = null, limit = HISTORY_LIMIT } = {}) {
    const folds = group != null && h.group === group && h.past.length > 0 && (window == null || at - h.at <= window);
    if (folds) return { ...h, future: [], at };
    const past = [...h.past, before];
    return { past: past.length > limit ? past.slice(past.length - limit) : past, future: [], group, at };
}

// current: the draft on screen. -> { history, value } or null (nothing to undo).
export function undo(h, current) {
    if (!h.past.length) return null;
    const value = h.past[h.past.length - 1];
    return { history: { past: h.past.slice(0, -1), future: [...h.future, current], group: null, at: 0 }, value };
}

export function redo(h, current) {
    if (!h.future.length) return null;
    const value = h.future[h.future.length - 1];
    return { history: { past: [...h.past, current], future: h.future.slice(0, -1), group: null, at: 0 }, value };
}

// A step taken by hand ends the group (a field left, a drag released).
export const breakGroup = (h) => (h.group == null ? h : { ...h, group: null });

export const canUndo = (h) => h.past.length > 0;
export const canRedo = (h) => h.future.length > 0;

// What a key press means to an editor: "undo" (Ctrl+Z), "redo" (Ctrl+Y,
// Ctrl+Shift+Z) or null. A text field keeps its own undo while it has the
// focus: `text` is true when the target is one.
export function historyKey(e, text = false) {
    if (text || !(e.ctrlKey || e.metaKey) || e.altKey) return null;
    const k = String(e.key || "").toLowerCase();
    if (k === "z") return e.shiftKey ? "redo" : "undo";
    if (k === "y" && !e.shiftKey) return "redo";
    return null;
}

// Fields with an undo of their own (text you type), unlike a slider, a
// colour, a checkbox or a select, where Ctrl+Z means the editor's.
const OWN_UNDO_INPUTS = new Set(["", "text", "search", "number", "email", "url", "tel", "password"]);
export function hasOwnUndo(target) {
    if (!target || !target.tagName) return false;
    if (target.tagName === "TEXTAREA") return true;
    if (target.isContentEditable) return true;
    if (target.tagName !== "INPUT") return false;
    return OWN_UNDO_INPUTS.has(String(target.type || "").toLowerCase());
}
