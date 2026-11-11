import test from "node:test";
import assert from "node:assert/strict";
import { snap, fmtTime, parseTime, marksOf, markedCount, indexAt, nextUnmarked, setMark, nudge, recordMark, distribute, fitMarks, sameMarks, followModeOf, slideSeconds, timedLength, followStarts, withFollowStarts, lineCount, slideFirstLines, startsFromLines, linesFromStarts, nextToMark, nextSlideStart, firstUnmarkedSlide, chunkGroups, distributeSlides, onFirsts, shiftMarks } from "./lyricSync.js";
import { sungLines, slidesFromLyrics } from "../songImport.js";
import { applyOp, emptyState, followIndex } from "../../../shared/live-state.mjs";

test("times: shown as m:ss.cc, typed in any usual way", () => {
    assert.equal(fmtTime(61.8), "1:01.80");
    assert.equal(fmtTime(0), "0:00.00");
    assert.equal(fmtTime(null), "—");
    assert.equal(parseTime("1:01.8"), 61.8);
    assert.equal(parseTime("1:01,8"), 61.8);
    assert.equal(parseTime("61.8"), 61.8);
    assert.equal(parseTime("2:05"), 125);
    assert.equal(parseTime(""), null);
    assert.equal(parseTime("1:75"), undefined);
    assert.equal(parseTime("abc"), undefined);
    assert.equal(snap(12.34), 12.3);
    assert.equal(snap(-3), 0);
});

test("reading marks: which slide plays, which comes next", () => {
    const starts = marksOf([{ text: "a" }, { start: 10 }, { start: 20 }, { text: "d" }]);
    assert.deepEqual(starts, [null, 10, 20, null]);
    assert.equal(markedCount(starts), 2);
    assert.equal(indexAt(starts, 5), -1);
    assert.equal(indexAt(starts, 15), 1);
    assert.equal(indexAt(starts, 20), 2);
    assert.equal(nextUnmarked(starts), 0);
    assert.equal(nextUnmarked(starts, 1), 3);
    assert.equal(nextUnmarked([1, 2], 0), -1);
});

test("one mark at a time, always in order", () => {
    const s = [5, 10, 20];
    assert.deepEqual(setMark(s, 1, 12.34), [5, 12.3, 20]);
    assert.deepEqual(setMark(s, 1, 30), [5, 19.9, 20], "never past the next one");
    assert.deepEqual(setMark(s, 1, 1), [5, 5.1, 20], "never before the previous one");
    assert.deepEqual(setMark(s, 1, null), [5, null, 20]);
    assert.deepEqual(nudge(s, 2, 0.1), [5, 10, 20.1]);
    assert.deepEqual(nudge(s, 0, -10), [0, 10, 20]);
    assert.deepEqual(nudge([null, 1], 0, 1), [null, 1], "no mark: nothing to nudge");
});

test("recording keeps what came before and clears what the new mark passes", () => {
    assert.deepEqual(recordMark([5, 10, 20, 30], 2, 25), [5, 10, 25, 30]);
    assert.deepEqual(recordMark([5, 10, 20, 30], 1, 31), [5, 31, null, null]);
    assert.deepEqual(recordMark([5, 10, null, 30], 0, 12), [12, null, null, 30]);
});

test("distribute over the song, fit to new slides, compare", () => {
    assert.deepEqual(distribute(4, 200), [0, 50, 100, 150]);
    assert.deepEqual(distribute(3, 100, 10), [10, 40, 70]);
    assert.deepEqual(distribute(2, 0), [null, null]);
    assert.deepEqual(fitMarks([1, 2, 3], 2), [1, 2]);
    assert.deepEqual(fitMarks([1], 3), [1, null, null]);
    assert.equal(sameMarks([1, null], [1, undefined]), true);
    assert.equal(sameMarks([1, 2], [1, 3]), false);
});

test("Avançar sozinha (Rodada P7): the song's mode and time", () => {
    assert.equal(followModeOf({ slides: [{ text: "a" }] }), "off", "no marks: it does not advance");
    assert.equal(followModeOf({ slides: [{ text: "a", start: 3 }] }), "marks", "as before P7");
    assert.equal(followModeOf({ follow_mode: "off", slides: [{ start: 3 }] }), "off");
    assert.equal(followModeOf({ follow_mode: "time" }), "time");
    assert.equal(followModeOf({ follow_mode: "radio" }, [{ start: 1 }]), "marks");
    assert.equal(slideSeconds({}), 8);
    assert.equal(slideSeconds({ slide_seconds: 12 }), 12);
    assert.equal(slideSeconds({ slide_seconds: 999 }), 120);
    assert.equal(slideSeconds({ slide_seconds: "x" }), 8);
    assert.equal(timedLength([{}, { duration: 12 }, {}], 8), 28);
});

