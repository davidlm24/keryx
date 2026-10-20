// Reads a Bible file in the formats churches have (owner 2026-10-20, the
// "Bíblias" mockup, b5 = todos): USFM (a book per file, often zipped),
// VPL (a verse per line, "GEN 1:1 text", eBible.org's), OSIS XML, Zefania
// XML, MySword (.bbl.mybible, SQLite) and the two JSON shapes KERYX always
// took (github.com/thiagobodruk/biblia and bolls.life, also zipped).
//
// Every reader gives the same thing: { format, language, title, verses },
// verses = [{ b, c, v, text }] with b the book 1–66 in KERYX's canonical
// order (src/lib/bibleBooks.js). Books past the 66 (the deuterocanonicals
// some editions carry) are left out, as bolls.life's are. e-Sword (.bblx,
// enciphered), PDF and Word are refused with a sentence that says what to do.
//
// Pure apart from MySword, whose SQLite is opened with node:sqlite from a
// temporary copy (the church's file is never opened for writing).

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const yauzl = require("yauzl");

class FormatError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

// A file far bigger than any Bible (the zipped ones are ~5 MB, MySword ~10).
const MAX_FILE_BYTES = 64 * 1024 * 1024;

// The 66 books: USFM code, eBible.org/BibleWorks code, OSIS code, English name.
const CODES = [
    ["GEN", "GEN", "Gen", "Genesis"], ["EXO", "EXO", "Exod", "Exodus"], ["LEV", "LEV", "Lev", "Leviticus"],
    ["NUM", "NUM", "Num", "Numbers"], ["DEU", "DEU", "Deut", "Deuteronomy"], ["JOS", "JOS", "Josh", "Joshua"],
    ["JDG", "JDG", "Judg", "Judges"], ["RUT", "RUT", "Ruth", "Ruth"], ["1SA", "1SA", "1Sam", "1 Samuel"],
    ["2SA", "2SA", "2Sam", "2 Samuel"], ["1KI", "1KI", "1Kgs", "1 Kings"], ["2KI", "2KI", "2Kgs", "2 Kings"],
    ["1CH", "1CH", "1Chr", "1 Chronicles"], ["2CH", "2CH", "2Chr", "2 Chronicles"], ["EZR", "EZR", "Ezra", "Ezra"],
    ["NEH", "NEH", "Neh", "Nehemiah"], ["EST", "EST", "Esth", "Esther"], ["JOB", "JOB", "Job", "Job"],
    ["PSA", "PSA", "Ps", "Psalms"], ["PRO", "PRO", "Prov", "Proverbs"], ["ECC", "ECC", "Eccl", "Ecclesiastes"],
    ["SNG", "SOL", "Song", "Song of Solomon"], ["ISA", "ISA", "Isa", "Isaiah"], ["JER", "JER", "Jer", "Jeremiah"],
    ["LAM", "LAM", "Lam", "Lamentations"], ["EZK", "EZE", "Ezek", "Ezekiel"], ["DAN", "DAN", "Dan", "Daniel"],
    ["HOS", "HOS", "Hos", "Hosea"], ["JOL", "JOE", "Joel", "Joel"], ["AMO", "AMO", "Amos", "Amos"],
    ["OBA", "OBA", "Obad", "Obadiah"], ["JON", "JON", "Jonah", "Jonah"], ["MIC", "MIC", "Mic", "Micah"],
    ["NAM", "NAH", "Nah", "Nahum"], ["HAB", "HAB", "Hab", "Habakkuk"], ["ZEP", "ZEP", "Zeph", "Zephaniah"],
    ["HAG", "HAG", "Hag", "Haggai"], ["ZEC", "ZEC", "Zech", "Zechariah"], ["MAL", "MAL", "Mal", "Malachi"],
    ["MAT", "MAT", "Matt", "Matthew"], ["MRK", "MAR", "Mark", "Mark"], ["LUK", "LUK", "Luke", "Luke"],
    ["JHN", "JOH", "John", "John"], ["ACT", "ACT", "Acts", "Acts"], ["ROM", "ROM", "Rom", "Romans"],
    ["1CO", "1CO", "1Cor", "1 Corinthians"], ["2CO", "2CO", "2Cor", "2 Corinthians"], ["GAL", "GAL", "Gal", "Galatians"],
    ["EPH", "EPH", "Eph", "Ephesians"], ["PHP", "PHI", "Phil", "Philippians"], ["COL", "COL", "Col", "Colossians"],
    ["1TH", "1TH", "1Thess", "1 Thessalonians"], ["2TH", "2TH", "2Thess", "2 Thessalonians"], ["1TI", "1TI", "1Tim", "1 Timothy"],
    ["2TI", "2TI", "2Tim", "2 Timothy"], ["TIT", "TIT", "Titus", "Titus"], ["PHM", "PHM", "Phlm", "Philemon"],
    ["HEB", "HEB", "Heb", "Hebrews"], ["JAS", "JAM", "Jas", "James"], ["1PE", "1PE", "1Pet", "1 Peter"],
    ["2PE", "2PE", "2Pet", "2 Peter"], ["1JN", "1JO", "1John", "1 John"], ["2JN", "2JO", "2John", "2 John"],
    ["3JN", "3JO", "3John", "3 John"], ["JUD", "JUD", "Jude", "Jude"], ["REV", "REV", "Rev", "Revelation"],
];
// Must match electron/bible.cjs BOOK_NAMES (a test checks).
const PT_NAMES = [
    "Gênesis", "Êxodo", "Levítico", "Números", "Deuteronômio", "Josué", "Juízes", "Rute",
    "1 Samuel", "2 Samuel", "1 Reis", "2 Reis", "1 Crônicas", "2 Crônicas", "Esdras", "Neemias",
    "Ester", "Jó", "Salmos", "Provérbios", "Eclesiastes", "Cânticos", "Isaías", "Jeremias",
    "Lamentações", "Ezequiel", "Daniel", "Oséias", "Joel", "Amós", "Obadias", "Jonas",
    "Miquéias", "Naum", "Habacuque", "Sofonias", "Ageu", "Zacarias", "Malaquias",
    "Mateus", "Marcos", "Lucas", "João", "Atos", "Romanos", "1 Coríntios", "2 Coríntios",
    "Gálatas", "Efésios", "Filipenses", "Colossenses", "1 Tessalonicenses", "2 Tessalonicenses",
    "1 Timóteo", "2 Timóteo", "Tito", "Filemom", "Hebreus", "Tiago", "1 Pedro", "2 Pedro",
    "1 João", "2 João", "3 João", "Judas", "Apocalipse",
];
const key = (s) => String(s).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[\s._-]+/g, "");
const BOOKS = new Map();
CODES.forEach((names, i) => [...names, PT_NAMES[i]].forEach((n) => { if (!BOOKS.has(key(n))) BOOKS.set(key(n), i + 1); }));
for (const [alias, n] of [["psalm", 19], ["salmo", 19], ["canticodoscanticos", 22], ["cantares", 22], ["songofsongs", 22], ["revelationofjohn", 66], ["osee", 28], ["miqueias", 33], ["oseias", 28]]) BOOKS.set(alias, n);
// "GEN", "Gen", "JHN", "JOH", "1John", "Gênesis", "1 Samuel" -> 1..66, else null.
const bookOf = (name) => BOOKS.get(key(name)) || null;

