import test from "node:test";
import assert from "node:assert/strict";
import { screenKeyOp } from "./screenKeys.js";

const body = { tagName: "BODY", closest: () => null, matches: () => false };
const press = (key, live, prefs = null, mods = {}) => screenKeyOp({ key, target: body, ctrlKey: false, metaKey: false, altKey: false, ...mods }, live, prefs);
const song = { content: { kind: "lyrics", index: 1 }, screen: "show" };

test("← → and the clicker's PageUp / PageDown move the slide on air", () => {
    assert.deepEqual(press("ArrowRight", song), ["content.next", {}]);
    assert.deepEqual(press("PageDown", song), ["content.next", {}]);
    assert.deepEqual(press("ArrowLeft", song), ["content.prev", {}]);
    assert.deepEqual(press("PageUp", song), ["content.prev", {}]);
});

test("the slide keys do nothing with no slides on air or while locked", () => {
    assert.equal(press("ArrowRight", { screen: "show" }), null);
    assert.equal(press("ArrowRight", null), null);
    assert.equal(press("ArrowLeft", { ...song, locked: true }), null);
});

test("Space, ↑/↓ and Enter are the console's: an output ignores them", () => {
    assert.equal(press(" ", song), null, "Space is Tocar/Pausar on the console, never the next slide");
    assert.equal(press("ArrowUp", song), null);
    assert.equal(press("ArrowDown", song), null);
    assert.equal(press("Enter", song), null);
    assert.equal(press("/", song), null);
});

test("B and L toggle Tela preta and the logo, locked too", () => {
    assert.deepEqual(press("b", song), ["screen.set", { mode: "black" }]);
    assert.deepEqual(press("B", { ...song, screen: "black" }), ["screen.set", { mode: "show" }]);
    assert.deepEqual(press("l", { ...song, screen: "black" }), ["screen.set", { mode: "logo" }]);
    assert.deepEqual(press("L", { ...song, screen: "logo" }), ["screen.set", { mode: "show" }]);
    assert.deepEqual(press("b", { ...song, locked: true }), ["screen.set", { mode: "black" }]);
});

test("C clears the text and Esc takes everything down", () => {
    assert.deepEqual(press("c", song), ["text.clear", {}]);
    assert.deepEqual(press("Escape", song), ["clear", {}]);
});

test("the church's Transições ride along", () => {
    const prefs = { clear_transition: "fade", clear_transition_ms: 600, screen_transition: true };
    assert.deepEqual(press("Escape", song, prefs), ["clear", { fade: 600 }]);
    assert.deepEqual(press("c", song, prefs), ["text.clear", { fade: 600 }]);
    assert.deepEqual(press("b", song, prefs), ["screen.set", { mode: "black", fade: 600 }]);
    assert.deepEqual(press("b", song, { ...prefs, screen_transition: false }), ["screen.set", { mode: "black" }]);
    assert.deepEqual(press("ArrowRight", song, prefs), ["content.next", {}]);
});

test("a key with Ctrl, Alt or Cmd is not a screen key", () => {
    assert.equal(press("b", song, null, { ctrlKey: true }), null);
    assert.equal(press("l", song, null, { altKey: true }), null);
    assert.equal(press("ArrowRight", song, null, { metaKey: true }), null);
});
