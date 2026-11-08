// The size of the text on the screens (Rodada HF2, owner's pick
// "numero_atalhos": "tamanho da fonte customizável, não predefinidos").
// A size is a number in cqw, % of the screen's width, 1 to 12, one decimal;
// the old six names (PP…GGG) are shortcuts that write their number. Themes
// store the number as a string ("4.8": the column stays text); songs, avisos
// and old themes keep their names, which read as their number forever (no
// migration). Shared by the renderer, the editors and lyricFit. Pure.

// The presets, smallest first: [key, label, cqw].
export const SIZE_PRESETS = [["xsmall", "PP", 2.4], ["small", "P", 3], ["medium", "M", 3.8], ["large", "G", 4.8], ["xlarge", "GG", 5.8], ["xxlarge", "GGG", 7]];
export const SIZE_CQW = Object.fromEntries(SIZE_PRESETS.map(([k, , n]) => [k, n]));
export const SIZE_RANGE = [1, 12];
export const DEFAULT_SIZE = SIZE_CQW.large;

const round1 = (n) => Math.round(n * 10) / 10;
const clamp = (n, [min, max]) => Math.min(max, Math.max(min, n));
const toNumber = (v) => {
    if (typeof v === "number") return v;
    if (typeof v !== "string" || !v.trim()) return NaN;
    return Number(v.trim().replace(",", "."));
};

// The size in cqw of a stored value: a number, a numeric string ("4.8",
// "4,8"), a preset's key ("large"); anything else (empty, unknown) is the
// fallback. Clamped to SIZE_RANGE, rounded to 0.1.
export function sizeCqw(v, fallback = DEFAULT_SIZE) {
    if (typeof v === "string" && Object.hasOwn(SIZE_CQW, v)) return SIZE_CQW[v];
    const n = toNumber(v);
    return Number.isFinite(n) ? round1(clamp(n, SIZE_RANGE)) : fallback;
}

// What a theme stores for a size: the number as a string.
export const sizeValue = (v) => String(sizeCqw(v));

// The preset a value equals ("" when none), for the shortcuts' pressed state.
export const sizePreset = (v) => SIZE_PRESETS.find(([, , n]) => n === sizeCqw(v))?.[0] || "";

// A caption: "G" for a preset's number, "4,5 %" otherwise.
export function sizeLabel(v) {
    const n = sizeCqw(v);
    const preset = SIZE_PRESETS.find(([, , p]) => p === n);
    return preset ? preset[1] : `${String(n).replace(".", ",")} %`;
}

// Whether two stored sizes draw the same ("large" and "4.8" do).
export const sameSize = (a, b) => sizeCqw(a) === sizeCqw(b);

// Line spacing: the old three names, or a number 0.9 to 2. "" (and anything
// unknown) is the normal spacing, 1.22, which the renderer leaves to its CSS.
export const LINE_HEIGHTS = { tight: 1.08, normal: 1.22, loose: 1.45 };
export const LINE_HEIGHT_RANGE = [0.9, 2];
export function lineHeightOf(v) {
    if (typeof v === "string" && Object.hasOwn(LINE_HEIGHTS, v)) return LINE_HEIGHTS[v];
    const n = toNumber(v);
    return Number.isFinite(n) ? Math.round(clamp(n, LINE_HEIGHT_RANGE) * 100) / 100 : LINE_HEIGHTS.normal;
}

// Letter spacing in em and the outline's width in px of a 1920-wide screen
// (as background_blur): the ranges the theme and the live state accept.
export const LETTER_SPACING_RANGE = [-0.1, 0.5];
export const OUTLINE_RANGE = [0, 8];
