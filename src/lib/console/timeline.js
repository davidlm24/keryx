// What the collapsed Linha do tempo says: how far the service is and when it
// will end, which nothing else on the console shows. (What is on air and what
// is next are the live column's job.) Pure; tested in timeline.test.mjs.

const minutesOf = (hhmm) => {
    if (!/^\d{1,2}:\d{2}$/.test(String(hhmm || ""))) return null;
    const [h, m] = String(hhmm).split(":").map(Number);
    return h * 60 + m;
};

// `times` are the planned start of each item ("19:40", or "" when unknown),
// `startedAt` when the item on air went on air (ms), `now` in ms.
export function serviceTiming({ items, times, airIdx, startedAt, now }) {
    const count = items.length;
    if (!count) return { count: 0, done: 0, late: 0, plannedEnd: null, forecastEnd: null };
    const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
    const at = (hhmm) => { const m = minutesOf(hhmm); return m == null ? null : midnight.getTime() + m * 60000; };
    // Items before the one on air are done; nothing on air counts none.
    const done = airIdx >= 0 ? airIdx : 0;
    // Planned end: the last item's planned start plus its duration.
    const lastAt = at(times[count - 1]);
    const plannedEnd = lastAt == null ? null : lastAt + (items[count - 1].duration || 0) * 1000;
    // Late (+) or early (−), in minutes: the item on air against its plan.
    const planned = airIdx >= 0 ? at(times[airIdx]) : null;
    const late = planned != null && startedAt ? Math.round((startedAt - planned) / 60000) : 0;
    // The service ends as planned, moved by how late it already is.
    const forecastEnd = plannedEnd == null ? null : plannedEnd + (airIdx >= 0 && startedAt ? late * 60000 : 0);
    return { count, done, late, plannedEnd, forecastEnd };
}

export const lateWords = (late, onAir) => (!onAir ? "" : late > 0 ? `+${late} min atrasado` : late < 0 ? `−${-late} min adiantado` : "no horário");

export const clock = (ms) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
