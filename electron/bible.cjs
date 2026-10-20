// Installs a Bible translation into the local database (entity BibleVerse),
// downloaded once or from a copy picked on disk, and reads one chapter from
// the internet for an edition that is not installed. After installing, every
// lookup and search is local.
//
// Two sources (owner 2026-10-20: every edition installable, and readable
// online when not installed):
//   - github.com/thiagobodruk/biblia: NVI, ACF and AA, one JSON of 66 books
//     with chapters of verse strings.
//   - bolls.life: ARA, ARC (ARC09), NAA, NTLH and KJA, each a zip with one
//     JSON array of { book, chapter, verse, text }; one chapter is
//     /get-text/<CODE>/<book 1-66>/<chapter>/. Its verses may carry markup
//     (NAA's <sup> footnote marks, ARC's <i>), removed by cleanVerse. It also
//     serves the chapters read online (ACF as ACF11). abibliadigital.com.br,
//     the old online source, has answered 503 since October 2026.
//
// KERYX does not ship the texts: they are copyrighted editions (NVI by
// Biblica, the Almeida revisions and NTLH by the Bible societies, KJA by
// Abba Press…). Each church downloads its own copy, as the web app always did.

const { withDeadline, TimeoutError } = require("./deadline.cjs");
const yauzl = require("yauzl");

// Where each edition installs from. Must match BIBLE_VERSIONS in
// src/lib/bibleBooks.js (a test checks).
const SOURCES = {
    NVI: { github: "nvi" },
    ACF: { github: "acf" },
    AA: { github: "aa" },
    ARA: { bolls: "ARA" },
    ARC: { bolls: "ARC09" },
    NAA: { bolls: "NAA" },
    NTLH: { bolls: "NTLH" },
    KJA: { bolls: "KJA" },
};
// A whole edition (a few MB) on a slow church connection; never for ever.
const INSTALL_TIMEOUT_MS = 120000;
const sourceUrl = (version) => (SOURCES[version].github
    ? `https://raw.githubusercontent.com/thiagobodruk/biblia/master/json/${SOURCES[version].github}.json`
    : `https://bolls.life/static/translations/${SOURCES[version].bolls}.zip`);
// Fewer verses than this is not a whole Bible (one has ~31,100).
const MIN_VERSES = 20000;
// The JSON inside a bolls.life zip (ARA: 7 MB); anything far bigger is not one.
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;

