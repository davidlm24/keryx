// The Tela ociosa's look (owner 2026-10-19): what every screen shows with
// nothing on air and no papel de parede, when the idle mode is "logo". One
// object in the live state (`idleLook`, op `idle.look`), saved on the church's
// profile (`User.idle_look`) and edited in the Editor de telas › Tela ociosa.
// null is the look the screens always had: the KERYX gradient and the logo at
// its usual size, so nothing changes until someone edits it.
//   bg      "gradient" | "color" | "media" (Rodada Q6, owner 2026-10-23: a
//           picture or a clip of the background library, the logo over it)
//   media   { kind: "image" | "video", value: url, name } | null: the file of
//           "media" (kept while another fundo is chosen, so it comes back)
//   dim     0–0.7, how dark the file is drawn (S3 = B: the logo stands out)
//   c1, c2  the gradient's two colours (#rrggbb); dir "radial" | "down" | "diag"
//   color   the plain colour (#rrggbb)
//   logo    "none" | "s" | "m" | "l"
//   phrase  "none" | "church" | "own"; text: the words drawn under the logo
//           (the church's name is written in by the console, so every screen
//           draws the same string without reading the profile)
// Pure, no imports: the live state, the renderer and the settings share it.

export const IDLE_BGS = ["gradient", "color", "media"];
export const IDLE_MEDIA_KINDS = ["image", "video"];
export const IDLE_DIM_MAX = 0.7;
const MAX_URL = 4096; // as the live state's media urls
const NAME_MAX = 80;
export const IDLE_DIRS = ["radial", "down", "diag"];
export const IDLE_LOGOS = ["none", "s", "m", "l"];
export const IDLE_PHRASES = ["none", "church", "own"];
export const IDLE_TEXT_MAX = 60;

// Today's gradient (screen.css .ks-bg-default) in two colours.
export const IDLE_LOOK_DEFAULT = Object.freeze({ bg: "gradient", c1: "#26304f", c2: "#06070c", dir: "radial", color: "#101a2e", logo: "m", phrase: "none", text: "", media: null, dim: 0 });

const HEX = /^#[0-9a-f]{6}$/i;
const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);
const hex = (v, fallback) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : fallback);
const mediaOf = (v) => (v && typeof v === "object" && IDLE_MEDIA_KINDS.includes(v.kind) && typeof v.value === "string" && v.value && v.value.length <= MAX_URL
    ? { kind: v.kind, value: v.value, name: typeof v.name === "string" ? v.name.trim().slice(0, NAME_MAX) : "" }
    : null);
const dimOf = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(Math.min(IDLE_DIM_MAX, Math.max(0, v)) * 100) / 100 : 0);
const words = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, IDLE_TEXT_MAX) : "");

// Any value as a full look (unknown or broken fields take the default's); null
// when there is nothing to read. A phrase keeps its choice even while it has
// no words yet (a church with no name): the screens then draw none.
export function idleLookOf(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const d = IDLE_LOOK_DEFAULT;
    const text = words(raw.text);
    const phrase = pick(raw.phrase, IDLE_PHRASES, d.phrase);
    const media = mediaOf(raw.media);
    // "Da biblioteca" with no file draws the default fundo.
    const bg = raw.bg === "media" && !media ? d.bg : pick(raw.bg, IDLE_BGS, d.bg);
    return {
        bg,
        c1: hex(raw.c1, d.c1),
        c2: hex(raw.c2, d.c2),
        dir: pick(raw.dir, IDLE_DIRS, d.dir),
        color: hex(raw.color, d.color),
        logo: pick(raw.logo, IDLE_LOGOS, d.logo),
        phrase,
        text: phrase === "none" ? "" : text,
        media,
        dim: dimOf(raw.dim),
    };
}

