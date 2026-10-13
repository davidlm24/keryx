// A projection theme (ProjectionTheme row) as the live state understands it:
// the text style it applies, the Fundo layer it sets, which theme starts
// selected. Shared by Camadas (apply/save) and Configurações › Aparência › Temas (the
// editor). Pure, so node --test checks it.
import { bgSpec, bgArgs } from "./backgroundSpec.js";

// The text sizes a theme or a song can choose, smallest first.
export const TEXT_SIZES = [["xsmall", "PP"], ["small", "P"], ["medium", "M"], ["large", "G"], ["xlarge", "GG"], ["xxlarge", "GGG"]];
// Every family the renderer ships (src/fonts.css FONT_MAP); Camadas used to
// list only five and wrongly warned "Fonte não instalada" for the others.
export const THEME_FONTS = [["sans", "Sem serifa"], ["serif", "Serifa"], ["mono", "Mono"], ["cursive", "Cursiva"], ["arial", "Arial"], ["georgia", "Georgia"], ["times", "Times"], ["verdana", "Verdana"]];
export const FAMILY_SET = new Set(THEME_FONTS.map(([v]) => v));

// A theme's text look: the five classic keys, plus the extras it was saved
// with (absent ones apply as "", so a theme without a box removes one; a
// theme without a transition falls back to Aparência's default).
//
// Where the text lands is decided in this order (ScreenRenderer draws
// content.style, slide.style over it):
//   1. slide.style — a song part's theme (songTheme.js); a per-output theme
//      drops it (outputPrefs.js).
//   2. the output's own theme (OutputPref.theme_id), for the keys it sets.
//   3. the item's explicit style (Camadas, a song's "Próprio" look) — extras
//      the item sets survive the default theme (withThemeDefaults fills only
//      what is empty).
//   4. the default (or Bíblia's) theme, stamped when the item is sent.
//   5. the renderer's factory look (center/middle, large, sans, shadow).
// text_align and text_position ride as extras, so the Editor de temas moves
// the box per theme and Camadas still wins on air. Applying a theme on air
// (the Fundo layer strip) spreads the whole themeStyle: it resets them too — a theme is
// a complete look.
export const EXTRA_KEYS = ["text_opacity", "text_max_width", "line_height", "text_case", "text_box", "text_box_color", "text_box_opacity", "text_nudge", "text_align", "text_position", "transition", "transition_ms"];
const extra = (t) => Object.fromEntries(EXTRA_KEYS.map((k) => [k, t?.[k] ?? ""]));
export const themeStyle = (t) => ({ font_size: t?.font_size || "large", font_family: t?.font_family || "sans", text_effect: t?.text_effect || "shadow", text_color: t?.text_color || "#ffffff", text_color_2: t?.text_color_2 || "", ...extra(t) });
export const sameLook = (style, t) => Object.entries(themeStyle(t)).every(([k, v]) => (EXTRA_KEYS.includes(k) || k === "text_color_2" ? String(style?.[k] ?? "") === String(v) : (style?.[k] || v) === v));

// The theme's background (ProjectionTheme.background, or the picture or
// generated background saved before it; backgroundSpec.js), as
// background.set's arguments; null when it has none.
export const themeBackgroundArgs = (t) => bgArgs(bgSpec(t), t?.name || "Tema");

// The default theme (Configurações › Aparência › Temas, "Tornar padrão"):
// the one marked, the most recently changed if several are; none when none
// is (then the factory look applies — never the first theme by surprise).
export function defaultTheme(themes) {
    const marked = (themes || []).filter((t) => t?.is_default);
    if (marked.length < 2) return marked[0] || null;
    return [...marked].sort((a, b) => String(b.updated_date || "").localeCompare(String(a.updated_date || "")))[0];
}
export const isDefaultTheme = (themes, t) => Boolean(t) && defaultTheme(themes)?.id === t.id;

// The theme in use (owner's decision 2026-10-13, the hybrid): the one the
// operator last clicked in the Fundo layer's strip (c.themeId). It dresses
// everything sent until someone changes it, without writing the service's
// preset — the Visual do culto only seeds it when the service is chosen.
// Here: it rides as the service's Música theme into themeForKind.
export const withThemeInUse = (serviceThemes, themeId) => (themeId ? { ...(serviceThemes || {}), lyrics: themeId } : serviceThemes);

// The themes the Fundo layer offers as presets (owner's decision 2026-10-13,
// as Holyrics' theme column): the pinned ones (ProjectionTheme.pinned), by
// name; with none pinned, the default theme first and then the most recently
// changed, so a new church sees something useful. At most `max` (6 tiles).
export function consoleThemes(themes, max = 6) {
    const all = themes || [];
    const pinned = all.filter((t) => t?.pinned);
    if (pinned.length) return pinned.slice(0, max);
    const rest = all.filter((t) => !t?.is_default).sort((a, b) => String(b?.updated_date || "").localeCompare(String(a?.updated_date || "")));
    const first = defaultTheme(all);
    return [...(first ? [first] : []), ...rest].slice(0, max);
}

