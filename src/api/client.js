// The data client every page imports (through keryxClient.js), with the
// surface Base44's SDK had: entities.<Name>.list / filter / get / create /
// update / delete / bulkCreate / bulkUpdate / subscribe, auth.*,
// integrations.Core.*. Two ways to reach the data, one surface:
//   - desktop: the Electron app; IPC to the local SQLite store
//   - network screen: a browser on the church network that opened a screen
//     page from the KERYX computer (window.keryxLan, set by electron/lan.cjs);
//     the same store over HTTP, read-mostly
// A plain browser has neither: the app shows DesktopOnly and never calls
// the inert backend below. (The web build on Supabase was retired in phase
// 8; supabase/ is kept for a future cloud sync.) Anything not on that
// surface is a deliberate omission: add it to both when a page needs it.
//
// keryx.live is what every output shows right now (liveClient.js); change it
// through src/lib/projection.js, read it with useLiveState().

import { createDesktopBackend } from "./backends/desktop";
import { createNetworkBridge } from "./backends/network";
import { createPreviewBridge } from "./backends/preview";
import { createLiveClient } from "./liveClient";
import { ClientError } from "./errors";

// `npm run dev` in a plain browser (Claude's side panel included): the
// preview bridge (backends/preview.js) stands in for the desktop one, on the
// real store and live engine of scripts/preview/server.cjs with sample data.
// import.meta.env.DEV is false in production builds, so this branch — and
// preview.js with it — is not in them: a plain browser gets DesktopOnly.
if (import.meta.env.DEV && typeof window !== "undefined" && !window.keryxDesktop && window.keryxLan !== true) {
    window.keryxDesktop = createPreviewBridge();
}

const desktopBridge = typeof window !== "undefined" ? window.keryxDesktop : undefined;

export const isDesktop = Boolean(desktopBridge && desktopBridge.db);
export const isPreview = Boolean(desktopBridge && desktopBridge.isPreview);
export const isNetworkScreen = !isDesktop && typeof window !== "undefined" && window.keryxLan === true;

// Outside the desktop app and the church network: every call fails, in pt-BR.
function unavailableBackend() {
    const message = "O KERYX funciona no aplicativo do computador da igreja.";
    const fail = async () => { throw new ClientError(message, 501); };
    const anyMethod = new Proxy({}, { get: () => fail });
    const reply = async () => ({ error: { message, status: 501 } });
    return {
        entities: new Proxy({}, { get: () => anyMethod }),
        auth: anyMethod,
        integrations: { Core: anyMethod },
        appLogs: { async logUserInApp() {} },
        live: createLiveClient({ get: reply, call: reply, onChange: () => () => {} }),
    };
}

const backend = isDesktop
    ? createDesktopBackend(desktopBridge)
    : isNetworkScreen
        ? createDesktopBackend(createNetworkBridge())
        : unavailableBackend();

export const { entities, auth, integrations, appLogs, live } = backend;

export const keryx = { entities, auth, integrations, appLogs, live, isDesktop, isNetworkScreen, isPreview };
export default keryx;
