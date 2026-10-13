// Words the console says in more than one place, so they stay the same.
// (the 2026-10-09 presenter proposal, "Copy"; the README keeps
// shortcuts in tooltips, never printed on buttons.)

export const SEND_LABEL = "Enviar ao ar";
export const LOCKED_TIP = "Telas travadas · destrave em Saídas";

// The tooltip of every button that sends the Prévia (or the Bíblia's
// selection): Enter works once nothing is focused, Ctrl+Enter from anywhere
// except a text field.
export const SEND_TIP = `${SEND_LABEL} · Enter (Ctrl+Enter de qualquer lugar)`;

export const sendTip = (locked) => (locked ? LOCKED_TIP : SEND_TIP);