test("followStarts: Por tempo one after the other, each its time", () => {
    assert.deepEqual(followStarts([{ start: 50 }, {}, { duration: 12 }, {}], { each: 8 }), [0, 8, 16, 28], "the marks do not count");
    assert.deepEqual(followStarts([]), []);
});

test("followStarts: an unmarked slide takes its share of the gap it sits in", () => {
    // Between two marks: the gap shared (before P7 the follow skipped them).
    assert.deepEqual(followStarts([{ start: 0 }, {}, {}, { start: 30 }]), [0, 10, 20, 30]);
    // Before the first mark: from 0.
    assert.deepEqual(followStarts([{}, {}, { start: 12 }, { start: 20 }]), [0, 6, 12, 20]);
    // After the last mark: up to the song's length, else at the marks' pace.
    assert.deepEqual(followStarts([{ start: 0 }, { start: 10 }, {}, {}], { length: 40 }), [0, 10, 20, 30]);
    assert.deepEqual(followStarts([{ start: 0 }, { start: 10 }, {}, {}]), [0, 10, 20, 30]);
    assert.deepEqual(followStarts([{ start: 5 }, {}]), [5, null], "one mark, no length: nothing to go by");
    assert.deepEqual(followStarts([{}, {}]), [null, null], "no marks: none");
});

test("on air: the follow walks the unmarked slides and starts from one without going back (Rodada P7 bugs)", () => {
    const S = 1000;
    const slides = withFollowStarts([{ text: "a", start: 0 }, { text: "b" }, { text: "c" }, { text: "d", start: 30 }], { source: "clock" });
    assert.deepEqual(slides.map((s) => s.start), [0, 10, 20, 30]);
    let s = applyOp(emptyState(0), "content.show", { title: "x", slides, follow: { source: "clock" } }, 0);
    s = applyOp(s, "content.follow", { action: "start" }, 0);
    assert.equal(followIndex(s, 15 * S), 1, "slide b is not skipped");
    assert.equal(followIndex(s, 25 * S), 2);
    // Iniciar on slide c (unmarked before P7): it starts there.
    let t = applyOp(emptyState(0), "content.show", { title: "x", slides, index: 2, follow: { source: "clock" } }, 0);
    t = applyOp(t, "content.follow", { action: "start" }, 0);
    assert.equal(followIndex(t, 1 * S), 2, "not back to slide 1");
    // Por tempo: 8 s a slide, the song's own exception on the second.
    const band = withFollowStarts([{ text: "a" }, { text: "b", duration: 4 }, { text: "c" }], { source: "time", each: 8 });
    assert.deepEqual(band.map((x) => x.start), [0, 8, 12]);
    assert.equal(withFollowStarts(band, null), band);
});

test("line by line (2026-11-10): the slides take their first marked line, whatever the split", () => {
    const lyrics = "[Verso]\num\n[G]dois\n[G] [D]\ntrês\nquatro\ncinco\n\n[Refrão]\nseis\nsete";
    const lines = sungLines(lyrics);
    assert.deepEqual(lines.map((l) => l.text), ["um", "dois", "três", "quatro", "cinco", "seis", "sete"], "no label, no chords-only row, chords stripped");
    assert.equal(lines[5].label, "Refrão");
    const times = [10, 14, 18, 22, 26, 40, 44];
    const four = slidesFromLyrics(lyrics, { lines: 4 });
    assert.equal(lineCount(four), 7);
    assert.deepEqual(slideFirstLines(four), [0, 4, 5]);
    assert.deepEqual(startsFromLines(four, times), [10, 26, 40]);
    // Another split: the same marks, new slide starts — nothing marked again.
    assert.deepEqual(startsFromLines(slidesFromLyrics(lyrics, { lines: 2 }), times), [10, 18, 26, 40]);
    assert.deepEqual(startsFromLines(slidesFromLyrics(lyrics), times), [10, 40]);
    // A slide whose first line has no time takes its first marked one.
    assert.deepEqual(startsFromLines(four, [null, 14, null, null, null, null, 44]), [14, null, 44]);
    // Lyrics with no blank line: one slide by Estrofe, every line its own mark.
    const flat = slidesFromLyrics("a\nb\nc\nd");
    assert.equal(flat.length, 1);
    assert.equal(sungLines("a\nb\nc\nd").length, 4);
});