// A verse's text without markup: footnote marks (<sup>…</sup>) and Strong's
// numbers (<S>…</S>) go with their content, <br> is a space, other tags
// leave their words, entities are decoded.
const ENTITIES = { quot: '"', amp: "&", lt: "<", gt: ">", nbsp: " ", apos: "'" };
function cleanVerse(text) {
    return String(text ?? "")
        .replace(/<(sup|S)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]*>/g, "")
        .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
        .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
        .replace(/&([a-z]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m)
        .replace(/\s+([,.;:!?])/g, "$1")
        .replace(/\s+/g, " ")
        .trim();
}

const LANGS = [[/^(pt|por|portugu)/i, "Português"], [/^(en|eng|english|ingl)/i, "Inglês"], [/^(es|spa|span|espa)/i, "Espanhol"]];
const languageName = (code) => { const s = String(code || "").trim(); if (!s) return null; const hit = LANGS.find(([re]) => re.test(s)); return hit ? hit[1] : s; };
// A file that says nothing of its language: guessed from its common words.
const WORDS = { "Português": ["que", "de", "não", "e", "o", "deus", "para"], "Inglês": ["the", "and", "of", "god", "that", "not"], "Espanhol": ["que", "de", "y", "el", "los", "dios", "no"] };
function guessLanguage(verses) {
    const sample = verses.slice(0, 400).map((v) => v.text.toLowerCase()).join(" ").split(/[^\p{L}]+/u);
    let best = null, top = 0;
    for (const [lang, words] of Object.entries(WORDS)) {
        const set = new Set(words);
        const n = sample.filter((w) => set.has(w)).length;
        if (n > top) { top = n; best = lang; }
    }
    return top > 20 ? best : null;
}

