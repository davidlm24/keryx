// Timers prontos (2026-10-12, as SPresenter's 5/10/15/30/60 min): the times
// the Ferramentas offer in one click, the ones the church keeps (TimerPreset
// rows) beside the five that always come. A click prepares the timer, a
// double click sends it, as everywhere in the console. Pure: no I/O.

export const BUILTIN_MINUTES = [5, 10, 15, 30, 60];
export const MIN_MINUTES = 1;
export const MAX_MINUTES = 180;

// The minutes as a whole number in range, else null.
export function cleanMinutes(value) {
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n >= MIN_MINUTES && n <= MAX_MINUTES ? n : null;
}

// Every time on offer, shortest first: the built-in ones (no row, cannot be
// deleted) and the kept ones. -> [{ minutes, id: string | null }]
export function timerChoices(rows = []) {
    const out = BUILTIN_MINUTES.map((minutes) => ({ minutes, id: null }));
    for (const r of rows || []) {
        const minutes = cleanMinutes(r?.minutes);
        if (minutes != null && r?.id && !out.some((o) => o.minutes === minutes)) out.push({ minutes, id: r.id });
    }
    return out.sort((a, b) => a.minutes - b.minutes);
}

// Can this be kept? { ok, why }: a valid time that is not already on offer.
export function canKeepTimer(value, rows = []) {
    const minutes = cleanMinutes(value);
    if (minutes == null) return { ok: false, why: `Use de ${MIN_MINUTES} a ${MAX_MINUTES} minutos.` };
    if (timerChoices(rows).some((c) => c.minutes === minutes)) return { ok: false, why: `${minutes} min já está na lista.` };
    return { ok: true, why: "" };
}

// How a time is written on a button: 5 min, 1 h, 1 h 30 min.
export function minutesLabel(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

// The steps for a timer on air: take a minute, give one, give five (SPresenter).
export const ADJUST_STEPS = [[-60000, "−1 min"], [60000, "+1 min"], [300000, "+5 min"]];
