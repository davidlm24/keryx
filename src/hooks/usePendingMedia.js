import { useSyncExternalStore } from "react";
import { keryx } from "@/api/keryxClient";

// The media urls the sync between the church's computers has not brought
// yet (a Set of both url forms; src/lib/pendingMedia.js). Empty off the
// desktop and with sync off.
export function usePendingMedia() {
    const store = keryx.pendingMedia;
    return useSyncExternalStore(store.subscribe, store.current);
}
