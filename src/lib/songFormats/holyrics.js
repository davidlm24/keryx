// Holyrics (holyrics.com.br): its JSON export of the song library, a list of
// { id, title, artist, author, copyright, key, bpm, note, order, arrangements,
//   lyrics: { full_text, paragraphs: [{ number, description, text,
//   text_with_comment }] } }. Each paragraph is one Holyrics slide; `text` is
// already without the operator's comments ("//(4x)", kept only in
// text_with_comment). Read from a real church export (fixtures/holyrics.json,
// its lyrics replaced by placeholders). Pure: data in, songs out;
// songImport.js turns them into Song rows.

// Is this parsed JSON a Holyrics export (a list, or one song)?
export const isHolyrics = (data) => (Array.isArray(data) ? data : [data])
    .some((s) => s && typeof s.title === "string" && Array.isArray(s.lyrics?.paragraphs));

// The paragraph many songs open with, every line "Label: value" — the title
// slide the church typed, not lyrics.
const HEADER_LINE = /^\s*(t[ií]tulo|artista|autor|compositor|tom|bpm|tempo|ordem|anota[çc][ãa]o|copyright)\s*:\s*(.*)$/i;
function header(text) {
    const lines = String(text || "").split("\n").filter((l) => l.trim());
    if (!lines.length || !lines.every((l) => HEADER_LINE.test(l))) return null;
    const out = {};
    for (const l of lines) {
        const [, label, value] = HEADER_LINE.exec(l);
        out[label.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")] = value.trim();
    }
    return out;
}

// A paragraph that opens with a part's name: "[Refrão]", "[Coro][2x]",
// "[Refrão] (2 Vezes)". The repeat note after it is dropped.
const PART_LINE = /^\s*\[\s*(refr[ãa]o|coro|ponte|verso|estrofe|pr[ée]-?refr[ãa]o|pr[ée]-?coro|intro|introdu[çc][ãa]o|final|interl[úu]dio|solo|chorus|bridge|verse|tag)\s*(\d*)\s*\](.*)$/i;
const capital = (s) => s.charAt(0).toLocaleUpperCase("pt-BR") + s.slice(1).toLocaleLowerCase("pt-BR");

const letters = (s) => String(s || "").replace(/[^\p{L}\p{N}]+/gu, "").toLocaleLowerCase("pt-BR");
const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

// One song -> { title, artist, lyrics, song_key?, copyright?, bpm? } | null.
function holyricsSong(song) {
    const paragraphs = song.lyrics.paragraphs.map((p) => ({ text: String(p?.text ?? "").replace(/\r/g, ""), description: clean(p?.description) }));
    const head = header(paragraphs[0]?.text);
    if (head) paragraphs.shift();

    // Stanzas with their labels: a lone "[Refrão] (2 Vezes)" sings the chorus
    // again; after a named part, the next unnamed one is an [Estrofe] (a
    // KERYX label lasts until the next one).
    const blocks = [];
    const byLabel = new Map();
    let current = "";
    for (const p of paragraphs) {
        let rows = p.text.split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim());
        let label = p.description;
        const m = rows.length ? PART_LINE.exec(rows[0]) : null;
        if (m) { label = `${capital(m[1])}${m[2] ? ` ${m[2]}` : ""}`; rows = rows.slice(1); }
        if (!rows.length) {
            const again = label && byLabel.get(label.toLowerCase());
            if (again) { blocks.push(`[${label}]\n${again}`); current = label; }
            continue;
        }
        const body = rows.join("\n");
        if (label) { byLabel.set(label.toLowerCase(), body); current = label; blocks.push(`[${label}]\n${body}`); continue; }
        if (current && current !== "Estrofe") { current = "Estrofe"; blocks.push(`[Estrofe]\n${body}`); continue; }
        blocks.push(body);
    }
    const lyrics = blocks.join("\n\n");
    if (!lyrics) return null;

    // The header's title keeps the punctuation the title field lost
    // ("Aviva-nos / A Terra Clama", "De Quem É?") when it is the same title.
    const title = clean(song.title);
    const headTitle = clean(head?.titulo);
    const out = {
        title: headTitle && (!title || letters(headTitle) === letters(title)) ? headTitle : title || headTitle,
        artist: clean(song.artist) || clean(head?.artista) || clean(song.author) || clean(head?.autor),
        lyrics,
    };
    const key = clean(song.key) || clean(head?.tom);
    if (key) out.song_key = key;
    if (clean(song.copyright)) out.copyright = clean(song.copyright);
    const bpm = Number(song.bpm) > 0 ? Number(song.bpm) : Number(String(head?.bpm ?? "").replace(",", "."));
    if (Number.isFinite(bpm) && bpm > 0) out.bpm = bpm;
    return out;
}

// -> [{ title, artist, lyrics, … }]; songs with no lyrics are left out.
export function parseHolyrics(data) {
    return (Array.isArray(data) ? data : [data])
        .filter((s) => s && Array.isArray(s.lyrics?.paragraphs))
        .map(holyricsSong)
        .filter(Boolean);
}
