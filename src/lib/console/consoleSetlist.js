// The Setlist the console shows (owner 2026-10-29, mockup "Setlist
// compartilhada", U1–U5 = A): no computer is bound to a culto any more.
// Every console shows the SAME list: the church's active culto
// (User.active_service_id, synced, so activating one on any computer
// switches them all), else the shared Setlist — one Service row of
// service_type "console" for the whole church, never a planned culto.
//
// Two computers that make the shared row before they sync end up with two:
// every console keeps the oldest (created_date, then id) and moves the
// others' items and messages into it (mergePlan), the same choice on every
// computer, so they converge. Pure; tested in consoleSetlist.test.mjs.

export const CONSOLE_KIND = "console";

export const isConsoleSetlist = (s) => Boolean(s) && s.service_type === CONSOLE_KIND;

// The planned cultos (and eventos): every list of cultos leaves the shared
// Setlist out (Culto menu, Planejar o culto, Relatórios).
export const cultosOf = (services) => (services || []).filter((s) => !isConsoleSetlist(s));

const two = (n) => String(n).padStart(2, "0");
const day = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;

// The shared rows, the one every computer keeps first.
function shared(services) {
    return (services || []).filter(isConsoleSetlist)
        .sort((a, b) => String(a.created_date || "").localeCompare(String(b.created_date || "")) || String(a.id).localeCompare(String(b.id)));
}

// The shared Setlist, or null while no console has made it yet.
export const consoleSetlistOf = (services) => shared(services)[0] || null;

// The fields of a new shared Setlist. `date` is required by the table; it
// is never read (the service clock says "Sem culto" for it).
export function consoleSetlistRow(now = new Date()) {
    return { title: "Setlist", date: day(now), service_type: CONSOLE_KIND, status: "READY" };
}

// The culto a console shows: the church's active one while it exists and is
// a culto, else the shared Setlist (null until it is made).
// -> { service, active }: active = a planned culto is on.
export function visibleService(services, activeId) {
    const id = activeId ? String(activeId) : "";
    const culto = id ? (services || []).find((s) => s.id === id && !isConsoleSetlist(s)) : null;
    if (culto) return { service: culto, active: true };
    return { service: consoleSetlistOf(services), active: false };
}

// More than one shared row: { keep, drop } (ids), else null.
export function mergePlan(services) {
    const rows = shared(services);
    if (rows.length < 2) return null;
    return { keep: rows[0].id, drop: rows.slice(1).map((s) => s.id) };
}

// Where the items of a dropped shared row go in the kept one: after the kept
// row's last item, in their own order. Both rows numbered from 0, so moving
// them as they were left two items on every number.
// -> [{ id, order }]
export function mergedOrders(keptItems, movedItems) {
    const after = (keptItems || []).reduce((n, it) => Math.max(n, (it.order ?? -1) + 1), 0);
    return [...(movedItems || [])]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((it, i) => ({ id: it.id, order: after + i }));
}

// The items a culto gets from the shared Setlist ("Guardar no culto…",
// U3 = A): copies, in order, after what the culto already has. Sections,
// notes and who sings come along; the ids are new (the store gives them).
const COPIED = ["type", "title", "contentId", "duration", "notes", "end_action", "enabled", "requested_by"];
export function copyItems(items, serviceId, after = 0) {
    return [...(items || [])]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((it, i) => ({
            ...Object.fromEntries(COPIED.filter((k) => it[k] !== undefined && it[k] !== null).map((k) => [k, it[k]])),
            serviceId,
            order: after + i,
        }));
}

// The Setlist panel's title (U2 = A): the culto's name while one is active,
// "Setlist" otherwise.
export const setlistTitle = (view) => (view?.active && view.service ? view.service.title || "Culto sem nome" : "Setlist");
