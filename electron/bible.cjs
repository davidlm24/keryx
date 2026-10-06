// Installs a Bible translation into the local database (entity BibleVerse),
// either downloaded once from github.com/thiagobodruk/biblia or from a copy of
// that JSON picked on disk. After that, every lookup and search is local.
//
// KERYX does not ship the texts: NVI (Biblica), ACF (Sociedade Bíblica
// Trinitariana do Brasil) and AA (Imprensa Bíblica Brasileira) are copyrighted
// editions. Each church downloads its own copy, as the web app always did.

const SOURCES = { NVI: "nvi", ACF: "acf", AA: "aa" };
const sourceUrl = (version) => `https://raw.githubusercontent.com/thiagobodruk/biblia/master/json/${SOURCES[version]}.json`;

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

// Re-installing replaces verse by verse (ids are deterministic).
function installFromJson(store, version, raw) {
    assertVersion(version);
    const rows = toRows(version, parseBibleJson(raw));
    store.importRows("BibleVerse", rows);
    return { version, verses: rows.length };
}

async function installFromSource(store, version, fetchImpl = fetch) {
    assertVersion(version);
    let response;
    try {
        response = await fetchImpl(sourceUrl(version));
    } catch {
        throw new BibleError("Sem ligação à internet. Tente de novo quando estiver online, ou instale a partir de um arquivo.", 503);
    }
    if (!response.ok) throw new BibleError(`Não foi possível baixar a ${version} (HTTP ${response.status}).`, 502);
    return installFromJson(store, version, await response.text());
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
    installFromSource,
    installedVersions,
};
