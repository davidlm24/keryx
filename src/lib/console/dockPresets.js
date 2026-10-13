// Named arrangements of the culto environment (Ver › Disposição; owner
// 2026-10-13, the "Disposição do console" prototype): the operator saves the
// dock as it is under a name ("Culto", "Ensaio", "Bíblia em foco") and
// switches between them. "Padrão" is the console's own and is not in the
// list: picking it restores the default arrangement. Saved per computer with
// the console's layout (`layout.dockPresets`, `layout.dockPreset` = the id
// in use, null = Padrão), like the arrangement itself. Pure: Console.jsx and
// the edit banner render it.
import { normalizeDock } from "./dock.js";

export const PADRAO = "Padrão";
export const MAX_PRESETS = 12;
const NAME_MAX = 40;

export const cleanName = (name) => String(name ?? "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
const sameName = (a, b) => cleanName(a).toLocaleLowerCase("pt-BR") === cleanName(b).toLocaleLowerCase("pt-BR");

// A saved list made safe: entries with an id, a name (not "Padrão") and a
// dock, no two with the same id or name, at most MAX_PRESETS.
export function normalizePresets(saved) {
    const out = [];
    for (const p of Array.isArray(saved) ? saved : []) {
        const name = cleanName(p?.name);
        if (!p || typeof p.id !== "string" || !p.id || !name || sameName(name, PADRAO) || !p.dock) continue;
        if (out.some((q) => q.id === p.id || sameName(q.name, name))) continue;
        out.push({ id: p.id, name, dock: normalizeDock(p.dock) });
        if (out.length === MAX_PRESETS) break;
    }
    return out;
}

// Why a name cannot be used for a new arrangement, or null when it can.
// `except`: the preset being renamed.
export function nameProblem(list, name, except = null) {
    const n = cleanName(name);
    if (!n) return "Dê um nome à disposição.";
    if (sameName(n, PADRAO)) return "“Padrão” é a disposição de fábrica; escolha outro nome.";
    if (list.some((p) => p.id !== except && sameName(p.name, n))) return `Já existe uma disposição “${n}”.`;
    if (!except && list.length >= MAX_PRESETS) return `Cabem ${MAX_PRESETS} disposições; exclua uma antes.`;
    return null;
}

// The dock saved as a new named arrangement. -> { list, id } (list unchanged
// and id null when the name cannot be used).
export function addPreset(list, name, dock, id) {
    if (nameProblem(list, name)) return { list, id: null };
    const p = { id, name: cleanName(name), dock: normalizeDock(dock) };
    return { list: [...list, p], id };
}

// The arrangement in use saved over its preset.
export const updatePreset = (list, id, dock) => list.map((p) => (p.id === id ? { ...p, dock: normalizeDock(dock) } : p));

export const renamePreset = (list, id, name) => (nameProblem(list, name, id) ? list : list.map((p) => (p.id === id ? { ...p, name: cleanName(name) } : p)));

export const removePreset = (list, id) => list.filter((p) => p.id !== id);

export const presetOf = (list, id) => (id ? list.find((p) => p.id === id) || null : null);

// The dock differs from its preset (tabs in front do not count).
const canon = (dock) => JSON.stringify(normalizeDock(dock), (k, v) => (k === "active" ? undefined : v));
export const presetChanged = (preset, dock) => Boolean(preset) && canon(preset.dock) !== canon(dock);
