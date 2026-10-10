// The church's settings for each background (Configurações › Aparência ›
// Fundos, BackgroundPref rows): a name, a category, a default dim and blur,
// hidden from the galleries, a favourite. The galleries read the list built
// here; the dim and blur are a starting point, stamped into an item's style
// when it goes on air (or into the Fundo layer when picked in Camadas) unless
// the item already has its own.

export const CATEGORY_SUGGESTIONS = ["Adoração", "Natureza", "Abstrato", "Céu/Luz", "Cruz e igreja", "Sazonal", "Comunicação", "Outros"];
export const OWN_IMAGES = "Suas imagens";
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
export function backgroundList({ bundled = [], images = [], prefs = [] }) {
    const bySource = new Map(prefs.filter((p) => p?.source).map((p) => [p.source, p]));
    const entry = (source, url, name, category) => {
        const pref = bySource.get(source) || null;
        const dim = clamp(pref?.dim_pct, DIM_PCT);
        return {
            source, url, pref,
            name: pref?.name?.trim() || name,
            category: pref?.category?.trim() || category,
            dim: dim === null ? null : dim / 100,
            blur: clamp(pref?.blur_px, BLUR_PX),
            hidden: Boolean(pref?.hidden),
            favorite: Boolean(pref?.favorite),
        };
    };
    return [
        ...bundled.map((b, i) => entry(`bundled:${b.id}`, b.url, `Fundo ${i + 1}`, b.category || "Outros")),
        ...images.map((m) => entry(sourceOf(m.url), m.url, m.title || "Imagem", OWN_IMAGES)),
    ];
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
    const extra = [...used].filter((c) => !CATEGORY_SUGGESTIONS.includes(c) && c !== OWN_IMAGES).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return [...CATEGORY_SUGGESTIONS.filter((c) => used.has(c)), ...extra, ...(used.has(OWN_IMAGES) ? [OWN_IMAGES] : [])];
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

// content.show's arguments with the background's dim and blur filled in where
// the item has none of its own.
export function withBackgroundDefaults(op, args, prefs) {
    if (op !== "content.show" || !args?.style?.background_image) return args;
    const { dim, blur } = backgroundDefaults(prefs, args.style.background_image);
    const style = { ...args.style };
    if (style.background_dim == null && dim !== null) style.background_dim = dim;
    if (style.background_blur == null && blur !== null) style.background_blur = blur;
    return { ...args, style };
}
