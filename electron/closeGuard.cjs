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

module.exports = { MACHINE_KEY, machinePrefs, shouldConfirmClose, setAsk, askClose };