// A default theme per kind of content (owner's decision 2026-10-13, as in
// SPresenter): Música is the theme marked padrão (ProjectionTheme.is_default);
// Bíblia, Texto (text items, Escola bíblica) and Timer (the clock, the
// stopwatch and timers) have their own on the profile (User.bible_theme_id,
// text_theme_id, timer_theme_id): "" = the same as Música, "none" = the
// factory look, else a theme (a deleted one falls back to Música's).
export const THEME_KINDS = [["lyrics", "Música"], ["bible", "Bíblia"], ["text", "Texto"], ["tool", "Timer"]];
export const KIND_FIELD = { bible: "bible_theme_id", text: "text_theme_id", tool: "timer_theme_id" };
// ids: { bible, text, tool } (or, as before, the Bíblia's id alone).
// serviceIds: the service's own themes per kind (Service.kind_themes:
// { lyrics, bible, text, tool }, src/lib/console/serviceLook.js), which come
// first (owner's decision 2026-10-13); one that was deleted is passed over.
export function themeForKind(themes, kind, ids = {}, serviceIds = null) {
    const svc = serviceIds && typeof serviceIds === "object" ? serviceIds[kind] : "";
    if (svc) {
        if (svc === "none") return null;
        const t = (themes || []).find((x) => x?.id === svc);
        if (t) return t;
    }
    const def = defaultTheme(themes);
    const own = typeof ids === "string" ? (kind === "bible" ? ids : "") : ids?.[kind] || "";
    if (!KIND_FIELD[kind] || !own) return def;
    if (own === "none") return null;
    return (themes || []).find((t) => t?.id === own) || def;
}

// The bulkUpdate rows that make `id` the only default (null: none is).
// One transaction (store bulkUpdate): never two defaults, never a moment
// with none in between.
export const defaultChanges = (themes, id) => (themes || [])
    .filter((t) => t?.id && (t.id === id ? !t.is_default : t.is_default))
    .map((t) => ({ id: t.id, is_default: t.id === id }));

// The look a song or a passage has when nobody chose one (the editor's
// defaults): with it, the item follows the default theme.
export const FACTORY_LOOK = { font_size: "large", font_family: "sans", text_effect: "shadow", text_color: "#ffffff", text_color_2: "" };
const LOOK_KEYS = Object.keys(FACTORY_LOOK);
export const isFactoryLook = (row) => LOOK_KEYS.every((k) => (row?.[k] || FACTORY_LOOK[k]) === FACTORY_LOOK[k]);
// Whether a Song (style_mode) follows the default theme: "theme" yes,
// "own" no; unset, when its look is still the factory one.
export const followsTheme = (row) => row?.style_mode === "theme" || (row?.style_mode !== "own" && isFactoryLook(row));

// content.show's arguments with the default theme filled in where the item
// asks for it (args.inherit = { look, background }, set by content.js);
// inherit never reaches the live state. Applied when an item is sent (and
// in the Prévia), so a theme change never touches what is already on air.
//   - look: the theme's text look replaces the factory one; its extras
//     (box, case, ...) fill what the item leaves empty.
//   - the theme's transition goes where the item has none (the church's
//     transition, look.js, fills after it).
//   - background: the theme's (picture, video, generated or colour), when
//     the item has none of its own, rides in args.fundo: it goes to the Fundo
//     layer when the item is sent (backgroundSpec.js fundoOps), so it stays
//     after Esc; the Fundo held by Camadas' padlock is left alone.
export function withThemeDefaults(op, args, theme) {
    // A clock, stopwatch or timer with no look of its own takes its theme's
    // font and colour, and its background goes to the Fundo (fundoOps).
    if (op === "tool.show" && args && !args.style && theme) {
        const t = themeStyle(theme);
        const fundo = themeBackgroundArgs(theme);
        return { ...args, style: { font_family: t.font_family, text_color: t.text_color }, ...(fundo ? { fundo } : {}) };
    }
    if (op !== "content.show" || !args?.inherit) return args;
    const { inherit, ...rest } = args;
    if (!theme) return rest;
    const style = { ...(rest.style || {}) };
    const t = themeStyle(theme);
    if (inherit.look) {
        for (const k of LOOK_KEYS) style[k] = t[k];
        for (const k of EXTRA_KEYS) if (t[k] !== "" && (style[k] == null || style[k] === "")) style[k] = t[k];
    } else if (!style.transition && t.transition) {
        style.transition = t.transition;
        if (t.transition_ms !== "" && style.transition_ms == null) style.transition_ms = t.transition_ms;
    }
    const fundo = inherit.background && !style.background_image && !rest.fundo ? themeBackgroundArgs(theme) : null;
    return { ...rest, style, ...(fundo ? { fundo } : {}) };
}
