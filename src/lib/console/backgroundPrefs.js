// The church's settings for each background (Configurações › Temas e fundos ›
// Fundos, BackgroundPref rows): a name, a category, a default dim and blur,
// hidden from the galleries, a favourite. The galleries read the list built
// here; the dim and blur are a starting point, stamped into an item's style
// when it goes on air (or into the Fundo layer when picked in Camadas) unless
// the item already has its own.

export const CATEGORY_SUGGESTIONS = ["Adoração", "Natureza", "Abstrato", "Céu/Luz", "Cruz e igreja", "Sazonal", "Comunicação", "Outros"];
export const OWN_IMAGES = "Suas imagens";
export const OWN_VIDEOS = "Seus vídeos";
export const DIM_PCT = [0, 90];
export const BLUR_PX = [0, 20];

// The key of a background in BackgroundPref.source: bundled:<id> for the ones
// that ship with KERYX (whatever host serves them), else the URL itself.
export function sourceOf(url) {
    const s = String(url || "");
    const bundled = /\/bundled\/backgrounds\/([0-9a-f-]+)\.webp(?:$|[?#])/.exec(s) || /^https:\/\/images\.unsplash\.com\/photo-([0-9a-f-]+)/.exec(s);
    return bundled ? `bundled:${bundled[1]}` : s;
}

const clamp = (v, [lo, hi]) => {
    const n = Number(v);
    return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : Math.min(hi, Math.max(lo, n));
};

// Where a background comes from, which decides how it leaves the library:
//   keryx  ships with KERYX (resources/): Excluir takes it out of the library
//          (BackgroundPref.hidden) and Excluídos › Restaurar brings it back —
//          the file is the app's, never deleted
//   own    sent to the library or brought from the Mídia (a Media row of
//          category "background"): Excluir deletes that row
//   media  a Mídia picture set up as a background before the libraries were
//          separate (it only has a BackgroundPref): Tirar dos fundos drops
//          that row, the Mídia keeps the file
export const ORIGINS = ["keryx", "own", "media"];

// Every background with its settings: bundled ({ id, url, category, name? })
// then the church's images and videos ({ id, url, title, origin? }), each
// { source, url, name, category, dim (0-0.9 or null), blur (px or null),
// hidden (excluído), favorite, pref, origin, mediaId }.
export function backgroundList({ bundled = [], images = [], videos = [], prefs = [] }) {
    const bySource = new Map(prefs.filter((p) => p?.source).map((p) => [p.source, p]));
    const entry = (source, url, name, category, kind, origin, mediaId = null) => {
        const pref = bySource.get(source) || null;
        const dim = clamp(pref?.dim_pct, DIM_PCT);
        return {
            source, url, pref, kind, origin, mediaId,
            name: pref?.name?.trim() || name,
            category: pref?.category?.trim() || category,
            dim: dim === null ? null : dim / 100,
            blur: clamp(pref?.blur_px, BLUR_PX),
            hidden: Boolean(pref?.hidden),
            favorite: Boolean(pref?.favorite),
        };
    };
    const all = [
        ...bundled.map((b, i) => entry(`bundled:${b.id}`, b.url, b.name || `Fundo ${i + 1}`, b.category || "Outros", "image", "keryx")),
        ...images.map((m) => entry(sourceOf(m.url), m.url, m.title || "Imagem", OWN_IMAGES, "image", m.origin || "own", m.id ?? null)),
        // The church's own clips (local files): the Fundo layer plays them
        // looping and muted; never the idle screen or an item's own
        // background, which only take pictures.
        ...videos.map((m) => entry(sourceOf(m.url), m.url, m.title || "Vídeo", OWN_VIDEOS, "video", m.origin || "own", m.id ?? null)),
    ];
    // One entry per source: a Mídia image that is a bundled file (added from
    // the factory list, or by its Unsplash URL) or listed twice is the same
    // background, and its settings are keyed by that source. The first wins,
    // so the factory one keeps its category.
    const seen = new Set();
    return all.filter((b) => !seen.has(b.source) && seen.add(b.source));
}

// What the library offers: not excluded (hidden), favourites first
// (otherwise in order). `only` keeps one category; `except` drops one.
export function visibleBackgrounds(list, { only, except } = {}) {
    const shown = list.filter((b) => !b.hidden && (!only || b.category === only) && (!except || b.category !== except));
    return [...shown.filter((b) => b.favorite), ...shown.filter((b) => !b.favorite)];
}

// What a background's right click offers to take it out (owner 2026-10-16:
// every background can leave the library, the factory ones included):
//   "exclude"  a factory photo leaves the library (hidden), restorable
//   "delete"   the church's own file: its Media row is deleted
//   "untrack"  a Mídia picture: Tirar dos fundos (its BackgroundPref goes)
//   "restore"  an excluded one (the Excluídos chip) comes back
// An excluded own file or Mídia picture (Oculto, before) can also go for good.
export function backgroundActions(b) {
    if (!b) return [];
    const out = b.origin === "own" ? "delete" : b.origin === "media" ? "untrack" : "exclude";
    if (b.hidden) return out === "exclude" ? ["restore"] : ["restore", out];
    return [out];
}

// The categories in use, in a stable order: the church's list first (the
// suggestions while it never edited one), then names in use that are not in
// it, alphabetically, then its own images and videos.
export function categoriesOf(list, stored = null) {
    const used = new Set(list.map((b) => b.category));
    const lead = categoryList(stored);
    const extra = [...used].filter((c) => !lead.includes(c) && c !== OWN_IMAGES && c !== OWN_VIDEOS).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return [...lead.filter((c) => used.has(c)), ...extra, ...(used.has(OWN_IMAGES) ? [OWN_IMAGES] : []), ...(used.has(OWN_VIDEOS) ? [OWN_VIDEOS] : [])];
}

// The church's categories (User.background_categories, Configurações ›
// Temas e fundos › Categorias de fundos, owner 2026-10-16): an ordered list
// it creates, renames, reorders and deletes, even while empty. Null = never
// edited: the suggestions. A category lives on each background's
// BackgroundPref.category; the list only names and orders them, so a name in
// use outside it still shows (after it). "Outros" is where a deleted
// category's backgrounds go: it is never renamed or deleted.
export const FALLBACK_CATEGORY = "Outros";
const CATEGORY_MAX = 40;
const fold = (s) => s.toLocaleLowerCase("pt-BR");
const cleanName = (v) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, CATEGORY_MAX).trim() : "");
const ownName = (n) => n === OWN_IMAGES || n === OWN_VIDEOS;