// The same verse twice (a bridge, a repeated line): the first one stays.
function verseList(raw) {
    const seen = new Set(), out = [];
    for (const v of raw) {
        if (!Number.isInteger(v.b) || v.b < 1 || v.b > 66 || !Number.isInteger(v.c) || v.c < 1 || !Number.isInteger(v.v) || v.v < 1) continue;
        const text = cleanVerse(v.text);
        const k = `${v.b}.${v.c}.${v.v}`;
        if (!text || seen.has(k)) continue;
        seen.add(k);
        out.push({ b: v.b, c: v.c, v: v.v, text });
    }
    return out;
}

// -- the readers (text in, { format, verses, language?, title? } out) --------

// github.com/thiagobodruk/biblia: 66 books in order, chapters of verse strings.
function fromBookJson(data) {
    const valid = Array.isArray(data) && data.length === 66
        && data.every((book) => book && Array.isArray(book.chapters) && book.chapters.every((ch) => Array.isArray(ch) && ch.every((v) => typeof v === "string")));
    if (!valid) throw new FormatError("O arquivo não tem o formato esperado (66 livros, capítulos com versículos).");
    const raw = [];
    data.forEach((book, b) => book.chapters.forEach((ch, c) => ch.forEach((text, v) => raw.push({ b: b + 1, c: c + 1, v: v + 1, text }))));
    // Its shape is the whole Bible (66 books), however short a test copy is.
    return { format: "JSON (thiagobodruk)", verses: verseList(raw), complete: true };
}
const isBollsJson = (data) => Array.isArray(data) && data.length > 0 && data[0] && typeof data[0] === "object" && "book" in data[0] && "verse" in data[0];
// bolls.life: [{ book, chapter, verse, text }].
function fromBollsJson(data) {
    return { format: "JSON (bolls.life)", verses: verseList(data.map((v) => ({ b: Number(v?.book), c: Number(v?.chapter), v: Number(v?.verse), text: typeof v?.text === "string" ? v.text : "" }))) };
}
function fromJson(text) {
    let data;
    try { data = JSON.parse(text); } catch { throw new FormatError("O arquivo não é um JSON válido."); }
    return isBollsJson(data) ? fromBollsJson(data) : fromBookJson(data);
}

// "GEN 1:1 No princípio…", one verse a line (eBible.org's _vpl.txt; a book
// may be any code or name the table knows: "1 Samuel 3:4 …").
const VPL_LINE = /^\s*(.+?)\s+(\d+):(\d+)\s+(.*)$/;
function fromVpl(text) {
    const raw = [];
    for (const line of text.split(/\r?\n/)) {
        const m = line.match(VPL_LINE);
        if (!m) continue;
        raw.push({ b: bookOf(m[1]), c: Number(m[2]), v: Number(m[3]), text: m[4] });
    }
    return { format: "Texto por versículo (VPL)", verses: verseList(raw) };
}
const looksVpl = (text) => {
    const lines = text.split(/\r?\n/, 40).filter((l) => l.trim());
    return lines.length > 0 && lines.filter((l) => VPL_LINE.test(l) && bookOf(l.match(VPL_LINE)[1])).length >= Math.ceil(lines.length * 0.6);
};

