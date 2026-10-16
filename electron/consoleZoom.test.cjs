const test = require("node:test");
const assert = require("node:assert/strict");
const { ZOOM_KEY, ZOOM_STEPS, normalizeZoom, stepZoom, zoomCommand, zoomPercent, createConsoleZoom } = require("./consoleZoom.cjs");

test("the zoom is one of the steps, 90 % to 150 %", () => {
    assert.deepEqual(ZOOM_STEPS, [0.9, 1, 1.1, 1.25, 1.5]);
    assert.equal(normalizeZoom(undefined), 1);
    assert.equal(normalizeZoom("x"), 1);
    assert.equal(normalizeZoom(-2), 1);
    assert.equal(normalizeZoom(1.24), 1.25);
    assert.equal(normalizeZoom(3), 1.5, "held at the top");
    assert.equal(normalizeZoom(0.5), 0.9, "held at the bottom");
    assert.equal(zoomPercent(1.25), "125 %");
});

test("a step in or out, held at the ends", () => {
    assert.equal(stepZoom(1, 1), 1.1);
    assert.equal(stepZoom(1.1, 1), 1.25);
    assert.equal(stepZoom(1.5, 1), 1.5);
    assert.equal(stepZoom(1, -1), 0.9);
    assert.equal(stepZoom(0.9, -1), 0.9);
    assert.equal(stepZoom(1.3, -1), 1.1, "an odd saved value snaps first");
});

test("Ctrl+= / Ctrl+− / Ctrl+0, the keypad too; never AltGr or a plain key", () => {
    const k = (key, extra = {}) => zoomCommand({ type: "keyDown", key, code: "", control: true, alt: false, meta: false, ...extra });
    assert.equal(k("="), "in");
    assert.equal(k("+"), "in", "Shift+= gives +");
    assert.equal(k("+", { code: "NumpadAdd" }), "in");
    assert.equal(k("-"), "out");
    assert.equal(k("-", { code: "NumpadSubtract" }), "out");
    assert.equal(k("0"), "reset");
    assert.equal(k("0", { code: "Numpad0" }), "reset");
    assert.equal(k("=", { control: false }), null, "no Ctrl: typing");
    assert.equal(k("=", { alt: true }), null, "Ctrl+Alt is AltGr");
    assert.equal(k("=", { type: "keyUp" }), null);
    assert.equal(k("s"), null);
    assert.equal(k("=", { control: false, meta: true }), "in", "Cmd on a Mac");
});

test("kept in settings.json, applied to the console's window and told", () => {
    const data = {};
    const settings = { get: (key, fallback) => (data[key] === undefined ? fallback : data[key]), set: (key, v) => { data[key] = v; } };
    const applied = [];
    const win = { isDestroyed: () => false, webContents: { setZoomFactor: (z) => applied.push(z) } };
    const told = [];
    const zoom = createConsoleZoom({ settings, getWindow: () => win, notify: (z) => told.push(z) });
    assert.equal(zoom.get(), 1);
    assert.equal(zoom.command("in"), 1.1);
    assert.equal(zoom.command("in"), 1.25);
    assert.equal(data[ZOOM_KEY], 1.25);
    assert.equal(zoom.command("out"), 1.1);
    assert.equal(zoom.command("reset"), 1);
    assert.equal(zoom.set(7), 1.5);
    assert.deepEqual(applied, [1.1, 1.25, 1.1, 1, 1.5]);
    assert.deepEqual(told, applied);
    // No window (closing, or before it opens): saved all the same.
    const none = createConsoleZoom({ settings, getWindow: () => null });
    assert.equal(none.set(0.9), 0.9);
    assert.equal(none.get(), 0.9);
});
