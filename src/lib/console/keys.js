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
const ARROW_CONTROLS = "[role='radiogroup'], [role='tablist'], [role='menu'], [role='separator']";

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
// -> "send" | "next" | "prev" | "selUp" | "selDown" | "black" | "logo" |
//    "clear" | "end" | "blur" | "search" | "help" | "play" | null
// ←/→ move what is on air; ↑/↓ move the selection (Holyrics): the selected
// slide or verse turns green and goes out with Enter or a double click.
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
    // Arrows belong to the control when it uses them itself: radio groups,
    // tab lists, menus, and a splitter focused with Tab (it resizes).
    const ownsArrows = kind === "control" && e.target.closest(ARROW_CONTROLS);
    if (ARROWS[e.key]) {
        const vertical = VERTICAL.has(e.key);
        return ownsArrows || (vertical && kind === "control" && e.target.closest("select")) ? null : ARROWS[e.key];
    }
    if (e.key === " ") return kind === "control" ? null : "play";
    return PLAIN[e.key] || null;
}

// The keys without a modifier (besides Enter, the arrows and Space above).
// PageDown / PageUp are what a presentation clicker sends (Rodada F3): the
// next / previous slide or page on air, as → / ←; a list, a menu or a select
// that uses them keeps them, as it keeps ↑/↓.
const ARROWS = { ArrowRight: "next", ArrowLeft: "prev", ArrowUp: "selUp", ArrowDown: "selDown", PageDown: "next", PageUp: "prev" };
const VERTICAL = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown"]);
const PLAIN = { b: "black", B: "black", l: "logo", L: "logo", c: "clear", C: "clear", Escape: "end", "/": "search", "?": "help" };

// Every shortcut, as the operator reads it: the ? list and Configurações ›
// Console draw this table, and keys.test.mjs checks it against liveAction
// both ways (a key the console handles is listed; a listed key does what
// it says). probe: a key press that triggers it (null: not a key — a
// double click, typing a reference).
export const SHORTCUTS = [
    { keys: "Ctrl+Enter", label: "Enviar a Prévia ao ar (de qualquer lugar)", action: "send", probe: { key: "Enter", ctrlKey: true } },
    { keys: "Enter", label: "Enviar ao ar (depois de clicar numa música ou versículo)", action: "send", probe: { key: "Enter" } },
    { keys: "2 cliques", label: "Enviar o item ao ar na hora (biblioteca, setlist, slides, versículos)", action: null, probe: null },
    { keys: "← →", label: "Slide ou versículo anterior / próximo no ar", action: "prev", probe: { key: "ArrowLeft" }, also: [["next", { key: "ArrowRight" }]] },
    { keys: "PageUp PageDown", label: "Passador de slides: anterior / próximo no ar (como ← →)", action: "prev", probe: { key: "PageUp" }, also: [["next", { key: "PageDown" }]] },
    { keys: "↑ ↓", label: "Mover a seleção (verde) sem mudar o que está no ar", action: "selUp", probe: { key: "ArrowUp" }, also: [["selDown", { key: "ArrowDown" }]] },
    { keys: "Espaço", label: "Tocar / pausar", action: "play", probe: { key: " " } },
    { keys: "B", label: "Tela preta (na hora)", action: "black", probe: { key: "b" } },
    { keys: "L", label: "Mostrar logo", action: "logo", probe: { key: "l" } },
    { keys: "C", label: "Limpar texto", action: "clear", probe: { key: "c" } },
    { keys: "Esc", label: "Tirar tudo do ar na hora (o aviso traz Desfazer) ou fechar o que está aberto", action: "end", probe: { key: "Escape" } },
    { keys: "Letra", label: "Na Bíblia: digitar a referência (ex.: jo 3 16)", action: null, probe: null },
    { keys: "/", label: "Buscar em tudo (em Configurações: buscar nas configurações)", action: "search", probe: { key: "/" } },
    { keys: "?", label: "Esta lista", action: "help", probe: { key: "?" } },
];

// Esc closes the topmost thing open over the console, one per press, and
// only with nothing open ends the projection (live safety: closing a menu
// must never take the screens down). Topmost first: a context menu, a
// popover or dialog (the menu, Saídas, the palette, Verificar…), then the
// WINDOW — Configurações, the views and the editors are pages of one
// floating window since Rodada C (src/lib/console/nav.js): Esc there goes
// to the top page's registered request, whose unsaved guard may ask, and
// pops one level ("← Voltar") or, at the first, closes — then the Camadas
// drawer. A text field's first Esc only leaves the field (liveAction's
// "blur"), before any of these.
// layers: { menu, library, popover, window, drawer, edit } (truthy = open)
// -> the layer to close, or "end".
// "edit" (Ver › Editar layout) is the outermost: Esc leaves the edit mode
// before it would end the projection. The background library opens from a
// popover or any window page, always on top: it closes right after a
// right-click menu (and the "Excluir?" question, which is over everything).
export const ESC_ORDER = ["menu", "confirm", "library", "popover", "window", "drawer", "edit"];
export function escapeTarget(layers = {}) {
    return ESC_ORDER.find((k) => Boolean(layers[k])) || "end";
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
