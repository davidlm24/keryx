// Song lyrics from the web, for the console's "+ › Na internet…" dialog.
// Two sources, one list:
//   - LRCLIB (lrclib.net), an open lyrics database with a public API meant
//     for apps (no key; it asks for a User-Agent naming the app): search and
//     the full lyrics. Community-made: good on well-known worship songs,
//     thin on old hymns. It lists the same song many times (live, acoustic,
//     each upload): duplicates are folded.
//   - letras.mus.br, through the public suggestion index its own search box
//     uses: search only. Its lyric pages refuse automated access, so KERYX
//     does not fetch them; the operator opens the page in the browser and
//     pastes the lyrics (the dialog offers both).
// A source that fails (offline, changed format) never hides the other's
// results: each reports its own error. (Vagalume was dropped 2026-10-10: its
// API is down and no longer hands out keys.) Lyrics are copyrighted; the
// dialog says so, as the Holyrics one does.

const { withDeadline, TimeoutError } = require("./deadline.cjs");

// Each source's answer, body included; the dialog never waits for ever.
const LYRICS_TIMEOUT_MS = 15000;

class LyricsError extends Error {
    constructor(message, status = 502) {
        super(message);
        this.status = status;
    }
}

let appVersion = "0";
try { appVersion = require("../package.json").version; } catch { /* unknown */ }
const UA = `KERYX ${appVersion} (church projection app; https://github.com/comunidadegerar/keryx-releases)`;
const MAX_RESULTS = 15;

const decode = (s) => String(s || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const clean = (s) => decode(s).replace(/\s+/g, " ").trim();

// -- letras.mus.br ------------------------------------------------------------

const letrasSearchUrl = (q) => `https://solr.sscdn.co/letras/m1/?q=${encodeURIComponent(q)}&wt=json&callback=LetrasSug`;

// The suggestion index answers JSONP: LetrasSug({...}). Songs have t === "2".
function parseLetrasSearch(body) {
    const text = String(body || "").trim();
    const start = text.indexOf("(");
    const end = text.lastIndexOf(")");
    const json = start >= 0 && end > start ? text.slice(start + 1, end) : text;
    let data;
    try { data = JSON.parse(json); } catch { throw new LyricsError("letras.mus.br respondeu num formato desconhecido."); }
    const docs = data?.response?.docs || [];
    return docs
        .filter((d) => String(d.t) === "2" && d.dns && d.url)
        .map((d) => ({
            source: "letras",
            sourceLabel: "letras.mus.br",
            id: `letras:${d.dns}/${d.url}`,
            title: clean(d.txt),
            artist: clean(d.art),
            extra: clean(d.extra_txt),
            pageUrl: `https://www.letras.mus.br/${d.dns}/${d.url}/`,
            hasLyrics: false,
        }));
}

// -- LRCLIB -------------------------------------------------------------------

const lrclibSearchUrl = (q) => `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`;
const lrclibSongUrl = (id) => `https://lrclib.net/api/get/${encodeURIComponent(id)}`;
const fold = (s) => clean(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// An array of { id, trackName, artistName, albumName, instrumental, plainLyrics }.
// Only songs with lyrics; one per title and artist (accents and case aside).
function parseLrclibSearch(body) {
    let data;
    try { data = typeof body === "string" ? JSON.parse(body) : body; } catch { throw new LyricsError("LRCLIB respondeu num formato desconhecido."); }
    if (!Array.isArray(data)) throw new LyricsError("LRCLIB respondeu num formato desconhecido.");
    const seen = new Set();
    const out = [];
    for (const d of data) {
        if (!d || !d.id || !d.trackName || d.instrumental || !String(d.plainLyrics || "").trim()) continue;
        const key = `${fold(d.trackName)}|${fold(d.artistName)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
            source: "lrclib",
            sourceLabel: "LRCLIB",
            id: `lrclib:${d.id}`,
            title: clean(d.trackName),
            artist: clean(d.artistName),
            extra: clean(d.albumName),
            pageUrl: "",
            hasLyrics: true,
        });
        if (out.length >= MAX_RESULTS) break;
    }
    return out;
}

function parseLrclibSong(body) {
    let data;
    try { data = typeof body === "string" ? JSON.parse(body) : body; } catch { throw new LyricsError("LRCLIB respondeu num formato desconhecido."); }
    const text = String(data?.plainLyrics || "").replace(/\r\n/g, "\n").trim();
    if (!text) throw new LyricsError("Letra não encontrada no LRCLIB.", 404);
    return { title: clean(data.trackName), artist: clean(data.artistName), lyrics: text };
}

// -- The service -----------------------------------------------------------------

function createLyrics({ fetchImpl = fetch, timeoutMs = LYRICS_TIMEOUT_MS } = {}) {
    const getText = async (url, label) => {
        try {
            return await withDeadline(async (signal) => {
                const res = await fetchImpl(url, { headers: { "User-Agent": UA, Accept: "application/json,text/javascript,*/*" }, signal });
                if (!res.ok) throw new LyricsError(`${label} indisponível agora (HTTP ${res.status}).`, 502);
                return res.text();
            }, timeoutMs);
        } catch (err) {
            if (err instanceof LyricsError) throw err;
            if (err instanceof TimeoutError) throw new LyricsError(`${label} não respondeu a tempo.`, 504);
            throw new LyricsError(`${label}: sem conexão com a internet.`, 503);
        }
    };

    // -> { results: [...], errors: ["…"] }
    async function search(query) {
        const q = String(query || "").trim();
        if (q.length < 2) throw new LyricsError("Digite pelo menos duas letras do título ou do artista.", 400);
        const jobs = [
            getText(lrclibSearchUrl(q), "LRCLIB").then(parseLrclibSearch),
            getText(letrasSearchUrl(q), "letras.mus.br").then(parseLetrasSearch),
        ];
        const settled = await Promise.allSettled(jobs);
        const results = [];
        const errors = [];
        for (const r of settled) {
            if (r.status === "fulfilled") results.push(...r.value);
            else errors.push(r.reason?.message || "Fonte indisponível.");
        }
        // Interleave the sources so each shows at the top (the ones that bring
        // the lyrics first), then trim.
        const bySource = ["lrclib", "letras"].map((src) => results.filter((r) => r.source === src));
        const merged = [];
        for (let i = 0; merged.length < results.length; i++) for (const list of bySource) if (list[i]) merged.push(list[i]);
        return { results: merged.slice(0, MAX_RESULTS * 3), errors };
    }

    // -> { title, artist, lyrics } (LRCLIB; letras.mus.br pages are pasted)
    async function get(id) {
        const lr = /^lrclib:(\d+)$/.exec(String(id || ""));
        if (lr) return parseLrclibSong(await getText(lrclibSongUrl(lr[1]), "LRCLIB"));
        throw new LyricsError("A letra do letras.mus.br abre no navegador: copie e cole aqui.", 400);
    }

    return { search, get };
}

module.exports = { createLyrics, LyricsError, parseLetrasSearch, parseLrclibSearch, parseLrclibSong };
