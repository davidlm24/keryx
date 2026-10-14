// The look of a service (owner's review 2026-10-14, as in Holyrics: no more
// Visual do culto): its background — the papel de parede
// while it is the service in hand — and one optional theme from the library
// (theme_id), which becomes the theme in use when the culto is chosen. A
// template (ServiceTemplate) keeps the same two and brings them with its
// items; a day with no service keeps them on its draft ("Setlist de dd/mm").
// The old theme per kind (kind_themes { lyrics, bible, text, tool }) is user
// data, kept and no longer written: only its Música theme is read, for a
// row with no theme_id. Pure: tested in serviceLook.test.mjs.
import { cleanSpec } from "./backgroundSpec.js";
import { serviceFundo } from "./defaultFundo.js";

const id = (v) => (typeof v === "string" ? v.trim() : "");

// The service's (or template's) theme id; "" for none.
export function serviceTheme(row) {
    const own = id(row?.theme_id);
    if (own) return own;
    const old = row?.kind_themes;
    return old && typeof old === "object" && !Array.isArray(old) ? id(old.lyrics) : "";
}

// A service's or a template's look: { background: spec | null, theme_id }.
export const lookOf = (row) => ({ background: serviceFundo(row), theme_id: serviceTheme(row) });

// What to save on a row for a look (the old standby picture kept in step).
export const lookFields = (look) => {
    const background = cleanSpec(look?.background);
    return { background, theme_id: id(look?.theme_id), standby_background: background?.kind === "image" ? background.value : "" };
};
// A template keeps no standby_background (it never had one).
export const templateLookFields = (look) => {
    const { standby_background: _s, ...rest } = lookFields(look);
    return rest;
};

// A template applied to a service: its look fills what the service has not
// chosen (its own background, its theme); -> the patch, or null.
export function lookForService(service, template) {
    const own = lookOf(service);
    const from = lookOf(template);
    const changed = (!own.background && from.background) || (!own.theme_id && from.theme_id);
    return changed ? lookFields({ background: own.background || from.background, theme_id: own.theme_id || from.theme_id }) : null;
}
