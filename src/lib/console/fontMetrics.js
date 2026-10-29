// How wide a font's letters are on average (Rodada HF2), for the editors'
// estimate of where a line wraps (lyricFit.js lineLimit: the song editor's
// "fonte menor" badges). lineLimit assumes Geist's 0.55 em per character;
// a church font, a serif or bold letters differ. Measured once per family
// and weight on a canvas at 100 px, on a sample line of Portuguese lyrics;
// the 0.55 fallback stands while the font has not loaded (or outside a
// browser) and is not cached, so the next call measures again. The screens
// never use this: their hidden probe (ScreenRenderer useFitWidth) measures
// the real line.
import { fontStack } from "../fonts.js";
import { EM_PER_CHAR } from "./lyricFit.js";

const SAMPLE = "Grande é o Senhor e mui digno de louvor, na cidade do nosso Deus";
const cache = new Map();
let ctx = null;

const loaded = (font) => {
    try { return typeof document === "undefined" || !document.fonts?.check || document.fonts.check(font, SAMPLE); } catch { return true; }
};

// family: a theme's font_family (a KERYX key or a church family);
// weight: 400, 600 (the screens' default) or 700; upper: the theme's
// MAIÚSCULAS (text_case "upper"), capitals measured as such (wider).
export function emPerChar(family, weight = 600, upper = false) {
    const key = `${family || "sans"}|${weight}${upper ? "|upper" : ""}`;
    const sample = upper ? SAMPLE.toUpperCase() : SAMPLE;
    if (cache.has(key)) return cache.get(key);
    if (typeof document === "undefined") return EM_PER_CHAR;
    const font = `${weight} 100px ${fontStack(family)}`;
    if (!loaded(font)) return EM_PER_CHAR;
    try {
        ctx = ctx || document.createElement("canvas").getContext("2d");
        if (!ctx) return EM_PER_CHAR;
        ctx.font = font;
        const em = ctx.measureText(sample).width / 100 / [...sample].length;
        if (!(em > 0.2 && em < 1.5)) return EM_PER_CHAR;
        const value = Math.round(em * 1000) / 1000;
        cache.set(key, value);
        return value;
    } catch {
        return EM_PER_CHAR;
    }
}
// No canvas (tests, a font not loaded): capitals are about a quarter wider.
const UPPER = 1.22;

// lineLimit's metrics for a text style (font_family, font_weight,
// letter_spacing): what a slide's look needs to estimate its wraps.
export function styleMetrics(style = {}) {
    const weight = style.font_weight === "bold" ? 700 : style.font_weight === "normal" ? 400 : 600;
    const upper = style.text_case === "upper";
    const em = emPerChar(style.font_family, weight, upper);
    return { em: upper && em === EM_PER_CHAR ? EM_PER_CHAR * UPPER : em, spacing: Number(style.letter_spacing) || 0 };
}
