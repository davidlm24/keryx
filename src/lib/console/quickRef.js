// The Bible quick jump (Holyrics-style): what the operator has typed so far,
// read as Livro → Capítulo → Versículo. Plain JS, no imports beyond the book
// table, so node --test can check it.
//
// "j"          -> step livro, candidates Josué, Juízes, Jó, Jeremias, …
// "jo"         -> João (exact short form wins), step capitulo
// "jo 3" / "jo3" -> chapter 3, still on capitulo
// "jo 3 " / "jo 3:" -> step versiculo
// "jo 3 16-18" -> verses 16 to 18
// "1co 13 4-7" -> 1 Coríntios 13:4-7
import { bibleBooks, findBook, fold } from "../bibleBooks.js";

const MAX_CANDIDATES = 14;

// A book name typed so far: an optional 1-3, then letters (accents and inner
// spaces allowed: "1 sam", "cantico dos"); the rest is numbers.
const SHAPE = /^\s*((?:[1-3]\s*)?\p{L}[\p{L}\s.]*?)\s*((?:\d|[\s:.,-])*)$/u;

export function readQuickRef(text) {
    const raw = String(text || "");
    const out = { text: raw, step: "livro", query: "", candidates: [], book: null, chapter: null, verseStart: null, verseEnd: null, valid: false, error: "" };
    const m = SHAPE.exec(raw);
    if (!m) {
        out.query = raw.trim();
        out.error = raw.trim() ? "Livro não reconhecido" : "";
        return out;
    }
    const [, bookText, rest] = m;
    out.query = bookText.trim();
    const key = fold(bookText);
    const prefixed = bibleBooks.filter((b) => fold(b.name).startsWith(key) || fold(b.short).startsWith(key));
    out.candidates = prefixed.slice(0, MAX_CANDIDATES).map((b) => ({ name: b.name, short: b.short }));
    const book = findBook(bookText) || (prefixed.length === 1 ? prefixed[0] : null);
    if (!book) {
        if (!prefixed.length) out.error = "Livro não reconhecido";
        return out;
    }
    out.book = book;
    out.candidates = [{ name: book.name, short: book.short }];
    out.step = "capitulo";

    // Numbers: chapter, then verse, then an optional end after "-".
    const tokens = rest.match(/\d+|-|[\s:.,]+/g) || [];
    const nums = [];
    let dash = false;
    let sepAfterChapter = false;
    for (const t of tokens) {
        if (/^\d+$/.test(t)) {
            if (dash && nums.length >= 2) { out.verseEnd = Number(t); continue; }
            nums.push(Number(t));
        } else if (t === "-") {
            dash = true;
        } else if (nums.length === 1) {
            sepAfterChapter = true;
        }
    }
    if (!nums.length) {
        out.valid = false;
        return out;
    }
    const chapter = nums[0];
    if (chapter < 1 || chapter > book.chapters) {
        out.error = `${book.name} tem ${book.chapters} capítulo${book.chapters > 1 ? "s" : ""}`;
        return out;
    }
    out.chapter = chapter;
    out.valid = true;
    if (nums.length < 2 && !sepAfterChapter) return out;
    out.step = "versiculo";
    if (nums.length < 2) return out;
    const max = book.verses[chapter - 1];
    const start = nums[1];
    if (start < 1 || start > max) {
        out.error = `${book.name} ${chapter} tem ${max} versículos`;
        out.valid = false;
        return out;
    }
    out.verseStart = start;
    if (out.verseEnd != null) out.verseEnd = Math.max(start, Math.min(out.verseEnd, max));
    return out;
}

// The reference the quick jump shows ("João 3:16-18").
export function quickRefLabel(r) {
    if (!r.book) return r.query;
    if (!r.chapter) return r.book.name;
    if (!r.verseStart) return `${r.book.name} ${r.chapter}`;
    return `${r.book.name} ${r.chapter}:${r.verseStart}${r.verseEnd && r.verseEnd !== r.verseStart ? `-${r.verseEnd}` : ""}`;
}
