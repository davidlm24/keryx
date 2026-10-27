import { test } from "node:test";
import assert from "node:assert/strict";
import { tabTarget, tabbables, firstControl, returnTarget, isTextField } from "./focusTrap.js";

// Stand-in elements: what focusTrap reads (closest, getAttribute, disabled,
// isConnected, tagName).
const el = (name, { hidden = false, disabled = false, tabindex = null, text = false, connected = true, tag = "BUTTON" } = {}) => ({
    name, disabled, tagName: tag, isConnected: connected,
    getAttribute: (a) => (a === "tabindex" ? tabindex : null),
    closest: (sel) => (sel.includes("[hidden]") ? (hidden ? {} : null) : sel.includes("textarea") ? (text ? {} : null) : null),
});

test("Tab wraps inside the dialog and brings a stray focus back in", () => {
    const [a, b, c] = [el("a"), el("b"), el("c")];
    const list = [a, b, c];
    assert.equal(tabTarget(list, c), a, "Tab on the last goes to the first");
    assert.equal(tabTarget(list, a, true), c, "Shift+Tab on the first goes to the last");
    assert.equal(tabTarget(list, b), null, "inside: the browser steps");
    assert.equal(tabTarget(list, { tagName: "BODY" }), a, "from the body (a click blurred a button): the first");
    assert.equal(tabTarget(list, { tagName: "BODY" }, true), c);
    assert.equal(tabTarget([], a), null);
});

test("hidden pages, disabled controls and tabindex -1 are not Tab stops", () => {
    const items = [el("ok"), el("hidden", { hidden: true }), el("off", { disabled: true }), el("minus", { tabindex: "-1" }), el("zero", { tabindex: "0" })];
    const root = { querySelectorAll: () => items };
    assert.deepEqual(tabbables(root).map((x) => x.name), ["ok", "zero"]);
    assert.deepEqual(tabbables(null), []);
});

test("a window page starts on its body's first control, not the bar's (x)", () => {
    const close = el("x"); const field = el("busca", { text: true }); const btn = el("salvar");
    const bar = new Set([close]);
    assert.equal(firstControl([close, field, btn], (x) => bar.has(x)), field);
    assert.equal(firstControl([close], (x) => bar.has(x)), null, "none: the caller focuses the title");
    assert.ok(isTextField(field));
    assert.ok(!isTextField(btn));
});

test("the focus goes back only to an opener still on screen", () => {
    assert.equal(returnTarget(null), null, "opened with the mouse: nobody");
    assert.equal(returnTarget({ tagName: "BODY", closest: () => null }), null);
    const pill = el("Encerrar");
    assert.equal(returnTarget(pill), pill);
    assert.equal(returnTarget(el("gone", { connected: false })), null);
    assert.equal(returnTarget(el("under", { hidden: true })), null, "a page under the window's top");
});
