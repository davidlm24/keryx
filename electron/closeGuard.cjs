// Closing the console closes the KERYX and blanks every screen. With
// something on air (and "Confirmar ao fechar" on, Configurações › Console)
// the X asks first. Never in the way of a quit already decided: the updater,
// an import or a restore (app.exit or app.quit, which say so through
// before-quit), nor of the smoke run unless it is testing this.

// This computer's console preferences (settings.json "machine").
const MACHINE_KEY = "machine";
const machinePrefs = (raw) => ({ confirmClose: raw?.confirmClose !== false });

// -> true when the X should ask before closing.
function shouldConfirmClose({ enabled, onAir, quitting }) {
    return Boolean(enabled && onAir && !quitting);
}

// The question; replaceable so the smoke can answer it.
// -> resolves true to close.
let ask = null;
const setAsk = (fn) => { ask = fn; };
const askClose = (dialog, win) => (ask ? ask() : dialog.showMessageBox(win, {
    type: "question",
    buttons: ["Continuar projetando", "Fechar o KERYX"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: "KERYX",
    message: "Há algo no ar.",
    detail: "Fechar o KERYX tira tudo das telas, inclusive das telas na rede.",
}).then(({ response }) => response === 1));

module.exports = { MACHINE_KEY, machinePrefs, shouldConfirmClose, setAsk, askClose };
