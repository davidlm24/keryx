// The console's tab rows that the operator trims (owner's design
// 2026-10-13): the panel beside the Prévia and the Biblioteca. Each ends in
// a (+) that lists every tab with a check mark: checked = the tab shows, in
// the list's order; at least one always stays; "Restaurar abas padrão" puts
// the defaults back. Saved per computer with the console's arrangement
// (`layout.tabs`, layout.js). Pure: Console.jsx and the panels render it.

// Every tab a row can show, in the order the row and the (+) list them.
// `on`: checked by default.
export const PANEL_TABS = {
    panel: [
        { id: "notas", name: "Notas", on: true },
        { id: "aviso", name: "Aviso rápido", on: true },
        { id: "timers", name: "Timers", on: true },
        // The Equipe's chat and song requests (Rodada Q; PedidosTab.jsx).
        { id: "pedidos", name: "Pedidos", on: true },
        { id: "ferramentas", name: "Ferramentas", hint: "relógio, cronômetro, texto" },
        { id: "historico", name: "Esteve no ar" },
    ],
    lib: [
        { id: "letras", name: "Letras", on: true },
        { id: "imagens", name: "Imagens", on: true },
        { id: "videos", name: "Vídeos", on: true },
        { id: "avisos", name: "Avisos", on: true },
        // Off at first (owner 2026-10-14): checked in the (+), each takes its
        // files out of the tab that held them (libMediaKinds).
        { id: "audios", name: "Áudios", hint: "músicas, playbacks, efeitos" },
        { id: "apresentacoes", name: "Apresentações", hint: "PDF e PowerPoint" },
    ],
};

// The Media types a Biblioteca tab lists. Áudios and Apresentações, when
// shown, take their files out of Vídeos and Imagens; hidden, those tabs keep
// them, so no file is ever out of reach. `shown`: the ids of the tabs shown.
const MEDIA_TABS = {
    imagens: ["image", "gif", "pdf", "powerpoint"],
    videos: ["video", "audio"],
    audios: ["audio"],
    apresentacoes: ["pdf", "powerpoint"],
};
export function libMediaKinds(tab, shown = []) {
    const kinds = MEDIA_TABS[tab];
    if (!kinds) return null;
    if (tab === "imagens" && shown.includes("apresentacoes")) return kinds.filter((k) => !MEDIA_TABS.apresentacoes.includes(k));
    if (tab === "videos" && shown.includes("audios")) return kinds.filter((k) => k !== "audio");
    return kinds;
}

// What each (+) list is headed with.
export const TABS_MENU_TITLE = { panel: "Mostrar neste painel", lib: "Mostrar na Biblioteca" };

const ids = (row) => PANEL_TABS[row].map((t) => t.id);

export const DEFAULT_TABS = Object.fromEntries(Object.keys(PANEL_TABS).map((row) => [row, PANEL_TABS[row].filter((t) => t.on).map((t) => t.id)]));

// One row's saved list made safe: known ids only, in the list's order, no
// repeats; nothing left (or not a list) is the defaults.
export function normalizeRow(row, saved) {
    const want = new Set(Array.isArray(saved) ? saved : []);
    const out = ids(row).filter((id) => want.has(id));
    return out.length ? out : [...DEFAULT_TABS[row]];
}

// Every row of a saved `layout.tabs` (an old save has none: the defaults).
export function normalizeTabs(saved) {
    return Object.fromEntries(Object.keys(PANEL_TABS).map((row) => [row, normalizeRow(row, saved?.[row])]));
}

// A tab checked or unchecked in the (+). The last one shown stays (the same
// list back, so the caller can tell nothing changed).
export function toggleTab(row, list, id) {
    const cur = normalizeRow(row, list);
    if (!ids(row).includes(id)) return cur;
    if (cur.includes(id)) return cur.length > 1 ? cur.filter((x) => x !== id) : cur;
    return normalizeRow(row, [...cur, id]);
}

// A tab made sure to show (a menu that leads to it, as KERYX › Avisos).
export const showTab = (row, list, id) => normalizeRow(row, [...normalizeRow(row, list), id]);

// The (+) list: every tab with its check.
export const tabsMenu = (row, list) => {
    const cur = normalizeRow(row, list);
    return PANEL_TABS[row].map((t) => ({ ...t, checked: cur.includes(t.id), last: cur.length === 1 && cur[0] === t.id }));
};

// The tabs on screen, in order.
export const shownTabs = (row, list) => {
    const cur = normalizeRow(row, list);
    return PANEL_TABS[row].filter((t) => cur.includes(t.id));
};

// The tab in front: the one chosen while it shows, else the first shown.
export const activeTab = (row, list, current) => {
    const cur = normalizeRow(row, list);
    return cur.includes(current) ? current : cur[0];
};
