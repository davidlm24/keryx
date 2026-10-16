import test from "node:test";
import assert from "node:assert/strict";
import { liveAction, focusKind, quickJumpKey, escapeTarget, ESC_ORDER, SHORTCUTS } from "./keys.js";

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

test("the player's progress bar focused with Tab keeps the arrows: the slide on air stays (Rodada F1)", () => {
    // <span class="pl-seek" role="slider" tabindex="0">
    const seek = el("SPAN", ["[tabindex]:not([data-live-keys])", "[role='slider']"]);
    assert.equal(focusKind(seek), "control");
    for (const k of ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"]) assert.equal(key(k, seek), null, k);
    assert.equal(key(" ", seek), null, "Space is the control's");
    assert.equal(key("Enter", seek), null, "a focused control never sends");
    assert.equal(key("b", seek), "black", "the screen keys still work");
    assert.equal(key("Escape", seek), "end");
    // A child of the bar (the thumb, a tick) is the bar.
    assert.equal(key("ArrowRight", el("B", [], ["[tabindex]:not([data-live-keys])", "[role='slider']"])), null);
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
    assert.equal(escapeTarget({ window: true, drawer: true }), "window");
    assert.equal(escapeTarget({ popover: "verificar", window: true, drawer: true }), "popover");
    assert.equal(escapeTarget({ menu: true, popover: "outs", window: true }), "menu");
    // The background library opens over a popover or any window page: it goes first.
    assert.equal(escapeTarget({ library: true, popover: "outs", window: true }), "library");
    assert.equal(escapeTarget({ menu: true, library: true }), "menu");
    assert.equal(escapeTarget({ popover: null, window: false, drawer: false }), "end");
    // The edit mode: left before the projection ends, after everything over it.
    assert.equal(escapeTarget({ edit: true }), "edit");
    assert.equal(escapeTarget({ drawer: true, edit: true }), "drawer");
    // The order is the visual stacking: a context menu over the background
    // library over a popover over the ONE window (Rodada C: Configurações,
    // the views and the editors are its pages — Esc there pops one level,
    // the first closes) over Camadas over the edit mode.
    assert.deepEqual(ESC_ORDER, ["menu", "confirm", "library", "popover", "window", "drawer", "edit"], "one window since Rodada C: the editor, settings and view layers folded into it");
    assert.equal(escapeTarget({ library: true, window: true }), "library", "the library picks over the window");
    assert.equal(escapeTarget({ confirm: true, library: true, window: true }), "confirm", "the Excluir? question first");
    // The console routes "window" to the TOP page's own close request, so
    // an unsaved guard can ask instead of popping.
    assert.equal(escapeTarget({ window: true }), "window");
    assert.equal(escapeTarget({ window: true, drawer: true, edit: true }), "window");
});

test("the shortcut list and the keys never drift apart", () => {
    const body = { tagName: "BODY", closest: () => null };
    const press = (probe) => liveAction({ target: body, ctrlKey: false, metaKey: false, altKey: false, ...probe });
    const listed = new Set();
    for (const s of SHORTCUTS) {
        for (const [action, probe] of [[s.action, s.probe], ...(s.also || [])]) {
            if (!probe) continue;
            assert.equal(press(probe), action, `${s.keys}: ${action}`);
            listed.add(action);
        }
    }
    // Every action the console handles is in the list ("blur" is only
    // leaving a text field).
    for (const action of ["send", "next", "prev", "selUp", "selDown", "black", "logo", "clear", "end", "search", "help", "play"]) {
        assert.ok(listed.has(action), `${action} is not in the shortcut list`);
    }
});
