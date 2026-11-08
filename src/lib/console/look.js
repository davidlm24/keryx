// The transitions between slides: the theme's alone (audit 2026-10-14,
// achado nº 4): Editor de temas › Transição; a theme without one leaves the
// factory transition (fade, NATURAL_MS). The old Aparência default
// (User.transition_type/transition_ms) was moved into the default theme
// once (src/lib/prefs/migrate.js) and is no longer read. What the church
// stamps into an item (the Bíblia's display, its size on the screens) is
// lookDefaults.js, the console's alone: this file every output loads
// through themes.js (scripts/bundle-budget.cjs).

export const TRANSITIONS = [["fade", "Esmaecer"], ["slide", "Deslizar"], ["cut", "Corte"]];
export const TRANSITION_MS = [120, 600];
// What each transition lasts when nobody chose a length (screen.css).
export const NATURAL_MS = { fade: 400, slide: 350, cut: 0 };
