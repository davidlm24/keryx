const test = require("node:test");
const assert = require("node:assert/strict");
const { createOutputManager, createReloadLimiter } = require("./outputs-manager.cjs");

const ORIGIN = "http://127.0.0.1:7700";
const display = (id, x, primary) => ({ id, label: `Tela ${id}`, bounds: { x, y: 0, width: 1920, height: 1080 }, workArea: { x, y: 0, width: 1920, height: 1040 }, scaleFactor: 1, primary });

// Stand-ins for Electron: a screen with the given monitors, windows that
// record what was done to them.
// options: what a BrowserWindow is made with (show, x, y, width, height).
function fakeWindow(options = {}) {
    const handlers = {};
    const calls = [];
    const emit = (event) => (handlers[event] || []).forEach((fn) => fn());
    const { x = 0, y = 0, width = 1280, height = 720 } = options;
    const win = {
        calls,
        destroyed: false,
        fullScreen: false,
        visible: options.show !== false,
        bounds: { x, y, width, height },
        on: (event, fn) => { (handlers[event] ||= []).push(fn); return win; },
        once: (event, fn) => { (handlers[event] ||= []).push(fn); return win; },
        isDestroyed: () => win.destroyed,
        isFullScreen: () => win.fullScreen,
        isVisible: () => win.visible,
        isFocused: () => false,
        // As Electron on Windows: a hidden window that leaves full screen is shown again.
        setFullScreen: (v) => { calls.push(["setFullScreen", v]); if (!v && win.fullScreen && !win.visible) win.visible = true; win.fullScreen = v; },
        setSkipTaskbar: (v) => calls.push(["setSkipTaskbar", v]),
        onTop: false,
        setAlwaysOnTop: (v, level) => { calls.push(["setAlwaysOnTop", v, level]); win.onTop = v; },
        isAlwaysOnTop: () => win.onTop,
        setBounds: (b) => { calls.push(["setBounds", b]); win.bounds = b; },
        getBounds: () => win.bounds,
        hide: () => { calls.push(["hide"]); win.visible = false; },
        showInactive: () => { calls.push(["showInactive"]); win.visible = true; },
        moveTop: () => calls.push(["moveTop"]),
        close: () => { if (win.destroyed) return; emit("close"); win.destroyed = true; emit("closed"); },
        webContents: {
            on: () => {},
            once: () => {},
            insertCSS: () => { calls.push(["insertCSS"]); return Promise.resolve("css"); },
            removeInsertedCSS: (key) => { calls.push(["removeInsertedCSS", key]); return Promise.resolve(); },
        },
    };
    return win;
}

// A blocker that counts what was asked of it, as Electron's powerSaveBlocker.
function fakeBlocker() {
    const started = new Map();
    let next = 1;
    const b = {
        starts: [],
        stops: [],
        start: (type) => { const id = next++; started.set(id, type); b.starts.push(type); return id; },
        stop: (id) => { started.delete(id); b.stops.push(id); },
        isStarted: (id) => started.has(id),
        active: () => [...started.values()],
    };
    return b;
}

// monitors may change while the manager runs: plug and unplug them, then
// say so as Electron's screen does (screen.emit).
function manager({ monitors, settings = {} }) {
    const opened = [];
    const store = { ...settings };
    const handlers = {};
    const screen = {
        monitors,
        getPrimaryDisplay: () => screen.monitors.find((d) => d.primary),
        getAllDisplays: () => screen.monitors,
        on: (event, fn) => { (handlers[event] ||= []).push(fn); },
        emit: (event) => (handlers[event] || []).forEach((fn) => fn()),
    };
    const blocker = fakeBlocker();
    const outputs = createOutputManager({
        screen,
        settings: { get: (k, d) => store[k] ?? d, set: (k, v) => { store[k] = v; } },
        getOrigin: () => ORIGIN,
        openWindow: (url, options) => { const win = fakeWindow(options); opened.push({ url, options, win }); return win; },
        BrowserWindow: { getFocusedWindow: () => null },
        powerSaveBlocker: blocker,
    });
    return { outputs, opened, screen, blocker };
}

