// The 66 books (Portuguese names, short forms, verse counts per chapter), the
// Bible versions the app offers, and a reference parser. Plain JS with no
// imports so node --test can load it.
//
// Verse counts come from the NVI, ACF and AA texts: the largest of the three
// per chapter, so every edition's verses are reachable. The earlier table was
// wrong in ~165 chapters (Levítico 23 listed 9 verses instead of 44).

export const bibleBooks = [
    { name: "Gênesis", short: "Gn", chapters: 50, verses: [31,25,24,26,32,22,24,22,29,32,32,20,18,24,21,16,27,33,38,18,34,24,20,67,34,35,46,22,35,43,55,32,20,31,29,43,36,30,23,23,57,38,34,34,28,34,31,22,33,26] },
    { name: "Êxodo", short: "Ex", chapters: 40, verses: [22,25,22,31,23,30,25,32,35,29,10,51,22,31,27,36,16,27,25,26,36,31,33,18,40,37,21,43,46,38,18,35,23,35,35,38,29,31,43,38] },
    { name: "Levítico", short: "Lv", chapters: 27, verses: [17,16,17,35,19,30,38,36,24,20,47,8,59,57,33,34,16,30,37,27,24,33,44,23,55,46,34] },
    { name: "Números", short: "Nm", chapters: 36, verses: [54,34,51,49,31,27,89,26,23,36,35,16,33,45,41,50,13,32,22,29,35,41,30,25,18,65,23,31,40,16,54,42,56,29,34,13] },
    { name: "Deuteronômio", short: "Dt", chapters: 34, verses: [46,37,29,49,33,25,26,20,29,22,32,32,18,29,23,22,20,22,21,20,23,30,25,22,19,19,26,68,29,20,30,52,29,12] },
    { name: "Josué", short: "Js", chapters: 24, verses: [18,24,17,24,15,27,26,35,27,43,23,24,33,15,63,10,18,28,51,9,45,34,16,33] },
    { name: "Juízes", short: "Jz", chapters: 21, verses: [36,23,31,24,32,40,25,35,57,18,40,15,25,20,20,31,13,31,30,48,25] },
    { name: "Rute", short: "Rt", chapters: 4, verses: [22,23,18,22] },
    { name: "1 Samuel", short: "1Sm", chapters: 31, verses: [28,36,21,22,12,21,17,22,27,27,15,25,23,52,35,23,58,30,24,43,15,23,29,22,44,25,12,25,11,31,13] },
    { name: "2 Samuel", short: "2Sm", chapters: 24, verses: [27,32,39,12,25,23,29,18,13,19,27,31,39,33,37,23,29,33,43,26,22,51,39,25] },
    { name: "1 Reis", short: "1Rs", chapters: 22, verses: [53,46,28,34,18,38,51,66,28,29,43,33,34,31,34,34,24,46,21,43,29,54] },
    { name: "2 Reis", short: "2Rs", chapters: 25, verses: [18,25,27,44,27,33,20,29,37,36,21,21,25,29,38,20,41,37,37,21,26,20,37,20,30] },
    { name: "1 Crônicas", short: "1Cr", chapters: 29, verses: [54,55,24,43,26,81,40,40,44,14,47,40,14,17,29,43,27,17,19,8,30,19,32,31,31,32,34,21,30] },
    { name: "2 Crônicas", short: "2Cr", chapters: 36, verses: [17,18,17,22,14,42,22,18,31,19,23,16,22,15,19,14,19,34,11,37,20,12,21,27,28,23,9,27,36,27,21,33,25,33,27,23] },
    { name: "Esdras", short: "Ed", chapters: 10, verses: [11,70,13,24,17,22,28,36,15,44] },
    { name: "Neemias", short: "Ne", chapters: 13, verses: [11,20,32,23,19,19,73,18,38,39,36,47,31] },
    { name: "Ester", short: "Et", chapters: 10, verses: [22,23,15,17,14,14,10,17,32,3] },
    { name: "Jó", short: "Jó", chapters: 42, verses: [22,13,26,21,27,30,21,22,35,22,20,25,28,22,35,22,16,21,29,29,34,30,17,25,6,14,23,28,25,31,40,22,33,37,16,33,24,41,30,24,34,17] },
    { name: "Salmos", short: "Sl", chapters: 150, verses: [6,12,8,8,12,10,17,9,20,18,7,8,6,7,5,11,15,50,14,9,13,31,6,10,22,12,14,9,11,12,24,11,22,22,28,12,40,22,13,17,13,11,5,26,17,11,9,14,20,23,19,9,6,7,23,13,11,11,17,12,8,12,11,10,13,20,7,35,36,5,24,20,28,23,10,12,20,72,13,19,16,8,18,12,13,17,7,18,52,17,16,15,5,23,11,13,12,9,9,5,8,28,22,35,45,48,43,13,31,7,10,10,9,8,18,19,2,29,176,7,8,9,4,8,5,6,5,6,8,8,3,18,3,3,21,26,9,8,24,13,10,7,12,15,21,10,20,14,9,6] },
    { name: "Provérbios", short: "Pv", chapters: 31, verses: [33,22,35,27,23,35,27,36,18,32,31,28,25,35,33,33,28,24,29,30,31,29,35,34,28,28,27,28,27,33,31] },
    { name: "Eclesiastes", short: "Ec", chapters: 12, verses: [18,26,22,16,20,12,29,17,18,20,10,14] },
    { name: "Cânticos", short: "Ct", chapters: 8, verses: [17,17,11,16,16,13,13,14] },
    { name: "Isaías", short: "Is", chapters: 66, verses: [31,22,26,6,30,13,25,22,21,34,16,6,22,32,9,14,14,7,25,6,17,25,18,23,12,21,13,29,24,33,9,20,24,17,10,22,38,22,8,31,29,25,28,28,25,13,15,22,26,11,23,15,12,17,13,12,21,14,21,22,11,12,19,12,25,24] },
    { name: "Jeremias", short: "Jr", chapters: 52, verses: [19,37,25,31,31,30,34,22,26,25,23,17,27,22,21,21,27,23,15,18,14,30,40,10,38,24,22,17,32,24,40,44,26,22,19,32,21,28,18,16,18,22,13,30,5,28,7,47,39,46,64,34] },
    { name: "Lamentações", short: "Lm", chapters: 5, verses: [22,22,66,22,22] },
    { name: "Ezequiel", short: "Ez", chapters: 48, verses: [28,10,27,17,17,14,27,18,11,22,25,28,23,23,8,63,24,32,14,49,32,31,49,27,17,21,36,26,21,26,18,32,33,31,15,38,28,23,29,49,26,20,27,31,25,24,23,35] },
    { name: "Daniel", short: "Dn", chapters: 12, verses: [21,49,30,37,31,28,28,27,27,21,45,13] },
    { name: "Oséias", short: "Os", chapters: 14, verses: [11,23,5,19,15,11,16,14,17,15,12,14,16,9] },
    { name: "Joel", short: "Jl", chapters: 3, verses: [20,32,21] },
    { name: "Amós", short: "Am", chapters: 9, verses: [15,16,15,13,27,14,17,14,15] },
    { name: "Obadias", short: "Ob", chapters: 1, verses: [21] },
    { name: "Jonas", short: "Jn", chapters: 4, verses: [17,10,10,11] },
    { name: "Miquéias", short: "Mq", chapters: 7, verses: [16,13,12,13,15,16,20] },
    { name: "Naum", short: "Na", chapters: 3, verses: [15,13,19] },
    { name: "Habacuque", short: "Hc", chapters: 3, verses: [17,20,19] },
    { name: "Sofonias", short: "Sf", chapters: 3, verses: [18,15,20] },
    { name: "Ageu", short: "Ag", chapters: 2, verses: [15,23] },
    { name: "Zacarias", short: "Zc", chapters: 14, verses: [21,13,10,14,11,15,14,23,17,12,17,14,9,21] },
    { name: "Malaquias", short: "Ml", chapters: 4, verses: [14,17,18,6] },
    { name: "Mateus", short: "Mt", chapters: 28, verses: [25,23,17,25,48,34,29,34,38,42,30,50,58,36,39,28,27,35,30,34,46,46,39,51,46,75,66,20] },
    { name: "Marcos", short: "Mc", chapters: 16, verses: [45,28,35,41,43,56,37,38,50,52,33,44,37,72,47,20] },
    { name: "Lucas", short: "Lc", chapters: 24, verses: [80,52,38,44,39,49,50,56,62,42,54,59,35,35,32,31,37,43,48,47,38,71,56,53] },
    { name: "João", short: "Jo", chapters: 21, verses: [51,25,36,54,47,71,53,59,41,42,57,50,38,31,27,33,26,40,42,31,25] },
    { name: "Atos", short: "At", chapters: 28, verses: [26,47,26,37,42,15,60,40,43,48,30,25,52,28,41,40,34,28,41,38,40,30,35,27,27,32,44,31] },
    { name: "Romanos", short: "Rm", chapters: 16, verses: [32,29,31,25,21,23,25,39,33,21,36,21,14,23,33,27] },
    { name: "1 Coríntios", short: "1Co", chapters: 16, verses: [31,16,23,21,13,20,40,13,27,33,34,31,13,40,58,24] },
    { name: "2 Coríntios", short: "2Co", chapters: 13, verses: [24,17,18,18,21,18,16,24,15,18,33,21,14] },
    { name: "Gálatas", short: "Gl", chapters: 6, verses: [24,21,29,31,26,18] },
    { name: "Efésios", short: "Ef", chapters: 6, verses: [23,22,21,32,33,24] },
    { name: "Filipenses", short: "Fp", chapters: 4, verses: [30,30,21,23] },
    { name: "Colossenses", short: "Cl", chapters: 4, verses: [29,23,25,18] },
    { name: "1 Tessalonicenses", short: "1Ts", chapters: 5, verses: [10,20,13,18,28] },
    { name: "2 Tessalonicenses", short: "2Ts", chapters: 3, verses: [12,17,18] },
    { name: "1 Timóteo", short: "1Tm", chapters: 6, verses: [20,15,16,16,25,21] },
    { name: "2 Timóteo", short: "2Tm", chapters: 4, verses: [18,26,17,22] },
    { name: "Tito", short: "Tt", chapters: 3, verses: [16,15,15] },
    { name: "Filemom", short: "Fm", chapters: 1, verses: [25] },
    { name: "Hebreus", short: "Hb", chapters: 13, verses: [14,18,19,16,14,20,28,13,28,39,40,29,25] },
    { name: "Tiago", short: "Tg", chapters: 5, verses: [27,26,18,17,20] },
    { name: "1 Pedro", short: "1Pe", chapters: 5, verses: [25,25,22,19,14] },
    { name: "2 Pedro", short: "2Pe", chapters: 3, verses: [21,22,18] },
    { name: "1 João", short: "1Jo", chapters: 5, verses: [10,29,24,21,21] },
    { name: "2 João", short: "2Jo", chapters: 1, verses: [13] },
    { name: "3 João", short: "3Jo", chapters: 1, verses: [15] },
    { name: "Judas", short: "Jd", chapters: 1, verses: [25] },
    { name: "Apocalipse", short: "Ap", chapters: 22, verses: [20,29,22,11,14,17,17,13,21,11,19,18,18,20,8,21,18,24,21,15,27,21] }
];

