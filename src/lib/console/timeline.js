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

const two = (n) => String(n).padStart(2, "0");
const hm = (ms) => { const d = new Date(ms); return `${two(d.getHours())}:${two(d.getMinutes())}`; };
const dm = (ms) => { const d = new Date(ms); return `${two(d.getDate())}/${two(d.getMonth() + 1)}`; };
const hms = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 3600)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`; };
const inWords = (min) => (min < 60 ? `em ${min} min` : `em ${Math.floor(min / 60)}h${two(min % 60)}`);
// The service's day at local midnight ("2026-10-12"); today when it has none.
const dayOf = (date, now) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date || ""));
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
};

// The service clock in the top bar (it took the place of Ensaio | Ao vivo;
// owner's decision 2026-10-09): how long the service has been running,
// counted from its scheduled time (its date and startTime, or the legacy
// "time"; never a default hour), and when it should end: the start plus the
// Setlist's durations (`seconds`), moved by how late the item on air is
// (`late`, minutes, from serviceTiming).
// -> { text, more, muted, warn, title }: `more` is the part a narrow bar
// drops first; `warn` makes it amber.
export function serviceClock({ service, seconds = 0, late = 0, now }) {
    if (!service) return { text: "Sem culto", more: "", muted: true, warn: false, title: "Nenhum culto escolhido · escolha ou crie um na Setlist" };
    const mins = minutesOf(service.startTime) ?? minutesOf(service.time);
    if (mins == null) return { text: "Culto sem horário", more: "", muted: true, warn: false, title: "Defina o horário em Planejar o culto" };
    const day = dayOf(service.date, now);
    const start = day + mins * 60000;
    const plan = "Planejar o culto · clique";
    if (now < start) {
        const today = dayOf(null, now) === day;
        if (!today) return { text: `Culto em ${dm(start)} às ${hm(start)}`, more: "", muted: true, warn: false, title: plan };
        return { text: `Começa às ${hm(start)}`, more: inWords(Math.ceil((start - now) / 60000)), muted: false, warn: false, title: plan };
    }
    // Long over (a service from another day): just say which one it was.
    if (now - start > 12 * 3600000) return { text: `Culto de ${dm(start)} às ${hm(start)}`, more: "", muted: true, warn: false, title: plan };
    const text = `Culto ${hms(now - start)}`;
    if (!seconds) return { text, more: "", muted: false, warn: false, title: `Começou às ${hm(start)} · ${plan}` };
    const ends = start + seconds * 1000 + late * 60000;
    const title = `Começou às ${hm(start)} · previsto até ${hm(start + seconds * 1000)} · ${plan}`;
    if (now > ends) return { text, more: `passou ${Math.max(1, Math.round((now - ends) / 60000))} min`, muted: false, warn: true, title };
    return { text, more: `termina ~${hm(ends)}${late > 0 ? ` · +${late} min` : ""}`, muted: false, warn: late > 0, title };
}
