import test from "node:test";
import assert from "node:assert/strict";
import { liveAction, focusKind, quickJumpKey, escapeTarget, ESC_ORDER, SHORTCUTS, shortcutsFor, LETTER_KEYS, letterKeys, keyHint, LETTER_KEYS_HINT } from "./keys.js";

// A stand-in element: its own selector matches and those of its ancestors.
const el = (tagName, self = [], ancestors = []) => ({
    tagName,
    matches: (sel) => sel.split(",").some((s) => self.includes(s.trim())),
    closest: (sel) => (sel.split(",").some((s) => self.includes(s.trim()) || ancestors.includes(s.trim())) ? {} : null),
});
const key = (k, target, mods = {}, letters) => liveAction({ key: k, target, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods }, letters);
const jump = (k, target, mods = {}, letters) => quickJumpKey({ key: k, target, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods }, letters);

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

test("Ctrl+Z is Desfazer, except in a text field (design audit C-13)", () => {
    assert.equal(key("z", nothing, { ctrlKey: true }), "undo");
    assert.equal(key("Z", button, { ctrlKey: true }), "undo", "Caps Lock, or a button focused with Tab");
    assert.equal(key("z", nothing, { metaKey: true }), "undo");
    assert.equal(key("z", input, { ctrlKey: true }), null, "the field's own undo");
    assert.equal(key("z", nothing, { ctrlKey: true, shiftKey: true }), null, "Ctrl+Shift+Z is not Desfazer");
    assert.equal(key("z", nothing), null, "z alone types nothing on the console");
});

test("↑/↓ move the selection, ←/→ the air (Holyrics)", () => {
    assert.equal(key("ArrowUp", nothing), "selUp");
    assert.equal(key("ArrowDown", nothing), "selDown");
    assert.equal(key("ArrowDown", button), "selDown", "a plain button does not use them");
    assert.equal(key("ArrowDown", tab), null, "tabs move between themselves");
    assert.equal(key("ArrowDown", input), null, "typing");
    assert.equal(key("ArrowDown", nothing, { ctrlKey: true }), null);
});

test("a presentation clicker's PageDown / PageUp move what is on air, as → / ← (Rodada F3)", () => {
    assert.equal(key("PageDown", nothing), "next");
    assert.equal(key("PageUp", nothing), "prev");
    assert.equal(key("PageDown", button), "next", "a plain button does not use them");
    assert.equal(key("PageDown", liveArea), "next");
    assert.equal(key("PageDown", tab), null, "a tab list keeps its keys");
    assert.equal(key("PageDown", el("SELECT", ["select"], ["select"])), null, "a select keeps them");
    assert.equal(key("PageDown", input), null, "typing");
    assert.equal(key("PageDown", nothing, { ctrlKey: true }), null, "Ctrl+PageDown is not a slide");
});

