// Bíblias neste computador (owner 2026-10-27, "as mais usadas, instaladas
// sozinhas"): what the first opening's dialog lists and says, and what the
// console says of the downloads it started (the rules are
// shared/bibleSetup.mjs; the runner electron/bibleSetup.cjs, through the
// bridge's bible.setup*). Pure, so the words are tested (bibleSetup.test.mjs).
import { DEFAULT_BIBLES } from "../../../shared/bibleSetup.mjs";
import { licenceChip } from "./bibleRows.js";

export { DEFAULT_BIBLES };

// The dialog opens by itself on a computer never asked that has no edition
// installed (one installed by hand before this KERYX counts as an answer).
export function setupAsks(state, installed = null) {
    if (!state || state.asked) return false;
    const here = installed || state.installed || {};
    return !Object.values(here).some((n) => n > 0);
}

// The dialog's rows: the publishers' editions first, the most used ones on
// top and ticked, then the open ones; the church's own files never (they
// have no download). A row installed here is ticked and cannot be unticked;
// what still waits from an earlier answer stays ticked; with nothing wanted
// (never asked, or Agora não) the most used ones are ticked.
// -> [{ id, title, chip, nt, installed, pending, ticked }]
export function setupRows(editions, state = null) {
    const here = state?.installed || {};
    const pending = new Set(state?.pending || []);
    const fresh = !(state?.wanted?.length > 0);
    const list = (editions || []).filter((v) => v && v.install && !v.own);
    const rank = (v) => (v.group === "open" ? 2 : DEFAULT_BIBLES.includes(v.id) ? 0 : 1);
    const pos = (v) => (DEFAULT_BIBLES.includes(v.id) ? DEFAULT_BIBLES.indexOf(v.id) : list.indexOf(v));
    return [...list].sort((a, b) => rank(a) - rank(b) || pos(a) - pos(b)).map((v) => {
        const installed = here[v.id] > 0 ? here[v.id] : 0;
        return {
            id: v.id,
            title: `${v.id} · ${v.name}`,
            chip: licenceChip(v),
            nt: Boolean(v.nt),
            installed,
            pending: pending.has(v.id),
            ticked: installed > 0 || pending.has(v.id) || (fresh && DEFAULT_BIBLES.includes(v.id)),
        };
    });
}

// "NVI, ARA, ARC e NTLH".
export const joinSiglas = (list) => {
    const l = (list || []).filter(Boolean);
    return l.length > 1 ? `${l.slice(0, -1).join(", ")} e ${l.at(-1)}` : l[0] || "";
};
const bibles = (n) => `${n} ${n === 1 ? "Bíblia" : "Bíblias"}`;

// The toast after the church answers: `n` editions to download now.
export function chosenWords(n, online = true) {
    if (!n) return "Nenhuma Bíblia para baixar.";
    if (!online) return `Sem internet agora: o KERYX baixa ${n === 1 ? "a Bíblia" : `as ${n} Bíblias`} quando houver.`;
    return `Baixando ${bibles(n)} em segundo plano. Dá para usar o KERYX enquanto isso.`;
}

// The toast when the downloads end (setupStatus: done, failed).
export function finishedWords(st) {
    const failed = Object.keys(st?.failed || {});
    const done = st?.done || [];
    if (!failed.length) return done.length ? `${done.length === 1 ? "Bíblia instalada" : `${done.length} Bíblias instaladas`}: ${joinSiglas(done)}.` : "";
    const bad = failed.length === 1 ? `a ${failed[0]} não baixou: ${st.failed[failed[0]]}` : `${joinSiglas(failed)} não baixaram`;
    return `${done.length ? `${joinSiglas(done)} ${done.length === 1 ? "instalada" : "instaladas"}; ` : ""}${bad}${done.length ? "" : "."} Veja em Configurações › Bíblia e músicas.`;
}

// The line Bíblias instaladas shows while the setup is under way or gave
// up: { text, tone: "info" | "warn", retry } or null when there is nothing
// to say (nothing wanted, or everything came). `online`: the window's.
export function setupLine(state, online = true) {
    if (!state?.wanted?.length) return null;
    const failed = Object.keys(state.failed || {});
    const pending = state.pending || [];
    const total = state.wanted.length;
    if (state.installing) return { text: `Baixando a ${state.installing}… (${state.done.length + 1} de ${total})`, tone: "info", retry: false };
    if (pending.length) return online
        ? { text: `${joinSiglas(pending)} ${pending.length === 1 ? "ainda vai baixar" : "ainda vão baixar"} · o KERYX tenta de novo sozinho`, tone: "info", retry: true }
        : { text: `Sem internet: ${joinSiglas(pending)} ${pending.length === 1 ? "baixa" : "baixam"} quando houver`, tone: "info", retry: false };
    if (failed.length) return { text: failed.map((v) => `A ${v} não baixou: ${state.failed[v]}`).join(" · "), tone: "warn", retry: true };
    return null;
}

// The version in use after an answer: the one chosen already if it was
// ticked or is installed here, else the first ticked (null = leave it).
export function defaultAfterSetup(current, chosen, installed = {}) {
    const list = chosen || [];
    if (current && (list.includes(current) || installed?.[current] > 0)) return null;
    return list[0] || null;
}
