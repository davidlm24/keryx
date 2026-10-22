// A projection theme (ProjectionTheme row) as the live state understands it:
// the text style it applies, the Fundo layer it sets, which theme starts
// selected. Shared by Camadas (apply/save) and Configurações › Temas e fundos (the
// editor). Pure, so node --test checks it.
import { bgSpec, cleanSpec } from "./backgroundSpec.js";
import { themeBackgroundArgs, defaultTheme } from "./themeCore.js";
import { SIZE_PRESETS, sameSize, sizeCqw } from "../textSize.js";
import { TRANSITIONS, NATURAL_MS } from "./look.js";
import { steppedSize } from "./songSize.js";

// The six size presets, smallest first: what a song or an aviso chooses,
// and the shortcuts beside a theme's free size (a number in cqw since the
// Rodada HF2, src/lib/textSize.js).
export const TEXT_SIZES = SIZE_PRESETS.map(([k, l]) => [k, l]);
// Every family the renderer ships (src/fonts.css FONT_MAP); Camadas used to
// list only five and wrongly warned "Fonte não instalada" for the others.
export const THEME_FONTS = [["sans", "Sem serifa"], ["serif", "Serifa"], ["mono", "Mono"], ["cursive", "Cursiva"], ["arial", "Arial"], ["georgia", "Georgia"], ["times", "Times"], ["verdana", "Verdana"]];
export const FAMILY_SET = new Set(THEME_FONTS.map(([v]) => v));

// A theme's text look: the five classic keys, plus the extras it was saved
// with (absent ones apply as "", so a theme without a box removes one; a
// theme without a transition leaves the factory one — fade, look.js
// NATURAL_MS — the transition is the theme's alone, audit 2026-10-14).
//
// Where the text lands is decided in this order (ScreenRenderer draws
// content.style, slide.style over it):
//   1. slide.style — a song part's theme (songTheme.js); a per-output theme
//      drops it (outputPrefs.js).
//   2. the output's own theme (OutputPref.theme_id), for the keys it sets —
//      Letras, Vídeo and Comunicação only; the main Projeção always follows
//      the console (ownsTheme, owner 2026-10-14).
//   3. the item's explicit style (a song's "Próprio" look) — extras
//      the item sets survive the default theme (withThemeDefaults fills only
//      what is empty).
//   4. the default (or Bíblia's) theme, stamped when the item is sent.
//   5. the renderer's factory look (center/middle, large, sans, shadow).
// text_align and text_position ride as extras, so the Editor de temas moves
// the box per theme and the item's own style still wins. Applying a theme on air
// (Camadas › Temas) spreads the whole themeStyle: it resets them too — a theme is
// a complete look. The typography of the Rodada HF2 (weight, italic, letter
// spacing, outline; line_height now takes a number too) rides the same way,
// and so do the text bar's (Rodada P, P8-1): text_decoration "underline",
// text_justify "justify" (the text justified, the box still where
// text_align puts it) and text_case "capitalize" (Primeira Maiúscula).
// font_size is a number in cqw stored as a string ("4.8"), or an old
// preset's name ("large"): compared with sameSize, never as a string.
export const EXTRA_KEYS = ["text_opacity", "text_max_width", "line_height", "text_case", "text_box", "text_box_color", "text_box_opacity", "text_nudge", "text_align", "text_position", "transition", "transition_ms",
    "font_weight", "font_style", "letter_spacing", "text_outline_px", "text_outline_color", "text_decoration", "text_justify"];
const extra = (t) => Object.fromEntries(EXTRA_KEYS.map((k) => [k, t?.[k] ?? ""]));
export const themeStyle = (t) => ({ font_size: t?.font_size || "large", font_family: t?.font_family || "sans", text_effect: t?.text_effect || "shadow", text_color: t?.text_color || "#ffffff", text_color_2: t?.text_color_2 || "", ...extra(t) });
const sameKey = (k, a, v) => {
    if (k === "font_size") return sameSize(a || v, v);
    if (EXTRA_KEYS.includes(k) || k === "text_color_2") return String(a ?? "") === String(v);
    return (a || v) === v;
};
export const sameLook = (style, t) => Object.entries(themeStyle(t)).every(([k, v]) => sameKey(k, style?.[k], v));

// themeBackgroundArgs (a theme's background as background.set's arguments)
// and defaultTheme (the one marked padrão) live in themeCore.js, which the
// outputs import without the rest of this module.
export { themeBackgroundArgs, defaultTheme };

