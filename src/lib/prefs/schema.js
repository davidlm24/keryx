// The church's preferences that travel with the database (backups, Exportar,
// another computer): fields on the one User row, base44/entities/User.jsonc.
// A column added later is NULL on an existing row, so every reader goes
// through prefsOf(): null or a bad value is the default here, never a
// default in the jsonc. What belongs to this computer (window sizes, the
// outputs, the network PIN) stays out: localStorage or settings.json.
import { DENSITIES, MODULES } from "../console/layout.js";

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
    chime_on: { default: true, normalize: (v) => v !== false },
    chime_volume: { default: 35, normalize: (v) => { const n = Number(v); return v != null && v !== "" && Number.isFinite(n) ? Math.min(100, Math.max(5, Math.round(n))) : 35; } },
    import_lines: {
        default: 0,
        normalize: (v) => { const n = Number(v); return v !== null && v !== "" && Number.isInteger(n) && n >= 0 && n <= 12 ? n : 0; },
    },
    console_density: { default: "comfortable", normalize: oneOf(DENSITY_KEYS, "comfortable") },
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

// The layout's `hidden` map ({ tl: true }) and the stored list (["tl"]).
export const hiddenList = (hidden) => MODULE_KEYS.filter((k) => hidden?.[k]);
export const hiddenMap = (list) => Object.fromEntries((list || []).map((k) => [k, true]));
