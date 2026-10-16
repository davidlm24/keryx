// Where the console window opens: as the operator left it on this computer
// (size, place, maximized), when that still fits a monitor connected now;
// else maximized on the primary monitor — a fixed 1440 × 900 was bigger than
// a 1366 × 768 notebook. Kept in the electron settings (settings.json, per
// computer) under SETTINGS_KEY, written when the console closes.
// Pure: main.cjs gives it the displays and applies the answer.

const SETTINGS_KEY = "consoleWindow";
// The console's own minimum (BrowserWindow minWidth/minHeight in main.cjs).
const MIN = { width: 960, height: 600 };
// The size it asks for when it is not maximized and nothing was kept.
const DEFAULT = { width: 1440, height: 900 };
// How much of the window's top strip (where the console's bar is, the one the
// operator drags it by) must lie on a monitor for the place to count: the
// whole width given here, half the height.
const GRIP = { width: 120, height: 32 };

const finite = (n) => typeof n === "number" && Number.isFinite(n);

// Only the shape this module writes; anything else is "nothing kept".
function normalizeWindowState(value) {
    if (!value || typeof value !== "object") return null;
    const { x, y, width, height } = value;
    if (![x, y, width, height].every(finite) || width <= 0 || height <= 0) return null;
    return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height), maximized: value.maximized === true };
}

function overlap(a, b) {
    const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? { width: w, height: h } : null;
}

const areaOf = (d) => d.workArea || d.bounds;
const primaryOf = (displays) => displays.find((d) => d.primary) || displays[0] || null;

// The primary monitor's work area, the default size centred in it (never
// larger than the area), maximized.
function onPrimary(displays) {
    const primary = primaryOf(displays);
    const area = primary ? areaOf(primary) : { x: 0, y: 0, ...DEFAULT };
    const width = Math.min(DEFAULT.width, area.width);
    const height = Math.min(DEFAULT.height, area.height);
    return {
        bounds: { x: area.x + Math.round((area.width - width) / 2), y: area.y + Math.round((area.height - height) / 2), width, height },
        maximized: true,
    };
}

// saved: what normalizeWindowState read (or null); displays: [{ primary,
// bounds, workArea }]. Answers { bounds, maximized }: bounds are the window's
// normal (not maximized) bounds; maximized says to maximize it on show.
// The kept place counts when its top strip is on a monitor (GRIP); the size
// is then trimmed to that monitor's work area and the window pulled inside it,
// so a window kept on a big monitor never spills off a notebook. Too small
// for the minimum, or on no monitor: maximized on the primary one.
function restoreWindow(saved, displays = []) {
    const state = normalizeWindowState(saved);
    if (!state || state.width < MIN.width || state.height < MIN.height || !displays.length) return onPrimary(displays);
    const grip = { x: state.x, y: state.y, width: state.width, height: GRIP.height };
    let best = null;
    for (const d of displays) {
        const o = overlap(grip, areaOf(d));
        if (o && o.width >= GRIP.width && o.height >= GRIP.height / 2 && (!best || o.width > best.o.width)) best = { d, o };
    }
    if (!best) return onPrimary(displays);
    const area = areaOf(best.d);
    const width = Math.min(state.width, area.width);
    const height = Math.min(state.height, area.height);
    if (width < MIN.width || height < MIN.height) return onPrimary(displays);
    const x = Math.min(Math.max(state.x, area.x), area.x + area.width - width);
    const y = Math.min(Math.max(state.y, area.y), area.y + area.height - height);
    return { bounds: { x, y, width, height }, maximized: state.maximized };
}

// What to keep when the console closes. normal: getNormalBounds() (the size
// it goes back to when not maximized). A minimized window says nothing true
// about being maximized, so it keeps what was kept before.
function windowStateToSave({ normal, maximized, minimized }, previous) {
    const state = normalizeWindowState({ ...normal, maximized });
    if (!state) return normalizeWindowState(previous);
    if (minimized) state.maximized = normalizeWindowState(previous)?.maximized ?? false;
    return state;
}

module.exports = { SETTINGS_KEY, MIN, DEFAULT, normalizeWindowState, restoreWindow, windowStateToSave };
