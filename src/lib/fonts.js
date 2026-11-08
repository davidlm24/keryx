// The church's fonts (Rodada HF1, owner 2026-10-19): a theme's font can be
// one of the KERYX keys (FONT_MAP in deviceStyles.js: "sans" = the bundled
// Geist, the others the device's own fonts) or the FAMILY NAME of a font
// the church brought in — from the PC's installed fonts (Local Font Access,
// the "Fontes do computador" dialog) or from a font file. Either way the
// file is COPIED into the media library as a Media row of category "font"
// (one row per face: Regular, Bold, Italic, Bold Italic), so it syncs
// between the church's computers and the local server serves it to every
// output window and network screen; every window declares them with one
// @font-face per row (useFonts.js, <FontFaces/> in App.jsx). KERYX never
// downloads a font from the internet. Pure, so node --test checks it.
import { FONT_MAP } from "./deviceStyles.js";

// A font file bigger than this is refused before it is copied (a whole CJK
// family can pass 20 MB; a lyrics font never does).
export const MAX_FONT_BYTES = 20 * 1024 * 1024;
export const FONT_CATEGORY = "font";
export const FONT_EXTENSIONS = [".ttf", ".otf", ".woff2", ".woff"];
export const FONT_ACCEPT = FONT_EXTENSIONS.join(",");
// The faces the dialog copies from a PC family, in this order, at most four:
// the four a theme can draw (normal/bold × normal/italic). Other faces
// (Light, Black, Condensed…) stay on the PC.
export const WANTED_FACES = ["Regular", "Bold", "Italic", "Bold Italic"];

export const isFontMedia = (m) => m?.category === FONT_CATEGORY || m?.type === FONT_CATEGORY;

// The family name as CSS wants it: quoted, with quotes and backslashes
// escaped, so "Ana's \"Font\"" is one family.
export const cssFamily = (family) => `"${String(family).replace(/[\\"]/g, "\\$&")}"`;

// The CSS font-family for a theme's font_family: a KERYX key gives its
// stack; anything else is a church font's family name, quoted, with the
// Geist stack behind it so a screen whose copy has not arrived (Baixando…)
// draws Geist, never the browser's default serif.
export function fontStack(family, map = FONT_MAP) {
    const key = String(family || "").trim();
    if (!key) return map.sans;
    if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
    return `${cssFamily(key)}, ${map.sans}`;
}

// A KERYX key (one of FONT_MAP's), as opposed to a church font's family.
export const isFontKey = (family, map = FONT_MAP) => Object.prototype.hasOwnProperty.call(map, String(family || ""));

// The format() a @font-face src names, by the file's extension.
const FORMAT = { ".ttf": "truetype", ".otf": "opentype", ".woff2": "woff2", ".woff": "woff" };
export const fontFormat = (url) => FORMAT[String(url || "").toLowerCase().match(/\.[a-z0-9]+$/)?.[0]] || "";

// A face's weight for CSS: "400", "700" or a variable font's range "100 900".
const cleanWeight = (w) => {
    const s = String(w ?? "").trim();
    if (/^[1-9]00$/.test(s)) return s;
    if (/^[1-9]00 [1-9]00$/.test(s)) return s;
    return "400";
};

// One @font-face per Media font row, for every window: the family quoted,
// the weight and style of the face, `font-display: block` (a projected line
// never re-wraps when the font arrives: the file is local, so the wait is
// not noticeable, as src/fonts.css does for Geist). Rows without a family or
// a file are skipped; the url is the row's as the window sees it (http on
// the desktop and the network, so the caller passes rows from the adapter).
export function fontFaceCss(rows = []) {
    const out = [];
    for (const m of rows) {
        if (!isFontMedia(m)) continue;
        const family = m.font?.family || m.title;
        const url = m.file_url;
        if (!family || !url) continue;
        const format = fontFormat(url);
        const src = `url(${JSON.stringify(url)})${format ? ` format("${format}")` : ""}`;
        out.push(`@font-face{font-family:${cssFamily(family)};src:${src};font-weight:${cleanWeight(m.font?.weight)};font-style:${m.font?.style === "italic" ? "italic" : "normal"};font-display:block}`);
    }
    return out.join("\n");
}

// What a font file is, by its first bytes (never by its name: the PC's API
// hands a blob with no name): ttf, otf, woff, woff2, or "collection" (.ttc,
// several fonts in one file, which @font-face cannot address). "" = not a
// font.
export function fontKind(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    if (b.length < 4) return "";
    const tag = String.fromCharCode(b[0], b[1], b[2], b[3]);
    if (tag === "wOF2") return "woff2";
    if (tag === "wOFF") return "woff";
    if (tag === "OTTO") return "otf";
    if (tag === "ttcf") return "collection";
    if (tag === "true" || (b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0)) return "ttf";
    return "";
}
export const KIND_EXTENSION = { ttf: ".ttf", otf: ".otf", woff: ".woff", woff2: ".woff2" };

