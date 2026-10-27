// Which culto the console opens on (useConsoleData's pickDefaultService).
//
// The one whose item is on the screens wins (2026-10-20, crash recovery):
// the console reloading after a crash, or KERYX coming back lit after one
// (electron/runMarker.cjs), must not hand the operator another culto's
// Setlist mid-service. Otherwise today's culto (local date), else the most
// recent. A normal start reopens on Tela preta, so yesterday's session on
// the live state does not pull the console back to it.

import { isOnAir } from "../../../shared/live-state.mjs";

const two = (n) => String(n).padStart(2, "0");
export const localDay = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;

export function chooseService(services, live = null, now = new Date()) {
    if (!services || !services.length) return null;
    const airId = live && live.screen !== "black" && isOnAir(live) ? live.session?.serviceId : null;
    const onAir = airId ? services.find((s) => s.id === airId) : null;
    if (onAir) return onAir;
    // Local date: toISOString() is UTC, so after 21:00 in Brazil "today"
    // would already be tomorrow and the evening service would be missed.
    const today = localDay(now);
    return services.find((s) => s.date === today) || services[0];
}
