// Named arrangements (Ver › Disposição; owner 2026-10-13, the "Disposição
// do console" prototype): the operator saves an environment's dock as it is
// under a name ("Culto", "Ensaio", "Estudo") and switches between them. Each
// belongs to its environment (its dock's env: the culto or the Bíblia);
// names are unique within one. "Padrão" is the console's own and is not in
// the list: picking it restores that environment's default. Saved per
// computer with the console's layout (`layout.dockPresets`; the one in use:
// `dockPreset` for the culto, `bibleDockPreset` for the Bíblia; null =
// Padrão), like the arrangement itself. Pure: Console.jsx and the edit
// banner render it.
import { normalizeDock, dockEnv } from "./dock.js";

export const PADRAO = "Padrão";
export const MAX_PRESETS = 12;
const NAME_MAX = 40;

export const cleanName = (name) => String(name ?? "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
// The arrangements of one environment ("culto" | "biblia").
export const presetsFor = (list, env) => list.filter((p) => dockEnv(p.dock) === env);
const sameName = (a, b) => cleanName(a).toLocaleLowerCase("pt-BR") === cleanName(b).toLocaleLowerCase("pt-BR");

// A saved list made safe: entries with an id, a name (not "Padrão") and a
// dock, no two with the same id, nor the same name in one environment, at
// most MAX_PRESETS per environment.
export function normalizePresets(saved) {
    const out = [];
    for (const p of Array.isArray(saved) ? saved : []) {
        const name = cleanName(p?.name);
        if (!p || typeof p.id !== "string" || !p.id || !name || sameName(name, PADRAO) || !p.dock) continue;
        const dock = normalizeDock(p.dock);
        const mine = presetsFor(out, dockEnv(dock));
        if (out.some((q) => q.id === p.id) || mine.some((q) => sameName(q.name, name)) || mine.length >= MAX_PRESETS) continue;
        out.push({ id: p.id, name, dock });
    }
    return out;
}

// Why a name cannot be used for a new arrangement, or null when it can.
// `list`: the arrangements of its environment (presetsFor).
export function nameProblem(list, name) {
    const n = cleanName(name);
    if (!n) return "Dê um nome à disposição.";
    if (sameName(n, PADRAO)) return "“Padrão” é a disposição de fábrica; escolha outro nome.";
    if (list.some((p) => sameName(p.name, n))) return `Já existe uma disposição “${n}”.`;
    if (list.length >= MAX_PRESETS) return `Cabem ${MAX_PRESETS} disposições; exclua uma antes.`;
    return null;
}

// The dock saved as a new named arrangement. -> { list, id } (list unchanged
// and id null when the name cannot be used).
export function addPreset(list, name, dock, id) {
    if (nameProblem(presetsFor(list, dockEnv(dock)), name)) return { list, id: null };
    const p = { id, name: cleanName(name), dock: normalizeDock(dock) };
    return { list: [...list, p], id };
}

// The arrangement in use saved over its preset.
export const updatePreset = (list, id, dock) => list.map((p) => (p.id === id ? { ...p, dock: normalizeDock(dock) } : p));

export const removePreset = (list, id) => list.filter((p) => p.id !== id);

export const presetOf = (list, id) => (id ? list.find((p) => p.id === id) || null : null);

// The dock differs from its preset (tabs in front do not count, nor
// Travar fora da edição: the environment's switch, carried from one
// arrangement to the next, withLockOf).
const canon = (dock) => JSON.stringify(normalizeDock(dock), (k, v) => (k === "active" || k === "lock" ? undefined : v));
export const presetChanged = (preset, dock) => Boolean(preset) && canon(preset.dock) !== canon(dock);
