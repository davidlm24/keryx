// Where the console window opens: where the operator left it (size,
// position, maximized), kept per computer in settings.json "window". A
// place no connected monitor shows any more (a monitor unplugged, the
// resolution lowered) is never used: the window comes back on a monitor it
// fits, else maximized on the primary one. Pure logic, no Electron import,
// so it is unit tested; main.cjs applies it.

const SETTINGS_KEY = "window";
const DEFAULT = { width: 1440, height: 900 };
const MIN = { width: 960, height: 600 };
// At least this share of the window must still be on a monitor's work area
// for the saved place to count.
const MIN_VISIBLE = 0.5;

const num = (v) => (Number.isFinite(v) ? Math.round(v) : null);

// Accept only the shape save() writes.
function normalizeState(raw) {
    if (!raw || typeof raw !== "object") return null;
    const b = raw.bounds || {};
    const bounds = { x: num(b.x), y: num(b.y), width: num(b.width), height: num(b.height) };
    if (Object.values(bounds).some((v) => v === null) || bounds.width <= 0 || bounds.height <= 0) return null;
    return { bounds, maximized: raw.maximized === true };
}

const overlap = (a, b) => {
    const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
};

const areaOf = (d) => d.workArea || d.bounds;

// The rectangle moved and shrunk to lie inside `area` (never below MIN
// unless the area itself is smaller).
function fitInto(rect, area) {
    const width = Math.min(Math.max(rect.width, Math.min(MIN.width, area.width)), area.width);
    const height = Math.min(Math.max(rect.height, Math.min(MIN.height, area.height)), area.height);
    const x = Math.min(Math.max(rect.x, area.x), area.x + area.width - width);
    const y = Math.min(Math.max(rect.y, area.y), area.y + area.height - height);
    return { x, y, width, height };
}

// saved: what save() wrote (or anything); displays: [{ bounds, workArea, primary }].
// -> { bounds?: {x,y,width,height}, maximized: boolean }
//    no bounds = let Electron centre the default size on the primary monitor.
function restoreState(saved, displays = []) {
    const primary = displays.find((d) => d.primary) || displays[0] || null;
    const state = normalizeState(saved);
    if (state) {
        let best = null;
        let bestArea = 0;
        for (const d of displays) {
            const a = overlap(state.bounds, areaOf(d));
            if (a > bestArea) { best = d; bestArea = a; }
        }
        const visible = bestArea / (state.bounds.width * state.bounds.height);
        if (best && visible >= MIN_VISIBLE) {
            return { bounds: fitInto(state.bounds, areaOf(best)), maximized: state.maximized };
        }
        // Its monitor is gone: maximized on the primary, where the operator sees it.
        if (primary) return { bounds: fitInto({ ...areaOf(primary) }, areaOf(primary)), maximized: true };
        return { maximized: state.maximized };
    }
    // First launch: the default size, unless the primary monitor is smaller
    // (the 1366×768 notebook), where KERYX opens maximized.
    if (primary) {
        const area = areaOf(primary);
        if (area.width < DEFAULT.width || area.height < DEFAULT.height) {
            return { bounds: fitInto({ ...area }, area), maximized: true };
        }
    }
    return { maximized: false };
}

// What to keep: the window's normal (not maximized) bounds and whether it
// is maximized. A minimized window keeps its normal bounds too.
function captureState({ normalBounds, maximized }) {
    const state = normalizeState({ bounds: normalBounds, maximized });
    return state || null;
}

module.exports = { SETTINGS_KEY, DEFAULT, MIN, normalizeState, restoreState, captureState };
