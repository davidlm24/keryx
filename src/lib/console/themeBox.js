// The lyrics box of a theme, as the Editor de temas draws it: one rectangle
// on a 16:9 canvas (in % of the screen), inside the safe area (SAFE), mapped to the theme fields the
// renderer already understands — text_align (left/center/right),
// text_position (top/middle/bottom), text_max_width (40–100 %) and
// text_nudge (−20…20 % of the height). Dragging snaps to the 3×3 zones, a
// horizontal resize sets the width, and a vertical offset inside the zone is
// the nudge; "" always means the factory look (center / middle / full
// width / no nudge), so an untouched theme writes no field. Pure; tested in
// themeBox.test.mjs.

export const MIN_WIDTH = 40;
// The safe area the text fits in (owner 2026-10-29, F2 = A): .ks-content's
// padding in screen.css — 8cqw each side, 7cqw above and below on a 16:9
// screen (56.25cqw tall) — in % of the screen. The renderer's width is a %
// of this area, not of the screen, and the editor draws it the same way.
const SAFE_X = 8;
const SAFE_W = 84;
export const SAFE_Y = (7 / 56.25) * 100;
const SAFE_H = 100 - 2 * SAFE_Y;
export const SAFE = { x: SAFE_X, y: Math.round(SAFE_Y * 10) / 10, w: SAFE_W, h: Math.round(SAFE_H * 10) / 10 };
// One vertical third of the safe area: the box's height on the canvas. The
// slide itself fits the whole area (ScreenRenderer useFit shrinks it); the
// third is the editor's honest guide for "top / middle / bottom".
export const BOX_H = SAFE_H / 3;

const round1 = (n) => Math.round(n * 10) / 10;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

const ALIGNS = ["left", "center", "right"];
const POSITIONS = ["top", "middle", "bottom"];

// w: the box's width in % of the screen (the band's is the whole screen).
const xFor = (align, w, band) => (band ? 0 : align === "left" ? SAFE_X : align === "right" ? SAFE_X + SAFE_W - w : 50 - w / 2);
const yFor = (position) => (position === "top" ? SAFE_Y : position === "bottom" ? SAFE_Y + SAFE_H - BOX_H : 50 - BOX_H / 2);
const yMin = SAFE_Y, yMax = SAFE_Y + SAFE_H - BOX_H;

// The canvas rectangle a style's text fields describe. Unset fields are the
// factory look: a centred box, full width, in the middle third.
export function themeBoxRect(style = {}) {
    const band = style.text_box === "band"; // a band stretches edge to edge
    const pct = clamp(Number(style.text_max_width) || 100, MIN_WIDTH, 100);
    const w = band ? 100 : (pct * SAFE_W) / 100;
    const align = ALIGNS.includes(style.text_align) ? style.text_align : "center";
    const position = POSITIONS.includes(style.text_position) ? style.text_position : "middle";
    const nudge = clamp(Number(style.text_nudge) || 0, -20, 20);
    return {
        x: round1(xFor(align, w, band)),
        // The nudge never takes the box out of the safe area (as on screen).
        y: round1(clamp(yFor(position) + nudge, yMin, yMax)),
        w: round1(w),
        h: round1(BOX_H),
    };
}

// The fields a canvas rectangle writes back onto the theme. The box snaps to
// the nearest of the nine zones; what is left over vertically is the nudge.
// "" clears a field (the factory look), so moving the box back to the centre
// leaves the theme as if it was never moved.
export function rectToTheme(rect, { box = "" } = {}) {
    const band = box === "band";
    // The width in % of the safe area (what the renderer reads).
    const pct = band ? 100 : Math.round(clamp(((Number(rect.w) || SAFE_W) / SAFE_W) * 100, MIN_WIDTH, 100));
    const w = band ? 100 : (pct * SAFE_W) / 100;
    const x = band ? 0 : clamp(Number(rect.x) || 0, SAFE_X, SAFE_X + SAFE_W - w);
    const y = clamp(Number(rect.y) || 0, yMin, yMax);
    // Ties (a full-width box sits on every anchor) go to the factory look.
    const align = ["center", "left", "right"].map((a) => [a, Math.abs(x - xFor(a, w, band))]).sort((p, q) => p[1] - q[1])[0][0];
    const position = ["middle", "top", "bottom"].map((p) => [p, Math.abs(y - yFor(p))]).sort((p, q) => p[1] - q[1])[0][0];
    const nudge = clamp(Math.round(y - yFor(position)), -20, 20);
    return {
        text_align: align === "center" ? "" : align,
        text_position: position === "middle" ? "" : position,
        text_max_width: band || pct >= 100 ? "" : pct,
        text_nudge: nudge === 0 ? "" : nudge,
    };
}
