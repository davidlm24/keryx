// The church's default look for projected text, stamped into each item's
// style when it goes on air, so every output (windows and network screens)
// gets it through the live state; an item's own choice wins. Today that is
// only the Bíblia's display preferences (Configurações › Bíblia e músicas).
// The transition between slides is the theme's alone (audit 2026-10-14,
// achado nº 4): Editor de temas › Transição; a theme without one leaves the
// factory transition (fade, NATURAL_MS). The old Aparência default
// (User.transition_type/transition_ms) was moved into the default theme
// once (src/lib/prefs/migrate.js) and is no longer read.

export const TRANSITIONS = [["fade", "Esmaecer"], ["slide", "Deslizar"], ["cut", "Corte"]];
export const TRANSITION_MS = [120, 600];
// What each transition lasts when nobody chose a length (screen.css).
export const NATURAL_MS = { fade: 400, slide: 350, cut: 0 };

// The defaults a User row asks for; null where it asks for nothing.
//   bible: how a passage shows its reference and verse numbers
//   (Configurações › Bíblia e músicas; null = the screens' default).
export function lookDefaults(user) {
    const ref_line = user?.bible_show_reference === false ? "none" : user?.bible_show_version === false ? "plain" : null;
    const verse_numbers = user?.bible_verse_numbers === "hide" ? "hide" : null;
    return { bible: { ref_line, verse_numbers } };
}

// content.show's arguments with the defaults filled in where the item has none.
export function withLookDefaults(op, args, defaults) {
    if (op !== "content.show" || !args || !defaults) return args;
    const style = { ...(args.style || {}) };
    if (args.kind === "bible" && defaults.bible) {
        if (!style.ref_line && defaults.bible.ref_line) style.ref_line = defaults.bible.ref_line;
        if (!style.verse_numbers && defaults.bible.verse_numbers) style.verse_numbers = defaults.bible.verse_numbers;
    }
    return { ...args, style };
}
