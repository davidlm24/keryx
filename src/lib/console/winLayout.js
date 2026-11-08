// THE window's sizes on this computer (owner 2026-10-15, Rodada D3): the
// window stretches by its edges and corners, one size for the common pages
// and one for the editors (nav.js winSize), and the panels inside a page
// are resized by splitters like the console's — each column's size kept
// per page. Kept in localStorage (this computer's, like the console's
// arrangement; a detached page's /Janela reads the same), never a User
// field.
export const WIN_KEY = "keryx.console.win";
export const WIN_MIN = { w: 760, h: 480 };
export const WIN_KINDS = ["standard", "editor"];

const num = (v) => (Number.isFinite(v) ? Math.round(v) : null);

// A size kept in a box of maxW × maxH: never under WIN_MIN (unless the box
// itself is smaller), never past the box. null when there is no size.
export function clampWin(size, maxW = Infinity, maxH = Infinity) {
    const w = num(size?.w);
    const h = num(size?.h);
    if (w === null || h === null) return null;
    const fit = (v, min, max) => Math.max(Math.min(min, max), Math.min(max, Math.max(min, v)));
    return { w: fit(w, WIN_MIN.w, maxW), h: fit(h, WIN_MIN.h, maxH) };
}

// A rectangle dragged by one edge or corner (`edge`: "n" "s" "e" "w" and the
// corners "ne" "nw" "se" "sw") by dx/dy, kept inside a W × H box and over
// WIN_MIN; the opposite edges stay where they were.
export function dragRect(rect, edge, dx, dy, W, H) {
    let { x, y, w, h } = rect;
    const minW = Math.min(WIN_MIN.w, W);
    const minH = Math.min(WIN_MIN.h, H);
    if (edge.includes("e")) w = Math.min(W - x, Math.max(minW, w + dx));
    if (edge.includes("s")) h = Math.min(H - y, Math.max(minH, h + dy));
    if (edge.includes("w")) { const right = x + w; x = Math.max(0, Math.min(right - minW, x + dx)); w = right - x; }
    if (edge.includes("n")) { const bottom = y + h; y = Math.max(0, Math.min(bottom - minH, y + dy)); h = bottom - y; }
    return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

// A column's (or a stacked panel's) size between its minimum and maximum.
export function clampCol(px, min = 120, max = 900) {
    const v = num(px);
    if (v === null) return min;
    return Math.max(min, Math.min(Math.max(min, max), v));
}

// The saved state made safe: { sizes: { standard, editor }, cols: { key: px } }.
export function normalizeWin(saved) {
    const sizes = {};
    for (const k of WIN_KINDS) { const s = clampWin(saved?.sizes?.[k]); if (s) sizes[k] = s; }
    const cols = {};
    for (const [k, v] of Object.entries(saved?.cols || {})) if (typeof k === "string" && num(v) !== null && v > 0) cols[k] = Math.round(v);
    return { sizes, cols };
}

export function readWin(store = globalThis.localStorage) {
    try { return normalizeWin(JSON.parse(store?.getItem(WIN_KEY) || "null")); } catch { return normalizeWin(null); }
}

export function writeWin(next, store = globalThis.localStorage) {
    try { store?.setItem(WIN_KEY, JSON.stringify(normalizeWin(next))); } catch { /* private window: this session only */ }
}

// One column's size changed (null: back to the page's own).
export function withCol(state, key, px) {
    const cols = { ...state.cols };
    if (px === null || px === undefined) delete cols[key]; else cols[key] = Math.round(px);
    return { ...state, cols };
}

// The window's size of one kind changed (null: back to the default).
export function withSize(state, kind, size) {
    const sizes = { ...state.sizes };
    const s = size ? clampWin(size) : null;
    if (s) sizes[kind] = s; else delete sizes[kind];
    return { ...state, sizes };
}
