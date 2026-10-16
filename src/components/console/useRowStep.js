import { useEffect, useRef } from "react";
import { stepSlot, stepKey } from "@/lib/console/dropOrder";

// Subir / Descer without dragging (audit C-16, 2026-10-16): the Setlist's and
// the planner's rows move one place from their menu or with Alt+↑ / Alt+↓
// on a focused row, as Camadas' do. `onMove(from, over)` is the list's own
// drop (useSortable's slots, dropOrder.js). A row moved from the keyboard
// keeps the focus while the list takes its new order (the store writes one
// row at a time, and React moves the row's node, which drops the focus).
// Rows carry `data-item-id` (rowAttrs) for that.
const HOLD_MS = 1500;

export default function useRowStep({ ids, listRef, onMove, disabled = false }) {
    const want = useRef(null);
    const sig = ids.join("\u0001");
    useEffect(() => {
        const w = want.current;
        if (!w || Date.now() > w.until) { want.current = null; return; }
        const el = listRef.current?.querySelector(`[data-item-id="${CSS.escape(w.id)}"]`);
        if (el && document.activeElement !== el) el.focus({ preventScroll: true });
        el?.scrollIntoView?.({ block: "nearest" });
    }, [sig, listRef]);
    const move = (i, dir, focus = false) => {
        const over = disabled ? null : stepSlot(i, dir, ids.length);
        if (over === null) return;
        want.current = focus ? { id: ids[i], until: Date.now() + HOLD_MS } : null;
        onMove(i, over);
    };
    return {
        move,
        // The row's keys: Alt+↑ / Alt+↓ (never the console's: an arrow there
        // would move what is on air).
        onKey: (i) => (e) => {
            const d = stepKey(e);
            if (!d || e.target !== e.currentTarget) return;
            e.preventDefault();
            e.stopPropagation();
            move(i, d, true);
        },
        // The row's menu items, after its own.
        menuItems: (i) => (disabled ? [] : [
            "sep",
            { label: "Subir", kbd: "Alt+↑", disabled: i === 0, onSelect: () => move(i, -1) },
            { label: "Descer", kbd: "Alt+↓", disabled: i === ids.length - 1, onSelect: () => move(i, 1) },
        ]),
        rowAttrs: (i) => ({ "data-item-id": ids[i] }),
    };
}
