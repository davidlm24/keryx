import test from "node:test";
import assert from "node:assert/strict";
import { snap, fmtTime, parseTime, marksOf, markedCount, indexAt, nextUnmarked, setMark, nudge, recordMark, distribute, fitMarks, sameMarks } from "./lyricSync.js";

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
