// The church's preferences that travel with the database (backups, Exportar,
// another computer): fields on the one User row, base44/entities/User.jsonc.
// A column added later is NULL on an existing row, so every reader goes
// through prefsOf(): null or a bad value is the default here, never a
// default in the jsonc. What belongs to this computer (window sizes, the
// outputs, the network PIN) stays out: localStorage or settings.json.
// The plain lists, not layout.js: every output reads these preferences and
// must not load the console's dock with them.
import { DENSITIES, MODULES } from "../console/layoutChoices.js";
import { normalizeCategories } from "../console/backgroundPrefs.js";
import { idleLookOf, isDefaultIdleLook } from "../../../shared/idleLook.mjs";

const oneOf = (list, fallback) => (v) => (list.includes(v) ? v : fallback);
const DENSITY_KEYS = DENSITIES.map(([k]) => k);
const MODULE_KEYS = MODULES.map(([k]) => k);

export const PREF_FIELDS = {
    bible_version: {
        default: "NVI",
        normalize: (v) => (typeof v === "string" && /^[A-Za-z0-9]{1,12}$/.test(v.trim()) ? v.trim() : "NVI"),
    },
    bible_book_names: { default: "short", normalize: oneOf(["short", "full"], "short") },
    bible_verses_per_slide: { default: "auto", normalize: oneOf(["auto", "1", "2", "3"], "auto") },
    bible_show_reference: { default: true, normalize: (v) => v !== false },
    bible_show_version: { default: true, normalize: (v) => v !== false },
    bible_verse_numbers: { default: "sup", normalize: oneOf(["sup", "hide"], "sup") },
    service_start_time: { default: "", normalize: (v) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : "") },
    service_weekday: { default: null, normalize: (v) => (v !== null && v !== "" && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 6 ? Number(v) : null) },
    duration_song: { default: 240, normalize: (v) => (Number.isInteger(Number(v)) && Number(v) >= 10 && Number(v) <= 3600 && v !== null ? Number(v) : 240) },
    duration_other: { default: 120, normalize: (v) => (Number.isInteger(Number(v)) && Number(v) >= 10 && Number(v) <= 3600 && v !== null ? Number(v) : 120) },
    logo_corner: { default: "bottom-right", normalize: oneOf(["top-left", "top-right", "bottom-left", "bottom-right"], "bottom-right") },
    logo_size: { default: "medium", normalize: oneOf(["small", "medium", "large"], "medium") },
    logo_opacity: { default: 1, normalize: (v) => { const n = Number(v); return v != null && v !== "" && Number.isFinite(n) && n >= 0.2 && n <= 1 ? n : 1; } },
    idle_mode: { default: "logo", normalize: oneOf(["logo", "black", "background"], "logo") },
    // The Tela ociosa's look (shared/idleLook.mjs); null = as it always was.
    idle_look: { default: null, normalize: (v) => { const l = idleLookOf(v); return l && !isDefaultIdleLook(l) ? l : null; } },
    chime_on: { default: true, normalize: (v) => v !== false },
    chime_volume: { default: 35, normalize: (v) => { const n = Number(v); return v != null && v !== "" && Number.isFinite(n) ? Math.min(100, Math.max(5, Math.round(n))) : 35; } },
    show_item_title: { default: true, normalize: (v) => v !== false },
    youtube_hide_title: { default: true, normalize: (v) => v !== false },
    // Transições (Telas e saídas, Rodada F2; src/lib/console/transitions.js):
    // between audios and videos (cut, fade or mix = Tocar junto) and its
    // length; taking things off the screens (Esc, Limpar) and its length;
    // whether Tela preta and Logo come and go with that fade. Ao pausar o som
    // (Rodada G3): Pausar and Tocar in the player fade over this many ms, 0 = a cut.
    media_transition: { default: "fade", normalize: oneOf(["cut", "fade", "mix"], "fade") },
    media_transition_ms: { default: 500, normalize: (v) => ([500, 1000, 2000].includes(Number(v)) ? Number(v) : 500) },
    clear_transition: { default: "fade", normalize: oneOf(["cut", "fade"], "fade") },
    clear_transition_ms: { default: 300, normalize: (v) => ([300, 600, 1000].includes(Number(v)) ? Number(v) : 300) },
    screen_transition: { default: true, normalize: (v) => v !== false },
    pause_fade_ms: { default: 200, normalize: (v) => (v !== null && v !== "" && [0, 200, 400].includes(Number(v)) ? Number(v) : 200) },
    // The Bíblia's own theme: "" = the default theme (the songs'), "none"
    // = the factory look, else a ProjectionTheme id (themes.js themeForKind).
    bible_theme_id: { default: "", normalize: (v) => (typeof v === "string" && v.length <= 200 ? v.trim() : "") },
    // The Texto and Timer themes, the same way (themes.js KIND_FIELD).
    text_theme_id: { default: "", normalize: (v) => (typeof v === "string" && v.length <= 200 ? v.trim() : "") },
    timer_theme_id: { default: "", normalize: (v) => (typeof v === "string" && v.length <= 200 ? v.trim() : "") },
    import_lines: {
        default: 0,
        normalize: (v) => { const n = Number(v); return v !== null && v !== "" && Number.isInteger(n) && n >= 0 && n <= 12 ? n : 0; },
    },
    // The background library's categories, in order (backgroundPrefs.js
    // categoryList): null = never edited, the suggestions.
    background_categories: { default: null, normalize: normalizeCategories },
    // Músicas repetidas the church kept apart (Configurações › Sincronização,
    // Manter as duas): pairKeys "a|b" (shared/syncDuplicates.mjs).
    song_duplicates_kept: { default: [], normalize: (v) => (Array.isArray(v) ? v.filter((k) => typeof k === "string" && /^[^|]{1,100}\|[^|]{1,100}$/.test(k)).slice(0, 5000) : []) },
    console_density: { default: "auto", normalize: oneOf(DENSITY_KEYS, "auto") },
    // Teclas de uma letra (keys.js LETTER_KEYS): B, L, C, / and ? alone, only
    // with Shift, or never.
    letter_keys: { default: "on", normalize: oneOf(["on", "shift", "off"], "on") },
    console_hidden_modules: {
        default: [],
        normalize: (v) => (Array.isArray(v) ? [...new Set(v.filter((k) => MODULE_KEYS.includes(k)))] : []),
    },
};

// Every preference, filled: the row's value when it is valid, else the default.
export function prefsOf(user) {
    const out = {};
    for (const [key, field] of Object.entries(PREF_FIELDS)) out[key] = field.normalize(user?.[key]);
    return out;
}

// The layout's `hidden` map ({ camadas: true }) and the stored list (["camadas"]).
export const hiddenList = (hidden) => MODULE_KEYS.filter((k) => hidden?.[k]);
export const hiddenMap = (list) => Object.fromEntries((list || []).map((k) => [k, true]));
