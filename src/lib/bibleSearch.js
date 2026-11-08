// Word search in the Bible, the parts that need no I/O: reading the query
// ("amor próximo" = verses with both words, "\"amor ao próximo\"" = that
// phrase), matching a verse, and marking the hits in its text — always
// ignoring case and accents, like the store's $regex ("coracao" finds
// "Coração"). Plain JS, no imports, so node --test can check it.

export const fold = (text) => String(text ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");

// -> folded terms: each quoted phrase is one term, every other word one term.
// Words of one letter are dropped ("e", "a"), phrases are kept whole.
export function searchTerms(query) {
    const terms = [];
    const rest = String(query ?? "").replace(/"([^"]*)"?/g, (_m, phrase) => {
        const p = fold(phrase).replace(/\s+/g, " ").trim();
        if (p) terms.push(p);
        return " ";
    });
    for (const w of fold(rest).split(/[^\p{L}\p{N}-]+/u)) if (w.length > 1) terms.push(w);
    return [...new Set(terms)];
}

export const verseMatches = (text, terms) => {
    if (!terms.length) return false;
    const f = fold(text);
    return terms.every((t) => f.includes(t));
};

// The term to ask the database for: the longest one (fewest rows to check).
export const anchorTerm = (terms) => terms.reduce((a, t) => (t.length > a.length ? t : a), "");

// The text cut into [{ text, hit }] parts, hits being every occurrence of
// any term — found on the folded text, cut on the original one, so "Coração"
// is marked whole when searching "coracao".
export function highlightParts(text, terms) {
    const src = String(text ?? "");
    if (!terms.length || !src) return [{ text: src, hit: false }];
    // folded[i] came from original index map[i] (one original character can
    // fold to zero or more characters).
    let folded = "";
    const map = [];
    for (let i = 0; i < src.length;) {
        const cp = src.codePointAt(i);
        const ch = String.fromCodePoint(cp);
        const f = fold(ch);
        for (let k = 0; k < f.length; k += 1) map.push(i);
        folded += f;
        i += ch.length;
    }
    const marks = new Array(src.length).fill(false);
    for (const t of terms) {
        for (let at = folded.indexOf(t); at >= 0; at = folded.indexOf(t, at + 1)) {
            const from = map[at];
            const lastStart = map[at + t.length - 1];
            const last = String.fromCodePoint(src.codePointAt(lastStart));
            for (let k = from; k < lastStart + last.length; k += 1) marks[k] = true;
        }
    }
    const parts = [];
    for (let i = 0; i < src.length; i += 1) {
        const prev = parts[parts.length - 1];
        if (prev && prev.hit === marks[i]) prev.text += src[i];
        else parts.push({ text: src[i], hit: marks[i] });
    }
    return parts;
}

// Where to search: the whole Bible, a testament, one book. The Old
// Testament is the first 39 books of the Portuguese canon.
export const SCOPES = [["all", "Toda"], ["ot", "AT"], ["nt", "NT"], ["book", "Este livro"]];
export function scopeBooks(scope, books, current) {
    if (scope === "ot") return books.slice(0, 39).map((b) => b.name);
    if (scope === "nt") return books.slice(39).map((b) => b.name);
    if (scope === "book") return [current];
    return null;
}
