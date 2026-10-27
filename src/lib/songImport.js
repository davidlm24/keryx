// Songs from text: cifra/ChordPro and plain lyrics files from the computer,
// lyrics pasted or brought from the web. Pure (no React, no I/O), so node
// --test checks it; the console's "+ › Letras" and ChordImporter use it.
import { isChordLine, stripLine, stripChords, hasInlineChords } from "./chords.js";
import { generateSlides } from "../utils/songSections.js";
import { isOpenLyrics, parseOpenLyrics } from "./songFormats/openlyrics.js";
import { isHolyrics, parseHolyrics } from "./songFormats/holyrics.js";
import { songKey } from "../../shared/syncDuplicates.mjs";

// ChordPro uses directives in braces: {title:}, {c:}, {soc}, {eoc}, {sov}, {eov}.
export const isChordPro = (raw) => /\{(title|t|artist|c|soc|eoc|sov|eov|comment|start_of_chorus|end_of_chorus|start_of_verse|end_of_verse)(:|\})\s*/i.test(raw);

const CHORUS_RE = /refr[ãa]o|coro|chorus/i;

// -> [{ section, text }]
export function parseChordPro(raw) {
    const lines = String(raw).split(/\r?\n/);
    const sections = [];
    let currentSection = "Verso 1";
    let currentLines = [];
    let inChorus = false;
    let inVerse = false;
    const flush = () => {
        if (currentLines.length > 0) sections.push({ section: currentSection, text: currentLines.join("\n").trim() });
        currentLines = [];
    };
    for (const line of lines) {
        const trimmed = line.trim();
        const directive = trimmed.match(/^\{(\w+):?\s*(.*?)\}$/i);
        if (directive) {
            const key = directive[1].toLowerCase();
            const val = directive[2] || "";
            if (key === "soc" || key === "start_of_chorus") { flush(); currentSection = "Refrão"; inChorus = true; continue; }
            if (key === "eoc" || key === "end_of_chorus") { inChorus = false; flush(); currentSection = "Verso"; continue; }
            if (key === "sov" || key === "start_of_verse") { flush(); currentSection = val ? `Verso ${val}` : "Verso"; inVerse = true; continue; }
            if (key === "eov" || key === "end_of_verse") { inVerse = false; flush(); currentSection = "Verso"; continue; }
            if (key === "c" || key === "comment") { flush(); currentSection = val || "Comentário"; continue; }
            continue; // title, artist, key… are read by songFromText
        }
        if (trimmed === "" && !inChorus && !inVerse && currentLines.length === 0) continue;
        currentLines.push(line.replace(/\[([^\]]+)\]/g, "")); // inline chords [C] [G] out
    }
    flush();
    return sections.filter((s) => s.text);
}

// A line that is only chords ("C   G/B   Am7   F") is dropped from lyrics.
export { isChordLine };

const SECTION_MARKERS = /^\s*\[?\s*(verso|refr[ãa]o|coro|ponte|intro|introdu[çc][ãa]o|outro|solo|pr[ée]-?refr[ãa]o|pr[ée]-?coro|bridge|chorus|verse|interlude|interl[úu]dio|final)\s*\d*\s*\]?\s*[:\-)]?\s*$/i;

