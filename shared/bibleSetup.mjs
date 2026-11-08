// Bíblias neste computador (owner 2026-10-27, "as mais usadas, instaladas
// sozinhas"): the first time KERYX opens on a computer with no edition
// installed, the console asks which editions to download — the most used
// ones (DEFAULT_BIBLES) already ticked — and the main process downloads them
// in the background, one after the other, each whole or nothing as Baixar
// does (electron/bible.cjs). The church still chooses, with one click: the
// publishers' editions come from public repositories and the licence is the
// church's, as Configurações › Bíblia e músicas says, so KERYX never takes
// them by itself.
//
// This module is the rules: what the answer records, what is still to
// install, what a failed download means. The runner is
// electron/bibleSetup.cjs (settings.json "bibleSetup", the retries at
// launch, every SETUP_RETRY_MS while any waits, and when the PC wakes); the
// browser preview runs the same rules in the page (src/api/backends/preview.js).
//
// The state: { asked, wanted, done, failed, tries }
//   asked:  when the church answered (ISO), null = never asked here
//   wanted: the siglas ticked, in the dialog's order
//   done:   the ones this runner installed
//   failed: { sigla: why } — given up (a file that is not a whole Bible, or
//           MAX_TRIES answers from the source); chosen again = tried again
//   tries:  { sigla: n } — answers from the source that were not a Bible
//           (an HTTP error); the internet missing never counts

// The most used editions in Brazilian evangelical churches (owner
// 2026-10-27): ticked at first.
export const DEFAULT_BIBLES = ["NVI", "ARA", "ARC", "NTLH"];
// A source that answers wrong this many times is given up (the bell says
// so; Tentar de novo in Configurações asks again).
export const MAX_TRIES = 5;
export const SETUP_RETRY_MS = 10 * 60 * 1000;

export const emptySetup = () => ({ asked: null, wanted: [], done: [], failed: {}, tries: {} });

const siglas = (x) => (Array.isArray(x) ? [...new Set(x.filter((v) => typeof v === "string" && v))] : []);
const bySigla = (x, ok) => Object.fromEntries(Object.entries(x && typeof x === "object" && !Array.isArray(x) ? x : {}).filter(([k, v]) => k && ok(v)));

// settings.json may hold anything (an older KERYX, a hand edit).
export function normalizeSetup(raw) {
    const s = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    return {
        asked: typeof s.asked === "string" && s.asked ? s.asked : null,
        wanted: siglas(s.wanted),
        done: siglas(s.done),
        failed: bySigla(s.failed, (v) => typeof v === "string"),
        tries: bySigla(s.tries, (v) => Number.isInteger(v) && v > 0),
    };
}

// The church's answer: the editions ticked (only the ones `known` can
// install, in the order given). One chosen again after it failed is tried
// again from zero.
export function chooseSetup(state, versions, known, at) {
    const s = normalizeSetup(state);
    const wanted = [...new Set((Array.isArray(versions) ? versions : []).filter((v) => known.includes(v)))];
    const failed = { ...s.failed };
    const tries = { ...s.tries };
    for (const v of wanted) { delete failed[v]; delete tries[v]; }
    return { ...s, asked: at, wanted, failed, tries };
}

// Agora não: asked, nothing wanted (what was done stays done).
export const dismissSetup = (state, at) => ({ ...normalizeSetup(state), asked: at, wanted: [] });

// What is still to install: wanted, not done, not given up, and not already
// on this computer (installed by hand, or by an older KERYX).
export function pendingSetup(state, installed = {}) {
    const s = normalizeSetup(state);
    return s.wanted.filter((v) => !s.done.includes(v) && !(v in s.failed) && !(installed?.[v] > 0));
}

// One download's outcome: { ok: true } or { error: { status, message } }
// (electron/bible.cjs BibleError: 503 no internet, 504 too slow, 502 the
// source answered wrong, 400 not a whole Bible).
// -> { state, stop }: stop = end this pass, the next edition would fail the
// same way (no internet); the state is unchanged then.
export function afterInstall(state, version, outcome) {
    const s = normalizeSetup(state);
    const tries = { ...s.tries };
    const failed = { ...s.failed };
    if (outcome?.ok) {
        delete tries[version];
        delete failed[version];
        return { state: { ...s, done: [...new Set([...s.done, version])], tries, failed }, stop: false };
    }
    const status = Number(outcome?.error?.status) || 0;
    if (status === 503 || status === 504) return { state: s, stop: true };
    const n = (tries[version] || 0) + 1;
    if (status === 400 || n >= MAX_TRIES) {
        delete tries[version];
        failed[version] = String(outcome?.error?.message || "Não foi possível baixar.");
    } else {
        tries[version] = n;
    }
    return { state: { ...s, tries, failed }, stop: false };
}

// Where the setup stands, for the console: what came (done, or installed
// meanwhile by hand), what still waits and what was given up.
// -> { asked, wanted, done, pending, failed, finished }
export function setupStatus(state, installed = {}) {
    const s = normalizeSetup(state);
    const pending = pendingSetup(s, installed);
    const done = s.wanted.filter((v) => s.done.includes(v) || installed?.[v] > 0);
    const failed = Object.fromEntries(s.wanted.filter((v) => v in s.failed).map((v) => [v, s.failed[v]]));
    return { asked: s.asked, wanted: s.wanted, done, pending, failed, finished: s.wanted.length > 0 && !pending.length };
}
