import test from "node:test";
import assert from "node:assert/strict";
import { liveAction, focusKind, quickJumpKey, escapeTarget, ESC_ORDER } from "./keys.js";

// A stand-in element: its own selector matches and those of its ancestors.
const el = (tagName, self = [], ancestors = []) => ({
    tagName,
    matches: (sel) => sel.split(",").some((s) => self.includes(s.trim())),
    closest: (sel) => (sel.split(",").some((s) => self.includes(s.trim()) || ancestors.includes(s.trim())) ? {} : null),
});
const key = (k, target, mods = {}) => liveAction({ key: k, target, ctrlKey: false, metaKey: false, altKey: false, ...mods });
const jump = (k, target, mods = {}) => quickJumpKey({ key: k, target, ctrlKey: false, metaKey: false, altKey: false, ...mods });

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
    assert.equal(key("Enter", button), null, "a keyboard-focused button gets its own Enter");
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

test("Esc ends from anywhere; in a text field it first leaves the field", () => {
    assert.equal(key("Escape", nothing), "end");
    assert.equal(key("Escape", button), "end");
    assert.equal(key("Escape", tab), "end");
    assert.equal(key("Escape", input), "blur");
});

test("other live keys", () => {
    assert.equal(key("ArrowRight", nothing), "next");
    assert.equal(key("ArrowRight", button), "next", "a plain button does not use arrows");
    assert.equal(key("ArrowRight", tab), null, "tabs move between themselves");
    assert.equal(key(" ", nothing), "play");
    assert.equal(key(" ", button), null, "Space presses the focused button");
    assert.equal(key("b", tab), "black", "Tela preta works from anywhere");
    assert.equal(key("b", input), null);
    assert.equal(key("c", nothing, { ctrlKey: true }), null, "Ctrl+C is copy");
    assert.equal(key("Escape", nothing, { altKey: true }), null);
    assert.equal(focusKind(input), "text");
});

test("↑/↓ move the selection, ←/→ the air (Holyrics)", () => {
    assert.equal(key("ArrowUp", nothing), "selUp");
    assert.equal(key("ArrowDown", nothing), "selDown");
    assert.equal(key("ArrowDown", button), "selDown", "a plain button does not use them");
    assert.equal(key("ArrowDown", tab), null, "tabs move between themselves");
    assert.equal(key("ArrowDown", input), null, "typing");
    assert.equal(key("ArrowDown", nothing, { ctrlKey: true }), null);
});

test("a splitter focused with Tab keeps the arrows: nothing moves on air", () => {
    // <div class="kx-split" role="separator" tabindex="0">
    const splitter = el("DIV", ["[tabindex]:not([data-live-keys])", "[role='separator']"]);
    assert.equal(focusKind(splitter), "control");
    assert.equal(key("ArrowRight", splitter), null);
    assert.equal(key("ArrowLeft", splitter), null);
    assert.equal(key("ArrowUp", splitter), null);
    assert.equal(key("ArrowDown", splitter), null);
    assert.equal(key("Enter", splitter), null, "Enter restores the size; it never sends");
    assert.equal(key("Enter", splitter, { ctrlKey: true }), "send", "Ctrl+Enter still sends from anywhere");
    assert.equal(key("b", splitter), "black", "the screen keys still work");
    assert.equal(key("Escape", splitter), "end");
});

test("AltGr (Ctrl+Alt with a character) is typing, not a shortcut", () => {
    assert.equal(key("/", nothing, { ctrlKey: true, altKey: true }), "search", "ABNT2: AltGr+Q gives /");
    assert.equal(key("?", nothing, { ctrlKey: true, altKey: true }), "help");
    assert.equal(key("ArrowRight", nothing, { ctrlKey: true, altKey: true }), null, "Ctrl+Alt+arrow is not AltGr");
});

test("Bible quick jump: a letter or digit with nothing focused", () => {
    assert.equal(jump("j", nothing), "j");
    assert.equal(jump("1", nothing), "1");
    assert.equal(jump("l", nothing), "l", "L starts Lucas/Levítico here");
    assert.equal(jump("b", nothing), null, "B stays Tela preta");
    assert.equal(jump("j", input), null, "typing in a field");
    assert.equal(jump("j", button), null, "a keyboard-focused control");
    assert.equal(jump("j", nothing, { ctrlKey: true }), null);
    assert.equal(jump("ArrowRight", nothing), null);
    assert.equal(jump("/", nothing), null);
});

test("Esc closes the topmost thing open, one per press; with nothing open it ends", () => {
    assert.equal(escapeTarget({}), "end");
    assert.equal(escapeTarget(), "end");
    assert.equal(escapeTarget({ drawer: true }), "drawer");
    assert.equal(escapeTarget({ settings: true, drawer: true }), "settings");
    assert.equal(escapeTarget({ popover: "verificar", settings: true, drawer: true }), "popover");
    assert.equal(escapeTarget({ menu: true, popover: "outs", settings: true }), "menu");
    assert.equal(escapeTarget({ popover: null, settings: false, drawer: false }), "end");
    // The order is the visual stacking: a context menu over a popover over Configurações over Camadas.
    assert.deepEqual(ESC_ORDER, ["menu", "popover", "settings", "drawer"]);
});
