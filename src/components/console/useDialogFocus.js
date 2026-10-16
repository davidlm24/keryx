import { useEffect, useRef } from "react";
import { tabbables, tabTarget, returnTarget, firstControl, TABBABLE } from "@/lib/console/focusTrap";

// The keyboard focus of THE window and the console's dialogs (design audit
// C-12; the rules are src/lib/console/focusTrap.js, tested). The open ones
// are a stack: Tab walks only the one on top (the "Excluir?" question over
// the window, the window over the console). On close the focus goes back to
// the element that opened it when it was opened from the keyboard; after a
// mouse open it goes nowhere, as before (the live keys want nothing focused).

// What the operator used last: a key (other than a modifier alone) or the
// pointer. A dialog opened by Enter or Space on a focused button, or by a
// shortcut, counts as opened from the keyboard.
let fromKeys = false;
const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "AltGraph"]);
if (typeof window !== "undefined") {
    window.addEventListener("keydown", (e) => { if (!MODIFIERS.has(e.key)) fromKeys = true; }, true);
    window.addEventListener("pointerdown", () => { fromKeys = false; }, true);
}
export const lastInputWasKeyboard = () => fromKeys;

// The focused element, or null for the body (nothing focused).
export const focusedElement = () => {
    const a = typeof document !== "undefined" ? document.activeElement : null;
    return a && a !== document.body && a !== document.documentElement ? a : null;
};

const traps = [];
let listening = false;
function onTab(e) {
    if (e.key !== "Tab" || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
    const root = traps[traps.length - 1]?.current;
    if (!root) return;
    const active = focusedElement();
    const inside = Boolean(active && root.contains(active));
    // Focus somewhere else that is not the body: a popover or the palette
    // opened over the window, the toast — they keep their own Tab.
    if (active && !inside) return;
    const to = tabTarget(tabbables(root), inside ? active : null, e.shiftKey);
    if (to) { e.preventDefault(); to.focus(); }
}

// ref: the dialog's element; active: whether it is open now. The dialog
// still chooses its own first focus (its button, its field).
export function useDialogFocus(ref, active = true) {
    useEffect(() => {
        if (!active) return undefined;
        const before = focusedElement();
        const opener = fromKeys && before && !ref.current?.contains(before) ? before : null;
        const entry = ref;
        traps.push(entry);
        if (!listening) { document.addEventListener("keydown", onTab, true); listening = true; }
        return () => {
            const i = traps.lastIndexOf(entry);
            if (i >= 0) traps.splice(i, 1);
            // After the commit that closed it (its scrim, a page above it):
            // only when nothing else took the focus meanwhile.
            setTimeout(() => {
                const back = returnTarget(opener);
                const now = focusedElement();
                if (back && (!now || !now.isConnected)) back.focus();
            }, 0);
        };
    }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
}

// THE window's pages (nav.js stack): when the page on top changes — the
// window opens, a page is pushed, Voltar pops one — the focus moves into
// the page now shown, never left on the body or in a hidden page below.
// From the keyboard: a pushed page starts on its body's first control, a
// page Voltar uncovers on the control it had. With the mouse (or at launch,
// ?config=): the bar's title, inside the window but holding no keys, so
// Esc still closes at once and B and L still reach the screens. A page that
// already put the focus inside itself (its own field) keeps it.
// boxRef: the element holding the `.win-page`s; win: the stack.
export function useWinPageFocus(boxRef, win) {
    const topKey = win.length ? win[win.length - 1].key : null;
    const prevKey = useRef(null);
    const saved = useRef(new Map());
    useEffect(() => {
        const covered = prevKey.current;
        prevKey.current = topKey;
        if (!topKey) { saved.current.clear(); return undefined; }
        const keys = fromKeys;
        const was = focusedElement();
        // Pushed over another page: where its focus was, for Voltar.
        if (covered && covered !== topKey && win.some((e) => e.key === covered) && was) saved.current.set(covered, was);
        for (const k of [...saved.current.keys()]) if (!win.some((e) => e.key === k)) saved.current.delete(k);
        const t = setTimeout(() => {
            const page = boxRef.current?.querySelector(".win-page:not([hidden])");
            if (!page) return;
            const now = focusedElement();
            if (now && page.contains(now)) return;
            const back = keys ? returnTarget(saved.current.get(topKey)) : null;
            saved.current.delete(topKey);
            const title = page.querySelector(".win-title");
            const to = (back && page.contains(back) ? back : null)
                || (keys ? firstControl(tabbables(page), (el) => Boolean(el.closest(".win-bar"))) : null)
                || title || page.querySelector(TABBABLE);
            to?.focus({ preventScroll: true });
        }, 0);
        return () => clearTimeout(t);
    }, [topKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