const attr = (attrs, name) => { const m = String(attrs).match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"|\\b${name}\\s*=\\s*'([^']*)'`, "i")); return m ? (m[1] ?? m[2]) : null; };
const xmlNotes = (s) => s.replace(/<(note|NOTE|title|TITLE)\b[^>]*\/>/g, "").replace(/<(note|NOTE)\b[\s\S]*?<\/\1\s*>/g, "").replace(/<(title|TITLE|CAPTION)\b[\s\S]*?<\/\1\s*>/g, "");

// OSIS: <verse osisID="Gen.1.1">…</verse>, or milestones (<verse sID/> …
// <verse eID/>); notes and titles go with their content.
function fromOsis(text) {
    const lang = (text.match(/<osisText\b[^>]*\bxml:lang\s*=\s*"([^"]+)"/) || [])[1];
    const title = (text.match(/<title\b[^>]*>([^<]{1,200})<\/title>/) || [])[1];
    const body = xmlNotes(text);
    const raw = [];
    const re = /<verse\b([^>]*?)(\/?)>|<\/verse\s*>/g;
    let open = null, m;
    const close = (end) => { if (open) { raw.push({ ...open.ref, text: body.slice(open.start, end) }); open = null; } };
    const refOf = (id) => {
        const [book, c, v] = String(id || "").trim().split(/\s+/)[0].split(".");
        return { b: bookOf(book), c: Number(c), v: Number(v) };
    };
    while ((m = re.exec(body))) {
        if (m[0].startsWith("</")) { close(m.index); continue; }
        const attrs = m[1], self = m[2] === "/";
        if (self && attr(attrs, "eID")) { close(m.index); continue; }
        const id = attr(attrs, "osisID") || attr(attrs, "sID");
        if (!id) continue;
        close(m.index);
        open = { ref: refOf(id), start: m.index + m[0].length };
    }
    close(body.length);
    return { format: "OSIS XML", verses: verseList(raw), language: languageName(lang), title: title ? cleanVerse(title) : null };
}

// Zefania: <BIBLEBOOK bnumber="1"><CHAPTER cnumber="1"><VERS vnumber="1">…
function fromZefania(text) {
    const lang = (text.match(/<language\b[^>]*>([^<]+)<\/language>/i) || [])[1];
    const title = attr((text.match(/<XMLBIBLE\b([^>]*)>/i) || [])[1] || "", "biblename");
    const raw = [];
    for (const bm of text.matchAll(/<BIBLEBOOK\b([^>]*)>([\s\S]*?)<\/BIBLEBOOK\s*>/gi)) {
        const n = Number(attr(bm[1], "bnumber"));
        const b = Number.isInteger(n) && n > 0 ? (n <= 66 ? n : null) : bookOf(attr(bm[1], "bname") || attr(bm[1], "bsname") || "");
        for (const cm of bm[2].matchAll(/<CHAPTER\b([^>]*)>([\s\S]*?)<\/CHAPTER\s*>/gi)) {
            const c = Number(attr(cm[1], "cnumber"));
            for (const vm of cm[2].matchAll(/<VERS\b([^>]*)>([\s\S]*?)<\/VERS\s*>/gi)) {
                raw.push({ b, c, v: Number(attr(vm[1], "vnumber")), text: xmlNotes(vm[2]) });
            }
        }
    }
    return { format: "Zefania XML", verses: verseList(raw), language: languageName(lang), title: title ? cleanVerse(title) : null };
}

// eBible.org's _vpl.xml: <v b="GEN" c="1" v="1">…</v>.
function fromVerseFile(text) {
    const raw = [...text.matchAll(/<v\b([^>]*)>([\s\S]*?)<\/v\s*>/g)].map((m) => ({ b: bookOf(attr(m[1], "b") || ""), c: Number(attr(m[1], "c")), v: Number(attr(m[1], "v")), text: m[2] }));
    return { format: "Texto por versículo (VPL)", verses: verseList(raw) };
}

// USFM: \id GEN, \c 1, \v 1 …; footnotes (\f…\f*), cross references
// (\x…\x*) and the alternate numbers go with their content; headings and
// the book's titles are lines of their own and go; character markers
// (\w word|strong\w*, \nd, \add, \wj…) leave their words.
const USFM_DROP_LINE = /^\\(id|ide|h|toc\d?|toca\d?|rem|sts|usfm|mt\d?|mte\d?|ms\d?|mr|s\d?|sr|r|d|sp|cl|cd|ip|ipi|is\d?|io\d?|iot|imt\d?|ie|ili\d?|ipr|iq\d?|im|ib|imq|ipq|iex|lit|sd\d?)(\s|$)/;
function fromUsfm(text) {
    const raw = [];
    for (const part of text.split(/(?=^\\id\s)/m)) {
        const id = (part.match(/^\\id\s+(\S+)/) || [])[1];
        const b = id ? bookOf(id) : null;
        if (!b) continue;
        const body = part
            .replace(/\\(f|fe|ef|x|ex)\s[\s\S]*?\\\1\*/g, " ")
            .replace(/\\(va|vp|ca|cp|fig|rq)\s[\s\S]*?\\\1\*/g, " ")
            .replace(/\\(cp)\s+\S+/g, " ")
            .replace(/\\\+?w\s+([^\\|]*?)(\|[^\\]*?)?\\\+?w\*/g, "$1")
            .split(/\r?\n/)
            .filter((line) => !USFM_DROP_LINE.test(line.trim()))
            .join("\n");
        let c = 0, cur = null;
        const flush = (end) => { if (cur) { raw.push({ b, c: cur.c, v: cur.v, text: body.slice(cur.start, end).replace(/\\\+?[a-z]+\d*\*?/gi, " ") }); cur = null; } };
        const re = /\\(c|v)\s+(\d+)(?:[-–]\d+)?[a-z]?/g;
        let m;
        while ((m = re.exec(body))) {
            flush(m.index);
            if (m[1] === "c") c = Number(m[2]);
            else cur = { c, v: Number(m[2]), start: m.index + m[0].length };
        }
        flush(body.length);
    }
    return { format: "USFM", verses: verseList(raw) };
}
const looksUsfm = (text) => /^\\id\s+\S+/m.test(text) && /\\v\s+\d+/.test(text);

// MySword: a SQLite database, table Bible (Book, Chapter, Verse, Scripture)
// with GBF-style tags: footnotes <RF>…<Rf>, titles <TS>…<Ts>, Strong's
// <WH430>, styles <FI>…<Fi>, paragraphs <CM>.
const mysword = (text) => cleanVerse(String(text || "")
    .replace(/<RF\b[^>]*>[\s\S]*?<Rf>/g, " ")
    .replace(/<TS\b[^>]*>[\s\S]*?<Ts>/g, " ")
    .replace(/<(CM|CL|PF\d|PI\d)>/g, " ")
    .replace(/<[A-Z][A-Za-z]?[A-Za-z0-9 .,=:;'"_-]*>/g, ""));
function fromMySword(bytes) {
    const { DatabaseSync } = require("node:sqlite");
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "keryx-bible-")), "edition.sqlite");
    fs.writeFileSync(tmp, bytes);
    let db;
    try {
        try { db = new DatabaseSync(tmp); } catch { throw new FormatError("Não foi possível abrir este arquivo do MySword."); }
        let rows;
        try { rows = db.prepare("SELECT Book AS b, Chapter AS c, Verse AS v, Scripture AS text FROM Bible").all(); } catch {
            throw new FormatError("Este banco de dados não é uma Bíblia do MySword (falta a tabela Bible).");
        }
        let details = {};
        try { details = db.prepare("SELECT * FROM Details LIMIT 1").get() || {}; } catch { /* a module without Details */ }
        const pick = (...names) => { for (const n of names) { const k = Object.keys(details).find((x) => x.toLowerCase() === n); if (k && details[k]) return String(details[k]); } return null; };
        return {
            format: "MySword",
            verses: verseList(rows.map((r) => ({ b: Number(r.b), c: Number(r.c), v: Number(r.v), text: mysword(r.text) }))),
            language: languageName(pick("language")),
            title: pick("title", "description"),
            abbrev: pick("abbreviation"),
        };
    } finally {
        try { db?.close(); } catch { /* closed */ }
        fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
    }
}

// -- detection ----------------------------------------------------------------

const REFUSE = {
    pdf: "O KERYX lê arquivos de programas de Bíblia (USFM, OSIS, Zefania, MySword, VPL, JSON), não PDF nem Word. Exporte de lá no formato certo.",
    esword: "Os arquivos do e-Sword (.bblx) são cifrados e o KERYX não consegue lê-los. Use o mesmo texto em outro formato (MySword, OSIS, Zefania ou USFM).",
    unknown: "O KERYX não reconheceu este arquivo como uma Bíblia. Os formatos lidos são USFM, VPL, OSIS, Zefania, MySword (.bbl.mybible) e JSON.",
};

// Text from bytes: UTF-8 (without its byte-order mark), else Windows-1252,
// the encoding of older Zefania and VPL files.
function decode(buf) {
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch { text = new TextDecoder("windows-1252").decode(buf); }
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function fromText(text) {
    const head = text.slice(0, 4000).trimStart();
    if (head.startsWith("[") || head.startsWith("{")) return fromJson(text);
    if (head.startsWith("<")) {
        if (/<osis\b/i.test(head)) return fromOsis(text);
        if (/<(XMLBIBLE|BIBLEBOOK)\b/i.test(head)) return fromZefania(text);
        if (/<verseFile\b/.test(head)) return fromVerseFile(text);
        if (/<html\b/i.test(head)) throw new FormatError(REFUSE.unknown);
        if (/<osis\b/i.test(text)) return fromOsis(text);
        if (/<XMLBIBLE\b/i.test(text)) return fromZefania(text);
        throw new FormatError(REFUSE.unknown);
    }
    if (head.startsWith("{\\rtf")) throw new FormatError(REFUSE.pdf);
    if (looksUsfm(text)) return fromUsfm(text);
    if (looksVpl(text)) return fromVpl(text);
    throw new FormatError(REFUSE.unknown);
}

// Every file of a zip, as { name, data }, up to the cap in all.
function unzip(buffer) {
    return new Promise((resolve, reject) => {
        yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
            if (err) { reject(new FormatError("O arquivo não é um zip válido.")); return; }
            const files = [];
            let total = 0, done = false;
            const finish = (fn, value) => { if (done) return; done = true; zip.close(); fn(value); };
            zip.on("entry", (entry) => {
                if (/\/$/.test(entry.fileName)) { zip.readEntry(); return; }
                total += entry.uncompressedSize;
                if (total > MAX_FILE_BYTES) { finish(reject, new FormatError("O arquivo da Bíblia é grande demais.")); return; }
                zip.openReadStream(entry, (e, stream) => {
                    if (e) { finish(reject, new FormatError("Não foi possível abrir o zip da Bíblia.")); return; }
                    const parts = [];
                    stream.on("data", (c) => parts.push(c));
                    stream.on("error", () => finish(reject, new FormatError("Não foi possível ler o zip da Bíblia.")));
                    stream.on("end", () => { files.push({ name: entry.fileName, data: Buffer.concat(parts) }); zip.readEntry(); });
                });
            });
            zip.on("end", () => finish(resolve, files));
            zip.on("error", () => finish(reject, new FormatError("O arquivo não é um zip válido.")));
            zip.readEntry();
        });
    });
}

