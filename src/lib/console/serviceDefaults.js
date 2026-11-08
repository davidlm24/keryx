// The church's service defaults (Configurações › Culto, on the profile): the
// usual weekday and time of the service, how long a song and anything else
// take when the Setlist gets them. Pure; dates are local (never toISOString,
// which turns a Sunday night in Brazil into Monday).

const two = (n) => String(n).padStart(2, "0");
export const localDate = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;

export const WEEKDAYS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

// The next `weekday` (0 = Sunday) from `now`, today included; no weekday:
// today.
export function nextWeekday(now, weekday) {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    if (weekday == null) return d;
    d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7));
    return d;
}

// What "Novo culto" creates: on the church's day (else today), at its time —
// and with no time at all when none was chosen (never an invented hour).
export function newServiceDefaults(prefs, now = new Date()) {
    const d = nextWeekday(now, prefs?.service_weekday ?? null);
    return {
        title: `Culto de ${two(d.getDate())}/${two(d.getMonth() + 1)}`,
        date: localDate(d),
        ...(prefs?.service_start_time ? { startTime: prefs.service_start_time } : {}),
    };
}

// How long an item takes when it is added to the Setlist without a length
// of its own: a song, or anything else; a section takes none.
export function defaultDuration(type, prefs) {
    if (type === "SECTION") return 0;
    return type === "SONG" ? (prefs?.duration_song ?? 240) : (prefs?.duration_other ?? 120);
}

// The worship team's roles (WorshipTeam.role), as the church says them.
export const TEAM_ROLES = [
    ["worship_leader", "Ministro de louvor"],
    ["vocalist", "Vocal"],
    ["guitarist", "Violão e guitarra"],
    ["bassist", "Baixo"],
    ["drummer", "Bateria"],
    ["keyboardist", "Teclado"],
    ["other", "Outro"],
];
const ROLE = Object.fromEntries(TEAM_ROLES);
export const teamRole = (role) => ROLE[role] || ROLE.other;
