// The screens on the network (a TV, a tablet on the stage), each by an id of
// its own (owner 2026-11-15, mockup "Palco com vídeo e telas na rede", R1–R3
// = A): the operator names one ("TV do palco"), chooses from the console
// which page it shows, and KERYX remembers that page for when it comes back.
//
//   - the id: random letters and digits the screen's page keeps in its own
//     localStorage (keryx.screenId) and sends with its event stream
//     (/api/events?screen=…&id=…). It names a screen, it opens nothing: the
//     screens' PIN still decides who may watch.
//   - a screen: { name, page, lastSeen } in settings.json "network".screens,
//     this computer's alone (never synced). `page` is the page the operator
//     chose ("" = none: the screen stays where it is); a page picked on the
//     device itself, from its start page, becomes the remembered one too.
//   - lastSeen moves in memory and is saved at most every 10 minutes per
//     screen; a screen not seen for 180 days leaves by itself; 30 at most
//     (the oldest seen goes first).
//
// Pure Node, unit tested (screenDevices.test.cjs).

const ID_RE = /^[a-z0-9]{12,32}$/;
const MAX_SCREENS = 30;
const STALE_MS = 180 * 24 * 60 * 60 * 1000;
const SAVE_EVERY_MS = 10 * 60 * 1000;
const NAME_MAX = 40;

const validId = (id) => typeof id === "string" && ID_RE.test(id);

// A name typed in the console: one line, no control characters, 40 at most.
function cleanName(value) {
    // eslint-disable-next-line no-control-regex
    const one = String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
    return [...one].slice(0, NAME_MAX).join("").trim();
}

// The saved map, checked: valid ids, pages among `pages` only, none stale,
// MAX_SCREENS at most (the most recently seen kept).
function normalizeScreens(saved, pages, now = Date.now()) {
    const seen = (s) => Date.parse(s.lastSeen || "") || 0;
    const rows = Object.entries(saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {})
        .filter(([id, s]) => validId(id) && s && typeof s === "object")
        .map(([id, s]) => [id, { name: cleanName(s.name), page: pages.has(s.page) ? s.page : "", lastSeen: typeof s.lastSeen === "string" ? s.lastSeen : "" }])
        .filter(([, s]) => now - seen(s) < STALE_MS)
        .sort((a, b) => seen(b[1]) - seen(a[1]))
        .slice(0, MAX_SCREENS);
    return Object.fromEntries(rows);
}

// load() -> the saved map; save(map) writes it; pages: the paths a screen may
// show (lan.cjs NETWORK_SCREENS); now() for the tests.
function createScreens({ load, save, pages, now = () => Date.now() } = {}) {
    const allowed = new Set(pages || []);
    const savedAt = new Map(); // id -> when its lastSeen was last written
    const pending = new Map(); // id -> lastSeen not written yet
    const read = () => normalizeScreens(load(), allowed, now());
    const write = (map) => save(normalizeScreens(map, allowed, now()));
    const stamp = () => new Date(now()).toISOString();
    const change = (id, patch) => {
        if (!validId(id)) return null;
        const map = read();
        const was = map[id] || { name: "", page: "", lastSeen: "" };
        map[id] = { ...was, ...patch, lastSeen: stamp() };
        pending.delete(id);
        savedAt.set(id, now());
        write(map);
        return map[id];
    };
    return {
        validId,
        get: (id) => (validId(id) ? read()[id] || null : null),
        list: () => read(),
        // The page the operator chose for this screen ("" or "/" = none).
        setPage: (id, page) => change(id, { page: allowed.has(page) ? page : "" }),
        rename: (id, name) => change(id, { name: cleanName(name) }),
        // A screen connected: its lastSeen, saved now if it is new or was
        // last written over SAVE_EVERY_MS ago.
        seen(id) {
            if (!validId(id)) return;
            const map = read();
            if (!map[id] || now() - (savedAt.get(id) || 0) >= SAVE_EVERY_MS) { change(id, {}); return; }
            pending.set(id, stamp());
        },
        // On stop: the lastSeen kept in memory.
        flush() {
            if (!pending.size) return;
            const map = read();
            for (const [id, at] of pending) if (map[id]) map[id] = { ...map[id], lastSeen: at };
            pending.clear();
            write(map);
        },
    };
}

module.exports = { createScreens, normalizeScreens, cleanName, validId, MAX_SCREENS, NAME_MAX };