const isSqlite = (buf) => buf.subarray(0, 16).toString("latin1") === "SQLite format 3\0";
const isZip = (buf) => buf.subarray(0, 2).toString("latin1") === "PK";

async function fromZip(buf) {
    const files = await unzip(buf);
    const named = (re) => files.filter((f) => re.test(f.name));
    if (named(/^word\/document\.xml$/).length) throw new FormatError(REFUSE.pdf);
    const usfm = named(/\.(usfm|sfm|ptx)$/i);
    if (usfm.length) return fromUsfm(usfm.map((f) => decode(f.data)).join("\n"));
    const json = named(/\.json$/i);
    if (json.length) return fromJson(decode(json[0].data));
    const vpl = named(/_vpl\.txt$/i).concat(named(/\.txt$/i));
    for (const f of vpl) { const text = decode(f.data); if (looksVpl(text)) return fromVpl(text); }
    for (const f of named(/\.xml$/i)) { try { return fromText(decode(f.data)); } catch { /* the next one */ } }
    const db = files.find((f) => isSqlite(f.data));
    if (db) return fromMySword(db.data);
    throw new FormatError(REFUSE.unknown);
}

// A Bible file picked on disk (or downloaded): its bytes and its name.
// -> { format, verses, language, title, abbrev? }; throws FormatError.
async function readBible(bytes, name = "") {
    const buf = Buffer.from(bytes);
    const lower = String(name).toLowerCase();
    if (buf.length > MAX_FILE_BYTES) throw new FormatError("O arquivo da Bíblia é grande demais.");
    if (/\.(bblx|bbli|cmtx|dctx)$/.test(lower)) throw new FormatError(REFUSE.esword);
    if (/\.(pdf|docx?|odt|rtf|pages)$/.test(lower) || buf.subarray(0, 4).toString("latin1") === "%PDF") throw new FormatError(REFUSE.pdf);
    let parsed;
    if (isSqlite(buf)) parsed = fromMySword(buf);
    else if (isZip(buf)) parsed = await fromZip(buf);
    else parsed = fromText(decode(buf));
    return { title: null, ...parsed, language: parsed.language || guessLanguage(parsed.verses) };
}

module.exports = {
    FormatError,
    CODES,
    PT_NAMES,
    MAX_FILE_BYTES,
    bookOf,
    cleanVerse,
    readBible,
    unzip,
    fromUsfm,
    fromVpl,
    fromOsis,
    fromZefania,
    fromJson,
    REFUSE,
};
