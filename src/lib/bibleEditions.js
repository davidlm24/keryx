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

// ---- The Bíblia's version list and its (+) (Rodada P, P3 = A) ----
// One option: the sigla and the full name ("ACF · Almeida Corrigida Fiel");
// the closed box shows only the sigla (BibleEnv lays it over the select).
export const editionOption = (v) => (v?.name && v.name !== v.id ? `${v.id} · ${v.name}` : v?.id || "");
// The select's <optgroup>s, in order: Instaladas, Ler pela internet and Da
// igreja (the church's own files); an edition that can be neither read here
// nor online (NVI, AA and the open ones not installed) is left to the (+),
// unless it is the one chosen (`wanted`): then it is listed alone, so the
// box still says what was asked for. Later one group per language.
// -> [{ id, label, items: [edition] }], the empty groups left out.
export function versionGroups(editions, installed = [], wanted = "") {
    const here = new Set(installed);
    const list = editions || [];
    const groups = [
        { id: "installed", label: "Instaladas", items: list.filter((v) => !v.own && here.has(v.id)) },
        { id: "online", label: "Ler pela internet", items: list.filter((v) => !v.own && !here.has(v.id) && v.online) },
        { id: "own", label: "Da igreja", items: list.filter((v) => v.own) },
    ];
    if (wanted && !groups.some((g) => g.items.some((v) => v.id === wanted))) {
        groups.push({ id: "wanted", label: "Não instalada", items: [list.find((v) => v.id === wanted) || { id: wanted, name: "" }] });
    }
    return groups.filter((g) => g.items.length);
}
// What the (+) offers to install: the editions of the list not installed on
// this computer (an installed one was listed as "Instalar" too, note 5).
export const installableEditions = (editions, installed = []) => (editions || []).filter((v) => v.install && !installed.includes(v.id));
