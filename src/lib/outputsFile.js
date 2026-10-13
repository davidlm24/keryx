// Exportar / Importar ajustes das saídas (Configurações › Telas e saídas,
// 2026-10-12, as SPresenter's .spo): one JSON file with where each output
// opens (electron/outputs.cjs assignments: which screen, "Abrir ao iniciar")
// and each output's own settings (OutputPref rows: name, icon, Conteúdo,
// Mostrar, theme, scale, margins, logo, options). For after a reinstall, or
// to take a church's setup to another computer. Pure: the main process only
// saves and reads the file; the console validates it here and applies it
// through the same calls Configurações uses, so every window and network
// screen follows at once.
import { normalizePref, outputMeta } from "./outputPrefs.js";
import { findLayout } from "./layouts.js";

export const FILE_KIND = "keryx-saidas";
export const FILE_VERSION = 1;
export const MAX_FILE_BYTES = 1024 * 1024;

// The outputs with a placement (electron/outputs.cjs OUTPUTS) and the pages
// with settings (those plus Transmissão, network only).
export const OUTPUT_KEYS = ["/Projection", "/LyricProjection", "/VideoProjection", "/StageView", "/PastorView", "/CommunicationProjection"];
export const PREF_PATHS = [...OUTPUT_KEYS, "/StreamView"];

// A placement as the app writes it, else null: "auto", "window", or a screen
// ({ id, label, width, height }), with "Abrir ao iniciar" and whether the
// operator removed the output from the lists (which outputs a church uses is
// part of its setup; an older KERYX reading the file simply ignores the field).
export function cleanAssignment(a) {
    if (!a || typeof a !== "object") return null;
    const openAtLaunch = a.openAtLaunch === true;
    const removed = a.removed === true;
    const t = a.target;
    if (t === "auto" || t === "window") return { target: t, openAtLaunch, removed };
    if (t && typeof t === "object" && Number.isFinite(Number(t.id))) {
        return { target: { id: Number(t.id), label: String(t.label || "").slice(0, 120), width: Math.max(0, Math.round(Number(t.width) || 0)), height: Math.max(0, Math.round(Number(t.height) || 0)) }, openAtLaunch, removed };
    }
    return null;
}

// An OutputPref row as the file keeps it (the settings, never ids or dates);
// the theme travels with its name, so another computer can find its own.
function prefFields(row, themes, layouts) {
    const p = normalizePref(row);
    const theme = p.themeId ? (themes || []).find((t) => t.id === p.themeId) : null;
    const layout = p.layoutId ? findLayout(p.layoutId, layouts) : null;
    return {
        name: p.name,
        icon: p.icon,
        content: p.content,
        hidden_kinds: p.hidden,
        text_scale: Math.round(p.scale * 100),
        margin_pct: p.margin,
        show_logo: p.showLogo,
        theme_id: p.themeId,
        theme_name: theme ? theme.name || "" : "",
        // The layout travels by name too (a factory id is the same everywhere).
        layout_id: p.layoutId,
        layout_name: layout ? layout.name : "",
        options: p.options,
    };
}

// The file: every output's placement and every page's settings (a page
// without a row is written with the defaults, so importing restores it
// exactly, never only part of it).
export function buildOutputsFile({ outputs = [], prefRows = [], themes = [], layouts = [], displays = [], appVersion = "", now = Date.now() } = {}) {
    const assignments = {};
    for (const o of outputs) {
        if (!OUTPUT_KEYS.includes(o?.key)) continue;
        const a = cleanAssignment(o.assignment);
        if (a) assignments[o.key] = a;
    }
    const prefs = {};
    for (const path of PREF_PATHS) prefs[path] = prefFields((prefRows || []).find((r) => r?.screen_path === path) || null, themes, layouts);
    return {
        kind: FILE_KIND,
        version: FILE_VERSION,
        exportedAt: new Date(now).toISOString(),
        app: String(appVersion || ""),
        displays: (displays || []).map((d) => ({ label: String(d.label || ""), width: d.bounds?.width || d.width || 0, height: d.bounds?.height || d.height || 0, primary: Boolean(d.primary) })),
        assignments,
        prefs,
    };
}

export const fileName = (now = Date.now()) => `keryx-saidas-${new Date(now).toISOString().slice(0, 10)}.json`;

const screenName = (t) => `${t.label ? `“${t.label}” ` : ""}${t.width && t.height ? `${t.width}×${t.height}` : ""}`.trim() || "escolhida";

