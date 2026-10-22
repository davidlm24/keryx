// What a key press on the console means. A live shortcut never overrides a
// focused control: Enter on a focused button, tab, row or menu item
// activates that control, and only sends the Prévia when nothing interactive
// has focus (or focus is on the Program/Preview area itself). Ctrl/Cmd+Enter
// sends from anywhere except text fields. Plain JS, no DOM imports, so
// node --test can check it with stand-in elements.
//
// target: the event target, read through `closest(selector)` and `tagName`
// (window or document when nothing has focus).
//
// A <select> is a control, not a text field (audit C-03: as text it took
// every live key, and typing a reference switched the Bíblia's edition). A
// mouse pick gives the focus back (selectPick.js); one reached with Tab
// keeps ↑/↓, PageUp/PageDown and Space (they walk or open it) and the
// letters the console does not use (its type-ahead). Enter, ←/→, B/L/C,
// Esc, / and the Bíblia's quick jump are the console's.

// liveAction and the focus rules it reads live in liveKeys.js (the outputs
// load that one alone); everything is exported from here as before.
import { isSelect, isAltGr, focusKind, letterKeys, LETTER } from "./liveKeys.js";
export { focusKind, liveAction, LETTER_KEYS, letterKeys } from "./liveKeys.js";

const FIXED_HINTS = { send: "Enter", end: "Esc", undo: "Ctrl+Z", delete: "Delete", rename: "F2" };

// The key a menu or a tooltip names for an action under that choice, or
// null when no key does it (Tela preta with the letters off).
export function keyHint(action, letters = "on") {
    const mode = letterKeys(letters);
    // Keys that do not depend on the letter choice. send/end/undo are
    // liveAction's (keys.test.mjs pins them); delete/rename are the lists'
    // own (gridNav.js, the Mídia and the Escola), named here so no menu types
    // them by hand — a menu shows them only where its list handles the key.
    if (action in FIXED_HINTS) return FIXED_HINTS[action];
    if (action === "search") return mode === "on" ? "/" : "Ctrl+F";
    if (mode === "off") return null;
    if (action === "help") return "?";
    const k = Object.keys(LETTER).find((x) => LETTER[x] === action);
    if (!k) return null;
    return mode === "shift" ? `Shift+${k.toUpperCase()}` : k.toUpperCase();
}

// What each choice means, for Configurações › Console (under the choice).
export const LETTER_KEYS_HINT = {
    on: "B, L, C, / e ? agem sozinhas, como no Holyrics",
    shift: "Shift+B, Shift+L e Shift+C; ? mostra os atalhos; Ctrl+F busca",
    off: "nenhuma letra age sozinha; Ctrl+F busca",
};


