import test from "node:test";
import assert from "node:assert/strict";
import { BOOK_SIZES, OT_COUNT, NT_COUNT, colsFor, booksHeight, booksFit, numGrid, numSize, pagesOf, pageOf, pageCells } from "./bibleFit.js";

test("colsFor: what an auto-fill grid makes of the width", () => {
    // 300 px, 4 px each side, 88 px cells 3 apart: 3 columns.
    assert.equal(colsFor(300, 88, 3), 3);
    assert.equal(colsFor(300, 42, 2), 6);
    assert.equal(colsFor(10, 88, 3), 1);
});

test("booksFit: the operator's size when it fits, else down the ladder, the names last", () => {
    const medium = BOOK_SIZES.find((s) => s.id === "medium");
    const tall = booksHeight(medium, 300);
    assert.equal(booksFit({ width: 300, height: tall, pref: "medium" }).id, "medium");
    // Never above the operator's choice, however much room.
    assert.equal(booksFit({ width: 300, height: 5000, pref: "small" }).id, "small");
    // 1366 × 768, a 300 px column: the names do not fit, the abbreviations do.
    const fit = booksFit({ width: 300, height: 360, pref: "medium" });
    assert.equal(fit.names, false);
    assert.ok(fit.height <= 360);
    assert.equal(fit.cols, colsFor(300, fit.w, fit.gap));
    // Nothing fits: the smallest.
    assert.equal(booksFit({ width: 300, height: 40, pref: "large" }).id, "micro");
    // 960 × 600: a 238 px column with 256 px for the books — micro fits.
    const small = booksFit({ width: 238, height: 256, pref: "medium" });
    assert.equal(small.id, "micro");
    assert.ok(small.height <= 256);
    // Not measured yet: the operator's.
    assert.equal(booksFit({ width: 300, height: 0, pref: "large" }).id, "large");
});

test("booksHeight: both testaments, every book", () => {
    const tiny = BOOK_SIZES.at(-1);
    const cols = colsFor(300, tiny.w, tiny.gap);
    const rows = Math.ceil(OT_COUNT / cols) + Math.ceil(NT_COUNT / cols);
    assert.ok(booksHeight(tiny, 300) >= rows * tiny.h);
});

test("numGrid: the natural height of every cell, and a page of what fits", () => {
    const size = numSize("medium");
    // Salmos in 300 px: 7 columns, 22 rows.
    const all = numGrid({ total: 150, width: 300, height: 0, size });
    assert.equal(all.cols, 7);
    assert.equal(all.natural, 8 + 22 * 26 + 21 * 3);
    // Locked to its natural height and measured back: one page.
    const whole = numGrid({ total: 150, width: 300, height: all.natural, size });
    assert.ok(whole.perPage >= 150);
    // Rute: 4 chapters, one row.
    assert.equal(numGrid({ total: 4, width: 300, height: 0, size }).natural, 8 + 26);
    // 100 px of room: 3 rows of 7.
    assert.equal(numGrid({ total: 150, width: 300, height: 100, size }).perPage, 21);
    assert.equal(numSize("medium", "verses").w, 32);
});

test("pagesOf: › at the end of every page but the last, ‹ from the second (B3 = A)", () => {
    assert.deepEqual(pagesOf(0, 21), []);
    assert.deepEqual(pagesOf(20, 21), [[1, 20]]);
    assert.deepEqual(pagesOf(21, 21), [[1, 21]]);
    // Salmos, 21 cells a page: 1–20 ›, ‹ 21–39 ›, …, ‹ 135–150.
    const ps = pagesOf(150, 21);
    assert.deepEqual(ps[0], [1, 20]);
    assert.deepEqual(ps[1], [21, 39]);
    assert.deepEqual(ps.at(-1), [135, 150]);
    assert.equal(ps.length, 8);
    // Every number once, in order.
    const all = ps.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i));
    assert.deepEqual(all, Array.from({ length: 150 }, (_, i) => i + 1));
    // Every page fits its cells.
    ps.forEach((_, i) => assert.ok(pageCells(ps, i).length <= 21));
    // Never fewer than 3 cells a page.
    assert.deepEqual(pagesOf(5, 1), [[1, 2], [3, 3], [4, 5]]);
});

test("pageOf and pageCells", () => {
    const ps = pagesOf(150, 21);
    assert.equal(pageOf(ps, 119), 6);
    assert.equal(pageOf(ps, 999), 0);
    const first = pageCells(ps, 0);
    assert.deepEqual(first.at(-1), { next: [21, 39] });
    assert.equal(first[0].n, 1);
    const mid = pageCells(ps, 1);
    assert.deepEqual(mid[0], { prev: [1, 20] });
    assert.deepEqual(mid.at(-1), { next: [40, 58] });
    const last = pageCells(ps, ps.length - 1);
    assert.deepEqual(last[0], { prev: [116, 134] });
    assert.deepEqual(last.at(-1), { n: 150 });
});
