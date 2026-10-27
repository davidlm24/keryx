// Relatórios: what was projected and when, from SongHistory (one row per
// song sent live), Song and Service. Plain JS, no imports, so node --test
// can check it.

export const PERIODS = [["30", "30 dias"], ["90", "3 meses"], ["365", "12 meses"], ["all", "Tudo"]];

// The first day counted (ISO), or null for everything.
export function periodStart(period, now = new Date()) {
    if (period === "all") return null;
    const d = new Date(now.getTime() - Number(period) * 86400000);
    return d.toISOString();
}

const inPeriod = (h, since) => !since || String(h.played_at || "") >= since;
const keyOf = (h) => h.song_id || `t:${String(h.song_title || "").toLowerCase()}`;

// -> [{ key, songId, title, artist, count, last }] most played first.
export function topSongs(history, since, limit = 15) {
    const by = new Map();
    for (const h of history || []) {
        if (!inPeriod(h, since)) continue;
        const k = keyOf(h);
        const row = by.get(k) || { key: k, songId: h.song_id || null, title: h.song_title || "Sem título", artist: h.song_artist || "", count: 0, last: "" };
        row.count += 1;
        if (String(h.played_at || "") > row.last) row.last = h.played_at;
        by.set(k, row);
    }
    return [...by.values()].sort((a, b) => b.count - a.count || String(b.last).localeCompare(String(a.last))).slice(0, limit);
}

export const SONG_CATEGORY = { worship: "Adoração", adoracao: "Adoração", praise: "Louvor", louvor: "Louvor", hymn: "Hino", contemporary: "Contemporânea", infantil: "Infantil", ceia: "Santa ceia", other: "Outras", outro: "Outras" };

// Songs played in the period by category of the song (Outras when unknown).
// -> [{ label, count }] largest first.
export function playsByCategory(history, songs, since) {
    const cat = new Map((songs || []).map((s) => [s.id, SONG_CATEGORY[s.category] || "Outras"]));
    const by = new Map();
    for (const h of history || []) {
        if (!inPeriod(h, since)) continue;
        const label = cat.get(h.song_id) || "Outras";
        by.set(label, (by.get(label) || 0) + 1);
    }
    return [...by.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
// Cultos in each of the last `months` months (by Service.date), oldest first.
export function servicesByMonth(services, months = 6, now = new Date()) {
    const out = [];
    for (let i = months - 1; i >= 0; i -= 1) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        out.push({ key, label: `${MONTHS[d.getMonth()]}${d.getMonth() === 0 || i === months - 1 ? `/${String(d.getFullYear()).slice(2)}` : ""}`, count: 0 });
    }
    const at = new Map(out.map((m, i) => [m.key, i]));
    for (const s of services || []) {
        const i = at.get(String(s.date || "").slice(0, 7));
        if (i !== undefined) out[i].count += 1;
    }
    return out;
}

// The CCLI report: every song with a CCLI number played in the period, with
// how many times. Matched by song id (the title only for old rows).
// -> [{ title, artist, ccli, plays }] most played first.
export function ccliReport(songs, history, since) {
    const plays = new Map();
    for (const h of history || []) if (inPeriod(h, since)) plays.set(keyOf(h), (plays.get(keyOf(h)) || 0) + 1);
    return (songs || [])
        .filter((s) => String(s.ccli_number || "").trim())
        .map((s) => ({ title: s.title || "", artist: s.artist || "", ccli: String(s.ccli_number).trim(), plays: (plays.get(s.id) || 0) + (plays.get(`t:${String(s.title || "").toLowerCase()}`) || 0) }))
        .filter((r) => r.plays > 0)
        .sort((a, b) => b.plays - a.plays || a.title.localeCompare(b.title, "pt-BR"));
}

// Tab-separated, for pasting into a spreadsheet or the CCLI site.
export const ccliText = (rows) => ["Música\tArtista\tCCLI\tProjeções", ...rows.map((r) => [r.title, r.artist, r.ccli, r.plays].join("\t"))].join("\n");
const csvCell = (v) => (/[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
export const ccliCsv = (rows) => ["Música;Artista;CCLI;Projeções", ...rows.map((r) => [r.title, r.artist, r.ccli, r.plays].map(csvCell).join(";"))].join("\n");
