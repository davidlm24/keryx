import { useEffect, useSyncExternalStore } from "react";
import { sameSyncStatus } from "@/lib/console/syncView";

// The sync's status (electron/syncControl.cjs `status`), read by the top
// bar's cloud, the Biblioteca's "parece repetida", the PDF pages' backfill
// and Configurações › Sincronização: one poll for the whole window while
// anyone listens, every few seconds (a pass runs every 30 s; "Sincronizar
// agora" and the section's actions hand their answer in at once with
// setSyncStatus). null until the first answer, and outside the desktop app.
// An answer like the last one changes nothing (sameSyncStatus): the console
// stays still between passes, and a caller that needs one value reads it
// with useSyncStatusSelect, so only that value changing wakes it.

const POLL_MS = 4000;
let status = null;
let bridge;
let timer = null;
let users = 0;
const listeners = new Set();

// window.keryxDesktop is a fresh object on every access: read it once.
const syncBridge = () => {
    if (bridge === undefined) bridge = (typeof window !== "undefined" && window.keryxDesktop?.sync) || null;
    return bridge;
};

const emit = () => { for (const fn of listeners) fn(); };

// An answer the section already has (an action's result): no wait for the poll.
export function setSyncStatus(next) {
    if (!next || typeof next !== "object") return;
    if (sameSyncStatus(status, next)) return;
    status = next;
    emit();
}

export async function refreshSyncStatus() {
    const b = syncBridge();
    if (!b) return null;
    try {
        const res = await b.call("status");
        if (res?.data) setSyncStatus(res.data);
    } catch { /* the next poll */ }
    return status;
}

function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

// The poll runs while at least one component listens.
function usePoll() {
    useEffect(() => {
        users += 1;
        if (users === 1 && syncBridge()) {
            refreshSyncStatus();
            timer = setInterval(refreshSyncStatus, POLL_MS);
        }
        return () => {
            users -= 1;
            if (users === 0) {
                clearInterval(timer);
                timer = null;
            }
        };
    }, []);
}

export function useSyncStatus() {
    usePoll();
    return useSyncExternalStore(subscribe, () => status, () => null);
}

// One value of the status, never a new object (a string, a boolean, null):
// useSyncStatusSelect((st) => st?.folder || null).
export function useSyncStatusSelect(select) {
    usePoll();
    return useSyncExternalStore(subscribe, () => select(status), () => select(null));
}
