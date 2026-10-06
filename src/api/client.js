// The data client every page imports (through keryxClient.js), with the
// surface Base44's SDK had: entities.<Name>.list / filter / get / create /
// update / delete / bulkCreate / bulkUpdate / subscribe, auth.*,
// integrations.Core.*. Two backends implement it:
//   - desktop: the local SQLite store in the Electron main process
//   - supabase: the web build running in a plain browser
// Anything not on that surface is a deliberate omission: add it to both
// backends when a page needs it, not in the page.

import * as supabaseBackend from "./backends/supabase";
import { createDesktopBackend } from "./backends/desktop";

const bridge = typeof window !== "undefined" ? window.keryxDesktop : undefined;

export const isDesktop = Boolean(bridge && bridge.db);

const backend = isDesktop ? createDesktopBackend(bridge) : supabaseBackend;

export const { entities, auth, integrations, appLogs } = backend;

export const keryx = { entities, auth, integrations, appLogs, isDesktop };
export default keryx;