// Plain text with optional section markers ("Refrão:", "[Verso 2]"); else
// blocks split by blank lines. -> [{ section, text }]
export function parseChords(raw) {
    if (isChordPro(raw)) return parseChordPro(raw);
    const lines = String(raw).split(/\r?\n/).filter((l) => !isChordLine(l));
    const sections = [];
    let currentSection = null;
    let currentLines = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "" && currentLines.length === 0) continue;
        if (SECTION_MARKERS.test(trimmed) && trimmed.length < 40) {
            if (currentSection && currentLines.length > 0) sections.push({ section: currentSection, text: currentLines.join("\n").trim() });
            currentSection = trimmed.replace(/^\[|\]$|[:\-)]$/g, "").trim();
            currentLines = [];
        } else {
            currentLines.push(line);
        }
    }
    if (currentSection && currentLines.length > 0) sections.push({ section: currentSection, text: currentLines.join("\n").trim() });
    if (!currentSection && currentLines.length > 0) sections.push({ section: "Verso 1", text: currentLines.join("\n").trim() });
    if (sections.length <= 1) {
        // No sections found: blank lines split the slides.
        return lines.join("\n").split(/\n\s*\n/).filter((b) => b.trim()).map((b, i) => ({ section: `Parte ${i + 1}`, text: b.trim() }));
    }
    // A section longer than a slide splits on its own blank lines.
    return sections.flatMap((s) => s.text.split(/\n\s*\n/).filter((b) => b.trim()).map((b) => ({ section: s.section, text: b.trim() })));
}

const directive = (raw, ...keys) => {
    for (const k of keys) {
        const m = new RegExp(`\\{${k}:\\s*(.*?)\\}`, "i").exec(raw);
        if (m) return m[1].trim();
    }
    return "";
};

// Long stanzas cut into slides of at most n lines (the "Ao importar" preference, Configurações › Bíblia e músicas,
// "Ao importar"); 0 keeps each stanza whole.
export function splitLines(sections, n) {
    if (!n) return sections;
    return sections.flatMap((s) => {
        const lines = s.text.split("\n");
        if (lines.length <= n) return [s];
        const out = [];
        for (let i = 0; i < lines.length; i += n) out.push({ section: s.section, text: lines.slice(i, i + n).join("\n") });
        return out;
    });
}

// A Song row (Song entity: title and lyrics required) from one text.
// name: the file name, the fallback title; lines: see splitLines.
// -> { title, artist, lyrics, slides }
export function songFromText(raw, { name = "", title = "", artist = "", lines = 0 } = {}) {
    const text = String(raw || "").replace(/\r\n/g, "\n").trim();
    const stanzas = parseChords(text);
    const sections = splitLines(stanzas, lines);
    const lyrics = stanzas.map((s) => s.text).join("\n\n");
    const baseName = String(name).replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
    return {
        title: title || directive(text, "title", "t") || baseName || (lyrics.split("\n")[0] || "Sem título").slice(0, 80),
        artist: artist || directive(text, "artist", "subtitle", "st"),
        ...(directive(text, "copyright") ? { copyright: directive(text, "copyright") } : {}),
        lyrics,
        slides: sections.map((s) => ({ text: s.text, duration: 0, ...(CHORUS_RE.test(s.section) ? { is_chorus: true } : {}) })),
        // The editor redoes the slides with the same split when the lyrics change.
        lines_per_slide: linesLimit(lines),
    };
}

// The JSON the songs page exports ({ songs: [...] } or a bare list): rows
// with a title and lyrics only.
export function songsFromJson(raw) {
    let data;
    try { data = JSON.parse(raw); } catch { throw new Error("Arquivo JSON inválido."); }
    const list = Array.isArray(data) ? data : Array.isArray(data?.songs) ? data.songs : [];
    return list.filter((s) => s && s.title && s.lyrics).map(({ id, created_date, updated_date, created_by_id, ...rest }) => rest);
}

// A file's bytes as text: a BOM says UTF-8 or UTF-16; else UTF-8 when it is
// valid, else the XML declaration's encoding, else Windows-1252 (the old
// Brazilian .txt). A string passes as it is; null = a binary file.
export function decodeSongBytes(raw) {
    if (typeof raw === "string") return raw;
    const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder("utf-8").decode(bytes.subarray(3));
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
    if (bytes.subarray(0, 8192).includes(0)) return null; // ProPresenter 7, a database, a zip
    try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { /* not UTF-8 */ }
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 200));
    const declared = /^\s*<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(head)?.[1];
    try { if (declared) return new TextDecoder(declared).decode(bytes); } catch { /* a label this runtime lacks */ }
    return new TextDecoder("windows-1252").decode(bytes);
}

