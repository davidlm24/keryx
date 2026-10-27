// Bible verses as what goes on screen: the rules the Bíblia environment and
// the command palette share. One verse goes out as its whole chapter,
// starting there (so ←/→ keep walking the chapter); a range picked on
// purpose goes out as that passage. Both are grouped 1/2/3 per slide or by
// length ("auto"), the church's Versículos por slide (owner 2026-10-22: the
// chapter too). Pure, no I/O; tested in bibleVerses.test.mjs. The stage
// around it is stageFromVerses in stage.js.
import { verseNumbers } from "../verseMarks.js";

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

// Versículos por slide: "1", "2", "3" or "auto"; anything else reads as "1".
export const HOW = ["1", "2", "3", "auto"];
export const howOf = (how) => (HOW.includes(String(how)) ? String(how) : "1");

// Verses -> runs of verses, one run a slide: one, two, three, or by length (auto).
function runs(verses, how, limit) {
    const out = []; let cur = [];
    for (const v of verses) {
        if (how === "auto") { const len = cur.reduce((a, x) => a + x.text.length, 0); if (cur.length && len + v.text.length > limit) { out.push(cur); cur = []; } cur.push(v); }
        else { cur.push(v); if (cur.length >= Number(how)) { out.push(cur); cur = []; } }
    }
    if (cur.length) out.push(cur);
    return out;
}
const slideOf = (run, second) => {
    const p = pairOf(run.map((v) => v.number), second);
    return { text: run.map((v) => `${v.number} ${v.text}`).join(" "), label: run.length > 1 ? `v. ${run[0].number}–${run[run.length - 1].number}` : `v. ${run[0].number}`, ...(p ? { pair: p } : {}) };
};

// Verses -> slides: one, two, three per slide, or by length (auto).
// pair: a second edition ({ verses, version }; see secondOf).
export function groupVerses(verses, how, pair = null) {
    const second = secondOf(pair);
    return runs(verses, howOf(how), second ? AUTO_CHARS / 2 : AUTO_CHARS).map((r) => slideOf(r, second));
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
    how = howOf(how);
    const chosen = verses.filter((v) => nums.includes(v.number));
    const slides = groupVerses(chosen, how, otherPair(pair, version));
    if (!slides.length || !version) return null;
    return { reference: `${book} ${chapter}:${rangeLabel(nums)} · ${version}`, book, chapter, verses: rangeLabel(nums), text: chosen.map((v) => `${v.number} ${v.text}`).join("\n"), slides, version };
}

// One verse: its whole chapter, grouped as `how` says, the verse at the
// start of its slide — the verses before it grouped on their own — and that
// slide the one shown (index); null when the verse is not in the chapter.
// pair: a second edition, as in groupVerses; its sigla rides in the ref as
// version2, and the grouping as how (chapterOnAir).
export function chapterOf({ verses, n, how = "1", version, book, chapter, pair = null }) {
    if (!version || !verses.length) return null;
    const at = verses.findIndex((v) => v.number === n);
    if (at < 0) return null;
    how = howOf(how);
    const second = secondOf(otherPair(pair, version));
    const version2 = second?.version || null;
    const limit = second ? AUTO_CHARS / 2 : AUTO_CHARS;
    const before = runs(verses.slice(0, at), how, limit);
    const slides = [...before, ...runs(verses.slice(at), how, limit)].map((r) => ({ ...slideOf(r, second), ref: `${book} ${chapter}:${rangeLabel(r.map((v) => v.number))} · ${version}` }));
    return {
        id: `chapter:${book}:${chapter}:${version}${version2 ? `+${version2}` : ""}`,
        title: `${book} ${chapter}:${n}`,
        index: before.length,
        passage: { reference: `${book} ${chapter} · ${version}`, text: verses.map((v) => `${v.number} ${v.text}`).join("\n"), slides, version },
        ref: { book, chapter, version, ...(version2 ? { version2 } : {}), how, wholeChapter: true },
    };
}

// Is this chapter (same version) the one on air, as a whole chapter? Then a
// verse of it only moves the slide on air. version2: the second edition
// asked for now (none: null); how: the grouping (a chapter sent before
// 2026-10-22 had one verse a slide); look: the church's display now
// (lookDefaults(…).bible; none = not compared). The chapter on air with
// another second edition, grouping, reference line or place for the second
// edition is sent again rather than moved, so a send never keeps what the
// bar changed while the screens were locked.
const refMode = (v) => v || "full";
export const chapterOnAir = (onAir, { book, chapter, version, version2 = null, how = "1", look = null }) => Boolean(onAir && onAir.ref?.wholeChapter && onAir.ref.book === book && Number(onAir.ref.chapter) === Number(chapter) && onAir.ref.version === version
    && (onAir.ref.version2 || null) === (version2 && version2 !== version ? version2 : null)
    && howOf(onAir.ref.how) === howOf(how)
    && (!look || (refMode(onAir.style?.ref_line) === refMode(look.ref_line) && (!onAir.ref.version2 || (onAir.style?.pair || "side") === (look.pair || "side")))));

// -- The bar under the Bíblia's No ar screen, on what is on air (owner
// 2026-10-22, as in Holyrics: its changes reach the screens at once).

// The verse the slide on air starts with: its first verse mark, else null.
export const airVerse = (content) => verseNumbers(content?.slides?.[content?.index]?.text)[0] ?? null;

// What the Bíblia can rebuild of the passage on air: a whole chapter, or a
// range the Bíblia sent (its ref keeps the verses, nums) — { book, chapter,
// nums (null = the chapter), verse }; null for anything else (a passage of
// the Setlist keeps its slides).
export function airPassage(content) {
    const r = content?.kind === "bible" ? content.ref : null;
    if (!r?.book || !r.chapter || !r.version) return null;
    const nums = r.wholeChapter ? null : Array.isArray(r.nums) && r.nums.length ? r.nums.map(Number) : undefined;
    if (nums === undefined) return null;
    return { book: r.book, chapter: Number(r.chapter), nums, verse: airVerse(content) ?? nums?.[0] ?? 1 };
}

// The slide holding verse n (by its marks), else the first one past it,
// else the last.
export function slideWithVerse(slides, n) {
    const marks = slides.map((s) => verseNumbers(s?.text));
    const at = marks.findIndex((m) => m.includes(n));
    if (at >= 0) return at;
    const past = marks.findIndex((m) => m.length && m[0] > n);
    return past >= 0 ? past : Math.max(0, slides.length - 1);
}

// The verse of a chapter to start from: n, else the first one past it (an
// edition that numbers the chapter otherwise), else the last.
export const verseNear = (verses, n) => (verses.find((v) => v.number >= n) || verses[verses.length - 1])?.number ?? null;

// The style on air with the reference line and the second edition's place
// the bar asks for now (look: lookDefaults(…).bible); the rest stays.
export function airStyle(style, look, hasPair) {
    const out = { ...(style || {}) };
    delete out.ref_line;
    delete out.pair;
    if (look?.ref_line) out.ref_line = look.ref_line;
    if (hasPair && look?.pair) out.pair = look.pair;
    return out;
}
