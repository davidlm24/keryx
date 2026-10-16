// The window stack (owner 2026-10-14, Rodada C: "uma janela, com Voltar").
// Every floating page — Configurações, the six views and the two editors —
// lives in ONE window over the console, with the Configurações frame: the
// title bar, the page's tools and the (x) "Fechar · Esc". Opening something
// from INSIDE a window pushes a page onto this stack in the same window,
// with "← where it came from"; Voltar and Esc pop one level (the first
// level closes), the (x) closes the whole stack, and every exit goes
// through the top page's unsaved guard (Console.jsx routes it). Pure data,
// no DOM, so node --test checks it (nav.test.mjs).
//
// An entry: { page, props, back, key }.
//   page  — one of PAGE_TITLES' keys.
//   props — what the page needs (a song id, a screen path…).
//   back  — the Voltar chip's label: the TITLE of where it came from
//           ("Temas", "Planejar o culto"); null on a first level.
//   key   — remount identity: a new key remounts the page, the same key
//           keeps it (retitling a new row after its first save).

// The window title of each page (the bar's kx-section).
export const PAGE_TITLES = {
    config: "Configurações",
    planner: "Planejar o culto",
    media: "Mídia",
    notice: "Aviso",
    song: "Editor de música",
    // Rodada D4: the song's marks, pushed from the Editor de música.
    sync: "Sincronizar",
    school: "Escola bíblica",
    material: "Material",
    reports: "Relatórios",
    theme: "Editor de temas",
    screen: "Editor da tela",
};

// The pages that take the larger Editor window (CSS .win-dialog.is-editor);
// navigating between sizes animates the frame (console.css).
const EDITOR_PAGES = new Set(["theme", "screen", "sync"]);
export const isEditorPage = (page) => EDITOR_PAGES.has(page);
// The window's size class follows the page on top.
export const winSize = (stack) => (isEditorPage(top(stack)?.page) ? "editor" : "standard");

let seq = 0;
const entry = ({ page, props = {}, back = null, key = null }) => {
    if (!PAGE_TITLES[page]) throw new Error(`unknown window page: ${page}`);
    seq += 1;
    return { page, props, back, key: key ?? `w${seq}` };
};

// A window opened from the console (the menu, the Biblioteca, a URL):
// one level, no Voltar.
export const openStack = (spec) => [entry({ ...spec, back: null })];

// Opened from INSIDE the window: a new level with "← from" (the title of
// the page, or the Configurações section, it came from).
export const push = (stack, spec, from) => [...stack, entry({ ...spec, back: from || PAGE_TITLES[top(stack)?.page] || null })];

// Voltar / Esc: one level up (closing the window is the caller's business
// when only one level is left).
export const pop = (stack) => stack.slice(0, -1);

export const top = (stack) => (stack && stack.length ? stack[stack.length - 1] : null);
export const backLabel = (stack) => top(stack)?.back || null;

// The same page with other props. A remount (another theme, another
// screen) gets a new key; keep: true keeps the key, so the page only
// retitles (a new row saved for the first time keeps its state).
export const replaceTop = (stack, props, { keep = false } = {}) => {
    const t = top(stack);
    if (!t) return stack;
    return [...pop(stack), entry({ page: t.page, props, back: t.back, key: keep ? t.key : null })];
};

// The ?song= / ?config= style query params still open their page at launch
// (the old desktop routes land here), and they are what a detached page's
// window opens with (/Janela, detachSpec below); null when none asks for a
// window. "1" (and a planner's "new") means "no row in particular".
const some = (v) => (v && v !== "1" ? v : null);
export const stackFromParams = (params) => {
    const get = (k) => params.get(k);
    if (get("config")) return openStack({ page: "config", props: some(get("config")) ? { section: get("config") } : {} });
    // ?song=<id>&sync=1: the Editor de música, Sincronizar opening on top.
    if (get("song")) return openStack({ page: "song", props: { id: get("song"), ...(get("sync") ? { sync: true } : {}) } });
    if (get("planner")) { const id = some(get("planner")); return openStack({ page: "planner", props: id && id !== "new" ? { serviceId: id } : {} }); }
    if (get("media")) return openStack({ page: "media" });
    if (get("notice")) return openStack({ page: "notice", props: { id: get("notice") } });
    if (get("material")) return openStack({ page: "material", props: { id: get("material") === "new" ? null : get("material"), classId: get("class") || "" } });
    if (get("school")) return openStack({ page: "school" });
    if (get("reports")) return openStack({ page: "reports" });
    // The editors (the old /Editor window's deep links too).
    if (get("theme")) return openStack({ page: "theme", props: { id: get("theme") } });
    if (get("screen")) return openStack({ page: "screen", props: { path: get("screen") } });
    return null;
};

// "Destacar em janela" (Rodada F5, owner 2026-10-16: every page of THE
// window): the page on top moves to a window of its own, /Janela
// (src/pages/Janela.jsx), for whoever works watching another monitor.
// -> { pop, page, query }: how many levels leave the console's window,
// the page the new window shows (its window name, keryx-janela-<page>)
// and its params, which stackFromParams reads back; null when the page on
// top cannot stand alone. Sincronizar answers to the Editor de música
// below it (its Aplicar fills that editor's draft), so the two go
// together: ?song=<id>&sync=1. What the console keeps outside the stack
// comes in `at`: the Configurações section, the culto in hand.
export const detachSpec = (stack, at = {}) => {
    const t = top(stack);
    if (!t) return null;
    const p = t.props || {};
    const one = (page, query) => ({ pop: 1, page, query: new URLSearchParams({ page, ...query }).toString() });
    switch (t.page) {
        case "config": return one("config", { config: at.section || "1" });
        case "planner": return one("planner", { planner: at.serviceId || "1" });
        case "media": return one("media", { media: "1" });
        case "notice": return one("notice", { notice: p.id || "new" });
        case "song": return one("song", { song: p.id || "new" });
        case "school": return one("school", { school: "1" });
        case "material": return one("material", { material: p.id || "new", ...(p.classId ? { class: p.classId } : {}) });
        case "reports": return one("reports", { reports: "1" });
        case "theme": return one("theme", { theme: p.id || "new" });
        case "screen": return one("screen", { screen: p.path || "/Projection" });
        case "sync": {
            const below = stack.length > 1 ? stack[stack.length - 2] : null;
            if (below?.page !== "song" || !below.props?.id || below.props.id === "new") return null;
            return { pop: 2, page: "song", query: new URLSearchParams({ page: "song", song: below.props.id, sync: "1" }).toString() };
        }
        default: return null;
    }
};
// The detached page's window: one per kind of page (opening it again
// navigates that one, whose unsaved guard still asks).
export const janelaName = (page) => `keryx-janela-${page}`;
