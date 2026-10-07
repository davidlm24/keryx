import test from "node:test";
import assert from "node:assert/strict";
import { liveAction, focusKind } from "./keys.js";

// A stand-in element: its own selector matches and those of its ancestors.
const el = (tagName, self = [], ancestors = []) => ({
    tagName,
    matches: (sel) => sel.split(",").some((s) => self.includes(s.trim())),
    closest: (sel) => (sel.split(",").some((s) => self.includes(s.trim()) || ancestors.includes(s.trim())) ? {} : null),
});
const key = (k, target, mods = {}) => liveAction({ key: k, target, ctrlKey: false, metaKey: false, altKey: false, ...mods });

const nothing = el("BODY");
const button = el("BUTTON", ["button"]);
const tab = el("BUTTON", ["button", "[role='tab']"], ["[role='tablist']"]);
const input = el("INPUT", ["input"]);
const liveArea = el("DIV", ["[data-live-keys]"]);
const buttonInLive = el("BUTTON", ["button"], ["[data-live-keys]"]);
const row = el("DIV", ["[role='button']"]);

test("Enter sends only when nothing interactive has focus", () => {
    assert.equal(key("Enter", nothing), "send");
    assert.equal(key("Enter", { tagName: undefined }), "send", "window/document: nothing focused");
    assert.equal(key("Enter", liveArea), "send", "the Program/Preview area itself");
    assert.equal(key("Enter", button), null, "a focused button gets its own Enter");
    assert.equal(key("Enter", tab), null, "a focused tab (the Letras bug)");
    assert.equal(key("Enter", row), null, "a focused rundown row prepares, it does not send");
    assert.equal(key("Enter", buttonInLive), null, "a button inside the live area is still a button");
    assert.equal(key("Enter", input), null, "typing");
});

test("Ctrl/Cmd+Enter sends from anywhere but a text field", () => {
    assert.equal(key("Enter", tab, { ctrlKey: true }), "send");
    assert.equal(key("Enter", button, { metaKey: true }), "send");
    assert.equal(key("Enter", input, { ctrlKey: true }), null);
});

test("other live keys", () => {
    assert.equal(key("ArrowRight", nothing), "next");
    assert.equal(key("ArrowRight", button), "next", "a plain button does not use arrows");
    assert.equal(key("ArrowRight", tab), null, "tabs move between themselves");
    assert.equal(key(" ", nothing), "play");
    assert.equal(key(" ", button), null, "Space presses the focused button");
    assert.equal(key("b", tab), "black", "Tela preta works from anywhere");
    assert.equal(key("b", input), null);
    assert.equal(key("Escape", button), "end");
    assert.equal(key("c", nothing, { ctrlKey: true }), null, "Ctrl+C is copy");
    assert.equal(focusKind(input), "text");
});
