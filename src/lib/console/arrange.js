// Where the console's columns go (Ver › Editar layout, 2026-10-12): the
// order of the columns in each environment and of the cards stacked in a
// column. The operator reorders them; this module turns that order, the
// width tier and the hidden modules into the columns on screen and decides
// which side of each column its splitter sits on. Pure: Console.jsx and
// BibleEnv.jsx only render what it returns.

// The columns of each environment. One per environment is flexible (it takes
// the space left); every other one has a width saved in the layout.
export const COLUMNS = {
    culto: {
        lib: { name: "Biblioteca", widthKey: "libW" },
        slides: { name: "Slides", widthKey: "slidesW" },
        live: { name: "Programa", flex: true },
        // Wide tier only: Camadas over the Setlist, the window's full height.
        side: { name: "Camadas e Setlist", widthKey: "rightW" },
        // Narrow tier only: Biblioteca over Slides in one column, as wide as
        // the Slides (its minimum keeps a slide's lines whole).
        source: { name: "Biblioteca e Slides", widthKey: "slidesW" },
    },
    biblia: {
        picker: { name: "Livro · Capítulo · Versículo", widthKey: "bibleSelW" },
        reading: { name: "Texto", flex: true },
        air: { name: "No ar", widthKey: "bibleAirW" },
    },
};

export const DEFAULT_ORDER = {
    culto: ["lib", "slides", "live", "side"],
    biblia: ["picker", "reading", "air"],
};

// Cards stacked in one column, top to bottom.
export const DEFAULT_STACKS = {
    side: ["camadas", "roteiro"],
    source: ["lib", "slides"],
    picker: ["books", "chapters", "verses"],
};

export const CARD_NAMES = { camadas: "Camadas", roteiro: "Setlist", lib: "Biblioteca", slides: "Slides", books: "Livros", chapters: "Capítulos", verses: "Versículos" };

// A saved list made safe: known ids in the saved order, no repeats, and any
// id it lacks (a new module, an old save) appended in the default order.
export function normalizeOrder(saved, defaults) {
    const known = new Set(defaults);
    const out = [];
    for (const id of Array.isArray(saved) ? saved : []) {
        if (known.has(id) && !out.includes(id)) out.push(id);
    }
    for (const id of defaults) if (!out.includes(id)) out.push(id);
    return out;
}

// The order and the stacks of a saved layout, every list normalized.
export function normalizeArrangement(saved = {}) {
    const order = {};
    for (const env of Object.keys(DEFAULT_ORDER)) order[env] = normalizeOrder(saved?.order?.[env], DEFAULT_ORDER[env]);
    const stacks = {};
    for (const key of Object.keys(DEFAULT_STACKS)) stacks[key] = normalizeOrder(saved?.stacks?.[key], DEFAULT_STACKS[key]);
    return { order, stacks };
}

// `id` moved to `index` (clamped). The same list when nothing moves.
export function moveTo(list, id, index) {
    const from = list.indexOf(id);
    if (from < 0) return list;
    const to = Math.max(0, Math.min(list.length - 1, index));
    if (to === from) return list;
    const out = list.filter((x) => x !== id);
    out.splice(to, 0, id);
    return out;
}

export const moveBy = (list, id, delta) => moveTo(list, id, list.indexOf(id) + delta);

const col = (env, id, cards, members) => ({ id, name: COLUMNS[env][id].name, flex: Boolean(COLUMNS[env][id].flex), widthKey: COLUMNS[env][id].widthKey || null, cards, members });

// The console's columns, left to right, for a width tier.
//   - wide: Biblioteca, Slides, the centre (the Programa over the Prévia
//     and the tabs panel — Console.jsx) and Camadas over the Setlist, full
//     height (owner's decision 2026-10-13, the console audit);
//   - medium: no side column (Camadas is a drawer, the Setlist sits beside
//     the Prévia in place of the tabs panel);
//   - narrow: Biblioteca over Slides in one column (where the first of the
//     two is in the order), and the Programa.
// A column whose cards are all hidden is not there. `members`: the order ids
// the column stands for (the narrow source column moves both).
export function cultoColumns({ tier = "wide", hidden = {}, order = DEFAULT_ORDER.culto, stacks = DEFAULT_STACKS } = {}) {
    const ord = normalizeOrder(order, DEFAULT_ORDER.culto);
    const out = [];
    let sourceDone = false;
    for (const id of ord) {
        if (id === "live") { out.push(col("culto", "live", ["live"], ["live"])); continue; }
        if (tier === "narrow" && (id === "lib" || id === "slides")) {
            if (sourceDone) continue;
            sourceDone = true;
            const cards = normalizeOrder(stacks?.source, DEFAULT_STACKS.source).filter((c) => !hidden[c]);
            if (cards.length) out.push(col("culto", "source", cards, ["lib", "slides"].filter((m) => ord.includes(m))));
            continue;
        }
        if (id === "lib" || id === "slides") {
            if (!hidden[id]) out.push(col("culto", id, [id], [id]));
            continue;
        }
        if (id === "side") {
            if (tier !== "wide") continue;
            // The Setlist is never hidden: only Camadas leaves the stack.
            const cards = normalizeOrder(stacks?.side, DEFAULT_STACKS.side).filter((c) => c === "roteiro" || !hidden[c]);
            out.push(col("culto", "side", cards, ["side"]));
        }
    }
    return out;
}

// The Bíblia's columns, left to right.
export function bibleColumns({ order = DEFAULT_ORDER.biblia, stacks = DEFAULT_STACKS } = {}) {
    return normalizeOrder(order, DEFAULT_ORDER.biblia).map((id) => col("biblia", id, id === "picker" ? normalizeOrder(stacks?.picker, DEFAULT_STACKS.picker) : [id], [id]));
}

// A column moved to position `to` among the columns on screen, written back
// into the full order. Ids not on screen (a hidden module, the side
// column in the medium tier) keep their places in the order.
export function moveColumn(order, columns, colId, to) {
    const ids = columns.map((c) => c.id);
    const moved = moveTo(ids, colId, to);
    if (moved === ids) return order;
    const shown = new Set(columns.flatMap((c) => c.members));
    const seq = moved.flatMap((id) => columns.find((c) => c.id === id).members);
    let i = 0;
    return order.map((id) => (shown.has(id) ? seq[i++] : id));
}

// Columns and what goes between them. Each column with a saved width gets
// one splitter, on the side facing the flexible column: a column left of it
// has its splitter after it (dragging right grows it, sign 1); a column right
// of it has its splitter before it (sign -1). Between two fixed columns on the
// same side the splitter belongs to the one farther from the flexible column.
// -> [{ type: "col", col } | { type: "split", key, sign }]
export function withSplits(columns) {
    let f = columns.findIndex((c) => c.flex);
    if (f < 0) f = columns.length - 1;
    const out = [];
    columns.forEach((c, i) => {
        out.push({ type: "col", col: c });
        if (i === columns.length - 1) return;
        const owner = i < f ? c : columns[i + 1];
        out.push({ type: "split", key: owner.widthKey, sign: i < f ? 1 : -1, col: owner.id });
    });
    return out;
}


// The height splitter of a stack whose card `fixed` keeps a saved height
// (Camadas over the Setlist: camadasH): there when both are on screen and
// that card is open; below it when it is on top (dragging down grows it,
// sign 1), else above it (sign -1).
export function stackSplit(cards, fixed, collapsed = {}) {
    if (cards.length < 2 || !cards.includes(fixed) || collapsed[fixed]) return null;
    return { sign: cards.indexOf(fixed) === 0 ? 1 : -1 };
}
