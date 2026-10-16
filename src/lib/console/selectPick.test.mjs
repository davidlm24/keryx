import test from "node:test";
import assert from "node:assert/strict";
import { blurSelectsAfterPick } from "./selectPick.js";

// A stand-in root: the listeners it holds, fired with a fake event.
const fakeRoot = () => {
    const on = {};
    return {
        addEventListener: (type, f, capture) => { assert.equal(capture, true, "capture: before the page's own"); (on[type] ||= new Set()).add(f); },
        removeEventListener: (type, f) => on[type]?.delete(f),
        fire: (type, target) => [...(on[type] || [])].forEach((f) => f({ type, target })),
        count: () => Object.values(on).reduce((n, s) => n + s.size, 0),
    };
};
// An element: blur() counts; `inside` lists the selectors its ancestors match.
const node = (tagName, inside = []) => {
    const n = { tagName, blurred: 0, blur() { n.blurred += 1; } };
    n.closest = (sel) => (sel.split(",").some((s) => s.trim() === tagName.toLowerCase() || inside.includes(s.trim())) ? n : null);
    return n;
};
const setup = (opts) => {
    const root = fakeRoot();
    const pending = [];
    const off = blurSelectsAfterPick(root, { defer: (f) => pending.push(f), ...opts });
    const flush = () => pending.splice(0).forEach((f) => f());
    return { root, off, flush };
};

test("a select picked with the mouse gives the focus back, after its change", () => {
    const { root, flush } = setup();
    const select = node("SELECT");
    root.fire("pointerdown", select);
    assert.equal(select.blurred, 0, "never on the press: it would close the list");
    root.fire("change", select);
    assert.equal(select.blurred, 0, "deferred: React's onChange reads it first");
    flush();
    assert.equal(select.blurred, 1);
    // The next change without a press is the keyboard's (the focus stayed, say).
    root.fire("change", select);
    flush();
    assert.equal(select.blurred, 1);
});

test("a select changed from the keyboard keeps the focus: ↑/↓ go on walking it", () => {
    const { root, flush } = setup();
    const select = node("SELECT");
    root.fire("keydown", select);
    root.fire("change", select);
    flush();
    assert.equal(select.blurred, 0, "reached with Tab, changed with ↓");
    // Opened with the mouse, then a key the page saw (the list had closed:
    // Esc, a click away) before ↓ changed it.
    root.fire("pointerdown", select);
    root.fire("keydown", select);
    root.fire("change", select);
    flush();
    assert.equal(select.blurred, 0);
});

test("only the select that was pressed, and never inside the skipped areas", () => {
    const { root, flush } = setup({ skip: ".dialog, .palette" });
    const select = node("SELECT");
    const other = node("SELECT");
    root.fire("pointerdown", select);
    root.fire("change", other);
    flush();
    assert.equal(other.blurred + select.blurred, 0, "another select's change (a script's)");
    root.fire("pointerdown", node("BUTTON"));
    root.fire("change", select);
    flush();
    assert.equal(select.blurred, 0, "a press elsewhere since");
    const inDialog = node("SELECT", [".dialog"]);
    root.fire("pointerdown", inDialog);
    root.fire("change", inDialog);
    flush();
    assert.equal(inDialog.blurred, 0, "a dialog runs its own keys");
});

test("removing takes every listener away", () => {
    const { root, off } = setup();
    assert.equal(root.count(), 3);
    off();
    assert.equal(root.count(), 0);
});
