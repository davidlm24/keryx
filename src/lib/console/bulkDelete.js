// Deleting several items at once (owner 2026-10-21, the "Seleção múltipla"
// mockup, M5 = A): ONE question (useConfirm), opening on Cancelar, that names
// what goes and warns what is in use — and still lets it go. Before, nothing
// checked: a song deleted from the Biblioteca left its Setlist item pointing
// at nothing.
//
// What "in use" means, by kind:
//   song, media, notice, material   a Setlist item points at it (contentId);
//                                   those items leave the setlist too
//   theme                           songs (theme_id or a part's), cultos,
//                                   modelos, the per-kind defaults, outputs,
//                                   the theme marked padrão: they fall back
//                                   to the default, as one theme always did
// A Mídia row deleted keeps its file in the media folder, so a song or a
// theme that uses the file as audio or background keeps working: only the
// Setlist, which points at the row, needs saying.

// pt-BR nouns: [singular, plural, feminine].
export const NOUNS = Object.freeze({
    song: ["música", "músicas", true],
    media: ["arquivo", "arquivos", false],
    notice: ["aviso", "avisos", false],
    material: ["material", "materiais", false],
    theme: ["tema", "temas", false],
    background: ["fundo", "fundos", false],
    item: ["item", "itens", false],
});

const LIST_MAX = 5;
const plural = (n, [one, many]) => (n === 1 ? one : many);

// The names shown in the question: up to 5, then "e mais n".
export function nameList(names, max = LIST_MAX) {
    const clean = names.map((n) => String(n || "").trim() || "Sem nome");
    if (clean.length <= max) return clean;
    return [...clean.slice(0, max - 1), `e mais ${clean.length - (max - 1)}`];
}

// "Domingo 20/10" — a culto by its name, else its date.
export function serviceName(service) {
    if (!service) return "outro culto";
    const date = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(service.date || ""));
    const day = date ? `${date[3]}/${date[2]}` : "";
    const name = String(service.title || service.name || "").trim();
    if (name && day && !name.includes(day)) return `${name} ${day}`;
    return name || day || "um culto";
}

// The Setlist items that point at any of `ids`.
export const itemsUsing = (ids, serviceItems = []) => {
    const set = ids instanceof Set ? ids : new Set(ids);
    return serviceItems.filter((it) => it && it.contentId && set.has(it.contentId));
};

// The warning lines for rows a Setlist uses ("2 estão na setlist de Domingo 20/10").
export function setlistLines(ids, { serviceItems = [], services = [] } = {}, noun = NOUNS.song) {
    const using = itemsUsing(ids, serviceItems);
    if (!using.length) return [];
    const rows = new Set(using.map((it) => it.contentId));
    const byService = new Map();
    for (const it of using) byService.set(it.serviceId, (byService.get(it.serviceId) || 0) + 1);
    const where = [...byService.keys()].map((sid) => services.find((s) => s.id === sid));
    const n = rows.size;
    const total = ids instanceof Set ? ids.size : ids.length;
    const verb = n === 1 ? "está" : "estão";
    const subject = total === 1 ? `${noun[2] ? "Ela" : "Ele"} ${verb}` : `${n} ${verb}`;
    const places = where.length === 1 ? `na setlist de ${serviceName(where[0])}` : `em ${where.length} setlists`;
    return [`${subject} ${places}: ${using.length === 1 ? "o item sai" : "os itens saem"} de lá também.`];
}

// Where themes are named (`data`: the rows the console holds). -> lines.
export function themeLines(ids, { songs = [], services = [], templates = [], outputPrefs = [], user = null, themes = [] } = {}) {
    const set = new Set(ids);
    const lines = [];
    const defaults = themes.filter((t) => set.has(t.id) && t.is_default);
    if (defaults.length) lines.push(`${defaults.map((t) => t.name || "Tema sem nome").join(", ")} é o tema padrão.`);
    const usesTheme = (s) => set.has(s.theme_id) || Object.values(s.part_themes || {}).some((v) => set.has(v));
    const counts = [
        [songs.filter(usesTheme).length, ["música", "músicas"]],
        [services.filter((s) => set.has(s.theme_id)).length, ["culto", "cultos"]],
        [templates.filter((t) => set.has(t.theme_id)).length, ["modelo de culto", "modelos de culto"]],
        [outputPrefs.filter((p) => set.has(p.theme_id)).length, ["saída", "saídas"]],
        [user ? ["bible_theme_id", "text_theme_id", "timer_theme_id"].filter((k) => set.has(user[k])).length : 0, ["tema padrão de um tipo", "temas padrão de um tipo"]],
    ].filter(([n]) => n > 0);
    if (counts.length) {
        const words = counts.map(([n, w]) => `${n} ${plural(n, w)}`);
        const who = words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} e ${words[words.length - 1]}`;
        // "1 música usa", "2 músicas usam", "1 música e 1 culto usam".
        const one = counts.length === 1 && counts[0][0] === 1;
        lines.push(`${who} ${one ? "usa" : "usam"} ${set.size === 1 ? "este tema" : "algum deles"}: ${one ? "volta" : "voltam"} ao padrão.`);
    }
    return lines;
}

// The question (ConfirmDialog: title, list, warn, text, ok). One row asks
// the way a single Excluir always did; several, by count.
export function bulkDeleteQuestion({ noun = NOUNS.item, names = [], warn = [], text = "", ok = "Excluir" } = {}) {
    const n = names.length;
    const [one, many, fem] = noun;
    if (n === 1) {
        return { title: `Excluir ${fem ? "a" : "o"} ${one}?`, text: [`"${String(names[0] || "").trim() || "Sem nome"}" sai do KERYX de vez.`, text].filter(Boolean).join(" "), warn, ok };
    }
    return { title: `Excluir ${n} ${many}?`, list: nameList(names), warn, text, ok: `${ok} ${n}` };
}

// After a bulk take-out: the order each remaining item of each touched culto
// takes (only the ones that change). `rest`: the items still in the store.
export function renumberPlan(rest = []) {
    const byService = new Map();
    for (const it of rest) {
        if (!byService.has(it.serviceId)) byService.set(it.serviceId, []);
        byService.get(it.serviceId).push(it);
    }
    const plan = [];
    for (const list of byService.values()) {
        list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        list.forEach((it, i) => { if (it.order !== i) plan.push({ id: it.id, order: i }); });
    }
    return plan;
}

// "3 excluídas", "1 excluído" — the toast after, by the noun's gender.
export function deletedSay(n, noun = NOUNS.item, failed = 0) {
    const [one, many, fem] = noun;
    const done = n === 1 ? `${fem ? "Excluída" : "Excluído"}: 1 ${one}` : `${n} ${many} ${fem ? "excluídas" : "excluídos"}`;
    return failed ? `${done} · ${failed} não ${failed === 1 ? "pôde" : "puderam"} ser ${fem ? (failed === 1 ? "excluída" : "excluídas") : (failed === 1 ? "excluído" : "excluídos")}.` : `${done}.`;
}

// Taking several items out of one culto's setlist (the Setlist and Planejar
// o culto): "Tirar", never "Excluir" (the songs and files stay in the
// KERYX), so it opens on the action, as the one-item question does.
export function takeOutManyQuestion(names = []) {
    const n = names.length;
    return {
        title: `Tirar ${n} ${n === 1 ? "item" : "itens"} da setlist?`,
        list: nameList(names),
        text: `${n === 1 ? "Ele sai" : "Eles saem"} da setlist deste culto e ${n === 1 ? "continua" : "continuam"} no KERYX.`,
        ok: `Tirar ${n}`,
    };
}