// Canonical order; the source files list the books in this order. Must match
// src/lib/bibleBooks.js (a test checks).
const BOOK_NAMES = [
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
const OLD_TESTAMENT_BOOKS = 39;

const pad = (n, width) => String(n).padStart(width, "0");

// Sorting by id gives canonical order: NVI-43-003-016 is João 3:16.
const verseId = (version, bookIndex, chapter, verse) => `${version}-${pad(bookIndex + 1, 2)}-${pad(chapter, 3)}-${pad(verse, 3)}`;

class BibleError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

function parseBibleJson(raw) {
    let data;
    try {
        // The source files start with a byte-order mark.
        const text = String(raw);
        data = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
    } catch {
        throw new BibleError("O arquivo não é um JSON válido.");
    }
    const valid = Array.isArray(data)
        && data.length === BOOK_NAMES.length
        && data.every((book) => book && Array.isArray(book.chapters)
            && book.chapters.every((chapter) => Array.isArray(chapter) && chapter.every((v) => typeof v === "string")));
    if (!valid) throw new BibleError("O arquivo não tem o formato esperado (66 livros, capítulos com versículos).");
    return data;
}

// A verse's text without the source's markup: footnote marks (<sup>…</sup>)
// and Strong's numbers (<S>…</S>) go with their content, <br> is a space,
// other tags (<i>, <b>, <span>) leave their words, entities are decoded.
const ENTITIES = { quot: '"', amp: "&", lt: "<", gt: ">", nbsp: " ", apos: "'" };
function cleanVerse(text) {
    return String(text ?? "")
        .replace(/<(sup|S)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]*>/g, "")
        .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
        .replace(/&([a-z]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m)
        .replace(/\s+([,.;:!?])/g, "$1")
        .replace(/\s+/g, " ")
        .trim();
}

// A bolls.life edition: [{ book, chapter, verse, text }] in any order; books
// past 66 (the deuterocanonicals some editions carry) are left out.
function isBollsJson(data) {
    return Array.isArray(data) && data.length > 0 && data[0] && typeof data[0] === "object" && "book" in data[0] && "verse" in data[0];
}
function bollsRows(version, data) {
    const rows = [];
    for (const v of data) {
        const book = Number(v && v.book), chapter = Number(v && v.chapter), verse = Number(v && v.verse);
        if (!Number.isInteger(book) || book < 1 || book > BOOK_NAMES.length || !Number.isInteger(chapter) || chapter < 1 || !Number.isInteger(verse) || verse < 1 || typeof v.text !== "string") continue;
        const text = cleanVerse(v.text);
        if (!text) continue;
        rows.push({
            id: verseId(version, book - 1, chapter, verse),
            version,
            testament: book - 1 < OLD_TESTAMENT_BOOKS ? "Antigo" : "Novo",
            book: BOOK_NAMES[book - 1],
            chapter,
            verse,
            text,
        });
    }
    if (rows.length < MIN_VERSES) throw new BibleError("O arquivo não parece uma Bíblia inteira (versículos de menos).");
    return rows;
}

function toRows(version, data) {
    const rows = [];
    data.forEach((book, bookIndex) => {
        book.chapters.forEach((verses, chapterIndex) => {
            verses.forEach((text, verseIndex) => {
                rows.push({
                    id: verseId(version, bookIndex, chapterIndex + 1, verseIndex + 1),
                    version,
                    testament: bookIndex < OLD_TESTAMENT_BOOKS ? "Antigo" : "Novo",
                    book: BOOK_NAMES[bookIndex],
                    chapter: chapterIndex + 1,
                    verse: verseIndex + 1,
                    // Exactly as published (AA's {…} notes included).
                    text: text.trim(),
                });
            });
        });
    });
    return rows;
}

function assertVersion(version) {
    if (!Object.prototype.hasOwnProperty.call(SOURCES, version)) {
        throw new BibleError(`A versão ${version} não pode ser instalada. Disponíveis: ${Object.keys(SOURCES).join(", ")}.`);
    }
}

// Re-installing replaces verse by verse (ids are deterministic). Either
// source's JSON is taken, by its shape (a copy picked on disk may come from
// either).
function installFromJson(store, version, raw) {
    assertVersion(version);
    let rows;
    let data = null;
    try { const text = String(raw); data = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text); } catch { data = null; }
    if (isBollsJson(data)) rows = bollsRows(version, data);
    else rows = toRows(version, parseBibleJson(raw));
    store.importRows("BibleVerse", rows);
    return { version, verses: rows.length };
}

// The one JSON file inside a zip (bolls.life's editions), as text.
function jsonFromZip(buffer) {
    return new Promise((resolve, reject) => {
        yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
            if (err) { reject(new BibleError("O arquivo não é um zip válido.")); return; }
            let done = false;
            const finish = (fn, value) => { if (done) return; done = true; zip.close(); fn(value); };
            zip.on("entry", (entry) => {
                if (!/\.json$/i.test(entry.fileName)) { zip.readEntry(); return; }
                if (entry.uncompressedSize > MAX_ENTRY_BYTES) { finish(reject, new BibleError("O arquivo da Bíblia é grande demais.")); return; }
                zip.openReadStream(entry, (e, stream) => {
                    if (e) { finish(reject, new BibleError("Não foi possível abrir o zip da Bíblia.")); return; }
                    const parts = [];
                    stream.on("data", (c) => parts.push(c));
                    stream.on("error", () => finish(reject, new BibleError("Não foi possível ler o zip da Bíblia.")));
                    stream.on("end", () => finish(resolve, Buffer.concat(parts).toString("utf8")));
                });
            });
            zip.on("end", () => finish(reject, new BibleError("O zip não tem o arquivo JSON da Bíblia.")));
            zip.on("error", () => finish(reject, new BibleError("O arquivo não é um zip válido.")));
            zip.readEntry();
        });
    });
}

