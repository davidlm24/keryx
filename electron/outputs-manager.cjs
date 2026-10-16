// Applies the placement rules in outputs.cjs to real windows.
//
// Outputs render the live state, so either side can open one: a page with
// window.open (the main process decides where it lands: windowOptions), or the
// main process itself (open, and openAtLaunch for those set to open when
// KERYX starts). Either way it is tracked (track) and moved when monitors
// change or the operator reassigns it.

const { BrowserWindow, powerSaveBlocker } = require("electron");
const {
    OUTPUTS, staysOnTop, inPlace, outputForKey, outputKeyForUrl, displayRef, resolvePlacement, windowedBounds, normalizeAssignment, canRemove,
} = require("./outputs.cjs");

const SETTINGS_KEY = "outputs";
const HIDE_CURSOR_CSS = "html, body, * { cursor: none !important; }";

// A window whose renderer keeps dying must not reload in a loop: at most `max`
// reloads in `windowMs`, then allow() says no and the caller warns instead.
function createReloadLimiter({ max = 3, windowMs = 60000, now = Date.now } = {}) {
    let times = [];
    return {
        allow() {
            const t = now();
            times = times.filter((at) => t - at < windowMs);
            if (times.length >= max) return false;
            times.push(t);
            return true;
        },
    };
}

