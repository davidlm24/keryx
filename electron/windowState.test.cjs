const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeWindowState, restoreWindow, windowStateToSave, janelaKind, JANELA } = require("./windowState.cjs");

// A 1366 × 768 notebook (taskbar 48 px) and a 1920 × 1080 monitor to its right.
const notebook = { primary: true, bounds: { x: 0, y: 0, width: 1366, height: 768 }, workArea: { x: 0, y: 0, width: 1366, height: 720 } };
const monitor = { primary: false, bounds: { x: 1366, y: 0, width: 1920, height: 1080 }, workArea: { x: 1366, y: 0, width: 1920, height: 1040 } };

test("nothing kept: maximized on the primary monitor, never larger than it", () => {
    const r = restoreWindow(null, [monitor, notebook]);
    assert.equal(r.maximized, true);
    assert.deepEqual(r.bounds, { x: 0, y: 0, width: 1366, height: 720 }, "1440 × 900 trimmed to the notebook");
    const big = restoreWindow(undefined, [{ primary: true, bounds: { x: 0, y: 0, width: 2560, height: 1440 }, workArea: { x: 0, y: 0, width: 2560, height: 1400 } }]);
    assert.deepEqual(big, { bounds: { x: 560, y: 250, width: 1440, height: 900 }, maximized: true }, "centred");
});

test("a kept place that fits comes back as it was, maximized or not", () => {
    const kept = { x: 1500, y: 100, width: 1200, height: 800, maximized: false };
    assert.deepEqual(restoreWindow(kept, [notebook, monitor]), { bounds: { x: 1500, y: 100, width: 1200, height: 800 }, maximized: false });
    assert.deepEqual(restoreWindow({ ...kept, maximized: true }, [notebook, monitor]), { bounds: { x: 1500, y: 100, width: 1200, height: 800 }, maximized: true });
});

test("a monitor that is gone: maximized on the primary one", () => {
    const kept = { x: 1500, y: 100, width: 1200, height: 800, maximized: false };
    assert.deepEqual(restoreWindow(kept, [notebook]), { bounds: { x: 0, y: 0, width: 1366, height: 720 }, maximized: true });
});

test("partly on a monitor: trimmed to it and pulled inside", () => {
    // Kept 1440 × 900 on the notebook (the old default), its right half off.
    const r = restoreWindow({ x: 700, y: 50, width: 1440, height: 900, maximized: false }, [notebook]);
    assert.deepEqual(r, { bounds: { x: 0, y: 0, width: 1366, height: 720 }, maximized: false });
    const s = restoreWindow({ x: -300, y: 40, width: 1000, height: 650 }, [notebook]);
    assert.deepEqual(s.bounds, { x: 0, y: 40, width: 1000, height: 650 });
});

test("the bar off every monitor, or too little of it on one: not restored", () => {
    assert.equal(restoreWindow({ x: 100, y: -500, width: 1000, height: 650 }, [notebook]).maximized, true, "the bar above the screen");
    assert.equal(restoreWindow({ x: 1300, y: 50, width: 1000, height: 650 }, [notebook]).maximized, true, "66 px of the bar showing");
    assert.equal(restoreWindow({ x: 100, y: 710, width: 1000, height: 650 }, [notebook]).maximized, true, "the bar under the taskbar");
});

test("below the console's minimum: not restored", () => {
    assert.equal(restoreWindow({ x: 10, y: 10, width: 900, height: 650 }, [notebook]).maximized, true);
    assert.equal(restoreWindow({ x: 10, y: 10, width: 1000, height: 500 }, [notebook]).maximized, true);
    const tiny = { primary: true, bounds: { x: 0, y: 0, width: 1024, height: 600 }, workArea: { x: 0, y: 0, width: 1024, height: 560 } };
    assert.equal(restoreWindow({ x: 0, y: 0, width: 1000, height: 650 }, [tiny]).maximized, true, "a work area under 600 px tall");
});

test("only the shape it writes is read", () => {
    assert.equal(normalizeWindowState("x"), null);
    assert.equal(normalizeWindowState({ x: 0, y: 0, width: "1000", height: 700 }), null);
    assert.equal(normalizeWindowState({ x: 0, y: 0, width: 0, height: 700 }), null);
    assert.deepEqual(normalizeWindowState({ x: 1.4, y: 2, width: 1000, height: 700, maximized: "yes" }), { x: 1, y: 2, width: 1000, height: 700, maximized: false });
    assert.equal(restoreWindow({ x: 0, y: 0, width: 1000, height: 700 }, []).maximized, true, "no displays known");
});

test("closing keeps the normal bounds; minimized keeps the maximized flag it had", () => {
    const normal = { x: 20, y: 30, width: 1100, height: 700 };
    assert.deepEqual(windowStateToSave({ normal, maximized: true, minimized: false }, null), { ...normal, maximized: true });
    assert.deepEqual(windowStateToSave({ normal, maximized: false, minimized: true }, { ...normal, maximized: true }), { ...normal, maximized: true });
    assert.deepEqual(windowStateToSave({ normal, maximized: false, minimized: true }, null), { ...normal, maximized: false });
    const prev = { ...normal, maximized: false };
    assert.deepEqual(windowStateToSave({ normal: null, maximized: false, minimized: false }, prev), prev, "nothing readable: the old one stays");
});

test("a detached page: its default fits the console's monitor, not maximized", () => {
    // The console on the big monitor: that one is "home" for its pages.
    const home = [{ ...notebook, primary: false }, { ...monitor, primary: true }];
    assert.deepEqual(restoreWindow(null, home, JANELA), { bounds: { x: 1686, y: 110, width: 1280, height: 820 }, maximized: false });
    assert.deepEqual(restoreWindow(null, [notebook], JANELA), { bounds: { x: 43, y: 0, width: 1280, height: 720 }, maximized: false }, "820 px trimmed to a 768 px screen");
});

test("a detached page: kept per kind, with its own minimum", () => {
    assert.deepEqual(restoreWindow({ x: 100, y: 50, width: 800, height: 500 }, [notebook], JANELA), { bounds: { x: 100, y: 50, width: 800, height: 500 }, maximized: false }, "under the console's minimum, over its own");
    assert.equal(restoreWindow({ x: 100, y: 50, width: 700, height: 500 }, [notebook], JANELA).bounds.width, 1280, "under 760 px wide: the default");
    assert.equal(restoreWindow({ x: 100, y: 50, width: 900, height: 600, maximized: true }, [notebook], JANELA).maximized, true, "kept maximized");
});

test("which page a window is: /Janela?page=…, the old /Editor too", () => {
    const o = "http://127.0.0.1:7700";
    assert.equal(janelaKind(`${o}/Janela?page=song&song=abc`, o), "song");
    assert.equal(janelaKind(`${o}/Janela?page=theme&theme=1`, o), "theme");
    assert.equal(janelaKind(`${o}/Editor?screen=/StageView`, o), "screen");
    assert.equal(janelaKind(`${o}/Editor?theme=1`, o), "theme");
    assert.equal(janelaKind(`${o}/Janela?page=../x`, o), "x", "only a plain name");
    assert.equal(janelaKind(`${o}/Projection`, o), "", "an output");
    assert.equal(janelaKind("https://example.com/Janela?page=song", o), "", "another origin");
    assert.equal(janelaKind("not a url", o), "");
});
