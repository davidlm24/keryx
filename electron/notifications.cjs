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

module.exports = { createNotifications, KEEP };
