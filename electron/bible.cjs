// Installs a Bible translation into the local database (entity BibleVerse),
// downloaded once or from a copy picked on disk, and reads one chapter from
// the internet for an edition that is not installed. After installing, every
// lookup and search is local.
//
// Three sources (owner 2026-10-20: every edition installable, and readable
// online when not installed):
//   - github.com/thiagobodruk/biblia: NVI, ACF and AA, one JSON of 66 books
//     with chapters of verse strings.
//   - bolls.life: ARA, ARC (ARC09), NAA, NTLH and KJA, each a zip with one
//     JSON array of { book, chapter, verse, text }; one chapter is
//     /get-text/<CODE>/<book 1-66>/<chapter>/. Its verses may carry markup
//     (NAA's <sup> footnote marks, ARC's <i>), removed by cleanVerse. It also
//     serves the chapters read online (ACF as ACF11). abibliadigital.com.br,
//     the old online source, has answered 503 since October 2026.
//   - eBible.org: the open editions (BLIVRE, NBV, BPM, BLT; owner
//     2026-10-20, the "Bíblias" mockup), each its _vpl.zip, a verse a line
//     ("GEN 1:1 …"). Install only: eBible has no chapter endpoint.
//
// Any file the church picks is read by electron/bibleFormats.cjs (USFM, VPL,
// OSIS, Zefania, MySword, the two JSON shapes, zipped or not). A file the
// church owns can also become an edition of its own (installOwn: a sigla and
// a name it chooses, a BibleEdition row beside the verses, this computer
// only).
//
// KERYX does not ship the texts: the publishers' editions are copyrighted
// (NVI by Biblica, the Almeida revisions and NTLH by the Bible societies,
// KJA by Abba Press…), and even the open ones are downloaded by each church,
// credited in Configurações › Sobre.

const { withDeadline, TimeoutError } = require("./deadline.cjs");
const crypto = require("node:crypto");
const formats = require("./bibleFormats.cjs");
const { readBible, cleanVerse, FormatError } = formats;

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
    BLIVRE: { ebible: "porbr2018" },
    NBV: { ebible: "poronbv" },
    BPM: { ebible: "porbrbsl" },
    BLT: { ebible: "porblt", nt: true },
};
// A whole edition (a few MB) on a slow church connection; never for ever.
const INSTALL_TIMEOUT_MS = 120000;
const sourceUrl = (version) => {
    const s = SOURCES[version];
    if (s.github) return `https://raw.githubusercontent.com/thiagobodruk/biblia/master/json/${s.github}.json`;
    if (s.ebible) return `https://ebible.org/Scriptures/${s.ebible}_vpl.zip`;
    return `https://bolls.life/static/translations/${s.bolls}.zip`;
};
// Fewer verses than this is not a whole Bible (one has ~31,100), nor a
// whole New Testament (~7,950) or Old (~23,100).
const MIN_VERSES = 20000;
const MIN_NT_VERSES = 7000;
const MIN_OT_VERSES = 15000;

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

// The github JSON's own check, kept for its messages (tests pin them).
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

// What a file holds: the Old Testament, the New, or both.
// -> "all" | "nt" | "ot"
function testamentOf(verses) {
    let ot = false, nt = false;
    for (const v of verses) {
        if (v.b <= OLD_TESTAMENT_BOOKS) ot = true; else nt = true;
        if (ot && nt) return "all";
    }
    return nt ? "nt" : "ot";
}
// A file that is not a whole edition is refused, never installed half-way.
function assertComplete(verses, { nt = false } = {}) {
    const has = verses.length ? testamentOf(verses) : "none";
    if (nt) {
        if (has === "ot" || verses.filter((v) => v.b > OLD_TESTAMENT_BOOKS).length < MIN_NT_VERSES) throw new BibleError("O arquivo não parece o Novo Testamento inteiro (versículos de menos).");
        return;
    }
    const min = has === "nt" ? MIN_NT_VERSES : has === "ot" ? MIN_OT_VERSES : MIN_VERSES;
    if (verses.length < min) throw new BibleError("O arquivo não parece uma Bíblia inteira (versículos de menos).");
}

// The rows of one edition (the readers' { b, c, v, text }).
const toRows = (version, verses) => verses.map((v) => ({
    id: verseId(version, v.b - 1, v.c, v.v),
    version,
    testament: v.b - 1 < OLD_TESTAMENT_BOOKS ? "Antigo" : "Novo",
    book: BOOK_NAMES[v.b - 1],
    chapter: v.c,
    verse: v.v,
    text: v.text,
}));