export function normalizeCategories(v) {
    if (!Array.isArray(v)) return null;
    const seen = new Set();
    const out = [];
    for (const raw of v) {
        const name = cleanName(raw);
        if (!name || ownName(name) || seen.has(fold(name))) continue;
        seen.add(fold(name));
        out.push(name);
    }
    return out;
}

export const categoryList = (stored) => normalizeCategories(stored) ?? [...CATEGORY_SUGGESTIONS];

// What Configurações lists: the church's list, then the names in use outside it.
export function managedCategories(stored, entries) {
    const lead = categoryList(stored);
    const extra = [...new Set(entries.map((b) => b.category))].filter((c) => c && !lead.includes(c) && !ownName(c)).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return [...lead, ...extra];
}

const taken = (list, name, except = null) => ownName(name) || list.some((c) => c !== except && fold(c) === fold(name));

// Each change answers { list, name } or { error } (the message to show).
export function addCategory(list, name) {
    const n = cleanName(name);
    if (!n) return { error: "Dê um nome à categoria." };
    if (taken(list, n)) return { error: `Já existe a categoria "${n}".` };
    return { list: [...list, n], name: n };
}

// A name in use outside the list joins it with its new name.
export function renameCategory(list, from, to) {
    const n = cleanName(to);
    if (from === FALLBACK_CATEGORY) return { error: `"${FALLBACK_CATEGORY}" não muda de nome: é onde ficam os fundos de uma categoria excluída.` };
    if (!n) return { error: "Dê um nome à categoria." };
    if (taken(list, n, from)) return { error: `Já existe a categoria "${n}".` };
    return { list: list.includes(from) ? list.map((c) => (c === from ? n : c)) : [...list, n], name: n };
}

export function removeCategory(list, name) {
    if (name === FALLBACK_CATEGORY) return { error: `"${FALLBACK_CATEGORY}" não se exclui: é onde ficam os fundos de uma categoria excluída.` };
    return { list: list.filter((c) => c !== name), name };
}

