import { useEffect, useSyncExternalStore } from "react";

// The sync's status (electron/syncControl.cjs `status`), read by the top
// bar's cloud, the Biblioteca's "parece repetida" and Configurações ›
// Sincronização: one poll for the whole window while anyone listens, every
// few seconds (a pass runs every 30 s; "Sincronizar agora" and the section's
// actions hand their answer in at once with setSyncStatus). null until the
// first answer, and outside the desktop app.

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

export function useSyncStatus() {
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
    return useSyncExternalStore(subscribe, () => status, () => null);
}
