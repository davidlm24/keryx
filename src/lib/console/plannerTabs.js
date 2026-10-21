// Planejar o culto in tabs, as in a browser (owner 2026-10-21, Rodada O,
// mark O9 = A). Each open culto is a tab; the (+) opens a new tab that
// chooses one (Novo culto, Duplicar the last culto, Abrir um culto). The
// tabs are for PLANNING: switching them never changes the console's culto
// ("Usar no console", in a tab's menu, does). Which tabs are open is this
// computer's (localStorage PLANNER_TABS_KEY). Closing a tab never deletes
// the culto. Pure, so node --test checks it (plannerTabs.test.mjs).
//
// The tabs are { ids, active }: the cultos open, in the tabs' order, and the
// one in front (null: none, or the new tab's chooser in front).

export const PLANNER_TABS_KEY = "keryx.console.planner.tabs";
export const NO_TABS = Object.freeze({ ids: [], active: null });

const isId = (v) => typeof v === "string" && v.length > 0 && v.length <= 200;

// What was saved -> the tabs (anything odd: none).
export function readTabs(raw) {
    let v = raw;
    if (typeof raw === "string") { try { v = JSON.parse(raw); } catch { return NO_TABS; } }
    if (!v || typeof v !== "object" || !Array.isArray(v.ids)) return NO_TABS;
    const ids = [...new Set(v.ids.filter(isId))];
    return { ids, active: ids.includes(v.active) ? v.active : ids[0] ?? null };
}

// Some cultos are no longer there (deleted, here or on another computer):
// their tabs close, and the one in front goes to its neighbour as when it
// is closed by hand. The same object when nothing changed (React state).
export function pruneTabs(tabs, existing) {
    const has = existing instanceof Set ? (id) => existing.has(id) : (id) => existing.includes(id);
    const ids = tabs.ids.filter(has);
    if (ids.length === tabs.ids.length) return tabs;
    let active = tabs.active;
    if (active !== null && !has(active)) {
        // The nearest tab that stays, to its right first (closeTab's rule).
        const at = tabs.ids.indexOf(active);
        active = tabs.ids.slice(at + 1).find(has) ?? tabs.ids.slice(0, at).reverse().find(has) ?? null;
    }
    return { ids, active };
}

// Open a culto's tab, or bring it to the front when it is open already. A
// new one goes right of the tab in front (at the end when none is).
export function openTab(tabs, id) {
    if (!isId(id)) return tabs;
    if (tabs.ids.includes(id)) return tabs.active === id ? tabs : { ids: tabs.ids, active: id };
    const at = tabs.active === null ? -1 : tabs.ids.indexOf(tabs.active);
    const ids = at < 0 ? [...tabs.ids, id] : [...tabs.ids.slice(0, at + 1), id, ...tabs.ids.slice(at + 1)];
    return { ids, active: id };
}

// Close a tab: the one in front goes to its right neighbour, else its left.
export function closeTab(tabs, id) {
    const at = tabs.ids.indexOf(id);
    if (at < 0) return tabs;
    const ids = tabs.ids.filter((x) => x !== id);
    if (tabs.active !== id) return { ids, active: tabs.active };
    return { ids, active: ids[at] ?? ids[at - 1] ?? null };
}

const dayMonth = (date) => (typeof date === "string" && /^\d{4}-\d{2}-\d{2}/.test(date) ? `${date.slice(8, 10)}/${date.slice(5, 7)}` : "");

// A tab's name: the culto's title and its day ("Domingo 26/10"); the day
// once only when the title already says it ("Culto de 26/10").
export function tabLabel(svc) {
    if (!svc) return "Culto";
    const title = String(svc.title || "").trim() || "Culto sem nome";
    const dm = dayMonth(svc.date);
    return dm && !title.includes(dm) ? `${title} ${dm}` : title;
}

// "Duplicar …" in the new tab: the last culto up to today (the one the
// church just had), else the nearest one after it. `today` is YYYY-MM-DD.
export function lastService(services, today) {
    const dated = services.filter((s) => s.date);
    const past = dated.filter((s) => s.date <= today).sort((a, b) => b.date.localeCompare(a.date));
    if (past.length) return past[0];
    const next = dated.slice().sort((a, b) => a.date.localeCompare(b.date));
    return next[0] || services[0] || null;
}

// "Abrir um culto": the cultos that are not open, the coming ones first
// (nearest first), then the ones that passed (latest first), then undated.
export function cultosToOpen(services, openIds, today) {
    const open = new Set(openIds);
    const rest = services.filter((s) => !open.has(s.id));
    const coming = rest.filter((s) => s.date && s.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    const past = rest.filter((s) => s.date && s.date < today).sort((a, b) => b.date.localeCompare(a.date));
    return [...coming, ...past, ...rest.filter((s) => !s.date)];
}

// What a duplicate takes from the culto it copies (its items are copied
// apart): how the culto runs and looks, never its day, status or notes of
// the operator. The new day and title come from the church's defaults.
const DUPLICATED = ["startTime", "location", "service_type", "event_description", "background", "theme_id", "kind_themes", "worship_team", "autoplay", "autoplay_gap"];
export function duplicateFields(svc, defaults) {
    const copy = {};
    for (const k of DUPLICATED) if (svc?.[k] !== undefined && svc[k] !== null && svc[k] !== "") copy[k] = svc[k];
    return { ...copy, ...defaults, ...(svc?.startTime ? { startTime: svc.startTime } : {}) };
}
