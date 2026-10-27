// Escola bíblica activities on screen (slide.activity and content.revealed,
// shared/live-state.mjs; owner 2026-10-16, Rodada E4): what the renderer, the
// Palco and the material editor need from a slide's words. Pure, no imports,
// so node --test checks it.

export const LETTERS = "ABCDEFGH";
export const TRUE_FALSE = ["Verdadeiro", "Falso"];

// A word: letters and digits, with an apostrophe or a hyphen inside
// ("d'água", "guarda-chuva"); punctuation and spaces are not words.
const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

// The text as runs: each word with its position among the words (`word`),
// and what lies between them (spaces, punctuation, line breaks) as written.
export function wordRuns(text) {
    const s = String(text || "");
    const out = [];
    let last = 0;
    let n = 0;
    for (const m of s.matchAll(WORD)) {
        if (m.index > last) out.push({ text: s.slice(last, m.index) });
        out.push({ text: m[0], word: n++ });
        last = m.index + m[0].length;
    }
    if (last < s.length) out.push({ text: s.slice(last) });
    return out;
}
export const wordCount = (text) => (String(text || "").match(WORD) || []).length;
export const wordsOf = (text) => String(text || "").match(WORD) || [];

// Complete a frase: the blanks (word positions) are revealed in reading
// order, `step` of them so far. A run still hidden is `blank`; a revealed
// one is `shown`, the one this step revealed also `last`.
export function blanksView(text, blanks, step = 0) {
    const order = [...new Set(blanks || [])].sort((a, b) => a - b);
    return wordRuns(text).map((r) => {
        const k = r.word === undefined ? -1 : order.indexOf(r.word);
        if (k < 0) return r;
        return k < step ? { ...r, shown: true, last: k === step - 1 } : { ...r, blank: true };
    });
}

// Versículo para memorizar: after `step` of `rounds` clicks an even share
// of the words is gone each round, all of them at the last. `order` is the
// order they go in (memorizeOrder); words it does not name go last.
export function memorizeHidden(order, total, rounds, step = 0) {
    const named = (order || []).filter((n) => Number.isInteger(n) && n >= 0 && n < total);
    const rest = Array.from({ length: total }, (_, i) => i).filter((i) => !named.includes(i));
    const n = step >= rounds ? total : Math.round((Math.max(0, step) * total) / Math.max(1, rounds));
    return new Set([...named, ...rest].slice(0, n));
}
export function memorizeView(text, order, rounds, step = 0) {
    const runs = wordRuns(text);
    const hidden = memorizeHidden(order, runs.filter((r) => r.word !== undefined).length, rounds, step);
    return runs.map((r) => (r.word !== undefined && hidden.has(r.word) ? { ...r, blank: true } : r));
}

// A fixed shuffle of a verse's words, the order they go away in: the same
// verse always goes the same way (a small generator seeded by the text).
export function memorizeOrder(text) {
    const n = wordCount(text);
    let seed = 7;
    for (const ch of String(text || "")) seed = (Math.imul(seed, 31) + ch.codePointAt(0)) >>> 0;
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const j = seed % (i + 1);
        [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
}

// Discussão com timer: the time left (all of it until the timer starts —
// the reveal — then counting down from the reveal's time) and whether it ran out.
export function discussionTime(activity, reveal, now) {
    const total = Math.round((Number(activity?.minutes) || 0) * 60000);
    if (!reveal?.step) return { left: total, started: false, done: false, endsAt: null };
    const endsAt = reveal.at + total;
    const left = Math.max(0, endsAt - now);
    return { left, started: true, done: left === 0, endsAt };
}

// The Palco is the teacher's screen: the answer is always there.
export function stageLines(activity) {
    if (!activity) return [];
    if (activity.kind === "choice") return (activity.options || []).map((o, k) => `${k === activity.correct ? "✓ " : ""}${LETTERS[k]}) ${o}`);
    if (activity.kind === "truefalse") return [`Resposta: ${TRUE_FALSE[activity.correct] || TRUE_FALSE[0]}`];
    if (activity.kind === "discussion") return [`Discussão · ${activity.minutes} min`];
    return [];
}
