// Song lyrics from the web, for the console's "+ › Na internet…" dialog.
// Three sources, one list:
//   - Vagalume, through its official API (the church's own key, kept in
//     settings.json as lyrics.vagalumeKey): search and the full lyrics.
//   - LRCLIB (lrclib.net), an open lyrics database with a public API meant
//     for apps (no key; it asks for a User-Agent naming the app): search and
//     the full lyrics. Community-made: good on well-known worship songs,
//     thin on old hymns. It lists the same song many times (live, acoustic,
//     each upload): duplicates are folded.
//   - letras.mus.br, through the public suggestion index its own search box
//     uses: search only. Its lyric pages refuse automated access, so KERYX
//     does not fetch them; the operator opens the page in the browser and
//     pastes the lyrics (the dialog offers both).
// A source that fails (offline, no key, changed format) never hides the
// other's results: each reports its own error. Lyrics are copyrighted; the
// dialog says so, as the Holyrics one does.

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

// -- Vagalume -----------------------------------------------------------------

const vagalumeSearchUrl = (q, key) => `https://api.vagalume.com.br/search.excerpt?q=${encodeURIComponent(q)}&limit=${MAX_RESULTS}&apikey=${encodeURIComponent(key)}`;
const vagalumeSongUrl = (id, key) => `https://api.vagalume.com.br/search.php?musid=${encodeURIComponent(id)}&apikey=${encodeURIComponent(key)}`;

function parseVagalumeSearch(body) {
    let data;
    try { data = typeof body === "string" ? JSON.parse(body) : body; } catch { throw new LyricsError("Vagalume respondeu num formato desconhecido."); }
    const docs = data?.response?.docs || [];
    return docs
        .filter((d) => d.id && d.title)
        .map((d) => ({
            source: "vagalume",
            sourceLabel: "Vagalume",
            id: `vagalume:${d.id}`,
            title: clean(d.title),
            artist: clean(d.band),
            extra: "",
            pageUrl: d.url ? `https://www.vagalume.com.br${d.url}` : "",
            hasLyrics: true,
        }));
}

function parseVagalumeSong(body) {
    let data;
    try { data = typeof body === "string" ? JSON.parse(body) : body; } catch { throw new LyricsError("Vagalume respondeu num formato desconhecido."); }
    if (data?.type === "notfound" || data?.type === "song_notfound") throw new LyricsError("Letra não encontrada no Vagalume.", 404);
    const mus = Array.isArray(data?.mus) ? data.mus[0] : null;
    if (!mus?.text) throw new LyricsError("Letra não encontrada no Vagalume.", 404);
    return { title: clean(mus.name), artist: clean(data?.art?.name), lyrics: String(mus.text).replace(/\r\n/g, "\n").trim() };
}

// -- The service -----------------------------------------------------------------

function createLyrics({ settings, fetchImpl = fetch }) {
    const key = () => String(settings.get("lyrics", {})?.vagalumeKey || "").trim();
    const getText = async (url, label) => {
        let res;
        try {
            res = await fetchImpl(url, { headers: { "User-Agent": UA, Accept: "application/json,text/javascript,*/*" } });
        } catch {
            throw new LyricsError(`${label}: sem conexão com a internet.`, 503);
        }
        if (!res.ok) throw new LyricsError(`${label} indisponível agora (HTTP ${res.status}).`, 502);
        return res.text();
    };

    // -> { results: [...], errors: ["…"] }
    async function search(query) {
        const q = String(query || "").trim();
        if (q.length < 2) throw new LyricsError("Digite pelo menos duas letras do título ou do artista.", 400);
        const jobs = [
            getText(letrasSearchUrl(q), "letras.mus.br").then(parseLetrasSearch),
            getText(lrclibSearchUrl(q), "LRCLIB").then(parseLrclibSearch),
            key() ? getText(vagalumeSearchUrl(q, key()), "Vagalume").then(parseVagalumeSearch) : Promise.reject(new LyricsError("Vagalume: sem chave (cadastre em Chave do Vagalume).", 401)),
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
        const bySource = ["vagalume", "lrclib", "letras"].map((src) => results.filter((r) => r.source === src));
        const merged = [];
        for (let i = 0; merged.length < results.length; i++) for (const list of bySource) if (list[i]) merged.push(list[i]);
        return { results: merged.slice(0, MAX_RESULTS * 3), errors };
    }

    // -> { title, artist, lyrics } (Vagalume or LRCLIB; letras.mus.br pages are pasted)
    async function get(id) {
        const lr = /^lrclib:(\d+)$/.exec(String(id || ""));
        if (lr) return parseLrclibSong(await getText(lrclibSongUrl(lr[1]), "LRCLIB"));
        const m = /^vagalume:(.+)$/.exec(String(id || ""));
        if (!m) throw new LyricsError("A letra do letras.mus.br abre no navegador: copie e cole aqui.", 400);
        if (!key()) throw new LyricsError("Cadastre a chave do Vagalume para trazer a letra.", 401);
        return parseVagalumeSong(await getText(vagalumeSongUrl(m[1], key()), "Vagalume"));
    }

    const setKey = (value) => {
        settings.set("lyrics", { ...(settings.get("lyrics", {}) || {}), vagalumeKey: String(value || "").trim() });
        return { hasKey: Boolean(key()) };
    };
    const status = () => ({ hasKey: Boolean(key()) });

    return { search, get, setKey, status };
}

module.exports = { createLyrics, LyricsError, parseLetrasSearch, parseLrclibSearch, parseLrclibSong, parseVagalumeSearch, parseVagalumeSong };