// A theme is saved with a background from the library (owner 2026-10-14):
// without one, applying it dressed only the text and the previous theme's
// Fundo stayed on screen, so a new theme looked broken. The Editor de temas
// saves only with one (a colour counts: Cor is a library tab) and "Salvar
// como novo" in Camadas takes one along or asks. Themes saved before keep
// working as they did (the text only, the Fundo on air stays) and carry a
// "sem fundo" mark until someone gives them one.
export const themeHasBackground = (t) => Boolean(bgSpec(t));
// The background Camadas' "Salvar como novo" gives the new theme: the Fundo
// on air (any kind, even hidden by its eye), else the theme in use's; null
// = there is none at hand and the library is asked for one.
export const newThemeBackground = (onAir, inUse) => cleanSpec(onAir) || bgSpec(inUse);

export const isDefaultTheme = (themes, t) => Boolean(t) && defaultTheme(themes)?.id === t.id;

// The theme in use (owner's decisions 2026-10-13/14): the one the operator
// last clicked in Camadas › Temas (c.themeId, useConsole), kept on this
// computer so it survives KERYX reopening — lost on a reopen, the next song
// went out over the Fundo do culto with the factory look (review
// 2026-10-14). It dresses everything sent until someone changes it (Música
// in themeForKind); choosing a culto with a theme of its own
// (Service.theme_id, serviceLook.js) makes that one the theme in use, a
// culto with none leaves it as it is. When KERYX opens, the last click wins
// (owner 2026-10-14): the culto it opens on does not replace a theme the
// operator had in use on this computer (`reopening` with `inUse`); choosing
// a culto afterwards, or changing its theme, does.
// -> the new theme in use, or undefined: it stays.
export function themeInUseSeed(cultoTheme, { reopening = false, inUse = null } = {}) {
    if (reopening && inUse) return undefined;
    return typeof cultoTheme === "string" && cultoTheme.trim() ? cultoTheme.trim() : undefined;
}

// A theme's name for menus, tooltips and toasts; an unnamed theme shows no
// caption under its thumbnail (owner 2026-10-14), so callers pass "" there.
export const themeName = (t, fallback = "Tema sem nome") => (typeof t?.name === "string" && t.name.trim()) || fallback;
// A theme's comment (ProjectionTheme.note, Rodada HF2): what it is for, in
// its tooltip in Temas; never on air. At most 500 characters.
export const themeNote = (t) => (typeof t?.note === "string" ? t.note.trim().slice(0, 500) : "");

// The themes Camadas › Temas offers as presets (owner's decision 2026-10-13,
// as Holyrics' theme column): the pinned ones (ProjectionTheme.pinned), by
// name; with none pinned, the default theme first and then the most recently
// changed, so a new church sees something useful. At most `max`: the 9
// slots of the Temas panel (owner 2026-10-14, ThemeStrip TEMAS_SLOTS).
export function consoleThemes(themes, max = 9) {
    const all = themes || [];
    const pinned = all.filter((t) => t?.pinned);
    if (pinned.length) return pinned.slice(0, max);
    const rest = all.filter((t) => !t?.is_default).sort((a, b) => String(b?.updated_date || "").localeCompare(String(a?.updated_date || "")));
    const first = defaultTheme(all);
    return [...(first ? [first] : []), ...rest].slice(0, max);
}

