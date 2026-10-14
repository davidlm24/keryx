// One-off move of the console's preferences from this computer's
// localStorage into the database (User row), so they ride backups and
// Exportar. Pure: storage is anything with getItem(key).
//   - Only fields still empty on the row are filled: a value already in the
//     database (a restored backup, another computer) always wins.
//   - The old keys are never deleted, so an older KERYX keeps working.
//   - prefs_version marks the row as done; the caller writes it with the
//     patch (useMigratePrefs, the console window only). 2 also moves the
//     church's old Aparência transition into the default theme
//     (migrateTransition below): the transition is the theme's alone since
//     the audit 2026-10-14 (achado nº 4).
import { TRANSITIONS, TRANSITION_MS } from "../console/look.js";
import { defaultTheme } from "../console/themes.js";

export const PREFS_VERSION = 2;
export const LEGACY = {
    bible: "keryx.console.bible",
    importLines: "keryx.import.lines",
    layout: (profile) => `keryx.console.layout.${profile || "default"}`,
};

const read = (storage, key) => { try { return storage?.getItem(key) ?? null; } catch { return null; } };
const readJson = (storage, key) => {
    const raw = read(storage, key);
    if (!raw) return null;
    try { const v = JSON.parse(raw); return v && typeof v === "object" ? v : null; } catch { return null; }
};
const empty = (v) => v === null || v === undefined;

// The profile name the console saved its layout under (Console.jsx: the
// email, else the full name; the local profile is "Operador").
export const layoutProfile = (user) => user?.email || user?.full_name || "Operador";

// -> the patch of fields to fill ({} when there is nothing to move).
export function migrateLocalPrefs(user, storage) {
    const patch = {};
    const bible = readJson(storage, LEGACY.bible);
    if (bible) {
        if (empty(user?.bible_version) && typeof bible.version === "string" && bible.version) patch.bible_version = bible.version;
        if (empty(user?.bible_book_names) && (bible.bookNames === "full" || bible.bookNames === "short")) patch.bible_book_names = bible.bookNames;
    }
    const lines = read(storage, LEGACY.importLines);
    if (empty(user?.import_lines) && lines !== null && Number.isInteger(Number(lines)) && Number(lines) > 0) patch.import_lines = Number(lines);
    // Saved before the profile loaded, the layout landed under "default".
    const layout = readJson(storage, LEGACY.layout(layoutProfile(user))) || readJson(storage, LEGACY.layout(""));
    if (layout) {
        if (empty(user?.console_density) && typeof layout.density === "string") patch.console_density = layout.density;
        if (empty(user?.console_hidden_modules) && layout.hidden && typeof layout.hidden === "object") {
            const list = Object.keys(layout.hidden).filter((k) => layout.hidden[k]);
            if (list.length) patch.console_hidden_modules = list;
        }
    }
    return patch;
}

export const needsMigration = (user) => !(Number(user?.prefs_version) >= PREFS_VERSION);

// Version 2: the church's old default transition (Configurações › Aparência,
// User.transition_type/transition_ms — nobody reads them any more) becomes
// the default theme's, so the church keeps seeing the same transition.
// -> what to write before prefs_version is marked:
//    { id, patch }  the default theme inherits ("Padrão"): give it the
//                   church's transition (a theme with one already won before,
//                   so it is left alone);
//    { create }     no theme is marked default: a theme with only the
//                   transition, marked padrão (it dresses with the factory
//                   look, so the screens look the same);
//    null           nothing to move.
export function migrateTransition(user, themes) {
    const kind = TRANSITIONS.some(([v]) => v === user?.transition_type) ? user.transition_type : null;
    if (!kind) return null;
    const ms = Number(user?.transition_ms);
    const [lo, hi] = TRANSITION_MS;
    const patch = { transition: kind, ...(Number.isFinite(ms) && ms > 0 ? { transition_ms: Math.round(Math.min(hi, Math.max(lo, ms))) } : {}) };
    const def = defaultTheme(themes);
    if (!def) return { create: { ...patch, is_default: true } };
    return def.transition ? null : { id: def.id, patch };
}