const ref = (d) => ({ id: d.id, label: d.label, width: d.bounds.width, height: d.bounds.height });
const row = (outputs, key) => outputs.list().outputs.find((o) => o.key === key);
const tracked = (outputs, key) => outputs.trackedWindows().find((w) => w.key === key);

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

test("a full-screen output stays on top on its own monitor, never over the console (0.2.18)", () => {
    // Two monitors, the console on the primary: the projector on the second stays on top.
    const two = manager({ monitors: [display(1, 0, true), display(2, 1920, false)] });
    assert.equal(two.outputs.windowOptions("/Projection").alwaysOnTop, true, "on creation");
    two.outputs.open("/Projection");
    const [{ win }] = two.opened;
    assert.ok(win.calls.some((c) => c[0] === "setAlwaysOnTop" && c[1] === true && c[2] === "screen-saver"));
    assert.equal(two.outputs.trackedWindows()[0].alwaysOnTop, true);
    // One monitor: a window, never on top (it would hide the console).
    const one = manager({ monitors: [display(1, 0, true)] });
    assert.equal(one.outputs.windowOptions("/Projection").alwaysOnTop, undefined);
    one.outputs.open("/Projection");
    assert.equal(one.opened[0].win.calls.some((c) => c[0] === "setAlwaysOnTop" && c[1] === true), false);
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

test("removing an output closes its window, blocks open and skips the launch; re-adding restores it", () => {
    const { outputs, opened } = manager({ monitors: [display(1, 0, true), display(2, 1920, false)], settings: { outputs: { "/StageView": { target: "window", openAtLaunch: true } } } });
    outputs.open("/StageView");
    assert.equal(opened.length, 1);
    const after = outputs.setAssignment("/StageView", { removed: true });
    assert.equal(opened[0].win.destroyed, true, "the open window closes");
    const row = after.outputs.find((o) => o.key === "/StageView");
    assert.equal(row.removed, true);
    assert.equal(row.assignment.removed, true);
    assert.throws(() => outputs.open("/StageView"), /removida/i, "open refuses a removed output");
    assert.deepEqual(outputs.openAtLaunch(), [], "openAtLaunch skips it");
    // Re-add: the same screen and Abrir ao iniciar come back.
    const back = outputs.setAssignment("/StageView", { removed: false }).outputs.find((o) => o.key === "/StageView");
    assert.deepEqual(back.assignment, { target: "window", openAtLaunch: true, removed: false });
    assert.deepEqual(outputs.openAtLaunch(), ["/StageView"]);
});

test("after a crash the outputs that were open reopen, even without Abrir ao iniciar; removed ones never", () => {
    const { outputs, opened } = manager({ monitors: [display(1, 0, true)], settings: { outputs: { "/Projection": { target: "window", openAtLaunch: true }, "/LyricProjection": { target: "window", removed: true } } } });
    assert.deepEqual(outputs.openAtLaunch(["/StageView", "/LyricProjection", "/Nope"]), ["/Projection", "/StageView"]);
    assert.equal(opened.length, 2);
});

test("the main projection cannot be removed", () => {
    const { outputs } = manager({ monitors: [display(1, 0, true)] });
    assert.throws(() => outputs.setAssignment("/Projection", { removed: true }), /não pode ser removida/);
    assert.equal(outputs.list().outputs.find((o) => o.key === "/Projection").removed, false);
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

test("the reload limiter allows 3 reloads a minute, then refuses until the window passes", () => {
    let t = 0;
    const limiter = createReloadLimiter({ now: () => t });
    assert.deepEqual([limiter.allow(), limiter.allow(), limiter.allow(), limiter.allow()], [true, true, true, false]);
    t = 59000;
    assert.equal(limiter.allow(), false, "still inside the minute of the first reload");
    t = 60001;
    assert.equal(limiter.allow(), true, "the first reload aged out");
});

test("open replaces an output whose renderer crashed instead of focusing the dead window", () => {
    const { outputs, opened } = manager({ monitors: [display(1, 0, true)] });
    outputs.open("/Projection");
    const dead = opened[0].win;
    dead.webContents.isCrashed = () => true;
    dead.destroy = () => { dead.destroyed = true; };
    outputs.open("/Projection");
    assert.equal(opened.length, 2, "a fresh window was opened");
    assert.equal(dead.destroyed, true, "the dead one is gone");
    assert.deepEqual(dead.calls.filter((c) => c[0] === "showInactive"), [], "the dead window was not just brought forward");
    // A healthy window is still only brought forward.
    opened[1].win.webContents.isCrashed = () => false;
    outputs.open("/Projection");
    assert.equal(opened.length, 2);
});

test("the displays stay awake while any output is open, with one blocker (WIN-01)", () => {
    const { outputs, opened, blocker } = manager({ monitors: [display(1, 0, true), display(2, 1920, false)] });
    assert.equal(outputs.keepsAwake(), false, "nothing open: Windows may sleep");
    assert.deepEqual(blocker.starts, []);
    outputs.open("/Projection");
    assert.deepEqual(blocker.starts, ["prevent-display-sleep"], "started with the first output");
    assert.equal(outputs.keepsAwake(), true);
    outputs.open("/StageView");
    outputs.open("/CommunicationProjection");
    outputs.open("/Projection"); // already open: brought forward
    assert.equal(blocker.starts.length, 1, "never started twice");
    assert.deepEqual(blocker.active(), ["prevent-display-sleep"]);
    // Closing all but one keeps it; the last one releases it.
    outputs.close("/Projection");
    outputs.close("/StageView");
    assert.deepEqual(blocker.stops, [], "held while one is still open");
    assert.equal(outputs.keepsAwake(), true);
    outputs.close("/CommunicationProjection");
    assert.deepEqual(blocker.stops, [1], "stopped after the last");
    assert.deepEqual(blocker.active(), []);
    assert.equal(outputs.keepsAwake(), false);
    // Opened again: a new blocker.
    outputs.open("/Projection");
    assert.equal(blocker.starts.length, 2);
    opened.at(-1).win.close();
    assert.deepEqual(blocker.active(), []);
});

test("a window replaced by a new one of the same output keeps one blocker", () => {
    const { outputs, blocker } = manager({ monitors: [display(1, 0, true)] });
    const first = fakeWindow();
    outputs.track(first, `${ORIGIN}/Projection`);
    outputs.track(fakeWindow(), `${ORIGIN}/Projection`);
    assert.equal(first.destroyed, true, "the old one closes");
    assert.equal(blocker.starts.length, 1);
    assert.equal(blocker.active().length, 1, "the new one still holds it");
    outputs.close("/Projection");
    assert.equal(blocker.active().length, 0);
});

test("an output whose monitor leaves waits hidden, never as a window over the console; it comes back full screen (WIN-02)", () => {
    const console1 = display(1, 0, true);
    const tv = display(3, 1920, false);
    const { outputs, opened, screen } = manager({ monitors: [console1, tv], settings: { outputs: { "/StageView": { target: ref(tv) } } } });
    outputs.open("/StageView");
    const { win } = opened[0];
    assert.equal(win.fullScreen, true);
    assert.equal(win.onTop, true);
    win.calls.length = 0;

    // The cable comes out.
    screen.monitors = [console1];
    screen.emit("display-removed");
    assert.equal(win.visible, false, "hidden, even after leaving full screen");
    assert.equal(win.fullScreen, false);
    assert.equal(win.onTop, false, "nothing stays on top of the console");
    assert.equal(win.calls.some((c) => c[0] === "setBounds"), false, "never moved to a window on the console's monitor");
    assert.equal(win.calls.some((c) => c[0] === "showInactive"), false);
    assert.equal(win.destroyed, false, "the window stays: what is on air is still there");
    // The console's banner: open and missing ("Reconectando…"), not closed.
    const waiting = row(outputs, "/StageView");
    assert.equal(waiting.open, true);
    assert.deepEqual(waiting.placement, { mode: "hidden", displayId: null, missing: true });
    // Another monitor change while it waits: still hidden.
    screen.emit("display-metrics-changed");
    assert.equal(win.visible, false);
    // Bringing it forward from Saídas does not show it over the console.
    outputs.open("/StageView");
    assert.equal(win.visible, false);
    assert.equal(opened.length, 1, "no second window");

    // The monitor is back: shown there, full screen, on top.
    win.calls.length = 0;
    screen.monitors = [console1, tv];
    screen.emit("display-added");
    assert.equal(win.visible, true);
    assert.equal(win.fullScreen, true);
    assert.deepEqual(win.bounds, tv.bounds);
    assert.equal(win.onTop, true);
    const bounds = win.calls.findIndex((c) => c[0] === "setBounds");
    const show = win.calls.findIndex((c) => c[0] === "showInactive");
    const full = win.calls.findIndex((c) => c[0] === "setFullScreen" && c[1] === true);
    assert.ok(bounds >= 0 && bounds < show && show < full, "moved to its monitor while hidden, then shown, then full screen");
    assert.deepEqual(row(outputs, "/StageView").placement, { mode: "fullscreen", displayId: 3, missing: false });
});

test("auto: the projector unplugged hides the Projeção until a monitor returns (WIN-02)", () => {
    const console1 = display(1, 0, true);
    const projector = display(2, 1920, false);
    const { outputs, opened, screen } = manager({ monitors: [console1, projector] });
    outputs.open("/Projection");
    const { win } = opened[0];
    assert.equal(win.fullScreen, true);

    screen.monitors = [console1];
    screen.emit("display-removed");
    assert.equal(win.visible, false);
    assert.equal(win.calls.some((c) => c[0] === "setBounds" && c[1].width === 1280), false, "no 1280×720 box on the console");
    assert.equal(row(outputs, "/Projection").placement.missing, true, "the banner says Reconectando…");
    assert.equal(tracked(outputs, "/Projection").visible, false);

    screen.monitors = [console1, projector];
    screen.emit("display-added");
    assert.equal(win.visible, true);
    assert.equal(win.fullScreen, true);
    assert.deepEqual(win.bounds, projector.bounds);
    assert.equal(row(outputs, "/Projection").placement.missing, false);
});

test("auto on a notebook alone opens a window; once on a projector, it waits for it when it leaves", () => {
    const console1 = display(1, 0, true);
    const projector = display(2, 1920, false);
    const { outputs, opened, screen } = manager({ monitors: [console1] });
    outputs.open("/Projection");
    const { win } = opened[0];
    assert.equal(win.visible, true, "a window the operator can see");
    assert.equal(win.fullScreen, false);
    screen.emit("display-metrics-changed");
    assert.equal(win.visible, true, "a monitor change does not hide a window");

    screen.monitors = [console1, projector];
    screen.emit("display-added");
    assert.equal(win.fullScreen, true);
    assert.deepEqual(win.bounds, projector.bounds);

    screen.monitors = [console1];
    screen.emit("display-removed");
    assert.equal(win.visible, false, "it was on the projector: it waits");
    assert.equal(row(outputs, "/Projection").placement.missing, true);
});

test("an output set to Em janela stays a window the operator can see when monitors change", () => {
    const console1 = display(1, 0, true);
    const projector = display(2, 1920, false);
    const { outputs, opened, screen } = manager({ monitors: [console1, projector], settings: { outputs: { "/Projection": { target: "window" } } } });
    outputs.open("/Projection");
    const { win } = opened[0];
    screen.monitors = [console1];
    screen.emit("display-removed");
    assert.equal(win.visible, true);
    assert.equal(win.fullScreen, false);
    assert.equal(row(outputs, "/Projection").placement.missing, false);
    // Chosen while it was waiting hidden: shown as a window again.
    const tv = display(3, 1920, false);
    const other = manager({ monitors: [console1, tv], settings: { outputs: { "/StageView": { target: ref(tv) } } } });
    other.outputs.open("/StageView");
    other.screen.monitors = [console1];
    other.screen.emit("display-removed");
    const stage = other.opened[0].win;
    assert.equal(stage.visible, false);
    other.outputs.setAssignment("/StageView", { target: "window" });
    assert.equal(stage.visible, true);
    assert.equal(stage.fullScreen, false);
});

test("the pointer hides only over an output full screen; as a window it is back", async () => {
    const console1 = display(1, 0, true);
    const projector = display(2, 1920, false);
    const { outputs, opened } = manager({ monitors: [console1, projector] });
    outputs.open("/Projection");
    const { win } = opened[0];
    assert.equal(win.calls.filter((c) => c[0] === "insertCSS").length, 1, "full screen: no pointer");
    outputs.setAssignment("/Projection", { target: "window" });
    await new Promise((r) => setImmediate(r));
    assert.ok(win.calls.some((c) => c[0] === "removeInsertedCSS" && c[1] === "css"), "a window: the pointer is back");
    outputs.setAssignment("/Projection", { target: "auto" });
    assert.equal(win.calls.filter((c) => c[0] === "insertCSS").length, 2, "full screen again: hidden again");
    // Opened as a window: the pointer was never hidden.
    const one = manager({ monitors: [console1] });
    one.outputs.open("/Projection");
    assert.equal(one.opened[0].win.calls.some((c) => c[0] === "insertCSS"), false);
});

test("Abrir ao iniciar with its monitor off: made hidden and frameless, reported as waiting, shown when the monitor arrives", () => {
    const console1 = display(1, 0, true);
    const tv = display(3, 1920, false);
    const { outputs, opened, screen } = manager({ monitors: [console1], settings: { outputs: { "/StageView": { target: ref(tv), openAtLaunch: true } } } });
    const options = outputs.windowOptions("/StageView");
    assert.equal(options.show, false);
    assert.equal(options.frame, false);
    assert.equal(options.skipTaskbar, true);
    assert.deepEqual(outputs.openAtLaunch(), ["/StageView"]);
    const { win } = opened[0];
    assert.equal(win.visible, false, "never shown on the console's monitor");
    const r = row(outputs, "/StageView");
    assert.equal(r.open, true, "open: the banner says Reconectando…, not Fechada");
    assert.equal(r.placement.missing, true);
    assert.equal(r.assignment.openAtLaunch, true, "the choice is kept");

    screen.monitors = [console1, tv];
    screen.emit("display-added");
    assert.equal(win.visible, true);
    assert.equal(win.fullScreen, true);
    assert.deepEqual(win.bounds, tv.bounds);
});

test("a monitor change elsewhere leaves a full-screen output alone; its own monitor changing moves it (WIN-16)", () => {
    const console1 = display(1, 0, true);
    const projector = display(2, 1920, false);
    const { outputs, opened, screen } = manager({ monitors: [console1, projector] });
    outputs.open("/Projection");
    const { win } = opened[0];
    win.calls.length = 0;
    // The console's taskbar moved, a scale changed on another monitor...
    screen.monitors = [{ ...console1, workArea: { x: 0, y: 40, width: 1920, height: 1040 } }, projector];
    screen.emit("display-metrics-changed");
    assert.equal(win.calls.some((c) => c[0] === "setFullScreen"), false, "no leaving and entering full screen");
    assert.equal(win.calls.some((c) => c[0] === "setBounds"), false);
    assert.equal(win.fullScreen, true);
    assert.equal(win.onTop, true, "still on top");
    // The projector's own resolution changed: presented again at its new size.
    const smaller = { ...projector, bounds: { x: 1920, y: 0, width: 1280, height: 720 } };
    screen.monitors = [console1, smaller];
    screen.emit("display-metrics-changed");
    assert.ok(win.calls.some((c) => c[0] === "setFullScreen" && c[1] === true));
    assert.deepEqual(win.bounds, smaller.bounds);
});
