// The Editor de temas e telas opens as a floating dialog in the console
// (owner 2026-10-14, "janelas flutuantes"): the console registers a host
// here and every openEditor call goes to it. "Destacar em janela" (or a
// caller passing detached: true) opens the DETACHED window instead
// (/Editor in src/App.jsx): on the desktop a real window (main.cjs's
// window-open handler gives any app-origin page the preload and IPC;
// non-output paths are not tracked, so it keeps its frame and taskbar
// button); in the browser preview a tab. One window at a time: the name
// makes a second open navigate the first (its unsaved-changes guard still
// asks), and focus() brings it forward.

const NAME = "keryx-editor";
let handle = null;
let host = null;

// The console's dialog: fn({ theme, screen }) shows it (truthy = handled).
// Returns the unregister function.
export function setEditorHost(fn) {
    host = fn;
    return () => { if (host === fn) host = null; };
}

// openEditor({ theme: id|"new" } | { screen: path }, detached: true for the
// window) -> { error } when the browser blocked the window, else {}.
export function openEditor({ theme = "", screen = "", detached = false } = {}) {
    if (!detached && host && host({ theme, screen })) return {};
    const p = new URLSearchParams();
    if (theme) p.set("theme", theme);
    else if (screen) p.set("screen", screen);
    const q = p.toString();
    const win = window.open(`${window.location.origin}/Editor${q ? `?${q}` : ""}`, NAME, "width=1280,height=800");
    if (!win) return { error: "O navegador bloqueou a janela do editor: permita pop-ups para abrir o Editor de temas e telas." };
    handle = win;
    try { win.focus(); } catch { /* another window may refuse focus */ }
    return {};
}

export const editorOpen = () => Boolean(handle && !handle.closed);
