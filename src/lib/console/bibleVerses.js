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

// Verses -> slides: one, two, three per slide, or by length (auto).
export function groupVerses(verses, how) {
    const out = []; let cur = [];
    const flush = () => { if (cur.length) { out.push({ text: cur.map((v) => `${v.number} ${v.text}`).join(" "), label: cur.length > 1 ? `v. ${cur[0].number}–${cur[cur.length - 1].number}` : `v. ${cur[0].number}` }); cur = []; } };
    for (const v of verses) {
        if (how === "auto") { const len = cur.reduce((a, x) => a + x.text.length, 0); if (cur.length && len + v.text.length > 220) flush(); cur.push(v); }
        else { cur.push(v); if (cur.length >= Number(how)) flush(); }
    }
    flush();
    return out;
}

// The verse numbers a parsed reference names ([] for a whole chapter).
export const referenceNums = (ref) => (ref?.verseStart
    ? Array.from({ length: (ref.verseEnd ?? ref.verseStart) - ref.verseStart + 1 }, (_, i) => ref.verseStart + i)
    : []);

// Several verses: the passage (a BiblePassage's fields), or null.
export function passageOf({ verses, nums, how = "auto", version, book, chapter }) {
    const chosen = verses.filter((v) => nums.includes(v.number));
    const slides = groupVerses(chosen, how);
    if (!slides.length || !version) return null;
    return { reference: `${book} ${chapter}:${rangeLabel(nums)} · ${version}`, book, chapter, verses: rangeLabel(nums), text: chosen.map((v) => `${v.number} ${v.text}`).join("\n"), slides, version };
}

// One verse: its whole chapter, one verse per slide, starting at it; null
// when the verse is not in the chapter.
export function chapterOf({ verses, n, version, book, chapter }) {
    if (!version || !verses.length) return null;
    const index = verses.findIndex((v) => v.number === n);
    if (index < 0) return null;
    return {
        id: `chapter:${book}:${chapter}:${version}`,
        title: `${book} ${chapter}:${n}`,
        index,
        passage: { reference: `${book} ${chapter} · ${version}`, text: verses.map((v) => `${v.number} ${v.text}`).join("\n"), slides: verses.map((v) => ({ text: `${v.number} ${v.text}`, label: `v. ${v.number}`, ref: `${book} ${chapter}:${v.number} · ${version}` })), version },
        ref: { book, chapter, version, wholeChapter: true },
    };
}

// Is this chapter (same version) the one on air, as a whole chapter? Then a
// verse of it only moves the slide on air.
export const chapterOnAir = (onAir, { book, chapter, version }) => Boolean(onAir && onAir.ref?.wholeChapter && onAir.ref.book === book && Number(onAir.ref.chapter) === Number(chapter) && onAir.ref.version === version);
