// One-off move of the console's preferences from this computer's
// localStorage into the database (User row), so they ride backups and
// Exportar. Pure: storage is anything with getItem(key).
//   - Only fields still empty on the row are filled: a value already in the
//     database (a restored backup, another computer) always wins.
//   - The old keys are never deleted, so an older KERYX keeps working.
//   - prefs_version marks the row as done; the caller writes it with the
//     patch (useMigratePrefs, the console window only).
export const PREFS_VERSION = 1;
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
