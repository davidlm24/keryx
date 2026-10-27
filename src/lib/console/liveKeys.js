// The live keys an output window shares with the console (liveAction and
// what it reads), apart from keys.js so the outputs, which load it through
// screenKeys.js, never carry the console's shortcut lists and hints
// (scripts/bundle-budget.cjs). keys.js re-exports all of it: import from
// there in the console. Plain JS, no DOM imports (keys.test.mjs).

export const TEXT = "input, textarea, [contenteditable='true'], [contenteditable='']";
export const CONTROL = "button, a[href], select, [role='button'], [role='tab'], [role='radio'], [role='menuitem'], [role='option'], [role='slider'], summary, [tabindex]:not([data-live-keys])";
// Areas whose focus means "aimed at what goes on air": Enter sends there.
export const LIVE_AREA = "[data-live-keys]";
export const ARROW_CONTROLS = "[role='radiogroup'], [role='tablist'], [role='menu'], [role='separator'], [role='slider']";

export const isElement = (t) => Boolean(t && typeof t.closest === "function" && t.tagName);
export const isSelect = (t) => isElement(t) && Boolean(t.closest("select"));

export function focusKind(target) {
    if (!isElement(target) || target.tagName === "BODY" || target.tagName === "HTML") return "none";
    if (target.closest(TEXT)) return "text";
    if (target.matches?.(LIVE_AREA)) return "live";
    if (target.closest(CONTROL)) return "control";
    if (target.closest(LIVE_AREA)) return "live";
    return "none";
}

// AltGr on Windows (ABNT2 "/" and "?") arrives as Ctrl+Alt with a printable
// key: that is typing, not a shortcut.
export const isAltGr = (e) => e.ctrlKey && e.altKey && typeof e.key === "string" && e.key.length === 1;

// Focus left by a mouse click on a control should not trap the live keys:
// the console blurs it (see Console.jsx). A keyboard-focused control (Tab)
// keeps its own Enter/Space, as before.
//
// -> "send" | "next" | "prev" | "selUp" | "selDown" | "black" | "logo" |
//    "clear" | "end" | "undo" | "blur" | "search" | "help" | "play" | null
// ←/→ move what is on air; ↑/↓ move the selection (Holyrics): the selected
// slide or verse turns green and goes out with Enter or a double click.
// letters: the church's "Teclas de uma letra" (LETTER_KEYS, letterKeys).
export function liveAction(e, letters = "on") {
    const kind = focusKind(e.target);
    const altGr = isAltGr(e);
    const mod = (e.ctrlKey || e.metaKey) && !altGr;
    // In a text field the first Esc leaves the field; every other key is typing.
    if (kind === "text") return e.key === "Escape" ? "blur" : null;
    // A closed select does nothing with Enter on Windows: it sends, as
    // with nothing focused.
    if (e.key === "Enter") {
        if (mod) return "send";
        return kind === "control" && !isSelect(e.target) ? null : "send";
    }
    // Ctrl+F searches whatever the letter keys are (with them off it is the
    // keyboard's way to the search).
    if (mod && !e.altKey && !e.shiftKey && (e.key === "f" || e.key === "F")) return "search";
    // Ctrl+Z: Desfazer while the toast after Esc / Encerrar offers it (design
    // audit C-13); in a text field (above) it stays the field's own undo.
    if (mod && !e.shiftKey && !e.altKey && (e.key === "z" || e.key === "Z")) return "undo";
    if (mod || (e.altKey && !altGr)) return null;
    // Arrows belong to the control when it uses them itself: radio groups,
    // tab lists, menus, a splitter focused with Tab (it resizes), the
    // player's progress bar focused with Tab (5 s a press, Rodada F1) and a
    // select's ↑/↓ (←/→ on it move the air; the console prevents the select's own).
    const ownsArrows = kind === "control" && e.target.closest(ARROW_CONTROLS);
    if (ARROWS[e.key]) {
        const vertical = VERTICAL.has(e.key);
        return ownsArrows || (vertical && isSelect(e.target)) ? null : ARROWS[e.key];
    }
    if (e.key === " ") return kind === "control" ? null : "play";
    if (e.key === "Escape") return "end";
    return letterAction(e, letters);
}

// "Teclas de uma letra" (owner 2026-10-16, after the audit's WCAG 2.1.4
// question: a dictated word or a stray key must not take the screens): B, L,
// C, / and ? act alone, as in Holyrics (ligadas, the default), only with
// Shift (com Shift), or never (desligadas). "?" is Shift+/ on every
// keyboard, so with Shift it stays and "/" has no key (Ctrl+F searches).
// User.letter_keys, the church's; null = ligadas.
export const LETTER_KEYS = [["on", "Ligadas"], ["shift", "Com Shift"], ["off", "Desligadas"]];
export const letterKeys = (v) => (LETTER_KEYS.some(([k]) => k === v) ? v : "on");
export const LETTER = { b: "black", l: "logo", c: "clear" };
export function letterAction(e, letters) {
    const mode = letterKeys(letters);
    const k = typeof e.key === "string" ? e.key : "";
    if (mode === "off" || k.length !== 1) return null;
    if (k === "?") return "help";
    if (k === "/") return mode === "on" ? "search" : null;
    const action = LETTER[k.toLowerCase()];
    if (!action) return null;
    return mode === "on" || e.shiftKey ? action : null;
}

// The keys without a modifier (besides Enter, the arrows and Space above).
// PageDown / PageUp are what a presentation clicker sends (Rodada F3): the
// next / previous slide or page on air, as → / ←; a list, a menu or a select
// that uses them keeps them, as it keeps ↑/↓.
export const ARROWS = { ArrowRight: "next", ArrowLeft: "prev", ArrowUp: "selUp", ArrowDown: "selDown", PageDown: "next", PageUp: "prev" };
export const VERTICAL = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown"]);
