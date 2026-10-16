const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT, normalizeState, restoreState, captureState } = require("./windowState.cjs");

const display = (x, { primary = false, width = 1920, height = 1080, taskbar = 48 } = {}) => ({
    primary,
    bounds: { x, y: 0, width, height },
    workArea: { x, y: 0, width, height: height - taskbar },
});
const desktop = display(0, { primary: true });
const notebook = display(0, { primary: true, width: 1366, height: 768 });
const second = display(1920);

test("first launch: the default size where it fits, maximized on a smaller screen", () => {
    assert.deepEqual(restoreState(undefined, [desktop]), { maximized: false });
    const small = restoreState(undefined, [notebook]);
    assert.equal(small.maximized, true);
    assert.deepEqual(small.bounds, { x: 0, y: 0, width: 1366, height: 720 });
    assert.ok(DEFAULT.width > 1366, "the default is bigger than the target notebook");
});

test("a saved place on a connected monitor comes back as it was", () => {
    const saved = { bounds: { x: 2000, y: 40, width: 1500, height: 900 }, maximized: true };
    assert.deepEqual(restoreState(saved, [desktop, second]), saved);
    const plain = { bounds: { x: 100, y: 50, width: 1200, height: 800 }, maximized: false };
    assert.deepEqual(restoreState(plain, [desktop]), plain);
});

test("a place no monitor shows any more opens maximized on the primary", () => {
    const onUnplugged = { bounds: { x: 2000, y: 40, width: 1500, height: 900 }, maximized: false };
    const r = restoreState(onUnplugged, [desktop]);
    assert.equal(r.maximized, true);
    assert.deepEqual(r.bounds, { x: 0, y: 0, width: 1920, height: 1032 });
});

test("a place half off screen is pulled back inside the work area", () => {
    const r = restoreState({ bounds: { x: 1000, y: 300, width: 1400, height: 900 }, maximized: false }, [desktop]);
    assert.deepEqual(r.bounds, { x: 520, y: 132, width: 1400, height: 900 });
    // Bigger than the screen (saved on a larger monitor that is now lower-res).
    const big = restoreState({ bounds: { x: 0, y: 0, width: 1600, height: 1000 }, maximized: false }, [notebook]);
    assert.deepEqual(big.bounds, { x: 0, y: 0, width: 1366, height: 720 });
});

test("junk in settings.json reads as no saved place", () => {
    for (const raw of [null, "x", {}, { bounds: { x: 0, y: 0, width: 0, height: 10 } }, { bounds: { x: "a", y: 0, width: 10, height: 10 } }]) {
        assert.equal(normalizeState(raw), null);
    }
    assert.deepEqual(restoreState({ bounds: "nope" }, [desktop]), { maximized: false });
});

test("captureState keeps the normal bounds and the maximized flag", () => {
    assert.deepEqual(captureState({ normalBounds: { x: 1.4, y: 2, width: 1200, height: 800 }, maximized: true }), { bounds: { x: 1, y: 2, width: 1200, height: 800 }, maximized: true });
    assert.equal(captureState({ normalBounds: null, maximized: false }), null);
});
