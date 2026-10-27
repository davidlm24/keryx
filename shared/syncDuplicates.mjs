// Músicas repetidas (docs/desktop-architecture.md §8b, the first join): when
// two computers that each had their own copy of a song start syncing, both
// copies stay (the join merges, it never replaces), and the operator is told
// which look like the same song. Configurações › Sincronização shows
// them and runs the plan; the main process rings the bell once after a
// join (electron/syncControl.cjs). Shared, pure: no Node, no DOM.
//
// Likely the same: the same title and the same lyrics once case, accents,
// punctuation, chords ([G], [Am7]) and spacing are set aside.

const fold = (text) => String(text ?? "")
    .normalize("NFD").replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR");

const words = (text) => fold(text).replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// The text a song is compared by.
export function songKey(song) {
    const lyrics = String(song?.lyrics ?? "").replace(/\[[^\]\n]{1,12}\]/g, " ");
    return `${words(song?.title)}\u0000${words(lyrics)}`;
}

// A pair the operator said to keep, as stored: the two ids in order.
export const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

const newestFirst = (a, b) => String(b.updated_date || "").localeCompare(String(a.updated_date || "")) || (a.id < b.id ? -1 : 1);

// -> [{ key, title, songs }]: groups of 2+ songs that look the same, each
// newest first, the groups by title. `kept`: pairKeys to leave out ("Manter
// as duas"); a group shows while any of its pairs is not kept. A song with
// no title is never grouped.
export function duplicateSongs(songs, kept = []) {
    const skip = new Set(kept);
    const groups = new Map();
    for (const song of songs || []) {
        if (!song?.id || !words(song.title)) continue;
        const key = songKey(song);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(song);
    }
    const out = [];
    for (const [key, list] of groups) {
        if (list.length < 2) continue;
        const pairs = keepPairs(list);
        if (pairs.every((p) => skip.has(p))) continue;
        const sorted = [...list].sort(newestFirst);
        out.push({ key, title: sorted[0].title, songs: sorted });
    }
    return out.sort((a, b) => fold(a.title).localeCompare(fold(b.title), "pt-BR"));
}

// The pairKeys of every two songs in a group ("Manter as duas" keeps them all).
export function keepPairs(songs) {
    const ids = songs.map((s) => s.id);
    const out = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) out.push(pairKey(ids[i], ids[j]));
    return out;
}

// "Juntar em uma": the newest copy stays; every setlist item, template item
// and history row that points at another copy points at it instead; then the
// others are deleted. -> { keep, remove, items, templates, history } where
// items / history are [{ id, patch }] and templates [{ id, patch: { items } }].
export function mergePlan(group, { serviceItems = [], templates = [], history = [] } = {}) {
    const [keep, ...rest] = [...group.songs].sort(newestFirst);
    const remove = rest.map((s) => s.id);
    const gone = new Set(remove);
    const items = serviceItems
        .filter((it) => it.type === "SONG" && gone.has(it.contentId))
        .map((it) => ({ id: it.id, patch: { contentId: keep.id } }));
    const tpl = [];
    for (const t of templates) {
        if (!Array.isArray(t.items) || !t.items.some((it) => it && it.type === "SONG" && gone.has(it.contentId))) continue;
        tpl.push({ id: t.id, patch: { items: t.items.map((it) => (it && it.type === "SONG" && gone.has(it.contentId) ? { ...it, contentId: keep.id } : it)) } });
    }
    const hist = history
        .filter((h) => gone.has(h.song_id))
        .map((h) => ({ id: h.id, patch: { song_id: keep.id } }));
    return { keep, remove, items, templates: tpl, history: hist };
}
