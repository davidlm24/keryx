// This window's errors into the daily log (Rodada N3): window.onerror,
// unhandledrejection and console.error go to main over keryxDesktop.log,
// which limits and writes them as "[renderer:<page>] …"
// (electron/rendererLog.cjs). Desktop windows only: a network screen or the
// browser preview has no keryxDesktop and sends nothing. Every page loads
// this (src/main.jsx), outputs included, so it stays tiny.

const MAX = 2048;

const text = (a) => {
    if (typeof a === "string") return a;
    if (a instanceof Error) return a.message || String(a);
    try { return JSON.stringify(a); } catch { return String(a); }
};

// console.error's arguments as one entry: the words, and the first Error's stack.
export function entryOf(level, args) {
    const err = args.find((a) => a instanceof Error);
    return { level, msg: args.map(text).join(" ").slice(0, MAX), stack: err?.stack ? String(err.stack).slice(0, MAX) : "" };
}

export function installRendererLog(win = window) {
    const send = win.keryxDesktop?.log;
    if (typeof send !== "function") return false;
    // The window's own allowance (main has the real limit): 20 a minute.
    let start = 0;
    let count = 0;
    const out = (entry) => {
        const t = Date.now();
        if (t - start >= 60000) { start = t; count = 0; }
        if (++count > 20) return;
        try { send(entry); } catch { /* never throw from a logger */ }
    };
    const original = win.console.error.bind(win.console);
    win.console.error = (...args) => { out(entryOf("error", args)); original(...args); };
    win.addEventListener("error", (e) => out(entryOf("error", [e.error || e.message || "erro"])));
    win.addEventListener("unhandledrejection", (e) => out(entryOf("error", ["Promessa rejeitada:", e.reason])));
    return true;
}
