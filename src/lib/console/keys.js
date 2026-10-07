// What a key press on the console means. A live shortcut never overrides a
// focused control: Enter on a focused button, tab, row or menu item
// activates that control, and only sends the Prévia when nothing interactive
// has focus (or focus is on the Program/Preview area itself). Ctrl/Cmd+Enter
// sends from anywhere except text fields. Plain JS, no DOM imports, so
// node --test can check it with stand-in elements.
//
// target: the event target, read through `closest(selector)` and `tagName`
// (window or document when nothing has focus).

const TEXT = "input, textarea, select, [contenteditable='true'], [contenteditable='']";
const CONTROL = "button, a[href], [role='button'], [role='tab'], [role='radio'], [role='menuitem'], [role='option'], [role='slider'], summary, [tabindex]:not([data-live-keys])";
// Areas whose focus means "aimed at what goes on air": Enter sends there.
const LIVE_AREA = "[data-live-keys]";

const isElement = (t) => Boolean(t && typeof t.closest === "function" && t.tagName);

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
const isAltGr = (e) => e.ctrlKey && e.altKey && typeof e.key === "string" && e.key.length === 1;

// Focus left by a mouse click on a control should not trap the live keys:
// the console blurs it (see Console.jsx). A keyboard-focused control (Tab)
// keeps its own Enter/Space, as before.
//
// -> "send" | "next" | "prev" | "black" | "logo" | "clear" | "end" | "blur" |
//    "search" | "help" | "play" | null
export function liveAction(e) {
    const kind = focusKind(e.target);
    const altGr = isAltGr(e);
    const mod = (e.ctrlKey || e.metaKey) && !altGr;
    // In a text field the first Esc leaves the field; every other key is typing.
    if (kind === "text") return e.key === "Escape" ? "blur" : null;
    if (e.key === "Enter") {
        if (mod) return "send";
        return kind === "control" ? null : "send";
    }
    if (mod || (e.altKey && !altGr)) return null;
    switch (e.key) {
        case "ArrowRight": return kind === "control" && e.target.closest("[role='radiogroup'], [role='tablist'], [role='menu']") ? null : "next";
        case "ArrowLeft": return kind === "control" && e.target.closest("[role='radiogroup'], [role='tablist'], [role='menu']") ? null : "prev";
        case " ": return kind === "control" ? null : "play";
        case "b": case "B": return "black";
        case "l": case "L": return "logo";
        case "c": case "C": return "clear";
        case "Escape": return "end";
        case "/": return "search";
        case "?": return "help";
        default: return null;
    }
}

// In the Bible environment, typing a reference opens the quick jump (as in
// Holyrics): a letter or digit, nothing focused, no modifier. "B" stays Tela
// preta (no book of the Portuguese canon starts with B); L and C start books
// (Lucas, Levítico, Crônicas, Colossenses…), so there they type.
// -> the character to start with, or null.
export function quickJumpKey(e) {
    if (focusKind(e.target) !== "none") return null;
    if ((e.ctrlKey || e.metaKey || e.altKey) && !isAltGr(e)) return null;
    if (typeof e.key !== "string" || e.key.length !== 1) return null;
    if (e.key === "b" || e.key === "B") return null;
    return /[\p{L}\d]/u.test(e.key) ? e.key : null;
}
