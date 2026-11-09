// "Destacar em janela" for the console's panels (owner 2026-11-09, mockup
// "Painéis em janela", D1–D5 = A): a dock module the operator keeps in a
// window of its own, /Janela?page=panel&module=<id> (PanelPage.jsx), for
// instance on a second monitor.
//
// It is `layout.detached` ({ [moduleId]: true }, per computer, every width
// tier): the module STAYS in its place in the dock's tree and fitDock's
// `away` takes it out of the frame (dock.js), so when its window closes it
// comes back exactly where it was — never the tray, which the Setlist
// (required) cannot enter and which brings a module back to its default
// place. The console opens a window for every detached module when it opens
// and when one is detached; the window closing clears the flag
// (`panel.closed`, janelaRelay.js). Pure: no DOM.
import { MODULES } from "./dock.js";

// The panels that may leave. Never the Programa, the Prévia, the No ar strip
// or the Player (they are the console itself), nor the Bíblia's (they share
// BibleEnv's state).
export const DETACHABLE = ["lib", "slides", "abas", "setlist", "camadas", "temas"];
// The ones PanelPage hosts so far (Rodada 1: Biblioteca, Setlist, Painel;
// Camadas, Temas and Slides come next).
export const HOSTED = ["lib", "setlist", "abas"];
export const canDetach = (id) => HOSTED.includes(id);

// layout.detached made safe: only hosted panels, only `true`.
export function normalizeDetached(saved) {
    const out = {};
    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
        for (const [id, on] of Object.entries(saved)) if (on === true && canDetach(id)) out[id] = true;
    }
    return out;
}

export const isDetached = (layout, id) => layout?.detached?.[id] === true;
export const detachedList = (layout) => Object.keys(layout?.detached || {}).filter((id) => isDetached(layout, id) && canDetach(id));

// The module goes to its window: flagged, and never folded there (its
// chevron's state would hide it when it comes back).
export function detachModule(layout, id) {
    if (!canDetach(id) || isDetached(layout, id)) return layout;
    const { [id]: _folded, ...folded } = layout.folded || {};
    return { ...layout, detached: { ...(layout.detached || {}), [id]: true }, folded };
}
// Back in the console, where it was.
export function attachModule(layout, id) {
    if (!isDetached(layout, id)) return layout;
    const { [id]: _was, ...detached } = layout.detached;
    return { ...layout, detached };
}

// The window's title: the module's own name.
export const panelTitle = (id) => MODULES[id]?.name || "Painel";
// One window per panel (the pages' are keryx-janela-<page>, nav.js).
export const panelWindowName = (id) => `keryx-janela-panel-${id}`;
export const panelQuery = (id) => new URLSearchParams({ page: "panel", module: id }).toString();
// The module a /Janela URL names, or null.
export function panelFromParams(params) {
    if (!params || params.get("page") !== "panel") return null;
    const id = params.get("module");
    return canDetach(id) ? id : null;
}
// The size a browser opens it at (the desktop's comes from main, per panel:
// windowState.cjs janelaSpec).
export const PANEL_WINDOW_FEATURES = "width=420,height=820";
