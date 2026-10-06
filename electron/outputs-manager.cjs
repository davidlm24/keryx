// Applies the placement rules in outputs.cjs to real windows.
//
// Pages open outputs themselves with window.open and keep the returned handle
// to postMessage to it, so the main process never opens an output on its own:
// it only decides where the page's window lands (windowOptions), tracks it
// (track), and moves it when monitors change or the operator reassigns it.

const { BrowserWindow } = require("electron");
const {
    OUTPUTS, outputForKey, outputKeyForUrl, displayRef, resolvePlacement, windowedBounds, normalizeAssignment,
} = require("./outputs.cjs");

const SETTINGS_KEY = "outputs";
const HIDE_CURSOR_CSS = "html, body, * { cursor: none !important; }";

function createOutputManager({ screen, settings, getOrigin, log = console.warn }) {
    const windows = new Map(); // output key -> BrowserWindow

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

    // Extra BrowserWindow options for a window.open to this output.
    function windowOptions(key) {
        const placement = placementFor(key);
        if (placement.mode !== "fullscreen") return {};
        const { x, y, width, height } = placement.display.bounds;
        return { x, y, width, height, frame: false, backgroundColor: "#000000", autoHideMenuBar: true };
    }

    function present(win, placement) {
        if (win.isDestroyed()) return;
        if (placement.mode === "fullscreen") {
            if (win.isFullScreen()) win.setFullScreen(false);
            win.setBounds(placement.display.bounds);
            win.setFullScreen(true);
        } else {
            if (win.isFullScreen()) win.setFullScreen(false);
            win.setBounds(windowedBounds(displays()));
        }
    }

    function track(win, url) {
        const key = outputKeyForUrl(url, getOrigin());
        if (!key) return null;
        const previous = windows.get(key);
        if (previous && previous !== win && !previous.isDestroyed()) previous.close();
        windows.set(key, win);
        win.on("closed", () => {
            if (windows.get(key) === win) windows.delete(key);
        });

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
                return {
                    key: o.key,
                    label: o.label,
                    windowName: o.windowName,
                    assignment: assignmentFor(o.key),
                    placement: { mode: placement.mode, displayId: placement.display ? placement.display.id : null, missing: Boolean(placement.missing) },
                    open: Boolean(win && !win.isDestroyed()),
                };
            }),
        };
    }

    function setAssignment(key, assignment) {
        if (!outputForKey(key)) throw new Error(`Saída desconhecida: ${key}`);
        settings.set(SETTINGS_KEY, { ...assignments(), [key]: normalizeAssignment(assignment) });
        const win = windows.get(key);
        if (win && !win.isDestroyed()) present(win, placementFor(key));
        return list();
    }

    function close(key) {
        const win = windows.get(key);
        if (win && !win.isDestroyed()) win.close();
    }

    // Shows each display's number on it for a few seconds.
    function identify(durationMs = 3000) {
        displays().forEach((d, index) => {
            const win = new BrowserWindow({
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
        close,
        identify,
        // For tests and the smoke run.
        trackedWindows: () => [...windows].map(([key, win]) => ({
            key,
            fullScreen: win.isFullScreen(),
            bounds: win.getBounds(),
            destroyed: win.isDestroyed(),
        })),
    };
}

module.exports = { createOutputManager };
