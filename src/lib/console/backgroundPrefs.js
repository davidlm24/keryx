// The church's settings for each background (Configurações › Aparência ›
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

// Every background with its settings: bundled ({ id, url, category }) then
// the church's images ({ id, url, title }), each { source, url, name,
// category, dim (0-0.9 or null), blur (px or null), hidden, favorite, pref }.
export function backgroundList({ bundled = [], images = [], videos = [], prefs = [] }) {
    const bySource = new Map(prefs.filter((p) => p?.source).map((p) => [p.source, p]));
    const entry = (source, url, name, category, kind) => {
        const pref = bySource.get(source) || null;
        const dim = clamp(pref?.dim_pct, DIM_PCT);
        return {
            source, url, pref, kind,
            name: pref?.name?.trim() || name,
            category: pref?.category?.trim() || category,
            dim: dim === null ? null : dim / 100,
            blur: clamp(pref?.blur_px, BLUR_PX),
            hidden: Boolean(pref?.hidden),
            favorite: Boolean(pref?.favorite),
        };
    };
    const all = [
        ...bundled.map((b, i) => entry(`bundled:${b.id}`, b.url, `Fundo ${i + 1}`, b.category || "Outros", "image")),
        ...images.map((m) => entry(sourceOf(m.url), m.url, m.title || "Imagem", OWN_IMAGES, "image")),
        // The church's own clips (Mídia, local files): the Fundo layer plays
        // them looping and muted; never the idle screen or an item's own
        // background, which only take pictures.
        ...videos.map((m) => entry(sourceOf(m.url), m.url, m.title || "Vídeo", OWN_VIDEOS, "video")),
    ];
    // One entry per source: a Mídia image that is a bundled file (added from
    // the factory list, or by its Unsplash URL) or listed twice is the same
    // background, and its settings are keyed by that source. The first wins,
    // so the factory one keeps its category.
    const seen = new Set();
    return all.filter((b) => !seen.has(b.source) && seen.add(b.source));
}

// What a gallery offers: not hidden, favourites first (otherwise in order).
// `only` keeps one category; `except` drops one.
export function visibleBackgrounds(list, { only, except } = {}) {
    const shown = list.filter((b) => !b.hidden && (!only || b.category === only) && (!except || b.category !== except));
    return [...shown.filter((b) => b.favorite), ...shown.filter((b) => !b.favorite)];
}

// The categories in use, in a stable order: the suggestions first, then the
// church's own, alphabetically.
export function categoriesOf(list) {
    const used = new Set(list.map((b) => b.category));
    const extra = [...used].filter((c) => !CATEGORY_SUGGESTIONS.includes(c) && c !== OWN_IMAGES && c !== OWN_VIDEOS).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return [...CATEGORY_SUGGESTIONS.filter((c) => used.has(c)), ...extra, ...(used.has(OWN_IMAGES) ? [OWN_IMAGES] : []), ...(used.has(OWN_VIDEOS) ? [OWN_VIDEOS] : [])];
}

// A background's dim and blur from its pref, as live-state values; null
// where the church set nothing.
export function backgroundDefaults(prefs, url) {
    if (!url) return { dim: null, blur: null };
    const source = sourceOf(url);
    const pref = (prefs || []).find((p) => p?.source === source);
    const dim = clamp(pref?.dim_pct, DIM_PCT);
    return { dim: dim === null ? null : dim / 100, blur: clamp(pref?.blur_px, BLUR_PX) };
}

// The arguments of an op that puts a background on the screens, with that
// background's dim and blur filled in where the item has none of its own:
//   content.show   style.background_image  -> style.background_dim/_blur
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
    if (op === "content.show") {
        const style = fill(args.style, "background_image");
        return style === args.style ? args : { ...args, style };
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
