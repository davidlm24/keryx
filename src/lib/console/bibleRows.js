// Configurações › Bíblia e músicas › Bíblias instaladas (owner 2026-10-20,
// the "Bíblias" mockup, b1 = grupos): the editions in three groups, each
// row with its licence chip. Pure, so the words are tested
// (bibleRows.test.mjs); BibliasSection draws them.
import { siglaProblem } from "../bibleEditions.js";

export const BIBLE_GROUPS = [
    { id: "own", title: "Da igreja", hint: "instaladas de um arquivo seu" },
    { id: "open", title: "Abertas", hint: "podem ser copiadas, com o crédito · eBible.org" },
    { id: "publisher", title: "Com direitos da editora", hint: "baixadas de repositórios públicos; a licença é da igreja" },
];

// The chip after an edition's name: whose it is, or its licence.
// -> { text, tone: "own" | "open" | "pd" | "cr" }
export function licenceChip(v) {
    if (v.group === "own") return { text: "Da igreja", tone: "own" };
    if (v.group === "open") return { text: v.chip || v.license, tone: /domínio público/i.test(v.chip || v.license || "") ? "pd" : "open" };
    return v.holder ? { text: v.holder, tone: "cr" } : null;
}

const count = (n) => `${Number(n).toLocaleString("pt-BR")} versículos`;
// The grey line under an edition's name (the list's words as before).
export function editionMeta(v, verses) {
    if (verses) return `Instalada neste computador · ${count(verses)}${v.own && v.file ? ` · de ${v.file}` : ""}`;
    if (v.own) return "Não instalada neste computador · escolha o arquivo de novo";
    return v.online ? "Pela internet · baixe para usar sem rede" : "Não instalada · baixe para usar";
}

// editions: editionList(own rows); installed: { NVI: 31105, … }.
// -> [{ ...group, rows: [{ edition, title, chip, nt, meta, verses }] }],
// an empty group left out (the church's own until it has one).
export function bibleGroups(editions, installed = {}) {
    return BIBLE_GROUPS.map((g) => ({
        ...g,
        rows: editions.filter((v) => (v.group || "publisher") === g.id).map((v) => ({
            edition: v,
            title: `${v.id} · ${v.name}`,
            chip: licenceChip(v),
            nt: Boolean(v.nt),
            meta: editionMeta(v, installed[v.id] || 0),
            verses: installed[v.id] || 0,
        })),
    })).filter((g) => g.rows.length);
}

// The sigla the dialog proposes for a file: the one the file names (a
// MySword module's abbreviation), else its file's name or title as letters
// and digits, else its letters only; the first one free. "" when none is.
export function ownSiglaGuess(read, taken = []) {
    const alnum = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const base = String(read?.file || "").replace(/(\.bbl)?\.[^.]+$/i, "").replace(/_vpl$/i, "");
    const initials = String(read?.title || "").split(/\s+/).map((w) => (/^\d+$/.test(w) ? "" : w[0] || "")).join("");
    const tries = [read?.abbrev, base, base.replace(/\d+/g, ""), initials].map(alnum).map((s) => s.slice(0, 8));
    return tries.find((s) => s.length >= 2 && !siglaProblem(s, taken)) || "";
}

// "4,1 MB", "820 kB".
export function ownSizeLabel(bytes) {
    const n = Number(bytes) || 0;
    if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
    return `${Math.max(1, Math.round(n / 1024)).toLocaleString("pt-BR")} kB`;
}