// Every shortcut, as the operator reads it: the ? list and Configurações ›
// Console draw this table, and keys.test.mjs checks it against liveAction
// both ways, for each choice of the letter keys (a key the console handles
// is listed; a listed key does what it says). probe: a key press that
// triggers it (null: not a key — a double click, typing a reference, the
// zoom, which the main process handles: electron/consoleZoom.cjs).
export function shortcutsFor(letters = "on") {
    const mode = letterKeys(letters);
    const shift = mode === "shift";
    const letter = (k, label, action) => (mode === "off" ? [] : [{ keys: shift ? `Shift+${k}` : k, label, action, probe: { key: shift ? k : k.toLowerCase(), shiftKey: shift } }]);
    return [
        ...SHORTCUTS_HEAD,
        ...letter("B", "Tela preta (na hora)", "black"),
        ...letter("L", "Mostrar logo", "logo"),
        ...letter("C", "Limpar texto", "clear"),
        ...SHORTCUTS_MID,
        mode === "on"
            ? { keys: "/  Ctrl+F", label: "Buscar em tudo (em Configurações: buscar nas configurações)", action: "search", probe: { key: "/" }, also: [["search", { key: "f", ctrlKey: true }]] }
            : { keys: "Ctrl+F", label: "Buscar em tudo", action: "search", probe: { key: "f", ctrlKey: true } },
        ...(mode === "off" ? [] : [{ keys: "?", label: "Esta lista", action: "help", probe: { key: "?", shiftKey: true } }]),
        { keys: "Ctrl+=  Ctrl+−", label: "Zoom do console: aumentar / diminuir, também Ctrl+roda do mouse (Ctrl+0 volta a 100 %; as saídas não mudam)", action: null, probe: null },
        // Pressed in the output's own window (electron/outputs-manager.cjs), not in the console.
        { keys: "Ctrl+W", label: "Numa saída (projetor, palco…): fechar essa saída", action: null, probe: null },
    ];
}
const SHORTCUTS_HEAD = [
    { keys: "Ctrl+Enter", label: "Enviar a Prévia ao ar (de qualquer lugar)", action: "send", probe: { key: "Enter", ctrlKey: true } },
    { keys: "Enter", label: "Enviar ao ar (depois de clicar numa música ou versículo)", action: "send", probe: { key: "Enter" } },
    { keys: "2 cliques", label: "Enviar o item ao ar na hora (biblioteca, setlist, slides, versículos)", action: null, probe: null },
    { keys: "← →", label: "Slide ou versículo anterior / próximo no ar", action: "prev", probe: { key: "ArrowLeft" }, also: [["next", { key: "ArrowRight" }]] },
    { keys: "PageUp PageDown", label: "Passador de slides: anterior / próximo no ar (como ← →)", action: "prev", probe: { key: "PageUp" }, also: [["next", { key: "PageDown" }]] },
    { keys: "↑ ↓", label: "Mover a seleção (verde) sem mudar o que está no ar", action: "selUp", probe: { key: "ArrowUp" }, also: [["selDown", { key: "ArrowDown" }]] },
    { keys: "Espaço", label: "Tocar / pausar", action: "play", probe: { key: " " } },
];
const SHORTCUTS_MID = [
    { keys: "Esc", label: "Tirar tudo do ar na hora, música incluída (o aviso traz Desfazer) ou fechar o que está aberto", action: "end", probe: { key: "Escape" } },
    { keys: "Ctrl+Z", label: "Desfazer o Esc ou o Encerrar (enquanto o aviso mostra Desfazer)", action: "undo", probe: { key: "z", ctrlKey: true } },
    { keys: "Letra", label: "Na Bíblia: digitar a referência (ex.: jo 3 16)", action: null, probe: null },
];
export const SHORTCUTS = shortcutsFor("on");

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
// "countdown" (the Setlist automática's "Próximo em 5 s", Rodada N2) is
// cancelled before anything on the console itself, so Esc never ends the
// air while the next item is about to go.
// "selection" (items marked in a console list, multiSelect.js, owner
// 2026-10-21 M7): cleared before the air ends, so with something marked the
// first Esc never takes anything off the screens. A page of THE window clears
// its own selection through its escRef ("window", above).
export const ESC_ORDER = ["menu", "confirm", "library", "popover", "window", "countdown", "drawer", "selection", "edit"];
export function escapeTarget(layers = {}) {
    return ESC_ORDER.find((k) => Boolean(layers[k])) || "end";
}

// In the Bible environment, typing a reference opens the quick jump (as in
// Holyrics): a letter or digit, nothing focused, no modifier. "B" stays Tela
// preta (no book of the Portuguese canon starts with B); L and C start books
// (Lucas, Levítico, Crônicas, Colossenses…), so there they type — unless
// the letter keys are "com Shift": then Shift+B/L/C are the screen keys. A
// focused select does not keep them (its type-ahead switched the edition, C-03).
// -> the character to start with, or null.
export function quickJumpKey(e, letters = "on") {
    if (focusKind(e.target) !== "none" && !isSelect(e.target)) return null;
    if ((e.ctrlKey || e.metaKey || e.altKey) && !isAltGr(e)) return null;
    if (typeof e.key !== "string" || e.key.length !== 1) return null;
    if (e.key === "b" || e.key === "B") return null;
    if (letterKeys(letters) === "shift" && e.shiftKey && LETTER[e.key.toLowerCase()]) return null;
    return /[\p{L}\d]/u.test(e.key) ? e.key : null;
}
