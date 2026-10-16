import { createElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { measureRows, roomFor, slotAt, slotTop, shiftFor, isNoop } from "@/lib/console/dropOrder";
import { setDragGhost, claimGhost } from "./dragGhost";

// A list you drag in (owner 2026-10-15, Rodada D; Rodada E2, 2026-10-16:
// "a slight card highlight where it will drop"). The card follows the
// pointer (dragGhost.js); where it will land a slot lights up in gold — the
// dragged row itself, moved there, or (from elsewhere) a placeholder of a
// row's size — and the rows around it glide out of the way. On the drop the
// card settles into the slot (180 ms) before the list takes its new order.
// HTML5 drag and drop underneath (the Biblioteca's songs come from another
// component); the slot comes from the rows measured when the drag reached
// this list (src/lib/console/dropOrder.js, tested), so the moving rows never
// make it jump.
//
//   accepts(e)                — whether a drag from elsewhere is for this
//                               list (the Biblioteca's stage onto the Setlist).
//   carry(e)                  — read at the drop and handed to onDrop (what
//                               the drag carried is gone once the card landed).
//   onDrop(from, over, carry) — `from` the row dragged here (-1 from
//                               elsewhere), `over` the slot (0..n), never a no-op.
//   keys                      — the rows' ids in order: the slot stays lit
//                               until they change (the new order is on
//                               screen), so the list never flashes the old one.
//   room                      — the room a drag from elsewhere opens (px);
//                               else the list's tallest row.
// -> { listProps, rowProps(k, { label, icon, time }), rowStyle(k), slot, sorting, dragFrom, over }
// Rows are the list's children marked data-sort-row, in order; `slot` (the
// placeholder for a drop from elsewhere) is rendered inside the list.
const SETTLE_MS = 180;
const WAIT_MS = 1000;
const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

export default function useSortable({ accepts = () => false, carry, onDrop, keys, room, disabled = false } = {}) {
    const listRef = useRef(null);
    // What is drawn: whose drag ("own" from a row here, "ext" from
    // elsewhere), the row dragged, the slot lit and the rows as measured.
    const [mode, setMode] = useState(null);
    const [from, setFrom] = useState(null);
    const [over, setOver] = useState(null);
    const [geom, setGeom] = useState(null);
    // After the drop: { wait: false } while the card settles, then
    // { wait: true, sig } until the rows' keys differ from `sig`.
    const [landing, setLanding] = useState(null);
    // The same, for the event handlers (state lags one event behind).
    const geo = useRef(null);
    const fromRef = useRef(null);
    const slotRef = useRef(null);
    const phase = useRef("idle"); // "idle" | "drag" | "land"
    const ghost = useRef(null);
    const timers = useRef([]);
    const pending = useRef(null);
    const drop = useRef(onDrop);
    drop.current = onDrop;
    const sig = Array.isArray(keys) ? keys.join("\u0001") : null;
    const sigRef = useRef(sig);
    sigRef.current = sig;

    const reset = useCallback(() => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
        pending.current = null;
        ghost.current?.remove();
        ghost.current = null;
        phase.current = "idle";
        geo.current = null;
        fromRef.current = null;
        slotRef.current = null;
        setMode(null); setFrom(null); setOver(null); setGeom(null); setLanding(null);
    }, []);
    // However a drag ends — dropped elsewhere, or cancelled — the rows go
    // back to their places; a drop here lands first.
    useEffect(() => {
        const end = () => { if (phase.current === "drag") reset(); };
        window.addEventListener("dragend", end);
        window.addEventListener("drop", end);
        return () => {
            window.removeEventListener("dragend", end);
            window.removeEventListener("drop", end);
            timers.current.forEach(clearTimeout);
            ghost.current?.remove();
        };
    }, [reset]);
    // The new order is on screen: the slot, the shifts and the card go in
    // the same frame (before paint), so nothing jumps.
    const done = Boolean(landing?.wait) && sig !== landing.sig;
    useLayoutEffect(() => { if (done) reset(); }, [done, reset]);

    // The rows in the list's own coordinates (scroll included), so a list
    // that scrolls during the drag still finds the right slot.
    const origin = (box) => { const r = box.getBoundingClientRect(); return { top: r.top - box.scrollTop, left: r.left }; };
    const measure = () => {
        const box = listRef.current;
        if (!box) return { ...measureRows([]), lefts: [], widths: [] };
        const o = origin(box);
        const rects = [...box.querySelectorAll(":scope > [data-sort-row]")].map((n) => n.getBoundingClientRect());
        const g = { ...measureRows(rects.map((r) => ({ top: r.top - o.top, height: r.height }))), lefts: rects.map((r) => r.left - o.left), widths: rects.map((r) => r.width) };
        geo.current = g;
        return g;
    };
    const yIn = (e) => { const box = listRef.current; return box ? e.clientY - origin(box).top : 0; };
    // The list's tail (a filler marked data-sort-tail) always means "at the end".
    const slotOf = (e, f) => (e.target?.closest?.("[data-sort-tail]") ? geo.current.tops.length : slotAt(geo.current, yIn(e), f, slotRef.current, roomFor(geo.current, f, room)));
    const ours = (e) => fromRef.current !== null || accepts(e);
    // The lit slot on screen (viewport px): where the card lands.
    const slotRect = (f, o) => {
        const box = listRef.current;
        const g = geo.current;
        if (!box || !g || o == null) return null;
        const at = origin(box);
        const top = at.top + slotTop(g, f, o);
        if (f >= 0) return { left: at.left + g.lefts[f], top, width: g.widths[f], height: g.heights[f] };
        const ph = box.querySelector(":scope > .kx-sort-slot")?.getBoundingClientRect();
        const r = box.getBoundingClientRect();
        return { left: ph ? ph.left : r.left + 4, top, width: ph ? ph.width : r.width - 8, height: roomFor(g, -1, room) - g.gap };
    };

    const listProps = disabled ? { ref: listRef } : {
        ref: listRef,
        onDragOver: (e) => {
            if (phase.current === "land" || !ours(e)) return;
            e.preventDefault();
            if (!geo.current) setGeom(measure());
            if (phase.current === "idle") { phase.current = "drag"; setMode("ext"); }
            const slot = slotOf(e, fromRef.current ?? -1);
            if (slot !== slotRef.current) { slotRef.current = slot; setOver(slot); }
        },
        onDragLeave: (e) => {
            // Only leaving the list itself, not moving between its rows: the
            // rows glide back (the drag may come back).
            if (phase.current === "drag" && listRef.current && !listRef.current.contains(e.relatedTarget)) { slotRef.current = null; setOver(null); }
        },
        onDrop: (e) => {
            if (phase.current === "land" || !ours(e)) return;
            e.preventDefault();
            if (!geo.current) setGeom(measure());
            const f = fromRef.current ?? -1;
            const o = slotOf(e, f);
            const carried = carry?.(e);
            const noop = isNoop(f, o);
            // The slot stays lit while the card lands (its own place on a no-op).
            const shown = noop ? f : o;
            phase.current = "land";
            slotRef.current = shown;
            setOver(shown);
            setLanding({ wait: false });
            ghost.current = claimGhost();
            ghost.current?.land(slotRect(f, shown));
            const commit = () => {
                pending.current = null;
                if (noop) { reset(); return; }
                drop.current?.(f, o, carried);
                if (sigRef.current === null) { reset(); return; }
                setLanding({ wait: true, sig: sigRef.current });
                // A drop that changed nothing (refused, failed): back to rest.
                timers.current.push(setTimeout(reset, WAIT_MS));
            };
            pending.current = commit;
            if (reduced()) commit();
            else timers.current.push(setTimeout(commit, SETTLE_MS));
        },
    };
    const live = !done && mode !== null && geom !== null;
    const rowProps = (k, ghostOf = {}) => (disabled ? { "data-sort-row": "" } : {
        "data-sort-row": "",
        "data-sort-slot": live && mode === "own" && k === from ? "" : undefined,
        draggable: true,
        onDragStart: (e) => {
            e.stopPropagation();
            e.dataTransfer.effectAllowed = "move";
            try { e.dataTransfer.setData("text/plain", ""); } catch { /* Firefox wants data; Chromium does not mind */ }
            // A drop still landing here is done first, never lost.
            pending.current?.();
            timers.current.forEach(clearTimeout);
            timers.current = [];
            ghost.current?.remove();
            ghost.current = null;
            setDragGhost(e, ghostOf);
            phase.current = "drag";
            fromRef.current = k;
            slotRef.current = null;
            const g = measure();
            // The row turns into the slot only after the browser started the
            // drag (changing the dragged node in dragstart can cancel it).
            setTimeout(() => { if (fromRef.current === k && phase.current === "drag") { setGeom(g); setFrom(k); setMode("own"); setLanding(null); } }, 0);
        },
    });
    const rowStyle = (k) => {
        if (!live || over == null) return undefined;
        const f = mode === "own" ? from : -1;
        const dy = k === f ? slotTop(geom, f, over) - geom.tops[f] : shiftFor(k, f, over, roomFor(geom, f, room));
        return dy ? { transform: `translateY(${dy}px)` } : undefined;
    };
    // From elsewhere: a placeholder of a row's size where the drop goes.
    const slot = live && mode === "ext" && over != null
        ? createElement("div", { className: "kx-sort-slot", "aria-hidden": true, style: { top: slotTop(geom, -1, over), height: roomFor(geom, -1, room) - geom.gap } })
        : null;
    return { listProps, rowProps, rowStyle, slot, sorting: live, dragFrom: from, over };
}
