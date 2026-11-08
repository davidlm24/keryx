// Which lists of this window have something marked (multiSelect.js), so the
// console's Esc clears a selection before it would end the air (keys.js
// ESC_ORDER "selection"). Each list registers a way to clear itself while it
// has a selection (or "Selecionar vários" is on) and unregisters when it has
// none; Esc clears the one marked last. One store per window: the console and
// each /Janela have their own module instance.

export function createSelectionStore() {
    const open = new Map(); // key -> { clear, at }
    let seq = 0;
    return {
        // clear: a function = this list has a selection; null = it has none.
        set(key, clear) {
            if (typeof clear === "function") {
                const prev = open.get(key);
                open.set(key, { clear, at: prev ? prev.at : ++seq });
            } else open.delete(key);
        },
        any: () => open.size > 0,
        // Esc: the list marked last clears (and leaves the store). -> true if one did.
        clearTop() {
            let top = null;
            for (const [key, entry] of open) if (!top || entry.at > top.entry.at) top = { key, entry };
            if (!top) return false;
            open.delete(top.key);
            try { top.entry.clear(); } catch { /* the list is gone */ }
            return true;
        },
    };
}

export const selections = createSelectionStore();
