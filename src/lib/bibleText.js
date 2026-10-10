// Where Bible text comes from, for every component that shows or projects it.
//
//   1. The local database (once a version is installed): instant, offline,
//      exact.
//   2. abibliadigital.com.br, when online and the version exists there
//      (fetched by the main process: the page would hit CORS).
//
// KERYX never asks an AI for scripture. Network screens (no desktop bridge)
// read installed text through the same store, over the church network.

import { keryx } from "@/api/keryxClient";
import { ClientError } from "@/api/errors";
import { BIBLE_VERSIONS, BOOK_API_MAP, bibleBooks, editionPlan, readByPlan } from "@/lib/bibleBooks";
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

async function fetchOnline(version, book, chapter) {
    const key = `${ONLINE_CACHE_PREFIX}${version}_${book}_${chapter}`;
    try {
        const cached = JSON.parse(localStorage.getItem(key) || "null");
        if (Array.isArray(cached) && cached.length) return cached;
    } catch { /* ignore a bad cache entry */ }

    const api = versionInfo(version)?.api;
    const slug = BOOK_API_MAP[book];
    // Only the desktop app can ask: the request goes through the main
    // process, because the site's CORS policy blocks the page.
    if (!api || !slug || !keryx.isDesktop || !navigator.onLine) return null;
    try {
        const res = await window.keryxDesktop.bible.onlineChapter(api, slug, chapter);
        if (res.error || !res.data.length) return null;
        localStorage.setItem(key, JSON.stringify(res.data));
        return res.data;
    } catch {
        return null;
    }
}

// { verses: [{ number, text }], source: "local" | "online" }
export async function getChapter(version, book, chapter) {
    const local = await keryx.entities.BibleVerse.filter({ version, book, chapter: Number(chapter) }, "verse");
    if (local.length) return { verses: local.map((v) => ({ number: v.verse, text: v.text })), source: "local" };

    const online = await fetchOnline(version, book, chapter);
    if (online) return { verses: online, source: "online" };

    const installable = versionInfo(version)?.install;
    throw new ClientError(
        installable
            ? `A ${version} não está instalada neste computador. Instale-a em Configurações › Bíblias instaladas (ou pelo + da Bíblia).`
            : `A ${version} só está disponível com internet. Use uma versão instalada (NVI, ACF ou AA) para projetar sem internet.`,
        404,
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
        throw new ClientError("Nenhuma Bíblia instalada. Instale uma em Configurações › Bíblias instaladas.", 404);
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
        throw new ClientError("Nenhuma Bíblia instalada. Baixe uma em Configurações › Bíblias instaladas para buscar por palavra.", 404);
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
