// The console's zoom (audit C-30, WCAG 1.4.4): Ctrl+= / Ctrl+− / Ctrl+0 and
// Configurações › Console › Zoom make everything in the console bigger, in
// steps, kept per computer (settings.json, never the church's User row).
//
// Only the console window: it runs in Chromium's "isolated" zoom mode
// (main.cjs), because the default zoom is per host and every output is on the
// same 127.0.0.1 — zooming the console would have zoomed the projector too.
// Outputs never zoom. Ctrl+wheel and pinch stay off (Electron's default).

const ZOOM_KEY = "consoleZoom";
const ZOOM_STEPS = [0.9, 1, 1.1, 1.25, 1.5];

// A saved or asked-for value -> the nearest step (1 when it makes no sense).
function normalizeZoom(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 1;
    return ZOOM_STEPS.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best), 1);
}

// One step in (1) or out (-1), held at the ends.
function stepZoom(current, dir) {
    const i = ZOOM_STEPS.indexOf(normalizeZoom(current));
    return ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, i + Math.sign(dir)))];
}

// A key press (Electron's before-input-event input) -> "in" | "out" |
// "reset" | null. Ctrl (Cmd on a Mac) without Alt — Ctrl+Alt is AltGr on
// Windows, typing. The + key with or without Shift, the numeric keypad too.
function zoomCommand(input) {
    if (!input || input.type !== "keyDown" || !(input.control || input.meta) || input.alt) return null;
    const { key, code } = input;
    if (key === "=" || key === "+" || code === "NumpadAdd") return "in";
    if (key === "-" || key === "_" || code === "NumpadSubtract") return "out";
    if (key === "0" || code === "Numpad0") return "reset";
    return null;
}

const zoomPercent = (z) => `${Math.round(normalizeZoom(z) * 100)} %`;

// settings: electron/settings.cjs; getWindow: the console's BrowserWindow (or
// null); notify(z): tells the console (a toast, Configurações' row).
function createConsoleZoom({ settings, getWindow, notify = () => {} }) {
    const get = () => normalizeZoom(settings.get(ZOOM_KEY, 1));
    const apply = (win = getWindow()) => {
        if (win && !win.isDestroyed()) win.webContents.setZoomFactor(get());
    };
    const set = (value) => {
        const z = normalizeZoom(value);
        settings.set(ZOOM_KEY, z);
        apply();
        notify(z);
        return z;
    };
    const command = (cmd) => set(cmd === "reset" ? 1 : stepZoom(get(), cmd === "in" ? 1 : -1));
    return { get, set, apply, command };
}

module.exports = { ZOOM_KEY, ZOOM_STEPS, normalizeZoom, stepZoom, zoomCommand, zoomPercent, createConsoleZoom };
