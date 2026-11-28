import test from "node:test";
import assert from "node:assert/strict";
import { menuStep, ACCESS_KEYS, accessParts, menuBarKey, altTap, focusAfterClose } from "./menuNav.js";
import { MENU_IDS, buildMenus } from "./menuBar.js";

const items = [{}, { disabled: true }, {}, {}, { disabled: true }];

test("menuStep: ↓ / ↑ walk round the ends and skip disabled items", () => {
    assert.equal(menuStep(items, -1, "ArrowDown"), 0);
    assert.equal(menuStep(items, 0, "ArrowDown"), 2);
    assert.equal(menuStep(items, 3, "ArrowDown"), 0);
    assert.equal(menuStep(items, 0, "ArrowUp"), 3);
    assert.equal(menuStep(items, -1, "ArrowUp"), 3);
    assert.equal(menuStep(items, 2, "ArrowUp"), 0);
});

test("menuStep: Home / End, other keys and empty menus", () => {
    assert.equal(menuStep(items, 3, "Home"), 0);
    assert.equal(menuStep(items, 0, "End"), 3);
    assert.equal(menuStep(items, 0, "Enter"), null);
    assert.equal(menuStep([], 0, "ArrowDown"), null);
    assert.equal(menuStep([{ disabled: true }], -1, "ArrowDown"), null);
});

test("access keys: one letter per menu of the bar, all different, each in its label", () => {
    assert.deepEqual(Object.keys(ACCESS_KEYS), MENU_IDS);
    assert.equal(new Set(Object.values(ACCESS_KEYS)).size, MENU_IDS.length);
    for (const m of buildMenus({})) assert.notEqual(accessParts(m.label, ACCESS_KEYS[m.id])[1], "", m.label);
    assert.deepEqual(accessParts("Mídia", "d"), ["Mí", "d", "ia"]);
    assert.deepEqual(accessParts("Música", "m"), ["", "M", "úsica"]);
    assert.deepEqual(accessParts("Culto", "x"), ["Culto", "", ""]);
});

test("menuBarKey: F10 focuses the bar, Alt+letter opens its menu, AltGr types", () => {
    assert.equal(menuBarKey({ key: "F10" }), "bar");
    assert.equal(menuBarKey({ key: "F10", shiftKey: true }), null);
    assert.equal(menuBarKey({ key: "c", altKey: true }), "open:culto");
    assert.equal(menuBarKey({ key: "D", altKey: true }), "open:midia");
    assert.equal(menuBarKey({ key: "f", altKey: true, code: "KeyF" }), "open:ferramentas");
    assert.equal(menuBarKey({ key: "c", altKey: true, ctrlKey: true }), null);
    assert.equal(menuBarKey({ key: "x", altKey: true }), null);
    assert.equal(menuBarKey({ key: "c" }), null);
    assert.equal(menuBarKey({ key: "ArrowUp", altKey: true }), null);
});

test("altTap: Alt alone focuses the bar; Alt with another key or a click does not", () => {
    const run = (events) => events.reduce((acc, ev) => { const r = altTap(acc.state, ev); return { state: r.state, fires: acc.fires + (r.fire ? 1 : 0) }; }, { state: null, fires: 0 }).fires;
    assert.equal(run([{ type: "keydown", key: "Alt" }, { type: "keyup", key: "Alt" }]), 1);
    assert.equal(run([{ type: "keydown", key: "Alt" }, { type: "keydown", key: "Alt", repeat: true }, { type: "keyup", key: "Alt" }]), 1);
    assert.equal(run([{ type: "keydown", key: "Alt" }, { type: "keydown", key: "c" }, { type: "keyup", key: "c" }, { type: "keyup", key: "Alt" }]), 0);
    assert.equal(run([{ type: "keydown", key: "Alt" }, { type: "pointerdown" }, { type: "keyup", key: "Alt" }]), 0);
    assert.equal(run([{ type: "keyup", key: "Alt" }]), 0);
});

test("focusAfterClose: the trigger only when the keyboard opened and closed it, and the focus is free", () => {
    const t = {};
    assert.equal(focusAfterClose({ openedBy: "key", closedBy: "key", focusFree: true, trigger: t }), "trigger");
    assert.equal(focusAfterClose({ openedBy: "pointer", closedBy: "key", focusFree: true, trigger: t }), "none");
    assert.equal(focusAfterClose({ openedBy: "key", closedBy: "pointer", focusFree: true, trigger: t }), "none");
    assert.equal(focusAfterClose({ openedBy: "key", closedBy: "key", focusFree: false, trigger: t }), "none");
    assert.equal(focusAfterClose({ openedBy: "key", closedBy: "key", focusFree: true, trigger: null }), "none");
});

test("subAim: a submenu opens on a rest, a click or the keys; passing over never opens one (2026-11-28)", async () => {
    const { subAim, SUB_OPEN_MS, SUB_CLOSE_MS } = await import("./menuNav.js");
    // Resting on an item with a submenu: it opens after SUB_OPEN_MS.
    assert.deepEqual(subAim(null, { type: "enter", i: 2, sub: true }), { later: { ms: SUB_OPEN_MS, open: { i: 2, byKey: false } } });
    // Passing over it to the item below: the opening waiting is dropped.
    assert.deepEqual(subAim(null, { type: "enter", i: 3, sub: false, pending: { i: 2 } }), { later: null });
    // A disabled item never opens one, by the pointer or a click.
    assert.deepEqual(subAim(null, { type: "enter", i: 2, sub: true, disabled: true }), { later: null });
    assert.deepEqual(subAim(null, { type: "click", i: 2, sub: true, disabled: true }), { keep: true });
    // A click opens at once, and on the open item keeps it open (never toggles shut).
    assert.deepEqual(subAim(null, { type: "click", i: 2, sub: true }), { now: { i: 2, byKey: false }, later: null });
    assert.deepEqual(subAim({ i: 2 }, { type: "click", i: 2, sub: true }), { now: { i: 2, byKey: false }, later: null });
    // Open: crossing the other items on the way into it waits SUB_CLOSE_MS, once.
    assert.deepEqual(subAim({ i: 2 }, { type: "enter", i: 3, sub: false }), { later: { ms: SUB_CLOSE_MS, open: null } });
    assert.deepEqual(subAim({ i: 2 }, { type: "enter", i: 4, sub: false, pending: null }), { keep: true }, "the tolerance is not stretched");
    // Reaching the submenu, or coming back to its item, keeps it.
    assert.deepEqual(subAim({ i: 2 }, { type: "sub", pending: null }), { later: null });
    assert.deepEqual(subAim({ i: 2 }, { type: "enter", i: 2, sub: true, pending: null }), { later: null });
    // Another item with a submenu takes over after the tolerance.
    assert.deepEqual(subAim({ i: 2 }, { type: "enter", i: 5, sub: true }), { later: { ms: SUB_CLOSE_MS, open: { i: 5, byKey: false } } });
    // Out of the menu: an open submenu closes after the tolerance; nothing open, nothing waits.
    assert.deepEqual(subAim({ i: 2 }, { type: "leave" }), { later: { ms: SUB_CLOSE_MS, open: null } });
    assert.deepEqual(subAim(null, { type: "leave", pending: { i: 2 } }), { later: null });
    assert.ok(SUB_OPEN_MS === 200 && SUB_CLOSE_MS === 300);
});
