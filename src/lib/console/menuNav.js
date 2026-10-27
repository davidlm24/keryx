// The keyboard inside the console's menus (src/components/console/Menu.jsx,
// the one menu every list, popover and the menu bar draw; audit C-14/C-15,
// 2026-10-16): the pure parts, tested in menuNav.test.mjs.

// Where the focus goes in a menu for a key: ↓ / ↑ walk the items (round the
// ends), Home / End jump to the first / last, disabled items are skipped.
// items: [{ disabled? }] (the focusable rows only, in order); at: the index
// with the focus (-1: none yet). -> the index to focus, or null when the key
// is not a menu key or no item can take it.
export function menuStep(items, at, key) {
    const n = items.length;
    const ok = (i) => !items[i]?.disabled;
    const scan = (start, d) => {
        for (let k = 0, i = start; k < n; k += 1, i = (i + d + n) % n) if (ok(i)) return i;
        return null;
    };
    if (!n) return null;
    if (key === "Home") return scan(0, 1);
    if (key === "End") return scan(n - 1, -1);
    if (key === "ArrowDown") return scan(at < 0 ? 0 : (at + 1) % n, 1);
    if (key === "ArrowUp") return scan(at < 0 ? n - 1 : (at - 1 + n) % n, -1);
    return null;
}

// Lower case without accents ("Mídia" -> "midia").
const bare = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

// The menu bar's access keys (Alt + the letter, as in a Windows program; the
// letter is underlined only while Alt is held, so the bar reads as before).
// Mídia takes its D: M is Música's.
export const ACCESS_KEYS = { culto: "c", musica: "m", midia: "d", ferramentas: "f", ajuda: "a" };

// The label split around its access letter, for the underline:
// -> [before, letter, after] (the letter "" when the label lacks it).
export function accessParts(label, letter) {
    const s = String(label || "");
    const i = letter ? bare(s).indexOf(letter) : -1;
    return i < 0 ? [s, "", ""] : [s.slice(0, i), s.slice(i, i + 1), s.slice(i + 1)];
}

// A key press the menu bar answers anywhere in the console:
// F10 (no modifier) -> "bar" (the focus goes to the bar, nothing opens);
// Alt + an access letter -> "open:<id>" (that menu opens, its first item
// focused). AltGr (Ctrl+Alt on Windows) types, never a shortcut. null otherwise.
export function menuBarKey(e) {
    if (!e) return null;
    if (e.key === "F10" && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) return "bar";
    if (!e.altKey || e.ctrlKey || e.metaKey) return null;
    const ch = bare(typeof e.key === "string" && e.key.length === 1 ? e.key : (e.code || "").replace(/^Key/, ""));
    const id = Object.keys(ACCESS_KEYS).find((k) => ACCESS_KEYS[k] === ch);
    return id ? `open:${id}` : null;
}

// Alt pressed and let go alone (no other key, no click in between) focuses
// the menu bar, as in Windows. Fed every keydown/keyup/pointerdown:
// -> { state, fire } where fire is true on the Alt release that counts.
export function altTap(state, ev) {
    if (ev.type === "keydown") {
        if (ev.key === "Alt") return { state: ev.repeat ? state : "down", fire: false };
        return { state: null, fire: false };
    }
    if (ev.type === "keyup" && ev.key === "Alt") return { state: null, fire: state === "down" };
    if (ev.type === "pointerdown" || ev.type === "blur") return { state: null, fire: false };
    return { state, fire: false };
}

// Where the focus goes when a menu or popover closes, so the console's live
// keys keep working: back to the control that opened it only when the
// keyboard both opened and closed it (Tab, Enter, Esc); after a mouse open or
// a mouse pick, nothing keeps it (the body) — a click never leaves the focus
// on a control (Console.jsx onMouseClick). And never when something else
// took the focus meanwhile (a dialog the item opened, a field).
// -> "trigger" | "none"
export function focusAfterClose({ openedBy, closedBy, focusFree, trigger }) {
    return openedBy === "key" && closedBy === "key" && focusFree && trigger ? "trigger" : "none";
}