test("a focused select is a control: it keeps ↑/↓, the console the live keys (audit C-03)", () => {
    // As text it took every key: B was dead and typing "a" switched the Bíblia's edition.
    const select = el("SELECT", ["select"], ["select"]);
    const option = el("OPTION", [], ["select"]);
    assert.equal(focusKind(select), "control");
    for (const k of ["ArrowUp", "ArrowDown", "PageUp", "PageDown"]) assert.equal(key(k, select), null, `${k} walks it`);
    assert.equal(key(" ", select), null, "Space opens its list");
    assert.equal(key("Home", select), null);
    assert.equal(key("a", select), null, "a letter the console does not use is its type-ahead");
    assert.equal(key("Enter", select), "send", "a closed select does nothing with Enter on Windows");
    assert.equal(key("Enter", select, { ctrlKey: true }), "send");
    assert.equal(key("ArrowRight", select), "next", "←/→ move the air, not the select");
    assert.equal(key("ArrowLeft", select), "prev");
    assert.equal(key("b", select), "black");
    assert.equal(key("l", select), "logo");
    assert.equal(key("c", select), "clear");
    assert.equal(key("Escape", select), "end", "as from a button: it is not a field to leave");
    assert.equal(key("/", select), "search");
    assert.equal(key("ArrowDown", option), null, "an option is its select");
    assert.equal(jump("a", select), "a", "the Bíblia's quick jump, never the type-ahead");
    assert.equal(jump("j", select), "j");
    assert.equal(jump("b", select), null, "B stays Tela preta");
    assert.equal(jump("j", select, { ctrlKey: true }), null);
    assert.equal(key("Enter", button), null, "a button keeps its own Enter, as before");
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
    // The Setlist automática's countdown goes before the air (Rodada N2).
    assert.equal(escapeTarget({ countdown: true }), "countdown");
    assert.equal(escapeTarget({ countdown: true, drawer: true, edit: true }), "countdown");
    assert.equal(escapeTarget({ window: true, countdown: true }), "window");
    // Items marked in a console list: cleared before the air ends (M7), after
    // what is over the list (the drawer, the window, a countdown).
    assert.equal(escapeTarget({ selection: true }), "selection");
    assert.equal(escapeTarget({ selection: true, edit: true }), "selection");
    assert.equal(escapeTarget({ drawer: true, selection: true }), "drawer");
    assert.equal(escapeTarget({ window: true, selection: true }), "window");
    assert.equal(escapeTarget({ countdown: true, selection: true }), "countdown");
    // The edit mode: left before the projection ends, after everything over it.
    assert.equal(escapeTarget({ edit: true }), "edit");
    assert.equal(escapeTarget({ drawer: true, edit: true }), "drawer");
    // The order is the visual stacking: a context menu over the background
    // library over a popover over the ONE window (Rodada C: Configurações,
    // the views and the editors are its pages — Esc there pops one level,
    // the first closes) over Camadas over the edit mode.
    assert.deepEqual(ESC_ORDER, ["menu", "confirm", "library", "popover", "window", "countdown", "drawer", "selection", "edit"], "one window since Rodada C: the editor, settings and view layers folded into it; the countdown since Rodada N2; a list's selection since 2026-10-21");
    assert.equal(escapeTarget({ library: true, window: true }), "library", "the library picks over the window");
    assert.equal(escapeTarget({ confirm: true, library: true, window: true }), "confirm", "the Excluir? question first");
    // The console routes "window" to the TOP page's own close request, so
    // an unsaved guard can ask instead of popping.
    assert.equal(escapeTarget({ window: true }), "window");
    assert.equal(escapeTarget({ window: true, drawer: true, edit: true }), "window");
});

test("Teclas de uma letra: ligadas (Holyrics), com Shift, desligadas", () => {
    assert.deepEqual(LETTER_KEYS.map(([k]) => k), ["on", "shift", "off"]);
    assert.equal(letterKeys(null), "on", "null = ligadas, the default");
    assert.equal(letterKeys("bogus"), "on");
    // Ligadas: as always, Shift or not, and Caps Lock.
    for (const [k, a] of [["b", "black"], ["B", "black"], ["l", "logo"], ["c", "clear"], ["/", "search"], ["?", "help"]]) {
        assert.equal(key(k, nothing), a, k);
        assert.equal(key(k, nothing, {}, "on"), a, k);
    }
    // Com Shift: only Shift+B/L/C; "?" is Shift+/ already; "/" has no key.
    assert.equal(key("b", nothing, {}, "shift"), null, "a stray b does nothing");
    assert.equal(key("B", nothing, {}, "shift"), null, "Caps Lock is not Shift");
    assert.equal(key("B", nothing, { shiftKey: true }, "shift"), "black");
    assert.equal(key("L", nothing, { shiftKey: true }, "shift"), "logo");
    assert.equal(key("C", button, { shiftKey: true }, "shift"), "clear", "from a focused button too");
    assert.equal(key("C", input, { shiftKey: true }, "shift"), null, "typing a capital C");
    assert.equal(key("?", nothing, { shiftKey: true }, "shift"), "help");
    assert.equal(key("/", nothing, {}, "shift"), null);
    // Desligadas: no letter acts.
    for (const k of ["b", "B", "l", "L", "c", "C", "/", "?"]) {
        assert.equal(key(k, nothing, {}, "off"), null, k);
        assert.equal(key(k, nothing, { shiftKey: true }, "off"), null, `Shift ${k}`);
    }
    // The rest never changes.
    for (const letters of ["on", "shift", "off"]) {
        assert.equal(key("Escape", nothing, {}, letters), "end");
        assert.equal(key("Enter", nothing, {}, letters), "send");
        assert.equal(key("ArrowRight", nothing, {}, letters), "next");
        assert.equal(key(" ", nothing, {}, letters), "play");
        assert.equal(key("f", nothing, { ctrlKey: true }, letters), "search", "Ctrl+F searches in every choice");
        assert.equal(key("f", input, { ctrlKey: true }, letters), null, "not from a text field");
    }
    assert.equal(key("f", nothing), null, "a plain f is nothing");
    assert.equal(key("f", nothing, { ctrlKey: true, shiftKey: true }), null);
});

