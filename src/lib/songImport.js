// Songs from text: cifra/ChordPro and plain lyrics files from the computer,
// lyrics pasted or brought from the web. Pure (no React, no I/O), so node
// --test checks it; the console's "+ › Letras" and ChordImporter use it.
import { isChordLine, stripLine, stripChords, hasInlineChords } from "./chords.js";
import { generateSlides } from "../utils/songSections.js";

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
        lyrics,
        slides: sections.map((s) => ({ text: s.text, duration: 0, ...(CHORUS_RE.test(s.section) ? { is_chorus: true } : {}) })),
        // The editor redoes the slides with the same split when the lyrics change.
        lines_per_slide: [2, 4].includes(lines) ? lines : 0,
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

// Any file the "+ › Do computador" picker accepts. -> [song rows]
export function songsFromFile(name, raw, { lines = 0 } = {}) {
    if (/\.json$/i.test(name)) return songsFromJson(raw);
    const song = songFromText(raw, { name, lines });
    return song.lyrics ? [song] : [];
}

// -- The song editor -------------------------------------------------------------

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

// A song's slides as they go on air, with the Palco's chorded twins when the
// lyrics carry inline chords: saved slides win; else the lyrics split as the
// song asks (lines_per_slide); else one stanza per slide. Every slide text
// is stripped here, whatever wrote it — the projector never shows a chord.
export function songSlidesFor(song) {
    let base;
    if (song.slides?.length) base = song.slides;
    else if ([2, 4].includes(Number(song.lines_per_slide))) base = slidesFromLyrics(song.lyrics || "", { lines: Number(song.lines_per_slide), chorded: true });
    else if (hasInlineChords(song.lyrics || "")) base = slidesFromLyrics(song.lyrics || "", { chorded: true });
    else base = generateSlides(song.lyrics || "");
    const texts = base.map((s) => String(s.chorded ?? s.text ?? ""));
    const chordedSlides = texts.some((t) => hasInlineChords(t)) ? texts : null;
    return {
        slides: base.map(({ chorded: _c, ...rest }) => ({ ...rest, text: stripChords(String(rest.text || "")) })),
        chordedSlides,
    };
}

// The lyrics rewritten so the text reads like the slides (owner request
// 2026-10-11): each stanza cut into blocks of `lines` rows separated by a
// blank line, a "[Label]" row kept on its first block. lines 0 returns the
// text untouched: merged stanzas cannot be rebuilt.
export function reflowLyrics(lyrics, lines = 0) {
    if (!(lines > 0)) return String(lyrics || "");
    const out = [];
    String(lyrics || "").replace(/\r/g, "").split(/\n\s*\n/).forEach((block) => {
        let rows = block.split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim());
        if (!rows.length) return;
        let head = null;
        if (/^\s*\[(.+?)\]\s*$/.test(rows[0]) && !hasInlineChords(rows[0])) { head = rows[0].trim(); rows = rows.slice(1); }
        if (!rows.length) { out.push(head); return; }
        // Only sung rows count toward the block size; a chords-only row
        // ("[G] [D]") rides with the row after it, never a slide of its own.
        const groups = [];
        let lead = [];
        for (const raw of rows) {
            if (!stripLine(raw).trim()) { lead.push(raw); continue; }
            groups.push([...lead, raw]);
            lead = [];
        }
        if (lead.length) (groups[groups.length - 1] || groups[0] || (groups.push([]) && groups[0])).push(...lead);
        if (!groups.length) { out.push([head, ...rows].filter(Boolean).join("\n")); return; }
        for (let i = 0; i < groups.length; i += lines) {
            const chunk = groups.slice(i, i + lines).flat().join("\n");
            out.push(i === 0 && head ? head + "\n" + chunk : chunk);
        }
    });
    return out.join("\n\n");
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

// "m:ss" or seconds -> seconds (null when empty or unreadable).
export function parseDuration(text) {
    const t = String(text ?? "").trim();
    if (!t) return null;
    const m = /^(\d+):([0-5]?\d)$/.exec(t);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    return /^\d+$/.test(t) ? Number(t) : null;
}
export const formatDuration = (s) => (Number.isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");