// BrowserWindow and powerSaveBlocker are injectable for tests (in plain
// Node, require("electron") is a path, and both are undefined).
function createOutputManager({
    screen, settings, getOrigin, openWindow = null, operatorWindow = () => null, log = console.warn,
    BrowserWindow: Win = BrowserWindow, powerSaveBlocker: blocker = powerSaveBlocker,
}) {
    const windows = new Map(); // output key -> BrowserWindow
    // What present (or track) last made of each window: "fullscreen",
    // "window" or "hidden". One that went full screen on a monitor waits for
    // it when the monitor leaves (resolvePlacement's waiting).
    const shown = new WeakMap();
    const waiting = (win) => Boolean(win && !win.isDestroyed() && (shown.get(win) === "fullscreen" || shown.get(win) === "hidden"));
    // Windows this manager took off the taskbar (Electron has no getter).
    const offTaskbar = new WeakSet();
    // Outputs are not in the taskbar (as in Holyrics): only the console is.
    // Set before going full screen: on Windows, changing it on a window that
    // is already full screen can bring the button back or flicker.
    const hideFromTaskbar = (win) => {
        if (win.isDestroyed()) return;
        win.setSkipTaskbar(true);
        offTaskbar.add(win);
    };

    // Primary first, then left to right, so "Tela 1" is always the operator's own screen
    // and the numbers match what Identificar telas shows.
    const displays = () => {
        const primaryId = screen.getPrimaryDisplay().id;
        return screen.getAllDisplays()
            .map((d) => ({
                id: d.id,
                label: d.label || "",
                primary: d.id === primaryId,
                bounds: d.bounds,
                workArea: d.workArea,
                scaleFactor: d.scaleFactor,
            }))
            .sort((a, b) => Number(b.primary) - Number(a.primary) || a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
    };

    // The monitor the console is on (the operator's): an output full screen
    // anywhere else stays on top (staysOnTop). Before the console exists,
    // the primary monitor, where it opens.
    const operatorDisplayId = () => {
        const w = operatorWindow();
        try {
            if (w && !w.isDestroyed() && screen.getDisplayMatching) return screen.getDisplayMatching(w.getBounds()).id;
        } catch { /* the primary below */ }
        return screen.getPrimaryDisplay().id;
    };
    const onTop = (placement) => staysOnTop(placement, operatorDisplayId());
    const applyOnTop = (win, placement) => {
        if (win.isDestroyed() || !win.setAlwaysOnTop) return;
        const on = onTop(placement);
        // "screen-saver": above the taskbar and other topmost windows too.
        if (on) win.setAlwaysOnTop(true, "screen-saver"); else win.setAlwaysOnTop(false);
    };

    const assignments = () => settings.get(SETTINGS_KEY, {});
    const assignmentFor = (key) => normalizeAssignment(assignments()[key]);
    const placementFor = (key) => resolvePlacement(outputForKey(key), displays(), assignmentFor(key), { waiting: waiting(windows.get(key)) });

    // Windows turns the displays off after a few idle minutes, and sleeps
    // later; Chromium holds a wake lock only while a video plays. A verse on
    // air through a 30-minute sermon went black (audit WIN-01): while any
    // output is open (hidden waiting for its monitor too) the displays and
    // the PC stay awake. One blocker, started with the first output and
    // stopped after the last.
    let awakeId = null;
    const keepAwake = () => {
        if (!blocker) return;
        const any = [...windows.values()].some((w) => !w.isDestroyed());
        try {
            if (any && awakeId === null) awakeId = blocker.start("prevent-display-sleep");
            else if (!any && awakeId !== null) {
                blocker.stop(awakeId);
                awakeId = null;
            }
        } catch (err) {
            log(`[keryx-outputs] não foi possível manter as telas ligadas: ${err.message}`);
        }
    };

    // Nobody sits at a projector: no pointer over an output full screen (or
    // hidden, on its way back to full screen). Over a window the pointer is
    // back. The CSS goes with each page load, so did-finish-load puts it back.
    const noPointer = new WeakSet();
    const pointerCss = new WeakMap(); // win -> promise of the insertCSS key
    const syncPointer = (win) => {
        if (win.isDestroyed()) return;
        const { webContents } = win;
        const css = pointerCss.get(win);
        if (noPointer.has(win) && !css) pointerCss.set(win, webContents.insertCSS(HIDE_CURSOR_CSS).catch(() => null));
        else if (!noPointer.has(win) && css) {
            pointerCss.delete(win);
            css.then((key) => { if (key && !win.isDestroyed()) webContents.removeInsertedCSS(key).catch(() => {}); });
        }
    };
    const setPointer = (win, hidden) => {
        if (hidden) noPointer.add(win); else noPointer.delete(win);
        syncPointer(win);
    };

    // An output never keeps the keyboard: the operator's keys (arrows,
    // Enter, Esc) belong to the console. Back to the window that opened it,
    // else the operator's main window.
    const giveBack = (win, opener = null) => {
        const back = opener && opener !== win && !opener.isDestroyed() ? opener : operatorWindow();
        if (back && back !== win && !back.isDestroyed() && !win.isDestroyed() && win.isFocused()) back.focus();
    };

    // Extra BrowserWindow options for an output, whichever way it opens
    // (a page's window.open, or open). Never in the taskbar nor in Alt+Tab,
    // full screen or not: skipTaskbar covers the taskbar, and type "toolbar"
    // makes the window a Windows tool window (WS_EX_TOOLWINDOW), which Alt+Tab
    // does not list. It can only be set at creation.
    // An output whose monitor is off (Abrir ao iniciar before the projector
    // is on) is made hidden, and frameless as it will be full screen.
    function windowOptions(key) {
        const placement = placementFor(key);
        if (placement.mode === "hidden") return { show: false, frame: false, backgroundColor: "#000000", autoHideMenuBar: true, skipTaskbar: true, type: "toolbar" };
        if (placement.mode !== "fullscreen") return { skipTaskbar: true, type: "toolbar" };
        const { x, y, width, height } = placement.display.bounds;
        return { x, y, width, height, frame: false, backgroundColor: "#000000", autoHideMenuBar: true, skipTaskbar: true, type: "toolbar", ...(onTop(placement) ? { alwaysOnTop: true } : {}) };
    }

    function present(win, placement) {
        if (win.isDestroyed()) return;
        if (placement.mode === "fullscreen") {
            const current = { fullScreen: win.isFullScreen(), visible: win.isVisible(), bounds: win.getBounds() };
            if (!inPlace(placement, current)) {
                if (win.isFullScreen()) win.setFullScreen(false);
                win.setBounds(placement.display.bounds);
                hideFromTaskbar(win);
                // Back from waiting: shown where its monitor is (never on the
                // console's first), then full screen, the keyboard untouched.
                if (!current.visible) win.showInactive();
                win.setFullScreen(true);
                if (!current.visible) setTimeout(() => giveBack(win), 50);
            }
            setPointer(win, true);
        } else if (placement.mode === "hidden") {
            // Hidden first (Windows has moved it onto the console's monitor).
            // On Windows, leaving full screen shows a hidden window again, at
            // its bounds from before (on the monitor that left): hide it once
            // more after. Off the top too (applyOnTop, below).
            win.hide();
            if (win.isFullScreen()) {
                win.setFullScreen(false);
                if (win.isVisible()) win.hide();
            }
            setPointer(win, true);
        } else {
            if (win.isFullScreen()) win.setFullScreen(false);
            win.setBounds(windowedBounds(displays()));
            hideFromTaskbar(win);
            if (!win.isVisible()) win.showInactive();
            setPointer(win, false);
        }
        shown.set(win, placement.mode);
        applyOnTop(win, placement);
    }

    function track(win, url) {
        const key = outputKeyForUrl(url, getOrigin());
        if (!key) return null;
        // The new one first, so the old one closing never leaves the output
        // without a window (nor the displays without their blocker).
        const previous = windows.get(key);
        windows.set(key, win);
        if (previous && previous !== win && !previous.isDestroyed()) previous.close();
        // Forget it as soon as it starts closing, so opening the output again
        // right away makes a new window instead of focusing the closing one.
        const forget = () => {
            if (windows.get(key) === win) windows.delete(key);
            keepAwake();
        };
        win.on("close", forget);
        win.on("closed", forget);
        keepAwake();
        // Whatever path created it (the options may not have said so).
        hideFromTaskbar(win);

        // Opening one (and going full screen) activates it on Windows, so
        // the keyboard goes back (giveBack) once it is up.
        const opener = Win.getFocusedWindow();
        const back = () => setTimeout(() => giveBack(win, opener), 50);
        win.once("ready-to-show", back);
        win.once("show", back);
        win.once("enter-full-screen", back);
        // A windowed output has no full-screen event after the page loads.
        win.webContents.once("did-finish-load", back);
        setTimeout(() => giveBack(win, opener), 1000);

        const placement = placementFor(key);
        const { webContents } = win;
        if (placement.mode === "fullscreen") {
            win.setFullScreen(true);
            applyOnTop(win, placement);
        } else if (placement.mode === "hidden") {
            // Its monitor is off already: made hidden (windowOptions), it
            // waits; one made visible elsewhere is hidden here.
            if (win.isVisible()) win.hide();
        }
        shown.set(win, placement.mode);
        webContents.on("did-finish-load", () => {
            pointerCss.delete(win);
            syncPointer(win);
        });
        setPointer(win, placement.mode !== "window");
        // An output has no title bar to close it by: Ctrl+W, or Fechar in Settings.
        webContents.on("before-input-event", (event, input) => {
            if (input.type === "keyDown" && input.control && !input.shift && !input.alt && input.key.toLowerCase() === "w") {
                event.preventDefault();
                win.close();
            }
        });
        return key;
    }

    function reapplyAll() {
        for (const [key, win] of windows) {
            try {
                present(win, placementFor(key));
            } catch (err) {
                log(`[keryx-outputs] não foi possível mover ${key}: ${err.message}`);
            }
        }
    }

    for (const event of ["display-added", "display-removed", "display-metrics-changed"]) {
        screen.on(event, reapplyAll);
    }

    function list() {
        const current = displays();
        return {
            displays: current.map((d) => ({ ...displayRef(d), primary: d.primary, bounds: d.bounds, scaleFactor: d.scaleFactor })),
            outputs: OUTPUTS.map((o) => {
                const win = windows.get(o.key);
                const assignment = assignmentFor(o.key);
                const placement = resolvePlacement(o, current, assignment, { waiting: waiting(win) });
                return {
                    key: o.key,
                    label: o.label,
                    windowName: o.windowName,
                    assignment,
                    removed: assignment.removed,
                    placement: { mode: placement.mode, displayId: placement.display ? placement.display.id : null, missing: Boolean(placement.missing) },
                    open: Boolean(win && !win.isDestroyed()),
                };
            }),
        };
    }

    // A partial change ({ target }, { openAtLaunch } or { removed }) keeps the
    // rest. Removing closes the open window; the entry stays, so re-adding
    // restores the same screen and "Abrir ao iniciar".
    function setAssignment(key, assignment) {
        if (!outputForKey(key)) throw new Error(`Saída desconhecida: ${key}`);
        if (assignment && assignment.removed === true && !canRemove(key)) throw new Error("A Projeção principal não pode ser removida.");
        const next = normalizeAssignment({ ...assignmentFor(key), ...(assignment || {}) });
        settings.set(SETTINGS_KEY, { ...assignments(), [key]: next });
        const win = windows.get(key);
        if (win && !win.isDestroyed()) {
            if (next.removed) win.close();
            else present(win, placementFor(key));
        }
        return list();
    }

    // Opens (or brings forward) an output from the main process.
    function open(key) {
        if (!outputForKey(key)) throw new Error(`Saída desconhecida: ${key}`);
        if (assignmentFor(key).removed) throw new Error("Saída removida. Adicione-a de novo em Telas e saídas.");
        let existing = windows.get(key);
        // A crashed renderer is a dead window: focusing it changes nothing.
        // Drop it and open a fresh one (ARCH-001).
        if (existing && !existing.isDestroyed() && existing.webContents.isCrashed && existing.webContents.isCrashed()) {
            log(`[keryx-outputs] ${key} travou; abrindo de novo`);
            windows.delete(key);
            existing.destroy();
            existing = null;
        }
        if (existing && !existing.isDestroyed()) {
            // Waiting for its monitor, it stays hidden: the banner says so.
            if (placementFor(key).mode !== "hidden") {
                existing.showInactive();
                existing.moveTop();
            }
            return list();
        }
        if (!openWindow) throw new Error("Abrir saídas não está disponível.");
        const url = getOrigin() + key;
        const win = openWindow(url, windowOptions(key));
        track(win, url);
        return list();
    }

    function openAtLaunch() {
        const opened = [];
        for (const o of OUTPUTS) {
            const a = assignmentFor(o.key);
            if (a.removed || !a.openAtLaunch) continue;
            try {
                open(o.key);
                opened.push(o.key);
            } catch (err) {
                log(`[keryx-outputs] não foi possível abrir ${o.key}: ${err.message}`);
            }
        }
        return opened;
    }

    function close(key) {
        const win = windows.get(key);
        if (win && !win.isDestroyed()) win.close();
    }

    // Shows each display's number on it for a few seconds.
    function identify(durationMs = 3000) {
        displays().forEach((d, index) => {
            const win = new Win({
                x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
                frame: false, transparent: true, focusable: false, skipTaskbar: true, alwaysOnTop: true,
                webPreferences: { sandbox: true, contextIsolation: true },
            });
            win.setIgnoreMouseEvents(true);
            const html = `<body style="margin:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);font:700 28vh system-ui;color:#fff">${index + 1}</body>`;
            win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
            setTimeout(() => { if (!win.isDestroyed()) win.close(); }, durationMs);
        });
    }

    return {
        windowOptions,
        track,
        list,
        setAssignment,
        open,
        openAtLaunch,
        close,
        identify,
        // For tests and the smoke run.
        keepsAwake: () => awakeId !== null && (!blocker.isStarted || blocker.isStarted(awakeId)),
        trackedWindows: () => [...windows].map(([key, win]) => ({
            key,
            fullScreen: win.isFullScreen(),
            visible: win.isVisible(),
            bounds: win.getBounds(),
            destroyed: win.isDestroyed(),
            skipTaskbar: offTaskbar.has(win),
            alwaysOnTop: Boolean(win.isAlwaysOnTop && win.isAlwaysOnTop()),
        })),
    };
}

module.exports = { createOutputManager, createReloadLimiter };
