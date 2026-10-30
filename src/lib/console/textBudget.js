// How much text fits one slide with a theme (owner 2026-10-29, mockup "O
// texto sempre cabe na tela", F3/F4 = A): the Bíblia's "Auto" and a theme's
// "Quando não cabe › Dividir em mais slides" cut by it, so the screens'
// shrink-to-fit (ScreenRenderer useFit) is the rare case, not the rule.
// An estimate, in characters, from the screen's own geometry
// (src/components/screen/screen.css): the safe area is .ks-content's
// padding — the theme's Margem each side (8cqw by default: 84 % of the width,
// themeBox.js marginOf), 7/8 of it above and below — and a
// passage's reference line takes ~5cqw of it. Pure: the font's width per
// character comes in (fontMetrics.js styleMetrics, measured with the
// theme's capitals). The screens' own measure stays the truth.
import { sizeCqw, lineHeightOf } from "../textSize.js";
import { EM_PER_CHAR } from "./lyricFit.js";
import { marginOf } from "./themeBox.js";

const SCREEN_H = 56.25; // a 16:9 screen's height, in cqw
const REF_H = 5;
// Lines never fill to the last character (words wrap whole).
const FILL = 0.85;
const MIN_CHARS = 40;

// style: the theme's (themeStyle: font_size, line_height, text_max_width,
// text_box…); metrics: { em, spacing } (styleMetrics); kind: "bible" (its
// text is 0.8 of the size, 1.3 line height, and a reference line) or
// "text"; pair: a second edition on screen, "side" | "stack" (each edition
// gets this many characters).
export function textBudget(style = {}, { em = EM_PER_CHAR, spacing = 0 } = {}, { kind = "bible", pair = null } = {}) {
    const bible = kind === "bible";
    const font = sizeCqw(style.font_size) * (bible ? 0.8 : 1);
    const lh = style.line_height ? lineHeightOf(style.line_height) : bible ? 1.3 : 1.22;
    const per = Math.max(0.2, (Number(em) || EM_PER_CHAR) + (Number(spacing) || 0));
    const margin = marginOf(style);
    const SAFE_W = 100 - 2 * margin;
    const SAFE_H = SCREEN_H - (margin * 7) / 4;
    const pct = Number(style.text_max_width) > 0 ? Math.min(100, Number(style.text_max_width)) : 100;
    let width = style.text_box === "band" ? SAFE_W : (SAFE_W * pct) / 100 - (style.text_box === "block" ? 4.8 : 0);
    let height = SAFE_H - (bible ? REF_H : 0) - (style.text_box === "block" || style.text_box === "band" ? 2.8 : 0);
    let chars;
    if (pair === "side") {
        // Two columns 3cqw apart, each at 0.7 of the size.
        const f = font * 0.7, w = (width - 3) / 2;
        chars = (w / (f * per)) * (height / (f * lh));
    } else if (pair === "stack") {
        // The first edition at the size, the second under it at 0.7.
        height -= 2;
        const perChar = (font * lh * font * per) / width + (font * 0.7 * lh * font * 0.7 * per) / width;
        chars = height / perChar;
    } else {
        chars = (width / (font * per)) * (height / (font * lh));
    }
    return Math.max(MIN_CHARS, Math.floor(chars * FILL));
}

// A text longer than `limit` characters, cut into pieces that each fit:
// at the end of a sentence where one fits, else between words; a piece
// never ends mid-word. Verse marks stay where they are in the text.
export function chunkText(text, limit) {
    const s = String(text || "").trim();
    if (!s || !(limit > 0) || s.length <= limit) return s ? [s] : [];
    const sentences = s.split(/(?<=[.!?;:]["”’»)]*)\s+/);
    const pieces = [];
    let cur = "";
    const push = () => { if (cur) pieces.push(cur); cur = ""; };
    const add = (part) => {
        if (!cur) cur = part;
        else if (cur.length + 1 + part.length <= limit) cur = `${cur} ${part}`;
        else { push(); cur = part; }
    };
    for (const sentence of sentences) {
        if (sentence.length <= limit) { add(sentence); continue; }
        // A sentence longer than a slide: by words.
        for (const word of sentence.split(/\s+/)) add(word);
    }
    push();
    return pieces;
}
