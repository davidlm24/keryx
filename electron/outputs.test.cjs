const test = require("node:test");
const assert = require("node:assert/strict");
const {
    OUTPUTS, outputForKey, outputKeyForUrl, displayRef, findDisplay, resolvePlacement, windowedBounds, normalizeAssignment,
} = require("./outputs.cjs");

const display = (id, x, { primary = false, label = `Monitor ${id}`, width = 1920, height = 1080 } = {}) => ({
    id, label, primary,
    bounds: { x, y: 0, width, height },
    workArea: { x, y: 0, width, height: height - 40 },
});
const laptop = display(1, 0, { primary: true, width: 1536, height: 864 });
const projector = display(2, 1536);
const tv = display(3, 3456);
const main = outputForKey("/Projection");
const stage = outputForKey("/StageView");

test("outputKeyForUrl matches only same-origin output paths", () => {
    const origin = "http://127.0.0.1:7700";
    assert.equal(outputKeyForUrl("http://127.0.0.1:7700/Projection", origin), "/Projection");
    assert.equal(outputKeyForUrl("http://127.0.0.1:7700/Projection/", origin), "/Projection");
    assert.equal(outputKeyForUrl("/Projection", origin), null, "relative URLs are resolved by Electron before the handler");
    assert.equal(outputKeyForUrl("http://127.0.0.1:7700/BibleMaterialProjection?channel=x", origin), "/BibleMaterialProjection");
    assert.equal(outputKeyForUrl("http://127.0.0.1:7700/Home", origin), null);
    assert.equal(outputKeyForUrl("http://evil.example/Projection", origin), null);
    assert.equal(outputKeyForUrl("about:blank", origin), null);
    assert.equal(outputKeyForUrl("not a url", origin), null);
});

test("every output has a unique key and window name", () => {
    assert.equal(new Set(OUTPUTS.map((o) => o.key)).size, OUTPUTS.length);
    assert.equal(new Set(OUTPUTS.map((o) => o.windowName)).size, OUTPUTS.length);
});

test("auto: only the main projection goes to the first external display", () => {
    assert.deepEqual(resolvePlacement(main, [laptop, tv, projector], undefined), { mode: "fullscreen", display: projector });
    assert.deepEqual(resolvePlacement(stage, [laptop, projector], undefined), { mode: "window" });
});

test("auto with one display opens a window the operator can see", () => {
    assert.deepEqual(resolvePlacement(main, [laptop], { target: "auto" }), { mode: "window" });
});

test("window target never goes fullscreen", () => {
    assert.deepEqual(resolvePlacement(main, [laptop, projector], { target: "window" }), { mode: "window" });
});

test("an assigned display wins, found by id", () => {
    const placement = resolvePlacement(stage, [laptop, projector, tv], { target: displayRef(tv) });
    assert.deepEqual(placement, { mode: "fullscreen", display: tv });
});

test("an assigned display that was unplugged falls back to a window and says so", () => {
    assert.deepEqual(resolvePlacement(stage, [laptop], { target: displayRef(tv) }), { mode: "window", missing: true });
});

test("a display whose id changed is recognised by label and size, if unambiguous", () => {
    const ref = displayRef(tv);
    const renumbered = { ...tv, id: 99 };
    assert.equal(findDisplay([laptop, renumbered], ref), renumbered);
    const twin = { ...tv, id: 100 };
    assert.equal(findDisplay([laptop, renumbered, twin], ref), null, "two identical monitors are ambiguous");
    assert.equal(findDisplay([laptop, { ...tv, id: 99, label: "Outro" }], ref), null);
});

test("windowed bounds are centred in the primary work area and never larger than it", () => {
    const b = windowedBounds([projector, laptop]);
    assert.deepEqual(b, { x: 128, y: 52, width: 1280, height: 720 });
    const small = windowedBounds([display(1, 0, { primary: true, width: 1024, height: 600 })]);
    assert.equal(small.width, 1024);
    assert.equal(small.height, 560);
    assert.ok(windowedBounds([]).width > 0);
});

test("normalizeAssignment accepts what the app writes and nothing else", () => {
    assert.deepEqual(normalizeAssignment({ target: "window" }), { target: "window" });
    assert.deepEqual(normalizeAssignment({ target: displayRef(tv) }), { target: displayRef(tv) });
    assert.deepEqual(normalizeAssignment({ target: { id: "x" } }), { target: "auto" });
    assert.deepEqual(normalizeAssignment({ target: "fullscreen" }), { target: "auto" });
    assert.deepEqual(normalizeAssignment(null), { target: "auto" });
    assert.deepEqual(normalizeAssignment({ target: { id: 3, label: "A", width: 10, height: 20, extra: 1 } }), { target: { id: 3, label: "A", width: 10, height: 20 } });
});