// A reader's refusal speaks as the installer does (status 400).
async function read(bytes, name) {
    try { return await readBible(bytes, name); } catch (err) {
        if (err instanceof FormatError) throw new BibleError(err.message, err.status);
        throw err;
    }
}

function assertVersion(version) {
    if (!Object.prototype.hasOwnProperty.call(SOURCES, version)) {
        throw new BibleError(`A versão ${version} não pode ser instalada. Disponíveis: ${Object.keys(SOURCES).join(", ")}.`);
    }
}

// Re-installing replaces the edition: its old verses go first, so a verse
// the new file lacks does not linger (ids are deterministic).
function installVerses(store, version, parsed, { nt = Boolean(SOURCES[version]?.nt) } = {}) {
    if (!parsed.complete) assertComplete(parsed.verses, { nt });
    const rows = toRows(version, parsed.verses);
    store.dropRows("BibleVerse", "version", version);
    store.importRows("BibleVerse", rows);
    return { version, verses: rows.length };
}

// Either source's JSON is taken, by its shape (a copy picked on disk may
// come from either).
function installFromJson(store, version, raw) {
    assertVersion(version);
    const text = String(raw).charCodeAt(0) === 0xfeff ? String(raw).slice(1) : String(raw);
    let data = null;
    try { data = JSON.parse(text); } catch { data = null; }
    if (!(Array.isArray(data) && data[0] && typeof data[0] === "object" && "book" in data[0])) parseBibleJson(text);
    let parsed;
    try { parsed = formats.fromJson(text); } catch (err) { throw new BibleError(err.message); }
    return installVerses(store, version, parsed);
}

// A file picked on disk for an edition of the list: any format the readers
// know (the JSON of either source, a bolls.life or eBible.org zip, USFM…).
async function installFromFile(store, version, bytes, name = "") {
    assertVersion(version);
    return installVerses(store, version, await read(bytes, name));
}

