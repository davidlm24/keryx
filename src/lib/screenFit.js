// How a slide fits the screen, measured by the renderer (ScreenRenderer
// useFit). Kept apart from src/lib/console/lyricFit.js (the editors'
// estimates) so an output window loads only these. Pure; tested in
// src/lib/console/lyricFit.test.mjs.

// How much a slide's font shrinks so its longest line stays one line on
// screen (ScreenRenderer measures; one line of the lyrics is one line on
// the screens, owner 2026-10-14): 1 when it fits, never below `min`.
export function fitScale(boxWidth, textWidth, min = 0.55) {
    if (!(boxWidth > 0) || !(textWidth > 0) || textWidth <= boxWidth) return 1;
    return Math.max(min, Math.floor((boxWidth / textWidth) * 1000) / 1000);
}

// Every slide fits the screen whole (owner 2026-10-29, F1 = A): the largest
// factor in [min, 1] at which fits(f) holds, f the font's share. Measured,
// by halves: a smaller font also rewraps, so the height is not linear in it.
// The width keeps its own floor (fitScale); the height has none but this.
export const HEIGHT_MIN = 0.15;
// How far a song's line may shrink to stay one line before it wraps (the
// projection's useFit and the Palco's lyrics, useBoxFit `oneLine`).
export const LINE_MIN = 0.45;

// Whether a text box holds its content (useBoxFit). A font's glyphs stand
// past a 1.2 line box by a few % of its size (Geist: ~4 %), which the box
// counts as overflow even with room to spare; on a 1080p Palco that was more
// than the old 1 px and the fit shrank every size to the same few px (owner
// 2026-11-12: the size chosen in the Editor never reached the screen). So
// the height allows a fifth of the font; text that really does not fit
// overflows by a whole line. The width keeps 1 px (no line wraps there).
export function boxHolds({ scrollH, clientH, scrollW, clientW, fontPx }) {
    const slack = Math.max(1, (Number(fontPx) || 0) * 0.2);
    return scrollH <= clientH + slack && scrollW <= clientW + 1;
}
export function fitSearch(fits, min = HEIGHT_MIN, steps = 8) {
    if (fits(1)) return 1;
    let lo = min, hi = 1;
    for (let i = 0; i < steps; i += 1) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid; else hi = mid;
    }
    return Math.floor(lo * 1000) / 1000;
}

// The theme's fine nudge never takes the text out of the safe area (F2 = A):
// top/bottom of the text without the nudge, the area's, in px.
export function clampShift(shift, top, bottom, areaTop, areaBottom) {
    const up = Math.min(0, areaTop - top), down = Math.max(0, areaBottom - bottom);
    return Math.max(up, Math.min(down, Number(shift) || 0));
}
