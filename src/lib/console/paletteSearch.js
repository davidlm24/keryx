// The console's search, the palette (`/`; owner 2026-11-09, mockup "Console
// · busca (/)": P1 = B — no preview pane —, P2 to P5 = A). The parts with no
// React and no I/O: matching without case or accents ("graca" finds
// "Graça"), ranking (a title that starts with the words first), the kinds as
// scopes with their counts, the cut of each group, what shows before typing
// (what was on air, what comes next in the Setlist) and the commands (the
// menu bar's model, the screen actions, Configurações' sections). The
// Palette (Popovers.jsx) only draws what this returns.
import { fold, searchTerms, highlightParts } from "../bibleSearch.js";

export { fold };

// The kinds, in the chips' order. `all` is Tudo.
export const SCOPES = [
    { id: "all", label: "Tudo" },
    { id: "songs", label: "Músicas" },
    { id: "bible", label: "Bíblia" },
    { id: "media", label: "Mídia" },
    { id: "pieces", label: "Avisos" },
    { id: "school", label: "Escola" },
    { id: "setlist", label: "Setlist" },
    { id: "commands", label: "Comandos" },
];
export const SCOPE_NAMES = { songs: "Músicas", bible: "Bíblia", media: "Mídia", pieces: "Avisos", school: "Escola bíblica", setlist: "Setlist", commands: "Comandos" };

export const ALL_LIMIT = 4;      // each group in Tudo (Músicas 5)
export const SONGS_LIMIT = 5;
export const SCOPE_LIMIT = 30;   // a kind chosen
export const BIBLE_HITS = 3;     // the Bíblia's words inline in Tudo (P3)
export const RECENT = 4;         // before typing (P2)
export const NEXT = 3;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// How well `title` (and the other fields) answer the query: 0 = not at all.
// Every word of the query must be somewhere; the whole query at the start
// of the title wins, then at the start of one of its words, then inside it,
// then words spread over the title, then only the other fields.
export function score(query, title, rest = []) {
    const q = fold(query).replace(/\s+/g, " ").trim();
    if (!q) return 1;
    const terms = searchTerms(query);
    const t = fold(title);
    const all = [t, ...rest.map(fold)].join("\n");
    if (!(terms.length ? terms : [q]).every((w) => all.includes(w))) return 0;
    if (t === q) return 100;
    if (t.startsWith(q)) return 80;
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${esc(q)}`, "u").test(t)) return 60;
    if (t.includes(q)) return 40;
    if (terms.length && terms.every((w) => t.includes(w))) return 30;
    return 10;
}

// The rows that answer, best first; equal ones keep the list's order.
export function ranked(list, query, fieldsOf) {
    return list
        .map((x, i) => { const [title, ...rest] = fieldsOf(x); return { x, i, s: score(query, title, rest) }; })
        .filter((r) => r.s > 0)
        .sort((a, b) => b.s - a.s || a.i - b.i)
        .map((r) => r.x);
}

// The title cut into [{ text, hit }] for the query's words (bold in the row).
export const markParts = (text, query) => highlightParts(text, searchTerms(query));

// The groups on screen. `sections`: [{ id, rows }] in the order they show,
// each `rows` already ranked and whole. In Tudo each group is cut (`more`:
// how many were left out, "Ver mais"); a kind chosen shows only its group,
// up to SCOPE_LIMIT. `counts` (per kind, for the chips) count every row.
export function paletteGroups(sections, scope = "all") {
    const counts = {};
    for (const s of sections) counts[s.id] = (counts[s.id] || 0) + s.rows.length;
    const groups = [];
    for (const s of sections) {
        if (!s.rows.length) continue;
        if (scope !== "all" && s.id !== scope) continue;
        const cap = scope === "all" ? (s.limit ?? (s.id === "songs" ? SONGS_LIMIT : ALL_LIMIT)) : SCOPE_LIMIT;
        const list = s.rows.slice(0, cap);
        groups.push({ id: s.id, name: s.name || SCOPE_NAMES[s.id] || s.id, note: s.note || "", list, more: Math.max(0, (s.total ?? s.rows.length) - list.length) });
    }
    return { groups, counts, flat: groups.flatMap((g) => g.list) };
}

// The order of the groups in Tudo: a reference typed (or the palette opened
// in the Bíblia) puts the Bíblia first; the commands always last.
export function sectionOrder({ bibleFirst = false } = {}) {
    return bibleFirst
        ? ["bible", "songs", "setlist", "media", "pieces", "school", "commands"]
        : ["setlist", "songs", "bible", "media", "pieces", "school", "commands"];
}

// Tab / Shift+Tab: the next kind with something to show (Tudo always).
// With nothing typed every kind counts.
export function nextScope(current, dir, counts, typed) {
    const ids = SCOPES.map((s) => s.id).filter((id) => id === "all" || !typed || (counts[id] || 0) > 0);
    const at = Math.max(0, ids.indexOf(current));
    return ids[(at + (dir < 0 ? ids.length - 1 : 1)) % ids.length];
}

// ↑/↓ go round the list.
export const stepIndex = (i, dir, n) => (n ? (i + dir + n) % n : 0);

// Before typing (P2): what was on air, newest first, once each (the title
// and the layer), the first RECENT.
export function recentEntries(history, n = RECENT) {
    const seen = new Set();
    const out = [];
    for (const h of history || []) {
        if (!h?.title) continue;
        const k = `${h.layer}\n${h.title}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(h);
        if (out.length >= n) break;
    }
    return out;
}

// "há 12 min" for a recent row.
export function agoWords(at, now = Date.now()) {
    const min = Math.max(0, Math.round((now - at) / 60000));
    if (min < 1) return "agora";
    if (min < 60) return `há ${min} min`;
    const h = Math.round(min / 60);
    return h < 24 ? `há ${h} h` : "ontem ou antes";
}

// The next playable items of the Setlist after the one on air (from the
// first when nothing of it is on air), with their index in `items`.
export function nextEntries(items, airItemId, n = NEXT) {
    const at = items.findIndex((it) => it.id === airItemId);
    return items.map((it, i) => ({ it, i })).slice(at + 1).slice(0, n);
}

// The commands (P4): every item of the menu bar's model that can run now
// (its label, the menu it lives in as the meta, a submenu's items under
// their parent), the screen actions first and Configurações' sections last.
// Each command: { id, label, icon, kbd, meta, run }.
export function commandRows(menus = [], { screen = [], sections = [], onSection = null } = {}) {
    const out = [];
    const add = (it, meta) => {
        if (!it || it === "sep" || it.sep || it.head != null || it.node) return;
        if (it.sub) { for (const s of it.sub) add(s, `${meta} › ${it.label}`); return; }
        const run = it.onSelect || it.run;
        if (!it.label || it.disabled || typeof run !== "function") return;
        out.push({ id: `${meta}\n${it.label}`, label: it.label, icon: it.icon || "menu", kbd: it.kbd || "", meta: it.service ? `${meta} · ativar em todos os computadores` : meta, run });
    };
    for (const it of screen) add(it, "Telas");
    for (const m of menus) for (const it of m.items || []) add(it, m.label);
    if (onSection) for (const s of sections) out.push({ id: `cfg\n${s.id}`, label: `${s.name}…`, icon: s.icon || "sliders", kbd: "", meta: "Configurações", run: () => onSection(s.id) });
    const seen = new Set();
    return out.filter((c) => (seen.has(c.id) ? false : seen.add(c.id)));
}

// What Enter does on a row, in its hint ("↵ Pôr na prévia").
export const enterWord = (row) => row?.act || "Pôr na prévia";
