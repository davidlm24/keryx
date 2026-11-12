const test = require("node:test");
const assert = require("node:assert/strict");
const {
    OUTPUTS, staysOnTop, inPlace, outputForKey, outputKeyForUrl, displayRef, findDisplay, autoScreens, resolvePlacement, windowedBounds, normalizeAssignment, canRemove,
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
    assert.equal(outputKeyForUrl("http://127.0.0.1:7700/CommunicationProjection?x=1", origin), "/CommunicationProjection");
    assert.equal(outputKeyForUrl("http://127.0.0.1:7700/Home", origin), null);
    assert.equal(outputKeyForUrl("http://evil.example/Projection", origin), null);
    assert.equal(outputKeyForUrl("about:blank", origin), null);
    assert.equal(outputKeyForUrl("not a url", origin), null);
});

test("every output has a unique key and window name", () => {
    assert.equal(new Set(OUTPUTS.map((o) => o.key)).size, OUTPUTS.length);
    assert.equal(new Set(OUTPUTS.map((o) => o.windowName)).size, OUTPUTS.length);
});

test("auto: alone, a public output goes to the first monitor that is not the console's; Palco and Pastor are windows", () => {
    assert.deepEqual(resolvePlacement(main, [laptop, tv, projector], undefined), { mode: "fullscreen", display: projector });
    assert.deepEqual(resolvePlacement(outputForKey("/LyricProjection"), [laptop, projector], undefined), { mode: "fullscreen", display: projector });
    assert.deepEqual(resolvePlacement(stage, [laptop, projector], undefined), { mode: "window" });
    assert.deepEqual(resolvePlacement(outputForKey("/PastorView"), [laptop, projector], undefined), { mode: "window" });
});

// Owner 2026-11-08: with a third monitor, the outputs left on Automático
// sent nothing to it (only the Projeção went to a monitor).
const auto = (key, held = null) => ({ key, assignment: { target: "auto" }, held });
test("auto spreads the public outputs over the free monitors, in the list's order", () => {
    const m = autoScreens([auto("/LyricProjection"), auto("/Projection")], [laptop, projector, tv], laptop.id);
    assert.equal(m.get("/Projection"), projector);
    assert.equal(m.get("/LyricProjection"), tv);
    // No monitor left: null (the manager opens a window, or waits).
    const two = autoScreens([auto("/Projection"), auto("/LyricProjection"), auto("/VideoProjection")], [laptop, projector, tv], laptop.id);
    assert.equal(two.get("/VideoProjection"), null);
    assert.deepEqual(resolvePlacement(outputForKey("/VideoProjection"), [laptop, projector, tv], { target: "auto" }, { auto: null }), { mode: "window" });
    // Palco and Pastor never take a monitor by themselves.
    assert.equal(autoScreens([auto("/StageView")], [laptop, projector], laptop.id).has("/StageView"), false);
});

test("auto skips the console's monitor and the ones an open output names", () => {
    // The console on the right-hand monitor: the primary is free.
    assert.equal(autoScreens([auto("/Projection")], [laptop, projector], projector.id).get("/Projection"), laptop);
    const named = { key: "/LyricProjection", assignment: { target: displayRef(projector) }, held: projector.id };
    assert.equal(autoScreens([named, auto("/Projection")], [laptop, projector, tv], laptop.id).get("/Projection"), tv);
    // Named but not found (unplugged): reserves nothing.
    const gone = { key: "/LyricProjection", assignment: { target: { id: 99, label: "x", width: 1, height: 1 } }, held: null };
    assert.equal(autoScreens([gone, auto("/Projection")], [laptop, projector], laptop.id).get("/Projection"), projector);
});