// Versions the app offers (owner 2026-10-20: every one installable, and
// readable from the internet while it is not), in the groups of
// Configurações › Bíblias instaladas (the "Bíblias" mockup, b1 = grupos):
//   group:   "publisher" — copyrighted, downloaded from public repositories,
//            the church's licence; "open" — eBible.org's open editions, free
//            to copy with the credit (`credit`, shown in Sobre and the
//            version's tooltip).
//   install: true — the church can download it once into the local database
//            (electron/bible.cjs SOURCES says from where: github.com/
//            thiagobodruk/biblia for NVI, ACF and AA, bolls.life for ARA…KJA,
//            eBible.org for the open ones).
//   online:  its code on bolls.life, read one chapter at a time while the
//            edition is not installed; null = not there (bolls.life does not
//            carry NVI or AA, eBible.org has no chapter endpoint), so it
//            works only installed.
//   holder:  who holds its rights; `chip` the licence in a word, `license`
//            in full; `nt`: only the New Testament.
export const BIBLE_VERSIONS = [
    { id: "NVI", name: "Nova Versão Internacional", install: true, online: null, group: "publisher", holder: "Biblica" },
    { id: "ACF", name: "Almeida Corrigida Fiel", install: true, online: "ACF11", group: "publisher", holder: "SBTB" },
    { id: "AA", name: "Almeida Revisada Imprensa Bíblica", install: true, online: null, group: "publisher", holder: "Imprensa Bíblica" },
    { id: "ARA", name: "Almeida Revista e Atualizada", install: true, online: "ARA", group: "publisher", holder: "SBB" },
    { id: "ARC", name: "Almeida Revista e Corrigida", install: true, online: "ARC09", group: "publisher", holder: "SBB" },
    { id: "NAA", name: "Nova Almeida Atualizada", install: true, online: "NAA", group: "publisher", holder: "SBB" },
    { id: "NTLH", name: "Nova Tradução na Linguagem de Hoje", install: true, online: "NTLH", group: "publisher", holder: "SBB" },
    { id: "KJA", name: "King James Atualizada", install: true, online: "KJA", group: "publisher", holder: "Abba Press" },
    { id: "BLIVRE", name: "Bíblia Livre", install: true, online: null, group: "open", holder: "Diego Santos, Mario Sérgio e Marco Teles", chip: "CC BY 4.0", license: "CC BY 4.0 Brasil" },
    { id: "NBV", name: "Nova Bíblia Viva 2007", install: true, online: null, group: "open", holder: "Biblica, Inc.", chip: "CC BY-SA", license: "CC BY-SA 4.0" },
    { id: "BPM", name: "Bíblia Portuguesa Mundial", install: true, online: null, group: "open", holder: null, chip: "Domínio público", license: "Domínio público" },
    { id: "BLT", name: "Bíblia Livre Para Todos", install: true, online: null, group: "open", holder: "Free Bible Ministry, Inc.", chip: "CC BY-SA", license: "CC BY-SA 4.0", nt: true },
];
export const OPEN_SOURCE_NAME = "eBible.org";
// An open edition's credit, as its licence asks: "Nova Bíblia Viva 2007 ·
// Biblica, Inc. · CC BY-SA 4.0 · eBible.org". null for the others.
export const editionCredit = (v) => (v?.group === "open" ? [v.name, v.holder, v.license, OPEN_SOURCE_NAME].filter(Boolean).join(" · ") : null);

