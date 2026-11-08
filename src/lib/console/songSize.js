// A song's size relative to its theme (Rodada P, P8-2 = B, owner 2026-10-22):
// the Editor de música no longer picks a size of its own — it moves the
// theme's size −2…+2 steps, and the song keeps the whole theme (box,
// position, spacing, weight…). The step lives in Song.font_size, the column
// songs always had, read as steps from G: an old song's preset is its step
// (P = −2, M = −1, G or none = 0, GG = +1, GGG = +2; PP, below the range,
// reads as −2), so no row is rewritten and a computer on an older KERYX
// still draws the same size over a G theme. Pure (tested in songSize.test.mjs).
import { SIZE_PRESETS, SIZE_RANGE, sizeCqw } from "../textSize.js";

export const STEP_RANGE = [-2, 2];
const LADDER = SIZE_PRESETS.map(([, , n]) => n); // 2.4 … 7 cqw
const G = SIZE_PRESETS.findIndex(([k]) => k === "large");
const clamp = (n, [lo, hi]) => Math.min(hi, Math.max(lo, n));

// The Seg's options: −2 −1 "Do tema" +1 +2.
export const STEP_OPTIONS = [[-2, "−2"], [-1, "−1"], [0, "Do tema"], [1, "+1"], [2, "+2"]].map(([n, l]) => [String(n), l]);

// The step a Song row asks for. A preset's key is its distance from G;
// anything else (empty, a number nobody wrote) is 0, the theme's size.
export function songStep(song) {
    const at = SIZE_PRESETS.findIndex(([k]) => k === song?.font_size);
    return at < 0 ? 0 : clamp(at - G, STEP_RANGE);
}

// What Song.font_size keeps for a step: the preset that many steps from G;
// "" for 0 (the theme's own size).
export const stepValue = (step) => {
    const n = clamp(Math.round(Number(step) || 0), STEP_RANGE);
    return n === 0 ? "" : SIZE_PRESETS[G + n][0];
};

// The ladder's position of a size in cqw, between its presets (4.3 is half
// way from M to G); past either end, one step is a factor of 1.2.
function rung(cqw) {
    if (cqw <= LADDER[0]) return Math.log(cqw / LADDER[0]) / Math.log(1.2);
    const last = LADDER.length - 1;
    if (cqw >= LADDER[last]) return last + Math.log(cqw / LADDER[last]) / Math.log(1.2);
    const i = LADDER.findIndex((n, j) => cqw >= n && cqw < LADDER[j + 1]);
    return i + (cqw - LADDER[i]) / (LADDER[i + 1] - LADDER[i]);
}
function atRung(r) {
    const last = LADDER.length - 1;
    if (r <= 0) return LADDER[0] * 1.2 ** r;
    if (r >= last) return LADDER[last] * 1.2 ** (r - last);
    const i = Math.floor(r);
    return LADDER[i] + (r - i) * (LADDER[i + 1] - LADDER[i]);
}

// A theme's size moved `step` steps along the presets' ladder, as the
// stored value: the theme's own value untouched at 0 ("large" stays
// "large"), else the number in cqw as a string ("5.8"), within SIZE_RANGE.
// A G theme moved −2 is P exactly (3), so an old song looks the same.
export function steppedSize(themeSize, step) {
    const n = clamp(Math.round(Number(step) || 0), STEP_RANGE);
    if (!n) return themeSize || "large";
    const cqw = clamp(Math.round(atRung(rung(sizeCqw(themeSize)) + n) * 10) / 10, SIZE_RANGE);
    return String(cqw);
}

// The editor's line beside the Seg: "5,8 %", the size the song goes out
// with over this theme.
export const stepCaption = (themeSize, step) => `${String(sizeCqw(steppedSize(themeSize, step))).replace(".", ",")} %`;
