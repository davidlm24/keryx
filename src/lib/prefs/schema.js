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