// An edition the church installed from its own file (a BibleEdition row,
// electron/bible.cjs installOwn), in the shape of the list's.
export const ownEdition = (row) => ({ id: row.sigla, name: row.name || row.sigla, install: false, online: null, group: "own", own: true, nt: row.testament === "nt", ot: row.testament === "ot", format: row.format || null, file: row.file_name || null, rowId: row.id });
// Every edition this computer can offer: the list, then the church's own.
export const editionList = (ownRows = []) => [...BIBLE_VERSIONS, ...ownRows.filter((r) => r?.sigla && !BIBLE_VERSIONS.some((v) => v.id === r.sigla)).map(ownEdition)];
// An edition that has no text for this book (the BLT, an own NT): the
// sentence the Bíblia shows instead of the chapter, else null.
export function missingTestament(edition, bookName) {
    const i = bibleBooks.findIndex((b) => b.name === bookName);
    if (!edition || i < 0) return null;
    if (edition.nt && i < 39) return `A ${edition.id} tem só o Novo Testamento: ${bookName} não está nela. Escolha outra edição para o Antigo Testamento.`;
    if (edition.ot && i >= 39) return `A ${edition.id} tem só o Antigo Testamento: ${bookName} não está nela. Escolha outra edição para o Novo Testamento.`;
    return null;
}