async function installFromSource(store, version, fetchImpl = fetch, { timeoutMs = INSTALL_TIMEOUT_MS } = {}) {
    assertVersion(version);
    let raw;
    try {
        // The answer and its body within the deadline (deadline.cjs).
        raw = await withDeadline(async (signal) => {
            const response = await fetchImpl(sourceUrl(version), { signal });
            if (!response.ok) throw new BibleError(`Não foi possível baixar a ${version} (HTTP ${response.status}).`, 502);
            return SOURCES[version].github ? response.text() : Buffer.from(await response.arrayBuffer());
        }, timeoutMs);
    } catch (err) {
        if (err instanceof BibleError) throw err;
        if (err instanceof TimeoutError) throw new BibleError(`O download da ${version} não terminou a tempo. Verifique a internet e tente de novo, ou instale a partir de um arquivo.`, 504);
        throw new BibleError("Sem conexão com a internet. Tente de novo quando estiver online, ou instale a partir de um arquivo.", 503);
    }
    if (typeof raw === "string") return installFromJson(store, version, raw);
    return installVerses(store, version, await read(raw, `${version}.zip`));
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

// -- Editions of the church's own (owner 2026-10-20, the "Bíblias" mockup) ---
//
// A file the church already has (the BKJ 1611 from another Bible program)
// becomes an edition with the sigla and name it gives: read first (read →
// what the dialog shows), installed only with the church's word that it may
// use it (install). Its verses are BibleVerse rows under its sigla, its
// name and origin a BibleEdition row; both stay on this computer
// (electron/db/syncScope.cjs), the others only learn the sigla.

// Siglas the list uses or used (src/lib/bibleBooks.js RENAMED): an own
// edition never takes one, or the preference would read it as another.
const RETIRED = ["BKJ1611"];
const SIGLA = /^[A-Z0-9]{2,8}$/;
const normalizeSigla = (s) => String(s ?? "").trim().toUpperCase();
// Must say the same as siglaProblem in src/lib/bibleBooks.js (a test checks).
// -> a sentence, or null when the sigla can be used.
function siglaProblem(sigla, taken = []) {
    const s = normalizeSigla(sigla);
    if (!SIGLA.test(s)) return "A sigla tem de 2 a 8 letras ou números, sem espaços.";
    if ([...taken, ...RETIRED].some((t) => normalizeSigla(t) === s)) return `Já existe uma edição com a sigla ${s}.`;
    return null;
}

const ownEditions = (store) => store.call("BibleEdition", "list", ["sigla"]);

// What the dialog shows of a file before installing it.
const at = (verses, b, c, v) => verses.find((x) => x.b === b && x.c === c && x.v === v) || null;
const refOf = (x) => `${BOOK_NAMES[x.b - 1]} ${x.c}:${x.v}`;
function describe(parsed) {
    const verses = parsed.verses;
    const testament = testamentOf(verses);
    const first = (testament === "nt" ? null : at(verses, 1, 1, 1)) || verses[0];
    const second = at(verses, 43, 3, 16) || verses.find((x) => x.b > OLD_TESTAMENT_BOOKS && x !== first) || null;
    return {
        format: parsed.format,
        language: parsed.language || null,
        title: parsed.title || null,
        abbrev: parsed.abbrev || null,
        books: new Set(verses.map((x) => x.b)).size,
        verses: verses.length,
        testament,
        samples: [first, second].filter(Boolean).map((x) => ({ ref: refOf(x), number: x.v, text: x.text })),
    };
}

// One reading waits for its install (the dialog's file), by a token.
function createOwnInstaller(store, { newToken = () => crypto.randomUUID() } = {}) {
    let pending = null;
    return {
        // The file's bytes and name -> what it holds (describe) + file, size, token.
        async read(bytes, fileName = "") {
            const parsed = await read(bytes, fileName);
            if (!parsed.complete) assertComplete(parsed.verses);
            pending = { token: newToken(), parsed, fileName: String(fileName).split(/[\\/]/).pop() };
            return { token: pending.token, file: pending.fileName, size: Buffer.byteLength(Buffer.from(bytes)), ...describe(parsed) };
        },
        // The dialog's read: a file that is not a Bible comes back as
        // { file, refused } (what to do instead), not as a failure.
        async inspect(bytes, fileName = "") {
            try { return await this.read(bytes, fileName); } catch (err) {
                if (err instanceof BibleError && err.status === 400) { pending = null; return { file: String(fileName).split(/[\\/]/).pop(), refused: err.message }; }
                throw err;
            }
        },
        // { token, sigla, name, rights, replace } -> { version, verses, name }.
        // `replace`: the own edition whose file is being swapped (its sigla stays).
        install({ token, sigla, name, rights, replace = null } = {}) {
            if (!pending || pending.token !== token) throw new BibleError("Escolha o arquivo de novo.", 409);
            if (rights !== true) throw new BibleError("Confirme que a igreja tem o direito de usar esta edição.");
            const title = String(name ?? "").trim().slice(0, 80);
            if (!title) throw new BibleError("Dê um nome à edição.");
            const s = normalizeSigla(sigla);
            const own = ownEditions(store);
            if (replace && (normalizeSigla(replace) !== s || !own.some((e) => e.sigla === s))) throw new BibleError("A sigla de uma edição da igreja não muda ao trocar o arquivo.");
            const problem = siglaProblem(s, [...Object.keys(SOURCES), ...own.map((e) => e.sigla).filter((x) => x !== (replace ? s : null))]);
            if (problem) throw new BibleError(problem);
            const { parsed, fileName } = pending;
            const result = installVerses(store, s, parsed, { nt: false });
            const info = describe(parsed);
            const row = { sigla: s, name: title, format: parsed.format, file_name: fileName, verses: result.verses, books: info.books, testament: info.testament, language: info.language || "", rights_confirmed: true };
            const old = own.find((e) => e.sigla === s);
            if (old) store.call("BibleEdition", "update", [old.id, row]);
            else store.call("BibleEdition", "create", [row]);
            pending = null;
            return { version: s, verses: result.verses, name: title };
        },
        // Excluir…: the edition's verses and its row (the church keeps its file).
        remove(sigla) {
            const s = normalizeSigla(sigla);
            const rows = ownEditions(store).filter((e) => e.sigla === s);
            if (!rows.length) throw new BibleError("Esta edição não foi instalada de um arquivo da igreja.", 404);
            const verses = store.dropRows("BibleVerse", "version", s);
            for (const r of rows) store.call("BibleEdition", "delete", [r.id]);
            return { version: s, verses };
        },
    };
}

module.exports = {
    SOURCES,
    MIN_VERSES,
    MIN_NT_VERSES,
    siglaProblem,
    createOwnInstaller,
    ownEditions,
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
