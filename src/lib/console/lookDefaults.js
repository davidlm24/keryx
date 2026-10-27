// The church's default look for projected text, stamped into each item's
// style when it goes on air (useConsole stamp, the Prévia too), so every
// output (windows and network screens) gets it through the live state; an
// item's own choice wins. Today that is only the Bíblia's display
// preferences: Configurações › Bíblia e músicas and the bar under the
// Bíblia's No ar screen (Rodada P). Apart from look.js, which the outputs
// load: only the console stamps (scripts/bundle-budget.cjs).

// The defaults a User row asks for; null where it asks for nothing.
//   bible: how a passage shows its reference and verse numbers
//   (Configurações › Bíblia e músicas; null = the screens' default) and
//   where a second edition goes (null = side by side, the screens'
//   default). Its size is its theme's (owner 2026-10-22: the bar's
//   A− / A / A+ went).
export function lookDefaults(user) {
    const ref_line = user?.bible_show_reference === false ? "none" : user?.bible_show_version === false ? "plain" : null;
    const verse_numbers = user?.bible_verse_numbers === "hide" ? "hide" : null;
    const pair = user?.bible_pair === "stack" ? "stack" : null;
    return { bible: { ref_line, verse_numbers, pair } };
}

// content.show's arguments with the defaults filled in where the item has none.
export function withLookDefaults(op, args, defaults) {
    if (op !== "content.show" || !args || !defaults) return args;
    const style = { ...(args.style || {}) };
    if (args.kind === "bible" && defaults.bible) {
        if (!style.ref_line && defaults.bible.ref_line) style.ref_line = defaults.bible.ref_line;
        if (!style.verse_numbers && defaults.bible.verse_numbers) style.verse_numbers = defaults.bible.verse_numbers;
        // The pair only where a slide carries a second edition.
        if (!style.pair && defaults.bible.pair && (args.slides || []).some((s) => s?.pair)) style.pair = defaults.bible.pair;
    }
    return { ...args, style };
}
