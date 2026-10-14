// The papel de parede (owner's decisions 2026-10-12/13, renamed in the
// Rodada B of 2026-10-14, "Papel de parede × Tema"): what the screens show
// with nothing on air, after Esc and between items. It is the day's culto's;
// without one, the church's ("Qualquer outro culto" in Configurações ›
// Culto). It goes on the Fundo when KERYX opens with none, when a service is
// chosen, and on Esc (the live state's background.default; never past
// Camadas' padlock).
//   Service.background            the culto's (a template brings it, and a
//                                 day with no service gets its draft
//                                 "Setlist de dd/mm")
//   User.default_background       the church's (the "Qualquer outro culto"
//                                 row, Configurações › Culto › Fora do ar)
// Rows from before keep a picture in standby_background; it still counts.
// (A background per day of the week existed for a day, unreleased: the
// service and its template took its place; User.weekday_backgrounds is no
// longer read.) Pure: tested in defaultFundo.test.mjs.
import { cleanSpec, bgArgs, sameBg } from "./backgroundSpec.js";
import { layerLocked } from "../../../shared/live-state.mjs";

const picture = (url) => (typeof url === "string" && url.trim() ? { kind: "image", value: url.trim() } : null);

export const serviceFundo = (service) => cleanSpec(service?.background) || picture(service?.standby_background);
export const churchFundo = (user) => cleanSpec(user?.default_background) || picture(user?.standby_background);

// The titles this module stamps on what it sends (background.default and,
// from there, the Fundo layer), so fundoNow can say whose wallpaper is on
// screen. Live states from before the rename carry the old pair.
export const FUNDO_TITLES = { culto: "Papel de parede do culto", igreja: "Papel de parede da igreja" };
const TITLE_FROM = {
    [FUNDO_TITLES.culto]: "culto", [FUNDO_TITLES.igreja]: "igreja",
    "Fundo do culto": "culto", "Fundo padrão": "igreja",
};

// -> { spec, from: "culto" | "igreja", title } or null.
export function defaultFundo({ service = null, user = null } = {}) {
    const own = serviceFundo(service);
    if (own) return { spec: own, from: "culto", title: FUNDO_TITLES.culto };
    const church = churchFundo(user);
    if (church) return { spec: church, from: "igreja", title: FUNDO_TITLES.igreja };
    return null;
}

// background.default's argument for it (null: none).
export const defaultFundoArgs = (d) => (d ? bgArgs(d.spec, d.title) : null);

// Whose wallpaper the live state's background.default is ("culto" |
// "igreja"), or null with none: Configurações › Culto warns on the
// "Qualquer outro culto" row while the culto on screen has its own.
export const defaultFundoFrom = (live) => TITLE_FROM[live?.defaultBackground?.title] || null;

// Whose background the Fundo layer holds right now, for the UI that names it
// (Camadas' pencil menu): by the title this module stamps on what it sends,
// else by matching the papel de parede in the live state
// (background.default); anything else is the item's own.
// -> { from: "culto" | "igreja" | "item", title } or null (nothing on the Fundo).
export function fundoNow(live) {
    const bg = cleanSpec(live?.background);
    if (!bg) return null;
    const title = typeof live.background.title === "string" ? live.background.title : "";
    const whose = TITLE_FROM[title] ? title
        : sameBg(bg, cleanSpec(live.defaultBackground)) ? live.defaultBackground.title : "";
    if (TITLE_FROM[whose]) return { from: TITLE_FROM[whose], title: FUNDO_TITLES[TITLE_FROM[whose]] };
    return { from: "item", title };
}

// Whether a new papel de parede (KERYX opens, a service is chosen, the church
// changes it) goes on the Fundo right away: when nothing the screens show is
// on air. Under Tela preta or the logo too — KERYX reopens with the screens
// black, and the Fundo must be the service's when they come back — but never
// while the screens are locked (Travar telas refuses it) or past Camadas'
// padlock.
export function fundoGoesOnNow(live) {
    if (!live || live.locked || layerLocked(live, "background")) return false;
    return !["content", "media", "video", "tool", "communication"].some((layer) => live[layer]);
}
