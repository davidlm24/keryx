// "Editar este slide…" (owner 2026-11-12, mockup "Editar o slide e só o som
// com marcas", E1–E5): the lines of one slide of a song, edited from the
// console's Slides column or No ar without the song editor. The text is the
// lyrics' own lines of that slide (chords inline, its [Parte] heading
// outside); saving puts it back in the lyrics, rebuilds the slides the way
// the song editor does, and keeps the marks of every other slide on their
// lines (spliceMarks). Pure; the console writes the patch (Song.update) and
// runs songSaved. Console only.
import { slidesFromLyrics, linesLimit, withTimings } from "../songImport.js";
import { hasInlineChords } from "../chords.js";
import { slideSpan } from "./lyricFit.js";
import { startsFromLines, linesFromStarts, slideFirstLines, lineCount, fitMarks, spliceMarks } from "./lyricSync.js";

const unCR = (s) => String(s || "").replace(/\r\n?/g, "\n");
const isMark = (v) => Number.isFinite(v);

// The slides as the song keeps them (the song editor's save writes the same
// shape): each with its chorded twin when the lyrics carry chords.
export function slidesToSave(slides) {
    return (slides || []).map(({ text, chorded, duration, is_chorus, start, label }) => ({
        text,
        ...(chorded && chorded !== text && hasInlineChords(chorded) ? { chorded } : {}),
        ...(label ? { label } : {}),
        ...(is_chorus ? { is_chorus } : {}),
        ...(isMark(start) ? { start } : {}),
        ...(isMark(duration) ? { duration } : {}),
    }));
}

// The slides with their times, as the song editor computes them: Por tempo
// keeps each slide's own duration (`secs`, by index), otherwise the starts
// from the marked lines and the durations between them.
export function timedSlides(base, starts, { followMode, secs = [], total = null } = {}) {
    if (followMode === "time") {
        return base.map(({ start: _s, duration: _d, ...rest }, i) => ({ ...rest, ...(isMark(starts[i]) ? { start: starts[i] } : {}), ...(secs[i] > 0 ? { duration: secs[i] } : {}) }));
    }
    return withTimings(base.map(({ start: _s, ...rest }) => rest), starts, total);
}

const sameText = (a, b) => a.length === b.length && a.every((s, i) => String(s.text || "") === String(b[i]?.text || ""));

// What the box opens with for slide `index`: { text, label } or { refused }
// — "nolyrics" (a part with no lyrics, a [Ministração]) or "mismatch" (the
// saved slides were made apart from the lyrics: only the editor can say
// where this slide is).
export function slideToEdit(song, index) {
    const lyrics = unCR(song?.lyrics);
    const lines = linesLimit(song?.lines_per_slide);
    const fresh = slidesFromLyrics(lyrics, { lines, chorded: true });
    const saved = (song?.slides || []).length ? song.slides : fresh;
    const slide = saved[index];
    if (!slide) return { refused: "mismatch" };
    if (!String(slide.text || "").trim()) return { refused: "nolyrics" };
    if (!sameText(saved, fresh)) return { refused: "mismatch" };
    const span = slideSpan(lyrics, saved, index);
    if (!span) return { refused: "mismatch" };
    return { text: lyrics.slice(span[0], span[1]), label: slide.label || "", span };
}

// The Song patch for slide `index` now reading `text`, or { refused }
// ("empty" too). Only lyrics, slides and line_starts change.
export function editSlide(song, index, text) {
    const open = slideToEdit(song, index);
    if (open.refused) return open;
    const next = unCR(text).replace(/^\s*\n/, "").replace(/\s+$/, "");
    if (!next.trim()) return { refused: "empty" };
    const lyrics = unCR(song.lyrics);
    const newLyrics = lyrics.slice(0, open.span[0]) + next + lyrics.slice(open.span[1]);
    const lines = linesLimit(song.lines_per_slide);
    const saved = (song.slides || []).length ? song.slides : slidesFromLyrics(lyrics, { lines, chorded: true });
    const base = slidesFromLyrics(newLyrics, { lines, chorded: true });
    // The marks: by line (line_starts), else the old per-slide ones.
    const total = lineCount(saved);
    const had = Array.isArray(song.line_starts) && song.line_starts.length
        ? fitMarks(song.line_starts, total)
        : linesFromStarts(saved, saved.map((s) => (isMark(s.start) ? s.start : null)));
    const oldRows = String(saved[index].text || "").split("\n").length;
    const newRows = oldRows + lineCount(base) - total;
    const lineStarts = spliceMarks(had, slideFirstLines(saved)[index], oldRows, Math.max(0, newRows));
    const marked = lineStarts.some(isMark);
    const followMode = song.follow_mode === "time" ? "time" : "";
    // Por tempo: each slide's own duration stays with its slide while the
    // count is the same.
    const secs = followMode === "time" && base.length === saved.length ? saved.map((s) => (s.duration > 0 ? s.duration : null)) : [];
    const slides = timedSlides(base, startsFromLines(base, lineStarts), { followMode, secs, total: song.duration || null });
    return { patch: { lyrics: newLyrics, slides: slidesToSave(slides), line_starts: marked ? fitMarks(lineStarts, lineCount(base)) : [] } };
}

// The words for a refusal, for the box.
export const REFUSED_WORDS = {
    mismatch: "Não consigo achar este trecho na letra. Edite no editor completo.",
    nolyrics: "Esta parte não tem letra.",
    empty: "Um slide não fica vazio. Para tirar o trecho, use o editor.",
};
