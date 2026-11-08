// A <select> picked with the mouse gives the focus back (audit C-03), as a
// clicked button does (the console's onMouseClick): left focused, it kept
// the live keys' ↑/↓ and its type-ahead took the letters. Not on the click,
// which would close its list: on the `change` that ends a mouse pick. One
// changed from the keyboard (reached with Tab, ↑/↓ or Alt+↓) keeps the
// focus, so ↑/↓ go on walking it. While a select's list is open its keys go
// to the list, never to the page, so a key the page sees means the list is
// closed and the next change is the keyboard's.
// root: window or document (anything with addEventListener). skip: where a
// select keeps the focus (dialogs that run their own keys, as onMouseClick).
// -> a function that removes the listeners.
export function blurSelectsAfterPick(root, { skip = "", defer = (f) => setTimeout(f, 0) } = {}) {
    let pointed = null;
    const onPointer = (e) => { pointed = e.target?.closest?.("select") || null; };
    const onKey = () => { pointed = null; };
    const onChange = (e) => {
        const s = e.target;
        if (!s || s !== pointed) return;
        pointed = null;
        if (skip && s.closest?.(skip)) return;
        // After React's onChange has read it.
        defer(() => s.blur?.());
    };
    root.addEventListener("pointerdown", onPointer, true);
    root.addEventListener("keydown", onKey, true);
    root.addEventListener("change", onChange, true);
    return () => {
        root.removeEventListener("pointerdown", onPointer, true);
        root.removeEventListener("keydown", onKey, true);
        root.removeEventListener("change", onChange, true);
    };
}
