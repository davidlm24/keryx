// Where Bible text comes from, for every component that shows or projects it.
//
//   1. The local database (once a version is installed): instant, offline,
//      exact.
//   2. bolls.life, when online and the edition is there (BIBLE_VERSIONS'
//      `online` code; fetched by the main process, electron/bible.cjs, so
//      the page never talks to the internet itself).
//
// KERYX never asks an AI for scripture. Network screens (no desktop bridge)
// read installed text through the same store, over the church network.

import { keryx } from "@/api/keryxClient";
import { ClientError } from "@/api/errors";
import { BIBLE_VERSIONS, bibleBooks, bookNumber, editionPlan, readByPlan } from "@/lib/bibleBooks";
import { searchTerms, anchorTerm, verseMatches } from "@/lib/bibleSearch";

const ONLINE_CACHE_PREFIX = "bible_";

const versionInfo = (id) => BIBLE_VERSIONS.find((v) => v.id === id);

// Versions installed on this computer: { NVI: 31105, ... }. Empty on web.
let installedCache = null;
export async function installedVersions({ refresh = false } = {}) {
    if (!keryx.isDesktop) return {};
    if (!installedCache || refresh) {
        const res = await window.keryxDesktop.bible.status();
        installedCache = res.error ? {} : res.data;
    }
    return installedCache;
}

// The edition to read for `wanted` (editionPlan in bibleBooks.js): itself
// when installed or online, else the first installed one.
export async function preferredVersion(wanted) {
    return editionPlan(wanted, Object.keys(await installedVersions())).use;
}

// A chapter in the edition the operator chose: online when it is not
// installed, and from the first installed edition when the internet fails
// (`fellBack` names the edition that could not be read).
// -> { verses, source, version, fellBack }
export async function readChapter(wanted, book, chapter) {
    const plan = editionPlan(wanted, Object.keys(await installedVersions()));
    return readByPlan(plan, (edition) => getChapter(edition, book, chapter));
}

export function forgetInstalledVersions() {
    installedCache = null;
}

// One chapter from the internet: { verses } or { error } (why it could not
// be read: no internet, the service down…), or null when the edition has no
// online source. The cache's key changed with the source (bolls.life text,
// without the old service's), so nothing read from the old one is reused.
async function fetchOnline(version, book, chapter) {
    const key = `${ONLINE_CACHE_PREFIX}b_${version}_${book}_${chapter}`;
    try {
        const cached = JSON.parse(localStorage.getItem(key) || "null");
        if (Array.isArray(cached) && cached.length) return { verses: cached };
    } catch { /* ignore a bad cache entry */ }

    const code = versionInfo(version)?.online;
    const number = bookNumber(book);
    // Only the desktop app (and the browser preview) can ask: the request
    // goes through the main process.
    if (!code || !number || !keryx.isDesktop) return null;
    if (!navigator.onLine) return { error: "sem conexão com a internet" };
    try {
        const res = await window.keryxDesktop.bible.onlineChapter(code, number, chapter);
        if (res.error) return { error: res.error.message.replace(/\.$/, "") };
        if (!res.data.length) return { error: "o capítulo não existe nesta edição" };
        try { localStorage.setItem(key, JSON.stringify(res.data)); } catch { /* the cache is a convenience */ }
        return { verses: res.data };
    } catch (err) {
        return { error: err?.message || "não respondeu" };
    }
}

// { verses: [{ number, text }], source: "local" | "online" }
export async function getChapter(version, book, chapter) {
    const local = await keryx.entities.BibleVerse.filter({ version, book, chapter: Number(chapter) }, "verse");
    if (local.length) return { verses: local.map((v) => ({ number: v.verse, text: v.text })), source: "local" };

    const online = await fetchOnline(version, book, chapter);
    if (online?.verses) return { verses: online.verses, source: "online" };

    // Every edition installs (Configurações › Bíblia e músicas, or the
    // Bíblia's +); one read from the internet says why it did not come.
    throw new ClientError(
        online?.error
            ? `A ${version} não carregou da internet (${online.error}). Instale-a em Configurações › Bíblia e músicas para usar sem internet.`
            : `A ${version} não está instalada neste computador. Instale-a em Configurações › Bíblia e músicas (ou pelo + da Bíblia).`,
        online?.error ? 503 : 404,
    );
}

// Verses verseStart..verseEnd of a chapter (the whole chapter without them).
export async function getPassage(version, book, chapter, verseStart, verseEnd) {
    const { verses, source } = await getChapter(version, book, chapter);
    if (!verseStart) return { verses, source };
    const end = verseEnd || verseStart;
    const picked = verses.filter((v) => v.number >= verseStart && v.number <= end);
    if (!picked.length) throw new ClientError(`${book} ${chapter}:${verseStart} não existe na ${version}.`, 404);
    return { verses: picked, source };
}

// Verses containing the words, ignoring case and accents, in canonical order:
// [{ book, chapter, verse, text, version }]. Searches `version` when it is
// installed, otherwise the first installed one. On this computer only:
// null on a network screen.
export async function searchVerses(query, version, limit = 20) {
    if (!keryx.isDesktop) return null;
    const q = String(query || "").trim();
    if (q.length < 3) return [];
    const installed = Object.keys(await installedVersions());
    if (!installed.length) {
        throw new ClientError("Nenhuma Bíblia instalada. Instale uma em Configurações › Bíblia e músicas.", 404);
    }
    const target = installed.includes(version) ? version : installed[0];
    const rows = await keryx.entities.BibleVerse.filter({ version: target, text: { $regex: q } }, "id", limit);
    return rows.map((r) => ({ book: r.book, chapter: r.chapter, verse: r.verse, text: r.text, version: target }));
}

// The console's word search: every verse of `version` (or of the first
// installed one) holding all the words and quoted phrases of the query,
// ignoring case and accents, in canonical order (book, chapter, verse), within `books` when given
// (src/lib/bibleSearch.js reads the query). The database is asked for the
// longest term; the rest is checked here.
// -> { version, terms, total, verses: [{ book, chapter, verse, text }] }
// On this computer only: null on a network screen.
export async function searchBible(query, version, { books = null, limit = 300 } = {}) {
    if (!keryx.isDesktop) return null;
    const terms = searchTerms(query);
    if (anchorTerm(terms).length < 3) return { version, terms, total: 0, verses: [], short: true };
    const installed = Object.keys(await installedVersions());
    if (!installed.length) {
        throw new ClientError("Nenhuma Bíblia instalada. Baixe uma em Configurações › Bíblia e músicas para buscar por palavra.", 404);
    }
    const target = installed.includes(version) ? version : installed[0];
    const filter = { version: target, text: { $regex: anchorTerm(terms) } };
    if (books) filter.book = books;
    const rows = await keryx.entities.BibleVerse.filter(filter, "id");
    // Canonical order (book, chapter, verse): row ids need not follow it.
    const at = new Map(bibleBooks.map((b, i) => [b.name, i]));
    const hits = rows.filter((r) => verseMatches(r.text, terms))
        .sort((a, b) => (at.get(a.book) ?? 99) - (at.get(b.book) ?? 99) || a.chapter - b.chapter || a.verse - b.verse);
    return { version: target, terms, total: hits.length, verses: hits.slice(0, limit).map((r) => ({ book: r.book, chapter: r.chapter, verse: r.verse, text: r.text })) };
}

export const versesToText = (verses) => verses.map((v) => `${v.number} ${v.text}`).join("\n");
