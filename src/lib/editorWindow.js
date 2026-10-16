// The Editor de temas e telas opens as a page of the window on screen
// (owner 2026-10-14, "janelas flutuantes"; Rodada C): each window (the
// console, a detached page's /Janela) registers a host here and every
// openEditor call goes to it. A caller passing detached: true opens it in a
// window of its own instead (/Janela, src/pages/Janela.jsx — the console's ⧉
// "Destacar em janela" goes through nav.js detachSpec for every page): on the
// desktop a real window (main.cjs's window-open handler gives any app-origin
// page the preload and IPC; non-output paths are not tracked, so it keeps
// its frame and taskbar button); in the browser preview a tab. One window
// per editor: the name makes a second open navigate the first (its
// unsaved-changes guard still asks), and focus() brings it forward.
import { janelaName } from "./console/nav.js";

let host = null;

// The window's host: fn({ theme, screen, from }) shows it (truthy = handled).
// Returns the unregister function.
export function setEditorHost(fn) {
    host = fn;
    return () => { if (host === fn) host = null; };
}

// openEditor({ theme: id|"new" } | { screen: path }, detached: true for a
// window of its own) -> { error } when the browser blocked the window, else {}.
// `from` (Rodada C): the title of the page it was opened from — the editor
// then opens as a new level IN the window on screen, with "← from"; without
// it the editor opens as a window of its own (level 1).
export function openEditor({ theme = "", screen = "", from = "", detached = false } = {}) {
    if (!detached && host && host({ theme, screen, from })) return {};
    const page = theme ? "theme" : "screen";
    const q = new URLSearchParams(theme ? { page, theme } : { page, screen: screen || "/Projection" });
    const win = window.open(`${window.location.origin}/Janela?${q}`, janelaName(page), "width=1280,height=820");
    if (!win) return { error: "O navegador bloqueou a janela do editor: permita pop-ups para abrir o Editor de temas e telas." };
    try { win.focus(); } catch { /* another window may refuse focus */ }
    return {};
}
