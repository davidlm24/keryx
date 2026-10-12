// The Fundo padrão (owner's decision 2026-10-12): with nothing on air the
// screen shows the service's background, else the church's for that day of
// the week, else the church's for every day. It goes on the Fundo when
// KERYX opens with none, when a service is chosen, and on Esc (the live
// state's background.default; never past Camadas' padlock).
//   Service.background            the service's (Planejar o culto)
//   User.weekday_backgrounds      { "0".."6": spec } (0 = domingo)
//   User.default_background       every day (Aparência)
// Rows from before keep a picture in standby_background; it still counts.
// Pure: tested in defaultFundo.test.mjs.
import { cleanSpec, bgArgs } from "./backgroundSpec.js";

export const WEEKDAYS = [["0", "Dom", "domingo"], ["1", "Seg", "segunda"], ["2", "Ter", "terça"], ["3", "Qua", "quarta"], ["4", "Qui", "quinta"], ["5", "Sex", "sexta"], ["6", "Sáb", "sábado"]];

const picture = (url) => (typeof url === "string" && url.trim() ? { kind: "image", value: url.trim() } : null);

export const serviceFundo = (service) => cleanSpec(service?.background) || picture(service?.standby_background);
export const churchFundo = (user) => cleanSpec(user?.default_background) || picture(user?.standby_background);
export function dayFundo(user, weekday) {
    const days = user?.weekday_backgrounds;
    return days && typeof days === "object" && !Array.isArray(days) ? cleanSpec(days[String(weekday)]) : null;
}

// The day the service is on (its date, local), else today.
export function weekdayOf(service, now = Date.now()) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(service?.date || ""));
    return (m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(now)).getDay();
}

// -> { spec, from: "culto" | "dia" | "igreja", title } or null.
export function defaultFundo({ service = null, user = null, now = Date.now() } = {}) {
    const own = serviceFundo(service);
    if (own) return { spec: own, from: "culto", title: "Fundo do culto" };
    const day = weekdayOf(service, now);
    const daily = dayFundo(user, day);
    if (daily) return { spec: daily, from: "dia", title: `Fundo de ${WEEKDAYS[day][2]}` };
    const church = churchFundo(user);
    if (church) return { spec: church, from: "igreja", title: "Fundo padrão" };
    return null;
}

// background.default's argument for it (null: none).
export const defaultFundoArgs = (d) => (d ? bgArgs(d.spec, d.title) : null);

// A weekday_backgrounds map with one day changed (null removes it).
export function withDay(map, weekday, spec) {
    const next = { ...(map && typeof map === "object" && !Array.isArray(map) ? map : {}) };
    const s = cleanSpec(spec);
    if (s) next[String(weekday)] = s;
    else delete next[String(weekday)];
    return next;
}
