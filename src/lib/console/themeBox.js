// The lyrics box of a theme, as the Editor de temas draws it: one rectangle
// on a 16:9 canvas (in % of the screen), mapped to the theme fields the
// renderer already understands — text_align (left/center/right),
// text_position (top/middle/bottom), text_max_width (40–100 %) and
// text_nudge (−20…20 % of the height). Dragging snaps to the 3×3 zones, a
// horizontal resize sets the width, and a vertical offset inside the zone is
// the nudge; "" always means the factory look (center / middle / full
// width / no nudge), so an untouched theme writes no field. Pure; tested in
// themeBox.test.mjs.

export const MIN_WIDTH = 40;
// One vertical third of the screen: the box's height on the canvas. The real
// text box is the whole screen (ScreenRenderer centres the lines in it); the
// third is the editor's honest guide for "top / middle / bottom".
export const BOX_H = 100 / 3;

const round1 = (n) => Math.round(n * 10) / 10;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

const ALIGNS = ["left", "center", "right"];
const POSITIONS = ["top", "middle", "bottom"];

const xFor = (align, w) => (align === "left" ? 0 : align === "right" ? 100 - w : (100 - w) / 2);
const yFor = (position) => (position === "top" ? 0 : position === "bottom" ? 100 - BOX_H : (100 - BOX_H) / 2);

// The canvas rectangle a style's text fields describe. Unset fields are the
// factory look: a centred box, full width, in the middle third.
export function themeBoxRect(style = {}) {
    const band = style.text_box === "band"; // a band stretches edge to edge
    const w = band ? 100 : clamp(Number(style.text_max_width) || 100, MIN_WIDTH, 100);
    const align = ALIGNS.includes(style.text_align) ? style.text_align : "center";
    const position = POSITIONS.includes(style.text_position) ? style.text_position : "middle";
    const nudge = clamp(Number(style.text_nudge) || 0, -20, 20);
    return {
        x: round1(xFor(align, w)),
        y: round1(clamp(yFor(position) + nudge, 0, 100 - BOX_H)),
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
    const w = band ? 100 : round1(clamp(Number(rect.w) || 100, MIN_WIDTH, 100));
    const x = clamp(Number(rect.x) || 0, 0, 100 - w);
    const y = clamp(Number(rect.y) || 0, 0, 100 - BOX_H);
    // Ties (a full-width box sits on every anchor) go to the factory look.
    const align = ["center", "left", "right"].map((a) => [a, Math.abs(x - xFor(a, w))]).sort((p, q) => p[1] - q[1])[0][0];
    const position = ["middle", "top", "bottom"].map((p) => [p, Math.abs(y - yFor(p))]).sort((p, q) => p[1] - q[1])[0][0];
    const nudge = clamp(Math.round(y - yFor(position)), -20, 20);
    return {
        text_align: align === "center" ? "" : align,
        text_position: position === "middle" ? "" : position,
        text_max_width: band || w >= 100 ? "" : w,
        text_nudge: nudge === 0 ? "" : nudge,
    };
}
