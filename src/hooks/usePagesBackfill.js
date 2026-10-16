import { useEffect, useState, useSyncExternalStore } from "react";
import { keryx } from "@/api/keryxClient";
import { needsPages } from "@/lib/presentation";
import { savePages } from "@/lib/pdfPagesCapture";

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
// ones from before there were presentations. The console only, where files
// can be sent; never a screen on the network.
export function usePagesBackfill(rows) {
    const [tick, setTick] = useState(0);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (busy || !keryx.isDesktop || keryx.isNetworkScreen) return undefined;
        const row = rows.find((m) => needsPages(m) && !tried.has(`${m.id}|${m.file_url}`));
        if (!row) return undefined;
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
    }, [rows, busy, tick]);
}
