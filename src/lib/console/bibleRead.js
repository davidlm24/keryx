// The size of the Bíblia's reading text (Ler, Buscar, Comparar; Rodada P,
// P5 = A): five steps, P M G GG GGG, M the console's own. A− / A / A+ in
// the text panel's header and Ctrl + the mouse wheel over the text; kept on
// this computer (layout.bibleRead, like bibleGrid). It never changes the
// screens: their size is the Bíblia theme's.
// Pure, tested in bibleRead.test.mjs.
export const READ_SIZES = [["P", 0.85], ["M", 1], ["G", 1.15], ["GG", 1.3], ["GGG", 1.5]];
export const READ_DEFAULT = 1;
const LAST = READ_SIZES.length - 1;

// A saved step, held to the five (anything else: the default).
export const readStep = (v) => (Number.isInteger(v) && v >= 0 && v <= LAST ? v : READ_DEFAULT);
// One step up (d > 0) or down, never past the ends.
export const stepRead = (v, d) => Math.max(0, Math.min(LAST, readStep(v) + Math.sign(d)));
// The factor the panel's text is drawn at, and its label ("G").
export const readScale = (v) => READ_SIZES[readStep(v)][1];
export const readLabel = (v) => READ_SIZES[readStep(v)][0];
// Ctrl + the wheel: up (deltaY < 0) is bigger, as in a browser; null when
// the wheel is not a zoom (no Ctrl, or it did not move).
export const wheelStep = (e) => (e?.ctrlKey && e.deltaY ? (e.deltaY < 0 ? 1 : -1) : null);
