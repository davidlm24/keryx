import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { EMPTY_SELECTION, clickSelection, stepSelection, leadIndex, selectAll, pruneSelection } from "@/lib/console/multiSelect";
import { selections } from "@/lib/console/selectionStore";

// One list's or gallery's selection (src/lib/console/multiSelect.js, owner
// 2026-10-21): Ctrl/Shift + click, the arrows, Ctrl+A, Delete, and the
// "Selecionar vários" mode.
//   order     the ids as the list shows them now (after search and filters)
//   existing  every id the list holds (a deleted one leaves the selection)
//   mode      "gallery" (a plain click picks one) or "air" (a plain click
//             clears the selection and the list prepares as before, M1 = A)
//   register  a console panel's selection is cleared by the console's Esc
//             before the air (keys.js "selection"); a page of THE window
//             clears its own through its escRef, so it passes false.
//   picking, onPicking  "Selecionar vários" held by the caller (the
//             Biblioteca's button is in its panel header, in Console.jsx);
//             without them the hook holds it.
export function useMultiSelect({ order, existing = order, mode = "gallery", register = true, picking: pickingProp, onPicking }) {
    const [sel, setSel] = useState(EMPTY_SELECTION);
    const [pickingOwn, setPickingOwn] = useState(false);
    const controlled = pickingProp !== undefined;
    const picking = controlled ? Boolean(pickingProp) : pickingOwn;
    const setPickingState = useCallback((on) => { if (controlled) onPicking?.(on); else setPickingOwn(on); }, [controlled, onPicking]);
    const key = useId();

    // Rows deleted here or on another computer leave the selection.
    const existingKey = existing.join("\n");
    useEffect(() => { setSel((s) => pruneSelection(s, new Set(existing))); }, [existingKey]); // eslint-disable-line react-hooks/exhaustive-deps

    const clear = useCallback(() => { setSel(EMPTY_SELECTION); setPickingState(false); }, [setPickingState]);
    const active = sel.ids.length > 0 || picking;
    useEffect(() => {
        if (!register) return undefined;
        selections.set(key, active ? clear : null);
        return () => selections.set(key, null);
    }, [register, key, active, clear]);

    const marked = useMemo(() => new Set(sel.ids), [sel.ids]);
    return {
        sel,
        ids: sel.ids,
        count: sel.ids.length,
        has: (id) => marked.has(id),
        picking,
        // A click on item `id`: true = it was a selection click (the list
        // must not prepare, send or open anything).
        click(id, e) {
            const mods = { ctrlKey: e?.ctrlKey, metaKey: e?.metaKey, shiftKey: e?.shiftKey };
            // From the latest selection (two clicks before React renders
            // still add up); `handled` hangs on the keys and the mode only.
            setSel((s) => clickSelection(s, order, id, mods, { mode, picking }).sel);
            return clickSelection(sel, order, id, mods, { mode, picking }).handled;
        },
        // The arrows moved to index `to` of `order`; Shift extends.
        step: (to, e) => setSel((s) => stepSelection(s, order, to, { shift: Boolean(e?.shiftKey) })),
        // The index the arrows move from (-1: none).
        lead: leadIndex(sel, order),
        all: () => setSel(selectAll(order)),
        set: (ids) => setSel(ids.length ? { ids: [...ids], anchor: ids[0], lead: ids[ids.length - 1] } : EMPTY_SELECTION),
        clear,
        // Selecionar vários: off clears what was marked.
        setPicking(on) {
            setPickingState(Boolean(on));
            if (!on) setSel(EMPTY_SELECTION);
        },
        // The list's own keys while the focus is in it: Ctrl+A marks what is
        // shown, Delete asks to delete what is marked (Backspace never does,
        // audit C-11). -> true if the key was taken.
        keyDown(e, { onDelete } = {}) {
            const field = ["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName);
            if (field) return false;
            if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "a" || e.key === "A")) {
                e.preventDefault();
                e.stopPropagation();
                setSel(selectAll(order));
                return true;
            }
            if (e.key === "Delete" && sel.ids.length && onDelete) {
                e.preventDefault();
                e.stopPropagation();
                onDelete();
                return true;
            }
            return false;
        },
    };
}