// What a file is, by its content — never its extension alone: ".pro" is
// ChordPro text and also ProPresenter 7's binary. -> "json" | "openlyrics" |
// "text", or throws the pt-BR reason the import shows next to the file name.
export function sniffSongFile(name, text) {
    if (text === null) {
        if (/\.pro$/i.test(name)) throw new Error("do ProPresenter 7, que o KERYX ainda não lê");
        throw new Error("não é um arquivo de texto");
    }
    const head = text.replace(/^﻿/, "").trimStart();
    if (head.startsWith("<")) {
        if (/<RVPresentationDocument\b/.test(head.slice(0, 4096))) throw new Error("do ProPresenter 6, que o KERYX ainda não lê");
        if (isOpenLyrics(head)) return "openlyrics";
        if (head.startsWith("<?xml") || /^<([\w:]+)[\s\S]*<\/\1>\s*$/.test(head)) throw new Error("XML que não é do OpenLyrics");
    }
    if (/\.json$/i.test(name)) return "json";
    if (/^[[{]/.test(head) && !isChordPro(head)) { try { JSON.parse(head); return "json"; } catch { /* text */ } }
    return "text";
}

// A parsed song (title, artist, lyrics with [Parte] labels and inline
// chords…) as a Song row: its slides from the lyrics, with the Palco's
// chorded twins when there are chords.
export function songRow(parsed, { name = "", lines = 0 } = {}) {
    const n = linesLimit(lines);
    const baseName = String(name).replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
    return {
        ...parsed,
        title: parsed.title || baseName || "Sem título",
        slides: slidesFromLyrics(parsed.lyrics, { lines: n, chorded: hasInlineChords(parsed.lyrics) }),
        lines_per_slide: n,
    };
}

// Any file the "+ › Do computador" picker accepts: its text or its bytes.
// -> [song rows]; throws the reason a file cannot come in.
export const songsFromFile = (name, raw, opts) => readSongFile(name, raw, opts).rows;

// The same, with the format's name the import shows. -> { format, rows }
export function readSongFile(name, raw, { lines = 0 } = {}) {
    const text = decodeSongBytes(raw);
    const kind = sniffSongFile(name, text);
    if (kind === "json") {
        let data;
        try { data = JSON.parse(text); } catch { throw new Error("Arquivo JSON inválido."); }
        if (isHolyrics(data)) return { format: "Holyrics", rows: parseHolyrics(data).map((s) => songRow(s, { name, lines })) };
        return { format: "KERYX", rows: songsFromJson(text) };
    }
    if (kind === "openlyrics") return { format: "OpenLyrics", rows: parseOpenLyrics(text).map((s) => songRow(s, { name, lines })) };
    const song = songFromText(text, { name, lines });
    return { format: isChordPro(text) ? "ChordPro" : "texto", rows: song.lyrics ? [song] : [] };
}

// -- Importar músicas (ImportSongsDialog) ---------------------------------------

// What the import will do, file by file: one item per song (ok, or
// repeated — already in the library or earlier in this import, by songKey)
// and one per file that gave none (bad, with the reason). files: [{ name,
// format, rows } | { name, error }]. -> { items, counts }
export function importPlan(files, existing = []) {
    const library = new Set(existing.map(songKey));
    const seen = new Set();
    const items = [];
    files.forEach((f, i) => {
        if (f.error || !f.rows?.length) {
            items.push({ key: `${i}`, status: "bad", title: f.name, reason: f.error || "nenhuma letra encontrada", format: f.format || "" });
            return;
        }
        f.rows.forEach((row, j) => {
            const k = songKey(row);
            const where = library.has(k) ? "library" : seen.has(k) ? "import" : "";
            seen.add(k);
            items.push({ key: `${i}:${j}`, status: where ? "repeated" : "ok", where, title: row.title, row, format: f.format, file: f.name });
        });
    });
    const counts = { ok: 0, repeated: 0, bad: 0 };
    for (const it of items) counts[it.status] += 1;
    return { items, counts };
}

// The rows that go in: every ready one, and a repeated one when the
// operator does not skip them or asked for that one ("Importar mesmo assim").
export const importedItems = (items, { skip = true, forced = new Set() } = {}) =>
    items.filter((it) => it.status === "ok" || (it.status === "repeated" && (!skip || forced.has(it.key))));

// A row's second line and its size, as the list shows them.
export function importRowMeta(item) {
    if (item.status === "bad") return item.reason;
    if (item.status === "repeated") return item.where === "library" ? "parece repetida · já está na biblioteca" : "parece repetida · já está nesta importação";
    const { row } = item;
    return [row.artist, row.song_key && `Tom ${row.song_key}`].filter(Boolean).join(" · ");
}
export function importRowSize(row) {
    const n = row?.slides?.length || 0;
    const chords = row?.slides?.some((s) => s.chorded) ? " · com cifra" : "";
    return n ? `${n} ${n === 1 ? "slide" : "slides"}${chords}` : "";
}

// The band over the list: "15 arquivos de Músicas OpenLP · OpenLyrics, ChordPro".
export function importSource(files, folder = "") {
    const n = files.length;
    const formats = [...new Set(files.map((f) => f.format).filter(Boolean))];
    return `${n} ${n === 1 ? "arquivo" : "arquivos"}${folder ? ` de ${folder}` : ""}${formats.length ? ` · ${formats.join(", ")}` : ""}`;
}

// "11 prontas · 2 repetidas · 2 não deram"
export function importCounts({ ok, repeated, bad }) {
    return [
        ok && `${ok} ${ok === 1 ? "pronta" : "prontas"}`,
        repeated && `${repeated} ${repeated === 1 ? "repetida" : "repetidas"}`,
        bad && `${bad} ${bad === 1 ? "não deu" : "não deram"}`,
    ].filter(Boolean).join(" · ");
}

// Songs already in the library (or earlier in the same import) stay out:
// the same title and lyrics, as Sincronização compares them (songKey).
// -> { fresh, repeated }
export function splitRepeated(rows, existing = []) {
    const seen = new Set(existing.map(songKey));
    const fresh = [];
    const repeated = [];
    for (const row of rows) {
        const key = songKey(row);
        if (seen.has(key)) repeated.push(row);
        else { seen.add(key); fresh.push(row); }
    }
    return { fresh, repeated };
}

// The toast after an import. bad: ["nome (motivo)"].
export function importSummary({ made = 0, repeated = 0, bad = [] }) {
    if (!made && !repeated) return `Nenhuma letra encontrada${bad.length ? ` · não deu: ${bad.join(", ")}` : ""}.`;
    const parts = [];
    if (made) parts.push(`${made} ${made === 1 ? "música importada" : "músicas importadas"}`);
    if (repeated) parts.push(`${repeated} ${repeated === 1 ? "já estava na biblioteca e ficou de fora" : "já estavam na biblioteca e ficaram de fora"}`);
    if (bad.length) parts.push(`não deu: ${bad.join(", ")}`);
    const text = `${parts.join(" · ")}.`;
    return text[0].toUpperCase() + text.slice(1);
}

// -- The song editor -------------------------------------------------------------

// A song's limit of lines per slide (Song.lines_per_slide, the import
// preference): 0 = one stanza per slide, else 1 to 12.
export const MAX_LINES = 12;
export const linesLimit = (n) => { const v = Math.round(Number(n)); return Number.isFinite(v) && v > 0 ? Math.min(MAX_LINES, v) : 0; };

// The editor's live split of the lyrics into slides: stanzas are separated
// by a blank line; a stanza that starts with "[Label]" names itself and the
// stanzas after it until the next label (chorus labels mark is_chorus);
// lines > 0 cuts long stanzas. -> [{ text, label, is_chorus? }]
// With { chorded: true } each slide also carries `chorded`: the same rows
// with their inline chords, 1:1 with the stripped text (same rows, same
// cuts), for the Palco. Chords-only rows ("[G] [D]") leave both.
export function slidesFromLyrics(lyrics, { lines = 0, chorded = false } = {}) {
    const out = [];
    let label = "";
    String(lyrics || "").replace(/\r/g, "").split(/\n\s*\n/).forEach((block) => {
        let rows = block.split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim());
        if (!rows.length) return;
        const m = /^\s*\[(.+?)\]\s*$/.exec(rows[0]);
        if (m && !hasInlineChords(rows[0])) { label = m[1].trim(); rows = rows.slice(1); }
        const pairs = rows.map((raw) => ({ raw, text: stripLine(raw).replace(/\s+$/, "") })).filter((p) => p.text.trim());
        if (!pairs.length) return;
        const chunks = [];
        if (lines > 0) for (let i = 0; i < pairs.length; i += lines) chunks.push(pairs.slice(i, i + lines));
        else chunks.push(pairs);
        for (const chunk of chunks) {
            out.push({
                text: chunk.map((p) => p.text).join("\n"), label,
                ...(CHORUS_RE.test(label) ? { is_chorus: true } : {}),
                ...(chorded ? { chorded: chunk.map((p) => p.raw).join("\n") } : {}),
            });
        }
    });
    return out;
}

// Saved slides from before the editor kept their chorded twins (chords
// in the lyrics, none in the slides): the twins from the lyrics, when the
// lyrics still split into exactly those slides; else the slides as saved.
function withChordedTwins(song) {
    const saved = song.slides;
    if (saved.some((s) => s?.chorded) || !hasInlineChords(song.lyrics || "")) return saved;
    const live = slidesFromLyrics(song.lyrics, { lines: linesLimit(song.lines_per_slide), chorded: true });
    const same = live.length === saved.length && live.every((s, i) => s.text === stripChords(String(saved[i]?.text || "")));
    return same ? saved.map((s, i) => ({ ...s, chorded: live[i].chorded })) : saved;
}

// A song's slides as they go on air, with the Palco's chorded twins when the
// lyrics carry inline chords: saved slides win (their `chorded` twin too,
// saved by the editor); else the lyrics split as the song asks
// (lines_per_slide); else one stanza per slide. Every slide text
// is stripped here, whatever wrote it — the projector never shows a chord.
export function songSlidesFor(song) {
    let base;
    if (song.slides?.length) base = withChordedTwins(song);
    else if (linesLimit(song.lines_per_slide)) base = slidesFromLyrics(song.lyrics || "", { lines: linesLimit(song.lines_per_slide), chorded: true });
    else if (hasInlineChords(song.lyrics || "")) base = slidesFromLyrics(song.lyrics || "", { chorded: true });
    else base = generateSlides(song.lyrics || "");
    const texts = base.map((s) => String(s.chorded ?? s.text ?? ""));
    const chordedSlides = texts.some((t) => hasInlineChords(t)) ? texts : null;
    return {
        slides: base.map(({ chorded: _c, ...rest }) => ({ ...rest, text: stripChords(String(rest.text || "")) })),
        chordedSlides,
    };
}

// Lyric timing (the song's video): each slide's start in seconds, the
// duration up to the next start (the last one to the end of the video).
// starts: [seconds | null] by slide index. Slides without a start keep theirs.
export function withTimings(slides, starts, total = null) {
    const marked = slides.map((s, i) => (Number.isFinite(starts?.[i]) ? starts[i] : null));
    return slides.map((s, i) => {
        const start = marked[i];
        if (start === null) return s;
        const next = marked.slice(i + 1).find((x) => x !== null);
        const end = next ?? (Number.isFinite(total) ? total : null);
        return { ...s, start: Math.round(start * 100) / 100, ...(end !== null ? { duration: Math.max(0, Math.round((end - start) * 100) / 100) } : {}) };
    });
}

// Timed lyrics (LRC, LRCLIB's syncedLyrics; Rodada P12): [{ t, text }] in
// time order. "[mm:ss.xx]" stamps (several on one line repeat it), the
// [offset:±ms] tag applied (+ = the lyrics earlier), the other tags and the
// empty lines left out.
export function parseLrc(lrc) {
    let offset = 0;
    const out = [];
    for (const raw of String(lrc || "").split(/\r?\n/)) {
        let rest = raw.trim();
        const off = /^\[offset:\s*([+-]?\d+)\s*\]/i.exec(rest);
        if (off) { offset = Number(off[1]) / 1000; continue; }
        const stamps = [];
        for (let m; (m = /^\[(\d+):(\d{1,2}(?:[.:]\d+)?)\]/.exec(rest)); rest = rest.slice(m[0].length).trimStart()) {
            stamps.push(Number(m[1]) * 60 + Number(m[2].replace(":", ".")));
        }
        if (!stamps.length || !rest.trim()) continue;
        for (const t of stamps) out.push({ t, text: rest.trim() });
    }
    return out
        .map(({ t, text }) => ({ t: Math.round(Math.max(0, t - offset) * 100) / 100, text }))
        .sort((a, b) => a.t - b.t);
}

// A line as the matching sees it: no chords, accents, case or punctuation.
const lineKey = (s) => stripChords(String(s || "")).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
// The same line, give or take its end (one of them cut short) or a word
// spelled otherwise ("ó" / "oh"): three words in four the same.
function sameLine(a, b) {
    if (a === b || (Math.min(a.length, b.length) >= 8 && (a.startsWith(b) || b.startsWith(a)))) return true;
    const wa = a.split(" ");
    const wb = b.split(" ");
    const most = Math.max(wa.length, wb.length);
    if (most < 3) return false;
    const left = [...wb];
    const common = wa.filter((w) => { const i = left.indexOf(w); if (i < 0) return false; left.splice(i, 1); return true; }).length;
    return common / most >= 0.75;
}

// The marks a recording's timed lines give the slides (songFromText cut
// them): one entry per slide, seconds or null, for withTimings. The slides
// are walked in order against the lines, each slide taking the time of its
// first line (or of its second, when the first is not found); a slide not
// found within `window` lines from where the last one ended stays unmarked
// (the follow shares its gap, lyricSync.js followStarts), so a chorus the
// recording repeats never pulls the slides ahead.
export function lrcMarks(slides, lrc, { window = 12 } = {}) {
    const lines = (Array.isArray(lrc) ? lrc : parseLrc(lrc)).map((l) => ({ t: l.t, k: lineKey(l.text) })).filter((l) => l.k);
    let j = 0;
    return (slides || []).map((s) => {
        const own = String(s?.text || "").split("\n").map(lineKey).filter(Boolean);
        for (let k = j; k < Math.min(lines.length, j + window); k++) {
            for (let m = 0; m < Math.min(own.length, 2); m++) {
                if (!sameLine(lines[k].k, own[m])) continue;
                const first = m && k - 1 >= j ? k - 1 : k;
                j = k + 1;
                for (let n = m + 1; n < own.length && j < lines.length && sameLine(lines[j].k, own[n]); n++) j++;
                return lines[first].t;
            }
        }
        return null;
    });
}

// "m:ss" or seconds -> seconds (null when empty or unreadable).
export function parseDuration(text) {
    const t = String(text ?? "").trim();
    if (!t) return null;
    const m = /^(\d+):([0-5]?\d)$/.exec(t);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    return /^\d+$/.test(t) ? Number(t) : null;
}
export const formatDuration = (s) => (Number.isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");
