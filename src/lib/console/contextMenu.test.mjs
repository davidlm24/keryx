import test from "node:test";
import assert from "node:assert/strict";
import { placeMenu, placeBox, orderItems } from "./contextMenu.js";

const W = { w: 200, h: 160, vw: 1366, vh: 768 };

test("placeMenu opens at the pointer when it fits", () => {
    assert.deepEqual(placeMenu({ ...W, x: 300, y: 200 }), { left: 300, top: 200 });
});

test("placeMenu flips left and up near the right and bottom edges", () => {
    assert.deepEqual(placeMenu({ ...W, x: 1300, y: 700 }), { left: 1100, top: 540 });
});

test("placeMenu stays inside the window, margin included", () => {
    assert.deepEqual(placeMenu({ ...W, x: 2, y: 3 }), { left: 8, top: 8 });
    // A menu taller than the room above and below still starts inside.
    const p = placeMenu({ w: 200, h: 700, vw: 1366, vh: 720, x: 100, y: 400 });
    assert.ok(p.top >= 8 && p.top + 700 <= 720 - 8);
});

// placeBox: a (+) menu from its button (Rodada G1: the Biblioteca's two
// menus lost their first letters at the window's left).
const btn = (left, top, size = 24) => ({ left, top, right: left + size, bottom: top + size });
const V = { vw: 960, vh: 600 };

test("placeBox hangs a menu from the button's right edge, under it", () => {
    assert.deepEqual(placeBox({ ...V, anchor: btn(500, 100), w: 240, h: 200 }), { left: 284, top: 128, maxHeight: null, above: false });
});

test("placeBox flips to the button's left edge near the window's left, and never leaves it", () => {
    // The Biblioteca's header (+) at the window's left: the menu runs right.
    assert.equal(placeBox({ ...V, anchor: btn(150, 60), w: 240, h: 200 }).left, 150);
    // A menu wider than the room on either side still stays inside.
    assert.equal(placeBox({ ...V, anchor: btn(300, 60), w: 900, h: 100 }).left, 52);
    // "start": left edges together, flipped near the right.
    assert.equal(placeBox({ ...V, anchor: btn(100, 60), w: 300, h: 100, align: "start" }).left, 100);
    assert.equal(placeBox({ ...V, anchor: btn(900, 60), w: 300, h: 100, align: "start" }).left, 624);
    assert.equal(placeBox({ ...V, anchor: btn(940, 60, 16), w: 300, h: 100 }).left, 652, "never past the right edge");
});

test("placeBox opens above when there is no room below, else shrinks with a maxHeight", () => {
    assert.deepEqual(placeBox({ ...V, anchor: btn(500, 500), w: 200, h: 300 }), { left: 324, top: 196, maxHeight: null, above: true });
    // No room on either side: the roomier side, scrolled.
    const p = placeBox({ ...V, anchor: btn(500, 200), w: 200, h: 700 });
    assert.deepEqual(p, { left: 324, top: 228, maxHeight: 364, above: false });
    const q = placeBox({ ...V, anchor: btn(500, 450), w: 200, h: 700 });
    assert.deepEqual(q, { left: 324, top: 8, maxHeight: 438, above: true });
});

test("placeBox keeps inside given bounds (a window's frame, under the top bar)", () => {
    const bounds = { left: 100, top: 48, right: 860, bottom: 600 };
    const p = placeBox({ anchor: btn(110, 400), w: 240, h: 400, bounds });
    assert.equal(p.left, 110);
    assert.ok(p.top >= 48 + 8, "an above-flip stays under the top bar");
    assert.ok(p.top + (p.maxHeight ?? 400) <= 400 - 4, "and above the button");
});

test("orderItems puts air actions last, after a separator", () => {
    const send = { label: "Enviar ao ar", air: true };
    const prep = { label: "Pôr na prévia" };
    const edit = { label: "Editar" };
    assert.deepEqual(orderItems([send, prep, edit]), [prep, edit, "sep", send]);
});

test("orderItems never starts with an air action when there is a safe one, and drops stray separators", () => {
    const send = { label: "Enviar ao ar", air: true };
    const prep = { label: "Pôr na prévia" };
    assert.deepEqual(orderItems(["sep", prep, "sep", "sep", null, "sep"]), [prep]);
    assert.deepEqual(orderItems([send]), [send]);
    assert.deepEqual(orderItems([prep, "sep", send]), [prep, "sep", send]);
});
