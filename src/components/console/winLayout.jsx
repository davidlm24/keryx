import React, { useCallback, useRef, useSyncExternalStore } from "react";
import { Split } from "./kx";
import { readWin, writeWin, withCol, clampCol, dragRect } from "@/lib/console/winLayout";

// The window's sizes on this computer (src/lib/console/winLayout.js), one
// store for every page of THE window and the console that frames it.
let state = null;
const subs = new Set();
const current = () => (state ??= readWin());
export function setWinState(fn) {
    state = fn(current());
    writeWin(state);
    subs.forEach((f) => f());
}
const subscribe = (cb) => { subs.add(cb); return () => subs.delete(cb); };
export const useWinState = () => useSyncExternalStore(subscribe, current);

// A column (or, `horizontal`, a stacked panel) of a window page that a
// splitter resizes, its size kept per page on this computer (owner
// 2026-10-15, Rodada D3: "como no console"). `key`: "<page>.<column>";
// `sign`: -1 when the column is right of (or under) its splitter.
// -> { px, style, split }: the column's flex style and the splitter that
// goes between it and its neighbour (it IS the 6 px gap).
// `name`: what the splitter resizes, said by a screen reader (C-62).
export function useWinCol(key, { def, min, max = 900, sign = 1, horizontal = false, name }) {
    const s = useWinState();
    const px = clampCol(s.cols[key] ?? def, min, max);
    const onSize = useCallback((v) => setWinState((st) => withCol(st, key, v)), [key]);
    const onReset = useCallback(() => setWinState((st) => withCol(st, key, null)), [key]);
    const clamp = useCallback((v) => clampCol(v, min, max), [min, max]);
    // A narrow window still shrinks the column (flex-shrink), never under its minimum.
    const style = horizontal ? { flex: `0 1 ${px}px`, minHeight: Math.min(min, px) } : { flex: `0 1 ${px}px`, minWidth: Math.min(min, px) };
    return { px, style, split: <Split horizontal={horizontal} size={px} sign={sign} onSize={onSize} onReset={onReset} clamp={clamp}
        name={name && `${horizontal ? "Altura" : "Largura"} · ${name}`} min={min} max={max} valueText={`${Math.round(px)} px`} /> };
}

const EDGES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

// The window's edges and corners: dragging one stretches the window
// (dragRect: the far side stays, never under WIN_MIN, never past the
// console). `onRect` while dragging, `onDone` with the last rectangle.
export function WinEdges({ dialogRef, onRect, onDone }) {
    const drag = useRef(null);
    const down = (edge) => (e) => {
        const box = dialogRef.current;
        const host = box?.offsetParent;
        if (!box || !host || e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        const r = box.getBoundingClientRect();
        const h = host.getBoundingClientRect();
        drag.current = { edge, x: e.clientX, y: e.clientY, start: { x: r.left - h.left, y: r.top - h.top, w: r.width, h: r.height }, W: host.clientWidth, H: host.clientHeight, last: null };
    };
    const move = (e) => {
        const d = drag.current;
        if (!d) return;
        d.last = dragRect(d.start, d.edge, e.clientX - d.x, e.clientY - d.y, d.W, d.H);
        onRect(d.last);
    };
    const up = () => {
        const d = drag.current;
        drag.current = null;
        if (d?.last) onDone(d.last);
    };
    return EDGES.map((edge) => (
        <div key={edge} className={`win-edge is-${edge}`} aria-hidden="true" onPointerDown={down(edge)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
    ));
}