// An own edition's sigla: 2 to 8 letters or digits, none of the list's,
// none retired (RENAMED), none of the church's other editions. Must say
// the same as siglaProblem in electron/bible.cjs (a test checks).
// -> a sentence, or null when it can be used.
export function siglaProblem(sigla, taken = []) {
    const s = String(sigla ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9]{2,8}$/.test(s)) return "A sigla tem de 2 a 8 letras ou números, sem espaços.";
    if ([...taken, ...Object.keys(RENAMED)].some((t) => String(t).trim().toUpperCase() === s)) return `Já existe uma edição com a sigla ${s}.`;
    return null;
}

// Editions that left the list, read as the one that took their place (the
// King James Fiel 1611 was only ever online, from a source that closed).
const RENAMED = { BKJ1611: "KJA" };
export const renamedVersion = (id) => RENAMED[id] || id;

// Which edition to read, from the one the operator chose and the editions
// installed on this computer (owner's decision 2026-10-10): an installed
// edition is read here; one that is not installed but exists online (ARA,
// ARC, NAA, NTLH, KJA or ACF before installing) is read from the internet, and a chapter that cannot be fetched comes from the first
// installed edition instead (`fallback`), said so; an edition that is
// neither (NVI, AA, the open ones or a church's own edition not installed
// here) gives way to the first installed one.
// -> { use, online, fallback }
export function editionPlan(asked, installed = []) {
    const wanted = renamedVersion(asked);
    if (installed.includes(wanted)) return { use: wanted, online: false, fallback: null };
    if (BIBLE_VERSIONS.find((v) => v.id === wanted)?.online) return { use: wanted, online: true, fallback: installed.find((v) => v !== wanted) || null };
    return { use: installed[0] || wanted, online: !installed.length, fallback: null };
}

