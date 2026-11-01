// The rules of a category's name (backgroundPrefs.js has the rest of the
// background library's categories). Apart so the church's preferences
// (src/lib/prefs/schema.js, in every window's first load) normalize
// User.background_categories and media_categories without loading the
// library's code: the outputs' JS has a budget (scripts/bundle-budget.cjs).

export const OWN_IMAGES = "Suas imagens";
export const OWN_VIDEOS = "Seus vídeos";
const CATEGORY_MAX = 40;
export const fold = (s) => s.toLocaleLowerCase("pt-BR");
export const cleanName = (v) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, CATEGORY_MAX).trim() : "");
export const ownName = (n) => n === OWN_IMAGES || n === OWN_VIDEOS;

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