test("an output already full screen on a free monitor keeps it when another opens", () => {
    // Letras opened first and took the projector; Projeção opening now gets the TV.
    const m = autoScreens([auto("/LyricProjection", projector.id), auto("/Projection")], [laptop, projector, tv], laptop.id);
    assert.equal(m.get("/LyricProjection"), projector);
    assert.equal(m.get("/Projection"), tv);
    // Its monitor taken by an output named there: it moves to the next free one.
    const named = { key: "/VideoProjection", assignment: { target: displayRef(projector) }, held: null };
    assert.equal(autoScreens([auto("/LyricProjection", projector.id), named], [laptop, projector, tv], laptop.id).get("/LyricProjection"), tv);
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

test("an assigned display that was unplugged: the output waits hidden and says so, never a window over the console (WIN-02)", () => {
    const placement = resolvePlacement(stage, [laptop], { target: displayRef(tv) });
    assert.deepEqual(placement, { mode: "hidden", missing: true });
    assert.equal(staysOnTop(placement, laptop.id), false);
    // Opened (or reopened) while it is off: hidden too, with or without a window before.
    assert.deepEqual(resolvePlacement(stage, [laptop], { target: displayRef(tv) }, { waiting: true }), { mode: "hidden", missing: true });
    // The monitor back: full screen on it again.
    assert.deepEqual(resolvePlacement(stage, [laptop, tv], { target: displayRef(tv) }, { waiting: true }), { mode: "fullscreen", display: tv });
});

test("auto: the projector that left is waited for, hidden; opened with one monitor, a window (WIN-02)", () => {
    // Full screen on the projector, then it leaves: hidden, missing (the banner).
    assert.deepEqual(resolvePlacement(main, [laptop], undefined, { waiting: true }), { mode: "hidden", missing: true });
    // It comes back: full screen on it.
    assert.deepEqual(resolvePlacement(main, [laptop, projector], undefined, { waiting: true }), { mode: "fullscreen", display: projector });
    // Opened on a notebook alone: the window the operator can see, as before.
    assert.deepEqual(resolvePlacement(main, [laptop], undefined, { waiting: false }), { mode: "window" });
});

test("Em janela and outputs that open as windows never hide, whatever the monitors do", () => {
    assert.deepEqual(resolvePlacement(main, [laptop], { target: "window" }, { waiting: true }), { mode: "window" });
    assert.deepEqual(resolvePlacement(stage, [laptop], undefined, { waiting: true }), { mode: "window" });
    assert.deepEqual(resolvePlacement(stage, [laptop], { target: "auto" }, { waiting: true }), { mode: "window" });
});

test("inPlace: shown, full screen and at its monitor's bounds; anything else is presented again (WIN-16)", () => {
    const placement = { mode: "fullscreen", display: projector };
    const there = { fullScreen: true, visible: true, bounds: { ...projector.bounds } };
    assert.equal(inPlace(placement, there), true);
    assert.equal(inPlace(placement, { ...there, fullScreen: false }), false, "out of full screen");
    assert.equal(inPlace(placement, { ...there, visible: false }), false, "hidden, waiting for it");
    assert.equal(inPlace(placement, { ...there, bounds: { ...projector.bounds, width: 1280 } }), false, "its resolution changed");
    assert.equal(inPlace({ mode: "fullscreen", display: tv }, there), false, "another monitor");
    assert.equal(inPlace({ mode: "window" }, there), false);
    assert.equal(inPlace({ mode: "hidden", missing: true }, there), false);
    assert.equal(inPlace(null, there), false);
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
    const off = { openAtLaunch: false, removed: false };
    assert.deepEqual(normalizeAssignment({ target: "window" }), { target: "window", ...off });
    assert.deepEqual(normalizeAssignment({ target: displayRef(tv) }), { target: displayRef(tv), ...off });
    assert.deepEqual(normalizeAssignment({ target: { id: "x" } }), { target: "auto", ...off });
    assert.deepEqual(normalizeAssignment({ target: "fullscreen" }), { target: "auto", ...off });
    assert.deepEqual(normalizeAssignment(null), { target: "auto", ...off });
    assert.deepEqual(normalizeAssignment({ target: { id: 3, label: "A", width: 10, height: 20, extra: 1 } }), { target: { id: 3, label: "A", width: 10, height: 20 }, ...off });
    // Opening at launch is kept only when it is exactly true.
    assert.deepEqual(normalizeAssignment({ target: "auto", openAtLaunch: true }), { target: "auto", openAtLaunch: true, removed: false });
    assert.deepEqual(normalizeAssignment({ target: displayRef(tv), openAtLaunch: true }), { target: displayRef(tv), openAtLaunch: true, removed: false });
    assert.deepEqual(normalizeAssignment({ target: "window", openAtLaunch: "yes" }), { target: "window", ...off });
    assert.deepEqual(normalizeAssignment({ openAtLaunch: true }), { target: "auto", openAtLaunch: true, removed: false });
});

test("removed is kept only when exactly true; the rest of the entry stays", () => {
    assert.deepEqual(normalizeAssignment({ target: "window", openAtLaunch: true, removed: true }), { target: "window", openAtLaunch: true, removed: true });
    assert.deepEqual(normalizeAssignment({ target: displayRef(tv), removed: true }), { target: displayRef(tv), openAtLaunch: false, removed: true });
    assert.equal(normalizeAssignment({ target: "auto", removed: "sim" }).removed, false);
    // Settings written by an older KERYX (no removed field) mean present.
    assert.equal(normalizeAssignment({ target: "auto", openAtLaunch: true }).removed, false);
});

test("the main projection cannot be removed; every other output can", () => {
    assert.equal(canRemove("/Projection"), false);
    for (const o of OUTPUTS) if (o.key !== "/Projection") assert.equal(canRemove(o.key), true, o.key);
});

test("an output stays on top only full screen off the console's monitor (0.2.18)", () => {
    const tv = { id: 2 };
    assert.equal(staysOnTop({ mode: "fullscreen", display: tv }, 1), true);
    assert.equal(staysOnTop({ mode: "fullscreen", display: tv }, 2), false, "the console's own monitor: never over it");
    assert.equal(staysOnTop({ mode: "window" }, 1), false);
    assert.equal(staysOnTop({ mode: "hidden", missing: true }, 1), false);
    assert.equal(staysOnTop(null, 1), false);
});

test("Identificar saídas: the screen and the name, escaped, nothing else (2026-11-08)", () => {
    const { identifyHtml } = require("./outputs.cjs");
    const html = identifyHtml({ where: "Tela 2", name: "Letras <do palco>" });
    assert.ok(html.includes(">Tela 2<"));
    assert.ok(html.includes("Letras &lt;do palco&gt;"));
    assert.ok(!html.includes("<script"));
    assert.ok(!/som sai/i.test(html));
});

test("Identificar telas: every monitor its number and what is on it; windows apart (2026-11-09)", () => {
    const { identifyPlan, identifyHtml } = require("./outputs.cjs");
    const b = (x) => ({ x, y: 0, width: 1920, height: 1080 });
    const plan = identifyPlan({
        consoleId: 1,
        displays: [{ id: 1, bounds: b(0) }, { id: 2, bounds: b(1920) }, { id: 3, bounds: b(3840) }],
        outputs: [
            { key: "/Projection", name: "Projeção", full: true, displayId: 2, bounds: b(1920) },
            { key: "/LyricProjection", name: "Letras", full: true, displayId: 2, bounds: b(1920) },
            { key: "/StageView", name: "Palco", full: false, displayId: null, bounds: { x: 100, y: 100, width: 800, height: 450 } },
        ],
    });
    assert.deepEqual(plan.screens.map((s) => [s.where, s.name, s.muted]), [["Tela 1", "Console", false], ["Tela 2", "Projeção · Letras", false], ["Tela 3", "livre", true]]);
    assert.deepEqual(plan.windows.map((w) => [w.where, w.name, w.bounds.width]), [["Janela", "Palco", 800]]);
    // A monitor with nothing is grey; the console's and the outputs' gold.
    assert.ok(identifyHtml(plan.screens[2]).includes("#b9b6b1"));
    assert.ok(identifyHtml(plan.screens[1]).includes("#e2c08a"));
    // Nothing open: every monitor still shows its number.
    assert.deepEqual(identifyPlan({ displays: [{ id: 5, bounds: b(0) }] }).screens.map((s) => [s.where, s.name]), [["Tela 1", "livre"]]);
});
