// The data client every page imports (through keryxClient.js), with the
// surface Base44's SDK had: entities.<Name>.list / filter / get / create /
// update / delete / bulkCreate / bulkUpdate / subscribe, auth.*,
// integrations.Core.*. Three ways to reach the data, one surface:
//   - desktop: the Electron app; IPC to the local SQLite store
//   - network screen: a browser on the church network that opened a screen
//     page from the KERYX computer (window.keryxLan, set by electron/lan.cjs);
//     the same store over HTTP, read-mostly
//   - supabase: the web build running in a plain browser
// Anything not on that surface is a deliberate omission: add it to every
// backend when a page needs it, not in the page.

import * as supabaseBackend from "./backends/supabase";
import { createDesktopBackend } from "./backends/desktop";
import { createNetworkBridge } from "./backends/network";

const desktopBridge = typeof window !== "undefined" ? window.keryxDesktop : undefined;

export const isDesktop = Boolean(desktopBridge && desktopBridge.db);
export const isNetworkScreen = !isDesktop && typeof window !== "undefined" && window.keryxLan === true;

const backend = isDesktop
    ? createDesktopBackend(desktopBridge)
    : isNetworkScreen
        ? createDesktopBackend(createNetworkBridge())
        : supabaseBackend;

export const { entities, auth, integrations, appLogs } = backend;

export const keryx = { entities, auth, integrations, appLogs, isDesktop, isNetworkScreen };
export default keryx;
