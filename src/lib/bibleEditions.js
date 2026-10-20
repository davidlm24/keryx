// Every edition this computer can offer, beyond the list's own data
// (BIBLE_VERSIONS in bibleBooks.js): the church's own editions (BibleEdition
// rows, electron/bible.cjs createOwnInstaller), the open ones' credit, the
// sigla rule and what an edition of one Testament says on the other's books.
// Apart from bibleBooks.js so the outputs, which load that one, never carry
// this (scripts/bundle-budget.cjs).
import { BIBLE_VERSIONS, RETIRED_VERSIONS, bibleBooks } from "./bibleBooks.js";

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
    if ([...taken, ...RETIRED_VERSIONS].some((t) => String(t).trim().toUpperCase() === s)) return `Já existe uma edição com a sigla ${s}.`;
    return null;
}
