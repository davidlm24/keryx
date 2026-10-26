import { useEffect, useState } from "react";
import { setSyncStatus, refreshSyncStatus, useSyncStatus } from "@/hooks/useSyncStatus";
import { joinNote } from "@/lib/console/syncView";

// Entering with the church's Google account (Google Drive direto, PR 3), the
// same from Configurações › Sincronização and from the top bar's cloud: the
// system's browser opens on Google's page (electron/googleAuth.cjs) and the
// call waits for it (up to 5 minutes); then this computer moves to Drive,
// merging what it has (G1 = A: nothing is deleted). The page shows
// "Termine a entrada no navegador" from the status' google.signingIn, which
// is set here at once so the click is answered before the next poll.

// window.keryxDesktop is a fresh object on every access: read it once.
let bridge;
const syncBridge = () => {
    if (bridge === undefined) bridge = (typeof window !== "undefined" && window.keryxDesktop?.sync) || null;
    return bridge;
};

let lastStatus = null;
let canceling = false;
const JOIN_KEY = "keryx.sync.joined";

const store = {
    get: (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } },
    set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } },
};

// -> the status after entering, or null (canceled, refused: `say` told why).
// songsHere: how many songs this computer has now, for the toast after the
// first passes ("84 músicas vieram e 120 foram daqui").
export async function signInWithGoogle({ say, songsHere = 0, status = null } = {}) {
    const sync = syncBridge();
    if (!sync) return null;
    const before = status || lastStatus || (await refreshSyncStatus());
    if (before) setSyncStatus({ ...before, google: { ...(before.google || {}), signingIn: true } });
    canceling = false;
    let res;
    try {
        res = await sync.call("googleSignIn");
    } catch (err) {
        res = { error: { message: err?.message || "Não foi possível entrar." } };
    }
    if (res?.error) {
        if (!canceling && res.error.code !== "canceled") say?.(`Entrar com Google: ${res.error.message}`);
        canceling = false;
        await refreshSyncStatus();
        return null;
    }
    let st = res?.data || null;
    if (st?.store !== "drive") {
        const moved = await sync.call("useDrive", { on: true }).catch((err) => ({ error: { message: err?.message } }));
        if (moved?.error) {
            say?.(`Sincronização: ${moved.error.message || "não foi possível usar a conta."}`);
            await refreshSyncStatus();
            return null;
        }
        st = moved?.data || st;
    }
    if (st) setSyncStatus(st);
    store.set(JOIN_KEY, { at: new Date().toISOString(), before: songsHere });
    return st;
}

// Cancelar on "Termine a entrada no navegador": the pending call ends
// (googleAuth's listener closes) and the page goes back to Entrar com Google.
export async function cancelGoogleSignIn() {
    const sync = syncBridge();
    if (!sync) return;
    canceling = true;
    await sync.call("googleCancel").catch(() => {});
    await refreshSyncStatus();
}

// "O navegador não abriu? Abrir de novo": the same Google page again.
export async function reopenGoogleSignIn(say) {
    const sync = syncBridge();
    if (!sync) return;
    const res = await sync.call("googleReopen").catch((err) => ({ error: { message: err?.message } }));
    if (res?.error) say?.(`Abrir de novo: ${res.error.message || "não foi possível abrir o navegador."}`);
}

// Espaço da conta (G2 = A): { used, total, mine } bytes, asked when the page
// opens and every minute while it is on screen; null until Google answers.
export function useGoogleQuota(active) {
    const [quota, setQuota] = useState(null);
    useEffect(() => {
        const sync = syncBridge();
        if (!sync || !active) return undefined;
        let live = true;
        const ask = () => sync.call("googleStatus").then((res) => { if (live && res?.data) setQuota(res.data.quota || null); }).catch(() => {});
        ask();
        const t = setInterval(ask, 60000);
        return () => { live = false; clearInterval(t); };
    }, [active]);
    return quota;
}

// G1 = A, in the console: after an entry, once the first passes have
// brought the account's rows, one toast says how many songs came and how
// many went (joinNote in syncView.js). Kept in localStorage so a reload in
// between still says it.
export function useSyncJoinNote(say, songsNow) {
    const st = useSyncStatus();
    lastStatus = st;
    useEffect(() => {
        const pending = store.get(JOIN_KEY);
        if (!pending || !st) return;
        const note = joinNote(pending, st, songsNow);
        if (note === "drop") store.set(JOIN_KEY, null);
        else if (note) {
            store.set(JOIN_KEY, null);
            say(note);
        }
    }, [st, songsNow, say]);
}