// The same look as the screens always had (so a stored value can stay null).
// The file and its dim count only while the fundo is "media", which already
// differs from the default.
const DRAWN_KEYS = Object.keys(IDLE_LOOK_DEFAULT).filter((k) => k !== "media" && k !== "dim");
export const isDefaultIdleLook = (look) => {
    const l = idleLookOf(look);
    return !l || DRAWN_KEYS.every((k) => l[k] === IDLE_LOOK_DEFAULT[k]);
};

// Strict reading for the live op: every field given must be valid (a sender
// with a typo hears about it), and the result is the full look, or null for
// the default one. -> { look } | { error }.
export function checkIdleLook(raw) {
    if (raw === null || raw === undefined) return { look: null };
    if (typeof raw !== "object" || Array.isArray(raw)) return { error: "Tela ociosa: visual inválido." };
    const bad = (k, ok) => raw[k] !== undefined && !ok(raw[k]);
    if (bad("bg", (v) => IDLE_BGS.includes(v))) return { error: "Tela ociosa: fundo inválido." };
    if (bad("dir", (v) => IDLE_DIRS.includes(v))) return { error: "Tela ociosa: direção inválida." };
    if (["c1", "c2", "color"].some((k) => bad(k, (v) => typeof v === "string" && HEX.test(v)))) return { error: "Tela ociosa: cor inválida." };
    if (bad("logo", (v) => IDLE_LOGOS.includes(v))) return { error: "Tela ociosa: tamanho do logo inválido." };
    if (bad("phrase", (v) => IDLE_PHRASES.includes(v))) return { error: "Tela ociosa: frase inválida." };
    if (bad("text", (v) => typeof v === "string" && v.length <= 200)) return { error: "Tela ociosa: frase longa demais." };
    if (raw.media != null && (!mediaOf(raw.media) || (raw.media.name !== undefined && (typeof raw.media.name !== "string" || raw.media.name.length > 200)))) return { error: "Tela ociosa: arquivo do fundo inválido." };
    if (bad("dim", (v) => typeof v === "number" && v >= 0 && v <= IDLE_DIM_MAX)) return { error: "Tela ociosa: escurecer inválido." };
    if (raw.bg === "media" && raw.media == null) return { error: "Tela ociosa: falta o arquivo do fundo." };
    const look = idleLookOf(raw);
    return { look: isDefaultIdleLook(look) ? null : look };
}

// The CSS background of a look; null for the default gradient (the renderer
// keeps its own .ks-bg-default, so the default stays exactly as it was) and
// for a file of the library (the renderer draws it: idleMedia).
export function idleBackground(look) {
    const l = idleLookOf(look);
    if (!l || l.bg === "media") return null;
    if (l.bg === "color") return l.color;
    const d = IDLE_LOOK_DEFAULT;
    if (l.c1 === d.c1 && l.c2 === d.c2 && l.dir === d.dir) return null;
    if (l.dir === "down") return `linear-gradient(180deg, ${l.c1} 0%, ${l.c2} 100%)`;
    if (l.dir === "diag") return `linear-gradient(135deg, ${l.c1} 0%, ${l.c2} 100%)`;
    return `radial-gradient(ellipse at 30% 20%, ${l.c1} 0%, ${l.c2} 100%)`;
}

// The file a look draws under the logo, with its dim; null unless "media".
export function idleMedia(look) {
    const l = idleLookOf(look);
    return l && l.bg === "media" && l.media ? { ...l.media, dim: l.dim } : null;
}

// The look the console puts on air from the saved one: with "Nome da igreja"
// the church's name becomes the text (the saved look keeps its own words in
// `text` for "Outra"); null for the default look.
export function liveIdleLook(saved, churchName = "") {
    const l = idleLookOf(saved);
    if (!l) return null;
    const look = l.phrase === "church" ? { ...l, text: words(churchName) } : l;
    return isDefaultIdleLook(look) ? null : look;
}

// The words under the logo on a screen (the live look's text, resolved).
export function idleText(look) {
    const l = idleLookOf(look);
    return !l || l.phrase === "none" ? "" : l.text;
}
