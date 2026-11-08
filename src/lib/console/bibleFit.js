// The Bíblia's Livros, Capítulos and Versículos as tall as their cells
// (owner 2026-10-29, after Rodada R; mockup R6, B1–B4 = A): the 66 books
// always whole, Antigo and Novo Testamento apart, the cell stepping down
// in size until they fit (the names go last, B4 = A); Capítulos and
// Versículos in pages when their cells do not fit, the last cell "›" to
// the next page and, from the second, the first "‹" back (B3 = A: the last
// page ends on the last number). Pure: BibleEnv.jsx measures the boxes,
// dock.js `bibleLocks` takes the heights reported from here.

export const OT_COUNT = 39;
export const NT_COUNT = 27;
// A testament's heading (B1 = A: "Antigo Testamento · 39"), and the grids'
// padding: 4 px at the sides and under each grid.
export const TESTAMENT_HEAD = 20;
const PAD_X = 4;
const PAD_Y = 4;

// The book cells, largest first: `w` the narrowest a cell gets, `h` its
// height, `gap` between cells, `names` whether the whole name shows under
// the abbreviation. The operator's P/M/G (⋯, layout.bibleGrid) is the
// largest allowed; compact, tiny and micro are the abbreviation alone.
export const BOOK_SIZES = [
    { id: "large", w: 108, h: 48, gap: 4, names: true },
    { id: "medium", w: 88, h: 40, gap: 3, names: true },
    { id: "small", w: 64, h: 32, gap: 2, names: true },
    { id: "compact", w: 42, h: 28, gap: 2, names: false },
    { id: "tiny", w: 34, h: 22, gap: 2, names: false },
    { id: "micro", w: 28, h: 18, gap: 1, names: false },
];

// Columns an auto-fill grid makes of `width` (its padding included).
export function colsFor(width, cellW, gap, padX = PAD_X) {
    return Math.max(1, Math.floor((width - 2 * padX + gap) / (cellW + gap)));
}
const gridH = (count, cols, h, gap) => {
    const rows = Math.ceil(count / cols);
    return rows * h + (rows - 1) * gap;
};

// The books' height at one size in `width`: both headings, both grids.
export function booksHeight(size, width) {
    const cols = colsFor(width, size.w, size.gap);
    return 2 * TESTAMENT_HEAD + gridH(OT_COUNT, cols, size.h, size.gap) + gridH(NT_COUNT, cols, size.h, size.gap) + 2 * PAD_Y;
}

// The largest size, from the operator's down, whose books fit `height` in
// `width` (none fits: the smallest). -> { ...size, cols, height }
export function booksFit({ width, height, pref = "medium" }) {
    const from = Math.max(0, BOOK_SIZES.findIndex((s) => s.id === pref));
    const at = (s) => ({ ...s, cols: colsFor(width, s.w, s.gap), height: booksHeight(s, width) });
    for (const s of BOOK_SIZES.slice(from)) {
        const fit = at(s);
        if (!(height > 0) || fit.height <= height + 0.5) return fit;
    }
    return at(BOOK_SIZES[BOOK_SIZES.length - 1]);
}

// Capítulos and Versículos: the cell of each P/M/G (console.css). One step
// up since the owner's 2026-10-29 note: pequenas are the médias of before,
// médias the grandes, grandes a step past them.
export const NUM_SIZES = {
    small: { w: 34, h: 26, gap: 3 },
    medium: { w: 44, h: 34, gap: 4 },
    large: { w: 54, h: 42, gap: 5 },
};
export const numSize = (grid, kind = "chapters") => {
    const s = NUM_SIZES[grid] || NUM_SIZES.medium;
    return kind === "verses" && s === NUM_SIZES.small ? { ...s, w: 32 } : s;
};
const PAD = 4;

// The cells' grid in a box: columns, the rows that fit, the height all of
// `total` would take (what the panel reports to be locked to) and how many
// cells one page holds.
export function numGrid({ total, width, height, size }) {
    const cols = colsFor(width, size.w, size.gap, PAD);
    const rows = Math.ceil(total / cols);
    const natural = total > 0 ? 2 * PAD + rows * size.h + (rows - 1) * size.gap : 0;
    // A pixel of slack: the panel is locked to `natural` and measured back.
    const fit = height > 0 ? Math.max(1, Math.floor((height - 2 * PAD + size.gap + 1) / (size.h + size.gap))) : rows;
    return { cols, rows: Math.min(rows, fit), natural, perPage: cols * Math.max(1, fit) };
}

// The pages of 1…total with `per` cells each: [[from, to], …]. One page
// when everything fits; else the first ends in "›", the middle ones start
// with "‹" and end in "›", the last starts with "‹" and ends on `total`.
export function pagesOf(total, per) {
    if (!(total > 0)) return [];
    const n = Math.max(3, per | 0);
    if (total <= n) return [[1, total]];
    const out = [[1, n - 1]];
    let a = n;
    while (total - a + 1 > n - 1) {
        out.push([a, a + n - 3]);
        a += n - 2;
    }
    out.push([a, total]);
    return out;
}

// The page that holds `n` (0 when none does).
export const pageOf = (pages, n) => Math.max(0, pages.findIndex(([a, b]) => n >= a && n <= b));

// One page's cells: { prev: [from, to] } first from the second page,
// { n } for each number, { next: [from, to] } last but on the last page.
export function pageCells(pages, i) {
    const p = pages[i];
    if (!p) return [];
    const out = [];
    if (i > 0) out.push({ prev: pages[i - 1] });
    for (let n = p[0]; n <= p[1]; n++) out.push({ n });
    if (i < pages.length - 1) out.push({ next: pages[i + 1] });
    return out;
}
