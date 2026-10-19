import { useEffect, useState, useSyncExternalStore } from "react";
import { keryx } from "@/api/keryxClient";
import { needsPages, pagesWait } from "@/lib/presentation";
import { madeHere } from "@/lib/mediaImport";
import { savePages } from "@/lib/pdfPagesCapture";
import { useSyncStatusSelect } from "@/hooks/useSyncStatus";

const PAUSE_MS = 300;

// How far each PDF's pages are (by Media id): { done, total } while they are
// made, { error } when the file could not be read. The Mídia's rows read it
// ("Preparando páginas 7/12"); this window only.
const progress = new Map();
const listeners = new Set();
const setProgress = (id, value) => {
    if (value) progress.set(id, value); else progress.delete(id);
    for (const fn of listeners) fn();
};
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const pagesProgressOf = (id) => (id ? progress.get(id) || null : null);
export const usePagesProgress = (id) => useSyncExternalStore(subscribe, () => pagesProgressOf(id));

// Rows this window already tried (by id and file: "Localizar…" gives a row a
// new file and a new chance), so a file that cannot be read is not retried
// over and over.
const tried = new Set();

// Gives every PDF of the Mídia its pages as pictures (Media.pages), one PDF
// at a time: those sent now (their row arrives through subscribe) and the
// ones from before there were presentations. A PDF sent on another computer
// waits a few minutes for that computer's pages (pagesWait) — only on a
// computer that syncs: any other makes them at once. The console only, where
// files can be sent; never a screen on the network.
export function usePagesBackfill(rows) {
    const [tick, setTick] = useState(0);
    const [busy, setBusy] = useState(false);
    const syncs = useSyncStatusSelect((st) => (st ? Boolean(st.folder && st.paired) : null));
    useEffect(() => {
        if (busy || !keryx.isDesktop || keryx.isNetworkScreen) return undefined;
        const due = rows.filter((m) => needsPages(m) && !tried.has(`${m.id}|${m.file_url}`));
        const now = Date.now();
        const waitOf = (m) => pagesWait(m, { mine: madeHere.has(m.id), syncs, now });
        const row = due.find((m) => waitOf(m) === 0);
        if (!row) {
            // A PDF from another computer: its pages are probably on the way.
            const wait = Math.min(...due.map(waitOf));
            if (!Number.isFinite(wait)) return undefined;
            const later = setTimeout(() => setTick((n) => n + 1), wait + 500);
            return () => clearTimeout(later);
        }
        const id = setTimeout(() => {
            tried.add(`${row.id}|${row.file_url}`);
            setBusy(true);
            setProgress(row.id, { done: 0, total: 0 });
            savePages(row, { onProgress: (p) => setProgress(row.id, p) })
                .then(() => setProgress(row.id, null))
                .catch((err) => {
                    console.warn("[keryx] páginas do PDF:", row.title, err?.message || err);
                    setProgress(row.id, { error: err?.message || "falhou" });
                })
                .finally(() => { setBusy(false); setTick((n) => n + 1); });
        }, PAUSE_MS);
        return () => clearTimeout(id);
    }, [rows, busy, tick, syncs]);
}
