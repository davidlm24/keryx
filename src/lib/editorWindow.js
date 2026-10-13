// The Editor de temas e layouts opens in its own window (/Editor in
// src/App.jsx): the operator edits, closes the window and is back where they
// were — the console never swaps views for it. On the desktop it is a real
// window (main.cjs's window-open handler gives any app-origin page the
// preload and IPC; non-output paths are not tracked, so it keeps its frame
// and taskbar button); in the browser preview it is a tab. One window at a
// time: the name makes a second open navigate the first (its unsaved-changes
// guard still asks), and focus() brings it forward.

const NAME = "keryx-editor";
let handle = null;

// openEditor({ layout: id|"new"|"factory:…" } | { theme: id|"new" }, for:
// an output path that "Ver como" and the first save should bind to.
// -> { error } when the browser blocked the window, else {}.
export function openEditor({ theme = "", layout = "", for: forPath = "" } = {}) {
    const p = new URLSearchParams();
    if (theme) p.set("theme", theme);
    else if (layout) p.set("layout", layout);
    if (forPath) p.set("for", forPath);
    const q = p.toString();
    const win = window.open(`${window.location.origin}/Editor${q ? `?${q}` : ""}`, NAME, "width=1280,height=800");
    if (!win) return { error: "O navegador bloqueou a janela do editor: permita pop-ups para abrir o Editor de temas e layouts." };
    handle = win;
    try { win.focus(); } catch { /* another window may refuse focus */ }
    return {};
}

export const editorOpen = () => Boolean(handle && !handle.closed);
