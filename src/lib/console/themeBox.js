// The lyrics box of a theme, as the Editor de temas draws it: one rectangle
// on a 16:9 canvas (in % of the screen), inside the safe area (safeArea), mapped to the theme fields the
// renderer already understands — text_align (left/center/right),
// text_position (top/middle/bottom), text_max_width (40–100 %) and
// text_nudge (−20…20 % of the height). Dragging snaps to the 3×3 zones, a
// horizontal resize sets the width, and a vertical offset inside the zone is
// the nudge; "" always means the factory look (center / middle / full
// width / no nudge), so an untouched theme writes no field. Pure; tested in
// themeBox.test.mjs.

export const MIN_WIDTH = 40;
// The safe area the text fits in (owner 2026-10-29, F2 = A): .ks-content's
// padding in screen.css — the theme's Margem (owner 2026-10-30, M = A;
// `text_margin`, cqw of the screen's width, "" = 8) each side, 7/8 of it
// above and below on a 16:9 screen (56.25cqw tall) — in % of the screen.
// The renderer's width is a % of this area, not of the screen, and the
// editor draws it the same way.
export const MARGIN_DEFAULT = 8;
export const MARGIN_MAX = 20;
// The Margem's quick choices (Sem, P, M, G) in cqw.
export const MARGIN_PRESETS = [["0", "Sem"], ["4", "P"], ["8", "M"], ["12", "G"]];
const SCREEN_H = 56.25;
const round1 = (n) => Math.round(n * 10) / 10;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// A theme's Margem as a number: "" or nothing = the factory 8.
export function marginOf(style = {}) {
    const v = style.text_margin;
    if (v === "" || v == null) return MARGIN_DEFAULT;
    const n = Number(v);
    return Number.isFinite(n) ? clamp(n, 0, MARGIN_MAX) : MARGIN_DEFAULT;
}

// The safe area of a Margem, in % of the screen: { x, y, w, h }.
export function safeArea(margin = MARGIN_DEFAULT) {
    const m = clamp(Number(margin) || 0, 0, MARGIN_MAX);
    const y = ((m * 7) / 8 / SCREEN_H) * 100;
    return { x: m, y, w: 100 - 2 * m, h: 100 - 2 * y };
}
const shown = (s) => ({ x: round1(s.x), y: round1(s.y), w: round1(s.w), h: round1(s.h) });
// The factory's area, rounded (the editor's default drawing; tests).
export const SAFE = shown(safeArea());
export const SAFE_Y = safeArea().y;
// One vertical third of the factory safe area: the box's height on the
// canvas. The slide itself fits the whole area (ScreenRenderer useFit
// shrinks it); the third is the editor's honest guide for "top / middle / bottom".
export const BOX_H = safeArea().h / 3;

const ALIGNS = ["left", "center", "right"];
const POSITIONS = ["top", "middle", "bottom"];

function geometry(margin) {
    const a = safeArea(margin);
    const boxH = a.h / 3;
    // w: the box's width in % of the screen (the band's is the whole screen).
    const xFor = (align, w, band) => (band ? 0 : align === "left" ? a.x : align === "right" ? a.x + a.w - w : 50 - w / 2);
    const yFor = (position) => (position === "top" ? a.y : position === "bottom" ? a.y + a.h - boxH : 50 - boxH / 2);
    return { a, boxH, xFor, yFor, yMin: a.y, yMax: a.y + a.h - boxH };
}

// The canvas rectangle a style's text fields describe. Unset fields are the
// factory look: a centred box, full width, in the middle third.
export function themeBoxRect(style = {}) {
    const g = geometry(marginOf(style));
    const band = style.text_box === "band"; // a band stretches edge to edge
    const pct = clamp(Number(style.text_max_width) || 100, MIN_WIDTH, 100);
    const w = band ? 100 : (pct * g.a.w) / 100;
    const align = ALIGNS.includes(style.text_align) ? style.text_align : "center";
    const position = POSITIONS.includes(style.text_position) ? style.text_position : "middle";
    const nudge = clamp(Number(style.text_nudge) || 0, -20, 20);
    return {
        x: round1(g.xFor(align, w, band)),
        // The nudge never takes the box out of the safe area (as on screen).
        y: round1(clamp(g.yFor(position) + nudge, g.yMin, g.yMax)),
        w: round1(w),
        h: round1(g.boxH),
    };
}

// The fields a canvas rectangle writes back onto the theme. The box snaps to
// the nearest of the nine zones; what is left over vertically is the nudge.
// "" clears a field (the factory look), so moving the box back to the centre
// leaves the theme as if it was never moved. margin: the theme's Margem.
export function rectToTheme(rect, { box = "", margin = MARGIN_DEFAULT } = {}) {
    const g = geometry(margin);
    const band = box === "band";
    // The width in % of the safe area (what the renderer reads).
    const pct = band ? 100 : Math.round(clamp(((Number(rect.w) || g.a.w) / g.a.w) * 100, MIN_WIDTH, 100));
    const w = band ? 100 : (pct * g.a.w) / 100;
    const x = band ? 0 : clamp(Number(rect.x) || 0, g.a.x, g.a.x + g.a.w - w);
    const y = clamp(Number(rect.y) || 0, g.yMin, g.yMax);
    // Ties (a full-width box sits on every anchor) go to the factory look.
    const align = ["center", "left", "right"].map((a) => [a, Math.abs(x - g.xFor(a, w, band))]).sort((p, q) => p[1] - q[1])[0][0];
    const position = ["middle", "top", "bottom"].map((p) => [p, Math.abs(y - g.yFor(p))]).sort((p, q) => p[1] - q[1])[0][0];
    const nudge = clamp(Math.round(y - g.yFor(position)), -20, 20);
    return {
        text_align: align === "center" ? "" : align,
        text_position: position === "middle" ? "" : position,
        text_max_width: band || pct >= 100 ? "" : pct,
        text_nudge: nudge === 0 ? "" : nudge,
    };
}

// The Margem a drag of the safe area's edge leaves (the editor's handles):
// the distance from the screen's left edge to the pointer, in cqw, whole
// numbers, 0…MARGIN_MAX; "" when it lands on the factory 8.
export function marginFromEdge(xPct) {
    const m = Math.round(clamp(Math.min(Number(xPct) || 0, 100 - (Number(xPct) || 0)), 0, MARGIN_MAX));
    return m === MARGIN_DEFAULT ? "" : m;
}
