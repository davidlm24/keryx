// The theme of a song and of its parts (2026-10-12, as in Holyrics' "Salvar
// Tema para Música" and SPresenter's per-verse themes). A Song may follow a
// ProjectionTheme (theme_id): while that theme exists it sets the whole look,
// and changing the theme changes the song. Each labelled part of the lyrics
// ([Refrão], [Ponte]…) may follow another theme (part_themes): the slides of
// that part carry the whole look of their theme in `slide.style`, which the
// renderer lays over the song's. Pure: no I/O, no React.
import { themeStyle, themeBackgroundArgs } from "./themes.js";
import { bgSpec } from "./backgroundSpec.js";

// The part a slide belongs to: its "[Label]", or "Refrão" for a chorus with
// no label of its own; "" when it has neither.
export const partOf = (slide) => String(slide?.label || "").trim() || (slide?.is_chorus ? "Refrão" : "");

// How a part is keyed in part_themes: the name trimmed, in lower case, so
// "Refrão" and "refrão" are the same part.
export const partKey = (name) => String(name || "").trim().toLocaleLowerCase("pt-BR");

// The song's parts in the order they first appear, one per key.
export function songParts(slides = []) {
    const seen = new Set();
    const out = [];
    for (const s of slides) {
        const name = partOf(s);
        const key = partKey(name);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({ key, name, slides: slides.filter((x) => partKey(partOf(x)) === key).length });
    }
    return out;
}

// A theme as the content style the live state takes: its text look and its
// picture, with the picture's darkening and blur (what a part's slides carry;
// only a picture can ride a slide). Empty values are left out (the live
// state drops them anyway), so a part theme without a picture keeps the song's.
export function themeLookOf(theme) {
    if (!theme) return {};
    const spec = bgSpec(theme);
    const pic = spec?.kind === "image" ? spec : null;
    const look = { ...themeStyle(theme), background_image: pic?.value || "", background_dim: pic?.dim, background_blur: pic?.blur };
    return Object.fromEntries(Object.entries(look).filter(([, v]) => v !== "" && v != null));
}

const byId = (themes, id) => (id ? (themes || []).find((t) => t?.id === id) || null : null);

// part_themes as kept: key -> theme id strings, blank ones dropped.
export function cleanPartThemes(map) {
    if (!map || typeof map !== "object" || Array.isArray(map)) return {};
    return Object.fromEntries(Object.entries(map).map(([k, v]) => [partKey(k), typeof v === "string" ? v : ""]).filter(([k, v]) => k && v));
}

// Which look the song has: { theme, missing }. `theme` is the row it follows
// (null with its own look); `missing` when theme_id points at a theme that
// is gone (the song then shows its own look again).
export function songTheme(song, themes) {
    const id = typeof song?.theme_id === "string" ? song.theme_id : "";
    const theme = byId(themes, id);
    return { theme, missing: Boolean(id) && !theme };
}

// A song's content (content.js songContent) with its themes applied: the
// song's theme as the style, and each themed part's look on its slides.
// The same content back when the song has no themes.
export function withSongThemes(content, song, themes) {
    if (!content || !themes?.length) return content;
    const { theme } = songTheme(song, themes);
    const parts = cleanPartThemes(song?.part_themes);
    let out = content;
    if (theme) {
        // The theme sets the whole look; the song's own fields are its
        // fallback for when the theme is deleted. Its background (any kind)
        // goes to the Fundo layer when the song is sent (args.fundo), and
        // its title choice rides as style.title (themes.js withThemeDefaults
        // skips a style.title already set, so the song's theme wins over the
        // default one; Camadas' per-item choice still wins after the send).
        const { background_image: _i, background_dim: _d, background_blur: _b, ...look } = themeLookOf(theme);
        if (typeof theme.show_item_title === "boolean") look.title = theme.show_item_title ? "show" : "hide";
        const { fundo: _f, ...rest } = out;
        const fundo = themeBackgroundArgs(theme);
        out = { ...rest, style: look, ...(fundo ? { fundo } : {}) };
    }
    if (Object.keys(parts).length) {
        let changed = false;
        const slides = out.slides.map((s) => {
            const t = byId(themes, parts[partKey(partOf(s))]);
            if (!t) return s;
            changed = true;
            return { ...s, style: themeLookOf(t) };
        });
        if (changed) out = { ...out, slides };
    }
    return out;
}