// A file picked on disk: the JSON of either source, or a bolls.life zip.
async function installFromFile(store, version, bytes) {
    assertVersion(version);
    const buf = Buffer.from(bytes);
    const text = buf.subarray(0, 2).toString("latin1") === "PK" ? await jsonFromZip(buf) : buf.toString("utf8");
    return installFromJson(store, version, text);
}

async function installFromSource(store, version, fetchImpl = fetch, { timeoutMs = INSTALL_TIMEOUT_MS } = {}) {
    assertVersion(version);
    let raw;
    try {
        // The answer and its body within the deadline (deadline.cjs).
        raw = await withDeadline(async (signal) => {
            const response = await fetchImpl(sourceUrl(version), { signal });
            if (!response.ok) throw new BibleError(`Não foi possível baixar a ${version} (HTTP ${response.status}).`, 502);
            return SOURCES[version].bolls ? jsonFromZip(Buffer.from(await response.arrayBuffer())) : response.text();
        }, timeoutMs);
    } catch (err) {
        if (err instanceof BibleError) throw err;
        if (err instanceof TimeoutError) throw new BibleError(`O download da ${version} não terminou a tempo. Verifique a internet e tente de novo, ou instale a partir de um arquivo.`, 504);
        throw new BibleError("Sem conexão com a internet. Tente de novo quando estiver online, ou instale a partir de um arquivo.", 503);
    }
    return installFromJson(store, version, raw);
}

// One chapter from bolls.life, for an edition that is not installed. It runs
// here, not in the page, so the page never talks to the internet itself.
// `code`, `book` and `chapter` come from the page, so they are checked
// before they go into the URL. -> [{ number, text }]; [] when the site has no
// such chapter.
const CODE = /^[A-Z0-9]{2,8}$/;
async function fetchOnlineChapter({ code, book, chapter }, fetchImpl = fetch) {
    const b = Number(book), number = Number(chapter);
    if (!CODE.test(String(code)) || !Number.isInteger(b) || b < 1 || b > BOOK_NAMES.length || !Number.isInteger(number) || number < 1 || number > 150) {
        throw new BibleError("Capítulo inválido para a busca online.");
    }
    let response;
    try {
        response = await fetchImpl(`https://bolls.life/get-text/${code}/${b}/${number}/`, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(10000),
        });
    } catch {
        throw new BibleError("Sem conexão com a internet para buscar este capítulo.", 503);
    }
    if (response.status === 404) return [];
    if (!response.ok) throw new BibleError(`O serviço online não respondeu (HTTP ${response.status}).`, 502);
    let data;
    try {
        data = await response.json();
    } catch {
        throw new BibleError("O serviço online enviou uma resposta inválida.", 502);
    }
    return (Array.isArray(data) ? data : [])
        .filter((v) => v && Number.isInteger(v.verse) && typeof v.text === "string")
        .map((v) => ({ number: v.verse, text: cleanVerse(v.text) }))
        .filter((v) => v.text);
}

// { NVI: 31105, ... } for every version with verses in the database.
function installedVersions(store) {
    return store.countBy("BibleVerse", "version");
}

module.exports = {
    SOURCES,
    BOOK_NAMES,
    BibleError,
    verseId,
    parseBibleJson,
    installFromJson,
    installFromFile,
    installFromSource,
    cleanVerse,
    fetchOnlineChapter,
    installedVersions,
};
