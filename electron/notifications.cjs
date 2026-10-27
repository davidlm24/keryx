// The console's bell: things the operator should know about but that are
// not on air (an update ready, a backup that went elsewhere). Kept in
// settings.json so an unread one survives a restart. Pure Node: tested.
//
// A notification: { id, key, kind, title, body, action, at, read }.
// `key` makes it idempotent: adding the same key again refreshes it (and
// makes it unread when its text changed) instead of piling up copies.
// `action` names something the console can do from the bell ("update",
// "settings:dados"); the main process never runs it.

const SETTINGS_KEY = "notifications";
const KEEP = 30;

function createNotifications({ settings, now = () => new Date(), onChange = () => {} }) {
    const load = () => {
        const list = settings.get(SETTINGS_KEY, []);
        return Array.isArray(list) ? list.filter((n) => n && n.id && n.title) : [];
    };
    let list = load();
    const save = () => {
        settings.set(SETTINGS_KEY, list);
        onChange(list);
    };

    return {
        list: () => list,
        unread: () => list.filter((n) => !n.read).length,
        add({ key, kind = "info", title, body = "", action = null }) {
            const at = now().toISOString();
            const same = key ? list.find((n) => n.key === key) : null;
            if (same) {
                const changed = same.title !== title || same.body !== body;
                list = [{ ...same, kind, title, body, action, at: changed ? at : same.at, read: changed ? false : same.read }, ...list.filter((n) => n !== same)];
            } else {
                const id = `${Date.parse(at).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
                list = [{ id, key: key || id, kind, title, body, action, at, read: false }, ...list].slice(0, KEEP);
            }
            save();
            return list[0];
        },
        // Takes away what no longer applies (an update that was installed).
        remove(predicate) {
            const before = list.length;
            list = list.filter((n) => !predicate(n));
            if (list.length !== before) save();
        },
        markAllRead() {
            if (!list.some((n) => !n.read)) return list;
            list = list.map((n) => (n.read ? n : { ...n, read: true }));
            save();
            return list;
        },
        dismiss(id) {
            list = list.filter((n) => n.id !== id);
            save();
            return list;
        },
        clear() {
            list = [];
            save();
            return list;
        },
    };
}

// What the console may add itself (a pedido of the Equipe, owner
// 2026-10-27: the toast goes, the bell keeps it): its own kinds and actions
// only, the text short and on one line, its key apart from main's.
// -> the note to add, or null.
const CONSOLE_KINDS = ["pedido"];
const CONSOLE_ACTIONS = ["painel:pedidos", "painel:chat"];
function consoleNote(n) {
    if (!n || !CONSOLE_KINDS.includes(n.kind)) return null;
    const text = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
    const title = text(n.title, 120);
    if (!title) return null;
    const key = text(n.key, 80);
    return { key: key ? `console:${key}` : undefined, kind: n.kind, title, body: text(n.body, 300), action: CONSOLE_ACTIONS.includes(n.action) ? n.action : null };
}

module.exports = { createNotifications, consoleNote, KEEP };
