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
// (the old desktop routes land here); null when none asks for a window.
export const stackFromParams = (params) => {
    if (params.get("config")) return openStack({ page: "config" });
    if (params.get("song")) return openStack({ page: "song", props: { id: params.get("song") } });
    if (params.get("planner")) return openStack({ page: "planner" });
    if (params.get("media")) return openStack({ page: "media" });
    if (params.get("notice")) return openStack({ page: "notice", props: { id: params.get("notice") } });
    if (params.get("school")) return openStack({ page: "school" });
    if (params.get("reports")) return openStack({ page: "reports" });
    return null;
};