// A default theme per kind of content (owner's decision 2026-10-13, as in
// SPresenter): Música is the theme in use, else the theme marked padrão
// (ProjectionTheme.is_default); Bíblia, Texto (text items, Escola bíblica)
// and Timer (the clock, the stopwatch and timers) have their own on the
// profile (User.bible_theme_id, text_theme_id, timer_theme_id): "" = the
// same as Música — so a theme clicked in Camadas dresses a passage, a text
// or a timer that follows the songs (audit 2026-10-14) — "none" = the
// factory look, else a theme (a deleted one falls back to Música's).
// A service's old theme per kind (Service.kind_themes) is no longer read:
// the owner's review 2026-10-14 left a service one theme, which only seeds
// the theme in use.
export const THEME_KINDS = [["lyrics", "Música"], ["bible", "Bíblia"], ["text", "Texto"], ["tool", "Timer"]];
export const KIND_FIELD = { bible: "bible_theme_id", text: "text_theme_id", tool: "timer_theme_id" };
// ids: { bible, text, tool } (or, as before, the Bíblia's id alone).
// inUse: the theme in use's id (null: none; a deleted one is passed over).
export function themeForKind(themes, kind, ids = {}, inUse = null) {
    const list = themes || [];
    const used = typeof inUse === "string" && inUse ? list.find((t) => t?.id === inUse) || null : null;
    const musica = used || defaultTheme(list);
    const own = typeof ids === "string" ? (kind === "bible" ? ids : "") : ids?.[kind] || "";
    if (!KIND_FIELD[kind] || !own) return musica;
    if (own === "none") return null;
    return list.find((t) => t?.id === own) || musica;
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
// A size of "4.8" is the factory "large" (textSize.js sameSize). `size`
// false leaves the size out: a song's is a step from its theme's (songSize.js).
export const isFactoryLook = (row, { size = true } = {}) => LOOK_KEYS.every((k) => (k === "font_size" ? !size || sameSize(row?.[k] || FACTORY_LOOK[k], FACTORY_LOOK[k]) : (row?.[k] || FACTORY_LOOK[k]) === FACTORY_LOOK[k]));
// Whether a Song (style_mode) follows the default theme: "theme" yes,
// "own" no; unset, when its look is still the factory one. Its size never
// counts (Rodada P, P8-2): it is a step from the theme's, so a song made
// bigger keeps following the theme — before, it silently became "own".
export const followsTheme = (row) => row?.style_mode === "theme" || (row?.style_mode !== "own" && isFactoryLook(row, { size: false }));

// content.show's arguments with the default theme filled in where the item
// asks for it (args.inherit = { look, background }, set by content.js);
// inherit never reaches the live state. Applied when an item is sent (and
// in the Prévia), so a theme change never touches what is already on air.
//   - look: the theme's text look replaces the factory one.
//   - the theme's extras (box, position, spacing, weight, case, transition…)
//     fill what the item leaves empty, its own look or not (Rodada P, P8-2:
//     a song with a look of its own went out without the theme's box and
//     position); `extras: false` (a song following a theme of its own,
//     which is a complete look) takes only the transition, where the item
//     has none (without one the screens play the factory transition,
//     look.js NATURAL_MS).
//   - step: a song's size, −2…+2 steps from the theme's (songSize.js).
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
    if (inherit.look) for (const k of LOOK_KEYS) style[k] = t[k];
    if (inherit.extras !== false) {
        for (const k of EXTRA_KEYS) if (t[k] !== "" && (style[k] == null || style[k] === "")) style[k] = t[k];
    } else if (!style.transition && t.transition) {
        style.transition = t.transition;
        if (t.transition_ms !== "" && style.transition_ms == null) style.transition_ms = t.transition_ms;
    }
    if (Number.isFinite(inherit.step)) style.font_size = steppedSize(t.font_size, inherit.step);
    // Whether the item's title shows over the slide is the theme's (Rodada B
    // 2026-10-14: show_item_title left the church's profile for the theme;
    // prefs v3 gave every theme the church's value) — even for an item with
    // its own look, since the title is no part of the text look. Stamped as
    // style.title at send, so Camadas' per-item choice still wins afterwards
    // (content.update); a theme without the field (an old backup) stamps
    // nothing and the renderer falls back to the legacy church pref.
    if (typeof theme.show_item_title === "boolean" && !style.title) style.title = theme.show_item_title ? "show" : "hide";
    const fundo = inherit.background && !style.background_image && !rest.fundo ? themeBackgroundArgs(theme) : null;
    return { ...rest, style, ...(fundo ? { fundo } : {}) };
}

// ---- The Editor de temas' group summaries (Rodada HF3, owner 2026-10-20) ----
// One pt-BR line per CfgGroup of the form, from the draft, shown while the
// group is closed. Pure (tested). A draft is the editor's: "" = the factory.
// The text's own look (font, size, colour, effect…) has no group since
// 2026-10-22: it is all in the text bar, so it has no summary either.
const pctOf = (n) => `${Math.round(n)} %`;
const BOX_NAMES = { band: "Faixa", block: "Bloco" };
const POS_NAMES = { top: "Alto", bottom: "Baixo" };

export function boxSummary(t) {
    const kind = BOX_NAMES[t?.text_box];
    if (!kind) return "Sem caixa";
    return `${kind} · ${pctOf((Number(t.text_box_opacity) || 0.55) * 100)}`;
}

// Where the box sits (the alignment is the text bar's).
export function placeSummary(t) {
    const width = t?.text_box === "band" ? 100 : Number(t?.text_max_width) || 100;
    return `${POS_NAMES[t?.text_position] || "Meio"} · ${pctOf(width)}`;
}

export function fundoSummary(t) {
    const bg = bgSpec(t || {});
    if (!bg) return "Falta escolher";
    const kind = { image: "Imagem", video: "Vídeo", generator: "Gerado", color: "Cor" }[bg.kind] || "Fundo";
    const dim = bg.kind === "color" ? null : Math.round((bg.dim ?? (bg.kind === "image" ? 0.45 : 0)) * 100);
    return dim ? `${kind} · escurecer ${dim} %` : kind;
}

export function transitionSummary(t) {
    const kind = TRANSITIONS.find(([v]) => v === t?.transition)?.[1];
    if (!kind) return `Padrão · Esmaecer ${NATURAL_MS.fade} ms`;
    return t.transition === "cut" ? kind : `${kind} · ${Number(t.transition_ms) || NATURAL_MS[t.transition]} ms`;
}