// Reads a chapter by a plan: `get(edition)` resolves the chapter or throws;
// when the planned edition fails and there is a fallback, that one is read.
// -> { ...chapter, version, fellBack }
export async function readByPlan(plan, get) {
    try {
        return { ...(await get(plan.use)), version: plan.use, fellBack: null };
    } catch (err) {
        if (!plan.fallback) throw err;
        return { ...(await get(plan.fallback)), version: plan.fallback, fellBack: plan.use };
    }
}

// A book's number on bolls.life (1 Gênesis … 66 Apocalipse): its place in
// the canonical list.
export const bookNumber = (name) => { const i = bibleBooks.findIndex((b) => b.name === name); return i < 0 ? null : i + 1; };

// -- References ---------------------------------------------------------------

export const fold = (text) => String(text).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[\s.]+/g, "");
const squash = (text) => String(text || "").trim().toLowerCase().replace(/[\s.]+/g, "");

const ALIASES = {
    cantares: "Cânticos",
    canticodoscanticos: "Cânticos",
    canticosdoscanticos: "Cânticos",
    atosdosapostolos: "Atos",
    apoc: "Apocalipse",
};

// "João", "joao", "Jo", "1co", "1 Coríntios", "gen" -> the book, or null.
// An exact (accent-sensitive) match wins, so "Jo" is João and "Jó" is Jó;
// then accent-insensitive; then a unique prefix of a full name.
export function findBook(text) {
    const raw = squash(text);
    if (!raw) return null;
    const exact = bibleBooks.find((b) => squash(b.name) === raw || squash(b.short) === raw);
    if (exact) return exact;
    const key = fold(raw);
    if (ALIASES[key]) return bibleBooks.find((b) => b.name === ALIASES[key]);
    const folded = bibleBooks.filter((b) => fold(b.name) === key || fold(b.short) === key);
    if (folded.length === 1) return folded[0];
    if (key.length < 3) return null;
    const prefixed = bibleBooks.filter((b) => fold(b.name).startsWith(key));
    return prefixed.length === 1 ? prefixed[0] : null;
}

// "João 3:16", "jo 3.16-18", "1Co 13", "Salmos 23:1-6" ->
// { book, chapter, verseStart, verseEnd } (verses null for a whole chapter),
// or null when it is not a valid reference. A range past the last verse is
// trimmed to it.
export function parseReference(input) {
    const match = String(input || "").trim().match(/^(.+?)\s*(\d+)(?:\s*[:.,]\s*(\d+)(?:\s*[-–]\s*(\d+))?)?$/);
    if (!match) return null;
    const [, bookText, chapterText, startText, endText] = match;
    const book = findBook(bookText);
    if (!book) return null;
    const chapter = Number(chapterText);
    if (chapter < 1 || chapter > book.chapters) return null;
    if (!startText) return { book: book.name, chapter, verseStart: null, verseEnd: null };
    const max = book.verses[chapter - 1];
    const verseStart = Number(startText);
    const verseEnd = endText ? Number(endText) : verseStart;
    if (verseStart < 1 || verseStart > max || verseEnd < verseStart) return null;
    return { book: book.name, chapter, verseStart, verseEnd: Math.min(verseEnd, max) };
}

export function formatReference({ book, chapter, verseStart, verseEnd }) {
    if (!verseStart) return `${book} ${chapter}`;
    return verseEnd && verseEnd !== verseStart ? `${book} ${chapter}:${verseStart}-${verseEnd}` : `${book} ${chapter}:${verseStart}`;
}