// One step up (by -1) or down (by 1); the same list at an end.
export function moveCategory(list, name, by) {
    const i = list.indexOf(name);
    const j = i + by;
    if (i < 0 || j < 0 || j >= list.length) return list;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
}

// The backgrounds a rename or a delete moves: every one in that category,
// the factory photos with no settings yet included (their category comes
// from the code, so they get a BackgroundPref saying the new one).
export const inCategory = (entries, name) => entries.filter((b) => b.category === name);

// A background's dim and blur from its pref, as live-state values; null
// where the church set nothing.
export function backgroundDefaults(prefs, url) {
    if (!url) return { dim: null, blur: null };
    const source = sourceOf(url);
    const pref = (prefs || []).find((p) => p?.source === source);
    const dim = clamp(pref?.dim_pct, DIM_PCT);
    return { dim: dim === null ? null : dim / 100, blur: clamp(pref?.blur_px, BLUR_PX) };
}

// A background's whole look from its settings (the library is the one place
// to set it, 2026-10-13): dim and blur as backgroundDefaults, plus how it
// fills the screen (fit) and which part shows (position); null where unset.
export function backgroundLook(prefs, url) {
    const { dim, blur } = backgroundDefaults(prefs, url);
    const pref = url ? (prefs || []).find((p) => p?.source === sourceOf(url)) : null;
    const fit = pref?.fit === "contain" || pref?.fit === "cover" ? pref.fit : null;
    const position = ["top", "center", "bottom"].includes(pref?.position) ? pref.position : null;
    return { dim, blur, fit, position };
}

// The arguments of an op that puts a background on the screens, with that
// background's dim and blur filled in where the item has none of its own:
//   content.show   style.background_image  -> style.background_dim/_blur
//                  fundo (the item's background for the Fundo layer, a
//                  picture or a clip) -> fundo.dim/blur
//   background.set a picture or a clip     -> dim/blur
//   background.default the papel de parede Esc puts back -> its dim/blur,
//                  so Esc brings it back as it was (0.2.18: without them
//                  the renderer's 45 % fallback darkened it after Esc)
//   communication.show  an aviso's (or each of a sequence's) background_image
//                  -> its background_dim/_blur
//   idle.set       the wallpaper (url)     -> dim/blur (idle.set keeps a given look)
export function withBackgroundDefaults(op, args, prefs) {
    if (!args) return args;
    const fill = (obj, pic) => {
        if (!obj?.[pic]) return obj;
        const { dim, blur } = backgroundDefaults(prefs, obj[pic]);
        const next = { ...obj };
        if (next.background_dim == null && dim !== null) next.background_dim = dim;
        if (next.background_blur == null && blur !== null) next.background_blur = blur;
        return next.background_dim === obj.background_dim && next.background_blur === obj.background_blur ? obj : next;
    };
    // A picture or a clip for the Fundo layer (background.set, or an item's
    // args.fundo): its dim and blur where it has none.
    const fillBg = (bg) => {
        if (!bg || (bg.kind !== "image" && bg.kind !== "video")) return bg;
        const look = backgroundLook(prefs, bg.value);
        const next = { ...bg };
        for (const k of ["dim", "blur", "fit", "position"]) if (next[k] == null && look[k] !== null) next[k] = look[k];
        return ["dim", "blur", "fit", "position"].every((k) => next[k] === bg[k]) ? bg : next;
    };
    if (op === "content.show") {
        const style = fill(args.style, "background_image");
        const fundo = fillBg(args.fundo);
        return style === args.style && fundo === args.fundo ? args : { ...args, style, ...(fundo ? { fundo } : {}) };
    }
    if (op === "background.set") return fillBg(args);
    if (op === "background.default" && args.background) {
        const background = fillBg(args.background);
        return background === args.background ? args : { ...args, background };
    }
    if (op === "communication.show") {
        const item = fill(args.item, "background_image");
        const playlist = Array.isArray(args.playlist) ? args.playlist.map((p) => fill(p, "background_image")) : args.playlist;
        return item === args.item && (!playlist || playlist.every((p, i) => p === args.playlist[i])) ? args : { ...args, ...(item ? { item } : {}), ...(playlist ? { playlist } : {}) };
    }
    if (op === "idle.set" && args.url && args.dim === undefined && args.blur === undefined) {
        const { dim, blur } = backgroundDefaults(prefs, args.url);
        return { ...args, dim, blur };
    }
    return args;
}