// The file read back and checked against this computer. ->
//   { error } when it is not a KERYX outputs file, else
//   { assignments: [{ key, assignment }], prefs: [{ path, fields }],
//     notes: [text], exportedAt, outputs: n, pages: n }
// notes say, in pt-BR, what will not come out the same here: a screen that is
// not plugged in (that output opens in a window until it is), a theme that
// does not exist here (that output follows the projection's).
export function readOutputsFile(text, { themes = [], layouts = [], displays = [] } = {}) {
    let data;
    try { data = JSON.parse(String(text || "")); } catch { return { error: "Este arquivo não é um arquivo de saídas do KERYX (não é JSON)." }; }
    if (!data || typeof data !== "object" || data.kind !== FILE_KIND) return { error: "Este arquivo não é um arquivo de saídas do KERYX." };
    if (!Number.isInteger(data.version) || data.version > FILE_VERSION) return { error: "Este arquivo foi feito por um KERYX mais novo. Atualize o KERYX e tente de novo." };

    const notes = [];
    const label = (key) => outputMeta(key).name;
    const assignments = [];
    for (const key of OUTPUT_KEYS) {
        const a = cleanAssignment(data.assignments?.[key]);
        if (!a) continue;
        assignments.push({ key, assignment: a });
        if (a.removed) notes.push(`${label(key)}: removida neste arquivo; some das Saídas (Adicionar saída traz de volta).`);
        if (typeof a.target === "object") {
            const t = a.target;
            const here = (displays || []).some((d) => d.id === t.id || (t.label && d.label === t.label && (d.bounds?.width || d.width) === t.width && (d.bounds?.height || d.height) === t.height));
            if (!here) notes.push(`${label(key)}: a tela ${screenName(t)} não está ligada neste computador; abre numa janela até ela ser ligada.`);
        }
    }

    const byName = new Map((themes || []).map((t) => [String(t.name || "").trim().toLocaleLowerCase("pt-BR"), t]));
    const byLayoutName = new Map((layouts || []).filter((l) => l?.id && l.name).map((l) => [String(l.name).trim().toLocaleLowerCase("pt-BR"), l]));
    const prefs = [];
    for (const path of PREF_PATHS) {
        const raw = data.prefs?.[path];
        if (!raw || typeof raw !== "object") continue;
        // normalizePref drops anything out of range or unknown.
        const p = normalizePref({ ...raw, screen_path: path });
        let themeId = "";
        if (p.themeId) {
            const same = (themes || []).find((t) => t.id === p.themeId);
            const named = byName.get(String(raw.theme_name || "").trim().toLocaleLowerCase("pt-BR"));
            themeId = same ? same.id : named ? named.id : "";
            if (!themeId) notes.push(`${label(path)}: o tema${raw.theme_name ? ` “${raw.theme_name}”` : ""} não existe neste computador; a saída segue o tema da projeção.`);
        }
        // The layout: the same id, else one with the same name here.
        let layoutId = "";
        if (p.layoutId) {
            const same = findLayout(p.layoutId, layouts);
            const named = byLayoutName.get(String(raw.layout_name || "").trim().toLocaleLowerCase("pt-BR"));
            layoutId = same ? same.id : named ? named.id : "";
            if (!layoutId) notes.push(`${label(path)}: o layout${raw.layout_name ? ` “${raw.layout_name}”` : ""} não existe neste computador; a saída volta à tela padrão.`);
        }
        prefs.push({
            path,
            fields: { name: p.name, icon: p.icon, content: p.content, hidden_kinds: p.hidden, text_scale: Math.round(p.scale * 100), margin_pct: p.margin, show_logo: p.showLogo, theme_id: themeId, layout_id: layoutId, options: p.options },
        });
    }
    if (!assignments.length && !prefs.length) return { error: "O arquivo não tem nenhuma saída." };
    return { assignments, prefs, notes, exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : "", outputs: assignments.length, pages: prefs.length };
}

// What applying the prefs does to the OutputPref rows: update the page's row,
// or create one. Rows are never deleted (the file carries every page).
export function prefWrites(prefs = [], rows = []) {
    return prefs.map(({ path, fields }) => {
        const row = (rows || []).find((r) => r?.screen_path === path);
        return row ? { op: "update", id: row.id, data: fields } : { op: "create", data: { screen_path: path, ...fields } };
    });
}
