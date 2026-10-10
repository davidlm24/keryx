import test from "node:test";
import assert from "node:assert/strict";
import { placeMenu, orderItems } from "./contextMenu.js";

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