// A face's weight and style from the name the PC gives it ("Bold Italic",
// "SemiBold", "Light Italic", "Regular", "Book"): what @font-face needs.
const WEIGHTS = [
    [/\b(thin|hairline)\b/i, "100"], [/\b(extra ?light|ultra ?light)\b/i, "200"], [/\blight\b/i, "300"],
    [/\b(medium)\b/i, "500"], [/\b(semi ?bold|demi ?bold)\b/i, "600"], [/\b(extra ?bold|ultra ?bold)\b/i, "800"],
    [/\b(black|heavy)\b/i, "900"], [/\bbold\b/i, "700"],
];
export function weightOfStyle(style) {
    const s = String(style || "");
    let weight = "400";
    for (const [re, w] of WEIGHTS) if (re.test(s)) { weight = w; break; }
    return { weight, style: /\b(italic|oblique)\b/i.test(s) ? "italic" : "normal" };
}

// Whether a PC face is one of the four a theme draws: Regular (or Book /
// Normal / Roman), Bold, Italic, Bold Italic — exactly, so "Semibold" and
// "Light Italic" are not taken for them.
export function wantedFace(style) {
    const s = String(style || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (["regular", "normal", "book", "roman", "plain", ""].includes(s)) return "Regular";
    if (s === "bold") return "Bold";
    if (["italic", "oblique", "regular italic"].includes(s)) return "Italic";
    if (["bold italic", "bold oblique"].includes(s)) return "Bold Italic";
    return "";
}

// A family's rows among the Media rows (every face), by the name as the
// theme writes it (case and spaces exact: the PC's name is the family's).
export const findFontRows = (rows = [], family) => rows.filter((m) => isFontMedia(m) && (m.font?.family || m.title) === family);
// The row of one face (weight + style) of a family, when it was copied already.
export const findFontRow = (rows = [], family, { weight = "400", style = "normal" } = {}) =>
    findFontRows(rows, family).find((m) => cleanWeight(m.font?.weight) === cleanWeight(weight) && (m.font?.style === "italic" ? "italic" : "normal") === style) || null;

// The church's families, each with its faces, from the Media rows: what the
// picker's "Da igreja" group and Temas e fundos › Fontes da igreja list.
// Sorted by name; a face's label is its PC name or "peso 600 itálica".
export function fontFamilies(rows = []) {
    const map = new Map();
    for (const m of rows) {
        if (!isFontMedia(m)) continue;
        const family = m.font?.family || m.title;
        if (!family) continue;
        if (!map.has(family)) map.set(family, { family, rows: [], faces: [], bytes: 0, missing: false, syncing: false });
        const f = map.get(family);
        f.rows.push(m);
        const { weight, style } = { weight: cleanWeight(m.font?.weight), style: m.font?.style === "italic" ? "italic" : "normal" };
        f.faces.push(m.font?.face || `${weight === "400" ? "" : `peso ${weight} `}${style === "italic" ? "itálica" : "normal"}`.trim());
        f.bytes += Number(m.size) || 0;
        if (m.missing) f.missing = true;
        if (m.syncing) f.syncing = true;
    }
    return [...map.values()].sort((a, b) => a.family.localeCompare(b.family, "pt-BR"));
}

// A family name from a font file's name: "Montserrat-BoldItalic.ttf" →
// "Montserrat", the style words stripped; the operator can still change it.
export function familyFromFileName(name) {
    let s = String(name || "").replace(/\.[a-z0-9]+$/i, "");
    s = s.replace(/[-_]?(thin|extralight|ultralight|light|regular|book|medium|semibold|demibold|bold|extrabold|ultrabold|black|heavy|italic|oblique|normal|roman|variable|vf)+$/i, "");
    s = s.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
    return s || "Fonte";
}
// The face's weight and style from a file's name, the same words.
export const faceFromFileName = (name) => weightOfStyle(String(name || "").replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").replace(/(?<=[a-z])(?=[A-Z])/g, " "));

// The themes that name a church font's family (Temas e fundos refuses to
// delete a family while one does, listing them).
export const themesUsingFont = (themes = [], family) => themes.filter((t) => t?.font_family === family);

// "Esta fonte vem num arquivo de coleção…": the refusal for a .ttc.
export const COLLECTION_HINT = "Esta fonte vem num arquivo de coleção (.ttc) que as telas não leem; escolha outra ou um arquivo .ttf/.otf.";
export const TOO_BIG_HINT = "Arquivo de fonte grande demais (mais de 20 MB).";
export const NOT_A_FONT_HINT = "Este arquivo não é uma fonte (.ttf, .otf, .woff2 ou .woff).";
export const FONTS_IN_EDITOR_HINT = "Fontes entram pelo Editor de temas › Fonte › Arquivo de fonte…";
