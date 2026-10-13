// Mensagens prontas do Aviso rápido (AlertPreset rows, 2026-10-12): texts the
// operator keeps to send to the screens in a click ("Chamar pessoa", "Kids",
// "Carro placa …"). A click puts one in the field (to complete it), a double
// click shows it at once, as everywhere in the console. Pure: no I/O.

export const PRESET_MAX = 200;

// The text as it is kept and shown: trimmed, runs of spaces and line breaks
// collapsed to one space, cut at PRESET_MAX.
export const cleanPreset = (text) => String(text ?? "").replace(/\s+/g, " ").trim().slice(0, PRESET_MAX);

const same = (a, b) => cleanPreset(a).toLocaleLowerCase("pt-BR") === cleanPreset(b).toLocaleLowerCase("pt-BR");

// Can this text be kept? { ok, why }: not empty, and not already there
// (ignoring case and spacing).
export function canKeep(text, presets = []) {
    const t = cleanPreset(text);
    if (!t) return { ok: false, why: "Escreva a mensagem antes de salvar." };
    if (presets.some((p) => same(p.message, t))) return { ok: false, why: "Esta mensagem já está salva." };
    return { ok: true, why: "" };
}

// The row of a text, when it is kept (to tell "Guardar" from "Já guardada").
export const presetOf = (text, presets = []) => presets.find((p) => same(p.message, text)) || null;

// The rows in the order they were kept (oldest first), blank ones dropped.
export const orderPresets = (rows = []) => rows
    .filter((r) => cleanPreset(r?.message))
    .slice()
    .sort((a, b) => String(a.created_date || "").localeCompare(String(b.created_date || "")));
