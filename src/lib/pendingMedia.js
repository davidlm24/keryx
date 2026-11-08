// Media files the sync between the church's computers has not brought yet
// (electron/sync.cjs, docs/desktop-architecture.md §8b): the row came from
// another computer before Drive finished downloading its file. The windows
// say "Baixando…" instead of a broken picture, and the console refuses to
// send an item that needs one.

const MEDIA_SCHEME = "keryx-media://";

// The set of urls a list of keryx-media names stands for: both the stored
// form and the one the windows load (`mediaBase` + name).
export function pendingSet(names, mediaBase) {
    const set = new Set();
    for (const name of Array.isArray(names) ? names : []) {
        if (typeof name !== "string" || !name) continue;
        set.add(MEDIA_SCHEME + name);
        if (mediaBase) set.add(mediaBase + name);
    }
    return set;
}

// The pending urls anywhere inside `value` (a row, a stage, op args), each
// once. Keys in `skip` are not looked into (a video's poster is not what
// goes on air).
export function pendingUrls(value, pending, { skip = [] } = {}) {
    if (!pending || !pending.size) return [];
    const found = new Set();
    const skipped = new Set(skip);
    const walk = (v, depth) => {
        if (depth > 12 || v == null) return;
        if (typeof v === "string") {
            if (pending.has(v)) found.add(v);
            return;
        }
        if (Array.isArray(v)) {
            for (const x of v) walk(x, depth + 1);
            return;
        }
        if (typeof v === "object") {
            for (const [k, x] of Object.entries(v)) if (!skipped.has(k)) walk(x, depth + 1);
        }
    };
    walk(value, 0);
    return [...found];
}

// What the console says when a send is refused for a file still coming.
export const PENDING_SAY = "Arquivo ainda baixando da sincronização · tente de novo quando terminar.";

// A store over the desktop bridge's sync.missing / onMissing: current() is
// the set (a new one on every change), subscribe(cb) for React.
export function createPendingMedia(sync, mediaBase) {
    let current = new Set();
    const listeners = new Set();
    let started = false;
    const set = (names) => {
        current = pendingSet(names, mediaBase);
        for (const cb of [...listeners]) {
            try { cb(); } catch { /* a listener's problem */ }
        }
    };
    const start = () => {
        if (started || !sync) return;
        started = true;
        sync.onMissing?.((names) => set(names));
        Promise.resolve(sync.missing?.()).then((r) => { if (Array.isArray(r?.data)) set(r.data); }).catch(() => {});
    };
    return {
        current: () => current,
        subscribe(cb) {
            start();
            listeners.add(cb);
            return () => listeners.delete(cb);
        },
    };
}
