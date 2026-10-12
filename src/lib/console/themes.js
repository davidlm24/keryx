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
export const EXTRA_KEYS = ["text_opacity", "text_max_width", "line_height", "text_case", "text_box", "text_box_color", "text_box_opacity", "text_nudge", "transition", "transition_ms"];
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