test("the keys named in menus and tooltips follow the choice", () => {
    assert.equal(keyHint("black"), "B");
    assert.equal(keyHint("logo", "shift"), "Shift+L");
    assert.equal(keyHint("clear", "off"), null);
    assert.equal(keyHint("search"), "/");
    assert.equal(keyHint("search", "shift"), "Ctrl+F");
    assert.equal(keyHint("search", "off"), "Ctrl+F");
    assert.equal(keyHint("help", "shift"), "?");
    assert.equal(keyHint("help", "off"), null);
    assert.equal(keyHint("send"), "Enter");
    assert.equal(keyHint("nada"), null);
    for (const [k] of LETTER_KEYS) assert.ok(LETTER_KEYS_HINT[k], k);
});

test("Bible quick jump: com Shift, Shift+B/L/C are the screen keys", () => {
    assert.equal(jump("L", nothing, { shiftKey: true }), "L", "ligadas: L starts Lucas");
    assert.equal(jump("L", nothing, { shiftKey: true }, "shift"), null);
    assert.equal(jump("C", nothing, { shiftKey: true }, "shift"), null);
    assert.equal(jump("l", nothing, {}, "shift"), "l", "a plain l types");
    assert.equal(jump("J", nothing, { shiftKey: true }, "shift"), "J");
    assert.equal(jump("l", nothing, {}, "off"), "l");
});

test("the shortcut list and the keys never drift apart, for every choice of the letter keys", () => {
    const body = { tagName: "BODY", closest: () => null };
    for (const [letters] of LETTER_KEYS) {
        const press = (probe) => liveAction({ target: body, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...probe }, letters);
        const listed = new Set();
        for (const s of shortcutsFor(letters)) {
            for (const [action, probe] of [[s.action, s.probe], ...(s.also || [])]) {
                if (!probe) continue;
                assert.equal(press(probe), action, `${letters}: ${s.keys}: ${action}`);
                listed.add(action);
            }
        }
        // Every action the console handles is in the list ("blur" is only
        // leaving a text field): sweep the keys.
        const handled = new Set();
        for (const k of ["Enter", "Escape", " ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "b", "B", "l", "L", "c", "C", "/", "?", "f", "z"]) {
            for (const mods of [{}, { shiftKey: true }, { ctrlKey: true }]) {
                const a = press({ key: k, ...mods });
                if (a) handled.add(a);
            }
        }
        for (const action of handled) assert.ok(listed.has(action), `${letters}: ${action} is not in the shortcut list`);
        if (letters === "on") for (const a of ["send", "next", "prev", "selUp", "selDown", "black", "logo", "clear", "end", "undo", "search", "help", "play"]) assert.ok(handled.has(a), a);
        if (letters === "off") for (const a of ["black", "logo", "clear", "help"]) assert.ok(!listed.has(a), `off: ${a} listed`);
    }
    assert.deepEqual(SHORTCUTS, shortcutsFor("on"));
    assert.ok(shortcutsFor("on").some((s) => s.keys.startsWith("Ctrl+=")), "the console's zoom is listed");
});
