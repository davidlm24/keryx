// THE window and the console's dialogs take and give back the keyboard
// focus (design audit C-12, WCAG 2.4.3): Tab stays inside the one on top,
// and on close the focus goes back to what opened it — only when it was
// opened from the keyboard. After a mouse open the focus goes nowhere, as
// before, because the console's live keys want nothing focused (CLAUDE.md:
// a click never leaves focus on a control). Plain JS, no DOM imports, so
// node --test can check it with stand-in elements.

// What Tab can land on. Hidden pages of the window (`hidden`), disabled
// controls and tabindex="-1" are left out by `tabbables`.
export const TABBABLE = "button, a[href], input:not([type='hidden']), select, textarea, summary, [tabindex], [contenteditable='true'], [contenteditable='']";
const TEXT = "input, textarea, select, [contenteditable='true'], [contenteditable='']";

const usable = (el) => !el.disabled
    && el.getAttribute?.("tabindex") !== "-1"
    && !el.closest?.("[hidden], [inert]")
    && el.getAttribute?.("aria-hidden") !== "true";

// The elements of `root` Tab walks, in document order.
export function tabbables(root) {
    if (!root?.querySelectorAll) return [];
    return [...root.querySelectorAll(TABBABLE)].filter(usable);
}

// Where Tab (back = Shift+Tab) goes from `active` in `list`; null leaves it
// to the browser (a step inside the list). Focus outside the list (on the
// body after a click blurred a button) comes back to its first element (or
// its last, going back); the ends wrap around.
export function tabTarget(list, active, back = false) {
    if (!list.length) return null;
    const i = list.indexOf(active);
    if (i < 0) return back ? list[list.length - 1] : list[0];
    if (!back && i === list.length - 1) return list[0];
    if (back && i === 0) return list[list.length - 1];
    return null;
}

// The control a window page starts on when it opens from the keyboard: the
// first of its body (after its bar: the (x) is not where to start), else
// null (the caller focuses the bar's title). A text field counts: the
// first Esc leaves it, as everywhere.
export function firstControl(list, isInBar = () => false) {
    return list.find((el) => !isInBar(el)) || null;
}

// The first control that is not a text field (a dialog opened with the
// mouse never starts in a field: B and L would type there).
export const isTextField = (el) => Boolean(el?.closest?.(TEXT));

// Who gets the focus back when a dialog closes: the element that opened it,
// when it was opened from the keyboard and is still on screen; else nobody.
export function returnTarget(opener) {
    if (!opener || opener.isConnected === false) return null;
    if (opener.tagName === "BODY" || opener.tagName === "HTML") return null;
    if (opener.closest?.("[hidden], [inert]")) return null;
    return opener;
}
