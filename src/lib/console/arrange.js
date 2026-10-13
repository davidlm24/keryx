// The console's columns as the layout saved them before Editar disposição
// became a tree (dock.js, 2026-10-13): the order of the columns in each
// environment and of the cards stacked in a column. Nothing renders from
// them any more; dock.js reads them once (fromArrangement,
// fromBibleArrangement) so an old save keeps its look, and "Restaurar
// posições" puts them back to these defaults.

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
