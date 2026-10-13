// Applies the placement rules in outputs.cjs to real windows.
//
// Outputs render the live state, so either side can open one: a page with
// window.open (the main process decides where it lands: windowOptions), or the
// main process itself (open, and openAtLaunch for those set to open when
// KERYX starts). Either way it is tracked (track) and moved when monitors
// change or the operator reassigns it.

const { BrowserWindow } = require("electron");
const {
    OUTPUTS, outputForKey, outputKeyForUrl, displayRef, resolvePlacement, windowedBounds, normalizeAssignment, canRemove,
} = require("./outputs.cjs");

const SETTINGS_KEY = "outputs";
const HIDE_CURSOR_CSS = "html, body, * { cursor: none !important; }";

// BrowserWindow is injectable for tests (in plain Node, require("electron") is a path).
function createOutputManager({ screen, settings, getOrigin, openWindow = null, operatorWindow = () => null, log = console.warn, BrowserWindow: Win = BrowserWindow }) {
    const windows = new Map(); // output key -> BrowserWindow
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

    const assignments = () => settings.get(SETTINGS_KEY, {});
    const assignmentFor = (key) => normalizeAssignment(assignments()[key]);
    const placementFor = (key) => resolvePlacement(outputForKey(key), displays(), assignmentFor(key));

    // Extra BrowserWindow options for an output, whichever way it opens
    // (a page's window.open, or open). Never in the taskbar nor in Alt+Tab,
    // full screen or not: skipTaskbar covers the taskbar, and type "toolbar"
    // makes the window a Windows tool window (WS_EX_TOOLWINDOW), which Alt+Tab
    // does not list. It can only be set at creation.
    function windowOptions(key) {
        const placement = placementFor(key);
        if (placement.mode !== "fullscreen") return { skipTaskbar: true, type: "toolbar" };
        const { x, y, width, height } = placement.display.bounds;
        return { x, y, width, height, frame: false, backgroundColor: "#000000", autoHideMenuBar: true, skipTaskbar: true, type: "toolbar" };
    }

    function present(win, placement) {
        if (win.isDestroyed()) return;
        if (placement.mode === "fullscreen") {
            if (win.isFullScreen()) win.setFullScreen(false);
            win.setBounds(placement.display.bounds);
            hideFromTaskbar(win);
            win.setFullScreen(true);
        } else {
            if (win.isFullScreen()) win.setFullScreen(false);
            win.setBounds(windowedBounds(displays()));
            hideFromTaskbar(win);
        }
    }

    function track(win, url) {
        const key = outputKeyForUrl(url, getOrigin());
        if (!key) return null;
        const previous = windows.get(key);
        if (previous && previous !== win && !previous.isDestroyed()) previous.close();
        windows.set(key, win);
        // Forget it as soon as it starts closing, so opening the output again
        // right away makes a new window instead of focusing the closing one.
        const forget = () => {
            if (windows.get(key) === win) windows.delete(key);
        };
        win.on("close", forget);
        win.on("closed", forget);
        // Whatever path created it (the options may not have said so).
        hideFromTaskbar(win);

        // An output never keeps the keyboard: the operator's keys (arrows,
        // Enter, Esc) belong to the console. Opening one (and going full
        // screen) activates it on Windows, so focus goes back to the window
        // that opened it, or the operator's main window, once it is up.
        const opener = Win.getFocusedWindow();
        const giveBack = () => {
            const back = opener && opener !== win && !opener.isDestroyed() ? opener : operatorWindow();
            if (back && back !== win && !back.isDestroyed() && !win.isDestroyed() && win.isFocused()) back.focus();
        };
        win.once("ready-to-show", () => setTimeout(giveBack, 50));
        win.once("show", () => setTimeout(giveBack, 50));
        win.once("enter-full-screen", () => setTimeout(giveBack, 50));
        // A windowed output has no full-screen event after the page loads.
        win.webContents.once("did-finish-load", () => setTimeout(giveBack, 50));
        setTimeout(giveBack, 1000);

        const placement = placementFor(key);
        const { webContents } = win;
        if (placement.mode === "fullscreen") {
            win.setFullScreen(true);
            // Nobody sits at a projector: no pointer, and nothing to click.
            const hideCursor = () => webContents.insertCSS(HIDE_CURSOR_CSS).catch(() => {});
            webContents.on("did-finish-load", hideCursor);
            hideCursor();
        }
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
                const placement = resolvePlacement(o, current, assignmentFor(o.key));
                const win = windows.get(o.key);
                const assignment = assignmentFor(o.key);
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
        const existing = windows.get(key);
        if (existing && !existing.isDestroyed()) {
            existing.showInactive();
            existing.moveTop();
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
        trackedWindows: () => [...windows].map(([key, win]) => ({
            key,
            fullScreen: win.isFullScreen(),
            bounds: win.getBounds(),
            destroyed: win.isDestroyed(),
            skipTaskbar: offTaskbar.has(win),
        })),
    };
}

module.exports = { createOutputManager };
