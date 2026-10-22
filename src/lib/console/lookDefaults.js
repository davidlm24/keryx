// The church's default look for projected text, stamped into each item's
// style when it goes on air (useConsole stamp, the Prévia too), so every
// output (windows and network screens) gets it through the live state; an
// item's own choice wins. Today that is only the Bíblia's display
// preferences: Configurações › Bíblia e músicas and the bar under the
// Bíblia's No ar screen (Rodada P). Apart from look.js, which the outputs
// load: only the console stamps (scripts/bundle-budget.cjs).
import { sizeCqw, sizeValue } from "../textSize.js";

// The Bíblia's size on the screens (User.bible_text_size, its A− / A / A+
// under the No ar screen, Rodada P): steps from its theme's size, each a
// factor of it. 0 is the theme's own.
export const BIBLE_SIZE_STEPS = { "-2": 0.75, "-1": 0.87, 0: 1, 1: 1.15, 2: 1.3 };
export const BIBLE_SIZE_MIN = -2;
export const BIBLE_SIZE_MAX = 2;
export const bibleSizeStep = (v) => (Number.isInteger(Number(v)) && Math.abs(Number(v)) <= BIBLE_SIZE_MAX ? Number(v) : 0);

// The defaults a User row asks for; null where it asks for nothing.
//   bible: how a passage shows its reference and verse numbers
//   (Configurações › Bíblia e músicas; null = the screens' default), its
//   size step from the theme (0 = the theme's) and where a second edition
//   goes (null = side by side, the screens' default).
export function lookDefaults(user) {
    const ref_line = user?.bible_show_reference === false ? "none" : user?.bible_show_version === false ? "plain" : null;
    const verse_numbers = user?.bible_verse_numbers === "hide" ? "hide" : null;
    const size = bibleSizeStep(user?.bible_text_size);
    const pair = user?.bible_pair === "stack" ? "stack" : null;
    return { bible: { ref_line, verse_numbers, size, pair } };
}

// content.show's arguments with the defaults filled in where the item has none.
export function withLookDefaults(op, args, defaults) {
    if (op !== "content.show" || !args || !defaults) return args;
    const style = { ...(args.style || {}) };
    if (args.kind === "bible" && defaults.bible) {
        if (!style.ref_line && defaults.bible.ref_line) style.ref_line = defaults.bible.ref_line;
        if (!style.verse_numbers && defaults.bible.verse_numbers) style.verse_numbers = defaults.bible.verse_numbers;
        // The size step scales whatever size the passage got (its theme's,
        // or its own); the pair only where a slide carries a second edition.
        const f = BIBLE_SIZE_STEPS[bibleSizeStep(defaults.bible.size)];
        if (f !== 1) style.font_size = sizeValue(sizeCqw(style.font_size) * f);
        if (!style.pair && defaults.bible.pair && (args.slides || []).some((s) => s?.pair)) style.pair = defaults.bible.pair;
    }
    return { ...args, style };
}
