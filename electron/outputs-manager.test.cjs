const test = require("node:test");
const assert = require("node:assert/strict");
const { createOutputManager } = require("./outputs-manager.cjs");

const ORIGIN = "http://127.0.0.1:7700";
const display = (id, x, primary) => ({ id, label: `Tela ${id}`, bounds: { x, y: 0, width: 1920, height: 1080 }, workArea: { x, y: 0, width: 1920, height: 1040 }, scaleFactor: 1, primary });

// Stand-ins for Electron: a screen with the given monitors, windows that
// record what was done to them.
function fakeWindow() {
    const handlers = {};
    const calls = [];
    const win = {
        calls,
        destroyed: false,
        fullScreen: false,
        bounds: { x: 0, y: 0, width: 1280, height: 720 },
        on: (event, fn) => { handlers[event] = fn; return win; },
        once: (event, fn) => { handlers[event] = fn; return win; },
        isDestroyed: () => win.destroyed,
        isFullScreen: () => win.fullScreen,
        isFocused: () => false,
        setFullScreen: (v) => { calls.push(["setFullScreen", v]); win.fullScreen = v; },
        setSkipTaskbar: (v) => calls.push(["setSkipTaskbar", v]),
        setBounds: (b) => { calls.push(["setBounds"]); win.bounds = b; },
        getBounds: () => win.bounds,
        showInactive: () => calls.push(["showInactive"]),
        moveTop: () => calls.push(["moveTop"]),
        close: () => { win.destroyed = true; },
        webContents: { on: () => {}, once: () => {}, insertCSS: () => Promise.resolve() },
    };
    return win;
}

function manager({ monitors, settings = {} }) {
    const opened = [];
    const store = { ...settings };
    const outputs = createOutputManager({
        screen: { getPrimaryDisplay: () => monitors.find((d) => d.primary), getAllDisplays: () => monitors, on: () => {} },
        settings: { get: (k, d) => store[k] ?? d, set: (k, v) => { store[k] = v; } },
        getOrigin: () => ORIGIN,
        openWindow: (url, options) => { const win = fakeWindow(); opened.push({ url, options, win }); return win; },
        BrowserWindow: { getFocusedWindow: () => null },
    });
    return { outputs, opened };
}

test("outputs stay out of the taskbar, full screen or in a window", () => {
    // Two monitors: the projector goes full screen on the second.
    const two = manager({ monitors: [display(1, 0, true), display(2, 1920, false)] });
    assert.equal(two.outputs.windowOptions("/Projection").skipTaskbar, true);
    assert.equal(two.outputs.windowOptions("/Projection").type, "toolbar", "tool window: not in Alt+Tab");
    assert.equal(two.outputs.windowOptions("/Projection").frame, false, "full screen: no frame");
    // One monitor: it opens in a window, still off the taskbar.
    const one = manager({ monitors: [display(1, 0, true)] });
    assert.deepEqual(one.outputs.windowOptions("/Projection"), { skipTaskbar: true, type: "toolbar" });
    assert.deepEqual(one.outputs.windowOptions("/StageView"), { skipTaskbar: true, type: "toolbar" });
});

test("open passes skipTaskbar at creation; track sets it before full screen", () => {
    const { outputs, opened } = manager({ monitors: [display(1, 0, true), display(2, 1920, false)] });
    outputs.open("/Projection");
    assert.equal(opened.length, 1);
    assert.equal(opened[0].options.skipTaskbar, true, "on creation");
    assert.equal(opened[0].options.type, "toolbar", "on creation");
    const { calls } = opened[0].win;
    const skip = calls.findIndex((c) => c[0] === "setSkipTaskbar" && c[1] === true);
    const full = calls.findIndex((c) => c[0] === "setFullScreen" && c[1] === true);
    assert.ok(skip >= 0, "track sets it too");
    assert.ok(full > skip, "before going full screen");
    assert.deepEqual(outputs.trackedWindows().map((w) => [w.key, w.skipTaskbar]), [["/Projection", true]]);
});

test("a window made by a page's window.open is taken off the taskbar by track", () => {
    const { outputs } = manager({ monitors: [display(1, 0, true)] });
    const win = fakeWindow();
    assert.equal(outputs.track(win, `${ORIGIN}/LyricProjection`), "/LyricProjection");
    assert.ok(win.calls.some((c) => c[0] === "setSkipTaskbar" && c[1] === true));
    assert.equal(outputs.trackedWindows()[0].skipTaskbar, true);
    assert.equal(outputs.track(fakeWindow(), `${ORIGIN}/Console`), null, "the console is not an output");
});

test("reassigning keeps it off the taskbar; opening again brings it forward", () => {
    const { outputs, opened } = manager({ monitors: [display(1, 0, true), display(2, 1920, false)] });
    outputs.open("/Projection");
    const { win } = opened[0];
    win.calls.length = 0;
    outputs.setAssignment("/Projection", { target: "window" });
    assert.ok(win.calls.some((c) => c[0] === "setSkipTaskbar" && c[1] === true), "windowed again: still off");
    outputs.open("/Projection");
    assert.equal(opened.length, 1, "no second window");
    assert.ok(win.calls.some((c) => c[0] === "showInactive") && win.calls.some((c) => c[0] === "moveTop"), "brought forward without taking focus");
    assert.equal(outputs.list().outputs.find((o) => o.key === "/Projection").open, true);
});
