// Grupos que abrem e fecham (Rodada H0, owner 2026-10-19): the collapsible
// areas of Configurações and the editors (`CfgGroup` in settings/parts.jsx).
// Which ones the operator opened or closed is this computer's, kept in
// localStorage as `{ [id]: true | false }` holding only the deviations from
// each group's default — so a group that starts closed and was never
// touched is not in the store, and changing a default later reaches every
// computer that left it alone. Not in `layout`: the Editor pages and a
// detached /Janela have none, and "Restaurar disposição" must not reset it.
// Pure (tested); the hook `useCfgGroup` in parts.jsx reads it.
export const GROUPS_KEY = "keryx.cfg.groups";

// The saved deviations, `{ [id]: boolean }`; anything unreadable is empty.
export function loadGroups(storage = globalThis.localStorage) {
    try {
        const raw = storage?.getItem(GROUPS_KEY);
        if (!raw) return {};
        const obj = JSON.parse(raw);
        if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
        return Object.fromEntries(Object.entries(obj).filter(([, v]) => typeof v === "boolean"));
    } catch {
        return {};
    }
}

// Writes the deviations; an empty set removes the key.
export function saveGroups(groups, storage = globalThis.localStorage) {
    try {
        const keys = Object.keys(groups || {});
        if (!keys.length) storage?.removeItem(GROUPS_KEY);
        else storage?.setItem(GROUPS_KEY, JSON.stringify(groups));
    } catch {
        // Private mode, a full store: the groups just follow their defaults.
    }
}

// Whether group `id` is open: its saved state, else its default.
export const isOpen = (groups, id, defaultOpen = true) => (typeof groups?.[id] === "boolean" ? groups[id] : Boolean(defaultOpen));

// The deviations with group `id` set to `open` (a new object): a state equal
// to the default leaves the store, so only real choices are kept.
export function setOpen(groups, id, open, defaultOpen = true) {
    const next = { ...(groups || {}) };
    if (Boolean(open) === Boolean(defaultOpen)) delete next[id];
    else next[id] = Boolean(open);
    return next;
}

// The deviations with group `id` flipped.
export const toggle = (groups, id, defaultOpen = true) => setOpen(groups, id, !isOpen(groups, id, defaultOpen), defaultOpen);
