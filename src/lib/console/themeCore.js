// The two theme helpers the outputs need (outputPrefs.js, prefs/migrate.js),
// apart from themes.js: a module the outputs import is loaded whole, so
// keeping themes.js (the console's theme logic, the editor's summaries, a
// song's size steps) out of their path keeps the outputs within their
// budget (scripts/bundle-budget.cjs). themes.js re-exports both. Pure.
import { bgSpec, bgArgs } from "./backgroundSpec.js";

// The theme's background (ProjectionTheme.background, or the picture or
// generated background saved before it; backgroundSpec.js), as
// background.set's arguments; null when it has none.
export const themeBackgroundArgs = (t) => bgArgs(bgSpec(t), t?.name || "Tema");

// The default theme (Configurações › Temas e fundos, "Tornar padrão"):
// the one marked, the most recently changed if several are; none when none
// is (then the factory look applies — never the first theme by surprise).
export function defaultTheme(themes) {
    const marked = (themes || []).filter((t) => t?.is_default);
    if (marked.length < 2) return marked[0] || null;
    return [...marked].sort((a, b) => String(b.updated_date || "").localeCompare(String(a.updated_date || "")))[0];
}