test("old songs marked by slide, and the gold line after a mark", () => {
    const slides = slidesFromLyrics("um\ndois\n\ntrês\nquatro", { lines: 0 });
    assert.deepEqual(linesFromStarts(slides, [5, 20]), [5, null, 20, null]);
    assert.deepEqual(linesFromStarts(slides, [null, 20]), [null, null, 20, null]);
    // Espaço goes to the next line with no mark, never past a gap.
    assert.equal(nextToMark([1, 2, null, 4, null], 1), 2);
    assert.equal(nextToMark([1, 2, null, 4, null], 3), 4);
    assert.equal(nextToMark([1, 2, 3], 2), -1);
});

test("one press per slide (2026-11-11, option 1): Espaço jumps to the next slide's first line", () => {
    const firsts = [0, 4, 6];
    assert.equal(nextSlideStart(firsts, 0), 4, "slide 1 marked: on to slide 2, its inner lines skipped");
    assert.equal(nextSlideStart(firsts, 2), 4, "a line inside slide 1 marked: still slide 2");
    assert.equal(nextSlideStart(firsts, 6), -1, "the last slide: the end");
    // Where recording starts: the first slide with nothing marked in it.
    assert.equal(firstUnmarkedSlide(firsts, [10, null, null, null, null, null, null, null], 8), 4);
    assert.equal(firstUnmarkedSlide(firsts, [10, null, null, null, 20, null, 30, null], 8), 0, "all marked: from the top");
    assert.equal(firstUnmarkedSlide(firsts, [null, 12, null, null, 20, null, 30], 8), 0, "a slide with an inner line marked counts as marked");
    assert.equal(firstUnmarkedSlide(firsts, [null, 12, null, null, null, null, 30], 8), 4);
});

test("one-slide lyrics split on the page, and Distribuir by slide", () => {
    assert.deepEqual(chunkGroups(8, 4, "Verso"), [{ first: 0, label: "Verso" }, { first: 4, label: "" }]);
    assert.deepEqual(chunkGroups(5, 2).map((g) => g.first), [0, 2, 4]);
    assert.deepEqual(chunkGroups(5, 0), [{ first: 0, label: "" }]);
    // The same groups as 2/4 linhas give a one-stanza lyric (what Aplicar sends to the editor).
    const lyrics = "a\nb\nc\nd\ne";
    assert.deepEqual(slideFirstLines(slidesFromLyrics(lyrics, { lines: 2 })), chunkGroups(5, 2).map((g) => g.first));
    assert.deepEqual(distributeSlides([0, 4, 6], 8, 30), [0, null, null, null, 10, null, 20, null]);
});

test("one time per slide (2026-11-11): marks fold onto each slide's first line", () => {
    // Slides start at lines 0, 4 and 6 (8 lines).
    const firsts = [0, 4, 6];
    assert.deepEqual(onFirsts([10, 12, 14, 16, null, 22, null, null], firsts, 8), [10, null, null, null, 22, null, null, null], "an inner mark (line 6) moves to its slide's first line");
    assert.deepEqual(onFirsts([null, null, null, null, null, null, null, null], firsts, 8), Array(8).fill(null), "a slide with no mark stays empty");
    assert.deepEqual(onFirsts([5, null, null, null, 20, null, 30, 31], firsts, 8), [5, null, null, null, 20, null, 30, null]);
    assert.deepEqual(startsFromLines(slidesFromLyrics("a\nb\nc\nd\ne\nf\ng\nh", { lines: 4 }), onFirsts([10, 12, 14, 16, 18, 20, 22, 24], [0, 4], 8)), [10, 18], "the slides' starts do not change");
});

test("several marks move together, never out of order (2026-11-11)", () => {
    const starts = [10, 20, 30, 40, 50];
    assert.deepEqual(shiftMarks(starts, [2, 3, 4], 2.4), [10, 20, 32.4, 42.4, 52.4], "from slide 3 to the end, +2,4 s");
    assert.deepEqual(shiftMarks(starts, [1, 2], 15), [10, 29.9, 39.9, 40, 50], "stops a tenth before the next mark not moved");
    assert.deepEqual(shiftMarks(starts, [1, 2], -15), [10, 10.1, 20.1, 40, 50], "back: stops a tenth after the one before");
    assert.deepEqual(shiftMarks(starts, [0, 1], -30), [0, 10, 30, 40, 50], "never below 0");
    assert.deepEqual(shiftMarks([null, 20, 30], [0, 1], 5), [null, 25, 30 + 0], "an unmarked line is not moved");
    assert.deepEqual(shiftMarks(starts, [], 5), starts);
    assert.deepEqual(shiftMarks([10, 10.1, 30], [1], -1), [10, 10.1, 30], "no room: unchanged");
});
