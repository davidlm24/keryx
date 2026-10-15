import { useCallback, useEffect, useRef, useState } from "react";
import { overIndex, shiftFor, isNoop } from "@/lib/console/dropOrder";
import { setDragGhost } from "./dragGhost";

// A list you drag in (owner 2026-10-15, Rodada D): the rows below slide
// down to open room where the dragged item would land — no border, no line
// on a neighbour. HTML5 drag and drop underneath (the Biblioteca's songs
// come from another component); the slot comes from the pointer against
// the rows' middles measured when the drag reached this list, so the moving
// rows never make it jump (src/lib/console/dropOrder.js, tested).
//
//   accepts(e)          — whether a drag from elsewhere is for this list
//                         (the Biblioteca's stage onto the Setlist).
//   onDrop(from, over)  — `from` the row dragged here (-1 from elsewhere),
//                         `over` the slot (0..n), never a no-op move.
//   gapFor              — the room opened for a drag from elsewhere (px).
// -> { listProps, rowProps(k, { label, icon }), rowStyle(k), sorting, dragFrom }
// Rows are the list's children marked data-sort-row, in order.
export default function useSortable({ accepts = () => false, onDrop, gapFor = 34, disabled = false } = {}) {
    const listRef = useRef(null);
    const [from, setFrom] = useState(null);
    const [over, setOver] = useState(null);
    const [gap, setGap] = useState(gapFor);
    const mids = useRef(null);

    const reset = useCallback(() => { setFrom(null); setOver(null); mids.current = null; }, []);
    // However a drag ends — dropped here, elsewhere, or cancelled — the rows
    // go back to their places.
    useEffect(() => {
        window.addEventListener("dragend", reset);
        window.addEventListener("drop", reset);
        return () => { window.removeEventListener("dragend", reset); window.removeEventListener("drop", reset); };
    }, [reset]);

    // Middles in the list's own coordinates (scroll included), so a list
    // that scrolls during the drag still finds the right slot.
    const measure = () => {
        const box = listRef.current;
        if (!box) return [];
        const top = box.getBoundingClientRect().top - box.scrollTop;
        return [...box.querySelectorAll(":scope > [data-sort-row]")].map((n) => { const r = n.getBoundingClientRect(); return r.top - top + r.height / 2; });
    };
    const yIn = (e) => { const box = listRef.current; return box ? e.clientY - box.getBoundingClientRect().top + box.scrollTop : 0; };
    // The list's tail (a filler marked data-sort-tail) always means "at the end".
    const slotOf = (e) => (e.target?.closest?.("[data-sort-tail]") ? mids.current.length : overIndex(mids.current, yIn(e)));
    const ours = (e) => from !== null || accepts(e);

    const listProps = disabled ? { ref: listRef } : {
        ref: listRef,
        onDragOver: (e) => {
            if (!ours(e)) return;
            e.preventDefault();
            if (!mids.current) mids.current = measure();
            const slot = slotOf(e);
            if (slot !== over) setOver(slot);
        },
        onDragLeave: (e) => {
            // Only leaving the list itself, not moving between its rows.
            if (listRef.current && !listRef.current.contains(e.relatedTarget)) { setOver(null); if (from === null) mids.current = null; }
        },
        onDrop: (e) => {
            if (!ours(e)) return;
            e.preventDefault();
            const f = from ?? -1;
            if (!mids.current) mids.current = measure();
            const o = e.target?.closest?.("[data-sort-tail]") ? mids.current.length : over ?? slotOf(e);
            reset();
            if (o != null && !isNoop(f, o)) onDrop?.(f, o);
        },
    };
    const rowProps = (k, ghost = {}) => (disabled ? { "data-sort-row": "" } : {
        "data-sort-row": "",
        draggable: true,
        onDragStart: (e) => {
            e.stopPropagation();
            e.dataTransfer.effectAllowed = "move";
            try { e.dataTransfer.setData("text/plain", ""); } catch { /* Firefox wants data; Chromium does not mind */ }
            setDragGhost(e, ghost);
            setGap(Math.round(e.currentTarget.getBoundingClientRect().height) + 2);
            mids.current = measure();
            // The source leaves its slot only after the browser took its
            // picture of the ghost.
            setTimeout(() => setFrom(k), 0);
        },
    });
    const sorting = over !== null;
    const rowStyle = (k) => {
        if (!sorting) return k === from ? { opacity: 0.4 } : undefined;
        const g = from === null ? gapFor : gap;
        const dy = shiftFor(k, from ?? -1, over, g);
        return { transform: dy ? `translateY(${dy}px)` : undefined, ...(k === from ? { opacity: 0 } : {}) };
    };
    return { listProps, rowProps, rowStyle, sorting, dragFrom: from, over };
}
