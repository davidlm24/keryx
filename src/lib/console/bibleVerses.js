// Bible verses as what goes on screen: the rules the Bíblia environment and
// the command palette share. One verse goes out as its whole chapter, one
// verse per slide, starting there (so ←/→ keep walking the chapter); a range
// picked on purpose goes out as that passage, grouped 1/2/3 per slide or by
// length ("auto"). Pure, no I/O; tested in bibleVerses.test.mjs. The stage
// around it is stageFromVerses in stage.js.

// [3, 4, 5, 9] -> "3-5,9"
export const rangeLabel = (nums) => {
    const s = [...nums].sort((a, b) => a - b);
    if (!s.length) return "";
    const parts = []; let a = s[0]; let b = s[0];
    for (const n of s.slice(1)) { if (n === b + 1) b = n; else { parts.push(a === b ? `${a}` : `${a}-${b}`); a = b = n; } }
    parts.push(a === b ? `${a}` : `${a}-${b}`);
    return parts.join(",");
};

// A second edition of the same chapter (the Bíblia's "2ª versão", Rodada
// P): { verses, version }, the same verse numbers in another edition. Each
// slide carries the second one's text for its verses as slide.pair (the
// screens draw it beside or under the first, style.pair); verses it does
// not have are left out, and a slide with none of them has no pair.
const secondOf = (pair) => (pair?.version && pair.verses?.length ? { version: pair.version, texts: new Map(pair.verses.map((v) => [v.number, v.text])) } : null);
function pairOf(nums, second) {
    const have = second ? nums.filter((n) => second.texts.has(n)) : [];
    return have.length ? { text: have.map((n) => `${n} ${second.texts.get(n)}`).join(" "), version: second.version } : null;
}
// "auto" fills a slide up to this many characters; with two editions on
// screen each holds half as much, so the slide does.
export const AUTO_CHARS = 220;

// Verses -> slides: one, two, three per slide, or by length (auto).
// pair: a second edition ({ verses, version }; see secondOf).
export function groupVerses(verses, how, pair = null) {
    const second = secondOf(pair);
    const limit = second ? AUTO_CHARS / 2 : AUTO_CHARS;
    const out = []; let cur = [];
    const flush = () => {
        if (!cur.length) return;
        const p = pairOf(cur.map((v) => v.number), second);
        out.push({ text: cur.map((v) => `${v.number} ${v.text}`).join(" "), label: cur.length > 1 ? `v. ${cur[0].number}–${cur[cur.length - 1].number}` : `v. ${cur[0].number}`, ...(p ? { pair: p } : {}) });
        cur = [];
    };
    for (const v of verses) {
        if (how === "auto") { const len = cur.reduce((a, x) => a + x.text.length, 0); if (cur.length && len + v.text.length > limit) flush(); cur.push(v); }
        else { cur.push(v); if (cur.length >= Number(how)) flush(); }
    }
    flush();
    return out;
}

// The verse numbers a parsed reference names ([] for a whole chapter).
export const referenceNums = (ref) => (ref?.verseStart
    ? Array.from({ length: (ref.verseEnd ?? ref.verseStart) - ref.verseStart + 1 }, (_, i) => ref.verseStart + i)
    : []);

// The same edition twice is one edition.
const otherPair = (pair, version) => (pair?.version && pair.version !== version ? pair : null);

// Several verses: the passage (a BiblePassage's fields), or null.
// pair: a second edition, as in groupVerses.
export function passageOf({ verses, nums, how = "auto", version, book, chapter, pair = null }) {
    const chosen = verses.filter((v) => nums.includes(v.number));
    const slides = groupVerses(chosen, how, otherPair(pair, version));
    if (!slides.length || !version) return null;
    return { reference: `${book} ${chapter}:${rangeLabel(nums)} · ${version}`, book, chapter, verses: rangeLabel(nums), text: chosen.map((v) => `${v.number} ${v.text}`).join("\n"), slides, version };
}

// One verse: its whole chapter, one verse per slide, starting at it; null
// when the verse is not in the chapter. pair: a second edition, as in
// groupVerses; its sigla rides in the ref as version2 (chapterOnAir).
export function chapterOf({ verses, n, version, book, chapter, pair = null }) {
    if (!version || !verses.length) return null;
    const index = verses.findIndex((v) => v.number === n);
    if (index < 0) return null;
    const second = secondOf(otherPair(pair, version));
    const version2 = second?.version || null;
    const slides = verses.map((v) => {
        const p = pairOf([v.number], second);
        return { text: `${v.number} ${v.text}`, label: `v. ${v.number}`, ref: `${book} ${chapter}:${v.number} · ${version}`, ...(p ? { pair: p } : {}) };
    });
    return {
        id: `chapter:${book}:${chapter}:${version}${version2 ? `+${version2}` : ""}`,
        title: `${book} ${chapter}:${n}`,
        index,
        passage: { reference: `${book} ${chapter} · ${version}`, text: verses.map((v) => `${v.number} ${v.text}`).join("\n"), slides, version },
        ref: { book, chapter, version, ...(version2 ? { version2 } : {}), wholeChapter: true },
    };
}

// Is this chapter (same version) the one on air, as a whole chapter? Then a
// verse of it only moves the slide on air. version2: the second edition
// asked for now (none: null); the chapter on air with another one, or
// without, is sent again rather than moved.
export const chapterOnAir = (onAir, { book, chapter, version, version2 = null }) => Boolean(onAir && onAir.ref?.wholeChapter && onAir.ref.book === book && Number(onAir.ref.chapter) === Number(chapter) && onAir.ref.version === version
    && (onAir.ref.version2 || null) === (version2 && version2 !== version ? version2 : null));
