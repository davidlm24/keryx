// The look of a service (owner's decision 2026-10-13): its background (the
// Fundo padrão while it is the service in hand) and its own theme per kind of
// content — kind_themes { lyrics, bible, text, tool }, theme ids; empty = the
// church's Temas padrão. A template (ServiceTemplate) keeps the same look and
// brings it with its items; a day with no service keeps it on its draft
// ("Setlist de dd/mm"). Pure: tested in serviceLook.test.mjs.
import { cleanSpec } from "./backgroundSpec.js";
import { THEME_KINDS } from "./themes.js";
import { serviceFundo } from "./defaultFundo.js";

const KINDS = THEME_KINDS.map(([k]) => k);

// kind_themes as kept: known kinds, non-empty string ids.
export function cleanKindThemes(map) {
    if (!map || typeof map !== "object" || Array.isArray(map)) return {};
    return Object.fromEntries(KINDS.map((k) => [k, typeof map[k] === "string" ? map[k].trim() : ""]).filter(([, v]) => v));
}

// A service's or a template's look: { background: spec | null, kind_themes }.
export const lookOf = (row) => ({ background: serviceFundo(row), kind_themes: cleanKindThemes(row?.kind_themes) });

// What to save on a row for a look (the old standby picture kept in step).
export const lookFields = (look) => {
    const background = cleanSpec(look?.background);
    return { background, kind_themes: cleanKindThemes(look?.kind_themes), standby_background: background?.kind === "image" ? background.value : "" };
};
// A template keeps no standby_background (it never had one).
export const templateLookFields = (look) => {
    const { standby_background: _s, ...rest } = lookFields(look);
    return rest;
};

// A template applied to a service: its look fills what the service has not
// chosen (its own background, each kind's theme); -> the patch, or null.
export function lookForService(service, template) {
    const own = lookOf(service);
    const from = lookOf(template);
    const background = own.background || from.background;
    const kind_themes = { ...from.kind_themes, ...own.kind_themes };
    const changed = (!own.background && from.background) || Object.keys(kind_themes).length !== Object.keys(own.kind_themes).length;
    return changed ? lookFields({ background, kind_themes }) : null;
}

export const hasLook = (row) => Boolean(lookOf(row).background) || Object.keys(lookOf(row).kind_themes).length > 0;
