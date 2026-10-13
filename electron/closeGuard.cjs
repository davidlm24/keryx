// Closing the console closes the KERYX and blanks every screen. With
// "Perguntar antes de fechar" on (Configurações › Console) the X always asks
// first, and says so when something is on air. Never in the way of a quit already decided: the updater,
// an import or a restore (app.exit or app.quit, which say so through
// before-quit), nor of the smoke run unless it is testing this.

// This computer's console preferences (settings.json "machine").
const MACHINE_KEY = "machine";
const machinePrefs = (raw) => ({ confirmClose: raw?.confirmClose !== false });

// -> true when the X should ask before closing.
function shouldConfirmClose({ enabled, quitting }) {
    return Boolean(enabled && !quitting);
}

// The question; replaceable so the smoke can answer it.
// -> resolves true to close.
let ask = null;
const setAsk = (fn) => { ask = fn; };
const askClose = (dialog, win, onAir = false) => (ask ? ask() : dialog.showMessageBox(win, {
    type: "question",
    buttons: [onAir ? "Continuar projetando" : "Cancelar", "Fechar o KERYX"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: "KERYX",
    message: onAir ? "Há algo no ar." : "Fechar o KERYX?",
    detail: onAir
        ? "Fechar o KERYX tira tudo das telas, inclusive das telas na rede."
        : "As telas de projeção e as telas na rede também serão fechadas.",
}).then(({ response }) => response === 1));

// A page with unsaved changes (the Editor) holds its window with its
// beforeunload; Electron then keeps the window without a word (and a quit
// with it). main.cjs asks this instead, synchronously, from the window's
// "will-prevent-unload". Replaceable so the smoke can answer it.
// -> true to let the window go (the changes are lost).
let askLeaveFn = null;
const setAskLeave = (fn) => { askLeaveFn = fn; };
const askLeave = (dialog, win) => (askLeaveFn ? askLeaveFn() : dialog.showMessageBoxSync(win, {
    type: "question",
    buttons: ["Continuar editando", "Descartar as mudanças"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: "KERYX",
    message: "Há mudanças não salvas.",
    detail: "Se continuar, o que não foi salvo nesta janela se perde.",
}) === 1);

// What a window emits when the operator chose "Continuar editando".
const KEPT_OPEN = "keryx:kept-open";

// Closing KERYX: these windows (the Editor) close first, so one with unsaved
// changes asks while the console is still up. -> resolves true once all of
// them closed, false as soon as one stayed (it emitted KEPT_OPEN); the quit
// then does not happen. A window that does neither within `wait` ms (a page
// that hung) is destroyed; while a question is on screen the main process
// waits for it, so that clock never runs out under it.
function closeAll(windows, { wait = 3000 } = {}) {
    const open = (windows || []).filter((w) => !w.isDestroyed());
    if (!open.length) return Promise.resolve(true);
    return new Promise((resolve) => {
        let left = open.length;
        let settled = false;
        const undo = [];
        const finish = (ok) => {
            if (settled) return;
            settled = true;
            for (const u of undo) u();
            resolve(ok);
        };
        for (const w of open) {
            const onClosed = () => { left -= 1; if (left === 0) finish(true); };
            const onKept = () => finish(false);
            const timer = setTimeout(() => { if (!settled && !w.isDestroyed()) w.destroy(); }, wait);
            w.once("closed", onClosed);
            w.once(KEPT_OPEN, onKept);
            undo.push(() => { clearTimeout(timer); w.removeListener("closed", onClosed); w.removeListener(KEPT_OPEN, onKept); });
        }
        for (const w of open) if (!w.isDestroyed()) w.close();
    });
}

module.exports = { MACHINE_KEY, machinePrefs, shouldConfirmClose, setAsk, askClose, setAskLeave, askLeave, KEPT_OPEN, closeAll };
