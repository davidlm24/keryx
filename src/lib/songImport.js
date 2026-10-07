// Songs from text: cifra/ChordPro and plain lyrics files from the computer,
// lyrics pasted or brought from the web. Pure (no React, no I/O), so node
// --test checks it; the console's "+ › Letras" and ChordImporter use it.

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
const CHORD = /^[A-G](?:#|b)?(?:m|maj|min|dim|aug|sus|add)?\d*(?:\/[A-G](?:#|b)?)?\*?$/;
export const isChordLine = (line) => {
    const words = line.trim().split(/\s+/).filter(Boolean);
    return words.length > 0 && words.every((w) => CHORD.test(w.replace(/[()|]/g, "")));
};

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

// A Song row (Song entity: title and lyrics required) from one text.
// name: the file name, the fallback title. -> { title, artist, lyrics, slides }
export function songFromText(raw, { name = "", title = "", artist = "" } = {}) {
    const text = String(raw || "").replace(/\r\n/g, "\n").trim();
    const sections = parseChords(text);
    const lyrics = sections.map((s) => s.text).join("\n\n");
    const baseName = String(name).replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
    return {
        title: title || directive(text, "title", "t") || baseName || (lyrics.split("\n")[0] || "Sem título").slice(0, 80),
        artist: artist || directive(text, "artist", "subtitle", "st"),
        lyrics,
        slides: sections.map((s) => ({ text: s.text, duration: 0, ...(CHORUS_RE.test(s.section) ? { is_chorus: true } : {}) })),
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
export function songsFromFile(name, raw) {
    if (/\.json$/i.test(name)) return songsFromJson(raw);
    const song = songFromText(raw, { name });
    return song.lyrics ? [song] : [];
}
