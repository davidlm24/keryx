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

// -> "send" | "next" | "prev" | "black" | "logo" | "clear" | "end" | "search" | "help" | "play" | null
export function liveAction(e) {
    const kind = focusKind(e.target);
    const mod = e.ctrlKey || e.metaKey;
    if (kind === "text") return null;
    if (e.key === "Enter") {
        if (mod) return "send";
        return kind === "control" ? null : "send";
    }
    if (mod || e.altKey) return null;
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
