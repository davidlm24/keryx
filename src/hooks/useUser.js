import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { keryx } from "@/api/keryxClient";
import { prefsOf } from "@/lib/prefs/schema";
import { migrateLocalPrefs, migrateTransition, migrateItemTitle, migrationFrom, needsMigration, PREFS_VERSION } from "@/lib/prefs/migrate";

// The local profile (the one User row: the church, its look, its
// preferences), read once per window and kept current by the entity's
// realtime: every window and network screen follows a change made in
// Configurações. A copy in localStorage paints the first frame (the logo,
// the density) before the database answers; it is a cache, the row wins.
const CACHE = "keryx.user.cache";
const readCache = () => {
    try { const v = JSON.parse(localStorage.getItem(CACHE) || "null"); return v && typeof v === "object" ? v : null; } catch { return null; }
};

let user = readCache();
let loaded = false;
let started = false;
const listeners = new Set();

function set(next) {
    user = next;
    try { localStorage.setItem(CACHE, JSON.stringify(next)); } catch { /* private mode: no first-frame copy */ }
    for (const fn of listeners) fn();
}

function start() {
    if (started) return;
    started = true;
    keryx.auth.me().then((u) => { if (u) { loaded = true; set({ ...(user || {}), ...u }); } }).catch(() => {});
    keryx.entities.User.subscribe?.((change) => {
        if (change?.data && change.type !== "delete") set({ ...(user || {}), ...change.data });
    });
}

const subscribe = (fn) => { start(); listeners.add(fn); return () => listeners.delete(fn); };
const getSnapshot = () => user;

// The User row (null before the first read), or a part of it:
// useUser((u) => u?.logo_url).
export function useUser(selector) {
    const u = useSyncExternalStore(subscribe, getSnapshot);
    return selector ? selector(u) : u;
}

// What the preferences are on a row not migrated yet: the database's values,
// else this computer's old ones (so nothing flickers before useMigratePrefs).
const effective = (u) => prefsOf(needsMigration(u) ? { ...migrateLocalPrefs(u, safeStorage()), ...(u || {}) } : u);
function safeStorage() { try { return localStorage; } catch { return null; } }

// The preferences, every one filled (src/lib/prefs/schema.js).
export function usePrefs() {
    const u = useUser();
    return useMemo(() => effective(u), [u]);
}

// The same, read once, outside React (the palette, an import).
export function getPrefs() {
    start();
    return effective(user);
}

// Writes fields on the profile. The change shows at once (every window
// gets it from the realtime); a failed write puts the old values back and
// rejects, for the caller to say so.
export async function updateUser(patch) {
    start();
    const before = user;
    set({ ...(user || {}), ...patch });
    try {
        const row = await keryx.entities.User.update("me", patch);
        if (row) set({ ...(user || {}), ...row });
        return row;
    } catch (err) {
        set(before);
        throw err;
    }
}

// The console window moves this computer's old preferences into the
// database once (src/lib/prefs/migrate.js). Outputs and network screens
// never do: they only read.
export function useMigratePrefs() {
    const u = useUser();
    const busy = useRef(false);
    useEffect(() => {
        if (busy.current || !loaded || !u || !needsMigration(u)) return;
        busy.current = true;
        (async () => {
            // The theme moves go BEFORE the row is marked, so a failed write
            // retries on the next launch instead of losing the church's
            // values. Each runs only from below its version (migrationFrom):
            // a church already at 2 whose default theme lost its transition
            // since must not get the old one back.
            const themes = await keryx.entities.ProjectionTheme.list();
            if (migrationFrom(u) < 2) {
                // Version 2: the old Aparência transition goes into the
                // default theme.
                const move = migrateTransition(u, themes);
                if (move?.id) await keryx.entities.ProjectionTheme.update(move.id, move.patch);
                else if (move) await keryx.entities.ProjectionTheme.create(move.create);
            }
            // Version 3: the church's "Título do item nas telas" goes into
            // every theme without a choice of its own.
            const titles = migrateItemTitle(u, themes);
            if (titles.length) await keryx.entities.ProjectionTheme.bulkUpdate(titles);
            await updateUser({ ...migrateLocalPrefs(u, safeStorage()), prefs_version: PREFS_VERSION });
        })().catch(() => { busy.current = false; /* tried again on the next launch */ });
    }, [u]);
}
