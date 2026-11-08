// The Biblioteca in folders (Rodada R, owner 2026-10-29, R4a = B, R4b = B):
// the folder button of the search row (and the eye's "Agrupar em pastas")
// groups the tab on screen, each tab keeping its own mode
// (layout.libGroup). The folders come only from what the rows already say
// — no field of their own: Letras one per artist (Song.artist), the media
// tabs one per church category of the Mídia (mediaCategories.js). Avisos
// has none. Folders the operator makes are future work.
import { mediaCategoriesInUse, mediaCategoryOf } from "./mediaCategories.js";

export const GROUP_TABS = ["letras", "videos", "imagens", "audios", "apresentacoes"];
export const canGroup = (tab) => GROUP_TABS.includes(tab);
export const NO_ARTIST = "Sem artista";

const fold = (s) => String(s || "").trim().toLocaleLowerCase("pt-BR");
const byName = (a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });

// One folder per artist, trimmed and grouped without case; its name is the
// spelling most rows use (the first one met on a tie). Alphabetical, "Sem
// artista" last. Rows keep their order inside a folder.
export function songFolders(songs = []) {
    const groups = new Map();
    for (const s of songs) {
        const artist = String(s?.artist || "").trim();
        const key = `a:${fold(artist)}`;
        let g = groups.get(key);
        if (!g) groups.set(key, (g = { key, rows: [], spell: new Map() }));
        g.rows.push(s);
        if (artist) g.spell.set(artist, (g.spell.get(artist) || 0) + 1);
    }
    const out = [...groups.values()].map((g) => {
        let name = NO_ARTIST, best = 0;
        for (const [spelling, n] of g.spell) if (n > best) { name = spelling; best = n; }
        return { key: g.key, name, rows: g.rows };
    });
    const none = out.filter((f) => f.key === "a:");
    return [...out.filter((f) => f.key !== "a:").sort(byName), ...none];
}

// One folder per category of the Mídia that has a file here, in the
// church's order (mediaCategoriesInUse: its list, then the names in use
// outside it, Outros last).
export function mediaFolders(media = [], stored = null) {
    return mediaCategoriesInUse(stored, media).map((name) => ({ key: `c:${name}`, name, rows: media.filter((m) => mediaCategoryOf(m) === name) }));
}

export const foldersOf = (tab, rows, stored = null) => (tab === "letras" ? songFolders(rows) : canGroup(tab) ? mediaFolders(rows, stored) : []);

// Open or closed, per folder: what the operator chose (layout.libFoldersOpen,
// { [tab]: { [key]: bool } }), else closed — or open when it is the only one.
export const folderOpen = (open, folder, total) => (typeof open?.[folder.key] === "boolean" ? open[folder.key] : total === 1);

// The rows on screen, in display order (closed folders out): the order the
// multi-selection walks (Shift ranges, Selecionar todos).
export const visibleRows = (folders, open) => folders.flatMap((f) => (folderOpen(open, f, folders.length) ? f.rows : []));

const WORDS = {
    letras: ["música", "músicas"],
    videos: ["vídeo", "vídeos"],
    imagens: ["imagem", "imagens"],
    audios: ["áudio", "áudios"],
    apresentacoes: ["apresentação", "apresentações"],
};
export const folderCount = (tab, n) => { const [one, many] = WORDS[tab] || ["item", "itens"]; return `${n} ${n === 1 ? one : many}`; };

// layout.libGroup and layout.libFoldersOpen made safe (loadLayout).
export function normalizeLibGroup(saved) {
    const out = {};
    if (saved && typeof saved === "object" && !Array.isArray(saved)) for (const t of GROUP_TABS) if (saved[t] === true) out[t] = true;
    return out;
}
export function normalizeFoldersOpen(saved) {
    const out = {};
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return out;
    for (const t of GROUP_TABS) {
        const m = saved[t];
        if (!m || typeof m !== "object" || Array.isArray(m)) continue;
        const keep = Object.entries(m).filter(([, v]) => typeof v === "boolean");
        if (keep.length) out[t] = Object.fromEntries(keep);
    }
    return out;
}
