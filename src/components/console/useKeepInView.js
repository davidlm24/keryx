import { useEffect } from "react";
import { keepInView } from "@/lib/console/keepInView";

// The box that actually scrolls: the list itself, else the nearest
// ancestor that scrolls (the Setlist scrolls in its panel's body).
function scrollerOf(el) {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
        const st = getComputedStyle(n);
        const y = /(auto|scroll)/.test(st.overflowY) && n.scrollHeight > n.clientHeight + 1;
        const x = /(auto|scroll)/.test(st.overflowX) && n.scrollWidth > n.clientWidth + 1;
        if (y || x) return { box: n, horizontal: x && !y };
    }
    return null;
}

// Keep the card(s) matching `selector` inside `ref` in view with their
// neighbours (src/lib/console/keepInView.js, owner 2026-10-16): the list moves
// at the next-to-last card. Several matches (verses on air together) count
// as one span. Sets the scroller's own offset, never scrollIntoView (which
// also scrolls the boxes around it).
export default function useKeepInView(ref, selector, deps) {
    useEffect(() => {
        const root = ref.current;
        if (!root) return;
        const els = [...root.querySelectorAll(selector)];
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        const found = scrollerOf(root);
        if (!found) return;
        const { box, horizontal } = found;
        const b = box.getBoundingClientRect();
        const span = (n) => {
            if (!n) return null;
            const r = n.getBoundingClientRect();
            return horizontal
                ? { start: r.left - b.left + box.scrollLeft, end: r.right - b.left + box.scrollLeft }
                : { start: r.top - b.top + box.scrollTop, end: r.bottom - b.top + box.scrollTop };
        };
        // A neighbour is the next card, never the list's drop tail, a drag's lit
        // slot or a hidden row.
        const sib = (n, dir) => { while (n && (n.hasAttribute?.("data-sort-tail") || n.classList?.contains("kx-sort-slot") || !n.getClientRects().length)) n = n[dir]; return n; };
        const item = { start: span(first).start, end: span(last).end };
        const target = keepInView(
            { scroll: horizontal ? box.scrollLeft : box.scrollTop, size: horizontal ? box.clientWidth : box.clientHeight },
            item,
            { next: span(sib(last.nextElementSibling, "nextElementSibling")), prev: span(sib(first.previousElementSibling, "previousElementSibling")) },
        );
        if (target === null) return;
        if (horizontal) box.scrollLeft = target; else box.scrollTop = target;
    }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

// A row focused with Tab follows the selection (audit A11Y-18, C-60): ↑/↓
// move the green selection and Enter acts on the focused row, so while the
// focus is on a row of this list (`rowSel`) it moves to the selected one
// (`selectedSel`). A mouse click never leaves focus on a row (Console.jsx
// onMouseClick), so this only ever follows the keyboard. The scrolling stays
// useKeepInView's.
export function useFocusFollows(ref, rowSel, selectedSel, deps) {
    useEffect(() => {
        const root = ref.current;
        const at = typeof document !== "undefined" ? document.activeElement : null;
        if (!root || !at || !root.contains(at) || !at.matches(rowSel)) return;
        const to = root.querySelector(selectedSel);
        if (to && to !== at) to.focus({ preventScroll: true });
    }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
