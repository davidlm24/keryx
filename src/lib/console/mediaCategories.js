// The Mídia's categories are the church's (owner 2026-10-22, "Bibliotecas"
// B4 = A): an ordered list it creates, renames, reorders and deletes in the
// Mídia's "Categorias…", as the backgrounds' (backgroundPrefs.js, whose list
// rules this reuses). The list is User.media_categories (null = never edited:
// today's five); each file's is Media.category, which holds the name. Rows
// from before keep a key (sermon, worship…): read as its name, never
// rewritten until the file is recategorised. "background" and "font" are not
// categories of the Mídia (those rows are the backgrounds' and the fonts'),
// so no name may read as one of them or as an old key.
import { FALLBACK_CATEGORY, normalizeCategories, addCategory, renameCategory, removeCategory, moveCategory } from "./backgroundPrefs.js";

export { FALLBACK_CATEGORY, moveCategory };

export const MEDIA_CATEGORY_DEFAULTS = ["Pregação", "Louvor", "Avisos", "Testemunho", FALLBACK_CATEGORY];
export const OLD_MEDIA_KEYS = { sermon: "Pregação", worship: "Louvor", announcement: "Avisos", testimony: "Testemunho", other: FALLBACK_CATEGORY };
const RESERVED = new Set(["background", "font", ...Object.keys(OLD_MEDIA_KEYS)]);
const fold = (s) => String(s).trim().toLocaleLowerCase("pt-BR");

// A file's category as a name: an old key reads as its name, nothing as Outros.
export function mediaCategoryOf(m) {
    const c = typeof m?.category === "string" ? m.category.trim() : "";
    if (!c) return FALLBACK_CATEGORY;
    return OLD_MEDIA_KEYS[c] || c;
}

export const mediaCategoryList = (stored) => normalizeCategories(stored)?.filter((n) => !RESERVED.has(fold(n))) ?? [...MEDIA_CATEGORY_DEFAULTS];

// What the chips and the editor list: the church's list, the names in use
// outside it (alphabetically), and Outros always (it receives the files of a
// deleted category and the ones with none).
export function managedMediaCategories(stored, media = []) {
    const lead = mediaCategoryList(stored);
    const extra = [...new Set(media.map(mediaCategoryOf))].filter((c) => !lead.includes(c)).sort((a, b) => a.localeCompare(b, "pt-BR"));
    const all = [...lead, ...extra];
    return all.includes(FALLBACK_CATEGORY) ? all : [...all, FALLBACK_CATEGORY];
}

// The chips: only the categories that have a file, in the list's order.
export function mediaCategoriesInUse(stored, media = []) {
    const used = new Set(media.map(mediaCategoryOf));
    return managedMediaCategories(stored, media).filter((c) => used.has(c));
}

export const mediaInCategory = (media, name) => media.filter((m) => mediaCategoryOf(m) === name);

const reserved = (name) => (RESERVED.has(fold(name)) ? { error: `"${String(name).trim()}" não pode ser o nome de uma categoria da Mídia.` } : null);

// Each change answers { list, name } or { error }, as backgroundPrefs.js.
export const addMediaCategory = (list, name) => reserved(name) || addCategory(list, name);
export const renameMediaCategory = (list, from, to) => reserved(to) || renameCategory(list, from, to);
export const removeMediaCategory = (list, name) => removeCategory(list, name);
